<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="uml" act="ue" title={t("editor.uml.title", "Class diagram", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><rect x="2" y="3" width="12" height="18" rx="1"/><path d="M2 8h12M2 14h12M14 12h5M19 9l3 3-3 3z"/><rect x="22" y="7" width="8" height="10" rx="1"/><path d="M22 11h8"/></svg>`} drawingClass="uml-svg" drawingLabel={t("editor.uml.title", "Class diagram", {}, $locale)}
  codeTitle={t("editor.uml.lang", "pgf-umlcd", {}, $locale)} codeLabel={t("editor.uml.code", "pgf-umlcd code", {}, $locale)} copyTitle={t("editor.uml.copyCode", "Copy the pgf-umlcd code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-ue="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ue="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ue="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-ue="fit" title={t("editor.commonA.fitDiagram", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
