<script lang="ts">
  // A field of several lines. Its value follows the model without overwriting what the person is typing (liveValue).
  // `code` is the panels' source box (mono, no spelling check): a block's LaTeX, a TikZ code object.
  import type { HTMLTextareaAttributes } from 'svelte/elements';
  import { liveValue } from '../live-value';
  let { value, code = false, class: extra, spellcheck, ...rest }: Omit<HTMLTextareaAttributes, 'value' | 'class'> & {
    value: string | number | null | undefined; code?: boolean; class?: string;
  } = $props();
</script>
<textarea class={[code && 'code', extra].filter(Boolean).join(' ') || undefined} spellcheck={spellcheck ?? (code ? 'false' : undefined)} {...rest} {@attach liveValue(value)}></textarea>
