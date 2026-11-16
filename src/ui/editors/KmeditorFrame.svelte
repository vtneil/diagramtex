<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="kmTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M6 4h20v16H6zM11 4v16M16 4v16M21 4v16M6 12h20"/><rect x="12.5" y="5.5" width="7" height="13" rx="2.5"/></svg></span>
      <strong id="kmTitle">{t("editor.km.title", "Karnaugh map", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ke="delete" title={t("editor.km.delete", "Delete the selected group (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ke="undo" title={t("editor.commonA.undo", "Undo ({keys})", { keys: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-ke="redo" title={t("editor.commonA.redo", "Redo ({keys})", { keys: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ke="fit" title={t("editor.km.fit", "Fit the map in view (F)", {}, $locale)}>{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-ke="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-ke="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("editor.commonA.search", "Search", {}, $locale)} aria-label={t("editor.commonA.searchPalette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list km-list" role="group" aria-label={t("editor.commonA.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg km-svg" aria-label={t("editor.km.title", "Karnaugh map", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("editor.km.lang", "karnaugh-map", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ke="copy" title={t("editor.km.copyCode", "Copy the Karnaugh map code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("editor.km.code", "karnaugh-map code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
