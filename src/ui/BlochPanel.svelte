<script lang="ts">
  import { liveValue } from './live-value';
  import type { BlochPanelModel } from './contracts';
  let { model }: { model: BlochPanelModel } = $props();
  const ballOptions = [['3d', 'Shaded'], ['circle', 'Outline'], ['none', 'None']];
</script>

<div class="sec"><div class="sec-title">Bloch sphere</div>
  <div class="row"><label for="bloch-radius">Radius</label><div class="ctl unit"><input type="number" id="bloch-radius" data-bk="radius" {@attach liveValue(model.radius)} step="0.1" min="0.1"><span>cm</span></div></div>
  <div class="row"><label for="bloch-tilt">Tilt</label><div class="ctl"><input type="range" id="bloch-tilt" data-bk="tilt" min="-90" max="90" step="1" {@attach liveValue(model.tilt)} aria-label="Tilt"><label class="ang" title="Click to type a value"><input type="number" data-bkn="tilt" {@attach liveValue(model.tilt)} step="1" aria-label="Tilt in degrees">°</label></div></div>
  <div class="row"><label for="bloch-rotation">Rotation</label><div class="ctl"><input type="range" id="bloch-rotation" data-bk="rotation" min="-180" max="180" step="1" {@attach liveValue(model.rotation)} aria-label="Rotation"><label class="ang" title="Click to type a value"><input type="number" data-bkn="rotation" {@attach liveValue(model.rotation)} step="1" aria-label="Rotation in degrees">°</label></div></div>
  <div class="row"><!-- svelte-ignore a11y_label_has_associated_control (Existing caption labels a group of segments.) --><label id="bloch-ball">Ball</label><div class="ctl seg-ctl txt" role="group" aria-labelledby="bloch-ball">{#each ballOptions as [value, name]}<button data-act={'ball:' + value} class={model.ball === value ? 'on' : ''}>{name}</button>{/each}</div></div>
</div>
<div class="sec"><div class="sec-title">Colours</div>
  {#each model.colours as colour (colour.key)}<div class="row"><label for={'bloch-colour-' + colour.key}>{colour.name}</label><div class="ctl tc"><button id={'bloch-colour-' + colour.key} type="button" class="cbtn" data-tc="" title={colour.name + ' colour'}><span style:background={colour.swatch}></span></button><span class="cval">{colour.label}</span><input type="hidden" data-bc={colour.key} {@attach liveValue(colour.value)}></div></div>{/each}
</div>
<div class="sec"><div class="sec-title">States</div>
  {#if model.states.length}<div class="bloch-st"><span>Label</span><span>θ</span><span>φ</span><span></span>{#each model.states as state, i}<input type="text" class="mono" data-sl={i} data-tx="math" {@attach liveValue(state.label)} placeholder={state.name} title={'Label of ' + state.name + ' (maths, without $)'} spellcheck="false" aria-label={'Label of ' + state.name}><input type="number" data-st={i + ':t'} {@attach liveValue(state.theta)} step="5" title="θ" aria-label="θ"><input type="number" data-st={i + ':p'} {@attach liveValue(state.phi)} step="5" title="φ" aria-label="φ"><button class="flat st-del" data-act={'delstate:' + i} title="Delete state" aria-label={'Delete ' + state.name}><svg viewBox="0 0 20 20"><path d="M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12"/></svg></button>{/each}</div>{:else}<div class="help">No states yet.</div>{/if}
  <button class="wide" data-act="addstate">Add State</button></div>
<div class="sec"><div class="sec-title">blochsphere</div>
  <div class="row col"><textarea class="code" data-p="src" aria-label="LaTeX source" spellcheck="false" rows="9" {@attach liveValue(model.src)}></textarea></div>
  {#each model.warnings as warning}<div class="err">{warning}</div>{/each}
  <div class="help">Exported with <code>\usepackage{'{blochsphere}'}</code>.</div>
  <button class="wide" data-act="copybloch">Copy blochsphere Code</button></div>
