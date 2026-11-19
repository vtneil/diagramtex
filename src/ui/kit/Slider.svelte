<script lang="ts">
  import { onMount } from 'svelte';
  import { installSliders } from '../services/sliders';
  // A slider and its readout. src/ui/services/sliders.ts lets the readout be typed into, and a double click resets
  // the slider to `defaultValue` (leave it out and a double click does nothing).
  import type { HTMLInputAttributes } from 'svelte/elements';
  import { liveValue } from '../live-value';
  let { value, readout, defaultValue, ...rest }: Omit<HTMLInputAttributes, 'value' | 'type' | 'defaultValue'> & { value: string | number; readout: string; defaultValue?: number } = $props();
  onMount(installSliders);
</script>
<input type="range" data-slider-default={defaultValue} {...rest} {@attach liveValue(value)}><span class="slider-value">{readout}</span>
