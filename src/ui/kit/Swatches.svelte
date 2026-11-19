<script lang="ts">
  // A grid of colours to pick from (the colour picker's presets): small rounded chips, `columns` across, 4px apart.
  // `editing` outlines them in blue pen dashes (a press then replaces the chip, as the caller decides). Each chip is a
  // button named by its colour; `onpick` hears which one (its index).
  let { colours, columns = 8, editing = false, label, class: extra, onpick }: {
    colours: { css: string; title: string }[]; columns?: number; editing?: boolean; label?: string; class?: string;
    onpick?: (i: number) => void;
  } = $props();
</script>
<div class={['swatches', editing && 'editing', extra]} role="group" aria-label={label} style:--sw-cols={columns}>
  {#each colours as c, i (i)}<button type="button" data-i={i} style:background={c.css} title={c.title} aria-label={c.title} onclick={() => onpick?.(i)}></button>{/each}
</div>
