<script lang="ts" module>
  import type { RestoreRowsModel } from './RestoreRows.svelte';
  /** The Recycle Bin dialog: what it holds, and whether there is anything to empty. */
  export interface BinDialogModel { title: string; sub: string; list: RestoreRowsModel; emptyLabel: string; canEmpty: boolean; doneLabel: string }
</script>
<script lang="ts">
  // The Recycle Bin (the sidebar's bin row): one row per deleted file, or per folder deleted as a whole. Drawn into
  // the .td-dialog that application/app.ts opens; its buttons are handled there by class (.bin-restore, .bin-erase,
  // .bin-empty, .bin-done).
  import RestoreRows from './RestoreRows.svelte';
  import { Button, Spacer } from './kit';
  let { model }: { model: BinDialogModel } = $props();
</script>
<div class="tdd-box bin-box" role="dialog" aria-modal="true" aria-labelledby="binTitle">
  <h2 id="binTitle">{model.title}</h2><p class="bin-sub">{model.sub}</p>
  <ul class="bin-list" role="list"><RestoreRows model={model.list} /></ul>
  <div class="tdd-btns"><Button class="bin-empty" disabled={!model.canEmpty}>{model.emptyLabel}</Button><Spacer /><Button variant="primary" class="bin-done">{model.doneLabel}</Button></div>
</div>
