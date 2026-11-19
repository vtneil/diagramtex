<script lang="ts">
  // Lines of explanation in a panel. `help`: a paragraph (12px, graphite). `hint`: a small note under a control (11px,
  // pencil). `error`: something to fix (12px, red pen), announced as it appears.
  import type { Snippet } from 'svelte';
  import type { HTMLAttributes } from 'svelte/elements';
  let { kind = 'help', class: extra, children, ...rest }: Omit<HTMLAttributes<HTMLDivElement>, 'class'> & { kind?: 'help' | 'hint' | 'error'; class?: string; children: Snippet } = $props();
</script>
<div class={[kind === 'help' ? 'help' : kind === 'hint' ? 'hint-line' : 'err', extra]} role={kind === 'error' ? 'alert' : undefined} {...rest}>{@render children()}</div>
