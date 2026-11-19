<script lang="ts">
  import { t, caption, locale } from '../i18n';
  import type { Inline } from './forms';
  import { Kbd } from './kit';
  let { text }: { text: Inline[] } = $props();
</script>
{#each text as part}{#if typeof part === 'string' || 'id' in part}{caption(part, $locale)}{:else if 'code' in part}<code>{part.code}</code>{:else if 'bold' in part}<b>{caption(part.bold, $locale)}</b>{:else if 'kbd' in part}<Kbd key={part.kbd} />{:else}<br>{/if}{/each}
