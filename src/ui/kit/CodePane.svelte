<script lang="ts">
  // A block editor's code column: the package's name, a count (lines, parts), Copy, the code itself (mono, no
  // wrapping, editable: the editor redraws from it), a note under the head, and a message line under the code
  // (what could not be drawn, an error). The code is the caller's, kept by liveValue so typing is never rewritten.
  import type { Snippet } from 'svelte';
  import { t, locale } from '../../i18n';
  import { liveValue } from '../live-value';
  import Badge from './Badge.svelte';
  import Button from './Button.svelte';
  let { title, value, label, count, copyTitle, note, message, readonly = false, oninput, oncopy, el = $bindable(), ...rest }: {
    /** the package ("circuitikz") */
    title: string; value: string;
    /** the code field's name ("circuitikz code") */
    label: string; count?: string | number; copyTitle?: string;
    note?: Snippet; message?: Snippet | string;
    readonly?: boolean; oninput?: (code: string) => void; oncopy?: () => void; el?: HTMLTextAreaElement;
    [attr: string]: unknown;
  } = $props();
</script>
<div class="cz-code">
  <div class="cz-code-head"><span>{title}</span>{#if count !== undefined && count !== ''}<Badge {count} />{:else}<small></small>{/if}{#if oncopy}<Button variant="flat" title={copyTitle} onclick={oncopy}>{t('ui.copy', 'Copy', {}, $locale)}</Button>{/if}</div>
  {#if note}<div class="cz-code-note">{@render note()}</div>{/if}
  <textarea bind:this={el} wrap="off" spellcheck="false" aria-label={label} {readonly} {...rest} oninput={(e) => oninput?.(e.currentTarget.value)} {@attach liveValue(value)}></textarea>
  {#if message}<div class="cz-msg" role="status">{#if typeof message === 'string'}{message}{:else}{@render message()}{/if}</div>{/if}
</div>
