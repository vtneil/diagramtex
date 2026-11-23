<script lang="ts">
  import { t, caption, locale } from '../i18n';
  import { flushSync } from 'svelte';
  import GeometryProperties, { type Model as GeometryModel } from './GeometryProperties.svelte';
  import StyleField, { type Model as StyleModel } from './StyleField.svelte';
  import PageProperties, { type Model as PageModel } from './PageProperties.svelte';
  import Variables, { type Variable } from './Variables.svelte';
  import FormPanel from './FormPanel.svelte';
  import type { FormSection } from './forms';
  import { Kbd, PanelSection } from './kit';
  export interface Model {
    defaults: boolean; defaultsHint?: boolean; /** what its fields set: the selection, Default style, or the fill bucket */ target?: 'bucket'; title: string; fields: StyleModel[]; page?: PageModel; variables?: Variable[];
    before: FormSection[]; after: FormSection[]; panel?: string; geometry: boolean;
    /** the selection's named style (above its fields) */ named?: FormSection[];
    shortcuts?: { keys: string[]; description: string }[];
  }
  let { model }: { model: Model } = $props();
  let geometry = $state<GeometryModel | null>(null);
  let after = $state<FormSection[] | null>(null);
  export function updateAfter(next: FormSection[]) { flushSync(() => { after = next; }); }
  export function updateGeometry(next: GeometryModel) { flushSync(() => { geometry = next; }); }
</script>
{#if model.page}<PageProperties model={model.page}/>{/if}<h3>{caption(model.title, $locale)}{#if model.defaults && model.defaultsHint !== false} <small>{t("ui.for.new.shapes", "for new shapes", {}, $locale)}</small>{/if}</h3>{#if model.named}<FormPanel model={{ sections: model.named }}/>{/if}{#if model.fields.length}<PanelSection data-target={model.target || (model.defaults ? 'defaults' : 'sel')}>{#each model.fields as field}<StyleField model={field}/>{/each}</PanelSection>{/if}{#if model.variables}<Variables variables={model.variables}/>{/if}<FormPanel model={{ sections: model.before }}/>{#if model.panel}<div class="panel" data-panel={model.panel}></div>{/if}{#if model.geometry}<PanelSection id="geomSec" title={geometry ? caption(geometry.title, $locale) : undefined}>{#if geometry}<GeometryProperties model={geometry}/>{/if}</PanelSection>{/if}<FormPanel model={{ sections: after || model.after }}/>{#if model.shortcuts}<PanelSection title={t("ui.shortcuts", "Shortcuts", {}, $locale)}><table class="keys"><tbody>{#each model.shortcuts as shortcut}<tr><td>{#each shortcut.keys as key}<Kbd {key} />{/each}</td><td>{caption(shortcut.description, $locale)}</td></tr>{/each}</tbody></table></PanelSection>{/if}
