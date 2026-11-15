<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="zxTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M2 12h3.5M14.5 12h3M26.5 12h3.5M10 7.5C10 3 22 3 22 7.5"/><circle cx="10" cy="12" r="4.5" class="a1"/><circle cx="22" cy="12" r="4.5"/><rect x="14" y="1.5" width="4" height="4" class="a1"/></svg></span>
      <strong id="zxTitle">{t("ui.zx.diagram", "ZX diagram", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat" data-ze="addrow" title={t("ui.add.a.row.at.the.bottom", "Add a row at the bottom", {}, $locale)}>{@html model.p0}</button>
        <button class="icon flat" data-ze="addcol" title={t("ui.add.a.column.at.the.end", "Add a column at the end", {}, $locale)}>{@html model.p1}</button>
        <button class="icon flat danger" data-ze="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ze="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p3 + "Z" }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ze="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p5 }, $locale)}>{@html model.p6}</button>
        <button class="icon flat" data-ze="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ze="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-ze="done" title="{model.p8}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list ze-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg ze-svg" aria-label={t("ui.zx.diagram", "ZX diagram", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.zx.calculus", "zx-calculus", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ze="copy" title={t("ui.copy.the.zx.code", "Copy the ZX code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea spellcheck="false" aria-label={t("ui.zx.calculus.code", "zx-calculus code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
