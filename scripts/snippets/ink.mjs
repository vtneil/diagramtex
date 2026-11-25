// Ink-match scoring for the snippet corpus's comparison runner (compare.mjs), in Node: no browser, no network.
//
// Both pictures are PNGs at 100 px/cm (the LaTeX reference drawn by Ghostscript at 254 dpi, the app's picture by
// TD.app.pngOf at 254 dpi). Each is cut to its ink (dark, or clearly coloured, as tests/ink-match.js reads it) and
// the app's is slid over the reference to where they agree best (anchors at the corners and centre, then a
// hill-climb, coarse to fine). The scores are the repo's: the share of all ink pixels from both pictures that have
// ink of the other within r px (square neighbourhood), at r = 2, 5, 10 px = 0.2, 0.5, 1 mm. `fit` is the
// scale-free score of tests/ink-match.js (the app's picture fitted to the reference's box, 1% tolerance), for
// pictures right in shape but drawn at another size.
import fs from 'node:fs';
import { PNG } from 'pngjs';

const MAX_SIDE = 2400; // larger pictures are OR-pooled (and the radii shrink with them)
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** ink mask of a PNG (alpha composited on white): { w, h, m } */
export function maskOf(buf) {
  const { width: w, height: h, data } = PNG.sync.read(buf);
  const m = new Uint8Array(w * h);
  for (let i = 0; i < m.length; i++) {
    const a = data[4 * i + 3] / 255, k = 255 * (1 - a);
    const r = data[4 * i] * a + k, g = data[4 * i + 1] * a + k, b = data[4 * i + 2] * a + k;
    const lo = Math.min(r, g, b), hi = Math.max(r, g, b);
    m[i] = (r + g + b) / 3 < 200 || hi - lo > 45 ? 1 : 0;
  }
  return { w, h, m };
}

/** the mask cut to its ink, with the list of ink pixels; null when there is none */
export function crop(M) {
  let x0 = M.w, y0 = M.h, x1 = -1, y1 = -1;
  for (let y = 0; y < M.h; y++) {
    const o = y * M.w;
    for (let x = 0; x < M.w; x++) if (M.m[o + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y; }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1, m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) m.set(M.m.subarray((y0 + y) * M.w + x0, (y0 + y) * M.w + x0 + w), y * w);
  return withPoints({ w, h, m });
}

function withPoints(M) {
  let n = 0;
  for (let i = 0; i < M.m.length; i++) n += M.m[i];
  const xs = new Int32Array(n), ys = new Int32Array(n);
  for (let y = 0, k = 0; y < M.h; y++) for (let x = 0; x < M.w; x++) if (M.m[y * M.w + x]) { xs[k] = x; ys[k] = y; k++; }
  return { ...M, xs, ys, n };
}

/** resampled by k: OR over each output pixel's footprint when shrinking, nearest when growing */
export function resample(M, k) {
  const w = Math.max(1, Math.round(M.w * k)), h = Math.max(1, Math.round(M.h * k)), m = new Uint8Array(w * h);
  if (k < 1) {
    for (let i = 0; i < M.n; i++) m[Math.min(h - 1, Math.floor(M.ys[i] * k)) * w + Math.min(w - 1, Math.floor(M.xs[i] * k))] = 1;
  } else {
    for (let y = 0; y < h; y++) {
      const sy = Math.min(M.h - 1, Math.floor(y / k));
      for (let x = 0; x < w; x++) m[y * w + x] = M.m[sy * M.w + Math.min(M.w - 1, Math.floor(x / k))];
    }
  }
  return withPoints({ w, h, m });
}

/** square dilation by r, separable, independent of r in cost */
function dilate(M, r) {
  const { w, h, m } = M, t = new Uint8Array(w * h), out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const o = y * w;
    let c = 0;
    for (let x = 0; x <= Math.min(r, w - 1); x++) c += m[o + x];
    for (let x = 0; x < w; x++) {
      t[o + x] = c > 0 ? 1 : 0;
      if (x + r + 1 < w) c += m[o + x + r + 1];
      if (x - r >= 0) c -= m[o + x - r];
    }
  }
  for (let x = 0; x < w; x++) {
    let c = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) c += t[y * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = c > 0 ? 1 : 0;
      if (y + r + 1 < h) c += t[(y + r + 1) * w + x];
      if (y - r >= 0) c -= t[(y - r) * w + x];
    }
  }
  return out;
}

/** A's top-left placed at (dx, dy) in R's frame: the shares of ink that have ink of the other within r */
function agree(A, R, DA, DR, dx, dy) {
  let ma = 0, ml = 0;
  for (let i = 0; i < A.n; i++) {
    const x = A.xs[i] + dx, y = A.ys[i] + dy;
    if (x >= 0 && y >= 0 && x < R.w && y < R.h && DR[y * R.w + x]) ma++;
  }
  for (let i = 0; i < R.n; i++) {
    const x = R.xs[i] - dx, y = R.ys[i] - dy;
    if (x >= 0 && y >= 0 && x < A.w && y < A.h && DA[y * A.w + x]) ml++;
  }
  return { match: (ma + ml) / Math.max(1, A.n + R.n), app: ma / Math.max(1, A.n), ref: ml / Math.max(1, R.n) };
}

