<script lang="ts">
  // A number field (liveValue, so "0." survives a re-render while typing).
  import type { HTMLInputAttributes } from 'svelte/elements';
  import TextField from './TextField.svelte';
  let { value, ...rest }: Omit<HTMLInputAttributes, 'value' | 'type'> & { value: string | number | null | undefined } = $props();
</script>
<TextField type="number" {value} {...rest} />
