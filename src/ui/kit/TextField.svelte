<script lang="ts">
  // A one-line field. Its value follows the model without overwriting what the person is typing (liveValue).
  // `tx` makes it a TeX field: 'math' takes maths without $, 'text' takes text with $math$; `none` says that
  // leaving it empty means no label. Both give the standard placeholder.
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { locale, caption } from '../../i18n';
  import { liveValue } from '../live-value';
  import { txPlaceholderCaption } from '../forms';
  let { value, type = 'text', tx, none = false, placeholder, spellcheck, ...rest }: Omit<HTMLInputAttributes, 'value'> & {
    value: string | number | null | undefined; tx?: 'math' | 'text'; none?: boolean;
  } = $props();
  const shown = $derived(placeholder ?? (tx ? caption(txPlaceholderCaption(tx, none), $locale) : undefined));
  const spell = $derived(spellcheck ?? (type === 'text' || type === 'search' ? 'false' : undefined));
</script>
<input {type} data-tx={tx} placeholder={shown} spellcheck={spell} {...rest} {@attach liveValue(value)}>
