<script lang="ts">
  // A labelled row in a panel: an 84px label column, then the control(s); with no label, a `column` row is the
  // control alone, full width. `for` names the field the label is for;
  // without it the label is a caption for a group of controls (give them aria-labelledby the row's `labelId`).
  // `column` stacks the label over a wide control (a text area); `unit` lays a value and its unit side by side;
  // `ctlClass` adds to the control cell; `bare` is for a control that is the cell itself (a panel Segmented, class "ctl").
  import type { Snippet } from 'svelte';
  let { label, for: labelFor, labelId, title, column = false, unit = false, bare = false, ctlClass, class: extra, children }: {
    label?: string; for?: string; labelId?: string; title?: string; column?: boolean; unit?: boolean; bare?: boolean; ctlClass?: string; class?: string; children: Snippet;
  } = $props();
</script>
<div class={['row', column && 'col', extra]}>
  {#if label === undefined}{:else if labelFor}<label for={labelFor} id={labelId} {title}>{label}</label>{:else}<span class="field-label" id={labelId} {title}>{label}</span>{/if}
  {#if column || bare}{@render children()}{:else}<div class={['ctl', unit && 'unit', ctlClass]}>{@render children()}</div>{/if}
</div>
