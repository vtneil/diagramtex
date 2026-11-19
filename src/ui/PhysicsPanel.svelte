<script lang="ts">
  import { t, rich, caption, locale, type Message } from '../i18n';
  import { Button, FormRow, Help, PanelSection, TextArea } from './kit';
  import PhysicsResults, { type Result } from './PhysicsResults.svelte';
  export interface Model { domain: string | Message; results: Result[]; warnings: string[]; src: string }
  let { model }: { model: Model } = $props();
</script>
<PanelSection title={t("ui.physics.variant1", "Physics ", {}, $locale).trim()} summary={caption(model.domain, $locale)}>
  {#if model.results.length}<PhysicsResults results={model.results}/>{:else}<Help>{t("ui.nothing.computed.yet", "Nothing computed yet.", {}, $locale)}</Help>{/if}
  {#each model.warnings as warning}<Help kind="error">{warning}</Help>{/each}
  <Help>{@html rich(t("physics.legend", "Hover a result for its model. <b>exact</b>: from the model as stated; <b>ideal</b>: exact for an idealised setup; <b>approx.</b>: an approximation; <b>schematic</b>: drawn, not computed.", {}, $locale))}</Help></PanelSection>
<PanelSection title={t("ui.source", "Source", {}, $locale)}>
  <FormRow column><TextArea code data-p="src" aria-label={t("ui.latex.source", "LaTeX source", {}, $locale)} rows={12} value={model.src} /></FormRow>
  <Help>{t("ui.diagramtex.s.own.syntax.not.latex.it.won.t.compile.on.its.own.use.copy.tikz.code", "DiagramTeX's own syntax, not LaTeX: it won't compile on its own. Use Copy TikZ Code below, or Export, for the LaTeX. One object per line; lines the block does not know are kept, and plain TikZ lines are drawn and exported as written.", {}, $locale)}</Help></PanelSection>
<PanelSection><Button variant="primary" class="wide" data-act="editphysics">{t("ui.edit.physics", "Edit Physics…", {}, $locale)}</Button><Button class="wide" data-act="copyphysics">{t("ui.copy.tikz.code", "Copy TikZ Code", {}, $locale)}</Button></PanelSection>
