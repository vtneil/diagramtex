<script lang="ts">
  // A block editor's window: one layout for all of them. The head: the block's icon and title, its tools (`tools`,
  // flat IconButtons and Separators), a spacer, then Cancel and Done (primary; ⌘↩). The body: the palette (search
  // over a list of things to place), the stage (the drawing and its tip line), and the side (properties over the
  // code: package, count, Copy, an optional note, the code, a message line). Every block editor opens at the same size,
  // up to 1600×900 (kit.css, .cz-box).
  //
  // Today each editor's controller (src/editors/*editor.ts) fills this markup itself, finding its parts by class and
  // its buttons by `data-<act>` (data-cz="done"), so the frame draws exactly that markup, empty; the palette is the
  // kit's Palette, mounted into the empty `.cz-pal` by the controller (src/editors/editor-palette.svelte.ts). An
  // editor driven by Svelte passes its own `palette`, `stage` or `side` instead (Palette, CodePane).
  import type { Snippet } from 'svelte';
  import { t, locale } from '../../i18n';
  import Button from './Button.svelte';
  import Spacer from './Spacer.svelte';
  import Badge from './Badge.svelte';
  let { name, act, title, icon, iconId, tools, drawingClass, drawingLabel, propsId,
    codeTitle, codeTitleClass, codeLabel, copyTitle, codeNote, palette, stage, side }: {
    /** the id prefix: `${name}Title` names the dialog */
    name: string;
    /** the controller's action attribute: `data-${act}` on Cancel, Done, Copy */
    act: string;
    title: string;
    /** the block's 32×24 line icon (markup) */
    icon: string; iconId?: string;
    tools?: Snippet;
    /** an extra class for the drawing (`qe-svg`) */
    drawingClass?: string; drawingLabel?: string;
    propsId?: string;
    /** the code's package ("circuitikz") */
    codeTitle?: string; codeTitleClass?: string; codeLabel?: string; copyTitle?: string; codeNote?: string;
    palette?: Snippet; stage?: Snippet; side?: Snippet;
  } = $props();
  const data = (v: string) => ({ ['data-' + act]: v });
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby={name + 'Title'}>
    <div class="modal-head">
      <span id={iconId} class="modal-ic" aria-hidden="true">{@html icon}</span>
      <strong id={name + 'Title'}>{title}</strong>
      <div class="cz-tools">{@render tools?.()}</div>
      <Spacer />
      <div class="modal-actions">
        <Button {...data('cancel')}>{t('ui.cancel', 'Cancel', {}, $locale)}</Button>
        <Button variant="primary" {...data('done')} title="Ctrl+Enter">{t('ui.done', 'Done', {}, $locale)}</Button>
      </div>
    </div>
    <div class="cz-body">
      {#if palette}{@render palette()}{:else}<aside class="cz-pal"></aside>{/if}
      {#if stage}{@render stage()}{:else}<div class="cz-stage"><svg class={['cz-svg', drawingClass]} aria-label={drawingLabel}></svg><div class="cz-tip"></div></div>{/if}
      {#if side}{@render side()}{:else}
      <aside class="cz-side">
        <div class="cz-props" id={propsId}></div>
        <div class="cz-code">
          <div class="cz-code-head"><span class={codeTitleClass}>{codeTitle}</span><Badge class="cz-count" /><Button variant="flat" {...data('copy')} title={copyTitle}>{t('ui.copy', 'Copy', {}, $locale)}</Button></div>
          {#if codeNote}<div class="cz-code-note">{codeNote}</div>{/if}
          <textarea wrap="off" spellcheck="false" aria-label={codeLabel}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>{/if}
    </div>
  </div>
