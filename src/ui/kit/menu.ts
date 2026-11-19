// A menu (.ctx): rows of an icon, a label, a shortcut and, for a pick-one group, a tick; rules between groups;
// small headings; submenus. Menus are data, so the app, Quick, the Table and every block editor build the
// same rows: a row says what it does (act), and the menu calls back with it.
import type { IconName } from './icons';

export interface MenuItemSpec {
  act: string; // passed back when the row is chosen
  label: string;
  icon?: IconName; // a named icon (icons.ts)
  svg?: string; // or a drawing of its own: the inside of a 20-unit <svg>, or a whole <svg>
  key?: string; // shortcut, written the Windows way ("Ctrl+D", "Del")
  title?: string; // tooltip
  danger?: boolean; // destructive: turns the red pen when highlighted
  disabled?: boolean;
  checked?: boolean; // one of a pick-one group (role menuitemradio): ticked when true
  sub?: MenuEntry[]; // a submenu, opened from this row
}
/** A grid of icon tiles, one choice each (the Table's borders): named by their tooltips, `columns` across. */
export interface MenuTiles { tiles: MenuItemSpec[]; columns?: number }
/** A row, a rule between groups ('-'), a small heading over the rows that follow, or a grid of icon tiles. */
export type MenuEntry = MenuItemSpec | '-' | { heading: string } | MenuTiles;

export const isRule = (e: MenuEntry): e is '-' => e === '-';
export const isHeading = (e: MenuEntry): e is { heading: string } => typeof e === 'object' && 'heading' in e;
export const isTiles = (e: MenuEntry): e is MenuTiles => typeof e === 'object' && 'tiles' in e;

/** Leave out rules at either end and rules in a row, so menus can be built from optional groups. */
export function tidy(entries: (MenuEntry | false | null | undefined | '')[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const e of entries) {
    if (!e) continue;
    if (isRule(e) && (!out.length || isRule(out[out.length - 1]))) continue;
    out.push(e);
  }
  while (out.length && isRule(out[out.length - 1])) out.pop();
  return out;
}
