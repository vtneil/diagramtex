<script lang="ts">
  import { t, caption, locale } from '../i18n';
  import { liveValue } from './live-value';
  import type { SourcePanelModel } from './contracts';
  let { model }: { model: SourcePanelModel } = $props();
</script>
<div class="sec"><div class="sec-title">{caption(model.title, $locale)} <small>{caption(model.summary, $locale)}</small></div>
  <div class="row col"><textarea class="code" data-p="src" aria-label={t("ui.latex.source", "LaTeX source", {}, $locale)} spellcheck="false" rows={model.rows} {@attach liveValue(model.src)}></textarea></div>
  {#each model.warnings as warning}<div class="err">{caption(warning, $locale)}</div>{/each}
  <div class="help">{caption(model.helpBefore, $locale)}{#if model.package}<code>{model.package}</code>{/if}{caption(model.helpAfter, $locale)}</div></div>
<div class="sec">{#each model.actions as action}<button class={action.class} data-act={action.action}>{caption(action.label, $locale)}</button>{/each}</div>
