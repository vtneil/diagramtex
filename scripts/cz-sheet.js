#!/usr/bin/env node
// Preview sheet for circuitikz parts: draws every part from the given part files large, with leads,
// pins (red dots + names) and the circuitikz name, so a drawing can be checked by eye.
// usage: node scripts/cz-sheet.js src/domain/czparts-a.ts [more files…] [--cat res] -o sheet.svg
// Render to PNG with Quick Look: qlmanage -t -s 2400 -o <dir> sheet.svg   (writes sheet.svg.png)
const fs = require('fs'), path = require('path'), vm = require('vm');
const args = process.argv.slice(2);
let out = 'cz-sheet.svg', cat = null;
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '-o') out = args[++i];
  else if (args[i] === '--cat') cat = args[++i];
  else files.push(args[i]);
}
const window = {};
const sandbox = { window, console, Math };
vm.createContext(sandbox);
const esbuild = require('esbuild');
const imports = [path.join(__dirname, '../src/domain/czcore.ts'), ...files.map(f => path.resolve(f))];
const compiled = esbuild.buildSync({ stdin: { contents: imports.map(f => 'import ' + JSON.stringify(f) + ';').join('\n'), resolveDir: __dirname },
  bundle: true, write: false, format: 'iife', platform: 'browser' });
vm.runInContext(compiled.outputFiles[0].text, sandbox);
const CZ = window.TD.CZ;
const keys = CZ.order.filter((k) => !cat || CZ.parts[k].cat === cat);
const S = 60, CW = 380, CH = 300; // px per cm, cell size
// near-square sheet: Quick Look (qlmanage) crops a thumbnail to a square
const COLS = Math.max(2, Math.ceil(Math.sqrt((keys.length * CH) / CW)));
let body = '';
keys.forEach((key, i) => {
  const def = CZ.parts[key], G = CZ.geom(key);
  const cx = (i % COLS) * CW + CW / 2, cy = Math.floor(i / COLS) * CH + CH / 2 - 20;
  const m = (x, y) => [cx + x * S, cy - y * S];
  let s = `<rect x="${(i % COLS) * CW + 4}" y="${Math.floor(i / COLS) * CH + 4}" width="${CW - 8}" height="${CH - 8}" fill="#fff" stroke="#ddd"/>`;
  // 0.25 cm grid
  for (let g = -6; g <= 6; g++) {
    const [gx] = m(g * 0.25, 0), [, gy] = m(0, g * 0.25);
    s += `<path d="M${gx},${cy - 1.5 * S}V${cy + 1.5 * S}M${cx - 1.5 * S},${gy}H${cx + 1.5 * S}" stroke="${g % 4 ? '#f0f0f0' : '#e0e0e0'}" stroke-width="1"/>`;
  }
  if (def.kind === 'bipole') {
    const w = def.w || 0, [a] = m(-w / 2 - 0.6, 0), [b] = m(-w / 2, 0), [c] = m(w / 2, 0), [d] = m(w / 2 + 0.6, 0);
    s += `<path d="M${a},${cy}H${b}M${c},${cy}H${d}" stroke="#000" stroke-width="1.6"/>`;
  }
  s += CZ.svg(G, m, { stroke: '#000', width: 1.6, scale: S });
  for (const [n, p] of Object.entries(def.pins)) {
    const [x, y] = m(p[0], p[1]);
    s += `<circle cx="${x}" cy="${y}" r="3.5" fill="#e33"/><text x="${x + 5}" y="${y - 5}" font-size="11" fill="#e33" font-family="sans-serif">${n}</text>`;
  }
  const [bx1, by1] = m(G.box.x1, G.box.y2), [bx2, by2] = m(G.box.x2, G.box.y1);
  s += `<rect x="${bx1}" y="${by1}" width="${bx2 - bx1}" height="${by2 - by1}" fill="none" stroke="#39f" stroke-dasharray="3 3" stroke-width="0.8"/>`;
  const ty = Math.floor(i / COLS) * CH + CH - 34;
  s += `<text x="${cx}" y="${ty}" text-anchor="middle" font-size="15" font-family="sans-serif">${def.name}</text>`;
  s += `<text x="${cx}" y="${ty + 18}" text-anchor="middle" font-size="12" font-family="monospace" fill="#666">${def.kind === 'bipole' ? 'to[' + def.tikz + ']' : 'node[' + def.tikz + ']'}  w=${def.w ?? '-'}</text>`;
  body += s;
});
const W = COLS * CW, H = Math.max(1, Math.ceil(keys.length / COLS)) * CH;
fs.writeFileSync(out, `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"><rect width="${W}" height="${H}" fill="#fafafa"/>${body}</svg>`);
console.log(`${keys.length} parts → ${out} (${W}×${H})`);
