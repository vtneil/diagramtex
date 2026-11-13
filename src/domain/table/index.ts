// The table engine, installed as TD.table: the model and its operations, the LaTeX writer, the importers and
// the renderer. The Table workspace (src/ui/services/table.ts) is its only user interface. A 'table' shape
// type lets the app's own SVG and PNG export draw it (fonts embedded, the same pipeline as every picture).
import { runtime as TD } from '../../runtime';
import * as model from './model';
import * as numbers from './numbers';
import * as latex from './latex';
import * as importers from './import';
import * as render from './render';

TD.table = { ...model, ...numbers, ...latex, ...importers, layout: render.layout, draw: render.draw, shownText: render.shownText };

const r2 = (v: number) => Math.round(v * 100) / 100;
// A Table block on the canvas: the shape holds the table model; (x, y) is its top-left corner. It is drawn by the
// same renderer as the Table workspace's preview and exported as a tabular in a node (the bare output: no float,
// no caption). Double-click edits it in the Table workspace (src/ui/services/table.ts, editBlock).
// a block's bare tabular has no caption (that needs a float), so the block doesn't draw one either; the Table
// workspace's SVG and PNG (a shape with cap: true) do
const shown = (s: any) => (s.table.caption && !s.cap ? { ...s.table, caption: '' } : s.table);
const lay = (s: any) => render.layout(shown(s));
/** a starting table: a header and two rows */
function starter() {
  const m = model.create(3, 2, 'booktabs');
  [['Item', 'Value'], ['A', '1.2'], ['B', '3.4']].forEach((row, r) => row.forEach((t, c) => { m.cells[r][c].t = t; }));
  return m;
}
/** LaTeX → a table model (a tabular, a table float or a page holding one); null when there is no table in it */
function readTable(src: string) {
  try { const r = importers.importText(src, 'latex'); return model.nRows(r.table) && model.nCols(r.table) ? r : null; } catch (e: any) { return null; }
}
/** the tabular the block exports, and the packages it needs (xcolor comes with TikZ) */
function blockLatex(m: any) {
  const r = latex.toLatex(m, { bare: true });
  return { code: r.code, packages: r.packages };
}
TD.TYPES.table = {
  name: 'Table',
  pts: [['x', 'y']],
  create: (p: any) => ({ type: 'table', x: p.x, y: p.y, table: starter() }),
  drag(s: any, _a: any, q: any) { s.x = q.x; s.y = q.y; },
  valid: (s: any) => !!s.table,
  handles: () => [],
  anchors(s: any) { const L = lay(s); return [{ x: s.x, y: s.y + L.h / 2 }, { x: s.x + L.w, y: s.y + L.h / 2 }, { x: s.x + L.w / 2, y: s.y }, { x: s.x + L.w / 2, y: s.y + L.h }]; },
  samples(s: any) { const L = lay(s); return [{ x: s.x, y: s.y }, { x: s.x + L.w, y: s.y + L.h }]; },
  svg(s: any, ctx: any) {
    const d = render.draw(shown(s), { export: !!ctx.export });
    const hit = ctx.export ? '' : `<rect class="hitfill" x="0" y="0" width="${r2(d.w)}" height="${r2(d.h)}"/>`;
    return `<g transform="translate(${r2(s.x)},${r2(s.y)})">${d.svg}${hit}</g>`;
  },
  // drawn in TikZ as a node holding the tabular
  tikz(s: any, X: any) {
    const r = blockLatex(s.table);
    for (const p of r.packages) { const n = /\{([^}]*)\}$/.exec(p); if (n && n[1] !== 'xcolor') X.pkgs.add(n[1]); }
    const L = lay(s);
    return `\\node[inner sep=0pt] at ${X.c(s.x + L.w / 2, s.y + L.h / 2)} {%\n${r.code}%\n};`;
  },
};
// A tabular in a TikZ node, or pasted on its own (with a table float, \centering, a size or \setlength round it):
// the commands before it may be settings and a caption, never words.
const TAB_BEGIN = /\\begin\{(tabularx|tabulary|tabular\*?|longtable|NiceTabular|tblr)\}/;
/** only commands, their arguments, braces and spaces: settings and a caption, no words */
function onlyCommands(t: string) {
  for (let k = 0; k < 12; k++) { const n = t.replace(/\{[^{}]*\}|\[[^\][]*\]/g, ''); if (n === t) break; t = n; }
  return !t.replace(/\\[a-zA-Z@]+\*?|[\s{}]/g, '');
}
/** the whole text when it is one table environment with only settings round it (the shape a block's re gives) */
const TABLE_RE = {
  exec(t: string) {
    const m = TAB_BEGIN.exec(t);
    if (!m) return null;
    const end = t.lastIndexOf(`\\end{${m[1]}}`);
    if (end < m.index || !onlyCommands(t.slice(0, m.index)) || !onlyCommands(t.slice(end + m[1].length + 6))) return null;
    if (!readTable(t)) return null; // only what reads as a table becomes one
    return Object.assign([t], { index: 0, input: t });
  },
} as unknown as RegExp;
TD.blocks.register('table', {
  menu: { order: 12.5, label: 'Table', title: 'A table (booktabs, merged cells, colours, siunitx numbers), edited in the Table workspace and written as a tabular in a node', icon: '<svg viewBox="0 0 32 24"><rect x="5" y="5" width="22" height="4.5" class="a1"/><path d="M5 19h22"/><path d="M5 14.25h22M15 9.5V19" stroke-width=".8"/></svg>' },
  nodeImport: {
    order: 50, re: TABLE_RE,
    // the importer gives the code as src: read it into the model, centred where the node was
    // (false: the code can't stay as written in a node — a float, a caption, a longtable, or an environment the
    // export doesn't load a package for — so it is written from the table)
    place(q: any, at: any) {
      const src = q.src, r = readTable(src);
      q.table = r ? r.table : starter();
      delete q.src;
      const L = lay(q);
      q.x = at.x - L.w / 2; q.y = at.y - L.h / 2;
      return !(!r || /\\begin\{(table\*?|figure|center|flushleft|flushright|longtable|NiceTabular|tblr|tabulary)\}|\\(caption|label|centering)\b/.test(src));
    },
  },
  fixed: true,
  geometry: [['x', 'x'], ['y', 'y']],
  editor: {
    get: () => TD.tableBlockEditor, alias: 'tableOpen',
    available: () => !!TD.tableBlockEditor,
    apply(target: any, result: any) { target.table = model.normalize(result.table); },
  },
});
TD.tableBlock = { starter, readTable, blockLatex, TABLE_RE };
