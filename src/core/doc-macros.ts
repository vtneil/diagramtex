// A file's own macros (`page.macros`): LaTeX definitions as written (\newcommand, \def, \DeclareMathOperator …), the
// file's preamble definitions. The maths engine draws every formula with them (as KaTeX's and Temml's `macros`), and
// every export writes them into the preamble. An import moves a preamble's macro definitions here, so they are
// defined once for the whole file. No DOM.

/** One definition statement: its text as written, the command it defines, and where it starts. */
export interface MacroStatement { text: string; name: string; start: number; end: number }
/** A definition the engines can draw only roughly (or not at all), with the line it is on (from 1). */
export interface MacroProblem { line: number; name: string; reason: 'optional' | 'delimited' | 'at' | 'unreadable' }
export interface ParsedMacros {
  /** for the engines: '\name' → the replacement text with #1 … #9 */
  macros: Record<string, string>;
  /**
   * definitions the engines read as TeX does only from a \def with its parameter text (\def\a#1.{…}, and the helpers
   * that read an optional [argument]): written at the start of each formula
   */
  prelude: string[];
  /**
   * \left and \right redefined as mleftright's \mleft and \mright (\let\originalleft\left
   * \renewcommand{\left}{\mathopen{}\mathclose\bgroup\originalleft} and \right with \aftergroup\egroup): the engines
   * read every pair as \mleft … \mright (math-rewrite.ts)
   */
  mleftright?: boolean;
  /** \newenvironment's: name → its arguments, the optional first one's default, and its begin and end code */
  environments: Record<string, Environment>;
  statements: MacroStatement[];
  problems: MacroProblem[];
}

export interface Environment { args: number; def?: string; begin: string; end: string }

const DEFINERS = ['newenvironment', 'newcommand', 'renewcommand', 'providecommand', 'DeclareRobustCommand', 'NewDocumentCommand',
  'RenewDocumentCommand', 'ProvideDocumentCommand', 'DeclareDocumentCommand', 'NewExpandableDocumentCommand',
  'RenewExpandableDocumentCommand', 'ProvideExpandableDocumentCommand', 'DeclareExpandableDocumentCommand', 'DeclareMathOperator',
  'newrobustcmd', 'renewrobustcmd', 'providerobustcmd', // etoolbox's, read as \newcommand
  'DeclarePairedDelimiter', 'DeclarePairedDelimiterX', 'DeclarePairedDelimiterXPP', 'def', 'gdef', 'edef', 'xdef', 'let'];
/**
 * Preamble statements that set up what formulas use without defining a macro the engines could read (math alphabets,
 * symbol fonts, column types, siunitx units and settings, counters): kept with the definitions so that exports write
 * them, each with how many mandatory arguments it takes (optional ones are read where they stand).
 */
const SETUP: Record<string, number> = {
  DeclareMathAlphabet: 5, SetMathAlphabet: 6, DeclareSymbolFont: 5, SetSymbolFont: 6, DeclareSymbolFontAlphabet: 2,
  DeclareMathSymbol: 4, DeclareMathDelimiter: 6, DeclareMathAccent: 4, DeclareMathRadical: 5, DeclareFontFamily: 3,
  DeclareFontShape: 6, newcolumntype: 2, DeclareSIUnit: 2, sisetup: 1, newcounter: 1, setcounter: 2,
};
const DEFINER_RE = new RegExp('\\\\(' + [...DEFINERS, ...Object.keys(SETUP)].join('|') + ')(?![A-Za-z@])', 'g');
/** A setup statement's arguments from i: its end, and its first mandatory argument (what it is named by). */
function readSetup(kind: string, t: string, i: number): { end: number; first: string } | null {
  let first = '';
  for (let n = 0; n < SETUP[kind];) {
    const o = opt(t, i);
    if (o) { i = o.end; continue; }
    const a = arg(t, i);
    if (!a) return null;
    if (!n) first = a.v.trim();
    i = a.end; n++;
  }
  return { end: i, first };
}

