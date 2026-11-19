<script lang="ts">
  // A named line icon from the registry (./icons.ts). Decorative: the control around it carries the name.
  import { ICONS, type IconDef, type IconName } from './icons';
  let { name }: { name: IconName } = $props();
  const icon: IconDef = $derived(ICONS[name]);
</script>
<svg viewBox={icon.box ?? '0 0 20 20'} class={icon.cls} aria-hidden="true">{@html icon.d}</svg>
