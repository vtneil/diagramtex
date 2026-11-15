<script lang="ts">
  import { t, locale } from '../i18n';
  export interface Diagnostic { sev: string; line: number; msg: string }
  let { diagnostics, max = 12 }: { diagnostics: Diagnostic[]; max?: number } = $props();
</script>
{#each diagnostics.slice(0, max) as diagnostic}<div class={'lint ' + diagnostic.sev}><span class="ln">{t("lint.line", "line {n}", { n: diagnostic.line }, $locale)}</span> {diagnostic.msg}</div>{/each}{#if diagnostics.length > max}<div class="lint info">{t("list.more", "… {n} more", { n: diagnostics.length - max }, $locale)}</div>{/if}
