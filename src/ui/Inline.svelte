<script lang="ts">
  import type { Inline } from './forms';
  let { text }: { text: Inline[] } = $props();
</script>
{#each text as part}{#if typeof part === 'string'}{part}{:else if 'code' in part}<code>{part.code}</code>{:else if 'bold' in part}<b>{part.bold}</b>{:else if 'kbd' in part}<kbd>{part.kbd}</kbd>{:else}<br>{/if}{/each}
