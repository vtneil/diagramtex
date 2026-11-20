<script lang="ts" module>
  import type { SelectOption } from './kit/Select.svelte';
  /** The Table workspace's frame: what its toolbar, cell-text bar, output bar and start screen show. */
  export interface TableWorkspaceModel {
    /** editing a Table block from the diagram: the bar with Cancel and Done shows */
    session: boolean;
    /** nothing imported or typed yet: the start screen covers the workspace */
    fresh: boolean;
    /** the shortcut prefixes of this computer ("⌘", "⇧" on a Mac; "Ctrl+", "Shift+" elsewhere) */
    mod: string; shift: string;
    /** drawings: full <svg> markup or a glyph (fg and bg carry the last colour picked; border the last border) */
    icons: { b: string; i: string; u: string; tt: string; num: string; border: IconName };
    /** the colours the text colour and fill buttons apply (their bars show them) */
    colours: { fg: string; bg: string };
    borderName: string;
    presets: SelectOption[]; preset: string;
    on: { b: boolean; i: boolean; u: boolean; tt: boolean; num: boolean }; align: string;
    can: { undo: boolean; redo: boolean; merge: boolean; split: boolean };
    /** the active cell's name and its text, as the cell-text field shows it */
    ref: string; fx: string;
    tab: 'preview' | 'latex'; dpi: number;
    /** the output button that says Copied for a moment */
    copied: string;
    packages: { text: string; title: string };
  }
</script>
<script lang="ts">
  // The Table workspace (src/ui/services/table.ts) around its grid: the session bar, the toolbar, the cell's text,
  // the output bar and the start screen. The controller draws the grid, the preview and the LaTeX into the empty
  // panes here, and handles clicks by their hooks (data-t, data-o, data-tab, data-ses).
  import { t, locale } from '../i18n';
  import Toolbar from './kit/Toolbar.svelte';
  import ToolbarGroup from './kit/ToolbarGroup.svelte';
  import Button from './kit/Button.svelte';
  import IconButton from './kit/IconButton.svelte';
  import { ALIGN_ICON, type IconName } from './kit/icons';
  import Icon from './kit/Icon.svelte';
  import SplitButton from './kit/SplitButton.svelte';
  import Segmented from './kit/Segmented.svelte';
  import Select from './kit/Select.svelte';
  import TextField from './kit/TextField.svelte';
  import Spacer from './kit/Spacer.svelte';
  let { model: m }: { model: TableWorkspaceModel } = $props();
  const ALIGN = ['l', 'c', 'r', 'j'] as const;
  const alignTips = $derived<Record<string, string>>({ l: t('table.alignLeft', 'Align left', {}, $locale), c: t('ui.centre', 'Centre', {}, $locale), r: t('table.alignRight', 'Align right', {}, $locale), j: t('table.justify', 'Justify (wrapping columns)', {}, $locale) });
  const DPI: SelectOption[] = [150, 300, 600].map((d) => ({ value: String(d), label: `${d} DPI` }));
  const focusSoon = (el: HTMLElement) => { requestAnimationFrame(() => el.focus({ preventScroll: true })); };
