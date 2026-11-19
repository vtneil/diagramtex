<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="bf" act="be" title={t("editor.bf.title", "Bit field", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M3 9h26v12H3zM10 9v12M15 9v12M22 9v12"/><path d="M3 5.5v1M10 5.5v1M15 5.5v1M22 5.5v1M29 5.5v1" class="a1"/></svg>`} drawingClass="bf-svg" drawingLabel={t("editor.bf.title", "Bit field", {}, $locale)}
  codeTitle={t("editor.bf.lang", "bytefield", {}, $locale)} codeLabel={t("editor.bf.code", "bytefield code", {}, $locale)} copyTitle={t("editor.bf.copyCode", "Copy the bit field code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-be="delete" title={t("editor.bf.delete", "Delete the selected field or group (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-be="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-be="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-be="fit" title={t("editor.bf.fit", "Fit the field in view (F)", {}, $locale)} />
  {/snippet}
</EditorFrame>
