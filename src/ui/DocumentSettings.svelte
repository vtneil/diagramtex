<script lang="ts">
  import { liveValue } from './live-value';
  export interface Model {
    page: { paper: string; orient: string; w: number; h: number; W: number; H: number; mt: number; mb: number; ml: number; mr: number; textW: number; font: number; title: boolean; spread: number; numbered: boolean };
    papers: { key: string; name: string }[]; wide: number;
  }
  let { model }: { model: Model } = $props();
  let page = $derived(model.page);
  const round = (value: number) => +(+value).toFixed(2);
</script>
{#snippet number(key: string, value: number)}<input type="number" data-pg={key} {@attach liveValue(round(value))} step="0.1" min="0">{/snippet}
<h3>Page setup</h3><div class="sec">
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Paper</label><div class="ctl"><select data-pg="paper" {@attach liveValue(page.paper)}>{#each model.papers as paper}<option value={paper.key}>{paper.name}</option>{/each}</select></div></div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Orientation</label><div class="ctl seg-ctl"><button data-pgo="portrait" class={page.orient !== 'landscape' ? 'on' : ''} title="Portrait"><svg viewBox="0 0 20 20"><path d="M6 3h8v14H6z"/></svg></button><button data-pgo="landscape" class={page.orient === 'landscape' ? 'on' : ''} title="Landscape"><svg viewBox="0 0 20 20"><path d="M3 6h14v8H3z"/></svg></button></div></div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Size (cm)</label><div class="ctl">{#if page.paper === 'custom'}{@render number('w', page.w)}<span class="x">×</span>{@render number('h', page.h)}{:else}<span class="ro">{round(page.W)} × {round(page.H)}</span>{/if}</div></div></div>
<div class="sec"><div class="sec-title">Margins (cm)</div><div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Top / bottom</label><div class="ctl">{@render number('mt', page.mt)}{@render number('mb', page.mb)}</div></div><div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Left / right</label><div class="ctl">{@render number('ml', page.ml)}{@render number('mr', page.mr)}</div></div><div class="row presets">{#each [['Narrow', 1.27], ['Normal', 2.5], ['Wide', 3.5]] as [name, value]}<button data-pgm={value} title={value + ' cm on all sides'}>{name}</button>{/each}</div><div class="hint-line">Text width {round(page.textW)} cm{#if model.wide} · <b>{model.wide} diagram{model.wide > 1 ? 's are' : ' is'} wider and will be scaled down</b>{/if}</div></div>
<div class="sec"><div class="sec-title">Text</div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Font size</label><div class="ctl"><select data-pg="font" {@attach liveValue(String(+page.font))}>{#each [10, 11, 12] as value}<option value={String(value)}>{value} pt</option>{/each}</select></div></div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Title</label><div class="ctl"><label class="chk"><input type="checkbox" data-pg="title" checked={page.title}> Show document name as title</label></div></div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Line spacing</label><div class="ctl"><select data-pg="spread" {@attach liveValue(String(+page.spread || 1))}>{#each [[1, 'Single'], [1.15, '1.15'], [1.3, 'One and a half'], [1.6, 'Double']] as [value, name]}<option value={String(value)}>{name}</option>{/each}</select></div></div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing compound control caption.) --><label>Sections</label><div class="ctl"><label class="chk"><input type="checkbox" data-pg="numbered" checked={page.numbered}> Number headings (1, 1.1, 1.1.1)</label></div></div></div>
<div class="sec"><div class="help">Exported with <code>\usepackage&#123;geometry&#125;</code>. Print uses the same page size.</div></div>
