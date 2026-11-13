// Pictures coming in (a file, a pasted or dropped image, SVG markup) and going out with the LaTeX (the files a
// .zip carries). Coming in, PNG, JPEG and SVG keep their data; any other format the browser can draw (GIF, WebP,
// BMP, AVIF, ICO…) becomes a PNG, since pdflatex reads only PNG, JPEG and PDF (and SVG through the svg package).
import { zipStore, type ZipEntry } from '../core/zip';
import { svgVectorPdf } from './svgpdf';

export interface Picture { src: string; w: number; h: number }

const MAX = 1600; // keep stored documents small: at most this many pixels on the long side

const readAsDataUrl = (blob: Blob) => new Promise<string>((res, rej) => {
  const fr = new FileReader();
  fr.onload = () => res(fr.result as string); fr.onerror = () => rej(fr.error || new Error('could not read the file'));
  fr.readAsDataURL(blob);
});
const load = (src: string) => new Promise<HTMLImageElement>((res, rej) => {
  const im = new Image();
  im.onload = () => res(im); im.onerror = () => rej(new Error('the browser cannot open this picture'));
  im.src = src;
});
function draw(im: HTMLImageElement, w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  c.getContext('2d')!.drawImage(im, 0, 0, c.width, c.height);
  return c;
}

