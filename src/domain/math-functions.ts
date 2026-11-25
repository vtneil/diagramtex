// Package commands that test their arguments or read ahead, which the engines read only as code (function macros,
// as mhchem defines \ce): ifthen's \ifthenelse with \equal, \isempty (xifthen) and number comparisons, etoolbox's
// \ifstrempty, \ifblank and \ifstrequal, TeX's \nonscript, and nomencl's \nomenclature. Each engine gets them on the
// page (mathengine.ts) and in the maths worker alike. A test they can't decide is an error, as an unknown command is.
type Token = { text: string };
type Context = {
  consumeArgs(n: number): Token[][]; expandTokens(tokens: Token[]): Token[];
  future(): Token; popToken(): Token; consumeSpaces(): void;
};
type Engine = {
  __defineMacro?: (name: string, body: (context: Context) => string) => void; __tdFunctions?: boolean;
  ParseError?: new (message: string) => Error;
};

// An argument comes in the engine's stack order (last token first): in reading order here.
const ordered = (tokens: Token[]) => [...tokens].reverse();
/** Tokens as source text again (a space after a control word, so \alpha b does not run on into \alphab). */
function source(tokens: Token[]): string {
  let out = '';
  for (const [k, t] of tokens.entries()) out += t.text + (/^\\[A-Za-z@]+$/.test(t.text) && /^[A-Za-z@]/.test(tokens[k + 1]?.text || '') ? ' ' : '');
  return out;
}
const blank = (tokens: Token[]) => tokens.every((t) => /^\s*$/.test(t.text));
const same = (a: Token[], b: Token[]) => a.length === b.length && a.every((t, k) => t.text === b[k].text);
type Fail = (what: string) => never;

/**
 * ifthen's test, in reading order: \equal{a}{b} (both expanded in full, then compared: ifthen's \TE@equal),
 * \isempty{x} (xifthen: nothing but spaces, unexpanded), a number comparison (a < b, a = b, a > b), \not / \NOT
 * before one, \( \) round one, and \and / \or between them (one kind in a row: the other needs ifthen's order).
 */
function decide(ctx: Context, tokens: Token[], fail: Fail): boolean {
  let i = 0;
  const space = () => { while (i < tokens.length && /^\s*$/.test(tokens[i].text)) i++; };
  const group = (): Token[] => {
    space();
    if (tokens[i]?.text !== '{') return i < tokens.length ? [tokens[i++]] : fail('An argument');
    let depth = 0;
    const start = ++i;
    for (; i < tokens.length; i++) {
      if (tokens[i].text === '{') depth++;
      else if (tokens[i].text === '}' && depth-- === 0) return tokens.slice(start, i++);
    }
    return fail('An unbalanced test');
  };
  const one = (): boolean => {
    space();
    const t = tokens[i]?.text;
    if (t === '\\not' || t === '\\NOT') { i++; return !one(); }
    if (t === '\\(') {
      const start = ++i;
      for (let depth = 0; i < tokens.length; i++) {
        if (tokens[i].text === '\\(') depth++;
        else if (tokens[i].text === '\\)' && depth-- === 0) { const v = decide(ctx, tokens.slice(start, i), fail); i++; return v; }
      }
      return fail('An unbalanced test');
    }
    if (t === '\\equal') { i++; const a = group(), b = group(); return same(ctx.expandTokens(ordered(a)), ctx.expandTokens(ordered(b))); }
    if (t === '\\isempty') { i++; return blank(group()); }
    // a number comparison: what stands up to the next \and or \or, expanded
    const start = i;
    while (i < tokens.length && !/^\\(?:and|or|AND|OR)$/.test(tokens[i].text)) i++;
    const m = /^\s*([-+]?\d+)\s*([<=>])\s*([-+]?\d+)\s*$/.exec(source(ctx.expandTokens(ordered(tokens.slice(start, i)))));
    if (!m) return fail(`\\ifthenelse{${source(tokens.slice(start, i))}}`);
    const [a, b] = [parseInt(m[1], 10), parseInt(m[3], 10)];
    return m[2] === '<' ? a < b : m[2] === '>' ? a > b : a === b;
  };
  let value = one(), joint = '';
  for (space(); i < tokens.length; space()) {
    const t = tokens[i++].text.toLowerCase();
    if (t !== '\\and' && t !== '\\or') fail(`\\ifthenelse{${source(tokens)}}`);
    if (joint && joint !== t) fail('\\and and \\or together');
    joint = t;
    const next = one();
    value = t === '\\and' ? value && next : value || next;
  }
  return value;
}

