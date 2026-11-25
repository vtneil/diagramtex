// Finding where inline maths ends in text, as LaTeX reads it: a $ inside braces in a formula (\text{if $x > 0$})
// is maths within the formula's text, not its end. No DOM.

/** Whether maths at brace depth `depth`, read on from j, closes its braces and then has a $ ending it. */
export function closesAt(src: string, j: number, depth: number): boolean {
  for (; j < src.length; j++) {
    const c = src[j];
    if (c === '\\') { j++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '$' && depth <= 0) return true;
  }
  return false;
}

/** The index of the $ ending inline maths whose formula starts at `from` (just past its opening $), or -1. */
export function closingDollar(src: string, from: number): number {
  let depth = 0;
  for (let k = from; k < src.length; k++) {
    const c = src[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth = Math.max(0, depth - 1);
    else if (c === '$' && !(depth > 0 && closesAt(src, k + 1, depth))) return k;
  }
  return -1;
}

/**
 * The index of the bracket closing the one at s[i] ({, [ or (), or -1: a backslash escapes the character after it, and
 * braces nest inside [ … ] and ( … ), so a ] or ) in a braced group doesn't close them.
 */
export function groupEnd(s: string, i: number): number {
  const open = s[i], shut = ({ '{': '}', '[': ']', '(': ')' } as Record<string, string>)[open];
  let d = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{' && open !== '{') { k = groupEnd(s, k); if (k < 0) return -1; continue; }
    if (c === open) d++;
    else if (c === shut && --d === 0) return k;
  }
  return -1;
}

/** s cut at each `sep` outside braces, brackets and parentheses (a backslash escapes the character after it). */
export function splitTop(s: string, sep = ','): string[] {
  const out: string[] = [];
  let d = 0, cur = '';
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
    if ('{[('.includes(c)) d++;
    else if ('}])'.includes(c)) d--;
    if (c === sep && d === 0) { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  out.push(cur);
  return out;
}

/** The index of the first character from i on that isn't white space. */
export const skipSpace = (s: string, i: number) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
