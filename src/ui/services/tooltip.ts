import { runtime as TD } from '../../runtime';
import { macKeys } from '../kit/keys';
import { tipLayer } from '../kit/tip-layer.svelte';
// The app's own tooltips, in place of the browser's.
// Every title="…" in the page (static, added later, or changed by code) moves to data-tip, so the
// system tooltip never shows; hovering (or keyboard focus) shows a small ink label instead.
// The tip is the kit's Tooltip (src/ui/kit/Tooltip.svelte), which sets a trailing "(shortcut)" apart: "Rotate 90° (R)".
// Icon-only controls get the text as their aria-label, so screen readers keep the name.
// A name cut short by an ellipsis (a file, a layer, a palette item, a tab: anything with text-overflow: ellipsis, or
// clamped to its lines) shows in full the same way when hovered, over the control's own tip if it has one.
let installed = false;
/** Start the app's tooltips (once): the app at boot, and the kit's buttons as they mount. */
export function installTooltips() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  'use strict';
  const DELAY = 800, WARM = 400; // ms before the first tip; right after one hides, the next shows at once

  let cur: any = null, timer = 0, hidAt = 0, suppressed: any = null;

  // shortcuts as the platform writes them: "Ctrl+Shift+Z" is ⇧⌘Z on a Mac (src/ui/kit/keys.ts)
  TD.macKeys = macKeys;

  // ---------- title → data-tip ----------
  // elements ARIA lets a name be given to: controls, links, table cells and anything with a role of its own
  const NAMEABLE = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|TH|TD|IMG|DETAILS|FIELDSET|TABLE|DIALOG|SECTION|ASIDE|NAV|FORM|svg|image)$/;
  const nameable = (el: Element) => NAMEABLE.test(el.tagName) || /^(?!none$|presentation$|generic$)\w/.test(el.getAttribute('role') || '');
  // the text a screen reader reads out: a drawing's own text (an icon's letters) and hidden parts are left out
  const readText = (el: Element) => {
    let s = '';
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: (n) =>
      n.nodeType === 1 && ((n as Element).tagName === 'svg' || (n as Element).getAttribute('aria-hidden') === 'true') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    while (walk.nextNode()) if (walk.currentNode.nodeType === 3) s += walk.currentNode.nodeValue;
    return s.trim();
  };
  function adopt(el: any) {
    const t = macKeys(el.getAttribute('title'));
    el.removeAttribute('title');
    if (!t) return;
    el.dataset.tip = t;
    // keep an accessible name: icon-only controls and fields are named by the tip, others described by it. Only
    // what may carry a name is named (a plain span or div may not), and a drawing's text doesn't count as a name.
    const named = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
    if (!named && nameable(el) && (/^(SELECT|INPUT|TEXTAREA)$/.test(el.tagName) || !readText(el))) { el.setAttribute('aria-label', t); el.dataset.tipLabel = '1'; }
    else if (el.dataset.tipLabel) el.setAttribute('aria-label', t); // a tip we named it by changed
    else if (!named) el.setAttribute('aria-description', t);
    if (el === cur) show(el, true);
  }

  // ---------- names cut short ----------
  const clipped = (el: any) => {
    if (!(el instanceof HTMLElement) || el.isContentEditable || el.matches(':focus, select, textarea')) return false;
    const cs = getComputedStyle(el);
    if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth) return true;
    return cs.webkitLineClamp !== 'none' && !!cs.webkitLineClamp && el.scrollHeight > el.clientHeight + 1;
  };
  const fullText = (el: any) => (el instanceof HTMLInputElement ? el.value : el.textContent || '').replace(/\s+/g, ' ').trim();
  // the name cut short under the pointer: the hovered element or one round it, or the one cut-short name in the row
  // it is in (the pointer on a row's icon or padding): rows are looked at up to 3 levels out and no taller than 48px,
  // and not past the control with a tip
  const nearby = (el: Element) => [...el.children].flatMap((c) => [c, ...c.children]).slice(0, 40).filter(clipped);
  function clippedAt(start: any, tipEl: any) {
    for (let el = start, n = 0; el instanceof HTMLElement && el !== document.body && n < 6; el = el.parentElement, n++) {
      if (clipped(el)) return el;
      if (n < 3 && el.childElementCount <= 12 && el.getBoundingClientRect().height <= 48) {
        const inside = nearby(el);
        if (inside.length === 1) return inside[0];
        if (inside.length > 1) return null; // several: which one is meant isn't known
      }
      if (el === tipEl) break;
    }
    return null;
  }
  // what the pointer is over: a name cut short, or a control with a tip
  function pick(start: any) {
    if (!start || !start.closest) return null;
    const tipEl = start.closest('[data-tip]');
    return clippedAt(start, tipEl) || tipEl;
  }

  // ---------- the tip: the kit's Tooltip, one floating copy (src/ui/kit/tip-layer.svelte.ts) ----------
  function show(el: any, now?: any) {
    clearTimeout(timer);
    const tip = el.closest('[data-tip]')?.dataset.tip, full = clipped(el) ? fullText(el) : '';
    // a cut-short name in full, its control's tip under it unless that already says it
    const name = full && !(tip && tip.includes(full)) ? full : '';
    if (!(name || tip) || !el.isConnected) { hide(); return; }
    const go = () => {
      if (cur !== el || !el.isConnected || el.matches('.open, [aria-expanded=true]')) return; // its menu is showing
      tipLayer().show(name ? tip || '' : tip, el.getBoundingClientRect(), name || undefined);
    };
    if (now || Date.now() - hidAt < WARM) go(); else timer = setTimeout(go, DELAY);
  }
  function hide() {
    clearTimeout(timer);
    if (tipLayer().hide()) hidAt = Date.now();
    cur = null;
  }
  const target = (e: any) => (e.target && e.target.closest ? e.target.closest('[data-tip]') : null);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = pick(e.target);
    if (el === cur) return;
    if (!el) { if (cur) hide(); return; }
    if (el === suppressed) return;
    suppressed = null;
    if (cur) hide();
    cur = el; show(el);
  }, true);
  document.addEventListener('pointerout', (e) => {
    if (!cur) { if (suppressed && !(e.relatedTarget && suppressed.contains(e.relatedTarget))) suppressed = null; return; }
    if (e.relatedTarget && cur.contains(e.relatedTarget)) return;
    if (suppressed === cur) suppressed = null;
    hide();
  }, true);
  // pressing hides it until the pointer leaves that control
  document.addEventListener('pointerdown', () => { if (cur) { suppressed = cur; hide(); } }, true);
  document.addEventListener('keydown', (e) => { if (cur && e.key !== 'Shift') hide(); }, true);
  document.addEventListener('wheel', () => cur && hide(), { capture: true, passive: true });
  window.addEventListener('blur', hide);
  // keyboard focus shows it too
  document.addEventListener('focusin', (e) => {
    const el = target(e);
    if (el && el.matches(':focus-visible') && !el.matches('input, textarea, [contenteditable]')) { cur = el; show(el); }
  });
  document.addEventListener('focusout', (e) => { if (cur && e.target === cur) hide(); });
  // the control went away under the pointer (a menu closed, a panel re-rendered)
  document.addEventListener('pointermove', () => { if (cur && !cur.isConnected) hide(); }, { passive: true });

  const sweep = (root: any) => { if (root.nodeType !== 1) return; if (root.hasAttribute('title')) adopt(root); root.querySelectorAll('[title]').forEach(adopt); };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') { if ((m.target as Element).hasAttribute('title')) adopt(m.target); }
      else m.addedNodes.forEach(sweep);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  sweep(document.documentElement);

  TD.tooltip = { hide };
}
// starts on import, as the app has always loaded it (src/main.ts keeps the order); kit components call it again,
// harmlessly (and prerendering the shell, outside a browser, loads it without starting it)
if (typeof document !== 'undefined') installTooltips();
