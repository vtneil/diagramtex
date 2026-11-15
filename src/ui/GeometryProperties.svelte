<script lang="ts">
  import { caption, locale, type Message } from '../i18n';
  import FormRows from './FormRows.svelte';
  import type { FormRow } from './forms';
  export interface Model { title: string | Message; rows: FormRow[] }
  let { model }: { model: Model } = $props();
</script>
<div class="sec-title">{caption(model.title, $locale)}</div><FormRows rows={model.rows}/>
