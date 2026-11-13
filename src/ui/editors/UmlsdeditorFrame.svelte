<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="sdTitle" style="width:min(1600px,97vw);height:min(900px,93vh)">
    <div class="modal-head">
      <strong id="sdTitle">Sequence diagram</strong>
      <div class="cz-tools">
        <button class="icon flat danger" data-ue="delete" title="Delete the selection (⌫)">{@html model.p0}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-ue="undo" title="Undo ({model.p1}Z)">{@html model.p2}</button>
        <button class="icon flat" data-ue="redo" title="Redo ({model.p3})">{@html model.p4}</button>
        <button class="icon flat" data-ue="fit" title="Fit the diagram in view (0)">{@html model.p5}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-ue="cancel">Cancel</button>
      <button class="primary" data-ue="done" title="{model.p6}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search" aria-label="Search the palette" spellcheck="false"></div>
        <div class="cz-list sd-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg sd-svg" aria-label="Sequence diagram"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>pgf-umlsd</span><small class="cz-count"></small><button class="flat" data-ue="copy" title="Copy the pgf-umlsd code">Copy</button></div>
          <textarea spellcheck="false" aria-label="pgf-umlsd code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
