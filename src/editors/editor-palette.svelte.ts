// A block editor's palette: the kit's Palette (src/ui/kit/Palette.svelte) drawn into the frame's empty `.cz-pal`.
// The editor gives its categories as data each time they change (render), with the item waiting to be placed
// (`armed`); the search, Esc, Enter (the first match, through onpick) and the empty result are the kit's. Item
// clicks stay the editor's own (itemclick: false), since most place an item by pressing and dragging it: they
// listen on `list`, as before, and find an item by its data-item (or the hooks in its `attrs`).
import { mount, flushSync } from 'svelte';
import Palette from '../ui/kit/Palette.svelte';
import { filterPalette, type PaletteCategory } from '../ui/kit/palette';
import { caption, type Message } from '../i18n';

export interface EditorPaletteOptions {
  /** the search field's placeholder, and the list's name */
  placeholder: Message; label: Message;
  /** the search field's name, when it says more than the placeholder ("Search the palette") */
  searchLabel?: Message;
  layout?: 'rows' | 'grid';
  /** a class on the list, for the editor's own CSS (`bf-list`) */
  listClass?: string;
  /** categories that fold; `isOpen` says which are open, `ontoggle` hears a change */
  collapsible?: boolean; isOpen?: (id: string) => boolean; ontoggle?: (id: string, open: boolean) => void;
  /** Enter in the search: the first match */
  onpick: (id: string) => void;
  /** what an empty search says (the kit's “Nothing matches …” when left out) */
  empty?: (query: string) => string;
  /** true: the kit picks an item on its click (onpick); false (the default): the editor hears its clicks itself */
  itemclick?: boolean;
}

export interface EditorPalette {
  list: HTMLElement; search: HTMLInputElement;
  /** draw the categories; `notice` (markup) stands in for them (a figure that names no domain) */
  render(categories: PaletteCategory[], o?: { armed?: string | null; notice?: string }): void;
  /** empty the search (on opening the editor) */
  clear(): void;
}

export function editorPalette(root: HTMLElement, o: EditorPaletteOptions): EditorPalette {
  const pal = root.querySelector<HTMLElement>('.cz-pal')!;
  pal.replaceChildren();
  const props = $state({
    categories: [] as PaletteCategory[], layout: o.layout ?? 'grid', armed: undefined as string | undefined, bare: true,
    itemclick: o.itemclick ?? false, listClass: o.listClass, notice: undefined as string | undefined,
    placeholder: caption(o.placeholder), searchLabel: o.searchLabel ? caption(o.searchLabel) : undefined, label: caption(o.label), collapsible: !!o.collapsible, open: {} as Record<string, boolean>,
    ontoggle: o.ontoggle, onpick: o.onpick, emptyText: o.empty, query: '',
  });
  mount(Palette, { target: pal, props });
  flushSync();
  // Esc and Enter in the search are the palette's: the editors hear keys on the window in the capture phase (and
  // keep them from going further), so this listens there too, set up before theirs, and goes first.
  window.addEventListener('keydown', (e) => {
    const f = e.target;
    // (keys sent to the window itself have no element)
    if (!(f instanceof HTMLInputElement) || !pal.contains(f) || !f.matches('.cz-search input') || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopImmediatePropagation();
      if (props.query) { props.query = ''; f.value = ''; flushSync(); } else f.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault(); e.stopImmediatePropagation();
      const first = filterPalette(props.categories, props.query)[0]?.items[0];
      f.blur();
      if (first) o.onpick(first.id);
    }
  }, true);
  return {
    list: pal.querySelector<HTMLElement>('.cz-list')!,
    search: pal.querySelector<HTMLInputElement>('.cz-search input')!,
    render(categories, { armed, notice } = {}) {
      props.categories = categories;
      props.armed = armed ?? undefined;
      props.notice = notice;
      // captions follow the interface language: the editor draws its palette again when it changes
      props.placeholder = caption(o.placeholder); props.label = caption(o.label);
      if (o.searchLabel) props.searchLabel = caption(o.searchLabel);
      if (o.isOpen) props.open = Object.fromEntries(categories.map((c) => [c.id, o.isOpen!(c.id)]));
      flushSync();
    },
    clear() { props.query = ''; flushSync(); const s = pal.querySelector<HTMLInputElement>('.cz-search input'); if (s) s.value = ''; },
  };
}

/** A palette drawing (`<svg … viewBox="…">`) sized to fit maxW × maxH px, at most `top` times its own size, so every
 *  drawing in a palette has the same weight and wide ones shrink. Done in the markup, so it holds for items the
 *  search brings back. */
export function fitMini(svg: string, maxW: number, maxH: number, top: number): string {
  const m = /<svg\b[^>]*?viewBox="([^"]+)"/.exec(svg);
  if (!m) return svg;
  const [, , vw, vh] = m[1].split(/[\s,]+/).map(Number);
  if (!(vw > 0 && vh > 0)) return svg;
  const k = Math.min(top, maxW / vw, maxH / vh), r = (v: number) => Math.round(v * 100) / 100;
  return svg.replace(/<svg\b/, `<svg style="width:${r(vw * k)}px;height:${r(vh * k)}px"`);
}
