<script lang="ts" module>
  /** A Classic file's diagrams, to pick one: each a picture of it and its name; `on` is the open one. */
  export interface GalleryCard { index: number; name: string; svg: string; on: boolean }
  export interface DiagramGalleryModel { title: string; closeLabel: string; empty: string; cards: GalleryCard[]; pick(index: number): void; close(): void }
</script>
<script lang="ts">
  // The diagram gallery (the top bar's "Diagram n of m"), inside the <dialog> src/application/app.ts opens.
  import IconButton from './kit/IconButton.svelte';
  import Button from './kit/Button.svelte';
  let { model }: { model: DiagramGalleryModel } = $props();
</script>
<div class="modal-head"><h2 id="diagramGalleryTitle">{model.title}</h2><IconButton icon="close" data-close title={model.closeLabel} onclick={model.close} /></div>
<div class="diagram-gallery-grid">
  {#each model.cards as c (c.index)}
    <Button class={c.on ? 'diagram-gallery-card on' : 'diagram-gallery-card'} data-block={c.index} aria-current={c.on ? 'true' : 'false'} onclick={() => model.pick(c.index)}>
      <span class="diagram-gallery-preview" aria-hidden="true">{#if c.svg}{@html c.svg}{:else}<span>{model.empty}</span>{/if}</span>
      <span class="diagram-gallery-label"><span>{c.name}</span>{#if c.on}<span aria-hidden="true">✓</span>{/if}</span>
    </Button>
  {/each}
</div>
