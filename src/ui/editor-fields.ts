import { runtime } from '../runtime';
import { message as msg, type Message } from '../i18n';
import { row, switchRow, txAttrs } from './forms';
import type { Attributes, Control, FormRow, Inline, SwitchOption } from './forms';

export const field = (label: string | Message, key: string, value: string | number | null | undefined, attrs: Attributes = {}): FormRow =>
  row(label, { kind: 'input' as const, value: value ?? '', attrs: txAttrs({ type: 'text', 'data-f': key, spellcheck: 'false', ...attrs }) });
export const numField = (label: string | Message, key: string, value: string | number | null | undefined, unit = '', attrs: Attributes = {}): FormRow => ({
  ...row(label, { kind: 'input' as const, value: value ?? '', attrs: { type: 'number', 'data-f': key, ...attrs } }, ...(unit ? [{ kind: 'text' as const, text: unit }] : [])),
  controlClass: unit ? 'ctl unit' : 'ctl',
});
export const segments = (label: string | Message, key: string, value: unknown, options: (string | number)[][], disabled = false): FormRow => ({
  // an option is [value, text, title?, name?]: a name for a button whose text is a symbol
  ...switchRow(label, options.map(([keyValue, text, title, name]): SwitchOption => ({ text: String(text), title: title == null ? undefined : String(title),
    name: name ? String(name) : undefined, on: !disabled && String(value) === String(keyValue), disabled, attrs: { 'data-fs': key, 'data-v': String(keyValue) } }))),
});
export const codeRow = (code: string) => row(msg('ui.code', 'Code'), { kind: 'code' as const, text: code, class: 'km-cmd' });
export const note = (...text: Inline[]): FormRow => ({ kind: 'help' as const, text });
export const actionRow = (key: string, value: string, text: string | Message, danger = true): FormRow => ({ kind: 'actions' as const, class: 'row', buttons: [{ text, attrs: { ['data-' + key]: value, ...(danger ? { class: 'danger' } : {}) } }] });
export function texColour(value: string, attrs: Attributes, { nullable = false, defaultLabel, defaultSwatch, title = msg('ui.colour', 'Colour') }: { nullable?: boolean; defaultLabel?: string; defaultSwatch?: string; title?: string | Message } = {}): Control {
  return { kind: 'texColour' as const, attrs, value: value || '', label: runtime.texColor.label(value, defaultLabel), css: runtime.texColor.swatch(value, defaultSwatch), none: !value && !defaultSwatch,
    nullable, title, defaultLabel, defaultSwatch };
}
