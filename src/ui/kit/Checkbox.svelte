<script lang="ts">
  // A checkbox; with a label (children) it is wrapped in the app's .chk label, which takes the tooltip (title) so
  // hovering the words shows it too. `role="switch"` draws it as a switch.
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  let { checked = false, children, title, ...rest }: Omit<HTMLInputAttributes, 'type' | 'checked'> & { checked?: boolean; children?: Snippet } = $props();
</script>
{#if children}<label class="chk" {title}><input type="checkbox" {checked} {...rest}>{@render children()}</label>{:else}<input type="checkbox" {checked} {title} {...rest}>{/if}
