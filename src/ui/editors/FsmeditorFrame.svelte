<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="fsmTitle" style="width:min(1600px,97vw);height:min(900px,93vh)">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><circle cx="9" cy="14" r="4.5"/><circle cx="24" cy="14" r="4.5" class="a1"/><circle cx="24" cy="14" r="2.6"/><path d="M13.5 14h6M17.5 12l2 2-2 2"/><path d="M1 14h3.5M2.8 12.2l1.8 1.8-1.8 1.8"/><path d="M7.4 9.8C5.5 3.5 12.5 3.5 10.6 9.8"/></svg></span>
      <strong id="fsmTitle">{t("ui.state.machine", "State machine", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-fe="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)}>{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-fe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p1 + "Z" }, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-fe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p3 }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-fe="layout" title={t("ui.auto.layout.place.the.states.in.layers.from.the.initial.state", "Auto layout: place the states in layers from the initial state", {}, $locale)}>{@html model.p5}</button>
        <button class="icon flat" data-fe="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)}>{@html model.p6}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-fe="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
      <button class="primary" data-fe="done" title="{model.p7}Enter">{t("ui.done", "Done", {}, $locale)}</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search", "Search", {}, $locale)} aria-label={t("ui.search.the.palette", "Search the palette", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list fsm-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg fsm-svg" aria-label={t("ui.state.machine", "State machine", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.tikz.automata", "TikZ automata", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-fe="copy" title={t("ui.copy.the.tikz.code", "Copy the TikZ code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea spellcheck="false" aria-label={t("ui.tikz.automata.code", "TikZ automata code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
