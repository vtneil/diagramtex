<script lang="ts" module>
  import type { SelectOption } from './kit/Select.svelte';
  /** The Document view's frame: the text bar over the page, and the zoom bar. */
  export interface DocumentViewModel {
    bar: {
      /** a text block is being edited: the bar shows (otherwise it keeps its room, hidden) */
      on: boolean;
      head: string; size: string; sizes: SelectOption[]; align: string; source: boolean;
      /** what the caret is in: formats on, the line's kind */
      active: { b: boolean; i: boolean; u: boolean; s: boolean; ul: boolean; ol: boolean; chk: boolean };
      /** drawings: the B I U S x glyphs; the colours the colour and highlight buttons apply (their bars show them) */
      glyphs: { b: string; i: string; u: string; s: string; math: string }; colour: string; highlight: string;
    };
    /** 'fit', '1' (100%) or another zoom; the paper, pages and zoom in words */
    zoom: string; info: string;
  }
</script>
<script lang="ts">
  // The Document view (src/application/docview.ts) around its page: the text formatting bar, pinned over the page,
  // and the zoom bar. The page itself is drawn into .doc-sheet by the controller, which handles every click here by
  // its hook (data-fmt, data-fal, data-fapply, data-fpick, data-zoom).
  import { t, locale } from '../i18n';
  import Toolbar from './kit/Toolbar.svelte';
  import ToolbarGroup from './kit/ToolbarGroup.svelte';
  import IconButton from './kit/IconButton.svelte';
  import SplitButton from './kit/SplitButton.svelte';
  import Segmented from './kit/Segmented.svelte';
  import Select from './kit/Select.svelte';
  import Button from './kit/Button.svelte';
  import { ALIGN_ICON } from './kit/icons';
  let { model: m }: { model: DocumentViewModel } = $props();
  const b = $derived(m.bar);
  const heads = $derived<SelectOption[]>([
    { value: '', label: t('doc.fmt.paragraph', 'Paragraph', {}, $locale) }, { value: '#', label: t('doc.fmt.section', 'Section', {}, $locale) },
    { value: '##', label: t('doc.fmt.subsection', 'Subsection', {}, $locale) }, { value: '###', label: t('doc.fmt.subsubsection', 'Subsubsection', {}, $locale) },
  ]);
  const ALIGN: [string, string][] = [['j', 'justify'], ['l', 'left'], ['c', 'center'], ['r', 'right']];
  const alignTips = $derived<Record<string, string>>({
    j: t('doc.fmt.justify', 'Justified (LaTeX default)', {}, $locale), l: t('doc.fmt.left', 'Align left', {}, $locale),
    c: t('doc.fmt.center', 'Align center', {}, $locale), r: t('doc.fmt.right', 'Align right', {}, $locale),
  });
  const colourName = $derived(t('doc.fmt.colour', 'Text colour — \\textcolor', {}, $locale));
  const highlightName = $derived(t('doc.fmt.highlight', 'Highlight — \\colorbox', {}, $locale));
