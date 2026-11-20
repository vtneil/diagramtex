<script lang="ts">
  import { caption, locale, type Locale, type Message } from '../i18n';
  import type { FormRow, SwitchOption } from './forms';
  import ControlView from './Control.svelte';
  import Inline from './Inline.svelte';
  import FormRows from './FormRows.svelte';
  import PhysicsResults from './PhysicsResults.svelte';
  import { Button, Help, Icon, Segmented, TextArea, type SegmentOption } from './kit';
  let { rows }: { rows: FormRow[] } = $props();
  const uid = $props.id();
  // A switch row (forms.ts switchRow, editor-fields' segments()) is the kit's switch in the panel's track; with
  // `many`, or a lone choice, its segments are toggles that can each be on.
  const track = (cls?: string) => ['ctl', cls].filter(Boolean).join(' ');
  const text = (value: string | Message | undefined, language: Locale) => value == null || value === '' ? undefined : caption(value, language) || undefined;
  const switchOptions = (options: SwitchOption[], language: Locale): SegmentOption[] => options.map((o) => ({
    label: text(o.text, language), title: text(o.title, language), name: text(o.name, language), on: !!o.on, disabled: !!o.disabled,
    class: o.class, svg: o.svg, swatch: o.swatch, attrs: o.attrs }));
</script>
{#each rows as row, i}
  {#if row.kind === 'group'}<div class={row.class} style={row.style}><FormRows rows={row.rows}/></div>
  {:else if row.kind === 'row'}<div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Caption for the existing compound control.) --><label id={uid + '-' + i} for={row.labelFor} class={row.labelClass} title={caption(row.labelTitle, $locale)}><Inline text={row.label}/></label><div class={row.controlClass || 'ctl'}>{#each row.controls as control}<ControlView {control} labelledby={uid + '-' + i}/>{/each}</div></div>
  {:else if row.kind === 'switch'}{#if row.label}<div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Caption for the switch, named by aria-labelledby.) --><label id={uid + '-' + i} title={caption(row.labelTitle, $locale)}><Inline text={row.label}/></label><Segmented panel class={track(row.class)} many={row.many || row.options.length === 1} aria-labelledby={uid + '-' + i} options={switchOptions(row.options, $locale)} /></div>{:else}<Segmented panel class={track(row.class)} many={row.many || row.options.length === 1} options={switchOptions(row.options, $locale)} />{/if}
  {:else if row.kind === 'column'}<div class="row col">{#if row.label}<!-- svelte-ignore a11y_label_has_associated_control (Preserve the existing multi-line field caption.) --><label id={uid + '-' + i} class={row.labelClass} title={caption(row.labelTitle, $locale)}><Inline text={row.label}/></label>{/if}<TextArea {...row.attrs} aria-labelledby={row.label ? uid + '-' + i : undefined} value={row.value} /></div>
  {:else if row.kind === 'hint'}<Help kind="hint"><Inline text={row.text}/></Help>
  {:else if row.kind === 'help'}<Help style={row.style}><Inline text={row.text}/></Help>
  {:else if row.kind === 'error'}<Help kind="error">{caption(row.text, $locale)}</Help>
  {:else if row.kind === 'actions'}<div class={row.class}>{#each row.buttons as button}{@const { class: cls, ...rest } = button.attrs as Record<string, any>}<Button {...rest} class={cls || undefined}>{caption(button.text, $locale)}</Button>{/each}</div>
  {:else if row.kind === 'controls'}<div class={row.class}>{#each row.controls as control}<ControlView {control}/>{/each}</div>
  {:else if row.kind === 'codeButtons'}<div class={row.class}>{#each row.items as item}{@const { class: cls, ...attrs } = item.attrs as Record<string, any>}<Button {...attrs} class={cls || undefined}><span>{caption(item.label, $locale)}</span><code>{item.code}</code></Button>{/each}</div>
  {:else if row.kind === 'status'}<div class={row.class}><Icon name={row.icon} class={row.iconClass} /><span>{caption(row.text, $locale)}</span></div>
  {:else if row.kind === 'kmapGroups'}<div class="km-groups">{#each row.groups as group}<Button data-gi={group.index} title={caption(group.title, $locale)}><i class={'km-sw' + (group.bw ? ' bw' : '')} style={group.bw ? undefined : 'background:' + group.css}></i><span class="t">{#if group.valid}{@html group.math}{:else}{group.text}{/if}</span><Icon name={group.icon} class={group.iconClass} /></Button>{/each}</div>
  {:else if row.kind === 'points'}<div class="g3-pts">{#each row.points as point, i}<div class="g3-pt-row"><span>{i + 1}</span>{#each point as control}<ControlView {control}/>{/each}</div>{/each}</div>
  {:else if row.kind === 'physicsResults'}<PhysicsResults results={row.results}/>
  {:else if row.kind === 'rendered'}<div class={row.class}>{@html row.svgOrMath}</div>
  {:else}<Button class={row.class} data-act={row.action}>{caption(row.label, $locale)}</Button>{/if}
{/each}
