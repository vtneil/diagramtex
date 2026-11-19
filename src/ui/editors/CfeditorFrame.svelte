<script lang="ts">
  import GridStyleButtons from '../GridStyleButtons.svelte';
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="cf" act="ce" title={t("editor.cf.title", "Chemistry", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M9 4.5l6 3.5v7l-6 3.5-6-3.5V8z"/><path d="M11 7.4l2.4 1.4M5 9.5v4.2"/><path d="M15 15l5 3"/><path d="M21 12h8M26 9.5l3 2.5-3 2.5"/></svg>`} drawingClass="cf-svg" drawingLabel={t("editor.cf.title", "Chemistry", {}, $locale)}
  codeTitle={t("editor.cf.lang", "chemfig", {}, $locale)} codeLabel={t("editor.cf.code", "chemfig code", {}, $locale)} copyTitle={t("editor.cf.copyCode", "Copy the chemfig code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-ce="delete" title={t("editor.commonA.deleteSelection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-ce="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-ce="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-ce="fit" title={t("editor.cf.fit", "Fit the drawing in view (0)", {}, $locale)} />
        <Separator />
        <GridStyleButtons id="chemGridStyle" />
  {/snippet}
</EditorFrame>
