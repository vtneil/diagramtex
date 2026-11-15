<script lang="ts">
  import GridStyleButtons from '../GridStyleButtons.svelte';
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="cfTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M9 4.5l6 3.5v7l-6 3.5-6-3.5V8z"/><path d="M11 7.4l2.4 1.4M5 9.5v4.2"/><path d="M15 15l5 3"/><path d="M21 12h8M26 9.5l3 2.5-3 2.5"/></svg></span>
      <strong id="cfTitle">{t("editor.cf.title", "Chemistry", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ce="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ce="undo" title={t("editor.commonA.undo", "Undo ({keys})", { keys: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-ce="redo" title={t("editor.commonA.redo", "Redo ({keys})", { keys: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ce="fit" title={t("editor.cf.fit", "Fit the drawing in view (0)", {}, $locale)}>{@html model.p5}</button>
        <span class="cz-sep"></span>
        <GridStyleButtons id="chemGridStyle" />
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ce="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-ce="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("editor.commonA.search", "Search", {}, $locale)} aria-label={t("editor.commonA.searchPalette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list cf-list" role="group" aria-label={t("editor.commonA.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg cf-svg" aria-label={t("editor.cf.title", "Chemistry", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("editor.cf.lang", "chemfig", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ce="copy" title={t("editor.cf.copyCode", "Copy the chemfig code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea spellcheck="false" aria-label={t("editor.cf.code", "chemfig code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
