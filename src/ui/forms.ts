/** Declarative form contracts shared by the scientific property panels. */
export type Attributes = Record<string, string | number | boolean | null | undefined>;
export type Inline = string | { code: string } | { bold: string } | { kbd: string } | { br: true };
export type Control =
  | { kind: 'input'; attrs: Attributes; value: string | number; checked?: boolean }
  | { kind: 'select'; attrs: Attributes; value: string; options: string[][] }
  | { kind: 'colour'; index: number; value: string; css: string }
  | { kind: 'fillColour'; attrs: Attributes; label: string; css: string; none: boolean }
  | { kind: 'angle'; attrs: Attributes; numericAttrs: Attributes; value: string | number; numericValue: string | number; unit: string }
  | { kind: 'button'; attrs: Attributes; text: string; svg?: string; swatch?: { css: string; none: boolean } }
  | { kind: 'code'; text: string; class?: string }
  | { kind: 'spacer' }
  | { kind: 'texColour'; attrs: Attributes; value: string; label: string; css: string; nullable: boolean; none: boolean; title: string; defaultLabel?: string; defaultSwatch?: string }
  | { kind: 'text'; text: string; class?: string };
export type FormRow =
  | { kind: 'group'; class?: string; style?: string; rows: FormRow[] }
  | { kind: 'row'; label: Inline[]; labelClass?: string; labelTitle?: string; labelFor?: string; controlClass?: string; controls: Control[] }
  | { kind: 'column'; label?: Inline[]; labelClass?: string; labelTitle?: string; value: string; attrs: Attributes }
  | { kind: 'help'; text: Inline[]; style?: string }
  | { kind: 'hint'; text: Inline[] }
  | { kind: 'error'; text: string }
  | { kind: 'actions'; class: string; buttons: { text: string; attrs: Attributes }[] }
  | { kind: 'controls'; class: string; controls: Control[] }
  | { kind: 'codeButtons'; class: string; items: { attrs: Attributes; label: string; code: string }[] }
  | { kind: 'status'; class: string; icon: string; text: string }
  | { kind: 'kmapGroups'; groups: { index: number; title: string; bw: boolean; css: string; valid: boolean; math: string; text: string; icon: string }[] }
  | { kind: 'rendered'; class: string; svgOrMath: string }
  | { kind: 'points'; points: Control[][] }
  | { kind: 'physicsResults'; results: { label: string; value: string; kind: string; status: string; title: string }[] }
  | { kind: 'button'; action: string; label: string; class: string };
export interface FormSection {
  title?: string;
  titleSpan?: boolean;
  titleAction?: { text: string; attrs: Attributes };
  summary?: string;
  swatch?: { bw: boolean; css: string };
  class: string;
  remove?: { action: string; index: number; title: string };
  rows: FormRow[];
}
export interface FormPanelModel { sections: FormSection[] }
const TX_PLACEHOLDER: Record<string, string> = { math: 'Maths, without $', text: 'Text, $math$' };
const TX_TITLE: Record<string, string> = { math: 'Maths, without $', text: 'Use $\u2026$ for maths' };
const NONE_PH = new Set(['none', 'empty', 'add a label', '(none)']);
// where leaving the field empty means no label: short enough for the narrowest panel field (about 110px)
const TX_NONE: Record<string, string> = { math: 'none \u00b7 maths', text: 'none \u00b7 $math$' };
/** The placeholder of a TeX field: what it takes, or with `none`, that empty means no label. */
export const txPlaceholder = (tx: string, none = false) => (none ? TX_NONE : TX_PLACEHOLDER)[tx];
export function txAttrs(attrs: Attributes): Attributes {
  const tx = typeof attrs['data-tx'] === 'string' ? attrs['data-tx'] : '';
  const ph = attrs.placeholder == null ? '' : String(attrs.placeholder);
  if (TX_PLACEHOLDER[tx] && (ph === '' || NONE_PH.has(ph))) return { ...attrs, placeholder: txPlaceholder(tx, ph !== '') };
  return attrs;
}
export const row = (label: string | Inline[], ...controls: Control[]): Extract<FormRow, { kind: 'row' }> => {
  const tx = controls.length === 1 && controls[0].kind === 'input' && typeof controls[0].attrs['data-tx'] === 'string' ? controls[0].attrs['data-tx'] : '';
  const labelTitle = TX_TITLE[tx];
  return { kind: 'row' as const, label: typeof label === 'string' ? [label] : label, ...(labelTitle ? { labelTitle } : {}), controls };
};
export const input = (key: string, value: string | number | null | undefined, attrs: Attributes = {}): Control => ({
  kind: 'input' as const, value: value ?? '', attrs: txAttrs({ type: 'text', 'data-p': key, spellcheck: 'false', ...attrs }),
});
export const number = (key: string, value: string | number, attrs: Attributes = {}): Control => ({ kind: 'input' as const, value, attrs: { type: 'number', 'data-p': key, ...attrs } });
export const check = (key: string, value: boolean | undefined): Control => ({ kind: 'input' as const, value: '', checked: value !== false, attrs: { type: 'checkbox', 'data-p': key } });
export const select = (key: string, options: string[][], value: string): Control => ({ kind: 'select' as const, attrs: { 'data-p': key }, options, value });
export const section = (title: string, rows: FormRow[], className = 'sec ser'): FormSection => ({ title, rows, class: className });
export const help = (...text: Inline[]): FormRow => ({ kind: 'help' as const, text, style: 'margin-top:6px' });
export const errors = (message?: string): FormRow[] => message ? [{ kind: 'error' as const, text: message }] : [];
export const view = (shape: { view?: number[] }, defaults = [115, 20]): FormRow => row('View (az, el)',
  number('view0', shape.view?.[0] ?? defaults[0], { step: '5' }),
  number('view1', shape.view?.[1] ?? defaults[1], { step: '5', min: '-89', max: '89' }));
