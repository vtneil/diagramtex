<script lang="ts">
  import { t, caption, locale, type Message } from '../i18n';
  import { Button, FormRow, Help, PanelSection, TextArea } from './kit';
  import LintReport, { type Diagnostic } from './LintReport.svelte';
  export interface Model { count: number; code: string; lint: Diagnostic[]; issues: string[]; description: string | Message; scopes: string[]; convert: boolean }
  let { model }: { model: Model } = $props();
</script>
<PanelSection title={t("ui.tikz.code.variant2", "TikZ code ", {}, $locale).trim()} summary={model.count === 1 ? t('raw.preview1', 'preview: 1 object', {}, $locale) : model.count ? t('raw.preview', 'preview: {n} objects', { n: model.count }, $locale) : t('raw.noPreview', 'no preview', {}, $locale)}>
  <FormRow column><TextArea code data-p="code" aria-label={t("ui.tikz.code.variant1", "TikZ code", {}, $locale)} rows={8} value={model.code} /></FormRow>
  {#if model.lint.length}<FormRow column><LintReport diagnostics={model.lint} max={6}/></FormRow>{/if}
  {#each model.issues.slice(0, 6) as issue}<Help kind="error">{issue}</Help>{/each}{#if model.issues.length > 6}<Help kind="error">{t("list.more", "… {n} more", { n: model.issues.length - 6 }, $locale)}</Help>{/if}
  <Help>{caption(model.description, $locale)}{#if model.scopes.length}<br>{t("raw.scopes", "Scopes:", {}, $locale)}{" "}{#each model.scopes as scope, i}{#if i} › {/if}<code>{scope}</code>{/each}{/if}</Help></PanelSection>
{#if model.convert}<PanelSection><Button class="wide" data-act="rawconvert" title={t("ui.replace.the.code.with.the.shapes.of.the.preview.what.the.preview.leaves.out.is.l", "Replace the code with the shapes of the preview. What the preview leaves out is lost.", {}, $locale)}>{t("ui.convert.to.shapes", "Convert to Shapes", {}, $locale)}</Button></PanelSection>{/if}
