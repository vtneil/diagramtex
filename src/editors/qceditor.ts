import { isSwapGate, boundedSpan } from './qc-span';
import { onLocale, t, message } from '../i18n';
import FormPanel from '../ui/FormPanel.svelte';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { row, switchRow, section } from '../ui/forms';
import type { FormRow, FormSection, Attributes } from '../ui/forms';
import { field, numField, note, texColour } from '../ui/editor-fields';
import QceditorFrame from '../ui/editors/QceditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
import { onLabelFontsChange } from '../domain/label-image';
// Quantum circuit editor: the overlay that opens on a Quantum block. A palette of quantikz elements,
// the circuit drawn by the canvas renderer over a grid of cells (wires × steps) where elements are
// dropped, moved and linked, the selected cell's properties, and beside them the quantikz code, live
// both ways. Only the cells that change are rewritten, so hand-written code keeps its form.
// TD.qcEditor.open(block, onDone) — block: { src, size, font }; onDone({ src }) on Done.
(function () {
  const Q = TD.qc;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PAPER = '#fffdf8', INK = '#1c1b19';

  // Delete gutters, shared by the grid editors (Quantum, ZX, CD): a strip left of the rows and one above the
  // columns. Pointing at a row (column) there shows its bin and marks the whole line; a click deletes it.
  // While the pointer is in a row or column (a cell or the gutter beside it), that line's bin shows faintly.
  // g: { sx, sy, R, C, left, top } in stage px — sx / sy are the cell edges, left / top the paper's edges.
  const GUT = 22;
  TD.gridDel = {
    at(g: any, x: any, y: any) {
      if (!g || !g.R || !g.C) return null;
      // only the round button itself (radius 9) counts, not the gutter around it
      const rx = g.left - GUT / 2 - 2, cy = g.top - GUT / 2 - 2, R2 = 10 * 10;
      for (let i = 0; i < g.R; i++) { const y0 = (g.sy[i] + g.sy[i + 1]) / 2; if ((x - rx) ** 2 + (y - y0) ** 2 <= R2) return { kind: 'row' as const, i }; }
      for (let i = 0; i < g.C; i++) { const x0 = (g.sx[i] + g.sx[i + 1]) / 2; if ((x - x0) ** 2 + (y - cy) ** 2 <= R2) return { kind: 'col' as const, i }; }
      return null;
    },
    // the row and column the pointer is in, counting the gutters: their bins show faintly while it is there
    near(g: any, x: any, y: any) {
      if (!g || !g.R || !g.C) return null;
      const { sx, sy, R, C } = g, band = (v: any, e: any, n: any) => { for (let i = 0; i < n; i++) if (v >= e[i] && v < e[i + 1]) return i; return -1; };
      const r = x >= g.left - GUT - 4 && x <= sx[C] ? band(y, sy, R) : -1, c = y >= g.top - GUT - 4 && y <= sy[R] ? band(x, sx, C) : -1;
      return r < 0 && c < 0 ? null : { r, c };
    },
    svg(g: any, del: any, hover: any, names: any) {
      if (!g || !g.R || !g.C) return '';
      const { sx, sy, R, C } = g, rx = r2(g.left - GUT / 2 - 2), cy = r2(g.top - GUT / 2 - 2);
      const bin = (x: any, y: any, on: any, title: any) => `<g class="qe-del${on ? ' on' : ''}" transform="translate(${x},${y})"><title>${esc(title)}</title><circle r="9"/><svg x="-6" y="-6" width="12" height="12" viewBox="0 0 20 20"><path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/></svg></g>`;
      // names: a whole title with {n} for the number ("Delete wire {n}"), or just the noun ("wire")
      const name = (k: number, i: number) => (/\{n\}/.test(names[k]) ? names[k].replace('{n}', String(i + 1)) : `Delete ${names[k]} ${i + 1}`);
      const row = (i: any, on: any) => bin(rx, r2((sy[i] + sy[i + 1]) / 2), on, name(0, i));
      const col = (i: any, on: any) => bin(r2((sx[i] + sx[i + 1]) / 2), cy, on, name(1, i));
      if (del) {
        const band = del.kind === 'row'
          ? `<rect class="qe-delband" x="${r2(sx[0])}" y="${r2(sy[del.i])}" width="${r2(sx[C] - sx[0])}" height="${r2(sy[del.i + 1] - sy[del.i])}"/>`
          : `<rect class="qe-delband" x="${r2(sx[del.i])}" y="${r2(sy[0])}" width="${r2(sx[del.i + 1] - sx[del.i])}" height="${r2(sy[R] - sy[0])}"/>`;
        return band + (del.kind === 'row' ? row(del.i, true) : col(del.i, true));
      }
      if (!hover) return '';
      return (hover.r >= 0 && hover.r < R ? row(hover.r, false) : '') + (hover.c >= 0 && hover.c < C ? col(hover.c, false) : '');
    },
  };

  // ---------------------------------------------------------------- elements
  // main: one per cell (dropping another replaces it); extras (slices, groups, wire types) stack on it.
  const MAIN = new Set(['gate', 'meter', 'metercw', 'meterD', 'inputD', 'measuretab', 'measure', 'ctrl', 'octrl', 'control', 'ocontrol', 'targ', 'targX', 'swap', 'phase', 'push', 'midstick', 'lstick', 'rstick', 'ground', 'trash', 'qwbundle', 'permute', 'makeebit', 'phantomgate', 'hphantomgate', 'linethrough']);
  const LINKS = new Set(['ctrl', 'octrl', 'swap', 'vqw', 'vcw', 'cwbend']); // {n}: a line to the wire n below
  const SPANS = new Set(['gate', 'meter', 'lstick', 'rstick', 'midstick']); // [wires=n] / [n]
  const NAMES: Record<string, any> = {
    gate: 'Gate', meter: 'Meter', meterD: 'Measurement (D)', measuretab: 'Measurement tab', measure: 'Measurement', ctrl: 'Control', octrl: 'Open control',
    control: 'Control (no line)', ocontrol: 'Open control (no line)', targ: 'Target', targX: 'Swap end', swap: 'Swap', phase: 'Phase', push: 'Text', midstick: 'Middle label',
    lstick: 'Input label', rstick: 'Output label', ground: 'Ground', qwbundle: 'Bundle', slice: 'Slice', gategroup: 'Group', setwiretype: 'Wire type',
    metercw: 'Meter to classical', inputD: 'Input (D)', trash: 'Discard', permute: 'Permutation', makeebit: 'Entangled pair', phantomgate: 'Space', hphantomgate: 'Space',
    linethrough: 'Line through', ghost: 'Height of', gateinput: 'Gate input', gateoutput: 'Gate output', wave: 'Wave', wireoverride: 'Wire override',
  };
  // an element's or palette item's name as shown (the tables keep the English, which search also matches;
  // gate names such as Hadamard, CNOT or Pauli X stay as they are)
  const say = (en: string): string => (({
    Gate: () => t('editor.qc.n.gate', 'Gate'), Meter: () => t('editor.qc.n.meter', 'Meter'), 'Measurement (D)': () => t('editor.qc.n.measurementD', 'Measurement (D)'),
    'Measurement tab': () => t('editor.qc.n.measuretab', 'Measurement tab'), Measurement: () => t('editor.qc.n.measurement', 'Measurement'), Control: () => t('editor.qc.n.control', 'Control'),
    'Open control': () => t('editor.qc.n.octrl', 'Open control'), 'Control (no line)': () => t('editor.qc.n.controlNoLine', 'Control (no line)'), 'Open control (no line)': () => t('editor.qc.n.ocontrolNoLine', 'Open control (no line)'),
    Target: () => t('editor.qc.n.target', 'Target'), 'Swap end': () => t('editor.qc.n.swapEnd', 'Swap end'), Swap: () => t('editor.qc.n.swap', 'Swap'), Phase: () => t('editor.qc.n.phase', 'Phase'),
    Text: () => t('ui.text', 'Text'), 'Middle label': () => t('editor.qc.n.midstick', 'Middle label'), 'Input label': () => t('editor.qc.n.lstick', 'Input label'), 'Output label': () => t('editor.qc.n.rstick', 'Output label'),
    Ground: () => t('editor.qc.n.ground', 'Ground'), Bundle: () => t('editor.qc.n.bundle', 'Bundle'), Slice: () => t('editor.qc.n.slice', 'Slice'), Group: () => t('editor.qc.group', 'Group'),
    'Wire type': () => t('editor.qc.n.wiretype', 'Wire type'), 'Meter to classical': () => t('editor.qc.n.metercw', 'Meter to classical'), 'Input (D)': () => t('editor.qc.n.inputD', 'Input (D)'),
    Discard: () => t('editor.qc.n.trash', 'Discard'), Permutation: () => t('editor.qc.n.permute', 'Permutation'), 'Entangled pair': () => t('editor.qc.n.ebit', 'Entangled pair'), Space: () => t('editor.qc.n.space', 'Space'),
    'Line through': () => t('editor.qc.n.linethrough', 'Line through'), 'Height of': () => t('editor.qc.n.ghost', 'Height of'), 'Gate input': () => t('editor.qc.n.gateinput', 'Gate input'),
    'Gate output': () => t('editor.qc.n.gateoutput', 'Gate output'), Wave: () => t('editor.qc.n.wave', 'Wave'), 'Wire override': () => t('editor.qc.n.wireoverride', 'Wire override'),
    'Gate U': () => t('editor.qc.n.gateU', 'Gate {name}', { name: 'U' }), 'Two-wire gate': () => t('editor.qc.n.u2', 'Two-wire gate'), 'Swap gate': () => t('editor.qc.n.swapg', 'Swap gate'),
    'Controlled Z': () => t('editor.qc.n.controlled', 'Controlled {name}', { name: 'Z' }), 'Controlled U': () => t('editor.qc.n.controlled', 'Controlled {name}', { name: 'U' }),
    'Input |0⟩': () => t('editor.qc.n.input', 'Input {ket}', { ket: '|0⟩' }), 'Classical from here': () => t('editor.qc.n.wc', 'Classical from here'), 'Quantum from here': () => t('editor.qc.n.wq', 'Quantum from here'),
    'No wire from here': () => t('editor.qc.n.wn', 'No wire from here'), 'Wire down': () => t('editor.qc.n.vqw', 'Wire down'), 'Classical wire down': () => t('editor.qc.n.vcw', 'Classical wire down'),
    'Label above': () => t('editor.qc.n.glabel', 'Label above'),
  } as Record<string, () => string>)[en]?.() ?? en);
  const catName = (en: string): string => (({
    Gates: () => t('editor.qc.cat.gates', 'Gates'), Controls: () => t('editor.qc.cat.controls', 'Controls'), Measure: () => t('editor.qc.cat.measure', 'Measure'),
    Labels: () => t('editor.qc.cat.labels', 'Labels'), Wires: () => t('editor.qc.cat.wires', 'Wires'), Annotations: () => t('editor.qc.cat.annotations', 'Annotations'),
  } as Record<string, () => string>)[en]?.() ?? en);
  const wiresText = (n: number) => (n === 1 ? t('editor.qc.oneWire', '1 wire') : t('editor.qc.nWires', '{n} wires', { n }));
  const stepsText = (n: number) => (n === 1 ? t('editor.qc.oneStep', '1 step') : t('editor.qc.nSteps', '{n} steps', { n }));
  // palette: [key, name, cells: [[row offset, code]], shortcut]
  const PAL = [
    ['Gates', [
      ['h', 'Hadamard', [[0, '\\gate{H}']], 'H'], ['x', 'Pauli X', [[0, '\\gate{X}']], 'X'], ['y', 'Pauli Y', [[0, '\\gate{Y}']], 'Y'], ['z', 'Pauli Z', [[0, '\\gate{Z}']], 'Z'],
      ['s', 'S', [[0, '\\gate{S}']], 'S'], ['t', 'T', [[0, '\\gate{T}']], 'T'], ['sd', 'S†', [[0, '\\gate{S^\\dagger}']]], ['td', 'T†', [[0, '\\gate{T^\\dagger}']]],
      ['sx', '√X', [[0, '\\gate{\\sqrt{X}}']]], ['rx', 'Rx(θ)', [[0, '\\gate{R_x(\\theta)}']]], ['ry', 'Ry(θ)', [[0, '\\gate{R_y(\\theta)}']]], ['rz', 'Rz(θ)', [[0, '\\gate{R_z(\\theta)}']]],
      ['u', 'Gate U', [[0, '\\gate{U}']], 'U'], ['u2', 'Two-wire gate', [[0, '\\gate[2]{U}'], [1, '']]],
      ['swapg', 'Swap gate', [[0, '\\gate[2,swap]{}'], [1, '']]], ['perm', 'Permutation', [[0, '\\permute{2,1}'], [1, '']]],
    ]],
    ['Controls', [
      ['cnot', 'CNOT', [[0, '\\ctrl{1}'], [1, '\\targ{}']]], ['cz', 'Controlled Z', [[0, '\\ctrl{1}'], [1, '\\control{}']]], ['cu', 'Controlled U', [[0, '\\ctrl{1}'], [1, '\\gate{U}']]], ['swap2', 'SWAP', [[0, '\\swap{1}'], [1, '\\targX{}']]],
      ['toff', 'Toffoli', [[0, '\\ctrl{2}'], [1, '\\ctrl{1}'], [2, '\\targ{}']]], ['ctrl', 'Control', [[0, '\\ctrl{}']], 'C'], ['octrl', 'Open control', [[0, '\\octrl{}']], 'O'],
      ['targ', 'Target', [[0, '\\targ{}']], '+'], ['swap', 'Swap', [[0, '\\swap{}']]], ['targX', 'Swap end', [[0, '\\targX{}']]], ['phase', 'Phase', [[0, '\\phase{\\alpha}']]],
    ]],
    ['Measure', [
      ['meter', 'Meter', [[0, '\\meter{}']], 'M'], ['meterD', 'Measurement (D)', [[0, '\\meterD{\\ket{0}}']]], ['mtab', 'Measurement tab', [[0, '\\measuretab{0}']]], ['ground', 'Ground', [[0, '\\ground{}']]],
      ['metercw', 'Meter to classical', [[0, '\\metercw{}']]], ['measure', 'Measurement', [[0, '\\measure{x}']]], ['trash', 'Discard', [[0, '\\trash{}']]],
    ]],
    ['Labels', [
      ['ket0', 'Input |0⟩', [[0, '\\lstick{\\ket{0}}']]], ['lstick', 'Input label', [[0, '\\lstick{\\ket{\\psi}}']]], ['rstick', 'Output label', [[0, '\\rstick{\\ket{\\psi}}']]],
      ['mid', 'Middle label', [[0, '\\midstick{\\ket{0}}']]], ['push', 'Text', [[0, '\\push{a}']]],
      ['inputD', 'Input (D)', [[0, '\\inputD{0}']], null, '\\inputD{0} & &'], ['ebit', 'Entangled pair', [[0, '\\makeebit{}'], [1, '']], null, '\\makeebit{} & & \\\\ & &'],
    ]],
    ['Wires', [
      ['wc', 'Classical from here', [[0, '\\setwiretype{c}']], null, '& & \\setwiretype{c} & &'], ['wq', 'Quantum from here', [[0, '\\setwiretype{q}']], null, '\\setwiretype{c} & & \\setwiretype{q} & &'], ['wn', 'No wire from here', [[0, '\\setwiretype{n}']], null, '& & \\setwiretype{n} & &'],
      ['bundle', 'Bundle', [[0, '\\qwbundle{n}']]], ['vqw', 'Wire down', [[0, '\\vqw{1}']], null, '& \\gate{U} \\vqw{1} & \\\\ & \\gate{V} &'], ['vcw', 'Classical wire down', [[0, '\\vcw{1}']], null, '& \\meter{} \\vcw{1} & \\\\ & \\gate{V} &'],
      ['wave', 'Wave', [[0, '\\wave']], null, '\\wave & & &'],
    ]],
    ['Annotations', [
      ['slice', 'Slice', [[0, '\\slice{}']]], ['group', 'Group', [[0, '\\gategroup[2,steps=2,style={dashed,rounded corners}]{}']]],
      ['glabel', 'Label above', [[0, '\\gategroup[1,steps=1,style={draw=none}]{label}']], null, '& \\gate{U} \\gategroup[1,steps=1,style={draw=none}]{label} &'],
    ]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, cells, key, mini] of items) { ITEM[(k as any)] = { k, name, cells, key, mini }; if (key) KEYS[(key as any).toLowerCase()] = k; }
  function miniSrc(it: any) {
    if (it.mini) return it.mini;
    const rows = Math.max(...it.cells.map((c: any) => c[0])) + 1, out = [];
    for (let r = 0; r < rows; r++) {
      const code = (it.cells.find((c: any) => c[0] === r) || [0, ''])[1];
      out.push(/\\lstick/.test(code) ? `${code} & &` : /\\rstick/.test(code) ? `& & ${code}` : `& ${code} &`);
    }
    return out.join(' \\\\ ');
  }

  // ---------------------------------------------------------------- model
  // rows of cells; a cell keeps its text and, unless it holds commands this editor doesn't know
  // (opaque), its items { name, o: [options], a: [arguments] }. dirty cells are written from items.
  const verticalWire = (it: any) => it.name === 'vqw' || it.name === 'vcw';
  function exclusiveWires(items: any[]) {
    let last = -1;
    items.forEach((it, i) => { if (verticalWire(it)) last = i; });
    return items.filter((it, i) => !verticalWire(it) || i === last);
  }
  // a cell whose braces don't pair (an unclosed { swallows the rest of the circuit into it) is broken: kept as written,
  // whatever is done to it in the drawing, until the code is fixed
  function parseCell(text: any) {
    let unknown = false;
    const items = Q.cell(text, () => (unknown = true)), broken = Q.braceFault(text) !== 0;
    // (a macro of the file's own read as the commands it stands for is kept as written)
    if (items.expanded) unknown = true;
    return { text: text.trim(), items: exclusiveWires(items), opaque: unknown || broken, dirty: !unknown && !broken && items.filter(verticalWire).length > 1, ...(broken ? { broken } : {}) };
  }
  const emptyCell = () => ({ text: '', items: [], opaque: false, dirty: false });
  const itemCode = (it: any) => (it.plain ? it.a[0] : `\\${it.name}${it.o.map((o: any) => `[${o}]`).join('')}${it.a.map((a: any) => `{${a}}`).join('')}`);
  const cellText = (c: any) => (c.dirty && !c.broken ? c.items.map(itemCode).join(' ') : c.text);
  function load(src: any) {
    const t = String(src || '');
    const { env, inner } = Q.unwrap(t);
    const g = Q.grid(inner), C = Math.max(0, ...g.map((r: any) => r.length));
    const rows = g.map((r: any) => { const cells = r.map(parseCell); while (cells.length < C) cells.push(emptyCell()); return cells; });
    return { wrapped: /\\begin\{quantikz\}/.test(t), env, seps: (g.seps || []).slice(), rows };
  }
  const nR = (M: any) => M.rows.length, nC = (M: any) => (M.rows[0] ? M.rows[0].length : 0);
  // the code, with the & signs lined up
  function codeOf(M: any) {
    const C = nC(M), texts = M.rows.map((r: any) => r.map(cellText)), w: any[] = [];
    for (let c = 0; c < C; c++) w[c] = Math.max(0, ...texts.map((r: any) => r[c].length));
    const lines = texts.map((r: any, i: any) => r.map((t: any, c: any) => (c < C - 1 ? t.padEnd(w[c]) : t)).join(' & ').replace(/\s+$/, '') + (i < texts.length - 1 ? ` \\\\${M.seps[i] || ''}` : ''));
    const body = lines.join('\n');
    return M.wrapped || !body ? `\\begin{quantikz}${M.env ? `[${M.env}]` : ''}\n${body}\n\\end{quantikz}` : body;
  }
  const mainOf = (c: any) => c.items.find((it: any) => MAIN.has(it.name));
  const setItems = (c: any, items: any) => { c.items = exclusiveWires(items); c.opaque = false; c.dirty = true; };
  const intArg = (v: any) => { const n = parseInt(v, 10); return Number.isFinite(n) ? n : 0; };
  // [wires=n] in an option list: read / write (1 drops it)
  function spanOf(it: any) {
    if (isSwapGate(it, Q.opts)) return 2;
    if (!it.o.length) return 1;
    const o = Q.opts(it.o[0]);
    if (o.map.wires) return Math.max(1, intArg(o.map.wires));
    const bare = o.list.find((x: any) => /^\d+$/.test(x));
    return bare ? Math.max(1, +bare) : 1;
  }
  function setSpan(it: any, n: any) {
    const list = it.o.length ? Q.opts(it.o[0]).list.filter((x: any) => !/^\d+$/.test(x) && !/^wires\s*=/.test(x)) : [];
    if (isSwapGate(it, Q.opts)) n = 2;
    if (n > 1) list.unshift(String(n));
    if (list.length) it.o[0] = list.join(', '); else if (it.o.length > 1) it.o[0] = ''; else it.o.splice(0, 1);
  }
  // \gate[…][min width][min height]{…}, in cm (0: none)
  const cmOf = (v: any) => { const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|em)?\s*$/.exec(v || ''); if (!m) return 0; const n = +m[1]; if (m[2] === 'pt' && n <= 1.5) return 0; return m[2] === 'mm' ? n / 10 : m[2] === 'pt' ? n / 28.45 : m[2] === 'em' ? n * 0.35 : n; };
  function gateSize(it: any) { return { w: cmOf(it.o[1]), h: cmOf(it.o[2]) }; }
  function setGateSize(it: any, w: any, h: any) {
    const f = (v: any) => (v > 0 ? `${Math.round(v * 100) / 100}cm` : '');
    while (it.o.length < 3) it.o.push('');
    it.o[1] = f(w) || (h > 0 ? '1.5pt' : ''); it.o[2] = f(h);
    if (!it.o[2]) { it.o.length = 2; if (!it.o[1]) { it.o.length = 1; if (!it.o[0]) it.o.length = 0; } }
  }
  function groupDims(it: any) { const o = Q.opts(it.o[0] || ''); return { wires: Math.max(1, intArg(o.map.wires) || +(o.list.find((x: any) => /^\d+$/.test(x)) || 1)), steps: Math.max(1, intArg(o.map.steps) || 1) }; }
  function setGroupDims(it: any, wires: any, steps: any) {
    const list = Q.opts(it.o[0] || '').list.filter((x: any) => !/^\d+$/.test(x) && !/^(wires|steps)\s*=/.test(x));
    it.o[0] = [String(wires), `steps=${steps}`, ...list].join(',');
  }

  // Re-index after wires or steps are inserted / removed: rowMap / colMap give an old index's new
  // index (null: removed). Links and spans keep pointing at the same wires.
  function remap(M: any, rowMap: any, colMap: any, R2: any, C2: any) {
    const out = Array.from<any, any>({ length: R2 }, () => Array.from<any, any>({ length: C2 }, emptyCell));
    const R = nR(M), C = nC(M);
    const lastKept = (from: any, to: any, map: any, n: any) => { for (let i = Math.min(to, n - 1); i >= from; i--) if (map(i) != null) return i; return null; };
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const r1 = rowMap(r), c1 = colMap(c);
      if (r1 == null || c1 == null) continue;
      const cell = M.rows[r][c];
      if (!cell.opaque) {
        let changed = false;
        for (const it of cell.items) {
          if (LINKS.has(it.name) && intArg(it.a[0])) {
            const t = rowMap(r + intArg(it.a[0])), n = t == null ? 0 : t - r1;
            if (n !== intArg(it.a[0])) { it.a[0] = n ? String(n) : ''; changed = true; }
          } else if (SPANS.has(it.name) && spanOf(it) > 1) {
            const last = lastKept(r, r + spanOf(it) - 1, rowMap, R), n = last == null ? 1 : rowMap(last) - r1 + 1;
            if (n !== spanOf(it)) { setSpan(it, n); changed = true; }
          } else if (it.name === 'slice' && (it.wr || sliceShort(it))) {
            const [a, b] = sliceWires(it), l = lastKept(a, b, rowMap, R);
            let f = a; while (f <= b && rowMap(f) == null) f++;
            if (l == null) delete it.wr; else it.wr = [rowMap(f), rowMap(l)];
          } else if (it.name === 'gategroup') {
            const d = groupDims(it), lr = lastKept(r, r + d.wires - 1, rowMap, R), lc = lastKept(c, c + d.steps - 1, colMap, C);
            const w = lr == null ? 1 : rowMap(lr) - r1 + 1, s = lc == null ? 1 : colMap(lc) - c1 + 1;
            if (w !== d.wires || s !== d.steps) { setGroupDims(it, w, s); changed = true; }
          }
        }
        if (changed) cell.dirty = true;
      }
      out[r1][c1] = cell;
    }
    const seps = [];
    for (let r = 0; r < R; r++) if (rowMap(r) != null && M.seps[r]) seps[rowMap(r)] = M.seps[r];
    M.rows = out; M.seps = seps;
  }
  function insertRow(M: any, at: any) { remap(M, (r: any) => (r >= at ? r + 1 : r), (c: any) => c, nR(M) + 1, Math.max(1, nC(M))); }
  function deleteRows(M: any, a: any, b: any) { remap(M, (r: any) => (r < a ? r : r > b ? r - (b - a + 1) : null), (c: any) => c, nR(M) - (b - a + 1), nC(M)); }
  function insertCol(M: any, at: any) { remap(M, (r: any) => r, (c: any) => (c >= at ? c + 1 : c), Math.max(1, nR(M)), nC(M) + 1); }
  // steps a..b trade places with the step beside them (d = -1: left, +1: right)
  function moveCols(M: any, a: any, b: any, d: any) {
    const o = d < 0 ? a - 1 : b + 1;
    remap(M, (r: any) => r, (c: any) => (c >= a && c <= b ? c + d : c === o ? (d < 0 ? b : a) : c), nR(M), nC(M));
  }
  function deleteCols(M: any, a: any, b: any) { remap(M, (r: any) => r, (c: any) => (c < a ? c : c > b ? c - (b - a + 1) : null), nR(M), nC(M) - (b - a + 1)); if (!nC(M)) M.rows = []; }
  function ensure(M: any, R: any, C: any) {
    while (nR(M) < R) M.rows.push(Array.from<any, any>({ length: Math.max(nC(M), 1) }, emptyCell));
    while (nC(M) < C) for (const r of M.rows) r.push(emptyCell());
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'qcModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, QceditorFrame);
  document.body.appendChild(root);
  const svg = $('.qe-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('editor.qc.searchElements', 'Search elements'), label: message('editor.commonA.elements', 'Elements'), listClass: 'qe-list', onpick: (k) => choose(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  for (const [action, axis] of [['addrow', 'row'], ['addcol', 'col']]) {
    const button = $('[data-qe="' + action + '"]', root);
    button.addEventListener('pointerenter', () => {
      if (!E || E.drag || !nR(E.M) || !nC(E.M)) return;
      E.hover = axis === 'row' ? { r: nR(E.M), c: 0 } : { r: 0, c: nC(E.M) }; draw();
    });
    button.addEventListener('pointerleave', () => { if (E && !E.drag) { E.hover = null; draw(); } });
  }

  // ---------------------------------------------------------------- state
  // { M, sel: {r1, c1, r2, c2} | null, arm, view: {ox, oy, k}, undo, redo, pending, start, done, drag, hover, st, codeAt, codeTimer, clip }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  // a served font read for the label pictures (src/domain/label-image.ts): an open editor draws its labels again in it
  onLabelFontsChange(() => { if (E) draw(); });
  const snap = () => (E.typed = keepComments(E.typed, codeOf(E.M))); // the drawing's code, keeping the comments last written
  const history = TD.editorSession.history({
    state: () => E, snapshot: () => snap(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  const { begin, undo, redo } = history;
  // while a cell is broken (its braces don't pair), the drawing is read back from the code after each edit: the broken
  // cell is kept as written, so a change made to it in the drawing is dropped, and the tip says why
  function commit() {
    history.commit();
    if (!E || !E.M.rows.some((r: any) => r.some((c: any) => c.broken))) return;
    const dropped = E.M.rows.some((r: any) => r.some((c: any) => c.broken && c.dirty));
    E.M = load(snap());
    if (dropped) stageNote.flash(t('editor.qc.broken', "The braces in that part of the code don't pair: fix them in the code first. Until then it is kept as written."), 3200);
  }
  // one edit: begin, change, commit, redraw
  function edit(fn: any) { begin(); fn(); commit(); clampSel(); draw(); keepInView(); renderProps(); }
  // while the view is fitted (on open, or after Fit / 0), every edit fits the circuit again; once the user pans
  // or zooms, the camera stays where they put it until Fit is pressed again
  function keepInView() { if (E.G && E.fitted) fit(); }
  function restore(code: any) { E.typed = code; E.M = load(code); clampSel(); draw(); renderProps(); updateTools(); }
  const at = (r: any, c: any) => (E.M.rows[r] && E.M.rows[r][c]) || null;
  function clampSel() {
    const s = E.sel;
    if (!s) return;
    const R = nR(E.M), C = nC(E.M);
    if (!R || !C) { E.sel = null; return; }
    const f = (v: any, n: any) => Math.max(0, Math.min(n - 1, v));
    E.sel = { r1: f(s.r1, R), c1: f(s.c1, C), r2: f(s.r2, R), c2: f(s.c2, C) };
  }
  const selBox = () => { const s = E.sel; return s && { r1: Math.min(s.r1, s.r2), r2: Math.max(s.r1, s.r2), c1: Math.min(s.c1, s.c2), c2: Math.max(s.c1, s.c2) }; };
  const single = () => { const b = selBox(); return b && b.r1 === b.r2 && b.c1 === b.c2 ? b : null; };
  // a gate over several wires (a gate[n], a swap gate, a permutation over as many wires as its order lists): its own
  // cell owns the cells under it, so a click there picks the gate
  const spanAt = (r: any, c: any) => {
    const x = at(r, c), m = x && !x.opaque && mainOf(x);
    if (!m) return 1;
    if (m.name === 'permute') return Math.max(1, String(m.a[0] || '').split(',').filter((v) => parseInt(v, 10) > 0).length);
    return SPANS.has(m.name) ? spanOf(m) : 1;
  };
  // the tall gate over row r of column c (its top cell), if any
  function tallOver(r: any, c: any) {
    for (let rr = r; rr >= 0; rr--) { const n = spanAt(rr, c); if (n > 1 && rr + n - 1 >= r) return { r: rr, c }; }
    return null;
  }
  function owner(r: any, c: any) {
    for (let rr = r - 1; rr >= 0; rr--) if (rr + spanAt(rr, c) - 1 >= r) return { r: rr, c };
    return { r, c };
  }
  // the box drawn round a selection: grown down to the last wire of any tall gate in it
  function shownBox(b: any) {
    let r2_ = b.r2;
    for (let c = b.c1; c <= b.c2; c++) for (let r = b.r1; r <= b.r2; r++) r2_ = Math.max(r2_, r + spanAt(r, c) - 1);
    return { ...b, r2: Math.min(r2_, nR(E.M) - 1) };
  }
  // a cell with nothing but its wire (\qw, \cw): free for a tall gate to cover
  const wireOnly = (x: any) => !x || (!x.opaque && x.items.every((it: any) => it.name === 'qw' || it.name === 'cw') && (x.items.length > 0 || !x.text.trim()));
  // the cells a tall gate covers hold nothing: their wire is under the gate
  function clearUnder(r: any, c: any) {
    const n = spanAt(r, c);
    for (let i = 1; i < n; i++) { const x = at(r + i, c); if (x && (x.text || x.items.length) && wireOnly(x)) Object.assign(x, emptyCell()); }
  }

  // ---------------------------------------------------------------- placing
  // the wires a palette element takes, from its top one
  const itemRows = (key: any) => Math.max(...ITEM[key].cells.map((x: any) => x[0])) + 1;
  // a palette element can't go over any part of a tall gate: not an element of its own (a gate, a control, a label),
  // nor a wire a tall element covers. Each wire of a CNOT or a SWAP keeps its own element, which one placed on it
  // replaces; only what decorates a wire (Classical from here, Wire down) goes on a tall gate's cell
  function blocked(key: any, r: any, c: any) {
    return ITEM[key].cells.some(([dr, code]: any) => (!code || Q.cell(code, () => {}).some((x: any) => MAIN.has(x.name))) && tallOver(r + dr, c));
  }
  const coveredTip = () => setTip(t('editor.qc.tip.covered', 'A gate over several wires is there: place it on a free wire, or delete that gate first.'));
  // put a palette element with its top cell at (r, c); returns false when nothing changed
  function place(key: any, r: any, c: any) {
    const it = ITEM[key], M = E.M;
    const rows = Math.max(...it.cells.map((x: any) => x[0])) + 1;
    ensure(M, r + rows, c + 1);
    for (const [dr, code] of it.cells) {
      const cell = M.rows[r + dr][c];
      if (!code) { if (mainOf(cell)) setItems(cell, cell.items.filter((x: any) => !MAIN.has(x.name))); continue; }
      const add = Q.cell(code, () => {});
      const base = cell.opaque ? [] : cell.items;
      if (add.some((x: any) => MAIN.has(x.name))) setItems(cell, [...add, ...base.filter((x: any) => !MAIN.has(x.name))]);
      else setItems(cell, [...base.filter((x: any) => !add.some((y: any) => y.name === x.name || (verticalWire(x) && verticalWire(y)))), ...add]);
    }
    if (it.cells.length === 1) link(r, c);
    return true;
  }
  // a lone control finds the nearest element in its column; a new element picks up the column's lone controls
  function link(r: any, c: any) {
    const M = E.M, cell = M.rows[r][c], m = mainOf(cell);
    if (!m) return;
    const kinds = (x: any) => x && !['lstick', 'rstick', 'push', 'midstick', 'qwbundle', 'ground', 'trash', 'permute', 'makeebit', 'phantomgate', 'hphantomgate', 'linethrough', 'inputD'].includes(x.name);
    if ((m.name === 'ctrl' || m.name === 'octrl' || m.name === 'swap') && !intArg(m.a[0])) {
      let best = null;
      for (let i = 0; i < nR(M); i++) {
        if (i === r) continue;
        const o = mainOf(M.rows[i][c]);
        if (!kinds(o) || (m.name === 'swap' && o.name !== 'targX')) continue;
        if (best == null || Math.abs(i - r) < Math.abs(best - r)) best = i;
      }
      if (best != null) m.a[0] = String(best - r);
    } else if (kinds(m) && !LINKS.has(m.name)) {
      for (let i = 0; i < nR(M); i++) {
        const o = mainOf(M.rows[i][c]);
        if (i === r || !o || intArg(o.a[0])) continue;
        if (((o.name === 'ctrl' || o.name === 'octrl') && m.name !== 'targX') || (o.name === 'swap' && m.name === 'targX')) { o.a[0] = String(r - i); M.rows[i][c].dirty = true; }
      }
    }
  }
  // move (or copy) a cell's contents; within a column, links keep pointing at the same wires
  // the rows of column c tied to row r by vertical links (a swap and its end, a control and its target)
  function linkGroup(r: any, c: any) {
    const M = E.M, rows = new Set([r]), target = (i: any) => {
      const cell = M.rows[i] && M.rows[i][c];
      if (!cell || cell.opaque) return [];
      return cell.items.filter((it: any) => LINKS.has(it.name) && intArg(it.a[0])).map((it: any) => i + intArg(it.a[0]));
    };
    for (let grew = true; grew;) {
      grew = false;
      for (let i = 0; i < nR(M); i++) {
        const ts = target(i).filter((t: any) => t >= 0 && t < nR(M));
        if (rows.has(i)) { for (const t of ts) if (!rows.has(t)) { rows.add(t); grew = true; } }
        else if (ts.some((t: any) => rows.has(t))) { rows.add(i); grew = true; }
      }
    }
    return [...rows].sort((a, b) => a - b);
  }
  function moveCell(r1: any, c1: any, r2: any, c2: any, copy?: any) {
    const M = E.M;
    // into another step: a linked group (swap and its end, controls and their target) moves as one,
    // when the cells it lands on are free
    if (c1 !== c2) {
      const g = linkGroup(r1, c1), dr = r2 - r1;
      if (g.length > 1 && g[0] + dr >= 0) {
        ensure(M, g[g.length - 1] + dr + 1, c2 + 1);
        if (g.every((i) => wireOnly(M.rows[i + dr][c2]))) {
          for (const i of g) {
            M.rows[i + dr][c2] = JSON.parse(JSON.stringify(M.rows[i][c1]));
            if (!copy) M.rows[i][c1] = emptyCell();
          }
          return;
        }
      }
    }
    ensure(M, r2 + spanAt(r1, c1), c2 + 1);
    const src = M.rows[r1][c1], dst = M.rows[r2][c2];
    const moved = JSON.parse(JSON.stringify(src));
    const shift = (cell: any, from: any, to: any) => {
      if (cell.opaque || c1 !== c2) return;
      for (const it of cell.items) if (LINKS.has(it.name) && intArg(it.a[0])) { const n = intArg(it.a[0]) + from - to; it.a[0] = n ? String(n) : ''; cell.dirty = true; }
    };
    shift(moved, r1, r2);
    if (copy) { M.rows[r2][c2] = moved; return; }
    // swap places; the cell coming back is shifted too
    const back = JSON.parse(JSON.stringify(dst));
    shift(back, r2, r1);
    M.rows[r2][c2] = moved; M.rows[r1][c1] = back;
    // controls elsewhere in the column follow a moved target
    if (c1 === c2) for (let i = 0; i < nR(M); i++) {
      if (i === r1 || i === r2) continue;
      const cell = M.rows[i][c1];
      if (cell.opaque) continue;
      for (const it of cell.items) {
        if (!LINKS.has(it.name) || !intArg(it.a[0])) continue;
        const t = i + intArg(it.a[0]);
        if (t === r1 && mainOf(moved)) { it.a[0] = String(r2 - i); cell.dirty = true; }
        else if (t === r2 && mainOf(back)) { it.a[0] = String(r1 - i); cell.dirty = true; }
      }
    }
  }
  function clearSel() {
    const b = selBox();
    if (!b) return;
    edit(() => { for (let r = b.r1; r <= b.r2; r++) for (let c = b.c1; c <= b.c2; c++) { const cell = at(r, c); if (cell && (cell.text || cell.items.length)) setItems(cell, []); } });
  }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([title, items]: any) => ({
      id: title, title: catName(title),
      // the shown name, the English one, its cells' names and the category's find it; one scale for every drawing,
      // so wires and gates keep the same weight, and wide ones shrink to fit
      items: items.map(([k, name, cells, key]: any) => ({ id: k, label: say(name), key, alt: name, keywords: `${cells.map((c: any) => c[1]).join(' ')} ${title} ${catName(title)}`, svg: fitMini(TD.qcMini(miniSrc(ITEM[k]), 1e3, 'var(--qe-paper)'), 64, 44, 1.5) })),
    })), { armed: E?.arm });
  }
  // click: into the selected cell (then step right), or arm it for clicking cells; drag: drop on a cell
  paletteDrag(list, {
    pick: choose,
    move: (d, e) => { E.hover = overStage(e) ? cellAt(e) : null; E.ghost = { k: d.k, e: pos(e) }; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      const h = overStage(e) && cellAt(e);
      if (h && blocked(d.k, h.r, h.c)) coveredTip();
      else if (h) { edit(() => place(d.k, h.r, h.c)); E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; renderProps(); }
      E.hover = null; draw();
    },
  });
  const GROUPING = new Set(['group', 'glabel']);
  function choose(k: any) {
    // Group / Label above with cells selected: one sized to the selection
    const b = selBox();
    if (GROUPING.has(k) && b && !E.arm && b.r2 < nR(E.M) && b.c2 < nC(E.M)) { addGroup(b, k === 'glabel'); return; }
    const s = single();
    if (s && !E.arm) { put(k, s.r1, s.c1, true); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? (GROUPING.has(k) ? t('editor.qc.tip.armGroup', '{name}: drag across the cells it should cover. Esc when done.', { name: say(ITEM[k].name) }) : t('editor.qc.tip.arm', '{name}: click a cell to place it. Esc when done.', { name: say(ITEM[k].name) })) : '');
  }
  function put(k: any, r: any, c: any, step: any) {
    if (blocked(k, r, c)) { coveredTip(); return; }
    edit(() => place(k, r, c));
    if (step) { ensure(E.M, r + 1, c + 2); E.sel = { r1: r, c1: c + 1, r2: r, c2: c + 1 }; }
    else E.sel = { r1: r, c1: c, r2: r, c2: c };
    draw(); renderProps();
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // The circuit in the renderer's px, cell edges halfway between columns / rows; one more step
  // and one more wire past the end take drops that grow the circuit.
  function geom() {
    const s = { type: 'qc', x: 0, y: 0, src: snap(), size: E.st.size, font: E.st.font, color: INK };
    const L = Q.layout(s), R = nR(E.M), C = nC(E.M);
    const pitch = 0.6 * TD.PX_PER_CM, xs: any[] = [], ys: any[] = [];
    // nothing yet: one start cell, a drop or click there makes the first wire and step
    if (!R || !C) {
      const z = 1.2 * TD.PX_PER_CM, ex = [0, z], ey = [0, z];
      return { s, L: { ...L, bb: { x: 0, y: 0, w: z, h: z } }, xs: ex, ys: ey, R: 0, C: 0, empty: true, cx: () => z / 2, cy: () => z / 2 };
    }
    if (L.R && L.C) {
      const g = L.geo, colR = (c: any) => g.colL[c] + g.colW[c], rowB = (r: any) => g.rowT[r] + g.rowH[r];
      for (let c = 0; c < L.C; c++) xs.push(c ? (colR(c - 1) + g.colL[c]) / 2 : g.colL[0] - g.cs / 2);
      xs.push(colR(L.C - 1) + g.cs / 2);
      for (let r = 0; r < L.R; r++) ys.push(r ? (rowB(r - 1) + g.rowT[r]) / 2 : g.rowT[0] - g.rs / 2);
      ys.push(rowB(L.R - 1) + g.rs / 2);
      xs[0] = Math.min(xs[0], L.bb.x - 4);
    } else { xs.push(0); ys.push(0); }
    while (xs.length < C + 1) xs.push(xs[xs.length - 1] + pitch);
    while (ys.length < R + 1) ys.push(ys[ys.length - 1] + pitch);
    xs.push(xs[xs.length - 1] + pitch); ys.push(ys[ys.length - 1] + pitch);
    const cx = (c: any) => (xs[c] + xs[c + 1]) / 2, cy = (r: any) => (L.R && L.geo && r < L.R ? L.geo.cy[r] : (ys[r] + ys[r + 1]) / 2);
    return { s, L, xs, ys, R, C, cx, cy };
  }
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [0.4, 6], redraw: () => { draw(); }, beforeWheel: () => { E.fitted = false; } });
  const toL = (e: any) => { const [x, y] = pos(e), v = E.view; return [(x - v.ox) / v.k, (y - v.oy) / v.k]; };
  // the cell under the pointer (r == R or c == C: the growing edge), or null
  // the cell a click picks: a covered cell gives the tall gate over it
  // is the pointer on the element drawn in this cell (its box, plus 6 screen px)? A drag from there moves the
  // element; a drag from the rest of the cell selects a range of cells. Gates use their drawn box (all their wires);
  // other elements a small square on the wire; sticks hang off the cell, so their whole cell counts.
  function onElement(e: any, h: any) {
    const cell = at(h.r, h.c), G = E.G;
    if (!cell || !G || G.empty) return false;
    if (cell.opaque) return true;
    const m = mainOf(cell);
    if (!m) return false;
    if (m.name === 'lstick' || m.name === 'rstick') return true;
    const [x, y] = toL(e), tol = 5 / E.view.k;
    const o = m.name === 'gate' && G.L.ops && G.L.ops.find((q: any) => q.gate && q.gate[0] === h.r && q.gate[1] === h.c);
    // half the drawn size, in cm: control dots are 0.12cm across, targets and swaps about 0.35cm, meters 2em × 1.5em
    const DOT: Record<string, any> = { ctrl: 0.1, octrl: 0.1, control: 0.1, ocontrol: 0.1, phase: 0.1, targ: 0.18, targX: 0.18, swap: 0.12, ground: 0.18, trash: 0.18 };
    const half = (DOT[m.name] || 0.3) * TD.PX_PER_CM;
    const b = o ? { x1: o.x, y1: o.y, x2: o.x + o.w, y2: o.y + o.h } : { x1: G.cx(h.c) - half, y1: G.cy(h.r) - half, x2: G.cx(h.c) + half, y2: G.cy(h.r) + half };
    return x >= b.x1 - tol && x <= b.x2 + tol && y >= b.y1 - tol && y <= b.y2 + tol;
  }
  function pick(e: any) { const h = cellAt(e); return h && h.r < nR(E.M) && h.c < nC(E.M) ? owner(h.r, h.c) : h; }
  function cellAt(e: any) {
    const G = E.G || (E.G = geom()), [x, y] = toL(e);
    const find = (a: any, v: any) => { for (let i = 0; i < a.length - 1; i++) if (v >= a[i] && v < a[i + 1]) return i; return -1; };
    const c = find(G.xs, x), r = find(G.ys, y);
    if (c < 0 || r < 0 || (!G.empty && r === G.R && c === G.C)) return null;
    return { r, c };
  }
  function fit() {
    if (!E) return;
    const G = geom(), r = rect();
    // the paper's edges, with room past them for the delete gutters
    const x1 = Math.min(G.xs[0], G.L.bb.x) - 16, x2 = Math.max(G.xs[G.xs.length - 1], G.L.bb.x + G.L.bb.w) + 10;
    const y1 = Math.min(G.ys[0], G.L.bb.y) - 24, y2 = Math.max(G.ys[G.ys.length - 1], G.L.bb.y + G.L.bb.h) + 10;
    E.view = fitView(r, { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }, { min: 0.6, max: 3 });
    E.fitted = true;
    draw();
  }

  // ---------------------------------------------------------------- drawing
  function draw() {
    if (!E) return;
    E.G = geom();
    if (syncSlices()) E.G = geom();
    syncCode();
    const G = E.G, r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    // emptied (every wire or step deleted): bring the start cell into the middle
    if (!!G.empty !== !!E.wasEmpty) { E.wasEmpty = G.empty; if (G.empty && r.width && E.fitted) { fit(); return; } }
    const X = (x: any) => r2(v.ox + x * k), Y = (y: any) => r2(v.oy + y * k);
    const { xs, ys, R, C } = G;
    // paper under the circuit, cell rules, then the circuit
    const px1 = Math.min(xs[0], G.L.bb.x) - 16, px2 = xs[xs.length - 1] + 8, py1 = Math.min(ys[0], G.L.bb.y) - 16, py2 = Math.max(ys[ys.length - 1], G.L.bb.y + G.L.bb.h) + 8;
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><rect class="qe-paper" x="${X(px1)}" y="${Y(py1)}" width="${r2((px2 - px1) * k)}" height="${r2((py2 - py1) * k)}"/>`;
    let rules = '';
    if (!G.empty) for (let c = 0; c <= C; c++) rules += `M${X(xs[c])},${Y(ys[0])}V${Y(ys[R])}`;
    if (!G.empty) for (let i = 0; i <= R; i++) rules += `M${X(xs[0])},${Y(ys[i])}H${X(xs[C])}`;
    out += `<path class="qe-rule" d="${rules}"/>`;
    const plus = (x: any, y: any) => `<path class="qe-plus" d="M${X(x) - 5},${Y(y)}h10M${X(x)},${Y(y) - 5}v10"/>`;
    if (G.empty) {
      out += `<rect class="qe-grow" x="${X(xs[0])}" y="${Y(ys[0])}" width="${r2((xs[1] - xs[0]) * k)}" height="${r2((ys[1] - ys[0]) * k)}"/>` + plus((xs[0] + xs[1]) / 2, (ys[0] + ys[1]) / 2);
    } else {
    // the growing edges: one more step, one more wire
    out += `<rect class="qe-grow" x="${X(xs[C])}" y="${Y(ys[0])}" width="${r2((xs[C + 1] - xs[C]) * k)}" height="${r2((ys[R] - ys[0]) * k)}"/>`;
    out += `<rect class="qe-grow" x="${X(xs[0])}" y="${Y(ys[R])}" width="${r2((xs[C] - xs[0]) * k)}" height="${r2((ys[R + 1] - ys[R]) * k)}"/>`;
    out += plus((xs[C] + xs[C + 1]) / 2, (ys[0] + ys[R]) / 2) + plus((xs[0] + xs[C]) / 2, (ys[R] + ys[R + 1]) / 2);
    }
    out += `<g transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${k})">${R && C ? Q.draw({ ...G.s, x: G.L.bb.x, y: G.L.bb.y }, { paper: PAPER, export: true }) : ''}</g>`;
    // a group whose border isn't drawn (draw=none, a label above): its box outlined here only, never exported
    if (!G.empty && G.L.groups) for (const g of G.L.groups) if (g.bare) out += `<rect class="qe-gbare" x="${X(g.x)}" y="${Y(g.y)}" width="${r2(g.w * k)}" height="${r2(g.h * k)}" rx="${r2(g.rx * k)}"/>`;
    if (G.empty) out += `<text class="qe-empty" x="${X((xs[0] + xs[1]) / 2)}" y="${Y(ys[0]) - 14}">${esc(t('editor.qc.empty', 'Drop or click an element to start'))}</text>`;
    const box = (r1: any, c1: any, r2_?: any, c2?: any, cls?: any) => `<rect class="${cls}" x="${X(xs[c1])}" y="${Y(ys[r1])}" width="${r2((xs[c2 + 1] - xs[c1]) * k)}" height="${r2((ys[r2_ + 1] - ys[r1]) * k)}"/>`;
    const h = E.hover;
    if (h) {
      // the growing row / column light up whole: a drop there adds a wire / a step
      // placing a palette element: the wires it will take (a two-wire gate lights up two), nothing where it can't go
      const key = !G.empty && (E.ghost ? E.ghost.k : E.arm && !GROUPING.has(E.arm) ? E.arm : null);
      const no = key && h.r <= R && h.c < C && blocked(key, h.r, h.c);
      const tall = key && h.r < R && h.c < C ? Math.min(R - 1, h.r + itemRows(key) - 1) : h.r + spanAt(h.r, h.c) - 1;
      const hb = G.empty ? [0, 0, 0, 0] : h.r === R ? [R, 0, R, C - 1] : h.c === C ? [0, C, R - 1, C] : [h.r, h.c, Math.max(h.r, tall), h.c];
      if (no) { /* over a tall gate: nothing lights up */ }
      else if (G.empty || R && C || h.r < R || h.c < C) {
        if (E.arm || E.ghost || (E.drag && E.drag.mode === 'move' && E.drag.moved)) out += box(...(hb as [any, any, any, any]), 'qe-target');
        else if (!E.drag) out += box(...(hb as [any, any, any, any]), 'qe-hover');
      }
    }
    const b = selBox() && shownBox(selBox());
    if (b) out += box(b.r1, b.c1, b.r2, b.c2, 'qe-sel');
    // a selected control's link: a blue knob at the wire it reaches; drag it to another wire
    const s = single(), m = s && at(s.r1, s.c1) && mainOf(at(s.r1, s.c1));
    if (m && LINKS.has(m.name) && !(E.drag && E.drag.mode === 'move')) {
      const n = E.drag && E.drag.mode === 'link' ? E.drag.n : intArg(m.a[0]), x = X(G.cx(s.c1)), y = Y(G.cy(s.r1 + n));
      if (n) out += `<path class="qe-link" d="M${x},${Y(G.cy(s.r1))}V${y}"/>`;
      out += `<circle class="qe-knob" cx="${x}" cy="${n ? y : r2(Y(G.cy(s.r1)) + 16)}" r="5"/>`;
    }
    // the selected cell's group: a bar on each edge, dragged to another wire or step to resize it (under a selected gate's own handles)
    const hg = !(E.drag && E.drag.mode === 'move') && handleGroup();
    if (hg) {
      const g = hg.g, x1 = X(g.x), y1 = Y(g.y), x2 = X(g.x + g.w), y2 = Y(g.y + g.h), mx = r2((x1 + x2) / 2), my = r2((y1 + y2) / 2);
      out += `<rect class="qe-gedge" data-e="t" x="${r2(mx - 8)}" y="${r2(y1 - 3)}" width="16" height="6" rx="2"/><rect class="qe-gedge" data-e="b" x="${r2(mx - 8)}" y="${r2(y2 - 3)}" width="16" height="6" rx="2"/>`;
      out += `<rect class="qe-gedge" data-e="l" x="${r2(x1 - 3)}" y="${r2(my - 8)}" width="6" height="16" rx="2"/><rect class="qe-gedge" data-e="r" x="${r2(x2 - 3)}" y="${r2(my - 8)}" width="6" height="16" rx="2"/>`;
    }
    // a selected gate: a red-pen handle on its lower right corner sets its minimum width / height
    const gb = !(E.drag && E.drag.mode === 'move') && gateBox();
    if (gb) {
      const x1 = X(gb.x), y1 = Y(gb.y), x2 = X(gb.x + gb.w), y2 = Y(gb.y + gb.h);
      out += `<rect class="qe-gbox" x="${x1}" y="${y1}" width="${r2(x2 - x1)}" height="${r2(y2 - y1)}"/>`;
      // bars on the top and bottom edges: drag to reach up to earlier wires or down to later ones
      const bx = r2((x1 + x2) / 2 - 8);
      if (!gb.fixedSpan) out += `<rect class="qe-span" data-e="t" x="${bx}" y="${r2(y1 - 3)}" width="16" height="6" rx="2"/><rect class="qe-span" data-e="b" x="${bx}" y="${r2(y2 - 3)}" width="16" height="6" rx="2"/>`;
      out += `<rect class="qe-size" x="${r2(x2 - 4)}" y="${r2(y2 - 4)}" width="8" height="8"/>`;
    }
    // the delete gutters left of the wires and above the steps
    E.gut = !E.drag && !E.arm && !E.ghost && R && C ? { sx: xs.map(X), sy: ys.map(Y), R, C, left: X(px1), top: Y(py1) } : null;
    out += TD.gridDel.svg(E.gut, E.del, E.del ? null : E.near, [t('editor.qc.deleteWireN', 'Delete wire {n}'), t('editor.qc.deleteStepN', 'Delete step {n}')]);
    // what is being dragged, under the pointer
    const dragKey = E.ghost && E.ghost.k, mv = E.drag && E.drag.mode === 'move' && E.drag.moved;
    if (dragKey || mv) {
      const [gx, gy] = dragKey ? E.ghost.e : E.drag.e;
      let preview;
      if (mv) {
        // Crop the actual circuit drawing, preserving its spacing, size and style.
        // Linked controls/targets and all wires of a tall gate travel in the preview.
        const d = E.drag, rows = linkGroup(d.r, d.c);
        const first = Math.min(d.r, ...rows), last = Math.min(R - 1, Math.max(d.r + spanAt(d.r, d.c) - 1, ...rows));
        let x = G.xs[d.c], y = G.ys[first], right = G.xs[d.c + 1], bottom = G.ys[last + 1];
        const gate = G.L.ops.find((o: any) => o.gate && o.gate[0] === d.r && o.gate[1] === d.c);
        if (gate) { x = Math.min(x, gate.x - 2); y = Math.min(y, gate.y - 2); right = Math.max(right, gate.x + gate.w + 2); bottom = Math.max(bottom, gate.y + gate.h + 2); }
        const w = right - x, h = bottom - y;
        preview = `<svg class="qe-drag-preview" width="${r2(w * k)}" height="${r2(h * k)}" viewBox="${r2(x)} ${r2(y)} ${r2(w)} ${r2(h)}">${Q.draw({ ...G.s, x: G.L.bb.x, y: G.L.bb.y }, { paper: PAPER, export: true })}</svg>`;
      } else {
        const s = { ...G.s, src: miniSrc(ITEM[dragKey]) }, L = Q.layout(s);
        preview = `<svg class="qe-drag-preview" width="${r2(L.bb.w * k)}" height="${r2(L.bb.h * k)}" viewBox="0 0 ${r2(L.bb.w)} ${r2(L.bb.h)}">${Q.draw({ ...s, x: 0, y: 0 }, { paper: PAPER, export: true })}</svg>`;
      }
      out += `<g class="qe-ghost" transform="translate(${gx + 12},${gy + 12})">${preview}</g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
  }

  // the selected cell's gate box, in layout px (one-wire gates only: taller ones follow their wires)
  function gateBox() {
    const s = single(), G = E.G;
    if (!s || !G || !G.L.ops) return null;
    const m = at(s.r1, s.c1) && !at(s.r1, s.c1).opaque && mainOf(at(s.r1, s.c1));
    if (!m || m.name !== 'gate') return null;
    const o = G.L.ops.find((o: any) => o.gate && o.gate[0] === s.r1 && o.gate[1] === s.c1);
    if (!o) return null;
    return { x: o.x, y: o.y, w: o.w, h: o.h, fit: o.fit, multi: spanOf(m) > 1, fixedSpan: isSwapGate(m, Q.opts) };
  }
  // ---------------------------------------------------------------- pointer
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    // a double-click is detected here: a redraw between the clicks may replace the target, so a native dblclick can't be relied on
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    const dz = e.button === 0 && !E.space && TD.gridDel.at(E.gut, sx, sy);
    if (dz) { delLine(dz); return; }
    if (dbl && !e.target.closest('.qe-size, .qe-knob, .qe-span') && onDouble(e)) return;
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    if (e.target.closest('.qe-size')) {
      const s = single(), gb = gateBox();
      const [x0, y0] = toL(e);
      begin(); E.drag = { mode: 'size', r: s.r1, c: s.c1, x0, y0, w0: gb!.w, h0: gb!.h, fit: gb!.fit, multi: gb!.multi };
      return;
    }
    if (e.target.closest('.qe-span')) {
      const s = single(), m = mainOf(at(s.r1, s.c1));
      begin(); E.drag = { mode: 'span', c: s.c1, top: s.r1, bot: s.r1 + spanOf(m) - 1, edge: e.target.closest('.qe-span').dataset.e };
      return;
    }
    if (e.target.closest('.qe-gedge')) {
      const hg = handleGroup();
      if (hg) { begin(); E.gpin = hg.it; E.drag = { mode: 'gedge', edge: e.target.closest('.qe-gedge').dataset.e, it: hg.it, b: { r1: hg.g.r, c1: hg.g.c, r2: hg.g.r2, c2: hg.g.c2 } }; return; }
    }
    if (e.target.closest('.qe-knob')) { const s = single(); begin(); E.drag = { mode: 'link', r: s.r1, c: s.c1, n: intArg(mainOf(at(s.r1, s.c1)).a[0]) }; return; }
    // a click on a slice's or a group's label selects the cell that writes it (it may sit over the add-a-wire strip)
    const lt = !E.arm && titleAt(e);
    if (lt) { E.sel = { r1: lt.o.lab.r, c1: lt.o.lab.c, r2: lt.o.lab.r, c2: lt.o.lab.c }; draw(); renderProps(); return; }
    const h = E.arm ? cellAt(e) : pick(e);
    if (!h) { E.sel = null; draw(); renderProps(); return; }
    // an armed Group / Label above: drag across the cells it should cover (a click covers one)
    if (E.arm && GROUPING.has(E.arm) && h.r < nR(E.M) && h.c < nC(E.M)) { E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; E.drag = { mode: 'range', r: h.r, c: h.c, group: E.arm }; draw(); renderProps(); return; }
    if (E.arm) { put(E.arm, h.r, h.c, false); return; }
    if (h.r >= nR(E.M) || h.c >= nC(E.M)) { edit(() => ensure(E.M, h.r + 1, h.c + 1)); E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; draw(); renderProps(); return; }
    if (e.shiftKey && E.sel) { E.sel.r2 = h.r; E.sel.c2 = h.c; draw(); renderProps(); return; }
    E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c };
    const cell = at(h.r, h.c);
    E.drag = cell && (cell.text || cell.items.length) && onElement(e, h) ? { mode: 'move', r: h.r, c: h.c, sx, sy, e: [sx, sy], moved: false } : { mode: 'range', r: h.r, c: h.c };
    draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const dz = TD.gridDel.at(E.gut, sx, sy), h = dz ? null : E.arm ? cellAt(e) : pick(e);
      svg.style.cursor = dz ? 'pointer' : h && E.arm && !GROUPING.has(E.arm) && h.r < nR(E.M) && h.c < nC(E.M) && blocked(E.arm, h.r, h.c) ? 'not-allowed' : h && !E.arm && h.r < nR(E.M) && h.c < nC(E.M) && onElement(e, h) ? 'move' : '';
      const nr = dz ? null : TD.gridDel.near(E.gut, sx, sy);
      if (JSON.stringify(h) !== JSON.stringify(E.hover) || JSON.stringify(dz) !== JSON.stringify(E.del) || JSON.stringify(nr) !== JSON.stringify(E.near)) { E.hover = h; E.del = dz; E.near = nr; draw(); }
      return;
    }
    if (d.mode === 'pan') { E.fitted = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return; }
    if (d.mode === 'size') {
      const [x, y] = toL(e), PX = TD.PX_PER_CM, snap = (v: any) => Math.round(v * 20) / 20;
      // the handle is the lower right corner: right / down grows the gate, left / up shrinks it. The column's
      // left edge and the wire's top stay put, so the corner moves by the whole change in size.
      const w = d.w0 + (x - d.x0), h = d.h0 + (y - d.y0);
      const cell = at(d.r, d.c), m = mainOf(cell);
      // back at (or below) the fitted size: auto again
      const wcm = w <= d.fit[0] + 2 ? 0 : snap(w / PX), hcm = d.multi ? gateSize(m).h : h <= d.fit[1] + 2 ? 0 : snap(h / PX);
      setGateSize(m, wcm, hcm); cell.dirty = true;
      setTip(t('editor.qc.tip.size', 'Min width {w} · min height {h}', { w: wcm ? wcm + ' cm' : t('editor.qc.auto', 'auto'), h: hcm ? hcm + ' cm' : t('editor.qc.auto', 'auto') }));
      draw();
      // the panel follows live: size fields and the cell's code
      const gw = $('[data-f="gw"]', props), gh = $('[data-f="gh"]', props), cf = $('[data-f="code"]', props);
      if (gw) gw.value = wcm || ''; if (gh) gh.value = hcm || ''; if (cf) cf.value = cellText(cell);
      return;
    }
    if (d.mode === 'gedge') {
      // the edge follows the pointer to a wire or step, never past the opposite edge; the group's code moves to its top left cell
      const h = cellAt(e);
      if (!h) return;
      const R = nR(E.M), C = nC(E.M), hr = Math.max(0, Math.min(R - 1, h.r)), hc = Math.max(0, Math.min(C - 1, h.c)), b = { ...d.b };
      if (d.edge === 't') b.r1 = Math.min(hr, b.r2); else if (d.edge === 'b') b.r2 = Math.max(hr, b.r1);
      else if (d.edge === 'l') b.c1 = Math.min(hc, b.c2); else b.c2 = Math.max(hc, b.c1);
      if (b.r1 === d.b.r1 && b.c1 === d.b.c1 && b.r2 === d.b.r2 && b.c2 === d.b.c2) return;
      const from = at(d.b.r1, d.b.c1), to = at(b.r1, b.c1);
      if (to !== from) {
        if (!to || to.opaque) { setTip(t('editor.qc.tip.rawCell', "That cell is written as raw code: a group can't start there")); return; }
        setItems(from, from.items.filter((q: any) => q !== d.it)); setItems(to, [...to.items, d.it]);
      }
      setGroupDims(d.it, b.r2 - b.r1 + 1, b.c2 - b.c1 + 1); to.dirty = true;
      d.b = b;
      const k = single();
      if (!k || k.r1 < b.r1 || k.r1 > b.r2 || k.c1 < b.c1 || k.c1 > b.c2) E.sel = { r1: b.r1, c1: b.c1, r2: b.r1, c2: b.c1 };
      setTip(`${t('editor.qc.group', 'Group')} · ${wiresText(b.r2 - b.r1 + 1)} × ${stepsText(b.c2 - b.c1 + 1)}`);
      draw();
      return;
    }
    if (d.mode === 'span') {
      // the nearest wire to the pointer, as far as the column stays empty: a gate never covers another element
      const [, y] = toL(e), G = E.G, R = nR(E.M), c = d.c;
      let wire = 0, dist = Infinity;
      for (let i = 0; i < G.R; i++) { const dd = Math.abs(G.cy(i) - y); if (dd < dist) { dist = dd; wire = i; } }
      if (d.edge === 'b' && y > G.cy(R - 1)) {
        const pitch = R > 1 ? G.cy(R - 1) - G.cy(R - 2) : G.ys[1] - G.ys[0];
        wire = R - 1 + Math.max(0, Math.round((y - G.cy(R - 1)) / Math.max(1, pitch)));
      }
      // a cell with nothing but its wire (\qw, \cw) is free: the gate is drawn over it
      const free = (r: any) => wireOnly(at(r, c));
      if (d.edge === 'b') {
        const lim = d.top + boundedSpan(d.top, wire - d.top + 1, d.bot - d.top + 1, Math.max(R, wire + 1), free) - 1;
        d.bot = Math.max(d.top, Math.min(wire, lim));
        ensure(E.M, d.bot + 1, c + 1);
      } else {
        let lim = d.top; while (lim - 1 >= 0 && free(lim - 1)) lim--;
        const top = Math.max(lim, Math.min(wire, d.bot));
        if (top !== d.top) { moveCell(d.top, c, top, c); d.top = top; E.sel = { r1: top, c1: c, r2: top, c2: c }; }
      }
      const cell = at(d.top, c), m = mainOf(cell);
      setSpan(m, d.bot - d.top + 1); cell.dirty = true;
      setTip(d.bot > d.top ? t('editor.qc.tip.wires', 'Wires {from}–{to}', { from: d.top + 1, to: d.bot + 1 }) : t('editor.qc.tip.wire', 'Wire {n}', { n: d.top + 1 }));
      draw();
      const sf = $('[data-f="span"]', props), cf = $('[data-f="code"]', props);
      if (sf) sf.value = d.bot - d.top + 1; if (cf) cf.value = cellText(cell);
      return;
    }
    if (d.mode === 'link') {
      const [, y] = toL(e), G = E.G;
      let best = d.r, dist = Infinity;
      for (let i = 0; i < G.R; i++) { const dd = Math.abs(G.cy(i) - y); if (dd < dist) { dist = dd; best = i; } }
      d.n = best - d.r; draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true; d.e = [sx, sy]; E.hover = cellAt(e); draw(); return;
    }
    if (d.mode === 'range') { const h = pick(e); if (h && h.r < nR(E.M) && h.c < nC(E.M)) { E.sel.r2 = h.r; E.sel.c2 = h.c; draw(); renderProps(); } }
  });
  svg.addEventListener('pointerup', (e: any) => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'range' && d.group) { addGroup(selBox(), d.group === 'glabel'); return; }
    if (d.mode === 'span') clearUnder(d.top, d.c);
    if (d.mode === 'size' || d.mode === 'span' || d.mode === 'gedge') { setTip(''); commit(); draw(); keepInView(); renderProps(); return; }
    if (d.mode === 'link') { const m = mainOf(at(d.r, d.c)); m.a[0] = d.n ? String(d.n) : ''; at(d.r, d.c).dirty = true; commit(); draw(); renderProps(); return; }
    if (d.mode === 'move' && d.moved) {
      const h = cellAt(e);
      if (h && (h.r !== d.r || h.c !== d.c)) { edit(() => moveCell(d.r, d.c, h.r, h.c, e.altKey)); E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c }; }
      E.hover = null; draw(); renderProps(); return;
    }
    draw();
  });
  // right-click: wires and steps, around the cell (or range) under the pointer
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { above: 'rowAbove', below: 'rowBelow', before: 'colBefore', after: 'colAfter', rowdel: 'rowDelete', coldel: 'colDelete', clear: 'clear', left: 'moveLeft', right: 'moveRight', group: 'group', glabel: 'labelAbove', glabelbelow: 'labelBelow', gdel: 'groupDelete' };
  // the groups whose box covers a cell: [{ r, c, i, it }]
  function groupsAt(r: any, c: any) {
    const out: any[] = [];
    E.M.rows.forEach((row: any, r0: any) => row.forEach((cell: any, c0: any) => {
      if (cell.opaque) return;
      cell.items.forEach((it: any, i: any) => {
        if (it.name !== 'gategroup') return;
        const d = groupDims(it);
        if (r >= r0 && r < r0 + d.wires && c >= c0 && c < c0 + d.steps) out.push({ r: r0, c: c0, i, it });
      });
    }));
    return out;
  }
  // the group whose edge handles show: with one cell selected, the group last resized if it covers the cell, else the
  // smallest group that does. { g (layout box), it (the item), r, c }
  function handleGroup() {
    const s = single(), G = E.G;
    if (!s || !G || G.empty || !G.L.groups) return null;
    const item = (g: any) => { const cell = at(g.r, g.c); return cell && !cell.opaque ? cell.items.filter((q: any) => q.name === 'gategroup')[g.n] || null : null; };
    const cover = G.L.groups.filter((g: any) => s.r1 >= g.r && s.r1 <= g.r2 && s.c1 >= g.c && s.c1 <= g.c2).map((g: any) => ({ g, it: item(g) })).filter((x: any) => x.it);
    if (!cover.length) return null;
    return cover.find((x: any) => x.it === E.gpin) || cover.sort((p: any, q: any) => (p.g.r2 - p.g.r + 1) * (p.g.c2 - p.g.c + 1) - (q.g.r2 - q.g.r + 1) * (q.g.c2 - q.g.c + 1))[0];
  }
  // a group over the selection, framed or (label) with no border; selects its cell and puts the caret in its label.
  // A tall gate in the selection is covered whole: the group reaches down to its last wire
  function labelSide(selection: any): 'top' | 'bottom' {
    const s = shownBox(selection);
    if (s.r1 === 0) return 'top';
    if (s.r2 === nR(E.M) - 1) return 'bottom';
    const emptyAcross = (r: number) => {
      for (let c = s.c1; c <= s.c2; c++) {
        const o = owner(r, c);
        if (o.r !== r || !wireOnly(at(r, c)) || groupsAt(r, c).length) return false;
      }
      return true;
    };
    if (emptyAcross(s.r1 - 1)) return 'top';
    return emptyAcross(s.r2 + 1) ? 'bottom' : 'top';
  }
  function addGroup(s: any, label: any, side = 'top') {
    s = shownBox(s);
    const cell = at(s.r1, s.c1);
    if (!cell || cell.opaque) return;
    const w = s.r2 - s.r1 + 1, n = s.c2 - s.c1 + 1;
    const it = Q.cell(`\\gategroup[${w},steps=${n},style={${label ? 'draw=none' : 'dashed,rounded corners'}}]{${label ? 'label' : ''}}`, () => {})[0];
    if (label && side === 'bottom') setGroupMode(it, 'bottom', '');
    edit(() => setItems(cell, [...cell.items, it]));
    E.sel = { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c1 }; draw(); renderProps();
    const f = $(`[data-f="Gx${s.r1}_${s.c1}_${cell.items.indexOf(it)}"]`, props);
    if (f) { f.scrollIntoView({ block: 'nearest' }); f.focus({ preventScroll: true }); f.select(); }
  }
  const mItem = (act: string, label: string, ic: string, key?: string, off?: boolean) => menuRow(act, label, MI[ic], key, { disabled: !!off, danger: /^(rowdel|coldel|delete|gdel)/.test(act) });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const h = pick(e);
    if (!h || h.r >= nR(E.M) || h.c >= nC(E.M)) { closeMenu(); return; }
    const b = selBox() && shownBox(selBox());
    if (!b || h.r < b.r1 || h.r > b.r2 || h.c < b.c1 || h.c > b.c2) E.sel = { r1: h.r, c1: h.c, r2: h.r, c2: h.c };
    draw(); renderProps();
    const s = selBox(), nr = s.r2 - s.r1 + 1, nc = s.c2 - s.c1 + 1;
    menuRows = [mItem('rowabove', t('editor.qc.menu.wireAbove', 'Insert Wire Above'), 'above'), mItem('rowbelow', t('editor.qc.menu.wireBelow', 'Insert Wire Below'), 'below'), '-', mItem('colbefore', t('editor.qc.menu.stepBefore', 'Insert Step Before'), 'before'), mItem('colafter', t('editor.qc.menu.stepAfter', 'Insert Step After'), 'after'), '-', mItem('colleft', nc > 1 ? t('editor.qc.menu.moveLeftN', 'Move {n} Steps Left', { n: nc }) : t('editor.qc.menu.moveLeft', 'Move Step Left'), 'left', '', s.c1 === 0), mItem('colright', nc > 1 ? t('editor.qc.menu.moveRightN', 'Move {n} Steps Right', { n: nc }) : t('editor.qc.menu.moveRight', 'Move Step Right'), 'right', '', s.c2 >= nC(E.M) - 1), '-', mItem('rowdel', nr > 1 ? t('editor.qc.menu.deleteWiresN', 'Delete {n} Wires', { n: nr }) : t('editor.qc.menu.deleteWire', 'Delete Wire'), 'rowdel'), mItem('coldel', nc > 1 ? t('editor.qc.menu.deleteStepsN', 'Delete {n} Steps', { n: nc }) : t('editor.qc.menu.deleteStep', 'Delete Step'), 'coldel'), '-', mItem('delete', nr * nc > 1 ? t('editor.qc.menu.clearCells', 'Clear Cells') : t('editor.qc.menu.clearCell', 'Clear Cell'), 'clear', 'Del')];
    // groups: frame or label the selection; delete any group whose box covers the clicked cell
    const gb = shownBox(s), anchor = at(s.r1, s.c1), here = groupsAt(h.r, h.c), many = (gb.r2 - gb.r1 + 1) * nc > 1;
    const side = labelSide(gb);
    const gh: MenuEntry[] = [mItem('gadd', many ? t('editor.qc.menu.groupSel', 'Group Selection') : t('editor.qc.menu.groupCell', 'Group Cell'), 'group', '', !anchor || anchor.opaque),
      mItem(side === 'bottom' ? 'glabelbelow' : 'glabel', side === 'bottom' ? (many ? t('editor.qc.menu.labelBelowSel', 'Label Below Selection') : t('editor.qc.menu.labelBelow', 'Label Below')) : (many ? t('editor.qc.menu.labelAboveSel', 'Label Above Selection') : t('editor.qc.menu.labelAbove', 'Label Above')), side === 'bottom' ? 'glabelbelow' : 'glabel', '', !anchor || anchor.opaque)];
    here.forEach((g) => {
      const lb = (g.it.a[0] || '').trim(), name = lb ? `“${lb.length > 24 ? lb.slice(0, 23) + '…' : lb}”` : '';
      gh.push(mItem(`gdel:${g.r},${g.c},${g.i}`, here.length > 1 || name ? t('editor.qc.menu.deleteGroupNamed', 'Delete Group {name}', { name }).trim() : t('editor.qc.menu.deleteGroup', 'Delete Group'), 'gdel'));
    });
    // the group rows go in their own section, before Clear Cell
    menuRows.splice(menuRows.lastIndexOf('-'), 0, '-', ...gh);
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(q: string) {
    if (q === 'gadd' || q === 'glabel' || q === 'glabelbelow') { addGroup(selBox(), q !== 'gadd', q === 'glabelbelow' ? 'bottom' : 'top'); return; }
    if (q.startsWith('gdel:')) {
      const [r, c, i] = q.slice(5).split(',').map(Number), cell = at(r, c);
      if (cell) edit(() => setItems(cell, cell.items.filter((_: any, k: any) => k !== i)));
      return;
    }
    act(q);
  }
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.del || E.near)) { E.hover = null; E.del = null; E.near = null; draw(); } });
  // a click on a delete gutter: that wire or step goes, as one undo step
  function delLine(dz: any) {
    closeLabel(); E.del = null; E.hover = null; E.sel = null; svg.style.cursor = '';
    edit(() => (dz.kind === 'row' ? deleteRows(E.M, dz.i, dz.i) : deleteCols(E.M, dz.i, dz.i)));
  }
  // double-click: a sized gate goes back to its fitted size; anything else opens its first field
  // double-click on a gate or another element with a label: edit the label in place
  // elements with a typeable label, and the name of its field in the panel
  const LABEL: Record<string, any> = { gate: 'Label', phase: 'Angle', meter: 'Label', metercw: 'Label', inputD: 'Label', trash: 'Label', makeebit: 'Label', permute: 'Order', phantomgate: 'Width of', hphantomgate: 'Width of', meterD: 'Label', measuretab: 'Label', measure: 'Label', lstick: 'Label', rstick: 'Label', push: 'Text', midstick: 'Label', qwbundle: 'Label' };
  function onDouble(e: any) {
    if (editTitle(e)) return true;
    const s = single(), h = pick(e);
    if (!s || !h || h.r !== s.r1 || h.c !== s.c1) return false;
    return editLabel(s.r1, s.c1);
  }

  // ---------------------------------------------------------------- label editor
  // A floating box under the element (TD.input.popup): LaTeX or MathLive, as the Text input setting says.
  // Enter, Esc or clicking away finishes; the whole edit is one undo step.
  const MATH_LABEL = new Set(['gate', 'phase', 'qwbundle', 'push', 'meter', 'metercw', 'meterD', 'inputD', 'measure', 'measuretab', 'phantomgate', 'hphantomgate', 'ghost']); // set as maths by quantikz; the rest are text
  let L: any = null; // { r, c, pop }
  function editLabel(r: any, c: any) {
    const cell = at(r, c), m = cell && !cell.opaque && mainOf(cell);
    if (!m || !LABEL[m.name] || !TD.input) return false;
    closeLabel();
    begin();
    const me: any = (L = { r, c });
    me.pop = TD.input.popup(stage, {
      text: m.a[0] || '', math: MATH_LABEL.has(m.name), bare: true,
      at: () => labelAt(r, c),
      onInput: (v: any) => { m.a[0] = v; cell.dirty = true; draw(); renderProps(); },
      onDone: () => { if (L === me) L = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  // a slice's or a group's label (its top or its bottom one) under the pointer: edit it in place, under the label
  function titleAt(e: any) {
    const G = E.G, [x, y] = toL(e), tol = 4 / E.view.k;
    const o = G && !G.empty && G.L.ops && [...G.L.ops].reverse().find((o) => o.k === 'text' && o.lab && Math.abs(x - o.x) <= o.b.w / 2 + tol && Math.abs(y - o.y) <= o.b.h / 2 + tol);
    const cell = o && at(o.lab.r, o.lab.c), it = cell && !cell.opaque && cell.items[o.lab.i];
    return it ? { o, cell, it } : null;
  }
  function editTitle(e: any) {
    const t = titleAt(e);
    if (!t || !TD.input) return false;
    const { o, cell, it } = t;
    const low = !!o.lab.low, sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(), oy = o.y + o.b.h / 2;
    closeLabel();
    begin();
    const me: any = (L = { r: o.lab.r, c: o.lab.c });
    me.pop = TD.input.popup(stage, {
      text: low ? groupLow(it) : it.a[0] || '', math: false, bare: true,
      at: () => { const v = E.view; return [vr.left - sr.left + v.ox + o.x * v.k, vr.top - sr.top + v.oy + oy * v.k + 8]; },
      onInput: (v: any) => { if (low) setGroupMode(it, 'both', v); else it.a[0] = v; cell.dirty = true; draw(); renderProps(); },
      onDone: () => { if (L === me) L = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  // under the gate's box (or the cell), in stage pixels
  function labelAt(r: any, c: any) {
    const G = E.G || (E.G = geom()), v = E.view, gb = gateBox();
    const x = gb ? gb.x + gb.w / 2 : G.cx(c), y = gb ? gb.y + gb.h : G.ys[r + 1];
    const sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect();
    return [vr.left - sr.left + v.ox + x * v.k, vr.top - sr.top + v.oy + y * v.k + 8];
  }
  function closeLabel() { if (L) L.pop.close(); }
  svg.addEventListener('wheel', () => L && L.pop.place(), { passive: true }); // panning or zooming carries it along

  // ---------------------------------------------------------------- properties

  // colours, as quantikz takes them: style={fill=…, draw=…} in the element's options
  const FILLED = new Set(['gate', 'meter', 'metercw', 'meterD', 'inputD', 'measure', 'measuretab']);
  const COLOURED = new Set([...FILLED, 'ctrl', 'octrl', 'control', 'ocontrol', 'targ', 'targX', 'swap', 'phase', 'ground', 'trash', 'permute', 'qwbundle']); // sticks, \push and \makeebit draw no colour
  function styleOf(m: any) {
    const o = Q.opts(m.o[0] || '');
    return Q.opts(o.map.style || '').map;
  }
  function setStyle(m: any, key: any, val: any) {
    const o = Q.opts(m.o[0] || ''), st = Q.opts(o.map.style || '');
    let list = st.list.filter((e: any) => !new RegExp(`^${key}\\s*=`).test(e));
    if (val) list.push(`${key}=${val}`);
    const rest = o.list.filter((e: any) => !/^style\s*=/.test(e));
    if (list.length) rest.push(`style={${list.join(',')}}`);
    const head = rest.join(',');
    m.o = head || m.o.length > 1 ? [head, ...m.o.slice(1)] : [];
  }
  // a colour field (the colour picker, written as an xcolor spec); Default leaves it to quantikz
  const hueSel = (label: string, key: string, value: string, fill: boolean): FormRow => ({ ...row(label, texColour(TD.texColor.unwrap(value), { 'data-f': key }, { nullable: true, defaultSwatch: fill ? undefined : TD.css(INK), title: label })), controlClass: 'ctl tc' });
  // a group named in the panel as "r_c_i": its anchor cell and item
  function gref(k: any) {
    const [r, c, i] = k.split('_').map(Number), cell = at(r, c), it = cell && !cell.opaque && cell.items[i];
    return it && it.name === 'gategroup' ? { cell, it } : null;
  }
  // a top-level option written as key={a,b,…} (none: dropped)
  function setOpt(m: any, key: any, list: any) {
    const o = Q.opts(m.o[0] || ''), rest = o.list.filter((e: any) => !new RegExp(`^${key}\\s*=`).test(e));
    if (list.length) rest.push(`${key}={${list.join(',')}}`);
    const head = rest.join(',');
    m.o = head || m.o.length > 1 ? [head, ...m.o.slice(1)] : [];
  }
  const lsOf = (m: any) => Q.opts(Q.opts(m.o[0] || '').map['label style'] || '').list;
  const labelShift = (it: any, axis: string) => lsOf(it).reduce((v: number, e: string) => {
    const m = new RegExp(`^${axis}shift\\s*=\\s*(.+)$`).exec(e);
    const len = m && /^\s*(-?[\d.]+)\s*(cm|mm|pt|bp|in|em)?\s*$/.exec(m[1]);
    return v + (len ? +len[1] * (len[2] === 'em' ? 0.35 : CM[len[2] || 'pt'] || 1) : 0);
  }, 0);
  function setLabelShift(it: any, axis: string, value: number) {
    setOpt(it, 'label style', [...lsOf(it).filter((e: string) => !new RegExp(`^${axis}shift\\s*=`).test(e)), `${axis}shift=${Math.round(value * 100) / 100}cm`]);
  }
  const offsetRows = (it: any, key: string): FormRow[] => ['x', 'y'].map(axis => {
    const value = labelShift(it, axis), label = axis === 'x' ? t('editor.qc.offsetX', 'Offset X') : t('editor.qc.offsetY', 'Offset Y');
    return row(label, { kind: 'input', value, attrs: { type: 'range', 'data-slider-default': axis === 'x' ? 0 : key.startsWith('B') || (it.name === 'gategroup' && groupMode(it) === 'bottom') ? -0.4 : it.name === 'slice' ? (sliceBottom(it) ? cmOf(styleOf(it)['shorten >']) : -cmOf(styleOf(it)['shorten <'])) : 0, min: String(Math.min(-2, value)), max: String(Math.max(2, value)), step: '0.05', 'data-f': `offset${axis}:${key}`, 'aria-label': label } }, { kind: 'text', class: 'slider-value', text: `${Math.round(value * 100) / 100} cm` });
  });
  // A group's label: above (quantikz's own), below (label position=below, as far under as the top one is over),
  // or both (a second label={…} in its style).
  const GLOW = 'group label,label position=below,yshift=-0.4cm';
  function groupMode(it: any) {
    if (Q.opts(Q.opts(it.o[0] || '').map.style || '').list.some((e: any) => /^label\s*=/.test(e))) return 'both';
    return lsOf(it).some((e: any) => /^label position\s*=\s*below/.test(e) || e === 'below') ? 'bottom' : 'top';
  }
  function groupLow(it: any) {
    const q = /\]\s*(?:\w+\s*)?:\s*([\s\S]*)$/.exec(styleOf(it).label || '');
    return q ? q[1].trim().replace(/^\{([\s\S]*)\}$/, '$1') : '';
  }
  function lowerGroupLabel(it: any) {
    const m = /\[([\s\S]*?)\]/.exec(styleOf(it).label || '');
    return { o: [`label style={${m ? m[1] : GLOW}}`] };
  }
  function setGroupMode(it: any, mode: any, low: any) {
    const y = labelShift(it, 'y') + (groupMode(it) === 'bottom' ? 0.4 : 0);
    const keep = lsOf(it).filter((e: any) => !/^(label position|yshift)\s*=/.test(e) && e !== 'below' && e !== 'above');
    setOpt(it, 'label style', mode === 'bottom' ? [...keep, 'label position=below', `yshift=${y - 0.4}cm`] : [...keep, `yshift=${y}cm`]);
    const lower = groupMode(it) === 'both' ? lsOf(lowerGroupLabel(it)).join(',') : GLOW;
    setStyle(it, 'label', mode === 'both' ? `{[${lower}]:{${low}}}` : '');
  }
  // A slice's label: at the top (quantikz's own), the bottom (label style={pos=1,anchor=north}), or both: a second,
  // borderless \slice in the same cell carries the bottom one. A slice over fewer wires is shortened at its ends
  // (shorten <=, >= from the layout); shortening leaves the label where it was, so a yshift follows the cut end.
  // it.wr caches the wires [from, to] while editing; the code alone gives them back by the nearest wire edges.
  const sliceNone = (it: any) => /^none$/i.test((styleOf(it).draw || '').trim());
  function slicePair(cell: any) {
    const sl = cell.opaque ? [] : cell.items.filter((it: any) => it.name === 'slice');
    const main = sl.find((it: any) => !sliceNone(it)) || null;
    return { main, comp: (main && sl.find((it: any) => it !== main && sliceNone(it))) || null };
  }
  const sliceBottom = (it: any) => lsOf(it).some((e: any) => /^pos\s*=\s*1(\.0*)?$/.test(e));
  const sliceShort = (it: any) => !!(styleOf(it)['shorten <'] || styleOf(it)['shorten >']);
  function rowsPx() { const G = E.G || (E.G = geom()), g = G.L && G.L.geo; return g && G.L.R ? { g, R: G.L.R } : null; }
  const edgeT = (g: any, a: any) => g.rowT[a] - g.rowT[0], edgeB = (g: any, R: any, b: any) => g.rowT[R - 1] + g.rowH[R - 1] - g.rowT[b] - g.rowH[b];
  function sliceWires(it: any) {
    const R = nR(E.M), q = rowsPx();
    if (it.wr) return it.wr;
    if (!q || !sliceShort(it)) return [0, Math.max(0, R - 1)];
    const cm = (v: any) => { const m = /(-?[\d.]+)\s*(cm|mm|pt)?/.exec(v || ''); return !m ? 0 : m[2] === 'mm' ? (m[1] as any) / 10 : m[2] === 'pt' ? (m[1] as any) / 28.45 : +m[1]; };
    const T = cm(styleOf(it)['shorten <']) * TD.PX_PER_CM, B = cm(styleOf(it)['shorten >']) * TD.PX_PER_CM;
    let a = 0, b = q.R - 1;
    for (let i = 0; i < q.R; i++) { if (Math.abs(edgeT(q.g, i) - T) < Math.abs(edgeT(q.g, a) - T)) a = i; if (Math.abs(edgeB(q.g, q.R, i) - B) < Math.abs(edgeB(q.g, q.R, b) - B)) b = i; }
    return [a, Math.max(a, b)];
  }
  // the cut at each end, in cm, for wires [a, b]
  function sliceCut(it: any) {
    const q = rowsPx();
    if (!q || !(it.wr || sliceShort(it))) return [0, 0];
    const [a, b] = sliceWires(it).map((v: any) => Math.min(Math.max(v, 0), q.R - 1)), cm = (v: any) => Math.round((v / TD.PX_PER_CM) * 100) / 100;
    return [cm(edgeT(q.g, a)), cm(edgeB(q.g, q.R, Math.max(a, b)))];
  }
  function placeSlice(main: any, comp: any, bottom: any) {
    const oldStyle = styleOf(main), oldBase = sliceBottom(main) ? cmOf(oldStyle['shorten >']) : -cmOf(oldStyle['shorten <']);
    const y = labelShift(main, 'y') - oldBase;
    const compY = comp ? labelShift(comp, 'y') - cmOf(oldStyle['shorten >']) : 0;
    const [T, B] = sliceCut(main), keep = (it: any) => lsOf(it).filter((e: any) => !/^(pos|anchor|yshift)\s*=/.test(e));
    setStyle(main, 'shorten <', T ? `${T}cm` : ''); setStyle(main, 'shorten >', B ? `${B}cm` : '');
    if (!T && !B) delete main.wr;
    setOpt(main, 'label style', [...keep(main), ...(bottom ? ['pos=1', 'anchor=north', `yshift=${B + y}cm`] : [`yshift=${y - T}cm`])]);
    if (comp) setOpt(comp, 'label style', [...keep(comp), 'pos=1', 'anchor=north', `yshift=${B + compY}cm`]);
  }
  // keep every shortened slice's cut on its wires as the rows around it change height
  function syncSlices() {
    let changed = false;
    for (const row of E.M.rows) for (const cell of row) {
      const { main, comp } = slicePair(cell);
      if (!main || !(main.wr || sliceShort(main))) continue;
      const was = itemCode(main) + (comp ? itemCode(comp) : '');
      main.wr = sliceWires(main);
      placeSlice(main, comp, sliceBottom(main));
      if (itemCode(main) + (comp ? itemCode(comp) : '') !== was) { cell.dirty = true; changed = true; }
    }
    return changed;
  }
  function setSliceMode(cell: any, main: any, mode: any) {
    let { comp } = slicePair(cell);
    if (mode === 'both' && !comp) { comp = { name: 'slice', o: ['style={draw=none}'], a: [''] }; cell.items.splice(cell.items.indexOf(main) + 1, 0, comp); }
    if (mode !== 'both' && comp) { cell.items.splice(cell.items.indexOf(comp), 1); comp = null; }
    placeSlice(main, comp, mode === 'bottom');
    cell.dirty = true;
  }

  const AT = () => [['top', t('editor.commonA.side.above', 'Above')], ['bottom', t('editor.commonA.side.below', 'Below')], ['both', t('editor.commonA.both', 'Both')]];
  // a label field's name, as the panel shows it
  const labelName = (en: string): string => (({ Label: () => t('ui.label', 'Label'), Angle: () => t('ui.angle', 'Angle'), Order: () => t('editor.qc.order', 'Order'), 'Width of': () => t('editor.qc.widthOf', 'Width of'), Text: () => t('ui.text', 'Text') } as Record<string, () => string>)[en]?.() ?? en);

  // ---------------------------------------------------------------- circuit-wide spacing
  // quantikz's row sep / column sep in the environment's options: a gap between rows (steps), or, with
  // "between origins", the distance from one wire (step) to the next, so every row is the same height whatever
  // it holds. Shown in cm; a length in other units is converted, em and ex kept until the field is changed.
  const SEP: Record<string, any> = { row: 'row sep', col: 'column sep' };
  const CM: Record<string, any> = { cm: 1, mm: 0.1, pt: 2.54 / 72.27, bp: 2.54 / 72, in: 2.54 };
  function sepOf(axis: any) {
    const v = Q.opts(E.M.env || '').map[SEP[axis]];
    if (!v) return { cm: null, between: false, raw: '' };
    const between = /between origins/.test(v), len = v.replace(/,?\s*between origins\s*,?/, '').trim();
    const m = /^(-?[\d.]+)\s*(cm|mm|pt|bp|in)?$/.exec(len);
    return { cm: m ? Math.round(parseFloat(m[1]) * CM[m[2] || 'pt'] * 1000) / 1000 : null, between, raw: len };
  }
  // the spacing the circuit has now, in cm: the gap, or the mean wire-to-wire (step-to-step) distance
  function sepNow(axis: any, between: any) {
    const g = Q.layout({ type: 'qc', x: 0, y: 0, src: snap(), size: E.st.size, font: E.st.font, color: INK }).geo;
    if (!g) return 0.5;
    const [mid, lo, size] = axis === 'row' ? [g.cy, g.rowT, g.rowH] : [g.cx, g.colL, g.colW], n = mid ? mid.length : 0;
    if (n < 2) return between ? 1 : 0.5;
    let v = 0;
    for (let i = 1; i < n; i++) v += between ? mid[i] - mid[i - 1] : lo[i] - lo[i - 1] - size[i - 1];
    return Math.max(0.05, Math.round((v / (n - 1) / TD.PX_PER_CM) * 20) / 20);
  }
  function setSep(axis: any, cm: any, between: any) {
    const key = SEP[axis], o = Q.opts(E.M.env || '');
    const list = o.list.filter((e: any) => !new RegExp(`^${key}\\s*=`).test(e));
    if (cm != null) list.push(between ? `${key}={${cm}cm,between origins}` : `${key}=${cm}cm`);
    E.M.env = list.join(', ');
    if (E.M.env) E.M.wrapped = true; // the options need \begin{quantikz}[…] to live in
  }
  function circuitProps(): FormSection {
    const one = (axis: string, label: string, pitch: string): FormRow[] => {
      const v = sepOf(axis);
      return [numField(label, `E${axis}`, v.cm ?? '', 'cm', { min: '0', step: '0.05', placeholder: v.cm == null && v.raw ? v.raw : v.between ? '' : '0.5' }),
        switchRow(t('editor.qc.measured', 'Measured'), [['gap', t('editor.qc.gap', 'Gap')], ['pitch', pitch]].map(([k, n]) => ({ text: n, on: (k === 'pitch') === v.between, attrs: { 'data-qe': 'sepmode', 'data-axis': axis, 'data-v': k } })))];
    };
    return section(t('ui.circuit', 'Circuit'), [...one('row', t('editor.qc.wireSpacing', 'Wire spacing'), t('editor.qc.wireToWire', 'Wire to wire')), ...one('col', t('editor.qc.stepSpacing', 'Step spacing'), t('editor.qc.stepToStep', 'Step to step')), note(t('editor.qc.help.spacing', 'Gap: the space between rows, which grow with what they hold. Wire to wire: every wire the same distance from the next.'))], 'sec');
  }
  function renderProps() {
    if (!E) return;
    const b = selBox();
    const show = (sections: FormSection[]) => { props.hidden = false; renderView(props, FormPanel, { sections }); };
    const num = (label: string, key: string, value: number, max?: number) => numField(label, key, value, '', { min: '1', step: '1', ...(max ? { max: String(max) } : {}) });
    const dec = (label: string, key: string, value: number) => numField(label, key, value || '', 'cm', { min: '0', step: '0.1', placeholder: t('editor.qc.auto', 'auto') });
    const sg = (label: string, action: string, attrs: Attributes, current: string, options: string[][]): FormRow => switchRow(label, options.map(([value, text]) => ({ text, on: current === value, attrs: { 'data-qe': action, ...attrs, 'data-v': value } })));
    const hidden = (visible: boolean, rows: FormRow[]): FormRow => ({ kind: 'group', style: visible ? undefined : 'display:none', rows });
    const remove = (action: string, attrs: Attributes) => ({ text: '×', attrs: { class: 'flat qe-x', 'data-qe': action, ...attrs, title: t('editor.qc.remove', 'Remove') } });
    if (!b) { show([circuitProps()]); return; }
    if (!single()) {
      const n = (b.r2 - b.r1 + 1) * (b.c2 - b.c1 + 1);
      show([section(t('editor.qc.nCells', '{n} cells', { n }), [note(t('editor.qc.help.range', 'Wires {r1}–{r2}, steps {c1}–{c2}.', { r1: b.r1 + 1, r2: b.r2 + 1, c1: b.c1 + 1, c2: b.c2 + 1 })), note(t('editor.qc.help.rightClick', 'Right-click for wires and steps.'))], 'sec')]); return;
    }
    const cell = at(b.r1, b.c1), m = !cell.opaque && mainOf(cell), rows: FormRow[] = [];
    const sections: FormSection[] = [{ ...section(cell.opaque ? t('editor.qc.customCell', 'Custom cell') : m ? say(NAMES[m.name] || m.name) : cell.items.length ? t('editor.qc.cell', 'Cell') : t('editor.qc.emptyCell', 'Empty cell'), rows, 'sec'), summary: t('editor.qc.at', 'wire {r} · step {c}', { r: b.r1 + 1, c: b.c1 + 1 }) }];
    if (m) {
      const label = LABEL[m.name];
      if (label) rows.push(field(labelName(label), 'arg', m.plain ? m.a[0] : m.a[0] || '', m.name === 'permute' ? { class: 'mono', placeholder: '2, 1' } : { 'data-tx': MATH_LABEL.has(m.name) ? 'math' : 'text' }));
      if (SPANS.has(m.name) && !isSwapGate(m, Q.opts)) rows.push(num(t('editor.qc.cat.wires', 'Wires'), 'span', spanOf(m)));
      if (COLOURED.has(m.name)) { const st = styleOf(m); if (FILLED.has(m.name)) rows.push(hueSel(t('ui.fill', 'Fill'), 'cfill', st.fill || '', true)); rows.push(hueSel(FILLED.has(m.name) ? t('ui.line', 'Line') : t('ui.colour', 'Colour'), 'cdraw', st.draw || st.color || '', false)); }
      if (m.name === 'gate') { const z = gateSize(m); rows.push(dec(t('editor.qc.minWidth', 'Min width'), 'gw', z.w)); if (spanOf(m) <= 1) rows.push(dec(t('editor.qc.minHeight', 'Min height'), 'gh', z.h)); }
      if (LINKS.has(m.name)) {
        const n = intArg(m.a[0]), options = [['0', t('ui.none', 'None')]];
        for (let i = 0; i < nR(E.M); i++) if (i !== b.r1) options.push([String(i - b.r1), t('editor.qc.tip.wire', 'Wire {n}', { n: i + 1 })]);
        rows.push(row(t('editor.qc.lineTo', 'Line to'), { kind: 'select', value: String(n || 0), options, attrs: { 'data-f': 'link' } }));
      }
    } else if (!cell.opaque && !cell.items.length) rows.push(note(t('editor.qc.help.pick', 'Pick an element on the left, or type '), { kbd: 'H' }, ' ', { kbd: 'X' }, ' ', { kbd: 'Z' }, ' ', { kbd: 'C' }, ' ', { kbd: 'M' }, '…'));
    if (!cell.opaque) cell.items.forEach((it: any, i: number) => {
      if (it.name === 'slice') {
        const { main, comp } = slicePair(cell); if (it === comp) return;
        const mode = it === main && comp ? 'both' : sliceBottom(it) ? 'bottom' : 'top', w = it === main ? sliceWires(it) : null, R = nR(E.M);
        const rows: FormRow[] = [field(t('ui.label', 'Label'), 'x' + i, it.a[0] || '', { 'data-tx': 'text' }), ...offsetRows(it, String(i))];
        if (it === main) rows.push(sg(t('editor.qc.labelAt', 'Label at'), 'sl', { 'data-i': i }, mode, AT()), hidden(!!comp, [field(t('editor.qc.bottomLabel', 'Bottom label'), 'xb' + i, comp ? comp.a[0] || '' : '', { 'data-tx': 'text' }), ...(comp ? offsetRows(comp, String(cell.items.indexOf(comp))) : [])]), num(t('editor.qc.fromWire', 'From wire'), 'sa' + i, w![0] + 1, R), num(t('editor.qc.toWire', 'To wire'), 'sz' + i, w![1] + 1, R));
        rows.push(hueSel(t('ui.colour', 'Colour'), 'cd' + i, styleOf(it).draw || styleOf(it).color || '', false));
        sections.push({ ...section(t('editor.qc.n.slice', 'Slice'), rows, 'sec'), titleAction: remove('drop', { 'data-i': i }) });
      } else if (it.name === 'setwiretype') {
        const wt = (it.a[0] || 'q').trim();
        sections.push({ ...section(t('editor.qc.wireFromHere', 'Wire from here'), [{ kind: 'group', class: 'row', rows: [switchRow(null, [['q', t('editor.qc.quantum', 'Quantum')], ['c', t('editor.qc.classical', 'Classical')], ['n', t('ui.none', 'None')]].map(([value, text]) => ({ text, on: wt === value, attrs: { 'data-qe': 'wt', 'data-i': i, 'data-v': value } })))] }], 'sec'), titleAction: remove('drop', { 'data-i': i }) });
      }
    });
    for (const g of groupsAt(b.r1, b.c1)) {
      const k = `${g.r}_${g.c}_${g.i}`, d = groupDims(g.it), st = styleOf(g.it), away = g.r !== b.r1 || g.c !== b.c1, off = /^none$/i.test((st.draw || '').trim());
      sections.push({ ...section(t('editor.qc.group', 'Group'), [field(t('ui.label', 'Label'), 'Gx' + k, g.it.a[0] || '', { 'data-tx': 'text' }), sg(t('editor.qc.labelAt', 'Label at'), 'gl', { 'data-g': k }, groupMode(g.it), AT()), ...offsetRows(g.it, 'G' + k), hidden(groupMode(g.it) === 'both', [field(t('editor.qc.bottomLabel', 'Bottom label'), 'Gb' + k, groupLow(g.it), { 'data-tx': 'text' }), ...offsetRows(lowerGroupLabel(g.it), 'B' + k)]), num(t('editor.qc.cat.wires', 'Wires'), 'Gw' + k, d.wires), num(t('editor.qc.steps', 'Steps'), 'Gs' + k, d.steps), hueSel(t('ui.fill', 'Fill'), 'Gf' + k, st.fill || '', true), sg(t('editor.qc.border', 'Border'), 'gb', { 'data-g': k }, off ? '0' : '1', [['1', t('editor.qc.shown', 'Shown')], ['0', t('ui.none', 'None')]]), hidden(!off, [hueSel(t('ui.line', 'Line'), 'Gd' + k, off ? '' : st.draw || st.color || '', false)])], 'sec'), titleSpan: true, ...(away ? { summary: t('editor.qc.fromAt', 'from wire {r} · step {c}', { r: g.r + 1, c: g.c + 1 }) } : {}), titleAction: remove('gdrop', { 'data-g': k }) });
    }
    sections.push({ class: 'sec', rows: [field(t('editor.commonA.code', 'Code'), 'code', cellText(cell), { class: 'mono' }), ...(cell.opaque ? [note(t('editor.qc.help.opaque', 'This cell has commands the editor doesn’t draw; they are kept as written.'))] : [])] }); show(sections);
  }
  props.addEventListener('focusin', (e: any) => { if (E && !isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (E && !isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('input', (e: any) => {
    const t = e.target, f = t.dataset.f, s = single();
    if (f === 'Erow' || f === 'Ecol') {
      const axis = f.slice(1).toLowerCase(), v = parseFloat(t.value);
      setSep(axis, Number.isFinite(v) && v >= 0 ? v : null, sepOf(axis).between);
      draw(); keepInView(); return;
    }
    if (!f || !s) return;
    const cell = at(s.r1, s.c1);
    if (f.startsWith('offset')) {
      const [axis, key] = f.slice(6).split(':');
      const g = /^[GB]/.test(key) ? gref(key.slice(1)) : null;
      const lower = key.startsWith('B');
      const it = g ? (lower ? lowerGroupLabel(g.it) : g.it) : cell.items[+key];
      if (!it) return;
      setLabelShift(it, axis, parseFloat(t.value) || 0);
      if (lower && g) setStyle(g.it, 'label', `{[${lsOf(it).join(',')}]:{${groupLow(g.it)}}}`);
      (g ? g.cell : cell).dirty = true;
    }
    else if (f === 'code') { Object.assign(cell, parseCell(t.value)); }
    else if (/^G[xbwsfd]/.test(f)) {
      // a group's field, by its top-left cell; a filled group goes behind the circuit (background), or its fill hides the gates
      const g = gref(f.slice(2));
      if (!g) return;
      const it = g.it;
      if (f[1] === 'x') it.a[0] = t.value;
      else if (f[1] === 'b') setGroupMode(it, 'both', t.value);
      else if (f[1] === 'w' || f[1] === 's') { const d = groupDims(it), v = Math.max(1, intArg(t.value) || 1); setGroupDims(it, f[1] === 'w' ? v : d.wires, f[1] === 's' ? v : d.steps); }
      else {
        if (f[1] === 'd') setStyle(it, 'color', '');
        setStyle(it, f[1] === 'f' ? 'fill' : 'draw', TD.texColor.wrap(t.value));
        if (f[1] === 'f' && t.value) { const o = Q.opts(it.o[0] || ''); if (!o.list.includes('background')) it.o = [[...o.list, 'background'].join(','), ...it.o.slice(1)]; }
      }
      g.cell.dirty = true;
    }
    else {
      const m = mainOf(cell);
      if (f === 'arg') { m.a[0] = t.value; cell.dirty = true; }
      else if (f === 'gw' || f === 'gh') { const z = gateSize(m), v = Math.max(0, parseFloat(t.value) || 0); setGateSize(m, f === 'gw' ? v : z.w, f === 'gh' ? v : z.h); cell.dirty = true; }
      else if (f === 'span' && !isSwapGate(m, Q.opts)) { setSpan(m, boundedSpan(s.r1, intArg(t.value) || 1, spanOf(m), nR(E.M), (r) => wireOnly(at(r, s.c1)))); cell.dirty = true; clearUnder(s.r1, s.c1); }
      else if (f === 'link') { const n = intArg(t.value); m.a[0] = n ? String(n) : ''; cell.dirty = true; }
      else if (f === 'cfill' || f === 'cdraw') { if (f === 'cdraw') setStyle(m, 'color', ''); setStyle(m, f === 'cfill' ? 'fill' : 'draw', TD.texColor.wrap(t.value)); cell.dirty = true; }
      else if (/^cd\d+$/.test(f)) { const it = cell.items[+f.slice(2)]; setStyle(it, 'color', ''); setStyle(it, 'draw', TD.texColor.wrap(t.value)); cell.dirty = true; } // a slice's colour
      else if (/^x\d+$/.test(f)) { cell.items[+f.slice(1)].a[0] = t.value; cell.dirty = true; }
      else if (/^xb\d+$/.test(f)) { const { comp } = slicePair(cell); if (comp) { comp.a[0] = t.value; cell.dirty = true; } }
      else if (/^s[az]\d+$/.test(f)) {
        // a slice's wires: the other end moves along when they would cross
        const it = cell.items[+f.slice(2)], w = sliceWires(it).slice(), R = nR(E.M), v = Math.min(Math.max(intArg(t.value) || 1, 1), R) - 1;
        if (f[1] === 'a') { w[0] = v; w[1] = Math.max(w[1], v); } else { w[1] = v; w[0] = Math.min(w[0], v); }
        it.wr = w; placeSlice(it, slicePair(cell).comp, sliceBottom(it)); cell.dirty = true;
      }
    }
    draw();
    if (f === 'link' || f === 'cfill' || f === 'cdraw' || /^cd\d+$/.test(f) || /^G[fd]/.test(f)) { commit(); begin(); }
  });
  // the panel follows each keystroke: the other fields show what this one changed (the Svelte view preserves the active field)
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-qe="undo"]', root).disabled = !E.undo.length;
    $('[data-qe="redo"]', root).disabled = !E.redo.length;
  }
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-qe]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.qe, b);
  });
  function act(a: any, b?: any) {
    const s = selBox(), M = E.M;
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') clearSel();
    else if (a === 'copy') copyCode(b, codeTa.value);
    else if (a === 'addrow') edit(() => ensure(M, nR(M) + 1, Math.max(nC(M), 1)));
    else if (a === 'addcol') edit(() => ensure(M, Math.max(nR(M), 1), nC(M) + 1));
    else if (a === 'sepmode') {
      // switching keeps the circuit as it looks: the new measure starts from the spacing it has now
      const axis = b.dataset.axis, between = b.dataset.v === 'pitch';
      if (sepOf(axis).between !== between) edit(() => setSep(axis, sepNow(axis, between), between));
    }
    else if (!s) return;
    else if (a === 'rowabove') { edit(() => insertRow(M, s.r1)); E.sel = { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c1 }; draw(); renderProps(); }
    else if (a === 'rowbelow') { edit(() => insertRow(M, s.r2 + 1)); E.sel = { r1: s.r2 + 1, c1: s.c1, r2: s.r2 + 1, c2: s.c1 }; draw(); renderProps(); }
    else if (a === 'rowdel') edit(() => { deleteRows(M, s.r1, s.r2); if (!nR(M)) E.sel = null; });
    else if (a === 'colbefore') { edit(() => insertCol(M, s.c1)); E.sel = { r1: s.r1, c1: s.c1, r2: s.r1, c2: s.c1 }; draw(); renderProps(); }
    else if (a === 'colafter') { edit(() => insertCol(M, s.c2 + 1)); E.sel = { r1: s.r1, c1: s.c2 + 1, r2: s.r1, c2: s.c2 + 1 }; draw(); renderProps(); }
    else if (a === 'colleft' || a === 'colright') {
      const d = a === 'colleft' ? -1 : 1;
      if (d < 0 ? s.c1 === 0 : s.c2 >= nC(M) - 1) return;
      edit(() => moveCols(M, s.c1, s.c2, d));
      E.sel = { r1: s.r1, c1: s.c1 + d, r2: s.r2, c2: s.c2 + d }; draw(); renderProps();
    }
    else if (a === 'coldel') edit(() => { deleteCols(M, s.c1, s.c2); if (!nC(M)) E.sel = null; });
    else if (a === 'drop') { const cell = at(s.r1, s.c1), it = cell.items[+b.dataset.i], { main, comp } = slicePair(cell); edit(() => setItems(cell, cell.items.filter((x: any) => x !== it && !(it === main && x === comp)))); }
    else if (a === 'sl') { const cell = at(s.r1, s.c1); edit(() => setSliceMode(cell, cell.items[+b.dataset.i], b.dataset.v)); }
    else if (a === 'gl') { const g = gref(b.dataset.g); if (g) edit(() => { setGroupMode(g.it, b.dataset.v, groupLow(g.it)); g.cell.dirty = true; }); }
    else if (a === 'gb') { const g = gref(b.dataset.g); if (g) edit(() => { setStyle(g.it, 'color', ''); setStyle(g.it, 'draw', b.dataset.v === '0' ? 'none' : ''); g.cell.dirty = true; }); renderProps(); }
    else if (a === 'gdrop') { const g = gref(b.dataset.g); if (g) edit(() => setItems(g.cell, g.cell.items.filter((x: any) => x !== g.it))); }
    else if (a === 'wt') { const cell = at(s.r1, s.c1); edit(() => { cell.items[+b.dataset.i].a[0] = b.dataset.v; cell.dirty = true; }); }
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const R = nR(E.M), C = nC(E.M);
    count.textContent = `${wiresText(R)} · ${stepsText(C)}`;
    if (document.activeElement === codeTa) return;
    const c = snap();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    const L = Q.layout({ src: c, size: E.st.size, font: E.st.font });
    showCodeNotes(codeMsg, L.warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.typed = codeTa.value; E.M = load(codeTa.value); E.codeAt = codeTa.value;
    clampSel(); draw(); keepInView(); renderProps();
    const L = Q.layout({ src: codeTa.value, size: E.st.size, font: E.st.font });
    showCodeNotes(codeMsg, L.warnings);
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !dock.elsewhere(e),
      save,
      finish,
      undo,
      redo,
      // a focused palette item is a button: Enter and Space choose it, as a click does
      own: (e) => {
        const item = (e.target as Element).closest?.('.qe-item') as HTMLElement | null;
        if (!item || (e.key !== 'Enter' && e.key !== ' ') || e.metaKey || e.ctrlKey || e.altKey) return false;
        e.preventDefault();
        if (!e.repeat) { const k = item.dataset.item!; choose(k); (list.querySelector(`.qe-item[data-item="${CSS.escape(k)}"]`) as HTMLElement | null)?.focus(); }
        return true;
      },
      escape: () => {
        if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return true; }
        if (E.sel) { E.sel = null; draw(); renderProps(); return true; }
        return false;
      },
      field: (e) => { if (e.key === 'Enter' && (e.target! as Element).matches('#qcModal .cz-props input')) (e.target! as HTMLElement).blur(); },
    });
    if (!keys) return;
    const { mod } = keys;
    if (mod && (e.key === 'f' || e.key === 'k')) { e.preventDefault(); search.focus(); search.select(); return; } // ⌘F or ⌘K: the palette's search
    const b = selBox();
    if (mod && e.key === 'a') { e.preventDefault(); if (nR(E.M) && nC(E.M)) { E.sel = { r1: 0, c1: 0, r2: nR(E.M) - 1, c2: nC(E.M) - 1 }; draw(); renderProps(); } return; }
    if (mod && (e.key === 'c' || e.key === 'x') && b) {
      e.preventDefault();
      E.clip = [];
      for (let r = b.r1; r <= b.r2; r++) { const row = []; for (let c = b.c1; c <= b.c2; c++) row.push(JSON.parse(JSON.stringify(at(r, c)))); E.clip.push(row); }
      if (e.key === 'x') clearSel();
      return;
    }
    if (mod && e.key === 'v' && b && E.clip) {
      e.preventDefault();
      edit(() => { ensure(E.M, b.r1 + E.clip.length, b.c1 + E.clip[0].length); E.clip.forEach((row: any, i: any) => row.forEach((cell: any, j: any) => { E.M.rows[b.r1 + i][b.c1 + j] = JSON.parse(JSON.stringify(cell)); })); });
      E.sel = { r1: b.r1, c1: b.c1, r2: b.r1 + E.clip.length - 1, c2: b.c1 + E.clip[0].length - 1 }; draw(); renderProps();
      return;
    }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); clearSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    if (e.key === 'Enter' && single()) { e.preventDefault(); const f = $('[data-f]', props); if (f) { f.focus(); f.select && f.select(); } return; }
    if (e.key.startsWith('Arrow')) {
      e.preventDefault();
      const R = nR(E.M), C = nC(E.M);
      if (!R || !C) return;
      const s = E.sel || { r1: 0, c1: 0, r2: 0, c2: 0 }, dr = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0, dc = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
      const f = (v: any, n: any) => Math.max(0, Math.min(n - 1, v));
      if (e.shiftKey && E.sel) E.sel = { ...s, r2: f(s.r2 + dr, R), c2: f(s.c2 + dc, C) };
      else { const r = f(s.r2 + dr, R), c = f(s.c2 + dc, C); E.sel = { r1: r, c1: c, r2: r, c2: c }; }
      draw(); renderProps(); return;
    }
    const k = KEYS[e.key.toLowerCase()] || (e.key === '=' ? 'targ' : null);
    const s = single();
    if (k && s) { e.preventDefault(); put(k, s.r1, s.c1, true); }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // Ctrl+S: write the circuit back to the page (one undo step there) and keep editing; Esc then has nothing to discard
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { localeOff?.(); localeOff = undefined; E = null; }, snapshot: () => snap(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => t('editor.qc.discard', 'Discard changes to this circuit?'),
    source: () => (E.codeAt != null && document.activeElement === codeTa ? codeTa.value : snap()),
  });
  const { save, finish } = dock;
  let localeOff: (() => void) | undefined;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    const M = load(block.src);
    E = { M, sel: null, arm: null, view: { ox: 0, oy: 0, k: 1.5 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, ghost: null, st: { size: block.size || 'normalsize', font: block.font || 'default' }, codeAt: null, codeTimer: null, clip: null };
    // an untouched circuit hands its own text back
    E.typed = String(block.src || ''); E.start = snap();
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, properties and drawing's hints follow the interface language while the editor is open
    let first = true;
    localeOff?.();
    localeOff = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); syncCode(); } });
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.qcEditor = { open, dockable: true, close: () => dock.detach() };
})();
