import { get, writable } from 'svelte/store';
import { thai } from './th';
import { escapeHtml } from '../core/html';

export type Locale = 'en' | 'th';
export const LANGUAGE_KEY = 'diagramtex.language';
// Start in English on both the server and client so the prerendered shell hydrates identically.
export const locale = writable<Locale>('en');
export type Params = Record<string, string | number>;
export interface Message { id: string; fallback: string; params?: Params }
export const message = (id: string, fallback: string, params?: Params): Message => ({ id, fallback, params });
export function t(id: string, fallback: string, params: Params = {}, language: Locale = get(locale)): string {
  const text = language === 'th' ? thai[id] ?? fallback : fallback;
  return text.replace(/\{([a-zA-Z][a-zA-Z0-9_]*)\}/g, (token, name) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : token);
}
/** A message with inline emphasis: everything is escaped except <kbd>, <b> and <strong> (no attributes), so a
 * translation can move key caps and bold words within its own word order. Use with {@html}. */
export function rich(text: string): string {
  const e = escapeHtml(text);
  return e.replace(/&lt;(\/?)(kbd|b|strong)&gt;/g, '<$1$2>');
}
/** Only explicitly marked messages are translated. Ordinary strings are content. */
export function caption(value: unknown, language: Locale = get(locale)): string {
  if (value && typeof value === 'object' && 'id' in value && 'fallback' in value) {
    const m = value as Message;
    return t(m.id, m.fallback, m.params, language);
  }
  return value == null ? '' : String(value);
}
/** Runs immediately; callers must dispose when their controller is destroyed. */
export function onLocale(refresh: (language: Locale) => void): () => void {
  return locale.subscribe(refresh);
}
/** Bind a controller caption without rebuilding inputs, selection or document state. */
export function bindCaption(element: Element, value: Message, attribute?: string): () => void {
  return onLocale(language => {
    const text = caption(value, language);
    if (attribute) element.setAttribute(attribute, text);
    else element.textContent = text;
  });
}
export function setLocale(value: string): void {
  const language: Locale = value === 'th' ? 'th' : 'en';
  locale.set(language);
  if (typeof document !== 'undefined') document.documentElement.lang = language;
  try { localStorage.setItem(LANGUAGE_KEY, language); } catch { /* Private/blocked storage: session choice still works. */ }
}
export function restoreLocale(): void {
  let saved: string | null = null;
  try { saved = localStorage.getItem(LANGUAGE_KEY); } catch { /* Browser preference still works without storage. */ }
  const browserLanguage = typeof navigator === 'undefined' ? '' : navigator.languages?.[0] || navigator.language || '';
  const detected: Locale = /^th(?:-|$)/i.test(browserLanguage) ? 'th' : 'en';
  setLocale(saved === 'en' || saved === 'th' ? saved : detected);
}
/** Translate presentation attributes only; values and identifiers remain the controller's. */
export function translatedAttrs<T extends Record<string, unknown>>(attrs: T, language: Locale, captions: Record<string, Message> = {}): T {
  const result = { ...attrs };
  for (const key of ['title', 'aria-label', 'placeholder']) {
    if (captions[key]) (result as Record<string, unknown>)[key] = caption(captions[key], language);
  }
  return result;
}
