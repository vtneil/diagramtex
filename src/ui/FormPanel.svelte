<script lang="ts">
  import { t, caption, locale } from '../i18n';
  import type { FormPanelModel } from './forms';
  import FormRows from './FormRows.svelte';
  import { Button, PanelSection } from './kit';
  // PanelSection draws the section itself: the model's class without its "sec"
  const extra = (cls: string) => cls.split(/\s+/).filter((c) => c && c !== 'sec').join(' ') || undefined;
  let { model }: { model: FormPanelModel } = $props();
</script>
{#each model.sections as section}{@const titleAction = section.titleAction}{@const { class: actionClass, ...actionAttrs } = (titleAction?.attrs ?? {}) as Record<string, any>}<PanelSection class={extra(section.class)} title={section.title ? caption(section.title, $locale) : undefined} summary={section.summary} summaryInline={section.titleSpan}>
  {#snippet lead()}{#if section.swatch}<i class={'km-sw' + (section.swatch.bw ? ' bw' : '')} style={section.swatch.bw ? undefined : 'background:' + section.swatch.css}></i>{/if}{/snippet}
  {#snippet action()}{#if titleAction}<Button {...actionAttrs} class={actionClass || undefined}>{caption(titleAction.text, $locale)}</Button>{/if}{#if section.remove}<Button class="mini" data-act={section.remove.action} data-i={section.remove.index} title={caption(section.remove.title, $locale)}>✕</Button>{/if}{/snippet}
  <FormRows rows={section.rows}/></PanelSection>{/each}
