<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="tm" act="te" title={t("ui.timing.diagram", "Timing diagram", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M2 9h4V3h6v6h6V3h6v6h6"/><path d="M2 17l2-3h10l2 3-2 3H4z"/><path d="M16 17l2-3h10M16 17l2 3h10"/></svg>`} drawingClass="tm-svg" drawingLabel={t("ui.timing.diagram", "Timing diagram", {}, $locale)}
  codeTitle={t("ui.tikz.timing", "tikz-timing", {}, $locale)} codeLabel={t("ui.tikz.timing.code", "tikz-timing code", {}, $locale)} copyTitle={t("ui.copy.the.timing.code", "Copy the timing code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-te="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-te="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-te="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-te="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
