// Brackets in TeX code coloured by how deep they sit, as code editors do, so {{{1}2}3} reads at a glance: { [ ( and the
// one closing it share a colour, three colours in turn (tx-b0, tx-b1, tx-b2: --bracket1…3). A backslash takes the
// character after it (\{ and \} are braces drawn, \[ \] display maths), % starts a comment, and a closer that
// matches no opener, or the wrong kind ([0,1) in maths), stays plain: nothing here says the code is wrong.
import { escapeHtml } from '../core/html';

const OPEN: Record<string, string> = { '{': '}', '[': ']', '(': ')' };
const CLOSE = new Set(['}', ']', ')']);

/** Each coloured bracket's offset in text → its class. */
export function bracketMarks(text: string): Map<number, string> {
  const marks = new Map<number, string>(), stack: { c: string; at: number }[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '\\') { i++; continue; }
    if (c === '%') { const e = text.indexOf('\n', i); if (e < 0) break; i = e; continue; }
    if (OPEN[c]) { marks.set(i, 'tx-b' + (stack.length % 3)); stack.push({ c, at: i }); continue; }
    if (!CLOSE.has(c) || !stack.length) continue;
    if (OPEN[stack[stack.length - 1].c] !== c) {
      // closing a bracket further out (one between is left open): close up to it; else it closes nothing
      const k = stack.map((s) => OPEN[s.c]).lastIndexOf(c);
      if (k < 0) continue;
      stack.length = k + 1;
    }
    stack.pop();
    marks.set(i, 'tx-b' + (stack.length % 3));
  }
  return marks;
}

const esc = escapeHtml;

/** text[from, to) as HTML, its brackets (at base + offset in the marks) in their colours. */
export function bracketHtml(text: string, marks: Map<number, string>, base = 0, from = 0, to = text.length): string {
  let h = '', k = from;
  if (!marks.size) return esc(text.slice(from, to));
  for (let i = from; i < to; i++) {
    const m = marks.get(base + i);
    if (m) { h += esc(text.slice(k, i)) + `<span class="${m}">${esc(text[i])}</span>`; k = i + 1; }
  }
  return h + esc(text.slice(k, to));
}
