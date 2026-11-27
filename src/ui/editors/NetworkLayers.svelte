<script lang="ts" module>
  export interface NetworkLayersModel {
    hidden: boolean;
    /** the group's accessible name */
    label: string;
    /** the layers, nearest first (layer 1 at the top with tikz-network's default layer distance) */
    layers: { n: number; title: string; on: boolean }[];
    /** a new layer after the last: chosen, it is focused while empty, and new items go on it */
    add: { n: number; title: string } | null;
    /** no layer focused: every layer shown, any item can be clicked */
    none: { title: string; on: boolean };
  }
</script>
<script lang="ts">
  // The Network editor's layer selector, at the bottom left of its stage: the layers in a column that scrolls when
  // there are many, and under it, always in place, "no focus". Choosing a layer focuses it: the editor fades the
  // other layers, leaves only its items to click, and places new items on it. The controller
  // (src/editors/networkeditor.ts) handles the clicks by data-nl (the layer, or '' for no focus).
  import Button from '../kit/Button.svelte';
  import IconButton from '../kit/IconButton.svelte';
  let { model }: { model: NetworkLayersModel } = $props();
</script>
<div class="nw-layers" hidden={model.hidden} role="group" aria-label={model.label}>
  <div class="nw-layers-list">
    {#each model.layers as l (l.n)}
      <Button variant="flat" class={l.on ? 'on' : undefined} aria-pressed={l.on} data-nl={String(l.n)} title={l.title}>{l.n}</Button>
    {/each}
    {#if model.add}<IconButton icon="add" class="nw-layers-add" data-nl={String(model.add.n)} title={model.add.title} />{/if}
  </div>
  <IconButton icon="home" class="nw-layers-none" on={model.none.on} aria-pressed={model.none.on} data-nl="" title={model.none.title} />
</div>
