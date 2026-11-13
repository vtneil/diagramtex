<script lang="ts">
  import type { FormRow } from '../forms';
  import FormRows from '../FormRows.svelte';
  let { model }: { model: { name: string; command: string; rows: FormRow[] } } = $props();
</script>
<div class="sec"><div class="sec-title">{model.name}</div><div class="cz-tikz"><code>{model.command}</code></div></div><div class="sec"><FormRows rows={model.rows}/></div>
