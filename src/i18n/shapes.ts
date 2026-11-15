import { get } from 'svelte/store';
import { locale, type Locale } from './index';
import { thai } from './th';
/** A shape type's display name. Ids are `shape.<type>` (the TYPES key); English comes from the type's own `name`,
 * so the domain stays the single English source. Thai entries live in ./th/views.ts. */
export function typeName(type: string, language: Locale = get(locale)): string {
  const T = (globalThis as any).TD?.TYPES?.[type];
  const en = (T && T.name) || type;
  return language === 'th' ? thai['shape.' + type] ?? en : en;
}
/** A block's Blocks-menu caption: ids `block.<type>.label` / `block.<type>.title` (the type registered with
 * TD.blocks.register); English is the block definition's own `menu.label` / `menu.title`. */
export function blockCaption(type: string, part: 'label' | 'title', en: string, language: Locale = get(locale)): string {
  return language === 'th' ? thai['block.' + type + '.' + part] ?? en : en;
}
