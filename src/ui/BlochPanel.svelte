<script lang="ts">
  import { t, caption, message as msg, locale } from '../i18n';
  import { liveValue } from './live-value';
  import { Button, ColourButton, FormRow, Help, IconButton, NumberField, PanelSection, Segmented, Slider, TextArea, TexField } from './kit';
  import type { BlochPanelModel } from './contracts';
  let { model }: { model: BlochPanelModel } = $props();
  const ballOptions = [['3d', msg('f3.shaded', 'Shaded')], ['circle', msg('bloch.outline', 'Outline')], ['none', msg('ui.none', 'None')]] as const;
  let exportedWith = $derived(t('export.with', 'Exported with {pkg}.', {}, $locale).split('{pkg}'));
</script>

<PanelSection title={t("ui.bloch.sphere", "Bloch sphere", {}, $locale)}>
  <FormRow label={t("ui.radius", "Radius", {}, $locale)} for="bloch-radius" unit><NumberField id="bloch-radius" data-bk="radius" value={model.radius} step="0.1" min="0.1" /><span>{t("ui.cm", "cm", {}, $locale)}</span></FormRow>
  <FormRow label={t("ui.tilt", "Tilt", {}, $locale)} for="bloch-tilt"><Slider defaultValue={15} id="bloch-tilt" data-bk="tilt" min="-90" max="90" step="1" value={model.tilt} readout={model.tilt + '°'} aria-label={t("ui.tilt", "Tilt", {}, $locale)} /></FormRow>
  <FormRow label={t("ui.rotation", "Rotation", {}, $locale)} for="bloch-rotation"><Slider defaultValue={-20} id="bloch-rotation" data-bk="rotation" min="-180" max="180" step="1" value={model.rotation} readout={model.rotation + '°'} aria-label={t("ui.rotation", "Rotation", {}, $locale)} /></FormRow>
  <FormRow bare label={t("ui.ball", "Ball", {}, $locale)} labelId="bloch-ball"><Segmented panel class="ctl txt" aria-labelledby="bloch-ball" options={ballOptions.map(([value, name]) => ({ label: caption(name, $locale), on: model.ball === value, attrs: { 'data-act': 'ball:' + value } }))} /></FormRow>
</PanelSection>
<PanelSection title={t("ui.colours", "Colours", {}, $locale)}>
  {#each model.colours as colour (colour.key)}<FormRow label={caption(colour.name, $locale)} for={'bloch-colour-' + colour.key} ctlClass="tc"><ColourButton id={'bloch-colour-' + colour.key} css={colour.swatch} data-tc="" title={t('bloch.colourOf', '{name} colour', { name: caption(colour.name, $locale) }, $locale)} label={colour.label} /><input type="hidden" data-bc={colour.key} {@attach liveValue(colour.value)}></FormRow>{/each}
</PanelSection>
<PanelSection title={t("ui.states", "States", {}, $locale)}>
  {#if model.states.length}<div class="bloch-st"><span>{t("ui.label", "Label", {}, $locale)}</span><span>θ</span><span>φ</span><span></span>{#each model.states as state, i}<TexField tx="math" class="mono" data-sl={i} value={state.label} placeholder={state.name} title={t('bloch.labelTitle', 'Label of {name} (maths, without $)', { name: state.name }, $locale)} aria-label={t('bloch.labelOf', 'Label of {name}', { name: state.name }, $locale)} /><NumberField data-st={i + ':t'} value={state.theta} step="5" title="θ" aria-label="θ" /><NumberField data-st={i + ':p'} value={state.phi} step="5" title="φ" aria-label="φ" /><IconButton icon="delete" danger class="st-del" data-act={'delstate:' + i} title={t("ui.delete.state", "Delete state", {}, $locale)} aria-label={t('bloch.deleteState', 'Delete {name}', { name: state.name }, $locale)} />{/each}</div>{:else}<Help>{t("ui.no.states.yet", "No states yet.", {}, $locale)}</Help>{/if}
  <Button class="wide" data-act="addstate">{t("ui.add.state", "Add State", {}, $locale)}</Button></PanelSection>
<PanelSection title={t("ui.blochsphere", "blochsphere", {}, $locale)}>
  <FormRow column><TextArea code data-p="src" aria-label={t("ui.latex.source", "LaTeX source", {}, $locale)} rows={9} value={model.src} /></FormRow>
  {#each model.warnings as warning}<Help kind="error">{caption(warning, $locale)}</Help>{/each}
  <Help>{exportedWith[0]}<code>\usepackage{'{blochsphere}'}</code>{exportedWith[1]}</Help>
  <Button class="wide" data-act="copybloch">{t("ui.copy.blochsphere.code", "Copy blochsphere Code", {}, $locale)}</Button></PanelSection>
