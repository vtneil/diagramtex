<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="bfTitle">
    <div class="modal-head">
      <strong id="bfTitle">Bit field</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-be="delete" title="Delete the selected field or group (⌫)">{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-be="undo" title="Undo ({model.p1}Z)">{@html model.p2}</button>
        <button class="icon flat" data-be="redo" title="Redo ({model.p3})">{@html model.p4}</button>
        <button class="icon flat" data-be="fit" title="Fit the field in view (F)">{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-be="cancel">Cancel</button>
      <button class="primary" data-be="done" title="{model.p6}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list bf-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg bf-svg" aria-label="Bit field"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>bytefield</span><small class="cz-count"></small><button class="flat" data-be="copy" title="Copy the bit field code">Copy</button></div>
          <textarea spellcheck="false" aria-label="bytefield code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
