// UML sequence diagrams (src/domain/umlsd.ts): pgf-umlsd code read into a tree, drawn as the package draws it
// (pgf-umlsd under pdflatex, 10pt), exported in a node with the outer picture interrupted and read back on
// import; and the visual editor (src/editors/umlsdeditor.ts).
const SD = TD.umlsd;
const near = (a, b, tol, msg) => T.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const sd = (src) => ({ type: 'umlsd', x: 0, y: 0, src });
const LO = (src) => SD.layout(sd(src));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the package's own demos (doc/latex/pgf-umlsd/demo), with the bounding box pdflatex gives each (pt)
const DEMOS = JSON.parse(T.fixtures['umlsd-demos.json']);

T.test('umlsd: the demos are read into a tree, and writing it gives the same tree back', () => {
  T.eq(SD.write(SD.parse(TD.UMLSD_DEFAULT)), TD.UMLSD_DEFAULT, 'the default is written as it is');
  for (const [name, { src }] of Object.entries(DEMOS)) {
    const M = SD.parse(src), again = SD.parse(SD.write(M));
    T.eq(JSON.stringify(again.items), JSON.stringify(M.items), `${name}:\n${SD.write(M)}`);
  }
  const M = SD.parse(DEMOS['nested-call'].src);
  T.eq(M.items.map((it) => it.k), ['inst', 'inst', 'inst', 'call']);
  const c = M.items[3];
  T.eq([c.env, c.a, c.t, c.b, c.r], ['call', 't', 'funcA()', 'a', 'return']);
  T.eq(c.body.length, 1, 'the nested call is in its body');
  const mt = SD.parse(DEMOS['multi-threads-example'].src).items;
  T.eq(mt.filter((it) => it.k === 'block').length, 1);
  T.ok(mt.some((it) => it.k === 'style' && it.name === 'inststyle'), 'the instance style');
});

T.test('umlsd: the demos are laid out as pdflatex lays them out', () => {
  for (const [name, { src, bb }] of Object.entries(DEMOS)) {
    const L = LO(src), b = L.bbPt;
    // heights are exact; widths follow the text, measured by the browser's font (about 1% from TeX's)
    near(b.y1, bb[1], 0.05, `${name}: bottom`); near(b.y2, bb[3], 0.05, `${name}: top`);
    near(b.x1, bb[0], 0.05, `${name}: left`); near(b.x2, bb[2], 2.5, `${name}: right`);
    T.eq(L.warnings, [], `${name}: ${L.warnings.join('; ')}`);
  }
});

T.test('umlsd: calls, self calls and messages: their ends, tips and labels', () => {
  const L = LO(DEMOS['nested-call'].src), U = SD.U, E = 3.33298 + 0.2;
  const [t, a] = L.order;
  // the first call: from t's lifeline to a's, one level and 0.7 down, stopping at the empty nodes' borders
  const call = L.lines.find((l) => !l.ret && l.ref.join() === '3'), y = -0.5 * U - 1.7 * U;
  near(call.pts[0][1], y, 1e-6, 'its height');
  near(call.pts[0][0], t.x + E, 1e-6, 'starts at t'); near(call.pts[1][0], a.x - E, 1e-6, 'ends at a');
  T.eq(call.tip, 'triangle 60');
  const ret = L.lines.find((l) => l.ret && l.ref.join() === '3');
  T.eq([ret.tip, ret.dash], ['angle 60', 'dash'], 'the return: dashed, an open tip');
  const lb = L.labels.find((l) => l.ref.join() === '3' && l.key === 't');
  near(lb.box.y - lb.box.h - 0.2, y, 1e-6, 'the label sits above its line');
  // a self call: out 0.8cm, down 0.33 of a level, back to its bar
  const S = LO(DEMOS.callself.src), sl = S.lines.find((l) => !l.ret);
  T.eq(sl.pts.length, 4);
  near(sl.pts[1][0] - sl.pts[0][0], 0.8 * SD.CM, 1e-6, 'out');
  near(sl.pts[1][1] - sl.pts[2][1], 0.33 * U, 1e-6, 'down');
  // a message sent later arrives lower (a delay of 1 level)
  const N = LO(DEMOS['non-instantaneous-message'].src), m = N.lines[0];
  T.ok(m.pts[1][1] < m.pts[0][1] - U + 2 * E + 1e-6 && m.pts[1][1] < m.pts[0][1] - U / 2, 'it slopes down a level (less the ends cut off)');
});

