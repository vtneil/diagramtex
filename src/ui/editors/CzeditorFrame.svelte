<script lang="ts">
  import { t, locale } from '../../i18n';
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8' | 'p9' | 'p10' | 'p11', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="czTitle">
    <div class="modal-head">
      <span class="modal-ic" aria-hidden="true"><svg viewBox="0 0 32 24"><path d="M4 18V6h7M21 6h7v12H4"/><path d="M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3" class="c1"/><path d="M14 18v-3M18 18v-3" class="c1"/><path d="M12 15h8M12 21h8" class="c1"/></svg></span>
      <strong id="czTitle">{t("ui.circuit", "Circuit", {}, $locale)}</strong>
      <div class="cz-tools">
        <button class="icon flat" data-cz="select" title={t("ui.select.and.move.v", "Select and move (V)", {}, $locale)}>{@html model.p0}</button>
        <button class="icon flat" data-cz="wire" title={t("ui.wire.w.drag.between.points.ends.snap.to.pins", "Wire (W): drag between points; ends snap to pins", {}, $locale)}>{@html model.p1}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-cz="rotate" title={t("ui.rotate.90.r", "Rotate 90° (R)", {}, $locale)}>{@html model.p2}</button>
        <button class="icon flat" data-cz="mirrory" title={t("ui.mirror.left.to.right.x", "Mirror left to right (X)", {}, $locale)}>{@html model.p3}</button>
        <button class="icon flat" data-cz="mirrorx" title={t("ui.mirror.top.to.bottom.y", "Mirror top to bottom (Y)", {}, $locale)}>{@html model.p4}</button>
        <button class="icon flat danger" data-cz="delete" title={t("ui.delete.variant1", "Delete (⌫)", {}, $locale)}>{@html model.p5}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-cz="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: model.p6 + "Z" }, $locale)}>{@html model.p7}</button>
        <button class="icon flat" data-cz="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: model.p8 }, $locale)}>{@html model.p9}</button>
        <button class="icon flat" data-cz="fit" title={t("ui.fit.the.circuit.in.view.0", "Fit the circuit in view (0)", {}, $locale)}>{@html model.p10}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <div class="modal-actions">
        <button data-cz="cancel">{t("ui.cancel", "Cancel", {}, $locale)}</button>
        <button class="primary" data-cz="done" title="{model.p11}Enter">{t("ui.done", "Done", {}, $locale)}</button>
      </div>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder={t("ui.search.parts", "Search parts", {}, $locale)} aria-label={t("ui.search.parts", "Search parts", {}, $locale)} spellcheck="false"></div>
        <div class="cz-list" role="group" aria-label={t("ui.elements", "Elements", {}, $locale)}></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg" aria-label={t("ui.circuit.drawing", "Circuit drawing", {}, $locale)}></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props" id="czProps"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>{t("ui.circuitikz", "circuitikz", {}, $locale)}</span><small class="cz-count"></small><button class="flat" data-cz="copy" title={t("ui.copy.the.circuitikz.code", "Copy the circuitikz code", {}, $locale)}>{t("ui.copy", "Copy", {}, $locale)}</button></div>
          <textarea wrap="off" spellcheck="false" aria-label={t("ui.circuitikz.code", "circuitikz code", {}, $locale)}></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
