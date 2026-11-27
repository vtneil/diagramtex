// LaTeX maths environments in a text or label (outside $…$ as well as in it), over any number of lines.
//
//  · DISPLAY_ENV: amsmath's display environments (equation, align, gather, multline…, starred or not). LaTeX allows
//    them only in a paragraph, never in a TikZ node's text or in $…$, and the engines only in display mode: they are
//    drawn and written as the inline environment that sets the same thing (align* → aligned, gather* → gathered),
//    in display style. Their numbers, \label, \tag and \notag are left out: a figure's formula has no number.
//  · INNER_ENV: the environments that go inside maths (aligned, cases, the matrices, array…). Typed outside $…$ one
//    is read as display maths, as if $$…$$ were round it.
//
// The canvas draws a text line by line, and the export joins its lines with \\: an environment broken over lines is
// one logical line (logicalLines), so its rows stay one formula.

export const DISPLAY_ENV = /^(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath)\*?$/;
export const INNER_ENV = /^(?:aligned|alignedat|gathered|split|multlined|cases|dcases|rcases|dcases\*|rcases\*|matrix|[pbBvV]matrix|[pbBvV]?matrix\*|smallmatrix|array|subarray)$/;
export const isMathEnv = (name: string) => DISPLAY_ENV.test(name) || INNER_ENV.test(name);

const BEGIN = /^\\begin\s*\{([^{}\n]*)\}/;
/** Where the \begin{name} that opens before `from` is closed: the index just past its \end{name}, counting the
 *  same environment nested inside, or -1 when it isn't closed. */
export function envClose(s: string, from: number, name: string): { at: number; end: number } | -1 {
  let depth = 1;
  for (let i = from; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') continue;
    const m = /^\\(begin|end)\s*\{([^{}\n]*)\}/.exec(s.slice(i, i + 60));
    if (!m) { i++; continue; }
    if (m[2] === name && (m[1] === 'begin' ? ++depth : --depth) === 0) return { at: i, end: i + m[0].length };
    i += m[0].length - 1;
  }
  return -1;
}
/** The maths environment that opens at s[i] (\begin{aligned}…), with its name and where it ends, or null. */
export function mathEnvAt(s: string, i: number): { name: string; end: number } | null {
  if (s[i] !== '\\' || !s.startsWith('\\begin', i)) return null;
  const m = BEGIN.exec(s.slice(i, i + 60));
  if (!m || !isMathEnv(m[1])) return null;
  const close = envClose(s, i + m[0].length, m[1]);
  return close === -1 ? null : { name: m[1], end: close.end };
}

// a line's maths environments, $$ and \[ still open at its end (counted outside escapes)
function openAt(s: string): { envs: string[]; dd: boolean; br: boolean } {
  const open: string[] = [];
  let dd = false, br = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') {
      if (s[i + 1] === '[' && !dd) { br = true; i++; continue; }
      if (s[i + 1] === ']' && br) { br = false; i++; continue; }
      const m = /^\\(begin|end)\s*\{([^{}\n]*)\}/.exec(s.slice(i, i + 60));
      if (m && isMathEnv(m[2])) {
        if (m[1] === 'begin') open.push(m[2]);
        else { const k = open.lastIndexOf(m[2]); if (k >= 0) open.length = k; }
        i += m[0].length - 1; continue;
      }
      i++; continue;
    }
    if (c === '$' && s[i + 1] === '$' && !br) { dd = !dd; i++; }
  }
  return { envs: open, dd, br };
}
const stillOpen = (s: string) => { const o = openAt(s); return o.envs.length > 0 || o.dd || o.br; };
// a line's % comment, which LaTeX reads to the end of the line (an escaped \% stays)
const uncomment = (l: string) => l.replace(/(^|[^\\])((?:\\\\)*)%.*$/, '$1$2');

/** The text's lines as LaTeX reads them into rows of the drawing: an environment, $$…$$ or \[…\] that runs over
 *  several lines is one line, its lines joined by spaces (and their % comments left out, as LaTeX does). A text
 *  with nothing open across lines splits at its line breaks, as it always has. */
