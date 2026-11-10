// Document view: a page of text blocks (LaTeX-flavoured, $math$) with embedded diagrams,
// plus whole-document LaTeX export.
(function () {
  const TD = window.TD;
  const app = TD.app;
  const { esc } = TD.util;
  const root = document.getElementById('docview');

  // ---------- text rendering ----------
  // Text blocks are LaTeX-flavoured: $math$, $$display$$, # headings, - / 1. / - [ ] lists and a
  // handful of inline commands (\textbf, \textit, \underline, \sout, \textcolor, \colorbox, \href…).
  const katex = (src, display) => TD.math.render(src, { display });
  const colorCss = (opt, v) => (opt === 'HTML' && /^[0-9a-f]{6}$/i.test(v.trim()) ? '#' + v.trim() : /^[a-z]+$/i.test(v.trim()) ? v.trim() : '#000');
  const safeUrl = (u) => (/^(https?:|mailto:|#)/i.test(u.trim()) ? u.trim() : '#');
  const FMT = {
    textbf: [1, (a) => `<b>${inl(a[0])}</b>`],
    textit: [1, (a) => `<i>${inl(a[0])}</i>`],
    emph: [1, (a) => `<em>${inl(a[0])}</em>`],
    underline: [1, (a) => `<u>${inl(a[0])}</u>`],
    uline: [1, (a) => `<u>${inl(a[0])}</u>`],
    sout: [1, (a) => `<s>${inl(a[0])}</s>`],
    texttt: [1, (a) => `<span class="tt">${inl(a[0])}</span>`],
    textsc: [1, (a) => `<span style="font-variant:small-caps">${inl(a[0])}</span>`],
    textrm: [1, (a) => inl(a[0])],
    textcolor: [2, (a, o) => `<span style="color:${colorCss(o, a[0])}">${inl(a[1])}</span>`],
    colorbox: [2, (a, o) => `<span class="cbox" style="background:${colorCss(o, a[0])}">${inl(a[1])}</span>`],
    href: [2, (a) => `<a href="${esc(safeUrl(a[0]))}" target="_blank" rel="noopener">${inl(a[1])}</a>`],
    url: [1, (a) => `<a href="${esc(safeUrl(a[0]))}" target="_blank" rel="noopener" class="tt">${esc(a[0])}</a>`],
  };
  const WORDS = { LaTeX: 'L<sup class="la">a</sup>T<sub class="te">e</sub>X', TeX: 'T<sub class="te">e</sub>X', ldots: '…', dots: '…', textbackslash: '\\', quad: '&emsp;', qquad: '&emsp;&emsp;', S: '§', P: '¶', copyright: '©', today: new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) };
  // inline source → HTML (recursive for command arguments)
  function inl(src) {
    let out = '', i = 0;
    const n = src.length;
    const group = (j) => {
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
  const itemKind = (m) => (m[3] !== undefined ? 'chk' : /\d/.test(m[2]) ? 'ol' : 'ul');
  // section counters shared by every text block of one render / export
  function heading(level, sec, numbered) {
    if (!numbered) return '';
    sec[level - 1]++;
    for (let k = level; k < 3; k++) sec[k] = 0;
    return sec.slice(0, level).join('.') + ' ';
  }
  function textToHtml(text, ctx = { sec: [0, 0, 0] }) {
    const out = [];
    const parts = String(text).split(/\$\$([\s\S]*?)\$\$/);
    let L = 0; // line number in the block's source, for clickable checkboxes
    parts.forEach((part, pi) => {
      if (pi % 2) { out.push(`<div class="dmath">${katex(part.trim(), true)}</div>`); L += (part.match(/\n/g) || []).length; return; }
      const lines = part.split('\n');
      let para = [];
      const stack = []; // open lists: { kind, level, li }
      const flush = () => { if (para.length) out.push(`<p>${para.map(inl).join(' ')}</p>`); para = []; };
      const closeTo = (lvl) => {
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
  const escTex = (line) => TD.segments(line).map((seg) => (seg.math ? `$${TD.mathTex(seg)}$` : seg.s.replace(/(^|[^\\])([%&#])/g, '$1\\$2').replace(/(^|[^\\])([%&#])/g, '$1\\$2'))).join('');
  function textToLatex(text, ctx = {}) {
    const parts = String(text).split(/\$\$([\s\S]*?)\$\$/);
    const env = { ul: 'itemize', ol: 'enumerate', chk: 'itemize' };
    return parts.map((part, pi) => {
      if (pi % 2) return `\\[\n  ${part.trim()}\n\\]`;
      const out = [], stack = [];
      const closeTo = (lvl) => { while (stack.length && stack[stack.length - 1].level > lvl) { const t = stack.pop(); out.push('  '.repeat(t.level) + `\\end{${env[t.kind]}}`); } };
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
  // packages the inline commands in a text need
  function textPkgs(text, set) {
    if (/\\(sout|uline|uwave|xout)\b/.test(text)) set.add('[normalem]{ulem}');
    if (/\\(href|url)\b/.test(text)) set.add('{hyperref}');
  }

  const PX_PER_CM = 40;
  const diagramWidthCm = (shapes) => {
    const b = TD.bboxOf(shapes.flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; }), 0);
    return b.w / PX_PER_CM;
  };
  const cm = (v) => `${+(+v).toFixed(2)}cm`;
  function geometryOpts(P) {
    const paper = TD.PAPERS[P.paper];
    const o = paper && paper.opt ? [paper.opt] : [`paperwidth=${cm(P.W)}`, `paperheight=${cm(P.H)}`];
    if (P.orient === 'landscape' && paper && paper.opt) o.push('landscape');
    o.push(`top=${cm(P.mt)}`, `bottom=${cm(P.mb)}`, `left=${cm(P.ml)}`, `right=${cm(P.mr)}`);
    return o.join(', ');
  }
  const ALIGN_ENV = { center: 'center', right: 'flushright', left: 'flushleft' };
  // image file name used in \includegraphics (the user saves the picture under this name)
  const imageName = (b, i) => {
    const ext = ((b.src || '').match(/^data:image\/(\w+)/) || [])[1] || 'png';
    const base = (b.name || `image-${i + 1}`).replace(/\.[a-z0-9]+$/i, '').replace(/[^\w-]+/g, '-');
    return `${base}.${ext === 'jpeg' ? 'jpg' : ext === 'svg' ? 'svg' : ext}`;
  };
  function tableToLatex(b) {
    const rows = b.rows || [[]], nc = Math.max(1, ...rows.map((r) => r.length));
    const a = (b.colAlign || 'c')[0];
    const all = b.borders === 'all', hdr = b.header !== false;
    const spec = all ? '|' + Array(nc).fill(a).join('|') + '|' : Array(nc).fill(a).join('');
    const out = ['\\begin{center}', `\\begin{tabular}{${spec}}`];
    if (all || b.borders === 'header') out.push('\\hline');
    rows.forEach((r, ri) => {
      const cells = Array.from({ length: nc }, (_, ci) => {
        const t = escTex(String(r[ci] ?? ''));
        return ri === 0 && hdr && t.trim() ? `\\textbf{${t}}` : t;
      });
      out.push('  ' + cells.join(' & ') + ' \\\\' + (all || (b.borders === 'header' && (ri === 0 && hdr || ri === rows.length - 1)) ? ' \\hline' : ''));
    });
    out.push('\\end{tabular}', '\\end{center}');
    return out.join('\n');
  }
  function imageToLatex(b, i) {
    const name = imageName(b, i), w = +(b.width || 0.6).toFixed(2);
    const g = `\\includegraphics[width=${w === 1 ? '' : w}\\linewidth]{${name}}`;
    const note = `% image file: ${name} (save it next to the .tex)`;
    if (b.caption && b.caption.trim()) return [note, '\\begin{figure}[h]', '  \\centering', '  ' + g, `  \\caption{${escTex(b.caption)}}`, '\\end{figure}'].join('\n');
    return [note, '\\begin{center}', g, '\\end{center}'].join('\n');
  }
  TD.docToLatex = function (doc) {
    const X = TD.makeTikzContext();
    const P = TD.pageSize(doc.page);
    let needGraphicx = false;
    const pk = new Set();
    const body = [];
    const tctx = { numbered: !!P.numbered };
    doc.blocks.forEach((b, i) => {
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
      if (b.type === 'image') { if (b.src) { needGraphicx = true; body.push(imageToLatex(b, i), ''); } return; }
      if (!b.shapes || !b.shapes.length) return;
      X.scene = b.shapes;
      const lines = b.shapes.map((s) => TD.TYPES[s.type].tikz(s, X)).filter(Boolean);
      const data = btoa(unescape(encodeURIComponent(JSON.stringify(b.shapes.map(({ id, ...rest }) => rest)))));
      // wider than the text block: scale down to \linewidth, as the page preview does
      const wide = diagramWidthCm(b.shapes) > P.textW + 0.01;
      if (wide) needGraphicx = true;
      body.push('\\begin{center}', ...(wide ? ['\\resizebox{\\linewidth}{!}{%'] : []),
        '\\begin{tikzpicture}[x=1cm, y=1cm]', `  % diagramtex-data: ${data}`, ...lines.map((l) => '  ' + l.replace(/\n/g, '\n  ')), '\\end{tikzpicture}',
        ...(wide ? ['}'] : []), '\\end{center}', '');
    });
    const pre = TD.preamble(X);
    const defs = [...X.colors].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`);
    const extra = [...pk].filter((p) => !p.includes('hyperref')).map((p) => `\\usepackage${p}`);
    const spread = +P.spread || 1;
    return [
      `\\documentclass[${P.font}pt]{article}`,
      `\\usepackage[${geometryOpts(P)}]{geometry}`,
      '\\usepackage{amsmath, amssymb}',
      '\\usepackage{xcolor}',
      ...(needGraphicx ? ['\\usepackage{graphicx}'] : []),
      ...extra,
      ...pre,
      ...(pk.has('{hyperref}') ? ['\\usepackage{hyperref}'] : []), // hyperref goes last
      ...defs,
      ...(spread !== 1 ? [`\\linespread{${spread}}`] : []),
      '',
      ...(P.title ? [`\\title{${textToLatex(doc.name || 'Untitled')}}`, '\\date{}', ''] : []),
      '\\begin{document}',
      ...(P.title ? ['\\maketitle'] : []),
      '',
      ...body,
      '\\end{document}',
      '',
    ].join('\n');
  };

  // Page mode: every object keeps its exact place on the paper. Each page is one overlay
  // tikzpicture anchored at the page's top-left corner (needs two LaTeX runs: remember picture).
  TD.pageToLatex = function (doc, { only } = {}) {
    const X = TD.makeTikzContext();
    const P = TD.pageSize(doc.page);
    const h = P.H * PX_PER_CM, gap = PX_PER_CM, n = Math.max(1, doc.sheet.pages | 0);
    const pages = Array.from({ length: n }, () => []);
    for (const s of only || doc.sheet.shapes) {
      const b = TD.bbox(s);
      pages[Math.max(0, Math.min(n - 1, Math.floor((b.y + b.h / 2) / (h + gap))))].push(s);
    }
    const body = [];
    pages.forEach((list, k) => {
      if (k) body.push('\\newpage', '');
      const copies = list.map((s) => {
        const c = JSON.parse(JSON.stringify(s));
        if (k) TD.translate(c, 0, -k * (h + gap));
        return c;
      });
      X.scene = copies;
      const lines = copies.map((c) => TD.TYPES[c.type].tikz(c, X)).filter(Boolean);
      body.push(`% ---- page ${k + 1} ----`, '\\noindent',
        '\\begin{tikzpicture}[remember picture, overlay, x=1cm, y=1cm, shift={(current page.north west)}]',
        ...lines.map((l) => '  ' + l.replace(/\n/g, '\n  ')), '\\end{tikzpicture}', '');
    });
    const pre = TD.preamble(X);
    const defs = [...X.colors].map(([hex, name]) => `\\definecolor{${name}}{HTML}{${hex.slice(1).toUpperCase()}}`);
    if (X.decls) for (const d of X.decls.values()) defs.push(d.decl);
    return [
      `% ${doc.name || 'Untitled'}: free-form page from DiagramTeX ${TD.VERSION}.`,
      '% Coordinates are measured from the top-left corner of the paper (x right, y up, so y is negative on the page).',
      '% Compile twice: the pictures use "remember picture" to find the page corner.',
      '\\documentclass[10pt]{article}',
      `\\usepackage[${geometryOpts(P)}]{geometry}`,
      '\\usepackage{amsmath, amssymb}',
      '\\usepackage{xcolor}',
      ...pre,
      ...defs,
      '\\pagestyle{empty}',
      '',
      '\\begin{document}',
      ...body,
      '\\end{document}',
      '',
    ].join('\n');
  };

  // ---------- view ----------
  let editingIdx = -1, relayT;
  const doc = () => app.state.doc;
  const diagramCount = () => doc().blocks.filter((b) => b.type === 'diagram').length;
  const SIZE_EM = { tiny: 0.5, scriptsize: 0.7, footnotesize: 0.8, small: 0.9, normalsize: 1, large: 1.2, Large: 1.44, LARGE: 1.728, huge: 2.074, Huge: 2.488 };
  const ic = (d, extra = '') => `<svg viewBox="0 0 20 20"${extra}><path d="${d}"/></svg>`;
  const I = {
    left: 'M3 5h14M3 8.5h9M3 12h14M3 15.5h9', center: 'M3 5h14M5.5 8.5h9M3 12h14M5.5 15.5h9', right: 'M3 5h14M8 8.5h9M3 12h14M8 15.5h9', justify: 'M3 5h14M3 8.5h14M3 12h14M3 15.5h14',
    ul: 'M8 5.5h9M8 10h9M8 14.5h9M4 5.5h.01M4 10h.01M4 14.5h.01', ol: 'M8 5.5h9M8 10h9M8 14.5h9M3.5 4l1-.5v4M3.2 12.2c.4-.6 1.8-.6 1.8.3 0 .7-1.8 1.4-1.8 2.2H5',
    chk: 'M3 4h4v4H3zM3.8 13.5l1.2 1.2 2.2-2.6M10 6h7M10 14h7', link: 'M8.5 11.5l3-3M7 9.5L5.2 11.3a2.5 2.5 0 003.5 3.5L10.5 13M13 10.5l1.8-1.8a2.5 2.5 0 00-3.5-3.5L9.5 7',
    math: 'M4 15l2.5-10L9 15M5 11h3M11 7l5 7M16 7l-5 7',
  };
  function insertBar(i) {
    return `<div class="ins" data-at="${i}"><button data-add="text">+ Text</button><button data-add="diagram">+ Diagram</button><button data-add="table">+ Table</button><button data-add="image">+ Image</button></div>`;
  }
  // Formatting bar over the text block being edited (the source stays LaTeX-flavoured text).
  function textBar(b) {
    const al = b.align || 'justify', sz = b.size || 'normalsize';
    return `<div class="fmt-bar" role="toolbar" aria-label="Text formatting">
      <select data-fmt="head" title="Paragraph style"><option value="">Paragraph</option><option value="#">Section</option><option value="##">Subsection</option><option value="###">Subsubsection</option></select>
      <span class="sep"></span>
      <button data-fmt="b" title="Bold (⌘B) — \\textbf"><b>B</b></button><button data-fmt="i" title="Italic (⌘I) — \\textit"><i>I</i></button>
      <button data-fmt="u" title="Underline (⌘U) — \\underline"><u>U</u></button><button data-fmt="s" title="Strikethrough — \\sout"><s>S</s></button>
      <label class="fmt-col" title="Text colour — \\textcolor"><span class="glyph" style="border-bottom-color:${esc(fmtColor)}">A</span><input type="color" data-fmt="color" value="${esc(fmtColor)}"></label>
      <label class="fmt-col" title="Highlight — \\colorbox"><span class="glyph hl" style="background:${esc(fmtHl)}">ab</span><input type="color" data-fmt="hl" value="${esc(fmtHl)}"></label>
      <button data-fmt="link" title="Link — \\href">${ic(I.link)}</button><button data-fmt="math" title="Inline maths $…$">${ic(I.math)}</button>
      <span class="sep"></span>
      <button data-fmt="ul" title="Bulleted list (- item)">${ic(I.ul)}</button><button data-fmt="ol" title="Numbered list (1. item)">${ic(I.ol)}</button><button data-fmt="chk" title="Checklist (- [ ] item)">${ic(I.chk)}</button>
      <span class="sep"></span>
      ${['justify', 'left', 'center', 'right'].map((a) => `<button data-fmt="al:${a}" class="${a === al ? 'on' : ''}" title="${a === 'justify' ? 'Justified (LaTeX default)' : 'Align ' + a}">${ic(I[a])}</button>`).join('')}
      <select data-fmt="size" title="Font size of this block">${TD.SIZES.map(([k]) => `<option value="${k}"${k === sz ? ' selected' : ''}>${k}</option>`).join('')}</select>
    </div>`;
  }
  function tableBar(b) {
    return `<div class="fmt-bar" role="toolbar" aria-label="Table">
      <button data-tb="row+" title="Add row">+ Row</button><button data-tb="row-" title="Remove last row"${(b.rows || []).length < 2 ? ' disabled' : ''}>− Row</button>
      <button data-tb="col+" title="Add column">+ Column</button><button data-tb="col-" title="Remove last column"${(b.rows[0] || []).length < 2 ? ' disabled' : ''}>− Column</button>
      <span class="sep"></span>
      <label class="chk"><input type="checkbox" data-tb="header"${b.header !== false ? ' checked' : ''}> Header row</label>
      <select data-tb="borders" title="Rules"><option value="all"${b.borders === 'all' ? ' selected' : ''}>All borders</option><option value="header"${b.borders === 'header' ? ' selected' : ''}>Top, header, bottom</option><option value="none"${b.borders === 'none' ? ' selected' : ''}>No borders</option></select>
      <select data-tb="colAlign" title="Column alignment"><option value="l"${b.colAlign === 'l' ? ' selected' : ''}>Left</option><option value="c"${(b.colAlign || 'c') === 'c' ? ' selected' : ''}>Centre</option><option value="r"${b.colAlign === 'r' ? ' selected' : ''}>Right</option></select>
    </div>`;
  }
  function imageBar(b) {
    return `<div class="fmt-bar" role="toolbar" aria-label="Image">
      <label class="rng" title="Width as a share of the text width">Width <input type="range" data-im="width" min="0.1" max="1" step="0.05" value="${b.width || 0.6}"><output>${Math.round((b.width || 0.6) * 100)}%</output></label>
      <span class="sep"></span>
      <input type="text" data-im="caption" placeholder="Caption (optional)" value="${esc(b.caption || '')}">
      <button data-im="replace">Replace…</button><button data-im="download" title="Save the picture next to your .tex, under this name">Save ${esc(imageName(b, doc().blocks.indexOf(b)))}</button>
    </div>`;
  }
  const tableHtml = (b, editing) => {
    const rows = b.rows || [[]], nc = Math.max(1, ...rows.map((r) => r.length));
    const al = { l: 'left', c: 'center', r: 'right' }[b.colAlign || 'c'];
    const cls = `dtab b-${b.borders || 'all'}${b.header !== false ? ' hdr' : ''}`;
    return `<table class="${cls}" style="--al:${al}">${rows.map((r, ri) => `<tr>${Array.from({ length: nc }, (_, ci) => {
      const v = r[ci] ?? '';
      return `<td>${editing ? `<input class="cell" data-r="${ri}" data-c="${ci}" value="${esc(v)}" spellcheck="false">` : inl(v) || '&nbsp;'}</td>`;
    }).join('')}</tr>`).join('')}</table>`;
  };
  let fmtColor = '#c0392b', fmtHl = '#fff3a3';
  let zoomMode = 'fit'; // 'fit' | 1
  function pageStyle(P) {
    return `width:${P.W}cm;min-height:${P.H}cm;padding:${P.mt}cm ${P.mr}cm ${P.mb}cm ${P.ml}cm;font-size:${P.font}pt;--spread:${+P.spread || 1}`;
  }
  // forPrint: no editing chrome. ctx: { export } — used by the HTML export.
  function pageHtml(forPrint) {
    const d = doc();
    const P = TD.pageSize(d.page);
    const tctx = { sec: [0, 0, 0], numbered: !!P.numbered };
    let fig = 0;
    let h = `<div class="doc-page" style="${pageStyle(P)}"><div class="cm-probe"></div>${P.title ? `<h1 class="doc-title">${esc(d.name || 'Untitled')}</h1>` : ''}`;
    d.blocks.forEach((b, i) => {
      if (!forPrint) h += insertBar(i);
      const ed = i === editingIdx && !forPrint;
      const tools = forPrint ? '' : `<div class="blk-tools">
        <button data-mv="-1" title="Move up"${i === 0 ? ' disabled' : ''}>↑</button>
        <button data-mv="1" title="Move down"${i === d.blocks.length - 1 ? ' disabled' : ''}>↓</button>
        ${b.type === 'diagram' ? '<button data-edit title="Edit on canvas">Edit</button>' : ''}
        <button data-rm title="Delete block"${b.type === 'diagram' && diagramCount() < 2 ? ' disabled' : ''}>✕</button></div>`;
      const edc = ed ? ' editing' : '';
      if (b.type === 'text') {
        const st = `text-align:${b.align || 'justify'}${b.size && b.size !== 'normalsize' ? `;font-size:${SIZE_EM[b.size]}em` : ''}`;
        h += `<div class="blk blk-text${edc}" data-i="${i}">${tools}${ed
          ? `${textBar(b)}<textarea class="blk-ed" spellcheck="true" placeholder="Write text. $x^2$ for math, $$…$$ for display math, # Section, - bullet, 1. numbered, - [ ] checkbox">${esc(b.text || '')}</textarea>`
          : `<div class="blk-body" style="${st}">${textToHtml(b.text || '', tctx)}</div>`}</div>`;
        if (ed) textToHtml(b.text || '', tctx); // keep section numbers counting
      } else if (b.type === 'table') {
        h += `<div class="blk blk-table${edc}" data-i="${i}">${tools}${ed ? tableBar(b) : ''}<div class="blk-body">${tableHtml(b, ed)}</div></div>`;
      } else if (b.type === 'image') {
        const cap = b.caption && b.caption.trim() ? `<figcaption>Figure ${++fig}: ${inl(b.caption)}</figcaption>` : '';
        h += `<div class="blk blk-image${edc}" data-i="${i}">${tools}${ed ? imageBar(b) : ''}<figure class="blk-body">${b.src ? `<img src="${esc(b.src)}" alt="${esc(b.caption || b.name || '')}" style="width:${(b.width || 0.6) * 100}%">` : '<div class="ph">No picture</div>'}${cap}</figure></div>`;
      } else {
        const svg = b.shapes.length ? app.shapesSvg(b.shapes, 6, false) : '';
        h += `<div class="blk blk-diag${i === d.active && !forPrint ? ' active' : ''}" data-i="${i}">${tools}<div class="blk-body">${svg || (forPrint ? '' : '<div class="ph">Empty diagram — double-click to draw</div>')}</div></div>`;
      }
    });
    if (!forPrint) h += insertBar(d.blocks.length);
    h += '</div>';
    return { h, P };
  }
  function render(forPrint) {
    const { h: page, P } = pageHtml(forPrint);
    let h = page;
    if (!forPrint) h += `<div class="doc-hud"><span class="pg-info"></span><button data-zoom="fit"${zoomMode === 'fit' ? ' class="on"' : ''}>Fit Width</button><button data-zoom="1"${zoomMode === 1 ? ' class="on"' : ''}>100%</button></div>`;
    root.innerHTML = h;
    sizeDiagrams(root);
    printStyle(P);
    layoutPage(P, forPrint);
    if (!forPrint) requestAnimationFrame(() => layoutPage(P)); // after the side panel has laid out
    const ta = root.querySelector('.blk-ed');
    if (ta) { autosize(ta); ta.focus(); }
  }
  // diagrams at true scale (40 canvas px = 1 cm), shrunk to the text width like \resizebox
  function sizeDiagrams(el) {
    el.querySelectorAll('.blk-diag .blk-body > svg').forEach((svg) => { svg.style.width = (+svg.getAttribute('width') / PX_PER_CM) + 'cm'; svg.removeAttribute('height'); });
  }
  function printStyle(P) {
    let st = document.getElementById('pageStyle');
    if (!st) { st = document.createElement('style'); st.id = 'pageStyle'; document.head.appendChild(st); }
    st.textContent = `@page { size: ${P.W}cm ${P.H}cm; margin: ${P.mt}cm ${P.mr}cm ${P.mb}cm ${P.ml}cm; }
      @media print { .doc-page { width: auto !important; min-height: 0 !important; padding: 0 !important; font-size: ${P.font}pt !important; zoom: 1 !important; } .pg-brk, .doc-hud { display: none !important; } }`;
  }
  // Fit the page to the view, and mark (approximate) page breaks.
  function layoutPage(P, forPrint) {
    const page = root.querySelector('.doc-page');
    if (!page || forPrint) return;
    page.style.zoom = 1;
    page.style.minHeight = '0';
    page.querySelectorAll('.pg-brk').forEach((e) => e.remove());
    const cmPx = page.querySelector('.cm-probe').offsetWidth || 37.8;
    const avail = root.clientWidth - 40;
    const z = zoomMode === 'fit' ? Math.min(1.5, avail / (P.W * cmPx)) : 1;
    // height of the real content (ignoring the trailing "+ Text / + Diagram" bar), in cm
    const blks = page.querySelectorAll('.blk, .doc-title');
    const top = page.getBoundingClientRect().top;
    const bottom = blks.length ? blks[blks.length - 1].getBoundingClientRect().bottom - top : 0;
    const textH = Math.max(0, bottom / cmPx - P.mt);
    const n = Math.max(1, Math.ceil(textH / P.textH - 0.01));
    page.style.minHeight = n * P.H + 'cm';
    for (let k = 1; k < n; k++) {
      const m = document.createElement('div');
      m.className = 'pg-brk';
      m.style.top = k * P.H + 'cm';
      m.innerHTML = `<span>Page ${k + 1}</span>`;
      page.appendChild(m);
    }
    page.style.zoom = z;
    // the editing tools stay at screen size whatever the page zoom
    page.style.setProperty('--unzoom', String(1 / z));
    const info = root.querySelector('.pg-info');
    if (info) info.textContent = `${TD.PAPERS[P.paper]?.name || 'Custom'} · ${n} page${n > 1 ? 's' : ''} (approx.) · ${Math.round(z * 100)}%`;
  }
  window.addEventListener('resize', () => { if (app.state.mode === 'document' && zoomMode === 'fit') layoutPage(TD.pageSize(doc().page)); });

  // ---------- page settings panel (right side in document mode) ----------
  const num = (k, v, step = 0.1) => `<input type="number" data-pg="${k}" value="${+(+v).toFixed(2)}" step="${step}" min="0">`;
  function renderSettings(el) {
    const P = TD.pageSize(doc().page);
    const custom = P.paper === 'custom';
    const diagrams = doc().blocks.filter((b) => b.type === 'diagram' && b.shapes.length);
    const wide = diagrams.filter((b) => diagramWidthCm(b.shapes) > P.textW + 0.01).length;
    el.innerHTML = `<h3>Page setup</h3>
      <div class="sec">
        <div class="row"><label>Paper</label><div class="ctl"><select data-pg="paper">${Object.entries(TD.PAPERS).map(([k, v]) => `<option value="${k}"${k === P.paper ? ' selected' : ''}>${v.name}</option>`).join('')}</select></div></div>
        <div class="row"><label>Orientation</label><div class="ctl seg-ctl">
          <button data-pgo="portrait" class="${P.orient !== 'landscape' ? 'on' : ''}" title="Portrait"><svg viewBox="0 0 20 20"><path d="M6 3h8v14H6z"/></svg></button>
          <button data-pgo="landscape" class="${P.orient === 'landscape' ? 'on' : ''}" title="Landscape"><svg viewBox="0 0 20 20"><path d="M3 6h14v8H3z"/></svg></button></div></div>
        <div class="row"><label>Size (cm)</label><div class="ctl">${custom ? num('w', P.w) + '<span class="x">×</span>' + num('h', P.h) : `<span class="ro">${+P.W.toFixed(2)} × ${+P.H.toFixed(2)}</span>`}</div></div>
      </div>
      <div class="sec"><div class="sec-title">Margins (cm)</div>
        <div class="row"><label>Top / bottom</label><div class="ctl">${num('mt', P.mt)}${num('mb', P.mb)}</div></div>
        <div class="row"><label>Left / right</label><div class="ctl">${num('ml', P.ml)}${num('mr', P.mr)}</div></div>
        <div class="row presets">${[['Narrow', 1.27], ['Normal', 2.5], ['Wide', 3.5]].map(([n, v]) => `<button data-pgm="${v}" title="${v} cm on all sides">${n}</button>`).join('')}</div>
        <div class="hint-line">Text width ${+P.textW.toFixed(2)} cm${wide ? ` · <b>${wide} diagram${wide > 1 ? 's are' : ' is'} wider and will be scaled down</b>` : ''}</div>
      </div>
      <div class="sec"><div class="sec-title">Text</div>
        <div class="row"><label>Font size</label><div class="ctl"><select data-pg="font">${[10, 11, 12].map((v) => `<option value="${v}"${v === +P.font ? ' selected' : ''}>${v} pt</option>`).join('')}</select></div></div>
        <div class="row"><label>Title</label><div class="ctl"><label class="chk"><input type="checkbox" data-pg="title"${P.title ? ' checked' : ''}> Show document name as title</label></div></div>
        <div class="row"><label>Line spacing</label><div class="ctl"><select data-pg="spread">${[[1, 'Single'], [1.15, '1.15'], [1.3, 'One and a half'], [1.6, 'Double']].map(([v, n]) => `<option value="${v}"${v === (+P.spread || 1) ? ' selected' : ''}>${n}</option>`).join('')}</select></div></div>
        <div class="row"><label>Sections</label><div class="ctl"><label class="chk"><input type="checkbox" data-pg="numbered"${P.numbered ? ' checked' : ''}> Number headings (1, 1.1, 1.1.1)</label></div></div>
      </div>
      <div class="sec"><div class="help">Exported with <code>\\usepackage{geometry}</code>. Print uses the same page size.</div></div>`;
  }
  function setPage(patch) {
    const d = doc();
    d.page = { ...TD.PAGE_DEFAULT, ...d.page, ...patch };
    changed(); render(); renderSettings(document.getElementById('props'));
  }
  const propsEl = document.getElementById('props');
  propsEl.addEventListener('change', (e) => {
    const k = e.target.dataset.pg;
    if (!k || app.state.mode !== 'document') return;
    let v = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    if (['w', 'h', 'mt', 'mb', 'ml', 'mr'].includes(k)) { v = parseFloat(v); if (!isFinite(v) || v < 0) return renderSettings(propsEl); }
    if (k === 'font' || k === 'spread') v = +v;
    const patch = { [k]: v };
    if (k === 'paper' && v === 'custom') { const P = TD.pageSize(doc().page); Object.assign(patch, { w: P.W, h: P.H }); }
    setPage(patch);
  });
  propsEl.addEventListener('click', (e) => {
    if (app.state.mode !== 'document') return;
    const o = e.target.closest('[data-pgo]');
    if (o) setPage({ orient: o.dataset.pgo });
    const m = e.target.closest('[data-pgm]');
    if (m) { const v = +m.dataset.pgm; setPage({ mt: v, mb: v, ml: v, mr: v }); }
  });

  const autosize = (ta) => { ta.style.height = 'auto'; ta.style.height = ta.scrollHeight + 4 + 'px'; };

  function changed() { app.scheduleSave(); }
  function keepActive(fn) {
    const d = doc(), act = d.blocks[d.active];
    fn(d);
    d.active = d.blocks.indexOf(act);
    if (d.active < 0) d.active = d.blocks.findIndex((b) => b.type === 'diagram');
  }

  // ---------- editing a text block's source ----------
  const fire = (ta) => ta.dispatchEvent(new Event('input', { bubbles: true }));
  // Wrap the selection in pre…post; if it is already wrapped exactly so, unwrap it.
  function wrapSel(ta, pre, post, placeholder = 'text') {
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
  function prefixLines(ta, kind) {
    const v = ta.value;
    const a = v.lastIndexOf('\n', ta.selectionStart - 1) + 1;
    let z = v.indexOf('\n', ta.selectionEnd - (ta.selectionEnd > ta.selectionStart && v[ta.selectionEnd - 1] === '\n' ? 1 : 0));
    if (z < 0) z = v.length;
    const lines = v.slice(a, z).split('\n');
    const strip = (l) => l.replace(HEAD_RE, '$2').replace(/^(\s*)([-*]|\d+[.)])\s+(\[[ xX]\]\s+)?/, '$1');
    const has = (l) => kind.startsWith('#') ? (l.match(HEAD_RE) || [])[1] === kind
      : (() => { const m = l.match(ITEM_RE); return m && itemKind(m) === kind; })();
    const off = kind === '' || lines.every((l) => !l.trim() || has(l));
    let k = 0;
    const out = lines.map((l) => {
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
  const hexOf = (c) => c.replace('#', '').toUpperCase();
  function fmtAction(ta, f, val) {
    const b = doc().blocks[editingIdx];
    if (!ta || !b) return;
    if (f === 'b') wrapSel(ta, '\\textbf{', '}');
    else if (f === 'i') wrapSel(ta, '\\textit{', '}');
    else if (f === 'u') wrapSel(ta, '\\underline{', '}');
    else if (f === 's') wrapSel(ta, '\\sout{', '}');
    else if (f === 'math') wrapSel(ta, '$', '$', 'x');
    else if (f === 'color') { fmtColor = val; wrapSel(ta, `\\textcolor[HTML]{${hexOf(val)}}{`, '}'); }
    else if (f === 'hl') { fmtHl = val; wrapSel(ta, `\\colorbox[HTML]{${hexOf(val)}}{`, '}'); }
    else if (f === 'link') {
      const s0 = ta.selectionStart, s1 = ta.selectionEnd, sel = ta.value.slice(s0, s1);
      TD.prompt('Link Address', /^https?:\/\//.test(sel) ? sel : 'https://', { ok: 'Add Link' }).then((url) => {
        ta.focus(); ta.setSelectionRange(s0, s1); // the dialog took the focus: put the selection back
        if (!url || url === 'https://') return;
        if (!sel || sel === url) wrapSel(ta, '\\url{', '}', url);
        else wrapSel(ta, `\\href{${url}}{`, '}');
      });
    } else if (f === 'ul' || f === 'ol' || f === 'chk') prefixLines(ta, f);
    else if (f === 'head') prefixLines(ta, val);
    else if (f.startsWith('al:')) {
      b.align = f.slice(3) === 'justify' ? undefined : f.slice(3);
      root.querySelectorAll('.editing [data-fmt^="al:"]').forEach((x) => x.classList.toggle('on', x.dataset.fmt === f));
      changed(); ta.focus();
    } else if (f === 'size') { b.size = val === 'normalsize' ? undefined : val; changed(); ta.focus(); }
  }

  function addImage(at, replaceIdx) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/gif,image/svg+xml,image/webp';
    inp.onchange = () => {
      const f = inp.files && inp.files[0];
      if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        if (replaceIdx != null) Object.assign(doc().blocks[replaceIdx], { src: rd.result, name: f.name });
        else { keepActive((d) => d.blocks.splice(at, 0, { type: 'image', src: rd.result, name: f.name, width: 0.6, caption: '' })); editingIdx = at; }
        changed(); render();
      };
      rd.readAsDataURL(f);
    };
    inp.click();
  }

  root.addEventListener('mousedown', (e) => {
    // toolbar buttons must not take focus from the text being edited
    if (e.target.closest('.fmt-bar button')) e.preventDefault();
  });
  root.addEventListener('click', (e) => {
    const zb = e.target.closest('[data-zoom]');
    if (zb) { zoomMode = zb.dataset.zoom === 'fit' ? 'fit' : 1; render(); return; }
    const add = e.target.closest('[data-add]');
    if (add) {
      const at = +add.closest('[data-at]').dataset.at, kind = add.dataset.add;
      if (kind === 'image') { addImage(at); return; }
      const nb = kind === 'text' ? { type: 'text', text: '' } : kind === 'table' ? { type: 'table', rows: [['', '', ''], ['', '', ''], ['', '', '']], header: true, borders: 'all', colAlign: 'c' } : { type: 'diagram', shapes: [] };
      keepActive((d) => d.blocks.splice(at, 0, nb));
      if (kind !== 'diagram') editingIdx = at;
      changed(); render();
      if (kind === 'table') root.querySelector('.editing .cell')?.focus();
      return;
    }
    const blk = e.target.closest('.blk');
    if (!blk) return;
    const i = +blk.dataset.i, b = doc().blocks[i];
    if (e.target.closest('[data-mv]')) {
      const dir = +e.target.closest('[data-mv]').dataset.mv;
      keepActive((d) => { const [x] = d.blocks.splice(i, 1); d.blocks.splice(i + dir, 0, x); });
      editingIdx = -1; changed(); render();
      return;
    }
    if (e.target.closest('[data-rm]')) {
      const remove = () => { keepActive((d) => d.blocks.splice(i, 1)); editingIdx = -1; changed(); render(); };
      if (b.type === 'diagram' && b.shapes.length) {
        TD.confirm('Delete this diagram?', `Its ${b.shapes.length} object${b.shapes.length > 1 ? 's' : ''} will be deleted too.`, { ok: 'Delete', danger: true }).then((yes) => { if (yes) remove(); });
      } else remove();
      return;
    }
    if (e.target.closest('[data-edit]')) { openDiagram(i); return; }
    // tick a checklist box without opening the editor
    const cbx = e.target.closest('.cbx');
    if (cbx && b.type === 'text' && editingIdx !== i) {
      const lines = (b.text || '').split('\n'), ln = +cbx.dataset.ln;
      lines[ln] = lines[ln].replace(/\[([ xX])\]/, (m, c) => (c === ' ' ? '[x]' : '[ ]'));
      b.text = lines.join('\n'); changed(); render();
      return;
    }
    if (e.target.closest('a[href]') && editingIdx !== i) return; // follow links in the preview
    const fb = e.target.closest('[data-fmt]');
    if (fb && fb.tagName === 'BUTTON') { fmtAction(blk.querySelector('.blk-ed'), fb.dataset.fmt); return; }
    const tb = e.target.closest('button[data-tb]');
    if (tb) {
      const R = b.rows, nc = Math.max(1, ...R.map((r) => r.length));
      if (tb.dataset.tb === 'row+') R.push(Array(nc).fill(''));
      if (tb.dataset.tb === 'row-' && R.length > 1) R.pop();
      if (tb.dataset.tb === 'col+') R.forEach((r) => { while (r.length < nc) r.push(''); r.push(''); });
      if (tb.dataset.tb === 'col-' && nc > 1) R.forEach((r) => { r.length = Math.min(r.length, nc - 1); });
      changed(); render();
      return;
    }
    const im = e.target.closest('button[data-im]');
    if (im) {
      if (im.dataset.im === 'replace') addImage(null, i);
      if (im.dataset.im === 'download') { const a = document.createElement('a'); a.href = b.src; a.download = imageName(b, i); a.click(); }
      return;
    }
    if (['text', 'table', 'image'].includes(b.type) && editingIdx !== i) { editingIdx = i; render(); }
  });
  root.addEventListener('change', (e) => {
    const t = e.target, blk = t.closest('.blk');
    if (!blk) return;
    const b = doc().blocks[+blk.dataset.i];
    if (t.dataset.fmt) { fmtAction(blk.querySelector('.blk-ed'), t.dataset.fmt, t.value); if (t.dataset.fmt === 'head') t.value = ''; return; }
    if (t.dataset.tb) { b[t.dataset.tb] = t.type === 'checkbox' ? t.checked : t.value; changed(); render(); return; }
    if (t.dataset.im === 'caption') { b.caption = t.value; changed(); }
  });
  root.addEventListener('dblclick', (e) => {
    const blk = e.target.closest('.blk-diag');
    if (blk && !e.target.closest('.blk-tools')) openDiagram(+blk.dataset.i);
  });
  function openDiagram(i) {
    app.setActiveBlock(i);
    app.setMode('diagram');
    requestAnimationFrame(() => app.zoomFit());
  }
  const relayout = () => { clearTimeout(relayT); relayT = setTimeout(() => layoutPage(TD.pageSize(doc().page)), 400); };
  root.addEventListener('input', (e) => {
    const t = e.target, b = doc().blocks[editingIdx];
    if (!b) return;
    if (t.classList.contains('blk-ed')) { b.text = t.value; autosize(t); changed(); relayout(); return; }
    if (t.classList.contains('cell')) { const r = +t.dataset.r, c = +t.dataset.c; while (b.rows[r].length <= c) b.rows[r].push(''); b.rows[r][c] = t.value; changed(); return; }
    if (t.dataset.im === 'width') {
      b.width = +t.value;
      const img = t.closest('.blk').querySelector('img');
      if (img) img.style.width = b.width * 100 + '%';
      t.nextElementSibling.textContent = Math.round(b.width * 100) + '%';
      changed(); relayout();
    }
  });
  // Leaving the block being edited (by mouse or keyboard) shows its rendered form again.
  function leaveIfOutside(el) {
    if (editingIdx < 0) return;
    const cur = root.querySelector('.blk.editing');
    if (cur && el && cur.contains(el)) return;
    // pressing on another text / table / image block opens that one straight away
    const nb = el && el.closest && !el.closest('.blk-tools, .cbx, a[href]') && el.closest('.blk-text, .blk-table, .blk-image');
    editingIdx = nb ? +nb.dataset.i : -1;
    render();
  }
  root.addEventListener('focusout', (e) => {
    if (!e.target.closest('.blk.editing')) return;
    setTimeout(() => { if (document.activeElement && document.activeElement !== document.body) leaveIfOutside(document.activeElement); }, 0);
  });
  document.addEventListener('pointerdown', (e) => {
    if (editingIdx < 0 || app.state.mode !== 'document') return;
    if (e.target.closest('.blk.editing') || e.target.closest('.tc-pop, .texcomplete, .ddpop, .td-dialog')) return;
    if (!root.contains(e.target) && !e.target.closest('#docview')) return;
    setTimeout(() => leaveIfOutside(e.target.isConnected ? e.target : null), 0);
  }, true);
  root.addEventListener('keydown', (e) => {
    const t = e.target;
    if (t.classList.contains('blk-ed')) {
      if (e.key === 'Escape') { editingIdx = -1; render(); return; }
      const k = (e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase();
      if (k === 'b' || k === 'i' || k === 'u') { e.preventDefault(); fmtAction(t, k); }
    }
    if (t.classList.contains('cell')) {
      if (e.key === 'Escape') { editingIdx = -1; render(); return; }
      if (e.key === 'Enter') {
        e.preventDefault();
        const b = doc().blocks[editingIdx], r = +t.dataset.r, c = +t.dataset.c;
        if (r === b.rows.length - 1) { b.rows.push(Array(b.rows[0].length).fill('')); changed(); render(); }
        root.querySelector(`.editing .cell[data-r="${r + 1}"][data-c="${c}"]`)?.focus();
      }
    }
  });

  // ---------- standalone HTML export ----------
  // One self-contained file: the rendered page with its fonts embedded, maths included.
  const dataUrl = async (url, type) => {
    const buf = await (await fetchOk(url)).arrayBuffer();
    let s = '';
    const u8 = new Uint8Array(buf);
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return `data:${type};base64,${btoa(s)}`;
  };
  // Where each maths stylesheet lives locally and on the CDN (same versions as vendor/), used when a
  // local font cannot be read (server restarting, page opened from a file, flaky network).
  const MATH_CSS = {
    katex: { css: 'vendor/katex/katex.min.css', cdn: 'https://cdn.jsdelivr.net/npm/katex@0.19.1/dist/' },
    // temml's npm package has no latinmodernmath.woff2; the copy in Temml's repo is the one mathengine.js links.
    temml: { css: 'vendor/temml/Temml-Latin-Modern.css', cdn: 'https://cdn.jsdelivr.net/npm/temml@0.14.0/dist/',
      files: { 'latinmodernmath.woff2': 'https://cdn.jsdelivr.net/gh/ronkok/Temml@main/site/assets/latinmodernmath.woff2' } },
  };
  const fetchOk = async (url) => {
    for (let k = 0; k < 2; k++) { // one retry: a dev server mid-restart usually answers the second time
      try { const r = await fetch(url); if (r.ok) return r; } catch (e) { /* retry */ }
    }
    throw new Error('could not load ' + url);
  };
  // The stylesheet text: from the network, else from the copy this page already loaded.
  async function mathCssText(cssUrl) {
    try { return await (await fetchOk(cssUrl)).text(); } catch (e) {
      const abs = new URL(cssUrl, location.href).href;
      const ss = [...document.styleSheets].find((s) => s.href === abs);
      try { if (ss) return [...ss.cssRules].map((r) => r.cssText).join('\n'); } catch (e2) { /* unreadable (file://) */ }
      return '';
    }
  }
  // Fonts that could not be embedded in the last export and were linked to the CDN instead.
  TD.mathFontsLinked = 0;
  async function inlineFonts(engine) {
    const { css: cssUrl, cdn, files = {} } = MATH_CSS[engine];
    let css = await mathCssText(cssUrl);
    if (!css) { TD.mathFontsLinked = -1; return `@import url("${cdn}${cssUrl.split('/').pop()}");`; }
    const base = cssUrl.slice(0, cssUrl.lastIndexOf('/') + 1);
    const urls = [...new Set([...css.matchAll(/url\(['"]?([^'")]+\.woff2)['"]?\)/g)].map((m) => m[1]))];
    let linked = 0;
    for (const u of urls) {
      const rel = u.replace(/^\.\//, '');
      let src;
      try { src = await dataUrl(base + rel, 'font/woff2'); } catch (e) { src = files[rel] || cdn + rel; linked++; }
      css = css.split(u).join(src);
    }
    TD.mathFontsLinked = linked;
    // keep only the woff2 sources
    return css.replace(/,\s*url\([^)]*\.(woff|ttf)\)\s*format\(["'](woff|truetype)["']\)/g, '');
  }
  // the maths stylesheet with its fonts embedded (for PNG / PDF export)
  TD.inlineMathCss = () => inlineFonts(TD.math.engine === 'temml' ? 'temml' : 'katex');
  // pageBody: ready-made markup (Page files pass their page SVGs); otherwise the Classic document.
  TD.docToHtml = async function (pageBody) {
    const was = editingIdx;
    editingIdx = -1;
    const { h, P } = pageBody ? { h: pageBody, P: TD.pageSize(doc().page) } : pageHtml(true);
    editingIdx = was;
    const box = document.createElement('div');
    box.innerHTML = h;
    sizeDiagrams(box);
    const mathCss = await TD.inlineMathCss();
    const own = [...document.styleSheets].flatMap((ss) => { try { return [...ss.cssRules]; } catch (e) { return []; } })
      .map((r) => r.cssText)
      .filter((t) => /\.(doc-page|doc-title|dmath|tx|dtab|cbx|cbox|tt|la|te|blk|blk-body|blk-diag|blk-image|blk-text|blk-table)\b|figcaption/.test(t)
        && !/^@media|:hover|blk-tools|\.ins\b|editing|fmt-|\.ph\b|\.active|cm-probe|pg-brk|var\(--(?!font-tex|spread|al\b)/.test(t)).join('\n');
    const name = doc().name || 'Untitled';
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(name)}</title>
<style>${mathCss}</style>
<style>
:root { --font-tex: ${TD.math.engine === 'temml' ? '"Latin Modern Roman", "Latin Modern Math"' : 'KaTeX_Main'}, "Times New Roman", serif; }
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

  TD.docview = { render, renderSettings, textToHtml, textToLatex, inl };
  if (app.state.mode === 'document') { render(); app.renderProps(); }
})();
