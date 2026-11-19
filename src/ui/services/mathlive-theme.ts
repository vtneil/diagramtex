// MathLive in the app's own look. MathLive draws its menu (☰, or a right-click) inside each field's shadow root, where
// the page's CSS reaches only a few parts and not the keyboard-highlighted row (on Safari it is the system accent),
// so each field gets this sheet as well: the menu is the app's menu (.ctx in kit.css: 4px padding, 28px rows with
// --r corners, --well when pointed at, rules between groups, shortcuts in pencil, a fade in), and the menu toggle is
// a flat graphite icon button with the app's line icon. The app's tokens are custom properties, which reach into the
// shadow root.
// The command suggestions (\fr… → \frac) are a box in the page: kit.css styles it as the LaTeX autocomplete, and
// liftSuggestions() puts it in the browser's top layer while it shows, over the text popup (itself in the top layer).
let sheet: CSSStyleSheet | null = null;
const CSS = `
.ML__menu-toggle {
  position: relative; width: 28px; height: 28px; margin: 0 0 0 4px; border: 0; border-radius: var(--r, 8px);
  color: var(--graphite); background: transparent; transition: background .12s ease, color .12s ease;
}
.ML__menu-toggle:hover { background: var(--well); color: var(--ink); }
.ML__menu-toggle:active { scale: .95; transition: scale .08s ease-out; }
/* the app's line icon over MathLive's filled one, which stays (unseen) to name the button for screen readers */
.ML__menu-toggle > svg { position: absolute; width: 16px; height: 16px; opacity: 0; }
.ML__menu-toggle::before {
  content: ''; width: 16px; height: 16px; background: currentColor;
  -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M3 4.5h10M3 8h10M3 11.5h10'/%3E%3C/svg%3E") center / 16px no-repeat;
  mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none' stroke='black' stroke-width='1.5' stroke-linecap='round'%3E%3Cpath d='M3 4.5h10M3 8h10M3 11.5h10'/%3E%3C/svg%3E") center / 16px no-repeat;
}
@media (prefers-reduced-motion: reduce) { .ML__menu-toggle:active { scale: none; } }
.ui-menu-container {
  padding: 4px; min-width: 200px; border: 1px solid var(--rule-strong); border-radius: var(--r-lg, 12px);
  background: var(--sheet-raised); color: var(--ink); box-shadow: var(--shadow-pop);
  font: 13px var(--font-ui); animation: td-menu-in .14s var(--ease, ease-out);
  --ui-font-family: var(--font-ui); --ui-font-size: 13px; --ui-line-height: 20px; --ui-letter-spacing: 0;
}
@keyframes td-menu-in { from { opacity: 0; transform: scale(.97); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .ui-menu-container { animation: none; } }
.ui-menu-container > li {
  min-height: 28px; margin: 0; padding: 0 8px; border-radius: var(--r, 8px); color: var(--ink);
  font: 13px/20px var(--font-ui); letter-spacing: 0;
}
.ui-menu-container > li > .label { padding: 0; border: 0; }
.ui-menu-container > li.active, .ui-menu-container > li.active.is-submenu-open { background: var(--well); color: var(--ink); }
.ui-menu-container > li[aria-disabled='true'] { opacity: 1; color: var(--faint); }
.ui-menu-container > li[role='divider'] {
  min-height: 0; height: 0; width: auto; margin: 4px 8px; padding: 0; border: 0; border-top: 1px solid var(--rule); border-radius: 0;
}
.ui-menu-container > li > kbd { margin-inline-start: 16px; opacity: 1; color: var(--pencil); font: 12px var(--font-ui); letter-spacing: .04em; }
.ui-menu-container > li.active > kbd, .ui-menu-container > li.active::after { opacity: 1; color: var(--pencil); }
.ui-menu-container > li > .label.heading { opacity: 1; padding-top: 4px; color: var(--pencil); font-size: 11px; font-weight: 600; }
/* a submenu's arrow: the app's "›" in pencil (as .ctx-item .arr) in place of MathLive's filled chevron */
.ui-trailing-chevron { width: auto; height: auto; margin: 0 0 0 16px; color: var(--pencil); font: 16px/1 var(--font-ui); }
.ui-trailing-chevron > svg { display: none; }
.ui-trailing-chevron::before { content: '›'; }
.ui-checkmark { color: var(--ink); }
/* Color and Background: a grid of the app's swatches (.swatches in kit.css: 4px corners, a hairline edge, 4px apart),
   the pointed-at one ringed in blue pen, the chosen one ticked; never MathLive's grey tiles or its 1.4× pop-out */
.swatches-submenu { display: grid; grid-template-columns: repeat(4, 24px); gap: 4px; padding: 8px; min-width: 0; max-width: none; }
.ui-menu-container > li.menu-swatch {
  position: relative; width: 24px; height: 24px; min-height: 0; margin: 0; padding: 0; border-radius: var(--r-sm, 4px);
  background: none; scale: none; z-index: auto;
}
.menu-swatch > .label { display: block; width: 100%; height: 100%; padding: 0; margin: 0; }
.menu-swatch > .label > span, .menu-swatch.active > .label > span {
  display: block; width: 24px; height: 24px; min-width: 0; min-height: 0; margin: 0; border-radius: var(--r-sm, 4px);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ink) 16%, transparent);
}
.ui-menu-container > li.menu-swatch.active { background: none; outline: 2px solid var(--bluepen); outline-offset: 1px; }
.menu-swatch .ui-checkmark, .menu-swatch .ui-mixedmark { inset: 4px; width: 16px; height: 16px; }
`;

/** Give a new <math-field> the app's menu and toggle. */
export function themeField(mf: HTMLElement) {
  const root = mf.shadowRoot;
  if (!root || !('adoptedStyleSheets' in root)) return;
  if (!sheet) { sheet = new CSSStyleSheet(); sheet.replaceSync(CSS); }
  if (!root.adoptedStyleSheets.includes(sheet)) root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
}

let lifted = false;
/** Keep MathLive's suggestion box in the top layer while it shows (once, when MathLive loads). */
export function liftSuggestions() {
  if (lifted || typeof document === 'undefined') return;
  lifted = true;
  const sync = (el: HTMLElement) => {
    const shown = el.classList.contains('is-visible');
    if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
    try {
      // shown again: to the top of the top layer, above a popup opened since
      if (shown) { if (el.matches(':popover-open')) el.hidePopover(); el.showPopover(); }
      else if (el.matches(':popover-open')) el.hidePopover();
    } catch { /* not in the page */ }
  };
  const watch = (el: HTMLElement) => {
    if (el.dataset.tdLifted) return;
    el.dataset.tdLifted = '1';
    let was = false;
    new MutationObserver(() => { const now = el.classList.contains('is-visible'); if (now !== was) { was = now; sync(el); } })
      .observe(el, { attributes: true, attributeFilter: ['class'] });
    if (el.classList.contains('is-visible')) { was = true; sync(el); }
  };
  const find = () => { const el = document.getElementById('mathlive-suggestion-popover'); if (el) watch(el); };
  new MutationObserver(find).observe(document.body, { childList: true });
  find();
}
