<script lang="ts" module>
  import type { RestoreRowsModel } from './RestoreRows.svelte';
  import type { SelectOption } from './kit';
  /** One file's recovery copies, and how often and how many are kept. */
  export interface RecoveryChoice { label: string; aria: string; value: number; options: SelectOption[] }
  export interface RecoveryDialogModel { title: string; sub: string; list: RestoreRowsModel; every: RecoveryChoice; keep: RecoveryChoice; doneLabel: string }
</script>
<script lang="ts">
  // Recovery Copies (a file's right-click menu): the newest first, each restored in place or opened as a new file;
  // below, how often a copy is kept and how many. Drawn into the .td-dialog that application/app.ts opens; its
  // buttons are handled there by class (.bin-restore, .rec-open, .rec-done), the two choices by name (every, keep).
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
  <div class="tdd-btns"><Spacer /><Button variant="primary" class="rec-done">{model.doneLabel}</Button></div>
</div>
