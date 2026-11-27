<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="network" act="ne" title={t("ui.network", "Network", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M8 7l14-2M8 7l4 11M22 5l-10 13M22 5l5 12M12 18l15-1"/><circle cx="8" cy="7" r="2.6" class="a1"/><circle cx="22" cy="5" r="2.6" class="a1"/><circle cx="12" cy="18" r="2.6" class="a1"/><circle cx="27" cy="17" r="2.6" class="a1"/></svg>`} drawingClass="network-svg" drawingLabel={t("ui.network", "Network", {}, $locale)}
  codeTitle={t("ui.tikz.network", "tikz-network", {}, $locale)} codeLabel={t("ui.tikz.network.code", "tikz-network code", {}, $locale)} copyTitle={t("ui.copy.the.tikz.code", "Copy the TikZ code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-ne="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ne="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ne="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="layoutSpring" data-ne="spring" title={t("editor.network.springTitle", "Auto layout: place the vertices by their edges (spring layout)", {}, $locale)} />
        <IconButton icon="importFile" data-ne="adddata" title={t("editor.network.addDataTitle", "Add a CSV data file of vertices or edges", {}, $locale)} />
        <IconButton icon="fit" data-ne="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