export function logicalLines(text: string): string[] {
  return logicalLinesAt(text).map((l) => l.line);
}
/** logicalLines, each with the number of the text's line it starts on (from 0). */
export function logicalLinesAt(text: string): { line: string; at: number }[] {
  const lines = String(text ?? '').split('\n');
  if (lines.length < 2 || !/\\begin|\$\$|\\\[/.test(String(text))) return lines.map((line, at) => ({ line, at }));
  const out: { line: string; at: number }[] = [];
  for (let k = 0; k < lines.length; k++) {
    const at = k;
    if (!stillOpen(lines[k])) { out.push({ line: lines[k], at }); continue; }
    // joined up to the line that closes it (or to the end: an environment still being typed)
    let acc = uncomment(lines[k]);
    while (stillOpen(acc) && k + 1 < lines.length) { k++; acc += ' ' + uncomment(lines[k]); }
    out.push({ line: acc, at });
  }
  return out;
}
/** The innermost maths environment the text begins and never ends, or null. */
export const unendedEnv = (text: string): string | null => openAt(String(text)).envs.pop() ?? null;

/** Maths as the engines and a node's $…$ take it: each display environment written as its inline one, in display
 *  style; anything else unchanged. */
export function inlineEnvs(tex: string): string {
  if (!/\\begin\s*\{(?:equation|align|alignat|gather|multline|flalign|eqnarray|displaymath|split)/.test(tex)) return tex;
  let out = '', drop = false;
  for (let i = 0; i < tex.length;) {
    if (tex[i] !== '\\') { out += tex[i++]; continue; }
    const m = /^\\(begin|end)\s*\{([^{}\n]*)\}/.exec(tex.slice(i, i + 60));
    if (!m) { out += tex.slice(i, i + 2); i += 2; continue; }
    const [all, which, name] = m, base = name.replace(/\*$/, ''), open = which === 'begin';
    i += all.length;
    if (!DISPLAY_ENV.test(name) && name !== 'split') { out += all; continue; }
    drop = true;
    if (base === 'equation' || base === 'displaymath') { out += open ? '{' : '}'; continue; }
    if (base === 'align' || base === 'flalign' || base === 'split') { out += `\\${which}{aligned}`; continue; }
    if (base === 'gather') { out += `\\${which}{gathered}`; continue; }
    if (base === 'multline') { out += `\\${which}{multlined}`; continue; }
    if (base === 'alignat') { out += `\\${which}{alignedat}`; continue; } // its {n} follows as it was typed
    if (base === 'eqnarray') { out += open ? '\\begin{array}{rcl}' : '\\end{array}'; continue; }
  }
  // a display's number and its label and tag: not in a figure
  return drop ? out.replace(/\\(?:nonumber|notag)(?![A-Za-z])|\\(?:label|tag\*?)\s*\{[^{}]*\}/g, '') : out;
}

/** The matrices stay on one line when typed in; every other environment opens on lines of its own. */
export const ONE_LINE_ENV = /matrix\*?$/;
/** A one-line environment snippet (`\begin{aligned} | &= \\ &= \end{aligned}`, | the caret) laid out as it is written
 *  by hand: \begin and \end on lines of their own, a row per line indented two spaces past `indent` (the line it is
 *  typed on), each \\ ending its row. A matrix, or a snippet already on several lines, comes back as it was. */
export function envLayout(snippet: string, indent = ''): string {
  const m = /^\\begin\{([^{}]+)\}((?:\{[^{}]*\}|\[[^\]]*\])*)([\s\S]*)\\end\{([^{}]+)\}$/.exec(snippet.trim());
  if (!m || m[1] !== m[4] || ONE_LINE_ENV.test(m[1]) || m[3].includes('\n')) return snippet;
  const rows = m[3].split('\\\\').map((r) => r.trim()), pad = indent + '  ';
  return `\\begin{${m[1]}}${m[2]}\n` + rows.map((r, k) => pad + r + (k < rows.length - 1 ? ' \\\\' : '')).join('\n') + `\n${indent}\\end{${m[1]}}`;
}
