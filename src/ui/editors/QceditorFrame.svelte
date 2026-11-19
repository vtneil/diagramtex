<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="qc" act="qe" title={t("editor.qc.title", "Quantum circuit", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><path d="M2 7h28M2 17h28M14 7v10"/><rect x="5" y="3" width="7" height="8" class="a1"/><circle cx="14" cy="7" r="1.6" style="fill:var(--graphite)"/><circle cx="14" cy="17" r="3.2" fill="none"/><path d="M14 14v6M11 17h6"/><rect x="21" y="13" width="8" height="8" class="a1"/><path d="M22.5 19.5a2.5 2.5 0 015 0M25 19.5l1.8-3"/></svg>`} drawingClass="qe-svg" drawingLabel={t("editor.qc.title", "Quantum circuit", {}, $locale)}
  codeTitle={t("editor.qc.lang", "quantikz", {}, $locale)} codeLabel={t("editor.qc.code", "quantikz code", {}, $locale)} copyTitle={t("editor.qc.copyCode", "Copy the quantikz code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="rowBelow" data-qe="addrow" title={t("editor.qc.addWire", "Add a wire at the bottom", {}, $locale)} />
        <IconButton icon="colAfter" data-qe="addcol" title={t("editor.qc.addStep", "Add a step at the end", {}, $locale)} />
        <IconButton icon="delete" danger data-qe="delete" title={t("editor.qc.clearCells", "Clear the selected cells (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-qe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-qe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="fit" data-qe="fit" title={t("editor.qc.fit", "Fit the circuit in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
