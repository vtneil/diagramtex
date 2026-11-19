<script lang="ts" module>
  /** A block editor's note (src/ui/editor-notes.ts): `lines` for the code pane's message (one line each), `text` for
   *  the stage's tip. No whitespace may sit between the tags and the markup: a stray text node would keep an empty
   *  note from matching `:empty`, which hides it. */
  export interface EditorNoteModel { lines?: string[]; text?: string }
</script><script lang="ts">
  let { model }: { model: EditorNoteModel } = $props();
</script>{#if model.lines}{#each model.lines as line, i (i)}<div>{line}</div>{/each}{:else}{model.text ?? ''}{/if}
