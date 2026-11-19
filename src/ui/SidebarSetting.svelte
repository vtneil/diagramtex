<script lang="ts" module>
  import type { SegmentOption } from './kit';
  /** A setting in the left sidebar: its heading, a switch, and a note on the choice (`status`: announced as it changes).
   *  `notes`: every note it can show, laid out in the same place, so the note keeps the room of the longest and nothing
   *  above it moves when it changes (the box sits on the sidebar's bottom edge); the shown one fades in as the last
   *  fades out. Screen readers hear the note from a hidden copy, which changes all at once. */
  export interface SidebarSettingModel { title: string; options: SegmentOption[]; note: string; notes: string[]; status?: boolean }
</script>
<script lang="ts">
  // The left sidebar's settings under the file list, Text input and LaTeX engine (ui/services/sidebar-settings.ts).
  import { Segmented } from './kit';
  let { model }: { model: SidebarSettingModel } = $props();
</script>
<div class="eng-head">{model.title}</div>
<Segmented class="eng-seg" label={model.title} options={model.options} />
<div class="eng-note">{#each model.notes as text, i (i)}<span class={text === model.note ? 'on' : undefined} aria-hidden="true">{text}</span>{/each}<span class="eng-said sr-only" role={model.status ? 'status' : undefined}>{model.note}</span></div>
