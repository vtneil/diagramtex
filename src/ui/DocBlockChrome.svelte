<script lang="ts" module>
  /** The controls drawn into the Document page: what goes into one of its empty containers. */
  export type DocBlockChromeModel =
    /** `.ins`: the bar between blocks that adds one */
    | { kind: 'insert' }
    /** `.blk-tools`: a block's own tools, shown on hover */
    | { kind: 'tools'; first: boolean; last: boolean; diagram: boolean; canDelete: boolean }
    /** `.fmt-bar` over a table being edited */
    | { kind: 'table'; rows: number; cols: number; header: boolean; align: string; borders: string }
    /** `.fmt-bar` over an image being edited; `name`: the file it is saved as */
    | { kind: 'image'; width: number; caption: string; name: string };
</script>
<script lang="ts">
  // Controls inside the Document page (src/application/docview.ts draws the page as markup, with these containers
  // left empty, then mounts this into each). The controller handles their clicks and changes by their hooks
  // (data-add, data-mv, data-edit, data-rm, data-tb, data-im).
  import { t, locale } from '../i18n';
  import Button from './kit/Button.svelte';
  import IconButton from './kit/IconButton.svelte';
  import Select from './kit/Select.svelte';
  import TextField from './kit/TextField.svelte';
  import Slider from './kit/Slider.svelte';
  import { ALIGN_ICON } from './kit/icons';
  let { model: m }: { model: DocBlockChromeModel } = $props();
</script>
{#snippet step(k: string, n: number, name: string, less: string, fewer: string, add: string, more: string)}
  <span class="fmt-lbl">{name}</span><span class="fmt-step" role="group" aria-label={name}>
    <IconButton icon="remove" data-tb={k + '-'} title={less} aria-label={fewer} disabled={n < 2} /><output>{n}</output><IconButton icon="add" data-tb={k + '+'} title={add} aria-label={more} />
  </span>
{/snippet}
{#if m.kind === 'insert'}
  <Button data-add="text">{t('doc.add.text', '+ Text', {}, $locale)}</Button>
  <Button data-add="diagram">{t('doc.add.diagram', '+ Diagram', {}, $locale)}</Button>
  <Button data-add="table">{t('doc.add.table', '+ Table', {}, $locale)}</Button>
  <Button data-add="image">{t('doc.add.image', '+ Image', {}, $locale)}</Button>
{:else if m.kind === 'tools'}
  <IconButton icon="chevronUp" data-mv="-1" disabled={m.first} title={t('doc.blk.up', 'Move up', {}, $locale)} aria-label={t('doc.blk.up', 'Move up', {}, $locale)} />
  <IconButton icon="chevronDown" data-mv="1" disabled={m.last} title={t('doc.blk.down', 'Move down', {}, $locale)} aria-label={t('doc.blk.down', 'Move down', {}, $locale)} />
  {#if m.diagram}<Button data-edit="" title={t('doc.blk.editTip', 'Edit on canvas', {}, $locale)}>{t('ui.edit', 'Edit', {}, $locale)}</Button>{/if}
  <IconButton icon="delete" danger data-rm="" disabled={!m.canDelete} title={t('doc.blk.delete', 'Delete block', {}, $locale)} aria-label={t('doc.blk.delete', 'Delete block', {}, $locale)} />
{:else if m.kind === 'table'}
  {@render step('row', m.rows, t('doc.tb.rows', 'Rows', {}, $locale), t('doc.tb.rowLess', 'Remove the last row', {}, $locale), t('doc.tb.rowFewer', 'Fewer rows', {}, $locale), t('doc.tb.rowAdd', 'Add a row', {}, $locale), t('doc.tb.rowMore', 'More rows', {}, $locale))}
  {@render step('col', m.cols, t('doc.tb.cols', 'Columns', {}, $locale), t('doc.tb.colLess', 'Remove the last column', {}, $locale), t('doc.tb.colFewer', 'Fewer columns', {}, $locale), t('doc.tb.colAdd', 'Add a column', {}, $locale), t('doc.tb.colMore', 'More columns', {}, $locale))}
  <span class="sep"></span>
  <Button data-tb="hdr" class={['txt', m.header && 'on'].filter(Boolean).join(' ')} aria-pressed={m.header} title={t('doc.tb.headerTip', 'Set the first row as a header (bold, with a rule under it)', {}, $locale)}>{t('doc.tb.header', 'Header row', {}, $locale)}</Button>
  <span class="sep"></span>
  {#each [['l', t('doc.tb.alLeft', 'Align columns left', {}, $locale)], ['c', t('doc.tb.alCenter', 'Align columns center', {}, $locale)], ['r', t('doc.tb.alRight', 'Align columns right', {}, $locale)]] as [k, tip] (k)}
    <IconButton icon={ALIGN_ICON[k as 'l']} data-tb={'al:' + k} on={m.align === k} aria-pressed={m.align === k} title={tip} />
  {/each}
  <Select data-tb="borders" title={t('table.rules', 'Rules', {}, $locale)} aria-label={t('table.rules', 'Rules', {}, $locale)} value={m.borders}
    options={[{ value: 'all', label: t('table.border.all', 'All borders', {}, $locale) }, { value: 'header', label: t('doc.tb.headerRules', 'Top, header, bottom', {}, $locale) }, { value: 'none', label: t('table.border.none', 'No borders', {}, $locale) }]} />
{:else if m.kind === 'image'}
  <label class="rng" title={t('doc.img.widthTip', 'Width as a share of the text width', {}, $locale)}>{t('ui.width', 'Width', {}, $locale)} <Slider data-im="width" min="0.1" max="1" step="0.05" defaultValue={0.6} value={m.width} readout={Math.round(m.width * 100) + '%'} /></label>
  <span class="sep"></span>
  <TextField data-im="caption" value={m.caption} placeholder={t('doc.img.caption', 'Caption (optional)', {}, $locale)} aria-label={t('doc.img.caption', 'Caption (optional)', {}, $locale)} spellcheck="true" />
  <Button data-im="replace" class="txt">{t('ui.replace', 'Replace…', {}, $locale)}</Button>
  <Button data-im="download" class="txt" title={t('doc.img.saveTip', 'Save the picture next to your .tex, under this name', {}, $locale)}>{t('doc.img.save', 'Save {name}', { name: m.name }, $locale)}</Button>
{/if}
