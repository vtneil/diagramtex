<script lang="ts">
  // A row in a list: the file list, layers, the Recycle Bin, recovery copies. An icon, the name (cut short with …),
  // anything trailing (a count), and actions that show while the row is hovered or focused. Selected by a fill.
  // `depth` indents a row in a tree, 16px a level. Renamed in place: a double-click on the name, F2, or setting
  // `renaming` opens a field over it; Enter or leaving saves (`onrename` gets the trimmed text), Esc cancels.
  // Enter or a click on the row opens it (`onopen`, given the event). A list that tells a double-click from two
  // clicks itself (the file list: a folder's fold) sets `renameOnDblclick` false and sets `renaming`.
  // `onrenameend` follows every rename, kept or not.
  import { tick, type Snippet } from 'svelte';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  let { name, icon, svg, selected = false, depth = 0, renaming = $bindable(false), renameLabel = 'Name', renameValue, renamePlaceholder, renameMax, renameOnDblclick = true, focusable = true, title, class: extra, onopen, onrename, onrenameend, lead, trail, actions, ...rest }: {
    name: string; icon?: IconName; svg?: string; selected?: boolean; depth?: number; renaming?: boolean;
    /** the rename field's name for screen readers */
    renameLabel?: string; renameOnDblclick?: boolean;
    /** what the field starts with, if not the name (an unnamed Quick draft: empty, its time as the placeholder) */
    renameValue?: string; renamePlaceholder?: string; renameMax?: number; title?: string; class?: string;
    /** in the Tab order (default); Layers' rows are reached by pointer, the list taking the keys */
    focusable?: boolean;
    /** before the icon: Layers' eye, fold chevron and picture */
    lead?: Snippet;
    onopen?: (e: MouseEvent | KeyboardEvent) => void; onrename?: (name: string) => void; onrenameend?: () => void; trail?: Snippet; actions?: Snippet;
    [attr: string]: unknown;
  } = $props();
  let field: HTMLInputElement | undefined = $state();
  let done = false;
  $effect(() => { if (renaming) { done = false; tick().then(() => { field?.focus(); field?.select(); }); } });
  function finish(save: boolean) {
    if (done || !field) return;
    done = true;
    const text = field.value.trim();
    renaming = false;
    if (save && text !== (renameValue ?? name)) onrename?.(text);
    onrenameend?.();
  }
  function keys(e: KeyboardEvent) {
    if (renaming || e.target !== e.currentTarget) return;
    if (e.key === 'Enter') { e.preventDefault(); onopen?.(e); }
    else if (e.key === 'F2' && onrename) { e.preventDefault(); renaming = true; }
  }
</script>
<!-- svelte-ignore a11y_click_events_have_key_events (Enter and F2 are handled on the row) -->
<li class={['list-row', selected && 'on', renaming && 'renaming', extra]} style:--depth={depth} role="option" aria-selected={selected} tabindex={focusable ? 0 : undefined} {title}
  onclick={(e) => { if (!renaming) onopen?.(e); }} onkeydown={keys} {...rest}>
  {@render lead?.()}
  {#if icon}<Icon name={icon} />{:else if svg}{@html svg}{/if}
  {#if renaming}
    <input bind:this={field} class="list-row-ed" value={renameValue ?? name} placeholder={renamePlaceholder} maxlength={renameMax} aria-label={renameLabel} spellcheck="false"
      onclick={(e) => e.stopPropagation()} onblur={() => finish(true)}
      onkeydown={(e) => { e.stopPropagation(); const li = e.currentTarget.closest('li') as HTMLElement | null; /* found first: finishing may redraw the list */ if (e.key === 'Enter') { e.preventDefault(); finish(true); li?.focus(); } else if (e.key === 'Escape') { e.preventDefault(); finish(false); li?.focus(); } }}>
  {:else}
    <!-- svelte-ignore a11y_no_static_element_interactions (double-click renames; F2 does from the keyboard) -->
    <span class="nm" ondblclick={(e) => { if (onrename && renameOnDblclick) { e.stopPropagation(); renaming = true; } }}>{name}</span>
  {/if}
  {@render trail?.()}
  {#if actions && !renaming}<span class="acts">{@render actions()}</span>{/if}
</li>
