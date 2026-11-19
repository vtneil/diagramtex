<script lang="ts">
  // A search box: a `type="search"` field whose placeholder is also its name ("Search parts"). Its value is the
  // caller's, kept by liveValue so typing is never rewritten under the caret; Esc clears it (the browser's own).
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { liveValue } from '../live-value';
  let { value = '', placeholder, class: extra, el = $bindable(), ...rest }: Omit<HTMLInputAttributes, 'value' | 'class' | 'type'> & {
    value?: string; placeholder: string; class?: string; el?: HTMLInputElement;
  } = $props();
</script>
<input bind:this={el} type="search" class={['search-field', extra]} {placeholder} aria-label={rest['aria-label'] ?? placeholder} spellcheck="false" autocomplete="off" {...rest} {@attach liveValue(value)}>
