<script lang="ts">
  import { t, caption, locale } from '../i18n';
  import type { FormPanelModel } from './forms';
  import FormRows from './FormRows.svelte';
  let { model }: { model: FormPanelModel } = $props();
</script>
{#each model.sections as section}<div class={section.class}>{#if section.title}<div class="sec-title">{#if section.swatch}<i class={'km-sw' + (section.swatch.bw ? ' bw' : '')} style={section.swatch.bw ? undefined : 'background:' + section.swatch.css}></i>{/if}{#if section.titleSpan}<span>{caption(section.title, $locale)}{#if section.summary !== undefined} <small>{section.summary}</small>{/if}</span>{:else}{caption(section.title, $locale)}{#if section.summary !== undefined} <small>{section.summary}</small>{/if}{/if}{#if section.titleAction} <button {...section.titleAction.attrs}>{caption(section.titleAction.text, $locale)}</button>{/if}{#if section.remove}<button class="mini" data-act={section.remove.action} data-i={section.remove.index} title={caption(section.remove.title, $locale)}>✕</button>{/if}</div>{/if}<FormRows rows={section.rows}/></div>{/each}
