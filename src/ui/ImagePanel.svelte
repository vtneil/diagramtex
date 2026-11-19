<script lang="ts">
  import { t, locale } from '../i18n';
  import { Button, FormRow, Help, PanelSection, TextField } from './kit';
  let { model }: { model: { file: string } } = $props();
  let exportUses = $derived(t('image.exportUses', 'Save the file next to your .tex; the export uses {cmd}.', {}, $locale).split('{cmd}'));
</script>
<PanelSection title={t("ui.image.file", "Image file", {}, $locale)}>
  <FormRow label={t("ui.file.name", "File name", {}, $locale)} for="image-file"><TextField id="image-file" data-img="file" value={model.file} /></FormRow>
  <div class="btns"><Button data-imgact="download">{t("ui.download", "Download", {}, $locale)}</Button><Button data-imgact="replace">{t("ui.replace", "Replace…", {}, $locale)}</Button></div>
  <Help kind="hint">{exportUses[0]}<code>{'\\includegraphics'}</code>{exportUses[1]} {t("image.dragHint", "Drag a corner to resize (Alt stretches).", {}, $locale)}</Help></PanelSection>
