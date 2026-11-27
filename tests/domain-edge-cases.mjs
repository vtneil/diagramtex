// Edge cases in the domain modules found by the 2026-11-27 audit (docs/qa/2026-11-27-audit/NOTES.md): xlsx `#`
// decimals (#13), \cellcolor with values out of range (#25b), table LaTeX with newlines in maths or environments
// and \\cr / \\begin (#14), prototype names in the parameter expressions (#29), \ang with four parts (#30).
// Not here: geo3d's evaluator (#29) and mathinput's fromMath (#23) need the browser runtime to load.
import assert from 'node:assert/strict';
import { build } from 'esbuild';

const load = async (contents) => {
  const r = await build({ stdin: { contents, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'esm', logLevel: 'silent' });
  return import(`data:text/javascript;base64,${Buffer.from(r.outputFiles[0].text).toString('base64')}`);
};
const { formatXlsxNumber, fromLatex, create, toLatex, safeTex, rewriteMath, runtime } = await load(`
  export { formatXlsxNumber, fromLatex } from './src/domain/table/import.ts';
  export { create } from './src/domain/table/model.ts';
  export { toLatex, safeTex } from './src/domain/table/latex.ts';
  export { rewriteMath } from './src/domain/math-rewrite.ts';
  import './src/domain/params.ts';
  export { runtime } from './src/runtime.ts';
`);

let failed = 0;
const check = (name, f) => {
  try { f(); console.log(`[PASSED] ${name}`); } catch (e) { failed++; console.log(`[FAILED] ${name}\n  ${e.message.split('\n').join('\n  ')}`); }
};

// ---- #13 xlsx number formats
check('xlsx: # decimals show only the places needed', () => {
  assert.equal(formatXlsxNumber(3.14, '0.##'), '3.14');
  assert.equal(formatXlsxNumber(3.1, '0.##'), '3.1');
  assert.equal(formatXlsxNumber(3, '0.##'), '3');
  assert.equal(formatXlsxNumber(3.14159, '0.##'), '3.14');
  assert.equal(formatXlsxNumber(3.14, '0.0#'), '3.14');
  assert.equal(formatXlsxNumber(3, '0.0#'), '3.0', 'the 0 place stays');
  assert.equal(formatXlsxNumber(1234.5, '#,##0.###'), '1,234.5');
  assert.equal(formatXlsxNumber(-0.5, '0.##'), '-0.5');
  assert.equal(formatXlsxNumber(0.1234, '0.#%'), '12.3\\%');
});
check('xlsx: 0 decimals and integers unchanged', () => {
  assert.equal(formatXlsxNumber(3.14159, '0.00'), '3.14');
  assert.equal(formatXlsxNumber(3, '0.00'), '3.00');
  assert.equal(formatXlsxNumber(1234567.891, '#,##0.00'), '1,234,567.89');
  assert.equal(formatXlsxNumber(1234.6, '#,##0'), '1,235');
  assert.equal(formatXlsxNumber(0.25, '0%'), '25\\%');
});

// ---- #25b colours read from \cellcolor
const bg = (spec) => fromLatex(`\\begin{tabular}{l}\n\\cellcolor${spec} a \\\\\n\\end{tabular}`).table.cells[0][0].bg;
check('cellcolor: rgb / RGB / gray in range', () => {
  assert.equal(bg('[rgb]{1,0.5,0}'), '#ff8000');
  assert.equal(bg('[RGB]{255,128,0}'), '#ff8000');
  assert.equal(bg('[gray]{0.5}'), '#808080');
  assert.equal(bg('[HTML]{AABBCC}'), '#aabbcc');
});
check('cellcolor: out of range clamps, not a number is dropped', () => {
  assert.equal(bg('[rgb]{2,-1,0.5}'), '#ff0080');
  assert.equal(bg('[RGB]{300,-5,16}'), '#ff0010');
  assert.equal(bg('[gray]{1.5}'), '#ffffff');
  assert.equal(bg('[rgb]{a,b,c}'), undefined);
  assert.equal(bg('[RGB]{1,2,x}'), undefined);
  assert.equal(bg('[gray]{x}'), undefined);
  assert.equal(bg('[gray]{}'), undefined);
});

// ---- #14 table LaTeX
const cell = (t, wrap = false) => {
  const m = create(1, 1, 'plain');
  m.cells[0][0].t = t;
  if (wrap) m.cols[0].w = 3;
  const code = toLatex(m, { bare: true }).code;
  return code.split('\n').find((l) => /\\\\\s*$/.test(l)).trim().replace(/\s*\\\\$/, '');
};
check('table LaTeX: ordinary cells unchanged', () => {
  assert.equal(cell('plain'), 'plain');
  assert.equal(cell('two\nlines'), '\\begin{tabular}[t]{@{}l@{}}two \\\\ lines\\end{tabular}');
  assert.equal(cell('two\\\\lines'), '\\begin{tabular}[t]{@{}l@{}}two \\\\ lines\\end{tabular}');
  assert.equal(cell('two\nlines', true), 'two \\newline lines');
  assert.equal(cell('$x^2$ a_b & 100%'), '$x^2$ a\\_b \\& 100\\%');
  assert.equal(cell('$\\begin{pmatrix}1 & 2 \\\\ 3 & 4\\end{pmatrix}$'), '$\\begin{pmatrix}1 & 2 \\\\ 3 & 4\\end{pmatrix}$');
});
check('table LaTeX: a newline in maths or an environment is a space', () => {
  assert.equal(cell('$a +\nb$'), '$a + b$');
  assert.equal(cell('$\\begin{pmatrix}\n1 & 2 \\\\\n3 & 4\n\\end{pmatrix}$'), '$\\begin{pmatrix} 1 & 2 \\\\ 3 & 4 \\end{pmatrix}$');
  assert.equal(cell('$\\begin{cases}a\\\\\nb\\end{cases}$\nnext'), '\\begin{tabular}[t]{@{}l@{}}$\\begin{cases}a\\\\ b\\end{cases}$ \\\\ next\\end{tabular}');
  assert.equal(cell('$a\n\nb$', true), '$a  b$', 'no blank line (a paragraph) in maths');
});
check('table LaTeX: \\\\cr and \\\\begin are a line break and a word', () => {
  assert.equal(safeTex('$a\\\\cr$'), '$a\\\\cr$');
  assert.equal(safeTex('\\begin{pmatrix}a\\\\begin{x}\\end{pmatrix}'), '\\begin{pmatrix}a\\\\begin{x}\\end{pmatrix}');
  assert.equal(safeTex('$a\\cr$'), '$a\\textbackslash{}cr$', 'a lone \\cr is still guarded');
  assert.equal(safeTex('$a\\\\\\cr$'), '$a\\\\\\textbackslash{}cr$', '\\\\ then \\cr');
  assert.equal(safeTex('x \\end{tabular}'), 'x \\textbackslash{}end\\{tabular\\}');
});

// ---- #29 parameter expressions
const P = runtime.params;
const val = (src, vars = {}) => P.evaluate(P.parse(src), (r) => { if (r[0] in vars) return vars[r[0]]; throw new Error(`nothing called ${r[0]}`); });
check('params: functions and constants still work', () => {
  assert.equal(val('sqrt(16) + max(1, 2)'), 6);
  assert.ok(Math.abs(val('sin(30)') - 0.5) < 1e-12);
  assert.equal(P.okName('w'), true);
  assert.equal(P.okName('sin'), false);
  assert.equal(P.okName('pi'), false);
  assert.ok(P.anchors.includes('north'));
});
check('params: toString, valueOf, constructor are not functions', () => {
  for (const f of ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__']) {
    assert.throws(() => P.parse(`${f}(1)`), /no function called/, f);
    assert.equal(P.okName(f), true, `${f} can name a variable`);
  }
});

// ---- #30 \ang
check('\\ang: up to three parts, a fourth is dropped', () => {
  assert.ok(!/undefined/.test(rewriteMath('\\ang{1;2;3;4}')), rewriteMath('\\ang{1;2;3;4}'));
  assert.equal(rewriteMath('\\ang{1;2;3;4}'), rewriteMath('\\ang{1;2;3}'));
  assert.ok(/circ/.test(rewriteMath('\\ang{30}')));
});

if (failed) { console.log(`${failed} domain edge-case check(s) failed`); process.exit(1); }
console.log('Domain edge-case checks passed');
