<script lang="ts">
  import { liveValue } from './live-value';
  export interface Model { title: string; message: string; input: string | null; multiline: boolean; ok: string; cancel: string | null; danger: boolean; readonly: boolean; placeholder: string }
  let { model }: { model: Model } = $props();
</script>
<div class="tdd-box" role={model.danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="tddTitle" aria-describedby="tddMsg">
  <h2 id="tddTitle">{model.title}</h2>{#if model.message}<p id="tddMsg">{model.message}</p>{/if}{#if model.input !== null}{#if model.multiline}<textarea class="tdd-in" rows="8" spellcheck="false" readonly={model.readonly} {@attach liveValue(model.input)}></textarea>{:else}<input class="tdd-in" type="text" {@attach liveValue(model.input)} spellcheck="false" autocomplete="off" readonly={model.readonly} placeholder={model.placeholder || undefined}>{/if}{/if}
  <div class="tdd-btns">{#if model.cancel}<button type="button" data-r="0">{model.cancel}</button>{/if}<button type="button" data-r="1" class={model.danger ? 'danger' : 'primary'}>{model.ok}</button></div></div>
