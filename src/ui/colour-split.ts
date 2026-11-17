import { t } from '../i18n';

// The text colour and fill buttons of the Table and Document toolbars: one split button each (`.tb-split`, as
// the Table's .00). The button applies the last colour picked, which its bar shows; the arrow opens the app's
// colour picker (TD.openColorPicker) to pick another.
const svg = (d: string) => `<svg viewBox="0 0 20 20" aria-hidden="true">${d}</svg>`;
export const COLOUR_ICONS = {
  fg: svg('<path d="M6 14l4-10 4 10M7.4 10.5h5.2"/><path class="sw" d="M3 16.5h14" stroke-width="3"/>'),
  bg: svg('<path d="M4.5 9.5l5-5 5 5-5 5z"/><path d="M15.5 11.5s1.5 1.8 1.5 2.8a1.5 1.5 0 01-3 0c0-1 1.5-2.8 1.5-2.8z"/><path class="sw" d="M3 17.5h14" stroke-width="3"/>'),
};
const MORE = svg('<path d="M6 8l4 4 4-4"/>');
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

export interface ColourSplitOptions {
  icon: 'fg' | 'bg';
  name: string; // what it colours ("Text colour", "Cell fill")
  main: string; // attributes on the button that applies the colour (e.g. ` data-t="fg"`)
  more: string; // attributes on the arrow that opens the picker
}

export function colourSplit({ icon, name, main, more }: ColourSplitOptions): string {
  return `<span class="split-btn tb-split"><button type="button" class="icon tb-col"${main} title="${esc(t('ui.colour.applyLast', '{name}: the last colour picked', { name }))}">${COLOUR_ICONS[icon]}</button><button type="button" class="tb-more"${more} title="${esc(t('ui.colour.pick', '{name}: pick a colour', { name }))}" aria-haspopup="dialog">${MORE}</button></span>`;
}

// the bar under the icon shows the colour the button applies
export function showSwatch(btn: Element | null, css: string) {
  const p = btn && btn.querySelector<SVGPathElement>('.sw');
  if (p) p.style.stroke = css;
}
