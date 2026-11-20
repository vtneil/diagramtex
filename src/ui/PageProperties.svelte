<script lang="ts">
  import { t, caption, locale, type Message } from '../i18n';
  import { Button, FormRow, Help, IconButton, NumberField, PanelSection, Segmented, Select, type IconName } from './kit';
  export interface Model {
    paper: string; paperName: string; widthCm: number; heightCm: number; width: number; height: number; rawWidthCm: number; rawHeightCm: number; orient: string;
    mt: number; ml: number; current: number; papers: { key: string; name: string | Message }[];
    pages: { objects: number; thumbnail: string }[];
  }
  let { model }: { model: Model } = $props();
  const icons: Record<string, IconName> = { up: 'moveUp', down: 'moveDown', dup: 'duplicate', ins: 'add', del: 'delete' };
  const round = (n: number) => +n.toFixed(2);
  // each number field's name (and tip): the margin row's two fields each set a pair of sides (mt: top and bottom)
  const fieldName = (key: string, loc: Parameters<typeof t>[3]) => {
    const side = { mt: ['ui.top.bottom', 'Top / bottom'], ml: ['ui.left.right', 'Left / right'] }[key];
    return side ? `${t('ui.margins', 'Margins', {}, loc)}: ${t(side[0], side[1], {}, loc)}` : key === 'w' ? t('ui.width', 'Width', {}, loc) : t('ui.height', 'Height', {}, loc);
  };
</script>
{#snippet number(key: string, value: number)}<NumberField data-pp={key} value={round(value)} step="0.25" min="0" aria-label={fieldName(key, $locale)} title={fieldName(key, $locale)} />{/snippet}
<h3>{t("page.heading", "Page", {}, $locale)} <small>{t("page.sizeSummary", "{paper} · {w} × {h} cm", { paper: model.paperName, w: round(model.widthCm), h: round(model.heightCm) }, $locale)}</small></h3><PanelSection>
  <FormRow label={t("ui.paper", "Paper", {}, $locale)}><Select data-pp="paper" aria-label={t("ui.paper", "Paper", {}, $locale)} value={model.paper} options={model.papers.map((paper) => ({ value: paper.key, label: caption(paper.name, $locale) }))} /></FormRow>
  {#if model.paper === 'custom'}<FormRow label={t("ui.size.cm", "Size (cm)", {}, $locale)}>{@render number('w', model.rawWidthCm)}<span class="x">×</span>{@render number('h', model.rawHeightCm)}</FormRow>{/if}
  <FormRow bare label={t("ui.orientation", "Orientation", {}, $locale)}><Segmented panel class="ctl" label={t("ui.orientation", "Orientation", {}, $locale)} options={[
    { icon: 'portrait', title: t("ui.portrait", "Portrait", {}, $locale), on: model.orient !== 'landscape', attrs: { 'data-ppo': 'portrait' } },
    { icon: 'landscape', title: t("ui.landscape", "Landscape", {}, $locale), on: model.orient === 'landscape', attrs: { 'data-ppo': 'landscape' } }]} /></FormRow>
  <FormRow label={t("ui.margins", "Margins", {}, $locale)}>{@render number('mt', model.mt)}{@render number('ml', model.ml)}</FormRow><Help kind="hint">{t("ui.margins.top.bottom.left.right.cm.are.guides.only.snap.to.them.or.place.things.ri", "Margins (top/bottom · left/right, cm) are guides only: snap to them, or place things right to the edge. Shared with the Document view's page setup.", {}, $locale)}</Help></PanelSection>
<h3>{t("pages.heading", "Pages", {}, $locale)} <small>{model.pages.length > 1 ? t('pages.count', '{n} pages', { n: model.pages.length }, $locale) : t('pages.count1', '{n} page', { n: model.pages.length }, $locale)} · PgUp / PgDn</small></h3><div class="sec pg-list">{#each model.pages as page, k}<div class={'pg-item' + (k === model.current ? ' on' : '')} data-pg="go" data-k={k} title={t('pages.goTo', 'Go to page {n}', { n: k + 1 }, $locale)}><div class="pg-thumb" style={'aspect-ratio:' + model.width + '/' + model.height}>{@html page.thumbnail}</div><div class="pg-meta"><b>{t("pages.number", "Page {n}", { n: k + 1 }, $locale)}</b><span>{page.objects > 1 ? t('pages.objects', '{n} objects', { n: page.objects }, $locale) : page.objects ? t('pages.object1', '1 object', {}, $locale) : t('pages.empty', 'empty', {}, $locale)}</span><div class="pg-acts">{#each [{ key: 'up', at: k, title: t('pages.up', 'Move page up', {}, $locale), disabled: k === 0 }, { key: 'down', at: k, title: t('pages.down', 'Move page down', {}, $locale), disabled: k === model.pages.length - 1 }, { key: 'ins', at: k + 1, title: t('pages.insert', 'Insert a blank page after this one', {}, $locale), disabled: model.pages.length >= 50 }, { key: 'dup', at: k, title: t('pages.duplicate', 'Duplicate this page', {}, $locale), disabled: model.pages.length >= 50 }, { key: 'del', at: k, title: t('pages.delete', 'Delete this page', {}, $locale), disabled: model.pages.length < 2 }] as action}<IconButton variant="default" icon={icons[action.key]} danger={action.key === 'del'} data-pg={action.key} data-k={action.at} title={action.title} disabled={action.disabled} />{/each}</div></div></div>{/each}<Button class="pg-add" data-pg="add" data-k={model.pages.length} title={t("ui.add.a.page.at.the.end", "Add a page at the end", {}, $locale)} disabled={model.pages.length >= 50}>{t("ui.add.page", "+ Add page", {}, $locale)}</Button></div>
