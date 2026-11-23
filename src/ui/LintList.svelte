<script lang="ts" module>
  /** One finding of TD.lint (src/domain/texlint.ts). */
  export interface LintItem { sev: string; line: number; msg: string }
  export interface LintListModel { note?: string; items: LintItem[]; max?: number; /** what a compile did or is doing (above the items) */ status?: { text: string; kind: 'info' | 'warn' | 'error' | 'ok' } }
</script>
<script lang="ts">
  // What would stop pdflatex, line by line: problems in red pen, notes in graphite; a note of the dialog's own first.
  // In the LaTeX dialog's foot (#tikzLint) and in the Import report.
  import { t, locale } from '../i18n';
  let { model }: { model: LintListModel } = $props();
  const max = $derived(model.max ?? 12);
</script>
{#if model.status}<div class={['lint', 'tex-status', model.status.kind]}>{model.status.text}</div>{/if}{#if model.note}<div class="lint warn">{model.note}</div>{/if}
{#each model.items.slice(0, max) as d, i (i)}<div class={['lint', d.sev]}><span class="ln">{t('imp.line', 'line {n}', { n: d.line }, $locale)}</span> {d.msg}</div>{/each}
{#if model.items.length > max}<div class="lint info">{t('imp.more', '… {n} more', { n: model.items.length - max }, $locale)}</div>{/if}
