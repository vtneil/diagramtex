<script lang="ts" module>
  import type { SelectOption } from './kit/Select.svelte';
  import type { IconName } from './kit/icons';
  /** A line of the Export panel, in order: a setting, a line of facts, a note, or where the files go. */
  export type ExportRow =
    | { kind: 'switch'; label: string; title?: string; checked: boolean; id?: string; onchange(on: boolean): void }
    | { kind: 'dpi'; label: string; value: number; presets: number[]; onchange(dpi: number): void }
    | { kind: 'select'; label: string; title?: string; value: string; options: SelectOption[]; id?: string; onchange(value: string): void }
    | { kind: 'check'; label: string; checked: boolean; id?: string; onchange(on: boolean): void }
    | { kind: 'meta'; text: string; aside?: string }
    /** `bold` is set in bold where the text has \u0000 */
    | { kind: 'note'; text: string; bold?: string }
    | { kind: 'dir'; label: string; folder: string; title: string; onpick(): void; clear?: { title: string; onclick(): void } };
  export interface ExportAction { label: string; title?: string; primary?: boolean; icon?: IconName; attrs?: Record<string, string>; onclick(): void }
  export interface ExportPanelModel {
    head: string;
    formats: { value: string; label: string }[]; format: string; formatLabel?: string; onformat(value: string): void;
    rows: ExportRow[];
    /** one action fills the width; two or more share it */
    actions: ExportAction[];
  }
</script>
<script lang="ts">
  // The Export panels' contents (the app's, under the top bar's Export, and Quick's, for one drawing), in the kit's
  // popover: a small title, the format switch, the settings for that format, and the button that exports.
  // src/application/app.ts and src/ui/services/quick.ts build the model; every control calls back into it.
  import Segmented from './kit/Segmented.svelte';
  import Switch from './kit/Switch.svelte';
  import Checkbox from './kit/Checkbox.svelte';
  import Select from './kit/Select.svelte';
  import NumberField from './kit/NumberField.svelte';
  import Button from './kit/Button.svelte';
  import IconButton from './kit/IconButton.svelte';
  import Icon from './kit/Icon.svelte';
  let { model }: { model: ExportPanelModel } = $props();
  const dpiOf = (v: string, set: (n: number) => void) => { const n = Math.round(+v); if (n >= 24 && n <= 2400) set(n); };
</script>
<div class="exp-h">{model.head}</div>
<Segmented class="exp-fmt" label={model.formatLabel} options={model.formats.map((f) => ({ label: f.label, on: f.value === model.format, attrs: { 'data-efmt': f.value } }))}
  onclick={(e: MouseEvent) => { const b = (e.target as Element).closest<HTMLElement>('[data-efmt]'); if (b && b.dataset.efmt !== model.format) model.onformat(b.dataset.efmt!); }} />
{#each model.rows as r, i (r.kind + i)}
  {#if r.kind === 'switch'}
    <label class="exp-row exp-sw"><span>{r.label}</span><Switch checked={r.checked} id={r.id} title={r.title} onchange={(e) => r.onchange((e.currentTarget as HTMLInputElement).checked)} /></label>
  {:else if r.kind === 'dpi'}
    <div class="exp-row"><label for="expDpi">{r.label}</label>
      <span class="exp-dpi"><NumberField id="expDpi" value={r.value} min="24" max="2400" step="1" aria-label="DPI" onchange={(e) => dpiOf((e.currentTarget as HTMLInputElement).value, r.onchange)}
        onkeydown={(e) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur(); }} /><Select attached id="expDpiSel" aria-label="DPI" value={String(r.value)}
        options={r.presets.map((d) => ({ value: String(d), label: d + ' DPI' }))} onchange={(e) => dpiOf((e.currentTarget as HTMLSelectElement).value, r.onchange)} /></span></div>
  {:else if r.kind === 'select'}
    <div class="exp-row"><label for={r.id}>{r.label}</label><Select id={r.id} title={r.title} value={r.value} options={r.options} onchange={(e) => r.onchange((e.currentTarget as HTMLSelectElement).value)} /></div>
  {:else if r.kind === 'check'}
    <div class="exp-chk"><Checkbox checked={r.checked} id={r.id} onchange={(e) => r.onchange((e.currentTarget as HTMLInputElement).checked)}>{r.label}</Checkbox></div>
  {:else if r.kind === 'meta'}
    <div class="exp-meta">{r.text}{#if r.aside}<span>{r.aside}</span>{/if}</div>
  {:else if r.kind === 'note'}
    {@const [before, after] = r.text.split('\u0000')}
    <div class="exp-note">{before}{#if after !== undefined}<b>{r.bold}</b>{after}{/if}</div>
  {:else if r.kind === 'dir'}
    <div class="exp-row exp-dir"><span class="exp-dirl">{r.label}</span><span class="exp-dirv">
      <Button class="exp-dirb" title={r.title} data-edir onclick={r.onpick}><Icon name="folder" /><span>{r.folder}</span></Button>
      {#if r.clear}<IconButton icon="clear" class="exp-dirx" title={r.clear.title} data-edirx onclick={r.clear.onclick} />{/if}</span></div>
  {/if}
{/each}
<div class={['exp-go', model.actions.length > 1 && 'many']}>
  {#each model.actions as a, i (i)}<Button variant={a.primary ? 'primary' : 'default'} icon={a.icon} title={a.title} {...a.attrs} onclick={a.onclick}>{a.label}</Button>{/each}
</div>
