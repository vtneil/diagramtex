<script lang="ts">
  import { t, caption, locale, type Message } from '../i18n';
  import { liveValue } from './live-value';
  import LintReport, { type Diagnostic } from './LintReport.svelte';
  export interface Model { count: number; code: string; lint: Diagnostic[]; issues: string[]; description: string | Message; scopes: string[]; convert: boolean }
  let { model }: { model: Model } = $props();
</script>
<div class="sec"><div class="sec-title">{t("ui.tikz.code.variant2", "TikZ code ", {}, $locale)}<small>{model.count === 1 ? t('raw.preview1', 'preview: 1 object', {}, $locale) : model.count ? t('raw.preview', 'preview: {n} objects', { n: model.count }, $locale) : t('raw.noPreview', 'no preview', {}, $locale)}</small></div>
  <div class="row col"><textarea class="code" data-p="code" aria-label={t("ui.tikz.code.variant1", "TikZ code", {}, $locale)} spellcheck="false" rows="8" {@attach liveValue(model.code)}></textarea></div>
  {#if model.lint.length}<div class="row col"><LintReport diagnostics={model.lint} max={6}/></div>{/if}
  {#each model.issues.slice(0, 6) as issue}<div class="err">{issue}</div>{/each}{#if model.issues.length > 6}<div class="err">{t("list.more", "… {n} more", { n: model.issues.length - 6 }, $locale)}</div>{/if}
  <div class="help">{caption(model.description, $locale)}{#if model.scopes.length}<br>{t("raw.scopes", "Scopes:", {}, $locale)}{" "}{#each model.scopes as scope, i}{#if i} › {/if}<code>{scope}</code>{/each}{/if}</div></div>
{#if model.convert}<div class="sec"><button class="wide" data-act="rawconvert" title={t("ui.replace.the.code.with.the.shapes.of.the.preview.what.the.preview.leaves.out.is.l", "Replace the code with the shapes of the preview. What the preview leaves out is lost.", {}, $locale)}>{t("ui.convert.to.shapes", "Convert to Shapes", {}, $locale)}</button></div>{/if}
