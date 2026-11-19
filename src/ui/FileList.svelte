<script lang="ts" module>
  /** One row of the sidebar's file list: a folder or a file, already in tree order (application/app.ts builds it). */
  export interface FileRow {
    key: string; // 'f:<path>' for a folder, 'd:<id>' for a file
    folder?: string; doc?: string;
    name: string; depth: number; title?: string;
    svg: string; // the chevron and folder, or the file kind's icon
    shut?: boolean; hasActive?: boolean; active?: boolean;
    del: { title: string; label: string };
  }
  export interface FileListModel {
    rows: FileRow[];
    renaming: string | null; // the key of the row being renamed
    nameLabel: { file: string; folder: string };
    click(row: FileRow, e: MouseEvent | KeyboardEvent): void;
    remove(row: FileRow): void;
    rename(row: FileRow, name: string): void;
    renameEnd(row: FileRow): void;
  }
</script>
<script lang="ts">
  // The sidebar's file list (#docList): folders and files as ListRows, in the order and nesting app.ts gives.
  // A click opens a file or folds a folder, a double-click renames in place (the app tells the two apart, so a
  // folder's fold survives a rename), × deletes. Dragging and the right-click menu stay with app.ts, which finds
  // rows by data-doc / data-folder.
  import ListRow from './kit/ListRow.svelte';
  import Button from './kit/Button.svelte';
  let { model }: { model: FileListModel } = $props();
</script>
{#each model.rows as row (row.key)}
  <ListRow name={row.name} svg={row.svg} depth={row.depth} title={row.title} selected={!!row.active}
    class={[row.folder !== undefined && 'folder', row.shut && 'shut', row.hasActive && 'has-active', row.active && 'active'].filter(Boolean).join(' ')}
    renaming={model.renaming === row.key} renameOnDblclick={false} renameLabel={row.folder !== undefined ? model.nameLabel.folder : model.nameLabel.file}
    data-doc={row.doc} data-folder={row.folder} draggable="true" aria-expanded={row.folder !== undefined ? !row.shut : undefined}
    onopen={(e) => model.click(row, e)} onrename={(name) => model.rename(row, name)} onrenameend={() => model.renameEnd(row)}>
    {#snippet actions()}<Button class="del" danger title={row.del.title} aria-label={row.del.label}
      onclick={(e) => { e.stopPropagation(); model.remove(row); }}>×</Button>{/snippet}
  </ListRow>
{/each}
