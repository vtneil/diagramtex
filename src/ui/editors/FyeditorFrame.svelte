<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="fyTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M3 3l7 9-7 9M29 3l-7 9 7 9"/><path d="M10 12c1-2.5 2-2.5 3 0s2 2.5 3 0 2-2.5 3 0 2 2.5 3 0" class="a1"/><path d="M5.6 6.4l2.2.2-.3-2.2M7.5 19.6l-2.2.2.3-2.2" /></svg></span>
      <strong id="fyTitle">{t("ui.feynman.diagram", "Feynman diagram", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-fe="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-fe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-fe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-fe="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-fe="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-fe="done" title="{model.p6}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list fy-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg fy-svg" aria-label={t("ui.feynman.diagram", "Feynman diagram", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.tikz.feynman", "tikz-feynman", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-fe="copy" title={t("ui.copy.the.feynman.code", "Copy the Feynman code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea spellcheck="false" aria-label={t("ui.tikz.feynman.code", "tikz-feynman code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
