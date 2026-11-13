<script lang="ts">
  import { liveValue } from './live-value';
  let { model }: { model: { file: string } } = $props();
</script>
<div class="sec"><div class="sec-title">Image file</div>
  <div class="row"><label for="image-file">File name</label><div class="ctl"><input id="image-file" type="text" data-img="file" {@attach liveValue(model.file)}></div></div>
  <div class="btns"><button type="button" data-imgact="download">Download</button><button type="button" data-imgact="replace">Replace…</button></div>
  <div class="hint-line">Save the file next to your .tex; the export uses <code>{'\\includegraphics'}</code>. Drag a corner to resize (Alt stretches).</div></div>
