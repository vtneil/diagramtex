<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="graph" act="ge" title={t("ui.graph", "Graph", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><circle cx="6" cy="17" r="3.5"/><circle cx="16" cy="6" r="3.5" class="a1"/><circle cx="26" cy="17" r="3.5"/><path d="M8.4 14.4l5.2-5.8M18.4 8.6l5.2 5.8M9.5 17h13"/></svg>`} drawingClass="graph-svg" drawingLabel={t("ui.graph", "Graph", {}, $locale)}
  codeTitle={t("ui.tikz.graph", "TikZ graph", {}, $locale)} codeLabel={t("ui.tikz.graph.code", "TikZ graph code", {}, $locale)} copyTitle={t("ui.copy.the.tikz.code", "Copy the TikZ code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-ge="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ge="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ge="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="layoutSpring" data-ge="spring" title={t("editor.graph.layoutTool", "Auto layout: spread the nodes out by their edges", {}, $locale)} />
        <IconButton icon="fit" data-ge="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
