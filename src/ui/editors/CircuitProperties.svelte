<script lang="ts">
  import type { FormRow } from '../forms';
  import FormRows from '../FormRows.svelte';
  import { PanelSection } from '../kit';
  let { model }: { model: { name: string; command: string; rows: FormRow[] } } = $props();
</script>
<PanelSection title={model.name}><div class="cz-tikz"><code>{model.command}</code></div></PanelSection><PanelSection><FormRows rows={model.rows}/></PanelSection>
