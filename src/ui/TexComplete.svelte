<script lang="ts" module>
  /** A suggestion: the command's name (without its backslash), a drawing of it (markup: rendered maths, or a circuit
   *  drawn by the quantikz renderer), and its group, in the interface language. */
  export interface TexSuggestion { name: string; prev: string; group: string }
  export interface TexCompleteModel { open: boolean; rows: TexSuggestion[]; idx: number; x: number; y: number }
</script>
<script lang="ts">
  // The LaTeX autocomplete (src/ui/services/texcomplete.svelte.ts finds what is being typed, ranks, places and
  // inserts; this draws): the commands that match, each with a preview and its group, the chosen one marked by a fill,
  // and a line of keys. It opens under the caret (above it near the bottom of the window) and follows the typing at
  // once, without a fade. It sits in the top layer (shown by the controller), so it stays over the text popup. A press on a row picks it without taking the focus from the field (the controller's).
  import { t, locale } from '../i18n';
  let { model: m }: { model: TexCompleteModel } = $props();
</script>
<div id="texComplete" role="listbox" popover="manual" hidden={!m.open} style:left="{m.x}px" style:top="{m.y}px">
  <ul>
    {#each m.rows as c, i (i)}
      <li role="option" data-i={i} class={i === m.idx ? 'on' : undefined} aria-selected={i === m.idx}><span class="tc-name">\{c.name}</span><span class="tc-prev">{@html c.prev}</span><span class="tc-grp">{c.group}</span></li>
    {/each}
  </ul>
  <div class="tc-foot"><kbd>↑</kbd><kbd>↓</kbd> {t('pal.foot.choose', 'choose', {}, $locale)} · <kbd>Enter</kbd> / <kbd>Tab</kbd> {t('tex.foot.insert', 'insert', {}, $locale)} · <kbd>Esc</kbd> {t('pal.foot.close', 'close', {}, $locale)}</div>
</div>
