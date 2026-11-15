<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="phyTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M3 12h26"/><path d="M14 3c2.2 3 2.2 15 0 18M14 3c-2.2 3-2.2 15 0 18"/><path d="M4 6l10 6 12 6" class="c1"/></svg></span>
      <strong id="phyTitle">{t("ui.physics.figure", "Physics figure", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-pe="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <button class="icon flat" data-pe="dup" title="Duplicate the selection ({model.p1}D)">{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-pe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p3 + "Z" }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-pe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p5 }, $locale)}>{@html model.p6}</button>
        <button class="icon flat" data-pe="fit" title={t("ui.fit.the.figure.in.view.0", "Fit the figure in view (0)", {}, $locale)}>{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-pe="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-pe="done" title="{model.p8}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list phy-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg phy-svg" aria-label={t("ui.physics.figure", "Physics figure", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.source", "Source", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-pe="copy" title={t("ui.copy.this.source.diagramtex.s.own.syntax.not.latex", "Copy this source (DiagramTeX's own syntax, not LaTeX)", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <div class="cz-code-note">{t("ui.diagramtex.s.own.syntax.not.latex.it.won.t.compile.on.its.own.the.latex.comes.fr", "DiagramTeX's own syntax, not LaTeX: it won't compile on its own. The LaTeX comes from Export, or Copy TikZ Code in the side panel.", {}, $locale)}</div>
          <textarea spellcheck="false" aria-label={t("ui.physics.source", "Physics source", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
