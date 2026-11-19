<script lang="ts">
  // The app's tooltip: an ink label, a shortcut set apart, and an optional muted second line (tip-text.ts reads the
  // text). The tooltip service (src/ui/services/tooltip.ts) turns every title in the page into one, shown on hover
  // or keyboard focus through the one floating tip (tip-layer.svelte.ts). `floating` is that tip; without it the
  // label sits in the page, as the catalog shows it. Text arrives with its shortcuts already in Mac glyphs (macKeys).
  import { parseTip } from './tip-text';
  let { text, name, floating = false, visible = true, on = true, el = $bindable() }: {
    text: string;
    /** a name shown in full (it is cut short where it sits); `text`, if any, is then a muted line under it */
    name?: string;
    floating?: boolean; visible?: boolean; on?: boolean; el?: HTMLElement;
  } = $props();
  const p = $derived(name ? { label: name, key: undefined, sub: text || undefined } : parseTip(text));
</script>
<div bind:this={el} class={['td-tip', !floating && 'static', on && 'on', name && 'name']} role="tooltip" hidden={floating && !visible}>{p.label}{#if p.key}<kbd>{p.key}</kbd>{/if}{#if p.sub}<div class="td-tip-sub">{p.sub}</div>{/if}</div>
