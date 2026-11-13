import { flushSync, mount, unmount } from 'svelte';
import type { Component } from 'svelte';
import type { PanelView } from './contracts';

/** Svelte owns the host; domain commands own source/model changes and undo. */
export function panelView<Model extends object>(component: Component<{ model: Model }>, model: (shape: { src: string }) => Model): PanelView {
  return {
    mount(target, shape) {
      const props = $state({ model: model(shape) });
      const mounted = mount(component, { target, props });
      flushSync();
      return {
        update(shape) {
          // Focused fields keep what the person is typing: see liveValue (src/ui/live-value.ts).
          flushSync(() => { props.model = model(shape); });
        },
        destroy() { void unmount(mounted); },
      };
    },
  };
}
