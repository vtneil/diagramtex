<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="cd" act="ce" title={t("editor.cd.title", "Commutative diagram", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><text x="3" y="8" font-size="7" font-style="italic">A</text><text x="24" y="8" font-size="7" font-style="italic">B</text><text x="3" y="22" font-size="7" font-style="italic">C</text><text x="24" y="22" font-size="7" font-style="italic">D</text><path d="M9 6h12M6 10v7M27 10v7M9 20h12"/></svg>`} iconId="cdIcon" drawingClass="ce-svg" drawingLabel={t("editor.cd.title", "Commutative diagram", {}, $locale)}
  codeTitle={t("editor.cd.lang", "tikz-cd", {}, $locale)} codeLabel={t("editor.cd.code", "tikz-cd code", {}, $locale)} copyTitle={t("editor.cd.copyCode", "Copy the tikz-cd code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="rowBelow" data-ce="addrow" title={t("editor.cd.addRow", "Add a row at the bottom", {}, $locale)} />
        <IconButton icon="colAfter" data-ce="addcol" title={t("editor.cd.addColumn", "Add a column at the end", {}, $locale)} />
        <IconButton icon="delete" danger data-ce="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ce="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ce="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-ce="fit" title={t("editor.commonA.fitDiagram", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
