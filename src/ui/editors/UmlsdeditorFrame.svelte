<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="sdTitle" style="width:min(1600px,97vw);height:min(900px,93vh)">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><rect x="3" y="2" width="9" height="5" rx="1"/><rect x="20" y="2" width="9" height="5" rx="1"/><path d="M7.5 7v15M24.5 7v15" stroke-dasharray="1.5 1.5"/><path d="M7.5 11h15M20 9l3 2-3 2M24.5 17h-15" /><path d="M12 15l-3 2 3 2"/></svg></span>
      <strong id="sdTitle">{t("ui.sequence.diagram", "Sequence diagram", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ue="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ue="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-ue="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-ue="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-ue="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-ue="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list sd-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg sd-svg" aria-label={t("ui.sequence.diagram", "Sequence diagram", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.pgf.umlsd", "pgf-umlsd", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-ue="copy" title={t("ui.copy.the.pgf.umlsd.code", "Copy the pgf-umlsd code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("ui.pgf.umlsd.code", "pgf-umlsd code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
