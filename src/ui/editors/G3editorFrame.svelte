<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="g3" act="ge" title={t("editor.g3.title", "3D geometry", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M10 16V3M10 16l17 2M10 16l-7 5"/><path d="M10 16l11-8" class="c1"/><path d="M14 13a5 5 0 001-4"/><path d="M21 8v10" stroke-dasharray="1.6 1.4"/></svg>`} iconId="g3Icon" drawingClass="g3-svg" drawingLabel={t("editor.g3.title", "3D geometry", {}, $locale)}
  codeTitle={t("editor.g3.lang", "tikz-3dplot", {}, $locale)} codeTitleClass="g3-lang" codeLabel={t("editor.g3.code", "tikz-3dplot code", {}, $locale)} copyTitle={t("editor.g3.copyCode", "Copy the tikz-3dplot code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-ge="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ge="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ge="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-ge="fit" title={t("editor.g3.fit", "Fit the picture in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
