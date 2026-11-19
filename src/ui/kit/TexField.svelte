<script lang="ts">
  // A field that takes LaTeX: maths without $ ('math') or text with $math$ ('text').
  import type { HTMLInputAttributes } from 'svelte/elements';
  import TextField from './TextField.svelte';
  let { value, tx, none = false, ...rest }: Omit<HTMLInputAttributes, 'value' | 'type'> & {
    value: string | number | null | undefined; tx: 'math' | 'text'; none?: boolean;
  } = $props();
</script>
<TextField {value} {tx} {none} {...rest} />
