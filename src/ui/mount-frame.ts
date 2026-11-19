import { flushSync, mount } from 'svelte';
import type { Component } from 'svelte';
/** Mount a component that lives for the application lifetime (an editor frame, a panel, a dialog); its session
 *  state remains in its controller. Editor frames take no model: their icons and captions are their own. */
export function mountFrame(target: HTMLElement, component: Component<Record<string, never>>): ReturnType<typeof mount>;
export function mountFrame<Model extends object>(target: HTMLElement, component: Component<{ model: Model }>, model: Model, anchor?: Node): ReturnType<typeof mount>;
export function mountFrame(target: HTMLElement, component: Component<any>, model?: object, anchor?: Node) {
  const mounted = mount(component, { target, anchor, props: model ? { model } : {} });
  flushSync();
  return mounted;
}
