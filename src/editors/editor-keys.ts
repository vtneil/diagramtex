// The keys every block editor reads the same way, in its capture-phase keydown listener on window: what isn't the
// editor's (its right-click menu's keys, a focused palette button's Enter and Space, a label popup's, a dialog's or
// the colour picker's), then ⌘S, ⌘Enter, Esc, undo and redo. Once this has the key, the page behind gets none of it
// (stopPropagation): the main canvas's shortcuts stay off while an editor is open.
import { runtime as TD } from '../runtime';
import { inEditorMenu, pressesFocused, editorMenuOpen, closeEditorMenu } from './editor-menu';

export interface EditorKeys {
  /** whether this editor is open and the key is aimed at it (an embedded editor shares the window) */
  open: () => boolean;
  save: () => void;
  finish: (keep: boolean) => void;
  undo: () => void;
  redo: () => void;
  /** Esc, before it closes the editor: true when it let go of something (a tool, a selection …) */
  escape?: () => boolean;
  /** keys left to someone else after all, as they are (the graph editor's ⌘V reaches its paste event) */
  pass?: (e: KeyboardEvent, mod: boolean) => boolean;
  /** keys the editor reads before a dialog on top could have them, in place of a focused palette button's own */
  own?: (e: KeyboardEvent) => boolean;
  /** a key pressed in one of the editor's fields (the field keeps it) */
  field?: (e: KeyboardEvent) => void;
}

/** null when the key isn't the editor's or has been handled; else whether ⌘/Ctrl is down, for the editor's own keys. */
export function editorKeys(e: KeyboardEvent, ed: EditorKeys): { mod: boolean } | null {
  if (inEditorMenu(e)) return null; // the right-click menu's own keys: arrows, Enter, Esc
  // a focused palette button keeps its own Enter and Space (they click it); ⌘Enter still reaches Done
  if (!ed.own && pressesFocused(e)) return null;
  if (!ed.open()) return null;
  const dialog = () => !!document.querySelector('.td-dialog');
  // never the browser's Save
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 's' || e.key === 'S')) { e.preventDefault(); e.stopPropagation(); if (!dialog()) ed.save(); return null; }
  const t = e.target as Element | null;
  if (t?.closest?.('.td-pop-ta, .td-pop-ml')) return null; // a label popup handles its own keys (Enter and Esc finish it)
  if (ed.own?.(e)) return null;
  if (dialog()) return null; // a dialog on top handles its own keys
  if (TD.colorPickerOpen?.()) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); TD.closeColorPicker(); } return null; }
  const mod = e.metaKey || e.ctrlKey, inField = !!t?.closest?.('input, textarea, select, [contenteditable], math-field');
  if (ed.pass?.(e, mod)) return null;
  e.stopPropagation();
  if (mod && e.key === 'Enter') { e.preventDefault(); ed.finish(true); return null; }
  if (e.key === 'Escape') {
    e.preventDefault();
    if (inField) { (t as HTMLElement).blur(); return null; }
    if (editorMenuOpen()) { closeEditorMenu(); return null; }
    if (!ed.escape?.()) ed.finish(false);
    return null;
  }
  if (inField) { ed.field?.(e); return null; }
  if (mod && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); if (e.shiftKey) ed.redo(); else ed.undo(); return null; }
  if (mod && e.key === 'y') { e.preventDefault(); ed.redo(); return null; }
  return { mod };
}
