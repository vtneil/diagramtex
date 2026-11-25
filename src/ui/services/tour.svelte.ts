import { flushSync, unmount } from 'svelte';
import { runtime as TD } from '../../runtime';
import { t } from '../../i18n';
import { mountFrame } from '../mount-frame';
import Tour, { type TourModel, type TourStep } from '../Tour.svelte';
// The welcome tour: a few cards, opened from the command search (Welcome Tour); never on its own. Each card
// (src/ui/Tour.svelte) has a small map of the window with the part it talks about
// marked in blue pen, so nothing on the page itself moves or is covered. Previous / Next (← →), "I’m All Good" skips
// (Esc too). It opens and closes as the kit's dialog does.
(function () {
  'use strict';
  const kb = (k: string) => (TD.app && TD.app.cmd ? TD.app.cmd.kb(k) : k);
  const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  // translated text, escaped, with {name} slots filled by markup built here (the text itself never holds markup)
  const fill = (text: string, slots: Record<string, string>) => esc(text).replace(/\{([a-zA-Z]+)\}/g, (m, k) => (k in slots ? slots[k] : m));
  const b = (s: string) => `<b>${esc(s)}</b>`;

  const STEPS = (): TourStep[] => [
    { at: null, title: t('tour.welcome.title', 'Welcome to DiagramTeX'),
      body: `<p>${esc(t('tour.welcome.body', 'Draw diagrams, write around them, and take them to LaTeX as TikZ code that compiles. Here’s a quick look around.'))}</p>` },
    { at: 'left', title: t('tour.left.title', 'Files and tools on the left'),
      body: `<p>${fill(t('tour.left.body', 'Your files are listed on the left, and next to them is the tool rail: shapes, lines, plots and {blocks}, which are ready-made editors such as:'), { blocks: b(t('ui.blocks', 'Blocks')) })}</p>
        <div class="tour-tags"><span>${esc(t('ui.quantum.circuit', 'Quantum circuit'))}</span><span>${esc(t('ui.circuit', 'Circuit'))}</span><span>${esc(t('ui.chemistry', 'Chemistry'))}</span><span>${esc(t('ui.tree', 'Tree'))}</span><span>${esc(t('tour.tag.timing', 'Timing'))}</span><span>${esc(t('ui.bloch.sphere', 'Bloch sphere'))}</span></div>
        <p>${esc(t('tour.left.pick', 'Pick one, click the canvas to place it, then double-click it to edit.'))}</p>` },
    { at: 'top', title: t('tour.top.title', 'What you’re making, on top'),
      body: `<p>${fill(t('tour.top.body', 'The top bar picks the kind of work: {classic} diagrams and documents, a {page}, a {whiteboard}, a {table}, or {quick}: a formula or a block, without a file.'), { classic: b(t('ui.classic', 'Classic')), page: b(t('ui.page', 'Page')), whiteboard: b(t('ui.whiteboard', 'Whiteboard')), table: b(t('ui.table', 'Table')), quick: b(t('ui.quick', 'Quick')) })}</p>
        <p>${esc(t('tour.top.export', 'Export and LaTeX on the right take it out as a picture, a PDF or code.'))}</p>` },
    { at: 'right', title: t('tour.right.title', 'Settings on the right'),
      body: `<p>${esc(t('tour.right.body', 'The panel on the right shows the settings of whatever you select: colours, line styles, labels, a block’s options.'))}</p>
        <p>${esc(t('tour.right.fold', 'Click its heading to fold it out of the way.'))}</p>` },
    { at: 'save', title: t('tour.save.title', 'Keep a copy of what matters'), warn: true,
      body: `<p>${esc(TD.docStore?.active === false ? t('tour.save.none', 'This browser can’t keep your work as you go.') : t('tour.save.body', 'Your work is saved in this browser as you go. Clearing the browser’s data, or using a private window, wipes it.'))}</p>
        <p>${fill(t('tour.save.how', 'For anything important, {save} it as a {file} file ({key}) and keep it somewhere safe.'), { save: b(t('ui.save', 'Save')), file: '<code>.diagramtex</code>', key: `<kbd>${kb('Ctrl+Shift+S')}</kbd>` })}</p>` },
  ];

  let open: (() => void) | null = null;
  function show() {
    if (open) return;
    const prev = document.activeElement as HTMLElement | null;
    const model: TourModel = $state({ steps: STEPS(), i: 0 });
    const root = document.createElement('div');
    root.className = 'td-dialog tour';
    const view = mountFrame(root, Tour, model);
    const next = () => root.querySelector<HTMLElement>('[data-t="next"]');
    // the buttons shown (one that isn't keeps its room, hidden)
    const shown = () => [...root.querySelectorAll<HTMLElement>('button')].filter((b) => getComputedStyle(b).visibility !== 'hidden');
    function close() {
      if (open !== close) return;
      open = null;
      if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
      // it fades out as the kit's dialog does (kit.css, .td-dialog-leaving), then goes
      const go = () => { if (root.isConnected) { void unmount(view); root.remove(); } };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { go(); return; }
      root.className = 'td-dialog-leaving tour';
      root.setAttribute('aria-hidden', 'true');
      root.querySelector('.tdd-box')?.addEventListener('animationend', go, { once: true });
      setTimeout(go, 400); // in case no animation runs
    }
    const go = (d: number) => {
      const n = model.i + d;
      if (n >= model.steps.length) { close(); return; }
      if (n < 0) return;
      model.i = n; flushSync();
      // keep the focus on a button that is still shown
      if (!shown().includes(document.activeElement as HTMLElement)) next()?.focus();
    };
    root.addEventListener('click', (e) => {
      const b = (e.target as Element).closest<HTMLElement>('[data-t]');
      if (!b || open !== close) return;
      if (b.dataset.t === 'skip') close(); else go(b.dataset.t === 'next' ? 1 : -1);
    });
    for (const t of ['pointerdown', 'mousedown']) root.addEventListener(t, (e) => { e.stopPropagation(); if (e.target === root) e.preventDefault(); });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (open !== close) { e.preventDefault(); return; }
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
      if (e.key === 'Tab') { // keep the focus inside, on the buttons shown
        const f = shown(), k = f.indexOf(document.activeElement as HTMLElement), n = f.length;
        e.preventDefault();
        f[(k + (e.shiftKey ? n - 1 : 1) + n) % n].focus();
      }
    });
    document.body.appendChild(root);
    open = close;
    requestAnimationFrame(() => next()?.focus());
  }

  TD.tour = {
    show,
    close: () => open && open(),
    get open() { return !!open; },
  };
})();
