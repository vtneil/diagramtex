<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="phyTitle">
    <div class="modal-head">
      <strong id="phyTitle">Physics figure</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-pe="delete" title="Delete the selection (⌫)">{@html model.p0}</button>
        <button class="icon flat" data-pe="dup" title="Duplicate the selection ({model.p1}D)">{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-pe="undo" title="Undo ({model.p3}Z)">{@html model.p4}</button>
        <button class="icon flat" data-pe="redo" title="Redo ({model.p5})">{@html model.p6}</button>
        <button class="icon flat" data-pe="fit" title="Fit the figure in view (0)">{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-pe="cancel">Cancel</button>
      <button class="primary" data-pe="done" title="{model.p8}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list phy-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg phy-svg" aria-label="Physics figure"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>Source</span><small class="cz-count"></small><button class="flat" data-pe="copy" title="Copy this source (DiagramTeX's own syntax, not LaTeX)">Copy</button></div>
          <div class="cz-code-note">DiagramTeX's own syntax, not LaTeX: it won't compile on its own. The LaTeX comes from Export, or Copy TikZ Code in the side panel.</div>
          <textarea spellcheck="false" aria-label="Physics source"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
