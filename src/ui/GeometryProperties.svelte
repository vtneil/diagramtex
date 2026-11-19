<script lang="ts">
  import type { Message } from '../i18n';
  import FormRows from './FormRows.svelte';
  import type { FormRow } from './forms';
  export interface Model { title: string | Message; rows: FormRow[] }
  // the rows of the Geometry section; its title is the section's (MainProperties)
  let { model }: { model: Model } = $props();
</script>
<FormRows rows={model.rows}/>