/** the offset where A agrees best with R at radius r: from the starts given, a hill-climb with shrinking steps */
function align(A, R, r, starts, steps) {
  const DA = dilate(A, r), DR = dilate(R, r), seen = new Map();
  const f = (dx, dy) => {
    const k = dx + ',' + dy;
    if (!seen.has(k)) seen.set(k, agree(A, R, DA, DR, dx, dy).match);
    return seen.get(k);
  };
  let best = null;
  for (const [dx, dy] of starts) { const v = f(dx, dy); if (!best || v > best.v) best = { dx, dy, v }; }
  for (const step of steps) {
    for (let moved = true, n = 0; moved && n < 200; n++) {
      moved = false;
      for (const [sx, sy] of DIRS) {
        const dx = best.dx + sx * step, dy = best.dy + sy * step, v = f(dx, dy);
        if (v > best.v + 1e-9) { best = { dx, dy, v }; moved = true; }
      }
    }
  }
  return best;
}

const anchors = (A, R) => {
  const xs = [0, Math.round((R.w - A.w) / 2), R.w - A.w], ys = [0, Math.round((R.h - A.h) / 2), R.h - A.h];
  return xs.flatMap((x) => ys.map((y) => [x, y]));
};
const r4 = (v) => +v.toFixed(4);

/** the overlay of A on R: dark both, red app only, blue reference only (as tests/ink-match.js) */
function overlay(A, R, dx, dy, maxSide = 1600) {
  const x0 = Math.min(0, dx), y0 = Math.min(0, dy), x1 = Math.max(R.w, dx + A.w), y1 = Math.max(R.h, dy + A.h);
  const k = Math.min(1, maxSide / Math.max(x1 - x0, y1 - y0));
  const W = Math.max(1, Math.ceil((x1 - x0) * k)), H = Math.max(1, Math.ceil((y1 - y0) * k));
  const a = new Uint8Array(W * H), l = new Uint8Array(W * H);
  for (let i = 0; i < A.n; i++) a[Math.min(H - 1, Math.floor((A.ys[i] + dy - y0) * k)) * W + Math.min(W - 1, Math.floor((A.xs[i] + dx - x0) * k))] = 1;
  for (let i = 0; i < R.n; i++) l[Math.min(H - 1, Math.floor((R.ys[i] - y0) * k)) * W + Math.min(W - 1, Math.floor((R.xs[i] - x0) * k))] = 1;
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) {
    const [r, g, b] = a[i] && l[i] ? [60, 60, 60] : a[i] ? [230, 40, 40] : l[i] ? [40, 90, 230] : [255, 255, 255];
    png.data[4 * i] = r; png.data[4 * i + 1] = g; png.data[4 * i + 2] = b; png.data[4 * i + 3] = 255;
  }
  return PNG.sync.write(png);
}

/**
 * Score an app picture against a reference picture (paths to PNGs, both at `refDpi`/`appDpi`, 254 by default).
 * Returns null scores (with `ink`) when either has no ink; writes the overlay to `overlayPath` when given.
 */
export function score(refPath, appPath, { refDpi = 254, appDpi = 254, overlayPath = null } = {}) {
  let R0 = crop(maskOf(fs.readFileSync(refPath))), A0 = crop(maskOf(fs.readFileSync(appPath)));
  if (!R0 || !A0) return { ink: { ref: !!R0, app: !!A0 } };
  // the same resolution for both: the finer one is pooled to the coarser
  if (refDpi < appDpi) A0 = resample(A0, refDpi / appDpi);
  else if (appDpi < refDpi) R0 = resample(R0, appDpi / refDpi);
  const dpi = Math.min(refDpi, appDpi), px = dpi / 254; // pixels per 0.1 mm-step unit (1 at 254 dpi)
  const out = { size_ref: [R0.w, R0.h], size_app: [A0.w, A0.h], scale: [r4(A0.w / R0.w), r4(A0.h / R0.h)] };
  // exact scale: pooled when large, a coarse search (4× smaller) then a fine one
  const f = Math.max(1, Math.ceil(Math.max(R0.w, R0.h, A0.w, A0.h) / MAX_SIDE));
  const A = f > 1 ? resample(A0, 1 / f) : A0, R = f > 1 ? resample(R0, 1 / f) : R0;
  const rad = (mm10) => Math.max(1, Math.round(mm10 * px / f)); // radius for 0.1·mm10 mm
  const Ac = resample(A, 1 / 4), Rc = resample(R, 1 / 4);
  const coarse = align(Ac, Rc, Math.max(1, Math.round(rad(5) / 4)), anchors(Ac, Rc), [16, 8, 4, 2, 1]);
  const fine = align(A, R, rad(2), [[coarse.dx * 4, coarse.dy * 4], ...anchors(A, R)], [4, 2, 1]);
  for (const mm10 of [2, 5, 10]) {
    const r = rad(mm10), s = agree(A, R, dilate(A, r), dilate(R, r), fine.dx, fine.dy);
    out['r' + mm10] = r4(s.match);
    if (mm10 === 5) { out.app5 = r4(s.app); out.ref5 = r4(s.ref); }
  }
  out.offset = [fine.dx * f, fine.dy * f];
  if (f > 1) out.pool = f;
  // scale-free: the reference at 320 px on its longer side, the app fitted into its box at a few scales
  const Rs = resample(R0, 320 / Math.max(R0.w, R0.h)), fit0 = Math.min(Rs.w / A0.w, Rs.h / A0.h);
  let best = null;
  for (const s of [0.8, 0.9, 1, 1.1, 1.25]) {
    const As = resample(A0, fit0 * s), b = align(As, Rs, 3, anchors(As, Rs), [8, 4, 2, 1]);
    if (!best || b.v > best.v) best = { ...b, s };
  }
  out.fit = r4(best.v); out.fit_scale = best.s;
  if (overlayPath) fs.writeFileSync(overlayPath, overlay(A, R, fine.dx, fine.dy));
  return out;
}
