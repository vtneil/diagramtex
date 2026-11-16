<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="tmTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M2 9h4V3h6v6h6V3h6v6h6"/><path d="M2 17l2-3h10l2 3-2 3H4z"/><path d="M16 17l2-3h10M16 17l2 3h10"/></svg></span>
      <strong id="tmTitle">{t("ui.timing.diagram", "Timing diagram", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-te="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-te="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-te="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-te="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-te="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-te="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list tm-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg tm-svg" aria-label={t("ui.timing.diagram", "Timing diagram", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.tikz.timing", "tikz-timing", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-te="copy" title={t("ui.copy.the.timing.code", "Copy the timing code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("ui.tikz.timing.code", "tikz-timing code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
