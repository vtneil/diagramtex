// Workflow benchmark: common tasks done with real mouse and key input (Chrome DevTools Protocol) in the app,
// counting what a person does: clicks, drags, shortcut keys, typed characters and switches between mouse and
// keyboard. Each task checks its outcome, so a count is only reported for a path that works.
//
//   node tests/bench.mjs            run, compare with tests/bench.json, exit 1 if a task got longer or broke
//   node tests/bench.mjs --update   write the current counts to tests/bench.json
//   TRACE=1 node tests/bench.mjs    print where the focus is after each step
//
// Typed characters are the content (a label, an expression) and are reported but not counted as steps.
import { APP_DIR, flag, prepare } from './args.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { serve, launch } from './chrome.mjs';

const HERE = path.dirname(new URL(import.meta.url).pathname);
await prepare();
const BASE = path.join(HERE, 'bench.json');
const UPDATE = flag('--update');
const MOD = { alt: 1, ctrl: 2, meta: 4, shift: 8 };

// A task: setup (page code, not counted), steps (counted), check (page code returning true or a message).
// Points are in diagram cm, y up, as in TikZ.
const TASKS = [
  {
    name: 'Box with a label',
    steps: [['key', 'r'], ['drag', [0, 0], [3, -2]], ['key', 'Enter'], ['type', 'A'], ['key', 'Escape']],
    check: `const S = shapes(), r = S.find((s) => s.type === 'rect'), t = S.find((s) => s.type === 'text');
      if (!r || !t || t.text !== 'A') return 'no rect with text A: ' + JSON.stringify(S.map((s) => s.type));
      const b = TD.bbox(r); if (Math.abs(t.x - (b.x + b.w / 2)) > 1 || Math.abs(t.y - (b.y + b.h / 2)) > 1) return 'label not centred';
      if (!r.g || r.g !== t.g) return 'label does not move with the box';
      return true;`,
  },
  {
    name: 'Change a box label',
    setup: `const r = addRect(0, 0, 3, 2), t = TD.TYPES.text.create({ x: 1.5 * PX, y: 1 * PX }, {}); delete t.valign; t.text = 'A'; t.id = 'lbl'; r.g = t.g = 'g1'; shapes().push(t);`,
    steps: [['dblclick', [0, -1]], ['type', 'B'], ['key', 'Enter']],
    check: `const T = shapes().filter((s) => s.type === 'text'); return (T.length === 1 && T[0].text === 'B') || 'texts: ' + JSON.stringify(T.map((t) => t.text));`,
  },
  {
    name: 'Arrow between two boxes',
    steps: [['key', 'r'], ['drag', [0, 0], [2, -1]], ['key', 'r'], ['drag', [4, 0], [6, -1]], ['key', 'a'], ['drag', [2, -0.5], [4, -0.5]]],
    check: `const S = shapes(), R = S.filter((s) => s.type === 'rect'), l = S.find((s) => s.type === 'line');
      if (R.length !== 2 || !l) return 'shapes: ' + S.map((s) => s.type);
      if (!l.link1 || !l.link2 || l.link1.id === l.link2.id) return 'arrow not tied to both boxes: ' + JSON.stringify([l.link1, l.link2]);
      return true;`,
  },
  {
    name: 'Three boxes in a row',
    steps: [['key', 'r'], ['drag', [0, 0], [1, -1]], ['key', 'd', 'meta'], ['key', 'd', 'meta']],
    check: `return shapes().filter((s) => s.type === 'rect').length === 3 || 'rects: ' + shapes().length;`,
  },
  {
    name: 'Text',
    steps: [['key', 't'], ['click', [1, -1]], ['type', 'Hello'], ['key', 'Escape']],
    check: `const t = shapes().find((s) => s.type === 'text'); return (t && t.text === 'Hello') || 'no text';`,
  },
  {
    name: 'Copy the TikZ of the diagram',
    setup: `addRect(0, 0, 2, 1); addRect(3, 0, 2, 1);`,
    steps: [['key', 'c', 'meta']],
    check: `const c = await navigator.clipboard.readText(); return /\\\\draw/.test(c) && (c.match(/rectangle/g) || []).length === 2 || 'clipboard: ' + c.slice(0, 200);`,
  },
  {
    name: 'Insert TikZ from the clipboard',
    setup: `await navigator.clipboard.writeText('\\\\begin{tikzpicture}\\n  \\\\draw (0,0) rectangle (2,1);\\n  \\\\draw[->] (2,0.5) -- (4,0.5);\\n\\\\end{tikzpicture}');`,
    steps: [['key', 'v', 'meta']],
    check: `const S = shapes(); return (S.length === 2 && S.some((s) => s.type === 'rect')) || 'shapes: ' + JSON.stringify(S.map((s) => s.type));`,
  },
  {
    name: 'Copy and paste a box',
    setup: `addRect(0, 0, 2, 1);`,
    steps: [['click', [0, -0.5]], ['key', 'c', 'meta'], ['key', 'v', 'meta']],
    check: `const S = shapes(); return (S.length === 2 && S.every((s) => s.type === 'rect')) || 'shapes: ' + JSON.stringify(S.map((s) => s.type));`,
  },
  {
    name: 'Component with a linked copy',
    setup: `addRect(0, 0, 2, 1); addRect(0, -2, 2, 1);`,
    steps: [['key', 'a', 'meta'], ['key', 'k', 'meta+alt'], ['key', 'd', 'meta']],
    check: `const C = shapes().filter((s) => s.type === 'comp'); return (C.length === 2 && C[0].ref === C[1].ref) || 'comps: ' + C.length;`,
  },
  {
    name: 'Place a box by expression',
    setup: `addRect(0, 0, 2, 1).name = 'a'; addRect(4, -3, 1, 1);`,
    steps: [['click', [4, -3.5]], ['clickEl', '#props input[data-geom="x"]'], ['type', 'a.east.x + 1'], ['key', 'Enter']],
    check: `const b = shapes()[1]; return (b.ex && b.ex.x === 'a.east.x + 1' && Math.abs(b.x / TD.PX_PER_CM - 3) < 1e-6) || 'b: ' + JSON.stringify({ x: b.x / TD.PX_PER_CM, ex: b.ex });`,
  },
];

