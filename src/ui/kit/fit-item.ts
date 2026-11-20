// A palette item shows all of its drawing and all of its name.
//
// The drawing: its viewBox comes from the block's own layout, which measures letters and maths from estimates; set
// glyphs (C, O, \mathbb{Z}) and some strokes reach past it, and an <svg> clips what lies outside its box. Once the
// drawing is shown, this measures what it really draws (its shapes' boxes on screen) and widens the viewBox to hold it, then sizes it again
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
function watcher() {
  observer ??= new ResizeObserver((entries) => {
    const shown = entries.filter((e) => e.contentRect.width || e.contentRect.height).map((e) => e.target);
    for (const el of shown) observer!.unobserve(el); // let go first: nothing watched is resized below
    for (const el of shown) {
      const run = el instanceof SVGSVGElement ? () => fitSvg(el) : (again = false) => fitName(el as HTMLElement, again);
      run();
      if (document.fonts && document.fonts.status !== 'loaded') document.fonts.ready.then(() => { if (el.isConnected) run(true); });
    }
  });
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
  for (const el of svg.querySelectorAll(SHAPES)) {
    if (el.closest('defs,clipPath,mask,marker,pattern,symbol')) continue;
    const q = el.getBoundingClientRect();
    if (!q.width && !q.height) continue;
    l = Math.min(l, q.left); t = Math.min(t, q.top); r = Math.max(r, q.right); d = Math.max(d, q.bottom);
  }
  if (!(r >= l && d >= t)) return null;
  return { x: cx + (l - ox) / ppu, y: cy + (t - oy) / ppu, width: (r - l) / ppu, height: (d - t) / ppu };
}

let ctx: CanvasRenderingContext2D | null = null;
// Intl.Segmenter (word breaks in any language, Thai included) is newer than this project's TypeScript library
interface WordSegmenter { segment(text: string): Iterable<{ segment: string; isWordLike?: boolean }> }
let words: WordSegmenter | null = null;
const wordsOf = (text: string): string[] => {
  const Seg = (Intl as unknown as { Segmenter?: new (lang?: string, o?: { granularity: 'word' }) => WordSegmenter }).Segmenter;
  if (!Seg) return text.split(/\s+/).filter(Boolean);
  words ??= new Seg(document.documentElement.lang || undefined, { granularity: 'word' });
  return [...words.segment(text)].filter((s) => s.isWordLike).map((s) => s.segment);
};
const fitted = new WeakMap<HTMLElement, string>(); // the room and text each name was fitted to
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
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return;
  ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  let widest = 0;
  for (const w of wordsOf(name.textContent || '')) widest = Math.max(widest, ctx.measureText(w).width);
  const fits = room - 1; // canvas and layout measure a word a fraction of a pixel apart
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
