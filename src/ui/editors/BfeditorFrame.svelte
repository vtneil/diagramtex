<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="bfTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M3 9h26v12H3zM10 9v12M15 9v12M22 9v12"/><path d="M3 5.5v1M10 5.5v1M15 5.5v1M22 5.5v1M29 5.5v1" class="a1"/></svg></span>
      <strong id="bfTitle">{t("editor.bf.title", "Bit field", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-be="delete" title={t("editor.bf.delete", "Delete the selected field or group (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-be="undo" title={t("editor.commonA.undo", "Undo ({keys})", { keys: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-be="redo" title={t("editor.commonA.redo", "Redo ({keys})", { keys: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-be="fit" title={t("editor.bf.fit", "Fit the field in view (F)", {}, $locale)}>{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-be="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-be="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("editor.commonA.search", "Search", {}, $locale)} aria-label={t("editor.commonA.searchPalette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list bf-list" role="group" aria-label={t("editor.commonA.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg bf-svg" aria-label={t("editor.bf.title", "Bit field", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("editor.bf.lang", "bytefield", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-be="copy" title={t("editor.bf.copyCode", "Copy the bit field code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea spellcheck="false" aria-label={t("editor.bf.code", "bytefield code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
