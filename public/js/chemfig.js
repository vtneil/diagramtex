// Chemistry with the chemfig package: structural formulas (\chemfig{…}) and reaction schemes
// (\schemestart … \schemestop). The source is the object. It is read into a tree that keeps every piece as
// written, laid out here by chemfig's own rules (read from chemfig.tex 1.6: atom sep 3em, bond offset 2pt,
// double bond sep 2pt, cram width 1.5ex, rings turning 360/n from -90+180/n, departure and arrival atoms
// by the bond's angle, compound sep 5em, arrow offset 1em), drawn as vectors, and exported unchanged in a
// node at the drawing's top left. The visual editor (js/cfeditor.js) edits the tree and writes it back.
(function () {
  const TD = window.TD;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX, PT = 1 / K;
  const EM = 10 * PT, EX = 4.3056 * PT;
  const LW = 0.4 * PT;
  const TEXT = { size: 10 * PT, font: 'default' };
  const DEF = { sep: 3 * EM, boff: 2 * PT, dsep: 2 * PT, cram: 1.5 * EX, dashOn: 1 * PT, dashOff: 2 * PT, inc: 45, csep: 5 * EM, aoff: 1 * EM, acoeff: 1, aangle: 0, lsep: 3 * PT, plusL: 0.5 * EM, plusR: 0.5 * EM, nameSep: 1.5 * EX };

  TD.CHEM_DEFAULT = '\\chemfig{H_3C-C(=[1]O)-[7]OH}';

  // ---------------------------------------------------------------- reading
  function close(s, i) {
    const open = s[i], shut = { '{': '}', '[': ']', '(': ')' }[open];
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const c = s[k];
      if (c === '\\') { k++; continue; }
      if (c === '{' && open !== '{') { k = close(s, k); if (k < 0) return -1; continue; }
      if (c === open) d++;
      else if (c === shut && --d === 0) return k;
    }
    return -1;
  }
  function split(s, sep = ',') {
    const out = [];
    let d = 0, cur = '';
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (c === '\\') { cur += c + (s[i + 1] || ''); i++; continue; }
      if ('{['.includes(c)) d++;
      else if ('}]'.includes(c)) d--;
      if (c === sep && d === 0) { out.push(cur); cur = ''; continue; }
      cur += c;
    }
    out.push(cur);
    return out;
  }
  const unbrace = (v) => { v = String(v ?? '').trim(); while (v[0] === '{' && close(v, 0) === v.length - 1) v = v.slice(1, -1).trim(); return v; };
  const skipWs = (s, i) => { while (i < s.length && /\s/.test(s[i])) i++; return i; };
  // a length → px ("3em", "2pt", "1cm", or a bare number of pt)
  function len(v, dflt) {
    const m = /^\s*(-?[\d.]+)\s*(cm|mm|pt|em|ex|in|bp)?\s*$/.exec(String(v ?? ''));
    if (!m) return dflt;
    const n = parseFloat(m[1]);
    return n * ({ cm: PX, mm: PX / 10, pt: PT, em: EM, ex: EX, in: 2.54 * PX, bp: (2.54 * PX) / 72 }[m[2] || 'pt']);
  }
  const BOND_START = '-=~<>';

  // The molecule tree. A chain is { opt: '[…]' or '', items }; an item is one of
  //   { t: 'atom', raw }                                         an atom group, as written (spaces kept)
  //   { t: 'bond', raw, sym, arg: [angle, len, dep, arr, tikz] or null }   sym: - = ~ > < >: <: >| <| =^ =_
  //   { t: 'branch', chain }                                     ( … )
  //   { t: 'ring', star: '*' or '**', arc: '[…]' or '', n, chain } *n( … ) and **n( … )
  // Writing the tree back gives the code as written; an edited bond is written from its fields.
  function parseChain(s, warn) {
    let i = 0;
    const chain = { opt: '', items: [] };
    const lead = /^\s*/.exec(s)[0];
    if (s[lead.length] === '[') { const e = close(s, lead.length); if (e > 0) { chain.opt = s.slice(0, e + 1); i = e + 1; } }
    let atom = '';
    const flush = () => { if (atom) { chain.items.push({ t: 'atom', raw: atom }); atom = ''; } };
    while (i < s.length) {
      const c = s[i];
      if (c === '{') { const e = close(s, i); if (e < 0) { warn('A { in the molecule is not closed'); atom += s.slice(i); break; } atom += s.slice(i, e + 1); i = e + 1; continue; }
      if (c === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
        let j = i + m[0].length;
        // a command's arguments belong to the atom
        for (;;) { const k = skipWs(s, j); if (s[k] === '{' || (s[k] === '[' && /^(charge|Charge|chemabove|chembelow|Chemabove|Chembelow)$/.test(m[1]))) { const e = close(s, k); if (e < 0) break; j = e + 1; } else break; }
        atom += s.slice(i, j); i = j; continue;
      }
      if (c === '?' && s[i + 1] === '[') { const e = close(s, i + 1); atom += s.slice(i, e < 0 ? s.length : e + 1); i = e < 0 ? s.length : e + 1; continue; }
      if (c === '@' && s[i + 1] === '{') { const e = close(s, i + 1); atom += s.slice(i, e < 0 ? s.length : e + 1); i = e < 0 ? s.length : e + 1; continue; }
      if (BOND_START.includes(c)) {
        flush();
        let j = i + 1, sym = c;
        if ((c === '>' || c === '<') && (s[j] === ':' || s[j] === '|')) { sym += s[j]; j++; }
        if (c === '=' && (s[j] === '^' || s[j] === '_')) { sym += s[j]; j++; }
        let extra = '';
        if (s[j] === '#' && s[j + 1] === '(') { const e = close(s, j + 1); if (e > 0) { extra += s.slice(j, e + 1); j = e + 1; } }
        if (s[j] === '@' && s[j + 1] === '{') { const e = close(s, j + 1); if (e > 0) { extra += s.slice(j, e + 1); j = e + 1; } }
        let arg = null;
        if (s[j] === '[') { const e = close(s, j); if (e > 0) { arg = split(s.slice(j + 1, e)).map((x) => x.trim()); j = e + 1; } }
        chain.items.push({ t: 'bond', raw: s.slice(i, j), sym, extra, arg });
        i = j; continue;
      }
      if (c === '(') {
        flush();
        const e = close(s, i);
        if (e < 0) { warn('A ( in the molecule is not closed'); i = s.length; break; }
        chain.items.push({ t: 'branch', chain: parseChain(s.slice(i + 1, e), warn) });
        i = e + 1; continue;
      }
      if (c === '*') {
        flush();
        const m = /^(\*\*?)\s*(\[[^\]]*\])?\s*(\d+)\s*\(/.exec(s.slice(i));
        if (!m) { warn('A ring is written *6( … ) or **6( … ) for an aromatic circle'); atom += c; i++; continue; }
        const o = i + m[0].length - 1, e = close(s, o);
        if (e < 0) { warn('A ring\'s ( is not closed'); i = s.length; break; }
        chain.items.push({ t: 'ring', star: m[1], arc: m[2] || '', n: Math.max(3, parseInt(m[3], 10)), nRaw: s.slice(i + m[1].length, o), chain: parseChain(s.slice(o + 1, e), warn) });
        i = e + 1; continue;
      }
      if (c === '!') { warn('Submolecules (!{…}) aren\'t drawn here (they are kept in the code)'); }
      atom += c; i++;
    }
    flush();
    return chain;
  }
  function bondCode(b) {
    if (!b.dirty) return b.raw;
    let arg = b.arg ? b.arg.slice() : null;
    if (arg) { while (arg.length && !arg[arg.length - 1]) arg.pop(); if (!arg.length) arg = null; }
    return `${b.sym}${b.extra || ''}${arg ? `[${arg.join(',')}]` : ''}`;
  }
  function writeChain(c) {
    return c.opt + c.items.map((it) => it.t === 'atom' ? it.raw : it.t === 'bond' ? bondCode(it)
      : it.t === 'branch' ? `(${writeChain(it.chain)})` : `${it.star}${it.arc}${it.nRaw != null ? it.nRaw : it.n}(${writeChain(it.chain)})`).join('');
  }

  // The whole source: a list of segments, each kept as written unless edited.
  //   { t: 'text', raw }  { t: 'mol', head: '\chemfig[…]', chain, raw }  { t: 'arrow', raw, names, type, labels: [above, below, shift], opt: [angle, coeff, style] }
  //   { t: 'plus', raw }  { t: 'name', head, inner: [segments], name, raw }  { t: 'start', raw }  { t: 'stop', raw }  { t: 'set', raw, kv }
  function parseDoc(src, warn) {
    const s = String(src || '');
    const segs = [];
    let i = 0, text = '';
    const flush = () => { if (text) { segs.push({ t: 'text', raw: text }); text = ''; } };
    const at = (w) => s.startsWith(w, i) && !/[A-Za-z]/.test(s[i + w.length] || '');
    while (i < s.length) {
      if (s[i] === '%') { const e = s.indexOf('\n', i); text += s.slice(i, e < 0 ? s.length : e); i = e < 0 ? s.length : e; continue; }
      if (at('\\schemestart')) { flush(); let j = i + 12; const k = skipWs(s, j); if (s[k] === '[') { const e = close(s, k); if (e > 0) j = e + 1; } segs.push({ t: 'start', raw: s.slice(i, j) }); i = j; continue; }
      if (at('\\schemestop')) { flush(); segs.push({ t: 'stop', raw: '\\schemestop' }); i += 11; continue; }
      if (s.startsWith('\\+', i)) { flush(); let j = i + 2; const k = skipWs(s, j); if (s[k] === '{') { const e = close(s, k); if (e > 0) j = e + 1; } segs.push({ t: 'plus', raw: s.slice(i, j) }); i = j; continue; }
      if (at('\\setchemfig')) {
        flush();
        const k = skipWs(s, i + 11);
        const e = s[k] === '{' ? close(s, k) : -1;
        if (e < 0) { text += '\\setchemfig'; i += 11; continue; }
        const kv = {};
        for (const it of split(s.slice(k + 1, e))) { const m = /^\s*([^=]+?)\s*=\s*([\s\S]*?)\s*$/.exec(it); if (m) kv[m[1]] = unbrace(m[2]); }
        segs.push({ t: 'set', raw: s.slice(i, e + 1), kv }); i = e + 1; continue;
      }
      if (at('\\chemfig')) {
        flush();
        let j = i + 8;
        for (;;) { const k = skipWs(s, j); if (s[k] === '[') { const e = close(s, k); if (e < 0) break; j = e + 1; } else break; }
        const head = s.slice(i, j), k = skipWs(s, j);
        if (s[k] !== '{') { warn('\\chemfig needs { … }'); text += head; i = j; continue; }
        const e = close(s, k);
        if (e < 0) { warn('The { after \\chemfig is not closed'); text += s.slice(i); i = s.length; continue; }
        if (head !== '\\chemfig') warn('\\chemfig\'s optional arguments aren\'t drawn here (they are kept in the code)');
        segs.push({ t: 'mol', head: s.slice(i, k), chain: parseChain(s.slice(k + 1, e), warn), raw: s.slice(i, e + 1) });
        i = e + 1; continue;
      }
      if (at('\\chemname')) {
        flush();
        let j = i + 9;
        if (s[j] === '*') j++;
        let k = skipWs(s, j);
        if (s[k] === '[') { const e = close(s, k); if (e > 0) k = skipWs(s, e + 1); }
        const e1 = s[k] === '{' ? close(s, k) : -1, k2 = e1 > 0 ? skipWs(s, e1 + 1) : -1, e2 = k2 > 0 && s[k2] === '{' ? close(s, k2) : -1;
        if (e2 < 0) { warn('\\chemname needs {molecule}{name}'); text += s.slice(i, j); i = j; continue; }
        const nm = { t: 'name', head: s.slice(i, k), inner: parseDoc(s.slice(k + 1, e1), warn), mid: s.slice(e1, k2 + 1), name: s.slice(k2 + 1, e2), raw: s.slice(i, e2 + 1) };
        for (const x of nm.inner) x.owner = nm;
        segs.push(nm);
        i = e2 + 1; continue;
      }
      if (at('\\arrow')) {
        flush();
        let j = i + 6;
        const A = { t: 'arrow', names: '', type: '->', labels: [], opt: [] };
        let k = skipWs(s, j);
        if (s[k] === '(') { const e = close(s, k); if (e > 0) { A.names = s.slice(k, e + 1); j = e + 1; k = skipWs(s, j); } }
        if (s[k] === '{') {
          const e = close(s, k);
          if (e > 0) {
            const body = s.slice(k + 1, e);
            const b = body.indexOf('[');
            A.type = (b < 0 ? body : body.slice(0, b)).trim() || '->';
            let p = b;
            while (p >= 0 && p < body.length && body[p] === '[') { const q = close(body, p); if (q < 0) break; A.labels.push(body.slice(p + 1, q)); p = skipWs(body, q + 1); }
            j = e + 1; k = skipWs(s, j);
          }
        }
        if (s[k] === '[') { const e = close(s, k); if (e > 0) { A.opt = split(s.slice(k + 1, e)).map((x) => x.trim()); j = e + 1; } }
        A.raw = s.slice(i, j);
        segs.push(A); i = j; continue;
      }
      if (at('\\subscheme') || at('\\merge')) warn('Subschemes and \\merge aren\'t drawn here (they are kept in the code)');
      if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); text += m[0]; i += m[0].length; continue; }
      if (s[i] === '{') { const e = close(s, i); if (e > 0) { text += s.slice(i, e + 1); i = e + 1; continue; } }
      text += s[i]; i++;
    }
    flush();
    return segs;
  }
  function arrowCode(A) {
    if (!A.dirty) return A.raw;
    const labels = A.labels.slice();
    while (labels.length && !labels[labels.length - 1]) labels.pop();
    const opt = A.opt.slice();
    while (opt.length && !opt[opt.length - 1]) opt.pop();
    const typ = A.type + labels.map((l) => `[${l}]`).join('');
    return `\\arrow${A.names}${typ !== '->' ? `{${typ}}` : ''}${opt.length ? `[${opt.join(',')}]` : ''}`;
  }
  function writeDoc(segs) {
    return segs.map((g) => g.t === 'mol' ? (g.dirty || g.chainDirty ? `${g.head}{${writeChain(g.chain)}}` : g.raw)
      : g.t === 'arrow' ? arrowCode(g)
        : g.t === 'name' ? (g.dirty ? `${g.head}{${writeDoc(g.inner)}${g.mid}${g.name}}` : g.raw)
          : g.raw).join('');
  }
  // a segment holds edited pieces: mark it and the names around it
  function markDirty(segs) { for (const g of segs) { if (g.t === 'name') { markDirty(g.inner); g.dirty = true; } if (g.t === 'mol') g.dirty = true; } }

  // ---------------------------------------------------------------- atoms
  // An atom group is split into atoms as chemfig does: each starts at a capital letter, a {…} group or a
  // \charge; digits, small letters, _ and ^ belong to the atom before them.
  function splitAtoms(raw) {
    let s = String(raw || '');
    const hooks = [];
    const atoms = [];
    let cur = null;
    const start = (tok, extra) => { cur = { tex: tok, raw: tok, ...extra }; atoms.push(cur); };
    const add = (tok) => { if (!cur) start(tok); else { cur.tex += tok; cur.raw += tok; } };
    let i = 0;
    s = s.trim();
    while (i < s.length) {
      const c = s[i];
      if (/\s/.test(c)) { i++; continue; }
      if (c === '?') {
        let arg = '';
        if (s[i + 1] === '[') { const e = close(s, i + 1); arg = s.slice(i + 2, e < 0 ? s.length : e); i = e < 0 ? s.length : e + 1; } else i++;
        const p = split(arg).map((x) => x.trim());
        hooks.push({ name: p[0] || 'a', sym: p[1] || '-', tikz: p[2] || '', atom: Math.max(0, atoms.length - 1) });
        continue;
      }
      if (c === '@' && s[i + 1] === '{') { const e = close(s, i + 1); i = e < 0 ? s.length : e + 1; continue; }
      if (c === '{') { const e = close(s, i); const tok = s.slice(i, e < 0 ? s.length : e + 1); start(tok); i += tok.length; continue; }
      if (c === '\\') {
        const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i));
        const name = m[1];
        let j = i + m[0].length;
        if (/^(charge|Charge|chemabove|chembelow|Chemabove|Chembelow)$/.test(name)) {
          let o = '';
          let k = skipWs(s, j);
          if (s[k] === '[') { const e = close(s, k); o = s.slice(k + 1, e); k = skipWs(s, e + 1); }
          const e1 = s[k] === '{' ? close(s, k) : -1, k2 = e1 > 0 ? skipWs(s, e1 + 1) : -1, e2 = k2 > 0 && s[k2] === '{' ? close(s, k2) : -1;
          if (e2 < 0) { add(m[0]); i = j; continue; }
          const a = s.slice(k + 1, e1), b = s.slice(k2 + 1, e2);
          const tok = s.slice(i, e2 + 1);
          if (/charge/i.test(name)) start(tok, { tex: b, charges: readCharges(a), cmd: name, copt: o, inner: b });
          else start(tok, { tex: a, stack: { text: b, dir: /below/i.test(name) ? 1 : -1 }, cmd: name, inner: a });
          i = e2 + 1; continue;
        }
        let tok = m[0];
        for (;;) { const k = skipWs(s, j); if (s[k] === '{') { const e = close(s, k); if (e < 0) break; tok += s.slice(j, e + 1); j = e + 1; } else break; }
        add(tok); i = j; continue;
      }
      if (c === '_' || c === '^') {
        let j = skipWs(s, i + 1), tok;
        if (s[j] === '{') { const e = close(s, j); tok = s.slice(i, e < 0 ? s.length : e + 1); }
        else if (s[j] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(j)); tok = s.slice(i, j + m[0].length); }
        else tok = s.slice(i, j + 1);
        add(tok); i += tok.length; continue;
      }
      if (/[A-Z]/.test(c)) { start(c); i++; continue; }
      add(c); i++;
    }
    return { atoms, hooks };
  }
  // \charge{90=\:,0:2pt[red]=$\oplus$}: position[:offset][tikz]=what
  function readCharges(list) {
    const out = [];
    for (const it of split(list)) {
      const m = /^\s*([^=:[]+?)\s*(?::\s*([^=[]+?))?\s*(\[[^\]]*\])?\s*=\s*([\s\S]*?)\s*$/.exec(it);
      if (!m) continue;
      const ang = /^-?[\d.]+$/.test(m[1]) ? ((parseFloat(m[1]) % 360) + 360) % 360 : ({ east: 0, 'north east': 45, north: 90, 'north west': 135, west: 180, 'south west': 225, south: 270, 'south east': 315 }[m[1]] ?? 90);
      out.push({ pos: m[1], angle: ang, off: m[2] ? len(m[2], 0) : 0, tikz: m[3] || '', what: m[4] });
    }
    return out;
  }
  // TeX box of an atom in em, as chemfig's \printatom ($\rm …$) sets it: height and depth
  function vmetrics(tex) {
    const t = String(tex).replace(/\\[A-Za-z]+/g, 'X');
    let asc = 0.683, desc = 0;
    if (/^[a-z0-9]*$/.test(t.replace(/[_^{}]/g, '')) && !/[bdfhklt]/.test(t)) asc = 0.431;
    if (/[bdfhklt]/.test(t.replace(/[_^][^_^]*/g, ''))) asc = Math.max(asc, 0.694);
    if (/[()[\]]/.test(t)) { asc = 0.75; desc = 0.25; }
    if (t.includes('^')) asc = Math.max(asc, 0.84);
    if (t.includes('_')) desc = Math.max(desc, 0.15);
    if (/[gjpqy]/.test(t.replace(/[_^][^_^]*/g, ''))) desc = Math.max(desc, 0.194);
    if (!t.trim()) { asc = 0; desc = 0; }
    return { asc: asc * EM, desc: desc * EM };
  }
  const atomTex = (t) => `$\\mathrm{${t}}$`;
  // where the baseline sits in a measured text box: one probe per style
  const baseCache = new Map();
  function baseOff(st) {
    const b = TD.textBox(atomTex('H'), st);
    if (baseCache.has(b.css)) return baseCache.get(b.css);
    const m = document.getElementById('measure');
    let v = b.h * 0.72;
    if (m && !(TD.measuring && TD.measuring())) {
      m.setAttribute('style', b.css);
      m.innerHTML = b.html.replace(/<\/div>$/, '<span class="cf-probe" style="display:inline-block;width:0;height:0"></span></div>');
      const p = m.querySelector('.cf-probe');
      if (p) { v = p.getBoundingClientRect().top - m.getBoundingClientRect().top; baseCache.set(b.css, v); }
    }
    return v;
  }
  function atomBox(tex) {
    const t = String(tex || '').trim();
    if (!t || t === '{}') return { tex: '', w: 0, asc: 0, desc: 0, empty: true };
    const b = TD.textBox(atomTex(t), TEXT);
    return { tex: t, w: Math.max(0, b.w - 2), ...vmetrics(t) };
  }

  // ---------------------------------------------------------------- molecule layout
  const rad = (a) => (a * Math.PI) / 180;
  const norm360 = (a) => { a = a % 360; if (a < 0) a += 360; return Math.abs(a - 360) < 1e-9 ? 0 : a; };
  // chemfig's angle field: "n" (n × increment), ":30" absolute, "::30" relative to the previous bond
  function angleOf(str, prev, P) {
    str = String(str ?? '').trim();
    if (!str) return null;
    let a;
    if (str.startsWith('::')) a = prev + parseFloat(str.slice(2));
    else if (str.startsWith(':')) a = parseFloat(str.slice(1));
    else a = parseFloat(str) * P.inc;
    return isFinite(a) ? norm360(a) : null;
  }

  // Lays one molecule out. Returns { verts, bonds, rings, paths, texts, dots, bb } in px, y down, the
  // first atom's baseline at y = 0 (the picture's baseline).
  function layMol(seg, P, warn) {
    const verts = [], bonds = [], rings = [], paths = [], texts = [], dots = [];
    const hooks = new Map();
    // a vertex: an atom group (or an empty one) placed with its arrival atom's centre at (x, y)
    function place(g, ctx, x, y, angle, arrive) {
      const sp = g ? splitAtoms(g.raw) : { atoms: [], hooks: [] };
      const boxes = sp.atoms.length ? sp.atoms.map((a) => ({ ...atomBox(a.tex), src: a })) : [{ tex: '', w: 0, asc: 0, desc: 0, empty: true }];
      const n = boxes.length;
      let k = arrive != null ? arrive : angle != null && angle > 90 && angle < 270 ? n - 1 : 0;
      k = Math.max(0, Math.min(n - 1, k));
      const ak = boxes[k];
      // first atom of the molecule: anchor=base; others: anchor=center
      const base = ctx.first ? y : y + (ak.asc - ak.desc) / 2;
      let left = x - ak.w / 2;
      for (let j = k - 1; j >= 0; j--) left -= boxes[j].w;
      for (const b of boxes) { b.x = left; b.base = base; b.cx = left + b.w / 2; b.cy = base - (b.asc - b.desc) / 2; left += b.w; }
      const v = { id: verts.length, g, boxes, sp, k, x: boxes[k].cx, y: boxes[k].cy, chain: ctx.chain, idx: ctx.idx, ring: ctx.ring || null, inRing: !!ctx.ring, label: g ? g.raw.trim() : '', seg };
      verts.push(v);
      for (const b of boxes) if (!b.empty) texts.push({ t: atomTex(b.tex), box: b, v });
      // charges and stacked text
      for (const b of boxes) {
        const a = b.src;
        if (a && a.charges) for (const c of a.charges) charge(b, c);
        if (a && a.stack) {
          const tb = TD.textBox(a.stack.text, TEXT), m = vmetrics(a.stack.text);
          const y0 = a.stack.dir < 0 ? b.base - b.asc - 1.5 * PT - m.desc - m.asc / 2 - m.desc / 2 : b.base + b.desc + 1.5 * PT + m.asc / 2 + m.desc / 2;
          texts.push({ t: a.stack.text, cx: b.cx, cy: y0, b: tb });
        }
      }
      // hooks: the first ? remembers the atom, the next one with that name draws a bond to it
      for (const h of sp.hooks) {
        const was = hooks.get(h.name);
        if (!was) { hooks.set(h.name, { v, k: h.atom }); continue; }
        hooks.delete(h.name);
        const ang = norm360((Math.atan2(-(v.boxes[h.atom].cy - was.v.boxes[was.k].cy), v.boxes[h.atom].cx - was.v.boxes[was.k].cx) * 180) / Math.PI);
        drawBond({ sym: h.sym, arg: ['', '', '', '', h.tikz], hook: true }, was.v, was.k, v, h.atom, ang, null);
      }
      return v;
    }
    function charge(b, c) {
      // the atom's box with extra sep 1.5pt; the charge's centre on its border at the angle
      const hw = b.w / 2 + 1.5 * PT, hh = (b.asc + b.desc) / 2 + 1.5 * PT;
      const ux = Math.cos(rad(c.angle)), uy = -Math.sin(rad(c.angle));
      const t = Math.min(Math.abs(ux) > 1e-9 ? hw / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? hh / Math.abs(uy) : Infinity);
      const x = b.cx + ux * (t + c.off), y = b.cy + uy * (t + c.off);
      const w = c.what.trim(), rot = rad(90 + c.angle), rx = Math.cos(rot), ry = -Math.sin(rot);
      if (w === '\\:') { const d = 0.15 * EM; dots.push({ x: x + rx * d, y: y + ry * d, r: 0.15 * EX }, { x: x - rx * d, y: y - ry * d, r: 0.15 * EX }); }
      else if (w === '\\.') dots.push({ x, y, r: 0.15 * EX });
      else if (w === '\\|') { const d = 0.75 * EX; paths.push({ d: `M${r2(x + rx * d)},${r2(y + ry * d)}L${r2(x - rx * d)},${r2(y - ry * d)}`, sw: LW }); }
      else if (w === '\\"') {
        const d = 0.75 * EX, e = 0.15 * EX, nx = ry, ny = -rx;
        const p = [[d, e], [-d, e], [-d, -e], [d, -e]].map(([u, v]) => `${r2(x + rx * u + nx * v)},${r2(y + ry * u + ny * v)}`);
        paths.push({ d: `M${p.join('L')}Z`, sw: LW });
      } else if (w) texts.push({ t: w, cx: x, cy: y, b: TD.textBox(w, TEXT), charge: true });
    }
    // a bond from atom a of vertex A to atom b of vertex B
    function drawBond(item, A, ka, B, kb, angle, ring) {
      const ba = A.boxes[ka], bb = B.boxes[kb];
      const ax = ba.cx, ay = ba.cy, bx = bb.cx, by = bb.cy;
      const L0 = Math.hypot(bx - ax, by - ay) || 1, ux = (bx - ax) / L0, uy = (by - ay) / L0;
      const exit = (b, sx, sy) => (b.empty ? 0 : Math.min(Math.abs(sx) > 1e-9 ? b.w / 2 / Math.abs(sx) : Infinity, Math.abs(sy) > 1e-9 ? (b.asc + b.desc) / 2 / Math.abs(sy) : Infinity));
      const offA = ba.empty ? 0 : P.boff, offB = bb.empty ? 0 : P.boff;
      const ta = exit(ba, ux, uy) + offA, tb = exit(bb, ux, uy) + offB;
      const p0 = [ax + ux * ta, ay + uy * ta], p1 = [bx - ux * tb, by - uy * tb];
      const nx = uy, ny = -ux; // left of travel, on screen
      const tikz = (item.arg && item.arg[4]) || '';
      const sty = bondStyle(tikz, warn);
      const sw = sty.width || LW, col = sty.color;
      const seg = (q0, q1, sh0 = 0, sh1 = 0) => `M${r2(q0[0] + ux * sh0)},${r2(q0[1] + uy * sh0)}L${r2(q1[0] - ux * sh1)},${r2(q1[1] - uy * sh1)}`;
      const off = (q, d) => [q[0] + nx * d, q[1] + ny * d];
      const sym = item.sym;
      const draw = [];
      if (!sty.none) {
        if (sym === '-') draw.push({ d: seg(p0, p1), sw, color: col, dash: sty.dash });
        else if (sym === '~') { draw.push({ d: seg(p0, p1), sw, color: col }, { d: seg(off(p0, P.dsep), off(p1, P.dsep)), sw, color: col }, { d: seg(off(p0, -P.dsep), off(p1, -P.dsep)), sw, color: col }); }
        else if (sym[0] === '=') {
          let typ = sym === '=^' ? 1 : sym === '=_' ? 2 : 0;
          if (ring && typ === 0) typ = 1;
          if (typ === 0) draw.push({ d: seg(off(p0, P.dsep / 2), off(p1, P.dsep / 2)), sw, color: col }, { d: seg(off(p0, -P.dsep / 2), off(p1, -P.dsep / 2)), sw, color: col });
          else {
            const corr = ring ? P.dsep * Math.tan(Math.PI / ring.n) : 0, sg = typ === 1 ? 1 : -1;
            const s0 = ring && !offA ? sg * corr : 0, s1 = ring && !offB ? sg * corr : 0;
            draw.push({ d: seg(p0, p1), sw, color: col }, { d: seg(off(p0, sg * P.dsep), off(p1, sg * P.dsep), s0, s1), sw, color: col });
          }
        } else {
          // wedges: > and its kin are wide at the start, < at the end
          const wideStart = sym[0] === '>';
          const W = wideStart ? p0 : p1, N = wideStart ? p1 : p0, h = P.cram / 2;
          if (sym.length === 1) {
            const q = [off(W, h), off(W, -h), off(N, -LW / 2), off(N, LW / 2)];
            draw.push({ d: `M${q.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z`, sw: LW, fill: col || true, color: col });
          } else if (sym[1] === '|') {
            const q = [off(W, h), off(W, -h), N];
            draw.push({ d: `M${q.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z`, sw: LW, color: col, join: 'bevel' });
          } else {
            // hashed: dashes 1pt on 2pt off along the axis from the wide end, line width cram width, clipped to the triangle
            const Lb = Math.hypot(N[0] - W[0], N[1] - W[1]) || 1, vx = (N[0] - W[0]) / Lb, vy = (N[1] - W[1]) / Lb, mx = vy, my = -vx;
            let d = '';
            for (let s0 = 0; s0 < Lb; s0 += P.dashOn + P.dashOff) {
              const s1 = Math.min(Lb, s0 + P.dashOn), w0 = h * (1 - s0 / Lb), w1 = h * (1 - s1 / Lb);
              const c0 = [W[0] + vx * s0, W[1] + vy * s0], c1 = [W[0] + vx * s1, W[1] + vy * s1];
              d += `M${r2(c0[0] + mx * w0)},${r2(c0[1] + my * w0)}L${r2(c1[0] + mx * w1)},${r2(c1[1] + my * w1)}L${r2(c1[0] - mx * w1)},${r2(c1[1] - my * w1)}L${r2(c0[0] - mx * w0)},${r2(c0[1] - my * w0)}Z`;
            }
            draw.push({ d, sw: 0, fill: col || true, color: col });
          }
        }
      }
      for (const p of draw) paths.push(p);
      bonds.push({ id: bonds.length, item, a: A, b: B, ka, kb, p0, p1, angle, ring, hook: !!item.hook, chain: item.parent, idx: item.pidx });
    }
    // walking the tree the way chemfig reads it
    function walk(chain, st) {
      // a chain's own start: branches from a ring vertex point outwards
      if (st.lastAction === 3 && !st.cycle) {
        const cy = st.parentCycle;
        st.defAngle = cy && cy.count === 0 ? st.prevAngle + 180 + st.corr(cy.n) : cy ? st.prevAngle - 90 + 180 / cy.n : st.defAngle;
      }
      if (st.cycle) st.defAngle = 0;
      st.curAngle = st.defAngle;
      if (chain.opt) {
        const f = split(chain.opt.trim().slice(1, -1)).map((x) => x.trim());
        const a = angleOf(f[0], st.prevAngle, P);
        if (a != null) { st.defAngle = a; st.prevAngle = a; st.curAngle = a; }
        if (f[1]) { const l = parseFloat(f[1]); if (isFinite(l)) st.defLen = l; }
        if (f[2]) st.defDep = parseInt(f[2], 10) - 1;
        if (f[3]) st.defArr = parseInt(f[3], 10) - 1;
        if (f[4]) st.defTikz = f[4];
      }
      if (st.cycle && st.cycle.count === 0) {
        st.curAngle = st.prevAngle;
        const c = st.cycle, n = c.n, R = (st.defLen * P.sep) / (2 * Math.sin(Math.PI / n));
        const a = st.curAngle + c.init + 180 / n + 90, hv = c.hook.v.boxes[c.hook.k];
        c.cx = hv.cx + R * Math.cos(rad(a)); c.cy = hv.cy - R * Math.sin(rad(a));
        rings.push({ item: c.item, cx: c.cx, cy: c.cy, n, chain: c.item.chain, hook: c.hook.v });
        if (c.item.star === '**') {
          const r = (0.75 * st.defLen * P.sep) / (2 * Math.tan(Math.PI / n));
          let a0 = 0, a1 = 360;
          if (c.item.arc) { const f = split(c.item.arc.slice(1, -1)).map((x) => x.trim()); if (f[0]) a0 = parseFloat(f[0]) || 0; if (f[1]) a1 = parseFloat(f[1]) || 360; }
          if (Math.abs(a1 - a0) >= 360) paths.push({ d: `M${r2(c.cx + r)},${r2(c.cy)}a${r2(r)},${r2(r)} 0 1,0 ${r2(-2 * r)},0a${r2(r)},${r2(r)} 0 1,0 ${r2(2 * r)},0Z`, sw: LW, circle: true });
          else {
            const pa = [c.cx + r * Math.cos(rad(a0)), c.cy - r * Math.sin(rad(a0))], pb = [c.cx + r * Math.cos(rad(a1)), c.cy - r * Math.sin(rad(a1))];
            paths.push({ d: `M${r2(pa[0])},${r2(pa[1])}A${r2(r)},${r2(r)} 0 ${Math.abs(a1 - a0) > 180 ? 1 : 0},${a1 > a0 ? 0 : 1} ${r2(pb[0])},${r2(pb[1])}`, sw: LW });
          }
        }
      }
      const items = chain.items;
      // what a bond added at a vertex would get by default: in the chain, and in a branch
      const defaults = (v) => {
        v.defAngle = norm360(st.defAngle);
        const c = st.cycle;
        v.branchDef = norm360(c ? (c.count === 0 ? st.prevAngle + 180 + st.corr(c.n) : st.prevAngle - 90 + 180 / c.n) : st.defAngle);
        v.prevAngle = st.prevAngle;
      };
      const realize = (g, idx) => {
        const pd = st.pending;
        st.pending = null;
        const v = place(g, { chain, idx, ring: st.cycle ? st.cycle.item : null }, pd.x, pd.y, pd.angle, pd.arr);
        v.inBond = pd.item;
        defaults(v);
        drawBond(pd.item, pd.from, pd.dep, v, v.k, pd.angle, st.cycle);
        st.corr0 = true;
        st.group = v; st.lastAction = 1;
        return v;
      };
      for (let idx = 0; idx < items.length; idx++) {
        const it = items[idx];
        it.parent = chain; it.pidx = idx;
        if (it.t === 'atom') {
          if (st.lastAction === 2) { realize(it, idx); continue; }
          if (!st.group) { st.group = place(it, { chain, idx, first: true, ring: st.cycle ? st.cycle.item : null }, 0, 0, st.curAngle, st.defArr); defaults(st.group); st.group.root = true; st.lastAction = 1; continue; }
          warn(`"${it.raw.trim()}" follows something it can't attach to: write a bond before it`);
          continue;
        }
        if (it.t === 'bond') {
          if (st.lastAction === 2) realize(null, idx);
          if (!st.group) { st.group = place(null, { chain, idx, first: true }, 0, 0, 0, null); defaults(st.group); st.group.root = true; }
          let angle, L = st.defLen;
          const arg = it.arg || [];
          if (st.cycle) {
            st.cycle.count++;
            angle = norm360(st.prevAngle + 360 / st.cycle.n + st.cycle.init);
            st.cycle.init = 0;
          } else {
            const a = angleOf(arg[0], st.prevAngle, P);
            angle = a != null ? a : norm360(st.defAngle);
            if (arg[1]) { const l = parseFloat(arg[1]); if (isFinite(l)) L = l; }
          }
          st.curAngle = angle;
          const V = st.group, n = V.boxes.length;
          let dep = arg[2] ? parseInt(arg[2], 10) - 1 : st.defDep != null ? st.defDep : angle < 90 || angle > 270 ? n - 1 : 0;
          dep = Math.max(0, Math.min(n - 1, isFinite(dep) ? dep : 0));
          const arr = arg[3] ? parseInt(arg[3], 10) - 1 : st.defArr;
          it.angleUsed = angle; it.lenUsed = L;
          if (st.cycle && st.cycle.count >= st.cycle.n) {
            // the last side goes back to where the ring started
            const h = st.cycle.hook;
            if (st.cycle.count === st.cycle.n) drawBond(it, V, dep, h.v, h.k, angle, st.cycle);
            st.cycle.closed = true;
            st.prevAngle = angle; st.lastAction = 2; st.pending = null;
            if (idx < items.length - 1) warn('A ring has more bonds than sides: the extra ones aren\'t drawn');
            return;
          }
          const c = V.boxes[dep];
          st.pending = { item: it, angle, from: V, dep, arr: isFinite(arr) ? arr : null, x: c.cx + L * P.sep * Math.cos(rad(angle)), y: c.cy - L * P.sep * Math.sin(rad(angle)) };
          st.prevAngle = angle; st.lastAction = 2;
          continue;
        }
        if (it.t === 'branch') {
          if (st.lastAction === 2) realize(null, idx);
          if (!st.group) { st.group = place(null, { chain, idx, first: true }, 0, 0, 0, null); defaults(st.group); st.group.root = true; }
          it.chain.owner = { chain, item: it };
          const sub = { ...st, pending: null, cycle: null, parentCycle: st.cycle ? { ...st.cycle } : st.parentCycle, lastAction: st.cycle ? 3 : st.lastAction };
          walk(it.chain, sub);
          continue;
        }
        if (it.t === 'ring') {
          if (st.lastAction === 2) realize(null, idx);
          if (!st.group) { st.group = place(null, { chain, idx, first: true }, 0, 0, 0, null); defaults(st.group); st.group.root = true; }
          const n = it.n, inner = !!st.cycle || st.lastAction === 3;
          const parentN = st.cycle ? st.cycle.n : st.parentCycle ? st.parentCycle.n : n;
          const init = inner ? 360 / parentN - 180 : -180 / n - 90 + st.corr(n);
          const V = st.group, nb = V.boxes.length, a = st.curAngle;
          const hk = a < 90 || a > 270 ? nb - 1 : 0;
          it.chain.owner = { chain, item: it };
          const sub = { ...st, pending: null, parentCycle: st.cycle, cycle: { n, count: 0, init, hook: { v: V, k: hk }, item: it }, lastAction: inner ? 3 : st.lastAction };
          walk(it.chain, sub);
          continue;
        }
      }
      if (st.lastAction === 2 && st.pending) realize(null, items.length);
    }
    const st = { defAngle: 0, defLen: 1, defDep: null, defArr: null, defTikz: '', prevAngle: 0, curAngle: 0, group: null, lastAction: 0, pending: null, cycle: null, parentCycle: null, corr0: false };
    st.corr = function (n) { return this.corr0 ? 0 : 180 / n; };
    walk(seg.chain, st);
    for (const [name] of hooks) if (name) { /* an unmatched hook draws nothing, as in chemfig */ }
    // TeX's bounding box: atoms' boxes and bond paths (not the line width, not the overlay charges)
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    for (const v of verts) for (const b of v.boxes) if (!b.empty) ext(b.x, b.base - b.asc, b.x + b.w, b.base + b.desc); else ext(b.cx, b.cy, b.cx, b.cy);
    for (const p of paths) {
      if (p.circle) { const m = /M(-?[\d.]+),(-?[\d.]+)a(-?[\d.]+)/.exec(p.d); const r = +m[3] + LW / 2, cx = +m[1] - m[3], cy = +m[2]; ext(cx - r, cy - r, cx + r, cy + r); continue; }
      const h = p.fill && !p.sw ? 0 : (p.sw || LW) / 2;
      for (const m of p.d.matchAll(/[MLA](?:[\d.]+,[\d.]+ \d \d,\d )?(-?[\d.]+),(-?[\d.]+)/g)) ext(+m[1] - h, +m[2] - h, +m[1] + h, +m[2] + h);
    }
    for (const t of texts) if (!t.box && !t.charge) ext(t.cx - (t.b.w - 2) / 2, t.cy - t.b.h / 2, t.cx + (t.b.w - 2) / 2, t.cy + t.b.h / 2);
    if (!(x2 >= x1)) { x1 = x2 = 0; y1 = y2 = 0; }
    return { verts, bonds, rings, paths, texts, dots, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
  }
  function bondStyle(t, warn) {
    const r = { color: null, width: null, dash: null, none: false };
    for (const it of split(t || '').map((x) => x.trim()).filter(Boolean)) {
      const m = /^([^=]+?)\s*(?:=\s*(.*))?$/.exec(it), k = m[1], v = m[2];
      if (k === 'draw' && v === 'none') { r.none = true; continue; }
      if (k === 'line width' && v) { r.width = len(v, LW); continue; }
      if (k === 'thick') { r.width = 0.8 * PT; continue; }
      if (k === 'very thick') { r.width = 1.2 * PT; continue; }
      if (k === 'dashed') { r.dash = 'dash'; continue; }
      if (k === 'dotted') { r.dash = 'dot'; continue; }
      if (k === 'shorten <' || k === 'shorten >') continue;
      const col = (k === 'draw' || k === 'color') && v ? v : v == null ? k : null;
      if (col && TD.tikzColor) { const c = TD.tikzColor(col); if (c) { r.color = c; continue; } }
      if (warn) warn(`The bond option "${it}" isn't drawn here (it is kept in the code)`);
    }
    return r;
  }

  // ---------------------------------------------------------------- scheme layout
  // pieces of a compound side by side on the baseline: molecules, + signs, names and text
  function layPieces(segs, P, warn, out) {
    const pieces = [];
    let x = 0, pendingSpace = false;
    for (const g of segs) {
      if (g.t === 'text') {
        const t = g.raw.replace(/%.*$/gm, '');
        if (!t.trim()) { if (pieces.length && /\s/.test(t)) pendingSpace = true; continue; }
        const lead = /^\s/.test(t), trail = /\s$/.test(t), body = t.trim();
        if ((lead || pendingSpace) && pieces.length) x += 3.333 * PT;
        const b = TD.textBox(body, TEXT), m = vmetrics(body.replace(/\$/g, ''));
        pieces.push({ kind: 'text', seg: g, t: body, x, w: b.w - 2, asc: Math.max(m.asc, 0.683 * EM), desc: Math.max(m.desc, /[gjpqy,;]/.test(body) ? 0.194 * EM : 0), b });
        x += b.w - 2; pendingSpace = trail; continue;
      }
      if (pendingSpace && pieces.length) x += 3.333 * PT;
      pendingSpace = false;
      if (g.t === 'mol') {
        const L = layMol(g, P, warn);
        pieces.push({ kind: 'mol', seg: g, L, x: x - L.bb.x, w: L.bb.w, asc: -L.bb.y, desc: L.bb.y + L.bb.h });
        x += L.bb.w; continue;
      }
      if (g.t === 'plus') {
        let a = P.plusL, b = P.plusR, vs = 0;
        const m = /^\\\+\s*\{([^}]*)\}/.exec(g.raw);
        if (m) { const f = split(m[1]).map((s) => s.trim()); if (f[0]) a = len(f[0], a); if (f[1]) b = len(f[1], b); if (f[2]) vs = len(f[2], 0); }
        const pw = 0.778 * EM;
        pieces.push({ kind: 'plus', seg: g, x, w: a + pw + b, cx: x + a + pw / 2, vs, asc: 0.583 * EM + vs, desc: Math.max(0, 0.083 * EM - vs) });
        x += a + pw + b; continue;
      }
      if (g.t === 'name') {
        const inner = layPieces(g.inner, P, warn, out);
        const nm = g.name.split('\\\\').map((s) => s.trim());
        out.names.push({ inner, nm, x });
        const nb = nm.map((t) => ({ t, b: TD.textBox(t || ' ', TEXT), m: vmetrics(t.replace(/\$/g, '')) }));
        pieces.push({ kind: 'name', seg: g, inner, x, w: inner.w, asc: inner.asc, desc: inner.desc, lines: nb });
        x += inner.w; continue;
      }
      if (g.t === 'set') continue;
    }
    // names hang below their molecule, their tops at the deepest name's molecule depth plus name sep
    let asc = 0, desc = 0;
    for (const p of pieces) { asc = Math.max(asc, p.asc); desc = Math.max(desc, p.desc); }
    return { pieces, w: x, asc, desc };
  }
  function nameLines(C, P) {
    // \chemname: name lines centred under the molecule, their first line's top at depth max + name sep
    const dpmax = Math.max(0, ...C.pieces.filter((p) => p.kind === 'name').map((p) => p.inner.desc));
    for (const p of C.pieces) {
      if (p.kind !== 'name') continue;
      let top = dpmax + P.nameSep;
      p.lineAt = p.lines.map((l) => { const h = Math.max(l.m.asc, 0.683 * EM), d = Math.max(l.m.desc, 0); const y = top + h; top = y + d + 2 * PT; return { ...l, base: y }; });
      p.desc = Math.max(p.desc, top - 2 * PT);
      C.desc = Math.max(C.desc, p.desc);
    }
  }
  function border(box, ang) {
    // the point where a ray from the box's centre at ang leaves it
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2, ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang));
    const t = Math.min(Math.abs(ux) > 1e-9 ? box.w / 2 / Math.abs(ux) : Infinity, Math.abs(uy) > 1e-9 ? box.h / 2 / Math.abs(uy) : Infinity);
    return [cx + ux * t, cy + uy * t];
  }

  // the whole thing: compounds, arrows, signs
  function build(src, segsIn) {
    const warnings = [], warn = (w) => { if (!warnings.includes(w)) warnings.push(w); };
    const segs = segsIn || parseDoc(src, warn);
    const P = { ...DEF };
    const setKV = (kv) => {
      for (const [k, v] of Object.entries(kv)) {
        const map = { 'atom sep': 'sep', 'bond offset': 'boff', 'double bond sep': 'dsep', 'cram width': 'cram', 'compound sep': 'csep', 'arrow offset': 'aoff', 'arrow label sep': 'lsep', 'name sep': 'nameSep' };
        if (map[k]) P[map[k]] = len(v, P[map[k]]);
        else if (k === 'angle increment') P.inc = parseFloat(v) || 45;
        else if (k === 'arrow coeff') P.acoeff = parseFloat(v) || 1;
        else if (k === 'arrow angle') P.aangle = parseFloat(v) || 0;
        else warn(`The setting "${k}" isn't drawn here (it is kept in the code)`);
      }
    };
    const si = segs.findIndex((g) => g.t === 'start'), so = segs.findIndex((g) => g.t === 'stop');
    for (const g of segs) if (g.t === 'set') setKV(g.kv);
    const scheme = si >= 0;
    if (scheme && so < 0) warn('\\schemestop is missing');
    if (!scheme && segs.some((g) => g.t === 'arrow')) warn('Arrows need \\schemestart … \\schemestop around them');
    if (scheme) {
      const m = /\[([^\]]*)\]/.exec(segs[si].raw);
      if (m) { const kv = {}; for (const it of split(m[1])) { const q = /^\s*([^=]+?)\s*=\s*([\s\S]*?)\s*$/.exec(it); if (q) kv[q[1]] = unbrace(q[2]); } setKV(kv); }
      for (const g of segs.slice(0, si).concat(so >= 0 ? segs.slice(so + 1) : [])) if (g.t === 'text' ? g.raw.replace(/%.*$/gm, '').trim() : g.t !== 'set') warn('Only \\schemestart … \\schemestop is drawn: what is outside it is kept in the code');
    }
    const body = scheme ? segs.slice(si + 1, so < 0 ? segs.length : so) : segs;
    // compounds between arrows
    const groups = [[]], arrows = [];
    for (const g of body) { if (g.t === 'arrow') { arrows.push(g); groups.push([]); } else groups[groups.length - 1].push(g); }
    const out = { names: [] };
    const comps = groups.map((gs) => { const C = layPieces(gs, P, warn, out); nameLines(C, P); C.segs = gs; return C; });
    // place: the first compound's text anchor (left end of its baseline) at the origin
    const placed = [];
    const A = [];
    let cur = { x: 0, base: 0 }, curBox = null;
    comps.forEach((C, k) => {
      const empty = !C.pieces.length;
      if (k === 0) { cur = { x: 0, base: 0 }; }
      else {
        const ar = arrows[k - 1];
        const ang = ar.opt[0] ? parseFloat(ar.opt[0]) || 0 : P.aangle, coeff = ar.opt[1] ? parseFloat(ar.opt[1]) || 1 : P.acoeff;
        const st = curBox ? border(curBox, ang) : [cur.x, cur.base];
        const ux = Math.cos(rad(ang)), uy = -Math.sin(rad(ang)), Lt = coeff * P.csep;
        const end = [st[0] + ux * Lt, st[1] + uy * Lt];
        A.push({ seg: ar, x1: st[0] + ux * P.aoff, y1: st[1] + uy * P.aoff, x2: st[0] + ux * (Lt - P.aoff), y2: st[1] + uy * (Lt - P.aoff), ang, comp: k - 1 });
        // the next compound: its border at 180 + angle on the end point
        const bw = C.w, bh = C.asc + C.desc;
        const fake = { x: 0, y: 0, w: bw, h: bh };
        const [bx, by] = border(fake, ang + 180);
        cur = { x: end[0] - bx, base: end[1] - by + C.asc };
        if (empty) { curBox = { x: end[0], y: end[1], w: 0, h: 0 }; placed.push({ C, x: end[0], base: end[1], box: curBox, empty }); return; }
      }
      curBox = { x: cur.x, y: cur.base - C.asc, w: C.w, h: C.asc + C.desc };
      placed.push({ C, x: cur.x, base: cur.base, box: curBox, empty });
    });
    // drawing primitives in document px
    const paths = [], texts = [], dots = [], verts = [], bonds = [], rings = [], mols = [];
    for (const pc of placed) {
      for (const p of pc.C.pieces) emitPiece(p, pc.x, pc.base);
    }
    function emitPiece(p, ox, base) {
      const x0 = ox + p.x;
      if (p.kind === 'mol') {
        const L = p.L, dx = x0, dy = base;
        mols.push({ seg: p.seg, L, dx, dy });
        for (const q of L.paths) paths.push({ ...q, dx, dy });
        for (const d of L.dots) dots.push({ ...d, x: d.x + dx, y: d.y + dy });
        for (const t of L.texts) {
          if (t.box) { const b = TD.textBox(t.t, TEXT), bo = baseOff(TEXT); texts.push({ t: t.t, cx: t.box.cx + dx, cy: t.box.base + dy - bo + b.h / 2, b }); }
          else texts.push({ t: t.t, cx: t.cx + dx, cy: t.cy + dy, b: t.b });
        }
        const map = new Map();
        for (const v of L.verts) { const c = { ...v, X: v.x + dx, Y: v.y + dy, mol: p.seg, dx, dy }; map.set(v, c); verts.push(c); }
        for (const b of L.bonds) bonds.push({ ...b, a: map.get(b.a), b: map.get(b.b), X0: b.p0[0] + dx, Y0: b.p0[1] + dy, X1: b.p1[0] + dx, Y1: b.p1[1] + dy, mol: p.seg });
        for (const r of L.rings) rings.push({ ...r, X: r.cx + dx, Y: r.cy + dy, mol: p.seg });
      } else if (p.kind === 'text') {
        const bo = baseOff(TEXT);
        texts.push({ t: p.t, cx: x0 + p.w / 2, cy: base - bo + p.b.h / 2, b: p.b, seg: p.seg });
      } else if (p.kind === 'plus') {
        const b = TD.textBox('$+$', TEXT), bo = baseOff(TEXT);
        texts.push({ t: '$+$', cx: ox + p.cx, cy: base - p.vs - bo + b.h / 2, b, seg: p.seg });
      } else if (p.kind === 'name') {
        for (const q of p.inner.pieces) emitPiece(q, x0, base);
        const bo = baseOff(TEXT);
        for (const l of p.lineAt || []) if (l.t) texts.push({ t: l.t, cx: x0 + p.w / 2, cy: base + l.base - bo + l.b.h / 2, b: l.b, name: p.seg });
      }
    }
    // arrows and their labels
    const arrowsOut = [];
    for (const a of A) {
      const ar = a.seg, type = ar.type;
      const ux = Math.cos(rad(a.ang)), uy = -Math.sin(rad(a.ang)), nx = uy, ny = -ux; // n: left of travel
      const shift = ar.labels[2] ? len(ar.labels[2], 0) : 0;
      const sx = nx * shift, sy = ny * shift;
      const p1 = [a.x1 + sx, a.y1 + sy], p2 = [a.x2 + sx, a.y2 + sy];
      const known = ['->', '<-', '<->', '<=>', '<->>', '<<->', '-/>', '0', '-U>'];
      if (!known.includes(type)) warn(`The arrow "${type}" isn't one chemfig knows: drawn as ->`);
      const t = known.includes(type) ? type : '->';
      const prim = [];
      const line = (q1, q2, head, harpoon) => { prim.push({ q1, q2, head, harpoon }); };
      const at = (q, f) => [q[0] + nx * f, q[1] + ny * f];
      const lerp = (k) => [p1[0] + (p2[0] - p1[0]) * k, p1[1] + (p2[1] - p1[1]) * k];
      if (t === '->' || t === '-U>') line(p1, p2, 'end');
      else if (t === '<-') line(p2, p1, 'end');
      else if (t === '<->') line(p1, p2, 'both');
      else if (t === '<=>') { line(at(p1, 1 * PT), at(p2, 1 * PT), 'end', true); line(at(p2, -1 * PT), at(p1, -1 * PT), 'end', true); }
      else if (t === '<->>') { line(at(p1, PT), at(p2, PT), 'end', true); line(at(lerp(0.8), -PT), at(lerp(0.2), -PT), 'end', true); }
      else if (t === '<<->') { line(at(lerp(0.2), PT), at(lerp(0.8), PT), 'end', true); line(at(p2, -PT), at(p1, -PT), 'end', true); }
      else if (t === '-/>') {
        line(p1, p2, 'end');
        const m = lerp(0.5);
        for (const s of [-1, 1]) {
          const c = [m[0] + ux * s * PT, m[1] + uy * s * PT];
          const d1 = rad(225 + a.ang), d2 = rad(45 + a.ang);
          prim.push({ q1: [c[0] + 5 * PT * Math.cos(d1), c[1] - 5 * PT * Math.sin(d1)], q2: [c[0] + 5 * PT * Math.cos(d2), c[1] - 5 * PT * Math.sin(d2)], head: null });
        }
      }
      if (t === '-U>') warn('The -U> arrow\'s arc isn\'t drawn here');
      // labels: above at the middle, 3pt off, anchored on their south; below anchored on their north
      const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      let rot = a.ang;
      const flip = Math.cos(rad(rot)) < -1e-9;
      if (flip) rot += 180;
      const vx = Math.cos(rad(rot + 90)), vy = -Math.sin(rad(rot + 90)); // the label frame's up
      const labs = [];
      [ar.labels[0], ar.labels[1]].forEach((lab, j) => {
        if (lab == null || !String(lab).trim()) return;
        let txt = String(lab);
        let rotLab = rot;
        if (txt.trim()[0] === '*') { const m = /^\s*\*\{([^}]*)\}([\s\S]*)$/.exec(txt); if (m) { rotLab = parseFloat(m[1]) || 0; txt = m[2]; warn('Rotated arrow labels (*{…}) are drawn upright here'); } }
        txt = unbrace(txt);
        const b = TD.textBox(txt, TEXT), m = vmetrics(txt.replace(/\$/g, ''));
        // TeX's box: above sits on its south 3pt over the arrow, below hangs from its north
        const base = j === 0 ? P.lsep + m.desc : -(P.lsep + m.asc), up = base + baseOff(TEXT) - b.h / 2;
        const bc = j === 0 ? P.lsep + (m.asc + m.desc) / 2 : -(P.lsep + (m.asc + m.desc) / 2);
        labs.push({ t: txt, cx: mid[0] + vx * up, cy: mid[1] + vy * up, bx: mid[0] + vx * bc, by: mid[1] + vy * bc, bw: b.w - 2, bh: m.asc + m.desc, b, rot: -rot, which: j, seg: ar });
      });
      arrowsOut.push({ seg: ar, prim, labs, x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], ang: a.ang, type: t });
    }
    // bounding box (TeX's: node boxes, arrow paths, label nodes)
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const ext = (a, b, c, d) => { x1 = Math.min(x1, a); y1 = Math.min(y1, b); x2 = Math.max(x2, c); y2 = Math.max(y2, d); };
    for (const pc of placed) if (!pc.empty) ext(pc.box.x, pc.box.y, pc.box.x + pc.box.w, pc.box.y + pc.box.h);
    for (const m of mols) { const b = m.L.bb; ext(b.x + m.dx, b.y + m.dy, b.x + b.w + m.dx, b.y + b.h + m.dy); }
    for (const a of arrowsOut) {
      for (const p of a.prim) ext(Math.min(p.q1[0], p.q2[0]), Math.min(p.q1[1], p.q2[1]), Math.max(p.q1[0], p.q2[0]), Math.max(p.q1[1], p.q2[1]));
      if (a.type === '0') ext(Math.min(a.x1, a.x2), Math.min(a.y1, a.y2), Math.max(a.x1, a.x2), Math.max(a.y1, a.y2));
      for (const l of a.labs) { const c = Math.abs(Math.cos(rad(l.rot))), s = Math.abs(Math.sin(rad(l.rot))), w = l.bw, h = l.bh; const hw = (w * c + h * s) / 2, hh = (w * s + h * c) / 2; ext(l.bx - hw, l.by - hh, l.bx + hw, l.by + hh); }
    }
    const empty = !mols.length && !texts.length && !arrowsOut.length;
    if (!(x2 >= x1)) { x1 = 0; y1 = -PX; x2 = 2 * PX; y2 = 0; }
    if (x2 - x1 < 4) { x1 -= 2; x2 += 2; }
    if (y2 - y1 < 4) { y1 -= 2; y2 += 2; }
    return { segs, scheme, P, comps: placed, arrows: arrowsOut, paths, texts, dots, verts, bonds, rings, mols, warnings, empty, bb: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } };
  }

  const cache = new Map();
  function layout(s) {
    const key = [s.src, TD.math && TD.math.engine].join('\u0001');
    const hit = cache.get(key);
    if (hit) return hit;
    const L = build(s.src);
    if (TD.measuring && TD.measuring()) return L;
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); baseCache.clear(); clearText(); };

  // ---------------------------------------------------------------- drawing
  // an arrow tip as chemfig's CF arrow: 5pt long, 4pt wide, inset 2.5pt; a harpoon keeps the left half
  function tip(q1, q2, harpoon, ink) {
    const L = Math.hypot(q2[0] - q1[0], q2[1] - q1[1]) || 1, ux = (q2[0] - q1[0]) / L, uy = (q2[1] - q1[1]) / L, nx = uy, ny = -ux;
    const len = 5 * PT, half = 2 * PT, inset = 2.5 * PT;
    const T = q2, B = [T[0] - ux * len, T[1] - uy * len], I = [T[0] - ux * inset, T[1] - uy * inset];
    const l = [B[0] + nx * half, B[1] + ny * half], r = [B[0] - nx * half, B[1] - ny * half];
    const pts = harpoon ? [T, l, I] : [T, l, I, r];
    return { shaft: [q1, I], d: `M${pts.map((p) => `${r2(p[0])},${r2(p[1])}`).join('L')}Z` };
  }
  function draw(s, ctx, given) {
    const Lo = given || layout(s);
    const ink = TD.css(s.color || '#000000');
    let out = '';
    const T = (p) => (p.dx || p.dy ? ` transform="translate(${r2(p.dx)},${r2(p.dy)})"` : '');
    if (Lo.empty) {
      const b = Lo.bb;
      out += `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" fill="none" stroke="${ink}" stroke-width="${r2(2 * LW)}" stroke-dasharray="${r2(3 * PT)} ${r2(2 * PT)}" rx="4"/>`;
      if (!ctx.export) out += TD.textSvg('Empty chemistry block', { size: 'small', font: 'default' }, '#888888', b.x + b.w / 2, b.y + b.h / 2, ctx);
    }
    for (const p of Lo.paths) {
      const col = p.color ? TD.css(p.color) : ink;
      const dash = p.dash === 'dash' ? ` stroke-dasharray="${r2(3 * PT)} ${r2(3 * PT)}"` : p.dash === 'dot' ? ` stroke-dasharray="0 ${r2(2 * PT)}" stroke-linecap="round"` : '';
      if (p.fill) out += `<path d="${p.d}"${T(p)} fill="${col}" stroke="${p.sw ? col : 'none'}"${p.sw ? ` stroke-width="${r2(p.sw)}" stroke-linejoin="round"` : ''}/>`;
      else out += `<path d="${p.d}"${T(p)} fill="none" stroke="${col}" stroke-width="${r2(p.sw)}" stroke-linejoin="${p.join || 'round'}"${dash}/>`;
    }
    for (const d of Lo.dots) out += `<circle cx="${r2(d.x)}" cy="${r2(d.y)}" r="${r2(d.r)}" fill="${ink}"/>`;
    for (const a of Lo.arrows) {
      for (const p of a.prim) {
        if (!p.head) { out += `<path d="M${r2(p.q1[0])},${r2(p.q1[1])}L${r2(p.q2[0])},${r2(p.q2[1])}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}"/>`; continue; }
        const e = tip(p.q1, p.q2, p.harpoon);
        let a1 = p.q1, d2 = '';
        if (p.head === 'both') { const e2 = tip(p.q2, p.q1, p.harpoon); a1 = e2.shaft[1]; d2 = e2.d; }
        out += `<path d="M${r2(a1[0])},${r2(a1[1])}L${r2(e.shaft[1][0])},${r2(e.shaft[1][1])}" fill="none" stroke="${ink}" stroke-width="${r2(LW)}"/><path d="${e.d}${d2}" fill="${ink}" stroke="${ink}" stroke-width="${r2(LW)}" stroke-linejoin="round"/>`;
      }
      for (const l of a.labs) {
        const t = TD.textSvg(l.t, TEXT, s.color || '#000000', l.cx, l.cy, ctx);
        out += Math.abs(l.rot) > 1e-6 ? `<g transform="rotate(${r2(l.rot)} ${r2(l.cx)} ${r2(l.cy)})">${t}</g>` : t;
      }
    }
    for (const t of Lo.texts) out += TD.textSvg(t.t, TEXT, s.color || '#000000', t.cx, t.cy, ctx);
    const bb = Lo.bb;
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x - bb.x)},${r2(s.y - bb.y)})">${out}</g>`;
  }

  // a small drawing of a snippet (palette previews)
  TD.chemMini = (src) => {
    const s = { type: 'chemfig', x: 0, y: 0, src, color: 'currentColor' };
    const bb = layout(s).bb;
    return `<svg class="zxmini" width="${r2(bb.w)}" height="${r2(bb.h)}" viewBox="0 0 ${r2(bb.w)} ${r2(bb.h)}" style="overflow:visible" aria-hidden="true">${draw(s, { export: true })}</svg>`;
  };
  const counts = (L) => {
    const n = L.mols.length, a = L.arrows.length;
    return a ? `${n} molecule${n === 1 ? '' : 's'} · ${a} arrow${a === 1 ? '' : 's'}` : `${L.verts.filter((v) => v.label).length} atoms · ${L.bonds.length} bonds`;
  };

  TD.TYPES.chemfig = {
    name: 'Chemistry',
    pts: [['x', 'y']],
    create: (p) => ({ type: 'chemfig', x: p.x, y: p.y, src: TD.CHEM_DEFAULT, color: '#000000' }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y + b.h / 2 }, { x: s.x + b.w, y: s.y + b.h / 2 }, { x: s.x + b.w / 2, y: s.y }, { x: s.x + b.w / 2, y: s.y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x, y: s.y }, { x: s.x + b.w, y: s.y + b.h }]; },
    svg: draw,
    // the code unchanged, in a node whose top left is the drawing's
    tikz(s, X) {
      X.pkgs.add('chemfig');
      const o = ['anchor=north west', 'inner sep=0pt'];
      const col = s.color && TD.parseColor(s.color).hex !== '#000000' ? X.col(s.color) : null;
      if (col) o.push(`text=${col}`);
      const src = String(s.src || '').trim();
      return `\\node[${o.join(', ')}] at ${X.c(s.x, s.y)} {${src.includes('\n') ? `%\n${src}%\n` : src}};`;
    },
  };

  TD.panels = TD.panels || {};
  TD.panels.chemfig = {
    html(s) {
      const L = layout(s);
      return `<div class="sec"><div class="sec-title">Chemistry <small>${counts(L)}</small></div>
        <div class="row col"><textarea class="code" data-p="src" spellcheck="false" rows="7">${esc(s.src)}</textarea></div>
        ${L.warnings.map((w) => `<div class="err">${esc(w)}</div>`).join('')}
        <div class="help">Double-click the block to edit it visually. Exported with <code>\\usepackage{chemfig}</code>; builds with pdfLaTeX.</div></div>
        <div class="sec"><button class="wide primary" data-act="editchem">Edit Chemistry…</button><button class="wide" data-act="copychem">Copy chemfig Code</button></div>`;
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editchem') { if (TD.chemOpen) TD.chemOpen(s.id); return; }
      if (act !== 'copychem') return;
      const txt = String(s.src || '').trim() + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('chemfig Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied chemfig code';
    },
  };
  // for the visual editor (js/cfeditor.js)
  TD.chem = { build, parseDoc, writeDoc, parseChain, writeChain, splitAtoms, layout, draw, angleOf, norm360, split, unbrace, close, markDirty, counts, TEXT, DEF, PT, EM };
})();
