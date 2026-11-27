// The status hint (#hint) as toasts: raised cards under the ruler, each with a coloured icon tile, a title and, when
// the message has a second part, a muted line under it. Messages that come one after another stack like a deck: the
// newest springs in at the front, the ones before slide back behind it (smaller, blank, peeking out below), and when
// the front one times out the next comes forward again. Notes: .interface-design/system.md, "Status hint".
import { iconSvg, type IconName } from '../kit/icons';

/** ok: something was done (saved, copied, moved). info: a note or an instruction. warn: it didn't happen, or needs
 *  a look. error: something failed. plain: a live readout while dragging (an angle, a scale), with no icon. */
export type HintKind = 'ok' | 'info' | 'warn' | 'error' | 'plain';

const ICON: Record<Exclude<HintKind, 'plain'>, IconName> = { ok: 'check', info: 'info', warn: 'attention', error: 'attention' };

/** Splits a message into a title and a detail at its first break outside quotes: a line break, the end of a
 *  sentence, an ellipsis, a dash, a middle dot or a colon. "Moved "a.tex" to the Recycle Bin. ⌘Z brings it back"
 *  gives "Moved "a.tex" to the Recycle Bin" over "⌘Z brings it back". The title loses a closing full stop. */
export function splitHint(msg: string): [string, string] {
  let quote = '';
  for (let i = 0; i < msg.length; i++) {
    const c = msg[i];
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === '“') { quote = c === '“' ? '”' : '"'; continue; }
    let cut = -1, skip = 0;
    if (c === '\n') { cut = i; skip = 1; }
    else if (c === '.' && msg[i + 1] === ' ' && !/(?:e\.g|i\.e|etc)$/.test(msg.slice(Math.max(0, i - 4), i))) { cut = i; skip = 2; }
    else if (c === '…' && msg[i + 1] === ' ') { cut = i + 1; skip = 1; }
    else if ((c === '—' || c === '·') && msg[i - 1] === ' ' && msg[i + 1] === ' ') { cut = i - 1; skip = 3; }
    else if (c === ':' && msg[i + 1] === ' ' && i >= 3) { cut = i; skip = 2; }
    if (cut < 0) continue;
    const title = msg.slice(0, cut).trim(), detail = msg.slice(cut + skip).trim();
    if (!title || !detail) break;
    // a detail that started mid-sentence ("…: its changes are added") starts with a capital; a name keeps its case
    return [title, detail.replace(/^([a-z])(?=[a-z]*(?:\s|$))/, (m) => m.toUpperCase())];
  }
  return [msg.trim().replace(/(?<!\.)\.$/, ''), ''];
}

interface Toast { el: HTMLElement; ic: HTMLElement; txt: HTMLElement; title: HTMLElement; detail: HTMLElement; kind: HintKind | ''; live: boolean; key: string; h: number; timer?: ReturnType<typeof setTimeout> }

const DEPTH = 3; // cards in the deck: the front one and two peeking out behind it
const SETTLE = 900; // a finished task's note stays behind its outcome this long, so the outcome visibly stacks over it

/** The toasts in `host` (#hint, the anchor they centre on). show() with a time puts a card at the front for that long;
 *  without one it is a live note that stays until show('', 0, kind, key) clears it. Live notes have a source `key`
 *  ('note', the default, is the tools' instructions; 'math', 'tex', 'export' are work in progress): a later live note
 *  from the same source rewrites it where it is, and one source never clears another's. A readout (plain) rewrites
 *  the readout already up. task() is work the user waits for: a live note, then its outcome stacked over it. */
