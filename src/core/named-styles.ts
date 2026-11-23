// Named styles: a file's own styles (`block`, `signal`…), each a set of style fields. A shape linked to one keeps the
// values on itself as before (every drawing and export path reads them there) plus `style` (the style's id) and `so`
// (the fields it sets differently: its overrides). The style's fields are copied onto every linked shape, so the
// table, not the shapes, says what a style is: after an edit or an undo the shapes are synced from it. The export
// writes the style once as \tikzset{name/.style={…}} and names it on each shape (src/domain/shapes.ts).
// The table lives in the file's settings (`page.styles`), which every save, merge and copy already carries. No DOM.
import type { Shape, ShapeOwner } from './contracts';

export interface NamedStyle {
  id: string;
  /** the TikZ style name: letters, digits, spaces and hyphens, starting with a letter */
  name: string;
  /** the style's fields, as a shape holds them */
  keys: Record<string, unknown>;
}
/** The fields a named style holds: outline, fill, arrow tips, opacity and text. */
export const STYLE_KEYS = ['stroke', 'width', 'dash', 'fill', 'opacity', 'startTip', 'endTip', 'size', 'font', 'bold', 'italic', 'color'] as const;

const J = (v: unknown) => JSON.stringify(v ?? null);
const clone = <T>(v: T): T => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

/** The file's styles (a list kept in its settings). */
export function stylesOf(page: { styles?: unknown } | null | undefined): NamedStyle[] {
  const list = page && Array.isArray(page.styles) ? page.styles as NamedStyle[] : [];
  return list.filter((s) => s && typeof s.id === 'string' && typeof s.name === 'string' && s.keys && typeof s.keys === 'object');
}
/** The style fields `shape` has, for a new style made from it. */
export function keysFrom(shape: Shape): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of STYLE_KEYS) if (shape[k] !== undefined) out[k] = clone(shape[k]);
  return out;
}
/** Whether a style can link to the shape: it has at least one of the fields. */
export const styleable = (shape: Shape) => STYLE_KEYS.some((k) => shape[k] !== undefined);
/** The style's fields this shape has (a style's fill does not go onto a line, which has none). */
const fieldsOn = (shape: Shape, style: NamedStyle) => Object.keys(style.keys).filter((k) => shape[k] !== undefined);

/** Link `shape` to `style`: its fields take the style's values, with no overrides. */
export function link(shape: Shape, style: NamedStyle) {
  for (const k of fieldsOn(shape, style)) shape[k] = clone(style.keys[k]);
  shape.style = style.id;
  delete shape.so;
}
/** Unlink: the shape keeps the values it has. */
export function unlink(shape: Shape) { delete shape.style; delete shape.so; }
/** Overrides of a linked shape go: its fields take the style's values again. */
export function reset(shape: Shape, styles: NamedStyle[]) {
  const st = styles.find((s) => s.id === shape.style);
  if (st) link(shape, st);
}

/**
 * Bring linked shapes in line with the table: the fields a shape doesn't override take the style's values; a link to
 * a style no longer in the file goes (the shape keeps its values). Returns whether anything changed.
 */
export function sync(owners: ShapeOwner[], styles: NamedStyle[]) {
  const byId = new Map(styles.map((s) => [s.id, s]));
  let changed = false;
  for (const o of owners) for (const s of o.shapes || []) {
    if (s.style === undefined) continue;
    const st = byId.get(s.style);
    if (!st) { unlink(s); changed = true; continue; }
    const own = fieldsOn(s, st), so = Array.isArray(s.so) ? s.so.filter((k: string) => own.includes(k)) : [];
    for (const k of own) if (!so.includes(k) && J(s[k]) !== J(st.keys[k])) { s[k] = clone(st.keys[k]); changed = true; }
    if (so.length !== (s.so?.length ?? 0)) { if (so.length) s.so = so; else delete s.so; changed = true; }
  }
  return changed;
}
/**
 * After an edit: a linked shape's field that now differs from its style becomes an override, and one set back to the
 * style's value is no longer one.
 */
export function markOverrides(shapes: Shape[], styles: NamedStyle[]) {
  const byId = new Map(styles.map((s) => [s.id, s]));
  for (const s of shapes) {
    if (s.style === undefined) continue;
    const st = byId.get(s.style);
    if (!st) continue;
    const so = fieldsOn(s, st).filter((k) => J(s[k]) !== J(st.keys[k]));
    if (so.length) s.so = so; else delete s.so;
  }
}

// TikZ's own keys, colours and shapes a style name must not take: \tikzset{thick/.style=…} would quietly change
// every thick line in the document.
const RESERVED = new Set(['draw', 'fill', 'pattern', 'shade', 'clip', 'path', 'node', 'coordinate', 'color', 'text', 'font', 'opacity',
  'thin', 'thick', 'very thin', 'very thick', 'ultra thin', 'ultra thick', 'semithick', 'help lines', 'solid', 'dashed', 'dotted',
  'densely dashed', 'loosely dashed', 'densely dotted', 'loosely dotted', 'dash dot', 'double', 'rounded corners', 'sharp corners',
  'circle', 'rectangle', 'ellipse', 'diamond', 'above', 'below', 'left', 'right', 'midway', 'near start', 'near end', 'at start',
  'at end', 'sloped', 'auto', 'swap', 'pos', 'scale', 'rotate', 'shift', 'xshift', 'yshift', 'inner sep', 'outer sep', 'minimum size',
  'minimum width', 'minimum height', 'anchor', 'align', 'line width', 'every node', 'every path', 'style', 'none', 'transparent',
  'black', 'white', 'red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'gray', 'grey', 'darkgray', 'lightgray', 'brown', 'lime',
  'olive', 'orange', 'pink', 'purple', 'teal', 'violet']);
/** Why `name` can't name a style (`taken`: the file's other style names), or null when it can. */
export function nameProblem(name: string, taken: string[]): 'empty' | 'chars' | 'reserved' | 'taken' | null {
  const n = name.trim();
  if (!n) return 'empty';
  if (!/^[A-Za-z][A-Za-z0-9 -]*$/.test(n) || /\s{2}|\s$/.test(n)) return 'chars';
  if (RESERVED.has(n.toLowerCase())) return 'reserved';
  if (taken.some((t) => t.toLowerCase() === n.toLowerCase())) return 'taken';
  return null;
}
