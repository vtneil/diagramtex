/**
 * Field values that follow the model without fighting the person typing.
 *
 * Svelte's `value={…}` writes whenever its expression changes and remembers the last value it wrote, so a live
 * re-render mid-typing overwrites a half-typed number ("0." reads back as "" from a number input), and a value the
 * application rejected or normalised without changing the model is never shown again. `{@attach liveValue(x)}`
 * instead writes only when the field is not focused, and re-syncs once focus leaves it (after the focusout commit
 * handlers have run), so the field always ends up showing the model.
 */
type Field = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const latest = new WeakMap<Field, string>();

function write(node: Field) {
  const text = latest.get(node);
  if (text === undefined || document.activeElement === node || node.value === text) return;
  node.value = text;
}

/** `deps` are only read so the attachment re-runs when they change (a select's option list). */
export function liveValue(value: unknown, ..._deps: unknown[]) {
  const text = value == null ? '' : String(value);
  return (node: Field) => {
    latest.set(node, text);
    write(node);
    // A select's options may be rendered after its attachment first runs.
    if (node instanceof HTMLSelectElement && node.value !== text) queueMicrotask(() => write(node));
    const sync = () => setTimeout(() => { if (node.isConnected) write(node); }, 0);
    node.addEventListener('blur', sync);
    return () => node.removeEventListener('blur', sync);
  };
}