</script>
<div class={['doc-fmt', !b.on && 'off']} aria-hidden={b.on ? undefined : 'true'}>
  <Toolbar class="tb-bar" label={t('doc.fmt.aria', 'Text formatting', {}, $locale)}>
    <ToolbarGroup>
      <Select data-fmt="head" class="doc-fmt-head" title={t('doc.fmt.style', 'Paragraph style', {}, $locale)} options={heads} value={b.head} />
      <Select data-fmt="size" class="doc-fmt-size" title={t('doc.fmt.size', 'Font size of this block ({cmd})', { cmd: '\\' + b.size }, $locale)} options={b.sizes} value={b.size} />
    </ToolbarGroup>
    <ToolbarGroup>
      <IconButton variant="default" svg={b.glyphs.b} data-fmt="b" on={b.active.b} aria-pressed={b.active.b} title={t('doc.fmt.bold', 'Bold (⌘B) — \\textbf', {}, $locale)} />
      <IconButton variant="default" svg={b.glyphs.i} data-fmt="i" on={b.active.i} aria-pressed={b.active.i} title={t('doc.fmt.italic', 'Italic (⌘I) — \\textit', {}, $locale)} />
      <IconButton variant="default" svg={b.glyphs.u} data-fmt="u" on={b.active.u} aria-pressed={b.active.u} title={t('doc.fmt.underline', 'Underline (⌘U) — \\underline', {}, $locale)} />
      <IconButton variant="default" svg={b.glyphs.s} data-fmt="s" on={b.active.s} aria-pressed={b.active.s} title={t('doc.fmt.strike', 'Strikethrough — \\sout', {}, $locale)} />
    </ToolbarGroup>
    <ToolbarGroup>
      <SplitButton toolbar popup="dialog" icon="textColour" swatch={b.colour} mainClass="tb-col" mainAttrs={{ 'data-fapply': 'color' }} moreAttrs={{ 'data-fpick': 'color' }}
        title={t('ui.colour.applyLast', '{name}: the last colour picked', { name: colourName }, $locale)} moreTitle={t('ui.colour.pick', '{name}: pick a colour', { name: colourName }, $locale)} />
      <SplitButton toolbar popup="dialog" icon="fillColour" swatch={b.highlight} mainClass="tb-col" mainAttrs={{ 'data-fapply': 'hl' }} moreAttrs={{ 'data-fpick': 'hl' }}
        title={t('ui.colour.applyLast', '{name}: the last colour picked', { name: highlightName }, $locale)} moreTitle={t('ui.colour.pick', '{name}: pick a colour', { name: highlightName }, $locale)} />
    </ToolbarGroup>
    <ToolbarGroup>
      <IconButton variant="default" icon="link" data-fmt="link" title={t('doc.fmt.link', 'Link — \\href', {}, $locale)} />
      <IconButton variant="default" svg={b.glyphs.math} data-fmt="math" title={t('doc.fmt.math', 'Inline maths $…$', {}, $locale)} />
    </ToolbarGroup>
    <ToolbarGroup>
      <IconButton variant="default" icon="listBullet" data-fmt="ul" on={b.active.ul} aria-pressed={b.active.ul} title={t('doc.fmt.ul', 'Bulleted list (- item)', {}, $locale)} />
      <IconButton variant="default" icon="listNumber" data-fmt="ol" on={b.active.ol} aria-pressed={b.active.ol} title={t('doc.fmt.ol', 'Numbered list (1. item)', {}, $locale)} />
      <IconButton variant="default" icon="checklist" data-fmt="chk" on={b.active.chk} aria-pressed={b.active.chk} title={t('doc.fmt.chk', 'Checklist (- [ ] item)', {}, $locale)} />
    </ToolbarGroup>
    <Segmented class="seg-align tb-grp tb-seg" label={t('ui.alignment', 'Alignment', {}, $locale)}
      options={ALIGN.map(([k, name]) => ({ icon: ALIGN_ICON[k as 'l'], on: b.align === name, title: alignTips[k], name: alignTips[k], attrs: { 'data-fal': '', 'data-v': k } }))} />
    <ToolbarGroup>
      <IconButton variant="default" icon="source" data-fmt="src" on={b.source} aria-pressed={b.source} title={t('doc.fmt.source', 'Edit the LaTeX source', {}, $locale)} />
    </ToolbarGroup>
  </Toolbar>
</div>
<!-- the page is drawn here by the controller (pageHtml), its controls mounted into it (ui/DocBlockChrome.svelte) -->
<div class="doc-sheet"></div>
<div class="doc-hud">
  <span class="pg-info">{m.info}</span>
  <Button data-zoom="out" title={t('doc.zoom.outTip', 'Zoom out (Ctrl/⌘ −)', {}, $locale)} aria-label={t('doc.zoom.out', 'Zoom out', {}, $locale)}>−</Button>
  <Button data-zoom="in" title={t('doc.zoom.inTip', 'Zoom in (Ctrl/⌘ +)', {}, $locale)} aria-label={t('doc.zoom.in', 'Zoom in', {}, $locale)}>+</Button>
  <Button data-zoom="fit" class={m.zoom === 'fit' ? 'on' : undefined} title={t('doc.zoom.fitTip', "Fit the page's width to the view", {}, $locale)}>{t('ui.fit.width', 'Fit Width', {}, $locale)}</Button>
  <Button data-zoom="1" class={m.zoom === '1' ? 'on' : undefined} title={t('doc.zoom.actualTip', 'Actual size (Ctrl/⌘ 0)', {}, $locale)}>100%</Button>
</div>
