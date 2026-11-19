<script lang="ts">
  // A one-line bar of groups (ToolbarGroup): the Table and Document toolbars. It never wraps. As it narrows it first
  // drops the icons of controls that also have a label (labelled buttons, switches), then scrolls sideways with no
  // bar, a plain mouse wheel scrolling it too, and fades out over 32px on the side with more to see. It measures
  // its own width, so it works in a panel as well as across the window (fitToolbar, toolbar.ts).
  import type { Snippet } from 'svelte';
  import { fitToolbar } from './toolbar';
  let { label, class: extra, children }: { label: string; class?: string; children: Snippet } = $props();
</script>
<!-- lean, more-l and more-r are set by fitToolbar (toolbar.ts), not here: a class list here would wipe them -->
<div class={['toolbar', extra]} role="toolbar" aria-label={label} {@attach (bar) => fitToolbar(bar)}>{@render children()}</div>
