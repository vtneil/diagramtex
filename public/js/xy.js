// XyMatrix block: a commutative diagram written for the xy package (\xymatrix{…}). The code is the object, as
// with tikz-cd. To draw and edit it, the code is read into tikz-cd's form (an \arrow[dirs, options] per \ar),
// laid out by cd.js with xy's own geometry (3pt object margins, 2pc between entries, xy's arrow tips and curves),
// and written back as xymatrix code. What has no tikz-cd counterpart rides along in "xy …" options, so it
// comes back out unchanged.
(function () {
  const TD = window.TD, D = TD.cd, Z = TD.zx;
  const { esc } = TD.util;
  const f = TD.fmt;
  const { PT, EX } = D;
  const PC = 12 * PT;

  TD.XY_DEFAULT = [
    '\\xymatrix{',
    '  A \\ar[r]^{f} \\ar[d]_{g} & B \\ar[d]^{h} \\\\',
    '  C \\ar[r]_{k}             & D',
    '}',
  ].join('\n');
  // xy's lengths
  const XY = { sep: 2 * PC, margin: 3 * PT, label: 2.5 * PT, curve: 0.5 * PC, shift: 0.5 * EX, turn: 10 * PT };

  // ---------------------------------------------------------------- code ↔ parts
  const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  // \xymatrix@R=1pc@C=2pc{ … } → { env: '@R=1pc@C=2pc', inner, wrapped }
  function unwrap(src) {
    src = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
    const m = /\\xymatrix(?![A-Za-z])/.exec(src);
    if (!m) return { env: '', inner: src, wrapped: false };
    let i = m.index + m[0].length, k = i;
    while (k < src.length && src[k] !== '{') { if (src[k] === '[') { const j = Z.close(src, k); k = j < 0 ? k + 1 : j + 1; } else k++; }
    const env = src.slice(i, k).replace(/\s+/g, '');
    const j = Z.close(src, k);
    return { env, inner: k < src.length ? src.slice(k + 1, j < 0 ? src.length : j) : '', wrapped: true };
  }
  // one argument: {…}, a control word, or one character
  function argAt(s, i) {
    i = skipWs(s, i);
    if (s[i] === '{') { const j = Z.close(s, i); const k = j < 0 ? s.length : j; return { v: s.slice(i + 1, k), raw: s.slice(i, k + 1), end: k + 1 }; }
    if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); return { v: m[0], raw: m[0], end: i + m[0].length }; }
    return i < s.length ? { v: s[i], raw: s[i], end: i + 1 } : null;
  }
  // a delimited part: @/…/, @<…>, @(…), @[…] (nested braces respected)
  function delim(s, i, open, closeCh) {
    if (s[i] !== open) return null;
    let d = 0;
    for (let j = i + 1; j < s.length; j++) {
      const c = s[j];
      if (c === '\\') { j++; continue; }
      if (c === '{') d++; else if (c === '}') d--;
      else if (d === 0 && c === closeCh) return { v: s.slice(i + 1, j), end: j + 1 };
    }
    return null;
  }

  // one \ar: its modifiers, target and labels → { dirs, mods: [{ k, v, raw }], labels: [{ side, place, t }], end }
  function readAr(s, i) {
    const out = { dirs: '', mods: [], labels: [], target: null };
    for (;;) {
      const k = skipWs(s, i);
      if (s[k] !== '@') { i = k; break; }
      const c = s[k + 1];
      let d;
      if (c === '{') { const a = argAt(s, k + 1); out.mods.push({ k: 'style', v: a.v, raw: s.slice(k, a.end) }); i = a.end; continue; }
      if (c === '/' && (d = delim(s, k + 1, '/', '/'))) { out.mods.push({ k: 'curve', v: d.v, raw: s.slice(k, d.end) }); i = d.end; continue; }
      if (c === '<' && (d = delim(s, k + 1, '<', '>'))) { out.mods.push({ k: 'shift', v: d.v, raw: s.slice(k, d.end) }); i = d.end; continue; }
      if (/[23]/.test(c || '')) {
        let e = k + 2, v = '->';
        const j = skipWs(s, e);
        if (s[j] === '{') { const a = argAt(s, j); v = a.v; e = a.end; }
        out.mods.push({ k: c === '2' ? 'double' : 'raw', v, raw: s.slice(k, e) }); i = e; continue;
      }
      // anything else (@(…), @[…], @*{…}, @!, @^{…} …) is kept as written
      let e = k + 2;
      if (c === '(' && (d = delim(s, k + 1, '(', ')'))) e = d.end;
      else if (c === '[' && (d = delim(s, k + 1, '[', ']'))) e = d.end;
      else if (c === '*' || c === '^' || c === '_') { const a = argAt(s, k + 2); if (a) e = a.end; }
      out.mods.push({ k: 'raw', v: s.slice(k, e), raw: s.slice(k, e) }); i = e;
    }
    // turns: `diag[pos] with labels for the straight piece before each turn
    const t0 = skipWs(s, i), tn = readTurns(s, t0);
    if (tn.list.length) { out.turns = tn.list; out.turnsRaw = s.slice(t0, tn.end).trim(); i = tn.end; }
    const t = delim(s, skipWs(s, i), '[', ']');
    if (t) { if (/^[udlr]*$/.test(t.v.trim())) out.dirs = t.v.trim(); else out.target = `[${t.v}]`; i = t.end; }
    const L = readLabels(s, i);
    out.labels = L.list;
    out.end = L.end;
    return out;
  }
  // labels: ^ _ | with a place (< > - (x) /d/) and an argument
  function readLabels(s, i) {
    const list = [];
    for (;;) {
      const k = skipWs(s, i);
      if (!/[\^_|]/.test(s[k] || '')) { i = k; break; }
      let j = k + 1;
      const pm = /^([<>]*)(\([^)]*\))?(-)?(\/[^/]*\/)?/.exec(s.slice(j));
      j += pm[0].length;
      const a = argAt(s, j);
      if (!a) { i = j; break; }
      list.push({ side: s[k], place: pm[0], t: a.v.trim(), raw: s.slice(k, a.end) });
      i = a.end;
    }
    return { list, end: i };
  }
  // `[ul] `r/5pt[d] … → [{ diag, r, dirs, labels }]; stops at anything else
  function readTurns(s, i) {
    const list = [];
    let end = i;
    for (;;) {
      const k = skipWs(s, end);
      if (s[k] !== '`') break;
      const m = /^([udlr]{0,2})\s*(?:\/\s*([^[`\s]+))?\s*/.exec(s.slice(k + 1));
      const j = k + 1 + m[0].length, d = delim(s, j, '[', ']');
      if (!d || !/^[udlr]*$/.test(d.v.trim())) break;
      const L = readLabels(s, d.end);
      list.push({ diag: m[1], r: m[2] ? D.length(m[2]) : null, dirs: d.v.trim(), labels: L.list });
      end = L.end;
    }
    return { list, end };
  }
  // one entry: its maths and its arrows
  function cell(text) {
    const out = { t: '', arrows: [], obj: null };
    let i = 0, t = '';
    // *{…} (with modifiers like *+[F]{…}): an object; its text is drawn, the rest kept
    const k0 = skipWs(text, 0);
    if (text[k0] === '*') {
      let j = k0 + 1;
      for (;;) {
        j = skipWs(text, j);
        if (/[+\-!=]/.test(text[j] || '')) { j++; continue; }
        if (text[j] === '[') { const d = delim(text, j, '[', ']'); if (d) { j = d.end; continue; } }
        if (text[j] === '<') { const d = delim(text, j, '<', '>'); if (d) { j = d.end; continue; } }
        break;
      }
      const a = argAt(text, j);
      if (a) { out.obj = text.slice(k0, j).trim(); t = a.raw[0] === '{' ? a.v : a.raw; i = a.end; }
    }
    while (i < text.length) {
      const c = text[i];
      if (c === '{') { const j = Z.close(text, i); const k = j < 0 ? text.length : j + 1; t += text.slice(i, k); i = k; continue; }
      if (c === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(text.slice(i));
        if (m[1] === 'ar') { const a = readAr(text, i + 3); out.arrows.push(a); i = a.end; continue; }
        t += m[0]; i += m[0].length; continue;
      }
      t += c; i++;
    }
    out.t = t.trim();
    return out;
  }

  // ---------------------------------------------------------------- arrow styles
  // @{tail shaft head}: tokens are single characters or ^{…} / _{…}
  function tokens(spec) {
    const out = [];
    for (let i = 0; i < spec.length;) {
      const c = spec[i];
      if (/\s/.test(c)) { i++; continue; }
      if ((c === '^' || c === '_') && spec[i + 1] === '{') { const j = Z.close(spec, i + 1); out.push(spec.slice(i, j + 1)); i = j + 1; continue; }
      out.push(c); i++;
    }
    return out;
  }
  const SHAFT = { '-': [], '--': ['dashed'], '.': ['dotted'], '~': ['squiggly'], '=': ['@dbl'], '==': ['@dbl', 'dashed'], ':': ['@dbl', 'dotted'] };
  // tail|head|double → tikz-cd's own names, so the editor's pictures know them
  const ENDS = {
    ' > ': [], '  ': ['dash'], ' >> ': ['two heads'], ' ^{>} ': ['harpoon'], ' _{>} ': ["harpoon'"],
    '| > ': ['mapsto'], '|  ': ['maps to', 'no head'], '^{(} > ': ['hook'], '_{(} > ': ["hook'"], '> > ': ['tail'],
    '< > ': ['leftrightarrow'], '<  ': ['leftarrow'], '| >> ': ['maps to', 'two heads'], '^{(} >> ': ['hook', 'two heads'],
    ' > =': ['Rightarrow'], '  =': ['equal'], '< > =': ['Leftrightarrow'], '<  =': ['Leftarrow'], '| > =': ['Mapsto'],
  };
  // a spec → tikz-cd options, or null when it has none
  function specItems(spec, dbl) {
    spec = String(spec).trim();
    if (!spec) return ['phantom'];
    const tk = tokens(spec);
    const s0 = tk.findIndex((x) => /^[-.~=:]$/.test(x));
    if (s0 < 0) return null;
    let s1 = s0;
    while (s1 + 1 < tk.length && tk[s1 + 1] === tk[s0]) s1++;
    const tail = tk.slice(0, s0).join(''), shaft = tk.slice(s0, s1 + 1).join(''), head = tk.slice(s1 + 1).join('');
    const line = SHAFT[shaft];
    if (!line) return null;
    const isDbl = dbl || line.includes('@dbl');
    const ends = ENDS[`${tail} ${head} ${isDbl ? '=' : ''}`];
    if (!ends) return null;
    return ends.concat(line.filter((x) => x !== '@dbl'));
  }
  // the look (cd.js style) → @{…}
  const TAIL = { null: '', hook: '^{(}', "hook'": '_{(}', tail: '>', bar: '|', to: '<', to2: '<<', implies: '<' };
  const HEAD = { null: '', to: '>', to2: '>>', implies: '>', harpoon: '^{>}', "harpoon'": '_{>}', bar: '|' };
  function specOf(items) {
    const A = D.style(items, () => {});
    if (A.phantom) return '';
    const shaft = A.dbl ? (A.dash === 'dotted' ? ':' : A.dash === 'dashed' ? '==' : '=') : A.squig ? '~' : A.dash === 'dashed' ? '--' : A.dash === 'dotted' ? '.' : '-';
    const t = TAIL[A.tail], h = HEAD[A.head];
    return `${t == null ? '' : t}${shaft}${h == null ? '>' : h}`;
  }

  // ---------------------------------------------------------------- xymatrix → tikz-cd
  const NAMED = { 0.25: 'near start', 0.5: '', 0.75: 'near end' };
  function labelItem(L) {
    const opts = [];
    const m = /\(([^)]*)\)/.exec(L.place), rest = L.place.replace(/\([^)]*\)/, '');
    // <>(f) is tikz-cd's pos=f (along the arrow); a bare (f) counts from the entries' centres, so it stays xy's
    if (m && rest === '<>') { const v = parseFloat(m[1]); if (!isFinite(v)) opts.push(`xy at={${L.place}}`); else if (NAMED[v] != null) { if (NAMED[v]) opts.push(NAMED[v]); } else opts.push(`pos=${f(v)}`); }
    else if (m) opts.push(`xy at={${L.place}}`);
    else if (rest && rest !== '-') opts.push(`xy at={${rest}}`);
    if (L.side === '|') opts.push('description');
    // ^{\textcolor{red}{f}}: the label's colour, as tikz-cd's text= (arrowXy writes it back as it was)
    const sc = D.splitColor(L.t);
    if (sc.spec) opts.push(D.colorItem(sc.spec, 'text'));
    return D.labelCode({ t: sc.spec ? sc.body : L.t, swap: L.side === '_', opts });
  }
  function arrowItems(a) {
    const items = [];
    let dbl = false, spec = null;
    for (const m of a.mods) {
      if (m.k === 'double') { dbl = true; spec = m.v; }
      else if (m.k === 'style') spec = m.v;
    }
    if (spec != null || dbl) {
      const it = specItems(spec == null ? '->' : spec, dbl);
      if (it) items.push(...it);
      else items.push(`xy style={${dbl ? '@2' : ''}{${spec}}}`);
    }
    for (const m of a.mods) {
      if (m.k === 'curve') {
        const side = m.v.trim()[0], amt = m.v.trim().slice(1).trim();
        if (side === '^' || side === '_') { items.push(side === '^' ? 'bend left' : 'bend right'); if (amt) items.push(`xy bend=${amt}`); }
        else items.push(`xy={${m.raw}}`);
      } else if (m.k === 'shift') {
        const v = m.v.trim(), neg = v[0] === '-';
        items.push(`${neg ? 'shift right' : 'shift left'}=${neg ? v.slice(1) : v}`);
      } else if (m.k === 'raw') {
        // @[red] (xy's color option): the arrow's colour; a spec not known here stays xy's own part
        const c = /^@\[([\s\S]*)\]$/.exec(m.raw);
        if (c && TD.tikzColor && TD.tikzColor(c[1])) items.push(D.colorItem(c[1].trim(), 'draw'));
        else items.push(`xy={${m.raw}}`);
      }
    }
    if (a.turns) items.push(`xy turns={${a.turnsRaw}}`);
    if (a.target) items.push(`xy target={${a.target}}`);
    for (const L of a.labels) items.push(labelItem(L));
    return items;
  }
  const cellToCd = (text) => {
    const c = cell(text);
    return [c.obj != null ? `|[xy object={${c.obj}}]|` : '', c.t, ...c.arrows.map((a) => `\\arrow[${[a.dirs, ...arrowItems(a)].join(', ')}]`)].filter(Boolean).join(' ');
  };
  // the diagram's options: @R=, @C=, @= become tikz-cd's seps (lengths); the rest is kept for xy
  function envToCd(env) {
    const out = [], keep = [];
    for (const part of String(env || '').split(/(?=@)/).filter(Boolean)) {
      const m = /^@([RC]?)=(.+)$/.exec(part);
      if (m) out.push(`${m[1] === 'R' ? 'row sep' : m[1] === 'C' ? 'column sep' : 'sep'}=${m[2]}`);
      else keep.push(part);
    }
    if (keep.length) out.push(`xy={${keep.join('')}}`);
    return out.join(', ');
  }
  function toCd(src) {
    const { env, inner, wrapped } = unwrap(src);
    if (!wrapped && !String(src || '').trim()) return '\\begin{tikzcd}\n\\end{tikzcd}';
    const rows = Z.grid(inner, false);
    const body = rows.map((r) => '  ' + r.cells.map((c) => cellToCd(c.text)).join(' & ')).join(' \\\\\n');
    const e = envToCd(env);
    return `\\begin{tikzcd}${e ? `[${e}]` : ''}\n${body}\n\\end{tikzcd}`;
  }

  // ---------------------------------------------------------------- tikz-cd → xymatrix
  const unbrace = (v) => String(v == null ? '' : v).trim().replace(/^\{([\s\S]*)\}$/, '$1');
  const POS = { 'at start': 0, 'very near start': 0.125, 'near start': 0.25, midway: 0.5, 'near end': 0.75, 'very near end': 0.875, 'at end': 1 };
  const LINE = /^(dashed|dotted|densely dotted|loosely dotted|squiggly)$/;
  function arrowXy(a) {
    const styleIt = [], mods = [], labs = [];
    let curve = null, amt = '', target = '', turns = '', every = {};
    for (const it of a.items) {
      const L = D.label(it);
      if (L) { labs.push(L); continue; }
      const { name, arg } = Z.styleOf(it);
      if (name === 'bend left' || name === 'bend right') curve = name === 'bend left' ? '^' : '_';
      else if (name === 'xy bend') amt = unbrace(arg);
      else if (name === 'shift left' || name === 'shift right') { const v = arg == null ? '.5ex' : unbrace(arg); mods.push(`@<${name === 'shift right' ? '-' : ''}${v}>`); }
      else if (name === 'xy style') every.raw = `@${unbrace(arg)}`;
      else if (name === 'xy') mods.push(unbrace(arg));
      else if (name === 'xy target') target = unbrace(arg);
      else if (name === 'xy turns') turns = unbrace(arg);
      else if (name === 'description') every.desc = true;
      else if (name === 'swap' || name === "'") every.swap = true;
      else if (name in POS) every.pos = POS[name];
      else if (name === 'pos') every.pos = parseFloat(arg);
      else if (D.colorOpt(it)) {
        // xy's @[colour] draws the line (and tips) only; a tikz-cd colour that also colours the labels wraps them
        const o = D.colorOpt(it);
        if (o.key !== 'text') mods.push(`@[${o.spec}]`);
        if (o.key !== 'draw') every.lcol = o.spec;
      }
      else if (TD.CD_HEADS[name] || LINE.test(name) || name === 'phantom') styleIt.push(it);
    }
    let style = every.raw || '';
    if (!style && styleIt.length) { const sp = specOf(styleIt); if (sp !== '->') style = `@{${sp}}`; }
    const head = `\\ar${style}${curve ? `@/${curve}${amt}/` : ''}${mods.join('')}${turns ? ` ${turns} ` : ''}${target || `[${a.dirs}]`}`;
    const lab = labs.map((L) => {
      let side = L.swap !== !!every.swap ? '_' : '^', place = '', pos = every.pos, lcol = every.lcol || null;
      for (const o of L.opts) {
        const { name, arg } = Z.styleOf(o), co = D.colorOpt(o);
        if (co) { if (co.key !== 'draw') lcol = co.spec; }
        else if (name === 'description') side = '|';
        else if (name === 'xy at') place = unbrace(arg);
        else if (name in POS) pos = POS[name];
        else if (name === 'pos') pos = parseFloat(arg);
      }
      if (every.desc) side = '|';
      if (!place && pos != null && isFinite(pos) && pos !== 0.5) place = pos === 0 ? '<' : pos === 1 ? '>' : `<>(${f(pos).replace(/^0\./, '.')})`;
      return `${side}${place}{${D.joinColor(lcol, L.t)}}`;
    }).join('');
    return head + lab;
  }
  function cellFromCd(text) {
    const c = D.cell(text);
    const m = c.node != null && /^\s*xy object=\{([\s\S]*)\}\s*$/.exec(c.node);
    // an object keeps its modifiers and braces: *{…}, *+[F]{…}
    const t = m ? `${m[1]}{${c.t}}` : c.t;
    return [t, ...c.arrows.map(arrowXy)].filter(Boolean).join(' ');
  }
  function envFromCd(list) {
    let out = '';
    for (const it of list) {
      const { name, arg } = Z.styleOf(it);
      if (name === 'row sep') out += `@R=${unbrace(arg)}`;
      else if (name === 'column sep') out += `@C=${unbrace(arg)}`;
      else if (name === 'sep') out += `@=${unbrace(arg)}`;
      else if (name === 'xy') out += unbrace(arg);
    }
    return out;
  }
  function fromCd(cdSrc) {
    const { env, inner } = D.unwrap(cdSrc);
    const rows = Z.grid(inner, false).map((r) => r.cells.map((c) => cellFromCd(c.text)));
    // trailing empty entries go; the & signs are lined up
    rows.forEach((p) => { while (p.length > 1 && !p[p.length - 1]) p.pop(); });
    const C = Math.max(0, ...rows.map((p) => p.length)), w = [];
    for (let c = 0; c < C; c++) w[c] = Math.max(0, ...rows.map((p) => (p[c] || '').length));
    const lines = rows.map((p, r) => '  ' + p.map((t, c) => (c < p.length - 1 ? t.padEnd(w[c]) + ' & ' : t)).join('').replace(/\s+$/, '') + (r < rows.length - 1 ? ' \\\\' : ''));
    const e = envFromCd(Z.opts(env).list);
    return `\\xymatrix${e}{\n${rows.length && rows.some((p) => p.some(Boolean)) ? lines.join('\n') + '\n' : ''}}`;
  }

  // ---------------------------------------------------------------- geometry
  // xy's tip: two curved strokes meeting at the point
  // (measured against xy at 10x: ->> puts a second tip 3pt behind, => has a wider tip of its own)
  function tip(kind, P, u, w, col, A, fallback) {
    const n = { x: -u.y, y: u.x };
    // sg -1 turns the tip round: its point lies l along the arrow, its arms on the end
    const one = (d, l, h, c, sg = 1) => {
      const Q = (a, b) => { a = sg > 0 ? a + d : d + l - a; return `${TD.util.r2(P.x - u.x * a + n.x * b)},${TD.util.r2(P.y - u.y * a + n.y * b)}`; };
      return `<path d="M${Q(l, h)}Q${Q(c * l, 0.12 * h)} ${Q(0, 0)}Q${Q(c * l, -0.12 * h)} ${Q(l, -h)}" fill="none" stroke="${col}" stroke-width="${TD.util.r2(w)}" stroke-linecap="round"/>`;
    };
    if (A.dbl && (kind === 'to' || kind === 'implies')) return { svg: one(-0.2 * PT, XY.dblL, XY.dblH, 0.3), back: 2.1 * PT };
    if (kind === 'tail' && !A.dbl) return { svg: one(0, XY.tipL, XY.tipH, 0.4, -1), back: 0 };
    if (A.dbl || (kind !== 'to' && kind !== 'to2')) return fallback(kind, P, u, w, col);
    return { svg: one(0, XY.tipL, XY.tipH, 0.4) + (kind === 'to2' ? one(3 * PT, XY.tipL, XY.tipH, 0.4) : ''), back: 0 };
  }
  XY.dblL = 4.6 * PT; XY.dblH = 2.7 * PT;
  XY.tipL = 5.1 * PT; XY.tipH = 1.55 * PT;
  // a place: < and > shave to the ends, each further one slides 3pt (\jot) on; (f) the fraction; /d/ a slide
  // → { d0, d1, f, slide } (cd.js picks the point d0 + f(len - d0 - d1) + slide along the arrow)
  function place(v) {
    v = unbrace(v).trim();
    let d0 = 0, d1 = 0, f = 0.5, s0 = false, s1 = false, slide = 0, frac = false;
    for (let i = 0; i < v.length; i++) {
      const c = v[i];
      if (c === '<') { if (s0) d0 += 3 * PT; s0 = true; f = 0; }
      else if (c === '>') { if (s1) d1 += 3 * PT; s1 = true; f = 1; }
      else if (c === '-') f = 0.5;
      else if (c === '(') { const j = v.indexOf(')', i); const x = parseFloat(v.slice(i + 1, j)); if (isFinite(x)) { f = x; frac = true; } i = j < 0 ? v.length : j; }
      else if (c === '/') { const j = v.indexOf('/', i + 1); const l = D.length(v.slice(i + 1, j)); if (l != null) slide = l; i = j < 0 ? v.length : j; }
    }
    return { d0, d1, f, slide, centre: frac && !s0 && !s1 };
  }
  // a turn's label as a tikz-cd label: { t, swap, opts }
  const turnLabel = (L) => ({ t: L.t, swap: L.side === '_', opts: [L.side === '|' ? 'description' : '', L.place ? `xy at={${L.place}}` : ''].filter(Boolean) });
  function profile(cdEnv) {
    let rs = XY.sep, cs = XY.sep, margin = XY.margin, lab = XY.label;
    for (const it of Z.opts(cdEnv).list) {
      const { name, arg } = Z.styleOf(it);
      if (name !== 'xy') continue;
      for (const part of unbrace(arg).split(/(?=@)/).filter(Boolean)) {
        const m = /^@([RCML]?)([+-]?)=?(.*)$/.exec(part);
        const l = m && D.length(m[3]);
        if (!m || l == null || (!m[2] && !/=/.test(part))) continue;
        const set = (v) => (m[2] === '+' ? v + l : m[2] === '-' ? v - l : l);
        if (m[1] === 'R') rs = set(rs); else if (m[1] === 'C') cs = set(cs); else if (m[1] === 'M') margin = set(margin); else if (m[1] === 'L') lab = set(lab);
        else if (!m[1]) { rs = set(rs); cs = set(cs); }
      }
    }
    return {
      rs, cs, margin, labPad: 2 * lab, shift: XY.shift, curve: XY.curve, tip,
      at: place, turnR: XY.turn, label: turnLabel,
      item(A, name, arg, it, warn) {
        if (name === 'bend left' || name === 'bend right') { A.bend = name === 'bend left' ? 1 : -1; if (A.curve == null) A.curve = XY.curve; return true; }
        if (name === 'xy bend') { const l = D.length(unbrace(arg)); A.curve = l == null ? XY.curve : l; if (A.bend == null) A.bend = 1; return true; }
        if (name === 'xy style') { warn(`The arrow style @${unbrace(arg)} isn't drawn here (it is kept in the code)`); return true; }
        if (name === 'xy') { warn(`The arrow part ${unbrace(arg)} isn't drawn here (it is kept in the code)`); return true; }
        if (name === 'xy turns') { const T = readTurns(unbrace(arg), 0); A.turns = T.list; return true; }
        if (name === 'xy target') { warn(`The arrow target ${unbrace(arg)} isn't drawn here (it is kept in the code)`); A.phantom = true; return true; }
        return false;
      },
    };
  }
  const cache = new Map();
  // a layout of tikz-cd code with xy's geometry (the editor's model is tikz-cd code)
  function layoutCd(s) {
    const key = [s.src, TD.math && TD.math.engine, s.minCell || 0].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = D.build(s, profile(D.unwrap(s.src).env));
    if (TD.measuring && TD.measuring()) return L;
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  const layout = (s) => layoutCd({ ...s, src: toCd(s.src) });
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };
  const draw = (s, ctx) => D.draw(s, ctx, layout(s));
  function fullCode(src) {
    const t = String(src || '').trim();
    return /\\xymatrix/.test(t) ? t : `\\xymatrix{\n${t}\n}`;
  }

  // ---------------------------------------------------------------- converting: xymatrix ↔ real tikz-cd
  // The editor's dialect above keeps xy's parts in "xy …" options. These turn it into tikz-cd that LaTeX
  // compiles (and back): curves become bend angles, turns a to path with rounded corners, objects node
  // options, places pos=. Anything with no counterpart is reported, and the block remembers the code it
  // came from, so converting back without an edit in between gives that code exactly.
  const KB = 0.75 * 0.3915; // TikZ's bend: the curve's middle sits 0.75 × 0.3915 × the chord × sin(angle) off it
  const RAD = Math.PI / 180;
  const ptOf = (px) => f(px / PT);
  const DIR8 = ['dl', 'd', 'dr', 'r', 'ur', 'u', 'ul', 'l'];
  const ANG = { r: 0, ur: 45, ru: 45, u: 90, ul: 135, lu: 135, l: 180, dl: -135, ld: -135, d: -90, dr: -45, rd: -45 };
  // the length a tikz-cd arrow has between two cells' borders
  function nodeOf(L, r, c) {
    const n = L.nodes.find((m) => m.cell[0] === r && m.cell[1] === c);
    return n || { x: L.geo.cx[c], y: L.geo.cy[r], w: 0, h: 0 };
  }
  function chord(L, r1, c1, r2, c2) {
    const S = nodeOf(L, r1, c1), T = nodeOf(L, r2, c2), dx = T.x - S.x, dy = T.y - S.y, d = Math.hypot(dx, dy) || 1;
    const trim = (n) => Math.min(Math.abs(dx) > 1e-9 ? (n.w / 2) * (d / Math.abs(dx)) : Infinity, Math.abs(dy) > 1e-9 ? (n.h / 2) * (d / Math.abs(dy)) : Infinity);
    const e0 = trim(S), e1 = trim(T);
    return Object.assign(new Number(Math.max(1, d - e0 - e1)), { e0, e1, d });
  }
  // a curve's offset → bend angle (and looseness past 60°); an angle back → offset, kept to round values
  function bendOf(off, len) {
    const k = off / (KB * len);
    let a = k <= 0.866 ? Math.asin(k) / RAD : 60, loose = k <= 0.866 ? 1 : k / 0.866;
    a = Math.abs(a - Math.round(a)) < 0.3 ? Math.round(a) : Math.round(a * 10) / 10;
    return { a, loose: Math.round(loose * 100) / 100 };
  }
  function lenText(px) {
    const pt = px / PT, q = pt / 3;
    if (Math.abs(q - Math.round(q)) < 0.02 && Math.round(q)) { const pc = Math.round(q) / 4; return `${f(pc).replace(/^0\./, '.')}pc`; }
    return `${f(pt)}pt`;
  }
  const near = (a, b) => Math.abs(a - b) < 0.05 * PT;
  const unq = (o) => Z.styleOf(o);
  // emit tikz-cd or xymatrix rows with their & lined up
  function rowsText(rows, pad) {
    rows.forEach((p) => { while (p.length > 1 && !p[p.length - 1]) p.pop(); });
    // xymatrix only has the entries a row's & signs make: keep every one an arrow could point at
    if (pad) { const C = Math.max(0, ...rows.map((p) => p.length)); rows.forEach((p) => { while (p.length < C) p.push(''); }); }
    const C = Math.max(0, ...rows.map((p) => p.length)), w = [];
    for (let c = 0; c < C; c++) w[c] = Math.max(0, ...rows.map((p) => (p[c] || '').length));
    return rows.map((p, r) => '  ' + p.map((t, c) => (c < p.length - 1 ? t.padEnd(w[c]) + ' & ' : t)).join('').replace(/\s+$/, '') + (r < rows.length - 1 ? ' \\\\' : ''));
  }

  // *+[o][F]{…} → tikz-cd node options; and back
  function objToNode(obj, warn) {
    let m = 0, i = 1;
    const o = [];
    const s = obj.trim();
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '+' || c === '-') {
        const d = s[i + 1] === '<' ? delim(s, i + 1, '<', '>') : null;
        const l = d ? D.length(d.v) : 3 * PT;
        m += (c === '+' ? 1 : -1) * (l == null ? 0 : l); i = d ? d.end : i + 1; continue;
      }
      if (c === '[') {
        const d = delim(s, i, '[', ']');
        if (!d) break;
        const v = d.v.trim();
        if (v === 'o') o.push('circle');
        else if (v === 'F') o.push('draw');
        else if (v === 'F--') o.push('draw', 'dashed');
        else if (v === 'F.') o.push('draw', 'dotted');
        else if (v === 'F=') o.push('draw', 'double');
        else warn(`The object part [${v}] has no tikz-cd counterpart`);
        i = d.end; continue;
      }
      if (c === '!' || c === '=') { warn(`The object part ${c} has no tikz-cd counterpart`); i++; continue; }
      warn(`The object ${obj} has no tikz-cd counterpart`); break;
    }
    // xy's entries have a 3pt margin, tikz-cd's cells 0.333em: the same to a few hundredths of a point
    if (!near(m, 3 * PT)) o.push(`inner sep=${ptOf(Math.max(0, m))}pt`);
    return [...new Set(o)].join(', ');
  }
  function nodeToObj(node, warn) {
    let draw = '', round = false, m = null;
    for (const it of Z.opts(node).list) {
      const { name, arg } = unq(it);
      if (name === 'draw' && (arg == null || unbrace(arg) !== 'none')) draw = draw || 'F';
      else if (name === 'circle') round = true;
      else if (name === 'dashed') draw = 'F--';
      else if (name === 'dotted') draw = 'F.';
      else if (name === 'double') draw = 'F=';
      else if (name === 'inner sep') m = D.length(unbrace(arg));
      else if (name === 'rectangle') continue;
      else warn(`The cell option "${it}" has no xymatrix counterpart`);
    }
    if (!draw && !round && m == null) return null;
    if (draw === 'F--' || draw === 'F.' || draw === 'F=') draw = draw || 'F';
    const mg = m == null || near(m, 3 * PT) ? '+' : !m ? '' : `+<${ptOf(m)}pt>`;
    return `*${mg}${round ? '[o]' : ''}${draw ? `[${draw}]` : ''}`;
  }

  // ---- xymatrix → tikz-cd
  function toTikzcd(src) {
    const warns = [];
    const warn = (w) => { if (!warns.includes(w)) warns.push(w); };
    const dia = toCd(src), P = D.parse(dia), L = layoutCd({ src: dia });
    const { env } = unwrap(src);
    const PRf = profile(`xy={${env || ''}}`);
    // spacing: tikz-cd's own is 1.8em between rows and 2.4em (= xy's 2pc) between columns
    const eo = [], given = {};
    for (const part of String(env || '').split(/(?=@)/).filter(Boolean)) {
      const m = /^@([RCML]?)=(.+)$/.exec(part);
      if (m) { given[m[1]] = m[2]; continue; }
      if (/^@([RCML]?)[+-]=?/.test(part)) { given[/^@([RCML]?)/.exec(part)[1] + '~'] = true; continue; }
      warn(`The diagram option ${part} has no tikz-cd counterpart`);
    }
    const rowT = given.R != null ? given.R : given[''] != null ? given[''] : null, colT = given.C != null ? given.C : given[''] != null ? given[''] : null;
    if (!near(PRf.rs, D.SEPS.row.normal * D.EM)) eo.push(`row sep=${rowT != null && near(D.length(rowT), PRf.rs) ? rowT : lenText(PRf.rs)}`);
    if (!near(PRf.cs, D.SEPS.column.normal * D.EM)) eo.push(`column sep=${colT != null && near(D.length(colT), PRf.cs) ? colT : lenText(PRf.cs)}`);
    if (eo.length === 2 && eo[0].slice(8) === eo[1].slice(11)) eo.splice(0, 2, `sep=${eo[0].slice(8)}`);
    if (!near(PRf.margin, XY.margin)) eo.push(`cells={inner sep=${ptOf(PRf.margin)}pt}`);
    if (!near(PRf.labPad, 2 * XY.label)) eo.push(`labels={inner sep=${ptOf(PRf.labPad / 2)}pt}`);
    const ref = (r, c, r0, c0, r1, c1) => (r === r0 && c === c0 ? '\\tikztostart' : r === r1 && c === c1 ? '\\tikztotarget' : `\\tikzcdmatrixname-${r + 1}-${c + 1}`);
    // tikz-cd has no node in an empty cell, so one an arrow points at gets {}
    const aim = new Set();
    P.cells.forEach((row, r) => row.forEach((cl, c) => cl.arrows.forEach((ar) => { const [dr, dc] = D.delta(ar.dirs); aim.add(`${r + dr},${c + dc}`); })));
    const rows = P.cells.map((row, r) => row.map((cl, c) => {
      let node = '';
      if (cl.node != null) { const m = /^\s*xy object=\{([\s\S]*)\}\s*$/.exec(cl.node); node = m ? objToNode(m[1], warn) : cl.node; }
      const arrows = [];
      cl.arrows.forEach((ar, ai) => {
        const [dr, dc] = D.delta(ar.dirs);
        const r2 = r + dr, c2 = c + dc, len = () => chord(L, r, c, r2, c2);
        const out = [ar.dirs];
        let bend = 0, amt = null, drop = false;
        for (const it of ar.items) {
          const lab = D.label(it);
          if (lab) {
            const o = [];
            for (const x of lab.opts) {
              const { name, arg } = unq(x);
              if (name !== 'xy at') { o.push(x); continue; }
              const v = place(arg);
              if (!v.centre && !v.d0 && !v.d1 && !v.slide) { o.push(v.f === 0 ? 'at start' : v.f === 1 ? 'at end' : NAMED[v.f] != null ? NAMED[v.f] : `pos=${f(v.f)}`); continue; }
              const l = len(), L0 = +l;
              const dist = v.centre ? -l.e0 + v.f * l.d + v.slide : v.d0 + v.f * (L0 - v.d0 - v.d1) + v.slide;
              o.push(`pos=${f(Math.max(0, Math.min(1, dist / L0)))}`);
            }
            out.push(D.labelCode({ t: lab.t, swap: lab.swap, opts: o.filter(Boolean) }));
            continue;
          }
          const { name, arg } = unq(it);
          if (name === 'bend left' || name === 'bend right') { bend = name === 'bend left' ? 1 : -1; continue; }
          if (name === 'xy bend') { amt = D.length(unbrace(arg)); continue; }
          if (name === 'xy turns') {
            const a = L.arrows.find((x) => x.src.length === 3 && x.src[0] === r && x.src[1] === c && x.src[2] === ai && x.route);
            const T = readTurns(unbrace(arg), 0).list;
            const tp = a && turnsToPath(a, T, r, c, r2, c2, ref, L);
            if (!tp) { warn('A turning arrow could not be written as a to path; it is drawn straight'); continue; }
            out.push(...tp);
            continue;
          }
          if (name === 'xy') {
            const m = /^@\(\s*([udlr]{1,2})\s*,\s*([udlr]{1,2})\s*\)$/.exec(unbrace(arg).trim());
            if (m && ANG[m[1]] != null && ANG[m[2]] != null) out.push(`out=${ANG[m[1]]}`, `in=${ANG[m[2]]}`);
            else warn(`The arrow part ${unbrace(arg)} has no tikz-cd counterpart`);
            continue;
          }
          if (name === 'xy style') { warn(`The arrow style @${unbrace(arg)} has no tikz-cd counterpart; it is drawn as ->`); continue; }
          if ((name === 'shift left' || name === 'shift right') && /^\.56ex$/.test(unbrace(arg))) { out.push(name); continue; }
          if (name === 'xy target') { warn(`The arrow target ${unbrace(arg)} has no tikz-cd counterpart; the arrow is left out`); drop = true; continue; }
          out.push(it);
        }
        if (drop) return;
        if (bend) {
          const b = bendOf(amt == null ? XY.curve : amt, len());
          out.splice(1, 0, `bend ${bend > 0 ? 'left' : 'right'}${b.a === 30 ? '' : `=${b.a}`}`);
          if (b.loose !== 1) out.splice(2, 0, `looseness=${b.loose}`);
        }
        arrows.push(`\\arrow[${out.join(', ')}]`);
      });
      const t = !cl.t.trim() && !node && aim.has(`${r},${c}`) ? '{}' : cl.t;
      return [node ? `|[${node}]|` : '', t, ...arrows].filter(Boolean).join(' ');
    }));
    // an arrow may point past a row's last cell: those rows get empty cells up to it
    aim.forEach((k) => { const [r, c] = k.split(',').map(Number); if (rows[r]) { while (rows[r].length <= c) rows[r].push(''); if (!rows[r][c]) rows[r][c] = '{}'; } });
    const code = `\\begin{tikzcd}${eo.length ? `[${eo.join(', ')}]` : ''}\n${rowsText(rows).join('\n')}\n\\end{tikzcd}`;
    return { code, warnings: warns };
  }
  // xy's turns as a to path: through each corner (as cell coordinates where it lies on their lines), the
  // corners rounded by the turn radius; a turn's labels sit on the piece before it
  function turnsToPath(a, turns, r0, c0, r1, c1, ref, L) {
    const corners = a.route.filter((e) => e.k === 'A');
    if (corners.length !== turns.length) return null;
    const G = L.geo, S = { x: G.cx[c0], y: G.cy[r0] };
    // a column (row) is named by a cell in it that has a node: the arrow's own ends first
    const has = (r, c) => L.nodes.some((n) => n.cell[0] === r && n.cell[1] === c);
    const colRef = (c) => { if (c === c0) return ref(r0, c0, r0, c0, r1, c1); if (c === c1) return ref(r1, c1, r0, c0, r1, c1); const n = L.nodes.find((m) => m.cell[1] === c); return n && ref(n.cell[0], c, r0, c0, r1, c1); };
    const rowRef = (r) => { if (r === r0) return ref(r0, c0, r0, c0, r1, c1); if (r === r1 && has(r1, c1)) return ref(r1, c1, r0, c0, r1, c1); const n = L.nodes.find((m) => m.cell[0] === r); return n && ref(r, n.cell[1], r0, c0, r1, c1); };
    const parts = [];
    let rad = null;
    turns.forEach((tn, i) => {
      const V = corners[i].v;
      const ci = G.cx.findIndex((x) => Math.abs(x - V.x) < 0.5), ri = G.cy.findIndex((y) => Math.abs(y - V.y) < 0.5);
      let X = ci >= 0 ? colRef(ci) : null, Y = ri >= 0 ? rowRef(ri) : null;
      const st = '\\tikztostart';
      if (X === st && !Y) X = null;
      if (Y === st && !X) Y = null;
      const dx = ptOf(V.x - S.x), dy = ptOf(S.y - V.y);
      let txt;
      if (X && Y) txt = X === Y ? `${X}.center` : `${X}.center |- ${Y}.center`;
      else if (X) txt = `[yshift=${dy}pt]\\tikztostart.center -| ${X}.center`;
      else if (Y) txt = `[xshift=${dx}pt]\\tikztostart.center |- ${Y}.center`;
      else txt = `[${[+dx ? `xshift=${dx}pt` : '', +dy ? `yshift=${dy}pt` : ''].filter(Boolean).join(', ')}]\\tikztostart.center`;
      parts.push(`-- (${txt})`);
      for (const lb of tn.labels || []) {
        const v = lb.place ? place(lb.place) : null;
        const pos = !v ? 'midway' : !v.d0 && !v.d1 && !v.slide ? `pos=${f(v.f)}` : 'midway';
        const side = lb.side === '|' ? 'fill=white' : lb.side === '_' ? 'auto, swap' : 'auto';
        parts.push(`node[${pos}, ${side}, inner sep=0.5ex] {$\\scriptstyle ${lb.t}$}`);
      }
      if (rad == null) rad = tn.r != null ? tn.r : XY.turn;
    });
    parts.push('-- (\\tikztotarget) \\tikztonodes');
    return [`rounded corners=${ptOf(rad)}pt`, `to path={${parts.join(' ')}}`];
  }

  // ---- tikz-cd → xymatrix
  function fromTikzcd(src) {
    const warns = [];
    const warn = (w) => { if (!warns.includes(w)) warns.push(w); };
    const P = D.parse(src), L = TD.cdLayout({ type: 'cd', src });
    const DEFS = D.styleDefs(src, P.env.list);
    const expand = (items) => {
      const out = [], work = items.slice();
      let g = 0;
      while (work.length) {
        const it = work.shift(), { name, arg } = unq(it);
        if (!D.label(it) && DEFS[name] != null && g++ < 200) { work.unshift(...Z.opts(DEFS[name].replace(/#1/g, arg == null ? '' : unbrace(arg))).list); continue; }
        out.push(it);
      }
      return out;
    };
    // the diagram's options
    let xe = '', rsT = null, csT = null;
    const sepText = (kind, v) => {
      const parts = Z.opts(unbrace(v)).list;
      if (parts.includes('between origins')) warn('"between origins" has no xymatrix counterpart; the spacing is kept between the entries\' edges');
      let px = 0, txt = [];
      for (const p of parts) {
        if (p === 'between origins' || p === 'between borders') continue;
        if (D.SEPS[kind][p] != null) { px += D.SEPS[kind][p] * D.EM; txt.push(`${D.SEPS[kind][p]}em`); continue; }
        const l = D.length(p);
        if (l != null) { px += l; txt.push(p); }
      }
      return { px, t: txt.length === 1 ? txt[0] : lenText(px) };
    };
    for (const it of P.env.list) {
      const { name, arg } = unq(it);
      if (name === 'row sep') rsT = sepText('row', arg);
      else if (name === 'column sep') csT = sepText('column', arg);
      else if (name === 'sep') { rsT = sepText('row', arg); csT = sepText('column', arg); }
      else if (name === 'cells' || name === 'nodes') { const m = /inner sep\s*=\s*([^,}]+)/.exec(String(arg || '')); if (m) xe += `@M=${m[1].trim()}`; else warn(`The diagram option "${it}" has no xymatrix counterpart`); }
      else if (name === 'labels') { const m = /inner sep\s*=\s*([^,}]+)/.exec(String(arg || '')); if (m) xe += `@L=${m[1].trim()}`; else warn(`The diagram option "${it}" has no xymatrix counterpart`); }
      else if (/\/\.style\s*$/.test(name) || /^(ampersand replacement|math mode|cramped|baseline)$/.test(name)) continue;
      else warn(`The diagram option "${it}" has no xymatrix counterpart`);
    }
    rsT = rsT || { px: D.SEPS.row.normal * D.EM, t: `${D.SEPS.row.normal}em` };
    csT = csT || { px: D.SEPS.column.normal * D.EM, t: `${D.SEPS.column.normal}em` };
    const rDef = near(rsT.px, XY.sep), cDef = near(csT.px, XY.sep);
    let xs = '';
    if (!rDef && !cDef && near(rsT.px, csT.px)) xs = `@=${rsT.t}`;
    else xs = `${rDef ? '' : `@R=${rsT.t}`}${cDef ? '' : `@C=${csT.t}`}`;
    // arrows, each in its source cell (from= moves it there)
    const R = P.cells.length;
    const outCells = P.cells.map((row) => row.map((cl) => ({ cl, arrows: [] })));
    const C = Math.max(0, ...P.cells.map((r) => r.length));
    P.cells.forEach((row, r) => row.forEach((cl, c) => cl.arrows.forEach((ar, ai) => {
      let dirs = ar.dirs, back = false;
      const items = expand(ar.items).filter((x) => { const k = /^(from|to)\s*=\s*([rlud]+)\s*$/.exec(x); if (k && !dirs) { dirs = k[2]; back = k[1] === 'from'; } return !k; });
      if (!dirs) { warn('An arrow with no direction is left out'); return; }
      const [dr, dc] = D.delta(dirs);
      const r1 = back ? r + dr : r, c1 = back ? c + dc : c;
      if (back) dirs = dirs.replace(/[rlud]/g, (x) => ({ r: 'l', l: 'r', u: 'd', d: 'u' })[x]);
      if (!(r1 >= 0 && r1 < R && c1 >= 0 && c1 < C) || !outCells[r1][c1]) { warn('An arrow pointing outside the diagram is left out'); return; }
      const la = L.arrows.find((x) => x.src.length === 3 && x.src[0] === r && x.src[1] === c && x.src[2] === ai);
      outCells[r1][c1].arrows.push(arrowToDialect(dirs, items, r1, c1, la, L, warn));
    })));
    const rows = outCells.map((row) => row.map(({ cl, arrows }) => {
      let t = cl.t;
      if (cl.node != null) {
        // |[red]| colours the object: \textcolor{red}{…} in xymatrix
        let col = null;
        const rest = Z.opts(cl.node).list.filter((x) => { const c = D.colorOpt(x); if (c && c.key !== 'draw') { col = c.spec; return false; } return true; });
        if (col && !D.splitColor(t).spec) t = D.joinColor(col, t);
        const o = rest.length ? nodeToObj(rest.join(', '), warn) : null;
        if (o) t = `${o}{${t}}`;
      }
      return [t, ...arrows.filter(Boolean).map((a) => arrowXy(a))].filter(Boolean).join(' ');
    }));
    const code = `\\xymatrix${xs}${xe}{\n${rows.length && rows.some((p) => p.some(Boolean)) ? rowsText(rows, true).join('\n') + '\n' : ''}}`;
    return { code, warnings: warns };
  }
  // one real tikz-cd arrow → the dialect's { dirs, items } (what arrowXy writes as \ar)
  function arrowToDialect(dirs, items, r, c, la, L, warn) {
    const [dr, dc] = D.delta(dirs), out = [];
    let bend = 0, ang = null, loose = 1, inA = null, outA = null, toPath = null, rc = null;
    for (const it of items) {
      const lab = D.label(it);
      if (lab) {
        if (!lab.t.trim()) continue;
        const o = [];
        for (const x of lab.opts) {
          const { name } = unq(x);
          if (name === 'at start') o.push('xy at={<}');
          else if (name === 'at end') o.push('xy at={>}');
          else if (name === 'description' || name === 'pos' || name in POS || D.colorOpt(x)) o.push(x);
          else warn(`The label option "${x}" has no xymatrix counterpart`);
        }
        out.push(D.labelCode({ t: lab.t, swap: lab.swap, opts: o }));
        continue;
      }
      const { name, arg } = unq(it);
      if (name === 'bend left' || name === 'bend right') { bend = name === 'bend left' ? 1 : -1; ang = arg == null ? 30 : parseFloat(unbrace(arg)) || 0; continue; }
      if (name === 'looseness') { loose = parseFloat(arg) || 1; continue; }
      if (name === 'in') { inA = parseFloat(arg); continue; }
      if (name === 'out') { outA = parseFloat(arg); continue; }
      if (name === 'to path') { toPath = unbrace(arg); continue; }
      if (name === 'rounded corners') { rc = arg == null ? 4 * PT : D.length(unbrace(arg)); continue; }
      if (name === 'sharp corners' || name === 'execute at begin to') continue;
      if (name === 'draw' && /^none$/.test(unbrace(arg))) { out.push('phantom'); continue; }
      if (name === 'shift left' || name === 'shift right') { out.push(arg == null ? `${name}=.56ex` : it); continue; }
      if (TD.CD_HEADS[name] || LINE.test(name) || /^(phantom|description|swap|'|pos)$/.test(name) || name in POS || D.colorOpt(it)) { out.push(it); continue; }
      warn(`The arrow option "${it}" has no xymatrix counterpart`);
    }
    if (bend && !toPath) {
      const l = chord(L, r, c, r + dr, c + dc), off = KB * l * loose * Math.sin(Math.abs(ang) * RAD);
      const side = bend * Math.sign(ang || 1);
      out.push(side > 0 ? 'bend left' : 'bend right');
      if (!near(off, XY.curve)) out.push(`xy bend=${lenText(off)}`);
    }
    if (inA != null || outA != null) {
      const nm = (a) => { const k = ((Math.round(a) % 360) + 360) % 360; return Object.keys(ANG).find((n) => n.length <= 2 && ((ANG[n] % 360) + 360) % 360 === k && !/^(ru|lu|ld|rd)$/.test(n)); };
      const a = nm(outA != null ? outA : 0), b = nm(inA != null ? inA : 180);
      if (a && b && (outA == null || outA % 45 === 0) && (inA == null || inA % 45 === 0)) out.push(`xy={@(${a},${b})}`);
      else warn('"in"/"out" angles that are not a multiple of 45° have no xymatrix counterpart');
    }
    if (toPath) {
      const t = pathToTurns(toPath, rc, la, L, r, c, warn);
      if (t) out.push(`xy turns={${t}}`);
      else warn('A to path that does not turn round the diagram\'s cells has no xymatrix counterpart; it is drawn straight');
    }
    return { dirs, items: out };
  }
  // a to path drawn by the layout → xy turns: each corner a quarter turn onto the line of some cell
  function pathToTurns(tp, rc, la, L, r0, c0, warn) {
    if (!la || !la.route) return null;
    // the path's pieces and the nodes on them (piece k ends at the k-th point)
    const marks = [];
    let k = 0;
    for (let i = 0; i < tp.length;) {
      const s = tp.slice(i);
      let m;
      if ((m = /^\s+/.exec(s))) { i += m[0].length; continue; }
      if (/^(--|\|-|-\|)/.test(s)) {
        k += s[0] === '-' && s[1] === '-' ? 1 : 2;
        i += 2; i = skipWs(tp, i);
        let d = 0, j = i;
        for (; j < tp.length; j++) { if ('([{'.includes(tp[j])) d++; else if (')]}'.includes(tp[j]) && !--d) break; }
        i = j + 1; continue;
      }
      if ((m = /^\\tikztonodes\b/.exec(s))) { i += m[0].length; continue; }
      if (/^node\b/.test(s)) {
        i = skipWs(tp, i + 4);
        let o = '';
        if (tp[i] === '[') { const j = Z.close(tp, i); o = tp.slice(i + 1, j); i = skipWs(tp, j + 1); }
        const j = Z.close(tp, i), t = tp.slice(i + 1, j).trim();
        i = j + 1;
        const ol = Z.opts(o).list;
        const fill = ol.some((x) => /^fill\b/.test(x) && !/none/.test(x)), swap = ol.includes('swap');
        const pos = ol.map(unq).find((x) => x.name === 'pos');
        marks.push({ k, side: fill ? '|' : swap ? '_' : '^', place: pos ? `(${f(parseFloat(pos.arg)).replace(/^0\./, '.')})` : '', t: t.replace(/^\$\s*(?:\\scriptstyle\s*)?([\s\S]*)\$$/, '$1').trim() });
        continue;
      }
      return null;
    }
    const corners = la.route.filter((e) => e.k === 'A');
    if (!corners.length) return null;
    const idx = (u) => { const l = Math.hypot(u.x, u.y) || 1; return D.D8.findIndex((d) => d.x * u.x / l + d.y * u.y / l > 0.99); };
    const G = L.geo, R = G.cy.length, C = G.cx.length, tol = Math.max(3 * PT, 0.3 * Math.min(G.cs, G.rs)), cross = (u, v) => u.x * v.y - u.y * v.x;
    let last = 3, p = { x: G.cx[c0], y: G.cy[r0] };
    const out = [];
    const rad = rc == null ? 0 : rc, Rr = rad || XY.turn;
    const first = la.route[0];
    let moved = false;
    for (let i = 0; i < corners.length; i++) {
      const e = corners[i], V = e.v, inn = idx({ x: V.x - e.p.x, y: V.y - e.p.y }), o = idx({ x: e.q.x - V.x, y: e.q.y - V.y });
      if (inn < 0 || o < 0 || ![2, 6].includes((o - inn + 8) % 8)) return null;
      const din = D.D8[inn], dout = D.D8[o], start = i ? p : first.k === 'L' ? first.p : e.p;
      // the cell xy would turn round to put this corner here: on the line out of the corner, or (when that
      // line lies behind the start) any cell on the turn's side, the corner then sitting a radius past the start
      let best = null;
      for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
        const cc = { x: G.cx[c], y: G.cy[r] }, nl = { x: din.y, y: -din.x };
        const side = (cc.x - p.x) * nl.x + (cc.y - p.y) * nl.y;
        if (Math.abs(side) < 1e-6 || (inn + (side > 0 ? 2 : 6)) % 8 !== o) continue;
        const sc = cross({ x: cc.x - p.x, y: cc.y - p.y }, dout) / cross(din, dout);
        let K = { x: p.x + din.x * sc, y: p.y + din.y * sc };
        if ((K.x - din.x * Rr - start.x) * din.x + (K.y - din.y * Rr - start.y) * din.y < 0) K = { x: start.x + din.x * Rr, y: start.y + din.y * Rr };
        const d = Math.hypot(K.x - V.x, K.y - V.y), far = Math.hypot(cc.x - V.x, cc.y - V.y);
        if ((!best || d < best.d - 0.5 || (Math.abs(d - best.d) <= 0.5 && far < best.far))) best = { r, c, d, far };
      }
      if (!best) return null;
      if (best.d >= tol) moved = true;
      const dr = best.r - r0, dc = best.c - c0;
      const dirs = (dr > 0 ? 'd' : 'u').repeat(Math.abs(dr)) + (dc > 0 ? 'r' : 'l').repeat(Math.abs(dc));
      const labs = marks.filter((m) => m.k === i + 1).map((m) => `${m.side}${m.place}{${m.t}}`).join('');
      const rr = near(rad, XY.turn) || !rad ? '' : `/${ptOf(rad)}pt`;
      out.push(`\`${inn !== last ? DIR8[inn] : ''}${rr}[${dirs}]${labs}`);
      last = o; p = e.q;
    }
    if (moved) warn('A to path\'s corners are moved to where xymatrix turns can put them');
    if (marks.some((m) => m.k > corners.length + 1)) warn('Labels on a to path past its last turn are left out');
    return out.join(' ');
  }
  // a block's code in the other language: what it came from if it hasn't been edited since
  function convert(s) {
    const toXy = s.type === 'cd';
    if (s.conv && s.conv.from === (toXy ? 'xy' : 'cd') && s.conv.out === s.src) return { code: s.conv.src, warnings: [], restored: true };
    return toXy ? fromTikzcd(s.src) : toTikzcd(s.src);
  }
  // turn the block into the other language in place, keeping its centre; converting back unedited restores the original
  function switchType(s) {
    const toXy = s.type === 'cd', bb = (x) => (x.type === 'cd' ? TD.cdLayout(x) : layout(x)).bb;
    const b0 = bb(s), r = convert(s), from = s.src;
    s.type = toXy ? 'xy' : 'cd'; s.src = r.code;
    s.conv = r.restored ? null : { from: toXy ? 'cd' : 'xy', src: from, out: r.code };
    if (!s.conv) delete s.conv;
    const b1 = bb(s);
    s.x += (b0.w - b1.w) / 2; s.y += (b0.h - b1.h) / 2;
    const name = toXy ? 'xymatrix' : 'tikz-cd';
    if (r.restored) return 'Restored the original code';
    if (!r.warnings.length) return `Converted to ${name}`;
    return { text: `Converted to ${name}. ${r.warnings.join('. ')}.`, ms: 5000 };
  }

  TD.TYPES.xy = {
    name: 'XyMatrix',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'xy', x: p.x, y: p.y, src: TD.XY_DEFAULT, color: '#000000' }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // xy draws its own picture: in a plain node, with the outer picture interrupted
    tikz(s, X) {
      X.pkgs.add('xy');
      // a coloured arrow (\ar@[red]) needs xy's color option; \textcolor comes with xcolor, which TikZ loads
      if ([...String(s.src).matchAll(/@\[([^\]]*)\]/g)].some((m) => TD.tikzColor && TD.tikzColor(m[1]))) X.pkgs.add('xy:color');
      // xymatrix's box holds only its entries (curves and labels may stick out), so centre the node on them
      const L = layout(s), b = L.bb, e = L.ebox || b;
      return `\\node at ${X.c(s.x + e.x - b.x + e.w / 2, s.y + e.y - b.y + e.h / 2)} {\\pgfinterruptpicture%\n$${fullCode(s.src)}$%\n\\endpgfinterruptpicture};`;
    },
  };

  TD.panels = TD.panels || {};
  TD.panels.xy = {
    html(s) {
      const L = layout(s);
      return `<div class="sec"><div class="sec-title">xymatrix <small>${L.R} × ${L.C}</small></div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="7">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Double-click the diagram to edit it visually. Exported with <code>\\usepackage[all]{xy}</code>.</div></div>
        <div class="sec"><button class="wide primary" data-act="editxy">Edit Diagram…</button><button class="wide" data-act="copyxy">Copy xymatrix Code</button><button class="wide" data-act="toCd">Convert to tikz-cd</button></div>`;
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editxy') { if (TD.xyOpen) TD.xyOpen(s.id); return; }
      if (act === 'toCd') return switchType(s);
      if (act !== 'copyxy') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('xymatrix Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied xymatrix code';
    },
  };
  // the editor's dialect (cdeditor.js): its model stays tikz-cd code
  TD.xy = { toTikzcd, fromTikzcd, convert, switchType, unwrap, cell, toCd, fromCd, cellToCd, cellFromCd, arrowXy, layout, layoutCd, draw, fullCode, specItems, specOf, XY };
})();
