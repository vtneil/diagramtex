<script lang="ts">
  import { liveValue } from './live-value';
  import PhysicsResults, { type Result } from './PhysicsResults.svelte';
  export interface Model { domain: string; results: Result[]; warnings: string[]; src: string }
  let { model }: { model: Model } = $props();
</script>
<div class="sec"><div class="sec-title">Physics <small>{model.domain}</small></div>
  {#if model.results.length}<PhysicsResults results={model.results}/>{:else}<div class="help">Nothing computed yet.</div>{/if}
  {#each model.warnings as warning}<div class="err">{warning}</div>{/each}
  <div class="help">Hover a result for its model. <b>exact</b>: from the model as stated; <b>ideal</b>: exact for an idealised setup; <b>approx.</b>: an approximation; <b>schematic</b>: drawn, not computed.</div></div>
<div class="sec"><div class="sec-title">Source</div>
  <div class="row col"><textarea class="code" data-p="src" aria-label="LaTeX source" spellcheck="false" rows="12" {@attach liveValue(model.src)}></textarea></div>
  <div class="help">DiagramTeX's own syntax, not LaTeX: it won't compile on its own. Use Copy TikZ Code below, or Export, for the LaTeX. One object per line; lines the block does not know are kept, and plain TikZ lines are drawn and exported as written.</div></div>
<div class="sec"><button class="wide primary" data-act="editphysics">Edit Physics…</button><button class="wide" data-act="copyphysics">Copy TikZ Code</button></div>
