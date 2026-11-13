<script lang="ts">
  export interface Diagnostic { sev: string; line: number; msg: string }
  let { diagnostics, max = 12 }: { diagnostics: Diagnostic[]; max?: number } = $props();
</script>
{#each diagnostics.slice(0, max) as diagnostic}<div class={'lint ' + diagnostic.sev}><span class="ln">line {diagnostic.line}</span> {diagnostic.msg}</div>{/each}{#if diagnostics.length > max}<div class="lint info">… {diagnostics.length - max} more</div>{/if}