T.test('umlsd: the export interrupts the picture for the environment; import reads it back', () => {
  const s = T.make('umlsd');
  T.eq(s.src, TD.UMLSD_DEFAULT);
  s.x = 120; s.y = 80;
  const out = TD.toTikz([s], { standalone: true });
  T.ok(/\\usepackage\{pgf-umlsd\}/.test(out), 'package:\n' + out);
  // a plain node: inner sep=0pt would carry into pgf-umlsd's empty nodes and draw the bars as hairlines
  T.ok(/\\node at \([^)]*\) \{\\pgfinterruptpicture%/.test(out), 'in a plain node:\n' + out);
  // centred left of the picture by half the four spaces pgf-umlsd sets before it (13.33pt), which pdflatex boxes with it
  const b = SD.layout(s).bb, cx = +/\\node at \(([-\d.]+),/.exec(out)[1];
  near(cx, (s.x + b.w / 2) / 40 - 13.3333 / 2 / SD.CM, 0.006, 'node centre (cm)');
  T.ok(out.includes('\\begin{call}{c}{request()}{s}{response}'), 'the code as written');
  T.tex('umlsd-default', out);
  const back = TD.importLatex(out).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type === 'umlsd');
  T.eq(back.length, 1, 'read back as a sequence diagram');
  T.eq(back[0].src, s.src, 'the same code');
  near(back[0].x, s.x, 0.5, 'x'); near(back[0].y, s.y, 0.5, 'y');
  // one written by hand, outside any picture, comes in as one too
  const doc = `\\documentclass{article}\n\\usepackage{pgf-umlsd}\n\\begin{document}\n\\begin{figure}\n${DEMOS.block.src}\n\\end{figure}\n\\end{document}\n`;
  const h = TD.importLatex(doc).blocks.flatMap((b) => b.shapes || []).filter((x) => x.type === 'umlsd');
  T.eq(h.length, 1, 'one sequence diagram');
  T.eq(SD.parse(h[0].src).items.length, SD.parse(DEMOS.block.src).items.length, 'all of it');
});

T.test('umlsd: features compile with pdflatex', () => {
  const a = T.make('umlsd');
  a.src = DEMOS['multi-threads-example'].src;
  const b = T.make('umlsd', { set: { x: 0, y: 700 } });
  b.src = DEMOS.customize.src;
  const c = T.make('umlsd', { set: { x: 500, y: 700 } });
  c.src = ['\\begin{sequencediagram}', '  \\newinst{a}{A}', '  \\newinst[2]{b}{B}', '  \\begin{messcall}{a}{go()}{b}', '  \\end{messcall}', '  \\mess[1]{b}{done}{a}',
    '  \\begin{call}{a}{\\small ask()}{b}{\\shortstack{one\\\\two}}', '  \\end{call}', '\\end{sequencediagram}'].join('\n');
  T.eq(LO(c.src).warnings, [], LO(c.src).warnings.join('; '));
  // \mess names two nodes after its text: a command there doesn't compile, and is named
  T.ok(LO('\\begin{sequencediagram}\\newinst{a}{A}\\newinst{b}{B}\\mess{a}{\\small x}{b}\\end{sequencediagram}').warnings.some((w) => /names nodes after/.test(w)), 'a warning');
  T.tex('umlsd-features', TD.toTikz([a, b, c], { standalone: true }));
});

