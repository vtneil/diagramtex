// Test scenes for the parity harness. Each returns a list of shapes.
(function () {
  const mk = P.mk;
  const S = {};
  S.lines = () => {
    const L = [];
    TD.DASHES.forEach(([d], i) => L.push(mk('line', 'line', { x1: 0, y1: i * 20, x2: 160, y2: i * 20, dash: d, width: 1 })));
    TD.WIDTHS.forEach((w, i) => L.push(mk('line', 'line', { x1: 200, y1: i * 16, x2: 340, y2: i * 16, width: w })));
    TD.TIPS.map((t) => t[0]).filter((t) => t !== 'none').forEach((t, i) => {
      const col = Math.floor(i / 14), row = i % 14;
      L.push(mk('line', 'line', { x1: 380 + col * 120, y1: row * 16, x2: 470 + col * 120, y2: row * 16, endTip: t, width: 1 }));
    });
    L.push(mk('line', 'line', { x1: 0, y1: 170, x2: 160, y2: 170, shaft: 'double', endTip: 'stealth' }));
    L.push(mk('line', 'line', { x1: 0, y1: 195, x2: 160, y2: 195, shaft: 'wave', endTip: 'stealth' }));
    L.push(mk('line', 'line', { x1: 0, y1: 220, x2: 160, y2: 220, shaft: 'ticks' }));
    L.push(mk('line', 'line', { x1: 200, y1: 170, x2: 340, y2: 170, midTip: 'stealth', width: 1.5, stroke: '#d62728' }));
    L.push(mk('line', 'line', { x1: 200, y1: 200, x2: 340, y2: 200, startTip: 'latex', endTip: 'latex', width: 2, stroke: '#1e5bd6', opacity: 0.5 }));
    return L;
  };
  S.shapes = () => {
    const L = [];
    L.push(mk('rect', 'rect', { x: 0, y: 0, w: 100, h: 60, fill: '#9ecae1' }));
    L.push(mk('rect', 'rect', { x: 120, y: 0, w: 100, h: 60, radius: 12, stroke: '#d62728', width: 2, dash: 'dashed' }));
    L.push(mk('ellipse', 'ellipse', { cx: 290, cy: 30, rx: 50, ry: 30, fill: '#fdd0a2', opacity: 0.6 }));
    L.push(mk('ball', 'ball', { cx: 380, cy: 30, r: 25 }));
    L.push(mk('dot', 'dot', { cx: 430, cy: 30, r: 3 }));
    L.push(mk('arc', 'arc', { cx: 500, cy: 40, r: 40, a1: 20, a2: 160, endTip: 'stealth' }));
    L.push(mk('spring', 'spring', { x1: 0, y1: 110, x2: 200, y2: 110 }));
    L.push(mk('curve', 'curve', { x1: 230, y1: 120, cx1: 260, cy1: 70, cx2: 330, cy2: 160, x2: 380, y2: 100, endTip: 'latex' }));
    L.push(mk('poly', 'poly', { pts: [[400, 80], [460, 140], [520, 90], [560, 140]], endTip: 'to' }));
    L.push(mk('poly', 'poly', { pts: [[0, 170], [80, 170], [60, 230], [10, 220]], closed: true, fill: '#c7e9c0' }));
    TD.PATTERNS.forEach(([p], i) => L.push(mk('rect', 'rect', { x: 100 + i * 60, y: 170, w: 50, h: 50, fill: { p, color: '#1e5bd6' } })));
    TD.GRAD_PRESETS.slice(0, 6).concat(TD.GRAD_PRESETS.slice(8, 11)).forEach((g, i) => L.push(mk('rect', 'rect', { x: i * 62, y: 250, w: 52, h: 52, fill: g })));
    return L;
  };
  S.text = () => {
    const L = [], T = (o) => L.push(mk('text', 'text', o));
    T({ x: 0, y: 0, text: 'Plain text normalsize' });
    T({ x: 0, y: 40, text: '$\\displaystyle\\int_0^\\infty e^{-x^2}\\,dx = \\frac{\\sqrt{\\pi}}{2}$' });
    T({ x: 0, y: 100, text: '$\\vec F = q\\left(\\vec E + \\vec v \\times \\vec B\\right)$', size: 'large' });
    T({ x: 0, y: 140, text: '\\textbf{bold} \\textit{italic} \\texttt{mono}', size: 'small' });
    T({ x: 0, y: 170, text: 'Bold red Large', size: 'Large', bold: true, color: '#d62728' });
    T({ x: 0, y: 210, text: 'Sans text, tiny', size: 'tiny', font: 'cmss' });
    T({ x: 0, y: 230, text: 'Italic Huge', size: 'Huge', italic: true });
    T({ x: 300, y: 0, text: 'Times font', font: 'times' });
    T({ x: 300, y: 25, text: 'Arial font', font: 'arial' });
    T({ x: 300, y: 80, text: 'Wrapped paragraph text that should break over several lines in a fixed width box.', tw: 160 });
    T({ x: 300, y: 150, text: 'Half opacity', opacity: 0.5, size: 'large' });
    L.push(mk('line', 'line', { x1: 300, y1: 220, x2: 460, y2: 220, label: '$f(x)$', endTip: 'stealth' }));
    L.push(mk('line', 'line', { x1: 300, y1: 260, x2: 460, y2: 300, label: 'right side', labelSide: 'right', labelPos: 0.3 }));
    L.push(mk('sym', 'sym:rrect', { kind: 'rrect', x: 500, y: 0, w: 100, h: 50, text: 'Idea $x^2$', fill: '#e8f0fb' }));
    L.push(mk('sym', 'sym:diamond', { kind: 'diamond', x: 500, y: 80, w: 80, h: 60, text: '$?$' }));
    return L;
  };
  // edge labels on lines at many angles, both sides, and on a curve
  S.labels = () => {
    const L = [];
    for (let k = 0; k < 8; k++) {
      const a = (k * 45 + 20) * Math.PI / 180, cx = 90 + (k % 4) * 170, cy = 70 + Math.floor(k / 4) * 160;
      const dx = Math.cos(a) * 55, dy = -Math.sin(a) * 55;
      L.push(mk('line', 'line', { x1: cx - dx, y1: cy - dy, x2: cx + dx, y2: cy + dy, endTip: 'stealth', label: '$\\alpha_' + k + '$', labelSide: k % 2 ? 'right' : 'left' }));
    }
    L.push(mk('line', 'line', { x1: 20, y1: 330, x2: 200, y2: 330, label: 'on the line', labelSide: 'on' }));
    L.push(mk('line', 'line', { x1: 260, y1: 300, x2: 260, y2: 380, label: 'vertical' }));
    L.push(mk('curve', 'curve', { x1: 340, y1: 360, cx1: 380, cy1: 280, cx2: 480, cy2: 400, x2: 560, y2: 320, endTip: 'latex', label: '$\\gamma(t)$', labelPos: 0.35 }));
    return L;
  };
  window.SC = S;
  window.go = async (name, list) => {
    list = list || S[name]();
    TD.state.doc.shapes = list.map((s) => ({ ...s })); TD.app.render();
    return JSON.stringify(await P.run(name, list));
  };
})();
(function () {
  // every library symbol of the given categories, in a grid at its natural size (rotated / filled variants added)
  SC.syms = (cats) => {
    const L = []; let i = 0;
    for (const c of cats) for (const k of TD.SYM_CATS[c]) {
      const s = P.mk('sym', 'sym:' + k, {}); s.kind = k;
      s.x = (i % 10) * 110; s.y = Math.floor(i / 10) * 100; TD.TYPES.sym.fix(s);
      const sc = Math.min(1, 90 / s.w, 80 / s.h); s.w *= sc; s.h *= sc;
      if (s.fill !== undefined && i % 3 === 0) s.fill = '#cfe3f7';
      if ('text' in s && i % 4 === 1) s.text = 'Ab';
      L.push(s); i++;
    }
    return L;
  };
})();
(function () {
  // one plot preset per scene (plots are big): tool 'plot:<preset>'
  SC.plot = (preset, o) => [Object.assign(P.mk('plot', 'plot:' + preset, {}), { x: 0, y: 0 }, o || {})];
  SC.pie = () => [P.mk('pie', 'pie', { cx: 0, cy: 0, r: 70 }), P.mk('pie', 'pie', { cx: 260, cy: 0, r: 60, labelPos: 'inside', showPercent: false, startAngle: 0 })];
})();
(function () {
  // 3D figures: several presets of one type side by side
  SC.fig3d = (type, presets) => {
    let x = 0; return presets.map((p) => { const s = P.mk(type, type + ':' + p, {}); s.x = x; s.y = 0; TD.TYPES[type].fix(s); x += s.w + 30; return s; });
  };
  // a block at the origin with its default content (or src override)
  SC.block = (type, o) => { const s = P.mk(type, type, o || {}); if (TD.TYPES[type].fix) TD.TYPES[type].fix(s); s.x = 0; s.y = 0; Object.assign(s, o || {}); return [s]; };
})();
