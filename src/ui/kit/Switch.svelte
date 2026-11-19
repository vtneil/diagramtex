<script lang="ts">
  // A single on/off setting: a checkbox drawn as a switch (28×16, ink when on).
  import type { Snippet } from 'svelte';
  import type { HTMLInputAttributes } from 'svelte/elements';
  import Checkbox from './Checkbox.svelte';
  let { checked = false, children, ...rest }: Omit<HTMLInputAttributes, 'type' | 'checked' | 'role'> & { checked?: boolean; children?: Snippet } = $props();
</script>
<Checkbox role="switch" {checked} {children} {...rest} />
