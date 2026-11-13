<script lang="ts">
  import { liveValue } from './live-value';
  import type { SourcePanelModel } from './contracts';
  let { model }: { model: SourcePanelModel } = $props();
</script>
<div class="sec"><div class="sec-title">{model.title} <small>{model.summary}</small></div>
  <div class="row col"><textarea class="code" data-p="src" aria-label="LaTeX source" spellcheck="false" rows={model.rows} {@attach liveValue(model.src)}></textarea></div>
  {#each model.warnings as warning}<div class="err">{warning}</div>{/each}
  <div class="help">{model.helpBefore}<code>{model.package}</code>{model.helpAfter}</div></div>
<div class="sec">{#each model.actions as action}<button class={action.class} data-act={action.action}>{action.label}</button>{/each}</div>
