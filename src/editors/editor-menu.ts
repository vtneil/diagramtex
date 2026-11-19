// A block editor's right-click menu: the kit's context menu (src/ui/kit, Menu), at the pointer and above the editor
// (`qe-ctx`). Each editor builds its rows as data and handles the act it gets back; the kit places it, keeps it on
// screen, moves through it with the arrow keys, fades it and closes it on Esc, a press or a wheel elsewhere.
import { openContextMenu, closeContextMenu, contextMenuOpen, type MenuEntry, type MenuItemSpec, type IconName } from '../ui/kit';

export type { MenuEntry, IconName };
export { closeContextMenu as closeEditorMenu, contextMenuOpen as editorMenuOpen };

/** A key pressed in the open menu: the editors listen on window first (capture), so they leave these to the menu. */
export const inEditorMenu = (e: Event) => !!(e.target as Element | null)?.closest?.('.kit-menu');

export function openEditorMenu(e: MouseEvent, items: MenuEntry[], pick: (act: string) => void) {
  openContextMenu(items, e.clientX, e.clientY, pick, { class: 'qe-ctx' });
}

/** A row: what it does, its label, its icon, its shortcut as the editor shows it. */
export function menuRow(act: string, label: string, icon?: IconName | null, key?: string, more: Partial<MenuItemSpec> = {}): MenuItemSpec {
  return { act, label, icon: icon ?? undefined, key: key || undefined, ...more };
}
