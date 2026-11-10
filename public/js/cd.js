// XyMatrix / commutative diagrams: a grid of LaTeX cells plus arrows between cells.
// Exported as named TikZ nodes + \draw ... to[bend] (also available as tikz-cd).
(function () {
  const TD = window.TD;
  const { r2, esc, norm } = TD.util;
  const f = TD.fmt;
  const INNER = 4.2; // ≈ TikZ inner sep 0.3333em at 10pt, in px

  const STYLES = [
    ['->', '→ arrow'], ['->>', '↠ two heads'], ['hook', '↪ hook'], ['mapsto', '↦ maps to'],
    ['dashed', '⇢ dashed'], ['=', '= equal'], ['<->', '↔ both'], ['-', '— line'],
  ];
  TD.CD_STYLES = STYLES;

  function cells(s) {
    return String(s.src || '').split(/\\\\/).map((row) => row.split('&').map((c) => c.trim()));
  }
  const cellPos = (s, r, c) => ({ x: s.x + c * s.colSep, y: s.y + r * s.rowSep });
  function cellBox(s, grid, r, c) {
    const t = grid[r] && grid[r][c];
    const P = cellPos(s, r, c);
    if (!t) return { ...P, w: 0, h: 0, empty: true };
    const b = TD.textBox(t, s);
    return { ...P, w: b.w / 2 + INNER, h: b.h / 2 + INNER * 0.6 };
  }
  // point on the border of box B in direction d from its centre
  function border(B, d) {
    if (B.empty) return { x: B.x, y: B.y };
    const tx = Math.abs(d.x) > 1e-9 ? B.w / Math.abs(d.x) : Infinity;
    const ty = Math.abs(d.y) > 1e-9 ? B.h / Math.abs(d.y) : Infinity;
    const t = Math.min(tx, ty);
    return { x: B.x + d.x * t, y: B.y + d.y * t };
  }
  // rotate a screen-space direction by θ degrees counter-clockwise as seen in TikZ (y up)
  const rot = (u, deg) => { const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a); return { x: u.x * c + u.y * sn, y: -u.x * sn + u.y * c }; };

  // geometry of arrow a: cubic from P0 to P3
  function arrowGeom(s, grid, a) {
    const A = cellBox(s, grid, a.r1, a.c1), B = cellBox(s, grid, a.r2, a.c2);
    const u = norm({ x: B.x - A.x, y: B.y - A.y });
    const th = a.bend || 0;
    const dA = rot(u, th), dB = rot({ x: -u.x, y: -u.y }, -th);
    const P0 = border(A, dA), P3 = border(B, dB);
    const L = 0.3915 * Math.hypot(P3.x - P0.x, P3.y - P0.y);
    return { P0, P1: { x: P0.x + dA.x * L, y: P0.y + dA.y * L }, P2: { x: P3.x + dB.x * L, y: P3.y + dB.y * L }, P3 };
  }
  const bez = (g, t) => {
    const m = 1 - t;
    return {
      x: m * m * m * g.P0.x + 3 * m * m * t * g.P1.x + 3 * m * t * t * g.P2.x + t * t * t * g.P3.x,
      y: m * m * m * g.P0.y + 3 * m * m * t * g.P1.y + 3 * m * t * t * g.P2.y + t * t * t * g.P3.y,
    };
  };
  const bezTan = (g, t) => {
    const m = 1 - t;
    return norm({
      x: 3 * m * m * (g.P1.x - g.P0.x) + 6 * m * t * (g.P2.x - g.P1.x) + 3 * t * t * (g.P3.x - g.P2.x),
      y: 3 * m * m * (g.P1.y - g.P0.y) + 6 * m * t * (g.P2.y - g.P1.y) + 3 * t * t * (g.P3.y - g.P2.y),
    });
  };
  const validArrow = (grid, a) => grid[a.r1] && a.c1 < Math.max(...grid.map((r) => r.length)) && grid[a.r2] && !(a.r1 === a.r2 && a.c1 === a.c2);
  const P = (q) => `${r2(q.x)},${r2(q.y)}`;

  function arrowSvg(s, grid, a, ctx) {
    const g = arrowGeom(s, grid, a);
    const col = TD.css(s.color || '#000000'), w = s.width || 0.6 / TD.PT_PER_PX;
    const st = a.style || '->';
    const endU = bezTan(g, 1), startU = bezTan(g, 0);
    let out = '';
    // tips
    const head = st === '-' || st === '=' ? null : 'to';
    let endBack = 0, startBack = 0;
    if (head) {
      const t1 = TD.tip('to', g.P3, endU, w, col);
      out += t1.svg; endBack = t1.back;
      if (st === '->>') { const Q = { x: g.P3.x - endU.x * 3.5, y: g.P3.y - endU.y * 3.5 }; out += TD.tip('to', Q, endU, w, col).svg; }
    }
    if (st === '<->') { const t0 = TD.tip('to', g.P0, { x: -startU.x, y: -startU.y }, w, col); out += t0.svg; startBack = t0.back; }
    if (st === 'mapsto') out += TD.tip('bar', g.P0, { x: -startU.x, y: -startU.y }, w, col).svg;
    if (st === 'hook') {
      const n = { x: startU.y, y: -startU.x }; // right of direction (screen)... hook curls to the right-hand side in TikZ “right hook”
      const r = 2.6;
      const C = { x: g.P0.x + n.x * r, y: g.P0.y + n.y * r };
      const E = { x: g.P0.x + 2 * n.x * r, y: g.P0.y + 2 * n.y * r };
      out += `<path d="M${P(g.P0)}A${r},${r} 0 0,${n.x * startU.y - n.y * startU.x > 0 ? 1 : 0} ${P(E)}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round"/>`;
      void C;
    }
    const P3b = { x: g.P3.x - endU.x * endBack, y: g.P3.y - endU.y * endBack };
    const P0b = { x: g.P0.x + startU.x * startBack, y: g.P0.y + startU.y * startBack };
    const d = `M${P(P0b)}C${P(g.P1)} ${P(g.P2)} ${P(P3b)}`;
    const dash = st === 'dashed' ? ` stroke-dasharray="${r2(3 / TD.PT_PER_PX)} ${r2(3 / TD.PT_PER_PX)}"` : '';
    if (st === '=') {
      out = `<path d="${d}" fill="none" stroke="${col}" stroke-width="${r2(w * 2 + 2.1)}"/><path d="${d}" fill="none" stroke="#fff" stroke-width="2.1"/>` + out;
    } else out = `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}"${dash}/>` + out;
    if (!ctx.export) out += `<path class="hit" d="M${P(g.P0)}C${P(g.P1)} ${P(g.P2)} ${P(g.P3)}" stroke-width="${ctx.hit}"/>`;
    if (a.label) {
      const M = bez(g, 0.5), u = bezTan(g, 0.5);
      const L = TD.labelPlace({ label: a.label, labelSide: a.side === 'right' ? 'right' : 'left', size: s.labelSize || 'small', font: s.font }, M, u);
      out += TD.textSvg(a.label, { size: s.labelSize || 'small', font: s.font }, s.color || '#000000', L.x, L.y, ctx);
    }
    return out;
  }

  TD.TYPES.cd = {
    name: 'Commutative diagram',
    pts: [['x', 'y']],
    create: (p, d) => ({
      type: 'cd', x: p.x, y: p.y, src: '$A$ & $B$ \\\\ $C$ & $D$', colSep: 80, rowSep: 60, size: TD.BLOCK_SIZE, labelSize: 'small',
      font: 'default', color: '#000000', width: 0.6 / TD.PT_PER_PX,
      arrows: [
        { r1: 0, c1: 0, r2: 0, c2: 1, label: '$f$', side: 'left', style: '->', bend: 0 },
        { r1: 0, c1: 0, r2: 1, c2: 0, label: '$g$', side: 'right', style: '->', bend: 0 },
        { r1: 0, c1: 1, r2: 1, c2: 1, label: '$h$', side: 'left', style: '->', bend: 0 },
        { r1: 1, c1: 0, r2: 1, c2: 1, label: '$k$', side: 'right', style: '->', bend: 0 },
      ],
    }),
    drag(s, a, q) { s.x = q.x; s.y = q.y; },
    valid: () => true,
    handles(s) {
      const grid = cells(s), out = [];
      grid.forEach((row, r) => row.forEach((t, c) => {
        const b = cellBox(s, grid, r, c);
        out.push({ k: `cell:${r}:${c}`, x: b.x, y: b.y + Math.max(b.h, 4) + 5, ctrl: true });
      }));
      const nr = grid.length, nc = Math.max(...grid.map((r) => r.length));
      out.push({ k: 'sep', x: s.x + (nc - 1) * s.colSep + 16, y: s.y + (nr - 1) * s.rowSep + 16 });
      return out;
    },
    setHandle(s, k, q, e, o) {
      const grid = cells(s);
      if (k === 'sep') {
        const nr = grid.length, nc = Math.max(...grid.map((r) => r.length));
        if (nc > 1) s.colSep = Math.max(20, Math.round((q.x - 16 - s.x) / (nc - 1) / 5) * 5);
        if (nr > 1) s.rowSep = Math.max(20, Math.round((q.y - 16 - s.y) / (nr - 1) / 5) * 5);
        return;
      }
      const [, r1, c1] = k.split(':').map(Number);
      // nearest cell to the pointer
      let best = null, bd = Math.min(s.colSep, s.rowSep) * 0.45;
      grid.forEach((row, r) => row.forEach((t, c) => {
        const p = cellPos(s, r, c), d = Math.hypot(p.x - q.x, p.y - q.y);
        if (d < bd) { bd = d; best = { r, c }; }
      }));
      s._drag = { r1, c1, x: q.x, y: q.y };
      if (best && !(best.r === r1 && best.c === c1)) {
        s._drag = null;
        s.arrows = [...o.arrows, { r1, c1, r2: best.r, c2: best.c, label: '', side: 'left', style: '->', bend: 0 }];
      }
    },
    endHandle(s) { delete s._drag; },
    anchors(s) {
      const grid = cells(s);
      return grid.flatMap((row, r) => row.map((t, c) => cellPos(s, r, c)));
    },
    samples(s) {
      const grid = cells(s), out = [];
      grid.forEach((row, r) => row.forEach((t, c) => { const b = cellBox(s, grid, r, c); out.push({ x: b.x - b.w, y: b.y - b.h }, { x: b.x + b.w, y: b.y + b.h }); }));
      for (const a of s.arrows || []) {
        if (!validArrow(grid, a) || !a.bend) continue;
        const g = arrowGeom(s, grid, a);
        out.push(bez(g, 0.5));
      }
      return out;
    },
    svg(s, ctx) {
      const grid = cells(s);
      let out = '';
      grid.forEach((row, r) => row.forEach((t, c) => {
        if (!t) return;
        const p = cellPos(s, r, c);
        out += TD.textSvg(t, s, s.color || '#000000', p.x, p.y, ctx);
      }));
      for (const a of s.arrows || []) if (validArrow(grid, a)) out += arrowSvg(s, grid, a, ctx);
      if (s._drag) {
        const p = cellPos(s, s._drag.r1, s._drag.c1);
        out += `<path d="M${P(p)}L${P(s._drag)}" stroke="#1e88e5" stroke-width="1" stroke-dasharray="4 3" fill="none"/>`;
      }
      return out;
    },
    tikz(s, X) {
      const grid = cells(s), id = X.uid();
      const name = (r, c) => `${id}-${r}-${c}`;
      const out = [];
      const to = TD.textOpts(s, X);
      const nc = Math.max(...grid.map((r) => r.length));
      grid.forEach((row, r) => { for (let c = 0; c < nc; c++) {
        const t = row[c], p = cellPos(s, r, c);
        if (t) out.push(`\\node${to.length ? `[${to.join(', ')}]` : ''} (${name(r, c)}) at ${X.c(p.x, p.y)} {${TD.tikzText(t)}};`);
        else out.push(`\\coordinate (${name(r, c)}) at ${X.c(p.x, p.y)};`);
      } });
      const col = X.col(s.color || '#000000');
      for (const a of s.arrows || []) {
        if (!validArrow(grid, a)) continue;
        const o = [];
        switch (a.style || '->') {
          case '->': o.push('->'); break;
          case '->>': o.push('->>'); break;
          case 'hook': o.push('right hook->'); break;
          case 'mapsto': o.push('|->'); break;
          case 'dashed': o.push('->', 'dashed'); break;
          case '=': o.push('-', 'double', 'double distance=1.5pt'); break;
          case '<->': o.push('<->'); break;
          default: o.push('-');
        }
        if (col !== 'black') o.push(`draw=${col}`);
        o.push(`line width=${X.pt(s.width || 0.6 / TD.PT_PER_PX)}`);
        const bend = a.bend ? `[bend ${a.bend > 0 ? 'left' : 'right'}=${f(Math.abs(a.bend))}]` : '';
        let lab = '';
        if (a.label) {
          const lo = ['auto'];
          if (a.side === 'right') lo.push('swap');
          lo.push(...TD.textOpts({ size: s.labelSize || 'small', font: s.font, color: s.color }, X));
          lab = ` node[${lo.join(', ')}] {${TD.tikzText(a.label)}}`;
        }
        out.push(`\\draw[${o.join(', ')}] (${name(a.r1, a.c1)}) to${bend}${lab} (${name(a.r2, a.c2)});`);
      }
      return out.join('\n');
    },
  };

  // tikz-cd source for the clipboard
  TD.cdToTikzcd = function (s) {
    const grid = cells(s);
    const nc = Math.max(...grid.map((r) => r.length));
    const STY = { '->': '', '->>': 'two heads', hook: 'hook', mapsto: 'mapsto', dashed: 'dashed', '=': 'equal', '<->': 'leftrightarrow', '-': 'dash' };
    const rows = grid.map((row, r) => {
      const cols = [];
      for (let c = 0; c < nc; c++) {
        let t = row[c] || '';
        // cells are in math mode in tikz-cd: strip a single $...$ wrapper
        const m = t.match(/^\$([^$]*)\$$/);
        t = m ? m[1] : t ? `\\text{${t}}` : '';
        for (const a of s.arrows || []) {
          if (a.r1 !== r || a.c1 !== c || !validArrow(grid, a)) continue;
          const dr = a.r2 - a.r1, dc = a.c2 - a.c1;
          const dir = (dr > 0 ? 'd' : 'u').repeat(Math.abs(dr)) + (dc > 0 ? 'r' : 'l').repeat(Math.abs(dc));
          const o = [dir];
          if (a.label) { const lm = a.label.match(/^\$([^$]*)\$$/); o.push(`"${lm ? lm[1] : `\\text{${a.label}}`}"${a.side === 'right' ? "'" : ''}`); }
          if (STY[a.style]) o.push(STY[a.style]);
          if (a.bend) o.push(`bend ${a.bend > 0 ? 'left' : 'right'}=${f(Math.abs(a.bend))}`);
          t += ` \\arrow[${o.join(', ')}]`;
        }
        cols.push(t);
      }
      return '  ' + cols.join(' & ');
    });
    return `% \\usepackage{tikz-cd}\n\\begin{tikzcd}[column sep={${f(s.colSep / TD.PX_PER_CM)}cm,between origins}, row sep={${f(s.rowSep / TD.PX_PER_CM)}cm,between origins}]\n${rows.join(' \\\\\n')}\n\\end{tikzcd}\n`;
  };

  // property panel
  const row = (label, ctl) => `<div class="row"><label>${label}</label><div class="ctl">${ctl}</div></div>`;
  TD.panels = TD.panels || {};
  TD.panels.cd = {
    html(s) {
      const grid = cells(s);
      let h = `<div class="sec"><div class="sec-title">Cells</div>
        <div class="row col"><label>Rows separated by <code>\\\\</code>, columns by <code>&amp;</code></label><textarea data-p="src" spellcheck="false">${esc(s.src)}</textarea></div>
        ${row('Column sep', `<input type="number" data-p="colSep" step="0.25" min="0.5" value="${r2(s.colSep / TD.PX_PER_CM)}"><span class="val">cm</span>`)}
        ${row('Row sep', `<input type="number" data-p="rowSep" step="0.25" min="0.5" value="${r2(s.rowSep / TD.PX_PER_CM)}"><span class="val">cm</span>`)}
        ${row('Label size', `<select data-p="labelSize">${TD.SIZES.map((z) => `<option value="${z[0]}"${z[0] === s.labelSize ? ' selected' : ''}>\\${z[0]}</option>`).join('')}</select>`)}
        <div class="help">Drag from the orange dot under a cell onto another cell to add an arrow.</div></div>`;
      h += `<div class="sec"><div class="sec-title">Arrows</div>`;
      (s.arrows || []).forEach((a, i) => {
        const nm = (r, c) => { const t = grid[r] && grid[r][c]; return esc(t ? t.replace(/\$/g, '') : `(${r},${c})`); };
        h += `<div class="arrow-item"><div class="ai-head"><span>${nm(a.r1, a.c1)} → ${nm(a.r2, a.c2)}</span>
          <button class="mini" data-act="rev" data-i="${i}" title="Reverse">⇄</button><button class="mini" data-act="rmarrow" data-i="${i}" title="Remove">✕</button></div>
          ${row('Label', `<input type="text" data-i="${i}" data-ak="label" value="${esc(a.label)}" placeholder="$f$">`)}
          ${row('Side', `<select data-i="${i}" data-ak="side"><option value="left"${a.side !== 'right' ? ' selected' : ''}>Left</option><option value="right"${a.side === 'right' ? ' selected' : ''}>Right</option></select>`)}
          ${row('Style', `<select data-i="${i}" data-ak="style">${STYLES.map(([k, l]) => `<option value="${esc(k)}"${k === a.style ? ' selected' : ''}>${l}</option>`).join('')}</select>`)}
          ${row('Bend', `<input type="number" data-i="${i}" data-ak="bend" step="10" value="${a.bend || 0}"><span class="val">°</span>`)}</div>`;
      });
      if (!(s.arrows || []).length) h += `<div class="help">No arrows yet.</div>`;
      h += `</div><div class="sec"><button class="wide" data-act="copycd">Copy as tikz-cd</button></div>`;
      return h;
    },
    apply(s, t) {
      if (t.dataset.p) {
        const k = t.dataset.p;
        if (k === 'colSep' || k === 'rowSep') { const v = parseFloat(t.value); if (v > 0) s[k] = v * TD.PX_PER_CM; return false; }
        s[k] = t.value;
        return false;
      }
      if (t.dataset.ak) {
        const a = s.arrows[+t.dataset.i], k = t.dataset.ak;
        a[k] = k === 'bend' ? parseFloat(t.value) || 0 : t.value;
      }
      return false;
    },
    action(s, act, i) {
      if (act === 'rmarrow') s.arrows.splice(i, 1);
      if (act === 'rev') { const a = s.arrows[i]; [a.r1, a.c1, a.r2, a.c2] = [a.r2, a.c2, a.r1, a.c1]; a.bend = -(a.bend || 0); }
      if (act === 'copycd') {
        const txt = TD.cdToTikzcd(s);
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('tikz-cd Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
        return 'Copied tikz-cd code';
      }
    },
  };
})();
