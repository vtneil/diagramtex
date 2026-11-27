<script lang="ts">
  // The colour picker's Gradient pane: presets, a preview, Linear | Radial, rotation, scale and centre, the bar of
  // colour stops (press the bar to add one, drag one to move it), the chosen stop's colour and place, and the preset
  // colours. `value` is the gradient (src/domain/fills.ts); `onset(v, final)` gives a new one, `final` false while a
  // stop is dragged.
  import { onDestroy } from 'svelte';
  import { runtime as TD } from '../runtime';
  import { t, locale } from '../i18n';
  import Segmented from './kit/Segmented.svelte';
  import Swatches from './kit/Swatches.svelte';
  import TextField from './kit/TextField.svelte';
  import NumberField from './kit/NumberField.svelte';
  import IconButton from './kit/IconButton.svelte';
  let { value, onset }: { value: any; onset: (v: any, final: boolean) => void } = $props();
  const F = TD.fillPanes, r2 = TD.util.r2;
  const presets = TD.colorPresets().map((c: string) => ({ css: TD.css(c), title: c }));
  const v = $derived(F.gradNorm(value));
  let pick = $state(0);
  const sel = $derived(Math.min(pick, v.stops.length - 1));
  const update = (fn: (g: any) => void) => { const g = F.gradNorm(value); fn(g); onset(g, true); };
  const num = (e: Event) => parseFloat((e.currentTarget as HTMLInputElement).value);
  const field = (key: string) => (e: Event) => { const n = num(e); if (isFinite(n)) update((g) => { g[key] = key === 'scale' ? Math.max(5, n) : n; }); };
  const hex = (e: Event) => { const c = F.hex((e.currentTarget as HTMLInputElement).value); if (c) update((g) => { g.stops[sel][1] = c; }); };
  const place = (e: Event) => { const n = num(e); if (isFinite(n)) update((g) => { const st = g.stops[sel]; st[0] = Math.max(0, Math.min(1, n / 100)); g.stops.sort((a: any, b: any) => a[0] - b[0]); pick = g.stops.indexOf(st); }); };
  // press the bar: add a stop with the colour the bar shows there, or take the stop pressed; then drag it
  function press(e: PointerEvent) {
    const box = e.currentTarget as HTMLElement;
    e.preventDefault();
    const r = box.getBoundingClientRect(), at = (ev: PointerEvent) => Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    const g = F.gradNorm(value);
    const handle = (e.target as Element).closest<HTMLElement>('[data-st]');
    let st: any;
    if (handle) st = g.stops[+handle.dataset.st!];
    else {
      const x = at(e), pts = g.stops;
      let c = pts[0][1];
      for (let i = 1; i < pts.length; i++) if (x <= pts[i][0]) { c = (x - pts[i - 1][0]) < (pts[i][0] - x) ? pts[i - 1][1] : pts[i][1]; break; } else c = pts[i][1];
      st = [x, c]; g.stops.push(st);
    }
    const put = (final: boolean) => { g.stops.sort((a: any, b: any) => a[0] - b[0]); pick = g.stops.indexOf(st); onset(JSON.parse(JSON.stringify(g)), final); };
    put(false);
    const move = (ev: PointerEvent) => { st[0] = at(ev); put(false); };
    const up = () => { stop!(); put(true); };
    stop?.();
    stop = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); stop = null; };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }
  // the window's drag listeners go with the pane (the picker closed by Esc mid-drag)
  let stop: (() => void) | null = null;
  onDestroy(() => stop?.());
</script>
<Swatches class="fp-presets" columns={6} label={t('color.gradientPresets', 'Preset gradients', {}, $locale)}
  colours={TD.GRAD_PRESETS.map((p: any, i: number) => ({ css: F.gradCss(p), title: t('color.gradientPreset', 'Gradient {n}', { n: i + 1 }, $locale) }))}
  onpick={(i) => { pick = 0; onset(F.gradNorm(TD.GRAD_PRESETS[i]), true); }} />
<div class="fp-preview" style:background={F.gradCss(v)}></div>
<Segmented class="fp-seg" label={t('color.gradientKind', 'Kind of gradient', {}, $locale)}
  onclick={(e: MouseEvent) => { const b = (e.target as Element).closest<HTMLElement>('[data-gk]'); if (b) update((g) => { g.g = b.dataset.gk; }); }}
  options={[['linear', t('color.linear', 'Linear', {}, $locale)], ['radial', t('color.radial', 'Radial', {}, $locale)]].map(([k, label]) => ({ label, on: v.g === k, attrs: { 'data-gk': k } }))} />
<div class="fp-fields">
  {#if v.g === 'linear'}<label><span>{t('color.rotate', 'Rotate', {}, $locale)}</span><NumberField data-gf="angle" step="15" value={r2(v.angle)} onchange={field('angle')} /><i>°</i></label>{/if}
  <label><span>{t('ui.scale', 'Scale', {}, $locale)}</span><NumberField data-gf="scale" min="5" step="10" value={r2(v.scale)} onchange={field('scale')} /><i>%</i></label>
  <div class="fp-row" role="group" aria-label={t('ui.centre', 'Centre', {}, $locale)}><span>{t('ui.centre', 'Centre', {}, $locale)}</span><NumberField data-gf="cx" step="5" value={r2(v.cx)} aria-label={t('color.centreX', 'Centre across', {}, $locale)} onchange={field('cx')} /><NumberField data-gf="cy" step="5" value={r2(v.cy)} aria-label={t('color.centreY', 'Centre down', {}, $locale)} onchange={field('cy')} /><i>%</i></div>
</div>
<div class="fp-stops" title={t('color.stopsHint', 'Click the bar to add a stop; drag a stop to move it', {}, $locale)} {@attach (node: HTMLElement) => { node.addEventListener('pointerdown', press); return () => node.removeEventListener('pointerdown', press); }}>
  <div class="fp-bar" style:background={F.stopsCss(v)}></div>
  {#each v.stops as [at, c], i (i)}<b data-st={i} class={i === sel ? 'on' : undefined} style:left="{r2(at * 100)}%"><span style:background={TD.css(c)}></span></b>{/each}
</div>
<div class="fp-stop-ed">
  <span>{t('color.stop', 'Stop', {}, $locale)}</span>
  <TextField data-sthex maxlength={8} value={v.stops[sel][1].replace('#', '').toUpperCase()} aria-label={t('color.stopColour', 'Stop colour', {}, $locale)} onchange={hex} />
  <NumberField data-stpos min="0" max="100" step="5" value={Math.round(v.stops[sel][0] * 100)} aria-label={t('color.stopPlace', 'Stop position', {}, $locale)} onchange={place} /><i>%</i>
  <IconButton variant="default" size="sm" icon="close" data-stdel disabled={v.stops.length < 3} title={t('color.removeStop', 'Remove Stop', {}, $locale)} onclick={() => update((g) => { g.stops.splice(sel, 1); pick = Math.max(0, sel - 1); })} />
</div>
<Swatches class="fp-sw" colours={presets} label={t('color.presets', 'Preset colours', {}, $locale)} onpick={(i) => update((g) => { g.stops[sel][1] = TD.colorPresets()[i]; })} />
