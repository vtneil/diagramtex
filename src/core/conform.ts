// Untrusted documents (share links, opened or pasted files, stored copies) go straight into SVG and HTML strings,
// so a field that is a number by default must be a finite number, and a colour must not carry markup. The app page's
// Content-Security-Policy allows no inline script (the build swaps 'unsafe-inline' for the preflight's hash), but
// inline styles still apply there, and SVG/HTML exports and downloaded files carry no policy at all: keeping markup
// out of the strings is the protection, not the policy.
import type { Shape } from './contracts';

type Loose = Record<string, unknown>;
/** Fields that are numbers on every shape that has them. */
const NUMERIC = new Set(['x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'w', 'h', 'r', 'rx', 'ry', 'width', 'rot', 'opacity', 'a1', 'a2', 'tw', 'th', 'radius']);
const COLOUR = new Set(['stroke', 'fill', 'color', 'ballColor']);
const MARKUP = /[<>"'`&]/;

const finite = (value: unknown, fallback: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : fallback;
};
const colourOr = (value: unknown, fallback: string) => (typeof value === 'string' && !MARKUP.test(value) ? value : fallback);

/** A gradient ({ g, stops }) or pattern ({ p, color }) fill rebuilt from the fields src/domain/fills.ts reads. */
function conformFill(v: Loose): Loose | undefined {
  const out: Loose = {};
  const num = (k: string, d: number) => { if (v[k] != null) out[k] = finite(v[k], d); };
  if (v.g) {
    out.g = v.g === 'radial' ? 'radial' : 'linear';
    num('angle', 0); num('scale', 100); num('cx', 50); num('cy', 50);
    out.stops = (Array.isArray(v.stops) ? v.stops : []).filter(Array.isArray).map(([o, c]) => [finite(o, 0), colourOr(c, '#000000')]);
    return out;
  }
  if (typeof v.p === 'string') {
    out.p = /^\w+$/.test(v.p) ? v.p : 'ne';
    num('size', 8); num('lw', 0.75);
    if (v.color != null) out.color = colourOr(v.color, '#000000');
    return out;
  }
  return undefined;
}
/** A colour field's value without markup (gradients and patterns rebuilt); undefined when it can't be kept. */
export function conformColour(value: unknown): unknown {
  if (!value) return value;
  if (typeof value === 'string') return MARKUP.test(value) ? undefined : value;
  if (typeof value === 'object' && !Array.isArray(value)) return conformFill(value as Loose) ?? value;
  return undefined;
}

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
    } else if (COLOUR.has(key) && value) {
      const v = conformColour(value);
      s[key] = v === undefined ? (fallback === undefined ? null : fallback) : v;
    }
  }
}

/** A named style's fields (src/core/named-styles.ts STYLE_KEYS) with values a shape can hold; the rest are left out. */
export function conformStyleKeys(keys: Loose, allowed: readonly string[]): Loose {
  const out: Loose = {};
  for (const k of allowed) {
    if (!Object.prototype.hasOwnProperty.call(keys, k)) continue;
    const v = keys[k];
    let ok: unknown;
    if (k === 'width' || k === 'opacity') ok = finite(v, undefined);
    else if (k === 'bold' || k === 'italic') ok = typeof v === 'boolean' ? v : undefined;
    else if (COLOUR.has(k)) ok = conformColour(v);
    else if (k === 'size') ok = typeof v === 'number' ? finite(v, undefined) : typeof v === 'string' && /^[A-Za-z]+$/.test(v) ? v : undefined;
    else ok = typeof v === 'string' && !MARKUP.test(v) ? v : undefined;
    if (ok !== undefined) out[k] = ok;
  }
  return out;
}
