// Every timed toast names its kind (ok / info / warn / error / plain: src/ui/services/hint-toast.ts), at the call.
// A toast left to the default shows as info, and a message built before the call hides what it says, which is how
// "Autosaved in this browser" ended up blue. Live notes (no time) are the tools' instructions, info by design.
import fs from 'node:fs';

const FILES = {
  'src/application/app.ts': /\bshowHint\(/g,
  'src/application/docview.ts': /\bshowHint\?\.\(/g,
  'src/ui/services/table.ts': /\bhint\(/g, // the Table's helper: always timed (1600ms by default)
};
// the arguments of the call opening at `open`, split at its top-level commas (strings and templates skipped)
function args(s, open) {
  let depth = 0, q = null, tpl = [], from = open + 1;
  const out = [];
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (q === '`' && c === '$' && s[i + 1] === '{') { tpl.push(depth); depth++; q = null; i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) {
      depth--;
      if (c === '}' && tpl.length && tpl[tpl.length - 1] === depth) { tpl.pop(); q = '`'; continue; }
      if (depth === 0) { out.push(s.slice(from, i).trim()); return out; }
    } else if (c === ',' && depth === 1) { out.push(s.slice(from, i).trim()); from = i + 1; }
  }
  throw new Error('unbalanced call at ' + open);
}
const bad = [];
for (const [file, re] of Object.entries(FILES)) {
  const s = fs.readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const m of s.matchAll(re)) {
    if (/function\s+$/.test(s.slice(Math.max(0, m.index - 9), m.index))) continue; // the definition
    const a = args(s, m.index + m[0].length - 1);
    if (!a[0] || /^(''|"")$/.test(a[0])) continue; // clearing a live note
    const table = file.endsWith('table.ts');
    if (table && a.length === 3 && a[1] === 'ms' && a[2] === 'kind') continue; // the helper passing its own along
    const timed = table || (a[1] && !/^(0|undefined)$/.test(a[1]));
    if (timed && !a[2]) bad.push(`${file}:${s.slice(0, m.index).split('\n').length}  ${a[0].slice(0, 70)}`);
  }
}
if (bad.length) {
  console.error(`Timed toasts without a kind (ok, info, warn, error or plain as the third argument):\n  ${bad.join('\n  ')}`);
  process.exit(1);
}
console.log('Toast kinds: every timed toast names its kind');
