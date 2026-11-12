// Quantum circuits (js/quantum.js): every quantikz2 command in the manual is read and drawn, with the
// package's geometry (swap gates, classical and bundled wires, meters, slices, groups) and its colours.
const QC = TD.qc;
const qc = (src) => ({ type: 'qc', x: 0, y: 0, src, size: 'normalsize', font: 'default', color: '#000000' });
const L = (src) => QC.layout(qc(src));
const svg = (src) => QC.draw(qc(src), { export: true, paper: '#ffffff' });
const wrap = (body, env = '') => `\\begin{quantikz}${env ? `[${env}]` : ''}\n${body}\n\\end{quantikz}`;
const near = (a, b, tol, msg) => T.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const PX = TD.PX_PER_CM;

const CASES = {
  wires: wrap('& \\gate{H} & & \\setwiretype{q} & \\\\\n& \\gate{H} & & & \\\\\n& \\gate{H} & \\ctrl[vertical wire=c]{-1} & & \\\\\n& \\gate{H} & & \\setwiretype{q} &', 'wire types={q,c,b,n}'),
  controls: wrap('& \\ctrl{1} & \\octrl{2} & \\ctrl[open]{1} & \\swap{1} & \\targ{} & \\\\\n& \\control{} & \\targ{} & \\ocontrol{} & \\targX{} & \\ctrl{-1} & \\\\\n& & \\control{} & & & &'),
  meters: wrap('& \\meter{} & \\metercw{x} & \\meter[2]{y} & \\\\\n& \\measure{x} & \\measuretab{x} & & \\\\\n\\inputD{0} & \\meterD{x} & & &'),
  gates: wrap('& \\gate[2,swap]{} & \\gate[2][1.7cm]{U}\\gateinput{$x$}\\gateoutput{$y$} & \\gate[3,disable auto height]{\\verticaltext{MAJ}} & \\\\\n& & \\gateinput{$a$}\\gateoutput{$b$} & & \\\\\n& \\gate{H} & & &'),
  sticks: wrap('\\lstick[2]{input} & \\gate{H} & \\midstick[2]{mid} & \\gate{X} & \\rstick[2,brackets=none]{out} \\\\\n& & & & \\\\\n\\lstick{\\ket{0}} & \\midstick[2,brackets=none]{=} & & & \\rstick{$\\frac{1}{\\sqrt 2}$} \\\\\n& & & &'),
  misc: wrap('& \\phase{\\alpha} & \\push{X} & \\phantomgate{wide} & \\hphantomgate{wide} & \\trash{\\text{trace}} \\\\\n& \\gate[2]{U} & \\linethrough & \\gate{H} & \\ground{} & \\\\\n& & \\ghost{H} & & &'),
  slices: wrap('& \\gate{H} & \\ctrl{1} & \\meter{} & \\\\\n& & \\targ{} & \\gate{H} &', 'slice all,remove end slices=1,slice titles=slice \\col,slice style=blue'),
  ebits: wrap('\\makeebit[angle=-60]{gen} & \\gate{H} & \\permute{2,1} & & \\\\\n& \\gate{X} & & & \\\\\n\\wave & & & & \\\\\n& \\gate{Z} & & &'),
  labels: wrap('& \\qwbundle{n} & \\gate{H}\\wire[d][1]{c} & \\wire[l][1]["p"{above,pos=0.2}]{a} \\\\\n& & \\gate{X} & \\meter{} \\wire[u][1]{c}', 'thin lines'),
  groups: wrap('& \\gate{H}\\slice{step} & \\ctrl{1} & \\meter{} \\\\\n& & \\targ{} & \\gate{H}\\gategroup[2,steps=2,style={dashed,rounded corners,fill=blue!20},background,label style={label position=below,anchor=north,yshift=-0.2cm}]{grp} & \\\\\n& \\gate{X} & & &'),
};

