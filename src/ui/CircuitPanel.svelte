<script lang="ts">
  import { t, locale } from '../i18n';
  import { Button, FormRow, Help, PanelSection } from './kit';
  export interface Model { parts: number; wires: number; raw: number }
  let { model }: { model: Model } = $props();
  let exportedWith = $derived(t('export.with', 'Exported with {pkg}.', {}, $locale).split('{pkg}'));
</script>
<PanelSection title={t("ui.circuitikz", "circuitikz", {}, $locale)} summary={t("circuit.summary", "{parts}, {wires}", { parts: model.parts === 1 ? t("circuit.parts1", "{n} part", { n: model.parts }, $locale) : t("circuit.parts", "{n} parts", { n: model.parts }, $locale), wires: model.wires === 1 ? t("circuit.wires1", "{n} wire", { n: model.wires }, $locale) : t("circuit.wires", "{n} wires", { n: model.wires }, $locale) }, $locale)}>
  <FormRow bare><Button variant="primary" class="wide" data-act="editcz">{t("ui.edit.circuit", "Edit Circuit…", {}, $locale)}</Button></FormRow>
  {#if model.raw}<Help>{model.raw === 1 ? t("circuit.raw1", "{n} line of code isn't drawn here; it is exported as written.", { n: model.raw }, $locale) : t("circuit.raw", "{n} lines of code aren't drawn here; they are exported as written.", { n: model.raw }, $locale)}</Help>{/if}
  <Help>{t("circuit.editHint", "Double-click the circuit to edit it.", {}, $locale)} {exportedWith[0]}<code>{'\\usepackage{circuitikz}'}</code>{exportedWith[1]}</Help></PanelSection>
<PanelSection><Button class="wide" data-act="copycz">{t("ui.copy.circuitikz.code", "Copy circuitikz Code", {}, $locale)}</Button></PanelSection>
