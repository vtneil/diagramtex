// Usage: node scripts/gen-texcommands.js
// Build js/texcommands.js: every command KaTeX / Temml know, with how many {} arguments it needs,
// whether it works in maths or only in text mode, and which engines support it.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', 'public');
const load = (f, name) => new Function(fs.readFileSync(path.join(ROOT, f), 'utf8') + `;return ${name};`)();
const engines = { k: load('vendor/katex/katex.min.js', 'katex'), t: load('vendor/temml/temml.min.js', 'temml') };

const names = new Set();
for (const f of ['vendor/katex/katex.min.js', 'vendor/temml/temml.min.js']) {
  for (const m of fs.readFileSync(path.join(ROOT, f), 'utf8').matchAll(/"\\\\([A-Za-z]+)"/g)) names.add(m[1]);
}
// TeX plumbing, not something to type into a label
const SKIP = new Set(('def gdef edef xdef let futurelet global long newcommand renewcommand providecommand relax expandafter noexpand ' +
  'char csname endcsname begin end TextOrMath mathchoice nonumber notag tag label ref eqref url href includegraphics htmlClass htmlId ' +
  'htmlStyle htmlData html newline cr hline hdashline crcr limits nolimits displaylimits verb mathstrut vphantom hphantom phantom ' +
  'raisebox vcenter rule kern mkern mskip hskip hspace hspacestar nobreak allowbreak middle left right bigl bigr Bigl Bigr biggl biggr ' +
  'Biggl Biggr bigm Bigm biggm Biggm big Big bigg Bigg strut endgroup bgroup egroup begingroup color textcolor colorbox fcolorbox ' +
  'operatornamewithlimits copyright lq rq').split(/\s+/));

const ok = (eng, tex) => { try { eng.renderToString(tex, { throwOnError: true }); return true; } catch (e) { return false; } };
const ARGS = ['', '{x}', '{x}{y}', '{x}{y}{z}'];
const out = [];
for (const n of [...names].sort()) {
  if (SKIP.has(n) || n.length < 2) continue;
  const rec = { n };
  let found = false;
  for (const [key, eng] of Object.entries(engines)) {
    for (let a = 0; a < ARGS.length; a++) {
      if (ok(eng, `\\${n}${ARGS[a]}`)) { rec[key] = a; found = true; break; }
      if (ok(eng, `\\text{\\${n}${ARGS[a]}}`)) { rec[key] = a; rec.tx = 1; found = true; break; }
    }
  }
  if (found) out.push(rec);
}
// compact: [name, katexArity|-1, temmlArity|-1, textOnly]
const rows = out.map((r) => [r.n, r.k ?? -1, r.t ?? -1, r.tx ? 1 : 0]);
const body = `// Generated from vendor/katex and vendor/temml by scripts/gen-texcommands.js. Do not edit by hand.
// Each row: [name, KaTeX arity (-1 = unsupported), Temml arity (-1 = unsupported), text mode only (1)]
window.TD = window.TD || {};
window.TD.TEX_COMMANDS = ${JSON.stringify(rows)};
`;
fs.writeFileSync(path.join(ROOT, 'js/texcommands.js'), body);
const both = rows.filter((r) => r[1] >= 0 && r[2] >= 0).length;
console.log(`candidates ${names.size}, usable ${rows.length} (both ${both}, KaTeX only ${rows.filter((r) => r[1] >= 0 && r[2] < 0).length}, Temml only ${rows.filter((r) => r[1] < 0 && r[2] >= 0).length}), text-only ${rows.filter((r) => r[3]).length}`);
