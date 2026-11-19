<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="cz" act="cz" title={t("ui.circuit", "Circuit", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M4 18V6h7M21 6h7v12H4"/><path d="M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3" class="c1"/><path d="M14 18v-3M18 18v-3" class="c1"/><path d="M12 15h8M12 21h8" class="c1"/></svg>`} drawingLabel={t("ui.circuit.drawing", "Circuit drawing", {}, $locale)} propsId="czProps"
  codeTitle={t("ui.circuitikz", "circuitikz", {}, $locale)} codeLabel={t("ui.circuitikz.code", "circuitikz code", {}, $locale)} copyTitle={t("ui.copy.the.circuitikz.code", "Copy the circuitikz code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="select" data-cz="select" title={t("ui.select.and.move.v", "Select and move (V)", {}, $locale)} />
        <IconButton icon="wire" data-cz="wire" title={t("ui.wire.w.drag.between.points.ends.snap.to.pins", "Wire (W): drag between points; ends snap to pins", {}, $locale)} />
        <Separator />
        <IconButton icon="rotate" data-cz="rotate" title={t("ui.rotate.90.r", "Rotate 90° (R)", {}, $locale)} />
        <IconButton icon="mirrorH" data-cz="mirrory" title={t("ui.mirror.left.to.right.x", "Mirror left to right (X)", {}, $locale)} />
        <IconButton icon="mirrorV" data-cz="mirrorx" title={t("ui.mirror.top.to.bottom.y", "Mirror top to bottom (Y)", {}, $locale)} />
        <IconButton icon="delete" danger data-cz="delete" title={t("ui.delete.variant1", "Delete (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-cz="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-cz="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-cz="fit" title={t("ui.fit.the.circuit.in.view.0", "Fit the circuit in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
