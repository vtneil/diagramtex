import { flushSync, mount, unmount } from 'svelte';
import type { Component } from 'svelte';

let updating = 0;
export const isViewUpdating = () => updating > 0;
const views = new WeakMap<HTMLElement, { component: object; update(model: object): void; destroy(): void }>();

export function destroyView(target: HTMLElement) {
  updating++;
  try { views.get(target)?.destroy(); views.delete(target); }
  finally { updating--; }
}

export function renderView<Model extends object>(target: HTMLElement, component: Component<{ model: Model }>, model: Model) {
  const current = views.get(target);
  if (current?.component === component) { current.update(model); return; }
  updating++;
  try {
  current?.destroy();
  const props = $state({ model });
  const mounted = mount(component, { target, props });
  flushSync();
  views.set(target, {
    component,
    update(next) {
      // Focused fields keep what the person is typing: see liveValue (src/ui/live-value.ts).
      updating++;
      try { flushSync(() => { props.model = next as Model; }); }
      finally { updating--; }
    },
    destroy() { void unmount(mounted); },
  });
  } finally { updating--; }
}
