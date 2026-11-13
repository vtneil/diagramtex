<script lang="ts">
  import { liveValue } from './live-value';
  let { model }: { model: { name: string } } = $props();
</script>
<div class="sec"><div class="sec-title">Named Point</div>
  <div class="row"><label for="point-name">Name</label><div class="ctl"><input id="point-name" type="text" data-p="tikzName" {@attach liveValue(model.name)} spellcheck="false"></div></div>
  <div class="help">Written as <code>{'\\coordinate (' + model.name + ') at …;'}</code>. Lines that start or end on it stay attached and are written with its name. It draws nothing in exports.</div></div>
