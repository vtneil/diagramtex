import { runtime } from '../runtime';
import { row } from './forms';
import type { Attributes, Control, FormRow, Inline } from './forms';

export const field = (label: string, key: string, value: string | number | null | undefined, attrs: Attributes = {}): FormRow =>
  row(label, { kind: 'input' as const, value: value ?? '', attrs: { type: 'text', 'data-f': key, spellcheck: 'false', ...attrs } });
export const numField = (label: string, key: string, value: string | number | null | undefined, unit = '', attrs: Attributes = {}): FormRow => ({
  ...row(label, { kind: 'input' as const, value: value ?? '', attrs: { type: 'number', 'data-f': key, ...attrs } }, ...(unit ? [{ kind: 'text' as const, text: unit }] : [])),
  controlClass: unit ? 'ctl unit' : 'ctl',
});
export const segments = (label: string, key: string, value: unknown, options: (string | number)[][], disabled = false): FormRow => ({
  ...row(label, ...options.map(([keyValue, text, title]): Control => ({ kind: 'button' as const, text: String(text),
    attrs: { 'data-fs': key, 'data-v': String(keyValue), class: !disabled && String(value) === String(keyValue) ? 'on' : '', title, ...(disabled ? { disabled: true } : {}) } }))),
  controlClass: 'ctl seg-ctl',
});
export const codeRow = (code: string) => row('Code', { kind: 'code' as const, text: code, class: 'km-cmd' });
export const note = (...text: Inline[]): FormRow => ({ kind: 'help' as const, text });
export const actionRow = (key: string, value: string, text: string, danger = true): FormRow => ({ kind: 'actions' as const, class: 'row', buttons: [{ text, attrs: { ['data-' + key]: value, ...(danger ? { class: 'danger' } : {}) } }] });
export function texColour(value: string, attrs: Attributes, { nullable = false, defaultLabel, defaultSwatch, title = 'Colour' }: { nullable?: boolean; defaultLabel?: string; defaultSwatch?: string; title?: string } = {}): Control {
  return { kind: 'texColour' as const, attrs, value: value || '', label: runtime.texColor.label(value, defaultLabel), css: runtime.texColor.swatch(value, defaultSwatch), none: !value && !defaultSwatch,
    nullable, title, defaultLabel, defaultSwatch };
}
