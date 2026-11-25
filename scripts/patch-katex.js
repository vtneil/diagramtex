// KaTeX with the layout rules where it differs from TeX, made once at maintenance time (like
// scripts/generate-label-glyphs.js): public/vendor/katex/katex.min.js as published, written to katex-td1.min.js with
// these edits of its minified code. Each must match exactly once, so a new KaTeX fails here instead of being half
// patched. A changed patch gets a new file name (td2 …): vendor files are cached for a year.
//
//   node scripts/patch-katex.js           (--check: fail when the patched file is stale)
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '../public/vendor/katex');
const source = fs.readFileSync(path.join(dir, 'katex.min.js'), 'utf8');
if (!source.includes('version:"0.19.1"')) throw new Error('patch-katex: written for KaTeX 0.19.1');

// The position option, read before the rows: gathered takes any [text] (only t and b count), aligned only [t], [c] or
// [b] (with anything else, the brackets and what they hold are the first row's: measured in TeX Live 2026)
const POSITION = '(e=>{e.consumeSpaces();if("["!==e.fetch().text)return"";let t="";for(e.consume();"]"!==e.fetch().text&&"EOF"!==e.fetch().text;e.consume())t+=e.fetch().text;return"]"===e.fetch().text&&e.consume(),t.trim()})(e.parser)';
const ALIGNED_POSITION = '(e=>{e.consumeSpaces();if("["!==e.fetch().text)return"";const g=e.gullet,t=g.future();if(1!==t.text.length||!"tcb".includes(t.text))return"";g.popToken();if("]"!==g.future().text)return g.pushToken(t),"";return g.popToken(),e.consume(),t.text})(e.parser)';
const PATCHES = [
  // Limits on an operator with an italic correction δ (\int\limits): TeX moves the upper limit δ/2 right and the
  // lower one δ/2 left, in a box as wide as the widest of the three (TeX §750: shift_amount, width(v)); KaTeX widened
  // the box by δ, and put a spacer of δ before a lower limit
  ['{type:"elem",elem:a.elem,marginLeft:N(-s)}', '{type:"elem",elem:a.elem,marginLeft:N(-s/2),marginRight:N(s/2)}', 2],
  ['{type:"elem",elem:c.elem,marginLeft:N(s)}', '{type:"elem",elem:c.elem,marginLeft:N(s/2),marginRight:N(-s/2)}', 2],
  ['if(a&&0!==s&&!l){const e=We(["mspace"],[],n);e.style.marginRight=N(s),u.unshift(e)}', ''],
  // amsmath's rows (aligned, gathered, split, align* …: \spread@equation is \openup\jot) are lines of a paragraph:
  // TeX's interline glue puts baselines \baselineskip+\jot (15pt) apart, or \lineskip+\jot (4pt) between depth and
  // height when they come closer than \lineskiplimit+\jot (3pt). KaTeX's rows are depth+\jot+height apart: 1pt
  // short whenever a row's depth and the next one's height are more than the strut's 12pt
  ['for(x(i[0]),r=0;r<e.body.length;++r){', 'const tdI="CD"!==e.colSeparationType&&e.addJot;let tdP=0;for(x(i[0]),r=0;r<e.body.length;++r){'],
  // (inside an array, matrix or cases, whose \baselineskip and \lineskip are 0: \lineskip+\jot is \jot, as KaTeX has it;
  // mathtools' multlined, written as a gathered marked \tdmultlined (math-rewrite.ts), has its first two lines 1pt nearer
  // unless the first is deeper and the second taller than the strut: measured in TeX Live)
  ['c<e.depth&&(c=e.depth),s<e.height&&(s=e.height),h.cells[o]=e}const m=e.rowGaps[r];',
    'c<e.depth&&(c=e.depth),s<e.height&&(s=e.height),h.cells[o]=e}tdI&&!e.tdArr&&r>0&&tdP+s>p+1e-6&&(y+=d/3),e.tdML&&1===r&&!(tdP>b+1e-6&&s>f+1e-6)&&(y-=d/3),tdP=c;const m=e.rowGaps[r];'],
  // (whether an environment is inside an array, matrix or cases: parseArray marks it on the parser while it reads one)
  ['function an(e,t,r){let o=t.hskipBeforeAndAfter,', 'function an(e,t,r){const tdO=e.tdArr;t.addJot||(e.tdArr=!0);let o=t.hskipBeforeAndAfter,'],
  ['return e.gullet.endGroup(),e.gullet.endGroup(),{type:"array",mode:e.mode,addJot:s,', 'return e.gullet.endGroup(),e.gullet.endGroup(),e.tdArr=tdO,{type:"array",mode:e.mode,tdArr:!!tdO,addJot:s,'],
  // … and their \\[dim] is a \vskip of dim after the row (amsmath's \math@cr@@@), where array's \\[dim] deepens the
  // row's strut
  ['m&&(u=H(m,t),u>0&&(u+=b,c<u&&(c=u),u=0))', 'm&&(u=H(m,t),tdI||u>0&&(u+=b,c<u&&(c=u),u=0))'],
  // aligned[t] and gathered[t] set the first row on the baseline (\vtop), [b] the last (\vbox); centred on the axis
  // otherwise (\vcenter)
  ['const w=y/2+t.fontMetrics().axisHeight', 'const w="t"===e.tdPos&&s?a[0].pos:"b"===e.tdPos&&s?a[s-1].pos:y/2+t.fontMetrics().axisHeight'],
  ['pn=function(e,t){e.envName.includes("ed")||on(e);const r=[],', `pn=function(e,t){e.envName.includes("ed")||on(e);const tdV="aligned"===e.envName?${ALIGNED_POSITION}:"",r=[],`],
  ['return s.colSeparationType=c?"align":"alignat",s}', 'return s.colSeparationType=c?"align":"alignat",s.tdPos=tdV,s}'],
  ['handler(e){sn.has(e.envName)&&on(e);const t={cols:[{type:"align",align:"c"}],addJot:!0,colSeparationType:"gather",autoTag:ln(e.envName),emptySingleRow:!0,leqno:e.parser.settings.leqno};return an(e.parser,t,"display")}',
    `handler(e){sn.has(e.envName)&&on(e);const tdV="gathered"===e.envName?${POSITION}:"",t={cols:[{type:"align",align:"c"}],addJot:!0,colSeparationType:"gather",autoTag:ln(e.envName),emptySingleRow:!0,leqno:e.parser.settings.leqno},tdR=an(e.parser,t,"display");return tdR.tdML=tdV.includes("\\\\tdmultlined"),tdR.tdPos=tdV.replace("\\\\tdmultlined","").trim(),tdR}`],
  // An array's column padding (\hskip\arraycolsep) as space after an empty mark, as \kern is, not a box that wide:
  // WebKit sizes a box by the furthest thing in it, so a padding a negative kern pulls back past the formula's start
  // (math-rewrite.ts's @{…}) would widen the formula and move it right
  ['0!==i&&(z=We(["arraycolsep"],[]),z.style.width=N(i),k.push(z))', '0!==i&&(z=We(["arraycolsep"],[]),z.style.marginRight=N(i),k.push(z))', 2],
];
let out = source;
for (const [from, to, count = 1] of PATCHES) {
  const n = out.split(from).length - 1;
  if (n !== count) throw new Error(`patch-katex: ${JSON.stringify(from.slice(0, 60))} found ${n} times, not ${count}`);
  out = out.split(from).join(to);
}
out = '/*! KaTeX 0.19.1 with DiagramTeX\'s layout patches (scripts/patch-katex.js); see LICENSE */\n' + out;
const target = path.join(dir, 'katex-td1.min.js');
if (process.argv.includes('--check')) {
  if (fs.readFileSync(target, 'utf8') !== out) throw new Error('katex-td1.min.js is stale: run node scripts/patch-katex.js');
} else fs.writeFileSync(target, out);
console.log(`${PATCHES.length} patches; ${out.length} bytes`);
