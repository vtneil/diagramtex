<script lang="ts">
  import { t, caption, message as msg, locale } from '../i18n';
  import { Button, Checkbox, FormRow, Help, NumberField, PanelSection, Segmented, Select } from './kit';
  export interface Model {
    page: { paper: string; orient: string; w: number; h: number; W: number; H: number; mt: number; mb: number; ml: number; mr: number; textW: number; font: number; title: boolean; spread: number; numbered: boolean };
    papers: { key: string; name: string }[]; wide: number;
  }
  let { model }: { model: Model } = $props();
  let page = $derived(model.page);
  const round = (value: number) => +(+value).toFixed(2);
  let exportedWith = $derived(t('export.with', 'Exported with {pkg}.', {}, $locale).split('{pkg}'));
</script>
{#snippet number(key: string, value: number)}<NumberField data-pg={key} value={round(value)} step="0.1" min="0" />{/snippet}
<h3>{t("ui.page.setup", "Page setup", {}, $locale)}</h3><PanelSection>
  <FormRow label={t("ui.paper", "Paper", {}, $locale)}><Select data-pg="paper" value={page.paper} options={model.papers.map((paper) => ({ value: paper.key, label: caption(paper.name, $locale) }))} /></FormRow>
  <FormRow bare label={t("ui.orientation", "Orientation", {}, $locale)}><Segmented panel class="ctl" label={t("ui.orientation", "Orientation", {}, $locale)} options={[
    { icon: 'portrait', title: t("ui.portrait", "Portrait", {}, $locale), on: page.orient !== 'landscape', attrs: { 'data-pgo': 'portrait' } },
    { icon: 'landscape', title: t("ui.landscape", "Landscape", {}, $locale), on: page.orient === 'landscape', attrs: { 'data-pgo': 'landscape' } }]} /></FormRow>
  <FormRow label={t("ui.size.cm", "Size (cm)", {}, $locale)}>{#if page.paper === 'custom'}{@render number('w', page.w)}<span class="x">×</span>{@render number('h', page.h)}{:else}<span class="ro">{round(page.W)} × {round(page.H)}</span>{/if}</FormRow></PanelSection>
<PanelSection title={t("ui.margins.cm", "Margins (cm)", {}, $locale)}><FormRow label={t("ui.top.bottom", "Top / bottom", {}, $locale)}>{@render number('mt', page.mt)}{@render number('mb', page.mb)}</FormRow><FormRow label={t("ui.left.right", "Left / right", {}, $locale)}>{@render number('ml', page.ml)}{@render number('mr', page.mr)}</FormRow><div class="row presets">{#each [[msg('page.narrow', 'Narrow'), 1.27], [msg('ui.normal', 'Normal'), 2.5], [msg('page.wide', 'Wide'), 3.5]] as const as [name, value]}<Button data-pgm={value} title={t('page.allSides', '{value} cm on all sides', { value }, $locale)}>{caption(name, $locale)}</Button>{/each}</div><Help kind="hint">{t("page.textWidth", "Text width {w} cm", { w: round(page.textW) }, $locale)}{#if model.wide} · <b>{model.wide > 1 ? t("page.wideMany", "{n} diagrams are wider and will be scaled down", { n: model.wide }, $locale) : t("page.wideOne", "1 diagram is wider and will be scaled down", {}, $locale)}</b>{/if}</Help></PanelSection>
<PanelSection title={t("ui.text", "Text", {}, $locale)}>
  <FormRow label={t("ui.font.size", "Font size", {}, $locale)}><Select data-pg="font" value={String(+page.font)} options={[10, 11, 12].map((n) => ({ value: String(n), label: t("page.fontPt", "{n} pt", { n }, $locale) }))} /></FormRow>
  <FormRow label={t("ui.title", "Title", {}, $locale)}><Checkbox data-pg="title" checked={page.title}>{t("ui.show.document.name.as.title.variant1", " Show document name as title", {}, $locale)}</Checkbox></FormRow>
  <FormRow label={t("ui.line.spacing", "Line spacing", {}, $locale)}><Select data-pg="spread" value={String(+page.spread || 1)} options={([[1, msg('page.single', 'Single')], [1.15, '1.15'], [1.3, msg('page.oneHalf', 'One and a half')], [1.6, msg('page.double', 'Double')]] as const).map(([value, name]) => ({ value: String(value), label: caption(name, $locale) }))} /></FormRow>
  <FormRow label={t("ui.sections", "Sections", {}, $locale)}><Checkbox data-pg="numbered" checked={page.numbered}>{t("ui.number.headings.1.1.1.1.1.1.variant1", " Number headings (1, 1.1, 1.1.1)", {}, $locale)}</Checkbox></FormRow></PanelSection>
<PanelSection><Help>{exportedWith[0]}<code>\usepackage&#123;geometry&#125;</code>{exportedWith[1]} {t("page.printSameSize", "Print uses the same page size.", {}, $locale)}</Help></PanelSection>
