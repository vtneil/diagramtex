// A palette item shows all of its drawing and all of its name.
//
// The drawing: its viewBox comes from the block's own layout, which measures letters and maths from estimates; set
// glyphs (C, O, \mathbb{Z}) and some strokes reach past it, and an <svg> clips what lies outside its box. Once the
// drawing is shown, this measures what it really draws (its shapes' boxes on screen, cut to any clip path they are
// drawn inside) and widens the viewBox to hold it, then sizes it again
// inside the bounds fitMini gave (data-fit="maxW maxH top"), so every drawing keeps the palette's weight. A drawing that
// already fits is left exactly as it is.
//
// The name wraps (CSS); a single word wider than the name's room (Cyclopentane in a narrow tile) would break in the
// middle, since browsers don't reliably hyphenate, so that name's text is made smaller until its longest word fits,
// never below 10px. Names are measured again when the palette changes width (2 columns, 1).
//
// Hidden items (a folded category) have no geometry yet, so each drawing and name waits for its first size (a
// ResizeObserver) and is then let go before anything is resized: resizing what an observer still watches, inside its
// callback, is a "ResizeObserver loop" (an error in WebKit). A change of columns is heard from the palette's list
// instead, a scroller whose box does not change with what it holds. What is measured before the fonts arrive is
// measured again once they have.

const PAD_PX = 1; // room round the measured drawing, in screen px, for strokes (most engines leave them out of a box)
const MIN_TEXT_PX = 10;

const NAME = ':scope > span:last-child:not(.qe-fig)';
let observer: ResizeObserver | null = null;
let lists: ResizeObserver | null = null;
const listWidth = new WeakMap<Element, number>();
let fontsHeard = false;
function watcher() {
  observer ??= new ResizeObserver((entries) => {
    const shown = entries.filter((e) => e.contentRect.width || e.contentRect.height).map((e) => e.target);
    for (const el of shown) observer!.unobserve(el); // let go first: nothing watched is resized below
    for (const el of shown) {
      const run = el instanceof SVGSVGElement ? () => fitSvg(el) : (again = false) => fitName(el as HTMLElement, again);
      run();
      if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (el.isConnected) run(true); });
      if (!(el instanceof SVGSVGElement)) names.add(el as HTMLElement);
    }
  });
  // A font can start loading after a name was fitted (Thai text in Sarabun is fetched when it first shows, a weight when
  // it is first used): what was measured in the fallback is measured again once a font arrives
  if (!fontsHeard && document.fonts) {
    fontsHeard = true;
    document.fonts.addEventListener('loadingdone', () => { for (const n of names) if (n.isConnected) fitName(n, true); else names.delete(n); });
  }
  // the list's width: the names' room (3 columns, 2, 1)
  lists ??= new ResizeObserver((entries) => {
    for (const e of entries) {
      if (listWidth.get(e.target) === e.contentRect.width) continue;
      listWidth.set(e.target, e.contentRect.width);
      e.target.querySelectorAll<HTMLElement>(`[data-item] > span:last-child:not(.qe-fig)`).forEach((n) => fitName(n));
    }
  });
  return observer;
}

const nums = (v: string) => v.trim().split(/[\s,]+/).map(Number);
const r2 = (v: number) => Math.round(v * 100) / 100;

function fitSvg(svg: SVGSVGElement) {
  const vb = svg.dataset.vb0 ?? svg.getAttribute('viewBox');
  if (!vb) return;
  const [x, y, w, h] = nums(vb);
  if (!(w > 0 && h > 0)) return;
  const [cx, cy, cw, ch] = nums(svg.getAttribute('viewBox')!);
  const shown = svg.getBoundingClientRect();
  const ppu = Math.min(shown.width / cw, shown.height / ch);
  if (!(ppu > 0)) return;
  const b = drawn(svg, shown, cx, cy, cw, ch, ppu);
  if (!b) return;
  // what it draws, with room for the strokes round its geometry (half a stroke lies outside a shape at the edge)
  const pad = PAD_PX / ppu, tol = 0.25 / ppu; // a quarter of a pixel past the edge is not a cut
  const l = b.x - pad, t = b.y - pad, r = b.x + b.width + pad, d = b.y + b.height + pad;
  if (l >= x - tol && t >= y - tol && r <= x + w + tol && d <= y + h + tol) return;
  const L = Math.min(x, l), T = Math.min(y, t);
  const W = Math.max(x + w, r) - L, H = Math.max(y + h, d) - T;
  svg.dataset.vb0 = vb;
  svg.setAttribute('viewBox', `${r2(L)} ${r2(T)} ${r2(W)} ${r2(H)}`);
  const lim = svg.dataset.fit && nums(svg.dataset.fit);
  if (lim && lim.length === 3) {
    // fitMini's rule, on the widened box
    const k = Math.min(lim[2], lim[0] / W, lim[1] / H);
    svg.style.width = `${r2(W * k)}px`;
    svg.style.height = `${r2(H * k)}px`;
  }
}