T.test('quantikz: every command in the manual is read and drawn, none skipped', () => {
  for (const [k, src] of Object.entries(CASES)) {
    const Lo = L(src);
    T.ok(!Lo.warnings.some((w) => /isn't drawn/.test(w)), `${k}: ${Lo.warnings.join(' | ')}`);
    T.ok(Lo.bb.w > 0 && Lo.bb.h > 0, `${k} has a size`);
    T.ok(svg(src).length > 200, `${k} draws`);
  }
  T.eq(QC.IGNORED.size, 0, 'nothing is parsed and then dropped');
});

T.test('quantikz: a swap gate is a box as wide as "Wide" with two crossing curves, one over a gap', () => {
  const Lo = L(wrap('& \\gate[2,swap]{} & \\\\\n& &'));
  const box = Lo.ops.find((o) => o.k === 'rect' && o.gate);
  T.ok(box, 'a gate box');
  T.ok(box.h > Lo.geo.cy[1] - Lo.geo.cy[0], 'it covers both wires');
  const curves = Lo.ops.filter((o) => o.k === 'path' && /C/.test(o.d));
  T.eq(curves.length, 3, 'two curves and the gap under the second');
  T.eq(curves.filter((o) => o.gap).length, 1, 'one gap');
  // \swap{1} with \targX{}: crosses on both wires, joined by a vertical line
  const S = L(wrap('& \\swap{1} & \\\\\n& \\targX{} &'));
  T.eq(S.ops.filter((o) => o.k === 'path' && /M.*L.*M.*L/.test(o.d)).length, 2, 'two crosses');
  T.ok(S.ops.some((o) => o.k === 'wire' && o.x1 === o.x2), 'the vertical link');
});

T.test('quantikz: a partial swap puts its label in a circle on the link, at partial position', () => {
  const Lo = L(wrap('& \\swap[partial swap=\\theta,partial position=0.25]{1} & \\\\\n& \\targX{} &'));
  const dot = Lo.ops.find((o) => o.k === 'dot' && o.open), t = Lo.ops.find((o) => o.k === 'text' && /theta/.test(o.t));
  T.ok(dot && t, 'circle and label');
  near(dot.y, Lo.geo.cy[0] + 0.25 * (Lo.geo.cy[1] - Lo.geo.cy[0]), 0.5, 'a quarter of the way down');
});

T.test('quantikz: classical wires are two lines a gap apart, bundles three, and classical gap sets the gap', () => {
  const two = (svg(wrap('& \\setwiretype{c} & \\gate{H} &')).match(/<path d="M[^"]*" stroke="#000000"/g) || []).length;
  const one = (svg(wrap('& & \\gate{H} &')).match(/<path d="M[^"]*" stroke="#000000"/g) || []).length;
  const three = (svg(wrap('& \\setwiretype{b} & \\gate{H} &')).match(/<path d="M[^"]*" stroke="#000000"/g) || []).length;
  T.ok(two > one && three > two, `quantum ${one}, classical ${two}, bundle ${three}`);
  T.eq(L(wrap('& \\gate{H} &', 'classical gap=0.1cm')).look.gap, 0.1 * PX, 'classical gap');
  T.ok(L(wrap('& \\gate{H} &', 'thin lines')).look.lw < L(wrap('& \\gate{H} &')).look.lw, 'thin lines are thinner');
});

T.test('quantikz: slice all puts a slice between every pair of steps, titled with \\col', () => {
  const Lo = L(CASES.slices);
  const sl = Lo.ops.filter((o) => o.k === 'line' && o.slice);
  T.eq(sl.length, 2, 'remove end slices=1 leaves two');
  T.ok(sl.every((o) => o.sc === '#0000ff'), 'slice style=blue');
  T.ok(Lo.ops.some((o) => o.k === 'text' && o.t === 'slice 1') && Lo.ops.some((o) => o.k === 'text' && o.t === 'slice 2'), 'titles');
});

T.test('quantikz: &[1cm] and \\\\[1cm] widen one gap; the cell text stays as written', () => {
  const a = L(wrap('& \\gate{H} & \\gate{X} &')), b = L(wrap('& \\gate{H} &[1cm] \\gate{X} &'));
  near((b.geo.cx[2] - b.geo.cx[1]) - (a.geo.cx[2] - a.geo.cx[1]), PX, 0.5, 'one more cm');
  T.eq(QC.grid('& \\gate{H} &[1cm] \\gate{X} &')[0][2], '[1cm] \\gate{X} ', 'kept verbatim for the editor');
  const c = L(wrap('& \\gate{H} \\\\[1cm]\n& \\gate{X}'));
  T.ok(c.geo.cy[1] - c.geo.cy[0] > a.geo.rowH[0] + PX, 'the row gap grows');
});

T.test('quantikz: colours from style, label style, the environment and wire styles', () => {
  const s = svg(wrap('& \\gate[style={fill=red!20,draw=red},label style={color=blue}]{H} & \\ctrl[style={draw=green}]{1} \\\\\n& & \\targ{}'));
  T.ok(/fill="#ffcccc"/i.test(s), 'fill=red!20');
  T.ok(/stroke="#ff0000"/i.test(s), 'draw=red');
  T.ok(/#0000ff/i.test(s), 'label style colour');
  T.ok(/stroke="#00ff00"/i.test(s), 'the control and its line in green');
  const e = svg(wrap('& \\gate{H} &', 'color=red,background color=yellow'));
  T.ok(/stroke="#ff0000"/i.test(e) && /fill="#ffff00"/i.test(e), 'environment colours');
  // draw= alone colours the box, not the label (as in quantikz)
  const lab = L(wrap('& \\gate[style={draw=red}]{H} &')).ops.find((o) => o.k === 'text');
  T.ok(!lab.tc, 'label stays in the ink');
  const tr = svg(wrap('& \\gate{H} &', 'transparent'));
  T.ok(/<rect[^>]*fill="none"/.test(tr), 'transparent: no fill');
});

T.test('quantikz: a background group is drawn first, others last; the label goes where label style says', () => {
  const Lo = L(CASES.groups);
  const gi = Lo.ops.findIndex((o) => o.k === 'rect' && o.fc), wi = Lo.ops.findIndex((o) => o.k === 'wire');
  T.ok(gi >= 0 && gi < wi, 'behind the wires');
  T.eq(Lo.ops[gi].fc, '#ccccff', 'fill=blue!20');
  const g = Lo.ops[gi], lab = Lo.ops.find((o) => o.k === 'text' && o.t === 'grp');
  T.ok(lab.y > g.y + g.h, 'below the box');
  const F = L(wrap('& \\gate{H}\\gategroup[1,steps=1]{g} &'));
  T.ok(F.ops.findIndex((o) => o.k === 'rect' && !o.gate) > F.ops.findIndex((o) => o.k === 'rect' && o.gate), 'over the circuit without background');
});

T.test('quantikz: wires stop at node borders, and run through phantoms and controls', () => {
  const Lo = L(wrap('& \\octrl{} & \\phantomgate{wide} & \\ctrl{} &'));
  const ws = Lo.ops.filter((o) => o.k === 'wire'), cx = Lo.geo.cx;
  T.ok(ws.some((w) => w.x2 < cx[1] - 1), 'stops at the open control');
  T.ok(ws.some((w) => w.x1 < cx[2] && w.x2 >= cx[2]), 'through the phantom');
  T.ok(ws.some((w) => w.x1 < cx[3] && w.x2 >= cx[3]) || ws.some((w) => w.x2 === cx[3]), 'into the control');
});

T.test('quantikz: the manual\'s examples compile', () => {
  for (const [k, src] of Object.entries(CASES)) {
    T.tex(`quantikz-${k}`, TD.toTikz([{ ...qc(src), id: 'q' }], { standalone: true }));
  }
});

T.test('quantikz: row sep and column sep, as a gap or between origins', () => {
  const body = '& \\gate{H} & \\ctrl{1} & \\meter{} \\\\\n& & \\targ{} & \\gate{X}';
  const pitch = L(wrap(body, 'row sep={1.5cm,between origins}, column sep={0.9cm,between origins}')).geo;
  near(pitch.cy[1] - pitch.cy[0], 1.5 * PX, 0.5, 'wire to wire');
  for (let i = 1; i < pitch.cx.length; i++) near(pitch.cx[i] - pitch.cx[i - 1], 0.9 * PX, 0.5, `step ${i} to step ${i + 1}`);
  const gap = L(wrap(body, 'row sep=1cm')).geo;
  near(gap.rowT[1] - gap.rowT[0] - gap.rowH[0], 1 * PX, 0.5, 'the gap between rows');
});

T.test('quantikz editor: the Circuit spacing fields write row sep / column sep, and switching the measure keeps the look', async () => {
  const body = '& \\gate{H} & \\ctrl{1} & \\meter{} \\\\\n& & \\targ{} & \\gate{X}';
  let got = null;
  TD.qcEditor.open(qc(wrap(body)), (r) => { got = r; });
  await new Promise((r) => setTimeout(r, 50));
  let root = document.querySelector('[data-f="Erow"]');
  while (root && !root.querySelector('[data-qe="done"]')) root = root.parentElement;
  const q = (s) => root.querySelector(s), head = () => q('.cz-code textarea').value.split('\n')[0];
  // as a person types: focus opens an undo step, leaving the field closes it (fired by hand: a background page gets no focus events)
  const type = (f, v) => {
    const i = q(`[data-f="${f}"]`);
    i.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    i.value = v; i.dispatchEvent(new Event('input', { bubbles: true }));
    q(`[data-f="${f}"]`).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); // the panel may have redrawn it
  };
  const mode = (axis, v) => q(`[data-qe="sepmode"][data-axis="${axis}"][data-v="${v}"]`).click();
  try {
    T.ok(q('[data-f="Erow"]') && q('[data-f="Ecol"]'), 'shown with nothing selected');
    type('Erow', '1');
    T.eq(head(), '\\begin{quantikz}[row sep=1cm]');
    mode('row', 'pitch');
    const m = /row sep=\{([\d.]+)cm,between origins\}/.exec(head());
    T.ok(m, 'between origins: ' + head());
    const before = L(wrap(body, 'row sep=1cm')).geo, after = L(wrap(body, `row sep={${m[1]}cm,between origins}`)).geo;
    near(after.cy[1] - after.cy[0], before.cy[1] - before.cy[0], 0.05 * PX, 'the wires stay put');
    mode('row', 'gap');
    T.eq(head(), '\\begin{quantikz}[row sep=1cm]', 'and back');
    type('Ecol', '0.3');
    T.eq(head(), '\\begin{quantikz}[row sep=1cm, column sep=0.3cm]');
    type('Erow', '');
    T.eq(head(), '\\begin{quantikz}[column sep=0.3cm]', 'an empty field removes the option');
    q('[data-qe="undo"]').click();
    T.eq(head(), '\\begin{quantikz}[row sep=1cm, column sep=0.3cm]', 'undo');
  } finally {
    q('[data-qe="done"]').click();
  }
  T.ok(got && /column sep=0\.3cm/.test(got.src), 'Done hands the options back');
});
