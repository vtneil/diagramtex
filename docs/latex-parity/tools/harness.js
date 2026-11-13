// Parity harness: window.P.run(name, list) -> exports TikZ via TD.toTikz, compiles on the sink server,
// renders the app's PNG via TD.app.pngOf, composes [app | LaTeX | overlay] and saves it.
(function () {
  const DPI = 254; // 100 px per cm
  const D = { stroke: '#000000', fill: null, width: 1, dash: 'solid', color: '#000000', size: 'normalsize', font: 'default', ballColor: '#a05a5a' };
  let n = 0;
  const mk = (type, tool, o) => ({ id: 'p' + (++n), ...TD.TYPES[type].create({ x: 0, y: 0 }, D, tool || type), ...o });
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  function pixels(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0);
    return g.getImageData(0, 0, c.width, c.height);
  }
  function trim(d) { // bbox of non-white pixels
    let x0 = d.width, y0 = d.height, x1 = -1, y1 = -1;
    for (let y = 0; y < d.height; y++) for (let x = 0; x < d.width; x++) {
      const k = (y * d.width + x) * 4;
      if (d.data[k] < 235 || d.data[k + 1] < 235 || d.data[k + 2] < 235) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    }
    return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function crop(d, b) {
    const c = document.createElement('canvas'); c.width = b.w; c.height = b.h;
    const g = c.getContext('2d'); const t = document.createElement('canvas'); t.width = d.width; t.height = d.height;
    t.getContext('2d').putImageData(d, 0, 0); g.drawImage(t, -b.x0, -b.y0); return c;
  }
  async function run(name, list, { reg = true, engine } = {}) {
    list = list.map((s) => ({ id: s.id || 'p' + (++n), ...s }));
    let full = list;
    if (reg) { // registration dots at the outer corners so both pictures crop to the same frame
      const pts = list.flatMap((s) => { const q = TD.bbox(s); return [{ x: q.x, y: q.y }, { x: q.x + q.w, y: q.y + q.h }]; });
      const b = TD.bboxOf(pts, 0);
      full = [...list, mk('dot', 'dot', { cx: b.x - 16, cy: b.y - 16, r: 2 }), mk('dot', 'dot', { cx: b.x + b.w + 16, cy: b.y + b.h + 16, r: 2 })];
    }
    const { result: tex, files } = TD.texImages.collect(() => TD.toTikz(full, { standalone: true }));
    // pictures the code names go next to it, as the .zip for a setup without Inkscape has them (an SVG with
    // its PDF, and the LaTeX set to use that)
    for (const e of await TD.app.texFiles(files, TD.texImages.svgFallback, true)) await fetch('/__parity/' + e.name, { method: 'PUT', body: e.data });
    const r = await (await fetch('/__parity/tex/' + name, { method: 'POST', body: TD.texImages.noInkscape(tex), headers: engine ? { 'X-Engine': engine } : {} })).json();
    if (!r.ok) return { name, error: r.log.slice(-1500) };
    const appBlob = await TD.app.pngOf(full, DPI, false);
    await fetch('/__parity/' + name + '.app.png', { method: 'PUT', body: appBlob });
    const A = pixels(await load(URL.createObjectURL(appBlob)));
    const L = pixels(await load(URL.createObjectURL(await (await fetch('/__parity/' + name + '.tex.png', { cache: 'no-store' })).blob())));
    const ba = trim(A), bl = trim(L);
    const ca = crop(A, ba), cl = crop(L, bl);
    const W = Math.max(ba.w, bl.w), H = Math.max(ba.h, bl.h), gap = 30, top = 28;
    const c = document.createElement('canvas'); c.width = W * 3 + gap * 4; c.height = H + top + gap;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#888'; g.font = '16px sans-serif';
    g.fillText('App (SVG canvas)', gap, 20); g.fillText('LaTeX (pdflatex)', W + gap * 2, 20); g.fillText('Overlay: red = app only, blue = LaTeX only', W * 2 + gap * 3, 20);
    g.strokeStyle = '#ddd'; [0, 1, 2].forEach((i) => g.strokeRect(gap + i * (W + gap) - 0.5, top - 0.5, W + 1, H + 1));
    g.drawImage(ca, gap, top); g.drawImage(cl, W + gap * 2, top);
    // overlay
    const da = ca.getContext('2d').getImageData(0, 0, ca.width, ca.height), dl = cl.getContext('2d').getImageData(0, 0, cl.width, cl.height);
    const o = g.createImageData(W, H); let ink = 0, only = 0;
    const lum = (d, x, y) => (x < d.width && y < d.height) ? (() => { const k = (y * d.width + x) * 4; return (d.data[k] + d.data[k + 1] + d.data[k + 2]) / 3; })() : 255;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = lum(da, x, y) < 200, l = lum(dl, x, y) < 200, k = (y * W + x) * 4;
      const [R, G2, B] = a && l ? [60, 60, 60] : a ? [230, 40, 40] : l ? [40, 90, 230] : [255, 255, 255];
      o.data[k] = R; o.data[k + 1] = G2; o.data[k + 2] = B; o.data[k + 3] = 255;
      if (a || l) { ink++; if (a !== l) only++; }
    }
    g.putImageData(o, W * 2 + gap * 3, top);
    const blob = await new Promise((r2) => c.toBlob(r2, 'image/png'));
    await fetch('/__parity/' + name + '.cmp.png', { method: 'PUT', body: blob });
    return { name, app: [ba.w, ba.h], tex: [bl.w, bl.h], mismatch: Math.round((only / Math.max(1, ink)) * 1000) / 10 + '%' };
  }
  async function img(n) { return pixels(await load(URL.createObjectURL(await (await fetch('/__parity/' + n, { cache: 'no-store' })).blob()))); }
  // side-by-side zoom of a region (trimmed-frame coords, px at 100px/cm): app left, LaTeX right
  async function zoom(name, x, y, w, h, k = 2, out) {
    const A = await img(name + '.app.png'), L = await img(name + '.tex.png');
    const ca = crop(A, trim(A)), cl = crop(L, trim(L));
    const c = document.createElement('canvas'); const gap = 20; c.width = (w * 2) * k + gap * 3; c.height = h * k + gap * 2;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.imageSmoothingEnabled = false;
    g.fillStyle = '#888'; g.font = '13px sans-serif'; g.fillText('app', gap, 14); g.fillText('LaTeX', gap * 2 + w * k, 14);
    g.drawImage(ca, x, y, w, h, gap, gap, w * k, h * k); g.drawImage(cl, x, y, w, h, gap * 2 + w * k, gap, w * k, h * k);
    g.strokeStyle = '#ccc'; g.strokeRect(gap - .5, gap - .5, w * k + 1, h * k + 1); g.strokeRect(gap * 2 + w * k - .5, gap - .5, w * k + 1, h * k + 1);
    const blob = await new Promise((r2) => c.toBlob(r2, 'image/png'));
    await fetch('/__parity/' + (out || name + '.zoom') + '.png', { method: 'PUT', body: blob }); return 'ok';
  }
  window.P = { run, mk, D, zoom };
})();
