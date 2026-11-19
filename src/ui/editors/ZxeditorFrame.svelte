<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="zx" act="ze" title={t("ui.zx.diagram", "ZX diagram", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M2 12h3.5M14.5 12h3M26.5 12h3.5M10 7.5C10 3 22 3 22 7.5"/><circle cx="10" cy="12" r="4.5" class="a1"/><circle cx="22" cy="12" r="4.5"/><rect x="14" y="1.5" width="4" height="4" class="a1"/></svg>`} drawingClass="ze-svg" drawingLabel={t("ui.zx.diagram", "ZX diagram", {}, $locale)}
  codeTitle={t("ui.zx.calculus", "zx-calculus", {}, $locale)} codeLabel={t("ui.zx.calculus.code", "zx-calculus code", {}, $locale)} copyTitle={t("ui.copy.the.zx.code", "Copy the ZX code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="select" data-ze="select" aria-pressed="true" title={t('editor.zx.selectTool', 'Select and move (V)', {}, $locale)} />
        <IconButton icon="wire" data-ze="wire" aria-pressed="false" title={t('editor.zx.wireTool', 'Draw wire (W)', {}, $locale)} />
        <Separator />
        <IconButton icon="rowBelow" data-ze="addrow" title={t("ui.add.a.row.at.the.bottom", "Add a row at the bottom", {}, $locale)} />
        <IconButton icon="colAfter" data-ze="addcol" title={t("ui.add.a.column.at.the.end", "Add a column at the end", {}, $locale)} />
        <IconButton icon="delete" danger data-ze="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ze="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ze="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="grid" data-ze="diagram" title={t('editor.zx.diagramSettings', 'Diagram spacing and options', {}, $locale)} />
        <IconButton icon="fit" data-ze="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