const KEYS = { Enter: ['Enter', 13], Escape: ['Escape', 27], Backspace: ['Backspace', 8] };
async function main() {
  const srv = await serve(APP_DIR);
  const b = await launch(`http://127.0.0.1:${srv.port}/`);
  const out = [];
  try {
    await b.send('Browser.grantPermissions', { permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
    await b.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    const page = (body) => b.ev(`const shapes = () => TD.state.doc.shapes, PX = TD.PX_PER_CM;
      const addRect = (x, y, w, h) => { const s = { ...TD.TYPES.rect.create({ x: x * PX, y: -y * PX }, TD.state.defaults || {}), w: w * PX, h: h * PX, id: Math.random().toString(36).slice(2) }; TD.state.doc.shapes.push(s); return s; };
      ${body}`);
    // screen point of a diagram point (cm, y up)
    const at = (p) => page(`const r = document.querySelector('#canvas').getBoundingClientRect(), v = TD.state.view;
      return [r.x + (${p[0]} * PX - v.x) * v.zoom, r.y + (${-p[1]} * PX - v.y) * v.zoom];`);
    const mouse = (type, [x, y], extra = {}) => b.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1, ...extra });
    const settle = () => page('await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30))); return true;');
    for (const t of TASKS) {
      // a clean start: dialogs closed, a new whiteboard
      await page(`for (let k = 0; k < 3; k++) document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); TD.app.newDoc('Bench', null, null, null, null, 'board'); return true;`);
      if (t.setup) await page(t.setup + '\nTD.app.render(); TD.app.renderProps(); return true;');
      await page(`document.activeElement && document.activeElement.blur && document.activeElement.blur(); return true;`);
      await settle();
      const n = { clicks: 0, drags: 0, keys: 0, typed: 0, switches: 0 };
      let hand = null; const use = (h) => { if (hand && hand !== h) n.switches++; hand = h; };
      let err = null;
      try {
        for (const [op, a, c] of t.steps) {
          if (op === 'key') {
            use('keys'); n.keys++;
            const [key, code] = KEYS[a] || [a, a.toUpperCase().charCodeAt(0)];
            const modifiers = c ? c.split('+').reduce((m, k) => m | MOD[k], 0) : 0;
            const commands = modifiers === MOD.meta && ['c', 'v', 'x', 'a'].includes(a) ? [{ c: 'copy', v: 'paste', x: 'cut', a: 'selectAll' }[a]] : undefined;
            const text = !modifiers && a.length === 1 ? a : key === 'Enter' ? '\r' : undefined;
            await b.send('Input.dispatchKeyEvent', { type: text ? 'keyDown' : 'rawKeyDown', key, code: a.length === 1 ? 'Key' + a.toUpperCase() : key, windowsVirtualKeyCode: code, modifiers, text, commands });
            await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: a.length === 1 ? 'Key' + a.toUpperCase() : key, windowsVirtualKeyCode: code, modifiers });
          } else if (op === 'type') {
            use('keys'); n.typed += a.length;
            await b.send('Input.insertText', { text: a });
          } else if (op === 'click' || op === 'clickEl' || op === 'dblclick') {
            use('mouse'); n.clicks += op === 'dblclick' ? 2 : 1;
            const p = op === 'clickEl' ? await page(`const e = document.querySelector(${JSON.stringify(a)}); if (!e) return null; e.scrollIntoView({ block: 'nearest' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2];`) : await at(a);
            if (!p) throw new Error('nothing to click: ' + a);
            await mouse('mouseMoved', p, { buttons: 0 });
            for (let k = 1; k <= (op === 'dblclick' ? 2 : 1); k++) { await mouse('mousePressed', p, { clickCount: k }); await mouse('mouseReleased', p, { clickCount: k }); }
          } else if (op === 'drag') {
            use('mouse'); n.drags++;
            const p = await at(a), q = await at(c);
            await mouse('mouseMoved', p, { buttons: 0 }); await mouse('mousePressed', p);
            for (let k = 1; k <= 8; k++) await mouse('mouseMoved', [p[0] + (q[0] - p[0]) * k / 8, p[1] + (q[1] - p[1]) * k / 8]);
            await mouse('mouseReleased', q);
          }
          await settle();
          if (process.env.TRACE) console.log(t.name, op, a, await page(`const e = document.activeElement; return (e && (e.id || e.tagName)) + " imp=" + document.querySelector("#importModal").hidden + " v=" + document.querySelector("#impText").value.length`));
        }
        const ok = await page(t.check);
        if (ok !== true) err = String(ok);
      } catch (e) { err = e.message; }
      out.push({ name: t.name, steps: n.clicks + n.drags + n.keys, ...n, err });
    }
  } finally { b.close(); srv.close(); }
  return { out, logs: b.logs };
}

