import { flushSync, mount } from 'svelte';
import { runtime as TD } from '../../runtime';
import { caption } from '../../i18n';
import SelectMenu, { type SelectMenuModel, type SelectMenuRow } from '../SelectMenu.svelte';
// Custom menu for every select element in the app, so all dropdowns match the dash/width menus instead of
// mixing in the native system menu. The select element stays the source of truth: picking an item sets its
// value and fires the same input/change events a native pick would, so existing handlers keep working.
// Focus never leaves the select element; the keyboard is handled on it (arrows, Home/End, Enter/Space,
// Escape, Tab, type-to-select). The menu is src/ui/SelectMenu.svelte, drawn from `model`.
/** What a select's menu shows beyond its options' text (set by the kit's Select): a drawing and a note per
 *  value, a grid of drawing tiles `columns` across, and a custom line at the foot that takes a typed value. */
export interface SelectExtras {
  svg?: Record<string, string>;
  notes?: Record<string, string>;
  columns?: number;
  custom?: { label: string; value: string; placeholder?: string; title?: string; on?: boolean; apply(text: string): void };
}
const extras = new WeakMap<HTMLSelectElement, SelectExtras>();
export function setSelectExtras(el: HTMLSelectElement, x: SelectExtras | null) { if (x) extras.set(el, x); else extras.delete(el); }

