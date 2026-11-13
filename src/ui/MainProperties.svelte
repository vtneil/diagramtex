<script lang="ts">
  import { flushSync } from 'svelte';
  import GeometryProperties, { type Model as GeometryModel } from './GeometryProperties.svelte';
  import StyleField, { type Model as StyleModel } from './StyleField.svelte';
  import PageProperties, { type Model as PageModel } from './PageProperties.svelte';
  import Variables, { type Variable } from './Variables.svelte';
  import FormPanel from './FormPanel.svelte';
  import type { FormSection } from './forms';
  export interface Model {
    defaults: boolean; title: string; fields: StyleModel[]; page?: PageModel; variables?: Variable[];
    before: FormSection[]; after: FormSection[]; panel?: string; geometry: boolean;
    shortcuts?: { keys: string[]; description: string }[];
  }
  let { model }: { model: Model } = $props();
  let geometry = $state<GeometryModel | null>(null);
  export function updateGeometry(next: GeometryModel) { flushSync(() => { geometry = next; }); }
</script>
{#if model.page}<PageProperties model={model.page}/>{/if}<h3>{model.title}{#if model.defaults} <small>for new shapes</small>{/if}</h3>{#if model.fields.length}<div class="sec" data-target={model.defaults ? 'defaults' : 'sel'}>{#each model.fields as field}<StyleField model={field}/>{/each}</div>{/if}{#if model.variables}<Variables variables={model.variables}/>{/if}<FormPanel model={{ sections: model.before }}/>{#if model.panel}<div class="panel" data-panel={model.panel}></div>{/if}{#if model.geometry}<div class="sec" id="geomSec">{#if geometry}<GeometryProperties model={geometry}/>{/if}</div>{/if}<FormPanel model={{ sections: model.after }}/>{#if model.shortcuts}<div class="sec"><div class="sec-title">Shortcuts</div><table class="keys"><tbody>{#each model.shortcuts as shortcut}<tr><td>{#each shortcut.keys as key}<kbd>{key}</kbd>{/each}</td><td>{shortcut.description}</td></tr>{/each}</tbody></table></div>{/if}