export function hintToast(host: HTMLElement) {
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  host.textContent = '';
  const stack: Toast[] = []; // front first
  const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function make(): Toast {
    const el = document.createElement('div');
    el.className = 'toast enter';
    el.innerHTML = '<span class="toast-ic" aria-hidden="true"></span><span class="toast-txt"><span class="toast-title"></span><span class="toast-detail" hidden></span></span>';
    const q = (c: string) => el.querySelector(c) as HTMLElement;
    return { el, ic: q('.toast-ic'), txt: q('.toast-txt'), title: q('.toast-title'), detail: q('.toast-detail'), kind: '', live: false, key: '', h: 0 };
  }
  function fill(t: Toast, title: string, detail: string, kind: HintKind) {
    if (t.kind !== kind) { t.kind = kind; t.el.dataset.kind = kind; t.ic.innerHTML = kind === 'plain' ? '' : iconSvg(ICON[kind]); }
    t.title.textContent = title;
    t.detail.textContent = detail;
    t.detail.hidden = !detail;
    // its own height, from its content (the card's own height is set, so it can take the front card's when behind)
    const cs = getComputedStyle(t.el), box = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    t.h = Math.ceil(box + Math.max(t.ic.offsetHeight, t.txt.offsetHeight));
  }
  // each card's place in the deck; CSS turns --d into its offset, scale and stacking, and its height into --hh
  function layout() {
    const fh = stack[0]?.h ?? 0;
    stack.forEach((t, d) => {
      t.el.dataset.depth = String(Math.min(d, DEPTH));
      t.el.style.setProperty('--d', String(d));
      t.el.style.setProperty('--hh', `${d ? fh : t.h}px`);
      t.el.setAttribute('aria-hidden', d ? 'true' : 'false');
    });
    if (stack.length) host.hidden = false;
  }
  function dismiss(t: Toast) {
    const i = stack.indexOf(t);
    if (i < 0) return;
    clearTimeout(t.timer);
    stack.splice(i, 1);
    layout();
    const gone = () => { t.el.remove(); if (!host.firstChild) host.hidden = true; };
    if (still()) { gone(); return; }
    t.el.classList.add('leave');
    t.el.addEventListener('transitionend', (e) => { if (e.target === t.el && e.propertyName === 'opacity') gone(); });
    setTimeout(gone, 300); // in case the transition never runs (a hidden stage)
  }
  function show(msg: unknown, ms?: number, kind: HintKind = 'info', key = 'note') {
    if (!msg) { for (const t of stack.filter((x) => x.live && x.key === key)) dismiss(t); return; }
    const text = String(msg), live = !ms;
    const [title, detail] = kind === 'plain' ? [text, ''] : splitHint(text);
    const front = stack[0];
    const again = !!front && front.kind === kind && front.title.textContent === title && front.detail.textContent === detail;
    let t = again ? front : kind === 'plain' ? stack.find((x) => x.kind === 'plain') : live ? stack.find((x) => x.live && x.key === key && x.kind !== 'plain') : undefined;
    if (t) {
      fill(t, title, detail, kind);
      layout();
      // the same message again (⌘S twice): the front card presses and springs back, so the second one is seen
      if (again && kind !== 'plain' && !still()) t.el.animate([{ transform: 'scale(.97)' }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
    } else {
      t = make();
      host.hidden = false; // shown before it is measured
      host.prepend(t.el);
      fill(t, title, detail, kind);
      stack.unshift(t);
      // past the deck's depth the oldest timed card goes (a live note stays: it comes back when the others time out)
      while (stack.length > DEPTH) dismiss([...stack].reverse().find((x) => !x.live) ?? stack[stack.length - 1]);
      layout();
      void t.el.offsetWidth; // start from the entrance pose, then transition to the front
      t.el.classList.remove('enter');
    }
    clearTimeout(t.timer);
    t.live = live;
    t.key = live ? key : '';
    const card = t;
    if (ms) t.timer = setTimeout(() => dismiss(card), ms);
  }
  /** Work the user waits for (rendering, compiling, exporting): `msg` as the `key` source's live note, `update` to
   *  rewrite it (progress), then `done` (ok) or `fail` (error, or warn) puts the outcome at the front with the note
   *  sliding back behind it, where it fades a moment later. `done()` with no text leaves the outcome to the caller. */
  function task(key: string, msg: string) {
    show(msg, 0, 'info', key);
    const settle = (text?: string, ms?: number, kind?: HintKind) => {
      const t = stack.find((x) => x.live && x.key === key);
      // the note stays a moment behind what comes next (this outcome, or the one its caller shows: the export's own)
      if (t) { t.live = false; t.key = ''; clearTimeout(t.timer); t.timer = setTimeout(() => dismiss(t), SETTLE); }
      if (text) show(text, ms, kind);
    };
    return {
      update: (m: string) => show(m, 0, 'info', key),
      done: (m?: string, ms = 2000) => settle(m, ms, 'ok'),
      fail: (m: string, ms = 4000, kind: HintKind = 'error') => settle(m, ms, kind),
    };
  }
  return { show, task };
}
