<script lang="ts">
  import { t, caption, message as msg, locale } from '../i18n';
  import { liveValue } from './live-value';
  import type { BlochPanelModel } from './contracts';
  let { model }: { model: BlochPanelModel } = $props();
  const ballOptions = [['3d', msg('f3.shaded', 'Shaded')], ['circle', msg('bloch.outline', 'Outline')], ['none', msg('ui.none', 'None')]] as const;
  let exportedWith = $derived(t('export.with', 'Exported with {pkg}.', {}, $locale).split('{pkg}'));
</script>

<div class="sec"><div class="sec-title">{t("ui.bloch.sphere", "Bloch sphere", {}, $locale)}</div>
  <div class="row"><label for="bloch-radius">{t("ui.radius", "Radius", {}, $locale)}</label><div class="ctl unit"><input type="number" id="bloch-radius" data-bk="radius" {@attach liveValue(model.radius)} step="0.1" min="0.1"><span>{t("ui.cm", "cm", {}, $locale)}</span></div></div>
  <div class="row"><label for="bloch-tilt">{t("ui.tilt", "Tilt", {}, $locale)}</label><div class="ctl"><input type="range" id="bloch-tilt" data-bk="tilt" min="-90" max="90" step="1" {@attach liveValue(model.tilt)} aria-label={t("ui.tilt", "Tilt", {}, $locale)}><label class="ang" title={t("ui.click.to.type.a.value", "Click to type a value", {}, $locale)}><input type="number" data-bkn="tilt" {@attach liveValue(model.tilt)} step="1" aria-label={t("ui.tilt.in.degrees", "Tilt in degrees", {}, $locale)}>°</label></div></div>
  <div class="row"><label for="bloch-rotation">{t("ui.rotation", "Rotation", {}, $locale)}</label><div class="ctl"><input type="range" id="bloch-rotation" data-bk="rotation" min="-180" max="180" step="1" {@attach liveValue(model.rotation)} aria-label={t("ui.rotation", "Rotation", {}, $locale)}><label class="ang" title={t("ui.click.to.type.a.value", "Click to type a value", {}, $locale)}><input type="number" data-bkn="rotation" {@attach liveValue(model.rotation)} step="1" aria-label={t("ui.rotation.in.degrees", "Rotation in degrees", {}, $locale)}>°</label></div></div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing caption labels a group of segments.) --><label id="bloch-ball">{t("ui.ball", "Ball", {}, $locale)}</label><div class="ctl seg-ctl txt" role="group" aria-labelledby="bloch-ball">{#each ballOptions as [value, name]}<button data-act={'ball:' + value} class={model.ball === value ? 'on' : ''}>{caption(name, $locale)}</button>{/each}</div></div>
</div>
<div class="sec"><div class="sec-title">{t("ui.colours", "Colours", {}, $locale)}</div>
  {#each model.colours as colour (colour.key)}<div class="row"><label for={'bloch-colour-' + colour.key}>{caption(colour.name, $locale)}</label><div class="ctl tc"><button id={'bloch-colour-' + colour.key} type="button" class="cbtn" data-tc="" title={t('bloch.colourOf', '{name} colour', { name: caption(colour.name, $locale) }, $locale)}><span style:background={colour.swatch}></span></button><span class="cval">{colour.label}</span><input type="hidden" data-bc={colour.key} {@attach liveValue(colour.value)}></div></div>{/each}
</div>
<div class="sec"><div class="sec-title">{t("ui.states", "States", {}, $locale)}</div>
  {#if model.states.length}<div class="bloch-st"><span>{t("ui.label", "Label", {}, $locale)}</span><span>θ</span><span>φ</span><span></span>{#each model.states as state, i}<input type="text" class="mono" data-sl={i} data-tx="math" {@attach liveValue(state.label)} placeholder={state.name} title={t('bloch.labelTitle', 'Label of {name} (maths, without $)', { name: state.name }, $locale)} spellcheck="false" aria-label={t('bloch.labelOf', 'Label of {name}', { name: state.name }, $locale)}><input type="number" data-st={i + ':t'} {@attach liveValue(state.theta)} step="5" title="θ" aria-label="θ"><input type="number" data-st={i + ':p'} {@attach liveValue(state.phi)} step="5" title="φ" aria-label="φ"><button class="flat st-del" data-act={'delstate:' + i} title={t("ui.delete.state", "Delete state", {}, $locale)} aria-label={t('bloch.deleteState', 'Delete {name}', { name: state.name }, $locale)}><svg viewBox="0 0 20 20"><path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/></svg></button>{/each}</div>{:else}<div class="help">{t("ui.no.states.yet", "No states yet.", {}, $locale)}</div>{/if}
  <button class="wide" data-act="addstate">{t("ui.add.state", "Add State", {}, $locale)}</button></div>
<div class="sec"><div class="sec-title">{t("ui.blochsphere", "blochsphere", {}, $locale)}</div>
  <div class="row col"><textarea class="code" data-p="src" aria-label={t("ui.latex.source", "LaTeX source", {}, $locale)} spellcheck="false" rows="9" {@attach liveValue(model.src)}></textarea></div>
  {#each model.warnings as warning}<div class="err">{caption(warning, $locale)}</div>{/each}
  <div class="help">{exportedWith[0]}<code>\usepackage{'{blochsphere}'}</code>{exportedWith[1]}</div>
  <button class="wide" data-act="copybloch">{t("ui.copy.blochsphere.code", "Copy blochsphere Code", {}, $locale)}</button></div>
