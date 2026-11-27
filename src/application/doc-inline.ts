// Inline editing of a Classic document's text blocks: the block is edited as it looks (a contenteditable view of
// the page), and every change is written back to the block's LaTeX-flavoured source, so the file format, the
// preview and the LaTeX export are unchanged.
//
//  source → editable:  editableHtml(). Paragraphs, headings, list items and display maths carry their original
//                      source (data-src); formulas and anything without a visual editing form (\LaTeX, an
//                      unknown command) are atomic chips (contenteditable=false) holding their source.
//  editable → source:  serialise(). An element still exactly as it was drawn writes its original source, so
//                      untouched text keeps its exact spelling; edited text is written in canonical form.
//
// The structural edits (Enter, Backspace at a block's start, Tab in lists, block kinds, inline formats) are
// done here on the DOM, the same in every browser, instead of by the browser's own editing commands.
import { escapeHtml } from '../core/html';
import { DISPLAY_ENV } from '../core/tex-envs';

export const HEAD_RE = /^(#{1,3})\s+(.*)$/;
export const ITEM_RE = /^(\s*)([-*]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;

export interface InlineDeps {
  katex(src: string, display: boolean): string;
  colorCss(opt: string | undefined, v: string): string;
  safeUrl(u: string): string;
  words: Record<string, string>;
  heading(level: number, sec: number[], numbered: boolean): string;
}

const esc = escapeHtml;

// ---------------------------------------------------------------- display maths
// A text block's display maths: $$…$$, \[…\] and the amsmath display environments (equation, align, gather…,
// starred or not), over any number of lines. The page, this editor and the LaTeX export all cut a block with
// this, so a display is one piece everywhere: drawn as maths, edited as a formula, written back as it was typed.
// Returns text and displays in turn, [text, display, text, …, text], as String.split with a group would.
export interface DisplayMath { tex: string; src: string; env: boolean }
const MATH_ENV = DISPLAY_ENV; // (src/core/tex-envs.ts: the canvas's texts read the same list)
// where `delim` next starts, from `from`, skipping escaped characters (\\[2pt] is a line break, \$ a dollar)
function findClose(s: string, delim: string, from: number) {
  for (let j = from; j < s.length; j++) {
    if (s.startsWith(delim, j)) return j;
    if (s[j] === '\\') j++;
  }
  return -1;
}
export function splitDisplay(text: string): (string | DisplayMath)[] {
  const s = String(text), n = s.length, out: (string | DisplayMath)[] = [];
  let i = 0, from = 0;
  const take = (end: number, tex: string, env = false) => { out.push(s.slice(from, i), { tex, src: s.slice(i, end), env }); i = from = end; };
  while (i < n) {
    if (s[i] === '\\') {
      if (s[i + 1] === '[') { const k = findClose(s, '\\]', i + 2); if (k >= 0) { take(k + 2, s.slice(i + 2, k).trim()); continue; } }
      const m = s.startsWith('\\begin{', i) ? /^\\begin\{([^{}\n]+)\}/.exec(s.slice(i, i + 40)) : null;
      if (m && MATH_ENV.test(m[1])) {
        const end = `\\end{${m[1]}}`, k = s.indexOf(end, i + m[0].length);
        if (k >= 0) { take(k + end.length, s.slice(i, k + end.length), true); continue; }
      }
      i += 2; continue;
    }
    if (s[i] === '$' && s[i + 1] === '$') { const k = findClose(s, '$$', i + 2); if (k >= 0) { take(k + 2, s.slice(i + 2, k).trim()); continue; } }
    i++;
  }
  out.push(s.slice(from));
  return out;
}
// an edited display, written the way it was first typed: an environment as itself, \[…\] or $$…$$ around a formula
export const displaySrc = (tex: string, src = '') =>
  /^\s*\\begin\{/.test(tex) ? tex.trim() : src.startsWith('\\[') ? `\\[ ${tex.trim()} \\]` : `$$${tex}$$`;

// ---------------------------------------------------------------- source → editable
// text commands with an editing form: the element they become (and its class)
const CMD_EL: Record<string, [string, string?]> = {
  textbf: ['b'], textit: ['i'], emph: ['em'], underline: ['u'], uline: ['u'], sout: ['s'],
  texttt: ['span', 'tt'], textsc: ['span', 'sc'], textrm: ['span'],
  textcolor: ['span'], colorbox: ['span', 'cbox'], href: ['a'], url: ['a', 'tt'],
};
const NARGS: Record<string, number> = { textcolor: 2, colorbox: 2, href: 2 };
// what may follow a line break's \\: a star and a length, \\*[2pt]
export const BREAK_OPT = /^\*?(?:\[[^\]\n]*\])?/;

export const mathChip = (tex: string, D: InlineDeps) =>
  `<span class="ie-m" contenteditable="false" data-tex="${esc(tex)}">${D.katex(tex, false)}</span>`;
export const displayChip = (tex: string, D: InlineDeps, src?: string, glue = false) =>
  `<div class="dmath ie-d" contenteditable="false" data-tex="${esc(tex)}"${src !== undefined ? ` data-src="${esc(src)}"` : ''}${glue ? ' data-glue' : ''}>${tex.trim() ? D.katex(tex, true) : '<span class="ie-empty">$$</span>'}</div>`;
const rawChip = (src: string, html: string) => `<span class="ie-raw" contenteditable="false" data-src="${esc(src)}">${html}</span>`;

export function inlineHtml(src: string, D: InlineDeps): string {
  let out = '', i = 0;
  const n = src.length;
  const group = (j: number): [string, number] => {
    let d = 0;
    for (let k = j; k < n; k++) {
      const c = src[k];
      if (c === '\\') { k++; continue; }
      if (c === '{') d++;
      else if (c === '}' && !--d) return [src.slice(j + 1, k), k + 1];
    }
    return [src.slice(j + 1), n];
  };
  while (i < n) {
    const c = src[i];
    if (c === '$') {
      let k = i + 1;
      while (k < n && !(src[k] === '$' && src[k - 1] !== '\\')) k++;
      if (k < n && k > i + 1) { out += mathChip(src.slice(i + 1, k), D); i = k + 1; continue; }
    }
    if (c === '\\') {
      const nx = src[i + 1] || '';
      if (nx === '(') { const k = src.indexOf('\\)', i + 2); if (k > 0) { out += mathChip(src.slice(i + 2, k), D); i = k + 2; continue; } }
      if (nx === '\\') { // a line break, with its spacing (\\[2pt]) kept for writing back
        const o = BREAK_OPT.exec(src.slice(i + 2))![0];
        out += o ? `<br data-brk="${esc(o)}">` : '<br>'; i += 2 + o.length; continue;
      }
      if (nx === ',') { out += ' '; i += 2; continue; }
      if (/[%&#$_{}~^ ]/.test(nx)) {
        out += esc(nx); i += 2;
        if ((nx === '~' || nx === '^') && src[i] === '{' && src[i + 1] === '}') i += 2;
        continue;
      }
      const m = /^\\([A-Za-z]+)\s*/.exec(src.slice(i, i + 40));
      if (m && CMD_EL[m[1]]) {
        const cmd = m[1], na = NARGS[cmd] || 1;
        let j = i + m[0].length, opt: string | undefined;
        if (src[j] === '[') { const e = src.indexOf(']', j); if (e > 0) { opt = src.slice(j + 1, e); j = e + 1; } }
        const args: string[] = [];
        for (let a = 0; a < na; a++) { while (src[j] === ' ') j++; if (src[j] !== '{') break; const [g, nj] = group(j); args.push(g); j = nj; }
        if (args.length === na) { out += element(cmd, args, opt, D); i = j; continue; }
      }
      if (m && D.words[m[1]] !== undefined) {
        let j = i + m[0].length;
        if (src[j] === '{' && src[j + 1] === '}') j += 2;
        out += rawChip(src.slice(i, j), D.words[m[1]]);
        i = j; continue;
      }
      if (m) {
        // a command with no editing form: kept as its source, with the options and arguments right after it
        let j = i + 1 + m[1].length;
        for (;;) {
          if (src[j] === '[') { const e = src.indexOf(']', j); if (e < 0) break; j = e + 1; continue; }
          if (src[j] === '{') { j = group(j)[1]; continue; }
          break;
        }
        const s = src.slice(i, j);
        out += rawChip(s, `<span class="ie-src">${esc(s)}</span>`);
        i = j; continue;
      }
      out += rawChip('\\', '\\'); i++; continue;
    }
    if (c === '~') { out += ' '; i++; continue; }
    if (c === '-' && src[i + 1] === '-') { const em = src[i + 2] === '-'; out += em ? '—' : '–'; i += em ? 3 : 2; continue; }
    if (c === '`' && src[i + 1] === '`') { out += '“'; i += 2; continue; }
    if (c === "'" && src[i + 1] === "'") { out += '”'; i += 2; continue; }
    if (c === '{' || c === '}') { i++; continue; }
    out += esc(c);
    i++;
  }
  return out;
}

function element(cmd: string, args: string[], opt: string | undefined, D: InlineDeps) {
  const [tag, cls] = CMD_EL[cmd], na = NARGS[cmd] || 1;
  const content = cmd === 'url' ? esc(args[0]) : inlineHtml(args[na - 1], D);
  let style = '';
  if (cmd === 'textcolor') style = ` style="color:${esc(D.colorCss(opt, args[0]))}"`;
  if (cmd === 'colorbox') style = ` style="background:${esc(D.colorCss(opt, args[0]))}"`;
  const href = cmd === 'href' ? ` href="${esc(D.safeUrl(args[0]))}"` : cmd === 'url' ? ` href="${esc(D.safeUrl(args[0]))}"` : '';
  return `<${tag} data-cmd="${cmd}"${na === 2 ? ` data-arg="${esc(args[0])}"` : ''}${opt !== undefined ? ` data-opt="${esc(opt)}"` : ''}${cls ? ` class="${cls}"` : ''}${style}${href}>${content}</${tag}>`;
}

interface Item { src: string[]; html: string; box?: boolean; sub: List[] }
interface List { kind: string; level: number; items: Item[]; tight?: boolean }
const itemKind = (m: RegExpMatchArray) => (m[3] !== undefined ? 'chk' : /\d/.test(m[2]) ? 'ol' : 'ul');
function listHtml(l: List): string {
  const tag = l.kind === 'ol' ? 'ol' : 'ul';
  return `<${tag}${l.kind === 'chk' ? ' class="chk"' : ''}${l.tight ? ' data-tight' : ''}>${l.items.map((it) =>
    `<li data-src="${esc(it.src.join('\n'))}" data-k="${l.kind}" data-lv="${l.level}">${it.box !== undefined ? `<span class="cbx${it.box ? ' on' : ''}" contenteditable="false"></span>` : ''}${it.html || '<br>'}${it.sub.map(listHtml).join('')}</li>`).join('')}</${tag}>`;
}

// The block's source as editable HTML; ctx counts section numbers across blocks, as the page does.
export function editableHtml(text: string, ctx: { sec: number[]; numbered?: boolean }, D: InlineDeps): string {
  const out: (string | List)[] = [];
  // a display and the text round it with no blank line between are one paragraph: marked (data-glue) so that
  // writing back joins them with a line break, not a paragraph break
  const blank = (s: string) => /\n[ \t]*\n/.test(s);
  let before = ''; // the text since the last element: does a blank line separate the next one?
  splitDisplay(text).forEach((part) => {
    if (typeof part !== 'string') { out.push(displayChip(part.tex, D, part.src, out.length > 0 && !blank(before))); before = ''; return; }
    let para: string[] = [];
    let stack: List[] = [];
    let glue = out.length > 0 && !blank(part.slice(0, part.length - part.trimStart().length));
    const flush = () => {
      if (para.length) { out.push(`<p data-src="${esc(para.join('\n'))}"${glue ? ' data-glue' : ''}>${para.map((l) => inlineHtml(l, D)).join(' ')}</p>`); glue = false; }
      para = [];
    };
    before = part.slice(part.trimEnd().length);
    for (const raw of part.split('\n')) {
      const line = raw.replace(/\s+$/, '');
      if (!line.trim()) { flush(); stack = []; continue; }
      const h = line.match(HEAD_RE);
      if (h) {
        flush(); stack = [];
        const lv = h[1].length, no = D.heading(lv, ctx.sec, !!ctx.numbered);
        glue = false;
        out.push(`<h${lv + 1} data-src="${esc(line)}">${no ? `<span class="ie-secno" contenteditable="false">${esc(no)}</span>` : ''}${inlineHtml(h[2], D) || '<br>'}</h${lv + 1}>`);
        continue;
      }
      const m = line.match(ITEM_RE);
      if (m) {
        flush(); glue = false;
        const level = Math.floor(m[1].replace(/\t/g, '  ').length / 2), kind = itemKind(m);
        while (stack.length && stack[stack.length - 1].level > level) stack.pop();
        let top = stack[stack.length - 1], tight = false;
        // another kind of list straight after one (no blank line between): written back the same way
        if (top && top.level === level && top.kind !== kind) { stack.pop(); top = stack[stack.length - 1]; tight = true; }
        if (!top || top.level < level) {
          const l: List = { kind, level, items: [], tight: tight && !top };
          const parent = top && top.items[top.items.length - 1];
          if (parent) parent.sub.push(l); else out.push(l);
          stack.push(l);
          top = l;
        }
        top.items.push({ src: [raw.replace(/\s+$/, '')], html: inlineHtml(m[4], D), box: kind === 'chk' ? m[3] !== ' ' : undefined, sub: [] });
        continue;
      }
      if (stack.length && /^\s/.test(raw)) {
        const top = stack[stack.length - 1], it = top.items[top.items.length - 1];
        it.src.push(raw.replace(/\s+$/, '')); it.html += ' ' + inlineHtml(line.trim(), D);
        continue;
      }
      stack = [];
      para.push(line.trim());
    }
    flush();
  });
  const html = out.map((x) => (typeof x === 'string' ? x : listHtml(x))).join('');
  return html || '<p><br></p>';
}

// ---------------------------------------------------------------- editable → source
const TEXT_ESC: Record<string, string> = {
  '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '%': '\\%', '&': '\\&', '#': '\\#', _: '\\_', '^': '\\^{}', '~': '\\~{}',
  ' ': '~', ' ': '\\,', '–': '--', '—': '---', '“': '``', '”': "''", '​': '', '\n': ' ',
};
const serText = (s: string) => s.replace(/[\\{}$%&#_^~  –—“”​\n]/g, (c) => TEXT_ESC[c]);
const TAG_CMD: Record<string, string> = { B: 'textbf', STRONG: 'textbf', I: 'textit', EM: 'emph', U: 'underline', S: 'sout', STRIKE: 'sout', DEL: 'sout', A: 'href' };
const isList = (n: Node | null): boolean => !!n && n.nodeType === 1 && /^(UL|OL)$/.test((n as Element).tagName);
const atomic = (n: Node) => n.nodeType === 1 && (n as Element).getAttribute('contenteditable') === 'false';
// the last thing in its block, ignoring empty text: a <br> there only keeps an empty line open
function trailing(n: Node): boolean {
  for (let s = n.nextSibling; s; s = s.nextSibling) if (!(s.nodeType === 3 && !s.nodeValue) && !isList(s)) return false;
  const p = n.parentElement;
  return !p || BLOCK.test(p.tagName) || p.classList.contains('blk-ie') || trailing(p);
}
const BLOCK = /^(P|DIV|H[1-6]|LI|UL|OL|BLOCKQUOTE|PRE|SECTION|ARTICLE|TABLE)$/;

export function serInline(node: Node): string {
  let s = '';
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) { s += serText(c.nodeValue || ''); return; }
    if (c.nodeType !== 1) return;
    const e = c as HTMLElement, tag = e.tagName;
    if (e.classList.contains('ie-m')) { const x = e.dataset.tex || ''; if (x.trim()) s += `$${x}$`; return; }
    if (e.classList.contains('ie-raw')) { s += e.dataset.src || ''; return; }
    if (e.classList.contains('cbx') || e.classList.contains('ie-secno') || isList(e)) return;
    if (tag === 'BR') { if (!trailing(e)) s += '\\\\' + (e.dataset.brk || '') + ' '; return; }
    const cmd = e.dataset.cmd || TAG_CMD[tag] || '';
    if (cmd === 'url') { const u = e.textContent || ''; if (u.trim()) s += `\\url{${u}}`; return; }
    const inner = serInline(e);
    if (!cmd) { s += inner; return; }
    if (!inner.trim()) return; // an emptied format leaves nothing behind
    const arg = cmd === 'href' ? (e.dataset.arg ?? e.getAttribute('href') ?? '') : e.dataset.arg;
    s += `\\${cmd}${e.dataset.opt !== undefined ? `[${e.dataset.opt}]` : ''}${arg !== undefined ? `{${arg}}` : ''}{${inner}}`;
  });
  return s;
}

// what an item's own line shows (its text, not its nested lists): how an untouched item is recognised
export function ownHtml(li: Element) {
  let s = '';
  li.childNodes.forEach((n) => { if (!isList(n)) s += n.nodeType === 1 ? (n as Element).outerHTML : n.nodeValue; });
  return s;
}
export function recordOrig(root: Element, orig: WeakMap<Element, string>) {
  root.querySelectorAll('[data-src]').forEach((e) => { if (!e.classList.contains('ie-raw')) orig.set(e, e.tagName === 'LI' ? ownHtml(e) : e.innerHTML); });
}

// a line that would read as a heading or a list item starts with an empty group instead
const guard = (s: string) => (/^(#{1,3}\s|([-*]|\d+[.)])\s)/.test(s) ? '{}' + s : s);

export function serialise(root: Element, orig: WeakMap<Element, string>): string {
  const blocks: string[] = [];
  let lastList = false; // the block written last was a list (a tight list joins it)
  const untouched = (e: HTMLElement) => e.dataset.src !== undefined && orig.get(e) === e.innerHTML;
  const para = (e: HTMLElement) => {
    if (untouched(e)) { blocks.push(e.dataset.src!); return; }
    const s = serInline(e).trim();
    if (s) blocks.push(guard(s));
  };
  const listLines = (list: HTMLElement, level: number, lines: string[]) => {
    const kind = list.tagName === 'OL' ? 'ol' : list.classList.contains('chk') ? 'chk' : 'ul';
    let n = 0;
    for (const li of Array.from(list.children) as HTMLElement[]) {
      if (isList(li)) { listLines(li, level + 1, lines); continue; }
      if (li.tagName !== 'LI') continue;
      const subs = (Array.from(li.children) as HTMLElement[]).filter(isList);
      const text = serInline(li).trim();
      if (li.dataset.src !== undefined && orig.get(li) === ownHtml(li) && li.dataset.lv === String(level) && li.dataset.k === kind) { lines.push(li.dataset.src); n++; }
      else if (text || kind === 'chk') {
        n++;
        const box = kind === 'chk' ? (li.querySelector(':scope > .cbx.on') ? '[x] ' : '[ ] ') : '';
        if (text || box) lines.push('  '.repeat(level) + (kind === 'ol' ? n + '.' : '-') + ' ' + box + text);
      }
      for (const sub of subs) listLines(sub, level + 1, lines);
    }
  };
  const push = blocks.push.bind(blocks);
  blocks.push = (...x: string[]) => { lastList = false; return push(...x); };
  const walk = (container: Element) => {
    let loose: Node[] = [];
    const flushLoose = () => {
      if (!loose.length) return;
      const p = document.createElement('p');
      loose.forEach((n) => p.appendChild(n.cloneNode(true)));
      para(p); loose = [];
    };
    container.childNodes.forEach((c) => {
      if (c.nodeType === 3) { if ((c.nodeValue || '').trim()) loose.push(c); return; }
      if (c.nodeType !== 1) return;
      const e = c as HTMLElement;
      if (!BLOCK.test(e.tagName)) { loose.push(e); return; }
      flushLoose();
      const n0 = blocks.length;
      block(e);
      // a display and its paragraph with no blank line between them in the source stay one paragraph
      if (e.dataset.glue !== undefined && n0 > 0 && blocks.length === n0 + 1) { const x = blocks.pop()!; blocks[n0 - 1] += '\n' + x; }
    });
    flushLoose();
  };
  const block = (e: HTMLElement) => {
    const tag = e.tagName;
    if (/^H[1-6]$/.test(tag)) {
      const lvl = Math.min(3, Math.max(1, +tag[1] - 1));
      if (untouched(e) && (e.dataset.src!.match(HEAD_RE) || [])[1]?.length === lvl) blocks.push(e.dataset.src!);
      else { const s = serInline(e).trim(); if (s) blocks.push('#'.repeat(lvl) + ' ' + s); }
      return;
    }
    if (isList(e)) {
      const lines: string[] = []; listLines(e, 0, lines);
      if (!lines.length) return;
      if (lastList && e.dataset.tight !== undefined) blocks[blocks.length - 1] += '\n' + lines.join('\n');
      else blocks.push(lines.join('\n'));
      lastList = true;
      return;
    }
    if (e.classList.contains('dmath')) {
      const tex = e.dataset.tex || '';
      if (tex.trim()) blocks.push(untouched(e) ? e.dataset.src! : displaySrc(tex, e.dataset.src));
      return;
    }
    // a block holding blocks (pasted or merged structure) is read block by block
    if ((Array.from(e.children) as Element[]).some((k) => BLOCK.test(k.tagName))) { walk(e); return; }
    para(e);
  };
  walk(root);
  return blocks.join('\n\n');
}

// ---------------------------------------------------------------- caret, kept as a count of positions
// Text counts its characters, an atomic chip or a line break one, and a block's start one, so a caret can be
// put back after the editor is drawn again from the source.
function units(node: Node): number {
  let n = 0;
  node.childNodes.forEach((c) => {
    if (c.nodeType === 3) { n += (c.nodeValue || '').length; return; }
    if (c.nodeType !== 1) return;
    const e = c as Element;
    if (atomic(e) || e.tagName === 'BR') { n += 1; return; }
    if (BLOCK.test(e.tagName) && !isList(e)) n += 1;
    n += units(e);
  });
  return n;
}
export function caretOffset(root: Element): number | null {
  const sel = getSelection();
  if (!sel || !sel.rangeCount) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer)) return null;
  const pre = document.createRange();
  pre.setStart(root, 0); pre.setEnd(r.startContainer, r.startOffset);
  return units(pre.cloneContents());
}
export function setCaret(root: Element, n: number) {
  let left = n, found: [Node, number] | null = null;
  const walk = (node: Node) => {
    const kids = Array.from(node.childNodes);
    for (let k = 0; k < kids.length && !found; k++) {
      const c = kids[k];
      if (c.nodeType === 3) { const L = (c.nodeValue || '').length; if (left <= L) { found = [c, left]; return; } left -= L; continue; }
      if (c.nodeType !== 1) continue;
      const e = c as Element;
      if (atomic(e) || e.tagName === 'BR') { if (left === 0) { found = [node, k]; return; } left -= 1; continue; }
      if (BLOCK.test(e.tagName) && !isList(e)) { if (left === 0) { found = [node, k]; return; } left -= 1; if (left === 0) { found = firstPos(e); return; } }
      walk(e);
    }
    if (!found && left === 0) found = [node, kids.length];
  };
  walk(root);
  const at = found || lastPos(root);
  const sel = getSelection()!;
  sel.removeAllRanges();
  const r = document.createRange(); r.setStart(at[0], at[1]); r.collapse(true); sel.addRange(r);
}
// the first and last places a caret can be in an element (after a checkbox or a section number)
export function firstPos(e: Node): [Node, number] {
  let k = 0;
  while (k < e.childNodes.length && atomic(e.childNodes[k]) && ((e.childNodes[k] as Element).classList.contains('cbx') || (e.childNodes[k] as Element).classList.contains('ie-secno'))) k++;
  const c = e.childNodes[k];
  if (c && c.nodeType === 3) return [c, 0];
  if (c && c.nodeType === 1 && !atomic(c) && (c as Element).tagName !== 'BR' && !isList(c)) return firstPos(c);
  return [e, k];
}
export function lastPos(e: Node): [Node, number] {
  let k = e.childNodes.length;
  while (k > 0 && (isList(e.childNodes[k - 1]) || (e.childNodes[k - 1] as Element).tagName === 'BR')) k--;
  const c = e.childNodes[k - 1];
  if (c && c.nodeType === 3) return [c, (c.nodeValue || '').length];
  if (c && c.nodeType === 1 && !atomic(c) && !BLOCK.test((c as Element).tagName)) return lastPos(c);
  if (c && c.nodeType === 1 && BLOCK.test((c as Element).tagName) && !isList(c)) return lastPos(c);
  return [e, k];
}
export function placeCaret(at: [Node, number]) {
  const sel = getSelection()!, r = document.createRange();
  r.setStart(at[0], at[1]); r.collapse(true);
  sel.removeAllRanges(); sel.addRange(r);
}

// ---------------------------------------------------------------- blocks
// The block a node is in: a list item, or a child of the editor (paragraph, heading, display maths).
export function blockOf(node: Node | null, root: Element): HTMLElement | null {
  let e: Node | null = node;
  while (e && e !== root) {
    if (e.nodeType === 1 && ((e as Element).tagName === 'LI' || e.parentNode === root)) return e as HTMLElement;
    e = e.parentNode;
  }
  return null;
}
export const blockKind = (b: HTMLElement | null): string => {
  if (!b) return 'p';
  if (b.tagName === 'LI') { const l = b.parentElement!; return l.tagName === 'OL' ? 'ol' : l.classList.contains('chk') ? 'chk' : 'ul'; }
  if (/^H[2-4]$/.test(b.tagName)) return '#'.repeat(+b.tagName[1] - 1);
  if (b.classList.contains('dmath')) return 'dmath';
  return 'p';
};
// the blocks the selection touches, in order
export function selectedBlocks(root: Element, r: Range): HTMLElement[] {
  const all = Array.from(root.querySelectorAll<HTMLElement>(':scope > *, li'));
  const hit = all.filter((b) => r.intersectsNode(b) && !(b.tagName === 'UL' || b.tagName === 'OL'));
  // an item whose nested items are selected is only part of it when its own line is
  const own = hit.filter((b) => {
    if (b.tagName !== 'LI') return true;
    const sub = Array.from(b.children).find(isList);
    if (!sub) return true;
    const line = document.createRange(); line.setStart(b, 0); line.setEndBefore(sub);
    return r.compareBoundaryPoints(Range.START_TO_END, line) > 0 && r.compareBoundaryPoints(Range.END_TO_START, line) < 0;
  });
  const b0 = blockOf(r.startContainer, root);
  return own.length ? own : b0 ? [b0] : [];
}
const ensureLine = (e: HTMLElement) => {
  const hasContent = Array.from(e.childNodes).some((n) => (n.nodeType === 3 && n.nodeValue) || (n.nodeType === 1 && !isList(n) && !(n as Element).classList.contains('cbx')));
  if (!hasContent) { const sub = Array.from(e.childNodes).find(isList); e.insertBefore(document.createElement('br'), sub || null); }
};
const newItem = (list: Element) => {
  const li = document.createElement('li');
  if (list.classList.contains('chk')) li.innerHTML = '<span class="cbx" contenteditable="false"></span>';
  return li;
};
const listFor = (kind: string) => {
  const l = document.createElement(kind === 'ol' ? 'ol' : 'ul');
  if (kind === 'chk') l.className = 'chk';
  return l;
};
// move the children of `from` (except a checkbox, a section number and nested lists) to `to`
function moveLine(from: Element, to: Element) {
  for (const n of Array.from(from.childNodes)) {
    if (n.nodeType === 1 && ((n as Element).classList.contains('cbx') || (n as Element).classList.contains('ie-secno') || isList(n))) continue;
    to.appendChild(n);
  }
}
// is the caret at the very start of its block's line?
export function atLineStart(b: HTMLElement, r: Range) {
  const pre = document.createRange();
  const [n, o] = firstPos(b);
  pre.setStart(n, o);
  try { pre.setEnd(r.startContainer, r.startOffset); } catch { return false; }
  if (pre.collapsed) return true;
  const f = pre.cloneContents();
  return !f.textContent && !f.querySelector?.('.ie-m, .ie-raw, br');
}

// Enter: split the block at the caret. An empty list item leaves the list (one level per Enter).
export function splitBlock(root: Element) {
  const sel = getSelection()!;
  const r = sel.getRangeAt(0);
  if (!r.collapsed) r.deleteContents();
  let b = blockOf(r.startContainer, root);
  if (!b) {
    const p = document.createElement('p'); p.innerHTML = '<br>'; root.appendChild(p); placeCaret([p, 0]); return;
  }
  if (b.classList.contains('dmath')) { const p = document.createElement('p'); p.innerHTML = '<br>'; b.after(p); placeCaret([p, 0]); return; }
  if (b.tagName === 'LI' && !serInline(b).trim() && !b.querySelector(':scope > .ie-m, :scope > .ie-raw')) { outdent(b, root, true); return; }
  const sub = b.tagName === 'LI' ? Array.from(b.children).find(isList) : undefined;
  const tail = document.createRange();
  tail.setStart(r.startContainer, r.startOffset);
  if (sub) tail.setEndBefore(sub); else tail.setEnd(b, b.childNodes.length);
  const frag = tail.extractContents();
  let next: HTMLElement;
  if (b.tagName === 'LI') next = newItem(b.parentElement!);
  else if (/^H[2-4]$/.test(b.tagName) && !(frag.textContent || frag.querySelector?.('.ie-m, .ie-raw'))) next = document.createElement('p');
  else next = document.createElement(/^H[2-4]$/.test(b.tagName) ? b.tagName : 'p');
  next.appendChild(frag);
  next.querySelectorAll('.ie-secno').forEach((x) => x.remove());
  if (sub) next.appendChild(sub);
  b.after(next);
  ensureLine(b); ensureLine(next);
  placeCaret(firstPos(next));
}

// Tab in a list: the item goes under the item before it.
export function indent(li: HTMLElement) {
  const prev = li.previousElementSibling as HTMLElement | null;
  if (!prev || prev.tagName !== 'LI') return false;
  const list = li.parentElement!;
  let sub = Array.from(prev.children).reverse().find(isList) as HTMLElement | undefined;
  if (!sub || sub.tagName !== list.tagName || sub.className !== list.className) {
    sub = document.createElement(list.tagName); if (list.className) sub.className = list.className; prev.appendChild(sub);
  }
  sub.appendChild(li);
  // its own nested items come along, one level deeper
  return true;
}
// Shift+Tab (or Enter on an empty item): the item moves out one level; at the top it becomes a paragraph.
export function outdent(li: HTMLElement, root: Element, keepCaret = true): HTMLElement {
  const list = li.parentElement!, parentLi = list.parentElement!;
  const after = [];
  for (let s = li.nextElementSibling; s; s = s.nextElementSibling) after.push(s);
  if (after.length) {
    const rest = document.createElement(list.tagName); if (list.className) rest.className = list.className;
    after.forEach((x) => rest.appendChild(x));
    if (parentLi.tagName === 'LI') li.appendChild(rest); else list.after(rest);
  }
  if (parentLi.tagName === 'LI') {
    // into the outer list, after the item it was under, taking that list's kind
    const outer = parentLi.parentElement!;
    const box = li.querySelector(':scope > .cbx');
    if (outer.classList.contains('chk') && !box) li.prepend(Object.assign(document.createElement('span'), { className: 'cbx', contentEditable: 'false' }));
    if (!outer.classList.contains('chk') && box) box.remove();
    parentLi.after(li);
  } else {
    const p = document.createElement('p');
    moveLine(li, p);
    ensureLine(p);
    const subs = Array.from(li.children).filter(isList);
    list.after(p);
    let at: Element = p;
    for (const s of subs) { at.after(s); at = s; }
    li.remove();
    if (!list.children.length) list.remove();
    if (keepCaret) placeCaret(firstPos(p));
    return p;
  }
  if (!list.children.length) list.remove();
  if (keepCaret) placeCaret(firstPos(li));
  void root;
  return li;
}

// Paragraph / Section … and the list buttons: change what the selected blocks are.
export function setKind(root: Element, blocks: HTMLElement[], kind: string): HTMLElement[] {
  const out: HTMLElement[] = [];
  for (let b of blocks) {
    if (!b.isConnected || b.classList.contains('dmath')) continue;
    if (blockKind(b) === kind) { out.push(b); continue; }
    if (b.tagName === 'LI') {
      if (kind === 'ul' || kind === 'ol' || kind === 'chk') { retagList(b.parentElement!, kind); out.push(b); continue; }
      // out of the list (to the top) as a paragraph, then a heading if that was asked for
      while (b.parentElement!.parentElement!.tagName === 'LI') outdent(b, root, false);
      b = outdent(b, root, false);
      if (kind === 'p') { out.push(b); continue; }
    }
    if (kind === 'ul' || kind === 'ol' || kind === 'chk') {
      const prev = b.previousElementSibling as HTMLElement | null;
      const li = document.createElement('li');
      if (kind === 'chk') li.innerHTML = '<span class="cbx" contenteditable="false"></span>';
      moveLine(b, li); ensureLine(li);
      if (prev && isList(prev) && blockKind(prev.firstElementChild as HTMLElement) === kind) { prev.appendChild(li); b.remove(); }
      else { const l = listFor(kind); l.appendChild(li); b.replaceWith(l); }
      const next = li.parentElement!.nextElementSibling as HTMLElement | null;
      if (next && isList(next) && next !== li.parentElement && blockKind(next.firstElementChild as HTMLElement) === kind) { Array.from(next.children).forEach((x) => li.parentElement!.appendChild(x)); next.remove(); }
      out.push(li);
      continue;
    }
    const e = document.createElement(kind === 'p' ? 'p' : 'h' + (kind.length + 1));
    moveLine(b, e); ensureLine(e);
    b.replaceWith(e);
    out.push(e);
  }
  return out;
}
function retagList(list: HTMLElement, kind: string) {
  const l = listFor(kind);
  for (const li of Array.from(list.children)) {
    const box = li.querySelector(':scope > .cbx');
    if (kind === 'chk' && !box) li.prepend(Object.assign(document.createElement('span'), { className: 'cbx', contentEditable: 'false' }));
    if (kind !== 'chk' && box) box.remove();
    l.appendChild(li);
  }
  list.replaceWith(l);
}

// ---------------------------------------------------------------- inline formats
const sameCmd = (e: Element, cmd: string) => (e as HTMLElement).dataset?.cmd === cmd || TAG_CMD[e.tagName] === cmd;
export function formatAncestor(node: Node | null, root: Element, cmd: string): HTMLElement | null {
  let e: Node | null = node;
  while (e && e !== root) { if (e.nodeType === 1 && sameCmd(e as Element, cmd)) return e as HTMLElement; e = e.parentNode; }
  return null;
}
const unwrap = (e: Element) => { e.replaceWith(...Array.from(e.childNodes)); };
// The parts of the selection inside each block's line, so a format never wraps blocks.
function lineRanges(root: Element, r: Range): Range[] {
  const out: Range[] = [];
  for (const b of selectedBlocks(root, r)) {
    if (b.classList.contains('dmath')) continue;
    const line = document.createRange();
    const [n0, o0] = firstPos(b); line.setStart(n0, o0);
    const sub = Array.from(b.children).find(isList);
    if (sub) line.setEndBefore(sub); else line.setEnd(b, b.childNodes.length);
    if (r.compareBoundaryPoints(Range.START_TO_START, line) > 0) line.setStart(r.startContainer, r.startOffset);
    if (r.compareBoundaryPoints(Range.END_TO_END, line) < 0) line.setEnd(r.endContainer, r.endOffset);
    if (!line.collapsed) out.push(line);
  }
  return out;
}
// Bold, italic …: off when the selection is inside one, else wraps it. With no selection the format starts
// at the caret for what is typed next.
export function toggleFormat(root: Element, cmd: string, tag: string, attrs: Record<string, string> = {}, style = '', force = false) {
  const sel = getSelection()!;
  if (!sel.rangeCount) return;
  const r = sel.getRangeAt(0);
  const make = () => {
    const e = document.createElement(tag);
    e.dataset.cmd = cmd;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (style) e.setAttribute('style', style);
    return e;
  };
  const anc = formatAncestor(r.commonAncestorContainer, root, cmd);
  if (anc && !force) {
    if (r.collapsed) {
      // typing continues outside the format
      const z = document.createTextNode('​'); anc.after(z); placeCaret([z, 1]);
    } else unwrap(anc);
    return;
  }
  if (r.collapsed) {
    const e = make(), z = document.createTextNode('​');
    e.appendChild(z); r.insertNode(e); placeCaret([z, 1]);
    return;
  }
  const made: HTMLElement[] = [];
  for (const lr of lineRanges(root, r)) {
    const e = make();
    e.appendChild(lr.extractContents());
    e.querySelectorAll('*').forEach((x) => { if (sameCmd(x, cmd)) unwrap(x); });
    lr.insertNode(e);
    made.push(e);
  }
  if (anc && force) {
    // the same format around the whole of it: change that one instead of nesting
    for (const e of made) if (e.parentElement === anc && anc.childNodes.length === 1) { for (const [k, v] of Object.entries(attrs)) anc.setAttribute(k, v); if (style) anc.setAttribute('style', style); unwrap(e); }
  }
  if (made.length) {
    // selected inside the new formats, so the toolbar shows them on
    const nr = document.createRange(), last = made[made.length - 1];
    nr.setStart(made[0], 0); nr.setEnd(last, last.childNodes.length);
    sel.removeAllRanges(); sel.addRange(nr);
  }
}
// formats on at the caret (for the toolbar)
export function activeFormats(root: Element, node: Node | null): Set<string> {
  const on = new Set<string>();
  let e: Node | null = node;
  while (e && e !== root) {
    if (e.nodeType === 1) { const c = (e as HTMLElement).dataset.cmd || TAG_CMD[(e as Element).tagName]; if (c) on.add(c); }
    e = e.parentNode;
  }
  return on;
}
