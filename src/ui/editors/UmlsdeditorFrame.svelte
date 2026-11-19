<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="sd" act="ue" title={t("ui.sequence.diagram", "Sequence diagram", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><rect x="3" y="2" width="9" height="5" rx="1"/><rect x="20" y="2" width="9" height="5" rx="1"/><path d="M7.5 7v15M24.5 7v15" stroke-dasharray="1.5 1.5"/><path d="M7.5 11h15M20 9l3 2-3 2M24.5 17h-15" /><path d="M12 15l-3 2 3 2"/></svg>`} drawingClass="sd-svg" drawingLabel={t("ui.sequence.diagram", "Sequence diagram", {}, $locale)}
  codeTitle={t("ui.pgf.umlsd", "pgf-umlsd", {}, $locale)} codeLabel={t("ui.pgf.umlsd.code", "pgf-umlsd code", {}, $locale)} copyTitle={t("ui.copy.the.pgf.umlsd.code", "Copy the pgf-umlsd code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-ue="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ue="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ue="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-ue="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
