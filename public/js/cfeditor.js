// Chemistry editor: the overlay that opens on a Chemistry block. A palette of atoms, bonds, rings,
// functional groups, charges and reaction arrows; the molecules and schemes drawn by the canvas renderer,
// where atoms are picked, relabelled and grown by dragging their blue handle; the selected atom's, bond's
// or arrow's properties; and beside them the chemfig code, live both ways. chemfig places atoms by bond
// angles, not coordinates, so moving an atom turns (and stretches) the bond that leads to it.
// Untouched code is handed back as written.
// TD.chemEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () {
  const TD = window.TD, C = TD.chem;
  const { esc, r2 } = TD.util;
  const $ = (s, r = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const SEP = C.DEF.sep;

  // ---------------------------------------------------------------- palette
  const BOND_NAMES = { '-': 'Single', '=': 'Double', '~': 'Triple', '>': 'Wedge', '<': 'Wedge, reversed', '>:': 'Hashed', '<:': 'Hashed, reversed', '>|': 'Hollow wedge', '<|': 'Hollow wedge, reversed', '=^': 'Double, left', '=_': 'Double, right' };
  const ARROW_NAMES = { '->': 'Reaction', '<=>': 'Equilibrium', '<->>': 'Equilibrium, to the right', '<<->': 'Equilibrium, to the left', '<->': 'Resonance', '-/>': 'No reaction', '<-': 'Backwards', '0': 'Invisible', '-U>': 'U arrow' };
  // functional groups: code for a group at the end of a bond at angle a (relative angles follow the bond)
  const left = (a) => a > 90 && a < 270;
  const GROUPS = {
    OH: (a) => (left(a) ? 'HO' : 'OH'),
    NH2: (a) => (left(a) ? 'H_2N' : 'NH_2'),
    CH3: (a) => (left(a) ? 'H_3C' : 'CH_3'),
    OCH3: (a) => (left(a) ? 'H_3CO' : 'OCH_3'),
    CHO: (a) => (left(a) ? 'OHC' : 'CHO'),
    COOH: (a) => `C(=[::60]O)-[::-60]${left(C.norm360(a - 60)) ? 'HO' : 'OH'}`,
    NO2: (a) => (left(a) ? 'O_2N' : 'NO_2'),
    CN: () => 'C~[::0]N',
    SH: (a) => (left(a) ? 'HS' : 'SH'),
  };
  const RINGS = { 3: '*3(---)', 4: '*4(----)', 5: '*5(-----)', 6: '*6(------)', benzene: '*6(-=-=-=)', arom: '**6(------)', 7: '*7(-------)' };
  const ATOMS = ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I'];
  const CHARGES = { plus: ['Positive', '\\chemfig{N^{+}}'], minus: ['Negative', '\\chemfig{O^{-}}'], pair: ['Lone pair', '\\chemfig{\\charge{90=\\:}{O}}'], rad: ['Radical', '\\chemfig{\\charge{90=\\.}{C}}'], dplus: ['δ+', '\\chemfig{\\charge{90=$\\delta+$}{C}}'], dminus: ['δ−', '\\chemfig{\\charge{90=$\\delta-$}{O}}'] };
  const PAL = [
    ['Atoms', [['a:', 'Vertex', '\\chemfig{-[:30]-[:-30]}', ''], ...ATOMS.map((x) => [`a:${x}`, x, `\\chemfig{${x}}`, x.length === 1 ? x : ''])]],
    ['Bonds', [['b:-', 'Single', '\\chemfig{-}', '1'], ['b:=', 'Double', '\\chemfig{=}', '2'], ['b:~', 'Triple', '\\chemfig{~}', '3'], ['b:>', 'Wedge', '\\chemfig{>}', ''], ['b:>:', 'Hashed', '\\chemfig{>:}', ''], ['b:>|', 'Hollow wedge', '\\chemfig{>|}', ''], ['b:<', 'Wedge, reversed', '\\chemfig{<}', ''], ['b:<:', 'Hashed, reversed', '\\chemfig{<:}', '']]],
    ['Rings', [['r:benzene', 'Benzene', `\\chemfig{${RINGS.benzene}}`], ['r:arom', 'Aromatic', `\\chemfig{${RINGS.arom}}`], ['r:3', 'Cyclopropane', `\\chemfig{${RINGS[3]}}`], ['r:4', 'Cyclobutane', `\\chemfig{${RINGS[4]}}`], ['r:5', 'Cyclopentane', `\\chemfig{${RINGS[5]}}`], ['r:6', 'Cyclohexane', `\\chemfig{${RINGS[6]}}`], ['r:7', 'Cycloheptane', `\\chemfig{${RINGS[7]}}`]]],
    ['Groups', Object.keys(GROUPS).map((k) => [`g:${k}`, { NH2: 'NH₂', CH3: 'CH₃', OCH3: 'OCH₃', NO2: 'NO₂' }[k] || k, `\\chemfig{-[0]${GROUPS[k](0)}}`])],
    ['Charges', Object.entries(CHARGES).map(([k, [n, mini]]) => [`c:${k}`, n, mini])],
    ['Reactions', [['s:->', 'Arrow', '\\schemestart\\arrow{->}\\schemestop'], ['s:<=>', 'Equilibrium', '\\schemestart\\arrow{<=>}\\schemestop'], ['s:<->', 'Resonance', '\\schemestart\\arrow{<->}\\schemestop'], ['s:-/>', 'No reaction', '\\schemestart\\arrow{-/>}\\schemestop'], ['s:+', 'Plus', '\\schemestart\\chemfig{A}\\+\\chemfig{B}\\schemestop'], ['s:merge', 'Merge', '\\schemestart\\chemfig{A}\\arrow{0}[-90,0.5]\\chemfig{B}\\merge>(c1)(c2)--()\\chemfig{C}\\schemestop'], ['s:move', 'Curved arrow', '\\chemfig{@{a}A-@{b}B}\\chemmove{\\draw[-stealth](a)..controls +(90:4mm) and +(90:4mm)..(b);}']]],
  ];
  const ITEM = {}, KEYS = {};
  for (const [, items] of PAL) for (const [k, name, mini, key] of items) { ITEM[k] = { k, name, mini, key }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = { segs (TD.chem.parseDoc), raw, dirty }: the code is M.raw until something is edited
  function load(src) { return { segs: C.parseDoc(src, () => {}), raw: String(src || ''), dirty: false }; }
  const codeOf = (M) => (M.dirty ? C.writeDoc(M.segs) : M.raw);
  const fmtA = (a) => { a = C.norm360(Math.round(a * 100) / 100); return Math.abs(a / 45 - Math.round(a / 45)) < 1e-9 ? String(Math.round(a / 45)) : `:${+a.toFixed(2)}`; };
  const num = (n) => String(+(+n).toFixed(3));
  function touch(mol) { if (!mol) return; mol.dirty = true; if (mol.owner) mol.owner.dirty = true; E.M.dirty = true; }
  const vkey = (v) => v.g || v.inBond || v.mol;
  let L = null;
  const lay = () => L || (L = C.build('', E.M.segs));
  const findV = (key) => lay().verts.find((v) => vkey(v) === key) || null;
  const selV = () => (E.sel && E.sel.v ? findV(E.sel.v) : null);
  const selB = () => (E.sel && E.sel.b ? lay().bonds.find((b) => b.item === E.sel.b) || null : null);
  const selA = () => (E.sel && E.sel.a ? lay().arrows.find((a) => a.seg === E.sel.a) || null : null);
  const sameV = (a, b) => a === b || (a && b && vkey(a) === vkey(b));
  const neighbours = (v) => lay().bonds.filter((b) => !b.hook || true).map((b) => (sameV(b.a, v) ? b.b : sameV(b.b, v) ? b.a : null)).filter(Boolean);
  // directions (maths angles) of the bonds at a vertex
  function dirsAt(v) {
    const out = [];
    for (const b of lay().bonds) {
      if (sameV(b.a, v)) out.push(Math.atan2(-(b.Y1 - b.Y0), b.X1 - b.X0) * 180 / Math.PI);
      else if (sameV(b.b, v)) out.push(Math.atan2(-(b.Y0 - b.Y1), b.X0 - b.X1) * 180 / Math.PI);
    }
    return out;
  }
  // the free direction for a new bond: zigzag off a lone bond, else the widest gap
  function freeAngle(v) {
    const d = dirsAt(v);
    if (!d.length) return 0;
    if (d.length === 1) {
      const into = C.norm360(d[0] + 180), c1 = C.norm360(into + 60), c2 = C.norm360(into - 60);
      // away from the atom two steps back, so chains zigzag
      const pv = neighbours(v)[0], far = pv ? neighbours(pv).filter((w) => !sameV(w, v)) : [];
      if (far.length) {
        const at = (c) => [v.X + Math.cos((c * Math.PI) / 180), v.Y - Math.sin((c * Math.PI) / 180)];
        const dist = (c) => { const p = at(c); return Math.min(...far.map((w) => Math.hypot(w.X - p[0], w.Y - p[1]))); };
        return dist(c1) > dist(c2) ? c1 : c2;
      }
      return c2 > 90 && c2 < 270 ? c1 : c2;
    }
    let best = -1, ang = 0;
    for (let i = 0; i < 24; i++) {
      const a = i * 15, gap = Math.min(...d.map((x) => Math.abs(((a - x + 540) % 360) - 180)));
      if (gap > best + 1e-6) { best = gap; ang = a; }
    }
    return ang;
  }
  // where a bond grown from v goes: straight on at the chain's end, else a branch
  function grow(v, angle, sym, tail) {
    const chain = v.chain;
    let pos = v.g ? v.g.pidx + 1 : v.idx;
    while (pos < chain.items.length && (chain.items[pos].t === 'branch' || chain.items[pos].t === 'ring')) pos++;
    const straight = pos >= chain.items.length && !v.inRing && !(v.g == null && v.inBond == null && chain.items.length && chain.items[0].t === 'ring');
    const def = straight ? v.defAngle : v.branchDef;
    const bond = { t: 'bond', sym, extra: '', arg: Math.abs(C.norm360(angle - def)) < 0.01 ? null : [fmtA(angle)], dirty: true, raw: '' };
    const items = [bond, ...tail];
    if (straight) chain.items.push(...items);
    else chain.items.splice(pos, 0, { t: 'branch', chain: { opt: '', items } });
    touch(v.mol);
    return bond;
  }
  function chainOf(item) { return item.parent; }
  // a bond's name for \chemmove, -[@{name}…]: kept when its angle changes
  const bondName = (arg0) => (/^\s*@\{[^}]*\}/.exec(arg0 || '') || [''])[0];
  // cut a chain from item on; an emptied branch goes, an emptied molecule goes
  function cutFrom(item, mol) {
    const ch = chainOf(item);
    ch.items.splice(item.pidx);
    touch(mol);
    let c = ch;
    while (!c.items.length && c.owner) { const o = c.owner; o.chain.items.splice(o.chain.items.indexOf(o.item), 1); c = o.chain; }
    if (!mol.chain.items.length) deleteMol(mol);
  }
  function deleteRing(ring, mol) {
    const o = ring.chain.owner;
    if (!o) return;
    const i = o.chain.items.indexOf(ring);
    if (i >= 0) o.chain.items.splice(i, 1);
    touch(mol);
    let c = o.chain;
    while (!c.items.length && c.owner) { const p = c.owner; p.chain.items.splice(p.chain.items.indexOf(p.item), 1); c = p.chain; }
    if (!mol.chain.items.length) deleteMol(mol);
  }
  // where a segment sits: its list, and the container holding it (\subscheme, brackets, \chemname, \charge)
  function parentOf(seg, Ls = E.M.segs, own = null) {
    for (const g of Ls) { if (g === seg) return { list: Ls, own }; if (g.inner) { const r = parentOf(seg, g.inner, g); if (r) return r; } }
    return null;
  }
  function listOf(seg) { const p = parentOf(seg); return p ? p.list : E.M.segs; }
  // the compound a molecule belongs to, out of names, brackets and charges: its piece in a scheme's list
  function compOf(seg) {
    let c = seg, p = parentOf(c);
    while (p && p.own && p.own.t !== 'sub') { c = p.own; p = parentOf(c); }
    return { seg: c, list: p ? p.list : E.M.segs, sub: p ? p.own : null };
  }
  // the brackets nearest round a molecule, inside its compound
  function lrOf(seg) { let p = parentOf(seg); while (p && p.own && p.own.t !== 'sub') { if (p.own.t === 'lr') return p.own; p = parentOf(p.own); } return null; }
  const isStep = (g) => g.t === 'arrow' || g.t === 'merge';
  const blank = (g) => g && g.t === 'text' && !g.raw.trim();
  // an arrow between two compounds already placed: \arrow(@c1--@c2)
  const isDirect = (A) => A.t === 'arrow' && /^\(\s*@[\s\S]*--\s*@/.test(A.names || '');
  const inScheme = () => E.M.segs.some((g) => g.t === 'start');
  function deleteMol(mol) {
    let seg = mol;
    if (mol.owner && mol.owner.inner.filter((g) => g.t === 'mol').length === 1) seg = mol.owner;
    const list = listOf(seg), i = list.indexOf(seg);
    if (i < 0) return;
    // a + sign next to it goes too
    let a = i, b = i;
    if (blank(list[b + 1]) && list[b + 2] && list[b + 2].t === 'plus') b += 2;
    else if (list[b + 1] && list[b + 1].t === 'plus') b += 1;
    else if (blank(list[a - 1]) && list[a - 2] && list[a - 2].t === 'plus') a -= 2;
    else if (list[a - 1] && list[a - 1].t === 'plus') a -= 1;
    list.splice(a, b - a + 1);
    if (seg.owner) seg.owner.dirty = true;
    E.M.dirty = true;
  }
  function deleteVertex(v) {
    if (v.inRing && v.ring) { deleteRing(v.ring, v.mol); return; }
    if (v.inBond) { cutFrom(v.inBond, v.mol); return; }
    deleteMol(v.mol);
  }
  function deleteBond(b) {
    if (b.hook) return;
    if (b.ring) { deleteRing(b.ring.item, b.mol); return; }
    cutFrom(b.item, b.mol);
  }
  function setLabel(v, text) {
    text = String(text);
    if (v.g) {
      if (text.trim()) v.g.raw = text;
      else { const ch = v.g.parent; ch.items.splice(ch.items.indexOf(v.g), 1); }
    } else if (text.trim()) {
      v.chain.items.splice(v.idx, 0, { t: 'atom', raw: text });
    }
    touch(v.mol);
  }
  // the vertex's main atom (the one bonds arrive at), as atom pieces to edit
  function atomsOf(v) {
    const raw = v.g ? v.g.raw : '';
    if (/\?/.test(raw)) return null;
    const sp = C.splitAtoms(raw);
    return sp.atoms;
  }
  // names for \chemmove (@{name}) stay in front of their atoms
  function writeAtoms(v, atoms) { setLabel(v, atoms.map((a) => (a.name ? `@{${a.name}}` : '') + a.raw).join('')); }
  const namesIn = (raw) => (String(raw || '').match(/@\{[^}]*\}/g) || []).join('');
  function chargesOf(a) { return a && a.charges ? a.charges : []; }
  function setAtomCharges(a, list) {
    const inner = a.inner != null ? a.inner : a.raw;
    if (!list.length) { a.raw = inner; return; }
    a.raw = `\\${a.cmd || 'charge'}{${list.map((c) => `${c.pos}${c.off ? `:${c.offRaw || c.off}` : ''}${c.tikz || ''}=${c.what}`).join(',')}}{${inner}}`;
  }
  // + and − as a superscript on the main atom
  function signOf(a) { const t = a ? (a.inner != null ? a.inner : a.raw) : ''; return /\^\{?\+\}?$/.test(t) ? '+' : /\^\{?-\}?$/.test(t) ? '-' : ''; }
  function setSign(v, sign) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return false;
    const a = atoms[Math.min(v.k, atoms.length - 1)];
    let t = (a.inner != null ? a.inner : a.raw).replace(/\^\{?[+-]\}?$/, '');
    if (sign) t += `^{${sign}}`;
    if (a.inner != null) { a.inner = t; setAtomCharges(a, chargesOf(a)); } else a.raw = t;
    writeAtoms(v, atoms);
    return true;
  }
  function toggleDecor(v, what, angle) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return false;
    const a = atoms[Math.min(v.k, atoms.length - 1)];
    const list = chargesOf(a).map((c) => ({ ...c }));
    const i = list.findIndex((c) => Math.abs(c.angle - angle) < 1 && c.what.trim() === what);
    if (i >= 0) list.splice(i, 1); else { const j = list.findIndex((c) => Math.abs(c.angle - angle) < 1); if (j >= 0) list.splice(j, 1); list.push({ pos: String(angle), angle, off: 0, what }); }
    if (a.inner == null) { a.inner = a.raw; a.cmd = 'charge'; }
    setAtomCharges(a, list);
    writeAtoms(v, atoms);
    return true;
  }
  // a free spot for a charge: the quarter with no bond in it
  function freeSpot(v) {
    const d = dirsAt(v), atoms = atomsOf(v) || [], a = atoms[Math.min(v.k, atoms.length - 1)], taken = chargesOf(a).map((c) => c.angle);
    let best = 90, bg = -1;
    for (const c of [90, 0, 270, 180, 45, 135, 225, 315]) {
      if (taken.some((t) => Math.abs(t - c) < 1)) continue;
      const gap = d.length ? Math.min(...d.map((x) => Math.abs(((c - x + 540) % 360) - 180))) : 180;
      if (gap > bg + 20) { bg = gap; best = c; }
    }
    return best;
  }

  // ---------------------------------------------------------------- schemes
  const T = (raw) => ({ t: 'text', raw });
  const newMol = (code) => ({ t: 'mol', head: '\\chemfig', chain: C.parseChain(code, () => {}, E.M.segs.defs), raw: `\\chemfig{${code}}`, dirty: false });
  const copyMol = (m) => newMol(m ? C.writeChain(m.chain) : 'A');
  const lastMol = (segs) => { for (let i = segs.length - 1; i >= 0; i--) { const g = segs[i]; if (g.t === 'mol') return g; if (g.t === 'name') { const m = lastMol(g.inner); if (m) return m; } } return null; };
  function topOf(seg) { return seg.owner || seg; }
  // inside \hreac … \endhreac, arrows are > and + is a bare +: added before \endhreac or after the selection
  function addInHreac(seg, after) {
    const segs = E.M.segs, hi = segs.findIndex((g) => g.t === 'hstart');
    let ho = segs.findIndex((g) => g.t === 'hstop');
    if (ho < 0) { segs.push(T('\n'), { t: 'hstop', raw: '\\endhreac' }); ho = segs.length - 1; }
    let at = ho;
    if (after) { const i = segs.indexOf(topOf(after)); if (i > hi && i < ho) at = i + 1; }
    while (at > hi + 1 && segs[at - 1].t === 'text' && !segs[at - 1].raw.trim()) at--;
    const m = copyMol(after || lastMol(segs.slice(hi, at)));
    segs.splice(at, 0, T('\n  '), seg, T('\n  '), m);
    E.M.dirty = true;
    return m;
  }
  const inHreac = () => E.M.segs.some((g) => g.t === 'hstart');
  function addArrow(type, after) {
    const segs = E.M.segs;
    if (inHreac()) { addInHreac({ t: 'harrow', raw: type === '->' ? '>' : `>{${type}}`, type, labels: [] }, after); return null; }
    let si = segs.findIndex((g) => g.t === 'start');
    if (si < 0) {
      // the drawing becomes the first compound of a scheme
      const body = segs.slice();
      while (body.length && body[0].t === 'text' && !body[0].raw.trim()) body.shift();
      while (body.length && body[body.length - 1].t === 'text' && !body[body.length - 1].raw.trim()) body.pop();
      segs.length = 0;
      segs.push({ t: 'start', raw: '\\schemestart' }, T('\n  '), ...body, T('\n'), { t: 'stop', raw: '\\schemestop' });
      si = 0;
    }
    let so = segs.findIndex((g) => g.t === 'stop');
    if (so < 0) { segs.push(T('\n'), { t: 'stop', raw: '\\schemestop' }); so = segs.length - 1; }
    // after the compound holding the selection (in its \subscheme, if it is in one), or at the end
    const A = { t: 'arrow', names: '', type, labels: [], opt: [], dirty: true, raw: '' };
    const c = after ? compOf(after) : null;
    if (c && c.list !== segs) {
      const Ls = c.list;
      let i = Ls.indexOf(c.seg) + 1;
      while (i < Ls.length && !isStep(Ls[i])) i++;
      while (blank(Ls[i - 1])) i--;
      Ls.splice(i, 0, T('\n  '), A, T('\n  '), copyMol(after));
      E.M.dirty = true;
      return A;
    }
    let at = so;
    if (c) {
      let i = segs.indexOf(c.seg);
      if (i >= 0) { i++; while (i < so && !isStep(segs[i])) i++; at = i; }
    }
    // back over blanks before the stop
    while (at > si + 1 && blank(segs[at - 1])) at--;
    const src = after || lastMol(segs.slice(si, at));
    segs.splice(at, 0, T('\n  '), A, T('\n  '), copyMol(src));
    E.M.dirty = true;
    return A;
  }
  function addPlus(after) {
    const segs = E.M.segs;
    if (inHreac()) return addInHreac({ t: 'plus', raw: '+' }, after);
    const src = after || lastMol(segs);
    const m = copyMol(src);
    if (!src) { segs.push(T(' '), { t: 'plus', raw: '\\+' }, T(' '), m); E.M.dirty = true; return m; }
    const c = compOf(src), i = c.list.indexOf(c.seg);
    c.list.splice(i + 1, 0, T(' '), { t: 'plus', raw: '\\+' }, T(' '), m);
    E.M.dirty = true;
    return m;
  }
  // an arrow (or \merge) goes with the compound after it; an arrow between placed compounds goes alone.
  // \chemmove and settings in the way are kept
  function deleteArrow(A) {
    const Ls = listOf(A), i = Ls.indexOf(A);
    if (i < 0) return;
    let j = i + 1;
    if (!isDirect(A)) while (j < Ls.length && !isStep(Ls[j]) && Ls[j].t !== 'stop') j++;
    let a = i;
    while (a > 0 && blank(Ls[a - 1])) a--;
    const gone = Ls.splice(a, j - a);
    Ls.splice(a, 0, ...gone.filter((g) => ['move', 'set', 'submol', 'nameinit'].includes(g.t)));
    E.M.dirty = true;
  }
  // \merge from the last two compounds to a new one
  function addMerge() {
    const segs = E.M.segs, comps = lay().comps || [];
    const lv = Math.min(...comps.map((x) => x.level)), named = comps.filter((x) => x.name);
    let top = named.filter((x) => x.level === lv);
    if (top.length < 2) top = named;
    if (!inScheme() || inHreac() || top.length < 2) return null;
    const so = segs.findIndex((g) => g.t === 'stop');
    let at = so < 0 ? segs.length : so;
    while (at > 1 && blank(segs[at - 1])) at--;
    const M = { t: 'merge', dir: 'v', labels: [], srcs: top.slice(-2).map((x) => x.name), target: '', opt: [], dirty: true, raw: '' };
    segs.splice(at, 0, T('\n  '), M, T('\n  '), copyMol(lastMol(segs.slice(0, at))));
    E.M.dirty = true;
    return M;
  }
  // brackets round a molecule: \chemleft[ … \chemright]
  const BRK = { '[': ']', '(': ')', '\\{': '\\}' };
  function setBrackets(mol, k) {
    const lr = lrOf(mol);
    if (lr) {
      if (!k) { const p = parentOf(lr); p.list.splice(p.list.indexOf(lr), 1, ...lr.inner); if (p.own && p.own.t === 'name') for (const x of lr.inner) x.owner = p.own; }
      else { lr.l = k; lr.r = BRK[k]; lr.pre = `\\chemleft${k}`; lr.post = `\\chemright${BRK[k]}`; }
    } else if (k) {
      const p = parentOf(mol);
      const w = { t: 'lr', l: k, r: BRK[k], inner: [mol], pre: `\\chemleft${k}`, post: `\\chemright${BRK[k]}`, raw: '' };
      if (p.own && p.own.t === 'name') w.owner = p.own;
      p.list.splice(p.list.indexOf(mol), 1, w);
    }
    E.M.dirty = true;
  }
  // \subscheme{compound \arrow compound}: what the next arrow leads to, grouped with this compound
  function nextStep(mol) {
    const c = compOf(mol), Ls = c.list;
    let j = Ls.indexOf(c.seg) + 1;
    while (j < Ls.length && !isStep(Ls[j]) && Ls[j].t !== 'stop') j++;
    return j < Ls.length && isStep(Ls[j]) && !isDirect(Ls[j]) ? { c, j } : null;
  }
  function groupNext(mol) {
    const n = nextStep(mol);
    if (!n) return false;
    const Ls = n.c.list, i = Ls.indexOf(n.c.seg);
    let k = n.j + 1;
    while (k < Ls.length && !isStep(Ls[k]) && Ls[k].t !== 'stop') k++;
    while (k > n.j + 1 && blank(Ls[k - 1])) k--;
    const sub = { t: 'sub', opt: '', inner: Ls.slice(i, k), pre: '\\subscheme{', post: '}', raw: '' };
    Ls.splice(i, k - i, sub);
    E.M.dirty = true;
    return true;
  }
  function ungroup(sub) { const p = parentOf(sub); if (p) { p.list.splice(p.list.indexOf(sub), 1, ...sub.inner); E.M.dirty = true; } }
  function setSubAngle(sub, v) { sub.opt = String(v).trim(); sub.pre = sub.opt ? `\\subscheme[${sub.opt}]{` : '\\subscheme{'; E.M.dirty = true; }

  // ---------------------------------------------------------------- curved arrows (\chemmove)
  // Each \draw in a \chemmove body is one curved arrow; the editor rewrites the k-th one in place.
  const DRAW_RE = /\\(draw|path)\s*(\[[^\]]*\])?([^;]*);/g;
  function drawsOf(seg) {
    const out = [], re = new RegExp(DRAW_RE.source, 'g');
    let m;
    while ((m = re.exec(seg.body))) out.push({ i: m.index, e: re.lastIndex, cmd: m[1], opt: m[2] ? m[2].slice(1, -1) : '', path: m[3] });
    return out;
  }
  const moveRaw = (seg) => `\\chemmove${seg.opt ? `[${seg.opt}]` : ''}{${seg.body}}`;
  function setDraw(seg, k, d) {
    const D0 = drawsOf(seg)[k];
    if (!D0) return;
    const x = { ...D0, ...d };
    seg.body = seg.body.slice(0, D0.i) + `\\${x.cmd}${x.opt ? `[${x.opt}]` : ''}${x.path};` + seg.body.slice(D0.e);
    seg.raw = moveRaw(seg); E.M.dirty = true;
  }
  function deleteDraw(seg, k) {
    const D0 = drawsOf(seg)[k];
    if (!D0) return;
    seg.body = seg.body.slice(0, D0.i) + seg.body.slice(D0.e);
    seg.raw = moveRaw(seg);
    if (!drawsOf(seg).length) {
      const Ls = listOf(seg), i = Ls.indexOf(seg);
      let a = i;
      if (blank(Ls[a - 1])) a--;
      Ls.splice(a, i - a + 1);
    }
    E.M.dirty = true;
  }
  // the simple form the handles edit: (a)..controls +(α:r) and +(β:s)..(b)
  // TikZ's named directions in a polar coordinate: +(up:1cm), +(north west:5mm)
  const DIRS = { right: 0, east: 0, up: 90, north: 90, left: 180, west: 180, down: 270, south: 270, 'north east': 45, 'north west': 135, 'south west': 225, 'south east': 315 };
  const ANG = '(-?[\\d.]+|[a-z]+(?:\\s+[a-z]+)?)';
  const SIMPLE = new RegExp(`^\\s*\\(([^()]*)\\)\\s*\\.\\.\\s*controls\\s*\\+\\(\\s*${ANG}\\s*:\\s*(-?[\\d.]+)\\s*(cm|mm|pt)?\\s*\\)\\s*and\\s*\\+\\(\\s*${ANG}\\s*:\\s*(-?[\\d.]+)\\s*(cm|mm|pt)?\\s*\\)\\s*\\.\\.\\s*\\(([^()]*)\\)\\s*$`);
  const UNIT = { cm: 1, mm: 0.1, pt: 2.54 / 72.27, '': 1 };
  const angOf = (a) => (a in DIRS ? DIRS[a] : /^-?[\d.]+$/.test(a) ? +a : NaN);
  function simpleOf(path) {
    const m = SIMPLE.exec(path || '');
    if (!m) return null;
    const out = angOf(m[2]), inn = angOf(m[5]);
    return isNaN(out) || isNaN(inn) ? null : { a: m[1], out, r1: +m[3] * UNIT[m[4] || ''], in: inn, r2: +m[6] * UNIT[m[7] || ''], b: m[8] };
  }
  const cm = (n) => `${+n.toFixed(2)}cm`;
  const simplePath = (q) => `(${q.a})..controls +(${+q.out.toFixed(1)}:${cm(q.r1)}) and +(${+q.in.toFixed(1)}:${cm(q.r2)})..(${q.b})`;
  // options of a \draw, by what they set: tips, line, colour
  const TIP_RE = /^([<>]?|CF|stealth|latex|to)?-([<>]?|CF|stealth|latex|to)?$/;
  const isColour = (o) => { const q = /^(?:color\s*=\s*|draw\s*=\s*)?([a-zA-Z]+(?:![\d.]+(?:![a-zA-Z]+)?)?)$/.exec(o); return !!(q && !/^(dashed|dotted|solid|thin|thick|semithick|overlay)$/.test(q[1]) && TD.tikzColor && TD.tikzColor(q[1])); };
  function setDrawOpt(seg, k, what, val) {
    const D0 = drawsOf(seg)[k];
    if (!D0) return;
    const drop = what === 'tips' ? (o) => TIP_RE.test(o) : what === 'line' ? (o) => /^(dashed|dotted|solid|dash pattern\s*=)/.test(o) : isColour;
    const opts = D0.opt.split(',').map((o) => o.trim()).filter((o) => o && !drop(o));
    if (val) opts.unshift(val);
    setDraw(seg, k, { opt: opts.join(',') });
  }
  // a name for what a curved arrow starts or ends at: @{e1} before the atom, or -[@{e1}] on the bond
  function freshName() {
    const code = codeOf(E.M);
    let i = 1;
    while (new RegExp(`@\\{\\s*e${i}\\s*[},]`).test(code)) i++;
    return `e${i}`;
  }
  function nameFor(t) {
    if (t.v) {
      const v = findV(t.v), atoms = v && atomsOf(v);
      if (!atoms || !atoms.length) return null;
      const a = atoms[Math.min(v.k, atoms.length - 1)];
      if (a.name) return a.name;
      a.name = freshName();
      writeAtoms(v, atoms); L = null;
      return a.name;
    }
    const b = lay().bonds.find((x) => x.item === t.b);
    if (!b) return null;
    const arg = (b.item.arg || []).slice(), m = /^\s*@\{([^},]*)/.exec(arg[0] || '');
    if (m) return m[1].trim();
    const n = freshName();
    arg[0] = `@{${n}}${arg[0] || ''}`;
    b.item.arg = arg; b.item.dirty = true; touch(b.mol); L = null;
    return n;
  }
  const endPt = (t) => { if (t.v) { const v = findV(t.v); return v && [v.X, v.Y]; } const b = lay().bonds.find((x) => x.item === t.b); return b && [(b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2]; };
  // a new curved arrow from one atom or bond to another, bowed upward
  function addMove(from, to) {
    const p1 = endPt(from), p2 = endPt(to);
    if (!p1 || !p2) return null;
    const a = nameFor(from), b = nameFor(to);
    if (!a || !b) return null;
    const th = (Math.atan2(-(p2[1] - p1[1]), p2[0] - p1[0]) * 180) / Math.PI, up = Math.cos((th * Math.PI) / 180) >= 0 ? 1 : -1;
    const r = Math.max(0.3, (0.4 * Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) / TD.PX_PER_CM);
    const q = { a, b, out: C.norm360(Math.round(th + 60 * up)), in: C.norm360(Math.round(th + 180 - 60 * up)), r1: Math.round(r * 20) / 20, r2: Math.round(r * 20) / 20 };
    const seg = { t: 'move', opt: '-stealth,shorten <=2pt,shorten >=2pt', body: `\\draw${simplePath(q)};` };
    seg.raw = moveRaw(seg);
    E.M.segs.push(T('\n'), seg);
    E.M.dirty = true;
    return seg;
  }
  const selM = () => (E.sel && E.sel.m ? (lay().moves || []).find((x) => x.seg === E.sel.m.seg && x.k === E.sel.m.k) || null : null);
  // a curved arrow's path, as SVG, and points along it for hit-testing
  function movePts(mv, n = 16) {
    const { pts, ops } = mv.segs, out = [pts[0]];
    ops.forEach((o, i) => {
      const p0 = pts[i], p3 = pts[i + 1];
      if (o.k !== 'curve') { out.push(p3); return; }
      for (let j = 1; j <= n; j++) {
        const t = j / n, u = 1 - t;
        out.push([u * u * u * p0[0] + 3 * u * u * t * o.c1[0] + 3 * u * t * t * o.c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * o.c1[1] + 3 * u * t * t * o.c2[1] + t * t * t * p3[1]]);
      }
    });
    return out;
  }
  const moveD = (mv) => movePts(mv).map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');
  // the two control points of a curved arrow in the simple form, and the atoms (or bonds) they hang from
  function mctls(mv) {
    const D0 = drawsOf(mv.seg)[mv.k], q = D0 && simpleOf(D0.path), o = mv.segs.ops[0];
    if (!q || mv.segs.ops.length !== 1 || o.k !== 'curve') return [];
    const at = (c, a, r) => ({ cx: c[0], cy: c[1], ax: c[0] - r * TD.PX_PER_CM * Math.cos((a * Math.PI) / 180), ay: c[1] + r * TD.PX_PER_CM * Math.sin((a * Math.PI) / 180) });
    return [{ i: 1, ...at(o.c1, q.out, q.r1) }, { i: 2, ...at(o.c2, q.in, q.r2) }];
  }

  function nameOf(mol) { return mol.owner ? mol.owner.name : ''; }
  function setName(mol, name) {
    name = String(name);
    if (mol.owner) {
      if (name.trim()) { mol.owner.name = name; mol.owner.dirty = true; }
      else { const o = mol.owner, list = listOf(o), i = list.indexOf(o); list.splice(i, 1, ...o.inner); for (const x of o.inner) delete x.owner; delete mol.owner; mol.dirty = true; }
    } else if (name.trim()) {
      const list = listOf(mol), i = list.indexOf(mol);
      const nm = { t: 'name', head: '\\chemname', inner: [mol], mid: '}{', name, raw: '', dirty: true };
      mol.owner = nm;
      list.splice(i, 1, nm);
    }
    E.M.dirty = true;
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'cfModal';
  root.className = 'modal';
  root.hidden = true;
  const ic = (d) => `<svg viewBox="0 0 20 20">${d}</svg>`;
  root.innerHTML = `<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="cfTitle">
    <div class="modal-head">
      <strong id="cfTitle">Chemistry</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ce="delete" title="Delete the selection (⌫)">${ic('<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>')}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ce="undo" title="Undo (${isMac ? '⌘' : 'Ctrl+'}Z)">${ic('<path d="M7 5L3 9l4 4"/><path d="M3 9h9a4.5 4.5 0 010 9H9"/>')}</button>
        <button class="icon flat" data-ce="redo" title="Redo (${isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z'})">${ic('<path d="M13 5l4 4-4 4"/><path d="M17 9H8a4.5 4.5 0 000 9h3"/>')}</button>
        <button class="icon flat" data-ce="fit" title="Fit the drawing in view (0)">${ic('<path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"/>')}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ce="cancel">Cancel</button>
      <button class="primary" data-ce="done" title="${isMac ? '⌘' : 'Ctrl+'}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list cf-list" role="list"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg cf-svg" aria-label="Chemistry"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>chemfig</span><small class="cz-count"></small><button class="flat" data-ce="copy" title="Copy the chemfig code">Copy</button></div>
          <textarea spellcheck="false" aria-label="chemfig code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>`;
  document.body.appendChild(root);
  const menu = document.createElement('div');
  menu.className = 'ctx qe-ctx'; menu.hidden = true;
  root.appendChild(menu);
  const svg = $('.cf-svg', root), stage = $('.cz-stage', root), list = $('.cf-list', root), search = $('.cz-search input', root);
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root);

  // ---------------------------------------------------------------- state
  // { M, sel: { v: key } | { b: bond item } | { a: arrow seg } | null, arm, bond (kind new bonds get), view: { k, ox, oy }, undo, redo, pending, start, done, drag, hover }
  let E = null, lastDown = { t: 0, x: 0, y: 0 };
  const snapCode = () => codeOf(E.M);
  function begin() { if (E.pending == null) E.pending = snapCode(); }
  function commit() {
    if (E.pending == null) return;
    const now = snapCode();
    if (now !== E.pending) { E.undo.push(E.pending); if (E.undo.length > 200) E.undo.shift(); E.redo = []; }
    E.pending = null;
    updateTools();
  }
  function edit(fn) { begin(); const r = fn(); L = null; commit(); clampSel(); draw(); renderProps(); return r; }
  function restore(code) { E.M = load(code); L = null; E.sel = null; draw(); renderProps(); updateTools(); }
  function undo() { commit(); if (!E.undo.length) return; E.redo.push(snapCode()); restore(E.undo.pop()); }
  function redo() { commit(); if (!E.redo.length) return; E.undo.push(snapCode()); restore(E.redo.pop()); }
  function clampSel() { if (E.sel && !selV() && !selB() && !selA() && !selM()) E.sel = null; }

  // ---------------------------------------------------------------- palette
  function sizeMinis(el, maxW, maxH, top) {
    for (const m of el.querySelectorAll('.zxmini')) {
      const [, , vw, vh] = m.getAttribute('viewBox').split(' ').map(Number), k = Math.min(top, maxW / vw, maxH / vh);
      m.style.width = `${r2(vw * k)}px`; m.style.height = `${r2(vh * k)}px`;
    }
  }
  function buildPalette() {
    const q = search.value.trim().toLowerCase();
    let html = '';
    for (const [title, items] of PAL) {
      const hits = items.filter(([k, name]) => !q || `${name} ${k.slice(2)} ${title}`.toLowerCase().includes(q));
      if (!hits.length) continue;
      html += `<div class="cz-cat"><div class="cz-cat-t">${esc(title)}</div><div class="qe-grid">${hits.map(([k, name, , key]) => {
        const on = E && (E.arm === k || k === `b:${E.bond}`);
        return `<button class="qe-item${on ? ' on' : ''}" data-item="${esc(k)}" title="${esc(name)}${key ? ` (${key})` : ''}" role="listitem"><span class="qe-fig">${TD.chemMini(ITEM[k].mini)}</span><span>${esc(name)}</span></button>`;
      }).join('')}</div></div>`;
    }
    list.innerHTML = html || `<div class="cz-empty">Nothing matches “${esc(search.value)}”</div>`;
    sizeMinis(list, 60, 36, 1.4);
  }
  search.addEventListener('input', buildPalette);
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (search.value) { search.value = ''; buildPalette(); } else search.blur(); e.stopPropagation(); }
    if (e.key === 'Enter') { const b = $('.qe-item', list); if (b) pick(b.dataset.item); search.blur(); }
  });
  list.addEventListener('click', (e) => { const b = e.target.closest('.qe-item'); if (b) pick(b.dataset.item); });
  // a palette item acts on the selection; with nothing selected it is armed, to click onto an atom or bond
  function pick(k) {
    const kind = k[0], val = k.slice(2);
    if (kind === 'b') { E.bond = val; buildPalette(); }
    if (kind === 's' && val === 'move') {
      E.arm = E.arm === k ? null : k; E.mvFrom = null;
      buildPalette(); draw();
      setTip(E.arm ? 'Curved arrow: click the atom or bond it starts from. Esc to stop.' : '');
      return;
    }
    if (kind === 's') { apply(k, null); return; }
    const v = selV(), b = selB();
    if ((v || b) && apply(k, v ? { v } : { b })) { E.arm = null; buildPalette(); return; }
    if (lay().empty && (kind === 'a' || kind === 'r' || kind === 'g')) { apply(k, null); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(E.arm ? `${ITEM[k].name}: click an atom${kind === 'b' || kind === 'r' ? ' or a bond' : ''}. Esc when done.` : kind === 'b' ? `${ITEM[k].name}: new bonds are of this kind` : '');
  }
  // what a palette item does to an atom ({ v }), a bond ({ b }) or the drawing (null); false: nothing
  function apply(k, on) {
    const kind = k[0], val = k.slice(2);
    if (kind === 's') {
      const after = selV() ? selV().mol : selB() ? selB().mol : null;
      let A = null, m = null;
      if (val === 'merge') {
        if (!inScheme() || inHreac() || (lay().comps || []).length < 2) { setTip('A merge joins two compounds of a scheme: add an arrow first'); return false; }
        edit(() => { A = addMerge(); });
        if (!A) { setTip('A merge joins two compounds of a scheme: add an arrow first'); return false; }
      } else edit(() => { if (val === '+') m = addPlus(after); else A = addArrow(val, after); });
      if (A) E.sel = { a: A }; else E.sel = null;
      draw(); renderProps(); keepInView();
      return true;
    }
    if (!on) {
      // an empty drawing: start a molecule
      const code = kind === 'a' ? val || '' : kind === 'r' ? RINGS[val] : kind === 'g' ? GROUPS[val](0) : '';
      if (!code) return false;
      edit(() => { E.M.segs.push(newMol(code)); E.M.dirty = true; });
      E.sel = null; keepInView(); draw(); renderProps();
      return true;
    }
    const v = on.v, b = on.b;
    if (b) {
      if (kind === 'b') { if (b.hook) return false; edit(() => { b.item.sym = val; b.item.dirty = true; touch(b.mol); }); return true; }
      if (kind === 'r') {
        // fused onto this side of a ring: the new ring shares it
        if (!b.ring || !b.item.parent || b.item.pidx < 1) { setTip(b.ring ? 'Fuse a ring onto another side: this one starts its ring' : 'Rings fuse onto a ring\'s side; pick an atom to attach a ring with a bond'); return false; }
        const n = val === 'benzene' || val === 'arom' ? 6 : +val;
        const sides = val === 'benzene' ? '=-=-=' : '-'.repeat(n - 1);
        edit(() => { b.item.parent.items.splice(b.item.pidx, 0, { t: 'ring', star: val === 'arom' ? '**' : '*', arc: '', n, chain: C.parseChain(sides, () => {}) }); touch(b.mol); });
        E.sel = null; draw(); renderProps(); keepInView();
        return true;
      }
      return false;
    }
    if (!v) return false;
    if (kind === 'a') { edit(() => setLabel(v, val ? namesIn(v.g && v.g.raw) + val : val)); reselect(v); return true; }
    if (kind === 'b') { addBondAt(v, freeAngle(v), val); return true; }
    if (kind === 'r') { const a = freeAngle(v); let nb; edit(() => { nb = grow(v, a, E.bond === '-' || !E.bond ? '-' : E.bond, [{ t: 'ring', star: val === 'arom' ? '**' : '*', arc: '', n: val === 'benzene' || val === 'arom' ? 6 : +val, chain: C.parseChain(RINGS[val].replace(/^\*+\d+\(|\)$/g, ''), () => {}) }]); }); E.sel = { b: nb }; draw(); renderProps(); keepInView(); return true; }
    if (kind === 'g') { const a = freeAngle(v); let nb; edit(() => { nb = grow(v, a, '-', C.parseChain(GROUPS[val](a), () => {}).items); }); E.sel = { b: nb }; draw(); renderProps(); keepInView(); return true; }
    if (kind === 'c') {
      if (!v.g || !atomsOf(v)) { setTip('Charges go on a labelled atom: give it a label first'); return false; }
      let ok = false;
      edit(() => {
        if (val === 'plus' || val === 'minus') { const s = val === 'plus' ? '+' : '-', cur = signOf((atomsOf(v) || [])[v.k]); ok = setSign(v, cur === s ? '' : s); }
        else ok = toggleDecor(v, { pair: '\\:', rad: '\\.', dplus: '$\\delta+$', dminus: '$\\delta-$' }[val], freeSpot(v));
      });
      reselect(v);
      return ok;
    }
    return false;
  }
  // after an edit the vertex object is new: find it again by what it holds
  function reselect(v) { const key = v.g || v.inBond || v.mol; L = null; const nv = lay().verts.find((x) => vkey(x) === key) || (v.inBond && lay().verts.find((x) => x.inBond === v.inBond)) || (!v.inBond && lay().verts.find((x) => x.mol === v.mol && x.root)); E.sel = nv ? { v: vkey(nv) } : null; draw(); renderProps(); }
  function addBondAt(v, angle, sym) {
    let nb;
    edit(() => { nb = grow(v, angle, sym, []); });
    L = null;
    const nv = lay().verts.find((x) => x.inBond === nb);
    E.sel = nv ? { v: vkey(nv) } : { b: nb };
    draw(); renderProps(); keepInView();
  }
  function setTip(t) { tip.textContent = t; tip.hidden = !t; }

  // ---------------------------------------------------------------- geometry
  const rect = () => svg.getBoundingClientRect();
  const overStage = (e) => { const r = stage.getBoundingClientRect(); return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; };
  const pos = (e) => { const r = rect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const S = (x, y) => [E.view.ox + x * E.view.k, E.view.oy + y * E.view.k];
  const D = (X, Y) => [(X - E.view.ox) / E.view.k, (Y - E.view.oy) / E.view.k];
  function vRadius(v) { const b = v.boxes[v.k]; return b && !b.empty ? Math.max(b.w, b.asc + b.desc) / 2 * E.view.k + 3 : 6; }
  function vertexAt(e, px = 8) {
    const [x, y] = pos(e);
    let best = null, bd = Infinity;
    for (const v of lay().verts) {
      if (v.sub) continue; // drawn from a \definesubmol: edited in its definition, not here
      const [X, Y] = S(v.X, v.Y), d = Math.hypot(X - x, Y - y);
      if (d <= Math.max(px, vRadius(v)) && d < bd) { bd = d; best = v; }
    }
    return best;
  }
  const segDist = (x, y, ax, ay, bx, by) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return Math.hypot(ax + dx * t - x, ay + dy * t - y); };
  function bondAt(e, px = 6) {
    const [x, y] = pos(e);
    let best = null, bd = px;
    for (const b of lay().bonds) {
      if (b.hook || b.sub) continue;
      const [ax, ay] = S(b.X0, b.Y0), [bx, by] = S(b.X1, b.Y1), d = segDist(x, y, ax, ay, bx, by);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function arrowAt(e, px = 8) {
    const [x, y] = pos(e);
    let best = null, bd = px;
    for (const a of lay().arrows) {
      if (a.seg.t === 'harrow') continue; // \hreac's > is edited in the code
      const [ax, ay] = S(a.x1, a.y1), [bx, by] = S(a.x2, a.y2);
      let d = segDist(x, y, ax, ay, bx, by);
      for (const l of a.labs) { const [lx, ly] = S(l.bx, l.by); if (Math.abs(lx - x) < (l.bw / 2) * E.view.k && Math.abs(ly - y) < (l.bh / 2 + 2) * E.view.k) d = 0; }
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }
  function moveAt(e, px = 6) {
    const [x, y] = pos(e);
    let best = null, bd = px;
    for (const mv of lay().moves || []) {
      const P = movePts(mv, 12).map((q) => S(q[0], q[1]));
      for (let i = 1; i < P.length; i++) { const d = segDist(x, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]); if (d < bd) { bd = d; best = mv; } }
    }
    return best;
  }
  function fit() {
    const Lo = lay(), r = rect(), bb = Lo.empty ? { x: -40, y: -30, w: 80, h: 60 } : Lo.bb;
    const k = Math.max(0.5, Math.min(4, Math.min((r.width - 120) / bb.w, (r.height - 120) / bb.h)));
    E.view = { k, ox: r.width / 2 - (bb.x + bb.w / 2) * k, oy: r.height / 2 - (bb.y + bb.h / 2) * k };
    draw();
  }
  // the view stays put unless the drawing has grown out of it
  function keepInView() {
    const Lo = lay(), r = rect();
    if (Lo.empty) return;
    const [x1, y1] = S(Lo.bb.x, Lo.bb.y), [x2, y2] = S(Lo.bb.x + Lo.bb.w, Lo.bb.y + Lo.bb.h);
    if (x1 >= 8 && y1 >= 8 && x2 <= r.width - 8 && y2 <= r.height - 8) return;
    // pan if it fits at this zoom, else fit
    if (x2 - x1 > r.width - 48 || y2 - y1 > r.height - 48) { fit(); return; }
    E.view.ox += x1 < 24 ? 24 - x1 : x2 > r.width - 24 ? r.width - 24 - x2 : 0;
    E.view.oy += y1 < 24 ? 24 - y1 : y2 > r.height - 24 ? r.height - 24 - y2 : 0;
    draw();
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const v = E.view, [sx, sy] = pos(e);
    if (e.ctrlKey || e.metaKey) {
      const k2 = Math.max(0.3, Math.min(12, v.k * Math.exp(-e.deltaY * 0.01)));
      v.ox = sx - ((sx - v.ox) * k2) / v.k; v.oy = sy - ((sy - v.oy) * k2) / v.k; v.k = k2;
    } else { v.ox -= e.deltaX; v.oy -= e.deltaY; }
    draw();
    if (Lb) Lb.pop.place();
  }, { passive: false });

  // ---------------------------------------------------------------- drawing
  const SNAP = 15;
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    // a grid for the eye: chemfig has no coordinates, so nothing snaps to it
    const step = TD.PX_PER_CM * 0.25 * k >= 7 ? TD.PX_PER_CM * 0.25 : TD.PX_PER_CM;
    let minor = '', major = '';
    const xs = Math.floor(-v.ox / k / step), xe = Math.ceil((W - v.ox) / k / step), ys = Math.floor(-v.oy / k / step), ye = Math.ceil((H - v.oy) / k / step);
    for (let i = xs; i <= xe; i++) { const X = Math.round(v.ox + i * step * k) + 0.5, maj = Math.abs(((i * step) / TD.PX_PER_CM) % 1) < 1e-6; if (maj) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`; }
    for (let j = ys; j <= ye; j++) { const Y = Math.round(v.oy + j * step * k) + 0.5, maj = Math.abs(((j * step) / TD.PX_PER_CM) % 1) < 1e-6; if (maj) major += `M0,${Y}H${W}`; else minor += `M0,${Y}H${W}`; }
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/><path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/>`;
    const Lo = lay();
    const sb = selB(), sa = selA(), sv = selV(), sm = selM();
    const tr = `transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${r2(k)})"`;
    if (sb) out += `<g ${tr}><path class="ze-wsel" d="M${r2(sb.X0)},${r2(sb.Y0)}L${r2(sb.X1)},${r2(sb.Y1)}" stroke-width="${r2(10 / k)}"/></g>`;
    if (sa) out += `<g ${tr}><path class="ze-wsel" d="M${r2(sa.x1)},${r2(sa.y1)}L${r2(sa.x2)},${r2(sa.y2)}" stroke-width="${r2(12 / k)}"/></g>`;
    if (sm) out += `<g ${tr}><path class="ze-wsel" d="${moveD(sm)}" stroke-width="${r2(10 / k)}"/></g>`;
    // a curved arrow's start, picked: marked until its end is picked
    const mf = E.arm === 's:move' && E.mvFrom;
    if (mf && mf.b) { const fb = Lo.bonds.find((x) => x.item === mf.b); if (fb) out += `<g ${tr}><path class="ze-wsel" d="M${r2(fb.X0)},${r2(fb.Y0)}L${r2(fb.X1)},${r2(fb.Y1)}" stroke-width="${r2(10 / k)}"/></g>`; }
    if (E.hover && E.hover.b && (!sb || E.hover.b !== sb.item) && !E.drag) { const hb = Lo.bonds.find((b) => b.item === E.hover.b); if (hb) out += `<g ${tr}><path class="cf-bhov" d="M${r2(hb.X0)},${r2(hb.Y0)}L${r2(hb.X1)},${r2(hb.Y1)}" stroke-width="${r2(8 / k)}"/></g>`; }
    if (!Lo.empty) out += `<g ${tr}>${C.draw({ type: 'chemfig', x: Lo.bb.x, y: Lo.bb.y, src: '', color: INK }, { paper: PAPER, export: true }, Lo)}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">Pick an atom, a ring or a group on the left to start</text>`;
    // atoms: a point on each bare vertex, rings round the selected and hovered ones
    for (const vx of Lo.verts) {
      const [X, Y] = S(vx.X, vx.Y), rr = vRadius(vx);
      const key = vkey(vx);
      if ((sv && vkey(sv) === key) || (mf && mf.v === key)) out += `<circle class="fy-vsel" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
      else if (E.drag && E.drag.mode === 'grow' && E.hover && E.hover.v === key) out += `<circle class="fy-vtarget" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
      else if (E.hover && E.hover.v === key && !E.drag) out += `<circle class="fy-vhov" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr)}"/>`;
    }
    // a bond being drawn, or an atom being turned
    if (E.drag && (E.drag.mode === 'grow' || (E.drag.mode === 'move' && E.drag.moved))) {
      const d = E.drag, [x0, y0] = S(d.fx, d.fy), [x1, y1] = S(d.tx, d.ty);
      out += `<path class="ze-draft" d="M${r2(x0)},${r2(y0)}L${r2(x1)},${r2(y1)}"/><circle class="cz-snap on" cx="${r2(x1)}" cy="${r2(y1)}" r="5"/>`;
    }
    // a curved arrow on its way: from its start to the pointer
    if (mf && E.ptr) { const p = endPt(mf); if (p) { const [x0, y0] = S(p[0], p[1]); out += `<path class="ze-draft" d="M${r2(x0)},${r2(y0)}L${r2(E.ptr[0])},${r2(E.ptr[1])}"/>`; } }
    // the selected arrow's head: drag it to turn and stretch the arrow
    if (sa && sa.seg.t === 'arrow' && !isDirect(sa.seg)) {
      const [hx, hy] = S(sa.x2, sa.y2);
      out += `<g class="ze-knob ze-ahead"><title>Drag to turn and stretch the arrow</title><circle cx="${r2(hx)}" cy="${r2(hy)}" r="5.5"/></g>`;
    }
    // the selected curved arrow's control points, on lines from the atoms they pull away from
    if (sm) for (const h of mctls(sm)) {
      const [ax, ay] = S(h.ax, h.ay), [cx, cy] = S(h.cx, h.cy);
      out += `<path class="ze-draft" d="M${r2(ax)},${r2(ay)}L${r2(cx)},${r2(cy)}"/><g class="ze-knob ze-mctl" data-i="${h.i}"><title>Drag to bend the arrow</title><circle cx="${r2(cx)}" cy="${r2(cy)}" r="5.5"/></g>`;
    }
    // the handle on the selected (or hovered) atom: drag it out for a new bond
    const kvx = !E.drag && !E.arm && (E.knobAt ? findV(E.knobAt) : sv);
    E.knobPos = null;
    if (kvx) {
      const ang = freeAngle(kvx), [X, Y] = S(kvx.X, kvx.Y), off = vRadius(kvx) + 12;
      const kx = r2(X + off * Math.cos((ang * Math.PI) / 180)), ky = r2(Y - off * Math.sin((ang * Math.PI) / 180));
      E.knobPos = { v: vkey(kvx), X, Y, kx, ky, ang };
      out += `<g class="ze-knob"><title>Drag out a ${esc(BOND_NAMES[E.bond].toLowerCase())} bond; click for one at ${Math.round(ang)}°</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6M${kx},${ky - 3}v6"/></g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = out;
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  // angle from a point to the pointer, snapped to 15° (⌥ for any)
  function aimAt(fx, fy, e) {
    const [x, y] = D(...pos(e));
    let a = C.norm360((Math.atan2(-(y - fy), x - fx) * 180) / Math.PI);
    if (!e.altKey) a = C.norm360(Math.round(a / SNAP) * SNAP);
    return a;
  }
  svg.addEventListener('pointerdown', (e) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    closeMenu();
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) fe.blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    svg.setPointerCapture(e.pointerId);
    if (e.button === 1 || E.space) { E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; return; }
    const ah = e.target.closest('.ze-ahead'), mc = e.target.closest('.ze-mctl');
    if (ah && selA()) {
      const a = selA(), P = lay().P, ux = Math.cos((a.ang * Math.PI) / 180), uy = -Math.sin((a.ang * Math.PI) / 180);
      E.drag = { mode: 'ahead', A: a.seg, ang0: a.ang, bx: a.x1 - ux * P.aoff, by: a.y1 - uy * P.aoff, sx, sy, moved: false };
      begin(); return;
    }
    if (mc && selM()) {
      const mv = selM(), h = mctls(mv).find((x) => x.i === +mc.dataset.i);
      if (h) { E.drag = { mode: 'mctl', i: h.i, seg: mv.seg, k: mv.k, ax: h.ax, ay: h.ay, sx, sy, moved: false }; begin(); return; }
    }
    const kb = e.target.closest('.ze-knob:not(.ze-ahead):not(.ze-mctl)');
    if (kb && E.knobPos) { const v = findV(E.knobPos.v); E.drag = { mode: 'grow', v: E.knobPos.v, fx: v.X, fy: v.Y, tx: v.X, ty: v.Y, sx, sy, moved: false, ang: E.knobPos.ang }; E.knobAt = null; return; }
    const v = vertexAt(e), mv = v ? null : moveAt(e, 5), b = v || mv ? null : bondAt(e), a = v || b || mv ? null : arrowAt(e);
    if (E.arm === 's:move') {
      const vb = !mv && v ? v : null, bb = vertexAt(e) ? null : bondAt(e);
      const t = vb && vb.g && (atomsOf(vb) || []).length ? { v: vkey(vb) } : !vb && bb && !bb.hook && bb.item && bb.item.t === 'bond' ? { b: bb.item } : null;
      if (!t) { setTip('Curved arrows go from and to a labelled atom or a bond. Esc to stop.'); return; }
      if (!E.mvFrom) { E.mvFrom = t; setTip('Curved arrow: now click the atom or bond it goes to'); draw(); return; }
      if ((t.v && t.v === E.mvFrom.v) || (t.b && t.b === E.mvFrom.b)) return;
      const from = E.mvFrom;
      let seg = null;
      E.mvFrom = null; E.arm = null; E.ptr = null;
      edit(() => { seg = addMove(from, t); });
      buildPalette(); setTip('');
      E.sel = seg ? { m: { seg, k: 0 } } : null;
      draw(); renderProps(); keepInView();
      return;
    }
    if (E.arm) {
      if (v || b) { const k = E.arm; apply(k, v ? { v } : { b }); return; }
      if (lay().empty) { apply(E.arm, null); return; }
    }
    if (v) {
      const key = vkey(v);
      if (dbl && E.sel && E.sel.v === key) { editLabel(v); return; }
      E.sel = { v: key };
      const ib = v.inBond && lay().bonds.find((x) => x.item === v.inBond);
      E.drag = { mode: 'move', v: key, sx, sy, moved: false, bond: ib && !ib.ring ? ib : null };
      draw(); renderProps(); return;
    }
    if (b) { if (dbl && E.sel && E.sel.b === b.item) { cycleBond(b); return; } E.sel = { b: b.item }; E.drag = null; draw(); renderProps(); return; }
    if (mv) { E.sel = { m: { seg: mv.seg, k: mv.k } }; E.drag = null; draw(); renderProps(); return; }
    if (a) { if (dbl && E.sel && E.sel.a === a.seg) { editArrowLabel(a, 0); return; } E.sel = { a: a.seg }; E.drag = null; draw(); renderProps(); return; }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      if (E.arm === 's:move' && E.mvFrom) { E.ptr = [sx, sy]; }
      const v = vertexAt(e, 12), kb = e.target.closest('.ze-knob'), b = v ? null : bondAt(e);
      const kp = E.knobPos, onWay = (() => {
        if (!kp || kp.v !== E.knobAt) return false;
        return segDist(sx, sy, kp.X, kp.Y, kp.kx, kp.ky) <= 12;
      })();
      const h = v ? { v: vkey(v) } : b ? { b: b.item } : null;
      const knob = v ? vkey(v) : kb || onWay ? E.knobAt : null;
      const ch = (h && h.v) !== (E.hover && E.hover.v) || (h && h.b) !== (E.hover && E.hover.b) || knob !== E.knobAt;
      E.hover = h; E.knobAt = knob;
      svg.style.cursor = E.arm ? '' : kb ? (kb.matches('.ze-ahead, .ze-mctl') ? 'move' : 'crosshair') : v ? (v.inBond && !v.inRing ? 'move' : 'default') : b || arrowAt(e) || moveAt(e, 5) ? 'pointer' : '';
      if (ch || (E.arm === 's:move' && E.mvFrom)) draw();
      return;
    }
    if (d.mode === 'pan') {
      if (d.idle && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.idle = false; E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); if (Lb) Lb.pop.place(); return;
    }
    if (d.mode === 'ahead') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true;
      const P = lay().P, ang = aimAt(d.bx, d.by, e), [x, y] = D(sx, sy);
      const co = Math.max(0.25, Math.round(((Math.hypot(x - d.bx, y - d.by) + P.aoff) / P.csep) * 4) / 4);
      const o = d.A.opt.slice();
      o[0] = !o[0] && Math.abs(C.norm360(ang - d.ang0)) < 1e-9 ? '' : num(ang);
      o[1] = Math.abs(co - 1) < 1e-9 ? '' : num(co);
      d.A.opt = o; d.A.dirty = true; E.M.dirty = true; L = null;
      setTip(`Arrow at ${Math.round(ang)}°, ${num(co)} × compound sep${e.altKey ? '' : ' · ⌥ for any angle'}`);
      draw(); return;
    }
    if (d.mode === 'mctl') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true;
      const D0 = drawsOf(d.seg)[d.k], q = D0 && simpleOf(D0.path);
      if (!q) return;
      const ang = aimAt(d.ax, d.ay, e), [x, y] = D(sx, sy), r = Math.max(0.05, Math.round((Math.hypot(x - d.ax, y - d.ay) / TD.PX_PER_CM) * 20) / 20);
      if (d.i === 1) { q.out = ang; q.r1 = r; } else { q.in = ang; q.r2 = r; }
      setDraw(d.seg, d.k, { path: simplePath(q) }); L = null;
      setTip(`${d.i === 1 ? 'Leaves' : 'Arrives'} at ${Math.round(ang)}°, pulled ${num(r)} cm${e.altKey ? '' : ' · ⌥ for any angle'}`);
      draw(); return;
    }
    if (d.mode === 'grow') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true;
      d.ang = aimAt(d.fx, d.fy, e);
      d.tx = d.fx + SEP * Math.cos((d.ang * Math.PI) / 180); d.ty = d.fy - SEP * Math.sin((d.ang * Math.PI) / 180);
      setTip(`${BOND_NAMES[E.bond]} bond at ${Math.round(d.ang)}°${e.altKey ? '' : ' · ⌥ for any angle'}`);
      draw(); return;
    }
    if (d.mode === 'move') {
      if (!d.bond) return;
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true;
      const b = d.bond, from = b.a.boxes[b.ka], fx = from.cx + (b.a.dx || 0), fy = from.cy + (b.a.dy || 0);
      d.fx = fx; d.fy = fy;
      const [x, y] = D(sx, sy);
      d.ang = aimAt(fx, fy, e);
      d.len = Math.max(0.25, Math.round((Math.hypot(x - fx, y - fy) / SEP) * 4) / 4);
      d.tx = fx + d.len * SEP * Math.cos((d.ang * Math.PI) / 180); d.ty = fy - d.len * SEP * Math.sin((d.ang * Math.PI) / 180);
      setTip(`Bond at ${Math.round(d.ang)}°, ${num(d.len)} × atom sep${e.altKey ? '' : ' · ⌥ for any angle'}`);
      draw();
    }
  });
  svg.addEventListener('pointerup', () => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    if (d.mode === 'ahead' || d.mode === 'mctl') { setTip(''); commit(); L = null; draw(); renderProps(); return; }
    if (d.mode === 'grow') {
      setTip('');
      const v = findV(d.v);
      if (v) addBondAt(v, d.ang, E.bond);
      return;
    }
    if (d.mode === 'move' && d.moved) {
      setTip('');
      const b = d.bond.item;
      edit(() => {
        const arg = (b.arg || []).slice();
        arg[0] = bondName(arg[0]) + fmtA(d.ang);
        arg[1] = Math.abs(d.len - 1) < 1e-9 ? '' : num(d.len);
        b.arg = arg; b.dirty = true; touch(d.bond.mol);
      });
      reselectKey(d.v);
      return;
    }
    draw();
  });
  function reselectKey(key) { L = null; E.sel = findV(key) ? { v: key } : null; draw(); renderProps(); }
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt || E.ptr)) { E.hover = null; E.knobAt = null; E.ptr = null; draw(); } });
  // double-clicking a bond steps it single → double → triple
  function cycleBond(b) { const next = { '-': '=', '=': '~', '~': '-' }[b.item.sym] || '-'; edit(() => { b.item.sym = next; b.item.dirty = true; touch(b.mol); }); }

  // right-click: the atom's, bond's or arrow's actions
  const MI = {
    label: '<path d="M4 15l2-5 6-6 3 3-6 6zM11 5l3 3"/>',
    del: '<path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/>',
    one: '<path d="M3 10h14"/>',
    two: '<path d="M3 8h14M3 12h14"/>',
    three: '<path d="M3 6.5h14M3 10h14M3 13.5h14"/>',
    wedge: '<path d="M3 10l14-3.5v7z" class="f"/>',
    hash: '<path d="M5 9.5v1M8 8.8v2.4M11 8v4M14 7.3v5.4M17 6.5v7"/>',
    flip: '<path d="M3 7h12l-3-3M17 13H5l3 3"/>',
    mol: '<path d="M10 3l6 3.5v7L10 17l-6-3.5v-7z"/>',
    arrow: '<path d="M3 10h13M12 6l4 4-4 4"/>',
  };
  const mItem = (act, label, icon, key) => `<button class="ctx-item${/del/.test(act) ? ' danger' : ''}" data-cm="${act}"><svg viewBox="0 0 20 20" class="qe-ic">${MI[icon]}</svg><span class="lb">${label}</span>${key ? `<kbd>${key}</kbd>` : ''}</button>`;
  function closeMenu() { menu.hidden = true; }
  svg.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (!E) return;
    const v = vertexAt(e), mv = v ? null : moveAt(e, 5), b = v || mv ? null : bondAt(e), a = v || b || mv ? null : arrowAt(e);
    const sch = inScheme();
    if (mv) {
      E.sel = { m: { seg: mv.seg, k: mv.k } };
      menu.innerHTML = mItem('mvdel', 'Delete Curved Arrow', 'del', '⌫');
    } else if (v) {
      E.sel = { v: vkey(v) };
      menu.innerHTML = mItem('label', 'Edit Label', 'label', '↩') + '<hr>' + mItem(v.inRing ? 'rdel' : 'vdel', v.inRing ? 'Delete Ring' : v.inBond ? 'Delete Atom' : 'Delete Molecule', 'del', '⌫') + (sch && v.inBond ? mItem('mdel', 'Delete Molecule', 'del') : '');
    } else if (b) {
      E.sel = { b: b.item };
      menu.innerHTML = mItem('b:-', 'Single', 'one', '1') + mItem('b:=', 'Double', 'two', '2') + mItem('b:~', 'Triple', 'three', '3') + mItem('b:>', 'Wedge', 'wedge') + mItem('b:>:', 'Hashed', 'hash') +
        (/^[<>]/.test(b.item.sym) ? mItem('bflip', 'Reverse Wedge', 'flip') : '') + '<hr>' + mItem(b.ring ? 'rdel' : 'bdel', b.ring ? 'Delete Ring' : 'Delete Bond', 'del', '⌫') + (sch ? mItem('mdel', 'Delete Molecule', 'del') : '');
    } else if (a) {
      E.sel = { a: a.seg };
      menu.innerHTML = mItem('alabel', 'Edit Conditions', 'label', '↩') + '<hr>' + mItem('adel', a.seg.t === 'merge' ? 'Delete Merge' : 'Delete Arrow', 'del', '⌫');
    } else { closeMenu(); return; }
    draw(); renderProps();
    menu.hidden = false;
    const r = menu.getBoundingClientRect();
    menu.style.left = `${Math.min(e.clientX, innerWidth - r.width - 8)}px`;
    menu.style.top = `${Math.min(e.clientY, innerHeight - r.height - 8)}px`;
  });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cm]');
    if (!b) return;
    closeMenu();
    act(b.dataset.cm);
  });
  root.addEventListener('pointerdown', (e) => { if (!menu.hidden && !e.target.closest('.qe-ctx')) closeMenu(); }, true);
  svg.addEventListener('wheel', closeMenu, { passive: true });

  // ---------------------------------------------------------------- label editors
  // A floating box under the atom (or arrow); the whole edit is one undo step.
  let Lb = null;
  function editLabel(v) {
    if (!TD.input) return false;
    closeLabel();
    begin();
    let cur = v;
    const key0 = vkey(v);
    const me = (Lb = {});
    me.pop = TD.input.popup(stage, {
      text: v.g ? v.g.raw.trim() : '', math: true,
      at: () => { const w = findV(vkey(cur)) || cur, [X, Y] = S(w.X, w.Y), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + X, vr.top - sr.top + Y + vRadius(w) + 8]; },
      onInput: (t) => {
        const w = findV(vkey(cur)) || cur;
        setLabel(w, t); L = null;
        cur = lay().verts.find((x) => (w.g && x.g === w.g) || (w.inBond && x.inBond === w.inBond) || (!w.g && !w.inBond && x.mol === w.mol && x.root)) || cur;
        E.sel = { v: vkey(cur) };
        draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); L = null; if (!findV(E.sel && E.sel.v)) E.sel = findV(key0) ? { v: key0 } : null; draw(); renderProps(); },
    });
    return true;
  }
  function editArrowLabel(a, which) {
    if (!TD.input) return false;
    closeLabel();
    begin();
    const A = a.seg, me = (Lb = {});
    me.pop = TD.input.popup(stage, {
      text: C.unbrace(A.labels[which] || ''), math: false,
      at: () => { const w = lay().arrows.find((x) => x.seg === A) || a, [X, Y] = S((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + X, vr.top - sr.top + Y + 24]; },
      onInput: (t) => { setArrowLabel(A, which, t); L = null; draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  const brk = (t) => (/[\][]/.test(t) && !/^\{[\s\S]*\}$/.test(t) ? `{${t}}` : t);
  function setArrowLabel(A, which, t) {
    const l = A.labels.slice();
    while (l.length < which) l.push('');
    l[which] = t ? brk(t) : '';
    A.labels = l; A.dirty = true; E.M.dirty = true;
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const row = (label, ctl) => `<div class="row"><label>${label}</label>${ctl}</div>`;
  const field = (label, f, value, extra = '') => row(label, `<div class="ctl"><input type="text" data-f="${f}" value="${esc(value)}" spellcheck="false"${extra}></div>`);
  const numField = (label, f, value, unit, extra = '') => row(label, `<div class="ctl unit"><input type="number" data-f="${f}" value="${value == null ? '' : num(value)}"${extra}><span>${unit}</span></div>`);
  const seg = (f, cur, opts, off) => `<div class="ctl seg-ctl">${opts.map(([v, n, t]) => `<button data-fs="${f}" data-v="${esc(String(v))}" class="${!off && String(cur) === String(v) ? 'on' : ''}"${t ? ` title="${esc(t)}"` : ''}${off ? ' disabled' : ''}>${n}</button>`).join('')}</div>`;
  const sel = (f, cur, opts) => `<div class="ctl"><select data-f="${f}">${opts.map(([k, n]) => `<option value="${esc(k)}"${k === cur ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>`;
  // a molecule in a scheme: its name, brackets round it and the \subscheme it is in
  function molSec(mol) {
    if (!inScheme()) return '';
    const lr = lrOf(mol), sub = compOf(mol).sub, bk = lr ? lr.l : '';
    const opts = [['', 'None'], ['[', '[ ]'], ['(', '( )'], ['\\{', '{ }']];
    if (bk && !opts.some((o) => o[0] === bk)) opts.push([bk, `${bk} ${lr.r}`]);
    const grp = sub ? '<button data-ce="ungroup" title="Take its \\subscheme apart">Ungroup</button>'
      : nextStep(mol) ? '<button data-ce="group" title="Put it, the next arrow and the compound after it in a \\subscheme">Group with Next</button>' : '';
    return `<div class="sec"><div class="sec-title">Compound${sub ? ' <small>in a subscheme</small>' : ''}</div>
      ${field('Name', 'mname', nameOf(mol), ' placeholder="none, shown under it"')}
      ${row('Brackets', sel('brk', bk, opts))}
      ${sub ? field('Arrows at', 'subang', sub.opt, ' class="mono" placeholder="default, e.g. 90"') : ''}
      <div class="row">${grp}<button class="danger" data-ce="mdel">Delete Molecule</button></div></div>`;
  }
  function renderProps() {
    if (!E) return;
    const Lo = lay(), v = selV(), b = selB(), a = selA(), mv = selM();
    if (v) {
      const n = dirsAt(v).length, atoms = atomsOf(v), main = atoms && atoms[Math.min(v.k, atoms.length - 1)];
      const pairs = chargesOf(main).filter((c) => c.what.trim() === '\\:').map((c) => Math.round(c.angle));
      const sign = signOf(main);
      const lbl = v.g ? v.g.raw.trim() : '';
      TD.morph(props, `<div class="sec"><div class="sec-title">${lbl ? 'Atom' : 'Vertex'} <small>${n} bond${n === 1 ? '' : 's'}</small></div>
        ${field('Label', 'label', lbl, ' class="mono" data-tx="math" placeholder="none: a carbon vertex"')}
        ${row('Charge', seg('sign', sign, [['', 'None'], ['+', '+', 'A superscript +'], ['-', '−', 'A superscript −']], !main))}
        ${row('Lone pairs', seg('pair', '', [[90, '↑', 'Above'], [0, '→', 'Right'], [270, '↓', 'Below'], [180, '←', 'Left']].map(([q, t, ti]) => [q, t, ti]), !main).replace(/data-v="(\d+)" class=""/g, (m, q) => (pairs.includes(+q) ? `data-v="${q}" class="on"` : m)))}
        ${!v.g ? '<div class="help">A vertex with no label is a carbon. Give it a label to put charges and lone pairs on it.</div>' : ''}
        <div class="row"><button class="danger" data-ce="${v.inRing ? 'rdel' : 'vdel'}">${v.inRing ? 'Delete Ring' : v.inBond ? 'Delete Atom' : 'Delete Molecule'}</button></div></div>${molSec(v.mol)}`);
      return;
    }
    if (b) {
      const it = b.item, arg = it.arg || [], inRing = !!b.ring;
      const ang = it.angleUsed != null ? it.angleUsed : b.angle, ln = arg[1] ? parseFloat(arg[1]) : 1;
      TD.morph(props, `<div class="sec"><div class="sec-title">${esc(BOND_NAMES[it.sym] || 'Bond')} bond <small>${inRing ? `ring of ${b.ring.n}` : b.hook ? 'ring closure' : ''}</small></div>
        ${row('Type', `<div class="ctl"><select data-f="sym">${Object.entries(BOND_NAMES).map(([k, nm]) => `<option value="${esc(k)}"${k === it.sym ? ' selected' : ''}>${esc(nm)}</option>`).join('')}</select></div>`)}
        ${numField('Angle', 'angle', inRing ? null : Math.round(ang * 100) / 100, '°', inRing || b.hook ? ' disabled' : ' step="15"')}
        ${numField('Length', 'len', inRing ? null : ln, '×', inRing || b.hook ? ' disabled' : ' step="0.25" min="0.25"')}
        ${field('Options', 'tikz', arg[4] || '', ` class="mono" placeholder="e.g. red, line width=1pt"${b.hook ? ' disabled' : ''}`)}
        ${inRing ? '<div class="help">A ring\'s sides follow the ring: they have no angle or length of their own.</div>' : '<div class="help">Drag the atom at its end to turn and stretch it.</div>'}
        <div class="row"><button class="danger" data-ce="${inRing ? 'rdel' : 'bdel'}">${inRing ? 'Delete Ring' : 'Delete Bond'}</button></div></div>${molSec(b.mol)}`);
      return;
    }
    if (a && a.seg.t === 'merge') {
      const M = a.seg;
      TD.morph(props, `<div class="sec"><div class="sec-title">Merge arrow <small>from ${M.srcs.length}</small></div>
        ${row('Direction', sel('mdir', M.dir, [['>', 'Right'], ['<', 'Left'], ['^', 'Up'], ['v', 'Down']]))}
        ${field('Above', 'above', C.unbrace(M.labels[0] || ''), ' placeholder="none"')}
        ${field('Below', 'below', C.unbrace(M.labels[1] || ''), ' placeholder="none"')}
        ${field('From', 'msrc', M.srcs.join(', '), ' class="mono" placeholder="e.g. c1, c2"')}
        ${field('To', 'mtgt', M.target, ' class="mono" placeholder="none, or a name for what follows"')}
        <div class="help">From names the compounds whose lines join: c1 is a scheme's first compound, c2 the next, and so on.</div>
        <div class="row"><button class="danger" data-ce="adel">Delete Merge</button></div></div>`);
      return;
    }
    if (a) {
      const A = a.seg, direct = isDirect(A), dis = direct ? ' disabled' : '';
      TD.morph(props, `<div class="sec"><div class="sec-title">${esc(ARROW_NAMES[A.type] || 'Arrow')} arrow</div>
        ${row('Type', sel('atype', A.type, Object.entries(ARROW_NAMES)))}
        ${field('Above', 'above', C.unbrace(A.labels[0] || ''), ' placeholder="none, e.g. $\\Delta$"')}
        ${field('Below', 'below', C.unbrace(A.labels[1] || ''), ' placeholder="none, e.g. H$_2$O"')}
        ${numField('Angle', 'aangle', direct ? null : A.opt[0] ? parseFloat(A.opt[0]) : a.ang, '°', ' step="15"' + dis)}
        ${numField('Length', 'alen', direct ? null : A.opt[1] ? parseFloat(A.opt[1]) : 1, '×', ' step="0.25" min="0.25"' + dis)}
        ${field('Ends', 'aends', A.names ? A.names.slice(1, -1) : '', ' class="mono" placeholder="none, e.g. c1--c2 or @c1--@c3"')}
        ${field('Style', 'astyle', A.opt.slice(2).filter((x) => x && x.trim()).join(', '), ' class="mono" placeholder="none, e.g. red, thick"')}
        <div class="help">${direct ? 'It joins two compounds already placed (@ names), so it has no angle or length of its own.' : 'Drag its head to turn and stretch it (15° steps; <kbd>⌥</kbd> for any angle).'}</div>
        <div class="row"><button class="danger" data-ce="adel">Delete Arrow</button></div></div>`);
      return;
    }
    if (mv) {
      const D0 = drawsOf(mv.seg)[mv.k], q = D0 && simpleOf(D0.path);
      const tips = mv.tipS && mv.tipE ? 'stealth-stealth' : mv.tipS ? 'stealth-' : mv.tipE ? '-stealth' : '-';
      const line = mv.dash === 'dash' ? 'dashed' : mv.dash === 'dot' ? 'dotted' : mv.dash ? 'pattern' : 'solid';
      const lines = [['solid', 'Solid'], ['dashed', 'Dashed'], ['dotted', 'Dotted']];
      if (line === 'pattern') lines.push(['pattern', 'Dash pattern']);
      const col = D0 ? (D0.opt.split(',').map((o) => o.trim()).find(isColour) || '').replace(/^(color|draw)\s*=\s*/, '') : '';
      TD.morph(props, `<div class="sec"><div class="sec-title">Curved arrow <small>\\chemmove</small></div>
        ${row('Tips', sel('mvtip', tips, [['-stealth', 'At the end'], ['stealth-', 'At the start'], ['stealth-stealth', 'Both ends'], ['-', 'None']]))}
        ${row('Line', sel('mvline', line, lines))}
        ${field('Colour', 'mvcol', col, ' class="mono" placeholder="none, e.g. red"')}
        ${q ? numField('Leaves at', 'mvout', q.out, '°', ' step="15"') + numField('Pull', 'mvr1', q.r1, 'cm', ' step="0.05" min="0"') + numField('Arrives at', 'mvin', q.in, '°', ' step="15"') + numField('Pull', 'mvr2', q.r2, 'cm', ' step="0.05" min="0"') : ''}
        ${field('Path', 'mvpath', D0 ? D0.path.trim() : '', ' class="mono"')}
        <div class="help">${q ? 'Drag the blue handles to bend it.' : 'Its path isn\'t a single curve with two controls, so it is edited as written.'}</div>
        <div class="row"><button class="danger" data-ce="mvdel">Delete Curved Arrow</button></div></div>`);
      return;
    }
    TD.morph(props, `<div class="sec"><div class="sec-title">Chemistry <small>${C.counts(Lo)}</small></div>
      <div class="help">Pick an atom and drag its blue handle to grow a bond (it snaps to 15°; <kbd>⌥</kbd> for any angle). Drag an atom to turn its bond. Type a letter to relabel the picked atom; double-click to edit its label, or a bond to step it single, double, triple. Rings, groups and charges on the left go onto the picked atom or bond; Reactions add an arrow and a copy of the molecule to change, a merge, or a curved arrow from one atom or bond to another.</div></div>`);
  }
  props.addEventListener('focusin', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e) => { if (!TD.morph.busy && e.target.matches('input, select')) { commit(); L = null; clampSel(); renderProps(); draw(); } });
  props.addEventListener('input', (ev) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const v = selV(), b = selB(), a = selA(), mv = selM(), mol = v ? v.mol : b ? b.mol : null;
    if (mol && (f === 'brk' || f === 'subang')) {
      if (f === 'brk') setBrackets(mol, t.value);
      else { const sub = compOf(mol).sub; if (sub) setSubAngle(sub, t.value); }
    } else if (v) {
      if (f === 'label') {
        const key = vkey(v);
        setLabel(v, t.value); L = null;
        const nv = lay().verts.find((x) => (v.g && x.g === v.g) || (v.inBond && x.inBond === v.inBond) || (!v.g && !v.inBond && x.mol === v.mol && x.root));
        E.sel = nv ? { v: vkey(nv) } : { v: key };
      } else if (f === 'mname') setName(v.mol, t.value);
    } else if (b) {
      const it = b.item;
      if (f === 'sym') { it.sym = t.value; it.dirty = true; touch(b.mol); }
      else if (f === 'angle' || f === 'len' || f === 'tikz') {
        const arg = (it.arg || []).slice();
        if (f === 'angle') { const n = parseFloat(t.value); if (!isFinite(n)) return; arg[0] = bondName(arg[0]) + fmtA(n); }
        if (f === 'len') { const n = parseFloat(t.value); if (!isFinite(n) || n <= 0) return; arg[1] = Math.abs(n - 1) < 1e-9 ? '' : num(n); }
        if (f === 'tikz') arg[4] = t.value.trim();
        it.arg = arg; it.dirty = true; touch(b.mol);
      } else if (f === 'mname') setName(b.mol, t.value);
    } else if (a) {
      const A = a.seg;
      if (f === 'atype') A.type = t.value;
      else if (f === 'mdir') A.dir = t.value;
      else if (f === 'msrc') A.srcs = t.value.split(',').map((x) => x.trim()).filter(Boolean);
      else if (f === 'mtgt') A.target = t.value.trim();
      else if (f === 'aends') { const w = t.value.trim().replace(/^\(|\)$/g, ''); A.names = w ? `(${w})` : ''; }
      else if (f === 'astyle') { const o = A.opt.slice(0, 2); while (o.length < 2) o.push(''); const st = t.value.trim(); A.opt = st ? [...o, st] : o; }
      else if (f === 'above') { setArrowLabel(A, 0, t.value); }
      else if (f === 'below') { setArrowLabel(A, 1, t.value); }
      else if (f === 'aangle' || f === 'alen') {
        const n = parseFloat(t.value);
        if (!isFinite(n)) return;
        const o = A.opt.slice();
        if (f === 'aangle') o[0] = n ? num(n) : '';
        else { if (!o[0]) o[0] = ''; o[1] = Math.abs(n - 1) < 1e-9 ? '' : num(n); }
        A.opt = o;
      }
      A.dirty = true; E.M.dirty = true;
    } else if (mv) {
      const D0 = drawsOf(mv.seg)[mv.k];
      if (!D0) return;
      if (f === 'mvtip') setDrawOpt(mv.seg, mv.k, 'tips', t.value);
      else if (f === 'mvline') { if (t.value === 'pattern') return; setDrawOpt(mv.seg, mv.k, 'line', t.value === 'solid' ? (/\b(dashed|dotted|dash pattern)/.test(mv.seg.opt) ? 'solid' : '') : t.value); }
      else if (f === 'mvcol') setDrawOpt(mv.seg, mv.k, 'colour', t.value.trim());
      else if (f === 'mvpath') { if (!t.value.trim()) return; setDraw(mv.seg, mv.k, { path: ' ' + t.value.trim() }); }
      else {
        const q = simpleOf(D0.path), n = parseFloat(t.value);
        if (!q || !isFinite(n)) return;
        if (f === 'mvout') q.out = n; else if (f === 'mvin') q.in = n; else if (f === 'mvr1') q.r1 = Math.max(0, n); else if (f === 'mvr2') q.r2 = Math.max(0, n);
        setDraw(mv.seg, mv.k, { path: simplePath(q) });
      }
    } else return;
    E.M.dirty = true; L = null; draw();
    if (['sym', 'atype', 'mdir', 'brk', 'mvtip', 'mvline'].includes(f)) { commit(); renderProps(); begin(); }
  });
  props.addEventListener('input', () => { if (E && !TD.morph.busy) renderProps(); });
  props.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E || bt.disabled) return;
    const f = bt.dataset.fs, val = bt.dataset.v, v = selV();
    if (!v) return;
    edit(() => {
      if (f === 'sign') setSign(v, val);
      else if (f === 'pair') toggleDecor(v, '\\:', +val);
    });
    reselect(v);
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ce="undo"]', root).disabled = !E.undo.length;
    $('[data-ce="redo"]', root).disabled = !E.redo.length;
  }
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ce]');
    if (!b || !E) return;
    act(b.dataset.ce, b);
  });
  function deleteSel() {
    const v = selV(), b = selB(), a = selA(), m = selM();
    if (v) edit(() => deleteVertex(v));
    else if (b) edit(() => deleteBond(b));
    else if (a) edit(() => deleteArrow(a.seg));
    else if (m) edit(() => deleteDraw(m.seg, m.k));
    else return;
    E.sel = null; L = null; draw(); renderProps();
  }
  function act(x, btn) {
    const v = selV(), b = selB(), a = selA();
    if (x === 'undo') undo();
    else if (x === 'redo') redo();
    else if (x === 'fit') fit();
    else if (x === 'done') finish(true);
    else if (x === 'cancel') finish(false);
    else if (x === 'delete' || x === 'vdel' || x === 'bdel' || x === 'adel' || x === 'mvdel') deleteSel();
    else if (x === 'group' || x === 'ungroup') {
      const mol = (v || b || {}).mol;
      if (mol) { edit(() => (x === 'group' ? groupNext(mol) : ungroup(compOf(mol).sub))); renderProps(); }
    }
    else if (x === 'rdel') { const ring = v ? v.ring : b && b.ring ? b.ring.item : null, mol = (v || b).mol; if (ring) { edit(() => deleteRing(ring, mol)); E.sel = null; L = null; draw(); renderProps(); } }
    else if (x === 'mdel') { const mol = (v || b || {}).mol; if (mol) { edit(() => deleteMol(mol)); E.sel = null; L = null; draw(); renderProps(); } }
    else if (x === 'label') { if (v) editLabel(v); }
    else if (x === 'alabel') { if (a) editArrowLabel(a, 0); }
    else if (x === 'copy') navigator.clipboard?.writeText(codeTa.value).then(() => { btn.textContent = 'Copied'; setTimeout(() => (btn.textContent = 'Copy'), 1200); });
    else if (x === 'bflip' && b) edit(() => { const s = b.item.sym; b.item.sym = (s[0] === '>' ? '<' : '>') + s.slice(1); b.item.dirty = true; touch(b.mol); });
    else if (x.startsWith('b:') && b) apply(x, { b });
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const Lo = lay();
    count.textContent = C.counts(Lo);
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    codeMsg.innerHTML = C.layout({ src: c }).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.M = load(codeTa.value); E.codeAt = codeTa.value; L = null;
    commit();
    clampSel(); draw(); renderProps();
    codeMsg.innerHTML = C.layout({ src: codeTa.value }).warnings.map((w) => `<div>${esc(w)}</div>`).join('');
  }
  codeTa.addEventListener('input', () => { clearTimeout(E.codeTimer); E.codeTimer = setTimeout(readCode, 250); });
  codeTa.addEventListener('blur', () => { if (!E) return; readCode(); commit(); E.codeAt = null; syncCode(); });

  window.addEventListener('keydown', (e) => {
    if (!E || root.hidden) return;
    if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!document.querySelector('.td-dialog')) save(); return; }
    if (e.target.closest && e.target.closest('.td-pop-ta, .td-pop-ml')) return;
    if (document.querySelector('.td-dialog')) return;
    const mod = e.metaKey || e.ctrlKey, inField = !!(e.target.closest && e.target.closest('input, textarea, select'));
    e.stopPropagation();
    if (mod && e.key === 'Enter') { e.preventDefault(); finish(true); return; }
    if (e.key === 'Escape') {
      e.preventDefault();
      if (inField) { e.target.blur(); return; }
      if (!menu.hidden) { closeMenu(); return; }
      if (E.arm) { E.arm = null; E.mvFrom = null; E.ptr = null; buildPalette(); setTip(''); draw(); return; }
      if (E.sel) { E.sel = null; draw(); renderProps(); return; }
      finish(false); return;
    }
    if (inField) return;
    if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; return; }
    const v = selV(), b = selB(), a = selA();
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel) { e.preventDefault(); if (v) editLabel(v); else if (a) editArrowLabel(a, 0); else focusField(); return; }
    // a capital letter relabels the picked atom (C, N, O, …)
    if (v && /^[A-Za-z]$/.test(e.key) && KEYS[e.key.toLowerCase()] && KEYS[e.key.toLowerCase()][0] === 'a') { e.preventDefault(); apply(KEYS[e.key.toLowerCase()], { v }); return; }
    const k = KEYS[e.key.toLowerCase()];
    if (k && k[0] === 'b') { e.preventDefault(); if (b) apply(k, { b }); else pick(k); return; }
  }, true);
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') E.space = false; }, true);
  window.addEventListener('resize', () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  function save() {
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    commit();
    const src = snapCode();
    if (src !== E.start) { E.start = src; E.done({ src }); }
    setTip('Saved to the page');
    setTimeout(() => { if (E && tip.textContent === 'Saved to the page') setTip(''); }, 1500);
  }
  // reloading or closing the tab asks first while this holds edits not yet applied (app.js, beforeunload)
  TD.unsaved.push(() => !!E && snapCode() !== E.start);
  async function finish(ok) {
    if (!E) return;
    closeLabel();
    if (document.activeElement === codeTa) readCode();
    if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
    commit();
    const src = snapCode(), changed = src !== E.start;
    if (!ok && changed && !(await TD.confirm('Discard changes to this drawing?', 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
    const done = E.done;
    root.hidden = true;
    document.body.classList.remove('cz-open');
    E = null; L = null;
    if (ok && changed) done({ src });
  }
  function open(block, done) {
    const M = load(block.src);
    L = null;
    E = { M, sel: null, arm: null, bond: '-', view: { ox: 0, oy: 0, k: 2 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, codeAt: null, codeTimer: null };
    E.start = codeOf(M);
    root.hidden = false;
    document.body.classList.add('cz-open');
    search.value = '';
    buildPalette(); updateTools(); renderProps(); setTip('');
    fit();
    requestAnimationFrame(() => { if (E) fit(); });
  }
  TD.chemEditor = { open };
})();
