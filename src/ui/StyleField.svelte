<script lang="ts">
  import { t, caption, locale } from '../i18n';
  import { runtime as TD } from '../runtime';
  import { liveValue } from './live-value';
  import { Checkbox, ColourButton, NumberField, Segmented, Select, Slider, TexField, type IconName, type SelectOption, type SelectCustom } from './kit';
  export interface Model {
    type: string; key: string; id: string; label: string; value: string | number; hint?: string;
    sliderDefault?: number; unit?: string; min: string | number; max: string | number; step: string | number;
    options: [string, string][]; checked: boolean; italic: boolean; px: number; range: string | number;
    radioLabel: string; radios: { key: string; label: string; icon: IconName; on: boolean; disabled: boolean }[];
    colour: { none: boolean; nullable: boolean; fills: boolean; label: string; css: string };
    /** the drawn pickers (dash, shaft, arrow tips, width presets): their options, tiles, a typed custom value */
    drawn?: { options: SelectOption[]; columns?: number; custom?: SelectCustom; title: string };
    /** the selected objects differ here: the field shows "Mixed" until a value is chosen for them all */
    mixed?: boolean;
    /** a selected object linked to a named style sets this differently from the style */
    overridden?: boolean;
  }
  let { model }: { model: Model } = $props();
  const grouped = $derived(['bi', 'align', 'valign', 'icons'].includes(model.type));
  const mixedText = $derived(model.mixed ? t('prop.mixed', 'Mixed', {}, $locale) : undefined);
  const fontOf = (value: string) => model.key === 'font' ? TD.FONTS.find((font: string[]) => font[0] === value)?.[2] : undefined;
  const radioAttrs = (key: string) => model.type === 'align' ? { 'data-alignv': key } : model.type === 'valign' ? { 'data-valign': key } : model.type === 'icons' ? { 'data-pk': model.key, 'data-pv': key } : {};
</script>
<div class="row">{#if grouped}<span class="field-label" id={model.id + '-label'}>{caption(model.label, $locale)}{#if model.overridden}<span class="ovr" title={t("style.overridden", "Differs from the style", {}, $locale)}></span>{/if}</span>{:else}<label for={model.id}>{caption(model.label, $locale)}{#if model.overridden}<span class="ovr" title={t("style.overridden", "Differs from the style", {}, $locale)}></span>{/if}</label>{/if}<div class="ctl" role={model.type === 'bi' ? 'group' : undefined} aria-labelledby={model.type === 'bi' ? model.id + '-label' : undefined}>
  {#if model.type === 'textarea'}<textarea id={model.id} data-key={model.key} data-tx="text" placeholder={t("ui.text.math", "Text, $math$", {}, $locale)} {@attach liveValue(model.value)}></textarea>
  {:else if model.type === 'text'}<TexField id={model.id} data-key={model.key} tx={model.key === 'lbl' ? 'math' : 'text'} value={model.value} />
  {:else if model.type === 'number'}<NumberField id={model.id} data-key={model.key} value={model.value} min={model.min} step={model.step} placeholder={mixedText} />{#if model.unit}<span class="val">{model.unit}</span>{/if}
  {:else if model.type === 'range'}<Slider id={model.id} data-key={model.key} defaultValue={model.sliderDefault} min={model.min} max={model.max} step={model.step} value={model.value} readout={String(model.range)} />
  {:else if model.type === 'select' || model.type === 'size'}<Select id={model.id} data-key={model.key} value={model.value} mixed={mixedText} options={model.options.map(([value, label]) => ({ value, label: caption(label, $locale), font: fontOf(value) }))} />{#if model.type === 'size'}<NumberField class="px" data-sizepx="1" min="2" max="200" step="1" value={model.px} title={t("ui.size.in.px.type.a.value.and.press.enter", "Size in px — type a value and press Enter", {}, $locale)} />{/if}
  {:else if model.type === 'bi'}<Checkbox data-key="bold" checked={model.checked}><b>{t("ui.bold", "Bold", {}, $locale)}</b></Checkbox><Checkbox data-key="italic" checked={model.italic}><i>{t("ui.italic", "Italic", {}, $locale)}</i></Checkbox>
  {:else if model.type === 'checkbox'}<Checkbox id={model.id} data-key={model.key} checked={model.checked} />
  {:else if model.type === 'align' || model.type === 'valign' || model.type === 'icons'}<Segmented panel class={model.type === 'icons' ? 'fill' : model.type === 'align' ? 'seg-align' : undefined} label={caption(model.radioLabel, $locale)}
      options={model.radios.map((radio) => ({ icon: radio.icon, title: caption(radio.label, $locale), on: radio.on, disabled: radio.disabled, attrs: radioAttrs(radio.key) }))} />
  {:else if model.type === 'color'}<ColourButton id={model.id} css={model.colour.css} none={model.colour.none} data-color={model.key} data-nullable={model.colour.nullable ? '1' : undefined} data-fills={model.colour.fills ? '1' : undefined} title={caption(model.colour.label, $locale)} label={caption(model.colour.label, $locale)} />
  {:else if model.type === 'width'}<NumberField id={model.id} data-key={model.key} value={model.value} min="0.25" step="0.25" placeholder={mixedText} /><Select attached data-key={model.key} title={t("ui.line.width.presets", "Line width presets", {}, $locale)} value={String(model.value)} options={model.drawn?.options ?? []} /><span class="val">{t("ui.px", "px", {}, $locale)}</span>
  {:else if model.drawn}<Select id={model.id} data-key={model.key} title={caption(model.drawn.title, $locale)} value={String(model.value)} mixed={mixedText} options={model.drawn.options} columns={model.drawn.columns} custom={model.drawn.custom} />{/if}
</div></div>{#if model.hint}<div class="hint">{caption(model.hint, $locale)}</div>{/if}
