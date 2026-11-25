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
