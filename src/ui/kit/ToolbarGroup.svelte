<script lang="ts">
  // A group of related controls in a Toolbar, set off from the one before by a rule (none beside a switch).
  import type { Snippet } from 'svelte';
  let { label, class: extra, children }: { label?: string; class?: string; children: Snippet } = $props();
</script>
<div class={['tb-grp', extra]} role="group" aria-label={label}>{@render children()}</div>
