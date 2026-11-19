<script lang="ts">
  import { onMount } from 'svelte';
  import { installTooltips } from '../services/tooltip';
  // The app's one button. A label (children), optionally led by an icon. Hooks such as data-* pass through.
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';
  import Icon from './Icon.svelte';
  import type { IconName } from './icons';
  import { buttonClass, type ButtonVariant, type ButtonSize } from './button';
  let { size = 'ctl', variant = 'default', danger = false, icon, class: extra, type = 'button', el = $bindable(), soon = false, onclick, children, ...rest }: Omit<HTMLButtonAttributes, 'class'> & {
    variant?: ButtonVariant; size?: ButtonSize; danger?: boolean; icon?: IconName; class?: string; el?: HTMLButtonElement;
    /** a feature not built yet: shown (dashed, faded), but it can't be clicked or tabbed to */
    soon?: boolean; children?: Snippet;
  } = $props();
  onMount(installTooltips);
</script>
<button bind:this={el} {type} class={buttonClass({ variant, size, withIcon: !!icon && !!children, danger, extra: [soon && 'soon', extra].filter(Boolean).join(' ') || undefined }) || undefined} {...rest} aria-disabled={soon ? 'true' : rest['aria-disabled']} tabindex={soon ? -1 : rest.tabindex}
  onclick={(e) => { if (soon) { e.preventDefault(); e.stopPropagation(); return; } onclick?.(e); }}>{#if icon}<Icon name={icon} />{/if}{@render children?.()}</button>
