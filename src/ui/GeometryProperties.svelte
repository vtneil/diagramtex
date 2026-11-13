<script lang="ts">
  import FormRows from './FormRows.svelte';
  import type { FormRow } from './forms';
  export interface Model { title: string; rows: FormRow[] }
  let { model }: { model: Model } = $props();
</script>
<div class="sec-title">{model.title}</div><FormRows rows={model.rows}/>
