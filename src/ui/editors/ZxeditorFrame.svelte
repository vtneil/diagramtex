<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="zxTitle">
    <div class="modal-head">
      <strong id="zxTitle">ZX diagram</strong>
      <div class="cz-tools">
        <button class="icon flat" data-ze="addrow" title="Add a row at the bottom">{@html model.p0}</button>
        <button class="icon flat" data-ze="addcol" title="Add a column at the end">{@html model.p1}</button>
        <button class="icon flat danger" data-ze="delete" title="Delete the selection (⌫)">{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ze="undo" title="Undo ({model.p3}Z)">{@html model.p4}</button>
        <button class="icon flat" data-ze="redo" title="Redo ({model.p5})">{@html model.p6}</button>
        <button class="icon flat" data-ze="fit" title="Fit the diagram in view (0)">{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ze="cancel">Cancel</button>
      <button class="primary" data-ze="done" title="{model.p8}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list ze-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg ze-svg" aria-label="ZX diagram"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>zx-calculus</span><small class="cz-count"></small><button class="flat" data-ze="copy" title="Copy the ZX code">Copy</button></div>
          <textarea spellcheck="false" aria-label="zx-calculus code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
