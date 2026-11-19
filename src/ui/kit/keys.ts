// Shortcuts are written the Windows way once ("Ctrl+Shift+Z", "Del"). On a Mac they are shown as glyphs in the
// standard order ⌃⌥⇧⌘ (Apple's keyboard guidelines): ⇧⌘Z, ⌫. Elsewhere they stay as written.
export const isMac = typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const GLYPHS: Record<string, string> = { Del: '⌫', Enter: '↩', Esc: '⎋', Shift: '⇧', Alt: '⌥' };

/** How a shortcut is shown on this computer. */
export function keyLabel(key: string, mac = isMac): string {
  if (!mac || !key) return key;
  const parts = key.split('+'), mods = new Set<string>();
  while (parts.length > 1 && ['Ctrl', 'Cmd', 'Shift', 'Alt'].includes(parts[0])) mods.add(parts.shift()!);
  const rest = parts.join('+');
  return (mods.has('Alt') ? '⌥' : '') + (mods.has('Shift') ? '⇧' : '') + (mods.has('Ctrl') || mods.has('Cmd') ? '⌘' : '') + (GLYPHS[rest] || rest);
}

const TEXT_GLYPHS: Record<string, string> = { Del: '⌫', Delete: '⌫', Backspace: '⌫', Enter: '↩', Return: '↩', Esc: '⎋', Tab: '⇥' };
const POINTER = /^(scroll|wheel|drag|click)$/i;
/** Shortcuts inside running text, as this computer shows them: on a Mac "Undo (Ctrl+Shift+Z)" reads "Undo (⇧⌘Z)" and
 *  "Ctrl+scroll" reads "⌘-scroll". Shift on its own ("Shift+drag") stays in words. Elsewhere the text is unchanged. */
export function macKeys(text: string, mac = isMac): string {
  if (!mac || !text) return text;
  return text.replace(/\b((?:(?:Ctrl|Cmd|Shift|Alt)\+)+)([^\s(),:;+]+)/g, (all, mods: string, key: string) => {
    const m = mods.split('+');
    if (!m.some((x) => x === 'Ctrl' || x === 'Cmd' || x === 'Alt')) return all;
    const g = (m.includes('Alt') ? '⌥' : '') + (m.includes('Shift') ? '⇧' : '') + (m.includes('Ctrl') || m.includes('Cmd') ? '⌘' : '');
    return POINTER.test(key) ? `${g}-${key.toLowerCase() === 'wheel' ? 'scroll' : key}` : g + (TEXT_GLYPHS[key] || key);
  });
}
