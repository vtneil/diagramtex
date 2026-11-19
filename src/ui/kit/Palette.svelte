<script lang="ts">
  // A block editor's left column: a search field over categories of items to place. `rows` lists each item as its
  // drawing and name (the circuit's parts); `grid` lays them out as tiles (the grid editors' gates and spiders).
  // `armed` is the item waiting to be placed (marker yellow: something waiting). `collapsible` categories fold,
  // with a count, and remember nothing themselves: `open` and `ontoggle` let the editor keep them. While searching,
  // every category with a match is shown open. Esc in the search clears it, then leaves it; Enter picks the first
  // match. Items are buttons, so Enter and Space pick them too; `onitemdown` lets an editor start a drag from one.
  // `itemclick: false` leaves item clicks to the editor (one that places by pressing and dragging, and hears its own
  // clicks); `bare` draws the contents only, into a .cz-pal already there; `notice` (markup) stands in for the list.
  import type { Snippet } from 'svelte';
  import { t, locale } from '../../i18n';
  import SearchField from './SearchField.svelte';
  import EmptyState from './EmptyState.svelte';
  import Badge from './Badge.svelte';
  import { filterPalette, type PaletteCategory, type PaletteItem } from './palette';
  let { categories, layout = 'rows', armed, searchLabel, bare = false, itemclick = true, listClass, notice, placeholder, label, collapsible = false, open = {}, ontoggle, onpick, onitemdown, empty, emptyText, query = $bindable(''), searchEl = $bindable() }: {
    categories: PaletteCategory[]; layout?: 'rows' | 'grid'; armed?: string; searchLabel?: string; bare?: boolean; itemclick?: boolean; listClass?: string; notice?: string;
    /** the search field's placeholder and name ("Search parts") */
    placeholder: string;
    /** the list's name ("Elements") */
    label: string;
    collapsible?: boolean; open?: Record<string, boolean>; ontoggle?: (id: string, open: boolean) => void;
    onpick: (id: string) => void; onitemdown?: (e: PointerEvent, id: string) => void;
    /** what an empty search result says; defaults to “Nothing matches …” */
    empty?: Snippet<[string]>; emptyText?: (query: string) => string;
    query?: string; searchEl?: HTMLInputElement;
  } = $props();
  const shown = $derived(filterPalette(categories, query));
  const searching = $derived(!!query.trim());
  function keys(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      // the field is cleared here: liveValue leaves a focused field as it is
      e.stopPropagation(); e.preventDefault(); const f = e.currentTarget as HTMLInputElement;
      if (query) { query = ''; f.value = ''; } else f.blur();
    }
    else if (e.key === 'Enter') { const first = shown[0]?.items[0]; if (first) { e.preventDefault(); onpick(first.id); (e.currentTarget as HTMLElement).blur(); } }
  }
  const tip = (i: PaletteItem) => (i.title ?? i.label) + (i.key ? ` (${i.key})` : '');
</script>
{#snippet item(i: PaletteItem, how: string)}
  {@const on = armed === i.id || !!i.on}
  {#if how === 'icons'}<button type="button" class={[on && 'on', i.class]} data-item={i.id} aria-pressed={on} title={tip(i)} aria-label={i.label} {...i.attrs}
    onclick={itemclick ? () => onpick(i.id) : undefined} onpointerdown={(e) => onitemdown?.(e, i.id)}>{@html i.svg}</button>
  {:else if how === 'grid'}<button type="button" class={['qe-item', on && 'on', i.class]} data-item={i.id} aria-pressed={on} title={tip(i)} {...i.attrs}
    onclick={itemclick ? () => onpick(i.id) : undefined} onpointerdown={(e) => onitemdown?.(e, i.id)}><span class="qe-fig">{@html i.svg}</span>{#if i.label}<span>{i.label}</span>{/if}</button>
  {:else}<button type="button" class={['cz-part', on && 'on', i.class]} data-item={i.id} aria-pressed={on} title={tip(i)} {...i.attrs}
    onclick={itemclick ? () => onpick(i.id) : undefined} onpointerdown={(e) => onitemdown?.(e, i.id)}>{@html i.svg}<span>{i.label}</span></button>{/if}
{/snippet}
{#snippet items(c: PaletteCategory)}
  {@const how = c.layout ?? layout}
  {#if how === 'grid'}<div class={['qe-grid', c.class]}>{#each c.items as i (i.id)}{@render item(i, how)}{/each}</div>
  {:else if how === 'icons'}<div class={['sym-grid', c.class]}>{#each c.items as i (i.id)}{@render item(i, how)}{/each}</div>
  {:else}{#each c.items as i (i.id)}{@render item(i, how)}{/each}{/if}
{/snippet}
{#snippet title(c: PaletteCategory)}{c.title}{#if c.note}<Badge count={c.note} faint />{/if}{/snippet}
{#snippet contents()}
  <div class="cz-search"><SearchField bind:el={searchEl} {placeholder} aria-label={searchLabel ?? placeholder} value={query} oninput={(e) => (query = e.currentTarget.value)} onkeydown={keys} /></div>
  <div class={['cz-list', listClass]} role="group" aria-label={label}>
    {#if notice}<EmptyState>{@html notice}</EmptyState>
    {:else}
    {#each shown as c (c.id)}
      {#if collapsible && !searching}
        <details class="cz-cat" data-cat={c.id} open={open[c.id] ?? false} ontoggle={(e) => ontoggle?.(c.id, (e.currentTarget as HTMLDetailsElement).open)}>
          <summary class="cz-cat-t">{c.title}<Badge count={c.items.length} faint /></summary>{@render items(c)}
        </details>
      {:else}
        <div class="cz-cat">{#if c.title}<div class="cz-cat-t">{@render title(c)}</div>{/if}{@render items(c)}</div>
      {/if}
    {:else}
      <EmptyState>{#if empty}{@render empty(query)}{:else if emptyText}{emptyText(query)}{:else}{t('editor.commonB.nothingMatches', 'Nothing matches “{query}”', { query }, $locale)}{/if}</EmptyState>
    {/each}
    {/if}
  </div>
{/snippet}
{#if bare}{@render contents()}{:else}<aside class="cz-pal">{@render contents()}</aside>{/if}
