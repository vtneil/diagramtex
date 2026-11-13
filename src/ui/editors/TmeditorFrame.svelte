<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="tmTitle">
    <div class="modal-head">
      <strong id="tmTitle">Timing diagram</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-te="delete" title="Delete the selection (⌫)">{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-te="undo" title="Undo ({model.p1}Z)">{@html model.p2}</button>
        <button class="icon flat" data-te="redo" title="Redo ({model.p3})">{@html model.p4}</button>
        <button class="icon flat" data-te="fit" title="Fit the diagram in view (0)">{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-te="cancel">Cancel</button>
      <button class="primary" data-te="done" title="{model.p6}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list tm-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg tm-svg" aria-label="Timing diagram"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>tikz-timing</span><small class="cz-count"></small><button class="flat" data-te="copy" title="Copy the timing code">Copy</button></div>
          <textarea spellcheck="false" aria-label="tikz-timing code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
