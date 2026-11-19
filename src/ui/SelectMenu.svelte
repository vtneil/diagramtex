<script lang="ts" module>
  /** A row of the menu: a group's heading, or an option (its index in the select). An option shows a colour chip, a
   *  drawing before its name and a quiet note after it; in a grid of tiles, its drawing alone (`tile`), or a picture
   *  over a short name (`pic`). */
  export type SelectMenuRow =
    | { group: string }
    | { i: number; text: string; on: boolean; dis: boolean; svg?: string; tile?: boolean; note?: string; pic?: { svg: string; label: string }; swatch?: string; font?: string };
  export interface SelectMenuModel {
    /** closed at once; `leaving` keeps it drawn while it fades out */
    open: boolean; leaving: boolean; label: string;
    /** a list, picture tiles four across, or drawing tiles `cols` across */
    kind: 'list' | 'pics' | 'tiles'; cols: number;
    rows: SelectMenuRow[]; hi: number;
    /** a line at the foot that takes a value the options don't hold */
    custom: { label: string; value: string; placeholder?: string; title?: string; on?: boolean } | null;
    left: number; top: number; minWidth: number; maxHeight: number | null; origin: string;
  }
</script>
<script lang="ts">
  // The menu every select element opens (src/ui/services/selectmenu.svelte.ts opens it, places it, and handles the keys on
  // the select, which keeps the focus): the same rows as the app's other menus, the highlighted one in the well tone,
  // the current value in the stronger wash. It pops in, and fades out while closed (`leaving`).
  import TextField from './kit/TextField.svelte';
  let { model: m, oncustomkey, oncustomblur }: {
    model: SelectMenuModel;
    oncustomkey: (e: KeyboardEvent, input: HTMLInputElement) => void; oncustomblur: () => void;
  } = $props();
</script>
<div class={['selmenu', m.kind !== 'list' && m.kind, m.leaving && 'leaving']} role="listbox" aria-label={m.label} hidden={!m.open}
  style:--cols={m.kind === 'tiles' ? m.cols : undefined} style:left="{m.left}px" style:top="{m.top}px" style:min-width="{m.minWidth}px"
  style:max-height={m.maxHeight == null ? undefined : m.maxHeight + 'px'} style:transform-origin={m.origin}>
  {#each m.rows as r, k (k)}
    {#if 'group' in r}<div class="selmenu-group">{r.group}</div>
    {:else}
      <div class={['selmenu-item', r.on && 'on', r.dis && 'dis', r.i === m.hi && 'hi']} data-i={r.i} role="option" aria-selected={r.on} style:font-family={r.font || undefined}
        title={r.pic || r.tile ? r.text : undefined}>{#if r.pic}{@html r.pic.svg}<span>{r.pic.label}</span>{:else if r.tile}{@html r.svg}{:else}{#if r.swatch}<span class="selmenu-sw" style:background={r.swatch}></span>{/if}{#if r.svg}{@html r.svg}{/if}{r.text}{#if r.note}<i>{r.note}</i>{/if}{/if}</div>
    {/if}
  {/each}
  {#if m.custom}
    <div class={['selmenu-custom', m.custom.on && 'on']}><label for="selmenu-custom">{m.custom.label}</label><TextField id="selmenu-custom" value={m.custom.value} placeholder={m.custom.placeholder} title={m.custom.title}
      onkeydown={(e: KeyboardEvent) => oncustomkey(e, e.currentTarget as HTMLInputElement)} onblur={oncustomblur} /></div>
  {/if}
</div>
