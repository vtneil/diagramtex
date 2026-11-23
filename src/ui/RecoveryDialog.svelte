<script lang="ts" module>
  import type { RestoreRowsModel } from './RestoreRows.svelte';
  import type { SelectOption } from './kit';
  /** One file's version history (saved versions and automatic copies), and how often and how many copies are kept. */
  export interface RecoveryChoice { label: string; aria: string; value: number; options: SelectOption[] }
  export interface RecoveryDialogModel { title: string; sub: string; list: RestoreRowsModel; every: RecoveryChoice; keep: RecoveryChoice; doneLabel: string;
    saveLabel: string; saveTitle: string; /** how much of the browser's storage the app uses, once the browser says */ usage: string; usageHigh: boolean }
</script>
<script lang="ts">
  // Version History (a file's right-click menu): the newest first, each restored in place, named and kept, opened as a
  // new file or deleted; below, how often a copy is kept and how many, and Save Version…. Drawn into the .td-dialog
  // that application/app.ts opens; its buttons are handled there by class (.bin-restore, .rec-name, .rec-open, .rec-del,
  // .rec-save, .rec-done), the two choices by name (every, keep).
  import RestoreRows from './RestoreRows.svelte';
  import { Button, Select, Spacer } from './kit';
  let { model }: { model: RecoveryDialogModel } = $props();
</script>
<div class="tdd-box bin-box rec-box" role="dialog" aria-modal="true" aria-labelledby="recTitle">
  <h2 id="recTitle">{model.title}</h2><p class="bin-sub">{model.sub}</p>
  <ul class="bin-list rec-list" role="list"><RestoreRows model={model.list} /></ul>
  <div class="rec-set">
    {#each [['every', model.every], ['keep', model.keep]] as const as [name, c] (name)}<label>{c.label} <Select {name} aria-label={c.aria} value={String(c.value)} options={c.options} /></label>{/each}
  </div>
  {#if model.usage}<p class="rec-usage" class:rec-high={model.usageHigh}>{model.usage}</p>{/if}
  <div class="tdd-btns"><Button class="rec-save" icon="history" title={model.saveTitle}>{model.saveLabel}</Button><Spacer /><Button variant="primary" class="rec-done">{model.doneLabel}</Button></div>
</div>
