<script lang="ts">
  import { t, rich, caption, locale, type Message } from '../i18n';
  import { liveValue } from './live-value';
  import PhysicsResults, { type Result } from './PhysicsResults.svelte';
  export interface Model { domain: string | Message; results: Result[]; warnings: string[]; src: string }
  let { model }: { model: Model } = $props();
</script>
<div class="sec"><div class="sec-title">{t("ui.physics.variant1", "Physics ", {}, $locale)}<small>{caption(model.domain, $locale)}</small></div>
  {#if model.results.length}<PhysicsResults results={model.results}/>{:else}<div class="help">{t("ui.nothing.computed.yet", "Nothing computed yet.", {}, $locale)}</div>{/if}
  {#each model.warnings as warning}<div class="err">{warning}</div>{/each}
  <div class="help">{@html rich(t("physics.legend", "Hover a result for its model. <b>exact</b>: from the model as stated; <b>ideal</b>: exact for an idealised setup; <b>approx.</b>: an approximation; <b>schematic</b>: drawn, not computed.", {}, $locale))}</div></div>
<div class="sec"><div class="sec-title">{t("ui.source", "Source", {}, $locale)}</div>
  <div class="row col"><textarea class="code" data-p="src" aria-label={t("ui.latex.source", "LaTeX source", {}, $locale)} spellcheck="false" rows="12" {@attach liveValue(model.src)}></textarea></div>
  <div class="help">{t("ui.diagramtex.s.own.syntax.not.latex.it.won.t.compile.on.its.own.use.copy.tikz.code", "DiagramTeX's own syntax, not LaTeX: it won't compile on its own. Use Copy TikZ Code below, or Export, for the LaTeX. One object per line; lines the block does not know are kept, and plain TikZ lines are drawn and exported as written.", {}, $locale)}</div></div>
<div class="sec"><button class="wide primary" data-act="editphysics">{t("ui.edit.physics", "Edit Physics…", {}, $locale)}</button><button class="wide" data-act="copyphysics">{t("ui.copy.tikz.code", "Copy TikZ Code", {}, $locale)}</button></div>
