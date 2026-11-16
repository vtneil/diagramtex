<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="g3Title">
    <div class="modal-head">
      <span id="g3Icon" class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M10 16V3M10 16l17 2M10 16l-7 5"/><path d="M10 16l11-8" class="c1"/><path d="M14 13a5 5 0 001-4"/><path d="M21 8v10" stroke-dasharray="1.6 1.4"/></svg></span>
      <strong id="g3Title">{t("editor.g3.title", "3D geometry", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ge="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ge="undo" title={t("editor.commonA.undo", "Undo ({keys})", { keys: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-ge="redo" title={t("editor.commonA.redo", "Redo ({keys})", { keys: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ge="fit" title={t("editor.g3.fit", "Fit the picture in view (0)", {}, $locale)}>{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-ge="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-ge="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("editor.commonA.search", "Search", {}, $locale)} aria-label={t("editor.commonA.searchPalette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list g3-list" role="group" aria-label={t("editor.commonA.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg g3-svg" aria-label={t("editor.g3.title", "3D geometry", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span class="g3-lang">{t("editor.g3.lang", "tikz-3dplot", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ge="copy" title={t("editor.g3.copyCode", "Copy the tikz-3dplot code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("editor.g3.code", "tikz-3dplot code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
