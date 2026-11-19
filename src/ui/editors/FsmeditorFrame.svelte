<script lang="ts">
  import { t, locale } from '../../i18n';
  import { EditorFrame, IconButton, Separator } from '../kit';
</script>
<EditorFrame name="fsm" act="fe" title={t("ui.state.machine", "State machine", {}, $locale)} icon={`<svg viewBox="0 0 32 24"><circle cx="9" cy="14" r="4.5"/><circle cx="24" cy="14" r="4.5" class="a1"/><circle cx="24" cy="14" r="2.6"/><path d="M13.5 14h6M17.5 12l2 2-2 2"/><path d="M1 14h3.5M2.8 12.2l1.8 1.8-1.8 1.8"/><path d="M7.4 9.8C5.5 3.5 12.5 3.5 10.6 9.8"/></svg>`} drawingClass="fsm-svg" drawingLabel={t("ui.state.machine", "State machine", {}, $locale)}
  codeTitle={t("ui.tikz.automata", "TikZ automata", {}, $locale)} codeLabel={t("ui.tikz.automata.code", "TikZ automata code", {}, $locale)} copyTitle={t("ui.copy.the.tikz.code", "Copy the TikZ code", {}, $locale)}>
  {#snippet tools()}
        <IconButton icon="delete" danger data-fe="delete" title={t("ui.delete.the.selection", "Delete the selection (⌫)", {}, $locale)} />
        <Separator />
        <IconButton icon="undo" data-fe="undo" title={t("editor.commonB.undo", "Undo ({key})", { key: "Ctrl+Z" }, $locale)} />
        <IconButton icon="redo" data-fe="redo" title={t("editor.commonB.redo", "Redo ({key})", { key: "Ctrl+Shift+Z" }, $locale)} />
        <IconButton icon="layoutLayers" data-fe="layout" title={t("ui.auto.layout.place.the.states.in.layers.from.the.initial.state", "Auto layout: place the states in layers from the initial state", {}, $locale)} />
        <IconButton icon="fit" data-fe="fit" title={t("ui.fit.the.diagram.in.view.0", "Fit the diagram in view (0)", {}, $locale)} />
  {/snippet}
</EditorFrame>
