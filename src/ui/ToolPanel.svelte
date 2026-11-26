<script lang="ts" module>
  /** A symbol or drawing tool: a small drawing, its name in the tooltip. `modes`: it has a draw-mode menu. */
  export interface ToolSymbol { pick: string; title: string; svg: string; modes?: boolean }
  /** A picture tile: a drawing over its name (plots, figures, blocks, physics domains). */
  export interface ToolTileSpec { insert?: string; label: string; title?: string; svg: string; soon?: boolean }
  /** One wide tile with a line of help under it (the Circuit block in the Electrical group). */
  export interface ToolEntry { insert: string; title: string; svg: string; label: [string, string, string]; help: string }
  export interface ToolSection {
    title?: string; warn?: string;
    symbols?: ToolSymbol[]; tiles?: ToolTileSpec[]; entry?: ToolEntry;
    /** tiles across (4 by default); a class for the grid */
    columns?: number; class?: string;
  }
  export interface ToolPanelModel { sections: ToolSection[] }
</script>
<script lang="ts">
  // What a tool group's flyout holds (#fly-lines, #fly-shapes … #fly-blocks): sections, each a small title over a grid
  // of symbol buttons (data-pick) or the kit's picture tiles (data-insert). src/application/app.ts builds the model
  // and picks the tool on a click; the ⌘K search (ui/services/palette.svelte.ts) reads the buttons and the titles over them.
  import Button from './kit/Button.svelte';
  import Tile from './kit/Tile.svelte';
  import TileGrid from './kit/TileGrid.svelte';
  let { model }: { model: ToolPanelModel } = $props();
</script>
{#each model.sections as s, i (i)}
  {#if s.title}<div class="pop-title">{s.title}{#if s.warn}<span class="pop-warn">{s.warn}</span>{/if}</div>{/if}
  {#if s.symbols}
    <div class={['sym-grid', s.class]} role="group" aria-label={s.title}>
      {#each s.symbols as b (b.pick)}<Button data-pick={b.pick} data-modes={b.modes ? b.pick : undefined} title={b.title}>{@html b.svg}{#if b.modes}<i class="more"></i>{/if}</Button>{/each}
    </div>
  {/if}
  {#if s.tiles}
    <TileGrid columns={s.columns} label={s.title} class={s.class}>
      {#each s.tiles as tile (tile.insert ?? tile.label)}<Tile label={tile.label} svg={tile.svg} title={tile.title} soon={tile.soon} data-insert={tile.insert} />{/each}
    </TileGrid>
  {/if}
  {#if s.entry}
    {@const e = s.entry}
    <TileGrid columns={1} class={['tool-entry', s.class].filter(Boolean).join(' ')}>
      <Tile label={e.label.join('')} svg={e.svg} title={e.title} data-insert={e.insert}>{e.label[0]}<code>{e.label[1]}</code>{e.label[2]}</Tile>
      <div class="help">{e.help}</div>
    </TileGrid>
  {/if}
{/each}
