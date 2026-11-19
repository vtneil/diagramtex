<script lang="ts" module>
  import type { IconName } from './kit/icons';
  /** One row of the Layers panel, top first: a shape, a group, or a shape inside an open group (application/app.ts). */
  export interface LayerRow {
    key: string; // the shape's id, or 'g:<group>'
    id?: string; g?: string;
    name: string;
    on: boolean; hid: boolean; lk: boolean; inGroup?: boolean;
    open?: boolean; count?: number; // a group's fold and its number of shapes
    thumb: string; icon: boolean; // the picture (svg), or a line icon for text and groups
    eye: { icon: IconName; title: string };
    lock: { icon: IconName; title: string };
    fold?: { icon: IconName; title: string; label: string };
  }
  export interface LayerListModel {
    rows: LayerRow[];
    empty: string; // shown when there are no shapes
    renaming: string | null;
    nameLabel: string;
    rename(row: LayerRow, name: string): void;
    renameEnd(): void;
  }
</script>
<script lang="ts">
  // The Layers panel's rows as ListRows: eye, fold, picture, name, count, lock. Selecting, dragging, the buttons and
  // the right-click menu stay with app.ts (pointer handlers on #layers, rows found by .ly-row / data-id / data-g);
  // a double-click there sets `renaming`.
  import EmptyState from './kit/EmptyState.svelte';
  import ListRow from './kit/ListRow.svelte';
  import IconButton from './kit/IconButton.svelte';
  let { model }: { model: LayerListModel } = $props();
</script>
{#each model.rows as r (r.key)}
  <ListRow name={r.name} selected={r.on} focusable={false} renameOnDblclick={false} renaming={model.renaming === r.key} renameLabel={model.nameLabel}
    class={['ly-row', r.g && 'ly-grp', r.inGroup && 'ly-in', r.hid && 'hid', r.lk && 'lk'].filter(Boolean).join(' ')}
    data-id={r.id} data-g={r.g} aria-expanded={r.g ? r.open : undefined}
    onrename={(name) => model.rename(r, name)} onrenameend={model.renameEnd}>
    {#snippet lead()}<IconButton class="ly-eye" icon={r.eye.icon} data-la="eye" title={r.eye.title} aria-label={r.eye.title} />{#if r.fold}<IconButton
      class={r.open ? 'ly-chev open' : 'ly-chev'} icon={r.fold.icon} data-la="fold" title={r.fold.title} aria-label={r.fold.label} />{:else}<span class="ly-pad"></span>{/if}<span
      class={['ly-th', r.icon && 'ly-ic']}>{@html r.thumb}</span>{/snippet}
    {#snippet trail()}{#if r.count !== undefined}<small>{r.count}</small>{/if}<IconButton class="ly-lock" icon={r.lock.icon} data-la="lock" title={r.lock.title} aria-label={r.lock.title} />{/snippet}
  </ListRow>
{:else}
  <li class="ly-empty" role="presentation"><EmptyState>{model.empty}</EmptyState></li>
{/each}
