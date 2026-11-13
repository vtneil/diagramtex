// Untrusted documents (share links, opened or pasted files, stored copies) go straight into SVG and HTML strings,
// so a field that is a number by default must be a finite number, and a colour must not carry markup. The page's
// Content-Security-Policy already stops injected markup from running; this keeps it out of the markup at all.
import type { Shape } from './contracts';

type Loose = Record<string, unknown>;
/** Fields that are numbers on every shape that has them. */
const NUMERIC = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'w', 'h', 'r', 'rx', 'ry', 'width', 'rot', 'opacity', 'a1', 'a2', 'tw', 'th']);
const COLOUR = new Set(['stroke', 'fill', 'color', 'ballColor']);
const MARKUP = /[<>"'`&]/;

const finite = (value: unknown, fallback: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

/** Every own field of `target` whose value in `template` is a number becomes a finite number (the template's when unreadable). */
export function conformNumbers(target: Loose, template: Loose) {
  for (const key of Object.keys(target)) {
    const fallback = template[key];
    if (typeof fallback === 'number' && !(typeof target[key] === 'number' && Number.isFinite(target[key]))) target[key] = finite(target[key], fallback);
  }
}

/** Repair a shape in place against its type's freshly created defaults and the style defaults. */
export function conformShape(shape: Shape, template: Loose, styleDefaults: Loose) {
  const s = shape as unknown as Loose;
  for (const key of Object.keys(s)) {
    const value = s[key], fallback = key in template ? template[key] : styleDefaults[key];
    if (typeof fallback === 'number' || (NUMERIC.has(key) && fallback === undefined && value !== undefined && value !== null && typeof fallback !== 'string')) {
      if (!(typeof value === 'number' && Number.isFinite(value))) s[key] = finite(value, typeof fallback === 'number' ? fallback : 0);
    } else if (COLOUR.has(key) && typeof value === 'string' && MARKUP.test(value)) {
      s[key] = fallback === undefined ? null : fallback;
    }
  }
}
