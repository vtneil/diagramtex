<script lang="ts">
  import { t, locale } from '../i18n';
  import { FormRow, Help, PanelSection, TextField } from './kit';
  let { model }: { model: { name: string } } = $props();
  let writtenAs = $derived(t('point.writtenAs', 'Written as {code}.', {}, $locale).split('{code}'));
</script>
<PanelSection title={t("ui.named.point", "Named Point", {}, $locale)}>
  <FormRow label={t("ui.name", "Name", {}, $locale)} for="point-name"><TextField id="point-name" data-p="tikzName" value={model.name} /></FormRow>
  <Help>{writtenAs[0]}<code>{'\\coordinate (' + model.name + ') at …;'}</code>{writtenAs[1]} {t("point.attachHint", "Lines that start or end on it stay attached and are written with its name. It draws nothing in exports.", {}, $locale)}</Help></PanelSection>
