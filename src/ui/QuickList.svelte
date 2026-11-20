<script lang="ts" module>
  /** Quick's sidebar (#quickList): Formula, then each block that docks, the open one heading its drafts. */
  export interface QuickDraft { id: string; name: string; value: string; active: boolean; title: string }
  export interface QuickBlock {
    type: string; name: string; title: string; svg: string; open: boolean; count: number; countLabel: string;
    // the open block's drafts, and the row that starts a new one
    drafts?: { newTitle: string; newLabel: string; rows: QuickDraft[] };
  }
  export interface QuickListModel {
    formula: { label: string; active: boolean };
    head: string | null; // "Blocks", when there are any
    blocks: QuickBlock[];
    icons: { dot: string };
    deleteLabel: string; nameLabel: string;
    renaming: string | null; // the draft being renamed
    rename(id: string, name: string): void;
    renameEnd(id: string): void;
  }
</script>
<script lang="ts">
  // Quick's list. The drafts are ListRows (a dot, the name, delete on hover, renamed in place); the other rows are
  // buttons that switch the view. Clicks, keys, double-clicks and the right-click menu stay with quick.ts, which finds
  // rows by data-view / data-new / data-hist.
  import ListRow from './kit/ListRow.svelte';
  import Icon from './kit/Icon.svelte';
  import IconButton from './kit/IconButton.svelte';
  let { model }: { model: QuickListModel } = $props();
</script>
<!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role (a row that switches the view: quick.ts takes its Enter and Space) -->
<li class={['qk-nav', model.formula.active && 'active']} data-view="formula" tabindex="0" role="button"><Icon name="fileQuick" /><span class="nm">{model.formula.label}</span></li>
{#if model.head}<li class="qk-head" aria-hidden="true">{model.head}</li>{/if}
{#each model.blocks as b (b.type)}
  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role (a row that switches the view: quick.ts takes its Enter and Space) -->
  <li class={['qk-nav qk-block', b.open && 'open']} data-view={b.type} tabindex="0" role="button" aria-expanded={b.open ? 'true' : undefined} title={b.title}><span class="qk-ic">{@html b.svg}</span><span class="nm">{b.name}</span>{#if b.count}<span class="qk-n" aria-label={b.countLabel}>{b.count}</span>{/if}</li>
  {#if b.drafts}
    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role (a row that switches the view: quick.ts takes its Enter and Space) -->
    <li class="qk-hist qk-new" data-new={b.type} tabindex="0" role="button" title={b.drafts.newTitle}><Icon name="add" /><span class="nm">{b.drafts.newLabel}</span></li>
    {#each b.drafts.rows as d (d.id)}
      <ListRow name={d.name} svg={model.icons.dot} selected={d.active} class={['qk-hist', d.active && 'active'].filter(Boolean).join(' ')} title={d.title}
        role="button" aria-selected={undefined} aria-current={d.active ? 'true' : undefined} data-hist={d.id}
        renameOnDblclick={false} renaming={model.renaming === d.id} renameLabel={model.nameLabel} renameValue={d.value} renamePlaceholder={d.name} renameMax={120}
        onrename={(name) => model.rename(d.id, name)} onrenameend={() => model.renameEnd(d.id)}>
        {#snippet actions()}<IconButton icon="close" danger class="del" data-del={d.id} title={model.deleteLabel} aria-label={model.deleteLabel} />{/snippet}
      </ListRow>
    {/each}
  {/if}
{/each}
