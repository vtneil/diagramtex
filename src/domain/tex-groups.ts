// Brace groups in TeX source, shared by the blocks' readers.
//
// `unbrace` takes the outer braces off a value only when they are one group round the whole of it: `{a}` → `a`, but
// `{a}{b}` stays as it is (its first brace closes before the end). A brace after a backslash (`\{`) is text, not a
// group. `unbraceOnce` takes one layer off (`{{a}}` → `{a}`); `unbrace` takes every layer (`{{a}}` → `a`).

/** Where the group opened by the `{` at `i` closes (the index of its `}`), or -1 when it never does. */
export function closeBrace(s: string, i: number): number {
  let depth = 0;
  for (let k = i; k < s.length; k++) {
    const c = s[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return k;
  }
  return -1;
}

const wrapped = (v: string) => v[0] === '{' && closeBrace(v, 0) === v.length - 1;

/** The value without one layer of braces round the whole of it, trimmed. */
export function unbraceOnce(value: unknown): string {
  const v = String(value ?? '').trim();
  return wrapped(v) ? v.slice(1, -1).trim() : v;
}

/** The value without any layers of braces round the whole of it, trimmed. */
export function unbrace(value: unknown): string {
  let v = String(value ?? '').trim();
  while (wrapped(v)) v = v.slice(1, -1).trim();
  return v;
}
