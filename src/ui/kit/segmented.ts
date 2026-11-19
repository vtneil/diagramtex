// A switch (segmented control): one track of buttons. One-of switches mark the chosen button; `many` switches are
// a row of independent toggles (.ze-flags) that can each be on. A one-of switch's knob slides to the new choice:
// src/ui/services/segthumb.ts, which Segmented starts as it mounts, puts one knob in every track it finds, so
// string-built switches slide the same way.
import type { IconName } from './icons';

export interface SegmentOption {
  label?: string; // text; leave out for an icon-only segment
  labelClass?: string; // the text in a span of this class (the file-type switch's labels, which open on hover)
  icon?: IconName; // a named icon (icons.ts)
  svg?: string; // or a drawing of its own, as full <svg> markup
  swatch?: { css: string; none?: boolean }; // a colour chip (a fill switch)
  title?: string; // tooltip
  name?: string; // accessible name when the label is a symbol or missing
  on?: boolean;
  disabled?: boolean;
  class?: string;
  attrs?: Record<string, unknown>; // hooks the controller reads (data-*)
}
