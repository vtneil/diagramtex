<script lang="ts">
  export interface Model { parts: number; wires: number; raw: number }
  let { model }: { model: Model } = $props();
</script>
<div class="sec"><div class="sec-title">circuitikz <small>{model.parts} part{model.parts === 1 ? '' : 's'}, {model.wires} wire{model.wires === 1 ? '' : 's'}</small></div>
  <div class="row"><button class="wide primary" data-act="editcz">Edit Circuit…</button></div>
  {#if model.raw}<div class="help">{model.raw} line{model.raw === 1 ? '' : 's'} of code {model.raw === 1 ? "isn't" : "aren't"} drawn here; {model.raw === 1 ? 'it is' : 'they are'} exported as written.</div>{/if}
  <div class="help">Double-click the circuit to edit it. Exported with <code>{'\\usepackage{circuitikz}'}</code>.</div></div>
<div class="sec"><button class="wide" data-act="copycz">Copy circuitikz Code</button></div>
