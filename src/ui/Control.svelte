<script lang="ts">
  // One control of a form panel (src/ui/forms.ts), drawn with the interface kit.
  import { caption, locale, translatedAttrs } from '../i18n';
  import { controlCaptions, type Control } from './forms';
  import { Button, Checkbox, ColourButton, Icon, Select, Slider, Spacer, TextField } from './kit';
  import { liveValue } from './live-value';
  let { control, labelledby }: { control: Control; labelledby?: string } = $props();
  // a field without its own name is named by its row's caption
  const named = (attrs: Record<string, unknown> | undefined) => !!attrs && (attrs['aria-label'] != null || attrs['aria-labelledby'] != null);
  // the control's attributes, with its captions in the current language (title, aria-label, placeholder)
  const attrs = $derived('attrs' in control ? translatedAttrs(control.attrs, $locale, controlCaptions(control)) as Record<string, any> : {});
  const name = $derived('attrs' in control && named(control.attrs) ? undefined : labelledby);
  const text = (fallback: Parameters<typeof caption>[0]) => caption(control.caption ?? fallback, $locale);
</script>
{#if control.kind === 'input'}
  {#key control.attrs.type}
    {#if control.attrs.type === 'checkbox'}<Checkbox {...attrs} aria-labelledby={name} checked={control.checked} />
    {:else}<TextField {...attrs} aria-labelledby={name} value={control.value} />{/if}
  {/key}
{:else if control.kind === 'select'}
  <!-- pictures: the menu is picture tiles, each option's drawing over its short name (a 3D solid's Shape) -->
  <Select {...attrs} aria-labelledby={name} value={control.value} pictures={!!control.pictures} options={control.options.map(([value, label]) => {
    const pic = control.pictures?.[String(value)];
    return { value: String(value), label: caption(label, $locale), short: pic && caption(pic[0], $locale), svg: pic?.[1] };
  })} />
{:else if control.kind === 'colour'}
  <ColourButton data-sercolor={control.index} title={control.value} css={control.css} />
{:else if control.kind === 'fillColour'}
  <ColourButton {...attrs} css={control.css} none={control.none} label={text(control.label)} />
{:else if control.kind === 'angle'}
  <Slider {...attrs} aria-labelledby={name} value={control.value} readout={`${control.numericValue}${control.unit}`} />
{:else if control.kind === 'button'}
  {@const { class: cls, ...rest } = attrs}
  <Button {...rest} class={cls || undefined}>{#if control.swatch}<i style:background={control.swatch.css} class={control.swatch.none ? 'none' : undefined}></i>{/if}{#if control.icon}<Icon name={control.icon} />{:else if control.svg}{@html control.svg}{/if}{text(control.text)}</Button>
{:else if control.kind === 'spacer'}
  <Spacer />
{:else if control.kind === 'code'}
  <code class={control.class}>{control.text}</code>
{:else if control.kind === 'texColour'}
  <ColourButton css={control.css} none={control.none} data-tc={control.nullable ? 'n' : ''} title={caption(control.title, $locale)} data-dl={control.defaultLabel} data-dsw={control.defaultSwatch} label={text(control.label)} /><input type="hidden" {...attrs} {@attach liveValue(control.value)}>
{:else}
  <span class={control.class}>{text(control.text)}</span>
{/if}
