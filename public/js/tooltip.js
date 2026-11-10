// The app's own tooltips, in place of the browser's.
// Every title="…" in the page (static, added later, or changed by code) moves to data-tip, so the
// system tooltip never shows; hovering (or keyboard focus) shows a small ink label instead.
// A trailing "(shortcut)" in the text is set apart as a key hint: "Rotate 90° (R)".
// Icon-only controls get the text as their aria-label, so screen readers keep the name.
(function () {
  'use strict';
  const TD = (window.TD = window.TD || {});
  const DELAY = 800, WARM = 400; // ms before the first tip; right after one hides, the next shows at once

  let tip = null, cur = null, timer = 0, hidAt = 0, suppressed = null;

  // ---------- shortcuts as the platform writes them ----------
  // Titles say "Ctrl+Shift+Z"; on a Mac that is ⇧⌘Z (glyphs in the order ⌃⌥⇧⌘, Apple's keyboard
  // guidelines), and "Ctrl+scroll" is ⌘-scroll. Shift on its own ("Shift+drag") stays in words.
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const GLYPH = { Del: '⌫', Delete: '⌫', Backspace: '⌫', Enter: '↩', Return: '↩', Esc: '⎋', Tab: '⇥' };
  const WORD = /^(scroll|wheel|drag|click)$/i;
  function macKeys(text) {
    if (!isMac || !text) return text;
    return text.replace(/\b((?:(?:Ctrl|Cmd|Shift|Alt)\+)+)([^\s(),:;+]+)/g, (all, mods, key) => {
      const m = mods.split('+');
      if (!m.some((x) => x === 'Ctrl' || x === 'Cmd' || x === 'Alt')) return all;
      const g = (m.includes('Alt') ? '⌥' : '') + (m.includes('Shift') ? '⇧' : '') + (m.includes('Ctrl') || m.includes('Cmd') ? '⌘' : '');
      return WORD.test(key) ? `${g}-${key.toLowerCase() === 'wheel' ? 'scroll' : key}` : g + (GLYPH[key] || key);
    });
  }
  TD.macKeys = macKeys;

  // ---------- title → data-tip ----------
  function adopt(el) {
    const t = macKeys(el.getAttribute('title'));
    el.removeAttribute('title');
    if (!t) return;
    el.dataset.tip = t;
    // keep an accessible name: icon-only controls and fields are named by the tip, others described by it
    const named = el.hasAttribute('aria-label') || el.hasAttribute('aria-labelledby');
    if (!named && (/^(SELECT|INPUT|TEXTAREA)$/.test(el.tagName) || !el.textContent.trim())) { el.setAttribute('aria-label', t); el.dataset.tipLabel = '1'; }
    else if (el.dataset.tipLabel) el.setAttribute('aria-label', t); // a tip we named it by changed
    else if (!named) el.setAttribute('aria-description', t);
    if (el === cur) show(el, true);
  }

  // ---------- the tip ----------
  function node() {
    if (!tip) { tip = document.createElement('div'); tip.className = 'td-tip'; tip.setAttribute('role', 'tooltip'); tip.hidden = true; document.body.appendChild(tip); }
    return tip;
  }
  const KEY = /\s\(((?:⌘|⇧|⌥|⌃|Ctrl\+|Shift\+|Alt\+|Cmd\+)*[^\s()]{1,6})\)$/; // "… (⌘Z)", "… (Ctrl+Shift+Z)", "… (R)"
  function fill(t, text) {
    const key = (s) => { const k = document.createElement('kbd'); k.textContent = s; return k; };
    // "Wire (W): drag between points" → "Wire  W" over a muted second line
    const lead = /^([^()]{1,40}?) \(((?:⌘|⇧|⌥|⌃|Ctrl\+|Shift\+|Alt\+|Cmd\+)*[^\s()]{1,6})\)\s*[:—–-]\s*(.+)$/.exec(text);
    if (lead) {
      t.textContent = lead[1]; t.appendChild(key(lead[2]));
      const sub = document.createElement('div'); sub.className = 'td-tip-sub'; sub.textContent = lead[3]; t.appendChild(sub);
      return;
    }
    const m = KEY.exec(text);
    t.textContent = m ? text.slice(0, m.index) : text;
    if (m) t.appendChild(key(m[1]));
  }
  function place(el) {
    const t = node(), r = el.getBoundingClientRect(), W = innerWidth, H = innerHeight;
    const w = t.offsetWidth, h = t.offsetHeight, gap = 6;
    let y = r.bottom + gap;
    if (y + h > H - 8) y = r.top - gap - h; // no room below: above
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, W - w - 8));
    t.style.left = Math.round(x) + 'px'; t.style.top = Math.round(Math.max(8, y)) + 'px';
  }
  function show(el, now) {
    clearTimeout(timer);
    const text = el.dataset.tip;
    if (!text || !el.isConnected) { hide(); return; }
    const go = () => {
      if (cur !== el || !el.isConnected) return;
      const t = node();
      fill(t, text);
      t.hidden = false;
      place(el);
      t.classList.add('on');
    };
    if (now || Date.now() - hidAt < WARM) go(); else timer = setTimeout(go, DELAY);
  }
  function hide() {
    clearTimeout(timer);
    if (tip && !tip.hidden) { tip.hidden = true; tip.classList.remove('on'); hidAt = Date.now(); }
    cur = null;
  }
  const target = (e) => (e.target && e.target.closest ? e.target.closest('[data-tip]') : null);

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = target(e);
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

  const sweep = (root) => { if (root.nodeType !== 1) return; if (root.hasAttribute('title')) adopt(root); root.querySelectorAll('[title]').forEach(adopt); };
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') { if (m.target.hasAttribute('title')) adopt(m.target); }
      else m.addedNodes.forEach(sweep);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });
  sweep(document.documentElement);

  TD.tooltip = { hide };
})();
