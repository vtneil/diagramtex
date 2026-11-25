import { runtime as TD } from '../runtime';

/**
 * A block's layouts, kept by key: what `build` gives for a shape, built once while the key (its source, the maths
 * engine and whatever else changes the drawing) stays the same. A layout made in a measuring pass isn't kept (its text
 * sizes may be placeholders) unless `whileMeasuring`; everything is forgotten when text metrics change (fonts loaded,
 * engine switched), with `onClear` for a block's other caches, and past 200 layouts.
 */
// (a layout's type is the block's to give, as `layoutCache<Shape, Layout>(…)`: untyped, layouts are `any`, as the
// blocks' own maps had them)
export function layoutCache<S = any, L = any>(key: (s: S) => string, build: (s: S) => NoInfer<L>, opts: { onClear?: () => void; whileMeasuring?: boolean } = {}): (s: S) => L {
  const cache = new Map<string, L>();
  TD.onTextMetricsChange?.(() => { cache.clear(); opts.onClear?.(); });
  return (s: S) => {
    const k = key(s);
    const hit = cache.get(k);
    if (hit) return hit;
    const L = build(s);
    if (!opts.whileMeasuring && TD.measuring && TD.measuring()) return L;
    if (cache.size > 200) cache.clear();
    cache.set(k, L);
    return L;
  };
}

/** The usual key: the source and the maths engine, with any more parts after. */
export const srcKey = (s: { src?: unknown }, ...more: unknown[]) => [s.src, TD.math && TD.math.engine, ...more].join('\u0001');
