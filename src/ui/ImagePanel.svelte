<script lang="ts">
  import { t, locale } from '../i18n';
  import { liveValue } from './live-value';
  let { model }: { model: { file: string } } = $props();
  let exportUses = $derived(t('image.exportUses', 'Save the file next to your .tex; the export uses {cmd}.', {}, $locale).split('{cmd}'));
</script>
<div class="sec"><div class="sec-title">{t("ui.image.file", "Image file", {}, $locale)}</div>
  <div class="row"><label for="image-file">{t("ui.file.name", "File name", {}, $locale)}</label><div class="ctl"><input id="image-file" type="text" data-img="file" {@attach liveValue(model.file)}></div></div>
  <div class="btns"><button type="button" data-imgact="download">{t("ui.download", "Download", {}, $locale)}</button><button type="button" data-imgact="replace">{t("ui.replace", "Replace…", {}, $locale)}</button></div>
  <div class="hint-line">{exportUses[0]}<code>{'\\includegraphics'}</code>{exportUses[1]} {t("image.dragHint", "Drag a corner to resize (Alt stretches).", {}, $locale)}</div></div>
