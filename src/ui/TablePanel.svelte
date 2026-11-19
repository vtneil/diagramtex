<script lang="ts" module>
  import type { SelectOption } from './kit/Select.svelte';
  /** A column's siunitx settings (Align decimals on). */
  export interface TableNumModel {
    round: 'none' | 'sig' | 'dp'; prec: number | null;
    group: string; groupMin: number; groupFrac: boolean;
    dec: string; exp: string; prod: string; unc: string; plus: boolean; pos: string;
  }
  /** The Table's settings in the right panel: the table's, the active column's, the cell's and the LaTeX's. */
  export interface TablePanelModel {
    rows: number; cols: number;
    presets: SelectOption[]; preset: string;
    head: number; headBold: boolean; booktabs: boolean;
    /** stripe and stripe2: '' is none */
    striped: boolean; stripe: string; stripe2: string;
    /** null: the setting is not offered */
    autoMath: boolean | null;
    col: { name: string; al: string; w: number; fill: boolean | null; unit: string; num: TableNumModel | null };
    cell: { name: string; va: string; sz: string; fg: string; bg: string };
    latex: {
      /** a Table block from the diagram: a tabular in a node, so no caption, label or float */
      session: boolean;
      caption: string; label: string; float: 'long' | 'forced' | 'on' | 'off'; place: string;
      env: string; width: number; foot: number | null; footMax: number; floatPos: string; capTop: boolean;
      size: string; pad: number; stretch: number; ruleW: number; ruleColor: string; unitStyle: string;
    };
    /** More options is open */
    more: boolean;
  }
</script>
<script lang="ts">
  // The Table workspace's right panel (#props), drawn from src/ui/services/table.ts. The controller handles its
  // fields by their hooks: data-p on a field (change and input), data-seg and data-v on a switch, data-color on a
  // colour. Re-drawn in place after every change, so a field being typed in keeps its text and caret.
  import { t, locale } from '../i18n';
  import type { IconName } from './kit/icons';
  import PanelSection from './kit/PanelSection.svelte';
  import FormRow from './kit/FormRow.svelte';
  import Select from './kit/Select.svelte';
  import NumberField from './kit/NumberField.svelte';
  import TextField from './kit/TextField.svelte';
  import Checkbox from './kit/Checkbox.svelte';
  import Segmented from './kit/Segmented.svelte';
  import ColourButton from './kit/ColourButton.svelte';
  import Help from './kit/Help.svelte';
  import Kbd from './kit/Kbd.svelte';
  let { model: m }: { model: TablePanelModel } = $props();
  /** a switch's options: [value, label, tooltip?, drawing?] */
  const opts = (cur: string, list: [string, string, string?, IconName?][]) => list.map(([v, label, title, icon]) => ({ label: icon ? undefined : label, icon, name: icon ? title : undefined, title, on: v === cur, attrs: { 'data-v': v } }));
  const sizes = $derived<SelectOption[]>([['tiny', t('table.size.tiny', 'Tiny', {}, $locale)], ['scriptsize', t('table.size.script', 'Script', {}, $locale)], ['footnotesize', t('table.size.footnote', 'Footnote', {}, $locale)], ['small', t('table.size.small', 'Small', {}, $locale)], ['normalsize', t('ui.normal', 'Normal', {}, $locale)], ['large', t('table.size.large', 'Large', {}, $locale)], ['Large', t('table.size.larger', 'Larger', {}, $locale)]].map(([value, label]) => ({ value, label })));
  const groups = $derived<SelectOption[]>([['thin', t('table.group.thin', 'Thin space: 12 345', {}, $locale)], ['comma', t('table.group.comma', 'Comma: 1,234', {}, $locale)], ['point', t('table.group.point', 'Point: 1.234', {}, $locale)], ['space', t('table.group.space', 'Space: 12 345', {}, $locale)], ['none', t('table.group.none', 'None: 12345', {}, $locale)]].map(([value, label]) => ({ value, label })));
  const n = $derived(m.col.num);
  const L = $derived(m.latex);
