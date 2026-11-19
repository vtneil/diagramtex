<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="fy" act="fe" title={t("ui.feynman.diagram", "Feynman diagram", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M3 3l7 9-7 9M29 3l-7 9 7 9"/><path d="M10 12c1-2.5 2-2.5 3 0s2 2.5 3 0 2-2.5 3 0 2 2.5 3 0" class="a1"/><path d="M5.6 6.4l2.2.2-.3-2.2M7.5 19.6l-2.2.2.3-2.2" /></svg>`} drawingClass="fy-svg" drawingLabel={t("ui.feynman.diagram", "Feynman diagram", {}, $locale)}
  codeTitle={t("ui.tikz.feynman", "tikz-feynman", {}, $locale)} codeLabel={t("ui.tikz.feynman.code", "tikz-feynman code", {}, $locale)} copyTitle={t("ui.copy.the.feynman.code", "Copy the Feynman code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-fe="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-fe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-fe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-fe="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
