import { previewFadeFinished } from '../platform/preview-fade';
import { updateSvg } from '../platform/update-svg';
import { SvgLabelResources } from '../platform/svg-label-resources';
import { wheelZoomFactor } from '../ui/wheel-zoom';
import DocumentSettings from '../ui/DocumentSettings.svelte';
import { renderView } from '../ui/render-view.svelte';
import { runtime as TD } from '../runtime';
import { t, onLocale } from '../i18n';
import { downloadImage } from '../platform/download';
import { readPicture } from '../platform/images';
// Document view: a page of text blocks (LaTeX-flavoured, $math$) with embedded diagrams,
// plus whole-document LaTeX export.
(function () {
  // a file's own name, without the folders in front of it ("Physics/Lab 1" → "Lab 1")
  const leafName = (n: any) => { const p = String(n || '').split('/').map((x) => x.trim()).filter(Boolean); return p.length ? p[p.length - 1] : ''; };
  const app = TD.app;
  const { esc } = TD.util;
  const root = document.getElementById('docview');
  const labelResources = new SvgLabelResources();

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
        let k = i + 1;
        while (k < n && !(src[k] === '$' && src[k - 1] !== '\\')) k++;
        if (k < n && k > i + 1) { out += katex(src.slice(i + 1, k), false); i = k + 1; continue; }
      }
      if (c === '\\') {
        const nx = src[i + 1] || '';
        if (nx === '(') { const k = src.indexOf('\\)', i + 2); if (k > 0) { out += katex(src.slice(i + 2, k), false); i = k + 2; continue; } }
        if (nx === '\\') { out += '<br>'; i += 2; continue; }
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
    const parts = String(text).split(/\$\$([\s\S]*?)\$\$/);
    let L = 0; // line number in the block's source, for clickable checkboxes
    parts.forEach((part, pi) => {
      if (pi % 2) { out.push(`<div class="dmath">${katex(part.trim(), true)}</div>`); L += (part.match(/\n/g) || []).length; return; }
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

  // ---------- LaTeX export ----------
  const escTex = (line: any) => TD.segments(line).map((seg: any) => (seg.math ? `$${TD.mathTex(seg)}$` : seg.s.replace(/(^|[^\\])([%&#])/g, '$1\\$2').replace(/(^|[^\\])([%&#])/g, '$1\\$2'))).join('');
  // a name typed as plain text (a file name), every character as it is
  const PLAIN: Record<string, string> = { '\\': '\\textbackslash{}', '{': '\\{', '}': '\\}', $: '\\$', '%': '\\%', '&': '\\&', '#': '\\#', _: '\\_', '^': '\\textasciicircum{}', '~': '\\textasciitilde{}' };
  const plainTex = (t: any) => String(t).replace(/[\\{}$%&#_^~]/g, (c) => PLAIN[c]);
  function textToLatex(text: any, ctx: Record<string, any> = {}) {
    const parts = String(text).split(/\$\$([\s\S]*?)\$\$/);
    const env: Record<string, any> = { ul: 'itemize', ol: 'enumerate', chk: 'itemize' };
    return parts.map((part, pi) => {
      if (pi % 2) return `\\[\n  ${part.trim()}\n\\]`;
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
  function mathStyleLines(body: any, X: any) {
    const need = TD.lint && TD.lint.mathNeeds ? TD.lint.mathNeeds(body.join('\n')) : { pkgs: [], defs: [] };
    return [...need.pkgs.filter((p: any) => p !== 'amsmath' && p !== 'amssymb' && !X.pkgs.has(p)).map((p: any) => `\\usepackage{${p}}`), ...need.defs];
  }
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
  TD.docToLatex = function (doc: any) {
    const X = TD.makeTikzContext();
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
      if (!b.shapes || !b.shapes.length) return;
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
    const extra = [...pk].filter((p) => !(p as any).includes('hyperref')).map((p) => `\\usepackage${p}`);
    const spread = +P.spread || 1;
    return [
      `\\documentclass[${P.font}pt]{article}`,
      `\\usepackage[${geometryOpts(P)}]{geometry}`,
      '\\usepackage{amsmath, amssymb}',
      '\\usepackage{xcolor}',
      ...(needGraphicx ? ['\\usepackage{graphicx}'] : []),
      ...(needBox ? ['\\newsavebox{\\dtxbox}'] : []),
      ...extra,
      ...pre,
      ...mathStyleLines(body, X),
      ...(pk.has('{hyperref}') ? ['\\usepackage{hyperref}'] : []), // hyperref goes last
      ...defs,
      ...X.preDefs,
      ...(spread !== 1 ? [`\\linespread{${spread}}`] : []),
      '',
      ...(P.title ? [`\\title{${plainTex(leafName(doc.name) || 'Untitled')}}`, '\\date{}', ''] : []),
      '\\begin{document}',
      ...(P.title ? ['\\maketitle'] : []),
      '',
      ...body,
      '\\end{document}',
      '',
    ].join('\n');
  };

  // Page mode: every object keeps its exact place on the paper. Each page is one overlay
  // tikzpicture placed at the page's top-left corner with eso-pic (one LaTeX run).
  TD.pageToLatex = function (doc: any, { only }: Record<string, any> = {}) {
    const X = TD.makeTikzContext();
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
    return [
      `% ${leafName(doc.name) || 'Untitled'}: free-form page from DiagramTeX ${TD.VERSION}.`,
      '% Coordinates are measured from the top-left corner of the paper (x right, y up, so y is negative on the page).',
      '\\documentclass[10pt]{article}',
      `\\usepackage[${geometryOpts(P)}]{geometry}`,
      '\\usepackage{amsmath, amssymb}',
      '\\usepackage{xcolor}',
      ...pre,
      '\\usepackage{eso-pic}',
      ...mathStyleLines(body, X),
      ...defs,
      ...X.preDefs,
      '\\newsavebox{\\tdpage}',
      '\\pagestyle{empty}',
      '',
      '\\begin{document}',
      ...body,
      '\\end{document}',
      '',
    ].join('\n');
  };

  // ---------- view ----------
  let editingIdx = -1, relayT: any;
  const doc = () => app.state.doc;
  const diagramCount = () => doc().blocks.filter((b: any) => b.type === 'diagram').length;
  const SIZE_EM: Record<string, any> = { tiny: 0.5, scriptsize: 0.7, footnotesize: 0.8, small: 0.9, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.488 };
  const ic = (d: any, extra = '') => `<svg viewBox="0 0 20 20"${extra}><path d="${d}"/></svg>`;
  const TRASH = 'M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12'; // the app's one trash icon
  const I: Record<string, any> = {
    left: 'M3 5h14M3 8.5h9M3 12h14M3 15.5h9', center: 'M3 5h14M5.5 8.5h9M3 12h14M5.5 15.5h9', right: 'M3 5h14M8 8.5h9M3 12h14M8 15.5h9', justify: 'M3 5h14M3 8.5h14M3 12h14M3 15.5h14',
    ul: 'M8 5.5h9M8 10h9M8 14.5h9M4 5.5h.01M4 10h.01M4 14.5h.01', ol: 'M8 5.5h9M8 10h9M8 14.5h9M3.5 4l1-.5v4M3.2 12.2c.4-.6 1.8-.6 1.8.3 0 .7-1.8 1.4-1.8 2.2H5',
    chk: 'M3 4h4v4H3zM3.8 13.5l1.2 1.2 2.2-2.6M10 6h7M10 14h7', link: 'M8.5 11.5l3-3M7 9.5L5.2 11.3a2.5 2.5 0 003.5 3.5L10.5 13M13 10.5l1.8-1.8a2.5 2.5 0 00-3.5-3.5L9.5 7',
    math: 'M4 15l2.5-10L9 15M5 11h3M11 7l5 7M16 7l-5 7',
  };
  function insertBar(i: any) {
    return `<div class="ins" data-at="${i}"><button data-add="text">${esc(t('doc.add.text', '+ Text'))}</button><button data-add="diagram">${esc(t('doc.add.diagram', '+ Diagram'))}</button><button data-add="table">${esc(t('doc.add.table', '+ Table'))}</button><button data-add="image">${esc(t('doc.add.image', '+ Image'))}</button></div>`;
  }
  // Formatting bar over the text block being edited (the source stays LaTeX-flavoured text).
  // LaTeX's size commands, named for the menu (the command itself is in the menu's tip)
  const SIZE_NAME = (): Record<string, string> => ({ tiny: t('table.size.tiny', 'Tiny'), scriptsize: t('table.size.script', 'Script'), footnotesize: t('table.size.footnote', 'Footnote'), small: t('table.size.small', 'Small'), normalsize: t('ui.normal', 'Normal'), large: t('table.size.large', 'Large'), Large: t('table.size.larger', 'Larger'), LARGE: t('doc.size.largest', 'Largest'), huge: t('quick.size.huge', 'Huge'), Huge: t('doc.size.huger', 'Huger') });
  function textBar(b: any) {
    const al = b.align || 'justify', sz = b.size || 'normalsize';
    const names = SIZE_NAME();
    return `<div class="fmt-bar" role="toolbar" aria-label="${esc(t('doc.fmt.aria', 'Text formatting'))}">
      <select data-fmt="head" title="${esc(t('doc.fmt.style', 'Paragraph style'))}"><option value="">${esc(t('doc.fmt.paragraph', 'Paragraph'))}</option><option value="#">${esc(t('doc.fmt.section', 'Section'))}</option><option value="##">${esc(t('doc.fmt.subsection', 'Subsection'))}</option><option value="###">${esc(t('doc.fmt.subsubsection', 'Subsubsection'))}</option></select>
      <select data-fmt="size" title="${esc(t('doc.fmt.size', 'Font size of this block ({cmd})', { cmd: '\\' + sz }))}">${TD.SIZES.map(([k]: any) => `<option value="${k}"${k === sz ? ' selected' : ''}>${esc(names[k] || k)}</option>`).join('')}</select>
      <span class="sep"></span>
      <button data-fmt="b" title="${esc(t('doc.fmt.bold', 'Bold (⌘B) — \\textbf'))}"><b>B</b></button><button data-fmt="i" title="${esc(t('doc.fmt.italic', 'Italic (⌘I) — \\textit'))}"><i>I</i></button>
      <button data-fmt="u" title="${esc(t('doc.fmt.underline', 'Underline (⌘U) — \\underline'))}"><u>U</u></button><button data-fmt="s" title="${esc(t('doc.fmt.strike', 'Strikethrough — \\sout'))}"><s>S</s></button>
      <button type="button" class="fmt-col" data-fpick="color" title="${esc(t('doc.fmt.colour', 'Text colour — \\textcolor'))}"><span class="glyph" style="border-bottom-color:${esc(TD.texColor.swatch(fmtColor))}">A</span></button>
      <button type="button" class="fmt-col" data-fpick="hl" title="${esc(t('doc.fmt.highlight', 'Highlight — \\colorbox'))}"><span class="glyph hl" style="background:${esc(TD.texColor.swatch(fmtHl))}">ab</span></button>
      <button data-fmt="link" title="${esc(t('doc.fmt.link', 'Link — \\href'))}">${ic(I.link)}</button><button data-fmt="math" title="${esc(t('doc.fmt.math', 'Inline maths $…$'))}">${ic(I.math)}</button>
      <span class="sep"></span>
      <button data-fmt="ul" title="${esc(t('doc.fmt.ul', 'Bulleted list (- item)'))}">${ic(I.ul)}</button><button data-fmt="ol" title="${esc(t('doc.fmt.ol', 'Numbered list (1. item)'))}">${ic(I.ol)}</button><button data-fmt="chk" title="${esc(t('doc.fmt.chk', 'Checklist (- [ ] item)'))}">${ic(I.chk)}</button>
      <span class="sep"></span>
      ${['justify', 'left', 'center', 'right'].map((a) => `<button data-fmt="al:${a}" class="${a === al ? 'on' : ''}" title="${esc(({ justify: t('doc.fmt.justify', 'Justified (LaTeX default)'), left: t('doc.fmt.left', 'Align left'), center: t('doc.fmt.center', 'Align center'), right: t('doc.fmt.right', 'Align right') } as Record<string, string>)[a])}">${ic(I[a])}</button>`).join('')}
    </div>`;
  }
  function tableBar(b: any) {
    const R = b.rows || [[]], nr = R.length, nc = Math.max(1, ...R.map((r: any) => r.length)), al = b.colAlign || 'c', hdr = b.header !== false;
    // c: the captions — the group's name, the − and + buttons' tips and names
    const step = (k: any, n: any, c: { name: string; less: string; fewer: string; add: string; more: string }) => `<span class="fmt-lbl">${esc(c.name)}</span><span class="fmt-step" role="group" aria-label="${esc(c.name)}">
        <button data-tb="${k}-" title="${esc(c.less)}" aria-label="${esc(c.fewer)}"${n < 2 ? ' disabled' : ''}>${ic('M5 10h10')}</button><output>${n}</output><button data-tb="${k}+" title="${esc(c.add)}" aria-label="${esc(c.more)}">${ic('M10 5v10M5 10h10')}</button></span>`;
    return `<div class="fmt-bar" role="toolbar" aria-label="${esc(t('ui.table', 'Table'))}">
      ${step('row', nr, { name: t('doc.tb.rows', 'Rows'), less: t('doc.tb.rowLess', 'Remove the last row'), fewer: t('doc.tb.rowFewer', 'Fewer rows'), add: t('doc.tb.rowAdd', 'Add a row'), more: t('doc.tb.rowMore', 'More rows') })}${step('col', nc, { name: t('doc.tb.cols', 'Columns'), less: t('doc.tb.colLess', 'Remove the last column'), fewer: t('doc.tb.colFewer', 'Fewer columns'), add: t('doc.tb.colAdd', 'Add a column'), more: t('doc.tb.colMore', 'More columns') })}
      <span class="sep"></span>
      <button data-tb="hdr" class="txt${hdr ? ' on' : ''}" aria-pressed="${hdr}" title="${esc(t('doc.tb.headerTip', 'Set the first row as a header (bold, with a rule under it)'))}">${esc(t('doc.tb.header', 'Header row'))}</button>
      <span class="sep"></span>
      ${[['l', 'left'], ['c', 'center'], ['r', 'right']].map(([k, n]) => `<button data-tb="al:${k}" class="${k === al ? 'on' : ''}" aria-pressed="${k === al}" title="${esc(({ left: t('doc.tb.alLeft', 'Align columns left'), center: t('doc.tb.alCenter', 'Align columns center'), right: t('doc.tb.alRight', 'Align columns right') } as Record<string, string>)[n])}">${ic(I[n])}</button>`).join('')}
      <select data-tb="borders" title="${esc(t('table.rules', 'Rules'))}"><option value="all"${b.borders === 'all' ? ' selected' : ''}>${esc(t('table.border.all', 'All borders'))}</option><option value="header"${b.borders === 'header' ? ' selected' : ''}>${esc(t('doc.tb.headerRules', 'Top, header, bottom'))}</option><option value="none"${b.borders === 'none' ? ' selected' : ''}>${esc(t('table.border.none', 'No borders'))}</option></select>
    </div>`;
  }
  function imageBar(b: any) {
    return `<div class="fmt-bar" role="toolbar" aria-label="${esc(t('doc.img.aria', 'Image'))}">
      <label class="rng" title="${esc(t('doc.img.widthTip', 'Width as a share of the text width'))}">${esc(t('ui.width', 'Width'))} <input type="range" data-im="width" min="0.1" max="1" step="0.05" value="${b.width || 0.6}"><output>${Math.round((b.width || 0.6) * 100)}%</output></label>
      <span class="sep"></span>
      <input type="text" data-im="caption" placeholder="${esc(t('doc.img.caption', 'Caption (optional)'))}" value="${esc(b.caption || '')}">
      <button data-im="replace" class="txt">${esc(t('ui.replace', 'Replace…'))}</button><button data-im="download" class="txt" title="${esc(t('doc.img.saveTip', 'Save the picture next to your .tex, under this name'))}">${esc(t('doc.img.save', 'Save {name}', { name: imageName(b, doc().blocks.indexOf(b)) }))}</button>
    </div>`;
  }
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
    if (scrollbarSpace() && app.state.mode === 'document' && zoomMode === 'fit') layoutPage(TD.pageSize(doc().page));
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
    return `width:${P.W}cm;min-height:${P.H}cm;padding:${P.mt}cm ${P.mr}cm ${P.mb}cm ${P.ml}cm;font-size:${P.font}pt;--spread:${+P.spread || 1}`;
  }
  // forPrint: no editing chrome. ctx: { export } — used by the HTML export.
  function pageHtml(forPrint: any) {
    const d = doc();
    const P = TD.pageSize(d.page);
    const tctx = { sec: [0, 0, 0], numbered: !!P.numbered };
    let fig = 0;
    let h = `<div class="doc-page" style="${pageStyle(P)}"><div class="cm-probe"></div>${P.title ? `<h1 class="doc-title">${esc(d.name || 'Untitled')}</h1>` : ''}`;
    d.blocks.forEach((b: any, i: any) => {
      if (!forPrint) h += insertBar(i);
      const ed = i === editingIdx && !forPrint;
      const tools = forPrint ? '' : `<div class="blk-tools">
        <button data-mv="-1" title="${esc(t('doc.blk.up', 'Move up'))}" aria-label="${esc(t('doc.blk.up', 'Move up'))}"${i === 0 ? ' disabled' : ''}>${ic('M5.5 12.5L10 8l4.5 4.5')}</button>
        <button data-mv="1" title="${esc(t('doc.blk.down', 'Move down'))}" aria-label="${esc(t('doc.blk.down', 'Move down'))}"${i === d.blocks.length - 1 ? ' disabled' : ''}>${ic('M5.5 8l4.5 4.5L14.5 8')}</button>
        ${b.type === 'diagram' ? `<button data-edit title="${esc(t('doc.blk.editTip', 'Edit on canvas'))}">${esc(t('ui.edit', 'Edit'))}</button>` : ''}
        <button data-rm title="${esc(t('doc.blk.delete', 'Delete block'))}" aria-label="${esc(t('doc.blk.delete', 'Delete block'))}"${b.type === 'diagram' && diagramCount() < 2 ? ' disabled' : ''}>${ic(TRASH)}</button></div>`;
      const edc = ed ? ' editing' : '';
      if (b.type === 'text') {
        const st = `text-align:${b.align || 'justify'}${b.size && b.size !== 'normalsize' ? `;font-size:${SIZE_EM[b.size]}em` : ''}`;
        h += `<div class="blk blk-text${edc}" data-i="${i}">${tools}${ed
          ? `${textBar(b)}<textarea class="blk-ed" spellcheck="true" placeholder="${esc(t('doc.text.ph', 'Write text. $x^2$ for math, $$…$$ for display math, # Section, - bullet, 1. numbered, - [ ] checkbox'))}">${esc(b.text || '')}</textarea>`
          : `<div class="blk-body" style="${st}">${textToHtml(b.text || '', tctx)}</div>`}</div>`;
        if (ed) textToHtml(b.text || '', tctx); // keep section numbers counting
      } else if (b.type === 'table') {
        h += `<div class="blk blk-table${edc}" data-i="${i}">${tools}${ed ? tableBar(b) : ''}<div class="blk-body">${tableHtml(b, ed)}</div></div>`;
      } else if (b.type === 'image') {
        const cap = b.caption && b.caption.trim() ? `<figcaption>Figure ${++fig}: ${inl(b.caption)}</figcaption>` : '';
        h += `<div class="blk blk-image${edc}" data-i="${i}">${tools}${ed ? imageBar(b) : ''}<figure class="blk-body">${b.src ? `<img src="${esc(b.src)}" alt="${esc(b.caption || b.name || '')}" style="width:${(b.width || 0.6) * 100}%">` : `<div class="ph">${forPrint ? 'No picture' : esc(t('doc.img.none', 'No picture'))}</div>`}${cap}</figure></div>`;
      } else {
        const svg = b.shapes.length ? app.shapesSvg(b.shapes, 6, false, !forPrint) : '';
        h += `<div class="blk blk-diag${i === d.active && !forPrint ? ' active' : ''}" data-i="${i}">${tools}<div class="blk-body">${svg || (forPrint ? '' : `<div class="ph">${esc(t('doc.diag.empty', 'Empty diagram — double-click to draw'))}</div>`)}</div></div>`;
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
    title.textContent = doc().name || 'Untitled';
    if (app.state.mode === 'document') layoutPage(TD.pageSize(doc().page));
  }

  function render(forPrint?: any): void {
    if (!forPrint && !TD.math.previewing) return TD.math.preview(() => render());
    if (forPrint && !TD.math.finalizing) return TD.math.synchronous(() => render(true));
    const { h: page, P } = pageHtml(forPrint);
    let h = forPrint ? page : `<div class="doc-sheet">${page}</div>`;
    if (!forPrint) h += `<div class="doc-hud"><span class="pg-info"></span><button data-zoom="out" title="${esc(t('doc.zoom.outTip', 'Zoom out (Ctrl/⌘ −)'))}" aria-label="${esc(t('doc.zoom.out', 'Zoom out'))}">−</button><button data-zoom="in" title="${esc(t('doc.zoom.inTip', 'Zoom in (Ctrl/⌘ +)'))}" aria-label="${esc(t('doc.zoom.in', 'Zoom in'))}">+</button><button data-zoom="fit"${zoomMode === 'fit' ? ' class="on"' : ''} title="${esc(t('doc.zoom.fitTip', "Fit the page's width to the view"))}">${esc(t('ui.fit.width', 'Fit Width'))}</button><button data-zoom="1"${(zoomMode as any) === 1 ? ' class="on"' : ''} title="${esc(t('doc.zoom.actualTip', 'Actual size (Ctrl/⌘ 0)'))}">100%</button></div>`;
    sheetObserver.disconnect();
    root!.innerHTML = h;
    if (forPrint) labelResources.clear(root!); else labelResources.update(root!);
    sizeDiagrams(root);
    printStyle(P);
    layoutPage(P, forPrint);
    if (!forPrint) sheetObserver.observe(root!.querySelector('.doc-page')!);
    if (!forPrint) requestAnimationFrame(() => layoutPage(P)); // after the side panel has laid out
    const ta = root!.querySelector('.blk-ed');
    if (ta) { autosize(ta); (ta as HTMLElement).focus({ preventScroll: true }); }
  }
  // Re-render after a block opens or closes for editing, keeping the block that was clicked (or, from the
  // keyboard, the one that was being edited) where it was on screen, so the page doesn't jump.
  let lastPt: any = null;
  root!.addEventListener('pointerdown', (e) => { lastPt = { x: e.clientX, y: e.clientY }; }, true);
  function renderKeep(prev: any, fromKey?: any) {
    const el = !fromKey && lastPt && document.elementFromPoint(lastPt.x, lastPt.y);
    const hit = el && el.closest && el.closest('#docview .blk');
    const i = hit ? +hit.dataset.i : prev;
    const at = () => (i >= 0 ? root!.querySelector(`.blk[data-i="${i}"]`) : null);
    const before = at()?.getBoundingClientRect().top, st = root!.scrollTop;
    render();
    root!.scrollTop = st;
    const after = at()?.getBoundingClientRect().top;
    if (before != null && after != null) root!.scrollTop += after - before;
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
    scrollbarSpace();
    // the width beside the side panel (the view's padding keeps clear of it), less a margin
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
    for (const tools of page.querySelectorAll<HTMLElement>('.blk-tools')) tools.style.setProperty('--unzoom', String(1 / z));
    const n = size.pages;
    const info = root!.querySelector('.pg-info');
    if (info) info.textContent = t('doc.pageInfo', '{paper} · {pages} (approx.) · {zoom}%', { paper: TD.PAPERS[P.paper]?.name || t('ui.custom', 'Custom'), pages: n > 1 ? t('doc.pages', '{n} pages', { n }) : t('doc.page1', '{n} page', { n }), zoom: Math.round((z as any) * 100) });
  }
  window.addEventListener('resize', () => { if (app.state.mode === 'document' && zoomMode === 'fit') layoutPage(TD.pageSize(doc().page)); });
  root!.addEventListener('load', () => { if (app.state.mode === 'document') layoutPage(TD.pageSize(doc().page)); }, true);
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
    root!.querySelectorAll('.doc-hud [data-zoom]').forEach((b) => b.classList.toggle('on', (b as HTMLElement).dataset.zoom === String(zoomMode)));
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
    renderView(el, DocumentSettings, { page, wide, papers: Object.entries<any>(TD.PAPERS).map(([key, value]) => ({ key, name: key === 'custom' ? t('page.paper.custom', 'Custom') : value.name })) });
  }
  function setPage(patch: any) {
    const d = doc();
    d.page = { ...TD.PAGE_DEFAULT, ...d.page, ...patch };
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
  });

  const autosize = (ta: any) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 4 + 'px'; };

  function changed() { app.scheduleSave(); }
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
    if (f === 'b') wrapSel(ta, '\\textbf{', '}');
    else if (f === 'i') wrapSel(ta, '\\textit{', '}');
    else if (f === 'u') wrapSel(ta, '\\underline{', '}');
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
      root!.querySelectorAll('.editing [data-fmt^="al:"]').forEach((x) => x.classList.toggle('on', (x as HTMLElement).dataset.fmt === f));
      changed(); ta.focus();
    } else if (f === 'size') { b.size = val === 'normalsize' ? undefined : val; changed(); ta.focus(); }
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
      }, (err) => app.showHint?.(t('doc.img.openFailed', "Couldn't open {name}: {error}", { name: f.name, error: err.message }), 2500));
    };
    inp.click();
  }

  root!.addEventListener('mousedown', (e) => {
    // toolbar buttons must not take focus from the text being edited
    if ((e.target! as Element).closest('.fmt-bar button')) e.preventDefault();
  });
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
      if (b.type === 'diagram' && b.shapes.length) {
        TD.confirm(t('doc.diag.deleteTitle', 'Delete this diagram?'), b.shapes.length > 1 ? t('doc.diag.deleteMany', 'Its {n} objects will be deleted too.', { n: b.shapes.length }) : t('doc.diag.deleteOne', 'Its 1 object will be deleted too.'), { ok: t('ui.delete', 'Delete'), danger: true }).then((yes) => { if (yes) remove(); });
      } else remove();
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
    const fp = (e.target! as Element).closest('button[data-fpick]');
    if (fp) {
      // the shared picker with xcolor's names; the chosen colour wraps the selection when the picker closes
      const f = (fp as HTMLElement).dataset.fpick, ta = blk.querySelector('.blk-ed'), glyph = fp.querySelector('.glyph');
      let picked: any = null;
      const show = (v: any) => { const c = TD.texColor.swatch(v); if (f === 'color') (glyph! as any).style.borderBottomColor = c; else (glyph! as any).style.background = c; };
      TD.openColorPicker(fp, { value: TD.tikzColor(f === 'color' ? fmtColor : fmtHl), tex: true,
        onInput: (v: any) => show(TD.texColor.spec(v)), onChange: (v: any) => { picked = TD.texColor.spec(v); show(picked); },
        onClose: () => { if (picked) fmtAction(ta, f, picked); } });
      return;
    }
    const fb = (e.target! as Element).closest('[data-fmt]');
    if (fb && fb.tagName === 'BUTTON') { fmtAction(blk.querySelector('.blk-ed'), (fb as HTMLElement).dataset.fmt); return; }
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
    const t = e.target, blk = (t! as Element).closest('.blk');
    if (!blk) return;
    const b = doc().blocks[+(blk as HTMLElement).dataset.i!];
    if ((t! as HTMLElement).dataset.fmt) { fmtAction(blk.querySelector('.blk-ed'), (t! as HTMLElement).dataset.fmt, (t! as HTMLInputElement).value); if ((t! as HTMLElement).dataset.fmt === 'head') (t! as HTMLInputElement).value = ''; return; }
    if ((t! as HTMLElement).dataset.tb) { b[((t! as HTMLElement).dataset.tb as any)] = (t! as any).type === 'checkbox' ? (t! as HTMLInputElement).checked : (t! as HTMLInputElement).value; changed(); render(); return; }
    if ((t! as HTMLElement).dataset.im === 'caption') { b.caption = (t! as HTMLInputElement).value; changed(); }
  });
  root!.addEventListener('dblclick', (e) => {
    const blk = (e.target! as Element).closest('.blk-diag');
    if (blk && !(e.target! as Element).closest('.blk-tools')) openDiagram(+(blk as HTMLElement).dataset.i!);
  });
  function openDiagram(i: any) {
    app.setActiveBlock(i);
    app.setMode('diagram');
    requestAnimationFrame(() => app.zoomFit());
  }
  const relayout = () => { clearTimeout(relayT); relayT = setTimeout(() => layoutPage(TD.pageSize(doc().page)), 400); };
  root!.addEventListener('input', (e) => {
    const t = e.target, b = doc().blocks[editingIdx];
    if (!b) return;
    if ((t! as Element).classList.contains('blk-ed')) { b.text = (t! as HTMLInputElement).value; autosize(t); changed(); relayout(); return; }
    if ((t! as Element).classList.contains('cell')) { const r = +(t! as HTMLElement).dataset.r!, c = +(t! as HTMLElement).dataset.c!; while (b.rows[r].length <= c) b.rows[r].push(''); b.rows[r][c] = (t! as HTMLInputElement).value; changed(); return; }
    if ((t! as HTMLElement).dataset.im === 'width') {
      b.width = +(t! as HTMLInputElement).value;
      const img = ((t! as Element).closest('.blk'))!.querySelector('img');
      if (img) img.style.width = b.width * 100 + '%';
      (t! as HTMLElement).nextElementSibling!.textContent = Math.round(b.width * 100) + '%';
      changed(); relayout();
    }
  });
  // Leaving the block being edited (by mouse or keyboard) shows its rendered form again.
  function leaveIfOutside(el: any) {
    if (editingIdx < 0) return;
    const cur = root!.querySelector('.blk.editing');
    if (cur && el && cur.contains(el)) return;
    // pressing on another text / table / image block opens that one straight away
    const nb = el && el.closest && !el.closest('.blk-tools, .cbx, a[href]') && el.closest('.blk-text, .blk-table, .blk-image');
    const was = editingIdx;
    editingIdx = nb ? +nb.dataset.i : -1;
    renderKeep(was);
  }
  root!.addEventListener('focusout', (e) => {
    if (!(e.target! as Element).closest('.blk.editing')) return;
    setTimeout(() => { if (document.activeElement && document.activeElement !== document.body) leaveIfOutside(document.activeElement); }, 0);
  });
  document.addEventListener('pointerdown', (e) => {
    if (editingIdx < 0 || app.state.mode !== 'document') return;
    if ((e.target! as Element).closest('.blk.editing') || (e.target! as Element).closest('.tc-pop, .texcomplete, .ddpop, .td-dialog')) return;
    if (!root!.contains((e.target as Node)) && !(e.target! as Element).closest('#docview')) return;
    setTimeout(() => leaveIfOutside((e.target! as HTMLElement).isConnected ? e.target : null), 0);
  }, true);
  root!.addEventListener('keydown', (e) => {
    const t = e.target;
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
  // Where each maths stylesheet lives (vendor/). Fonts are only ever embedded from these local copies.
  const MATH_CSS = 'vendor/katex/katex.min.css';
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
    const cssUrl = MATH_CSS;
    let css = await mathCssText(cssUrl);
    if (!css) { TD.mathFontsLinked = -1; return ''; }
    const base = cssUrl.slice(0, cssUrl.lastIndexOf('/') + 1);
    const urls = [...new Set([...css.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)/g)].map((m) => m[1]))];
    let linked = 0;
    for (const u of urls) {
      const rel = u.replace(/^\.\//, '');
      let src;
      try { src = await dataUrl(base + rel, 'font/woff2'); } catch (e: any) { src = rel; linked++; }
      css = css.split(u).join(src);
    }
    TD.mathFontsLinked = linked;
    // keep only the woff2 sources
    return css.replace(/,\s*url\([^)]*\.(woff|ttf)\)\s*format\(["'](woff|truetype)["']\)/g, '');
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
.doc-page { margin: 0 auto; max-width: 100%; box-sizing: border-box; min-height: 0 !important; box-shadow: 0 1px 3px rgba(0,0,0,.08), 0 6px 20px rgba(0,0,0,.06); }
.cm-probe { display: none; }
@media (max-width: ${Math.round(P.W * 37.8)}px) { .doc-page { padding: 1.2cm 16px !important; } }
@media print { body { background: #fff; padding: 0; } .doc-page { box-shadow: none; padding: 0 !important; width: auto !important; } @page { size: ${P.W}cm ${P.H}cm; margin: ${P.mt}cm ${P.mr}cm ${P.mb}cm ${P.ml}cm; } }
</style></head>
<body>
${box.innerHTML}
</body></html>
`;
  };

  TD.docview = { render, renderProgress, beginEngineChange, cancelProgress, updateTitle, renderSettings, textToHtml, textToLatex, inl };
  // the page's editing chrome follows the interface language
  let firstLocale = true;
  onLocale(() => { if (firstLocale) { firstLocale = false; return; } if (app.state.mode === 'document') render(); });
  if (app.state.mode === 'document') { render(); app.renderProps(); }
})();