// What a drawing draws, in its viewBox's units: every shape's box on screen, put back into those units. getBBox would
// be the obvious call, but the engines disagree on it for rotated groups (Firefox gives a tighter box than Chrome); the
// boxes on screen are what is seen, the same in every engine (Firefox's take in the strokes too).
const SHAPES = 'path,line,rect,circle,ellipse,polygon,polyline,text,image,foreignObject,use';
function drawn(svg: SVGSVGElement, shown: DOMRect, cx: number, cy: number, cw: number, ch: number, ppu: number) {
  // the viewBox is centred in the element (preserveAspectRatio's default, xMidYMid meet)
  const ox = shown.left + (shown.width - cw * ppu) / 2, oy = shown.top + (shown.height - ch * ppu) / 2;
  let l = Infinity, t = Infinity, r = -Infinity, d = -Infinity;
  const clips = new Map<Element, Edges | null>();
  for (const el of svg.querySelectorAll(SHAPES)) {
    if (el.closest('defs,clipPath,mask,marker,pattern,symbol')) continue;
    const q = el.getBoundingClientRect();
    if (!q.width && !q.height) continue;
    let e: Edges = { l: q.left, t: q.top, r: q.right, d: q.bottom };
    // a clipped shape shows only inside its clips (glassware's liquid is a wide band cut to the glass)
    for (let g: Element | null = el; g && g !== svg.parentElement; g = g.parentElement) {
      if (!g.hasAttribute('clip-path')) continue;
      if (!clips.has(g)) clips.set(g, clipEdges(svg, g));
      const c = clips.get(g);
      if (c) e = { l: Math.max(e.l, c.l), t: Math.max(e.t, c.t), r: Math.min(e.r, c.r), d: Math.min(e.d, c.d) };
    }
    if (e.r < e.l || e.d < e.t) continue; // clipped away
    l = Math.min(l, e.l); t = Math.min(t, e.t); r = Math.max(r, e.r); d = Math.max(d, e.d);
  }
  if (!(r >= l && d >= t)) return null;
  return { x: cx + (l - ox) / ppu, y: cy + (t - oy) / ppu, width: (r - l) / ppu, height: (d - t) / ppu };
}