</script>
<div class={['tbw', m.session && 'tb-in-block']}>
  {#if m.session}
    <div class="tb-session" role="region" aria-label={t('table.session.aria', 'Editing a table from the diagram', {}, $locale)}>
      <span>{t('table.session.editing', 'Editing a table from the diagram.', {}, $locale)} <b>{t('ui.done', 'Done', {}, $locale)}</b> {t('table.session.back', "puts it back; the Table workspace's own table is left as it was.", {}, $locale)}</span>
      <Spacer />
      <Button data-ses="cancel">{t('ui.cancel', 'Cancel', {}, $locale)}</Button>
      <Button variant="primary" data-ses="done" title={t('table.session.doneTip', 'Put the table back in the diagram ({key} keeps editing)', { key: m.mod + 'S' }, $locale)}>{t('ui.done', 'Done', {}, $locale)}</Button>
    </div>
  {/if}
  <Toolbar label={t('ui.table', 'Table', {}, $locale)} class="tb-bar">
    <ToolbarGroup><Button data-t="import" class="tb-imp" aria-haspopup="menu" title={t('table.importTip', 'Import a table: paste or open CSV, TSV, Excel (.xlsx), Markdown, HTML or LaTeX', {}, $locale)}><Icon name="importFile" />{t('table.import', 'Import', {}, $locale)}</Button></ToolbarGroup>
    <ToolbarGroup>
      <IconButton variant="default" icon="undo" data-t="undo" disabled={!m.can.undo} title={t('table.undoTip', 'Undo ({key})', { key: m.mod + 'Z' }, $locale)} />
      <IconButton variant="default" icon="redo" data-t="redo" disabled={!m.can.redo} title={t('table.redoTip', 'Redo ({key})', { key: m.shift + m.mod + 'Z' }, $locale)} />
    </ToolbarGroup>
    <ToolbarGroup><Select data-t="preset" class="tb-preset" options={m.presets} value={m.preset} aria-label={t('table.style', 'Table style', {}, $locale)} title={t('table.styleTip', 'Table style: rules, stripes and header', {}, $locale)} /></ToolbarGroup>
    <ToolbarGroup>
      <IconButton variant="default" svg={m.icons.b} data-t="b" on={m.on.b} aria-pressed={m.on.b} title={t('table.boldTip', 'Bold ({key})', { key: m.mod + 'B' }, $locale)} />
      <IconButton variant="default" svg={m.icons.i} data-t="i" on={m.on.i} aria-pressed={m.on.i} title={t('table.italicTip', 'Italic ({key})', { key: m.mod + 'I' }, $locale)} />
      <IconButton variant="default" svg={m.icons.u} data-t="u" on={m.on.u} aria-pressed={m.on.u} title={t('table.underlineTip', 'Underline ({key})', { key: m.mod + 'U' }, $locale)} />
      <IconButton variant="default" svg={m.icons.tt} data-t="tt" on={m.on.tt} aria-pressed={m.on.tt} title={t('table.monoTip', 'Monospace (\\texttt)', {}, $locale)} />
    </ToolbarGroup>
    <ToolbarGroup>
      <SplitButton toolbar popup="dialog" icon="textColour" swatch={m.colours.fg} mainClass="tb-col" mainAttrs={{ 'data-t': 'fg' }} moreAttrs={{ 'data-t': 'fgmore' }}
        title={t('ui.colour.applyLast', '{name}: the last colour picked', { name: t('table.textColour', 'Text colour', {}, $locale) }, $locale)} moreTitle={t('ui.colour.pick', '{name}: pick a colour', { name: t('table.textColour', 'Text colour', {}, $locale) }, $locale)} />
      <SplitButton toolbar popup="dialog" icon="fillColour" swatch={m.colours.bg} mainClass="tb-col" mainAttrs={{ 'data-t': 'bg' }} moreAttrs={{ 'data-t': 'bgmore' }}
        title={t('ui.colour.applyLast', '{name}: the last colour picked', { name: t('table.cellFill', 'Cell fill', {}, $locale) }, $locale)} moreTitle={t('ui.colour.pick', '{name}: pick a colour', { name: t('table.cellFill', 'Cell fill', {}, $locale) }, $locale)} />
    </ToolbarGroup>
    <Segmented class="seg-align tb-grp tb-seg" label={t('ui.alignment', 'Alignment', {}, $locale)}
      options={ALIGN.map((a) => ({ icon: ALIGN_ICON[a], on: m.align === a, title: alignTips[a], name: alignTips[a], attrs: { 'data-t': 'al', 'data-v': a } }))} />
    <ToolbarGroup>
      <SplitButton toolbar icon={m.icons.border} mainAttrs={{ 'data-t': 'border' }} moreAttrs={{ 'data-t': 'borders' }}
        title={m.borderName ? t('table.border.last', '{name} (the last one picked)', { name: m.borderName }, $locale) : t('table.bordersLast', 'Borders: the last one picked', {}, $locale)} moreTitle={t('table.borders', 'Borders', {}, $locale)} />
    </ToolbarGroup>
    <ToolbarGroup>
      <IconButton variant="default" icon="mergeCells" data-t="merge" disabled={!m.can.merge} title={t('table.mergeTip', 'Merge cells (\\multicolumn, \\multirow)', {}, $locale)} />
      <IconButton variant="default" icon="splitCells" data-t="split" disabled={!m.can.split} title={t('table.splitTip', 'Split cells', {}, $locale)} />
    </ToolbarGroup>
    <ToolbarGroup>
      <SplitButton toolbar svg={m.icons.num} on={m.on.num} mainAttrs={{ 'data-t': 'num' }} moreAttrs={{ 'data-t': 'numfmt' }}
        title={t('table.numTip', 'Numbers: align on the decimal point (siunitx), round, scientific notation', {}, $locale)} moreTitle={t('table.numFormat', 'Number format: grouping and decimal marker', {}, $locale)} />
    </ToolbarGroup>
  </Toolbar>
  <div class="tb-fx">
    <span class="tb-ref" title={t('table.activeCell', 'The active cell', {}, $locale)}>{m.ref}</span>
    <TextField class="tb-fxin" tx="text" value={m.fx} autocomplete="off" aria-label={t('table.cellTextAria', 'Cell text (LaTeX)', {}, $locale)} placeholder={t('table.cellTextPh', 'Cell text: plain words, $maths$, \\textbf{…}', {}, $locale)} />
  </div>
  <!-- the grid is drawn here by the controller (paint) -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (the cells' region takes the keys: arrows move the selection, typing edits) -->
  <div class="tb-gridwrap" tabindex="0" aria-label={t('table.cells', 'Table cells', {}, $locale)} role="region"><div class="tb-grid"></div><div class="tb-selbox" aria-hidden="true"></div></div>
  <div class="tb-out">
    <div class="tb-outbar">
      <Segmented class="tb-tabs" role="tablist"
        options={[['preview', t('ui.preview', 'Preview', {}, $locale)], ['latex', 'LaTeX']].map(([v, label]) => ({ label, on: m.tab === v, attrs: { role: 'tab', 'aria-checked': undefined as unknown as string, 'aria-selected': String(m.tab === v), 'data-tab': v } }))} />
      <span class="tb-pk" title={m.packages.title || t('table.packagesShort', 'Packages the LaTeX needs', {}, $locale)}>{m.packages.text}</span>
      <Spacer />
      <Button variant="primary" data-o="copy" title={t('table.copyLatexTip', 'Copy the LaTeX ({key})', { key: m.shift + m.mod + 'C' }, $locale)}>{m.copied === 'copy' ? t('ui.copied', 'Copied', {}, $locale) : t('table.copyLatex', 'Copy LaTeX', {}, $locale)}</Button>
      <Button data-o="copy-png" data-render="" title={t('table.copyPngTip', 'Copy the table as a PNG picture', {}, $locale)}>{m.copied === 'copy-png' ? t('ui.copied', 'Copied', {}, $locale) : t('table.copyPng', 'Copy PNG', {}, $locale)}</Button>
      <span class="tb-join" role="group" aria-label={t('ui.download', 'Download', {}, $locale)}>
        <Button data-o="dl-tex" title={t('table.dlTexTip', 'Download the LaTeX: a document that compiles on its own', {}, $locale)}><Icon name="download" />.tex</Button>
        <Button data-o="dl-svg" data-render="" title={t('table.dlSvgTip', 'Download a vector SVG (maths fonts embedded)', {}, $locale)}>SVG</Button>
        <Button data-o="dl-png" data-render="" title={t('table.dlPngTip', 'Download a PNG at the resolution on the right', {}, $locale)}>PNG</Button>
      </span>
      <Select data-o="dpi" options={DPI} value={String(m.dpi)} aria-label={t('table.pngRes', 'PNG resolution', {}, $locale)} title={t('table.pngRes', 'PNG resolution', {}, $locale)} />
      <IconButton variant="default" icon="print" data-o="print" data-render="" aria-label={t('table.print', 'Print', {}, $locale)} title={t('table.printTip', 'Print the table or save it as a PDF ({key})', { key: m.mod + 'P' }, $locale)} />
    </div>
    <!-- the preview and the LaTeX are drawn here by the controller -->
    <div class="tb-prev" data-pane="preview" hidden={m.tab !== 'preview'}></div>
    <div class="tb-code codeview" data-pane="latex" hidden={m.tab !== 'latex'} tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label={t('ui.latex.code', 'LaTeX code', {}, $locale)}></div>
  </div>
  <div class="tb-start" hidden={!m.fresh}>
    {#if m.fresh}
      <div class="tb-drop">
        <div class="tb-drop-t">{t('table.start.title', 'Make a table', {}, $locale)}</div>
        <p>{t('table.start.body', 'Paste cells from Excel or Google Sheets ({key}), drop a file here, or paste CSV, Markdown, HTML or a LaTeX', { key: m.mod + 'V' }, $locale)} <code>tabular</code> {t('table.start.below', 'below.', {}, $locale)}</p>
        <textarea class="tb-paste" spellcheck="false" placeholder={'Name, Mass, Speed\nBall, 0.45, 12.3\n…'} aria-label={t('table.start.pasteAria', 'Table text to import', {}, $locale)} {@attach focusSoon}></textarea>
        <div class="tb-drop-acts">
          <Button data-t="file">{t('ui.choose.file', 'Choose File…', {}, $locale)}</Button>
          <Spacer />
          <Button data-t="blank" title={t('table.start.blankTip', 'An empty 4 × 3 table', {}, $locale)}>{t('table.start.blank', 'Start Empty', {}, $locale)}</Button>
          <Button variant="primary" data-t="import-text">{t('table.import', 'Import', {}, $locale)}</Button>
        </div>
        <p class="tb-drop-foot">CSV, TSV, Excel (.xlsx), Markdown, HTML {t('table.start.and', 'and', {}, $locale)} LaTeX (<code>tabular</code>, <code>tabularx</code>, <code>longtable</code>, booktabs, <code>\multicolumn</code>, <code>\multirow</code>). {t('table.start.local', 'Nothing leaves your browser.', {}, $locale)}</p>
      </div>
    {/if}
  </div>
</div>
