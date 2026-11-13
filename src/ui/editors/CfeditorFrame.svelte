<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="cfTitle">
    <div class="modal-head">
      <strong id="cfTitle">Chemistry</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ce="delete" title="Delete the selection (⌫)">{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ce="undo" title="Undo ({model.p1}Z)">{@html model.p2}</button>
        <button class="icon flat" data-ce="redo" title="Redo ({model.p3})">{@html model.p4}</button>
        <button class="icon flat" data-ce="fit" title="Fit the drawing in view (0)">{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ce="cancel">Cancel</button>
      <button class="primary" data-ce="done" title="{model.p6}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list cf-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg cf-svg" aria-label="Chemistry"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>chemfig</span><small class="cz-count"></small><button class="flat" data-ce="copy" title="Copy the chemfig code">Copy</button></div>
          <textarea spellcheck="false" aria-label="chemfig code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
