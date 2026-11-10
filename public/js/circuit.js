// Circuit block: a schematic drawn with circuitikz parts (czcore.js + czparts-*.js) and exported as
// circuitikz code. The block holds a list of items in its own frame (cm, y up, origin at (s.x, s.y)):
//   bipole { id, part, a: [x, y], b: [x, y], l, ann, v, i, poles, name, opts }  → \draw (a) to[…] (b);
//   node   { id, part, p: [x, y], rot, flip, name, text, opts }               → \node[…] (name) at (p) {text};
// plus raw lines it could not read back (kept verbatim). A bipole's end that sits on a named node's pin
// is written as (Name.pin), so the wire meets the pin in LaTeX as it does here.
// The circuit is edited in its own overlay editor (czeditor.js), opened by double-clicking the block.
(function () {
  const TD = window.TD, CZ = TD.CZ;
  const { r2, esc } = TD.util;
  const PX = TD.PX_PER_CM, K = TD.PT_PER_PX;
  const RLEN = 1.4, NODE_R = 0.04 * RLEN;
  const EPS = 1e-3;
  const f = (n) => { const v = Math.round(n * 100) / 100; return Object.is(v, -0) ? '0' : String(v); };
  const same = (p, q) => Math.abs(p[0] - q[0]) < EPS && Math.abs(p[1] - q[1]) < EPS;
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---------------------------------------------------------------- geometry
  // node frame: mirror (xscale=-1) first, then rotate counter-clockwise, then move to p
  function nodeXf(it) {
    const a = ((it.rot || 0) * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a), fx = it.flip ? -1 : 1;
    return (x, y) => { x *= fx; return [it.p[0] + x * c - y * s, it.p[1] + x * s + y * c]; };
  }
  // bipole frame: origin at the middle of a→b, x along the path, y to its left;
  // circuitikz's `mirror` flips the part along the path (x), `invert` across it (y)
  // (labels follow the path, not the flipped part: they use the plain frame)
  function bipXf(it, plain) {
    const dx = it.b[0] - it.a[0], dy = it.b[1] - it.a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const mx = (it.a[0] + it.b[0]) / 2, my = (it.a[1] + it.b[1]) / 2;
    const o = plain ? [] : (it.opts || '').split(',').map((t) => t.trim()), fx = o.includes('mirror') ? -1 : 1, fy = o.includes('invert') ? -1 : 1;
    return (x, y) => { x *= fx; y *= fy; return [mx + x * ux - y * uy, my + x * uy + y * ux]; };
  }
  const xfOf = (it) => (it.p ? nodeXf(it) : bipXf(it));
  const isWire = (it) => it.part === 'short';
  // every connection point of an item, in the block frame: { name: [x, y] }
  function pinsOf(it) {
    const def = CZ.parts[it.part];
    const out = {};
    if (it.p) { const T = nodeXf(it); for (const [n, q] of Object.entries((def && def.pins) || { center: [0, 0] })) out[n] = T(q[0], q[1]); return out; }
    out.start = it.a.slice(); out.end = it.b.slice();
    if (def) { const T = bipXf(it); for (const [n, q] of Object.entries(def.pins)) out[n] = T(q[0], q[1]); }
    return out;
  }

  // ---------------------------------------------------------------- drawing
  // SVG of the items through m (block cm → screen px); k = px per cm; o: { color, paper, sel: Set of ids, ctx, st }
  function itemsSvg(items, m, k, o = {}) {
    const col = o.color || '#000', paper = o.paper || '#fff';
    const wW = 0.4 / K / PX * k, bW = 2 * wW; // wires 0.4pt, component bodies twice that (circuitikz thickness 2)
    let out = '';
    for (const it of items) {
      const def = CZ.parts[it.part], c = o.colorOf ? o.colorOf(it) : col;
      let s = '';
      if (it.p) {
        if (!def) { const [X, Y] = m(it.p[0], it.p[1]); s += `<circle cx="${r2(X)}" cy="${r2(Y)}" r="${r2(0.15 * k)}" fill="none" stroke="${c}" stroke-dasharray="2 2"/>`; }
        else { const T = nodeXf(it); s += CZ.svg(CZ.geom(it.part), (x, y) => m(...T(x, y)), { stroke: c, width: bW, paper, scale: k }); }
      } else {
        const L = Math.hypot(it.b[0] - it.a[0], it.b[1] - it.a[1]), w = def ? Math.min(def.w || 0, L) : 0;
        const T = bipXf(it), [ax, ay] = m(...it.a), [bx, by] = m(...it.b);
        if (!def || w <= 0) s += `<path d="M${r2(ax)},${r2(ay)}L${r2(bx)},${r2(by)}" stroke="${c}" stroke-width="${r2(wW)}" stroke-linecap="round" fill="none"${def ? '' : ' stroke-dasharray="3 3"'}/>`;
        else {
          const [p1x, p1y] = m(...T(-w / 2, 0)), [p2x, p2y] = m(...T(w / 2, 0));
          s += `<path d="M${r2(ax)},${r2(ay)}L${r2(p1x)},${r2(p1y)}M${r2(p2x)},${r2(p2y)}L${r2(bx)},${r2(by)}" stroke="${c}" stroke-width="${r2(wW)}" stroke-linecap="round" fill="none"/>`;
          s += CZ.svg(CZ.geom(it.part), (x, y) => m(...T(x, y)), { stroke: c, width: bW, paper, scale: k });
        }
        // poles: * filled, o open
        const pm = /^([*o]?)-([*o]?)$/.exec(it.poles || '');
        if (pm) [[pm[1], ax, ay], [pm[2], bx, by]].forEach(([t, X, Y]) => {
          if (t) s += `<circle cx="${r2(X)}" cy="${r2(Y)}" r="${r2(NODE_R * k)}" fill="${t === '*' ? c : paper}" stroke="${c}" stroke-width="${r2(wW)}"/>`;
        });
      }
      s += labelsSvg(it, m, k, c, o);
      out += o.wrap ? o.wrap(it, s) : s;
    }
    return out;
  }
  // where the labels go: l (and i) on the left of the path, a and v on the right; node text at its centre
  function labelSpots(it) {
    const def = CZ.parts[it.part], G = def && CZ.geom(it.part);
    const spots = [];
    if (it.p) { if (it.text) spots.push({ t: it.text, at: it.p, dir: [0, 0] }); return spots; }
    const T = bipXf(it, true), hy = G ? Math.max(G.box.y2, -G.box.y1, 0.05) : 0.05;
    const dx = it.b[0] - it.a[0], dy = it.b[1] - it.a[1], L = Math.hypot(dx, dy) || 1, n = [-dy / L, dx / L];
    if (it.l) spots.push({ t: it.l, at: T(0, hy + 0.12), dir: n });
    if (it.ann) spots.push({ t: it.ann, at: T(0, -hy - 0.12), dir: [-n[0], -n[1]] });
    if (it.v) spots.push({ t: it.v, at: T(0, -hy - (it.ann ? 0.6 : 0.12)), dir: [-n[0], -n[1]] });
    if (it.i) spots.push({ t: it.i, at: T(Math.min(L / 2 - 0.15, (def ? def.w / 2 : 0) + 0.3), 0.12), dir: n, arrow: true });
    return spots;
  }
  function labelsSvg(it, m, k, c, o) {
    let s = '';
    const st = o.st || { size: 'normalsize', font: 'default' }, zoom = k / PX;
    for (const L of labelSpots(it)) {
      const b = TD.textBox(L.t, st), bw = b.w / PX, bh = b.h / PX; // text keeps its size in cm
      // push the box out along dir so its nearest edge sits at the spot
      const ox = L.dir[0] * (bw / 2), oy = L.dir[1] * (bh / 2);
      const [X, Y] = m(L.at[0] + ox, L.at[1] + oy);
      if (zoom === 1) s += TD.textSvg(L.t, st, c, X, Y, o.ctx || {});
      else s += `<g transform="translate(${r2(X)},${r2(Y)}) scale(${r2(zoom)})">${TD.textSvg(L.t, st, c, 0, 0, o.ctx || {})}</g>`;
      if (L.arrow) {
        const [ax, ay] = m(...L.at.map((v, i) => v - L.dir[i] * 0.12)), dir = [it.b[0] - it.a[0], it.b[1] - it.a[1]], l = Math.hypot(...dir) || 1;
        const u = [dir[0] / l, -dir[1] / l], hl = 0.14 * k, hw = 0.06 * k;
        const tx = ax + u[0] * hl / 2, ty = ay + u[1] * hl / 2;
        s += `<path d="M${r2(tx)},${r2(ty)}L${r2(tx - u[0] * hl - u[1] * hw)},${r2(ty - u[1] * hl + u[0] * hw)}L${r2(tx - u[0] * hl + u[1] * hw)},${r2(ty - u[1] * hl - u[0] * hw)}Z" fill="${c}"/>`;
      }
    }
    return s;
  }
  // bounding box of the items in the block frame (cm, y up): { x1, y1, x2, y2 }
  function itemsBox(items, st) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const grow = (x, y) => { x1 = Math.min(x1, x); y1 = Math.min(y1, y); x2 = Math.max(x2, x); y2 = Math.max(y2, y); };
    for (const it of items) {
      const G = CZ.parts[it.part] && CZ.geom(it.part), T = xfOf(it);
      if (G) { const b = G.box; [[b.x1, b.y1], [b.x2, b.y1], [b.x2, b.y2], [b.x1, b.y2]].forEach((q) => grow(...T(...q))); }
      if (!it.p) { grow(...it.a); grow(...it.b); } else grow(...it.p);
      for (const L of labelSpots(it)) {
        const b = TD.textBox(L.t, st || { size: 'normalsize', font: 'default' }), bw = b.w / PX, bh = b.h / PX;
        const cx = L.at[0] + L.dir[0] * bw / 2, cy = L.at[1] + L.dir[1] * bh / 2;
        grow(cx - bw / 2, cy - bh / 2); grow(cx + bw / 2, cy + bh / 2);
      }
    }
    if (!isFinite(x1)) return null;
    return { x1, y1, x2, y2 };
  }

  // ---------------------------------------------------------------- circuitikz code
  const brace = (t) => (/[,=\]]/.test(t) ? `{${t}}` : t);
  // names of every named item's pins: Map "x,y" → "Name.pin" (nodes first: their pins win)
  function pinRefs(items) {
    const refs = [];
    for (const it of items) {
      if (!it.name) continue;
      const def = CZ.parts[it.part];
      if (!def) continue;
      if (it.p) for (const [n, q] of Object.entries(pinsOf(it))) refs.push([q, n === 'center' ? `(${it.name})` : `(${it.name}.${n})`]);
      else for (const n of Object.keys(def.pins)) refs.push([pinsOf(it)[n], `(${it.name}.${n})`]);
    }
    return refs;
  }
  function code(items, raw) {
    const lines = [], refs = pinRefs(items);
    const pt = (q) => { const r = refs.find(([p]) => same(p, q)); return r ? r[1] : `(${f(q[0])},${f(q[1])})`; };
    for (const it of items) {
      const def = CZ.parts[it.part];
      if (!def || !it.p) continue;
      const o = [def.tikz];
      if (it.rot) o.push(`rotate=${f(it.rot)}`);
      if (it.flip) o.push('xscale=-1');
      if (it.opts) o.push(it.opts);
      lines.push(`\\node[${o.join(', ')}]${it.name ? ` (${it.name})` : ''} at (${f(it.p[0])},${f(it.p[1])}) {${it.text || ''}};`);
    }
    for (const it of items) {
      const def = CZ.parts[it.part];
      if (!def || it.p) continue;
      const o = [];
      if (it.l) o.push(`l=${brace(it.l)}`);
      if (it.ann) o.push(`a=${brace(it.ann)}`);
      if (it.v) o.push(`v=${brace(it.v)}`);
      if (it.i) o.push(`i=${brace(it.i)}`);
      if (it.name) o.push(`n=${it.name}`);
      if (it.poles && it.poles !== '-') o.push(it.poles);
      if (it.opts) o.push(it.opts);
      if (isWire(it) && !o.length) lines.push(`\\draw ${pt(it.a)} -- ${pt(it.b)};`);
      else lines.push(`\\draw ${pt(it.a)} to[${[def.tikz, ...o].join(', ')}] ${pt(it.b)};`);
    }
    if (raw && raw.trim()) lines.push(...raw.replace(/\s+$/, '').split('\n'));
    return lines.join('\n');
  }

  // ---------------------------------------------------------------- reading code back
  // Reads the subset code() writes (and the obvious hand edits to it). Anything else is kept as raw lines.
  function closeAt(s, i) {
    const open = s[i], shut = { '{': '}', '[': ']', '(': ')' }[open];
    let d = 0;
    for (let k = i; k < s.length; k++) {
      const ch = s[k];
      if (ch === '\\') { k++; continue; }
      if (ch === open) d++;
      else if (ch === shut && --d === 0) return k;
    }
    return -1;
  }
  function splitTop(str, sep) {
    const out = [];
    let d = 0, buf = '';
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (ch === '\\') { buf += ch + (str[i + 1] || ''); i++; continue; }
      if ('{[('.includes(ch)) d++; else if ('}])'.includes(ch)) d--;
      if (ch === sep && d === 0) { out.push(buf); buf = ''; } else buf += ch;
    }
    out.push(buf);
    return out;
  }
  const norm = (t) => t.trim().replace(/\s+/g, ' ').toLowerCase();
  let tikzIndex = null;
  function partFor(list, kind) {
    if (!tikzIndex) {
      tikzIndex = CZ.order.map((k) => ({ k, kind: CZ.parts[k].kind, t: splitTop(CZ.parts[k].tikz, ',').map(norm) }));
      tikzIndex.sort((a, b) => b.t.length - a.t.length);
    }
    const L = list.map(norm);
    for (const e of tikzIndex) if (e.kind === kind && e.t.every((t, i) => L[i] === t)) return { key: e.k, rest: list.slice(e.t.length) };
    return null;
  }
  const unbrace = (v) => v.trim().replace(/^\{([\s\S]*)\}$/, '$1');
  function parse(src) {
    const items = [], raw = [];
    const text = String(src || '').replace(/(^|[^\\])%.*$/gm, '$1');
    const named = () => {
      const m = new Map();
      for (const it of items) if (it.name) for (const [n, q] of Object.entries(pinsOf(it))) { m.set(`${it.name}.${n}`, q); if (n === 'center') m.set(it.name, q); }
      return m;
    };
    const coord = (t, names) => {
      const m = /^\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*\)$/.exec(t.trim());
      if (m) return [+m[1], +m[2]];
      const n = /^\(\s*([^()]+?)\s*\)$/.exec(t.trim());
      if (n && names.has(n[1])) return names.get(n[1]).slice();
      return null;
    };
    for (let stmt of splitTop(text, ';')) {
      const orig = stmt.trim();
      if (!orig) continue;
      const got = readStmt(orig, coord, named);
      if (got) items.push(...got); else raw.push(orig + ';');
    }
    return { items, raw: raw.join('\n') };
  }
  // tokens of a path: (coord), [opts], {text}, words, --
  function tokens(s) {
    const out = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if ('([{'.includes(ch)) { const j = closeAt(s, i); if (j < 0) return null; out.push(s.slice(i, j + 1)); i = j + 1; continue; }
      if (s.startsWith('--', i)) { out.push('--'); i += 2; continue; }
      const m = /^\\?[A-Za-z]+/.exec(s.slice(i));
      if (!m) return null;
      out.push(m[0]); i += m[0].length;
    }
    return out;
  }
  function nodeFrom(optStr, name, p, txt) {
    const list = splitTop(optStr, ',').map((t) => t.trim()).filter(Boolean);
    const hit = partFor(list, 'node');
    if (!hit) return null;
    const it = { id: uid(), part: hit.key, p, rot: 0, flip: false, name: name || '', text: txt || '', opts: '' };
    const rest = [];
    for (const t of hit.rest) {
      const r = /^rotate\s*=\s*(-?[\d.]+)$/.exec(t);
      if (r) it.rot = ((+r[1] % 360) + 360) % 360;
      else if (/^xscale\s*=\s*-1$/.test(t)) it.flip = !it.flip;
      else rest.push(t);
    }
    it.opts = rest.join(', ');
    return it;
  }
  function readStmt(st, coord, named) {
    const T = tokens(st);
    if (!T || !T.length) return null;
    if (T[0] === '\\node') {
      // \node[opts] (name) at (x,y) {text}
      let k = 1, opt = '', name = '', p = null, txt = null;
      if (T[k] && T[k][0] === '[') opt = T[k++].slice(1, -1);
      if (T[k] && T[k][0] === '(') name = T[k++].slice(1, -1).trim();
      if (T[k] === 'at') { p = coord(T[k + 1] || '', named()); k += 2; }
      if (T[k] && T[k][0] === '{') txt = T[k++].slice(1, -1);
      if (k !== T.length || !p || txt == null) return null;
      const it = nodeFrom(opt, name, p, txt);
      return it ? [it] : null;
    }
    if (T[0] !== '\\draw' && T[0] !== '\\path') return null;
    const out = [];
    let names = named(), k = 1;
    let cur = coord(T[k++] || '', names);
    if (!cur) return null;
    while (k < T.length) {
      const t = T[k];
      if (t === 'node') {
        // \draw (x,y) node[opts] (name) {text}
        let opt = '', name = '', txt = null;
        k++;
        if (T[k] && T[k][0] === '[') opt = T[k++].slice(1, -1);
        if (T[k] && T[k][0] === '(') name = T[k++].slice(1, -1).trim();
        if (T[k] && T[k][0] === '{') txt = T[k++].slice(1, -1);
        if (txt == null) return null;
        const it = nodeFrom(opt, name, cur.slice(), txt);
        if (!it) return null;
        out.push(it);
        continue;
      }
      if (t === '--') {
        const q = coord(T[k + 1] || '', names);
        if (!q) return null;
        out.push({ id: uid(), part: 'short', a: cur, b: q, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' });
        cur = q; k += 2; continue;
      }
      if (t === 'to' && T[k + 1] && T[k + 1][0] === '[') {
        const list = splitTop(T[k + 1].slice(1, -1), ',').map((x) => x.trim()).filter(Boolean);
        const q = coord(T[k + 2] || '', names);
        const hit = partFor(list, 'bipole');
        if (!q || !hit) return null;
        const it = { id: uid(), part: hit.key, a: cur, b: q, l: '', ann: '', v: '', i: '', poles: '', name: '', opts: '' };
        const rest = [];
        for (const x of hit.rest) {
          const m = /^(l|a|v|i|n)\s*=\s*([\s\S]*)$/.exec(x);
          if (m) it[{ l: 'l', a: 'ann', v: 'v', i: 'i', n: 'name' }[m[1]]] = unbrace(m[2]);
          else if (/^[*o]?-[*o]?$/.test(x)) it.poles = x;
          else rest.push(x);
        }
        it.opts = rest.join(', ');
        out.push(it);
        if (it.name) names = new Map([...names, ...Object.entries(pinsOf(it)).map(([n, p]) => [`${it.name}.${n}`, p])]);
        cur = q; k += 3; continue;
      }
      return null;
    }
    return out.length ? out : null;
  }

  // ---------------------------------------------------------------- the block
  // a small default circuit: a source, a resistor and a capacitor in a loop
  function defaultItems() {
    const pick = (...keys) => keys.find((k) => CZ.parts[k]) || 'short';
    const B = (part, a, b, l) => ({ id: uid(), part, a, b, l: l || '', ann: '', v: '', i: '', poles: '', name: '', opts: '' });
    return [
      B(pick('src:vsource-eu', 'src:battery', 'src:vsource-us'), [0, 0], [0, 2], '$V$'),
      B(pick('res:iec', 'res:us'), [0, 2], [3, 2], '$R$'),
      B(pick('cap:iec', 'cap:c'), [3, 2], [3, 0], '$C$'),
      B('short', [3, 0], [0, 0]),
    ];
  }
  const cache = new Map();
  function layout(s) {
    const key = JSON.stringify([s.items, s.size, s.font, TD.math && TD.math.engine]);
    const hit = cache.get(key);
    if (hit) return hit;
    const b = itemsBox(s.items || [], { size: s.size, font: s.font });
    // in canvas px, relative to (s.x, s.y)
    const bb = b ? { x: b.x1 * PX, y: -b.y2 * PX, w: (b.x2 - b.x1) * PX, h: (b.y2 - b.y1) * PX } : { x: 0, y: 0, w: 4 * PX, h: 1.5 * PX };
    const L = { bb, empty: !b };
    if (TD.measuring && TD.measuring()) return L; // text sizes may be placeholders in a measuring pass: don't keep them
    if (cache.size > 200) cache.clear();
    cache.set(key, L);
    return L;
  }
  const clearText = TD.clearTextCache;
  TD.clearTextCache = () => { cache.clear(); clearText(); };

  function draw(s, ctx) {
    const L = layout(s), col = TD.css(s.color || '#000000'), bb = L.bb;
    let out;
    if (L.empty) {
      out = `<rect x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}" fill="none" stroke="${col}" stroke-dasharray="4 3" rx="4"/>`;
      if (!ctx.export) out += TD.textSvg('Empty circuit', { size: 'small', font: s.font }, '#888888', bb.x + bb.w / 2, bb.y + bb.h / 2, ctx);
    } else {
      out = itemsSvg(s.items, (x, y) => [x * PX, -y * PX], PX, { color: col, paper: ctx.paper || '#ffffff', ctx, st: { size: s.size || 'normalsize', font: s.font || 'default' } });
    }
    if (!ctx.export) out += `<rect class="hitfill" x="${r2(bb.x)}" y="${r2(bb.y)}" width="${r2(bb.w)}" height="${r2(bb.h)}"/>`;
    return `<g transform="translate(${r2(s.x)},${r2(s.y)})">${out}</g>`;
  }
  const fullCode = (s) => code(s.items || [], s.raw || '');

  TD.TYPES.cz = {
    name: 'Circuit',
    pts: [['x', 'y']],
    create(p, d) {
      const s = { type: 'cz', x: p.x, y: p.y, items: defaultItems(), raw: '', size: TD.BLOCK_SIZE, font: 'default', color: '#000000' };
      const bb = layout(s).bb; s.x = p.x - bb.x; s.y = p.y - bb.y; // top-left at the click
      return s;
    },
    drag(s, a, q) { const bb = layout(s).bb; s.x = q.x - bb.x; s.y = q.y - bb.y; },
    valid: () => true,
    handles: () => [],
    anchors(s) { const b = layout(s).bb, x = s.x + b.x, y = s.y + b.y; return [{ x, y: y + b.h / 2 }, { x: x + b.w, y: y + b.h / 2 }, { x: x + b.w / 2, y }, { x: x + b.w / 2, y: y + b.h }]; },
    samples(s) { const b = layout(s).bb; return [{ x: s.x + b.x, y: s.y + b.y }, { x: s.x + b.x + b.w, y: s.y + b.y + b.h }]; },
    svg: draw,
    // circuitikz parts draw straight into the picture, in a scope placed where the block is
    tikz(s, X) {
      X.pkgs.add('circuitikz');
      const body = fullCode(s);
      if (!body.trim()) return '';
      const o = [`shift={${X.c(s.x, s.y)}}`];
      if (TD.css(s.color || '#000000') !== '#000000') o.push(`color=${X.col(s.color)}`);
      o.push(...TD.textOpts({ size: s.size, font: s.font }, X)); // the labels' size, as on the canvas
      return `\\begin{scope}[${o.join(', ')}]\n${body.split('\n').map((l) => '  ' + l).join('\n')}\n\\end{scope}`;
    },
  };

  TD.panels = TD.panels || {};
  TD.panels.cz = {
    html(s) {
      const n = (s.items || []).filter((it) => !isWire(it)).length, w = (s.items || []).length - n;
      const raw = (s.raw || '').trim() ? (s.raw || '').trim().split('\n').length : 0;
      return `<div class="sec"><div class="sec-title">circuitikz <small>${n} part${n === 1 ? '' : 's'}, ${w} wire${w === 1 ? '' : 's'}</small></div>
        <div class="row"><button class="wide primary" data-act="editcz">Edit Circuit…</button></div>
        ${raw ? `<div class="help">${raw} line${raw === 1 ? '' : 's'} of code ${raw === 1 ? "isn't" : "aren't"} drawn here; ${raw === 1 ? 'it is' : 'they are'} exported as written.</div>` : ''}
        <div class="help">Double-click the circuit to edit it. Exported with <code>\\usepackage{circuitikz}</code>.</div></div>
        <div class="sec"><button class="wide" data-act="copycz">Copy circuitikz Code</button></div>`;
    },
    apply() { return false; },
    action(s, act) {
      if (act === 'editcz') { TD.czOpen && TD.czOpen(s.id); return; }
      if (act !== 'copycz') return;
      const txt = `\\begin{circuitikz}\n${fullCode(s)}\n\\end{circuitikz}\n`;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('circuitikz Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied circuitikz code';
    },
  };

  TD.cz = { pinsOf, nodeXf, bipXf, xfOf, itemsSvg, itemsBox, code, parse, layout, same, uid, isWire, NODE_R, RLEN, defaultItems };
})();