const { out, logs } = await main();
const base = fs.existsSync(BASE) ? JSON.parse(fs.readFileSync(BASE, 'utf8')) : {};
let bad = 0;
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('task', 34) + 'steps  clicks drags keys  typed switches');
for (const r of out) {
  const was = base[r.name];
  const delta = was ? (r.steps < was.steps ? `  (was ${was.steps})` : r.steps > was.steps ? `  LONGER (was ${was.steps})` : '') : '  (new)';
  if (r.err) { bad++; console.log(`✗ ${pad(r.name, 32)}${r.err}`); continue; }
  if (was && r.steps > was.steps && !UPDATE) bad++;
  console.log(pad(r.name, 34) + [r.steps, r.clicks, r.drags, r.keys, r.typed, r.switches].map((v, i) => pad(v, [7, 7, 6, 6, 6, 8][i])).join('') + delta);
}
if (logs.length) { console.log('page errors:\n  ' + logs.join('\n  ')); bad++; }
const tot = out.filter((r) => !r.err).reduce((a, r) => a + r.steps, 0);
console.log(`\n${out.length} tasks · ${tot} steps in all`);
if (UPDATE && !out.some((r) => r.err)) {
  fs.writeFileSync(BASE, JSON.stringify(Object.fromEntries(out.map((r) => [r.name, { steps: r.steps, clicks: r.clicks, drags: r.drags, keys: r.keys, switches: r.switches }])), null, 1) + '\n');
  console.log('wrote tests/bench.json');
}
process.exit(bad ? 1 : 0);