/** % comments dropped as TeX reads them (the comment, its newline and the next line's leading spaces); \% stays. */
export function stripComments(text: string): string {
  let out = '', i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '\\' && i + 1 < n) { out += text.slice(i, i + 2); i += 2; continue; }
    if (c === '%') {
      const j = text.indexOf('\n', i);
      if (j < 0) break;
      i = j + 1;
      while (i < n && (text[i] === ' ' || text[i] === '\t')) i++;
      continue;
    }
    out += c; i++;
  }
  return out;
}
const skipSpace = (t: string, i: number) => { while (i < t.length && /\s/.test(t[i])) i++; return i; };
/** t[i] is `{`: the index just past its balanced `}`, or -1 */
function groupEnd(t: string, i: number) {
  let depth = 0;
  for (; i < t.length; i++) {
    const c = t[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i + 1;
  }
  return -1;
}
/** A control sequence at i: \name or \x */
const csAt = (t: string, i: number) => /^\\(?:[A-Za-z@]+|.)/.exec(t.slice(i, i + 200))?.[0] || null;
/** A mandatory argument at i (after spaces): a group's content, or one token. */
function arg(t: string, i: number): { v: string; end: number } | null {
  i = skipSpace(t, i);
  if (i >= t.length) return null;
  if (t[i] === '{') { const e = groupEnd(t, i); return e < 0 ? null : { v: t.slice(i + 1, e - 1), end: e }; }
  if (t[i] === '\\') { const cs = csAt(t, i); return cs ? { v: cs, end: i + cs.length } : null; }
  return t[i] === '}' ? null : { v: t[i], end: i + 1 };
}
/** An optional [..] argument at i (after spaces), braces inside skipped. */
function opt(t: string, i: number): { v: string; end: number } | null {
  const j = skipSpace(t, i);
  if (t[j] !== '[') return null;
  for (let k = j + 1, depth = 0; k < t.length; k++) {
    const c = t[k];
    if (c === '\\') { k++; continue; }
    if (c === '{') { const e = groupEnd(t, k); if (e < 0) return null; k = e - 1; continue; }
    if (c === '[') depth++;
    else if (c === ']') { if (depth === 0) return { v: t.slice(j + 1, k), end: k + 1 }; depth--; }
  }
  return null;
}
/** The command a name argument holds: {\R} or \R */
const nameOf = (v: string) => { const s = v.trim(); return /^\\(?:[A-Za-z@]+|.)$/.test(s) ? s : null; };
const star = (t: string, i: number) => { const j = skipSpace(t, i); return t[j] === '*' ? j + 1 : -1; };

// What an xparse argument left out stands for while its body is read: an unstarred s/t, an o/d with no value.
const FALSE = '\u0001', NO_VALUE = '\u0002';
const BRANCH_RE = /\\(If(?:Boolean|NoValue|Value)(?:TF|T|F))(?![A-Za-z])/;
/**
 * An xparse body with its \IfBooleanTF / \IfNoValueTF / \IfValueTF tests decided, as for a use without the arguments
 * left out (unstarred, no optional value), so the engines see only the branch taken.
 */
function xparseBranches(body: string): string {
  for (let guard = 0, m; guard < 200 && (m = BRANCH_RE.exec(body)); guard++) {
    const test = m[1], at = m.index;
    const x = arg(body, at + m[0].length), a = x && arg(body, x.end);
    const both = /TF$/.test(test), b = both && a ? arg(body, a.end) : null;
    if (!x || !a || (both && !b)) { body = body.slice(0, at) + body.slice(at + m[0].length); continue; }
    const v = x.v.trim();
    const yes = /Boolean/.test(test) ? v !== FALSE && v !== '' : /NoValue/.test(test) ? v === NO_VALUE : v !== NO_VALUE;
    const kind = test.replace(/^If(Boolean|NoValue|Value)/, '');
    const chosen = kind === 'TF' ? (yes ? a.v : b!.v) : kind === 'T' ? (yes ? a.v : '') : (yes ? '' : a.v);
    body = body.slice(0, at) + chosen + body.slice((b || a).end);
  }
  return body.split(FALSE).join('').split(NO_VALUE).join('');
}

interface Read { name: string; end: number; body?: string; args?: number; problem?: MacroProblem['reason']; helpers?: Record<string, string>; prelude?: string[]; environment?: Environment }

// Optional arguments, as LaTeX reads them: \newcommand's [default] (\@protected@testopt: \@ifnextchar[) and xparse's s, t,
// o, O, d and D, each tested for in turn. A helper macro per argument passes on what was read so far, as {#1}{#2} …; one
// that reads a delimited argument is a \def (\def\h#1#2[#3]{…}: #2 runs to the [, and is {…} with its braces dropped).
// A star or token read is \@firstoftwo, one not there \@secondoftwo; an o or d argument also passes \@firstoftwo when
// it has no value. The body's \IfBooleanTF / \IfNoValueTF / \IfValueTF on them choose with those.
type Spec = { kind: 'm' } | { kind: 't'; token: string } | { kind: 'o'; open: string; close: string; def?: string };
// (letters only: a digit would end the name)
const helperName = (name: string, k: number, read = false) => `\\td@${name.slice(1)}@${'abcdefghijk'[k]}${read ? 'r' : ''}`;
const passed = (n: number) => Array.from({ length: n }, (_, k) => `{#${k + 1}}`).join('');
const params = (n: number) => Array.from({ length: n }, (_, k) => `#${k + 1}`).join('');
function optionalArguments(name: string, specs: Spec[], body: string): Pick<Read, 'body' | 'helpers' | 'prelude' | 'args'> | null {
  if (!/^\\[A-Za-z@]+$/.test(name) || body.includes('##')) return null;
  // the body's parameters: a value for m, O and D; a choice for s and t; both for o and d
  const value: (number | undefined)[] = [], choice: (number | undefined)[] = [];
  let count = 0;
  for (const [k, s] of specs.entries()) {
    if (s.kind !== 't') value[k] = ++count;
    if (s.kind === 't' || (s.kind === 'o' && s.def === undefined)) choice[k] = ++count;
  }
  if (count > 9) return null;
  // the tests decided by their choice parameter (or, for an argument that always has a value, as it is)
  for (let guard = 0, m, from = 0; guard < 200 && (m = BRANCH_RE.exec(body.slice(from))); guard++) {
    const at = from + m.index, test = m[1];
    const x = arg(body, at + m[0].length), a = x && arg(body, x.end);
    const both = /TF$/.test(test), b = both && a ? arg(body, a.end) : null;
    const k = x && /^#([1-9])$/.exec(x.v.trim());
    if (!x || !a || (both && !b) || !k || +k[1] > specs.length) { from = at + m[0].length; continue; }
    const j = +k[1] - 1, kind = test.replace(/^If(Boolean|NoValue|Value)/, ''), yes = kind === 'F' ? '' : a.v, no = kind === 'TF' ? b!.v : kind === 'T' ? '' : a.v;
    const negate = /^IfValue/.test(test);
    let out: string;
    if (choice[j] !== undefined && (/^IfBoolean/.test(test) || specs[j].kind === 'o')) out = `\u0001${choice[j]}{${negate ? no : yes}}{${negate ? yes : no}}`;
    else if (/^IfBoolean/.test(test)) { from = at + m[0].length; continue; }
    else out = negate ? yes : no; // an m, O or D argument always has a value
    body = body.slice(0, at) + out + body.slice((b || a).end);
    from = at + out.length;
  }
  // (a star's or token's argument is only tested, never written)
  if (/\\If(?:Boolean|NoValue|Value)/.test(body) || [...body.matchAll(/#([1-9])/g)].some((m) => value[+m[1] - 1] === undefined)) return null;
  body = body.replace(/#([1-9])/g, (_, k) => `\u0001${value[+k - 1]}`).replace(/\u0001/g, '#');
  const helpers: Record<string, string> = {}, prelude: string[] = [];
  let have = 0;
  specs.forEach((s, k) => {
    const self = k ? helperName(name, k) : name, next = helperName(name, k + 1);
    if (s.kind === 'm') { helpers[self] = `${next}${passed(have + 1)}`; have += 1; return; }
    if (s.kind === 't') {
      const read = helperName(name, k, true);
      helpers[self] = `\\@ifnextchar${s.token}{${read}${passed(have)}}{${next}${passed(have)}{\\@secondoftwo}}`;
      prelude.push(`\\def${read}${params(have)}${s.token}{${next}${passed(have)}{\\@firstoftwo}}`);
      have += 1; return;
    }
    const read = helperName(name, k, true), none = s.def === undefined ? '{}{\\@firstoftwo}' : `{${s.def}}`;
    helpers[self] = `\\@ifnextchar${s.open}{${read}${passed(have)}}{${next}${passed(have)}${none}}`;
    prelude.push(`\\def${read}${params(have)}${s.open}#${have + 1}${s.close}{${next}${passed(have + 1)}${s.def === undefined ? '{\\@secondoftwo}' : ''}}`);
    have += s.def === undefined ? 2 : 1;
  });
  helpers[helperName(name, specs.length)] = everyArgument(body, count);
  const entry = helpers[name]; delete helpers[name];
  return { body: entry, helpers, prelude, args: 0 };
}
/** The definition whose definer (\newcommand …) ends at i: what it defines, and the engines' replacement text. */
function readDefinition(kind: string, t: string, i: number): Read | null {
  if (kind === 'let') {
    const a = arg(t, i), name = a && nameOf(a.v);
    if (!a || !name) return null;
    let j = skipSpace(t, a.end);
    if (t[j] === '=') j = skipSpace(t, j + 1);
    const to = csAt(t, j) || (j < t.length ? t[j] : null);
    return to ? { name, end: j + to.length, body: to } : null;
  }
  if (/^[gex]?def$/.test(kind)) {
    const name = csAt(t, skipSpace(t, i));
    if (!name) return null;
    const p = skipSpace(t, i) + name.length, open = t.indexOf('{', p);
    if (open < 0) return null;
    const params = t.slice(p, open).replace(/\s+/g, ''), e = groupEnd(t, open);
    if (e < 0) return null;
    const body = t.slice(open + 1, e - 1);
    // #1#2… in order: an ordinary macro; anything else (\def\a#1.{…}) has delimited arguments
    const plain = params === Array.from({ length: params.length / 2 }, (_, k) => '#' + (k + 1)).join('');
    if (plain) return { name, end: e, body, args: params.length / 2 };
    // delimited arguments (\def\a#1.{…}): the engines read the \def itself, at the formula's start
    return /^\\[A-Za-z@]+$/.test(name) && /^(?:#[1-9]|[^#{}\\])*$/.test(params.replace(/\\[A-Za-z]+/g, ''))
      ? { name, end: e, prelude: [`\\${kind}${name}${t.slice(p, open).trim()}{${body}}`] } : { name, end: e, problem: 'delimited' };
  }
  let j = i;
  const starred = star(t, j);
  if (starred >= 0) j = starred;
  if (/environment$/.test(kind)) {
    // \newenvironment{name}[n][default]{begin}{end}
    const e = arg(t, j), env = e && e.v.trim();
    if (!e || !env || !/^[A-Za-z@*]+$/.test(env)) return null;
    const n = opt(t, e.end), d = n ? opt(t, n.end) : null, b = arg(t, (d || n || e).end), c = b && arg(t, b.end);
    if (!b || !c) return null;
    return { name: `{${env}}`, end: c.end, environment: { args: n ? Math.min(9, parseInt(n.v, 10) || 0) : 0, def: d?.v, begin: b.v, end: c.v } };
  }
  const a = arg(t, j), name = a && nameOf(a.v);
  if (!a || !name) return null;
  j = a.end;
  if (kind === 'DeclareMathOperator') {
    const b = arg(t, j);
    return b ? { name, end: b.end, body: `\\operatorname${starred >= 0 ? '*' : ''}{${b.v}}` } : null;
  }
  if (/^DeclarePairedDelimiter/.test(kind)) {
    // mathtools: \name{x} is \mathopen{l}x\mathclose{r}; \name[\big]{x} has \bigl l and \bigr r (\mathopen{\big l} is
    // the same); \name*{x} is \mathopen{}\mathclose\bgroup\left l x\aftergroup\egroup\right r. The X forms take n
    // arguments and a body, in which \delimsize is the size (\middle when starred); XPP adds code before and after.
    const n = kind === 'DeclarePairedDelimiter' ? null : opt(t, j), count = n ? Math.min(7, parseInt(n.v, 10) || 0) : 1;
    const parts: string[] = [];
    let end = n ? n.end : j;
    for (let k = kind === 'DeclarePairedDelimiterXPP' ? 5 : kind === 'DeclarePairedDelimiterX' ? 3 : 2; k > 0; k--) {
      const x = arg(t, end); if (!x) return null;
      parts.push(x.v); end = x.end;
    }
    if (count < 1) return null;
    const [pre, l, r, post, body] = kind === 'DeclarePairedDelimiterXPP' ? parts : kind === 'DeclarePairedDelimiterX' ? ['', ...parts.slice(0, 2), '', parts[2]] : ['', ...parts, '', '#1'];
    // as an xparse command: #1 the star, #2 the size, then the arguments
    const shifted = body.replace(/#([1-9])/g, (_, k) => '#' + (+k + 2)), size = (b: string, d: string) => b.replace(/\\delimsize(?![A-Za-z@])/g, d);
    // (a . is no delimiter: nothing unstarred, as mathtools' \ifx.##1)
    const side = (cls: string, d: string) => (d.trim() === '.' ? '' : `\\${cls}{#2${d}}`);
    const both = `\\IfBooleanTF{#1}{${pre}\\mathopen{}\\mathclose{\\left${l} ${size(shifted, '\\middle')}\\right${r}}${post}}{${pre}${side('mathopen', l)}${size(shifted, '#2')}${side('mathclose', r)}${post}}`;
    const read = optionalArguments(name, [{ kind: 't', token: '*' }, { kind: 'o', open: '[', close: ']', def: '' }, ...Array.from({ length: count }, () => ({ kind: 'm' as const }))], both);
    return read ? { name, end, ...read } : null;
  }
  if (/DocumentCommand$/.test(kind)) {
    const spec = arg(t, j), b = spec && arg(t, spec.end);
    if (!spec || !b) return null;
    // xparse: s, t, o, O, d and D read as LaTeX reads them (optionalArguments); with other kinds (g, r, v …), m is an
    // argument the engines read and the rest are left out, as when the command is used without them (s and t
    // unstarred, o and d with no value, O{…} and D…{…} their default)
    const args = spec.v.match(/[dDrR]..(?:\{[^{}]*\})?|t.|[mvbeEsoOgG](?:\{[^{}]*\})?/g) || [];
    const specs = args.map((s): Spec | null => s === 'm' ? { kind: 'm' } : s === 's' ? { kind: 't', token: '*' } : s[0] === 't' ? { kind: 't', token: s[1] }
      : s === 'o' ? { kind: 'o', open: '[', close: ']' } : s[0] === 'O' ? { kind: 'o', open: '[', close: ']', def: s.slice(2, -1) }
      : s[0] === 'd' ? { kind: 'o', open: s[1], close: s[2] } : s[0] === 'D' && s.length > 3 ? { kind: 'o', open: s[1], close: s[2], def: s.slice(4, -1) } : null);
    if (specs.some((x) => x?.kind !== 'm') && specs.every((x) => x && !/[{}\\#%]/.test(x.kind === 't' ? x.token : x.kind === 'o' ? x.open + x.close : ''))) {
      const read = optionalArguments(name, specs as Spec[], b.v);
      if (read) return { name, end: b.end, ...read };
    }
    let k = 0, problem: Read['problem'];
    const map = args.map((s) => {
      if (s === 'm') return '#' + ++k;
      problem = 'optional';
      if (/^[st]/.test(s)) return FALSE;
      const d = /\{([^{}]*)\}$/.exec(s);
      return /^[ODRG]/.test(s) && d ? d[1] : NO_VALUE;
    });
    return { name, end: b.end, body: xparseBranches(b.v.replace(/#([1-9])/g, (all, n) => (map[+n - 1] ?? all))), args: k, problem };
  }
  // \newcommand{\name}[n][default]{body}: an optional first argument is always its default here
  const n = opt(t, j); if (n) j = n.end;
  const d = n ? opt(t, j) : null; if (d) j = d.end;
  const b = arg(t, j);
  if (!b) return null;
  const count = n ? Math.min(9, parseInt(n.v, 10) || 0) : 0;
  if (!d) return { name, end: b.end, body: b.v, args: count };
  const read = count >= 1 && optionalArguments(name, [{ kind: 'o', open: '[', close: ']', def: d.v }, ...Array.from({ length: count - 1 }, () => ({ kind: 'm' as const }))], b.v);
  if (read) return { name, end: b.end, ...read };
  return { name, end: b.end, problem: 'optional', args: Math.max(0, count - 1), body: b.v.replace(/#([1-9])/g, (_, k) => (k === '1' ? `{${d.v}}` : '#' + (+k - 1))) };
}

// TeX's conditionals, for finding the \else and \fi that close one
const CONDITIONAL = /^\\(?:if|ifx|ifnum|ifdim|ifodd|ifcat|ifcase|ifmmode|ifvmode|ifhmode|ifinner|ifdefined|ifcsname|iftrue|iffalse|ifvoid|ifhbox|ifvbox|ifeof)$/;
/**
 * `\ifx&#1&A\else B\fi` (any token in place of the two &): true when the argument is empty, when TeX compares the
 * token with itself; otherwise its first token is compared with the token, and B is read. Written as etoolbox's
 * \ifstrempty{#1}{A}{B}, which the engines read (math-functions.ts).
 */
function emptyTests(body: string): string {
  const IFX = /\\ifx\s*(\\[A-Za-z@]+\s*|[^\s\\{}#])\s*#([1-9])\s*(\\[A-Za-z@]+|[^\s\\{}#])/g;
  for (let guard = 0, m; guard < 50 && (m = IFX.exec(body)); guard++) {
    if (m[1].trim() !== m[3]) continue;
    // the \else and \fi at this conditional's level
    let depth = 0, other = -1, end = -1;
    const cs = /\\(?:[A-Za-z@]+|.)/g;
    cs.lastIndex = m.index + m[0].length;
    for (let c; (c = cs.exec(body));) {
      if (CONDITIONAL.test(c[0])) depth++;
      else if (c[0] === '\\else' && !depth && other < 0) other = c.index;
      else if (c[0] === '\\fi') { if (!depth) { end = c.index; break; } depth--; }
    }
    if (end < 0) break;
    const from = m.index + m[0].length, yes = body.slice(from, other < 0 ? end : other), no = other < 0 ? '' : body.slice(other + 5, end);
    const out = `\\ifstrempty{#${m[2]}}{${yes}}{${no}}`;
    body = body.slice(0, m.index) + out + body.slice(end + 3);
    IFX.lastIndex = m.index + out.length;
  }
  return body;
}

/**
 * `tex` with each \begin{name}…\end{name} of the file's environments written out: the begin code with its arguments,
 * the body, the end code (LaTeX's \begin adds only a \begingroup, which sets no atom of its own).
 */
export function expandEnvironments(tex: string, envs: Record<string, Environment>, depth = 0): string {
  if (depth > 8 || !/\\begin\s*\{/.test(tex)) return tex;
  let out = '', from = 0;
  const BEGIN = /\\begin\s*\{([^{}]*)\}/g;
  for (let m; (m = BEGIN.exec(tex));) {
    const env = envs[m[1].trim()];
    if (!env) continue;
    // its \end, others of the same name counted
    const ends = new RegExp(`\\\\(begin|end)\\s*\\{${m[1].trim().replace(/\*/g, '\\*')}\\}`, 'g');
    ends.lastIndex = m.index + m[0].length;
    let close: RegExpExecArray | null = null;
    for (let d = 0, e; (e = ends.exec(tex));) { if (e[1] === 'begin') d++; else if (d) d--; else { close = e; break; } }
    if (!close) continue;
    let at = m.index + m[0].length;
    const args: string[] = [];
    if (env.def !== undefined) { const o = opt(tex, at); args.push(o ? o.v : env.def); if (o) at = o.end; }
    let ok = true;
    while (args.length < env.args) { const x = arg(tex, at); if (!x) { ok = false; break; } args.push(x.v); at = x.end; }
    if (!ok) continue;
    const begin = env.begin.replace(/#([1-9])/g, (all, k) => args[+k - 1] ?? all);
    out += tex.slice(from, m.index) + begin + expandEnvironments(tex.slice(at, close.index), envs, depth + 1) + env.end;
    from = close.index + close[0].length;
    BEGIN.lastIndex = from;
  }
  return out + tex.slice(from);
}

/**
 * The engines give a macro as many arguments as its body names, counting #1, #2 … up to the first one it doesn't
 * (\newcommand{\second}[2]{#2} would take none): those it leaves out are named in a comment, which reads them and
 * draws nothing.
 */
function everyArgument(body: string, n: number): string {
  const unused = Array.from({ length: n }, (_, k) => '#' + (k + 1)).filter((a) => !body.includes(a));
  return unused.length ? '%' + unused.join('') + '\n' + body : body;
}

/** Every definition statement in `tex` (comments removed first), with the engines' macros and what they can't draw. */
export function parseMacros(tex: string): ParsedMacros {
  const t = stripComments(String(tex || ''));
  const out: ParsedMacros = { macros: {}, prelude: [], environments: {}, statements: [], problems: [] };
  const lineAt = (i: number) => t.slice(0, i).split('\n').length;
  // only definitions at the top, outside braces: one inside another command's argument (\tikzset{a/.code={\def\pv##1{…}}},
  // \AtBeginDocument{…}, \newenvironment{…}{…}{…}) is that command's, and wouldn't mean the same on its own
  let depth = 0, at = 0;
  const depthAt = (i: number) => {
    for (; at < i; at++) { const c = t[at]; if (c === '\\') at++; else if (c === '{') depth++; else if (c === '}' && depth) depth--; }
    return depth;
  };
  DEFINER_RE.lastIndex = 0;
  for (let m; (m = DEFINER_RE.exec(t));) {
    if (depthAt(m.index)) continue;
    if (SETUP[m[1]] !== undefined) {
      // written as it is, for exports; the engines have nothing to read in it
      const q = readSetup(m[1], t, m.index + m[0].length);
      if (!q) { out.problems.push({ line: lineAt(m.index), name: '\\' + m[1], reason: 'unreadable' }); continue; }
      out.statements.push({ text: t.slice(m.index, q.end).trim(), name: `\\${m[1]}{${q.first}}`, start: m.index, end: q.end });
      DEFINER_RE.lastIndex = at = q.end;
      continue;
    }
    const r = readDefinition(m[1], t, m.index + m[0].length);
    if (!r) { out.problems.push({ line: lineAt(m.index), name: '\\' + m[1], reason: 'unreadable' }); continue; }
    out.statements.push({ text: t.slice(m.index, r.end).trim(), name: r.name, start: m.index, end: r.end });
    DEFINER_RE.lastIndex = at = r.end; // (its own braces balance)
    // a name with @ (\@foo), or one used, needs \makeatletter, and the engines read @ as an ordinary character;
    // expl3 code (\ExplSyntaxOn) has names with _ and :, which they can't read either
    if (r.name.includes('@') || (regionAt(t, m.index).at && /\\[A-Za-z]*@/.test(out.statements[out.statements.length - 1].text))) { out.problems.push({ line: lineAt(m.index), name: r.name, reason: 'at' }); continue; }
    if (regionAt(t, m.index).expl) { out.problems.push({ line: lineAt(m.index), name: r.name, reason: 'unreadable' }); continue; }
    if (r.problem) out.problems.push({ line: lineAt(m.index), name: r.name, reason: r.problem });
    if (r.body !== undefined) out.macros[r.name] = everyArgument(emptyTests(r.body), r.args || 0);
    if (r.helpers) for (const [k, v] of Object.entries(r.helpers)) out.macros[k] = emptyTests(v);
    if (r.prelude) out.prelude.push(...r.prelude.map(emptyTests));
    if (r.environment) out.environments[r.name.slice(1, -1)] = r.environment;
  }
  // \left and \right as mleftright's: the pairs are rewritten instead (their \aftergroup has no engine counterpart)
  const via = (k: string, re: RegExp) => { const m = re.exec(out.macros[k] || ''); return m && out.macros[m[1]] === k ? m[1] : null; };
  if (via('\\left', /^\s*\\mathopen\s*\{\}\s*\\mathclose\s*\\bgroup\s*(\\[A-Za-z@]+)\s*$/) && via('\\right', /^\s*\\aftergroup\s*\\egroup\s*(\\[A-Za-z@]+)\s*$/)) {
    delete out.macros['\\left']; delete out.macros['\\right'];
    out.mleftright = true;
  }
  return out;
}

/**
 * Whether `i` in `t` (comments removed) is read after \makeatletter (before its \makeatother) and after \ExplSyntaxOn
 * (before its \ExplSyntaxOff).
 */
function regionAt(t: string, i: number): { at: boolean; expl: boolean } {
  const after = (on: string, off: string) => { const a = t.lastIndexOf(on, i), b = t.lastIndexOf(off, i); return a >= 0 && a > b; };
  return { at: after('\\makeatletter', '\\makeatother'), expl: after('\\ExplSyntaxOn', '\\ExplSyntaxOff') };
}
/**
 * A definition as a preamble must hold it on its own: between \makeatletter and \makeatother when it was read there and
 * names or uses an @ command (\@foo), which TeX reads as one name only so, and between \ExplSyntaxOn and \ExplSyntaxOff when it was
 * read in expl3 syntax (`t`: the comment-free text it is in).
 */
function standalone(t: string, s: MacroStatement): string {
  let text = s.text;
  if (regionAt(t, s.start).expl) text = `\\ExplSyntaxOn\n${text}\n\\ExplSyntaxOff`;
  if (regionAt(t, s.start).at && /\\[A-Za-z]*@/.test(s.text)) text = `\\makeatletter\n${text}\n\\makeatother`;
  return text;
}
/** The definitions of `tex`, each as a preamble must hold it on its own. */
function standaloneStatements(tex: string): { s: MacroStatement; text: string }[] {
  const t = stripComments(String(tex || ''));
  return parseMacros(t).statements.map((s) => ({ s, text: standalone(t, s) }));
}
/**
 * The macro definitions a preamble holds, for the file's macros: one statement per line, with \makeatletter or
 * \ExplSyntaxOn round those that need it.
 */
export function macrosOfPreamble(preamble: string, keep?: (texts: string[]) => string[]): string {
  const texts = standaloneStatements(preamble).map((x) => x.text);
  return (keep ? keep(texts) : texts).join('\n');
}

/**
 * Definitions `added` merged into the file's `current` ones: a command the file doesn't define yet is added; one it
 * defines already keeps the file's definition (listed in `kept` when the new one differs).
 */
export function mergeMacros(current: string, added: string): { text: string; added: string[]; kept: string[] } {
  const have = parseMacros(current), by = new Map(have.statements.map((s) => [s.name, s.text]));
  const lines = current.trim() ? [current.trim()] : [], add: string[] = [], kept: string[] = [];
  for (const { s, text } of standaloneStatements(added)) {
    const old = by.get(s.name);
    if (old === undefined) { lines.push(text); by.set(s.name, s.text); add.push(s.name); }
    else if (old !== s.text) kept.push(s.name);
  }
  return { text: lines.join('\n'), added: add, kept: [...new Set(kept)] };
}

// the arguments of a symbol-font statement that name a symbol font (1-based)
const FONT_ARGS: Record<string, number[]> = {
  DeclareSymbolFontAlphabet: [2], DeclareMathSymbol: [3], DeclareMathAccent: [3], DeclareMathDelimiter: [3, 5],
  DeclareMathRadical: [2, 4], SetSymbolFont: [1],
};
// the symbol fonts LaTeX declares, and amsfonts' (amssymb's)
const KNOWN_FONTS = new Set(['operators', 'letters', 'symbols', 'largesymbols', 'AMSa', 'AMSb']);
/** The statements to write into a preamble, without those already in it. A statement naming a symbol font that
 * isn't LaTeX's or declared among them (one a package of the source's declared: mathbbol's bbold) is left out: alone
 * it is an error. */
/** The symbol fonts `text` declares (\DeclareSymbolFont{name}…), with LaTeX's own. */
export function declaredFonts(text: string): Set<string> {
  const out = new Set(KNOWN_FONTS);
  for (const m of text.matchAll(/\\DeclareSymbolFont\s*\{\s*([^{}]*?)\s*\}/g)) out.add(m[1]);
  // (font families, as encoding/family: \DeclareFontShape{T1}{calligra} needs calligra's \DeclareFontFamily)
  for (const m of text.matchAll(/\\DeclareFontFamily\s*\{\s*([^{}]*?)\s*\}\s*\{\s*([^{}]*?)\s*\}/g)) out.add(`${m[1]}/${m[2]}`);
  return out;
}
/** Whether a statement names only symbol fonts in `declared` (any other statement: true). */
export function fontsKnown(statement: string, declared: Set<string>): boolean {
  const s = statement.trim(), m = /^\\([A-Za-z]+)/.exec(s), at = m && FONT_ARGS[m[1]];
  if (m && m[1] === 'DeclareFontShape') {
    // (a shape of a family that only a package of the source declared: calligra's T1/calligra)
    const f = /^\\DeclareFontShape\s*\{\s*([^{}]*?)\s*\}\s*\{\s*([^{}]*?)\s*\}/.exec(s);
    return !f || declared.has(`${f[1]}/${f[2]}`);
  }
  if (!at) return true;
  const args: string[] = [];
  for (let i = m![0].length, d = 0, from = -1; i < s.length; i++) {
    const c = s[i];
    if (c === '\\') { i++; continue; }
    if (c === '{') { if (d++ === 0) from = i + 1; } else if (c === '}' && --d === 0) args.push(s.slice(from, i).trim());
  }
  return at.every((n) => args[n - 1] == null || declared.has(args[n - 1]));
}
export function preambleLines(macros: string, preamble: string[] = []): string[] {
  const have = new Set(preamble.map((l) => l.trim())), fonts = declaredFonts(macros);
  return standaloneStatements(macros).filter((x) => !have.has(x.s.text) && !have.has(x.text) && fontsKnown(x.s.text, fonts)).map((x) => x.text);
}

/** The commands `macros` defines. */
export const definedNames = (macros: string) => new Set(parseMacros(macros).statements.map((s) => s.name));

/**
 * `text` (a picture's preamble definitions, kept as written) without its definitions of the commands in `names`,
 * which the file's macros define: the file's definition is the one written, so nothing is defined twice. Text that
 * defines none of them comes back as it is; otherwise it is read without its comments.
 */
export function withoutDefinitions(text: string, names: Set<string>): string {
  if (!names.size) return text;
  const t = stripComments(String(text || '')), cut = parseMacros(t).statements.filter((s) => names.has(s.name));
  if (!cut.length) return text;
  let out = '', at = 0;
  for (const s of cut) { out += t.slice(at, s.start); at = s.end; }
  out += t.slice(at);
  // and the \makeatletter … \makeatother (or expl3) round a definition that was cut, now round nothing
  for (let k = 0; k < 4; k++) out = out.replace(/\\makeatletter\s*\\makeatother/g, '').replace(/\\ExplSyntaxOn\s*\\ExplSyntaxOff/g, '');
  return out.split('\n').map((l) => l.replace(/\s+$/, '')).filter((l) => l.trim()).join('\n');
}
