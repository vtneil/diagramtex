import { GRID_STYLES } from '../ui/canvas-grid';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { onLocale, t, message } from '../i18n';
import { section, row } from '../ui/forms';
import { field, numField, segments, note, actionRow, texColour } from '../ui/editor-fields';
import FormPanel from '../ui/FormPanel.svelte';
import CfeditorFrame from '../ui/editors/CfeditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag, type PaletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { keepComments } from './keep-comments';
// Chemistry editor: the overlay that opens on a Chemistry block. A palette of atoms, bonds, rings,
// functional groups, charges and reaction arrows; the molecules and schemes drawn by the canvas renderer,
// where atoms are picked, relabelled and grown by dragging their blue handle; the selected atom's, bond's
// or arrow's properties; and beside them the chemfig code, live both ways. chemfig places atoms by bond
// angles, not coordinates, so moving an atom turns (and stretches) the bond that leads to it.
// Untouched code is handed back as written.
// TD.chemEditor.open(block, onDone) — block: { src }; onDone({ src }) on Done.
(function () : any {
  const C = TD.chem;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const PAPER = '#fffdf8', INK = '#1c1b19';
  const SEP = C.DEF.sep;

  // ---------------------------------------------------------------- palette
  // the names as shown (the tables above keep the English, which search also matches)
  const bondNames = (): Record<string, string> => ({ '-': t('editor.cf.bond.single', 'Single'), '=': t('editor.cf.bond.double', 'Double'), '~': t('editor.cf.bond.triple', 'Triple'), '>': t('editor.cf.bond.wedge', 'Wedge'), '<': t('editor.cf.bond.wedgeRev', 'Wedge, reversed'), '>:': t('editor.cf.bond.hashed', 'Hashed'), '<:': t('editor.cf.bond.hashedRev', 'Hashed, reversed'), '>|': t('editor.cf.bond.hollow', 'Hollow wedge'), '<|': t('editor.cf.bond.hollowRev', 'Hollow wedge, reversed'), '=^': t('editor.cf.bond.doubleLeft', 'Double, left'), '=_': t('editor.cf.bond.doubleRight', 'Double, right') });
  const arrowNames = (): Record<string, string> => ({ '->': t('editor.cf.arrow.reaction', 'Reaction'), '<=>': t('editor.cf.arrow.equilibrium', 'Equilibrium'), '<->>': t('editor.cf.arrow.eqRight', 'Equilibrium, to the right'), '<<->': t('editor.cf.arrow.eqLeft', 'Equilibrium, to the left'), '<->': t('editor.cf.arrow.resonance', 'Resonance'), '-/>': t('editor.cf.arrow.none', 'No reaction'), '<-': t('editor.cf.arrow.backwards', 'Backwards'), '0': t('editor.cf.arrow.invisible', 'Invisible'), '-U>': t('editor.cf.arrow.u', 'U arrow') });
  const say = (en: string): string => (({
    Vertex: () => t('editor.cf.vertex', 'Vertex'), 'Hollow wedge': () => t('editor.cf.bond.hollow', 'Hollow wedge'), 'Wedge, reversed': () => t('editor.cf.bond.wedgeRev', 'Wedge, reversed'), 'Hashed, reversed': () => t('editor.cf.bond.hashedRev', 'Hashed, reversed'), 'Hollow wedge, reversed': () => t('editor.cf.bond.hollowRev', 'Hollow wedge, reversed'),
    Single: () => t('editor.cf.bond.single', 'Single'), Double: () => t('editor.cf.bond.double', 'Double'), Triple: () => t('editor.cf.bond.triple', 'Triple'), Wedge: () => t('editor.cf.bond.wedge', 'Wedge'), Hashed: () => t('editor.cf.bond.hashed', 'Hashed'),
    Aromatic: () => t('editor.cf.ring.aromatic', 'Aromatic'), Positive: () => t('editor.cf.charge.plus', 'Positive'), Negative: () => t('editor.cf.charge.minus', 'Negative'), 'Lone pair': () => t('editor.cf.charge.pair', 'Lone pair'), 'Lone pair (bar)': () => t('editor.cf.charge.bar', 'Lone pair (bar)'), Radical: () => t('editor.cf.charge.radical', 'Radical'),
    Arrow: () => t('editor.cf.arrow', 'Arrow'), Equilibrium: () => t('editor.cf.arrow.equilibrium', 'Equilibrium'), Resonance: () => t('editor.cf.arrow.resonance', 'Resonance'), 'No reaction': () => t('editor.cf.arrow.none', 'No reaction'),
    Plus: () => t('editor.cf.plus', 'Plus'), Merge: () => t('editor.cf.merge', 'Merge'), 'Curved arrow': () => t('editor.cf.curved', 'Curved arrow'),
  } as Record<string, () => string>)[en]?.() ?? en);
  const catName = (en: string): string => (({
    Atoms: () => t('editor.cf.cat.atoms', 'Atoms'), Bonds: () => t('editor.cf.cat.bonds', 'Bonds'), Rings: () => t('editor.cf.cat.rings', 'Rings'), Groups: () => t('editor.cf.cat.groups', 'Groups'),
    Charges: () => t('editor.cf.cat.charges', 'Charges'), Reactions: () => t('editor.cf.cat.reactions', 'Reactions'),
  } as Record<string, () => string>)[en]?.() ?? en);
  const anyAngle = () => t('editor.cf.tip.anyAngle', ' · ⌥ for any angle');
  // what the drawing holds, as the code header and the panel summary say it
  const countsText = (L: any) => {
    const n = L.mols.length, a = L.arrows.length;
    if (a) return `${n === 1 ? t('editor.cf.oneMolecule', '1 molecule') : t('editor.cf.nMolecules', '{n} molecules', { n })} · ${a === 1 ? t('editor.cf.oneArrow', '1 arrow') : t('editor.cf.nArrows', '{n} arrows', { n: a })}`;
    return t('editor.cf.atomsBonds', '{atoms} atoms · {bonds} bonds', { atoms: L.verts.filter((v: any) => v.label).length, bonds: L.bonds.length });
  };
  // functional groups: code for a group at the end of a bond at angle a (relative angles follow the bond)
  const left = (a: any) => a > 90 && a < 270;
  const GROUPS: Record<string, any> = {
    OH: (a: any) => (left(a) ? 'HO' : 'OH'),
    NH2: (a: any) => (left(a) ? 'H_2N' : 'NH_2'),
    CH3: (a: any) => (left(a) ? 'H_3C' : 'CH_3'),
    OCH3: (a: any) => (left(a) ? 'H_3CO' : 'OCH_3'),
    CHO: (a: any) => (left(a) ? 'OHC' : 'CHO'),
    COOH: (a: any) => `C(=[::60]O)-[::-60]${left(C.norm360(a - 60)) ? 'HO' : 'OH'}`,
    NO2: (a: any) => (left(a) ? 'O_2N' : 'NO_2'),
    CN: () => 'C~[::0]N',
    SH: (a: any) => (left(a) ? 'HS' : 'SH'),
  };
  const RINGS: Record<string, any> = { 3: '*3(---)', 4: '*4(----)', 5: '*5(-----)', 6: '*6(------)', benzene: '*6(-=-=-=)', arom: '**6(------)', 7: '*7(-------)' };
  const ATOMS = ['C', 'H', 'N', 'O', 'S', 'P', 'F', 'Cl', 'Br', 'I'];
  const CHARGES = { plus: ['Positive', '\\chemfig{N^{+}}'], minus: ['Negative', '\\chemfig{O^{-}}'], pair: ['Lone pair', '\\chemfig{\\charge{90=\\:}{O}}'], bar: ['Lone pair (bar)', '\\chemfig{\\charge{90=\\|}{O}}'], rad: ['Radical', '\\chemfig{\\charge{90=\\.}{C}}'], dplus: ['δ+', '\\chemfig{\\charge{90=$\\delta+$}{C}}'], dminus: ['δ−', '\\chemfig{\\charge{90=$\\delta-$}{O}}'] };
  const PAL = [
    ['Atoms', [['a:', 'Vertex', '\\chemfig{-[:30]-[:-30]}', ''], ...ATOMS.map((x) => [`a:${x}`, x, `\\chemfig{${x}}`, x.length === 1 ? x : ''])]],
    ['Bonds', [['b:-', 'Single', '\\chemfig{-}', '1'], ['b:=', 'Double', '\\chemfig{=}', '2'], ['b:~', 'Triple', '\\chemfig{~}', '3'], ['b:>', 'Wedge', '\\chemfig{>}', ''], ['b:>:', 'Hashed', '\\chemfig{>:}', ''], ['b:>|', 'Hollow wedge', '\\chemfig{>|}', ''], ['b:<', 'Wedge, reversed', '\\chemfig{<}', ''], ['b:<:', 'Hashed, reversed', '\\chemfig{<:}', ''], ['b:<|', 'Hollow wedge, reversed', '\\chemfig{<|}', '']]],
    ['Rings', [['r:benzene', 'Benzene', `\\chemfig{${RINGS.benzene}}`], ['r:arom', 'Aromatic', `\\chemfig{${RINGS.arom}}`], ['r:3', 'Cyclopropane', `\\chemfig{${RINGS[3]}}`], ['r:4', 'Cyclobutane', `\\chemfig{${RINGS[4]}}`], ['r:5', 'Cyclopentane', `\\chemfig{${RINGS[5]}}`], ['r:6', 'Cyclohexane', `\\chemfig{${RINGS[6]}}`], ['r:7', 'Cycloheptane', `\\chemfig{${RINGS[7]}}`]]],
    ['Groups', Object.keys(GROUPS).map((k) => [`g:${k}`, { NH2: 'NH₂', CH3: 'CH₃', OCH3: 'OCH₃', NO2: 'NO₂' }[k] || k, `\\chemfig{-[0]${GROUPS[k](0)}}`])],
    ['Charges', Object.entries<any>(CHARGES).map(([k, [n, mini]]) => [`c:${k}`, n, mini])],
    ['Reactions', [['s:->', 'Arrow', '\\schemestart\\arrow{->}\\schemestop'], ['s:<=>', 'Equilibrium', '\\schemestart\\arrow{<=>}\\schemestop'], ['s:<->', 'Resonance', '\\schemestart\\arrow{<->}\\schemestop'], ['s:-/>', 'No reaction', '\\schemestart\\arrow{-/>}\\schemestop'], ['s:+', 'Plus', '\\schemestart\\chemfig{A}\\+\\chemfig{B}\\schemestop'], ['s:merge', 'Merge', '\\schemestart\\chemfig{A}\\arrow{0}[-90,0.5]\\chemfig{B}\\merge>(c1)(c2)--()\\chemfig{C}\\schemestop'], ['s:move', 'Curved arrow', '\\chemfig{@{a}A-@{b}B}\\chemmove{\\draw[-stealth](a)..controls +(90:4mm) and +(90:4mm)..(b);}']]],
  ];
  const ITEM: Record<string, any> = {}, KEYS: Record<string, any> = {};
  for (const [, items] of PAL) for (const [k, name, mini, key] of items) { ITEM[k] = { k, name, mini, key }; if (key) KEYS[key.toLowerCase()] = k; }

  // ---------------------------------------------------------------- model
  // M = { segs (TD.chem.parseDoc), raw, dirty }: the code is M.raw until something is edited
  function load(src: any) { return { segs: C.parseDoc(src, () => {}), raw: String(src || ''), dirty: false }; }
  const codeOf = (M: any) => (M.dirty ? C.writeDoc(M.segs) : M.raw);
  const fmtA = (a: any) => { a = C.norm360(Math.round(a * 100) / 100); return Math.abs(a / 45 - Math.round(a / 45)) < 1e-9 ? String(Math.round(a / 45)) : `:${+a.toFixed(2)}`; };
  const num = (n: any) => String(+(+n).toFixed(3));
  function touch(mol: any) { if (!mol) return; mol.dirty = true; if (mol.owner) mol.owner.dirty = true; E.M.dirty = true; }
  const vkey = (v: any) => v.g || v.inBond || v.mol;
  let L: any = null;
  const lay = () => L || (L = C.build('', E.M.segs));
  const findV = (key: any) => lay().verts.find((v: any) => vkey(v) === key) || null;
  const selV = () => (E.sel && E.sel.v ? findV(E.sel.v) : null);
  const selB = () => (E.sel && E.sel.b ? lay().bonds.find((b: any) => b.item === E.sel.b) || null : null);
  const selA = () => (E.sel && E.sel.a ? lay().arrows.find((a: any) => a.seg === E.sel.a) || null : null);
  const sameV = (a: any, b: any) => a === b || (a && b && vkey(a) === vkey(b));
  const neighbours = (v: any) => lay().bonds.filter((b: any) => !b.hook || true).map((b: any) => (sameV(b.a, v) ? b.b : sameV(b.b, v) ? b.a : null)).filter(Boolean);
  // directions (maths angles) of the bonds at a vertex
  function dirsAt(v: any) {
    const out = [];
    for (const b of lay().bonds) {
      if (sameV(b.a, v)) out.push(Math.atan2(-(b.Y1 - b.Y0), b.X1 - b.X0) * 180 / Math.PI);
      else if (sameV(b.b, v)) out.push(Math.atan2(-(b.Y0 - b.Y1), b.X0 - b.X1) * 180 / Math.PI);
    }
    return out;
  }
  // the free direction for a new bond: zigzag off a lone bond, else the widest gap
  function freeAngle(v: any) {
    const d = dirsAt(v);
    if (!d.length) return 0;
    if (d.length === 1) {
      const into = C.norm360(d[0] + 180), c1 = C.norm360(into + 60), c2 = C.norm360(into - 60);
      // away from the atom two steps back, so chains zigzag
      const pv = neighbours(v)[0], far = pv ? neighbours(pv).filter((w: any) => !sameV(w, v)) : [];
      if (far.length) {
        const at = (c: any) => [v.X + Math.cos((c * Math.PI) / 180), v.Y - Math.sin((c * Math.PI) / 180)];
        const dist = (c: any) => { const p = at(c); return Math.min(...far.map((w: any) => Math.hypot(w.X - p[0], w.Y - p[1]))); };
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
  function grow(v: any, angle: any, sym: any, tail: any) {
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
  function chainOf(item: any) { return item.parent; }
  // a bond's name for \chemmove, -[@{name}…]: kept when its angle changes
  const bondName = (arg0: any) => (/^\s*@\{[^}]*\}/.exec(arg0 || '') || [''])[0];
  // cut a chain from item on; an emptied branch goes, an emptied molecule goes
  function cutFrom(item: any, mol: any) {
    const ch = chainOf(item);
    ch.items.splice(item.pidx);
    touch(mol);
    let c = ch;
    while (!c.items.length && c.owner) { const o = c.owner; o.chain.items.splice(o.chain.items.indexOf(o.item), 1); c = o.chain; }
    if (!mol.chain.items.length) deleteMol(mol);
  }
  function deleteRing(ring: any, mol: any) {
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
  function parentOf(seg: any, Ls = E.M.segs, own = null) : any {
    for (const g of Ls) { if (g === seg) return { list: Ls, own }; if (g.inner) { const r: any = parentOf(seg, g.inner, g); if (r) return r; } }
    return null;
  }
  function listOf(seg: any) { const p = parentOf(seg); return p ? p.list : E.M.segs; }
  // the compound a molecule belongs to, out of names, brackets and charges: its piece in a scheme's list
  function compOf(seg: any) {
    let c = seg, p = parentOf(c);
    while (p && p.own && p.own.t !== 'sub') { c = p.own; p = parentOf(c); }
    return { seg: c, list: p ? p.list : E.M.segs, sub: p ? p.own : null };
  }
  // the brackets nearest round a molecule, inside its compound
  function lrOf(seg: any) { let p = parentOf(seg); while (p && p.own && p.own.t !== 'sub') { if (p.own.t === 'lr') return p.own; p = parentOf(p.own); } return null; }
  const isStep = (g: any) => g.t === 'arrow' || g.t === 'merge';
  const blank = (g: any) => g && g.t === 'text' && !g.raw.trim();
  // an arrow between two compounds already placed: \arrow(@c1--@c2)
  const isDirect = (A: any) => A.t === 'arrow' && /^\(\s*@[\s\S]*--\s*@/.test(A.names || '');
  const inScheme = () => E.M.segs.some((g: any) => g.t === 'start');
  function deleteMol(mol: any) {
    let seg = mol;
    if (mol.owner && mol.owner.inner.filter((g: any) => g.t === 'mol').length === 1) seg = mol.owner;
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
  // Deleting takes away as little as it can, so the rest of the drawing stays where it is.
  // A labelled atom loses only its label (it becomes a carbon vertex). A bond in a chain goes with what hangs
  // after it. A ring's side can't leave a gap in chemfig, so it is kept but not drawn (draw=none, shown
  // dashed here) and the ring stays; a bare ring corner hides its two sides. What is left with nothing
  // drawn is then tidied away.
  const optsOf = (item: any) => String((item.arg && item.arg[4]) || '').split(',').map((x) => x.trim()).filter(Boolean);
  const hidden = (item: any) => !!item && optsOf(item).some((o) => /^draw\s*=\s*none$/.test(o));
  function setHidden(item: any, on: any) {
    const arg = (item.arg || []).slice();
    while (arg.length < 5) arg.push('');
    const o = optsOf(item).filter((x) => !/^draw\s*=\s*none$/.test(x));
    if (on) o.push('draw=none');
    arg[4] = o.join(', ');
    item.arg = arg; item.dirty = true;
  }
  // the label as seen: without the @{names} \chemmove uses
  const shownLabel = (v: any) => (v && v.g ? v.g.raw.replace(/@\{[^}]*\}/g, '').trim() : '');
  const bondsAt = (v: any) => lay().bonds.filter((b: any) => !b.hook && !b.sub && (sameV(b.a, v) || sameV(b.b, v)));
  // a chain's end: a bare vertex nothing else leaves from, reached by its own bond
  const isTip = (v: any) => !!v && !v.inRing && !!v.inBond && !shownLabel(v) && bondsAt(v).length === 1;
  function deleteVertex(v: any) {
    const mol = v.mol, mine = bondsAt(v);
    if (shownLabel(v)) {
      if (!mine.length && !v.inRing) { deleteMol(mol); return; }
      setLabel(v, namesIn(v.g.raw));
    } else if (!mine.length) { deleteMol(mol); return; }
    else if (mine.some((b: any) => b.ring)) {
      // a ring corner: its sides hide, what leaves it outwards goes
      for (const b of mine) if (b.ring && !hidden(b.item)) setHidden(b.item, true);
      cutOutgoing(v, mol, (b: any) => !b.ring);
    } else if (v.inBond) cutFrom(v.inBond, mol);
    else {
      // a bare start: its branches go, the next atom along starts the molecule
      cutOutgoing(v, mol, (b: any) => b.item.parent !== mol.chain);
      L = null;
      if (bondsAt(vfind(v)).length && !dropFirstBond(mol)) {
        // a ring right at the next atom would turn without its bond: the chain goes, as for a bond
        const fb = mol.chain.items.find((it: any) => it.t !== 'ws');
        if (fb && fb.t === 'bond') cutFrom(fb, mol);
      }
    }
    touch(mol); prune(mol);
  }
  const vfind = (v: any) => findV(vkey(v)) || v;
  // cut the bonds leaving v (one at a time: each cut moves the rest of its chain)
  function cutOutgoing(v: any, mol: any, which: any) {
    for (let guard = 0; guard < 50; guard++) {
      L = null;
      if (!parentOf(mol)) return;
      const w = vfind(v), b = bondsAt(w).find((x: any) => sameV(x.a, w) && x.b && x.b.inBond === x.item && which(x));
      if (!b) return;
      cutFrom(b.item, mol);
    }
  }
  function deleteBond(b: any) {
    if (b.hook || hidden(b.item)) return;
    if (b.ring) { setHidden(b.item, true); touch(b.mol); prune(b.mol); return; }
    cutFrom(b.item, b.mol);
  }
  // is a chain inside a ring item (its sides, or what branches off them)?
  function insideRing(ch: any, ring: any) { for (; ch; ch = ch.owner && ch.owner.chain) if (ch.owner && ch.owner.item === ring) return true; return false; }
  // after a delete: drop hidden bonds to bare ends, a hidden first bond, rings and molecules with nothing drawn
  function prune(mol: any) {
    for (let guard = 0; guard < 200; guard++) {
      if (!parentOf(mol)) return;
      L = null;
      const Lo = lay(), bs = Lo.bonds.filter((b: any) => b.mol === mol && !b.hook && !b.sub), vs = Lo.verts.filter((v: any) => v.mol === mol && !v.sub);
      // a hidden bond to a bare chain end
      const tail = bs.find((b: any) => hidden(b.item) && !b.ring && b.b && b.b.inBond === b.item && isTip(b.b));
      if (tail) { cutFrom(tail.item, mol); continue; }
      // a hidden first bond from a bare start: the next atom starts the molecule
      if (dropFirstBond(mol, true)) continue;
      // a ring with no side drawn and nothing labelled in it
      const ring = Lo.rings.find((r: any) => r.mol === mol && bs.filter((b: any) => insideRing(b.chain, r.item)).every((b: any) => hidden(b.item)) && !vs.some((v: any) => insideRing(v.chain, r.item) && shownLabel(v)));
      if (ring) { deleteRing(ring.item, mol); continue; }
      // nothing drawn at all
      if (!bs.some((b: any) => !hidden(b.item)) && !vs.some((v: any) => shownLabel(v))) { deleteMol(mol); return; }
      return;
    }
  }
  // the first bond goes from a bare start (only when it is hidden, when tidying): the next atom starts the molecule
  function dropFirstBond(mol: any, onlyHidden = false) {
    const items = mol.chain.items, i = items.findIndex((it: any) => it.t !== 'ws');
    const fb = items[i];
    if (!fb || fb.t !== 'bond' || (onlyHidden && !hidden(fb))) return false;
    L = null;
    const r = lay().verts.find((v: any) => v.mol === mol && v.root);
    if (!r || shownLabel(r) || bondsAt(r).length !== 1) return false;
    // what hangs at the next atom keeps its angles: a ring there would turn, so it stays as written
    let j = i + 1;
    const fix = [];
    for (; j < items.length && items[j].t !== 'bond'; j++) {
      const it = items[j];
      if (it.t === 'ring' || it.t === 'sub') return false;
      if (it.t === 'branch') { const fb2 = it.chain.items.find((x: any) => x.t !== 'ws'); if (fb2 && fb2.t === 'bond') fix.push(fb2); }
    }
    if (items[j]) fix.push(items[j]);
    for (const b of fix) {
      const a0 = (b.arg && b.arg[0]) || '', rest = a0.replace(/^\s*@\{[^}]*\}\s*/, '');
      if (/^::/.test(rest) && b.angleUsed != null) { const arg = b.arg.slice(); arg[0] = bondName(a0) + fmtA(b.angleUsed); b.arg = arg; b.dirty = true; }
    }
    items.splice(0, i + 1);
    touch(mol);
    return true;
  }
  function setLabel(v: any, text: any) {
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
  function atomsOf(v: any) {
    const raw = v.g ? v.g.raw : '';
    if (/\?/.test(raw)) return null;
    const sp = C.splitAtoms(raw);
    return sp.atoms;
  }
  // names for \chemmove (@{name}) stay in front of their atoms
  // an atom's colour: each atom of the label wrapped as \textcolor{red}{O}, with | between atoms so chemfig still
  // splits them (a mixed colour is braced, {\textcolor[RGB]{r,g,b}{O}}: chemfig misreads the [ ] otherwise)
  const TC_RE = /^\\textcolor\s*(?:\[\s*RGB\s*\]\s*\{([^{}]*)\}|\{([^{}]*)\})\s*\{([\s\S]*)\}$/;
  const tcOf = (raw: string) => { const r = raw.trim(); return TC_RE.exec(/^\{\\textcolor/.test(r) ? C.unbrace(r) : r); };
  const atomColour = (raw: string) => { const m = tcOf(raw); if (!m) return null; if (m[2] != null) return m[2].trim(); const n = m[1].split(',').map((x) => x.trim()); return `rgb,255:red,${n[0]};green,${n[1]};blue,${n[2]}`; };
  function colourOfAtoms(v: any) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return '';
    const cs = atoms.map((a: any) => atomColour(a.raw));
    return cs.every((c: any) => c && c === cs[0]) ? cs[0] : '';
  }
  function setAtomsColour(v: any, c: string) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return;
    const rgb = /^\{?rgb,\s*255\s*:\s*red,\s*(\d+);\s*green,\s*(\d+);\s*blue,\s*(\d+)\}?$/.exec(c);
    const wrap = (raw: string) => (!c ? raw : rgb ? `{\\textcolor[RGB]{${rgb[1]},${rgb[2]},${rgb[3]}}{${raw}}}` : `\\textcolor{${c}}{${raw}}`);
    writeAtoms(v, atoms.map((a: any) => { const m = tcOf(a.raw); return { ...a, raw: wrap(m ? m[3] : a.raw) }; }));
  }
  // chemfig starts an atom only at a capital letter: any other atom after the first gets an explicit | before it
  function writeAtoms(v: any, atoms: any) { setLabel(v, atoms.map((a: any, i: number) => (i && !/^[A-Z]/.test(a.raw.trim()) ? '|' : '') + (a.name ? `@{${a.name}}` : '') + a.raw).join('')); }
  const namesIn = (raw: any) => (String(raw || '').match(/@\{[^}]*\}/g) || []).join('');
  function chargesOf(a: any) { return a && a.charges ? a.charges : []; }
  function setAtomCharges(a: any, list: any) {
    const inner = a.inner != null ? a.inner : a.raw;
    if (!list.length) { a.raw = inner; return; }
    // its settings stay, inside the list where chemfig reads them: \charge{[.radius=1pt]90=\.}{O}
    a.raw = `\\${a.cmd || 'charge'}{${a.copt ? `[${a.copt}]` : ''}${list.map((c: any) => `${c.pos}${c.off ? `:${c.offRaw || c.off}` : ''}${c.tikz || ''}=${c.what}`).join(',')}}{${inner}}`;
  }
  // + and − as a superscript on the main atom
  function signOf(a: any) { const t = a ? (a.inner != null ? a.inner : a.raw) : ''; return /\^\{?\+\}?$/.test(t) ? '+' : /\^\{?-\}?$/.test(t) ? '-' : ''; }
  function setSign(v: any, sign: any) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return false;
    const a = atoms[Math.min(v.k, atoms.length - 1)];
    let t = (a.inner != null ? a.inner : a.raw).replace(/\^\{?[+-]\}?$/, '');
    if (sign) t += `^{${sign}}`;
    if (a.inner != null) { a.inner = t; setAtomCharges(a, chargesOf(a)); } else a.raw = t;
    writeAtoms(v, atoms);
    return true;
  }
  function toggleDecor(v: any, what: any, angle: any) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return false;
    const a = atoms[Math.min(v.k, atoms.length - 1)];
    const list = chargesOf(a).map((c: any) => ({ ...c }));
    const i = list.findIndex((c: any) => Math.abs(c.angle - angle) < 1 && c.what.trim() === what);
    if (i >= 0) list.splice(i, 1); else { const j = list.findIndex((c: any) => Math.abs(c.angle - angle) < 1); if (j >= 0) list.splice(j, 1); list.push({ pos: String(angle), angle, off: 0, what }); }
    if (a.inner == null) { a.inner = a.raw; a.cmd = 'charge'; }
    setAtomCharges(a, list);
    writeAtoms(v, atoms);
    return true;
  }
  // chemfig's electrons round an atom: a pair as two dots (\:) or a bar (\|), a single electron (\.)
  const PAIR_KINDS = ['\\:', '\\|'];
  const kindOf = (c: any) => c.what.replace(/\\[,;!]/g, '').trim();
  const pairsOn = (a: any) => chargesOf(a).filter((c: any) => PAIR_KINDS.includes(kindOf(c)));
  // the style the atom's pairs are drawn in, or the one last picked for an atom with none
  let pairStyle = '\\:';
  const styleOf = (a: any) => { const p = pairsOn(a); return p.length ? (p.every((c: any) => kindOf(c) === '\\|') ? '\\|' : p.every((c: any) => kindOf(c) === '\\:') ? '\\:' : '') : pairStyle; };
  // a lone pair on one side: off if there is one (dots or bar), else on in the atom's style
  function togglePair(v: any, angle: any) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return false;
    const a = atoms[Math.min(v.k, atoms.length - 1)], had = pairsOn(a).find((c: any) => Math.abs(c.angle - angle) < 1);
    return toggleDecor(v, had ? had.what.trim() : styleOf(a) || pairStyle, angle);
  }
  // every pair on the atom redrawn as dots or as a bar
  function setPairStyle(v: any, what: any) {
    pairStyle = what;
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return false;
    const a = atoms[Math.min(v.k, atoms.length - 1)];
    if (!pairsOn(a).length) return false;
    const list = chargesOf(a).map((c: any) => (PAIR_KINDS.includes(kindOf(c)) ? { ...c, what } : { ...c }));
    setAtomCharges(a, list);
    writeAtoms(v, atoms);
    return true;
  }
  // partial charges, \charge{90:3pt=$\delta+$}{C}: chemfig centres the text on the atom's edge, so it is written with
  // a distance that clears the atom (its half width or half height out along the angle), which can be changed
  const PARTIAL_RE = /^\$?\s*\\delta\s*\^?\{?\s*([+-])\s*\}?\s*\$?$/;
  const mainAtom = (v: any) => { const atoms = atomsOf(v); return atoms && atoms.length ? atoms[Math.min(v.k, atoms.length - 1)] : null; };
  function partialOf(a: any) { const c = chargesOf(a).find((x: any) => PARTIAL_RE.test(x.what.trim())); return c ? { c, sign: PARTIAL_RE.exec(c.what.trim())![1] } : null; }
  function clearOff(what: string, angle: number) {
    const bx = TD.textBox(what, C.TEXT), r = (angle * Math.PI) / 180;
    // how far along the angle the text's box reaches from its middle, plus a little air
    const hw = (bx.w - 2) / 2, hh = 0.36 * C.EM, c = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r));
    const px = Math.min(c > 1e-6 ? hw / c : Infinity, sn > 1e-6 ? hh / sn : Infinity) + 0.5 * C.PT;
    return Math.max(0, Math.round((px / C.PT) * 2) / 2);
  }
  function setPartial(v: any, sign: string, angle: number, offPt?: number | null) {
    const atoms = atomsOf(v);
    if (!atoms || !atoms.length) return false;
    const a = atoms[Math.min(v.k, atoms.length - 1)], list = chargesOf(a).filter((c: any) => !PARTIAL_RE.test(c.what.trim())).map((c: any) => ({ ...c }));
    if (sign) {
      const what = `$\\delta${sign}$`, o = offPt != null ? offPt : clearOff(what, angle);
      list.push({ pos: String(angle), angle, off: o * C.PT, offRaw: o ? `${num(o)}pt` : '', what });
    }
    if (a.inner == null) { a.inner = a.raw; a.cmd = 'charge'; }
    setAtomCharges(a, list);
    writeAtoms(v, atoms);
    return true;
  }
  const POSITIONS = () => [['90', t('editor.commonA.side.above', 'Above')], ['45', t('editor.cf.pos.ne', 'Above right')], ['0', t('editor.commonA.side.right', 'Right')], ['315', t('editor.cf.pos.se', 'Below right')], ['270', t('editor.commonA.side.below', 'Below')], ['225', t('editor.cf.pos.sw', 'Below left')], ['180', t('editor.commonA.side.left', 'Left')], ['135', t('editor.cf.pos.nw', 'Above left')]];
  function partialRows(main: any) {
    const pc = partialOf(main), rows: any[] = [segments(t('editor.cf.partial', 'Partial charge'), 'pq', pc ? pc.sign : '', [['', t('ui.none', 'None')], ['+', 'δ+'], ['-', 'δ−']], !main)];
    if (pc) {
      const a = String(Math.round(pc.c.angle)), opts = POSITIONS();
      if (!opts.some((o) => o[0] === a)) opts.push([a, `${a}°`]);
      rows.push(selectField(t('editor.cf.position', 'Position'), 'pang', a, opts),
        chemicalNumber(t('editor.cf.distance', 'Distance'), 'poff', +(pc.c.off / C.PT).toFixed(2), 'pt', { step: '0.5', title: t('editor.cf.distanceTitle', 'From the edge of the atom to the middle of the charge') }));
    }
    return rows;
  }
  // a free spot for a charge: the quarter with no bond in it
  function freeSpot(v: any) {
    const d = dirsAt(v), atoms = atomsOf(v) || [], a = atoms[Math.min(v.k, atoms.length - 1)], taken = chargesOf(a).map((c: any) => c.angle);
    let best = 90, bg = -1;
    for (const c of [90, 0, 270, 180, 45, 135, 225, 315]) {
      if (taken.some((t: any) => Math.abs(t - c) < 1)) continue;
      const gap = d.length ? Math.min(...d.map((x) => Math.abs(((c - x + 540) % 360) - 180))) : 180;
      if (gap > bg + 20) { bg = gap; best = c; }
    }
    return best;
  }

  // ---------------------------------------------------------------- schemes
  const T = (raw: any) => ({ t: 'text', raw });
  const newMol = (code: any) => ({ t: 'mol', head: '\\chemfig', chain: C.parseChain(code, () => {}, E.M.segs.defs), raw: `\\chemfig{${code}}`, dirty: false });
  const copyMol = (m: any) => newMol(m ? C.writeChain(m.chain) : 'A');
  const lastMol = (segs: any) => { for (let i = segs.length - 1; i >= 0; i--) { const g = segs[i]; if (g.t === 'mol') return g; if (g.t === 'name') { const m: any = lastMol(g.inner); if (m) return m; } } return null; };
  function topOf(seg: any) { return seg.owner || seg; }
  // inside \hreac … \endhreac, arrows are > and + is a bare +: added before \endhreac or after the selection
  function addInHreac(seg: any, after: any) {
    const segs = E.M.segs, hi = segs.findIndex((g: any) => g.t === 'hstart');
    let ho = segs.findIndex((g: any) => g.t === 'hstop');
    if (ho < 0) { segs.push(T('\n'), { t: 'hstop', raw: '\\endhreac' }); ho = segs.length - 1; }
    let at = ho;
    if (after) { const i = segs.indexOf(topOf(after)); if (i > hi && i < ho) at = i + 1; }
    while (at > hi + 1 && segs[at - 1].t === 'text' && !segs[at - 1].raw.trim()) at--;
    const m = copyMol(after || lastMol(segs.slice(hi, at)));
    segs.splice(at, 0, T('\n  '), seg, T('\n  '), m);
    E.M.dirty = true;
    return m;
  }
  const inHreac = () => E.M.segs.some((g: any) => g.t === 'hstart');
  function addArrow(type: any, after: any) {
    const segs = E.M.segs;
    if (inHreac()) { addInHreac({ t: 'harrow', raw: type === '->' ? '>' : `>{${type}}`, type, labels: [] }, after); return null; }
    let si = segs.findIndex((g: any) => g.t === 'start');
    if (si < 0) {
      // the drawing becomes the first compound of a scheme
      const body = segs.slice();
      while (body.length && body[0].t === 'text' && !body[0].raw.trim()) body.shift();
      while (body.length && body[body.length - 1].t === 'text' && !body[body.length - 1].raw.trim()) body.pop();
      segs.length = 0;
      segs.push({ t: 'start', raw: '\\schemestart' }, T('\n  '), ...body, T('\n'), { t: 'stop', raw: '\\schemestop' });
      si = 0;
    }
    let so = segs.findIndex((g: any) => g.t === 'stop');
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
  function addPlus(after: any) {
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
  function deleteArrow(A: any) {
    const Ls = listOf(A), i = Ls.indexOf(A);
    if (i < 0) return;
    let j = i + 1;
    if (!isDirect(A)) while (j < Ls.length && !isStep(Ls[j]) && Ls[j].t !== 'stop') j++;
    let a = i;
    while (a > 0 && blank(Ls[a - 1])) a--;
    const gone = Ls.splice(a, j - a);
    Ls.splice(a, 0, ...gone.filter((g: any) => ['move', 'pdelim', 'flip', 'set', 'submol', 'nameinit'].includes(g.t)));
    E.M.dirty = true;
  }
  // \merge from the last two compounds to a new one
  function addMerge() {
    const segs = E.M.segs, comps = lay().comps || [];
    const lv = Math.min(...comps.map((x: any) => x.level)), named = comps.filter((x: any) => x.name);
    let top = named.filter((x: any) => x.level === lv);
    if (top.length < 2) top = named;
    if (!inScheme() || inHreac() || top.length < 2) return null;
    const so = segs.findIndex((g: any) => g.t === 'stop');
    let at = so < 0 ? segs.length : so;
    while (at > 1 && blank(segs[at - 1])) at--;
    const M = { t: 'merge', dir: 'v', labels: [], srcs: top.slice(-2).map((x: any) => x.name), target: '', opt: [], dirty: true, raw: '' };
    segs.splice(at, 0, T('\n  '), M, T('\n  '), copyMol(lastMol(segs.slice(0, at))));
    E.M.dirty = true;
    return M;
  }
  // brackets round a molecule: \chemleft[ … \chemright]
  const BRK: Record<string, any> = { '[': ']', '(': ')', '\\{': '\\}' };
  function setBrackets(mol: any, k: any) {
    const lr = lrOf(mol);
    if (lr) {
      if (!k) { const p = parentOf(lr); p.list.splice(p.list.indexOf(lr), 1, ...lr.inner); if (p.own && p.own.t === 'name') for (const x of lr.inner) x.owner = p.own; }
      else { lr.l = k; lr.r = BRK[k]; lr.pre = `\\chemleft${k}`; lr.post = `\\chemright${BRK[k]}`; }
    } else if (k) {
      const p = parentOf(mol);
      const w: Record<string, any> = { t: 'lr', l: k, r: BRK[k], inner: [mol], pre: `\\chemleft${k}`, post: `\\chemright${BRK[k]}`, raw: '' };
      if (p.own && p.own.t === 'name') w.owner = p.own;
      p.list.splice(p.list.indexOf(mol), 1, w);
    }
    E.M.dirty = true;
  }
  // \subscheme{compound \arrow compound}: what the next arrow leads to, grouped with this compound
  function nextStep(mol: any) {
    const c = compOf(mol), Ls = c.list;
    let j = Ls.indexOf(c.seg) + 1;
    while (j < Ls.length && !isStep(Ls[j]) && Ls[j].t !== 'stop') j++;
    return j < Ls.length && isStep(Ls[j]) && !isDirect(Ls[j]) ? { c, j } : null;
  }
  function groupNext(mol: any) {
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
  function ungroup(sub: any) { const p = parentOf(sub); if (p) { p.list.splice(p.list.indexOf(sub), 1, ...sub.inner); E.M.dirty = true; } }
  // chemfig reads \subscheme's option as settings: an angle is written arrow angle=…, other settings as typed
  function setSubAngle(sub: any, v: any) {
    const o = String(v).trim();
    sub.opt = /^-?[\d.]+$/.test(o) ? `arrow angle=${o}` : o;
    sub.pre = sub.opt ? `\\subscheme[${sub.opt}]{` : '\\subscheme{'; E.M.dirty = true;
  }
  const subAngleText = (sub: any) => { const m = /^\s*arrow angle\s*=\s*(-?[\d.]+)\s*$/.exec(sub.opt || ''); return m ? m[1] : sub.opt || ''; };

  // ---------------------------------------------------------------- curved arrows (\chemmove)
  // Each \draw in a \chemmove body is one curved arrow; the editor rewrites the k-th one in place.
  const DRAW_RE = /\\(draw|path)\s*(\[[^\]]*\])?([^;]*);/g;
  function drawsOf(seg: any) {
    const out = [], re = new RegExp(DRAW_RE.source, 'g');
    let m;
    while ((m = re.exec(seg.body))) out.push({ i: m.index, e: re.lastIndex, cmd: m[1], opt: m[2] ? m[2].slice(1, -1) : '', path: m[3] });
    return out;
  }
  const moveRaw = (seg: any) => `\\chemmove${seg.opt ? `[${seg.opt}]` : ''}{${seg.body}}`;
  function setDraw(seg: any, k: any, d: any) {
    const D0 = drawsOf(seg)[k];
    if (!D0) return;
    const x = { ...D0, ...d };
    seg.body = seg.body.slice(0, D0.i) + `\\${x.cmd}${x.opt ? `[${x.opt}]` : ''}${x.path};` + seg.body.slice(D0.e);
    seg.raw = moveRaw(seg); E.M.dirty = true;
  }
  function deleteDraw(seg: any, k: any) {
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
  const DIRS: Record<string, any> = { right: 0, east: 0, up: 90, north: 90, left: 180, west: 180, down: 270, south: 270, 'north east': 45, 'north west': 135, 'south west': 225, 'south east': 315 };
  const ANG = '(-?[\\d.]+|[a-z]+(?:\\s+[a-z]+)?)';
  const SIMPLE = new RegExp(`^\\s*\\(([^()]*)\\)\\s*\\.\\.\\s*controls\\s*\\+\\(\\s*${ANG}\\s*:\\s*(-?[\\d.]+)\\s*(cm|mm|pt)?\\s*\\)\\s*and\\s*\\+\\(\\s*${ANG}\\s*:\\s*(-?[\\d.]+)\\s*(cm|mm|pt)?\\s*\\)\\s*\\.\\.\\s*\\(([^()]*)\\)\\s*$`);
  const UNIT: Record<string, any> = { cm: 1, mm: 0.1, pt: 2.54 / 72.27, '': 1 };
  const angOf = (a: any) => (a in DIRS ? DIRS[a] : /^-?[\d.]+$/.test(a) ? +a : NaN);
  function simpleOf(path: any) {
    const m = SIMPLE.exec(path || '');
    if (!m) return null;
    const out = angOf(m[2]), inn = angOf(m[5]);
    return isNaN(out) || isNaN(inn) ? null : { a: m[1], out, r1: +m[3] * UNIT[m[4] || ''], in: inn, r2: +m[6] * UNIT[m[7] || ''], b: m[8] };
  }
  const cm = (n: any) => `${+n.toFixed(2)}cm`;
  const simplePath = (q: any) => `(${q.a})..controls +(${+q.out.toFixed(1)}:${cm(q.r1)}) and +(${+q.in.toFixed(1)}:${cm(q.r2)})..(${q.b})`;
  // options of a \draw, by what they set: tips, line, colour
  const TIP_RE = /^([<>]?|CF|stealth|latex|to)?-([<>]?|CF|stealth|latex|to)?$/;
  const isColour = (o: any) => { const q = /^(?:color\s*=\s*|draw\s*=\s*)?([a-zA-Z]+(?:![\d.]+(?:![a-zA-Z]+)?)?)$/.exec(o); return !!(q && !/^(dashed|dotted|solid|thin|thick|semithick|overlay)$/.test(q[1]) && TD.tikzColor && TD.tikzColor(q[1])); };
  function setDrawOpt(seg: any, k: any, what: any, val: any) {
    const D0 = drawsOf(seg)[k];
    if (!D0) return;
    const drop = what === 'tips' ? (o: any) => TIP_RE.test(o) : what === 'line' ? (o: any) => /^(dashed|dotted|solid|dash pattern\s*=)/.test(o) : isColour;
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
  function nameFor(t: any) {
    if (t.v) {
      const v = findV(t.v), atoms = v && atomsOf(v);
      if (!atoms) return null;
      // a bare atom (a carbon): @{name} alone names it
      if (!atoms.length) {
        const tail = C.splitAtoms(v.g ? v.g.raw : '').tail;
        if (tail) return tail;
        const n = freshName();
        setLabel(v, `@{${n}}${v.g ? v.g.raw : ''}`); L = null;
        return n;
      }
      const a = atoms[Math.min(v.k, atoms.length - 1)];
      if (a.name) return a.name;
      a.name = freshName();
      writeAtoms(v, atoms); L = null;
      return a.name;
    }
    const b = lay().bonds.find((x: any) => x.item === t.b);
    if (!b) return null;
    const arg = (b.item.arg || []).slice(), m = /^\s*@\{([^},]*)/.exec(arg[0] || '');
    if (m) return m[1].trim();
    const n = freshName();
    arg[0] = `@{${n}}${arg[0] || ''}`;
    b.item.arg = arg; b.item.dirty = true; touch(b.mol); L = null;
    return n;
  }
  const endPt = (t: any) => { if (t.v) { const v = findV(t.v); return v && [v.X, v.Y]; } const b = lay().bonds.find((x: any) => x.item === t.b); return b && [(b.X0 + b.X1) / 2, (b.Y0 + b.Y1) / 2]; };
  // a new curved arrow from one atom or bond to another, bowed upward
  function addMove(from: any, to: any) {
    const p1 = endPt(from), p2 = endPt(to);
    if (!p1 || !p2) return null;
    const a = nameFor(from), b = nameFor(to);
    if (!a || !b) return null;
    const th = (Math.atan2(-(p2[1] - p1[1]), p2[0] - p1[0]) * 180) / Math.PI, up = Math.cos((th * Math.PI) / 180) >= 0 ? 1 : -1;
    const r = Math.max(0.3, (0.4 * Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) / TD.PX_PER_CM);
    const q = { a, b, out: C.norm360(Math.round(th + 60 * up)), in: C.norm360(Math.round(th + 180 - 60 * up)), r1: Math.round(r * 20) / 20, r2: Math.round(r * 20) / 20 };
    const seg: Record<string, any> = { t: 'move', opt: '-stealth,shorten <=2pt,shorten >=2pt', body: `\\draw${simplePath(q)};` };
    seg.raw = moveRaw(seg);
    E.M.segs.push(T('\n'), seg);
    E.M.dirty = true;
    return seg;
  }
  const selM = () => (E.sel && E.sel.m ? (lay().moves || []).find((x: any) => x.seg === E.sel.m.seg && x.k === E.sel.m.k) || null : null);
  // a curved arrow's path, as SVG, and points along it for hit-testing
  function movePts(mv: any, n = 16) {
    const { pts, ops } = mv.segs, out = [pts[0]];
    ops.forEach((o: any, i: any) => {
      const p0 = pts[i], p3 = pts[i + 1];
      if (o.k !== 'curve') { out.push(p3); return; }
      for (let j = 1; j <= n; j++) {
        const t = j / n, u = 1 - t;
        out.push([u * u * u * p0[0] + 3 * u * u * t * o.c1[0] + 3 * u * t * t * o.c2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * o.c1[1] + 3 * u * t * t * o.c2[1] + t * t * t * p3[1]]);
      }
    });
    return out;
  }
  const moveD = (mv: any) => movePts(mv).map((p, i) => `${i ? 'L' : 'M'}${r2(p[0])},${r2(p[1])}`).join('');
  // the two control points of a curved arrow in the simple form, and the atoms (or bonds) they hang from
  function mctls(mv: any) {
    const D0 = drawsOf(mv.seg)[mv.k], q = D0 && simpleOf(D0.path), o = mv.segs.ops[0];
    if (!q || mv.segs.ops.length !== 1 || o.k !== 'curve') return [];
    const at = (c: any, a: any, r: any) => ({ cx: c[0], cy: c[1], ax: c[0] - r * TD.PX_PER_CM * Math.cos((a * Math.PI) / 180), ay: c[1] + r * TD.PX_PER_CM * Math.sin((a * Math.PI) / 180) });
    return [{ i: 1, ...at(o.c1, q.out, q.r1) }, { i: 2, ...at(o.c2, q.in, q.r2) }];
  }

  // a bond's line width=…pt among its TikZ options (arg[4]); other units are left in Options as written
  // TikZ options of a bond (arg[4]) or of every bond (bond style), read and set by what they do: line width=…pt,
  // a colour (red, draw=…, color=…) and dashed / dotted; anything else is left as written
  const WIDTH_RE = /^\s*line\s+width\s*=\s*(-?[\d.]+)\s*pt\s*$/;
  const DASH_RE = /^(dashed|dotted|solid)$/;
  const optList = (o: any): string[] => C.split(String(o || '')).map((x: any) => x.trim()).filter(Boolean);
  const colourIn = (x: string) => { const m = /^(?:color|draw)\s*=\s*([\s\S]+)$/.exec(x), c = m ? TD.texColor.unwrap(m[1]) : x; return c !== 'none' && (m || isColour(x)) && TD.tikzColor && TD.tikzColor(c) ? c : ''; };
  function widthOf(o: any) { for (const x of optList(o)) { const m = WIDTH_RE.exec(x); if (m) return parseFloat(m[1]); } return null; }
  function withWidth(o: any, n: number | null) { const rest = optList(o).filter((x) => !WIDTH_RE.test(x)); return [...rest, ...(n == null ? [] : [`line width=${num(n)}pt`])].join(','); }
  const colourOf = (o: any) => optList(o).map(colourIn).find(Boolean) || '';
  function withColour(o: any, c: string) { const rest = optList(o).filter((x) => !colourIn(x)); return [...rest, ...(!c ? [] : /^[a-zA-Z]+(![\d.]+(![a-zA-Z]+)?)?$/.test(c) ? [c] : [`draw=${TD.texColor.wrap(c)}`])].join(','); }
  const dashOf = (o: any) => optList(o).find((x) => x === 'dashed' || x === 'dotted') || 'solid';
  function withDash(o: any, d: string) { const rest = optList(o).filter((x) => !DASH_RE.test(x)); return [...rest, ...(d === 'dashed' || d === 'dotted' ? [d] : [])].join(','); }

  // \setchemfig{…} at the top of the code: the drawing's settings, read in order (a later one wins) and written into
  // the last one that has the key, else the first, else a new one in front
  // the settings that count: \setchemfig (and 1.x setters) after the last \resetchemfig that has drawing after it
  const shows = (g: any) => (g.t === 'text' ? !!g.raw.replace(/%.*$/gm, '').trim() : !['set', 'reset', 'submol', 'move', 'pdelim', 'flip', 'nameinit'].includes(g.t));
  const resetAt = () => { const Ls = E.M.segs; for (let i = Ls.length - 1; i >= 0; i--) if (Ls[i].t === 'reset' && !Ls[i].charge && Ls.slice(i + 1).some(shows)) return i; return -1; };
  const topSets = () => { const r = resetAt(); return E.M.segs.filter((g: any, i: number) => i > r && g.t === 'set' && !g.tikz && !g.charge); };
  const settings = (): Record<string, string> => Object.assign({}, ...topSets().map((g: any) => g.kv));
  const writeSet = (g: any) => { const kv = Object.entries<string>(g.kv); g.raw = `\\setchemfig{${kv.map(([a, b]) => (b === 'true' ? a : `${a}=${/[,=]/.test(b) ? `{${b}}` : b}`)).join(',')}}`; };
  // chemfig 1.x code (\setatomsep…, \chemfig*…) in today's form, as TD.chem.modernize writes it
  function upgradeLegacy() {
    const c = C.modernize(codeOf(E.M));
    if (!c.changes.length) return;
    E.M = { ...load(c.code), dirty: false };
    L = null;
  }
  function setSetting(k: string, v: string) {
    upgradeLegacy();
    const sets = topSets();
    let g = [...sets].reverse().find((x: any) => k in x.kv) || sets[0];
    if (!g) { if (!v) return; g = { t: 'set', kv: {}, raw: '' }; E.M.segs.splice(resetAt() + 1, 0, g); }
    if (v) g.kv[k] = v; else delete g.kv[k];
    const kv = Object.entries<string>(g.kv);
    if (!kv.length) { const L0 = E.M.segs; L0.splice(L0.indexOf(g), 1); }
    else writeSet(g);
    E.M.dirty = true;
  }
  const LEN_RE = /^-?(\d+\.?\d*|\.\d+)\s*(pt|em|ex|cm|mm|in|bp|pc|sp|dd|cc)$/;
  // compound names (\chemname): the name drawn under a molecule, or, under one with none, a phantom box where it
  // would go. Double-click either to type the name in place.
  const molsIn = (L0: any): any[] => L0.flatMap((g: any) => (g.t === 'mol' ? [g] : g.inner ? molsIn(g.inner) : []));
  function phantoms() {
    const Lo = lay(), P = Lo.P || C.DEF, out: any[] = [];
    // \chemname measures depth from the molecule's own baseline (m.dy), not the page: a compound raised by its arrow
    // keeps its name under it. The depth is the deepest of this molecule and the names before it (\chemname*
    // leaves it alone; molecules without a name don't count)
    let dp = 0;
    for (const m of Lo.mols || []) {
      const bb = m.L && m.L.bb;
      if (!bb || m.seg.sub) continue;
      const desc = bb.y + bb.h;
      if (m.seg.owner) { if (!/^\\chemname\s*\*/.test(m.seg.owner.head || '')) dp = Math.max(dp, desc); continue; }
      // where \chemname would put it: centred, its top name sep under that depth
      const w = 4 * C.EM, h = 1.2 * C.EM, cx = m.dx + bb.x + bb.w / 2, top = m.dy + Math.max(dp, desc) + P.nameSep;
      out.push({ mol: m.seg, x: cx - w / 2, y: top, w, h, cx, cy: top + h / 2 });
    }
    return out;
  }
  // what is under the pointer: a name's text, or a phantom; { mol, cx, cy } in drawing units
  function nameAt(e: any) {
    const [x, y] = pos(e), k = E.view.k;
    for (const q of lay().texts) {
      if (!q.name) continue;
      const [X, Y] = S(q.cx, q.cy);
      if (Math.abs(X - x) <= (q.b.w / 2 + 2) * k && Math.abs(Y - y) <= (q.b.h / 2 + 2) * k) { const mol = molsIn(q.name.inner)[0]; if (mol) return { mol, cx: q.cx, cy: q.cy }; }
    }
    if (!showPhantoms()) return null;
    for (const f of phantoms()) { const [X, Y] = S(f.x, f.y); if (x >= X && x <= X + f.w * k && y >= Y && y <= Y + f.h * k) return f; }
    return null;
  }
  const showPhantoms = () => !E.drag && !E.arm && !E.ghost;
  // the name's middle on the stage: its text once it has one, else its phantom
  function nameSpot(mol: any) {
    const Lo = lay(), q = mol.owner && Lo.texts.find((x: any) => x.name === mol.owner);
    if (q) return [q.cx, q.cy];
    const f = phantoms().find((x) => x.mol === mol);
    return f ? [f.cx, f.cy] : null;
  }
  function editName(mol: any) {
    if (!TD.input) return false;
    closeLabel();
    begin();
    const me: any = (Lb = {});
    me.mol = mol;
    me.pop = TD.input.popup(stage, {
      text: String(nameOf(mol)).split('\\\\').map((x) => x.trim()).join('\n'), math: false,
      at: () => { const c = nameSpot(mol) || [0, 0], [X, Y] = S(c[0], c[1]), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + X, vr.top - sr.top + Y]; },
      onInput: (tx: any) => { setName(mol, String(tx || '').split('\n').map((x) => x.trim()).filter(Boolean).join('\\\\')); L = null; draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    draw();
    return true;
  }
  function nameOf(mol: any) { return mol.owner ? mol.owner.name : ''; }
  function setName(mol: any, name: any) {
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
  // the compound to come: an arrow with nothing after it (up to the next step or the scheme's end) gets a dashed
  // box where chemfig would set the next compound. Click it to type one, or put an atom, ring or group in it.
  function tails() {
    const Lo = lay(), P = Lo.P || C.DEF, out: any[] = [];
    for (const a of Lo.arrows || []) {
      const A = a.seg;
      if (!A || A.t !== 'arrow' || isDirect(A) || out.some((f) => f.A === A)) continue;
      const p = parentOf(A);
      if (!p) continue;
      const Ls = p.list;
      let empty = true;
      for (let i = Ls.indexOf(A) + 1; i < Ls.length && !isStep(Ls[i]) && Ls[i].t !== 'stop'; i++) {
        const g = Ls[i];
        if (g.t !== 'text' || g.raw.replace(/%[^\n]*/g, '').trim()) { empty = false; break; }
      }
      if (!empty) continue;
      const ux = Math.cos((a.ang * Math.PI) / 180), uy = -Math.sin((a.ang * Math.PI) / 180);
      const w = 3.2 * C.EM, h = 2 * C.EM, reach = P.aoff + Math.abs(ux) * w / 2 + Math.abs(uy) * h / 2;
      const cx = a.x2 + ux * reach, cy = a.y2 + uy * reach;
      out.push({ A, x: cx - w / 2, y: cy - h / 2, w, h, cx, cy });
    }
    return out;
  }
  const ARMS_MOL = /^[arg]:/;
  function tailAt(e: any) {
    const [x, y] = pos(e), k = E.view.k;
    for (const f of tails()) { const [X, Y] = S(f.x, f.y); if (x >= X && x <= X + f.w * k && y >= Y && y <= Y + f.h * k) return f; }
    return null;
  }
  // a molecule set right after the arrow
  function addAfterArrow(A: any, code: string) {
    const Ls = listOf(A), m = newMol(code), i = Ls.indexOf(A) + 1, end = Ls[i] && !blank(Ls[i]);
    Ls.splice(i, 0, T('\n  '), m, ...(end ? [T('\n')] : []));
    E.M.dirty = true;
    return m;
  }
  // a molecule typed after an arrow, taken out again with the line breaks it came with
  function dropMol(m: any) {
    const Ls = listOf(m), i = Ls.indexOf(m);
    if (i < 0) return;
    const a = blank(Ls[i - 1]) ? i - 1 : i, b = blank(Ls[i + 1]) && Ls[i + 2] && !blank(Ls[i + 2]) && Ls[i + 1].raw === '\n' ? i + 1 : i;
    Ls.splice(a, b - a + 1);
    E.M.dirty = true;
  }
  // type the compound's chemfig code in place: H_2O, CH_3-CH_2-OH…
  function editTail(f: any) {
    if (!TD.input) return false;
    closeLabel();
    begin();
    const me: any = (Lb = {}), A = f.A, spot = [f.cx, f.y + f.h]; // under the box, so the compound shows as it is typed
    me.tail = A;
    me.pop = TD.input.popup(stage, {
      text: '', math: false,
      placeholder: t('editor.cf.compoundPh', 'chemfig code, e.g. {example}', { example: 'CH_3-OH' }), label: t('editor.cf.compoundLabel', 'Next compound'),
      at: () => { const [X, Y] = S(spot[0], spot[1]), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + X, vr.top - sr.top + Y + 8]; },
      onInput: (tx: any) => {
        const code = String(tx || '').replace(/\s*\n\s*/g, ' ').trim();
        if (me.m) dropMol(me.m);
        me.m = code ? addAfterArrow(A, code) : null;
        L = null; draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); keepInView(); },
    });
    draw();
    return true;
  }

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'cfModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, CfeditorFrame);
  document.body.appendChild(root);
  const svg = $('.cf-svg', root), stage = $('.cz-stage', root), pal = editorPalette(root, { placeholder: message('editor.commonA.search', 'Search'), searchLabel: message('editor.commonA.searchPalette', 'Search the palette'), label: message('editor.commonA.elements', 'Elements'), listClass: 'cf-list', onpick: (k) => pick(k) }), list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- state
  // { M, sel: { v: key } | { b: bond item } | { a: arrow seg } | null, arm, bond (kind new bonds get), view: { k, ox, oy }, undo, redo, pending, start, done, drag, hover }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  const snapCode = () => (E.typed = keepComments(E.typed, codeOf(E.M))); // the drawing's code, keeping the comments last written
  const { begin, commit, undo, redo } = TD.editorSession.history({
    state: () => E, snapshot: () => snapCode(), restore: (v: string) => restore(v), updateTools: () => updateTools(), changed: () => dock.changed(),
  });
  function edit(fn: any) { begin(); const r = fn(); L = null; commit(); clampSel(); draw(); renderProps(); return r; }
  function restore(code: any) { E.typed = code; E.M = load(code); L = null; E.sel = null; draw(); renderProps(); updateTools(); }
  function clampSel() { if (E.sel && !selV() && !selB() && !selA() && !selM()) E.sel = null; }

  // ---------------------------------------------------------------- palette
  function buildPalette() {
    pal.render(PAL.map(([title, items]: any) => ({
      id: title, title: catName(title),
      // the shown name, the English one and the category's find it
      items: items.map(([k, name, , key]: any) => ({ id: k, label: say(name), key, alt: name, keywords: `${k.slice(2)} ${title} ${catName(title)}`, svg: fitMini(TD.chemMini(ITEM[k].mini), 60, 36, 1.4), on: !!E && k === `b:${E.bond}` })),
    })), { armed: E?.arm });
  }
  // a click picks the item (see pick); dragging it drops it onto the atom or bond under the pointer
  const endPalDrag = (d: PaletteDrag, e: PointerEvent | null) => {
    E.ghost = null; E.hover = null; E.hoverTail = null; d.btn.classList.remove('cf-dragging');
    setTip('');
    const to = e && overStage(e) ? dropAt(e, d.k) : null;
    if (to) drop2(d.k, to); else draw();
  };
  paletteDrag(list, {
    keyboard: true,
    ready: () => !!E,
    drags: (k) => k !== 's:move', // a curved arrow is drawn atom to atom: it is clicked, not dropped
    pick,
    start: (d) => { E.ghost = d.k; d.btn.classList.add('cf-dragging'); },
    move: (d, e) => {
      const to = dropAt(e, d.k), h = to && to.v ? { v: vkey(to.v) } : to && to.b ? { b: to.b.item } : null, ht = to && to.tail ? to.tail.A : null;
      if ((h && h.v) !== (E.hover && E.hover.v) || (h && h.b) !== (E.hover && E.hover.b) || ht !== E.hoverTail) { E.hover = h; E.hoverTail = ht; draw(); }
      setTip(overStage(e) ? dropTip(d.k, to) : '');
    },
    drop: endPalDrag,
    cancel: (d) => endPalDrag(d, null),
  });
  // what an item dragged from the palette lands on: { v } an atom, { b } a bond, { at: true } the drawing as a whole
  function dropAt(e: any, k: any): any {
    if (!overStage(e)) return null;
    const kind = k[0], v = vertexAt(e, 12), b = v ? null : bondAt(e, 8);
    if (kind === 's') return v ? { v, at: true } : b ? { b, at: true } : { at: true };
    if (v) return { v };
    if (b && (kind === 'b' || kind === 'r') && !b.hook) return { b };
    if (kind === 'a' || kind === 'r' || kind === 'g') {
      if (lay().empty) return { at: true };
      const f = tailAt(e);
      if (f) return { tail: f };
    }
    return null;
  }
  function dropTip(k: any, to: any) {
    const name = say(ITEM[k].name);
    if (!to) return k[0] === 'b' || k[0] === 'r' ? t('editor.cf.tip.dropBond', '{name}: drop it on an atom or a bond', { name }) : t('editor.cf.tip.dropAtom', '{name}: drop it on an atom', { name });
    return '';
  }
  function drop2(k: any, to: any) {
    if (k[0] === 's') {
      // a reaction step goes after the molecule it is dropped on
      const m = to.v || to.b;
      E.sel = m ? (to.v ? { v: vkey(to.v) } : { b: to.b.item }) : null;
      apply(k, null);
      return;
    }
    if (to.at) { apply(k, null); return; }
    if (to.tail) { if (!apply(k, to)) draw(); return; }
    E.arm = null;
    if (apply(k, to.v ? { v: to.v } : { b: to.b })) buildPalette();
    else draw();
  }
  // a palette item acts on the selection; with nothing selected it is armed, to click onto an atom or bond
  function pick(k: any) {
    const kind = k[0], val = k.slice(2);
    if (kind === 'b') { E.bond = val; buildPalette(); }
    if (kind === 's' && val === 'move') {
      E.arm = E.arm === k ? null : k; E.mvFrom = null;
      buildPalette(); draw();
      setTip(E.arm ? t('editor.cf.tip.moveFrom', 'Curved arrow: click the atom or bond it starts from. Esc to stop.') : '');
      return;
    }
    if (kind === 's') { apply(k, null); return; }
    const v = selV(), b = selB();
    if ((v || b) && apply(k, v ? { v } : { b })) { E.arm = null; buildPalette(); return; }
    if (lay().empty && (kind === 'a' || kind === 'r' || kind === 'g')) { apply(k, null); return; }
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    const name = say(ITEM[k].name);
    const box = E.arm && ARMS_MOL.test(k) && tails().length;
    setTip(E.arm ? (kind === 'b' ? t('editor.cf.tip.armBond', '{name}: click an atom or a bond. Esc when done.', { name })
      : kind === 'r' ? (box ? t('editor.cf.tip.armBondBox', '{name}: click an atom, a bond or the dashed box after an arrow. Esc when done.', { name }) : t('editor.cf.tip.armBond', '{name}: click an atom or a bond. Esc when done.', { name }))
      : box ? t('editor.cf.tip.armBox', '{name}: click an atom or the dashed box after an arrow. Esc when done.', { name }) : t('editor.cf.tip.arm', '{name}: click an atom. Esc when done.', { name })) : kind === 'b' ? t('editor.cf.tip.newBonds', '{name}: new bonds are of this kind', { name }) : '');
  }
  // what a palette item does to an atom ({ v }), a bond ({ b }) or the drawing (null); false: nothing
  function apply(k: any, on: any) {
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
    if (!on || on.tail) {
      // an empty drawing, or the box after an arrow: start a molecule
      const code = kind === 'a' ? val || '' : kind === 'r' ? RINGS[val] : kind === 'g' ? GROUPS[val](0) : '';
      if (!code) return false;
      edit(() => { if (on) addAfterArrow(on.tail.A, code); else { E.M.segs.push(newMol(code)); E.M.dirty = true; } });
      if (on) { E.arm = null; buildPalette(); }
      E.sel = null; keepInView(); draw(); renderProps();
      return true;
    }
    const v = on.v, b = on.b;
    if (b) {
      if (kind === 'b') { if (b.hook) return false; edit(() => { b.item.sym = val; b.item.dirty = true; if (hidden(b.item)) setHidden(b.item, false); touch(b.mol); }); return true; }
      if (kind === 'r') {
        // fused onto this side of a ring: the new ring shares it
        if (!b.ring || !b.item.parent || b.item.pidx < 1) { setTip(b.ring ? t('editor.cf.tip.fuseOther', 'Fuse a ring onto another side: this one starts its ring') : t('editor.cf.tip.fuse', "Rings fuse onto a ring's side; pick an atom to attach a ring with a bond")); return false; }
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
      if (!v.g || !atomsOf(v)) { setTip(t('editor.cf.tip.charges', 'Charges go on a labelled atom: give it a label first')); return false; }
      let ok = false;
      edit(() => {
        if (val === 'plus' || val === 'minus') { const s = val === 'plus' ? '+' : '-', cur = signOf((atomsOf(v) || [])[v.k]); ok = setSign(v, cur === s ? '' : s); }
        else if (val === 'dplus' || val === 'dminus') { const s = val === 'dplus' ? '+' : '-', pc = partialOf(mainAtom(v)); ok = setPartial(v, pc && pc.sign === s ? '' : s, pc ? pc.c.angle : freeSpot(v)); }
        else ok = toggleDecor(v, ({ pair: '\\:', bar: '\\|', rad: '\\.' } as Record<string, any>)[val], freeSpot(v));
      });
      reselect(v);
      return ok;
    }
    return false;
  }
  // after an edit the vertex object is new: find it again by what it holds
  function reselect(v: any) { const key = v.g || v.inBond || v.mol; L = null; const nv = lay().verts.find((x: any) => vkey(x) === key) || (v.inBond && lay().verts.find((x: any) => x.inBond === v.inBond)) || (!v.inBond && lay().verts.find((x: any) => x.mol === v.mol && x.root)); E.sel = nv ? { v: vkey(nv) } : null; draw(); renderProps(); }
  function addBondAt(v: any, angle: any, sym: any) {
    let nb: any;
    edit(() => { nb = grow(v, angle, sym, []); });
    L = null;
    const nv = lay().verts.find((x: any) => x.inBond === nb);
    E.sel = nv ? { v: vkey(nv) } : { b: nb };
    draw(); renderProps(); keepInView();
  }
  function setTip(t: any) { stageNote.set(t); }

  // ---------------------------------------------------------------- geometry
  // the pointer on the stage, and the wheel's pan and zoom: src/editors/editor-stage.ts
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [0.3, 12], redraw: () => { draw(); if (Lb) Lb.pop.place(); } });
  const S = (x: any, y: any) => [E.view.ox + x * E.view.k, E.view.oy + y * E.view.k];
  const D = (X: any, Y: any) => [(X - E.view.ox) / E.view.k, (Y - E.view.oy) / E.view.k];
  function vRadius(v: any) { const b = v.boxes[v.k]; return b && !b.empty ? Math.max(b.w, b.asc + b.desc) / 2 * E.view.k + 3 : 6; }
  function vertexAt(e: any, px = 8) {
    const [x, y] = pos(e);
    let best = null, bd = Infinity;
    for (const v of lay().verts) {
      if (v.sub) continue; // drawn from a \definesubmol: edited in its definition, not here
      const [X, Y] = S(v.X, v.Y), d = Math.hypot(X - x, Y - y);
      if (d <= Math.max(px, vRadius(v)) && d < bd) { bd = d; best = v; }
    }
    return best;
  }
  const segDist = (x: any, y: any, ax: any, ay: any, bx: any, by: any) => { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / l2)); return Math.hypot(ax + dx * t - x, ay + dy * t - y); };
  function bondAt(e: any, px = 6) {
    const [x, y] = pos(e);
    let best = null, bd = px;
    for (const b of lay().bonds) {
      if (b.hook || b.sub) continue;
      const [ax, ay] = S(b.X0, b.Y0), [bx, by] = S(b.X1, b.Y1), d = segDist(x, y, ax, ay, bx, by);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  function arrowAt(e: any, px = 8) {
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
  function moveAt(e: any, px = 6) {
    const [x, y] = pos(e);
    let best = null, bd = px;
    for (const mv of lay().moves || []) {
      const P = movePts(mv, 12).map((q) => S(q[0], q[1]));
      for (let i = 1; i < P.length; i++) { const d = segDist(x, y, P[i - 1][0], P[i - 1][1], P[i][0], P[i][1]); if (d < bd) { bd = d; best = mv; } }
    }
    return best;
  }
  // what the stage shows: the drawing and the dashed boxes round it (names and compounds to come)
  function shownBox() {
    const Lo = lay();
    let x1 = Lo.bb.x, y1 = Lo.bb.y, x2 = x1 + Lo.bb.w, y2 = y1 + Lo.bb.h;
    for (const f of [...tails(), ...phantoms()]) { x1 = Math.min(x1, f.x); y1 = Math.min(y1, f.y); x2 = Math.max(x2, f.x + f.w); y2 = Math.max(y2, f.y + f.h); }
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function fit() {
    const Lo = lay();
    E.view = fitView(rect(), Lo.empty ? { x: -40, y: -30, w: 80, h: 60 } : shownBox(), { pad: 120, min: 0.5, max: 4 });
    draw();
  }
  // the view stays put unless the drawing has grown out of it
  function keepInView() {
    const Lo = lay(), r = rect();
    if (Lo.empty) return;
    const bb = shownBox(), [x1, y1] = S(bb.x, bb.y), [x2, y2] = S(bb.x + bb.w, bb.y + bb.h);
    if (x1 >= 8 && y1 >= 8 && x2 <= r.width - 8 && y2 <= r.height - 8) return;
    // pan if it fits at this zoom, else fit
    if (x2 - x1 > r.width - 48 || y2 - y1 > r.height - 48) { fit(); return; }
    E.view.ox += x1 < 24 ? 24 - x1 : x2 > r.width - 24 ? r.width - 24 - x2 : 0;
    E.view.oy += y1 < 24 ? 24 - y1 : y2 > r.height - 24 ? r.height - 24 - y2 : 0;
    draw();
  }

  // ---------------------------------------------------------------- drawing
  const SNAP = 15;
  function draw() {
    if (!E) return;
    syncCode();
    const r = rect(), W = r.width, H = r.height, v = E.view, k = v.k;
    const Lo = lay();
    // a grid for the eye: chemfig has no coordinates, so nothing snaps to it
    const step = TD.PX_PER_CM * 0.25 * k >= 7 ? TD.PX_PER_CM * 0.25 : TD.PX_PER_CM;
    let minor = '', major = '';
    const xs = Math.floor(-v.ox / k / step), xe = Math.ceil((W - v.ox) / k / step), ys = Math.floor(-v.oy / k / step), ye = Math.ceil((H - v.oy) / k / step);
    for (let i = xs; i <= xe; i++) { const X = Math.round(v.ox + i * step * k) + 0.5, maj = Math.abs(((i * step) / TD.PX_PER_CM) % 1) < 1e-6; if (maj) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`; }
    for (let j = ys; j <= ye; j++) { const Y = Math.round(v.oy + j * step * k) + 0.5, maj = Math.abs(((j * step) / TD.PX_PER_CM) % 1) < 1e-6; if (maj) major += `M0,${Y}H${W}`; else minor += `M0,${Y}H${W}`; }
    let grid = '';
    if (E.grid === 'grid') grid = `<g class="cf-grid" data-grid="grid"><path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/></g>`;
    else if (E.grid !== 'off') {
      const iso = E.grid.startsWith('isometric'), dots = E.grid === 'dot' || E.grid === 'isometric-dot';
      // Both isometric styles use identical lattice size and zoom thinning.
      let side = iso ? (Lo.P?.sep || SEP) * k : step * k;
      while (side < 14) side *= 2;
      const w = iso ? Math.sqrt(3) * side : side, h = side;
      const atom = Lo.verts[0], ox = v.ox + (atom?.X || 0) * k, oy = v.oy + (atom?.Y || 0) * k;
      const marks = dots
        ? `<circle cx="${r2(w / 4)}" cy="${r2(h / 4)}" r="1.2" class="grid-dot"/>${iso ? `<circle cx="${r2(3 * w / 4)}" cy="${r2(3 * h / 4)}" r="1.2" class="grid-dot"/>` : ''}`
        : `<path d="M0,0L${r2(w)},${r2(h)}M0,${r2(h)}L${r2(w)},0M0,0V${r2(h)}M${r2(w / 2)},0V${r2(h)}" class="cz-gmin"/>`;
      grid = `<defs><pattern id="cf-isometric-grid" patternUnits="userSpaceOnUse" x="${r2(ox - (dots ? w / 4 : 0))}" y="${r2(oy - (dots ? h / 4 : 0))}" width="${r2(w)}" height="${r2(h)}">${marks}</pattern></defs><rect class="cf-grid" data-grid="${E.grid}" width="${W}" height="${H}" fill="url(#cf-isometric-grid)" pointer-events="none"/>`;
    }
    let out = `<rect width="${W}" height="${H}" class="cz-bg"/>${grid}`;
    const sb = selB(), sa = selA(), sv = selV(), sm = selM();
    const tr = `transform="translate(${r2(v.ox)},${r2(v.oy)}) scale(${k})"`;
    if (sb) out += `<g ${tr}><path class="ze-wsel" d="M${r2(sb.X0)},${r2(sb.Y0)}L${r2(sb.X1)},${r2(sb.Y1)}" stroke-width="${r2(10 / k)}"/></g>`;
    if (sa) out += `<g ${tr}><path class="ze-wsel" d="M${r2(sa.x1)},${r2(sa.y1)}L${r2(sa.x2)},${r2(sa.y2)}" stroke-width="${r2(12 / k)}"/></g>`;
    if (sm) out += `<g ${tr}><path class="ze-wsel" d="${moveD(sm)}" stroke-width="${r2(10 / k)}"/></g>`;
    // a curved arrow's start, picked: marked until its end is picked
    const mf = E.arm === 's:move' && E.mvFrom;
    if (mf && mf.b) { const fb = Lo.bonds.find((x: any) => x.item === mf.b); if (fb) out += `<g ${tr}><path class="ze-wsel" d="M${r2(fb.X0)},${r2(fb.Y0)}L${r2(fb.X1)},${r2(fb.Y1)}" stroke-width="${r2(10 / k)}"/></g>`; }
    if (E.hover && E.hover.b && (!sb || E.hover.b !== sb.item) && !E.drag) { const hb = Lo.bonds.find((b: any) => b.item === E.hover.b); if (hb) out += `<g ${tr}><path class="cf-bhov" d="M${r2(hb.X0)},${r2(hb.Y0)}L${r2(hb.X1)},${r2(hb.Y1)}" stroke-width="${r2(8 / k)}"/></g>`; }
    if (!Lo.empty) out += `<g ${tr}>${C.draw({ type: 'chemfig', x: Lo.bb.x, y: Lo.bb.y, src: '', color: INK }, { paper: PAPER, export: true }, Lo)}</g>`;
    else out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2)}">${esc(t('editor.cf.empty', 'Pick an atom, a ring or a group on the left to start'))}</text>`;
    // names to be: a dashed box where a compound's \chemname would go (not while its name is being typed)
    if (showPhantoms() && !Lo.empty) for (const f of phantoms()) {
      if (Lb && Lb.mol === f.mol) continue;
      const [X, Y] = S(f.x, f.y), w = f.w * k, h = f.h * k, on = E.hoverName === f.mol;
      out += `<rect class="cf-phantom${on ? ' on' : ''}" x="${r2(X)}" y="${r2(Y)}" width="${r2(w)}" height="${r2(h)}" rx="3"/>`;
      if (w >= 34) out += `<text class="cf-phantom-t${on ? ' on' : ''}" x="${r2(X + w / 2)}" y="${r2(Y + h / 2)}">${esc(t('editor.cf.namePhantom', 'Name'))}</text>`;
    }
    // compounds to be: a dashed box after an arrow with nothing after it (also while an atom, ring or group is placed)
    if (!E.drag && !Lo.empty && (E.arm || E.ghost ? ARMS_MOL.test(E.arm || E.ghost) : true)) for (const f of tails()) {
      if (Lb && Lb.tail === f.A) continue;
      const [X, Y] = S(f.x, f.y), w = f.w * k, h = f.h * k, on = E.hoverTail === f.A;
      out += `<rect class="cf-phantom cf-tail${on ? ' on' : ''}" x="${r2(X)}" y="${r2(Y)}" width="${r2(w)}" height="${r2(h)}" rx="3"/>`;
      if (w >= 50) out += `<text class="cf-phantom-t${on ? ' on' : ''}" x="${r2(X + w / 2)}" y="${r2(Y + h / 2)}">${esc(t('editor.cf.compoundPhantom', 'Compound'))}</text>`;
    }
    // bonds kept but not drawn (draw=none): dashed, so they can be picked and drawn again
    const ghosts = Lo.bonds.filter((b: any) => !b.hook && !b.sub && hidden(b.item));
    if (ghosts.length) out += `<path class="cf-hidden" d="${ghosts.map((b: any) => { const [x0, y0] = S(b.X0, b.Y0), [x1, y1] = S(b.X1, b.Y1); return `M${r2(x0)},${r2(y0)}L${r2(x1)},${r2(y1)}`; }).join('')}"/>`;
    // atoms: a point on each bare vertex, rings round the selected and hovered ones
    for (const vx of Lo.verts) {
      const [X, Y] = S(vx.X, vx.Y), rr = vRadius(vx);
      const key = vkey(vx);
      if ((sv && vkey(sv) === key) || (mf && mf.v === key)) out += `<circle class="fy-vsel" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
      else if (((E.drag && E.drag.mode === 'grow') || E.ghost) && E.hover && E.hover.v === key) out += `<circle class="fy-vtarget" cx="${r2(X)}" cy="${r2(Y)}" r="${r2(rr + 1)}"/>`;
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
      out += `<g class="ze-knob ze-ahead"><title>${esc(t('editor.cf.knob.arrow', 'Drag to turn and stretch the arrow'))}</title><circle cx="${r2(hx)}" cy="${r2(hy)}" r="5.5"/></g>`;
    }
    // the selected curved arrow's control points, on lines from the atoms they pull away from
    if (sm) for (const h of mctls(sm)) {
      const [ax, ay] = S(h.ax, h.ay), [cx, cy] = S(h.cx, h.cy);
      out += `<path class="ze-draft" d="M${r2(ax)},${r2(ay)}L${r2(cx)},${r2(cy)}"/><g class="ze-knob ze-mctl" data-i="${h.i}"><title>${esc(t('editor.cf.knob.bend', 'Drag to bend the arrow'))}</title><circle cx="${r2(cx)}" cy="${r2(cy)}" r="5.5"/></g>`;
    }
    // the handle on the selected (or hovered) atom: drag it out for a new bond
    const kvx = !E.drag && !E.arm && !E.ghost && (E.knobAt ? findV(E.knobAt) : sv);
    E.knobPos = null;
    if (kvx) {
      const ang = freeAngle(kvx), [X, Y] = S(kvx.X, kvx.Y), off = vRadius(kvx) + 12;
      const kx = r2(X + off * Math.cos((ang * Math.PI) / 180)), ky = r2(Y - off * Math.sin((ang * Math.PI) / 180));
      E.knobPos = { v: vkey(kvx), X, Y, kx, ky, ang };
      out += `<g class="ze-knob"><title>${esc(t('editor.cf.knob.bond', 'Drag out a {kind} bond; click for one at {deg}°', { kind: bondNames()[E.bond].toLowerCase(), deg: Math.round(ang) }))}</title><circle cx="${kx}" cy="${ky}" r="6"/><path d="M${kx - 3},${ky}h6M${kx},${ky - 3}v6"/></g>`;
    }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  // angle from a point to the pointer, snapped to 15° (⌥ for any)
  function aimAt(fx: any, fy: any, e: any) {
    const [x, y] = D(...(pos(e) as [any, any]));
    let a = C.norm360((Math.atan2(-(y - fy), x - fx) * 180) / Math.PI);
    if (!e.altKey) a = C.norm360(Math.round(a / SNAP) * SNAP);
    return a;
  }
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    closeMenu();
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
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
    if (kb && E.knobPos) { const v = findV(E.knobPos.v); E.drag = { mode: 'grow', v: E.knobPos.v, sep: v.sep || SEP, fx: v.X, fy: v.Y, tx: v.X, ty: v.Y, sx, sy, moved: false, ang: E.knobPos.ang }; E.knobAt = null; return; }
    const v = vertexAt(e), mv = v ? null : moveAt(e, 5), b = v || mv ? null : bondAt(e), a = v || b || mv ? null : arrowAt(e);
    if (E.arm === 's:move') {
      const vb = !mv && v ? v : null, bb = vertexAt(e) ? null : bondAt(e);
      const to = vb && vb.g && (atomsOf(vb) || []).length ? { v: vkey(vb) } : !vb && bb && !bb.hook && bb.item && bb.item.t === 'bond' ? { b: bb.item } : null;
      if (!to) { setTip(t('editor.cf.tip.moveEnds', 'Curved arrows go from and to a labelled atom or a bond. Esc to stop.')); return; }
      if (!E.mvFrom) { E.mvFrom = to; setTip(t('editor.cf.tip.moveTo', 'Curved arrow: now click the atom or bond it goes to')); draw(); return; }
      if ((to.v && to.v === E.mvFrom.v) || (to.b && to.b === E.mvFrom.b)) return;
      const from = E.mvFrom;
      let seg = null;
      E.mvFrom = null; E.arm = null; E.ptr = null;
      edit(() => { seg = addMove(from, to); });
      buildPalette(); setTip('');
      E.sel = seg ? { m: { seg, k: 0 } } : null;
      draw(); renderProps(); keepInView();
      return;
    }
    if (E.arm) {
      if (v || b) { const k = E.arm; apply(k, v ? { v } : { b }); return; }
      if (lay().empty) { apply(E.arm, null); return; }
      const f = tailAt(e);
      if (f && apply(E.arm, { tail: f })) return;
    }
    if (v) {
      const key = vkey(v);
      if (dbl && E.sel && E.sel.v === key) { editLabel(v); return; }
      E.sel = { v: key };
      const ib = v.inBond && lay().bonds.find((x: any) => x.item === v.inBond);
      E.drag = { mode: 'move', v: key, sx, sy, moved: false, bond: ib && !ib.ring ? ib : null };
      draw(); renderProps(); return;
    }
    if (b) { if (dbl && E.sel && E.sel.b === b.item) { cycleBond(b); return; } E.sel = { b: b.item }; E.drag = null; draw(); renderProps(); return; }
    if (mv) { E.sel = { m: { seg: mv.seg, k: mv.k } }; E.drag = null; draw(); renderProps(); return; }
    if (a) { if (dbl && E.sel && E.sel.a === a.seg) { editArrowLabel(a, 0); return; } E.sel = { a: a.seg }; E.drag = null; draw(); renderProps(); return; }
    // the dashed boxes are typed into with one click; a name already there, with two (one click on it does nothing)
    if (!E.arm) {
      const f = tailAt(e);
      if (f && editTail(f)) return;
      const nm = nameAt(e);
      if (nm && (dbl || nm.w != null) && editName(nm.mol)) return;
    }
    E.sel = null; E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy, idle: true }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
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
      svg.style.cursor = E.arm ? '' : kb ? (kb.matches('.ze-ahead, .ze-mctl') ? 'move' : 'crosshair') : v ? (v.inBond && !v.inRing ? 'move' : 'default') : b || arrowAt(e) || moveAt(e, 5) ? 'pointer' : nameAt(e) || tailAt(e) ? 'text' : '';
      const nh = !E.arm && !v && !b ? nameAt(e) : null, nmol = nh ? nh.mol : null;
      const th = !v && !b && (!E.arm || ARMS_MOL.test(E.arm)) ? tailAt(e) : null, tA = th ? th.A : null;
      if (nmol !== E.hoverName || tA !== E.hoverTail) { E.hoverName = nmol; E.hoverTail = tA; draw(); }
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
      setTip(`${t('editor.cf.tip.arrowAt', 'Arrow at {deg}°, {n} × compound sep', { deg: Math.round(ang), n: num(co) })}${e.altKey ? '' : anyAngle()}`);
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
      setTip(`${d.i === 1 ? t('editor.cf.tip.leaves', 'Leaves at {deg}°, pulled {r} cm', { deg: Math.round(ang), r: num(r) }) : t('editor.cf.tip.arrives', 'Arrives at {deg}°, pulled {r} cm', { deg: Math.round(ang), r: num(r) })}${e.altKey ? '' : anyAngle()}`);
      draw(); return;
    }
    if (d.mode === 'grow') {
      if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 4) return;
      d.moved = true;
      d.ang = aimAt(d.fx, d.fy, e);
      d.tx = d.fx + d.sep * Math.cos((d.ang * Math.PI) / 180); d.ty = d.fy - d.sep * Math.sin((d.ang * Math.PI) / 180);
      setTip(`${t('editor.cf.tip.kindAt', '{kind} bond at {deg}°', { kind: bondNames()[E.bond], deg: Math.round(d.ang) })}${e.altKey ? '' : anyAngle()}`);
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
      // in the molecule's own atom sep (a length set with atom sep=6em counts in 6em), as the code writes it
      const sep = b.sep || SEP;
      d.len = Math.max(0.25, Math.round((Math.hypot(x - fx, y - fy) / sep) * 4) / 4);
      d.tx = fx + d.len * sep * Math.cos((d.ang * Math.PI) / 180); d.ty = fy - d.len * sep * Math.sin((d.ang * Math.PI) / 180);
      setTip(`${t('editor.cf.tip.bondAt', 'Bond at {deg}°, {n} × atom sep', { deg: Math.round(d.ang), n: num(d.len) })}${e.altKey ? '' : anyAngle()}`);
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
  function reselectKey(key: any) { L = null; E.sel = findV(key) ? { v: key } : null; draw(); renderProps(); }
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && (E.hover || E.knobAt || E.ptr)) { E.hover = null; E.knobAt = null; E.ptr = null; draw(); } });
  // double-clicking a bond steps it single → double → triple
  function cycleBond(b: any) { const next = ({ '-': '=', '=': '~', '~': '-' } as Record<string, any>)[b.item.sym] || '-'; edit(() => { if (hidden(b.item)) setHidden(b.item, false); else b.item.sym = next; b.item.dirty = true; touch(b.mol); }); }

  // right-click: the atom's, bond's or arrow's actions
  // the menu rows' icons (src/ui/kit/icons.ts)
  const MI: Record<string, IconName> = { label: 'edit', del: 'delete', one: 'straight', two: 'bondDouble', three: 'bondTriple', wedge: 'bondWedge', hash: 'bondHash', flip: 'reverse', show: 'show', hide: 'hide' };
  const mItem = (act: string, label: string, icon: string, key?: string) => menuRow(act, label, MI[icon], key, { danger: /del/.test(act) });
  const closeMenu = closeEditorMenu;
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    let menuRows: MenuEntry[] = [];
    if (!E) return;
    const v = vertexAt(e), mv = v ? null : moveAt(e, 5), b = v || mv ? null : bondAt(e), a = v || b || mv ? null : arrowAt(e);
    const sch = inScheme();
    if (mv) {
      E.sel = { m: { seg: mv.seg, k: mv.k } };
      menuRows = [mItem('mvdel', t('editor.cf.deleteCurved', 'Delete Curved Arrow'), 'del', '⌫')];
    } else if (v) {
      E.sel = { v: vkey(v) };
      menuRows = [mItem('label', t('ctx.editLabel', 'Edit Label'), 'label', '↩'), '-', mItem('vdel', delVertex(v), 'del', '⌫'), ...(v.inRing ? [mItem('rdel', t('editor.cf.deleteRing', 'Delete Ring'), 'del')] : []), ...(sch && v.inBond ? [mItem('mdel', t('editor.cf.deleteMolecule', 'Delete Molecule'), 'del')] : [])];
    } else if (b) {
      E.sel = { b: b.item };
      const bn = bondNames();
      menuRows = [mItem('b:-', bn['-'], 'one', '1'), mItem('b:=', bn['='], 'two', '2'), mItem('b:~', bn['~'], 'three', '3'), mItem('b:>', bn['>'], 'wedge'), mItem('b:>:', bn['>:'], 'hash'), ...(/^[<>]/.test(b.item.sym) ? [mItem('bflip', t('editor.cf.reverseWedge', 'Reverse Wedge'), 'flip')] : []), '-', ...(b.hook ? [] : [...(hidden(b.item) ? [mItem('bshow', t('editor.cf.showBond', 'Show Bond'), 'show')] : [mItem('bhide', t('editor.cf.hideBond', 'Hide Bond'), 'hide')])]), ...(hidden(b.item) && b.ring ? [] : [mItem('bdel', t('editor.cf.deleteBond', 'Delete Bond'), 'del', '⌫')]), ...(b.ring ? [mItem('rdel', t('editor.cf.deleteRing', 'Delete Ring'), 'del')] : []), ...(sch ? [mItem('mdel', t('editor.cf.deleteMolecule', 'Delete Molecule'), 'del')] : [])];
    } else if (a) {
      E.sel = { a: a.seg };
      menuRows = [mItem('alabel', t('editor.cf.editConditions', 'Edit Conditions'), 'label', '↩'), '-', mItem('adel', a.seg.t === 'merge' ? t('editor.cf.deleteMerge', 'Delete Merge') : t('editor.cf.deleteArrow', 'Delete Arrow'), 'del', '⌫')];
    } else { closeMenu(); return; }
    draw(); renderProps();
    openEditorMenu(e, menuRows, pickMenu);
  });
  function pickMenu(a: string) {
    act(a);
  }

  // ---------------------------------------------------------------- label editors
  // A floating box under the atom (or arrow); the whole edit is one undo step.
  let Lb: any = null;
  function editLabel(v: any) {
    if (!TD.input) return false;
    closeLabel();
    begin();
    let cur = v;
    const key0 = vkey(v);
    const me: any = (Lb = {});
    me.pop = TD.input.popup(stage, {
      text: v.g ? v.g.raw.trim() : '', math: true,
      at: () => { const w = findV(vkey(cur)) || cur, [X, Y] = S(w.X, w.Y), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + X, vr.top - sr.top + Y + vRadius(w) + 8]; },
      onInput: (t: any) => {
        const w = findV(vkey(cur)) || cur;
        setLabel(w, t); L = null;
        cur = lay().verts.find((x: any) => (w.g && x.g === w.g) || (w.inBond && x.inBond === w.inBond) || (!w.g && !w.inBond && x.mol === w.mol && x.root)) || cur;
        E.sel = { v: vkey(cur) };
        draw(); renderProps();
      },
      onDone: () => { if (Lb === me) Lb = null; commit(); L = null; if (!findV(E.sel && E.sel.v)) E.sel = findV(key0) ? { v: key0 } : null; draw(); renderProps(); },
    });
    return true;
  }
  function editArrowLabel(a: any, which: any) {
    if (!TD.input) return false;
    closeLabel();
    begin();
    const A = a.seg, me: any = (Lb = {});
    me.pop = TD.input.popup(stage, {
      text: C.labelLines(A.labels[which] || '').join('\n'), math: false,
      at: () => { const w = lay().arrows.find((x: any) => x.seg === A) || a, [X, Y] = S((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2), sr = stage.getBoundingClientRect(), vr = svg.getBoundingClientRect(); return [vr.left - sr.left + X, vr.top - sr.top + Y + 24]; },
      onInput: (t: any) => { setArrowLabel(A, which, t); L = null; draw(); renderProps(); },
      onDone: () => { if (Lb === me) Lb = null; commit(); draw(); renderProps(); },
    });
    return true;
  }
  const brk = (t: any) => (/[\][]/.test(t) && !/^\{[\s\S]*\}$/.test(t) ? `{${t}}` : t);
  // the label box's lines (Shift+Enter), or \\ typed in the panel, as other editors read them
  const panelLabel = (code: any) => C.labelLines(code || '').join(' \\\\ ');
  // an arrow's TikZ style: what follows its angle and length in \arrow{…}[angle,length,style]
  const arrowStyle = (A: any) => A.opt.slice(2).filter((x: any) => x && x.trim()).join(',');
  function setArrowStyle(A: any, st: string) { const o = A.opt.slice(0, 2); while (o.length < 2) o.push(''); A.opt = st ? [...o, st] : o; A.dirty = true; E.M.dirty = true; }
  function setArrowLabel(A: any, which: any, t: any) {
    const l = A.labels.slice();
    while (l.length < which) l.push('');
    const code = C.stackLines(String(t || '').split(/\n|\\\\/));
    l[which] = code ? brk(code) : '';
    A.labels = l; A.dirty = true; E.M.dirty = true;
  }
  function closeLabel() { if (Lb) Lb.pop.close(); }
  function focusField() { const f = $('[data-f]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- properties
  const delVertex = (v: any) => (shownLabel(v) && (v.inRing || bondsAt(v).length) ? t('editor.cf.deleteLabel', 'Delete Label') : bondsAt(v).length ? t('editor.cf.deleteAtom', 'Delete Atom') : t('editor.cf.deleteMolecule', 'Delete Molecule'));
  // the panel's delete buttons: the item's own, then its ring's
  const delRow = (own: any, ownText: any, ring: any): any => ({ kind: 'actions' as const, class: 'row', buttons: [...(own ? [{ text: ownText, attrs: { 'data-ce': own, class: 'danger' } }] : []), ...(ring ? [{ text: t('editor.cf.deleteRing', 'Delete Ring'), attrs: { 'data-ce': 'rdel', class: 'danger' } }] : [])] });
  const eg = (example: string) => t('editor.commonA.eg', 'e.g. {example}', { example });
  const noneEg = (example: string) => t('editor.cf.noneEg', 'none, e.g. {example}', { example });
  const selectField = (label: any, key: any, value: any, options: any) => row(label, { kind: 'select' as const, value, options, attrs: { 'data-f': key } });
  const chemicalNumber = (label: any, key: any, value: any, unit: any, attrs = {}) => numField(label, key, value == null ? '' : num(value), unit, attrs);
  const colourRow = (label: string, key: string, value: string) => ({ ...row(label, texColour(value, { 'data-f': key }, { nullable: true, defaultSwatch: TD.css('#000000'), title: label })), controlClass: 'ctl tc' });
  const lineKinds = () => [['solid', t('ui.solid', 'Solid')], ['dashed', t('ui.dashed', 'Dashed')], ['dotted', t('ui.dotted', 'Dotted')]];
  // which atom of a group a bond leaves from (its 3rd argument) and arrives at (its 4th): only for groups of
  // more than one atom, such as CH_2OH or HO
  function ends(b: any) {
    if (b.hook || b.sub) return [];
    const arg = b.item.arg || [], out: any[] = [];
    const pickRow = (label: string, key: string, v: any, k: number, val: any) => {
      const bx = (v && v.boxes) || [];
      if (bx.length < 2) return;
      const atom = (i: number) => `${i + 1} · ${String(bx[i].tex || '').trim() || '·'}`;
      out.push(selectField(label, key, val || '', [['', t('editor.cf.atomAuto', 'Automatic ({atom})', { atom: atom(Math.max(0, Math.min(bx.length - 1, k || 0))) })], ...bx.map((_: any, i: number) => [String(i + 1), atom(i)])]));
    };
    pickRow(t('editor.cf.leavesFrom', 'Leaves from'), 'bdep', b.a, b.ka, arg[2]);
    pickRow(t('editor.cf.arrivesAtAtom', 'Arrives at'), 'barr', b.b, b.kb, arg[3]);
    return out;
  }
  const on = (v: any) => (v && v !== 'false' ? 'true' : '');
  const offOn = () => [['', t('editor.cf.off', 'Off')], ['true', t('editor.cf.on', 'On')]];
  // arrow head=…: chemfig's own (-CF, the default), or TikZ's
  const HEADS = () => [['', t('editor.cf.headCF', 'chemfig (CF)')], ['-stealth', 'Stealth'], ['-latex', 'LaTeX'], ['->', t('editor.cf.headTo', 'Open (to)')]];
  const headOf = (v: any) => { const h = String(v || '').trim(); return /^-?cf$/i.test(h) || !h ? '' : /stealth/i.test(h) ? '-stealth' : /latex/i.test(h) ? '-latex' : '->'; };
  // nothing picked: the drawing's \setchemfig settings
  function settingsSections() {
    const S0 = settings(), legacy = C.modernize(codeOf(E.M)).changes.length > 0, named = (function has(L: any): boolean { return L.some((g: any) => g.t === 'name' || (g.inner && has(g.inner))); })(E.M.segs);
    const len = (label: string, key: string, dflt: string) => field(label, 'cf:' + key, S0[key] || '', { class: 'mono', placeholder: dflt, title: key });
    const bs = S0['bond style'] || '';
    const rows: any[] = [len(t('editor.cf.bondLength', 'Bond length'), 'atom sep', '3em'), len(t('editor.cf.doubleGap', 'Double gap'), 'double bond sep', '2pt'), len(t('editor.cf.wedgeWidth', 'Wedge width'), 'cram width', '1.5ex'),
      numField(t('editor.cf.angleStep', 'Angle step'), 'cf:angle increment', S0['angle increment'] || '', '°', { step: '15', min: '1', placeholder: '45', title: 'angle increment' }),
      segments(t('editor.cf.fixedLength', 'Fixed length'), 'cf:fixed length', on(S0['fixed length']), offOn()),
      note(t('editor.cf.help.fixed', 'Fixed length measures bonds between the edges of atoms, not their centres.')),
      len(t('editor.cf.hashWidth', 'Hash width'), 'cram dash width', '1pt'), len(t('editor.cf.hashGap', 'Hash gap'), 'cram dash sep', '2pt'),
      segments(t('editor.cf.squareWedges', 'Square hashes'), 'cf:cram rectangle', on(S0['cram rectangle']), offOn()),
      numField(t('editor.cf.circleSize', 'Ring circle'), 'cf:cycle radius coeff', S0['cycle radius coeff'] || '', '×', { step: '0.05', min: '0.05', placeholder: '0.75', title: 'cycle radius coeff' }),
      ...(legacy ? [note(t('editor.cf.help.legacy', 'Some settings use chemfig 1.x commands (such as {cmd}), which current chemfig stops on.', { cmd: '\\setatomsep' })), actionRow('ce', 'cfup', t('editor.cf.useSetchemfig', 'Update to Current chemfig'), false)] : [])];
    const bonds = [chemicalNumber(t('editor.cf.lineWidth', 'Line width'), 'cfb:width', widthOf(bs), 'pt', { step: '0.1', min: '0.1', placeholder: t('editor.cf.widthPh', 'default') }), colourRow(t('ui.colour', 'Colour'), 'cfb:colour', colourOf(bs)), segments(t('ui.line', 'Line'), 'cfb:dash', dashOf(bs), lineKinds()),
      note(t('editor.cf.help.allBonds', 'For every bond (bond style); a bond\'s own options win.'))];
    const as = S0['arrow style'] || '';
    const arrows = inScheme() ? [len(t('editor.cf.compoundGap', 'Spacing'), 'compound sep', '5em'), len(t('editor.cf.arrowGap', 'Arrow gap'), 'arrow offset', '1em'),
      selectField(t('editor.cf.arrowHead', 'Arrow head'), 'cf:arrow head', headOf(S0['arrow head']), HEADS()), colourRow(t('editor.cf.arrowColour', 'Arrow colour'), 'cfa:colour', colourOf(as)), segments(t('editor.cf.arrowLine', 'Arrow line'), 'cfa:dash', dashOf(as), lineKinds())] : [];
    const scheme = inScheme() || named ? [section(t('editor.cf.scheme', 'Scheme'), [...arrows, ...(named ? [len(t('editor.cf.nameGap', 'Name gap'), 'name sep', '1.5ex')] : [])], 'sec')] : [];
    return [section(t('editor.cf.drawing', 'Drawing'), rows, 'sec'), section(t('editor.cf.allBonds', 'All bonds'), bonds, 'sec'), ...scheme];
  }
  // a plain bond's line as drawn: its own (draw=none, dashed, dotted, solid) over the drawing's bond style
  const lineOf = (own: any, all: any) => (optList(own).some((x) => /^draw\s*=\s*none$/.test(x)) ? 'none' : optList(own).find((x) => DASH_RE.test(x)) || dashOf(all));
  // set it: what the bond writes is only what differs from the drawing (solid is written to undo a dashed bond style)
  function setLine(it: any, val: string) {
    const arg = (it.arg || []).slice();
    while (arg.length < 5) arg.push('');
    const rest = optList(arg[4]).filter((x) => !DASH_RE.test(x) && !/^draw\s*=\s*none$/.test(x)), all = dashOf(settings()['bond style'] || '');
    arg[4] = [...rest, ...(val === 'none' ? ['draw=none'] : val === 'solid' ? (all !== 'solid' ? ['solid'] : []) : val !== all ? [val] : [])].join(',');
    it.arg = arg; it.dirty = true;
  }
  // a molecule's own settings, \chemfig[key=value,…]{…}: chemfig sets wedge sizes per molecule or drawing, not per bond
  function molOpts(mol: any): Record<string, string> | null {
    const h = String(mol.head || ''), q = h.indexOf('[');
    if (/^\\chemfig\s*\*/.test(h)) return null;
    if (q < 0) return {};
    const e = C.close(h, q);
    if (e < 0 || h.indexOf('[', e + 1) >= 0) return null;
    const kv: Record<string, string> = {};
    for (const it of C.split(h.slice(q + 1, e))) { const m = /^\s*([^=]+?)\s*(?:=\s*([\s\S]*?))?\s*$/.exec(it); if (m && m[1]) kv[m[1]] = m[2] == null ? 'true' : C.unbrace(m[2]); }
    return kv;
  }
  function setMolOpt(mol: any, k: string, v: string) {
    const kv = molOpts(mol);
    if (!kv) return;
    if (v) kv[k] = v; else delete kv[k];
    const body = Object.entries(kv).map(([a, b]) => (b === 'true' ? a : `${a}=${/[,=]/.test(b) ? `{${b}}` : b}`)).join(',');
    mol.head = body ? `\\chemfig[${body}]` : '\\chemfig'; mol.dirty = true; E.M.dirty = true;
  }
  function wedgeSection(mol: any, sym: string) {
    const kv = molOpts(mol), S0 = settings(), dis = kv ? {} : { disabled: true };
    const lenRow = (label: string, key: string, dflt: string) => field(label, 'mw:' + key, kv ? kv[key] || '' : '', { class: 'mono', placeholder: S0[key] || dflt, title: key, ...dis });
    return section(t('editor.cf.wedgesHere', 'Wedges in this molecule'), [lenRow(t('editor.cf.wedgeWidth', 'Wedge width'), 'cram width', '1.5ex'),
      ...(/:/.test(sym) ? [lenRow(t('editor.cf.hashWidth', 'Hash width'), 'cram dash width', '1pt'), lenRow(t('editor.cf.hashGap', 'Hash gap'), 'cram dash sep', '2pt')] : []),
      note(t('editor.cf.help.wedgeSizes', 'chemfig sizes wedges for a whole molecule ({code}) or drawing, not one bond. Empty: the drawing\'s.', { code: '\\chemfig[cram width=…]' }))], 'sec');
  }
  // a ring's circle (**n): on or off, the arc it spans and its style, written **[start,end,style]n
  const arcOf = (ring: any) => { const f = ring.arc ? C.split(ring.arc.slice(1, -1)).map((x: any) => x.trim()) : []; return { a0: f[0] || '', a1: f[1] || '', st: f.slice(2).filter(Boolean).join(',') }; };
  function setArc(ring: any, q: any) {
    const parts = [q.a0, q.a1, ...(q.st ? [q.st] : [])];
    while (parts.length && !parts[parts.length - 1]) parts.pop();
    ring.arc = parts.length ? `[${parts.join(',')}]` : '';
  }
  function ringSection(ring: any) {
    const circle = ring.star === '**', q = arcOf(ring);
    return section(t('editor.cf.ring', 'Ring'), [segments(t('editor.cf.circle', 'Circle'), 'rcircle', circle ? 'true' : '', offOn()),
      ...(circle ? [chemicalNumber(t('editor.cf.arcFrom', 'Arc from'), 'rarc0', q.a0 === '' ? null : parseFloat(q.a0), '°', { step: '15', placeholder: '0' }), chemicalNumber(t('editor.cf.arcTo', 'Arc to'), 'rarc1', q.a1 === '' ? null : parseFloat(q.a1), '°', { step: '15', placeholder: '360' }),
        colourRow(t('ui.colour', 'Colour'), 'rcol', colourOf(q.st)), segments(t('ui.line', 'Line'), 'rdash', dashOf(q.st), lineKinds())] : [])], 'sec');
  }
  function molSection(mol: any) {
    const sch = inScheme();
    const lr = lrOf(mol), sub = compOf(mol).sub, bk = lr ? lr.l : '', options = [['', t('ui.none', 'None')], ['[', '[ ]'], ['(', '( )'], ['\\{', '{ }']];
    if (bk && !options.some(o => o[0] === bk)) options.push([bk, `${bk} ${lr.r}`]);
    const group = !sch ? [] : sub ? [{ text: t('editor.cf.ungroup', 'Ungroup'), attrs: { 'data-ce': 'ungroup', title: t('editor.cf.ungroupTitle', 'Take its {cmd} apart', { cmd: '\\subscheme' }) } }] : nextStep(mol) ? [{ text: t('editor.cf.groupNext', 'Group with Next'), attrs: { 'data-ce': 'group', title: t('editor.cf.groupNextTitle', 'Put it, the next arrow and the compound after it in a {cmd}', { cmd: '\\subscheme' }) } }] : [];
    return [{ ...section(t('editor.cf.compound', 'Compound'), [field(t('ui.name', 'Name'), 'mname', nameOf(mol), { 'data-tx': 'text', placeholder: t('editor.cf.namePh', 'none, shown under it') }), selectField(t('editor.cf.brackets', 'Brackets'), 'brk', bk, options),
      ...(sub ? [field(t('editor.cf.arrowsAt', 'Arrows at'), 'subang', subAngleText(sub), { class: 'mono', placeholder: t('editor.cf.defaultEg', 'default, e.g. {example}', { example: '90' }) })] : []), ...(sch ? [{ kind: 'actions' as const, class: 'row', buttons: [...group, { text: t('editor.cf.deleteMolecule', 'Delete Molecule'), attrs: { class: 'danger', 'data-ce': 'mdel' } }] }] : [])], 'sec'), ...(sub ? { summary: t('editor.cf.inSubscheme', 'in a subscheme') } : {}) }];
  }
  function renderProps() {
    if (!E) return;
    const Lo = lay(), v = selV(), b = selB(), a = selA(), mv = selM();
    const show = (title: any, summary: any, rows: any, mol?: any, extra?: any) => renderView(props, FormPanel, { sections: [{ ...section(title, rows, 'sec'), ...(summary !== undefined ? { summary } : {}) }, ...(extra ? [].concat(extra) : []), ...(mol ? molSection(mol) : [])] });
    if (v) {
      const n = dirsAt(v).length, atoms = atomsOf(v), main = atoms && atoms[Math.min(v.k, atoms.length - 1)], pairs = pairsOn(main).map((c: any) => Math.round(c.angle)), singles = chargesOf(main).filter((c: any) => kindOf(c) === '\\.').map((c: any) => Math.round(c.angle)), sign = signOf(main), lbl = v.g ? v.g.raw.trim() : '';
      const sides = () => [[90, '↑', t('editor.commonA.side.above', 'Above')], [0, '→', t('editor.commonA.side.right', 'Right')], [270, '↓', t('editor.commonA.side.below', 'Below')], [180, '←', t('editor.commonA.side.left', 'Left')]];
      // independent toggles: one on each side, so several can be on (no sliding knob)
      const flags = (row: any, on: any) => ({ ...row, many: true, options: row.options.map((o: any) => ({ ...o, on: !!main && on.includes(+o.attrs['data-v']) })) });
      const pairRow: any = flags(segments(t('editor.cf.lonePairs', 'Lone pairs'), 'pair', '', sides(), !main), pairs);
      const styleRow: any = segments(t('editor.cf.pairStyle', 'Pairs as'), 'pstyle', main ? styleOf(main) : pairStyle, [['\\:', t('editor.cf.dots', 'Dots'), t('editor.cf.pairDots', 'Two dots (\\:)')], ['\\|', t('editor.cf.bar', 'Bar'), t('editor.cf.pairBar', 'A bar (\\|)')]], !main);
      const singleRow: any = flags(segments(t('editor.cf.radicals', 'Radicals'), 'single', '', sides(), !main), singles);
      show(lbl ? t('editor.cf.atom', 'Atom') : t('editor.cf.vertex', 'Vertex'), n === 1 ? t('editor.cf.oneBond', '1 bond') : t('editor.cf.nBonds', '{n} bonds', { n }), [field(t('ui.label', 'Label'), 'label', lbl, { class: 'mono', 'data-tx': 'math', placeholder: t('editor.cf.labelPh', 'none: a carbon vertex') }),
        ...(lbl && atoms && atoms.length ? [colourRow(t('ui.colour', 'Colour'), 'vcol', colourOfAtoms(v))] : []),
        segments(t('editor.cf.charge', 'Charge'), 'sign', sign, [['', t('ui.none', 'None')], ['+', '+', t('editor.cf.superscript', 'A superscript {sign}', { sign: '+' })], ['-', '−', t('editor.cf.superscript', 'A superscript {sign}', { sign: '−' })]], !main), ...partialRows(main), pairRow, styleRow, singleRow,
        ...(!v.g ? [note(t('editor.cf.help.vertex', 'A vertex with no label is a carbon. Give it a label to put charges and lone pairs on it.'))] : []), delRow('vdel', delVertex(v), v.inRing)], v.mol); return;
    }
    if (b) {
      const it = b.item, arg = it.arg || [], inRing = !!b.ring, ang = it.angleUsed != null ? it.angleUsed : b.angle, len = arg[1] ? parseFloat(arg[1]) : 1;
      const wedge = /^[<>]/.test(it.sym), hollow = /\|$/.test(it.sym), off = b.hook ? { disabled: true } : {};
      // what this bond draws with: its own options over the drawing's bond style (chemfig puts them after it)
      const all = settings()['bond style'] || '', allW = widthOf(all), allC = colourOf(all);
      const rows: any[] = [selectField(t('ui.type', 'Type'), 'sym', it.sym, Object.entries<any>(bondNames())),
        chemicalNumber(t('ui.angle', 'Angle'), 'angle', inRing ? null : Math.round(ang * 100) / 100, '°', inRing || b.hook ? { disabled: true } : { step: '15' }), chemicalNumber(t('editor.cf.length', 'Length'), 'len', inRing ? null : len, '×', inRing || b.hook ? { disabled: true } : { step: '0.25', min: '0.25' }),
        ...ends(b)];
      if (!wedge) rows.push(segments(t('ui.line', 'Line'), 'bdash', lineOf(arg[4], all), [...lineKinds(), ['none', t('editor.cf.lineNone', 'None'), t('editor.cf.lineNoneTitle', 'Not drawn: it keeps its place (draw=none)')]], !!b.hook));
      if (!wedge || hollow) rows.push(chemicalNumber(hollow ? t('editor.cf.outline', 'Outline') : t('ui.width', 'Width'), 'bwidth', widthOf(arg[4]), 'pt', { step: '0.1', min: '0.1', placeholder: allW != null ? num(allW) : '0.4', ...off }));
      rows.push({ ...row(t('ui.colour', 'Colour'), texColour(colourOf(arg[4]), { 'data-f': 'bcol' }, { nullable: true, defaultLabel: allC || t('ui.default', 'Default'), defaultSwatch: TD.css(allC && TD.tikzColor(allC) ? TD.tikzColor(allC) : '#000000'), title: t('ui.colour', 'Colour') })), controlClass: 'ctl tc' },
        field(t('ui.options', 'Options'), 'tikz', arg[4] || '', { class: 'mono', placeholder: eg('red, line width=1pt'), ...off }),
        note(hidden(it) ? t('editor.cf.help.hiddenBond2', 'Not drawn (draw=none): the bond keeps its place in chemfig. Pick a line, or a bond kind, to draw it again.') : inRing ? t('editor.cf.help.ringSides', "A ring's sides follow the ring: they have no angle or length of their own.") : t('editor.cf.help.bondDrag', 'Drag the atom at its end to turn and stretch it.')),
        b.hook ? delRow(null, '', inRing) : delRow(inRing ? null : 'bdel', t('editor.cf.deleteBond', 'Delete Bond'), inRing));
      show(t('editor.cf.bondTitle', '{kind} bond', { kind: bondNames()[it.sym] || t('editor.cf.bond', 'Bond') }), inRing ? t('editor.cf.ringOf', 'ring of {n}', { n: b.ring.n }) : b.hook ? t('editor.cf.ringClosure', 'ring closure') : '', rows, b.mol,
        [...(wedge ? [wedgeSection(b.mol, it.sym)] : []), ...(inRing ? [ringSection(b.ring.item)] : [])]); return;
    }
    if (a && a.seg.t === 'merge') {
      const M = a.seg;
      show(t('editor.cf.mergeArrow', 'Merge arrow'), t('editor.cf.fromN', 'from {n}', { n: M.srcs.length }), [selectField(t('editor.cf.direction', 'Direction'), 'mdir', M.dir, [['>', t('editor.commonA.side.right', 'Right')], ['<', t('editor.commonA.side.left', 'Left')], ['^', t('editor.cf.up', 'Up')], ['v', t('editor.cf.down', 'Down')]]),
        field(t('editor.commonA.side.above', 'Above'), 'above', panelLabel(M.labels[0]), { 'data-tx': 'text', placeholder: 'none' }), field(t('editor.commonA.side.below', 'Below'), 'below', panelLabel(M.labels[1]), { 'data-tx': 'text', placeholder: 'none' }), field(t('editor.cf.from', 'From'), 'msrc', M.srcs.join(', '), { class: 'mono', placeholder: eg('c1, c2') }), field(t('editor.cf.to', 'To'), 'mtgt', M.target, { class: 'mono', placeholder: t('editor.cf.targetPh', 'none, or a name for what follows') }),
        note(t('editor.cf.help.merge', "From names the compounds whose lines join: c1 is a scheme's first compound, c2 the next, and so on.")), actionRow('ce', 'adel', t('editor.cf.deleteMerge', 'Delete Merge'))]); return;
    }
    if (a) {
      const A = a.seg, direct = isDirect(A);
      show(t('editor.cf.arrowTitle', '{kind} arrow', { kind: arrowNames()[A.type] || t('editor.cf.arrow', 'Arrow') }), undefined, [selectField(t('ui.type', 'Type'), 'atype', A.type, Object.entries<any>(arrowNames())), field(t('editor.commonA.side.above', 'Above'), 'above', panelLabel(A.labels[0]), { 'data-tx': 'text', placeholder: noneEg('$\\Delta$') }), field(t('editor.commonA.side.below', 'Below'), 'below', panelLabel(A.labels[1]), { 'data-tx': 'text', placeholder: noneEg('H$_2$O') }),
        chemicalNumber(t('ui.angle', 'Angle'), 'aangle', direct ? null : A.opt[0] ? parseFloat(A.opt[0]) : a.ang, '°', { step: '15', ...(direct ? { disabled: true } : {}) }), chemicalNumber(t('editor.cf.length', 'Length'), 'alen', direct ? null : A.opt[1] ? parseFloat(A.opt[1]) : 1, '×', { step: '0.25', min: '0.25', ...(direct ? { disabled: true } : {}) }),
        field(t('editor.cf.ends', 'Ends'), 'aends', A.names ? A.names.slice(1, -1) : '', { class: 'mono', placeholder: t('editor.cf.endsPh', 'none, e.g. {a} or {b}', { a: 'c1--c2', b: '@c1--@c3' }) }), colourRow(t('ui.colour', 'Colour'), 'acol', colourOf(arrowStyle(A))), segments(t('ui.line', 'Line'), 'adash', dashOf(arrowStyle(A)), lineKinds()),
        field(t('ui.style', 'Style'), 'astyle', A.opt.slice(2).filter((x: any) => x && x.trim()).join(', '), { class: 'mono', placeholder: noneEg('red, thick') }),
        direct ? note(t('editor.cf.help.direct', 'It joins two compounds already placed (@ names), so it has no angle or length of its own.')) : note(t('editor.cf.help.arrowDrag', 'Drag its head to turn and stretch it (15° steps; '), { kbd: '⌥' }, t('editor.cf.help.anyAngle', ' for any angle).')), actionRow('ce', 'adel', t('editor.cf.deleteArrow', 'Delete Arrow'))]); return;
    }
    if (mv) {
      const D0 = drawsOf(mv.seg)[mv.k], q = D0 && simpleOf(D0.path), tips = mv.tipS && mv.tipE ? 'stealth-stealth' : mv.tipS ? 'stealth-' : mv.tipE ? '-stealth' : '-', line = mv.dash === 'dash' ? 'dashed' : mv.dash === 'dot' ? 'dotted' : mv.dash ? 'pattern' : 'solid', lines = [['solid', t('ui.solid', 'Solid')], ['dashed', t('ui.dashed', 'Dashed')], ['dotted', t('ui.dotted', 'Dotted')]];
      if (line === 'pattern') lines.push(['pattern', t('editor.cf.dashPattern', 'Dash pattern')]);
      const colour = D0 ? (D0.opt.split(',').map(o => o.trim()).find(isColour) || '').replace(/^(color|draw)\s*=\s*/, '') : '';
      show(t('editor.cf.curved', 'Curved arrow'), '\\chemmove', [selectField(t('editor.cf.tips', 'Tips'), 'mvtip', tips, [['-stealth', t('editor.cf.atEnd', 'At the end')], ['stealth-', t('editor.cf.atStart', 'At the start')], ['stealth-stealth', t('editor.cf.bothEnds', 'Both ends')], ['-', t('ui.none', 'None')]]), selectField(t('ui.line', 'Line'), 'mvline', line, lines), field(t('ui.colour', 'Colour'), 'mvcol', colour, { class: 'mono', placeholder: noneEg('red') }),
        ...(q ? [chemicalNumber(t('editor.cf.leavesAt', 'Leaves at'), 'mvout', q.out, '°', { step: '15' }), chemicalNumber(t('editor.cf.pull', 'Pull'), 'mvr1', q.r1, 'cm', { step: '0.05', min: '0' }), chemicalNumber(t('editor.cf.arrivesAt', 'Arrives at'), 'mvin', q.in, '°', { step: '15' }), chemicalNumber(t('editor.cf.pull', 'Pull'), 'mvr2', q.r2, 'cm', { step: '0.05', min: '0' })] : []), field(t('editor.cf.path', 'Path'), 'mvpath', D0 ? D0.path.trim() : '', { class: 'mono' }), note(q ? t('editor.cf.help.bend', 'Drag the blue handles to bend it.') : t('editor.cf.help.pathAsWritten', "Its path isn't a single curve with two controls, so it is edited as written.")), actionRow('ce', 'mvdel', t('editor.cf.deleteCurved', 'Delete Curved Arrow'))]); return;
    }
    const help = [note(t('editor.cf.help.main', 'Pick an atom and drag its blue handle to grow a bond (it snaps to 15°; '), { kbd: '⌥' }, t('editor.cf.help.mainRest', ' for any angle). Drag an atom to turn its bond. Type a letter to relabel the picked atom; double-click to edit its label, or a bond to step it single, double, triple. Rings, groups and charges on the left go onto the picked atom or bond; Reactions add an arrow and a copy of the molecule to change, a merge, or a curved arrow from one atom or bond to another.'))];
    if (!Lo.empty) help.push(note(t('editor.cf.help.names', 'Click the dashed box under a compound to name it; double-click a name to change it.')));
    if (!Lo.empty && tails().length) help.push(note(t('editor.cf.help.tail', 'An arrow with nothing after it ends in a dashed box: click it to type the next compound in chemfig code, or drop an atom, ring or group in it.')));
    renderView(props, FormPanel, { sections: [{ ...section(t('editor.cf.title', 'Chemistry'), help, 'sec'), summary: countsText(Lo) }, ...settingsSections()] });
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); L = null; clampSel(); renderProps(); draw(); } });
  props.addEventListener('input', (ev: any) => {
    const t = ev.target, f = t.dataset.f;
    if (!f) return;
    const v = selV(), b = selB(), a = selA(), mv = selM(), mol = v ? v.mol : b ? b.mol : null;
    if (f.startsWith('cf:')) {
      const k = f.slice(3), val = t.value.trim();
      if (k === 'angle increment' || k === 'cycle radius coeff') { const n = parseFloat(val); if (val && !(isFinite(n) && n > 0)) return; setSetting(k, val ? num(n) : ''); }
      else if (k === 'arrow head') setSetting(k, val);
      else { if (val && !LEN_RE.test(val)) return; setSetting(k, val); }
    } else if (f.startsWith('cfb:')) {
      const bs = settings()['bond style'] || '';
      if (f === 'cfb:width') { const n = parseFloat(t.value); if (t.value.trim() && !(isFinite(n) && n > 0)) return; setSetting('bond style', withWidth(bs, t.value.trim() ? n : null)); }
      else if (f === 'cfb:colour') setSetting('bond style', withColour(bs, t.value.trim()));
    } else if (f === 'cfa:colour') {
      setSetting('arrow style', withColour(settings()['arrow style'] || '', t.value.trim()));
    } else if (f.startsWith('mw:') && b) {
      const val = t.value.trim();
      if (val && !LEN_RE.test(val)) return;
      setMolOpt(b.mol, f.slice(3), val);
    } else if (mol && (f === 'brk' || f === 'subang')) {
      if (f === 'brk') setBrackets(mol, t.value);
      else { const sub = compOf(mol).sub; if (sub) setSubAngle(sub, t.value); }
    } else if (v) {
      if (f === 'label') {
        const key = vkey(v);
        setLabel(v, t.value); L = null;
        const nv = lay().verts.find((x: any) => (v.g && x.g === v.g) || (v.inBond && x.inBond === v.inBond) || (!v.g && !v.inBond && x.mol === v.mol && x.root));
        E.sel = nv ? { v: vkey(nv) } : { v: key };
      } else if (f === 'pang' || f === 'poff') {
        const pc = partialOf(mainAtom(v));
        if (!pc) return;
        const n = parseFloat(t.value);
        if (f === 'pang') { if (!isFinite(n)) return; setPartial(v, pc.sign, n); }
        else { if (t.value.trim() && !isFinite(n)) return; setPartial(v, pc.sign, pc.c.angle, t.value.trim() ? n : 0); }
        L = null;
        const nv = lay().verts.find((x: any) => v.g && x.g === v.g);
        if (nv) E.sel = { v: vkey(nv) };
      } else if (f === 'vcol') {
        const key = vkey(v);
        setAtomsColour(v, t.value.trim()); L = null;
        const nv = lay().verts.find((x: any) => v.g && x.g === v.g);
        E.sel = nv ? { v: vkey(nv) } : { v: key };
      } else if (f === 'mname') setName(v.mol, t.value);
    } else if (b) {
      const it = b.item;
      if (f === 'sym') { it.sym = t.value; it.dirty = true; touch(b.mol); }
      else if ((f === 'rarc0' || f === 'rarc1' || f === 'rcol') && b.ring) {
        const ring = b.ring.item, q: any = arcOf(ring), val = t.value.trim();
        if (f === 'rcol') q.st = withColour(q.st, val);
        else { const n = parseFloat(val); if (val && !isFinite(n)) return; q[f === 'rarc0' ? 'a0' : 'a1'] = val ? num(n) : ''; }
        setArc(ring, q); touch(b.mol);
      }
      else if (f === 'angle' || f === 'len' || f === 'tikz' || f === 'bwidth' || f === 'bcol' || f === 'bdep' || f === 'barr') {
        const arg = (it.arg || []).slice();
        if (f === 'angle') { const n = parseFloat(t.value); if (!isFinite(n)) return; arg[0] = bondName(arg[0]) + fmtA(n); }
        if (f === 'len') { const n = parseFloat(t.value); if (!isFinite(n) || n <= 0) return; arg[1] = Math.abs(n - 1) < 1e-9 ? '' : num(n); }
        if (f === 'tikz') arg[4] = t.value.trim();
        if (f === 'bcol') arg[4] = withColour(arg[4], t.value.trim());
        if (f === 'bdep') arg[2] = t.value;
        if (f === 'barr') arg[3] = t.value;
        if (f === 'bwidth') { const n = parseFloat(t.value); if (t.value.trim() && !(isFinite(n) && n > 0)) return; arg[4] = withWidth(arg[4], t.value.trim() ? n : null); }
        it.arg = arg; it.dirty = true; touch(b.mol);
      } else if (f === 'mname') setName(b.mol, t.value);
    } else if (a) {
      const A = a.seg;
      if (f === 'atype') A.type = t.value;
      else if (f === 'mdir') A.dir = t.value;
      else if (f === 'msrc') A.srcs = t.value.split(',').map((x: any) => x.trim()).filter(Boolean);
      else if (f === 'mtgt') A.target = t.value.trim();
      else if (f === 'aends') { const w = t.value.trim().replace(/^\(|\)$/g, ''); A.names = w ? `(${w})` : ''; }
      else if (f === 'acol') setArrowStyle(A, withColour(arrowStyle(A), t.value.trim()));
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
    if (['sym', 'atype', 'mdir', 'brk', 'mvtip', 'mvline', 'bdep', 'barr', 'cf:arrow head', 'pang'].includes(f)) { commit(); renderProps(); begin(); }
  });
  props.addEventListener('input', () => { if (E && !isViewUpdating()) renderProps(); });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  props.addEventListener('click', (ev: any) => {
    const bt = ev.target.closest('[data-fs]');
    if (!bt || !E || bt.disabled) return;
    const f = bt.dataset.fs, val = bt.dataset.v, v = selV(), b = selB();
    if (f === 'cf:fixed length' || f === 'cf:cram rectangle' || f === 'cfb:dash' || f === 'cfa:dash') {
      edit(() => {
        if (f === 'cfb:dash') setSetting('bond style', withDash(settings()['bond style'] || '', val));
        else if (f === 'cfa:dash') setSetting('arrow style', withDash(settings()['arrow style'] || '', val));
        else setSetting(f.slice(3), val);
      });
      return;
    }
    if ((f === 'rcircle' || f === 'rdash') && b && b.ring) {
      const ring = b.ring.item;
      edit(() => {
        if (f === 'rcircle') { ring.star = val ? '**' : '*'; if (!val) ring.arc = ''; } // a plain ring takes no [arc]
        else { const q = arcOf(ring); q.st = withDash(q.st, val); setArc(ring, q); }
        touch(b.mol);
      });
      return;
    }
    const a = selA();
    if (f === 'adash' && a && a.seg.t === 'arrow') { edit(() => setArrowStyle(a.seg, withDash(arrowStyle(a.seg), val))); return; }
    if (f === 'bdash' && b) { edit(() => { setLine(b.item, val); touch(b.mol); }); return; }
    if (!v) return;
    edit(() => {
      if (f === 'sign') setSign(v, val);
      else if (f === 'pair') togglePair(v, +val);
      else if (f === 'pstyle') setPairStyle(v, val);
      else if (f === 'single') toggleDecor(v, '\\.', +val);
      else if (f === 'pq') { const pc = partialOf(mainAtom(v)); setPartial(v, val, pc ? pc.c.angle : freeSpot(v), pc && val ? pc.c.off / C.PT : null); }
    });
    reselect(v);
  });

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-ce="undo"]', root).disabled = !E.undo.length;
    $('[data-ce="redo"]', root).disabled = !E.redo.length;
  }
  function updateGridTools() {
    root.querySelectorAll<HTMLButtonElement>('[data-grid-style]').forEach(b => {
      const on = E.grid !== 'off' && b.dataset.gridStyle === E.gridChoice;
      b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.tabIndex = b.dataset.gridStyle === E.gridChoice ? 0 : -1;
    });
  }
  function saveGridChoice() {
    try { localStorage.setItem('diagramtex.cf.grid', E.grid); localStorage.setItem('diagramtex.cf.gridChoice', E.gridChoice); } catch { /* private storage */ }
    updateGridTools(); draw();
  }
  const gridButtons = $('#chemGridStyle', root);
  gridButtons.addEventListener('click', (e: any) => {
    const button = e.target.closest('[data-grid-style]');
    if (!E || !button) return;
    const style = button.dataset.gridStyle;
    E.grid = E.grid === style ? 'off' : style; E.gridChoice = style; saveGridChoice();
  });
  gridButtons.addEventListener('keydown', (e: KeyboardEvent) => {
    const button = (e.target as Element).closest<HTMLButtonElement>('[data-grid-style]');
    if (button && (e.key === ' ' || e.key === 'Enter')) { e.stopPropagation(); return; }
    if (!E || !button || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault(); e.stopPropagation();
    const index = GRID_STYLES.indexOf(button.dataset.gridStyle as any), delta = e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1;
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? GRID_STYLES.length - 1 : (index + delta + GRID_STYLES.length) % GRID_STYLES.length;
    E.grid = E.gridChoice = GRID_STYLES[next]; saveGridChoice();
    gridButtons.querySelector(`[data-grid-style="${E.gridChoice}"]`)?.focus();
  });
  root.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest('[data-ce]');
    if (!b || !E) return;
    act((b as HTMLElement).dataset.ce, b);
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
  function act(x: any, btn?: any) {
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
    else if (x === 'cfup') { edit(() => upgradeLegacy()); }
    else if (x === 'mdel') { const mol = (v || b || {}).mol; if (mol) { edit(() => deleteMol(mol)); E.sel = null; L = null; draw(); renderProps(); } }
    else if (x === 'label') { if (v) editLabel(v); }
    else if (x === 'alabel') { if (a) editArrowLabel(a, 0); }
    else if (x === 'copy') copyCode(btn, codeTa.value);
    else if ((x === 'bshow' || x === 'bhide') && b) edit(() => { setHidden(b.item, x === 'bhide'); touch(b.mol); });
    else if (x === 'bflip' && b) edit(() => { const s = b.item.sym; b.item.sym = (s[0] === '>' ? '<' : '>') + s.slice(1); b.item.dirty = true; touch(b.mol); });
    else if (x.startsWith('b:') && b) apply(x, { b });
  }
  // the drawing writes the code, except while it is being typed in; typing is read back after a pause
  function syncCode() {
    const Lo = lay();
    count.textContent = countsText(Lo);
    if (document.activeElement === codeTa) return;
    const c = snapCode();
    if (c !== E.codeAt) { E.codeAt = c; codeTa.value = c; }
    showCodeNotes(codeMsg, C.layout({ src: c }).warnings);
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    E.typed = codeTa.value; E.M = load(codeTa.value); E.codeAt = codeTa.value; L = null;
    commit();
    clampSel(); draw(); renderProps();
    showCodeNotes(codeMsg, C.layout({ src: codeTa.value }).warnings);
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !dock.elsewhere(e),
      save,
      finish,
      undo,
      redo,
      escape: () => {
        if (E.arm) { E.arm = null; E.mvFrom = null; E.ptr = null; buildPalette(); setTip(''); draw(); return true; }
        if (E.sel) { E.sel = null; draw(); renderProps(); return true; }
        return false;
      },
    });
    if (!keys) return;
    const { mod } = keys;
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
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  // saving, closing, the discard prompt, the unsaved check (beforeunload) and embedding in a pane (Quick): src/core/editor-session.ts lifecycle
  // a bond is selected by its own object, which a reopened drawing doesn't share: it is kept by its place in the layout
  const dock = TD.editorSession.lifecycle({
    state: () => E, clear: () => { localeOff?.(); localeOff = undefined; E = null; L = null; }, snapshot: () => snapCode(), commit, root, code: codeTa, readCode, note: stageNote,
    settle: () => { closeLabel(); }, discardTitle: () => t('editor.cf.discard', 'Discard changes to this drawing?'),
    selOut: () => (E.sel?.v ? { v: E.sel.v } : E.sel?.b ? { bi: lay().bonds.findIndex((b: any) => b.item === E.sel.b) } : null),
    selIn: (s: any) => { const b = s?.bi >= 0 ? lay().bonds[s.bi] : null; E.sel = s?.v && findV(s.v) ? { v: s.v } : b ? { b: b.item } : null; },
  });
  const { save, finish } = dock;
  let localeOff: (() => void) | undefined;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    // chemfig 1.x code opens in today's form: an edit (Done keeps it, Cancel and Undo take it back)
    const conv = C.modernize(String(block.src || ''));
    const M = load(conv.changes.length ? conv.code : block.src);
    L = null;
    E = { M, sel: null, arm: null, bond: '-', view: { ox: 0, oy: 0, k: 2 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, knobAt: null, codeAt: null, codeTimer: null };
    E.grid = E.gridChoice = 'isometric';
    try {
      const saved = localStorage.getItem('diagramtex.cf.grid'), grid = saved === 'rectangular' ? 'grid' : saved;
      E.grid = GRID_STYLES.includes(grid as any) || grid === 'off' ? grid : 'isometric';
      const last = localStorage.getItem('diagramtex.cf.gridChoice');
      E.gridChoice = E.grid === 'off' ? GRID_STYLES.includes(last as any) ? last : 'isometric' : E.grid;
    } catch { /* private storage */ }
    updateGridTools();
    E.typed = String(conv.changes.length ? conv.code : block.src || ''); E.start = snapCode();
    if (conv.changes.length) { E.start = String(block.src || ''); E.undo.push(E.start); updateTools(); }
    dock.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, properties and drawing's hints follow the interface language while the editor is open
    let first = true;
    localeOff?.();
    localeOff = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); syncCode(); } });
    if (conv.changes.length) stageNote.flash(t('editor.cf.updated', 'Updated chemfig 1.x code: {list}', { list: conv.changes.join(', ') }), 5000);
    if (dock.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.chemEditor = { open, dockable: true, close: () => dock.detach() };
})();
