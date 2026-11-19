// The app has one button (public/css/kit.css): outlined by default, `primary` (solid ink) only for the one main
// action of a dialog or editor, `flat` (no outline) for toolbar icons. `danger` turns the red pen on hover.
// `press` makes it shrink while held and spring back (kit.css). The classes are shared with code that still builds
// buttons as HTML strings, so both stay the same button.
export type ButtonVariant = 'default' | 'primary' | 'flat';

/** size 'sm' is --ctl-sm (24px), only for dense secondary controls. */
export type ButtonSize = 'ctl' | 'sm';

/** icon: the button is only an icon (IconButton); withIcon: an icon leads its label (Button with icon). */
export interface ButtonLook { variant?: ButtonVariant; size?: ButtonSize; icon?: boolean; withIcon?: boolean; danger?: boolean; on?: boolean; extra?: string | null }

export function buttonClass({ variant = 'default', size = 'ctl', icon = false, withIcon = false, danger = false, on = false, extra }: ButtonLook): string {
  return ['press', icon && 'icon', size === 'sm' && 'sm', withIcon && 'with-icon', variant !== 'default' && variant, danger && 'danger', on && 'on', extra].filter(Boolean).join(' ');
}
