<script lang="ts">
  export interface Result { label: string; value: string; kind: string; status: string; title: string }
  let { results }: { results: Result[] } = $props();
</script>
<div class="phy-res">{#each results as result}<div class="phy-r" title={result.title}><span class="phy-l">{result.label}</span><span class="phy-v">{result.value}</span><span class={'phy-k phy-' + result.kind}>{result.status}</span></div>{/each}</div>
