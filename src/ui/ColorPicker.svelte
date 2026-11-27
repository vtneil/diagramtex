<script lang="ts" module>
  /** The colour picker's state (src/ui/services/colorpicker.svelte.ts keeps it and draws this from it). */
  export interface ColorPickerModel {
    /** Gradient and Pattern tabs (a fill); `tab`: the one shown */
    tabs: boolean; tab: 'basic' | 'grad' | 'pat';
    /** a No Color (or Default) button, and its name */
    nullable: boolean; noneLabel: string;
    /** the colour: hue 0–360, saturation, value and alpha 0–1; `none`: no colour */
    h: number; s: number; v: number; a: number; none: boolean;
    presets: { css: string; title: string }[];
    /** the presets can be changed (not xcolor's names), and are being */
    canEdit: boolean; editing: boolean;
    /** the gradient and the pattern being made (src/domain/fills.ts), on their tabs */
    grad: any; pat: any;
  }
  /** What the controller hears: `final` is false while a drag goes on */
  export interface ColorPickerActions {
    tab(tab: ColorPickerModel['tab']): void;
    none(): void;
    sv(s: number, v: number, final: boolean): void;
    hue(h: number, final: boolean): void;
    alpha(a: number, final: boolean): void;
    /** a typed value: hex (with or without #, 3, 6 or 8 digits), r, g, b (0–255) or a (0–100) */
    field(f: 'hex' | 'r' | 'g' | 'b' | 'a', value: string): void;
    preset(i: number): void;
    edit(): void;
    /** a new gradient or pattern from the Gradient or Pattern pane */
    fill(v: any, final: boolean): void;
  }
</script>
<script lang="ts">
  // The colour picker: a saturation and value square, hue and alpha strips, a preview, Hex and RGBA fields, and the
  // presets (editable, or xcolor's names in a LaTeX block); a Basic | Gradient | Pattern switch for a fill. Opened in
  // the kit's Popover by TD.openColorPicker.
  import { t, locale } from '../i18n';
  import Button from './kit/Button.svelte';
  import Segmented from './kit/Segmented.svelte';
  import TextField from './kit/TextField.svelte';
  import NumberField from './kit/NumberField.svelte';
  import Swatches from './kit/Swatches.svelte';
  import GradientPane from './GradientPane.svelte';
  import PatternPane from './PatternPane.svelte';
  import { hsv2rgb } from './services/colour-math';
  let { model: m, act }: { model: ColorPickerModel; act: ColorPickerActions } = $props();
  const rgb = $derived(hsv2rgb(m.h, m.s, m.v).map(Math.round));
  const hue = $derived(hsv2rgb(m.h, 1, 1).map(Math.round));
  const hex = $derived(rgb.map((n) => n.toString(16).padStart(2, '0')).join('').toUpperCase());
  const clamp = (v: number) => Math.max(0, Math.min(1, v));
  // press and drag on the square or a strip; the pointer is held, so the drag may leave it
  function drag(fn: (x: number, y: number, final: boolean) => void) {
    return (node: HTMLElement) => {
      const at = (e: PointerEvent, final: boolean) => { const r = node.getBoundingClientRect(); fn(clamp((e.clientX - r.left) / r.width), clamp((e.clientY - r.top) / r.height), final); };
      let end: (() => void) | null = null;
      const down = (e: PointerEvent) => {
        e.preventDefault(); end?.(); node.setPointerCapture(e.pointerId); at(e, false);
        let last = e;
        const move = (ev: PointerEvent) => at(last = ev, false);
        // a cancelled drag (the system took the pointer) ends where it last was: its own event has no place to trust
        const up = (ev: PointerEvent) => { end!(); at(ev.type === 'pointercancel' ? last : ev, true); };
        end = () => { node.removeEventListener('pointermove', move); node.removeEventListener('pointerup', up); node.removeEventListener('pointercancel', up); end = null; };
        node.addEventListener('pointermove', move); node.addEventListener('pointerup', up); node.addEventListener('pointercancel', up);
      };
      node.addEventListener('pointerdown', down);
      return () => { node.removeEventListener('pointerdown', down); end?.(); };
    };
  }
  const change = (f: 'hex' | 'r' | 'g' | 'b' | 'a') => (e: Event) => act.field(f, (e.currentTarget as HTMLInputElement).value);
</script>
{#if m.tabs}
  <Segmented class="cp-tabs" label={t('color.kind', 'Kind of fill', {}, $locale)} onclick={(e: MouseEvent) => { const b = (e.target as Element).closest<HTMLElement>('[data-tab]'); if (b) act.tab(b.dataset.tab as ColorPickerModel['tab']); }}
    options={[['basic', t('color.basic', 'Basic', {}, $locale)], ['grad', t('color.gradient', 'Gradient', {}, $locale)], ['pat', t('color.pattern', 'Pattern', {}, $locale)]].map(([k, label]) => ({ label, on: m.tab === k, attrs: { 'data-tab': k } }))} />
{/if}
<div class="cp-pane" data-pane="basic" hidden={m.tab !== 'basic'}>
  {#if m.nullable}<Button class="cp-none" onclick={act.none}>{m.noneLabel}</Button>{/if}
  <div class="cp-sv" style:background="rgb({hue})" {@attach drag((x, y, final) => act.sv(x, 1 - y, final))}>
    <div class="cp-sv-white"></div><div class="cp-sv-black"></div><div class="cp-knob" style:left="{m.s * 100}%" style:top="{(1 - m.v) * 100}%"></div>
  </div>
  <div class="cp-row">
    <div class="cp-sliders">
      <div class="cp-hue" {@attach drag((x, _, final) => act.hue(x * 360, final))}><div class="cp-thumb" style:left="{(m.h / 360) * 100}%"></div></div>
      <div class="cp-alpha" {@attach drag((x, _, final) => act.alpha(x, final))}>
        <div class="cp-alpha-grad" style:background="linear-gradient(to right, rgba({rgb},0), rgb({rgb}))"></div><div class="cp-thumb" style:left="{m.a * 100}%"></div>
      </div>
    </div>
    <div class={['cp-preview', m.none && 'none']}><div style:background={m.none ? 'transparent' : `rgba(${rgb},${m.a})`}></div></div>
  </div>
  <div class="cp-inputs">
    <label><TextField data-f="hex" maxlength={8} value={hex} onchange={change('hex')} /><span>Hex</span></label>
    {#each ['r', 'g', 'b'] as const as f, i (f)}<label><NumberField data-f={f} min="0" max="255" value={rgb[i]} onchange={change(f)} /><span>{f.toUpperCase()}</span></label>{/each}
    <label><NumberField data-f="a" min="0" max="100" value={Math.round(m.a * 100)} onchange={change('a')} /><span>A</span></label>
  </div>
  <Swatches class="cp-presets" colours={m.presets} editing={m.editing} label={t('color.presets', 'Preset colours', {}, $locale)} onpick={act.preset} />
  {#if m.canEdit}<Button class="cp-edit" onclick={act.edit}>{m.editing ? t('color.editDone', 'Done (click a swatch to replace it)', {}, $locale) : t('color.editPresets', 'Change Preset Colours', {}, $locale)}</Button>{/if}
</div>
{#if m.tab === 'grad' && m.grad}<div class="cp-pane fp" data-pane="grad"><GradientPane value={m.grad} onset={act.fill} /></div>{/if}
{#if m.tab === 'pat' && m.pat}<div class="cp-pane fp" data-pane="pat"><PatternPane value={m.pat} onset={act.fill} /></div>{/if}
