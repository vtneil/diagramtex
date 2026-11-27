// Common code-editor history and save/discard lifecycle. Domain gestures and rendering stay local.
import type { SourceSession } from './contracts';
import { t } from '../i18n';
import { openModal, closeModal } from '../ui/kit/modal';
interface HistoryHooks {
  state(): SourceSession;
  snapshot(): string;
  restore(value: string): void;
  updateTools(): void;
  /** called after every finished edit, undo and redo (an embedded editor hands each one back) */
  changed?(): void;
}
interface LifecycleHooks {
  state(): SourceSession | null;
  clear(): void;
  snapshot(): string;
  commit(): void;
  root: HTMLElement;
  code: HTMLTextAreaElement;
  readCode(): void;
  /** the stage's tip line (stageTip in src/ui/editor-notes.ts), where "Saved to the page" shows */
  note: { flash(text: string, ms: number): void };
  discardTitle: string | (() => string); // a getter reads it in the current interface language
  /** closes what is open in place (a label being typed, a popup, a menu) before a save or a close */
  settle?(): void;
  /** the source a save or a close compares and hands back, when it is not the snapshot (the code as typed) */
  source?(): string;
  /** what done receives, when it is more than { src } */
  result?(): any;
  /** the selection as plain data and back, for an embedded editor (see DockHooks) */
  selOut?(): any;
  selIn?(saved: any): void;
}
interface DockHooks {
  root: HTMLElement;
  state(): { start: string; done(result: any): void } | null;
  snapshot(): string;
  /** what done receives, when it is more than { src } */
  result?(): any;
  /** the selection as plain data and back, when it holds the model's own objects (default: copied as it is) */
  selOut?(): any;
  selIn?(saved: any): void;
}
/**
 * How an embedded editor was left: where it was looking, what was selected and its undo history. The host keeps one
 * per drawing and hands it back when that drawing opens again; it applies only while the drawing is unchanged.
 */
