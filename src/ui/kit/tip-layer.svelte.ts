// The one floating tooltip: shown below a control (above when there is no room), centred on it and kept 8px inside
// the window; it fades in. Used by the tooltip service; anything else that needs to show or hide it goes through
// TD.tooltip.
import { flushSync, mount } from 'svelte';
import Tooltip from './Tooltip.svelte';

export interface TipLayer { /** `name`: a name shown in full (cut short where it sits), `text` then a muted line under it */ show(text: string, anchor: DOMRect, name?: string): void; hide(): boolean; readonly shown: boolean }
let layer: TipLayer | null = null;

export function tipLayer(): TipLayer {
  if (layer) return layer;
  const st = $state({ text: '', name: undefined as string | undefined, visible: false, on: false, el: undefined as HTMLElement | undefined });
  mount(Tooltip, { target: document.body, props: {
    floating: true, get text() { return st.text; }, get name() { return st.name; }, get visible() { return st.visible; }, get on() { return st.on; },
    get el() { return st.el; }, set el(v) { st.el = v; },
  } });
  flushSync();
  function place(r: DOMRect) {
    const t = st.el!, w = t.offsetWidth, h = t.offsetHeight, gap = 6;
    let y = r.bottom + gap;
    if (y + h > innerHeight - 8) y = r.top - gap - h; // no room below: above
    const x = Math.max(8, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 8));
    t.style.left = Math.round(x) + 'px'; t.style.top = Math.round(Math.max(8, y)) + 'px';
  }
  layer = {
    show(text, anchor, name) {
      // drawn and measured unlit, then lit, so the fade runs from the new place
      st.text = text; st.name = name; st.visible = true; st.on = false; flushSync();
      place(anchor);
      st.on = true; flushSync();
    },
    hide() { if (!st.visible) return false; st.visible = false; st.on = false; flushSync(); return true; },
    get shown() { return st.visible; },
  };
  return layer;
}
