<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="ft" act="fe" title={t("ui.tree", "Tree", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><rect x="12" y="2" width="8" height="6" class="a1"/><path d="M16 8v3M7 11h18M7 11v3M25 11v3M16 11v3"/><rect x="4" y="14" width="6" height="6"/><rect x="13" y="14" width="6" height="6"/><rect x="22" y="14" width="6" height="6"/></svg>`} drawingClass="fe-svg" drawingLabel={t("ui.tree", "Tree", {}, $locale)}
  codeTitle={t("ui.forest", "forest", {}, $locale)} codeLabel={t("ui.forest.code", "forest code", {}, $locale)} copyTitle={t("ui.copy.the.forest.code", "Copy the forest code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="treeChild" data-fe="child" title={t("ui.add.a.child.tab", "Add a child (Tab)", {}, $locale)} />
        <IconButton icon="treeSibling" data-fe="sib" title={t("ui.add.a.sibling.enter", "Add a sibling (Enter)", {}, $locale)} />
        <IconButton icon="delete" danger data-fe="delete" title={t("ui.delete.the.selected.nodes.and.what.hangs.from.them", "Delete the selected nodes and what hangs from them (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-fe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-fe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-fe="fit" title={t("ui.fit.the.tree.in.view.0", "Fit the tree in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
