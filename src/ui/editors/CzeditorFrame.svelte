<script lang="ts">
  let { model }: { model: Record<'p0' | 'p1' | 'p2' | 'p3' | 'p4' | 'p5' | 'p6' | 'p7' | 'p8' | 'p9' | 'p10' | 'p11', string> } = $props();
</script>
<div class="modal-box cz-box" role="dialog" aria-modal="true" aria-labelledby="czTitle">
    <div class="modal-head">
      <strong id="czTitle">Circuit</strong>
      <div class="cz-tools">
        <button class="icon flat" data-cz="select" title="Select and move (V)">{@html model.p0}</button>
        <button class="icon flat" data-cz="wire" title="Wire (W): drag between points; ends snap to pins">{@html model.p1}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-cz="rotate" title="Rotate 90° (R)">{@html model.p2}</button>
        <button class="icon flat" data-cz="mirrory" title="Mirror left to right (X)">{@html model.p3}</button>
        <button class="icon flat" data-cz="mirrorx" title="Mirror top to bottom (Y)">{@html model.p4}</button>
        <button class="icon flat danger" data-cz="delete" title="Delete (⌫)">{@html model.p5}</button>
        <span class="cz-sep"></span>
        <button class="icon flat" data-cz="undo" title="Undo ({model.p6}Z)">{@html model.p7}</button>
        <button class="icon flat" data-cz="redo" title="Redo ({model.p8})">{@html model.p9}</button>
        <button class="icon flat" data-cz="fit" title="Fit the circuit in view (0)">{@html model.p10}</button>
      </div>
      <span class="spacer" style="flex:1"></span>
      <button data-cz="cancel">Cancel</button>
      <button class="primary" data-cz="done" title="{model.p11}Enter">Done</button>
    </div>
    <div class="cz-body">
      <aside class="cz-pal">
        <div class="cz-search"><input type="search" placeholder="Search parts" aria-label="Search parts" spellcheck="false"></div>
        <div class="cz-list" role="group" aria-label="Elements"></div>
      </aside>
      <div class="cz-stage"><svg class="cz-svg" aria-label="Circuit drawing"></svg><div class="cz-tip"></div></div>
      <aside class="cz-side">
        <div class="cz-props" id="czProps"></div>
        <div class="cz-code">
          <div class="cz-code-head"><span>circuitikz</span><small class="cz-count"></small><button class="flat" data-cz="copy" title="Copy the circuitikz code">Copy</button></div>
          <textarea spellcheck="false" aria-label="circuitikz code"></textarea>
          <div class="cz-msg"></div>
        </div>
      </aside>
    </div>
  </div>
