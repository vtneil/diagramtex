<script lang="ts">
  import { liveValue } from './live-value';
  import LintReport, { type Diagnostic } from './LintReport.svelte';
  export interface Model { count: number; code: string; lint: Diagnostic[]; issues: string[]; description: string; scopes: string[]; convert: boolean }
  let { model }: { model: Model } = $props();
</script>
<div class="sec"><div class="sec-title">TikZ code <small>{model.count ? `preview: ${model.count} object${model.count > 1 ? 's' : ''}` : 'no preview'}</small></div>
  <div class="row col"><textarea class="code" data-p="code" aria-label="TikZ code" spellcheck="false" rows="8" {@attach liveValue(model.code)}></textarea></div>
  {#if model.lint.length}<div class="row col"><LintReport diagnostics={model.lint} max={6}/></div>{/if}
  {#each model.issues.slice(0, 6) as issue}<div class="err">{issue}</div>{/each}{#if model.issues.length > 6}<div class="err">… {model.issues.length - 6} more</div>{/if}
  <div class="help">{model.description}{#if model.scopes.length}<br>Scopes: {#each model.scopes as scope, i}{#if i} › {/if}<code>{scope}</code>{/each}{/if}</div></div>
{#if model.convert}<div class="sec"><button class="wide" data-act="rawconvert" title="Replace the code with the shapes of the preview. What the preview leaves out is lost.">Convert to Shapes</button></div>{/if}
