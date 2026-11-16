<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="qcTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M2 7h28M2 17h28M14 7v10"/><rect x="5" y="3" width="7" height="8" class="a1"/><circle cx="14" cy="7" r="1.6" style="fill:var(--graphite)"/><circle cx="14" cy="17" r="3.2" fill="none"/><path d="M14 14v6M11 17h6"/><rect x="21" y="13" width="8" height="8" class="a1"/><path d="M22.5 19.5a2.5 2.5 0 015 0M25 19.5l1.8-3"/></svg></span>
      <strong id="qcTitle">{t("editor.qc.title", "Quantum circuit", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat" data-qe="addrow" title={t("editor.qc.addWire", "Add a wire at the bottom", {}, $locale)}>{@html model.p0}</button>
        <button class="icon flat" data-qe="addcol" title={t("editor.qc.addStep", "Add a step at the end", {}, $locale)}>{@html model.p1}</button>
        <button class="icon flat danger" data-qe="delete" title={t("editor.qc.clearCells", "Clear the selected cells (⌫)", {}, $locale)}>{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-qe="undo" title={t("editor.commonA.undo", "Undo ({keys})", { keys: model.p3 + "Z" }, $locale)}>{@html model.p4}</button>
        <button class="icon flat" data-qe="redo" title={t("editor.commonA.redo", "Redo ({keys})", { keys: model.p5 }, $locale)}>{@html model.p6}</button>
        <button class="icon flat" data-qe="fit" title={t("editor.qc.fit", "Fit the circuit in view (0)", {}, $locale)}>{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-qe="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-qe="done" title="{model.p8}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("editor.qc.searchElements", "Search elements", {}, $locale)} aria-label={t("editor.qc.searchElements", "Search elements", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list qe-list" role="group" aria-label={t("editor.commonA.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg qe-svg" aria-label={t("editor.qc.title", "Quantum circuit", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("editor.qc.lang", "quantikz", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-qe="copy" title={t("editor.qc.copyCode", "Copy the quantikz code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("editor.qc.code", "quantikz code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
