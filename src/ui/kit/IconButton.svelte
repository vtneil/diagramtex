<script lang="ts">
  import { onMount } from 'svelte';
  import { installTooltips } from '../services/tooltip';
  // A toolbar button showing only an icon. The title is required: it is the tooltip and, through the tooltip
  // service, the button's accessible name. Write shortcuts the Windows way ("Undo (Ctrl+Z)"); a Mac shows glyphs.
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import { buttonClass, type ButtonVariant, type ButtonSize } from './button';
  let { icon, svg, title, variant = 'flat', size = 'ctl', danger = false, on = false, class: extra, type = 'button', el = $bindable(), soon = false, onclick, ...rest }: Omit<HTMLButtonAttributes, 'class' | 'title'> & {
    /** a named icon, or `svg`: a drawing of its own (full <svg> markup, or a glyph such as the Table's B) */
    icon?: IconName; svg?: string; title: string; variant?: ButtonVariant; size?: ButtonSize; danger?: boolean; on?: boolean; class?: string; el?: HTMLButtonElement;
    /** a feature not built yet: shown (dashed, faded), but it can't be clicked or tabbed to */
    soon?: boolean;
  } = $props();
  onMount(installTooltips);
</script>
<button bind:this={el} {type} class={buttonClass({ variant, size, icon: true, danger, on, extra: [soon && 'soon', extra].filter(Boolean).join(' ') || undefined })} {title} {...rest} aria-disabled={soon ? 'true' : rest['aria-disabled']} tabindex={soon ? -1 : rest.tabindex}
  onclick={(e) => { if (soon) { e.preventDefault(); e.stopPropagation(); return; } onclick?.(e); }}>{#if icon}<Icon name={icon} />{:else if svg}{@html svg}{/if}</button>
