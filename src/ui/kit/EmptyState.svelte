<script lang="ts">
  // A quiet message where a list or a view has nothing yet ("No parts match", "No files"): centred, pencil, with an
  // optional title above. Announced politely, so a search that empties its list is heard.
  import type { Snippet } from 'svelte';
  let { title, class: extra, children }: { title?: string; class?: string; children?: Snippet } = $props();
</script>
<div class={['empty-state', extra]} role="status">{#if title}<div class="empty-title">{title}</div>{/if}{@render children?.()}</div>
