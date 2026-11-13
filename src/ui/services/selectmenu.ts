import { runtime as TD } from '../../runtime';
// Custom menu for every <select> in the app, so all dropdowns match the dash/width menus instead of
// mixing in the native system menu. The <select> stays the source of truth: picking an item sets its
// value and fires the same input/change events a native pick would, so existing handlers keep working.
// Focus never leaves the <select>; the keyboard is handled on it (arrows, Home/End, Enter/Space,
// Escape, Tab, type-to-select).
(function () {
  'use strict';
  const menu = document.createElement('div');
  menu.className = 'selmenu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  document.body.appendChild(menu);

  let sel: any = null; // the <select> the open menu belongs to
  let hi = -1; // highlighted option index
  let typed = '', typedAt = 0;

  const items = () => [...menu.querySelectorAll('.selmenu-item')];
  const enabled = (i: any) => { const o = sel && sel.options[i]; return o && !o.disabled && !o.hidden; };

  function setHi(i: any, scroll?: any) {
    hi = i;
    items().forEach((el) => el.classList.toggle('hi', +(el as HTMLElement).dataset.i! === i));
    if (scroll) { const el = menu.querySelector(`.selmenu-item[data-i="${i}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
  }

  function open(s: any) {
    if (sel === s) { close(); return; }
    sel = s;
    menu.textContent = '';
    menu.setAttribute('aria-label', s.title || s.getAttribute('aria-label') || '');
    let group: any = null;
    [...s.options].forEach((o, i) => {
      if (o.hidden) return;
      const g = o.parentElement.tagName === 'OPTGROUP' ? o.parentElement : null;
      if (g !== group) {
        group = g;
        if (g) { const h = document.createElement('div'); h.className = 'selmenu-group'; h.textContent = g.label; menu.appendChild(h); }
      }
      const el = document.createElement('div');
      el.className = 'selmenu-item' + (i === s.selectedIndex ? ' on' : '') + (o.disabled ? ' dis' : '');
      el.dataset.i = String(i);
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(i === s.selectedIndex));
      el.textContent = o.textContent;
      // an option with data-swatch shows that colour before its name
      if (o.dataset.swatch) { const sw = document.createElement('span'); sw.className = 'selmenu-sw'; sw.style.background = o.dataset.swatch; el.prepend(sw); }
      menu.appendChild(el);
    });
    menu.hidden = false;
    // Size and place: at least as wide as the control, below it, flipped above when there is no room.
    const r = s.getBoundingClientRect();
    menu.style.minWidth = Math.round(r.width) + 'px';
    menu.style.maxHeight = '';
    const w = menu.offsetWidth;
    const below = innerHeight - r.bottom - 12, above = r.top - 12;
    const up = menu.offsetHeight > below && above > below;
    menu.style.maxHeight = Math.max(120, up ? above : below) + 'px';
    const h = menu.offsetHeight;
    // Controls in the properties panel or the top-right Export popover grow their menu leftwards, lined
    // up with the control's right edge, like the dash/width menus; elsewhere, the left edges line up.
    const right = !!s.closest('#props, .exp-pop') || r.left + r.width / 2 > innerWidth * 0.6;
    menu.style.left = Math.max(8, Math.min(right ? r.right - w : r.left, innerWidth - w - 8)) + 'px';
    menu.style.top = (up ? r.top - h - 4 : r.bottom + 4) + 'px';
    menu.style.transformOrigin = (up ? 'bottom ' : 'top ') + (right ? 'right' : 'left');
    s.setAttribute('aria-expanded', 'true');
    setHi(s.selectedIndex, true);
  }

  function close() {
    if (!sel) return;
    sel.removeAttribute('aria-expanded');
    sel = null; hi = -1;
    menu.hidden = true;
  }

  function pick(i: any) {
    const s = sel;
    close();
    if (!s || !s.options[i] || s.options[i].disabled) return;
    if (s.selectedIndex !== i) {
      s.selectedIndex = i;
      s.dispatchEvent(new Event('input', { bubbles: true }));
      s.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (s.isConnected) s.focus({ preventScroll: true });
  }

  function step(dir: any) {
    const n = sel.options.length;
    for (let i = hi + dir; i >= 0 && i < n; i += dir) if (enabled(i)) { setHi(i, true); return; }
  }
  function edge(first: any) {
    const n = sel.options.length;
    for (let k = 0; k < n; k++) { const i = first ? k : n - 1 - k; if (enabled(i)) { setHi(i, true); return; } }
  }
  function typeAhead(ch: any) {
    const now = Date.now();
    typed = now - typedAt > 700 ? ch : typed + ch; typedAt = now;
    const n = sel.options.length, q = typed.toLowerCase();
    const start = typed.length > 1 ? hi : hi + 1;
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
    (e.target! as HTMLElement).focus({ preventScroll: true });
    open(e.target);
  }, true);

  document.addEventListener('keydown', (e) => {
    const t = e.target;
    if (!usable(t)) return;
    if (sel !== t) {
      if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(t); }
      return;
    }
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); e.altKey ? edge(false) : step(1); break;
      case 'ArrowUp': e.preventDefault(); e.altKey ? edge(true) : step(-1); break;
      case 'Home': case 'PageUp': e.preventDefault(); edge(true); break;
      case 'End': case 'PageDown': e.preventDefault(); edge(false); break;
      case 'Enter': case ' ': e.preventDefault(); if (hi >= 0) pick(hi); else close(); break;
      case 'Escape': e.preventDefault(); e.stopPropagation(); close(); break;
      case 'Tab': close(); break;
      default:
        if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) { e.preventDefault(); typeAhead(e.key); }
    }
  }, true);

  // Clicks inside the menu must not reach other "click outside closes me" handlers (export popover,
  // document editor), and must not move focus off the <select>.
  for (const type of ['pointerdown', 'mousedown']) {
    window.addEventListener(type, (e) => {
      if (menu.contains((e.target as Node))) { e.stopPropagation(); e.preventDefault(); }
      else if (sel && e.target !== sel) close();
    }, true);
  }
  menu.addEventListener('mousemove', (e) => {
    const el = (e.target! as Element).closest('.selmenu-item'); if (el && !el.classList.contains('dis') && +(el as HTMLElement).dataset.i! !== hi) setHi(+(el as HTMLElement).dataset.i!);
  });
  menu.addEventListener('click', (e) => {
    const el = (e.target! as Element).closest('.selmenu-item'); if (el && !el.classList.contains('dis')) pick(+(el as HTMLElement).dataset.i!);
  });

  // The control can move or vanish under an open menu (scroll, resize, panel re-render).
  const watch = () => { if (sel && !sel.isConnected) close(); };
  window.addEventListener('resize', close);
  document.addEventListener('scroll', (e) => { if (sel && !menu.contains((e.target as Node))) close(); }, true);
  new MutationObserver(watch).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('focusout', (e) => { if (sel && e.target === sel) setTimeout(() => { if (sel && document.activeElement !== sel) close(); }, 0); });
})();
