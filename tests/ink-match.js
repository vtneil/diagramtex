// Injected into the test page: a scale-free ink match between a reference raster (a dataset image of unknown
// scale and margins) and the app's own PNG. Both are cut to their ink, the app's is fitted onto the reference's
// frame (a small scale/offset search absorbs margins and bounding-box differences) and scored the way
// docs/latex-parity/tools/match.py scores the exact-scale composites: the share of all ink pixels from both
// pictures that have ink of the other within r pixels. r is 1% of the frame's longer side.
(function () {
  const SIDE = 320;
  const load = (src) => new Promise((resolve, reject) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => reject(new Error('image did not load')); i.src = src; });
  function pixels(img, max) {
    const k = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
    return g.getImageData(0, 0, c.width, c.height);
  }
  // ink: dark, or clearly coloured (light fills such as red!20 count; JPEG noise on white does not)
  function mask(d) {
    const m = new Uint8Array(d.width * d.height);
    for (let i = 0; i < m.length; i++) {
      const r = d.data[4 * i], g = d.data[4 * i + 1], b = d.data[4 * i + 2];
      const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
      m[i] = (r + g + b) / 3 < 200 || hi - lo > 45 ? 1 : 0;
    }
    return { w: d.width, h: d.height, m };
  }
  function box(M) {
    let x0 = M.w, y0 = M.h, x1 = -1, y1 = -1;
    for (let y = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.m[y * M.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  // the masked box resampled into a W×H frame at scale k, its top-left at (ox, oy)
  function place(M, b, W, H, k, ox, oy) {
    const out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const sy = Math.floor((y - oy) / k);
      if (sy < 0 || sy >= b.h) continue;
      for (let x = 0; x < W; x++) {
        const sx = Math.floor((x - ox) / k);
        if (sx >= 0 && sx < b.w && M.m[(b.y + sy) * M.w + b.x + sx]) out[y * W + x] = 1;
      }
    }
    return out;
  }
  function dilate(m, W, H, r) {
    const h = new Uint8Array(W * H), out = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m[y * W + x]) for (let d = Math.max(0, x - r); d <= Math.min(W - 1, x + r); d++) h[y * W + d] = 1;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (h[y * W + x]) for (let d = Math.max(0, y - r); d <= Math.min(H - 1, y + r); d++) out[d * W + x] = 1;
    return out;
  }
  function score(A, L, W, H, r) {
    const DA = dilate(A, W, H, r), DL = dilate(L, W, H, r);
    let na = 0, nl = 0, ma = 0, ml = 0;
    for (let i = 0; i < W * H; i++) { if (A[i]) { na++; if (DL[i]) ma++; } if (L[i]) { nl++; if (DA[i]) ml++; } }
    return { match: (ma + ml) / Math.max(1, na + nl), app: ma / Math.max(1, na), ref: ml / Math.max(1, nl) };
  }
  // reference: data URL of the dataset image; app: PNG blob. Returns null when either has no ink.
  window.inkMatch = async function (reference, app) {
    const R = mask(pixels(await load(reference), 900)), P = mask(pixels(await load(URL.createObjectURL(app)), 1800));
    const rb = box(R), pb = box(P);
    if (!rb || !pb) return null;
    const f = SIDE / Math.max(rb.w, rb.h), W = Math.max(8, Math.round(rb.w * f)), H = Math.max(8, Math.round(rb.h * f));
    const L = place(R, rb, W, H, f, 0, 0), r = Math.max(2, Math.round(SIDE / 100));
    const fit = Math.min(W / pb.w, H / pb.h);
    let best = null;
    for (const s of [0.8, 0.9, 1, 1.1, 1.25]) {
      const k = fit * s, w = pb.w * k, h = pb.h * k;
      for (const fx of [0, 0.25, 0.5, 0.75, 1]) for (const fy of [0, 0.25, 0.5, 0.75, 1]) {
        const res = score(place(P, pb, W, H, k, (W - w) * fx, (H - h) * fy), L, W, H, r);
        if (!best || res.match > best.match) best = { ...res, scale: s, fx, fy };
      }
    }
    return { match: +best.match.toFixed(4), app: +best.app.toFixed(4), ref: +best.ref.toFixed(4), aspect: +((pb.w / pb.h) / (rb.w / rb.h)).toFixed(3) };
  };
  // Exact scale (both at 100 px/cm, cut to their registration dots): scores at 0.2, 0.5 and 1 mm, and an overlay
  // (dark both, red app only, blue reference only)
  window.inkMatchExact = async function (reference, app) {
    const R = mask(pixels(await load(reference), 1e9)), P = mask(pixels(await load(URL.createObjectURL(app)), 1e9));
    const rb = box(R), pb = box(P);
    if (!rb || !pb) return null;
    const W = rb.w, H = rb.h, L = place(R, rb, W, H, 1, 0, 0);
    const A = place(P, pb, W, H, Math.min(W / pb.w, H / pb.h), 0, 0);
    const out = { size: [W, H], sizeApp: [pb.w, pb.h] };
    for (const r of [2, 5, 10]) out['r' + r] = +score(A, L, W, H, r).match.toFixed(4);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), d = g.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const [r, gg, b] = A[i] && L[i] ? [60, 60, 60] : A[i] ? [230, 40, 40] : L[i] ? [40, 90, 230] : [255, 255, 255];
      d.data[4 * i] = r; d.data[4 * i + 1] = gg; d.data[4 * i + 2] = b; d.data[4 * i + 3] = 255;
    }
    g.putImageData(d, 0, 0);
    out.overlay = c.toDataURL('image/png');
    return out;
  };
})();
