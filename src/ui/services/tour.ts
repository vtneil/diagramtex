import { runtime as TD } from '../../runtime';
import { t } from '../../i18n';
// The welcome tour: a few cards shown once, on the very first visit (no files yet), and again from the command
// search (Welcome Tour). Each card has a small map of the window with the part it talks about marked in blue
// pen, so nothing on the page itself moves or is covered. Previous / Next (← →), "I’m All Good" skips (Esc too).
// The card keeps one size and its buttons keep their places from step to step.
(function () {
  'use strict';
  const KEY = 'diagramtex.tour';
  const seen = () => { try { return !!localStorage.getItem(KEY); } catch (e: any) { return true; } };
  const markSeen = () => { try { localStorage.setItem(KEY, 'seen'); } catch (e: any) { /* storage blocked */ } };
  const kb = (k: string) => (TD.app && TD.app.cmd ? TD.app.cmd.kb(k) : k);
  const esc = (s: any) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  // translated text, escaped, with {name} slots filled by markup built here (the text itself never holds markup)
  const fill = (text: string, slots: Record<string, string>) => esc(text).replace(/\{([a-zA-Z]+)\}/g, (m, k) => (k in slots ? slots[k] : m));
  const b = (s: string) => `<b>${esc(s)}</b>`;

  // the window in miniature: top bar, file list, tool rail, canvas with a sheet, floating panel
  function map(on: string | null) {
    const c = (k: string) => ` class="zone${k === on ? ' on' : ''}"`;
    return `<svg class="tour-map" viewBox="0 0 240 120" aria-hidden="true">
      <rect class="frame" x=".5" y=".5" width="239" height="119" rx="8"/>
      <path class="rule" d="M.5 16.5h239M46.5 16.5v103M58.5 16.5v103"/>
      <rect class="sheet" x="84" y="30" width="78" height="76" rx="1.5"/>
      <path class="ink" d="M96 92l14-26 12 16 10-10 16 20"/><circle class="ink" cx="110" cy="66" r="2.4"/>
      <rect${c('top')} x="3" y="3" width="234" height="11" rx="4"/>
      <rect${c('save')} x="22" y="5" width="7" height="7" rx="1.5"/>
      <rect${c('left')} x="3" y="19" width="53" height="98" rx="4"/>
      <g class="rows"><path d="M8 26h28M8 33h22M8 40h26"/><path d="M50 26h4M50 34h4M50 42h4M50 50h4M50 58h4"/></g>
      <rect${c('right')} x="180" y="22" width="54" height="72" rx="5"/>
      <g class="rows"><path d="M186 32h30M186 42h20M186 50h36M186 58h24"/></g>
    </svg>`;
  }

  const STEPS = () => [
    { at: null, title: t('tour.welcome.title', 'Welcome to DiagramTeX'),
      body: `<p>${esc(t('tour.welcome.body', 'Draw diagrams, write around them, and take them to LaTeX as TikZ code that compiles. Here’s a quick look around.'))}</p>` },
    { at: 'left', title: t('tour.left.title', 'Files and tools on the left'),
      body: `<p>${fill(t('tour.left.body', 'Your files are listed on the left, and next to them is the tool rail: shapes, lines, plots and {blocks}, which are ready-made editors such as:'), { blocks: b(t('ui.blocks', 'Blocks')) })}</p>
        <div class="tour-tags"><span>${esc(t('ui.quantum.circuit', 'Quantum circuit'))}</span><span>${esc(t('ui.circuit', 'Circuit'))}</span><span>${esc(t('ui.chemistry', 'Chemistry'))}</span><span>${esc(t('ui.tree', 'Tree'))}</span><span>${esc(t('tour.tag.timing', 'Timing'))}</span><span>${esc(t('ui.bloch.sphere', 'Bloch sphere'))}</span></div>
        <p>${esc(t('tour.left.pick', 'Pick one, click the canvas to place it, then double-click it to edit.'))}</p>` },
    { at: 'top', title: t('tour.top.title', 'What you’re making, on top'),
      body: `<p>${fill(t('tour.top.body', 'The top bar picks the kind of work: {classic} diagrams and documents, a {page}, a {whiteboard}, a {table} or a {quick} formula.'), { classic: b(t('ui.classic', 'Classic')), page: b(t('ui.page', 'Page')), whiteboard: b(t('ui.whiteboard', 'Whiteboard')), table: b(t('ui.table', 'Table')), quick: b(t('ui.quick', 'Quick')) })}</p>
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
    const steps = STEPS(), prev = document.activeElement as HTMLElement | null;
    let i = 0;
    const root = document.createElement('div');
    root.className = 'td-dialog tour';
    root.innerHTML = `<div class="tdd-box tour-box" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="tour-pic"></div>
      <h2 id="tourTitle"></h2><div class="tour-body" aria-live="polite"></div>
      <div class="tdd-btns">
        <button type="button" class="tour-skip" data-t="skip">${esc(t('tour.skip', 'I’m All Good'))}</button>
        <span class="tour-dots" aria-hidden="true">${steps.map(() => '<i></i>').join('')}</span>
        <button type="button" data-t="prev">${esc(t('tour.prev', 'Previous'))}</button>
        <button type="button" class="primary" data-t="next"></button>
      </div></div>`;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    function paint() {
      const s = steps[i], last = i === steps.length - 1;
      $('.tour-pic').innerHTML = map(s.at);
      $('.tour-box').classList.toggle('warn', !!s.warn);
      $('#tourTitle').textContent = s.title;
      $('.tour-body').innerHTML = s.body;
      root.querySelectorAll('.tour-dots i').forEach((d, k) => d.classList.toggle('on', k === i));
      $('[data-t="prev"]').style.visibility = i ? '' : 'hidden';
      $('[data-t="skip"]').style.visibility = last ? 'hidden' : '';
      $('[data-t="next"]').textContent = last ? t('tour.done', 'Got It') : t('tour.next', 'Next');
      $('.tour-box').setAttribute('aria-label', t('tour.step', '{title}, step {n} of {count}', { title: s.title, n: i + 1, count: steps.length }));
    }
    function close() {
      if (!root.isConnected) return;
      markSeen(); root.remove(); open = null;
      if (prev && prev.isConnected && prev.focus) prev.focus({ preventScroll: true });
    }
    const go = (d: number) => {
      const n = i + d;
      if (n >= steps.length) { close(); return; }
      if (n < 0) return;
      i = n; paint();
      // keep the focus on a button that is still shown
      const f = document.activeElement as HTMLElement;
      if (!root.contains(f) || f.style.visibility === 'hidden') $('[data-t="next"]').focus();
    };
    root.addEventListener('click', (e) => {
      const t = (e.target as Element).closest('[data-t]') as HTMLElement | null;
      if (!t) return;
      const a = t.dataset.t;
      if (a === 'skip') close(); else go(a === 'next' ? 1 : -1);
    });
    for (const t of ['pointerdown', 'mousedown']) root.addEventListener(t, (e) => { e.stopPropagation(); if (e.target === root) e.preventDefault(); });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); close(); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1); return; }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); return; }
      if (e.key === 'Tab') { // keep the focus inside, on the buttons shown
        const f = [...root.querySelectorAll('button')].filter((b) => (b as HTMLElement).style.visibility !== 'hidden') as HTMLElement[];
        const k = f.indexOf(document.activeElement as HTMLElement), n = f.length;
        e.preventDefault();
        f[(k + (e.shiftKey ? n - 1 : 1) + n) % n].focus();
      }
    });
    paint();
    document.body.appendChild(root);
    open = close;
    requestAnimationFrame(() => $('[data-t="next"]').focus());
  }

  TD.tour = {
    show,
    close: () => open && open(),
    get open() { return !!open; },
    // the first visit: only when nothing is stored yet, so people with files are never shown it
    firstRun() { if (!seen()) { markSeen(); setTimeout(show, 400); } },
    KEY,
  };
})();
