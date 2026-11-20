// A block editor writes its code from the drawing, and the drawing has no place for `%` comments. This carries the
// comments of the code as last written (opened, typed or restored) into the code the editor writes now, each beside
// the line it was on. Lines are matched ignoring spaces and a row's closing \\; a line that changed takes its comment
// with it when it can be told apart (the same number of changed lines between two unchanged ones), and a comment whose
// line went keeps its place as a line of its own. Nothing is dropped: only typing removes a comment.

// where the line's comment starts: the first % that is not \%
function commentAt(line: string) {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '\\') i++;
    else if (line[i] === '%') return i;
  }
  return -1;
}
const key = (code: string) => code.replace(/\\\\\*?(?:\[[^\]]*\])?\s*$/, '').replace(/\s+/g, '');

interface Line { key: string; indent: string; gap: string; note: string }

// pairs of [typed, written] indices in order: the longest run of equal lines (after the shared start and end)
function anchors(a: string[], b: string[]) {
  const pairs: [number, number][] = [];
  let s = 0, ea = a.length, eb = b.length;
  while (s < ea && s < eb && a[s] === b[s]) { pairs.push([s, s]); s++; }
  const tail: [number, number][] = [];
  while (ea > s && eb > s && a[ea - 1] === b[eb - 1]) { ea--; eb--; tail.unshift([ea, eb]); }
  const n = ea - s, m = eb - s;
  if (n && m && n * m <= 250000) {
    const L = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) L[i][j] = a[s + i] === b[s + j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    for (let i = 0, j = 0; i < n && j < m;) {
      if (a[s + i] === b[s + j]) { pairs.push([s + i, s + j]); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
    }
  } else if (n && m) { // too long to compare every pair: each line to the next equal one
    for (let i = 0, j = 0; i < n && j < m; i++) { const k = b.indexOf(a[s + i], s + j); if (k >= 0 && k < eb) { pairs.push([s + i, k]); j = k - s + 1; } }
  }
  return pairs.concat(tail);
}

export function keepComments(typed: string | null | undefined, code: string): string {
  if (!typed || !typed.includes('%')) return code;
  const lines: (Line | null)[] = [], codes: number[] = []; // typed lines (null: blank), and which of them hold code
  let any = false;
  for (const raw of typed.split('\n')) {
    const at = commentAt(raw), body = at < 0 ? raw : raw.slice(0, at), note = at < 0 ? '' : raw.slice(at).trimEnd();
    if (note) any = true;
    const k = key(body);
    if (!k && !note) { lines.push(null); continue; }
    if (k) codes.push(lines.length);
    lines.push({ key: k, indent: /^\s*/.exec(raw)![0], gap: body.slice(body.trimEnd().length), note });
  }
  if (!any) return code;
  const out = code.split('\n');
  // comments the code already has (a writer that keeps some itself) are not added again
  const have = new Map<string, number>();
  for (const l of out) { const at = commentAt(l); if (at >= 0) { const c = l.slice(at).trimEnd(); have.set(c, (have.get(c) || 0) + 1); } }
  const fresh = (c: string) => { const n = have.get(c) || 0; if (n) { have.set(c, n - 1); return false; } return true; };
  const outKeys = out.map((l) => { const at = commentAt(l); return key(at < 0 ? l : l.slice(0, at)); });
  const want = codes.map((i) => lines[i]!.key), live = outKeys.map((k, j) => (k ? j : -1)).filter((j) => j >= 0);
  const match = new Map<number, number>(); // typed line → written line
  const A = anchors(want, live.map((j) => outKeys[j]));
  for (const [i, j] of A) match.set(codes[i], live[j]);
  // between two matched lines, as many changed lines on each side: the same lines, edited
  for (let g = 0; g <= A.length; g++) {
    const [i0, j0] = g ? A[g - 1] : [-1, -1], [i1, j1] = g < A.length ? A[g] : [want.length, live.length];
    if (i1 - i0 === j1 - j0) for (let d = 1; d < i1 - i0; d++) match.set(codes[i0 + d], live[j0 + d]);
  }
  const before: string[][] = out.map(() => []), after: string[] = [], end: string[] = [];
  let waiting: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const L = lines[i];
    if (!L) continue;
    const j = L.key ? match.get(i) : undefined;
    if (j === undefined) { // a comment line, or a line that went: the comment waits for the next line still there
      if (L.note && fresh(L.note)) waiting.push(L.indent + L.note);
      continue;
    }
    before[j].push(...waiting); waiting = [];
    if (L.note && fresh(L.note)) after[j] = L.gap + L.note;
  }
  // comments after the last line still there stay after it
  let last = -1;
  for (const j of match.values()) last = Math.max(last, j);
  if (waiting.length) { if (last < 0) before[0].push(...waiting); else if (last + 1 < out.length) before[last + 1].push(...waiting); else end.push(...waiting); }
  const res: string[] = [];
  out.forEach((l, j) => { res.push(...before[j]); res.push(after[j] ? l.trimEnd() + after[j] : l); });
  return res.concat(end).join('\n');
}
