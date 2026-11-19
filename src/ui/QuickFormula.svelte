<script lang="ts" module>
  /** Quick's formula view. `copied` names the button that says Copied for a moment (its data-q). */
  export interface QuickFormulaModel {
    phone: boolean;
    formulaLabel: string; inputLabel: string; inputs: { value: string; label: string }[]; input: string;
    sizeLabel: string; sizes: { value: string; label: string }[]; size: string;
    sharpLabel: string; sharpTip: string; scales: number[]; scale: number;
    transparentLabel: string; transparent: boolean;
    canCopy: boolean; copied: string | null; copiedLabel: string;
    labels: { copyPng: string; copyPngTip: string; copySvg: string; copySvgTip: string; dlPngTip: string; dlSvgTip: string; foot: string; copyLatex: string };
  }
</script>
<script lang="ts">
  // Quick's formula: the input switch over the field, the preview, then the picture's size, sharpness and background
  // and the ways out (copy, download), and a line under them. src/ui/services/quick.ts fills the field (.qk-edit:
  // a textarea, or one MathLive field), the preview (.qk-prev) and the message line, and handles the clicks and
  // changes by their data attributes (data-input, data-size, data-q, .qk-dpi, data-clear).
  import Segmented from './kit/Segmented.svelte';
  import Select from './kit/Select.svelte';
  import Checkbox from './kit/Checkbox.svelte';
  import Button from './kit/Button.svelte';
  let { model }: { model: QuickFormulaModel } = $props();
  const said = (q: string, label: string) => (model.copied === q ? model.copiedLabel : label);
</script>
<div class="qk">
  <div class="qk-field">
    <div class="qk-row" hidden={model.phone}><label class="qk-label" for="quickTex">{model.formulaLabel}</label>
      <Segmented class="qk-seg" label={model.inputLabel} options={model.inputs.map((o) => ({ label: o.label, on: o.value === model.input, attrs: { 'data-input': o.value } }))} /></div>
    <div class="qk-edit"></div>
  </div>
  <div class={['qk-stage', model.transparent && 'clear']}><div class="qk-prev" aria-live="polite"></div></div>
  <div class="qk-msg" role="status"></div>
  <div class="qk-bar">
    <div class="qk-opts">
      <Segmented class="qk-seg" label={model.sizeLabel} options={model.sizes.map((o) => ({ label: o.label, on: o.value === model.size, attrs: { 'data-size': o.value } }))} />
      <Select class="qk-dpi" aria-label={model.sharpLabel} title={model.sharpTip} value={String(model.scale)} options={model.scales.map((d) => ({ value: String(d), label: d + '× PNG' }))} />
      <span class="qk-chk"><Checkbox data-clear checked={model.transparent}>{model.transparentLabel}</Checkbox></span>
    </div>
    <div class="qk-acts">
      {#if model.canCopy}
        <Button variant="primary" data-q="png" title={model.labels.copyPngTip}>{said('png', model.labels.copyPng)}</Button>
        <Button data-q="svg" title={model.labels.copySvgTip}>{said('svg', model.labels.copySvg)}</Button>
      {/if}
      <Button class="qk-dl" icon="download" data-q="dl-png" title={model.labels.dlPngTip}>PNG</Button>
      <Button class="qk-dl" icon="download" data-q="dl-svg" title={model.labels.dlSvgTip}>SVG</Button>
    </div>
  </div>
  <p class="qk-foot">{model.labels.foot}<Button variant="flat" class="qk-src" data-q="tex">{said('tex', model.labels.copyLatex)}</Button></p>
</div>
