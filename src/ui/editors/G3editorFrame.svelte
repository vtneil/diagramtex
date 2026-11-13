<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="g3Title">
    <div class="modal-head">
      <strong id="g3Title">3D geometry</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ge="delete" title="Delete the selection (⌫)">{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ge="undo" title="Undo ({model.p1}Z)">{@html model.p2}</button>
        <button class="icon flat" data-ge="redo" title="Redo ({model.p3})">{@html model.p4}</button>
        <button class="icon flat" data-ge="fit" title="Fit the picture in view (0)">{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ge="cancel">Cancel</button>
      <button class="primary" data-ge="done" title="{model.p6}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list g3-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg g3-svg" aria-label="3D geometry"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span class="g3-lang">tikz-3dplot</span><small class="cz-count"></small><button class="flat" data-ge="copy" title="Copy the tikz-3dplot code">Copy</button></div>
          <textarea spellcheck="false" aria-label="tikz-3dplot code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
