<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="ftTitle">
    <div class="modal-head">
      <strong id="ftTitle">Tree</strong>
      <div class="cz-tools">
        <button class="icon flat" data-fe="child" title="Add a child (Tab)">{@html model.p0}</button>
        <button class="icon flat" data-fe="sib" title="Add a sibling (Enter)">{@html model.p1}</button>
        <button class="icon flat danger" data-fe="delete" title="Delete the selected nodes and what hangs from them (⌫)">{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-fe="undo" title="Undo ({model.p3}Z)">{@html model.p4}</button>
        <button class="icon flat" data-fe="redo" title="Redo ({model.p5})">{@html model.p6}</button>
        <button class="icon flat" data-fe="fit" title="Fit the tree in view (0)">{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-fe="cancel">Cancel</button>
      <button class="primary" data-fe="done" title="{model.p8}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list fe-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg fe-svg" aria-label="Tree"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>forest</span><small class="cz-count"></small><button class="flat" data-fe="copy" title="Copy the forest code">Copy</button></div>
          <textarea spellcheck="false" aria-label="forest code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
