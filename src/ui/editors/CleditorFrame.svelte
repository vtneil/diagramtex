<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="cl" act="le" title={t("ui.chem.lab", "Chemistry Laboratory", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M5 3v14a3 3 0 0 0 6 0V3M4 3h8"/><path d="M5 11h6"/><path d="M20 3v6l-5 10.5a1.2 1.2 0 0 0 1 1.5h12a1.2 1.2 0 0 0 1-1.5L24 9V3M19 3h6"/><path d="M17.2 15.5h9.6"/></svg>`} drawingClass="cl-svg" drawingLabel={t("ui.chem.lab.picture", "Lab picture", {}, $locale)}
  codeTitle="tikz-chemlab" codeLabel={t("ui.chem.lab.code", "tikz-chemlab code", {}, $locale)} copyTitle={t("ui.copy.the.chem.lab.code", "Copy the tikz-chemlab code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-le="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <IconButton icon="duplicate" data-le="dup" title={t("editor.phy.duplicateSelection", "Duplicate the selection (Ctrl+D)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-le="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-le="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-le="fit" title={t("ui.fit.the.picture.in.view.0", "Fit the picture in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
