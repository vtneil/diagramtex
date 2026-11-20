<script lang="ts">
  // A named line icon from the registry (./icons.ts). Decorative: the control around it carries the name. `class` adds
  // to the icon's own (a state its surroundings colour, as the K-map's ok and bad marks).
  import { ICONS, type IconDef, type IconName } from './icons';
  let { name, class: extra }: { name: IconName; class?: string } = $props();
  const icon: IconDef = $derived(ICONS[name]);
</script>
<svg viewBox={icon.box ?? '0 0 20 20'} class={[icon.cls, extra]} aria-hidden="true">{@html icon.d}</svg>
