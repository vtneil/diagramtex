<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="km" act="ke" title={t("editor.km.title", "Karnaugh map", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M6 4h20v16H6zM11 4v16M16 4v16M21 4v16M6 12h20"/><rect x="12.5" y="5.5" width="7" height="13" rx="2.5"/></svg>`} drawingClass="km-svg" drawingLabel={t("editor.km.title", "Karnaugh map", {}, $locale)}
  codeTitle={t("editor.km.lang", "karnaugh-map", {}, $locale)} codeLabel={t("editor.km.code", "karnaugh-map code", {}, $locale)} copyTitle={t("editor.km.copyCode", "Copy the Karnaugh map code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-ke="delete" title={t("editor.km.delete", "Delete the selected group (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ke="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ke="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-ke="fit" title={t("editor.km.fit", "Fit the map in view (F)", {}, $locale)} />
  {/snippet}
</EditorFrame>
