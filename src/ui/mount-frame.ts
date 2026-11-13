import { flushSync, mount } from 'svelte';
import type { Component } from 'svelte';
/** Editor frames live for the application lifetime; session state remains in their controller. */
export function mountFrame<Model extends object>(target: HTMLElement, component: Component<{ model: Model }>, model: Model, anchor?: Node) {
  const mounted = mount(component, { target, anchor, props: { model } });
  flushSync();
  return mounted;
}
