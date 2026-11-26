// Formatting keys in a LaTeX source field: ⌘B bold, ⌘I italic, ⌘U underline (Ctrl on Windows and Linux) write the
// LaTeX for it round the selection, as text or as maths, whichever the selection is in:
//
//            text          maths
//   bold     \textbf{…}    \mathbf{…}  (\boldsymbol{…} round a command such as \alpha, which \mathbf leaves as it is)
//   italic   \textit{…}    \mathit{…}
//   underline \underline{…} \underline{…}
//
// Text vs maths is read from the source up to the selection: $…$, $$…$$, \(…\) and \[…\] are maths, and inside maths
// \text{…} (\textrm, \mbox …) is text again, as \ensuremath{…} is maths inside text. A field that is all maths
// (a quantikz gate, a Maths field) starts in maths. A selection that runs from one into the other is text: \textbf
// round $x$ is still right.
//
// The keys toggle: pressed on what is already wrapped in that style (the selection with the command round it, the
// selection being the whole command, or the caret inside it), they take the command off. With nothing selected they
// write the empty command, the caret inside. Edits go through the browser's own typing (insertText), so ⌘Z undoes them.

export type TexStyle = 'bold' | 'italic' | 'underline';

const TEXT_IN_MATH = new Set(['text', 'textrm', 'textnormal', 'textup', 'textit', 'textbf', 'textsf', 'texttt', 'textsl', 'textsc', 'emph', 'mbox', 'hbox', 'operatorname', 'intertext']);
const MATH_IN_TEXT = new Set(['ensuremath']);
/** the commands that make each style, in text and in maths, the first being the one written */
const COMMANDS: Record<TexStyle, { text: string[]; math: string[] }> = {
  bold: { text: ['textbf'], math: ['mathbf', 'boldsymbol', 'bm'] },
  italic: { text: ['textit', 'emph'], math: ['mathit'] },
  underline: { text: ['underline', 'uline'], math: ['underline'] },
};
const KEYS: Record<string, TexStyle> = { b: 'bold', i: 'italic', u: 'underline' };

/** Whether `pos` in `src` is in maths (`math`: the field starts in maths). */
export function inMathAt(src: string, pos: number, math = false): boolean {
  const saved: boolean[] = []; // the mode outside each open brace
  let next: boolean | null = null; // the mode the next { opens (after \text, \ensuremath)
  for (let i = 0; i < pos && i < src.length; i++) {
    const c = src[i];
    if (c === '%' && !math) { const e = src.indexOf('\n', i); if (e < 0 || e >= pos) break; i = e; continue; }
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i, i + 40));
      if (!m) continue;
      const name = m[1];
      if (name === '(' || name === '[') math = true;
      else if (name === ')' || name === ']') math = false;
      else if (math && TEXT_IN_MATH.has(name)) next = false;
      else if (!math && MATH_IN_TEXT.has(name)) next = true;
      i += m[0].length - 1;
      continue;
    }
    if (c === '$') { if (src[i + 1] === '$') i++; math = !math; next = null; continue; }
    if (c === '{') { saved.push(math); if (next !== null) { math = next; next = null; } continue; }
    if (c === '}') { if (saved.length) math = saved.pop()!; continue; }
    if (next !== null && !/\s/.test(c)) next = null; // \text not followed by a group
  }
  return math;
}

/** The innermost `\cmd{…}` (cmd one of `names`) round [a, z): where it starts, where its group opens and closes. */
function enclosing(src: string, a: number, z: number, names: string[]): { at: number; open: number; close: number } | null {
  const opens: number[] = [];
  for (let i = 0; i < a; i++) {
    if (src[i] === '\\') { i++; continue; }
    if (src[i] === '{') opens.push(i); else if (src[i] === '}') opens.pop();
  }
  for (let k = opens.length - 1; k >= 0; k--) {
    const open = opens[k], m = /\\([A-Za-z]+)\s*$/.exec(src.slice(Math.max(0, open - 30), open));
    // its close: the } that balances it, at or after z
    let depth = 0, close = -1;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '{') depth++; else if (src[i] === '}' && --depth === 0) { close = i; break; }
    }
    if (close < z) continue; // not round the whole selection: one further out may be
    if (m && names.includes(m[1])) return { at: open - m[0].length, open, close };
  }
  return null;
}

/** The change a style makes to `src` with [a, z) selected: what to replace, with what, and the selection after. */
export function texFormat(src: string, a: number, z: number, style: TexStyle, fieldMath = false): { from: number; to: number; insert: string; sel: [number, number] } {
  const math = inMathAt(src, a, fieldMath) && inMathAt(src, z, fieldMath);
  const names = [...COMMANDS[style].text, ...COMMANDS[style].math], sel = src.slice(a, z);
  // the selection is a whole \cmd{…} of the style: take the command off
  const whole = /^\\([A-Za-z]+)\s*\{([\s\S]*)\}$/.exec(sel);
  if (whole && names.includes(whole[1]) && enclosing(sel, whole[0].indexOf('{') + 1, sel.length - 1, [whole[1]])?.close === sel.length - 1) {
    return { from: a, to: z, insert: whole[2], sel: [a, a + whole[2].length] };
  }
  // the selection (or the caret) is inside one: take it off round its contents
  const round = enclosing(src, a, z, names);
  if (round) {
    const inner = src.slice(round.open + 1, round.close), shift = round.open + 1 - round.at;
    return { from: round.at, to: round.close + 1, insert: inner, sel: [a - shift, z - shift] };
  }
  const cmd = math && style === 'bold' && /\\[A-Za-z]/.test(sel) ? 'boldsymbol' : COMMANDS[style][math ? 'math' : 'text'][0];
  const insert = `\\${cmd}{${sel}}`, start = a + cmd.length + 2;
  return { from: a, to: z, insert, sel: [start, start + sel.length] };
}

/** ⌘B / ⌘I / ⌘U (Ctrl elsewhere) in a LaTeX field `ta`: formats the selection; true when the key was one of these. */
export function texFormatKey(e: KeyboardEvent, ta: HTMLTextAreaElement | HTMLInputElement, fieldMath = false): boolean {
  if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.isComposing) return false;
  const style = KEYS[e.key.toLowerCase()];
  if (!style) return false;
  e.preventDefault(); // never the browser's own (bookmarks, page info, view source)
  applyTexFormat(ta, style, fieldMath);
  return true;
}

/** Format the selection in `ta` (a key, or a toolbar's Bold button); the field gets an input event. */
export function applyTexFormat(ta: HTMLTextAreaElement | HTMLInputElement, style: TexStyle, fieldMath = false) {
  const a = ta.selectionStart ?? 0, z = ta.selectionEnd ?? a;
  const ch = texFormat(ta.value, a, z, style, fieldMath);
  ta.focus();
  ta.setSelectionRange(ch.from, ch.to);
  // the browser's own typing, so its undo takes it back; where that isn't there, set the value and say so
  if (!document.execCommand?.('insertText', false, ch.insert) || ta.value.slice(ch.from, ch.from + ch.insert.length) !== ch.insert) {
    ta.value = ta.value.slice(0, ch.from) + ch.insert + ta.value.slice(ch.to);
    ta.dispatchEvent(new Event('input', { bubbles: true }));
  }
  ta.setSelectionRange(ch.sel[0], ch.sel[1]);
}
