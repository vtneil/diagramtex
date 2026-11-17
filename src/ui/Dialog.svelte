<script lang="ts">
  import { t, caption, locale, type Message } from '../i18n';
  // The field is the person's: it starts with the given text and is never written again. (liveValue would put the
  // model's text back on blur, and nothing writes the typing into the model, so pressing OK with the mouse, which
  // blurs the field first, would send the original text.)
  const initial = (text: string | null) => (node: HTMLInputElement | HTMLTextAreaElement) => { node.value = text ?? ''; };
  export interface Model { title: string | Message; message: string | Message; input: string | null; multiline: boolean; ok: string | Message; cancel: string | Message | null; danger: boolean; readonly: boolean; placeholder: string; preview: boolean }
  let { model }: { model: Model } = $props();
</script>
<div class="tdd-box" role={model.danger ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="tddTitle" aria-describedby="tddMsg">
  <h2 id="tddTitle">{caption(model.title, $locale)}</h2>{#if model.message}<p id="tddMsg">{caption(model.message, $locale)}</p>{/if}{#if model.input !== null}{#if model.multiline}<textarea class="tdd-in" rows="8" spellcheck="false" readonly={model.readonly} {@attach initial(model.input)}></textarea>{:else}<input class="tdd-in" type="text" {@attach initial(model.input)} spellcheck="false" autocomplete="off" readonly={model.readonly} placeholder={model.placeholder || undefined}>{/if}{#if model.preview}<div class="tdd-pv" aria-live="polite"></div>{/if}{/if}
  <div class="tdd-btns">{#if model.cancel}<button type="button" data-r="0">{caption(model.cancel, $locale)}</button>{/if}<button type="button" data-r="1" class={model.danger ? 'danger' : 'primary'}>{caption(model.ok, $locale)}</button></div></div>
