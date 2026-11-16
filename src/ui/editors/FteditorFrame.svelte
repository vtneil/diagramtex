<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="ftTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><rect x="12" y="2" width="8" height="6" class="a1"/><path d="M16 8v3M7 11h18M7 11v3M25 11v3M16 11v3"/><rect x="4" y="14" width="6" height="6"/><rect x="13" y="14" width="6" height="6"/><rect x="22" y="14" width="6" height="6"/></svg></span>
      <strong id="ftTitle">{t("ui.tree", "Tree", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat" data-fe="child" title={t("ui.add.a.child.tab", "Add a child (Tab)", {}, $locale)}>{@html model.p0}</button>
        <button class="icon flat" data-fe="sib" title={t("ui.add.a.sibling.enter", "Add a sibling (Enter)", {}, $locale)}>{@html model.p1}</button>
        <button class="icon flat danger" data-fe="delete" title={t("ui.delete.the.selected.nodes.and.what.hangs.from.them", "Delete the selected nodes and what hangs from them (⌫)", {}, $locale)}>{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-fe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p3 + "Z" }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-fe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p5 }, $locale)}>{@html model.p6}</button>
        <button class="icon flat" data-fe="fit" title={t("ui.fit.the.tree.in.view.0", "Fit the tree in view (0)", {}, $locale)}>{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-fe="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-fe="done" title="{model.p8}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list fe-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg fe-svg" aria-label={t("ui.tree", "Tree", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.forest", "forest", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-fe="copy" title={t("ui.copy.the.forest.code", "Copy the forest code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("ui.forest.code", "forest code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
