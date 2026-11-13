<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="fsmTitle" style="width:min(1600px,97vw);height:min(900px,93vh)">
    <div class="modal-head">
      <strong id="fsmTitle">State machine</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-fe="delete" title="Delete the selection (⌫)">{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-fe="undo" title="Undo ({model.p1}Z)">{@html model.p2}</button>
        <button class="icon flat" data-fe="redo" title="Redo ({model.p3})">{@html model.p4}</button>
        <button class="icon flat" data-fe="layout" title="Auto layout: place the states in layers from the initial state">{@html model.p5}</button>
        <button class="icon flat" data-fe="fit" title="Fit the diagram in view (0)">{@html model.p6}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-fe="cancel">Cancel</button>
      <button class="primary" data-fe="done" title="{model.p7}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list fsm-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg fsm-svg" aria-label="State machine"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>TikZ automata</span><small class="cz-count"></small><button class="flat" data-fe="copy" title="Copy the TikZ code">Copy</button></div>
          <textarea spellcheck="false" aria-label="TikZ automata code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
