<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="cdTitle">
    <div class="modal-head">
      <span id="cdIcon" class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><text x="3" y="8" font-size="7" font-style="italic">A</text><text x="24" y="8" font-size="7" font-style="italic">B</text><text x="3" y="22" font-size="7" font-style="italic">C</text><text x="24" y="22" font-size="7" font-style="italic">D</text><path d="M9 6h12M6 10v7M27 10v7M9 20h12"/></svg></span>
      <strong id="cdTitle">{t("editor.cd.title", "Commutative diagram", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat" data-ce="addrow" title={t("editor.cd.addRow", "Add a row at the bottom", {}, $locale)}>{@html model.p0}</button>
        <button class="icon flat" data-ce="addcol" title={t("editor.cd.addColumn", "Add a column at the end", {}, $locale)}>{@html model.p1}</button>
        <button class="icon flat danger" data-ce="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ce="undo" title={t("editor.commonA.undo", "Undo ({keys})", { keys: model.p3 + "Z" }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ce="redo" title={t("editor.commonA.redo", "Redo ({keys})", { keys: model.p5 }, $locale)}>{@html model.p6}</button>
        <button class="icon flat" data-ce="fit" title={t("editor.commonA.fitDiagram", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ce="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-ce="done" title="{model.p8}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("editor.commonA.search", "Search", {}, $locale)} aria-label={t("editor.commonA.searchPalette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list ce-list" role="group" aria-label={t("editor.commonA.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg ce-svg" aria-label={t("editor.cd.title", "Commutative diagram", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("editor.cd.lang", "tikz-cd", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ce="copy" title={t("editor.cd.copyCode", "Copy the tikz-cd code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea spellcheck="false" aria-label={t("editor.cd.code", "tikz-cd code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
