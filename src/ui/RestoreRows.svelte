<script lang="ts" module>
  import type { IconName } from './kit/icons';
  /** A row of the Recycle Bin or of a file's Recovery Copies: what it is, when, and how to get it back. */
  export interface RestoreRow {
    key: string;
    attrs: Record<string, string>; // data-ids (the Bin) or data-i (Recovery), which the dialog's clicks read
    svg: string; name: string; detail: string;
    restore: { label: string; title?: string };
    act: { class: string; icon: IconName; title: string; label: string }; // Delete for good, or Open as a new file
  }
  export interface RestoreRowsModel { rows: RestoreRow[]; empty: string }
</script>
<script lang="ts">
  // The rows of the Recycle Bin and Recovery Copies dialogs (application/app.ts builds the dialogs and handles their
  // buttons by class: .bin-restore, .bin-erase, .rec-open). Each row: an icon, the name in bold over a detail line,
  // Restore, and one more action. Not a pick-one list: plain list items, their buttons in the Tab order.
  import Button from './kit/Button.svelte';
  import IconButton from './kit/IconButton.svelte';
  let { model }: { model: RestoreRowsModel } = $props();
</script>
{#each model.rows as r (r.key)}
  <li {...r.attrs}><span class="bin-ic">{@html r.svg}</span><span class="bin-nm"><b>{r.name}</b><small>{r.detail}</small></span>
    <Button class="bin-restore" title={r.restore.title}>{r.restore.label}</Button><IconButton class={r.act.class} icon={r.act.icon} title={r.act.title} aria-label={r.act.label} /></li>
{:else}
  <li class="bin-none">{model.empty}</li>
{/each}
