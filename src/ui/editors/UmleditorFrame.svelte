<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="umlTitle" style="width:min(1600px,97vw);height:min(900px,93vh)">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><rect x="2" y="3" width="12" height="18" rx="1"/><path d="M2 8h12M2 14h12M14 12h5M19 9l3 3-3 3z"/><rect x="22" y="7" width="8" height="10" rx="1"/><path d="M22 11h8"/></svg></span>
      <strong id="umlTitle">{t("editor.uml.title", "Class diagram", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ue="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ue="undo" title={t("editor.commonA.undo", "Undo ({keys})", { keys: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-ue="redo" title={t("editor.commonA.redo", "Redo ({keys})", { keys: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ue="fit" title={t("editor.commonA.fitDiagram", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ue="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-ue="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("editor.commonA.search", "Search", {}, $locale)} aria-label={t("editor.commonA.searchPalette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list uml-list" role="group" aria-label={t("editor.commonA.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg uml-svg" aria-label={t("editor.uml.title", "Class diagram", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("editor.uml.lang", "pgf-umlcd", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ue="copy" title={t("editor.uml.copyCode", "Copy the pgf-umlcd code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea spellcheck="false" aria-label={t("editor.uml.code", "pgf-umlcd code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
