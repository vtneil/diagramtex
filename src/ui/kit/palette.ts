// What a block editor's palette holds: categories of items, each a drawing and a name. `alt` is the English name,
// so a search in another interface language still finds a part by it; `keywords` are other words that find it.
// `on` marks an item as chosen besides the armed one (the kind new arrows get); `attrs` and `class` are hooks for an
// editor that handles its items' clicks and drags itself.
export interface PaletteItem { id: string; label: string; svg: string; title?: string; key?: string; alt?: string; keywords?: string; on?: boolean; attrs?: Record<string, string>; class?: string }
/** `layout` overrides the palette's for this category ('icons': a grid of icon-only buttons, the drawing tools);
 *  `class` goes on its grid; `note` is a faint badge after its title ("replace the figure"); `browse`: shown only
 *  while not searching (the circuit's "Recently used", whose parts are in their own categories too). */
export interface PaletteCategory { id: string; title: string; items: PaletteItem[]; layout?: 'rows' | 'grid' | 'icons'; class?: string; note?: string; browse?: boolean }

/** The categories with the items that match `query` (all of them when it is empty), empty categories left out. An
 *  item matches when every word of the query is in its name, English name, keywords, id or category's title. */
export function filterPalette(categories: PaletteCategory[], query: string): PaletteCategory[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return categories.filter((c) => c.items.length);
  return categories.filter((c) => !c.browse).map((c) => ({ ...c, items: c.items.filter((i) => {
    const text = [i.label, i.alt, i.keywords, i.id, c.title].filter(Boolean).join(' ').toLowerCase();
    return words.every((w) => text.includes(w));
  }) })).filter((c) => c.items.length);
}
