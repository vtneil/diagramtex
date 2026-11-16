import type { SnapMode } from '../core/state';

// Object/grid modes reserve the lower-right corner for a solid magnet badge.
// All/off retain the original magnet; the button's pressed state distinguishes them.
const magnet = '<g class="snap-magnet"><path d="M10.5 9.5V15a4.5 4.5 0 009 0V9.5H17V15a2 2 0 01-4 0V9.5z" fill="currentColor" stroke="none"/><path d="M10.5 12H13M17 12h2.5" stroke="var(--sheet-raised)" stroke-width="1"/></g>';
const originalMagnet = '<g class="snap-magnet"><path d="M5 3v7a5 5 0 0010 0V3h-3.5v7a1.5 1.5 0 01-3 0V3zM5 6.5h3.5M11.5 6.5H15"/></g>';
const grid = '<path d="M13 8V2H2v11h6M2 7.5h11M7.5 2v11"/>';
const anchors = '<g fill="currentColor" stroke="none"><circle cx="2" cy="2" r="1.5"/><circle cx="13" cy="2" r="1.5"/><circle cx="2" cy="13" r="1.5"/></g>';
export const SNAP_ICONS: Record<SnapMode, string> = {
  objects: '<path d="M13 7V2H2v11h5"/>' + anchors + magnet,
  grid: grid + magnet,
  both: originalMagnet,
  off: originalMagnet,
};
