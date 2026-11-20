<script lang="ts">
  // A dropdown: one control for every pick-one list, plain or drawn. A native <select> stays underneath (its value,
  // its input and change events, type-to-select); src/ui/services/selectmenu.svelte.ts draws the app's menu for it.
  // Options can carry a drawing (shown before the name, and in the closed control for the current one), a note,
  // a colour swatch and a group; an option's font is also the closed control's while it is chosen. `columns` lays drawings out as tiles
  // without names; `pictures` makes the menu picture tiles (the kit's Tile, four across): each option's drawing over its
  // `short` name (or its label), the full label in its tooltip, as a 3D solid's Shape menu. `custom` adds a line at the menu's foot for a typed value (a custom dash). `attached` draws only the
  // chevron, joined to the field before it (presets for a number).
  import { onMount } from 'svelte';
  import type { HTMLSelectAttributes } from 'svelte/elements';
  import { liveValue } from '../live-value';
  import { installSelectMenu, setSelectExtras } from '../services/selectmenu.svelte';
  export interface SelectOption { value: string; label: string; short?: string; title?: string; svg?: string; note?: string; swatch?: string; font?: string; group?: string; disabled?: boolean }
  export interface SelectCustom { label: string; shown?: string; svg?: string; value: string; placeholder?: string; title?: string; apply(text: string): void }
  let { options, value, pictures = false, columns, custom, mixed, attached = false, class: extra, ...rest }: Omit<HTMLSelectAttributes, 'value' | 'class'> & {
    options: SelectOption[]; value?: string | number; pictures?: boolean; columns?: number; custom?: SelectCustom; attached?: boolean; class?: string;
    /** what it shows with no value ("Mixed": the selected objects differ); not in its menu */
    mixed?: string;
  } = $props();
  onMount(installSelectMenu);
  let el: HTMLSelectElement | undefined = $state();
  const current = $derived(value === undefined ? undefined : options.find((o) => o.value === String(value)));
  // a value the options don't hold, under `custom`: a hidden option names it ("Custom") so the control shows it
  const isCustom = $derived(!!custom && value !== undefined && String(value) !== '' && !current);
  const drawing = $derived.by(() => { const d = attached || pictures ? undefined : isCustom ? custom?.svg : current?.svg; return d?.trimStart().startsWith('<svg') ? d : undefined; });
  // options in their groups, in order
  const groups = $derived(options.reduce<{ name?: string; items: SelectOption[] }[]>((all, o) => {
    const last = all[all.length - 1];
    if (last && last.name === o.group) last.items.push(o); else all.push({ name: o.group, items: [o] });
    return all;
  }, []));
  $effect(() => {
    if (!el) return;
    const svg: Record<string, string> = {}, notes: Record<string, string> = {}, short: Record<string, string> = {};
    for (const o of options) { if (o.svg) svg[o.value] = o.svg; if (o.note) notes[o.value] = o.note; if (o.short) short[o.value] = o.short; }
    setSelectExtras(el, { svg, notes, short, pictures, columns, custom: custom && { ...custom, on: isCustom } });
  });
</script>
{#snippet option(o: SelectOption)}<option value={o.value} title={o.title} disabled={o.disabled} data-swatch={o.swatch} style:font-family={o.font}>{o.label}</option>{/snippet}
{#snippet control()}<select bind:this={el} class={[attached && 'attached', extra].filter(Boolean).join(' ') || undefined} {...rest} style:font-family={attached || isCustom ? undefined : current?.font} {@attach value === undefined ? undefined : liveValue(value, options, isCustom)}>
  {#each groups as g, gi (gi)}{#if g.name}<optgroup label={g.name}>{#each g.items as o (o.value)}{@render option(o)}{/each}</optgroup>{:else}{#each g.items as o (o.value)}{@render option(o)}{/each}{/if}{/each}
  {#if isCustom}<option value={String(value)} hidden>{custom!.shown ?? custom!.label}</option>{/if}
  {#if mixed && String(value ?? '') === '' && !current}<option value="" hidden>{mixed}</option>{/if}
</select>{/snippet}
{#if drawing}<span class="sel-prev">{@html drawing}{@render control()}</span>{:else}{@render control()}{/if}
