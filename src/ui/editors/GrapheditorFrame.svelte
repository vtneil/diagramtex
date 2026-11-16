<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="graphTitle" style="width:min(1600px,97vw);height:min(900px,93vh)">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><circle cx="6" cy="17" r="3.5"/><circle cx="16" cy="6" r="3.5" class="a1"/><circle cx="26" cy="17" r="3.5"/><path d="M8.4 14.4l5.2-5.8M18.4 8.6l5.2 5.8M9.5 17h13"/></svg></span>
      <strong id="graphTitle">{t("ui.graph", "Graph", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ge="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ge="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-ge="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ge="spring" title={t("editor.graph.layoutTool", "Auto layout: spread the nodes out by their edges", {}, $locale)}>{@html model.p5}</button>
        <button class="icon flat" data-ge="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p6}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-ge="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-ge="done" title="{model.p7}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list graph-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg graph-svg" aria-label={t("ui.graph", "Graph", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.tikz.graph", "TikZ graph", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ge="copy" title={t("ui.copy.the.tikz.code", "Copy the TikZ code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("ui.tikz.graph.code", "TikZ graph code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
