import { t } from '../i18n';

// The alignment switch (left, centre, right, justify): one component for the style panel's Align, the
// Table toolbar and panel, and the document's text toolbar. Styled by `.seg.seg-align` (public/css/style.css).
export type Align = 'l' | 'c' | 'r' | 'j';

const icon = (d: string) => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="${d}"/></svg>`;
export const ALIGN_ICONS: Record<Align, string> = {
  l: icon('M3 5h14M3 9h9M3 13h14M3 17h9'),
  c: icon('M3 5h14M5.5 9h9M3 13h14M5.5 17h9'),
  r: icon('M3 5h14M8 9h9M3 13h14M8 17h9'),
  j: icon('M3 5h14M3 9h14M3 13h14M3 17h9'),
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' } as Record<string, string>)[c]);

export interface AlignSwitchOptions {
  cur?: string; // the value shown as chosen
  cls?: string; // extra classes on the switch (the toolbar's group classes)
  seg?: string; // data-seg on the switch, for a panel that handles its switches by key
  btn?: string; // extra attributes on each button (e.g. ` data-t="al"`)
  tips?: Partial<Record<Align, string>>; // tips that say more than the defaults for this place
}

export function alignSwitch({ cur = '', cls = '', seg = '', btn = '', tips = {} }: AlignSwitchOptions = {}): string {
  const tip: Record<Align, string> = {
    l: t('table.alignLeft', 'Align left'), c: t('ui.centre', 'Centre'), r: t('table.alignRight', 'Align right'),
    j: t('table.justify', 'Justify (wrapping columns)'), ...tips,
  };
  return `<div class="seg seg-align${cls ? ' ' + cls : ''}" role="group" aria-label="${esc(t('ui.alignment', 'Alignment'))}"${seg ? ` data-seg="${seg}"` : ''}>${(['l', 'c', 'r', 'j'] as Align[]).map((a) => `<button type="button"${btn} data-v="${a}" class="${a === cur ? 'on' : ''}" title="${esc(tip[a])}">${ALIGN_ICONS[a]}</button>`).join('')}</div>`;
}