/** an SVG's size from its width/height or viewBox (an <img> of an SVG without them reports 0 or 150) */
export function svgSize(text: string): { w: number; h: number } | null {
  const tag = (/<svg\b[^>]*>/i.exec(text) || [])[0];
  if (!tag) return null;
  const attr = (n: string) => (new RegExp(`\\s${n}\\s*=\\s*["']([^"']*)["']`, 'i').exec(tag) || [])[1];
  const unit: Record<string, number> = { '': 1, px: 1, pt: 96 / 72, pc: 16, mm: 96 / 25.4, cm: 96 / 2.54, in: 96 };
  const len = (v?: string) => { const m = /^\s*([\d.]+)\s*(px|pt|pc|mm|cm|in)?\s*$/i.exec(v || ''); return m ? +m[1] * unit[(m[2] || '').toLowerCase()] : 0; };
  const vb = (attr('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  let w = len(attr('width')), h = len(attr('height'));
  if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
    if (!w && !h) { w = vb[2]; h = vb[3]; } else if (!w) w = h * vb[2] / vb[3]; else if (!h) h = w * vb[3] / vb[2];
  }
  return w > 0 && h > 0 ? { w, h } : null;
}
export const svgToSrc = (text: string) => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
export function srcText(src: string) {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(src);
  if (!m) return '';
  return m[1] ? decodeURIComponent(escape(atob(m[2]))) : decodeURIComponent(m[2]);
}

/** an image file, or SVG markup, as a picture to store */
export async function readPicture(input: Blob | string): Promise<Picture> {
  if (typeof input === 'string') {
    const size = svgSize(input);
    const src = svgToSrc(input), im = await load(src);
    return { src, w: size ? size.w : im.naturalWidth || 300, h: size ? size.h : im.naturalHeight || 200 };
  }
  const src = await readAsDataUrl(input);
  if (/svg/.test(input.type) || /^data:image\/svg/.test(src)) {
    const size = svgSize(srcText(src)), im = await load(src);
    return { src, w: size ? size.w : im.naturalWidth || 300, h: size ? size.h : im.naturalHeight || 200 };
  }
  const im = await load(src);
  const W = im.naturalWidth, H = im.naturalHeight;
  if (!W || !H) throw new Error('the picture is empty');
  const k = Math.min(1, MAX / Math.max(W, H)), kept = /^data:image\/(png|jpeg)[;,]/.test(src);
  if (k >= 1 && kept) return { src, w: W, h: H };
  const c = draw(im, W * k, H * k);
  return { src: c.toDataURL(/^data:image\/jpeg/.test(src) ? 'image/jpeg' : 'image/png', 0.9), w: c.width, h: c.height };
}

export function dataBytes(src: string): Uint8Array {
  const m = /^data:[^,]*?(;base64)?,(.*)$/s.exec(src);
  if (!m) return new Uint8Array();
  if (!m[1]) return new TextEncoder().encode(decodeURIComponent(m[2]));
  const bin = atob(m[2]), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

/** the bytes a picture is saved as under this name: its own data, or a PNG when the name asks for one */
export async function fileBytes(src: string, name: string): Promise<Uint8Array> {
  const want = (/\.(\w+)$/.exec(name) || [])[1]?.toLowerCase();
  const has = ((/^data:(?:image|application)\/([\w.+-]+)/.exec(src) || [])[1] || '').toLowerCase().replace('jpeg', 'jpg').replace('svg+xml', 'svg');
  if (want === has || !src.startsWith('data:image/')) return dataBytes(src);
  const im = await load(src), c = draw(im, im.naturalWidth || 300, im.naturalHeight || 200);
  return dataBytes(c.toDataURL('image/png'));
}

/** a PDF holding the SVG drawn as a picture at about `px` pixels on its long side (RGB with an alpha mask), for svg.sty
 *  to use where Inkscape can't run */
export async function svgPdf(src: string, px = 2000): Promise<Uint8Array> {
  const size = svgSize(srcText(src)), im = await load(src);
  const w0 = size ? size.w : im.naturalWidth || 300, h0 = size ? size.h : im.naturalHeight || 200;
  const k = px / Math.max(w0, h0), c = draw(im, w0 * k, h0 * k), W = c.width, H = c.height;
  const d = c.getContext('2d')!.getImageData(0, 0, W, H).data, rgb = new Uint8Array(W * H * 3), a = new Uint8Array(W * H);
  // canvas pixels are un-premultiplied: transparent ones carry black, which shows only where alpha lets it
  for (let i = 0, j = 0, q = 0; i < d.length; i += 4) { rgb[j++] = d[i]; rgb[j++] = d[i + 1]; rgb[j++] = d[i + 2]; a[q++] = d[i + 3]; }
  const deflate = async (u8: Uint8Array) => new Uint8Array(await new Response(new Blob([u8 as BlobPart]).stream().pipeThrough(new CompressionStream('deflate'))).arrayBuffer());
  const [img, mask] = await Promise.all([deflate(rgb), deflate(a)]);
  // the page is the SVG's own size in points (96 px to the inch)
  const pw = +(w0 * 72 / 96).toFixed(3), ph = +(h0 * 72 / 96).toFixed(3), cs = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
  const enc = new TextEncoder(), parts: Uint8Array[] = [], offs: number[] = [];
  let len = 0;
  const add = (x: string | Uint8Array) => { const u = typeof x === 'string' ? enc.encode(x) : x; parts.push(u); len += u.length; };
  const obj = (i: number, ...body: (string | Uint8Array)[]) => { offs[i] = len; add(`${i} 0 obj\n`); for (const b of body) add(b); add('\nendobj\n'); };
  add('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
  obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
  obj(2, '<< /Type /Pages /Count 1 /Kids [3 0 R] >>');
  obj(3, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 6 0 R >>`);
  obj(4, `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /SMask 5 0 R /Filter /FlateDecode /Length ${img.length} >>\nstream\n`, img, '\nendstream');
  obj(5, `<< /Type /XObject /Subtype /Image /Width ${W} /Height ${H} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${mask.length} >>\nstream\n`, mask, '\nendstream');
  obj(6, `<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`);
  const xref = len;
  add('xref\n0 7\n0000000000 65535 f \n' + offs.slice(1, 7).map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  add(`trailer\n<< /Size 7 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  const out = new Uint8Array(len);
  let p = 0; for (const u of parts) { out.set(u, p); p += u.length; }
  return out;
}

/** an SVG as PDF for svg.sty: vectors when it can be written so (src/platform/svgpdf.ts), else drawn as a picture */
export async function svgFilePdf(src: string): Promise<Uint8Array> {
  const text = srcText(src), size = svgSize(text);
  let w = size?.w, h = size?.h;
  if (!w || !h) { const im = await load(src); w = im.naturalWidth || 300; h = im.naturalHeight || 200; }
  return (await svgVectorPdf(text, w, h)) || svgPdf(src);
}
/** the files a .tex needs beside it: each picture under the name it has in the LaTeX, and with `convert`, for
 *  an SVG a PDF of it where svg.sty looks for one (for LaTeX set to use it instead of Inkscape) */
export async function texFiles(files: Map<string, string>, fallback: (name: string) => string, convert = false, now = new Date()): Promise<ZipEntry[]> {
  const out: ZipEntry[] = [];
  for (const [name, src] of files) {
    out.push({ name, data: await fileBytes(src, name), date: now });
    if (convert && /\.svg$/i.test(name)) out.push({ name: fallback(name), data: await svgFilePdf(src), date: now });
  }
  return out;
}
/** the .tex and every picture it uses, as one .zip (with `convert`, SVGs come with their PDFs too) */
export async function texBundle(texName: string, tex: string, files: Map<string, string>, fallback: (name: string) => string, convert = false): Promise<Blob> {
  const now = new Date();
  const entries: ZipEntry[] = [{ name: texName, data: tex, date: now }, ...await texFiles(files, fallback, convert, now)];
  return new Blob([zipStore(entries) as BlobPart], { type: 'application/zip' });
}
