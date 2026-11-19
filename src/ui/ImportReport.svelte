<script lang="ts" module>
  import type { LintItem } from './LintList.svelte';
  /** Under the Import field, as the code is typed: what becomes shapes, what stays code and why. `text` alone: one line. */
  export interface ImportReportModel {
    text?: string;
    unresolved?: string; lint?: LintItem[]; summary?: string;
    rows?: { line: string; code: string; why: string }[]; more?: string;
    warnings?: string[];
  }
</script>
<script lang="ts">
  // The Import dialog's report (#impMsg), drawn from src/application/app.ts's importReport().
  import LintList from './LintList.svelte';
  let { model }: { model: ImportReportModel } = $props();
</script>
{#if model.text}{model.text}{:else}
  {#if model.unresolved}<div class="warn">{model.unresolved}</div>{/if}
  {#if model.lint?.length}<LintList model={{ items: model.lint, max: 8 }} />{/if}
  {#if model.summary}<div>{model.summary}</div>{/if}
  {#if model.rows?.length}<ul>{#each model.rows as r, i (i)}<li><span class="ln">{r.line}</span><code>{r.code}</code><span class="why">{r.why}</span></li>{/each}{#if model.more}<li>{model.more}</li>{/if}</ul>{/if}
  {#each model.warnings ?? [] as w, i (i)}<div class="warn">{w}</div>{/each}
{/if}