type Edges = { l: number; t: number; r: number; d: number };
// A clip's box on screen: its shapes' boxes in its own units (those of the element it clips), mapped by that element's
// transform. Null (the shape counts whole, as if unclipped) when it can't be told: an objectBoundingBox clip, no shapes.
function clipEdges(svg: SVGSVGElement, g: Element): Edges | null {
  const id = /url\(\s*["']?#([^"')\s]+)/.exec(g.getAttribute('clip-path') || '')?.[1];
  const cp = id ? svg.querySelector(`clipPath[id="${CSS.escape(id)}"]`) : null;
  const ctm = (g as SVGGraphicsElement).getScreenCTM?.();
  if (!cp || !ctm || cp.getAttribute('clipPathUnits') === 'objectBoundingBox') return null;
  let e: Edges | null = null;
  try {
    for (const k of cp.children) {
      if (!(k instanceof SVGGraphicsElement)) continue;
      const b = k.getBBox(), own = k.transform?.baseVal.consolidate()?.matrix;
      const m = own ? ctm.multiply(own) : ctm;
      for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
        const X = m.a * x + m.c * y + m.e, Y = m.b * x + m.d * y + m.f;
        e = e ? { l: Math.min(e.l, X), t: Math.min(e.t, Y), r: Math.max(e.r, X), d: Math.max(e.d, Y) } : { l: X, t: Y, r: X, d: Y };
      }
    }
  } catch { return null; }
  return e;
}

// Intl.Segmenter (word breaks in any language, Thai included) is newer than this project's TypeScript library
interface WordSegmenter { segment(text: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> }
let words: WordSegmenter | null = null;
/** Each word's [start, end) in the text. */
const wordSpans = (text: string): [number, number][] => {
  const Seg = (Intl as unknown as { Segmenter?: new (lang?: string, o?: { granularity: 'word' }) => WordSegmenter }).Segmenter;
  if (!Seg) return [...text.matchAll(/\S+/g)].map((m) => [m.index!, m.index! + m[0].length]);
  words ??= new Seg(document.documentElement.lang || undefined, { granularity: 'word' });
  return [...words.segment(text)].filter((s) => s.isWordLike).map((s) => [s.index, s.index + s.segment.length]);
};
// The widest word as the page draws it: each word's box with the name held on one line. (A canvas measured with the
// same font is not the page: Firefox on Linux drew "Association" 61px on one and 75px on the other.)
function widestWord(name: HTMLElement): number {
  const text = [...name.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim()) as Text | undefined;
  if (!text) return 0;
  const was = name.style.whiteSpace;
  name.style.whiteSpace = 'nowrap';
  const r = document.createRange();
  let widest = 0;
  for (const [a, z] of wordSpans(text.data)) { r.setStart(text, a); r.setEnd(text, z); widest = Math.max(widest, r.getBoundingClientRect().width); }
  name.style.whiteSpace = was;
  return widest;
}
const fitted = new WeakMap<HTMLElement, string>(); // the room and text each name was fitted to
const names = new Set<HTMLElement>(); // every name fitted, measured again when a font arrives
function fitName(name: HTMLElement, again = false) {
  let cs = getComputedStyle(name);
  if (cs.display === 'none') return;
  // the room is the widest the name may be (its max-width), whatever its text makes it now. With none (a one-column
  // list), the name is as wide as its text, so that would be no room at all and every one-word name would shrink a
  // little: there only a word wider than the row it sits in is made smaller
  if (cs.maxWidth === 'none') {
    name.style.fontSize = '';
    const row = name.parentElement, over = row ? row.scrollWidth - row.clientWidth : 0;
    if (over <= 1) { fitted.set(name, `none|${name.textContent}`); return; }
  }
  const was = name.style.width;
  if (cs.maxWidth !== 'none') name.style.width = cs.maxWidth;
  const room = name.getBoundingClientRect().width - (cs.maxWidth === 'none' && name.parentElement ? name.parentElement.scrollWidth - name.parentElement.clientWidth : 0);
  name.style.width = was;
  // its own new size (a smaller text) is seen by the observer too: nothing to do while room and text are the same
  const key = `${room.toFixed(1)}|${name.textContent}`;
  if (!again && fitted.get(name) === key) return;
  fitted.set(name, key);
  name.style.fontSize = '';
  cs = getComputedStyle(name);
  const size = parseFloat(cs.fontSize);
  if (!(room > 0 && size > 0)) return;
  const widest = widestWord(name), fits = room - 0.5; // a hair of room for subpixel rounding
  if (widest <= fits) return;
  name.style.fontSize = `${Math.max(MIN_TEXT_PX, Math.floor((size * fits / widest) * 10) / 10)}px`;
}

/** Attach to a palette item: fits the drawing and the name it holds (re-run when its drawing or name changes). */
export function fitItem(_svg: string, _name?: string) {
  return (item: HTMLElement) => {
    const svg = item.querySelector<SVGSVGElement>(':scope > svg, :scope > .qe-fig > svg');
    const name = item.querySelector<HTMLElement>(NAME);
    const w = watcher();
    if (svg) w.observe(svg);
    if (name) w.observe(name);
    const list = item.closest('.cz-list');
    if (list && !listWidth.has(list)) { listWidth.set(list, -1); lists!.observe(list); }
    return () => { if (svg) observer?.unobserve(svg); if (name) observer?.unobserve(name); };
  };
}
