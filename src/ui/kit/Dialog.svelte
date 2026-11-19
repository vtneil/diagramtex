<script lang="ts" module>
  import type { Message } from '../../i18n';
  export interface DialogModel { title: string | Message; message: string | Message; input: string | null; multiline: boolean; ok: string | Message; cancel: string | Message | null; danger: boolean; readonly: boolean; placeholder: string; preview: boolean }
</script>
<script lang="ts">
  // The app's dialog, in place of the browser's alert / confirm / prompt: TD.confirm, TD.prompt and TD.alert
  // (src/ui/services/dialog.ts) open it and handle its keys and focus. The title asks the question; the buttons name
  // the action; a destructive one is red and the focus starts on Cancel. A prompt's field is the person's: it
  // starts with the given text and is never written again (liveValue would put the model's text back on blur, and
  // pressing OK with the mouse, which blurs the field first, would then send the original text).
  import { caption, locale } from '../../i18n';
  import Button from './Button.svelte';
  const initial = (text: string | null) => (node: HTMLInputElement | HTMLTextAreaElement) => { node.value = text ?? ''; };
  let { model }: { model: DialogModel } = $props();
</script>
<div class="tdd-box" role={model.danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="tddTitle" aria-describedby={model.message ? 'tddMsg' : undefined}>
  <h2 id="tddTitle">{caption(model.title, $locale)}</h2>{#if model.message}<p id="tddMsg">{caption(model.message, $locale)}</p>{/if}
  {#if model.input !== null}{#if model.multiline}<textarea class="tdd-in" rows="8" spellcheck="false" aria-labelledby="tddTitle" readonly={model.readonly} {@attach initial(model.input)}></textarea>{:else}<input class="tdd-in" type="text" aria-labelledby="tddTitle" {@attach initial(model.input)} spellcheck="false" autocomplete="off" readonly={model.readonly} placeholder={model.placeholder || undefined}>{/if}{#if model.preview}<div class="tdd-pv" aria-live="polite"></div>{/if}{/if}
  <div class="tdd-btns">{#if model.cancel}<Button data-r="0">{caption(model.cancel, $locale)}</Button>{/if}<Button data-r="1" variant={model.danger ? 'default' : 'primary'} danger={model.danger}>{caption(model.ok, $locale)}</Button></div>
</div>
