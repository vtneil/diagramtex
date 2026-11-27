import { previewFadeFinished } from '../platform/preview-fade';
import { finishThai, docFont as docFontOf, DOC_FONTS, type TexEngine } from '../core/doc-fonts';
import { updateSvg } from '../platform/update-svg';
import { SvgLabelResources } from '../platform/svg-label-resources';
import { wheelZoomFactor } from '../ui/wheel-zoom';
import { parseMacros } from '../core/doc-macros';
import { closingDollar } from '../core/tex-scan';
import DocumentSettings from '../ui/DocumentSettings.svelte';
import { renderView, destroyView } from '../ui/render-view.svelte';
import DocumentView, { type DocumentViewModel } from '../ui/DocumentView.svelte';
import DocBlockChrome, { type DocBlockChromeModel } from '../ui/DocBlockChrome.svelte';
import { runtime as TD } from '../runtime';
import { t, onLocale } from '../i18n';
import { keyLabel } from '../ui/kit/keys';
import { applyTexFormat } from '../ui/tex-format';
const undoText = () => t('hint.undoBringsBack', '{key} brings it back', { key: keyLabel('Ctrl+Z') });
import { downloadImage } from '../platform/download';
import { readPicture } from '../platform/images';
import * as IE from './doc-inline';
import { createDocHistory } from './doc-history';
// Document view: a page of text blocks (LaTeX-flavoured, $math$) with embedded diagrams,
// plus whole-document LaTeX export.
(function () {
  // a file's own name, without the folders in front of it ("Physics/Lab 1" → "Lab 1")
  const leafName = (n: any) => { const p = String(n || '').split('/').map((x) => x.trim()).filter(Boolean); return p.length ? p[p.length - 1] : ''; };
  const app = TD.app;
  const { esc } = TD.util;
  const root = document.getElementById('docview');
  const labelResources = new SvgLabelResources();

  // Track the first diagram intersecting the document viewport, including a
  // diagram whose top has already scrolled off screen. Keep the last selection
  // while only text is visible.
  let visibleFrame = 0;
  // An explicit choice stays selected until the user scrolls, even when the
  // document is too short to move that diagram all the way to the top.
  let navigation: { document: any; index: number } | null = null;
  const clearNavigation = () => { navigation = null; };
  for (const event of ['wheel', 'touchmove', 'pointerdown', 'keydown']) root!.addEventListener(event, clearNavigation, { passive: true });
  function syncVisibleDiagram() {
    visibleFrame = 0;
    if (app.state.mode !== 'document' || document.body.classList.contains('printing')) return;
    const view = root!.getBoundingClientRect();
    const chosen = navigation && navigation.document === doc() ? root!.querySelector<HTMLElement>(`.blk-diag[data-i="${navigation.index}"]`) : null;
    const first = chosen || Array.from(root!.querySelectorAll<HTMLElement>('.blk-diag')).find((el) => {
      const box = el.getBoundingClientRect();
      return box.bottom > view.top && box.top < view.bottom && box.right > view.left && box.left < view.right;
    });
    if (!first) return;
    const index = Number(first.dataset.i);
    if (index !== doc().active) app.setActiveBlock(index, false);
    root!.querySelectorAll<HTMLElement>('.blk-diag').forEach((el) => el.classList.toggle('active', Number(el.dataset.i) === index));
  }
  function queueVisibleDiagram() {
    if (!visibleFrame) visibleFrame = requestAnimationFrame(syncVisibleDiagram);
  }
  root!.addEventListener('scroll', queueVisibleDiagram, { passive: true });
  new ResizeObserver(queueVisibleDiagram).observe(root!);
  function scrollToDiagram(index: number) {
    const block = root!.querySelector<HTMLElement>(`.blk-diag[data-i="${index}"]`);
    if (!block) return;
    const view = root!.getBoundingClientRect(), box = block.getBoundingClientRect();
    root!.scrollTop += box.top - view.top;
    navigation = { document: doc(), index };
    queueVisibleDiagram();
  }

  // ---------- text rendering ----------
  // Text blocks are LaTeX-flavoured: $math$, $$display$$, # headings, - / 1. / - [ ] lists and a
  // handful of inline commands (\textbf, \textit, \underline, \sout, \textcolor, \colorbox, \href…).
  const katex = (src: any, display: any) => {
    let html = TD.math.render(src, { display });
    if (TD.math.previewing) html = TD.math.liveMarkup(html);
    return TD.math.isPending(html) ? `<span class="math-pending" data-math-pending="${TD.math.pendingIds(html).join(',')}">${TD.math.cleanPreview(html)}</span>` : html;
  };
  const colorCss = (opt: any, v: any) => { v = v.trim(); if (opt === 'HTML') return /^[0-9a-f]{6}$/i.test(v) ? '#' + v : '#000'; let c; try { c = TD.tikzColor && TD.tikzColor(v); } catch { c = null; } return c ? TD.css(c) : /^[a-z]+$/i.test(v) ? v : '#000'; };
  const safeUrl = (u: any) => (/^(https?:|mailto:|#)/i.test(u.trim()) ? u.trim() : '#');
  const FMT: Record<string, any> = {
    textbf: [1, (a: any) => `<b>${inl(a[0])}</b>`],
    textit: [1, (a: any) => `<i>${inl(a[0])}</i>`],
    emph: [1, (a: any) => `<em>${inl(a[0])}</em>`],
    underline: [1, (a: any) => `<u>${inl(a[0])}</u>`],
    uline: [1, (a: any) => `<u>${inl(a[0])}</u>`],
    sout: [1, (a: any) => `<s>${inl(a[0])}</s>`],
    texttt: [1, (a: any) => `<span class="tt">${inl(a[0])}</span>`],
    textsc: [1, (a: any) => `<span style="font-variant:small-caps">${inl(a[0])}</span>`],
    textrm: [1, (a: any) => inl(a[0])],
    textcolor: [2, (a: any, o: any) => `<span style="color:${colorCss(o, a[0])}">${inl(a[1])}</span>`],
    colorbox: [2, (a: any, o: any) => `<span class="cbox" style="background:${colorCss(o, a[0])}">${inl(a[1])}</span>`],
    href: [2, (a: any) => `<a href="${esc(safeUrl(a[0]))}" target="_blank" rel="noopener">${inl(a[1])}</a>`],
    url: [1, (a: any) => `<a href="${esc(safeUrl(a[0]))}" target="_blank" rel="noopener" class="tt">${esc(a[0])}</a>`],
  };
  const WORDS: Record<string, any> = { LaTeX: 'L<sup class="la">a</sup>T<sub class="te">e</sub>X', TeX: 'T<sub class="te">e</sub>X', ldots: '…', dots: '…', textbackslash: '\\', quad: '&emsp;', qquad: '&emsp;&emsp;', S: '§', P: '¶', copyright: '©', today: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) };
  // inline source → HTML (recursive for command arguments)
  function inl(src: any) {
    let out = '', i = 0;
    const n = src.length;
    const group = (j: any) => {
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
        const k = closingDollar(src, i + 1);
        if (k > i + 1) { out += katex(src.slice(i + 1, k), false); i = k + 1; continue; }
      }
      if (c === '\\') {
        const nx = src[i + 1] || '';
        if (nx === '(') { const k = src.indexOf('\\)', i + 2); if (k > 0) { out += katex(src.slice(i + 2, k), false); i = k + 2; continue; } }
        if (nx === '\\') { out += '<br>'; i += 2 + IE.BREAK_OPT.exec(src.slice(i + 2))![0].length; continue; } // \\[2pt]: the spacing is LaTeX's
        if (/[%&#$_{}~^ ,]/.test(nx)) { out += nx === ',' ? '&thinsp;' : esc(nx); i += 2; continue; }
        const m = /^\\([A-Za-z]+)\s*/.exec(src.slice(i, i + 40));
        if (m && FMT[m[1]]) {
          const [na, f] = FMT[m[1]];
          let j = i + m[0].length, opt;
          if (src[j] === '[') { const e = src.indexOf(']', j); if (e > 0) { opt = src.slice(j + 1, e); j = e + 1; } }
          const args = [];
          for (let a = 0; a < na; a++) { while (src[j] === ' ') j++; if (src[j] !== '{') break; const [g, nj] = group(j); args.push(g); j = nj; }
          if (args.length === na) { out += f(args, opt); i = j; continue; }
        }
        if (m && WORDS[m[1]] !== undefined) { out += WORDS[m[1]]; i += m[0].length; if (src[i] === '{' && src[i + 1] === '}') i += 2; continue; }
      }
      if (c === '~') { out += '&nbsp;'; i++; continue; }
      if (c === '-' && src[i + 1] === '-') { const em = src[i + 2] === '-'; out += em ? '—' : '–'; i += em ? 3 : 2; continue; }
      if (c === '`' && src[i + 1] === '`') { out += '“'; i += 2; continue; }
      if (c === "'" && src[i + 1] === "'") { out += '”'; i += 2; continue; }
      if (c === '{' || c === '}') { i++; continue; } // bare grouping braces disappear, as in LaTeX
      out += esc(c);
      i++;
    }
    return out;
  }
  const HEAD_RE = /^(#{1,3})\s+(.*)$/;
  const ITEM_RE = /^(\s*)([-*]|\d+[.)])\s+(?:\[([ xX])\]\s+)?(.*)$/;
  const itemKind = (m: any) => (m[3] !== undefined ? 'chk' : /\d/.test(m[2]) ? 'ol' : 'ul');
  // section counters shared by every text block of one render / export
  function heading(level: any, sec: any, numbered: any) {
    if (!numbered) return '';
    sec[level - 1]++;
    for (let k = level; k < 3; k++) sec[k] = 0;
    return sec.slice(0, level).join('.') + ' ';
  }
  function textToHtml(text: any, ctx: any = { sec: [0, 0, 0] }) {
    const out: any[] = [];
    let L = 0; // line number in the block's source, for clickable checkboxes
    IE.splitDisplay(text).forEach((part) => {
      if (typeof part !== 'string') { out.push(`<div class="dmath">${katex(part.tex, true)}</div>`); L += (part.src.match(/\n/g) || []).length; return; }
      const lines = part.split('\n');
      let para: any[] = [];
      const stack: any[] = []; // open lists: { kind, level, li }
      const flush = () => { if (para.length) out.push(`<p>${para.map(inl).join(' ')}</p>`); para = []; };
      const closeTo = (lvl: any) => {
        while (stack.length && stack[stack.length - 1].level > lvl) {
          const t = stack.pop();
          out.push((t.li ? '</li>' : '') + (t.kind === 'ol' ? '</ol>' : '</ul>'));
        }
      };
      lines.forEach((raw, li) => {
        const ln = L + li;
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) { flush(); closeTo(-1); return; }
        const h = line.match(HEAD_RE);
        if (h) {
          flush(); closeTo(-1);
          const lv = h[1].length;
          out.push(`<h${lv + 1}>${heading(lv, ctx.sec, ctx.numbered)}${inl(h[2])}</h${lv + 1}>`);
          return;
        }
        const m = line.match(ITEM_RE);
        if (m) {
          flush();
          const level = Math.floor(m[1].replace(/\t/g, '  ').length / 2), kind = itemKind(m);
          closeTo(level);
          let top = stack[stack.length - 1];
          if (top && top.level === level && top.kind !== kind) { closeTo(level - 1); top = stack[stack.length - 1]; }
          if (!top || top.level < level) {
            out.push(kind === 'ol' ? '<ol>' : `<ul${kind === 'chk' ? ' class="chk"' : ''}>`);
            top = { kind, level, li: false };
            stack.push(top);
          }
          if (top.li) out.push('</li>');
          const box = kind === 'chk' ? `<span class="cbx${m[3] !== ' ' ? ' on' : ''}" data-ln="${ln}" title="Click to tick"></span>` : '';
          out.push(`<li>${box}${inl(m[4])}`);
          top.li = true;
          return;
        }
        if (stack.length && /^\s/.test(raw)) { out.push(' ' + inl(line.trim())); return; } // continues the item
        closeTo(-1);
        para.push(line.trim());
      });
      flush(); closeTo(-1);
      L += lines.length - 1;
    });
    return out.join('') || '<p class="ph">Empty paragraph — click to write</p>';
  }
  // what the in-place editor (doc-inline.ts) draws with: formulas typed into need no progress to follow
  const IED: IE.InlineDeps = { katex: (s, d) => TD.math.synchronous(() => katex(s, d)), colorCss, safeUrl, words: WORDS, heading };

  // ---------- LaTeX export ----------
  const escTex = (line: any) => TD.segments(line).map((seg: any) => (seg.math ? `$${TD.mathTex(seg)}$` : seg.s.replace(/(^|[^\\])([%&#])/g, '$1\\$2').replace(/(^|[^\\])([%&#])/g, '$1\\$2'))).join('');
  // a name typed as plain text (a file name), every character as it is
  // (< > " have their own: as typed, the document's OT1 font prints them as ¡ ¿ and a curly quote; the straight quote
  // comes from T1, which has it)
  const PLAIN: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '%': '\\%', '&': '\\&', '#': '\\#', _: '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}', '<': '\\textless{}', '>': '\\textgreater{}', '"': '{\\fontencoding{T1}\\selectfont\\char34}' };
  // emoji are left out: pdfLaTeX has no glyph for them and stops ("Unicode character … not set up")
  const plainTex = (t: any) => String(t).replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]/gu, (c) => ('©®™'.includes(c) ? c : '')).replace(/[\\{}$%&#_^~<>"]/g, (c) => PLAIN[c]);
  // The title is the file's name: plain text, except $…$, which is maths (a name like R&D_notes stays as typed).
  const titleParts = (name: string) => String(name).split(/(\$[^$]+\$)/);
  const titleHtml = (name: string) => titleParts(name).map((p, i) => i % 2 ? katex(p.slice(1, -1), false) : esc(p)).join('');
  const titleTex = (name: string) => titleParts(name).map((p, i) => i % 2 ? p : plainTex(p)).join('');
  function textToLatex(text: any, ctx: Record<string, any> = {}) {
    const env: Record<string, any> = { ul: 'itemize', ol: 'enumerate', chk: 'itemize' };
    return IE.splitDisplay(text).map((part) => {
      if (typeof part !== 'string') return part.env ? part.src : `\\[\n  ${part.tex}\n\\]`;
      const out = [], stack: any[] = [];
      const closeTo = (lvl: any) => { while (stack.length && stack[stack.length - 1].level > lvl) { const t = stack.pop(); out.push('  '.repeat(t.level) + `\\end{${env[t.kind]}}`); } };
      for (const raw of part.split('\n')) {
        const line = raw.replace(/\s+$/, '');
        if (!line.trim()) { closeTo(-1); out.push(''); continue; }
        const h = line.match(HEAD_RE);
        if (h) { closeTo(-1); out.push(`\\${['section', 'subsection', 'subsubsection'][h[1].length - 1]}${ctx.numbered ? '' : '*'}{${escTex(h[2])}}`); continue; }
        const m = line.match(ITEM_RE);
        if (m) {
          const level = Math.floor(m[1].replace(/\t/g, '  ').length / 2), kind = itemKind(m);
          closeTo(level);
          let top = stack[stack.length - 1];
          if (top && top.level === level && top.kind !== kind) { closeTo(level - 1); top = stack[stack.length - 1]; }
          if (!top || top.level < level) { out.push('  '.repeat(level) + `\\begin{${env[kind]}}`); stack.push({ kind, level }); }
          const lab = kind === 'chk' ? (m[3] === ' ' ? '[$\\square$]' : '[$\\boxtimes$]') : '';
          out.push('  '.repeat(level + 1) + `\\item${lab} ${escTex(m[4])}`);
          continue;
        }
        if (stack.length && /^\s/.test(raw)) { out.push('  '.repeat(stack[stack.length - 1].level + 2) + escTex(line.trim())); continue; }
        closeTo(-1);
        out.push(escTex(line));
      }
      closeTo(-1);
      return out.join('\n');
    }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  // the maths and text styles a document's body uses, beyond the amsmath and amssymb every document loads:
  // \usepackage lines, then the definitions of \mathbfit and \mathsfit (TD.lint.mathNeeds)
  // the packages and definitions the text's maths and the file's macros need (src/core/doc-macros.ts)
  function mathStyleLines(body: any, X: any) {
    const need = TD.lint && TD.lint.mathNeeds ? TD.lint.mathNeeds(body.join('\n'), { macros: X.macros, pkgs: X.pkgs, libs: X.libs }) : { pkgs: [], defs: [] };
    const mac = TD.macroPreamble(X);
    const pkgs = [...new Set([...need.pkgs, ...mac.pkgs])], defs = [...new Set([...need.defs, ...mac.defs])];
    return [...pkgs.filter((p: any) => p !== 'amsmath' && p !== 'amssymb' && !X.pkgs.has(p)).map((p: any) => TD.lint.packageLine(p)), ...defs];
  }
  /** The file's macro definitions, last in the preamble (those it already holds left out). */
  const macroLines = (X: any, have: string[]) => TD.macroPreamble(X, have).lines;
  // packages the inline commands in a text need
  function textPkgs(text: any, set: any) {
    if (/\\(sout|uline|uwave|xout)\b/.test(text)) set.add('[normalem]{ulem}');
    if (/\\(href|url)\b/.test(text)) set.add('{hyperref}');
  }

  const PX_PER_CM = 40;
  const diagramWidthCm = (shapes: any) => {
    const b = TD.bboxOf(shapes.flatMap((s: any) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), 0);
    return b.w / PX_PER_CM;
  };
  const cm = (v: any) => `${+(+v).toFixed(2)}cm`;
  function geometryOpts(P: any) {
    const paper = TD.PAPERS[P.paper];
    const o = paper && paper.opt ? [paper.opt] : [`paperwidth=${cm(P.W)}`, `paperheight=${cm(P.H)}`];
    if (P.orient === 'landscape' && paper && paper.opt) o.push('landscape');
    o.push(`top=${cm(P.mt)}`, `bottom=${cm(P.mb)}`, `left=${cm(P.ml)}`, `right=${cm(P.mr)}`);
    return o.join(', ');
  }
  const ALIGN_ENV: Record<string, any> = { center: 'center', right: 'flushright', left: 'flushleft' };
  // image file name used in \includegraphics (the user saves the picture under this name)
  const imageName = (b: any, i: any) => TD.texImages.fileName(b.name || `image-${i + 1}`, b.src);
  function tableToLatex(b: any) {
    const rows = b.rows || [[]], nc = Math.max(1, ...rows.map((r: any) => r.length));
    const a = (b.colAlign || 'c')[0];
    const all = b.borders === 'all', hdr = b.header !== false;
    const spec = all ? '|' + Array(nc).fill(a).join('|') + '|' : Array(nc).fill(a).join('');
    const out = ['\\begin{center}', `\\begin{tabular}{${spec}}`];
    if (all || b.borders === 'header') out.push('\\hline');
    rows.forEach((r: any, ri: any) => {
      const cells = Array.from<any, any>({ length: nc }, (_, ci) => {
        const t = escTex(String(r[ci] ?? ''));
        return ri === 0 && hdr && t.trim() ? `\\textbf{${t}}` : t;
      });
      out.push('  ' + cells.join(' & ') + ' \\\\' + (all || (b.borders === 'header' && (ri === 0 && hdr || ri === rows.length - 1)) ? ' \\hline' : ''));
    });
    out.push('\\end{tabular}', '\\end{center}');
    return out.join('\n');
  }
  function imageToLatex(b: any, i: any, X: any) {
    const name = TD.texImages.use(X, imageName(b, i), b.src), w = +(b.width || 0.6).toFixed(2);
    const g = TD.texImages.include(X, name, `width=${w === 1 ? '' : w}\\linewidth`);
    const note = `% image file: ${name} (save it next to the .tex)`;
    if (b.caption && b.caption.trim()) return [note, '\\begin{figure}[h]', '  \\centering', '  ' + g, `  \\caption{${escTex(b.caption)}}`, '\\end{figure}'].join('\n');
    return [note, '\\begin{center}', g, '\\end{center}'].join('\n');
  }
  // engine: the LaTeX the code is for (pdflatex or xelatex), which writes the document's font (page.family) its way
  TD.docToLatex = function (doc: any, { engine = 'pdflatex' }: { engine?: TexEngine } = {}) {
    const X = TD.makeTikzContext({ engine, docFont: doc.page && doc.page.family, macros: (doc.page && doc.page.macros) || '' });
    X.preDefs = new Set(); // definitions kept from an imported preamble
    const P = TD.pageSize(doc.page);
    let needGraphicx = false, needBox = false;
    const pk = new Set();
    const body: any[] = [];
    const tctx = { numbered: !!P.numbered };
    doc.blocks.forEach((b: any, i: any) => {
      if (b.type === 'text') {
        let t = textToLatex(b.text || '', tctx);
        if (!t) return;
        textPkgs(b.text || '', pk);
        if (b.size && b.size !== 'normalsize') t = `{\\${b.size}\n${t}\\par}`;
        if (ALIGN_ENV[b.align]) t = `\\begin{${ALIGN_ENV[b.align]}}\n${t}\n\\end{${ALIGN_ENV[b.align]}}`;
        body.push(t, '');
        return;
      }
      if (b.type === 'table') { for (const r of b.rows || []) for (const c of r) textPkgs(c || '', pk); body.push(tableToLatex(b), ''); return; }
      if (b.type === 'image') { if (b.src) { needGraphicx = true; body.push(imageToLatex(b, i, X), ''); } return; }
      if (b.type !== 'diagram') { body.push(`% A block this version of DiagramTeX can't export (${String(b.type).replace(/\s+/g, ' ')}) is left out here.`, ''); return; }
      if (!b.shapes || !b.shapes.length) return;
      // a Whiteboard drawn far from the origin: moved back within TeX's reach (or a note why it can't be)
      const reach = TD.texReach(b.shapes);
      if (reach.note) body.push('% Note: ' + reach.note);
      b = { ...b, shapes: reach.shapes };
      X.scene = b.shapes;
      // a picture imported and not changed is written as it was. No data comment: one line of base64 can pass
      // TeX's line limit and stop pdflatex, so the app can't restore its own export exactly (the dialog says so)
      const W = TD.tikzWhole(b.shapes.filter((s: any) => !s.hidden), X);
      const pic = W ? [W.open + W.pre.map((c: any) => '\n  ' + c.replace(/\n/g, '\n  ')).join('') + W.body + W.close]
        : [TD.tikzOpen(b.shapes), ...TD.tikzLines(b.shapes, X).map((l: any) => '  ' + l.replace(/\n/g, '\n  ')), '\\end{tikzpicture}'];
      // wider than the text block: scale down to \linewidth, as the page preview does
      const wide = diagramWidthCm(b.shapes) > P.textW + 0.01;
      if (wide) needGraphicx = needBox = true;
      // the picture goes into a box first and the box is scaled: inside \resizebox's argument, the & of a
      // tikz-cd or quantikz matrix would already be read and break the compile
      body.push('\\begin{center}', ...(wide ? ['\\begin{lrbox}{\\dtxbox}%'] : []),
        ...pic,
        ...(wide ? ['\\end{lrbox}%', '\\resizebox{\\linewidth}{!}{\\usebox{\\dtxbox}}'] : []), '\\end{center}', '');
    });
    const pre = TD.preamble(X);
    const defs = [...X.colors].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`);
    // shadings, patterns and parts the pictures declare once
    if (X.decls) for (const d of X.decls.values()) defs.push(d.decl);
    // a package the document loads itself is not loaded again for a picture (an imported preamble lists amsmath too)
    const own = new Set(['amsmath', 'amssymb', 'xcolor', ...(needGraphicx ? ['graphicx'] : [])]);
    const again = (l: string) => { const m = /^\\usepackage\{([^}]*)\}$/.exec(l); return !!m && m[1].split(',').every((x) => own.has(x.trim())); };
    const extra = [...pk].filter((p) => !(p as any).includes('hyperref')).map((p) => `\\usepackage${p}`).filter((l) => !again(l));
    const spread = +P.spread || 1;
    const fonts = TD.fontLines(X, body.join('\n')), fontNote = TD.fontNote(X);
    const tex = [
      ...(fontNote ? ['% Note: ' + fontNote] : []),
      `\\documentclass[${P.font}pt]{article}`,
      `\\usepackage[${geometryOpts(P)}]{geometry}`,
      '\\usepackage{amsmath, amssymb}',
      '\\usepackage{xcolor}',
      ...(needGraphicx ? ['\\usepackage{graphicx}'] : []),
      ...(needBox ? ['\\newsavebox{\\dtxbox}'] : []),
      ...extra,
      ...pre.filter((l: string) => !again(l)),
      ...fonts,
      ...mathStyleLines(body, X),
      ...(pk.has('{hyperref}') ? ['\\usepackage{hyperref}'] : []), // hyperref goes last
      ...defs,
      ...macroLines(X, [...pre, ...defs]),
      ...TD.preDefsWithout(X),
      ...(spread !== 1 ? [`\\linespread{${spread}}`] : []),
      '',
      ...(P.title ? [`\\title{${titleTex(leafName(doc.name) || 'Untitled')}}`, ...(String(P.author || '').trim() ? [`\\author{${titleTex(P.author.trim())}}`] : []), '\\date{}', ''] : []),
      '\\begin{document}',
      ...(P.title ? ['\\maketitle'] : []),
      '',
      ...body,
      '\\end{document}',
      '',
    ].join('\n');
    return finishThai(tex, engine); // where Thai lines may break, and with pdfLaTeX its runs marked
  };

  // Page mode: every object keeps its exact place on the paper. Each page is one overlay
  // tikzpicture placed at the page's top-left corner with eso-pic (one LaTeX run).
  TD.pageToLatex = function (doc: any, { only, engine = 'pdflatex' }: Record<string, any> = {}) {
    const X = TD.makeTikzContext({ engine, docFont: doc.page && doc.page.family, macros: (doc.page && doc.page.macros) || '' });
    X.preDefs = new Set(); // definitions kept from an imported preamble
    const P = TD.pageSize(doc.page);
    const h = P.H * PX_PER_CM, gap = PX_PER_CM, n = Math.max(1, doc.sheet.pages | 0);
    const pages = Array.from<any, any>({ length: n }, () => []);
    for (const s of only || doc.sheet.shapes) {
      const b = TD.bbox(s);
      pages[Math.max(0, Math.min(n - 1, Math.floor((b.y + b.h / 2) / (h + gap))))].push(s);
    }
    const body: any[] = [];
    pages.forEach((list, k) => {
      if (k) body.push('\\newpage', '');
      const copies = list.map((s: any) => {
        const c = JSON.parse(JSON.stringify(s));
        if (k) TD.translate(c, 0, -k * (h + gap));
        return c;
      });
      X.scene = copies;
      const lines = TD.tikzLines(copies, X);
      // The picture goes in a box that eso-pic sets at the paper's top-left corner as the page ships out,
      // so one compile is enough (\\null gives the page something to ship).
      body.push(`% ---- page ${k + 1} ----`, '\\begin{lrbox}{\\tdpage}',
        '\\begin{tikzpicture}[overlay, x=1cm, y=1cm]',
        ...lines.map((l: any) => '  ' + l.replace(/\n/g, '\n  ')), '\\end{tikzpicture}',
        '\\end{lrbox}', '\\AddToShipoutPictureFG*{\\AtPageUpperLeft{\\usebox{\\tdpage}}}', '\\null', '');
    });
    const pre = TD.preamble(X);
    const defs = [...X.colors].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`);
    if (X.decls) for (const d of X.decls.values()) defs.push(d.decl);
    const tex = [
      `% ${leafName(doc.name) || 'Untitled'}: free-form page from DiagramTeX ${TD.VERSION}.`,
      '% Coordinates are measured from the top-left corner of the paper (x right, y up, so y is negative on the page).',
      '\\documentclass[10pt]{article}',
      `\\usepackage[${geometryOpts(P)}]{geometry}`,
      '\\usepackage{amsmath, amssymb}',
      '\\usepackage{xcolor}',
      ...pre,
      ...TD.fontLines(X, body.join('\n')),
      '\\usepackage{eso-pic}',
      ...mathStyleLines(body, X),
      ...defs,
      ...macroLines(X, [...pre, ...defs]),
      ...TD.preDefsWithout(X),
      '\\newsavebox{\\tdpage}',
      '\\pagestyle{empty}',
      '',
      '\\begin{document}',
      ...body,
      '\\end{document}',
      '',
    ].join('\n');
    return finishThai(tex, engine);
  };

  // ---------- view ----------
  let editingIdx = -1, relayT: any;
  // text blocks are edited in place; this switch edits their LaTeX source instead (kept per browser)
  let srcMode = (() => { try { return localStorage.getItem('diagramtex.docSource') === '1'; } catch { return false; } })();
  const doc = () => app.state.doc;
  const diagramCount = () => doc().blocks.filter((b: any) => b.type === 'diagram').length;
  const SIZE_EM: Record<string, any> = { tiny: 0.5, scriptsize: 0.7, footnotesize: 0.8, small: 0.9, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.488 };
  // the page's controls are containers left empty here and filled by ui/DocBlockChrome.svelte (mountChrome)
  const insertBar = (i: any) => `<div class="ins" data-at="${i}"></div>`;
  // The text source stays LaTeX-flavoured text; the toolbar wraps the selection in commands.
  // LaTeX's size commands, named for the menu (the command itself is in the menu's tip)
  const SIZE_NAME = (): Record<string, string> => ({ tiny: t('table.size.tiny', 'Tiny'), scriptsize: t('table.size.script', 'Script'), footnotesize: t('table.size.footnote', 'Footnote'), small: t('table.size.small', 'Small'), normalsize: t('ui.normal', 'Normal'), large: t('table.size.large', 'Large'), Large: t('table.size.larger', 'Larger'), LARGE: t('doc.size.largest', 'Largest'), huge: t('quick.size.huge', 'Huge'), Huge: t('doc.size.huger', 'Huger') });
  // The text toolbar (ui/DocumentView.svelte): built like the Table toolbar, pinned to the top of the view rather
  // than following the block, and shown only while a text block is being edited. Its room is always kept.
  const AL_NAME: Record<string, string> = { j: 'justify', l: 'left', c: 'center', r: 'right' };
  const TB_I = {
    b: '<b class="tb-glyph">B</b>', i: '<i class="tb-glyph" style="font-family:Georgia,serif">I</i>',
    u: '<span class="tb-glyph" style="text-decoration:underline">U</span>', s: '<span class="tb-glyph" style="text-decoration:line-through">S</span>',
    math: '<i class="tb-glyph tb-math">x</i>',
  };
  // what the caret is in (ieState), shown by the bar; cleared when the page is drawn again
  const NO_FORMATS = { b: false, i: false, u: false, s: false, ul: false, ol: false, chk: false };
  let caretIn = { head: '', active: { ...NO_FORMATS } };
  let shellUp = false, pageInfo = '';
  function shellModel(): DocumentViewModel {
    const b = doc().blocks[editingIdx], on = !!b && b.type === 'text', names = SIZE_NAME();
    return {
      bar: {
        on, head: caretIn.head, size: (on && b.size) || 'normalsize', align: (on && b.align) || 'justify', source: srcMode,
        sizes: TD.SIZES.map(([k]: any) => ({ value: k, label: names[k] || k })), active: caretIn.active,
        glyphs: TB_I, colour: TD.texColor.swatch(fmtColor), highlight: TD.texColor.swatch(fmtHl),
      },
      zoom: String(zoomMode), info: pageInfo,
    };
  }
  /** the frame round the page (the text bar, the zoom bar), drawn in place */
  function renderShell() { if (shellUp) renderView(root!, DocumentView, shellModel()); }
  // The page's controls: its markup leaves their containers empty (.ins, .blk-tools, .fmt-bar[data-bar]), and these
  // views fill them each time it is drawn, after the views of the last drawing are taken down.
  let chrome: HTMLElement[] = [];
  function unmountChrome() { for (const el of chrome) destroyView(el); chrome = []; }
  function barModel(b: any, i: number): DocBlockChromeModel {
    if (b.type === 'image') return { kind: 'image', width: b.width || 0.6, caption: b.caption || '', name: imageName(b, i) };
    const R = b.rows || [[]];
    return { kind: 'table', rows: R.length, cols: Math.max(1, ...R.map((r: any) => r.length)), header: b.header !== false, align: b.colAlign || 'c', borders: b.borders || 'all' };
  }
  function mountChrome() {
    const d = doc(), page = root!.querySelector('.doc-page');
    if (!page) return;
    const put = (el: HTMLElement, m: DocBlockChromeModel) => { renderView(el, DocBlockChrome, m); chrome.push(el); };
    for (const el of page.querySelectorAll<HTMLElement>('.ins[data-at]')) put(el, { kind: 'insert' });
    for (const el of page.querySelectorAll<HTMLElement>('.blk-tools')) {
      const i = +el.closest<HTMLElement>('.blk')!.dataset.i!, b = d.blocks[i];
      put(el, { kind: 'tools', first: i === 0, last: i === d.blocks.length - 1, diagram: b.type === 'diagram', canDelete: !(b.type === 'diagram' && diagramCount() < 2) });
    }
    for (const el of page.querySelectorAll<HTMLElement>('.fmt-bar[data-bar]')) { const i = +el.closest<HTMLElement>('.blk')!.dataset.i!; put(el, barModel(d.blocks[i], i)); }
  }
  const tableBar = () => `<div class="fmt-bar" data-bar role="toolbar" aria-label="${esc(t('ui.table', 'Table'))}"></div>`;
  const imageBar = () => `<div class="fmt-bar" data-bar role="toolbar" aria-label="${esc(t('doc.img.aria', 'Image'))}"></div>`;
  const tableHtml = (b: any, editing: any) => {
    const rows = b.rows || [[]], nc = Math.max(1, ...rows.map((r: any) => r.length));
    const al = ({ l: 'left', c: 'center', r: 'right' } as Record<string, any>)[b.colAlign || 'c'];
    const cls = `dtab b-${b.borders || 'all'}${b.header !== false ? ' hdr' : ''}`;
    return `<table class="${cls}" style="--al:${al}">${rows.map((r: any, ri: any) => `<tr>${Array.from<any, any>({ length: nc }, (_, ci) => {
      const v = r[ci] ?? '';
      return `<td>${editing ? `<input class="cell" data-r="${ri}" data-c="${ci}" value="${esc(v)}" spellcheck="false">` : inl(v) || '&nbsp;'}</td>`;
    }).join('')}</tr>`).join('')}</table>`;
  };
  let fmtColor = 'red', fmtHl = 'yellow!20'; // xcolor specs, as the picker gives them
  let zoomMode: 'fit' | number = 'fit'; // 'fit', or a zoom factor (1 = 100%)
  let curZoom: any = 1; // the zoom last applied
  const ZMIN = 0.25, ZMAX = 4;
  // Too narrow to keep the page clear of the side panel (a tablet held upright, a phone), the page uses the whole
  // width and the panel floats over it, like a popover; the zoom bar then sits at the left (style.css, .doc-narrow).
  const NARROW_PAGE = 560; // px a page fitted beside the panel would have, below which it takes the whole width
  function narrowView() {
    if (!root!.offsetWidth) return false;
    const propsW = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--props-w')) || 280;
    const on = root!.offsetWidth - propsW - 24 < NARROW_PAGE;
    if (document.body.classList.contains('doc-narrow') === on) return false;
    document.body.classList.toggle('doc-narrow', on);
    return true;
  }
  function scrollbarSpace() {
    const parent = root!.parentElement!;
    const width = Math.max(0, root!.offsetWidth - root!.clientWidth) + 'px';
    if (parent.style.getPropertyValue('--doc-scrollbar-width') === width) return false;
    parent.style.setProperty('--doc-scrollbar-width', width);
    return true;
  }
  // The panel is a sibling of the scrolling view, so it cannot inherit the
  // browser's scrollbar gutter. Track that gutter without double-counting it.
  new ResizeObserver(() => {
    const narrowed = narrowView();
    if ((scrollbarSpace() || narrowed) && app.state.mode === 'document' && zoomMode === 'fit') layoutPage(TD.pageSize(doc().page));
  }).observe(root!);
  const paperSizes = new WeakMap<HTMLElement, { width: number; height: number; pages: number }>();
  function sizeSheet(page: HTMLElement, pages = paperSizes.get(page)?.pages || 1) {
    const sheet = page.parentElement;
    if (!sheet?.classList.contains('doc-sheet')) return;
    const natural = getComputedStyle(page);
    const size = { width: parseFloat(natural.width), height: parseFloat(natural.height), pages };
    paperSizes.set(page, size);
    sheet.style.width = size.width * curZoom + 'px';
    sheet.style.height = size.height * curZoom + 'px';
  }
  // Keep newly loaded images and growing text editors inside the visible sheet,
  // even before the debounced pagination pass runs.
  const sheetObserver = new ResizeObserver(entries => {
    if (app.state.mode !== 'document') return;
    for (const entry of entries) if (entry.target.isConnected) sizeSheet(entry.target as HTMLElement);
  });
  function pageStyle(P: any) {
    const font = docFontOf(P.family); // the document's font (Computer Modern: the page's own, --font-tex)
    return `width:${P.W}cm;min-height:${P.H}cm;padding:${P.mt}cm ${P.mr}cm ${P.mb}cm ${P.ml}cm;font-size:${P.font}pt;--spread:${+P.spread || 1}${font.key !== 'cm' ? `;font-family:${font.css.replace(/"/g, "'")}` : ''}`;
  }
  // forPrint: no editing chrome. ctx: { export } — used by the HTML export.
  function pageHtml(forPrint: any) {
    const d = doc();
    const P = TD.pageSize(d.page);
    const tctx = { sec: [0, 0, 0], numbered: !!P.numbered };
    let fig = 0;
    let h = `<div class="doc-page" style="${pageStyle(P)}"><div class="cm-probe"></div>${P.title ? `<h1 class="doc-title"${forPrint ? '' : ` title="${esc(t('doc.title.renameTip', 'Double-click to rename the file'))}"`}>${titleHtml(leafName(d.name) || 'Untitled')}</h1>${String(P.author || '').trim() ? `<p class="doc-author">${titleHtml(P.author.trim())}</p>` : ''}` : ''}`;
    d.blocks.forEach((b: any, i: any) => {
      if (!forPrint) h += insertBar(i);
      const ed = i === editingIdx && !forPrint;
      const tools = forPrint ? '' : '<div class="blk-tools"></div>';
      const edc = ed ? ' editing' : '';
      if (b.type === 'text') {
        const st = `text-align:${b.align || 'justify'}${b.size && b.size !== 'normalsize' ? `;font-size:${SIZE_EM[b.size]}em` : ''}`;
        const ph = t('doc.text.ph', 'Write text. $x^2$ for math, $$…$$ for display math, # Section, - bullet, 1. numbered, - [ ] checkbox');
        h += `<div class="blk blk-text${edc}" data-i="${i}">${tools}${!ed
          ? `<div class="blk-body" lang="en" style="${st}">${textToHtml(b.text || '', tctx)}</div>`
          : srcMode ? `<textarea class="blk-ed" spellcheck="true" placeholder="${esc(ph)}">${esc(b.text || '')}</textarea>`
          : `<div class="blk-body blk-ie${b.text ? '' : ' empty'}" contenteditable="true" spellcheck="true" lang="en" role="textbox" aria-multiline="true" aria-label="${esc(t('doc.text.aria', 'Text'))}" data-ph="${esc(t('doc.text.phInline', 'Write text. Type $x^2$ for maths, # for a section, - for a list.'))}" style="${st}">${ieHtml(b, tctx)}</div>`}</div>`;
        if (ed && srcMode) textToHtml(b.text || '', tctx); // keep section numbers counting
      } else if (b.type === 'table') {
        h += `<div class="blk blk-table${edc}" data-i="${i}">${tools}${ed ? tableBar() : ''}<div class="blk-body" lang="en">${tableHtml(b, ed)}</div></div>`;
      } else if (b.type === 'image') {
        const cap = b.caption && b.caption.trim() ? `<figcaption>Figure ${++fig}: ${inl(b.caption)}</figcaption>` : '';
        h += `<div class="blk blk-image${edc}" data-i="${i}">${tools}${ed ? imageBar() : ''}<figure class="blk-body" lang="en">${b.src ? `<img src="${esc(b.src)}" alt="${esc(b.caption || b.name || '')}" style="width:${(b.width || 0.6) * 100}%">` : `<div class="ph">${forPrint ? 'No picture' : esc(t('doc.img.none', 'No picture'))}</div>`}${cap}</figure></div>`;
      } else if (b.type !== 'diagram') {
        // a kind of block this version doesn't know (a file from a newer one): kept as it is, saved with the file,
        // and only moved or deleted here
        if (!forPrint) h += `<div class="blk blk-other" data-i="${i}">${tools}<div class="blk-body"><div class="ph">${esc(t('doc.other', "A block this version of DiagramTeX can't show ({type}). It is kept as it is.", { type: String(b.type) }))}</div></div></div>`;
      } else {
        const svg = b.shapes.length ? app.shapesSvg(b.shapes, 6, false, !forPrint) : '';
        h += `<div class="blk blk-diag${i === d.active && !forPrint ? ' active' : ''}" data-i="${i}">${tools}<div class="blk-body" lang="en">${svg || (forPrint ? '' : `<div class="ph">${esc(t('doc.diag.empty', 'Empty diagram — double-click to draw'))}</div>`)}</div></div>`;
      }
    });
    if (!forPrint) h += insertBar(d.blocks.length);
    h += '</div>';
    return { h, P };
  }
  // Stage the selected engine without rebuilding existing blocks or editors.
  const mathPriorities = new Map<number, number>();
  function captureMathPriorities(): void {
    mathPriorities.clear();
    const viewport = root!.getBoundingClientRect(), paper = root!.querySelector<HTMLElement>('.doc-page');
    const sheet = paper?.getBoundingClientRect();
    const zoom = paper && sheet ? sheet.width / paper.offsetWidth : 1;
    const height = TD.pageSize(doc().page).H * TD.PX_PER_CM * zoom;
    const page = Math.max(0, Math.floor(((viewport.top + viewport.bottom) / 2 - (sheet?.top || 0)) / height));
    const top = (sheet?.top || 0) + page * height;
    for (const element of root!.querySelectorAll<HTMLElement>('.blk[data-i]')) {
      const rect = element.getBoundingClientRect();
      const visible = rect.bottom >= viewport.top && rect.top <= viewport.bottom && rect.right >= viewport.left && rect.left <= viewport.right;
      mathPriorities.set(+element.dataset.i!, visible ? 0 : rect.bottom >= top && rect.top <= top + height ? 1 : 2);
    }
  }
  function beginEngineChange(): void {
    if (!TD.math.previewing) return TD.math.preview(beginEngineChange);
    captureMathPriorities();
    const P = TD.pageSize(doc().page), ctx = { sec: [0, 0, 0], numbered: !!P.numbered };
    doc().blocks.forEach((block: any, i: number) => {
      const element = root!.querySelector<HTMLElement>(`.blk[data-i="${i}"]`);
      const rank = mathPriorities.get(i) ?? 2;
      const html = TD.math.withPriority(rank, () => {
        if (block.type === 'text') return textToHtml(block.text || '', ctx);
        if (block.type === 'diagram') return app.shapesSvg(block.shapes, 6, false, true);
        if (block.type === 'table') return tableHtml(block, false);
        return block.caption ? inl(block.caption) : '';
      });
      TD.math.prioritize([...html.matchAll(/data-math-pending="([\d,]+)"/g)].flatMap(match => match[1].split(',').map(Number)), rank);
      if (!element || element.classList.contains('editing')) return;
      const body = element.querySelector('.blk-body');
      if (!body || !body.querySelector('.katex,.td-math,image.svg-label,.math-pending')) return;
      const ids = [...html.matchAll(/data-math-pending="([\d,]+)"/g)].flatMap(match => match[1].split(','));
      // Keep the existing DOM/decoded images. Only metadata changes until a
      // bounded progress pass can publish the selected engine's real output.
      body.classList.add('math-pending'); body.setAttribute('data-math-pending', ids.join(',') || '0');
    });
    renderProgress();
  }
  let progressFrame = 0, finishProgress: (() => void) | null = null;
  function cancelProgress(): void {
    mathPriorities.clear();
    cancelAnimationFrame(progressFrame); progressFrame = 0;
    const finish = finishProgress; finishProgress = null; finish?.();
  }
  function renderProgress(): void {
    if (progressFrame) return;
    if (!TD.math.previewing) return TD.math.preview(renderProgress);
    const P = TD.pageSize(doc().page), ctx = { sec: [0, 0, 0], numbered: !!P.numbered };
    const st = root!.scrollTop, sl = root!.scrollLeft;
    let changed = false, count = 0, more = false;
    // Number headings in source order; publish ready blocks in view order.
    const blocks = doc().blocks.map((block: any, i: number) => ({ block, i,
      text: block.type === 'text' ? TD.math.withPriority(mathPriorities.get(i) ?? 2, () => textToHtml(block.text || '', ctx)) : '' }));
    blocks.sort((a: any, b: any) => (mathPriorities.get(a.i) ?? 2) - (mathPriorities.get(b.i) ?? 2) || a.i - b.i);
    blocks.forEach(({ block, i, text }: any) => {
      const element = root!.querySelector<HTMLElement>(`.blk[data-i="${i}"]`);
      // Never replace a live editor.
      if (!element || element.classList.contains('editing') || !element.querySelector('.math-pending')) return;
      const ready = [...element.querySelectorAll('[data-math-pending]')].every(node => node.getAttribute('data-math-pending')!.split(',').every(id => !TD.math.hasPendingJob(+id)));
      if (!ready) return;
      if (count++ >= 4) { more = true; return; }
      const body = element.querySelector('.blk-body');
      if (!body) return;
      if (block.type === 'text') body.innerHTML = text;
      else if (block.type === 'diagram') updateSvg(body, app.shapesSvg(block.shapes, 6, false, true), labelResources);
      else if (block.type === 'table') body.innerHTML = tableHtml(block, false);
      else if (block.type === 'image') {
        const caption = element.querySelector('figcaption');
        if (caption) caption.innerHTML = caption.innerHTML.replace(/:.*$/s, ': ' + inl(block.caption));
      }
      body.classList.remove('math-pending'); body.removeAttribute('data-math-pending');
      TD.math.trackView(previewFadeFinished(body));
      changed = true;
    });
    if (changed) {
      sizeDiagrams(root); labelResources.update(root!);
      // Keep pagination stable through the provisional phase. One final layout
      // pass avoids reflowing the entire document for every small label batch.
      if (!root!.querySelector('.blk:not(.editing) .math-pending')) layoutPage(P);
      root!.scrollTop = st; root!.scrollLeft = sl;
    }
    if (more) TD.math.trackView(new Promise<void>(resolve => {
      finishProgress = resolve;
      progressFrame = requestAnimationFrame(() => { progressFrame = 0; finishProgress = null; try { renderProgress(); } finally { resolve(); } });
    }));
  }
  // Renaming must not rebuild block editors or move focus away from the name field.
  function updateTitle() {
    const title = root!.querySelector('.doc-title');
    if (!title) return;
    title.innerHTML = TD.math.synchronous(() => titleHtml(leafName(doc().name) || 'Untitled')); // one short line, typed into: no progress to follow
    if (app.state.mode === 'document') layoutPage(TD.pageSize(doc().page));
  }

  function render(forPrint?: any): void {
    // the open file's macros, before anything is drawn (src/domain/mathengine.ts)
    TD.math.useMacros(TD.state?.doc?.page?.macros);
    if (!forPrint && !TD.math.previewing) return TD.math.preview(() => render());
    if (forPrint && !TD.math.finalizing) return TD.math.synchronous(() => render(true));
    // an editor drawn again (a setting changed while typing) keeps its caret
    if (!forPrint && iePop) { const p = iePop; p.close(); iePop = null; }
    const live = !forPrint && editor(), caret = live && live.contains(document.activeElement) && ieFor === editingIdx ? IE.caretOffset(live) : null;
    if (!forPrint) H.sync(doc()); // what changed elsewhere (a diagram on the canvas) is the new starting point
    const { h: page, P } = pageHtml(forPrint);
    sheetObserver.disconnect();
    unmountChrome();
    if (forPrint) { destroyView(root!); shellUp = false; root!.innerHTML = page; }
    else {
      // the frame (ui/DocumentView.svelte) stays; the page is drawn into its sheet
      if (!shellUp) root!.replaceChildren();
      shellUp = true;
      caretIn = { head: '', active: { ...NO_FORMATS } };
      renderShell();
      root!.querySelector('.doc-sheet')!.innerHTML = page;
      mountChrome();
    }
    if (forPrint) labelResources.clear(root!); else labelResources.update(root!);
    sizeDiagrams(root);
    printStyle(P);
    layoutPage(P, forPrint);
    if (!forPrint) sheetObserver.observe(root!.querySelector('.doc-page')!);
    if (!forPrint) requestAnimationFrame(() => layoutPage(P)); // after the side panel has laid out
    const ta = root!.querySelector('.blk-ed');
    if (ta) { autosize(ta); (ta as HTMLElement).focus({ preventScroll: true }); }
    if (!forPrint) ieMount(caret);
  }
  // Re-render after a block opens or closes for editing, keeping the block that was clicked (or, from the
  // keyboard, the one that was being edited) where it was on screen, so the page doesn't jump.
  let lastPt: any = null;
  root!.addEventListener('pointerdown', (e) => { lastPt = { x: e.clientX, y: e.clientY }; }, true);
  function renderKeep(prev: any, fromKey?: any) {
    // a formula still being typed (doc-inline's $…$, see iePend) is written to its block before the page is drawn
    if (iePend && ieFor >= 0 && doc().blocks[ieFor]?.type === 'text') {
      const ed = root!.querySelector<HTMLElement>(`.blk[data-i="${ieFor}"] .blk-ie`);
      if (ed && iePendFlush()) { doc().blocks[ieFor].text = IE.serialise(ed, ieOrig); changed([ieFor]); }
    }
    iePend = null;
    const el = !fromKey && lastPt && document.elementFromPoint(lastPt.x, lastPt.y);
    const hit = el && el.closest && el.closest('#docview .blk');
    const i = hit ? +hit.dataset.i : prev;
    const at = () => (i >= 0 ? root!.querySelector(`.blk[data-i="${i}"]`) : null);
    const before = at()?.getBoundingClientRect().top, st = root!.scrollTop;
    render();
    root!.scrollTop = st;
    const after = at()?.getBoundingClientRect().top;
    if (before != null && after != null) root!.scrollTop += after - before;
    // opened by a click: the caret goes where the click was
    if (hit && !fromKey && +hit.dataset.i === editingIdx) ieCaretAt(lastPt.x, lastPt.y);
  }
  // diagrams at true scale (40 canvas px = 1 cm), shrunk to the text width like \resizebox
  function sizeDiagrams(el: any) {
    el.querySelectorAll('.blk-diag .blk-body > svg').forEach((svg: any) => { svg.style.width = (+svg.getAttribute('width') / PX_PER_CM) + 'cm'; svg.removeAttribute('height'); });
  }
  function printStyle(P: any) {
    let st = document.getElementById('pageStyle');
    if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
    st.textContent = `@page { size: ${P.W}cm ${P.H}cm; margin: ${P.mt}cm ${P.mr}cm ${P.mb}cm ${P.ml}cm; }
      @media print { .doc-page { width: auto !important; min-height: 0 !important; padding: 0 !important; font-size: ${P.font}pt !important; zoom: 1 !important; } .pg-brk, .doc-hud { display: none !important; } }`;
  }
  // Fit the page to the view, and mark (approximate) page breaks.
  function layoutPage(P: any, forPrint?: any) {
    const page = root!.querySelector<HTMLElement>('.doc-page');
    const sheet = root!.querySelector<HTMLElement>('.doc-sheet');
    if (!page || !sheet || forPrint) return;
    const st = root!.scrollTop, sl = root!.scrollLeft;
    // Layout always stays at 100%. CSS zoom changes text metrics in WebKit and
    // rounds dimensions differently across zoom levels, moving content past page dividers.
    page.style.minHeight = '0';
    page.querySelectorAll('.pg-brk').forEach((e) => e.remove());
    const cmPx = 96 / 2.54; // CSS centimetres, without offsetWidth's integer rounding
    narrowView();
    scrollbarSpace();
    // the width beside the side panel (the view's padding keeps clear of it, unless the view is narrow), less a margin
    const cs = getComputedStyle(root!);
    const avail = root!.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;
    const z = zoomMode === 'fit' ? Math.min(1.5, avail / (P.W * cmPx)) : zoomMode;
    curZoom = z;
    // height of the real content (ignoring the trailing "+ Text / + Diagram" bar), in cm
    const blks = page.querySelectorAll('.blk, .doc-title');
    const last = blks[blks.length - 1] as HTMLElement | undefined;
    const bottom = last ? last.offsetTop + last.offsetHeight : 0;
    const textH = Math.max(0, bottom / cmPx - P.mt);
    const n = Math.max(1, Math.ceil(textH / P.textH - 0.01));
    (page as HTMLElement).style.minHeight = n * P.H + 'cm';
    for (let k = 1; k < n; k++) {
      const m = document.createElement('div');
      m.className = 'pg-brk';
      m.style.top = k * P.H + 'cm';
      m.innerHTML = `<span>Page ${k + 1}</span>`;
      page.appendChild(m);
    }
    sizeSheet(page, n);
    scalePage(P, z);
    root!.scrollTop = st; root!.scrollLeft = sl;
    queueVisibleDiagram();
  }
  // Zoom is a camera operation. Pagination and natural paper measurements only
  // run when content/settings change; scaling reuses the fixed layout dimensions.
  function scalePage(P: any, z: number) {
    const page = root!.querySelector<HTMLElement>('.doc-page');
    const sheet = root!.querySelector<HTMLElement>('.doc-sheet');
    const size = page && paperSizes.get(page);
    if (!page || !sheet || !size) return;
    curZoom = z;
    page.style.transform = `scale(${z})`;
    // The clipped sizing wrapper gives the scroll area only the scaled dimensions,
    // rather than the union of the transformed and untransformed paper bounds.
    sheet.style.width = size.width * z + 'px';
    sheet.style.height = size.height * z + 'px';
    // Scope the changing custom property to the controls: inheriting it from the
    // paper would invalidate styles throughout every formula on each zoom event.
    // the block tools and the page's "+ Text / + Diagram…" bars stay their screen size at any zoom
    for (const tools of page.querySelectorAll<HTMLElement>('.blk-tools, .ins')) tools.style.setProperty('--unzoom', String(1 / z));
    const n = size.pages;
    pageInfo = t('doc.pageInfo', '{paper} · {pages} (approx.) · {zoom}%', { paper: TD.PAPERS[P.paper]?.name || t('ui.custom', 'Custom'), pages: n > 1 ? t('doc.pages', '{n} pages', { n }) : t('doc.page1', '{n} page', { n }), zoom: Math.round((z as any) * 100) });
    renderShell();
  }
  window.addEventListener('resize', () => { if (app.state.mode === 'document' && zoomMode === 'fit') layoutPage(TD.pageSize(doc().page)); });
  // a picture that loads (a label, an image) can change the page's height: laid out again, once a frame however many
  // load together (a whole document's labels after a change of language), as each layout measures the whole page
  let loadLayout = 0;
  root!.addEventListener('load', () => {
    if (loadLayout) return;
    loadLayout = requestAnimationFrame(() => { loadLayout = 0; if (app.state.mode === 'document') layoutPage(TD.pageSize(doc().page)); });
  }, true);
  // Zoom to z, keeping the point under (cx, cy) (view coordinates; the view's centre by default) in place.
  function zoomTo(z: any, cx?: any, cy?: any) {
    z = Math.min(ZMAX, Math.max(ZMIN, z));
    const page = root!.querySelector('.doc-page');
    if (!page) return;
    if (cx == null) { cx = root!.clientWidth / 2; cy = root!.clientHeight / 2; }
    const view = root!.getBoundingClientRect(), before = page.getBoundingClientRect();
    const px = (view.left + cx - before.left) / curZoom;
    const py = (view.top + cy - before.top) / curZoom; // the point in unscaled paper pixels
    zoomMode = Math.abs(z - 1) < 1e-3 ? 1 : z;
    scalePage(TD.pageSize(doc().page), Number(zoomMode));
    const after = page.getBoundingClientRect();
    root!.scrollLeft += after.left - view.left + px * curZoom - cx;
    root!.scrollTop += after.top - view.top + py * curZoom - cy;
  }
  const STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  const stepZoom = (dir: any) => zoomTo(dir > 0 ? (STEPS.find((v) => v > curZoom + 0.005) ?? ZMAX) : ([...STEPS].reverse().find((v) => v < curZoom - 0.005) ?? ZMIN));
  // pinch on a trackpad (Chromium and Firefox send it as Ctrl+wheel), or Ctrl/⌘ + scroll wheel
  root!.addEventListener('wheel', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const r = root!.getBoundingClientRect();
    zoomTo(curZoom * wheelZoomFactor(e), e.clientX - r.left, e.clientY - r.top);
  }, { passive: false });
  // pinch in Safari
  let gz = 1;
  root!.addEventListener('gesturestart', (e) => { e.preventDefault(); gz = curZoom; });
  root!.addEventListener('gesturechange', (e) => { e.preventDefault(); const r = root!.getBoundingClientRect(); zoomTo(gz * (e as any).scale, (e as any).clientX - r.left, (e as any).clientY - r.top); });
  // Ctrl/⌘ + / − / 0, as in the browser
  document.addEventListener('keydown', (e) => {
    if (app.state.mode !== 'document' || !(e.ctrlKey || e.metaKey) || e.altKey || document.body.classList.contains('mode-quick') || document.body.classList.contains('mode-table')) return;
    // by key and by physical key (layouts where = or − need Shift, and the number pad), never the browser's page zoom
    const c = e.code;
    if (e.key === '=' || e.key === '+' || c === 'Equal' || c === 'NumpadAdd') { e.preventDefault(); stepZoom(1); }
    else if (e.key === '-' || e.key === '_' || c === 'Minus' || c === 'NumpadSubtract') { e.preventDefault(); stepZoom(-1); }
    else if (e.key === '0' || c === 'Digit0' || c === 'Numpad0') { e.preventDefault(); zoomTo(1); }
  });

  // ---------- page settings panel (right side in document mode) ----------
  function renderSettings(el: HTMLElement) {
    const page = TD.pageSize(doc().page);
    const diagrams = doc().blocks.filter((b: any) => b.type === 'diagram' && b.shapes.length);
    const wide = diagrams.filter((b: any) => diagramWidthCm(b.shapes) > page.textW + 0.01).length;
    renderView(el, DocumentSettings, { page, wide, macros: parseMacros(doc().page.macros || '').statements.length, fonts: DOC_FONTS.map((f) => ({ key: f.key, label: f.label, css: f.css, thai: !!f.thai })), papers: Object.entries<any>(TD.PAPERS).map(([key, value]) => ({ key, name: key === 'custom' ? t('page.paper.custom', 'Custom') : value.name })) });
  }
  function setPage(patch: any) {
    const d = doc(), next = { ...TD.PAGE_DEFAULT, ...d.page, ...patch };
    if (!TD.pageFits(next)) { app.showHint?.(t('page.noRoom', 'That leaves no room for text: keep at least 1 cm between the margins'), 2400, 'warn'); renderSettings(document.getElementById('props')!); return; }
    d.page = next;
    changed(); render(); renderSettings(document.getElementById('props')!);
  }
  const propsEl = document.getElementById('props');
  propsEl!.addEventListener('change', (e) => {
    const k = (e.target! as HTMLElement).dataset.pg;
    if (!k || app.state.mode !== 'document') return;
    let v: any = (e.target! as any).type === 'checkbox' ? (e.target! as HTMLInputElement).checked : (e.target! as HTMLInputElement).value;
    if (['w', 'h', 'mt', 'mb', 'ml', 'mr'].includes(k)) { v = parseFloat(v); if (!isFinite(v) || v < 0) return renderSettings(propsEl!); }
    if (k === 'font' || k === 'spread') v = +v;
    const patch = { [k]: v };
    if (k === 'paper' && v === 'custom') { const P = TD.pageSize(doc().page); Object.assign(patch, { w: P.W, h: P.H }); }
    setPage(patch);
  });
  propsEl!.addEventListener('click', (e) => {
    if (app.state.mode !== 'document') return;
    const o = (e.target! as Element).closest('[data-pgo]');
    if (o) setPage({ orient: (o as HTMLElement).dataset.pgo });
    const m = (e.target! as Element).closest('[data-pgm]');
    if (m) { const v = +(m as HTMLElement).dataset.pgm!; setPage({ mt: v, mb: v, ml: v, mr: v }); }
    if ((e.target! as Element).closest('[data-pgmacros]')) app.cmd.editMacros();
  });

  const autosize = (ta: any) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 4 + 'px'; };

  // Every change to the page goes through here: it is one undo step (doc-history.ts) and is saved.
  // dirty: the indices of the only blocks that changed; edit: typing in one block (joins the last step).
  const H = createDocHistory();
  function changed(dirty: number[] | null = null, edit?: { index: number; typing?: boolean; caret?: number | null; cell?: [number, number] }) {
    if (H.record(doc(), dirty, edit)) app.noteEdit?.();
    if (!edit?.typing) app.updateBlockNav?.(); // "Diagram 2 of 3" follows diagrams added, moved or deleted
    app.scheduleSave();
  }
  // Undo and redo (app.undoDocument picks between these and the file list's steps).
  function applyUndo(back: boolean): boolean {
    if (iePop) { const p = iePop; iePop = null; p.close(); }
    if (!H.owns(doc())) H.sync(doc());
    const s = back ? H.undo() : H.redo();
    if (!s) return false;
    const e = s.edit, i = e ? doc().blocks.findIndex((b: any) => H.keyOf(b) === e.key) : -1, b = doc().blocks[i];
    const caret = e ? (back ? e.before ?? null : e.caret ?? null) : null;
    if (e && b && b.type === 'text' && i === editingIdx && editor()) ieRedraw(caret);
    else {
      editingIdx = e && b && ['text', 'table', 'image'].includes(b.type) ? i : -1;
      render();
      const ed = editor();
      if (ed && caret != null) IE.setCaret(ed, caret);
      if (e?.cell) (root!.querySelector(`.editing .cell[data-r="${e.cell[0]}"][data-c="${e.cell[1]}"]`) as HTMLElement | null)?.focus({ preventScroll: true });
    }
    if (s.p0 !== undefined || s.p1 !== undefined) renderSettings(document.getElementById('props')!);
    app.scheduleSave();
    return true;
  }
  const undoKey = (e: KeyboardEvent) => {
    const k = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase();
    if (k !== 'z' && k !== 'y') return false;
    e.preventDefault();
    app.undoDocument(k === 'z' && !e.shiftKey);
    return true;
  };
  function keepActive(fn: any) {
    const d = doc(), act = d.blocks[d.active];
    fn(d);
    d.active = d.blocks.indexOf(act);
    if (d.active < 0) {
      // the open diagram was deleted: its undo steps belong to it, not to the diagram that takes its place
      d.active = d.blocks.findIndex((b: any) => b.type === 'diagram');
      app.state.sel.clear(); app.resetHistory();
    }
  }

  // ---------- editing a text block's source ----------
  const fire = (ta: any) => ta.dispatchEvent(new Event('input', { bubbles: true }));
  // Wrap the selection in pre…post; if it is already wrapped exactly so, unwrap it.
  function wrapSel(ta: any, pre: any, post: any, placeholder = 'text') {
    const a = ta.selectionStart, z = ta.selectionEnd, v = ta.value;
    if (v.slice(a - pre.length, a) === pre && v.slice(z, z + post.length) === post) {
      ta.value = v.slice(0, a - pre.length) + v.slice(a, z) + v.slice(z + post.length);
      ta.setSelectionRange(a - pre.length, z - pre.length);
    } else {
      const sel = v.slice(a, z) || placeholder;
      ta.value = v.slice(0, a) + pre + sel + post + v.slice(z);
      ta.setSelectionRange(a + pre.length, a + pre.length + sel.length);
    }
    ta.focus(); fire(ta);
  }
  // Give every line the selection touches a new prefix (list marker / heading); toggles off if all have it.
  function prefixLines(ta: any, kind: any) {
    const v = ta.value;
    const a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let z = v.indexOf('\n', ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0));
    if (z < 0) z = v.length;
    const lines = v.slice(a, z).split('\n');
    const strip = (l: any) => l.replace(HEAD_RE, '$2').replace(/^(\s*)([-*]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '$1');
    const has = (l: any) => kind.startsWith('#') ? (l.match(HEAD_RE) || [])[1] === kind
      : (() => { const m = l.match(ITEM_RE); return m && itemKind(m) === kind; })();
    const off = kind === '' || lines.every((l: any) => !l.trim() || has(l));
    let k = 0;
    const out = lines.map((l: any) => {
      if (!l.trim()) return l;
      const ind = (l.match(/^\s*/) || [''])[0], body = strip(l).trimStart();
      if (off) return kind.startsWith('#') || kind === '' ? body : ind + body;
      if (kind.startsWith('#')) return `${kind} ${body}`;
      return ind + (kind === 'ul' ? '- ' : kind === 'ol' ? `${++k}. ` : '- [ ] ') + body;
    }).join('\n');
    ta.value = v.slice(0, a) + out + v.slice(z);
    ta.setSelectionRange(a, a + out.length);
    ta.focus(); fire(ta);
  }
  const hexOf = (c: any) => c.replace('#', '').toUpperCase();
  function fmtAction(ta: any, f: any, val?: any) {
    const b = doc().blocks[editingIdx];
    if (!ta || !b) return;
    // bold, italic and underline as text or maths, whichever the selection is in (src/ui/tex-format.ts)
    if (f === 'b' || f === 'i' || f === 'u') applyTexFormat(ta, f === 'b' ? 'bold' : f === 'i' ? 'italic' : 'underline');
    else if (f === 's') wrapSel(ta, '\\sout{', '}');
    else if (f === 'math') wrapSel(ta, '$', '$', 'x');
    else if (f === 'color' || f === 'hl') {
      if (f === 'color') fmtColor = val; else fmtHl = val;
      // a preset is written by name; anything else as [HTML]
      const cmd = f === 'color' ? 'textcolor' : 'colorbox', rgb = /^rgb/.test(val), hex = rgb && TD.tikzColor(val);
      wrapSel(ta, rgb && hex ? `\\${cmd}[HTML]{${hexOf(hex)}}{` : `\\${cmd}{${val}}{`, '}');
    }
    else if (f === 'link') {
      const s0 = ta.selectionStart, s1 = ta.selectionEnd, sel = ta.value.slice(s0, s1);
      TD.prompt(t('doc.link.title', 'Link Address'), /^https?:\/\//.test(sel) ? sel : 'https://', { ok: t('doc.link.ok', 'Add Link') }).then((url: any) => {
        ta.focus(); ta.setSelectionRange(s0, s1); // the dialog took the focus: put the selection back
        if (!url || url === 'https://') return;
        if (!sel || sel === url) wrapSel(ta, '\\url{', '}', url);
        else wrapSel(ta, `\\href{${url}}{`, '}');
      });
    } else if (f === 'ul' || f === 'ol' || f === 'chk') prefixLines(ta, f);
    else if (f === 'head') prefixLines(ta, val);
    else if (f.startsWith('al:')) {
      b.align = f.slice(3) === 'justify' ? undefined : f.slice(3);
      renderShell(); changed(); ta.focus();
    } else if (f === 'size') { b.size = val === 'normalsize' ? undefined : val; changed(); ta.focus(); }
  }

  const editingText = () => root!.querySelector('.blk-text.editing .blk-ed');
  function textBarClick(el: Element) {
    const ta = editingText(), ed = editor();
    if (!ta && !ed) return;
    const act = (f: string, v?: any) => (ed ? ieAction(f, v) : fmtAction(ta, f, v));
    const al = el.closest<HTMLElement>('button[data-fal]');
    if (al) { act('al:' + AL_NAME[al.dataset.v!]); return; }
    // the colour buttons apply the last colour picked; their arrows open the app's colour picker, and the
    // colour picked wraps the selection (as an xcolor name when it is one) when the picker closes
    const fa = el.closest<HTMLElement>('button[data-fapply]');
    if (fa) { const f = fa.dataset.fapply!; act(f, f === 'color' ? fmtColor : fmtHl); return; }
    const fp = el.closest<HTMLElement>('button[data-fpick]');
    if (fp) {
      const f = fp.dataset.fpick!, main = fp.parentElement!.querySelector<HTMLElement>('[data-fapply]');
      let picked: any = null;
      const show = (v: any) => main?.style.setProperty('--sw', TD.texColor.swatch(v)); // the bar under the icon (SplitButton's swatch)
      TD.openColorPicker(fp.parentElement, { value: TD.tikzColor(f === 'color' ? fmtColor : fmtHl),
        onInput: (v: any) => { const x = TD.texColor.spec(TD.parseColor(v).hex); if (x) show(x); },
        onChange: (v: any) => { picked = TD.texColor.spec(TD.parseColor(v).hex); if (picked) show(picked); },
        onClose: () => { if (picked) act(f, picked); else { show(f === 'color' ? fmtColor : fmtHl); if (ed) ieRestore(); } renderShell(); } });
      return;
    }
    const fb = el.closest<HTMLElement>('button[data-fmt]');
    if (fb) act(fb.dataset.fmt!);
  }

  // ---------- editing a text block in place ----------
  // The block is edited as it looks (src/application/doc-inline.ts turns its source into an editable view and
  // back). Each change writes the source again, so saving, the preview and the LaTeX export are unchanged.
  // The LaTeX source button on the toolbar switches to editing the source itself (the textarea above).
  const editor = () => root!.querySelector<HTMLElement>('.blk-text.editing .blk-ie');
  const ieOrig = new WeakMap<Element, string>();
  let ieFor = -1; // the block the editor was set up for
  let ieRange: Range | null = null; // the selection in the editor, kept while the toolbar or a dialog has the focus
  let iePop: any = null;
  const ieHtml = (b: any, ctx: any) => TD.math.synchronous(() => IE.editableHtml(b.text || '', ctx, IED)); // typed into: no progress to follow
  // the section numbers the blocks above have used, so the editor numbers its headings as the page does
  function secBefore(i: number) {
    const P = TD.pageSize(doc().page), ctx = { sec: [0, 0, 0], numbered: !!P.numbered };
    doc().blocks.slice(0, i).forEach((b: any) => {
      if (b.type !== 'text') return;
      String(b.text || '').split(/\$\$[\s\S]*?\$\$/).forEach((part) => part.split('\n').forEach((l) => { const h = l.replace(/\s+$/, '').match(HEAD_RE); if (h) heading(h[1].length, ctx.sec, ctx.numbered); }));
    });
    return ctx;
  }
  // Write the editor back to the block's source.
  function ieSync(typing = false) {
    const ed = editor(), b = doc().blocks[editingIdx];
    if (!ed || !b) return;
    const text = IE.serialise(ed, ieOrig);
    ed.classList.toggle('empty', !text && !ed.querySelector('li, .dmath'));
    if (!typing) H.cut(); // what is typed after Enter or a format is a step of its own
    if (text !== (b.text || '')) {
      b.text = text;
      changed([editingIdx], { index: editingIdx, typing, caret: IE.caretOffset(ed) });
      relayout();
    }
    ieState();
  }
  // Draw the editor again from the source (undo, paste), the caret at `caret`.
  function ieRedraw(caret: number | null) {
    const ed = editor(), b = doc().blocks[editingIdx];
    if (!ed || !b) return;
    ed.innerHTML = ieHtml(b, secBefore(editingIdx));
    IE.recordOrig(ed, ieOrig);
    ed.classList.toggle('empty', !b.text);
    if (caret != null) IE.setCaret(ed, caret);
    relayout(); ieState();
  }
  // Set up the editor after a render: its untouched content, the history, and the caret.
  function ieMount(caret: number | null) {
    const ed = editor();
    if (!ed) { ieFor = -1; return; }
    IE.recordOrig(ed, ieOrig);
    ieFor = editingIdx;
    ed.focus({ preventScroll: true });
    if (caret != null) IE.setCaret(ed, caret); else IE.placeCaret(IE.lastPos(ed));
    ieState();
  }
  // the caret where the pointer went down, when that is in the editor
  function ieCaretAt(x: number, y: number) {
    const ed = editor();
    if (!ed) return;
    const d = document as any;
    let at: [Node, number] | null = null;
    if (d.caretPositionFromPoint) { const p = d.caretPositionFromPoint(x, y); if (p) at = [p.offsetNode, p.offset]; }
    else if (d.caretRangeFromPoint) { const r = d.caretRangeFromPoint(x, y); if (r) at = [r.startContainer, r.startOffset]; }
    if (at && ed.contains(at[0]) && !(at[0].parentElement?.closest('[contenteditable="false"]'))) IE.placeCaret(at);
  }
  // put the kept selection back (a toolbar select or a dialog took the focus)
  function ieRestore(): Range | null {
    const ed = editor();
    if (!ed) return null;
    const sel = getSelection()!;
    if (document.activeElement !== ed) ed.focus({ preventScroll: true });
    if (ieRange && ed.contains(ieRange.startContainer) && (!sel.rangeCount || !ed.contains(sel.getRangeAt(0).startContainer))) { sel.removeAllRanges(); sel.addRange(ieRange); }
    if (!sel.rangeCount || !ed.contains(sel.getRangeAt(0).startContainer)) IE.placeCaret(IE.lastPos(ed));
    return sel.getRangeAt(0);
  }
  // the toolbar follows the caret: formats on, the block's kind
  let ieStateFrame = 0;
  function ieState() {
    if (ieStateFrame) return;
    ieStateFrame = requestAnimationFrame(() => {
      ieStateFrame = 0;
      const ed = editor(), sel = getSelection();
      if (!ed || !sel || !sel.rangeCount || !ed.contains(sel.getRangeAt(0).startContainer)) return;
      const r = sel.getRangeAt(0), on = IE.activeFormats(ed, r.startContainer), kind = IE.blockKind(IE.blockOf(r.startContainer, ed));
      caretIn = {
        head: /^#+$/.test(kind) ? kind : '',
        active: { b: on.has('textbf'), i: on.has('textit') || on.has('emph'), u: on.has('underline') || on.has('uline'), s: on.has('sout'), ul: kind === 'ul', ol: kind === 'ol', chk: kind === 'chk' },
      };
      renderShell();
    });
  }
  document.addEventListener('selectionchange', () => {
    const ed = editor(), sel = getSelection();
    if (!ed || !sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    if (iePend && !ieComposing && !iePop) iePendMoved(r.collapsed ? [r.startContainer, r.startOffset] : null);
    if (!ed.contains(r.startContainer)) return;
    ieRange = r.cloneRange();
    ieState();
  });
  // A formula typed out of order: $$, the caret back between them, then the maths (or a $ typed before maths that
  // ends in one). The pair being typed in stays text while the caret is inside it, so a command such as \alpha is
  // typed whole, and becomes a formula once the caret leaves it (arrow keys, a click, leaving the block). Only a pair
  // typed in turns: dollars the source escapes (\$x\$, shown as $x$) stay text. Typing the closing $ makes the
  // formula at once (ieTyped).
  const INLINE_MATH = /(^|[^\\$])\$([^$\s](?:[^$]*[^$\s\\])?)\$(?!\$)/g;
  let iePend: { node: Text; at: number } | null = null, ieComposing = false;
  // the complete $…$ in text node n that offset c is inside (after its opening $, up to its closing one)
  function iePairAt(n: Node, c: number) {
    if (n.nodeType !== 3) return null;
    for (const m of n.nodeValue!.matchAll(INLINE_MATH)) {
      const open = m.index! + m[1].length, close = m.index! + m[0].length - 1;
      if (c > open && c <= close) return { open, close, tex: m[2] };
    }
    return null;
  }
  // after typing: is the caret in a complete pair? (then it is the one being typed)
  function iePendTyped() {
    const sel = getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return;
    const r = sel.getRangeAt(0);
    iePend = iePairAt(r.startContainer, r.startOffset) ? { node: r.startContainer as Text, at: r.startOffset } : null;
  }
  // the pair being typed in, as a formula; true when it was there to turn
  function iePendFlush(): boolean {
    const p = iePend;
    iePend = null;
    if (!p || !p.node.isConnected) return false;
    const pair = iePairAt(p.node, p.at);
    if (!pair) return false;
    const sel = getSelection(), after = !!sel && sel.rangeCount > 0 && sel.isCollapsed && sel.anchorNode === p.node && sel.anchorOffset === pair.close + 1;
    const r = document.createRange(); r.setStart(p.node, pair.open); r.setEnd(p.node, pair.close + 1);
    const chip = chipFrom(IE.mathChip(pair.tex, IED));
    r.deleteContents(); r.insertNode(chip);
    // arrowed out past the closing $: the caret stays after the formula
    if (after) { const a = document.createRange(); a.setStartAfter(chip); a.collapse(true); sel!.removeAllRanges(); sel!.addRange(a); }
    return true;
  }
  // the caret moved: still in the pair, it follows; out of it, the pair turns
  function iePendMoved(caret: [Node, number] | null) {
    const p = iePend!;
    if (caret && caret[0] === p.node) {
      const now = iePairAt(p.node, caret[1]), was = iePairAt(p.node, p.at);
      if (now && was && now.open === was.open) { p.at = caret[1]; return; }
    }
    if (iePendFlush() && editingIdx === ieFor) ieSync();
  }
  root!.addEventListener('compositionstart', () => { ieComposing = true; });
  root!.addEventListener('compositionend', () => { ieComposing = false; });
  const chipFrom = (html: string) => { const t = document.createElement('template'); t.innerHTML = html; return t.content.firstChild as HTMLElement; };
  // put a node where the selection is, the caret after it
  function ieInsert(r: Range, node: Node) {
    r.deleteContents(); r.insertNode(node);
    const after = document.createRange(); after.setStartAfter(node); after.collapse(true);
    const sel = getSelection()!; sel.removeAllRanges(); sel.addRange(after);
  }
  // A formula: edited in the user's input mode (LaTeX or MathLive), in a box under it.
  function ieEditChip(chip: HTMLElement) {
    const ed = editor();
    if (!ed || iePop) return;
    let host = document.getElementById('docPop');
    if (!host) { host = document.createElement('div'); host.id = 'docPop'; document.body.appendChild(host); }
    const display = chip.classList.contains('ie-d');
    let tex = chip.dataset.tex || '';
    chip.classList.add('on');
    iePop = TD.input.popup(host, {
      text: tex, math: true,
      at: () => { const r = chip.getBoundingClientRect(); return [r.left + r.width / 2, r.bottom + 6]; },
      onInput: (v: string) => {
        tex = v; chip.dataset.tex = v;
        chip.innerHTML = v.trim() ? IED.katex(v, display) : display ? '<span class="ie-empty">$$</span>' : '';
        ieSync(true); iePop?.place();
      },
      onDone: () => {
        iePop = null;
        chip.classList.remove('on');
        if (!chip.isConnected || editor() !== ed) return;
        ed.focus({ preventScroll: true });
        if (!tex.trim()) { const r = document.createRange(); r.setStartBefore(chip); r.collapse(true); chip.remove(); IE.placeCaret([r.startContainer, r.startOffset]); }
        else if (display) { const n = chip.nextElementSibling; if (n && !n.classList.contains('dmath')) IE.placeCaret(IE.firstPos(n)); else { const p = document.createElement('p'); p.innerHTML = '<br>'; chip.after(p); IE.placeCaret([p, 0]); } }
        else { const r = document.createRange(); r.setStartAfter(chip); r.collapse(true); IE.placeCaret([r.startContainer, r.startOffset]); }
        ieSync();
      },
    });
  }
  // a command shown as it is written (\LaTeX, or one with no editing form): its source, in a dialog
  async function ieEditRaw(chip: HTMLElement) {
    const v = await TD.prompt(t('doc.ie.raw', 'LaTeX'), chip.dataset.src || '', { ok: t('doc.ie.apply', 'Apply') });
    const ed = editor();
    if (typeof v !== 'string' || !ed || !chip.isConnected) return;
    ed.focus({ preventScroll: true });
    if (!v.trim()) chip.remove();
    else {
      const b = doc().blocks[editingIdx];
      const mark = '', tmp = document.createElement('span');
      chip.replaceWith(tmp); tmp.className = 'ie-raw'; tmp.dataset.src = v + mark;
      ieRedrawAtMark(b, mark);
      return;
    }
    ieSync();
  }
  // Source with a marker in it: drawn again, the marker taken out and the caret put where it was.
  function ieRedrawAtMark(b: any, mark: string) {
    const ed = editor();
    if (!ed) return;
    b.text = IE.serialise(ed, ieOrig);
    ed.innerHTML = ieHtml(b, secBefore(editingIdx));
    const w = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let at: [Node, number] | null = null;
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (n.parentElement?.closest('[contenteditable="false"]')) continue;
      const k = n.nodeValue!.indexOf(mark);
      if (k >= 0) { n.nodeValue = n.nodeValue!.split(mark).join(''); if (!at) at = [n, k]; }
    }
    // the marker in a block's source, or inside a formula or a command (drawn again without it)
    ed.querySelectorAll<HTMLElement>('[data-tex*=""], [data-src*=""]').forEach((e) => {
      if (e.dataset.src) e.dataset.src = e.dataset.src.split(mark).join('');
      const chip = e.getAttribute('contenteditable') === 'false';
      if (!chip) return;
      if (e.dataset.tex !== undefined) { e.dataset.tex = e.dataset.tex.split(mark).join(''); e.innerHTML = IED.katex(e.dataset.tex, e.classList.contains('ie-d')); }
      else if (e.querySelector('.ie-src')) e.querySelector('.ie-src')!.textContent = e.dataset.src || '';
      if (!at) { const r = document.createRange(); r.setStartAfter(e); at = [r.startContainer, r.startOffset]; }
    });
    b.text = String(b.text).split(mark).join('');
    IE.recordOrig(ed, ieOrig);
    ed.classList.toggle('empty', !b.text);
    if (at) IE.placeCaret(at); else IE.placeCaret(IE.lastPos(ed));
    changed([editingIdx], { index: editingIdx, caret: IE.caretOffset(ed) });
    relayout(); ieState();
  }
  // Paste: the text is read as source (what copying from the editor gives), where the caret is.
  function iePaste(text: string) {
    const ed = editor(), b = doc().blocks[editingIdx];
    if (!ed || !b) return;
    const r = ieRestore();
    if (!r) return;
    const mark = '', tmp = document.createElement('span');
    tmp.className = 'ie-raw'; tmp.dataset.src = text.replace(/\r\n?/g, '\n') + mark;
    ieInsert(r, tmp);
    ieRedrawAtMark(b, mark);
  }
  // the selection as source, for the clipboard
  function ieCopy(e: ClipboardEvent, cut: boolean) {
    const sel = getSelection(), ed = editor();
    if (!sel || !sel.rangeCount || !ed || sel.isCollapsed) return;
    const r = sel.getRangeAt(0), box = document.createElement('div');
    box.appendChild(r.cloneContents());
    // only part of one block: its text, without making a paragraph of it
    const src = IE.serialise(box, new WeakMap());
    e.preventDefault();
    e.clipboardData!.setData('text/plain', src);
    e.clipboardData!.setData('text/html', box.innerHTML);
    if (cut) { r.deleteContents(); ieSync(); }
  }
  // Typed formulas: $x$ becomes a formula as the closing $ is typed; $$ on an empty line, displayed maths.
  function ieTyped(e: InputEvent) {
    const ed = editor(), sel = getSelection();
    if (!ed || !sel || !sel.rangeCount || e.data !== '$') return;
    const r = sel.getRangeAt(0), n = r.startContainer;
    if (n.nodeType !== 3) return;
    const before = n.nodeValue!.slice(0, r.startOffset);
    const blk = IE.blockOf(n, ed);
    if (before === '$$' && blk && blk.tagName === 'P' && (blk.textContent || '') === '$$') {
      const chip = chipFrom(IE.displayChip('', IED));
      blk.replaceWith(chip);
      ieSync();
      ieEditChip(chip);
      return;
    }
    const m = /(^|[^\\$])\$([^$\s](?:[^$]*[^$\s\\])?)\$$/.exec(before);
    if (!m) return;
    const start = r.startOffset - (m[0].length - m[1].length);
    const span = document.createRange(); span.setStart(n, start); span.setEnd(n, r.startOffset);
    ieInsert(span, chipFrom(IE.mathChip(m[2], IED)));
    ieSync();
  }
  // Markdown at the start of a paragraph: "# " a section, "- " a list, "1. " numbered, "[ ] " a checklist.
  function ieShortcut(ed: HTMLElement): boolean {
    const sel = getSelection()!, r = sel.getRangeAt(0);
    if (!r.collapsed) return false;
    const blk = IE.blockOf(r.startContainer, ed);
    if (!blk || !(blk.tagName === 'P' || blk.tagName === 'LI')) return false;
    const pre = document.createRange(), [n0, o0] = IE.firstPos(blk);
    pre.setStart(n0, o0);
    try { pre.setEnd(r.startContainer, r.startOffset); } catch { return false; }
    const s = pre.toString();
    const kind = blk.tagName === 'LI' ? (/^\[[ xX]?\]$/.test(s) ? 'chk' : '') : ({ '#': '#', '##': '##', '###': '###', '-': 'ul', '*': 'ul', '1.': 'ol', '1)': 'ol', '[]': 'chk', '[ ]': 'chk', '-[ ]': 'chk', '[x]': 'chk' } as Record<string, string>)[s] || '';
    if (!kind) return false;
    pre.deleteContents();
    const [nb] = IE.setKind(ed, [blk], kind);
    if (nb && /x/i.test(s)) nb.querySelector(':scope > .cbx')?.classList.add('on');
    if (nb) IE.placeCaret(IE.firstPos(nb));
    ieSync();
    return true;
  }
  function ieKey(e: KeyboardEvent, ed: HTMLElement) {
    if (e.isComposing) return;
    const mod = (e.metaKey || e.ctrlKey) && !e.altKey, k = e.key.toLowerCase();
    if (e.key === 'Escape') { const was = editingIdx; editingIdx = -1; renderKeep(was, true); return; }
    if (mod && (k === 'b' || k === 'i' || k === 'u')) { e.preventDefault(); ieAction(k); return; }
    if (undoKey(e)) return;
    const sel = getSelection();
    if (!sel || !sel.rangeCount) return;
    const r = sel.getRangeAt(0), blk = IE.blockOf(r.startContainer, ed);
    if (e.key === 'Enter' && !mod) {
      e.preventDefault();
      if (e.shiftKey) {
        // a line break inside the paragraph (\\)
        const br = document.createElement('br');
        ieInsert(r, br);
        if (!br.nextSibling || (br.nextSibling.nodeType === 3 && !br.nextSibling.nodeValue && !br.nextSibling.nextSibling)) br.after(document.createElement('br'));
      } else IE.splitBlock(ed);
      ieSync();
      return;
    }
    if (e.key === 'Tab' && blk && blk.tagName === 'LI') {
      e.preventDefault();
      const off = IE.caretOffset(ed);
      if (e.shiftKey) IE.outdent(blk, ed, false); else IE.indent(blk);
      if (off != null) IE.setCaret(ed, off);
      ieSync();
      return;
    }
    if (e.key === 'Backspace' && r.collapsed && blk && IE.atLineStart(blk, r)) {
      // the start of an item or a heading: back to a paragraph (an item one level at a time)
      if (blk.tagName === 'LI') { e.preventDefault(); IE.outdent(blk, ed, true); ieSync(); return; }
      if (/^H[2-4]$/.test(blk.tagName)) { e.preventDefault(); const [p] = IE.setKind(ed, [blk], 'p'); if (p) IE.placeCaret(IE.firstPos(p)); ieSync(); return; }
      const prev = blk.previousElementSibling as HTMLElement | null;
      if (prev && prev.classList.contains('dmath')) { e.preventDefault(); prev.remove(); ieSync(); return; }
    }
    if (e.key === ' ' && !mod && ieShortcut(ed)) e.preventDefault();
  }
  // What the toolbar does to the editor (the source mode uses fmtAction).
  const IE_TAG: Record<string, [string, string]> = { b: ['textbf', 'b'], i: ['textit', 'i'], u: ['underline', 'u'], s: ['sout', 's'] };
  function colourAttrs(f: string, val: string): [Record<string, string>, string] {
    const rgb = /^rgb/.test(val), hex = rgb && TD.tikzColor(val);
    const attrs: Record<string, string> = rgb && hex ? { 'data-opt': 'HTML', 'data-arg': hexOf(hex) } : { 'data-arg': val };
    const css = colorCss(attrs['data-opt'], attrs['data-arg']);
    if (f === 'hl') attrs.class = 'cbox';
    return [attrs, f === 'color' ? `color:${css}` : `background:${css}`];
  }
  function ieAction(f: string, val?: any) {
    const ed = editor(), b = doc().blocks[editingIdx];
    if (!ed || !b) return;
    if (f.startsWith('al:')) {
      b.align = f.slice(3) === 'justify' ? undefined : f.slice(3);
      ed.style.textAlign = f.slice(3);
      renderShell(); changed([editingIdx]); ieRestore(); return;
    }
    if (f === 'size') { b.size = val === 'normalsize' ? undefined : val; renderShell(); ed.style.fontSize = val === 'normalsize' ? '' : SIZE_EM[val] + 'em'; changed([editingIdx]); relayout(); ieRestore(); return; }
    if (f === 'src') { setSrcMode(true); return; }
    const r = ieRestore();
    if (!r) return;
    if (IE_TAG[f]) IE.toggleFormat(ed, IE_TAG[f][0], IE_TAG[f][1]);
    else if (f === 'color' || f === 'hl') {
      if (f === 'color') fmtColor = val; else fmtHl = val;
      const [attrs, style] = colourAttrs(f, val);
      IE.toggleFormat(ed, f === 'color' ? 'textcolor' : 'colorbox', 'span', attrs, style, true);
    } else if (f === 'math') {
      const tex = r.collapsed ? '' : r.toString().trim();
      const chip = chipFrom(IE.mathChip(tex, IED));
      if (!tex) chip.innerHTML = '';
      ieInsert(r, chip);
      ieSync();
      if (!tex) ieEditChip(chip);
      return;
    } else if (f === 'link') {
      const keep = r.cloneRange(), sel = r.toString();
      TD.prompt(t('doc.link.title', 'Link Address'), /^https?:\/\//.test(sel) ? sel : 'https://', { ok: t('doc.link.ok', 'Add Link') }).then((url: any) => {
        if (!editor()) return;
        ieRange = keep;
        const r2 = ieRestore();
        if (!r2 || !url || url === 'https://') return;
        if (!sel || sel === url) {
          const a = chipFrom(`<a data-cmd="url" class="tt" href="${esc(safeUrl(url))}">${esc(url)}</a>`);
          ieInsert(r2, a);
        } else IE.toggleFormat(ed, 'href', 'a', { 'data-arg': url, href: safeUrl(url) }, '', true);
        ieSync();
      });
      return;
    } else if (f === 'ul' || f === 'ol' || f === 'chk' || f === 'head') {
      const kind = f === 'head' ? val || 'p' : f;
      const blocks = IE.selectedBlocks(ed, r);
      const off = IE.caretOffset(ed);
      const all = f !== 'head' && blocks.length && blocks.every((x) => IE.blockKind(x) === kind);
      const made = IE.setKind(ed, blocks, all ? 'p' : kind);
      if (made.length === 1 && r.collapsed) IE.placeCaret(IE.lastPos(made[0]));
      else if (off != null) IE.setCaret(ed, off);
    }
    ieSync();
  }
  function setSrcMode(on: boolean) {
    srcMode = on;
    try { localStorage.setItem('diagramtex.docSource', on ? '1' : ''); } catch { /* private window */ }
    render();
  }
  function addImage(at: any, replaceIdx?: any) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      // as the canvas takes pictures: GIF, WebP and the like become PNG (what pdflatex reads), big ones are scaled down
      readPicture(f).then((pic) => {
        if (replaceIdx != null) Object.assign(doc().blocks[replaceIdx], { src: pic.src, name: f.name });
        else { keepActive((d: any) => d.blocks.splice(at, 0, { type: 'image', src: pic.src, name: f.name, width: 0.6, caption: '' })); editingIdx = at; }
        changed(); render();
      }, (err) => app.showHint?.(t('doc.img.openFailed', "Couldn't open {name}: {error}", { name: f.name, error: err.message }), 2500, 'error'));
    };
    inp.click();
  }

  root!.addEventListener('mousedown', (e) => {
    // toolbar buttons must not take focus from the text being edited
    const tg = e.target as Element;
    if (tg.closest('.fmt-bar button, .doc-fmt button')) e.preventDefault();
    // in the editor: a checkbox ticks, a formula or a command opens for editing
    const ed = editor();
    if (!ed || !ed.contains(tg) || e.button !== 0) return;
    const cbx = tg.closest('.cbx');
    if (cbx) { e.preventDefault(); cbx.classList.toggle('on'); ieSync(); return; }
    const chip = tg.closest<HTMLElement>('.ie-m, .ie-d, .ie-raw');
    if (chip) { e.preventDefault(); if (chip.classList.contains('ie-raw')) ieEditRaw(chip); else ieEditChip(chip); }
  });
  root!.addEventListener('beforeinput', (e) => {
    if (!(e.target as Element).classList?.contains('blk-ie')) return;
    const ed = e.target as HTMLElement, type = e.inputType;
    if (type === 'historyUndo' || type === 'historyRedo') { e.preventDefault(); app.undoDocument(type === 'historyUndo'); }
    else if (type === 'insertParagraph') { e.preventDefault(); IE.splitBlock(ed); ieSync(); }
    else if (type === 'insertFromDrop' || type === 'deleteByDrag') e.preventDefault();
  });
  root!.addEventListener('paste', (e) => {
    if (!(e.target as Element).closest?.('.blk-ie')) return;
    e.preventDefault();
    const text = e.clipboardData?.getData('text/plain');
    if (text) iePaste(text);
  });
  root!.addEventListener('copy', (e) => { if ((e.target as Element).closest?.('.blk-ie')) ieCopy(e, false); });
  root!.addEventListener('cut', (e) => { if ((e.target as Element).closest?.('.blk-ie')) ieCopy(e, true); });
  root!.addEventListener('click', (e) => {
    const zb = (e.target! as Element).closest('[data-zoom]');
    if (zb) {
      const z = (zb as HTMLElement).dataset.zoom;
      if (z === 'in' || z === 'out') stepZoom(z === 'in' ? 1 : -1);
      else if (z === '1') zoomTo(1);
      else { zoomMode = 'fit'; render(); }
      return;
    }
    const add = (e.target! as Element).closest('[data-add]');
    if (add) {
      const at = +(add.closest<HTMLElement>('[data-at]'))!.dataset.at!, kind = (add as HTMLElement).dataset.add;
      if (kind === 'image') { addImage(at); return; }
      const nb = kind === 'text' ? { type: 'text', text: '' } : kind === 'table' ? { type: 'table', rows: [['', '', ''], ['', '', ''], ['', '', '']], header: true, borders: 'all', colAlign: 'c' } : { type: 'diagram', shapes: [] };
      keepActive((d: any) => d.blocks.splice(at, 0, nb));
      if (kind !== 'diagram') editingIdx = at;
      changed(); render();
      if (kind === 'table') (root!.querySelector('.editing .cell') as HTMLElement)?.focus();
      return;
    }
    if ((e.target! as Element).closest('.doc-fmt')) {
      if ((e.target as Element).closest('button[data-fmt="src"]')) { if (editingIdx >= 0) setSrcMode(!srcMode); return; }
      textBarClick(e.target as Element); return;
    }
    const blk = (e.target! as Element).closest('.blk');
    if (!blk) return;
    const i = +(blk as HTMLElement).dataset.i!, b = doc().blocks[i];
    if ((e.target! as Element).closest('[data-mv]')) {
      const dir = +((e.target! as Element).closest<HTMLElement>('[data-mv]'))!.dataset.mv!;
      keepActive((d: any) => { const [x] = d.blocks.splice(i, 1); d.blocks.splice(i + dir, 0, x); });
      editingIdx = -1; changed(); render();
      return;
    }
    if ((e.target! as Element).closest('[data-rm]')) {
      const remove = () => { keepActive((d: any) => d.blocks.splice(i, 1)); editingIdx = -1; changed(); render(); };
      remove(); // undoable, so no question first: the hint says how to take it back
      if (b.type === 'diagram' && b.shapes.length) app.showHint?.(b.shapes.length > 1 ? t('doc.diag.deletedMany', 'Deleted the diagram and its {n} objects. {undo}', { n: b.shapes.length, undo: undoText() }) : t('doc.diag.deletedOne', 'Deleted the diagram and its object. {undo}', { undo: undoText() }), 2400, 'ok');
      return;
    }
    if ((e.target! as Element).closest('[data-edit]')) { openDiagram(i); return; }
    // tick a checklist box without opening the editor
    const cbx = (e.target! as Element).closest('.cbx');
    if (cbx && b.type === 'text' && editingIdx !== i) {
      const lines = (b.text || '').split('\n'), ln = +(cbx as HTMLElement).dataset.ln!;
      lines[ln] = lines[ln].replace(/\[([ xX])\]/, (m: any, c: any) => (c === ' ' ? '[x]' : '[ ]'));
      b.text = lines.join('\n'); changed(); render();
      return;
    }
    if ((e.target! as Element).closest('a[href]') && editingIdx !== i) return; // follow links in the preview
    const tb = (e.target! as Element).closest('button[data-tb]');
    if (tb) {
      const R = b.rows, nc = Math.max(1, ...R.map((r: any) => r.length));
      if ((tb as HTMLElement).dataset.tb === 'row+') R.push(Array(nc).fill(''));
      if ((tb as HTMLElement).dataset.tb === 'row-' && R.length > 1) R.pop();
      if ((tb as HTMLElement).dataset.tb === 'col+') R.forEach((r: any) => { while (r.length < nc) r.push(''); r.push(''); });
      if ((tb as HTMLElement).dataset.tb === 'col-' && nc > 1) R.forEach((r: any) => { r.length = Math.min(r.length, nc - 1); });
      if ((tb as HTMLElement).dataset.tb === 'hdr') b.header = b.header === false;
      if ((tb as HTMLElement).dataset.tb!.startsWith('al:')) b.colAlign = (tb as HTMLElement).dataset.tb!.slice(3);
      changed(); render();
      return;
    }
    const im = (e.target! as Element).closest('button[data-im]');
    if (im) {
      if ((im as HTMLElement).dataset.im === 'replace') addImage(null, i);
      if ((im as HTMLElement).dataset.im === 'download') downloadImage(b.src, imageName(b, i));
      return;
    }
    if (['text', 'table', 'image'].includes(b.type) && editingIdx !== i) { const was = editingIdx; editingIdx = i; renderKeep(was); }
  });
  root!.addEventListener('change', (e) => {
    const t = e.target;
    if ((t as Element).closest('.doc-fmt')) {
      const f = (t as HTMLElement).dataset.fmt;
      if (f && editor()) ieAction(f, (t as HTMLSelectElement).value);
      else if (f) { fmtAction(editingText(), f, (t as HTMLSelectElement).value); if (f === 'head') (t as HTMLSelectElement).value = ''; }
      return;
    }
    const blk = (t! as Element).closest('.blk');
    if (!blk) return;
    const b = doc().blocks[+(blk as HTMLElement).dataset.i!];
    if ((t! as HTMLElement).dataset.tb) { b[((t! as HTMLElement).dataset.tb as any)] = (t! as any).type === 'checkbox' ? (t! as HTMLInputElement).checked : (t! as HTMLInputElement).value; changed(); render(); return; }
    if ((t! as HTMLElement).dataset.im === 'caption') { b.caption = (t! as HTMLInputElement).value; changed([editingIdx]); }
  });
  root!.addEventListener('dblclick', (e) => {
    if ((e.target as Element).closest('.doc-title')) { renameFromTitle(); return; }
    const blk = (e.target! as Element).closest('.blk-diag');
    if (blk && !(e.target! as Element).closest('.blk-tools')) openDiagram(+(blk as HTMLElement).dataset.i!);
  });
  // The title shows the file's name, so double-clicking it renames the file (keeping its folder).
  async function renameFromTitle() {
    const old = leafName(doc().name);
    const v = await TD.prompt(t('doc.title.rename', 'Rename File'), old, {
      message: t('doc.title.renameHint', "The title is the file's name. Put maths between $ signs, as in $x^2$."),
      ok: t('ui.rename', 'Rename'), placeholder: 'Untitled',
      preview: (value: string) => TD.math.synchronous(() => titleHtml(value.trim() || 'Untitled')), // a dialog doesn't follow maths progress
    });
    const name = typeof v === 'string' ? v.trim() : '';
    if (name && name !== old) app.renameOpen(name);
  }
  function openDiagram(i: any) {
    app.setActiveBlock(i);
    app.setMode('diagram');
    requestAnimationFrame(() => app.zoomFit());
  }
  const relayout = () => { clearTimeout(relayT); relayT = setTimeout(() => layoutPage(TD.pageSize(doc().page)), 400); };
  root!.addEventListener('input', (e) => {
    const t = e.target, b = doc().blocks[editingIdx];
    if (!b) return;
    if ((t! as Element).classList.contains('blk-ed')) { b.text = (t! as HTMLInputElement).value; autosize(t); changed([editingIdx], { index: editingIdx, typing: true }); relayout(); return; }
    if ((t! as Element).classList.contains('blk-ie')) { ieSync(true); if ((e as InputEvent).inputType === 'insertText') { ieTyped(e as InputEvent); iePendTyped(); } return; }
    if ((t! as Element).classList.contains('cell')) { const r = +(t! as HTMLElement).dataset.r!, c = +(t! as HTMLElement).dataset.c!; while (b.rows[r].length <= c) b.rows[r].push(''); b.rows[r][c] = (t! as HTMLInputElement).value; changed([editingIdx], { index: editingIdx, typing: true, cell: [r, c] }); return; }
    if ((t! as HTMLElement).dataset.im === 'width') {
      b.width = +(t! as HTMLInputElement).value;
      const img = ((t! as Element).closest('.blk'))!.querySelector('img');
      if (img) img.style.width = b.width * 100 + '%';
      const bar = (t! as Element).closest<HTMLElement>('.fmt-bar[data-bar]');
      if (bar) renderView(bar, DocBlockChrome, barModel(b, editingIdx)); // its readout
      changed([editingIdx], { index: editingIdx, typing: true }); relayout();
    }
  });
  // Leaving the block being edited (by mouse or keyboard) shows its rendered form again.
  function leaveIfOutside(el: any) {
    if (editingIdx < 0) return;
    const cur = root!.querySelector('.blk.editing');
    // the toolbar, a formula's box, the colour picker, a menu or a dialog work on the block being edited
    if (cur && el && (cur.contains(el) || (el.closest && el.closest('.doc-fmt, #docPop, .cp, .selmenu, .td-dialog')))) return;
    // pressing on another text / table / image block opens that one straight away
    const nb = el && el.closest && !el.closest('.blk-tools, .cbx, a[href]') && el.closest('.blk-text, .blk-table, .blk-image');
    const was = editingIdx;
    editingIdx = nb ? +nb.dataset.i : -1;
    renderKeep(was);
  }
  root!.addEventListener('focusout', (e) => {
    if (!(e.target! as Element).closest('.blk.editing, .doc-fmt')) return;
    setTimeout(() => { if (document.activeElement && document.activeElement !== document.body) leaveIfOutside(document.activeElement); }, 0);
  });
  document.addEventListener('pointerdown', (e) => {
    if (editingIdx < 0 || app.state.mode !== 'document') return;
    if ((e.target! as Element).closest('.blk.editing, .doc-fmt') || (e.target! as Element).closest('.tc-pop, .texcomplete, .td-dialog, #docPop, .cp, .selmenu')) return;
    if (!root!.contains((e.target as Node)) && !(e.target! as Element).closest('#docview')) return;
    // a quick click (a trackpad tap) can be over before this runs: its click has already opened the block it was
    // on, and drawn the page again, so the element pressed is gone. Leave that edit be.
    const was = editingIdx;
    setTimeout(() => { if (editingIdx === was) leaveIfOutside((e.target! as HTMLElement).isConnected ? e.target : null); }, 0);
  }, true);
  root!.addEventListener('keydown', (e) => {
    const t = e.target;
    if ((t! as Element).classList.contains('blk-ie')) { ieKey(e, t as HTMLElement); return; }
    if ((t! as Element).classList.contains('blk-ed') || (t! as Element).classList.contains('cell')) { if (undoKey(e)) return; }
    if ((t! as Element).classList.contains('blk-ed')) {
      if (e.key === 'Escape') { const was = editingIdx; editingIdx = -1; renderKeep(was, true); return; }
      const k = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); fmtAction(t, k); }
    }
    if ((t! as Element).classList.contains('cell')) {
      if (e.key === 'Escape') { const was = editingIdx; editingIdx = -1; renderKeep(was, true); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const b = doc().blocks[editingIdx], r = +(t! as HTMLElement).dataset.r!, c = +(t! as HTMLElement).dataset.c!;
        if (r === b.rows.length - 1) { b.rows.push(Array(b.rows[0].length).fill('')); changed(); render(); }
        (root!.querySelector(`.editing .cell[data-r="${r + 1}"][data-c="${c}"]`) as HTMLElement)?.focus();
      }
    }
  });

  // ---------- standalone HTML export ----------
  // One self-contained file: the rendered page with its fonts embedded, maths included.
  const dataUrl = async (url: any, type: any) => {
    const buf = await (await fetchOk(url)).arrayBuffer();
    let s = '';
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000) as unknown as number[]);
    return `data:${type};base64,${btoa(s)}`;
  };
  // Where each maths stylesheet lives (vendor/). Fonts are only ever embedded from these local copies. KaTeX's own,
  // then TeX's script-size faces over it (katex-scripts.css).
  const MATH_CSS = ['vendor/katex/katex.min.css', 'vendor/katex/katex-scripts.css'];
  const fetchOk = async (url: any) => {
    for (let k = 0; k < 2; k++) { // one retry: a dev server mid-restart usually answers the second time
      try { const r = await fetch(url); if (r.ok) return r; } catch (e: any) { /* retry */ }
    }
    // the copy the service worker keeps for offline use (every vendor file is precached)
    try { const c = self.caches && (await caches.match(new URL(url, location.href).href, { ignoreSearch: true })); if (c) return c; } catch (e: any) { /* no cache */ }
    throw new Error('could not load ' + url);
  };
  // The stylesheet text: from the network, else from the copy this page already loaded.
  async function mathCssText(cssUrl: any) {
    try { return await (await fetchOk(cssUrl)).text(); } catch (e: any) {
      // the copy this page loaded: matched by its path, so a query string or another origin doesn't hide it
      const file = cssUrl.split('/').pop();
      const ss = [...document.styleSheets].find((s) => s.href && new URL(s.href).pathname.endsWith('/' + file));
      try { if (ss) return [...ss.cssRules].map((r) => r.cssText).join('\n'); } catch (e2: any) { /* unreadable (file://) */ }
      return '';
    }
  }
  // Fonts that could not be embedded in the last export (left out; nothing is fetched from another site).
  TD.mathFontsLinked = 0;
  async function inlineFonts() {
    let all = '', linked = 0;
    for (const cssUrl of MATH_CSS) {
      let css = await mathCssText(cssUrl);
      if (!css) { if (!all) { TD.mathFontsLinked = -1; return ''; } continue; }
      const base = cssUrl.slice(0, cssUrl.lastIndexOf('/') + 1);
      const urls = [...new Set([...css.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)/g)].map((m) => m[1]))];
      for (const u of urls) {
        const rel = u.replace(/^\.\//, '');
        let src;
        try { src = await dataUrl(base + rel, 'font/woff2'); } catch (e: any) { src = rel; linked++; }
        css = css.split(u).join(src);
      }
      all += css;
    }
    TD.mathFontsLinked = linked;
    // keep only the woff2 sources
    return all.replace(/,\s*url\([^)]*\.(woff|ttf)\)\s*format\(["'](woff|truetype)["']\)/g, '');
  }
  // the maths stylesheet with its fonts embedded (for PNG / PDF export)
  TD.inlineMathCss = inlineFonts;
  // pageBody: ready-made markup (Page files pass their page SVGs); otherwise the Classic document.
  TD.docToHtml = async function (pageBody: any) {
    const was = editingIdx;
    editingIdx = -1;
    const { h, P } = pageBody ? { h: pageBody, P: TD.pageSize(doc().page) } : pageHtml(true);
    editingIdx = was;
    const box = document.createElement('div');
    box.innerHTML = h;
    sizeDiagrams(box);
    const mathCss = await TD.inlineMathCss();
    const own = [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules]; } catch (e: any) { return []; } })
      .map((r) => r.cssText)
      .filter((t) => /\.(doc-page|doc-title|dmath|tx|dtab|cbx|cbox|tt|la|te|blk|blk-body|blk-diag|blk-image|blk-text|blk-table)\b|figcaption/.test(t)
        && !/^@media|:hover|blk-tools|\.ins\b|editing|fmt-|\.ph\b|\.active|cm-probe|pg-brk|var\(--(?!font-tex|spread|al\b)/.test(t)).join('\n');
    const name = doc().name || 'Untitled';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
<style>${mathCss}</style>
<style>
:root { --font-tex: KaTeX_Main, "Times New Roman", serif; }
body { margin: 0; background: #f4f3ef; color: #111; padding: 24px 12px; }
${own}
/* the page's own rule is left out above (it uses the app's colours), so its type is set here: KaTeX_Main, embedded */
.doc-page { margin: 0 auto; max-width: 100%; box-sizing: border-box; min-height: 0 !important; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 6px 20px rgba(0,0,0,.06);
  position: relative; background: #fff; color: #111; font-family: var(--font-tex); line-height: calc(1.5 * var(--spread, 1)); }
.cm-probe { display: none; }
@media (max-width: ${Math.round(P.W * 37.8)}px) { .doc-page { padding: 1.2cm 16px !important; } }
@media print { body { background: #fff; padding: 0; } .doc-page { box-shadow: none; padding: 0 !important; width: auto !important; } @page { size: ${P.W}cm ${P.H}cm; margin: ${P.mt}cm ${P.mr}cm ${P.mb}cm ${P.ml}cm; } }
</style></head>
<body>
${box.innerHTML}
</body></html>
`;
  };

  TD.docview = { applyUndo, canUndo: () => H.owns(doc()) && H.lastDone() > 0, canRedo: () => H.owns(doc()) && H.lastUndone() > 0, lastDone: () => (H.owns(doc()) ? H.lastDone() : 0), lastUndone: () => (H.owns(doc()) ? H.lastUndone() : 0), changed, scrollToDiagram, render, renderProgress, beginEngineChange, cancelProgress, updateTitle, renderSettings, textToHtml, textToLatex, inl };
  // the page's editing chrome follows the interface language
  let firstLocale = true;
  onLocale(() => { if (firstLocale) { firstLocale = false; return; } if (app.state.mode === 'document') render(); });
  if (app.state.mode === 'document') { render(); app.renderProps(); }
})();