T.test('umlsd editor: draw messages between lifelines, nest them, change and delete them, with undo', async () => {
  const ED = TD.umlsdEditor;
  let got = null;
  ED.open(sd(TD.UMLSD_DEFAULT), (r) => { got = r; });
  await sleep(50);
  const E = ED._state(), svg = document.querySelector('#umlsdModal .sd-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y, target = svg) => target.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const code = () => document.querySelector('#umlsdModal .cz-code textarea').value;
  const lane = (v) => { const n = ED._lay().order.find((x) => x.v === v); return ED._P(n.x, 0)[0]; };
  const at = (y) => ED._P(0, y)[1];
  const drag = (x0, y0, x1, y1) => { E.drag = null; ev('pointerdown', x0, y0); ev('pointermove', (x0 + x1) / 2, (y0 + y1) / 2 + 1); ev('pointermove', x1, y1); ev('pointerup', x1, y1); };
  const panel = () => document.querySelector('#umlsdModal .cz-props').textContent;
  try {
    // inside the request() call's activation on s: a message from s to c goes in that call's body
    const U = SD.U, outer = ED._lay().spans.find((s) => s.k === 'call' && s.ref.join() === '3');
    const inner = ED._lay().spans.find((s) => s.ref.join() === '3,0');
    key('m'); T.eq(E.kind, 'mess', 'M: messages');
    const y = (inner.y1 + outer.y1) / 2;
    drag(lane('s'), at(y), lane('c'), at(y));
    T.ok(/\\end\{call\}\n {4}\\mess\{s\}\{message\}\{c\}\n {2}\\end\{call\}/.test(code()), 'after the query, inside request():\n' + code());
    T.eq(E.sel.join(), '3,1', 'and selected');
    // the palette turns it into another kind
    document.querySelector('#umlsdModal .qe-item[data-item="call"]').click();
    T.ok(/\\begin\{call\}\{s\}\{message\}\{c\}\{\}\n {4}\\end\{call\}/.test(code()), 'now a call:\n' + code());
    // below everything, from d down along its own lifeline: a self call at the end
    key('c');
    const low = ED._lay().bbPt.y1 + U;
    drag(lane('d'), at(low), lane('d') + 2, at(low) + 40);
    T.ok(/\\begin\{callself\}\{d\}\{self\(\)\}\{\}\n {2}\\end\{callself\}\n\\end\{sequencediagram\}/.test(code()), 'a self call at the end:\n' + code());
    // an instance: I adds one after the last; renaming it renames its messages
    ED._select([1]);
    key('i');
    T.ok(/\\newinst\[1\]\{s\}\{:Server\}\n {2}\\newinst\{i1\}\{:Object1\}/.test(code()), 'after the selected one:\n' + code());
    ED._select([0]);
    const inp = () => document.querySelector('#umlsdModal .cz-props [data-f="ivar"]');
    inp().focus(); inp().value = 'cl'; inp().dispatchEvent(new Event('input', { bubbles: true })); inp().blur();
    T.ok(/\\newthread\{cl\}/.test(code()) && /\\begin\{call\}\{cl\}\{request\(\)\}\{s\}/.test(code()) && /\{s\}\{message\}\{cl\}/.test(code()) && !/\{c\}/.test(code()), 'renamed at both ends:\n' + code());
    // dragging an instance sideways reorders the instances
    const before = code();
    const dn = ED._lay().order.find((x) => x.v === 'd'), [dx, dy] = ED._P(dn.x, 0);
    E.drag = null; ev('pointerdown', dx, dy); ev('pointermove', dx - 40, dy); ev('pointermove', lane('cl') - 30, dy); ev('pointerup', lane('cl') - 30, dy);
    T.eq(ED._lay().order.map((n) => n.v).join(), 'd,cl,s,i1', 'd first');
    key('z', { metaKey: true });
    T.eq(code(), before, 'undo');
    // deleting a call keeps what it holds
    ED._select([4]);
    T.ok(/Call/.test(panel()), panel());
    key('Backspace');
    T.ok(!/request\(\)/.test(code()) && /\\begin\{call\}\{s\}\{query\(\)\}\{d\}\{rows\}/.test(code()), 'request() gone, query() kept:\n' + code());
    // deleting an instance takes out its messages
    ED._select([3]);
    key('Backspace');
    T.ok(!/\{d\}/.test(code()) && !/query/.test(code()), 'd and its messages gone:\n' + code());
    const now = code();
    key('Enter', { metaKey: true });
    await sleep(20);
    T.ok(got && got.src === now, 'onDone gets the code');
  } finally {
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('umlsd editor: double-click a label to edit it in place; a block goes round the selection', async () => {
  const ED = TD.umlsdEditor;
  ED.open(sd(TD.UMLSD_DEFAULT), () => {});
  await sleep(50);
  const E = ED._state(), svg = document.querySelector('#umlsdModal .sd-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const code = () => document.querySelector('#umlsdModal .cz-code textarea').value;
  try {
    const lb = ED._lay().labels.find((l) => l.key === 'r' && l.ref.join() === '3'), [l, t] = ED._P(lb.box.x, lb.box.y), [r, b] = ED._P(lb.box.x + lb.box.w, lb.box.y - lb.box.h);
    const x = (l + r) / 2, y = (t + b) / 2;
    ev('pointerdown', x, y); ev('pointerup', x, y);
    T.eq(E.sel.join(), '3', 'the call');
    await sleep(400);
    ev('pointerdown', x, y); ev('pointerup', x, y); ev('pointerdown', x, y); ev('pointerup', x, y);
    const ta = document.querySelector('.td-pop-ta:not(.leaving), .td-pop-ml:not(.leaving), .td-pop input, .td-pop textarea');
    T.ok(ta, 'a box to type in');
    ta.value = 'ok'; ta.dispatchEvent(new Event('input', { bubbles: true }));
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await sleep(20);
    T.ok(/\{request\(\)\}\{s\}\{ok\}/.test(code()), 'the return value:\n' + code());
    key('b');
    T.ok(/\\begin\{sdblock\}\{loop\}\{\}\n {4}\\begin\{call\}\{c\}/.test(code()), 'a block round the call:\n' + code());
    T.eq(ED._lay().frames.length, 1);
    T.eq(ED._lay().warnings, []);
  } finally {
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});

T.test('umlsd: an instance named before its \\newinst is an error in the LaTeX check, and settle moves it up', () => {
  const late = ['\\begin{sequencediagram}', '  \\newinst{a}{A}', '  \\mess{a}{hi}{b}', '  \\newinst[1]{b}{B}', '  \\newinst[1]{c}{C}', '  \\mess{b}{yo}{c}', '\\end{sequencediagram}'].join('\n');
  const errs = (src) => TD.lint(TD.toTikz([sd(src)], { standalone: true })).filter((d) => d.sev === 'error');
  const L = errs(late);
  T.eq(L.length, 1, JSON.stringify(L));
  T.ok(/"b" is used before its \\newinst/.test(L[0].msg), L[0].msg);
  T.eq(errs(TD.UMLSD_DEFAULT), [], 'the default is fine');
  for (const [name, { src }] of Object.entries(DEMOS)) T.eq(SD.lateRefs(SD.parse(src).items), [], name);
  const M = SD.parse(late);
  T.ok(SD.settle(M), 'changed');
  T.eq(M.items.map((it) => it.v || it.t).join(), 'a,b,hi,c,yo', 'b (and only b) moved up; the instances keep their order');
  T.eq(errs(SD.write(M)), [], 'settled');
  const ok = ['\\begin{sequencediagram}', '  \\newinst{a}{A}', '  \\newinst[1]{b}{B}', '  \\mess{a}{hi}{b}', '  \\newinst[1]{c}{C}', '  \\mess{b}{yo}{c}', '\\end{sequencediagram}'].join('\n');
  T.eq(JSON.stringify(LO(SD.write(M)).boxes), JSON.stringify(LO(ok).boxes), 'drawn as the same diagram');
  T.ok(!SD.settle(SD.parse(ok)), 'in order already: unchanged');
  const styled = late.replace('  \\newinst[1]{b}', '  \\tikzstyle{inststyle}+=[fill=red!10]\n  \\newinst[1]{b}');
  T.ok(!SD.settle(SD.parse(styled)), 'not across a style change: left as written');
  T.tex('umlsd-settled', TD.toTikz([sd(SD.write(M))], { standalone: true }));
});

T.test('umlsd editor: reordering instances written between messages keeps every instance before its messages', async () => {
  const ED = TD.umlsdEditor;
  const src = ['\\begin{sequencediagram}', '  \\newinst{a}{A}', '  \\newinst[1]{b}{B}', '  \\mess{a}{hi}{b}', '  \\newinst[1]{c}{C}', '  \\mess{b}{yo}{c}', '\\end{sequencediagram}'].join('\n');
  ED.open(sd(src), () => {});
  await sleep(50);
  const E = ED._state(), svg = document.querySelector('#umlsdModal .sd-svg'), R = svg.getBoundingClientRect();
  const ev = (t, x, y) => svg.dispatchEvent(new PointerEvent(t, { bubbles: true, clientX: R.left + x, clientY: R.top + y, button: 0, pointerId: 1 }));
  const key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...o }));
  const code = () => document.querySelector('#umlsdModal .cz-code textarea').value;
  try {
    const lane = (v) => ED._P(ED._lay().order.find((x) => x.v === v).x, 0);
    const [cx, cy] = lane('c'), [ax] = lane('a');
    E.drag = null; ev('pointerdown', cx, cy); ev('pointermove', cx - 40, cy); ev('pointermove', ax - 30, cy); ev('pointerup', ax - 30, cy);
    T.eq(ED._lay().order.map((n) => n.v).join(), 'c,a,b', 'c first');
    T.eq(SD.lateRefs(SD.parse(code()).items), [], 'every instance before its messages:\n' + code());
    T.eq(ED._lay().warnings, [], 'no warnings');
    T.eq(SD.parse(code()).items[E.sel[0]].v, 'c', 'c still selected');
  } finally {
    if (ED._state()) { ED._state().start = null; key('Escape'); key('Escape'); key('Escape'); await sleep(10); const d = document.querySelector('.td-dialog button.danger, .td-dialog .primary'); if (d) d.click(); }
  }
});
