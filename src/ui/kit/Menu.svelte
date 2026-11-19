<script lang="ts">
  // The rows of a menu, with keyboard movement: ↑ ↓ Home End move, → opens a submenu, ← closes it, Enter or
  // Space chooses (a button's own click). The floating shell is ContextMenu; a submenu nests another Menu.
  import MenuItem from './MenuItem.svelte';
  import { isRule, isHeading, isTiles, tidy, type MenuEntry, type MenuItemSpec } from './menu';
  import Icon from './Icon.svelte';
  let { items, onpick, nested = false }: { items: MenuEntry[]; onpick: (act: string) => void; nested?: boolean } = $props();
  const shown = $derived(tidy(items));
  // no row with an icon or a tick: no icon column (a menu of words, like the .zip downloads)
  const bare = $derived(shown.every((e) => isRule(e) || isHeading(e) || isTiles(e) || !((e as MenuItemSpec).icon || (e as MenuItemSpec).svg || (e as MenuItemSpec).checked !== undefined)));
  // the rows' components, for opening a submenu from the keyboard (bind:this into it needs $state: a raw object warns)
  const rows: Record<number, ReturnType<typeof MenuItem>> = $state({});
  let list: HTMLElement | undefined = $state();
  // the rows, and the tiles of a grid in reading order
  const level = () => [...(list?.querySelectorAll<HTMLElement>(':scope > .ctx-item, :scope > .ctx-tiles > .ctx-item') ?? [])].filter((el) => el.matches(':not([disabled]):not(.dis)'));
  function key(e: KeyboardEvent) {
    const all = level(), i = all.indexOf(document.activeElement as HTMLElement);
    if (i < 0 && !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    const go = (k: number) => { e.preventDefault(); e.stopPropagation(); all[(k + all.length) % all.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i < 0 ? -1 : i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(-1);
    else if (e.key === 'ArrowRight' && all[i].classList.contains('has-sub')) {
      e.preventDefault(); e.stopPropagation();
      const k = [...list!.children].indexOf(all[i]); rows[k]?.openSub(true);
    } else if (e.key === 'ArrowLeft' && nested) {
      e.preventDefault(); e.stopPropagation();
      const parent = list!.closest('.ctx-item.has-sub') as HTMLElement | null;
      parent?.classList.remove('open'); (parent?.querySelector(':scope > .sub') as HTMLElement | null)?.style.removeProperty('display'); parent?.focus();
    } else if ((e.key === 'Enter' || e.key === ' ') && all[i].classList.contains('has-sub')) {
      e.preventDefault(); e.stopPropagation(); const k = [...list!.children].indexOf(all[i]); rows[k]?.openSub(true);
    }
  }
</script>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions (the menu handles its arrow keys for its rows) -->
<div bind:this={list} class={['ctx-rows', bare && 'bare']} role="menu" tabindex="-1" onkeydown={key}>
  {#each shown as entry, i (i)}
    {#if isRule(entry)}<hr>{:else if isTiles(entry)}<div class="ctx-tiles" role="group" style:--tiles={entry.columns ?? 5}>{#each entry.tiles as tile (tile.act)}<button type="button" class="ctx-item ctx-tile" role="menuitem" tabindex="-1" title={tile.title ?? tile.label} aria-label={tile.label} disabled={tile.disabled} data-act={tile.act} onclick={() => onpick(tile.act)}>{#if tile.icon}<Icon name={tile.icon} />{:else if tile.svg}{@html tile.svg}{/if}</button>{/each}</div>{:else if isHeading(entry)}<div class="ctx-head" role="presentation">{entry.heading}</div>{:else}<MenuItem bind:this={rows[i]} item={entry as MenuItemSpec} {onpick} />{/if}
  {/each}
</div>
