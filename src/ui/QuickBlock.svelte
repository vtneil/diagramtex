<script lang="ts" module>
  /** Quick's view of a block: its open draft docked here with one bar of actions, or, with no drafts, a way to start one. */
  export interface QuickBlockModel {
    none?: { icon: string; text: string; newLabel: string };
    /** the block's editor couldn't be docked */
    unavailable?: string;
    bar: { place: string; placeTip: string; exportLabel: string; exportTip: string; copyTikz: string; copyTikzTip: string };
    /** the button that says Copied for a moment: 'tikz', or 'qexp' (a picture copied from the Export menu) */
    copied: string | null; copiedLabel: string;
  }
</script>
<script lang="ts">
  // src/ui/services/quick.ts docks the block's editor into .qk-dock (TD.blocks.dock) and moves the bar into the
  // editor's head, beside its tools; clicks are handled there by their data attributes (data-place, data-qexp, data-q,
  // data-new-draft).
  import Button from './kit/Button.svelte';
  let { model }: { model: QuickBlockModel } = $props();
  const said = (q: string, label: string) => (model.copied === q ? model.copiedLabel : label);
</script>
{#if model.none}
  <div class="qk-blk qk-none"><span class="qk-none-ic" aria-hidden="true">{@html model.none.icon}</span><p>{model.none.text}</p><Button variant="primary" data-new-draft>{model.none.newLabel}</Button></div>
{:else}
  <div class="qk-blk">
    <div class="qk-dock">{#if model.unavailable}<div class="qk-loading">{model.unavailable}</div>{/if}</div>
    <div class="qk-bar" data-outside>
      <span class="qk-msg" role="status"></span>
      <div class="qk-acts">
        <Button data-place title={model.bar.placeTip}>{model.bar.place}</Button>
        <Button class="qk-exp" icon="export" data-qexp aria-haspopup="dialog" aria-expanded="false" title={model.bar.exportTip}>{said('qexp', model.bar.exportLabel)}</Button>
        <Button variant="primary" data-q="tikz" title={model.bar.copyTikzTip}>{said('tikz', model.bar.copyTikz)}</Button>
      </div>
    </div>
  </div>
{/if}
