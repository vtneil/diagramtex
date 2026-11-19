<script lang="ts">
  import { t, caption, locale } from '../i18n';
  import { Button, FormRow, Help, PanelSection, TextArea } from './kit';
  import type { SourcePanelModel } from './contracts';
  let { model }: { model: SourcePanelModel } = $props();
  // an action's class names its look: "primary" is the main action, the rest ("wide") stay classes
  const actionLook = (cls?: string) => { const parts = (cls ?? '').split(/\s+/).filter(Boolean); return { variant: parts.includes('primary') ? 'primary' as const : undefined, class: parts.filter((c) => c !== 'primary').join(' ') || undefined }; };
</script>
<PanelSection title={caption(model.title, $locale)} summary={caption(model.summary, $locale)}>
  <FormRow column><TextArea code data-p="src" aria-label={t("ui.latex.source", "LaTeX source", {}, $locale)} rows={model.rows} value={model.src} /></FormRow>
  {#each model.warnings as warning}<Help kind="error">{caption(warning, $locale)}</Help>{/each}
  <Help>{caption(model.helpBefore, $locale)}{#if model.package}<code>{model.package}</code>{/if}{caption(model.helpAfter, $locale)}</Help></PanelSection>
<PanelSection>{#each model.actions as action}{@const look = actionLook(action.class)}<Button variant={look.variant} class={look.class} data-act={action.action}>{caption(action.label, $locale)}</Button>{/each}</PanelSection>
