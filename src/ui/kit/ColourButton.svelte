<script lang="ts">
  // A colour: the swatch button (.cbtn) and, when given, its name (.cval). The controller opens TD.openColorPicker
  // from the button's hooks (data-tc, data-color…); `none` draws the empty swatch.
  import type { HTMLButtonAttributes } from 'svelte/elements';
  let { css, none = false, label, class: extra, ...rest }: Omit<HTMLButtonAttributes, 'class'> & { css: string; none?: boolean; label?: string; class?: string } = $props();
</script>
<button type="button" class={['cbtn', none && 'none', extra].filter(Boolean).join(' ')} {...rest}><span style:background={css}></span></button>{#if label != null}<span class="cval">{label}</span>{/if}
