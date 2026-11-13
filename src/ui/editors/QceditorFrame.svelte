<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="qcTitle">
    <div class="modal-head">
      <strong id="qcTitle">Quantum circuit</strong>
      <div class="cz-tools">
        <button class="icon flat" data-qe="addrow" title="Add a wire at the bottom">{@html model.p0}</button>
        <button class="icon flat" data-qe="addcol" title="Add a step at the end">{@html model.p1}</button>
        <button class="icon flat danger" data-qe="delete" title="Clear the selected cells (⌫)">{@html model.p2}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-qe="undo" title="Undo ({model.p3}Z)">{@html model.p4}</button>
        <button class="icon flat" data-qe="redo" title="Redo ({model.p5})">{@html model.p6}</button>
        <button class="icon flat" data-qe="fit" title="Fit the circuit in view (0)">{@html model.p7}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-qe="cancel">Cancel</button>
      <button class="primary" data-qe="done" title="{model.p8}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search elements" aria-label="Search elements" spellcheck="false"></div>
        <div class="cz-list qe-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg qe-svg" aria-label="Quantum circuit"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>quantikz</span><small class="cz-count"></small><button class="flat" data-qe="copy" title="Copy the quantikz code">Copy</button></div>
          <textarea spellcheck="false" aria-label="quantikz code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
