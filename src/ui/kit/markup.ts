// The kit's pieces as HTML strings, for code that still builds its markup with innerHTML (the block editors'
// palettes, the Table and Document toolbars): the same markup and classes as EmptyState, Badge and SplitButton, so
// both look and read the same. `html` is already escaped by the caller.
export const emptyStateHtml = (html: string) => `<div class="empty-state" role="status">${html}</div>`;
export const badgeHtml = (html: string, faint = false) => `<small class="badge${faint ? ' faint' : ''}">${html}</small>`;

const attr = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);
export interface SplitButtonHtml {
  /** the main button's content (an icon's svg, or escaped text) and its tooltip */
  html: string; title: string;
  /** the arrow's tooltip and name */
  moreTitle: string;
  /** extra attributes on each button, written out (` data-t="border"`) */
  main?: string; more?: string;
  /** an icon-only main button */
  icon?: boolean;
  /** the class of the main button besides the kit's (`tb-col`) */
  mainClass?: string;
  /** what the arrow opens */
  popup?: 'menu' | 'dialog';
  /** the Table and Document toolbars' flat look (`.tb-split`) */
  toolbar?: boolean;
}
/** SplitButton as a string: a main action joined to an arrow that opens its choices. */
export function splitButtonHtml(o: SplitButtonHtml): string {
  const cls = ['press', o.icon && 'icon', o.mainClass].filter(Boolean).join(' ');
  return `<span class="split-btn${o.toolbar ? ' tb-split' : ''}"><button type="button" class="${cls}"${o.main ?? ''} title="${attr(o.title)}">${o.html}</button>`
    + `<button type="button" class="press${o.toolbar ? ' tb-more' : ''}"${o.more ?? ''} title="${attr(o.moreTitle)}" aria-label="${attr(o.moreTitle)}" aria-haspopup="${o.popup ?? 'menu'}">`
    + `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 8l4 4 4-4"/></svg></button></span>`;
}
