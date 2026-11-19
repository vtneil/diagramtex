<script lang="ts">
  // A key or shortcut, written the Windows way ("Ctrl+D"); shown as ⌘D on a Mac (keys.ts).
  import { keyLabel } from './keys';
  let { key }: { key: string } = $props();
</script>
<kbd>{keyLabel(key)}</kbd>
