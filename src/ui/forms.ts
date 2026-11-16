import { message as msg, type Message } from '../i18n';
/** Declarative form contracts shared by the scientific property panels. */
export type Attributes = Record<string, string | number | boolean | null | undefined>;
export type Inline = string | Message | { code: string } | { bold: string } | { kbd: string } | { br: true };
export type Control = { caption?: Message; captionAttrs?: Record<string, Message> } & (
  | { kind: 'input'; attrs: Attributes; value: string | number; checked?: boolean }
  | { kind: 'select'; attrs: Attributes; value: string; options: (string | Message)[][] }
  | { kind: 'colour'; index: number; value: string; css: string }
  | { kind: 'fillColour'; attrs: Attributes; label: string; css: string; none: boolean }
  | { kind: 'angle'; attrs: Attributes; value: string | number; numericValue: string | number; unit: string }
  | { kind: 'button'; attrs: Attributes; text: string | Message; svg?: string; swatch?: { css: string; none: boolean } }
  | { kind: 'code'; text: string; class?: string }
  | { kind: 'spacer' }
  | { kind: 'texColour'; attrs: Attributes; value: string; label: string; css: string; nullable: boolean; none: boolean; title: string | Message; defaultLabel?: string; defaultSwatch?: string }
  | { kind: 'text'; text: string | Message; class?: string });
export type FormRow =
  | { kind: 'group'; class?: string; style?: string; rows: FormRow[] }
  | { kind: 'row'; label: Inline[]; labelClass?: string; labelTitle?: string | Message; labelFor?: string; controlClass?: string; controls: Control[] }
  | { kind: 'column'; label?: Inline[]; labelClass?: string; labelTitle?: string | Message; value: string; attrs: Attributes }
  | { kind: 'help'; text: Inline[]; style?: string }
  | { kind: 'hint'; text: Inline[] }
  | { kind: 'error'; text: string | Message }
  | { kind: 'actions'; class: string; buttons: { text: string | Message; attrs: Attributes }[] }
  | { kind: 'controls'; class: string; controls: Control[] }
  | { kind: 'codeButtons'; class: string; items: { attrs: Attributes; label: string | Message; code: string }[] }
  | { kind: 'status'; class: string; icon: string; text: string | Message }
  | { kind: 'kmapGroups'; groups: { index: number; title: string; bw: boolean; css: string; valid: boolean; math: string; text: string; icon: string }[] }
  | { kind: 'rendered'; class: string; svgOrMath: string }
  | { kind: 'points'; points: Control[][] }
  | { kind: 'physicsResults'; results: { label: string; value: string; kind: string; status: string; title: string }[] }
  | { kind: 'button'; action: string; label: string | Message; class: string };
export interface FormSection {
  title?: string | Message;
  titleSpan?: boolean;
  titleAction?: { text: string | Message; attrs: Attributes };
  summary?: string;
  swatch?: { bw: boolean; css: string };
  class: string;
  remove?: { action: string; index: number; title: string | Message };
  rows: FormRow[];
}
export interface FormPanelModel { sections: FormSection[] }
const TX_PLACEHOLDER: Record<string, string> = { math: 'Maths, without $', text: 'Text, $math$' };
const TX_TITLE: Record<string, Message> = { math: msg('form.tx.math', 'Maths, without $'), text: msg('form.tx.textTitle', 'Use $\u2026$ for maths') };
const NONE_PH = new Set(['none', 'empty', 'add a label', '(none)']);
// where leaving the field empty means no label: short enough for the narrowest panel field (about 110px)
const TX_NONE: Record<string, string> = { math: 'none \u00b7 maths', text: 'none \u00b7 $math$' };
/** The placeholder of a TeX field: what it takes, or with `none`, that empty means no label. */
export const txPlaceholder = (tx: string, none = false) => (none ? TX_NONE : TX_PLACEHOLDER)[tx];
// the TeX placeholders above, as captions: the English stays in the field's attributes, the shown text follows the language
const TX_CAPTIONS: Record<string, Message> = {
  'Maths, without $': TX_TITLE.math, 'Text, $math$': msg('form.tx.text', 'Text, $math$'),
  'none \u00b7 maths': msg('form.tx.noneMath', 'none \u00b7 maths'), 'none \u00b7 $math$': msg('form.tx.noneText', 'none \u00b7 $math$'),
};
/** Captions for a field's placeholder when it is one of the TeX placeholders (for Control's translatedAttrs). */
export const txCaptions = (attrs: Attributes): Record<string, Message> => {
  const m = typeof attrs.placeholder === 'string' ? TX_CAPTIONS[attrs.placeholder] : undefined;
  return m ? { placeholder: m } : {};
};
/** A control whose title, aria-label or placeholder is a caption (the attribute keeps the English). */
export const captioned = <C extends Control>(control: C, captionAttrs: Record<string, Message>): C => ({ ...control, captionAttrs: { ...control.captionAttrs, ...captionAttrs } });
export function txAttrs(attrs: Attributes): Attributes {
  const tx = typeof attrs['data-tx'] === 'string' ? attrs['data-tx'] : '';
  const ph = attrs.placeholder == null ? '' : String(attrs.placeholder);
  if (TX_PLACEHOLDER[tx] && (ph === '' || NONE_PH.has(ph))) return { ...attrs, placeholder: txPlaceholder(tx, ph !== '') };
  return attrs;
}
export const row = (label: string | Message | Inline[], ...controls: Control[]): Extract<FormRow, { kind: 'row' }> => {
  const tx = controls.length === 1 && controls[0].kind === 'input' && typeof controls[0].attrs['data-tx'] === 'string' ? controls[0].attrs['data-tx'] : '';
  const labelTitle = TX_TITLE[tx];
  return { kind: 'row' as const, label: Array.isArray(label) ? label : [label], ...(labelTitle ? { labelTitle } : {}), controls };
};
export const input = (key: string, value: string | number | null | undefined, attrs: Attributes = {}): Control => ({
  kind: 'input' as const, value: value ?? '', attrs: txAttrs({ type: 'text', 'data-p': key, spellcheck: 'false', ...attrs }),
});
export const number = (key: string, value: string | number, attrs: Attributes = {}): Control => ({ kind: 'input' as const, value, attrs: { type: 'number', 'data-p': key, ...attrs } });
export const check = (key: string, value: boolean | undefined): Control => ({ kind: 'input' as const, value: '', checked: value !== false, attrs: { type: 'checkbox', 'data-p': key } });
export const select = (key: string, options: (string | Message)[][], value: string): Control => ({ kind: 'select' as const, attrs: { 'data-p': key }, options, value });
export const section = (title: string | Message, rows: FormRow[], className = 'sec ser'): FormSection => ({ title, rows, class: className });
export const help = (...text: Inline[]): FormRow => ({ kind: 'help' as const, text, style: 'margin-top:6px' });
export const errors = (message?: string): FormRow[] => message ? [{ kind: 'error' as const, text: message }] : [];
export const view = (shape: { view?: number[] }, defaults = [115, 20]): FormRow => row(msg('form.view', 'View (az, el)'),
  number('view0', shape.view?.[0] ?? defaults[0], { step: '5' }),
  number('view1', shape.view?.[1] ?? defaults[1], { step: '5', min: '-89', max: '89' }));