let installed = false;
/** Start the app's menu for every select element (once): the app at boot, and the kit's Select as it mounts. */
export function installSelectMenu() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  'use strict';
  const model: SelectMenuModel = $state({ open: false, leaving: false, label: '', kind: 'list', cols: 3, rows: [], hi: -1, custom: null, left: 0, top: 0, minWidth: 0, maxHeight: null, origin: 'top left' });
  let custom: SelectExtras['custom'] | null = null;
  mount(SelectMenu, { target: document.body, props: { model, oncustomkey: customKey, oncustomblur: customBlur } });
  flushSync();
  const menu = document.querySelector<HTMLElement>('body > .selmenu')!;

  let sel: any = null; // the select element the open menu belongs to
  let typed = '', typedAt = 0, leaveTimer = 0;

  const enabled = (i: any) => { const o = sel && sel.options[i]; return o && !o.disabled && !o.hidden; };

  function setHi(i: any, scroll?: any) {
    const changed = model.hi !== i;
    model.hi = i; flushSync();
    if (changed && sel && enabled(i)) sel.dispatchEvent(new CustomEvent('optionpreview', { bubbles: true, detail: { value: sel.options[i].value } }));
    if (scroll) menu.querySelector(`.selmenu-item[data-i="${i}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  // the custom line: Enter puts its value in; Esc, or ↑ from an empty field, goes back to the select
  function customKey(e: KeyboardEvent, input: HTMLInputElement) {
    const c = custom;
    if (!c) return;
    if (e.key === 'Enter' && input.value.trim()) {
      // focus goes back once the new value is in the select (a focused field isn't rewritten: live-value.ts)
      e.preventDefault(); const s0 = sel; close(); c.apply(input.value.trim()); setTimeout(() => s0?.focus({ preventScroll: true }), 0);
    }
    else if (e.key === 'Escape' || (e.key === 'ArrowUp' && !input.value)) { e.preventDefault(); e.stopPropagation(); sel?.focus({ preventScroll: true }); if (e.key === 'Escape') close(); }
  }
  function customBlur() { setTimeout(() => { if (sel && document.activeElement !== sel && !menu.contains(document.activeElement)) close(); }, 0); }

  function open(s: any) {
    if (sel === s) { close(); return; }
    close();
    sel = s;
    clearTimeout(leaveTimer);
    // a select with data-pics names a set of pictures (TD.selectPics[name][value] = [short label, svg]):
    // its options are tiles in a grid, like the Blocks menu
    const pics = s.dataset.pics && TD.selectPics && TD.selectPics[s.dataset.pics];
    const x = extras.get(s) || {};
    const rows: SelectMenuRow[] = [];
    let group: any = null;
    [...s.options].forEach((o: any, i: number) => {
      if (o.hidden) return;
      const g = o.parentElement.tagName === 'OPTGROUP' ? o.parentElement : null;
      if (g !== group) { group = g; if (g) rows.push({ group: g.label }); }
      // a drawing before the name (a dash, a width), or alone as a tile; a quiet note after it ("0.75 pt");
      // an option with data-swatch shows that colour before its name
      const svg = x.svg?.[o.value];
      rows.push({ i, text: o.textContent, on: i === s.selectedIndex, dis: o.disabled, svg, tile: !!(svg && x.columns), note: x.notes?.[o.value],
        pic: pics && pics[o.value] ? { svg: pics[o.value][1], label: caption(pics[o.value][0]) } : undefined, swatch: o.dataset.swatch, font: o.style.fontFamily });
    });
    custom = x.custom || null;
    // a grid of pictures, or of drawings without names (arrow tips) `columns` across
    const r = s.getBoundingClientRect();
    Object.assign(model, { open: true, leaving: false, label: s.title || s.getAttribute('aria-label') || '', kind: pics ? 'pics' : x.columns ? 'tiles' : 'list', cols: x.columns || 3, rows, hi: -1,
      custom: custom ? { label: custom.label, value: custom.value, placeholder: custom.placeholder, title: custom.title, on: custom.on } : null,
      left: 0, top: 0, minWidth: Math.round(r.width), maxHeight: null });
    flushSync();
    // Size and place: at least as wide as the control, below it, flipped above when there is no room.
    const w = menu.offsetWidth;
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = menu.offsetHeight > below && above > below;
    model.maxHeight = Math.max(120, up ? above : below); flushSync();
    const h = menu.offsetHeight;
    // Controls in the properties panel or the top-right Export popover grow their menu leftwards, lined
    // up with the control's right edge, like the dash/width menus; elsewhere, the left edges line up.
    const right = !!s.closest('#props, .exp-pop') || r.left + r.width / 2 > innerWidth * 0.6;
    Object.assign(model, { left: Math.max(8, Math.min(right ? r.right - w : r.left, innerWidth - w - 8)), top: up ? r.top - h - 4 : r.bottom + 4, origin: (up ? 'bottom ' : 'top ') + (right ? 'right' : 'left') });
    flushSync();
    s.setAttribute('aria-expanded', 'true');
    setHi(s.selectedIndex, true);
  }

  // closed at once (hidden, for everything that asks); drawn a moment longer while it fades out (kit.css)
  function close() {
    if (!sel) return;
    sel.dispatchEvent(new CustomEvent('optionpreviewend', { bubbles: true }));
    sel.removeAttribute('aria-expanded');
    sel = null; custom = null;
    const fade = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    Object.assign(model, { open: false, hi: -1, leaving: fade });
    flushSync();
    if (fade) leaveTimer = window.setTimeout(() => { model.leaving = false; }, 130);
  }

  function pick(i: any) {
    const s = sel;
    close();
    if (!s || !s.options[i] || s.options[i].disabled) return;
    const focusBefore = document.activeElement;
    if (s.selectedIndex !== i) {
      s.selectedIndex = i;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // A change handler may deliberately return focus to its editing surface.
    if (s.isConnected && document.activeElement === focusBefore) s.focus({ preventScroll: true });
  }

  // in a grid of tiles, up and down move a row (the tiles across the first row)
  const across = () => { const t = [...menu.querySelectorAll<HTMLElement>('.selmenu-item')]; if (model.kind === 'list' || !t.length) return 1; const y = t[0].offsetTop; return Math.max(1, t.filter((x) => x.offsetTop === y).length); };
  function step(dir: any, rows = false) {
    const n = sel.options.length, by = rows ? across() : 1;
    if (by > 1) { const i = model.hi + dir * by; if (i >= 0 && i < n && enabled(i)) setHi(i, true); return; }
    for (let i = model.hi + dir; i >= 0 && i < n; i += dir) if (enabled(i)) { setHi(i, true); return; }
    if (dir > 0) menu.querySelector<HTMLInputElement>('.selmenu-custom input')?.focus();
  }
  function edge(first: any) {
    const n = sel.options.length;
    for (let k = 0; k < n; k++) { const i = first ? k : n - 1 - k; if (enabled(i)) { setHi(i, true); return; } }
  }
  function typeAhead(ch: any) {
    const now = Date.now();
    typed = now - typedAt > 700 ? ch : typed + ch; typedAt = now;
    const n = sel.options.length, q = typed.toLowerCase();
    const start = typed.length > 1 ? model.hi : model.hi + 1;
    for (let k = 0; k < n; k++) {
      const i = (start + k + n) % n;
      if (enabled(i) && sel.options[i].textContent.trim().toLowerCase().startsWith(q)) { setHi(i, true); return; }
    }
  }

  const usable = (t: any) => t instanceof HTMLSelectElement && !t.disabled && !t.multiple && t.size <= 1;

  // Open on press instead of letting the system menu appear.
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !usable(e.target)) return;
    e.preventDefault();
    // opened by the pointer: no focus ring afterwards ([data-by-pointer], kit.css), until a key is pressed on it.
    // An attribute, not a class: a component re-rendering its class (kit Select) would wipe a class
    (e.target! as HTMLElement).dataset.byPointer = '';
    (e.target! as HTMLElement).focus({ preventScroll: true });
    open(e.target);
  }, true);

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!usable(t)) return;
    if (e.key !== 'Shift' && e.key !== 'Meta' && e.key !== 'Control' && e.key !== 'Alt') delete (t as HTMLElement).dataset.byPointer;
    if (sel !== t) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(t); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); e.altKey ? edge(false) : step(1, true); break;
      case 'ArrowUp': e.preventDefault(); e.altKey ? edge(true) : step(-1, true); break;
      case 'ArrowRight': case 'ArrowLeft': if (model.kind !== 'list') { e.preventDefault(); step(e.key === 'ArrowRight' ? 1 : -1); } break;
      case 'Home': case 'PageUp': e.preventDefault(); edge(true); break;
      case 'End': case 'PageDown': e.preventDefault(); edge(false); break;
      case 'Enter': case ' ': e.preventDefault(); if (model.hi >= 0) pick(model.hi); else close(); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': close(); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); typeAhead(e.key); }
    }
  }, true);

  // Clicks inside the menu must not reach other "click outside closes me" handlers (export popover,
  // document editor), and must not move focus off the select element.
  for (const type of ['pointerdown', 'mousedown']) {
    window.addEventListener(type, (e) => {
      if (menu.contains((e.target as Node))) { e.stopPropagation(); if (!(e.target as Element).closest('.selmenu-custom input')) e.preventDefault(); }
      else if (sel && e.target !== sel) close();
    }, true);
  }
  menu.addEventListener('mousemove', (e) => {
    const el = (e.target! as Element).closest('.selmenu-item'); if (el && !el.classList.contains('dis') && +(el as HTMLElement).dataset.i! !== model.hi) setHi(+(el as HTMLElement).dataset.i!);
  });
  menu.addEventListener('click', (e) => {
    const el = (e.target! as Element).closest('.selmenu-item'); if (el && !el.classList.contains('dis')) pick(+(el as HTMLElement).dataset.i!);
  });

  // The control can move or vanish under an open menu (scroll, resize, panel re-render).
  const watch = () => { if (sel && !sel.isConnected) close(); };
  window.addEventListener('resize', close);
  document.addEventListener('scroll', (e) => { if (sel && !menu.contains((e.target as Node))) close(); }, true);
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  // the next time it is reached, it may be by the keyboard: the ring comes back
  document.addEventListener('focusout', (e) => { if (e.target instanceof HTMLSelectElement && e.target !== sel) delete e.target.dataset.byPointer; });
  document.addEventListener('focusout', (e) => { if (sel && e.target === sel) setTimeout(() => { if (sel && document.activeElement !== sel && !menu.contains(document.activeElement)) close(); }, 0); });
}
// starts on import, as the app has always loaded it (src/main.ts keeps the order); kit components call it again, harmlessly
installSelectMenu();
