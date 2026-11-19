<script lang="ts">
  // The colour picker's Pattern pane: the eight hatches, a preview, size, line width (radius for dots), colour and
  // the preset colours. `value` is the pattern (src/domain/fills.ts); `onset(v)` gives a new one.
  import { runtime as TD } from '../runtime';
  import { t, locale } from '../i18n';
  import Button from './kit/Button.svelte';
  import Swatches from './kit/Swatches.svelte';
  import TextField from './kit/TextField.svelte';
  import NumberField from './kit/NumberField.svelte';
  import { patternName } from '../domain/fill-names';
  let { value, onset }: { value: any; onset: (v: any, final: boolean) => void } = $props();
  const F = TD.fillPanes, r2 = TD.util.r2;
  const presets = TD.colorPresets().map((c: string) => ({ css: TD.css(c), title: c }));
  const v = $derived(F.patNorm(value));
  const update = (fn: (p: any) => void) => { const p = F.patNorm(value); fn(p); onset(p, true); };
  const field = (key: string) => (e: Event) => { const n = parseFloat((e.currentTarget as HTMLInputElement).value); if (isFinite(n)) update((p) => { p[key] = Math.max(key === 'size' ? 2 : 0.25, n); }); };
  const hex = (e: Event) => { const c = F.hex((e.currentTarget as HTMLInputElement).value); if (c) update((p) => { p.color = c; }); };
</script>
<div class="fp-pats" role="radiogroup" aria-label={t('color.pattern', 'Pattern', {}, $locale)}>
  {#each TD.PATTERNS as [k] (k)}<Button role="radio" aria-checked={k === v.p} class={k === v.p ? 'on' : undefined} data-pk={k} title={patternName(k, $locale)} onclick={() => update((p) => { p.p = k; })}>{@html F.patSvg({ ...v, p: k, size: Math.min(v.size, 10) }, 40, 26)}</Button>{/each}
</div>
<div class="fp-preview pat">{@html F.patSvg(v, 214, 54)}</div>
<div class="fp-fields">
  <label><span>{t('ui.size', 'Size', {}, $locale)}</span><NumberField data-pf="size" min="2" step="1" value={r2(v.size)} onchange={field('size')} /><i>px</i></label>
  <label><span>{v.p === 'dots' ? t('ui.radius', 'Radius', {}, $locale) : t('ui.line.width', 'Line width', {}, $locale)}</span><NumberField data-pf="lw" min="0.25" step="0.25" value={r2(v.lw)} onchange={field('lw')} /><i>px</i></label>
  <label><span>{t('ui.colour', 'Colour', {}, $locale)}</span><TextField data-phex maxlength={8} value={v.color.replace('#', '').toUpperCase()} onchange={hex} /></label>
</div>
<Swatches class="fp-sw" colours={presets} label={t('color.presets', 'Preset colours', {}, $locale)} onpick={(i) => update((p) => { p.color = TD.colorPresets()[i]; })} />
