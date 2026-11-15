<script lang="ts">
  import { t, locale } from '../i18n';
  import { liveValue } from './live-value';
  let { model }: { model: { name: string } } = $props();
  let writtenAs = $derived(t('point.writtenAs', 'Written as {code}.', {}, $locale).split('{code}'));
</script>
<div class="sec"><div class="sec-title">{t("ui.named.point", "Named Point", {}, $locale)}</div>
  <div class="row"><label for="point-name">{t("ui.name", "Name", {}, $locale)}</label><div class="ctl"><input id="point-name" type="text" data-p="tikzName" {@attach liveValue(model.name)} spellcheck="false"></div></div>
  <div class="help">{writtenAs[0]}<code>{'\\coordinate (' + model.name + ') at …;'}</code>{writtenAs[1]} {t("point.attachHint", "Lines that start or end on it stay attached and are written with its name. It draws nothing in exports.", {}, $locale)}</div></div>
