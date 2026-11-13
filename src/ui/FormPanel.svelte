<script lang="ts">
  import type { FormPanelModel } from './forms';
  import FormRows from './FormRows.svelte';
  let { model }: { model: FormPanelModel } = $props();
</script>
{#each model.sections as section}<div class={section.class}>{#if section.title}<div class="sec-title">{#if section.swatch}<i class={'km-sw' + (section.swatch.bw ? ' bw' : '')} style={section.swatch.bw ? undefined : 'background:' + section.swatch.css}></i>{/if}{#if section.titleSpan}<span>{section.title}{#if section.summary !== undefined} <small>{section.summary}</small>{/if}</span>{:else}{section.title}{#if section.summary !== undefined} <small>{section.summary}</small>{/if}{/if}{#if section.titleAction} <button {...section.titleAction.attrs}>{section.titleAction.text}</button>{/if}{#if section.remove}<button class="mini" data-act={section.remove.action} data-i={section.remove.index} title={section.remove.title}>✕</button>{/if}</div>{/if}<FormRows rows={section.rows}/></div>{/each}