// What \nonscript can cancel: the glue or kern after it (TeX drops that item in script and scriptscript styles)
const SPACES = /^\\(?:,|;|:|!|>|quad|qquad|enspace|thinspace|medspace|thickspace|negthinspace|negmedspace|negthickspace|enskip)$/;
const SKIPS = /^\\(?:mskip|hskip|kern|mkern)$/, BRACED = /^\\(?:hspace|mspace)$/;
/** After \mskip and the like: the tokens of the size that follows (-\thinmuskip, 1.5mu, -2\medmuskip). */
function dimension(ctx: Context): Token[] {
  const out: Token[] = [];
  const take = (re: RegExp) => { while (re.test(ctx.future().text)) out.push(ctx.popToken()); };
  take(/^[\s+-]$/);
  take(/^[\d.,]$/);
  take(/^\s$/);
  if (/^\\[A-Za-z@]+$/.test(ctx.future().text)) out.push(ctx.popToken());
  else for (let k = 0; k < 2 && /^[a-z]$/.test(ctx.future().text); k++) out.push(ctx.popToken());
  return out;
}

/** Give an engine (window.katex, window.temml, or the worker's) these commands, once. */
export function defineFunctions(lib: unknown): void {
  const engine = lib as Engine | undefined;
  if (!engine?.__defineMacro || engine.__tdFunctions) return;
  engine.__tdFunctions = true;
  // (the engine's own error, which it draws as it draws an unknown command)
  const Failure = engine.ParseError || Error, fail: Fail = (what) => { throw new Failure(`${what} is not a test the preview can decide`); };
  const define = engine.__defineMacro.bind(engine);
  define('\\ifthenelse', (ctx) => {
    const [test, yes, no] = ctx.consumeArgs(3);
    return source(ordered(decide(ctx, ordered(test), fail) ? yes : no));
  });
  // etoolbox: \ifstrempty and \ifstrequal compare the arguments as written (\detokenize); \ifblank also takes spaces
  define('\\ifstrempty', (ctx) => { const [x, yes, no] = ctx.consumeArgs(3); return source(ordered(x.length ? no : yes)); });
  define('\\ifblank', (ctx) => { const [x, yes, no] = ctx.consumeArgs(3); return source(ordered(blank(x) ? yes : no)); });
  define('\\ifstrequal', (ctx) => { const [a, b, yes, no] = ctx.consumeArgs(4); return source(ordered(same(a, b) ? yes : no)); });
  // \nonscript X: X in display and text style only
  define('\\nonscript', (ctx) => {
    ctx.consumeSpaces();
    const next = ctx.future().text;
    let item: Token[];
    if (SPACES.test(next)) item = [ctx.popToken()];
    else if (SKIPS.test(next)) item = [ctx.popToken(), ...dimension(ctx)];
    else if (BRACED.test(next)) {
      const cs = ctx.popToken(), starred = ctx.future().text === '*' ? [ctx.popToken()] : [];
      item = [cs, ...starred, { text: '{' }, ...ordered(ctx.consumeArgs(1)[0]), { text: '}' }];
    } else return '';
    const x = source(item);
    return `\\mathchoice{${x}}{${x}}{}{}`;
  });
  // nomencl's \nomenclature[prefix]{symbol}{description}: an entry for the list, nothing where it stands
  define('\\nomenclature', (ctx) => {
    ctx.consumeSpaces();
    if (ctx.future().text === '[') for (let depth = 0, t = ctx.popToken(); ; t = ctx.popToken()) {
      if (t.text === 'EOF') break;
      if (t.text === '{') depth++; else if (t.text === '}') depth--; else if (t.text === ']' && !depth) break;
    }
    ctx.consumeArgs(2);
    return '';
  });
}
