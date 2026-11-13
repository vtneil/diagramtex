// A .zip writer: entries stored as they are (pictures are already compressed and a .tex is small), with CRC-32
// and DOS dates, readable by every unzip tool. Paths use / and UTF-8 names. No DOM.
export interface ZipEntry {
  name: string;
  data: Uint8Array | string;
  /** the file's modification time (local time, 2-second steps); defaults to now */
  date?: Date;
}

let table: Uint32Array | null = null;
export function crc32(u8: Uint8Array) {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  }
  let c = 0xffffffff;
  for (let i = 0; i < u8.length; i++) c = table[(c ^ u8[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const dosTime = (d: Date) => ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff;
const dosDate = (d: Date) => (((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff;

export function zipStore(entries: ZipEntry[]): Uint8Array {
  const enc = new TextEncoder(), now = new Date();
  const files = entries.map((e) => {
    const data = typeof e.data === 'string' ? enc.encode(e.data) : e.data;
    return { name: enc.encode(e.name.replace(/\\/g, '/')), data, crc: crc32(data), date: e.date || now };
  });
  const size = files.reduce((a, f) => a + 30 + f.name.length + f.data.length + 46 + f.name.length, 0) + 22;
  const out = new Uint8Array(size), v = new DataView(out.buffer);
  let p = 0;
  const u16 = (x: number) => { v.setUint16(p, x, true); p += 2; }, u32 = (x: number) => { v.setUint32(p, x >>> 0, true); p += 4; };
  const offs: number[] = [];
  for (const f of files) {
    offs.push(p);
    u32(0x04034b50); u16(20); u16(0x0800); u16(0); u16(dosTime(f.date)); u16(dosDate(f.date));
    u32(f.crc); u32(f.data.length); u32(f.data.length); u16(f.name.length); u16(0);
    out.set(f.name, p); p += f.name.length;
    out.set(f.data, p); p += f.data.length;
  }
  const cd = p;
  files.forEach((f, i) => {
    u32(0x02014b50); u16(20); u16(20); u16(0x0800); u16(0); u16(dosTime(f.date)); u16(dosDate(f.date));
    u32(f.crc); u32(f.data.length); u32(f.data.length); u16(f.name.length); u16(0); u16(0); u16(0); u16(0); u32(0); u32(offs[i]);
    out.set(f.name, p); p += f.name.length;
  });
  const cdSize = p - cd;
  u32(0x06054b50); u16(0); u16(0); u16(files.length); u16(files.length); u32(cdSize); u32(cd); u16(0);
  return out;
}
