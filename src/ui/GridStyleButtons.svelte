<script lang="ts">
  import { t, locale } from '../i18n';
  import Button from './kit/Button.svelte';
  import Icon from './kit/Icon.svelte';
  // the grid styles: segments of the top bar's (and the chemistry editor's) flags track, one chosen (role radio)
  // `oblique`: the main canvas's grid on two axes at any angle (its axes are chosen in the status line)
  let { id, oblique = false }: { id: string; oblique?: boolean } = $props();
</script>
      <div {id} class="grid-style-buttons" title={t('ui.gridStyleToggleHint', 'Choose a grid style; click the active style again to hide the grid', {}, $locale)} role="radiogroup" aria-label={t('ui.gridStyle', 'Grid style', {}, $locale)}>
        <Button role="radio" data-grid-style="grid" aria-checked="true" tabindex={0} title={t('ui.grid', 'Grid', {}, $locale)} aria-label={t('ui.grid', 'Grid', {}, $locale)} class="on"><Icon name="gridLines" /></Button>
        <Button role="radio" data-grid-style="dot" aria-checked="false" tabindex={-1} title={t('ui.gridDot', 'Dot', {}, $locale)} aria-label={t('ui.gridDot', 'Dot', {}, $locale)}><Icon name="gridDot" /></Button>
        <Button role="radio" data-grid-style="isometric" aria-checked="false" tabindex={-1} title={t('ui.gridIsometric', 'Isometric', {}, $locale)} aria-label={t('ui.gridIsometric', 'Isometric', {}, $locale)}><Icon name="gridIsometric" /></Button>
        <Button role="radio" data-grid-style="isometric-dot" aria-checked="false" tabindex={-1} title={t('ui.gridIsometricDot', 'Isometric Dot', {}, $locale)} aria-label={t('ui.gridIsometricDot', 'Isometric Dot', {}, $locale)}><Icon name="gridIsometricDot" /></Button>
        {#if oblique}<Button role="radio" data-grid-style="oblique" aria-checked="false" tabindex={-1} title={t('ui.gridOblique', 'Oblique', {}, $locale)} aria-label={t('ui.gridOblique', 'Oblique', {}, $locale)}><Icon name="gridOblique" /></Button>{/if}
      </div>
