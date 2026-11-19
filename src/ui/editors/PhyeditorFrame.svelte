<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="phy" act="pe" title={t("ui.physics.figure", "Physics figure", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M3 12h26"/><path d="M14 3c2.2 3 2.2 15 0 18M14 3c-2.2 3-2.2 15 0 18"/><path d="M4 6l10 6 12 6" class="c1"/></svg>`} drawingClass="phy-svg" drawingLabel={t("ui.physics.figure", "Physics figure", {}, $locale)}
  codeTitle={t("ui.source", "Source", {}, $locale)} codeLabel={t("ui.physics.source", "Physics source", {}, $locale)} copyTitle={t("ui.copy.this.source.diagramtex.s.own.syntax.not.latex", "Copy this source (DiagramTeX's own syntax, not LaTeX)", {}, $locale)} codeNote={t("ui.diagramtex.s.own.syntax.not.latex.it.won.t.compile.on.its.own.the.latex.comes.fr", "DiagramTeX's own syntax, not LaTeX: it won't compile on its own. The LaTeX comes from Export, or Copy TikZ Code in the side panel.", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-pe="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <IconButton icon="duplicate" data-pe="dup" title={t("editor.phy.duplicateSelection", "Duplicate the selection (Ctrl+D)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-pe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-pe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-pe="fit" title={t("ui.fit.the.figure.in.view.0", "Fit the figure in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