</script>
<h3>{t('ui.table', 'Table', {}, $locale)} <small>{m.rows} × {m.cols}</small></h3>
<PanelSection>
  <FormRow label={t('ui.style', 'Style', {}, $locale)}><Select data-p="preset" aria-label={t('table.style', 'Table style', {}, $locale)} options={m.presets} value={m.preset} /></FormRow>
  <FormRow label={t('table.headerRowsLabel', 'Header rows', {}, $locale)}>
    <NumberField data-p="head" min="0" max={m.rows} step="1" value={m.head} aria-label={t('table.headerRowsLabel', 'Header rows', {}, $locale)} />
    <Checkbox data-p="headBold" checked={m.headBold} title={t('table.headBoldTip', 'The header rows in bold', {}, $locale)}>{t('ui.bold', 'Bold', {}, $locale)}</Checkbox>
  </FormRow>
  <FormRow label={t('table.rules', 'Rules', {}, $locale)}>
    <Segmented panel data-seg="booktabs" label={t('table.rules', 'Rules', {}, $locale)} options={opts(m.booktabs ? '1' : '0', [['1', 'booktabs', t('table.rules.booktabsTip', 'Rules of different weights, with space round them (\\toprule, \\midrule, \\bottomrule)', {}, $locale)], ['0', t('table.rules.lines', 'Lines', {}, $locale), t('table.rules.linesTip', '\\hline and \\cline: thin lines, no extra space', {}, $locale)]])} />
  </FormRow>
  <FormRow label={t('table.stripes', 'Stripes', {}, $locale)}>
    <Checkbox data-p="striped" checked={m.striped}>{t('table.everyOtherRow', 'Every other row', {}, $locale)}</Checkbox>
    {#if m.striped}<ColourButton class="tb-bare" data-color="stripe" css={m.stripe || 'transparent'} none={!m.stripe} title={m.stripe || t('ui.none', 'None', {}, $locale)} aria-label={t('table.stripeColour', 'Stripe colour', {}, $locale)} />{/if}
  </FormRow>
  {#if m.striped}
    <FormRow label={t('table.otherRows', 'Other rows', {}, $locale)} title={t('table.otherRowsTip', "The rows between the stripes (\\rowcolors' other colour)", {}, $locale)}>
      <ColourButton data-color="stripe2" css={m.stripe2 || 'transparent'} none={!m.stripe2} title={m.stripe2 || t('ui.none', 'None', {}, $locale)} aria-label={t('table.otherRows', 'Other rows', {}, $locale)} label={m.stripe2 ? m.stripe2.toUpperCase() : t('ui.none', 'None', {}, $locale)} />
    </FormRow>
  {/if}
  {#if m.autoMath !== null}
    <FormRow label={t('table.numbersAsMaths', 'Numbers', {}, $locale)}>
      <Checkbox data-p="autoMath" checked={m.autoMath} title={t('table.autoMathTip', 'Numbers you type, paste or import become maths: 1,955.98 mm → $1{,}955.98$ mm. {key} after a change takes it off; columns with Align decimals keep theirs bare.', { key: 'Ctrl+Z' }, $locale)}>{t('table.autoMath', 'Typeset as maths ($…$)', {}, $locale)}</Checkbox>
    </FormRow>
  {/if}
</PanelSection>
<PanelSection title={t('table.columnTitle', 'Column {name}', { name: m.col.name }, $locale)}>
  <FormRow label={t('ui.align', 'Align', {}, $locale)}>
    <Segmented class="seg-align" data-seg="colAl" label={t('ui.alignment', 'Alignment', {}, $locale)} options={opts(m.col.al, [['l', '', t('table.alignLeft', 'Align left', {}, $locale), 'alignLeft'], ['c', '', t('ui.centre', 'Centre', {}, $locale), 'alignCentre'], ['r', '', t('table.alignRight', 'Align right', {}, $locale), 'alignRight'], ['j', '', t('table.justify', 'Justify (wrapping columns)', {}, $locale), 'alignJustify']])} />
  </FormRow>
  <FormRow label={t('ui.width', 'Width', {}, $locale)}>
    <NumberField data-p="w" min="0" step="0.1" value={m.col.w || ''} placeholder={t('ui.auto', 'Auto', {}, $locale)} aria-label={t('table.colWidthAria', 'Column width (cm)', {}, $locale)} title={t('table.colWidthTip', 'A width in cm makes the column wrap (p{…}); empty: as wide as its text', {}, $locale)} /><span class="tb-unit">cm</span>
    {#if m.col.fill !== null}<Checkbox data-p="fill" checked={m.col.fill} title={t('table.colFillTip', 'The column takes the rest of the line (X)', {}, $locale)}>{t('table.fill', 'Fill', {}, $locale)}</Checkbox>{/if}
  </FormRow>
  <FormRow label={t('table.numbers', 'Numbers', {}, $locale)}>
    <Checkbox data-p="num" checked={!!n} title={t('table.numbersTip', 'Numbers align on the decimal point in a siunitx S column', {}, $locale)}>{t('table.alignDecimals', 'Align decimals', {}, $locale)}</Checkbox>
  </FormRow>
  {#if n}
    <div class="tb-sub">
      <FormRow label={t('table.round', 'Round', {}, $locale)}>
        <Select data-p="round" aria-label={t('table.rounding', 'Rounding', {}, $locale)} value={n.round} options={[{ value: 'none', label: t('table.asTyped', 'As typed', {}, $locale) }, { value: 'sig', label: t('table.sigFigs', 'Significant figures', {}, $locale) }, { value: 'dp', label: t('table.decimals', 'Decimal places', {}, $locale) }]} />
        {#if n.round !== 'none'}<NumberField class="tb-n" data-p="prec" min={n.round === 'sig' ? 1 : 0} max="15" step="1" value={n.prec} aria-label={n.round === 'sig' ? t('table.sigFigs', 'Significant figures', {}, $locale) : t('table.decimals', 'Decimal places', {}, $locale)} />{/if}
      </FormRow>
      <FormRow label={t('table.group', 'Group', {}, $locale)}><Select data-p="group" aria-label={t('table.groupThousands', 'Group Thousands', {}, $locale)} title={t('table.groupTip', 'Digits in threes (group-separator)', {}, $locale)} options={groups} value={n.group} /></FormRow>
      {#if n.group !== 'none'}
        <FormRow label={t('table.groupFrom', 'From', {}, $locale)}>
          <NumberField class="tb-n" data-p="groupMin" min="1" max="9" step="1" value={n.groupMin} aria-label={t('table.groupFromAria', 'Group from this many digits', {}, $locale)} title={t('table.groupFromTip', 'group-minimum-digits: a part with fewer digits is left whole', {}, $locale)} /><span class="tb-unit">{t('table.digits', 'digits', {}, $locale)}</span>
          <Checkbox data-p="groupFrac" checked={n.groupFrac} title={t('table.groupFracTip', 'Group the decimals too (group-digits=all)', {}, $locale)}>{t('table.decimalsToo', 'Decimals', {}, $locale)}</Checkbox>
        </FormRow>
      {/if}
      <FormRow label={t('table.marker', 'Marker', {}, $locale)}><Segmented panel data-seg="dec" label={t('table.marker', 'Marker', {}, $locale)} options={opts(n.dec, [['.', '1.5', t('table.dec.pointTip', 'Decimal point', {}, $locale)], [',', '1,5', t('table.dec.commaTip', 'Decimal comma (output-decimal-marker)', {}, $locale)]])} /></FormRow>
      <FormRow label={t('table.exponent', 'Exponent', {}, $locale)}><Select data-p="exp" aria-label={t('table.exponent', 'Exponent', {}, $locale)} value={n.exp} options={[{ value: 'input', label: t('table.asTyped', 'As typed', {}, $locale) }, { value: 'sci', label: t('table.scientific', 'Scientific (× 10ⁿ)', {}, $locale) }, { value: 'eng', label: t('table.engineering', 'Engineering (× 10³ⁿ)', {}, $locale) }, { value: 'fixed', label: t('table.never', 'Never', {}, $locale) }]} /></FormRow>
      <FormRow label={t('table.product', 'Product', {}, $locale)}><Segmented panel data-seg="prod" label={t('table.product', 'Product', {}, $locale)} options={opts(n.prod, [['times', '× 10³', t('table.prod.timesTip', 'Times sign (exponent-product)', {}, $locale)], ['cdot', '· 10³', t('table.prod.cdotTip', 'Centred dot (exponent-product=\\cdot)', {}, $locale)]])} /></FormRow>
      <FormRow label={t('table.uncertainty', 'Uncertainty', {}, $locale)}><Segmented panel data-seg="unc" label={t('table.uncertainty', 'Uncertainty', {}, $locale)} options={opts(n.unc, [['paren', '1.23(4)'], ['pm', '1.23 ± 0.04']])} /></FormRow>
      <FormRow label={t('table.sign', 'Sign', {}, $locale)}><Checkbox data-p="plus" checked={n.plus} title={t('table.plusTip', 'print-implicit-plus: +12.5', {}, $locale)}>{t('table.plus', '+ on positive numbers', {}, $locale)}</Checkbox></FormRow>
      <FormRow label={t('table.position', 'Position', {}, $locale)}><Segmented panel data-seg="pos" label={t('table.position', 'Position', {}, $locale)} options={opts(n.pos, [['l', '', t('table.pos.left', 'Numbers on the left (table-number-alignment)', {}, $locale), 'alignLeft'], ['c', '', t('table.pos.centre', 'Numbers centred', {}, $locale), 'alignCentre'], ['r', '', t('table.pos.right', 'Numbers on the right', {}, $locale), 'alignRight']])} /></FormRow>
    </div>
  {/if}
  <FormRow label={t('table.unit', 'Unit', {}, $locale)}><TextField data-p="unit" value={m.col.unit} placeholder={'kg, m/s, \\kilo\\gram'} aria-label={t('table.unit', 'Unit', {}, $locale)} title={t('table.unitTip', 'siunitx unit, shown after the header text: Mass (kg)', {}, $locale)} /></FormRow>
</PanelSection>
<PanelSection title={t('table.cellTitle', 'Cell {name}', { name: m.cell.name }, $locale)}>
  <FormRow label={t('ui.vertical', 'Vertical', {}, $locale)}><Segmented panel data-seg="va" label={t('ui.vertical', 'Vertical', {}, $locale)} options={opts(m.cell.va, [['t', '', t('ui.top', 'Top', {}, $locale), 'valignTop'], ['m', '', t('table.middle', 'Middle', {}, $locale), 'valignMiddle'], ['b', '', t('ui.bottom', 'Bottom', {}, $locale), 'valignBottom']])} /></FormRow>
  <FormRow label={t('ui.size', 'Size', {}, $locale)}><Select data-p="sz" aria-label={t('table.textSize', 'Text size', {}, $locale)} value={m.cell.sz} options={[{ value: '', label: t('table.asTable', 'As the table', {}, $locale) }, ...sizes]} /></FormRow>
  <FormRow label={t('ui.text', 'Text', {}, $locale)}><ColourButton data-color="fg" css={m.cell.fg || 'transparent'} none={!m.cell.fg} title={m.cell.fg || t('table.automatic', 'Automatic', {}, $locale)} aria-label={t('table.textColour', 'Text colour', {}, $locale)} label={m.cell.fg ? m.cell.fg.toUpperCase() : t('table.automatic', 'Automatic', {}, $locale)} /></FormRow>
  <FormRow label={t('ui.fill', 'Fill', {}, $locale)}><ColourButton data-color="bg" css={m.cell.bg || 'transparent'} none={!m.cell.bg} title={m.cell.bg || t('ui.none', 'None', {}, $locale)} aria-label={t('table.cellFill', 'Cell fill', {}, $locale)} label={m.cell.bg ? m.cell.bg.toUpperCase() : t('ui.none', 'None', {}, $locale)} /></FormRow>
</PanelSection>
<PanelSection title="LaTeX">
  {#if L.session}
    <Help kind="hint">{t('table.inDiagram', 'In the diagram the table is a tabular in a node: no caption, label or float.', {}, $locale)}</Help>
  {:else}
    <FormRow label={t('table.caption', 'Caption', {}, $locale)}><TextField data-p="caption" tx="text" value={L.caption} placeholder={t('ui.none', 'None', {}, $locale)} aria-label={t('table.caption', 'Caption', {}, $locale)} /></FormRow>
    <FormRow label={t('ui.label', 'Label', {}, $locale)}><TextField data-p="label" value={L.label} placeholder="tab:results" aria-label={t('ui.label', 'Label', {}, $locale)} /></FormRow>
    <FormRow label={t('table.float', 'Float', {}, $locale)}>
      {#if L.float === 'long'}<span class="tb-unit">{t('table.longtableNoFloat', 'longtable: over pages, no float', {}, $locale)}</span>
      {:else if L.float === 'forced'}<Checkbox checked disabled title={t('table.floatForced', 'A caption or label always puts the table in a table environment', {}, $locale)}>{t('table.tableEnv', 'table environment', {}, $locale)}</Checkbox>
      {:else}<Checkbox data-p="float" checked={L.float === 'on'} title={t('table.floatTip', 'In a table environment, placed by LaTeX (h t b p)', {}, $locale)}>{t('table.tableEnv', 'table environment', {}, $locale)}</Checkbox>{/if}
    </FormRow>
    <FormRow label={t('table.place', 'Place', {}, $locale)}><Segmented panel data-seg="place" label={t('table.place', 'Place', {}, $locale)} options={opts(L.place, [['left', '', t('ui.left', 'Left', {}, $locale), 'alignLeft'], ['center', '', t('ui.centre', 'Centre', {}, $locale), 'alignCentre'], ['right', '', t('ui.right', 'Right', {}, $locale), 'alignRight']])} /></FormRow>
  {/if}
  <details class="tb-more-sec" open={m.more}>
    <summary>{t('table.moreOptions', 'More options', {}, $locale)}</summary>
    <FormRow label={t('table.environment', 'Environment', {}, $locale)}><Select data-p="env" aria-label={t('table.environment', 'Environment', {}, $locale)} value={L.env} options={[{ value: 'tabular', label: 'tabular' }, { value: 'tabularx', label: t('table.env.tabularx', 'tabularx (full width)', {}, $locale) }, ...(L.session ? [] : [{ value: 'longtable', label: t('table.env.longtable', 'longtable (over pages)', {}, $locale) }])]} /></FormRow>
    {#if L.env === 'tabularx'}
      <FormRow label={t('ui.width', 'Width', {}, $locale)}><NumberField data-p="width" min="10" max="100" step="5" value={Math.round(L.width * 100)} aria-label={t('ui.width', 'Width', {}, $locale)} /><span class="tb-unit">{t('table.ofLine', '% of the line', {}, $locale)}</span></FormRow>
    {/if}
    {#if L.foot !== null}
      <FormRow label={t('table.footerRows', 'Footer rows', {}, $locale)} title={t('table.footerTip', 'The bottom rows: written once, at the end of the table (\\endlastfoot); the other pages end with the rule above them', {}, $locale)}>
        <NumberField data-p="foot" min="0" max={L.footMax} step="1" value={L.foot} aria-label={t('table.footerRows', 'Footer rows', {}, $locale)} />
      </FormRow>
    {/if}
    {#if L.env !== 'longtable' && !L.session}
      <FormRow label={t('table.placement', 'Placement', {}, $locale)}><TextField data-p="floatPos" value={L.floatPos} placeholder="htbp" maxlength={5} aria-label={t('table.floatPlacement', 'Float placement', {}, $locale)} title={t('table.placementTip', 'Where LaTeX may put the table: h here, t top, b bottom, p own page, ! try harder, H exactly here (float package)', {}, $locale)} /></FormRow>
    {/if}
    {#if !L.session}
      <FormRow label={t('table.captionAt', 'Caption at', {}, $locale)}><Segmented panel data-seg="capTop" label={t('table.captionAt', 'Caption at', {}, $locale)} options={opts(L.capTop ? '1' : '0', [['1', t('ui.top', 'Top', {}, $locale)], ['0', t('ui.bottom', 'Bottom', {}, $locale)]])} /></FormRow>
    {/if}
    <FormRow label={t('ui.font.size', 'Font size', {}, $locale)}><Select data-p="size" aria-label={t('ui.font.size', 'Font size', {}, $locale)} value={L.size} options={sizes} /></FormRow>
    <FormRow label={t('table.padding', 'Padding', {}, $locale)}><NumberField data-p="pad" min="0" max="30" step="0.5" value={L.pad} aria-label={t('table.paddingAria', 'Cell padding (pt)', {}, $locale)} title={t('table.paddingTip', '\\tabcolsep: the space on each side of a column', {}, $locale)} /><span class="tb-unit">pt</span></FormRow>
    <FormRow label={t('table.rowHeight', 'Row height', {}, $locale)}><NumberField data-p="stretch" min="0.5" max="4" step="0.05" value={L.stretch} aria-label={t('table.rowHeight', 'Row height', {}, $locale)} title={t('table.rowHeightTip', "\\arraystretch: 1 is LaTeX's own", {}, $locale)} /><span class="tb-unit">×</span></FormRow>
    <FormRow label={t('table.ruleWidth', 'Rule width', {}, $locale)}>
      <NumberField data-p="ruleW" min="0.1" max="5" step="0.1" value={L.ruleW} aria-label={t('table.ruleWidthAria', 'Rule width (pt)', {}, $locale)} title={t('table.ruleWidthTip', "\\arrayrulewidth: thin rules and | (LaTeX's 0.4 pt)", {}, $locale)} /><span class="tb-unit">pt</span>
      <ColourButton class="tb-bare" data-color="ruleColor" css={L.ruleColor || '#000'} title={`\\arrayrulecolor: ${L.ruleColor || 'black'}`} aria-label={t('table.ruleColour', 'Rule colour', {}, $locale)} />
    </FormRow>
    <FormRow label={t('table.unitsAs', 'Units as', {}, $locale)}><Select data-p="unitStyle" aria-label={t('table.unitsAsAria', 'How units follow the header', {}, $locale)} value={L.unitStyle} options={[{ value: 'paren', label: t('table.units.paren', 'Mass (kg)', {}, $locale) }, { value: 'bracket', label: t('table.units.bracket', 'Mass [kg]', {}, $locale) }, { value: 'slash', label: t('table.units.slash', 'Mass / kg', {}, $locale) }]} /></FormRow>
  </details>
</PanelSection>
<PanelSection title={t('table.keys', 'Keys', {}, $locale)} class="tb-keys">
  <Help kind="hint">{t('table.keys.replace', 'Type to replace a cell', {}, $locale)} · <Kbd key="Enter" /> {t('table.keys.edit', 'or double-click to edit', {}, $locale)} · <Kbd key="Shift+Enter" /> {t('table.keys.newline', 'new line', {}, $locale)} · <Kbd key="Shift" />{t('table.keys.select', '+arrows select', {}, $locale)} · <Kbd key="Ctrl+C" /> <Kbd key="Ctrl+V" /> {t('table.keys.clip', 'copy and paste with Excel and Sheets', {}, $locale)} · {t('table.keys.menu', 'right-click for rows, columns and merging.', {}, $locale)}</Help>
</PanelSection>