export interface EditorMemo { start: string; view?: any; sel?: any; many?: any; arrow?: any; undo: string[]; redo: string[]; modes: Record<string, unknown> }
/** Where an editor shows when it is embedded in a pane (Quick) instead of opening over the page. */
export interface EditorHost { dock: HTMLElement; memo?: EditorMemo | null; keep?(memo: EditorMemo): void }
// the editor's choices for what comes next (the kind of arrow or bond to draw, the tool), kept with a memo
const MODES = ['kind', 'style', 'bond', 'prop', 'tool', 'bent', 'dashed'];
const plain = (x: any) => (x == null ? x : x instanceof Set ? { set: [...x] } : JSON.parse(JSON.stringify(x)));
const unplain = (x: any) => (x && Array.isArray(x.set) ? new Set(x.set) : x);
export function createEditorSession(services: {
  unsaved: (() => boolean)[];
  confirm(title: string, message: string, options: { ok: string; danger: boolean }): Promise<boolean>;
}) {
  function history(hooks: HistoryHooks) {
    const { state, snapshot, restore, updateTools, changed } = hooks;
    function begin() { const e = state(); if (e.pending == null) e.pending = snapshot(); }
    function commit() {
      const e = state();
      if (e.pending == null) return;
      const now = snapshot();
      if (now !== e.pending) { e.undo.push(e.pending); if (e.undo.length > 200) e.undo.shift(); e.redo = []; }
      e.pending = null;
      updateTools();
      changed?.();
    }
    function undo() { commit(); const e = state(); if (!e.undo.length) return; e.redo.push(snapshot()); restore(e.undo.pop()!); changed?.(); }
    function redo() { commit(); const e = state(); if (!e.redo.length) return; e.undo.push(snapshot()); restore(e.redo.pop()!); changed?.(); }
    return { begin, commit, undo, redo };
  }
  /**
   * Embedded (Quick): the editor fills a pane instead of opening over the page, and hands every edit back through
   * its done callback, so it is never unsaved and never closes on its own (Esc, Cancel and Done do nothing while
   * docked()). Editors call show(host) where they used to unhide their root and changed() after each edit, undo and
   * redo; to take it out of the pane, release() it and close it as Done would (the editor's own finish(true)).
   */
  function dockable({ root, state, snapshot, result, selOut, selIn }: DockHooks) {
    let dock: HTMLElement | null = null, host: EditorHost | null = null, resumed = false;
    function capture(): EditorMemo | null {
      const e: any = state();
      if (!e) return null;
      const modes: Record<string, unknown> = {};
      for (const k of MODES) if (k in e && (e[k] == null || typeof e[k] !== 'object')) modes[k] = e[k];
      let sel = null;
      try { sel = selOut ? selOut() : plain(e.sel); } catch { /* a selection that can't be kept is dropped */ }
      return { start: e.start, view: e.view ? { ...e.view } : undefined, sel, many: e.many ? plain(e.many) : undefined, arrow: e.arrow ? plain(e.arrow) : undefined, undo: [...(e.undo || [])], redo: [...(e.redo || [])], modes };
    }
    // the memo applies only to the same drawing: what was selected still exists and the history leads to it
    function resume(memo: EditorMemo | null | undefined) {
      const e: any = state();
      if (!memo || !e || memo.start !== e.start) return false;
      if (memo.view && e.view) Object.assign(e.view, memo.view);
      e.undo = [...memo.undo]; e.redo = [...memo.redo];
      Object.assign(e, memo.modes);
      try { if (selIn) selIn(memo.sel); else e.sel = unplain(plain(memo.sel)); } catch { e.sel = null; }
      if ('many' in e && memo.many !== undefined) e.many = plain(memo.many);
      if ('arrow' in e && memo.arrow !== undefined) e.arrow = plain(memo.arrow);
      return true;
    }
    function show(h?: EditorHost | null) {
      host = h || null;
      dock = host?.dock || null;
      resumed = !!dock && resume(host?.memo);
      root.classList.toggle('docked', !!dock);
      root.querySelector('[aria-modal]')?.setAttribute('aria-modal', String(!dock));
      if (dock) dock.appendChild(root);
      else if (root.parentElement !== document.body) document.body.appendChild(root);
      // over the page it opens and closes as the kit's modals do (scrim fades, window pops from 97%); in a pane it just shows
      root.classList.toggle('fades', !dock);
      if (dock) root.hidden = false; else openModal(root);
      if (!dock) document.body.classList.add('cz-open');
    }
    function changed() {
      const e = state();
      if (!dock || !e) return;
      const src = snapshot();
      if (src !== e.start) { e.start = src; e.done(result ? result() : { src }); }
    }
    // back over the page, still open: the caller closes it straight after
    function release() {
      if (!dock) return;
      const memo = host?.keep ? capture() : null;
      if (memo) host!.keep!(memo);
      dock = null; host = null; resumed = false;
      root.classList.remove('docked');
      root.querySelector('[aria-modal]')?.setAttribute('aria-modal', 'true');
      document.body.appendChild(root);
    }
    // embedded, the editor shares the window: keys aimed at the rest of it (the sidebar, the output bar, even where the
    // host puts that bar inside the editor's top bar, marked data-outside) are not its own
    const elsewhere = (e: Event) => {
      if (!dock || !(e.target instanceof Node) || e.target === document.body) return false;
      const el = e.target instanceof Element ? e.target : e.target.parentElement;
      return !root.contains(e.target) || !!el?.closest('[data-outside]');
    };
    // true when the editor opened where it was left (its view restored), so it draws instead of fitting
    return { show, changed, release, elsewhere, docked: () => !!dock, resumed: () => resumed };
  }
  /**
   * Opening, saving and closing a block editor: the editor supplies its source reader, pending-edit commit and domain
   * cleanup; this keeps the save baseline, the discard prompt and the unsaved check. It is also the editor's dock.
   */
  function lifecycle({ state, clear, snapshot, commit, root, code, readCode, note, discardTitle, settle, source, result, selOut, selIn }: LifecycleHooks) {
    const { show, changed, release, elsewhere, docked, resumed } = dockable({ root, state, snapshot, result, selOut, selIn });
    const saved = () => (source ? source() : snapshot());
    // the code as typed: read while its pane has focus or a read is still due (wireCode's 250ms); moving the root drops focus without it
    function flush() { const e: any = state(); if (e && (document.activeElement === code || e.codeTimer != null)) readCode(); }
    // embedded: back over the page, and closed as Done would (the host's close)
    function detach() { if (!docked()) return; flush(); release(); finish(true); }
    services.unsaved.push(() => { const e = state(); return !!e && !docked() && snapshot() !== e.start; });
    // ⌘S: write the drawing back to the page (one undo step there) and keep editing; embedded, every edit already is
    function save() {
      if (!state()) return;
      if (docked()) { flush(); commit(); changed(); return; }
      settle?.();
      flush();
      commit();
      const e = state()!, src = saved();
      if (src !== e.start) { e.start = src; e.saved = true; e.done(result ? result() : { src }); }
      note.flash(t('editor.saved', 'Saved to the page'), 1500);
    }
    // Done (ok) hands the drawing back when it changed; Cancel asks before throwing changes away
    async function finish(ok: boolean) {
      if (!state() || docked()) return;
      settle?.();
      flush();
      if (document.activeElement && root.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
      commit();
      const e = state()!, src = saved(), edited = src !== e.start;
      if (!ok && edited && !(await services.confirm(typeof discardTitle === 'function' ? discardTitle() : discardTitle, (e.saved ? t('editor.discard.bodySaved', 'Your edits since you last saved will be lost.') : t('editor.discard.body', 'Your edits since opening the editor will be lost.')), { ok: t('editor.discard.ok', 'Discard'), danger: true }))) return;
      const done = e.done, out = ok && edited ? (result ? result() : { src }) : null;
      closeModal(root);
      document.body.classList.remove('cz-open');
      clearTimeout((e as any).codeTimer);
      clear();
      if (out) done(out);
    }
    // a drawing opens with its code from the first column and line, whatever the last one was scrolled to
    function open(h?: EditorHost | null) { show(h); code.scrollLeft = 0; code.scrollTop = 0; }
    return { save, finish, show: open, changed, release, detach, elsewhere, docked, resumed };
  }
  /** Redraw when the editor's box changes size: the window, or (embedded) the pane it sits in. */
  function watchSize(root: HTMLElement, redraw: () => void) {
    window.addEventListener('resize', redraw);
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (root.classList.contains('docked')) redraw(); }).observe(root);
  }
  return { history, lifecycle, dockable, watchSize };
}
