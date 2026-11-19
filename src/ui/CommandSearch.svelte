<script lang="ts" module>
  import type { IconName } from './kit/icons';
  /** A result: a named icon or a drawing taken from the control it runs (a tool's), a name and its detail, the
   *  group it is in (shown beside it while searching), a key, red when it deletes; `section` starts a group's heading. */
  export interface CommandRow { label: string; detail?: string; icon?: IconName; svg?: string; key?: string; group?: string; section?: string; danger?: boolean }
  export interface CommandSearchModel {
    rows: CommandRow[]; cur: number; query: string;
    /** what an empty result says */
    empty: string;
    /** the box's place: centred over the drawing area */
    left: number; top: number; width: number;
  }
</script>
<script lang="ts">
  // The "/" search (src/ui/services/palette.svelte.ts finds and runs; this draws): a field over the results and a line of
  // keys. The field keeps the focus; the result under the arrow keys (or the pointer) is `cur`, marked by a fill.
  // The controller listens on #cmdkIn and the rows' data-i.
  import { t, locale } from '../i18n';
  import Icon from './kit/Icon.svelte';
  import Kbd from './kit/Kbd.svelte';
  import TextField from './kit/TextField.svelte';
  import EmptyState from './kit/EmptyState.svelte';
  let { model: m }: { model: CommandSearchModel } = $props();
</script>
<div class="cmdk-box" role="dialog" aria-modal="true" aria-label={t('pal.aria', 'Search tools and commands', {}, $locale)} style:width="{m.width}px" style:left="{m.left}px" style:top="{m.top}px">
  <div class="cmdk-field"><Icon name="search" />
    <TextField id="cmdkIn" value={m.query} spellcheck="false" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cmdkList" aria-autocomplete="list"
      aria-activedescendant={m.rows.length ? 'cmdk-' + m.cur : undefined} placeholder={t('pal.placeholder', 'Search tools, shapes, commands, modes and files', {}, $locale)} /></div>
  <div id="cmdkList" class="cmdk-list" role="listbox" aria-label={t('pal.results', 'Results', {}, $locale)}>
    {#each m.rows as r, i (i)}
      {#if r.section}<div class="cmdk-sec" role="presentation">{r.section}</div>{/if}
      <div class={['cmdk-row', i === m.cur && 'on', r.danger && 'danger']} role="option" id={'cmdk-' + i} data-i={i} aria-selected={i === m.cur}>
        <span class="cmdk-ic">{#if r.icon}<Icon name={r.icon} />{:else if r.svg}{@html r.svg}{/if}</span><span class="cmdk-lb">{r.label}{#if r.detail}<small>{r.detail}</small>{/if}</span>
        {#if r.group}<span class="cmdk-grp">{r.group}</span>{/if}{#if r.key}<Kbd key={r.key} />{/if}
      </div>
    {:else}
      <EmptyState>{m.empty}</EmptyState>
    {/each}
  </div>
  <div class="cmdk-foot"><span><kbd>↑</kbd><kbd>↓</kbd> {t('pal.foot.choose', 'choose', {}, $locale)}</span><span><kbd>↩</kbd> {t('pal.foot.run', 'run', {}, $locale)}</span><span><kbd>esc</kbd> {t('pal.foot.close', 'close', {}, $locale)}</span></div>
</div>
