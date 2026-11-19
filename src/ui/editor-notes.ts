// The block editors' two notes (the frame's .cz-msg under the code and .cz-tip over the drawing, src/ui/kit/EditorFrame.svelte),
// drawn as ui/EditorNote.svelte. Editors hand over plain text; an empty message or tip is hidden by its CSS (:empty).
import { renderView } from './render-view.svelte';
import EditorNote from './EditorNote.svelte';

/** The code pane's message: one line each (the layout's warnings, what can't be drawn); none hides it. */
export function showCodeNotes(el: HTMLElement, lines: string[]): void {
  renderView(el, EditorNote, { lines });
}

export interface StageTip {
  /** show a tip ('' hides it) */
  set(text: string): void;
  /** show a tip for `ms`, then hide it unless another has been shown since ("Saved to the page") */
  flash(text: string, ms: number): void;
  /** what it shows now */
  readonly text: string;
}
/** The stage's tip line over the drawing (what a click will do, a step's result). */
export function stageTip(el: HTMLElement): StageTip {
  let text = '', timer: ReturnType<typeof setTimeout> | undefined;
  const set = (next: string) => { text = next || ''; renderView(el, EditorNote, { text }); el.hidden = !text; };
  return {
    set,
    flash(next, ms) { set(next); clearTimeout(timer); timer = setTimeout(() => { if (text === next) set(''); }, ms); },
    get text() { return text; },
  };
}
