const SENSITIVITY = 0.01;
const MAX_STEP = Math.log(1.25);

// Browsers report wheel motion in pixels, lines, or pages. Keep fine trackpad
// motion at its original sensitivity, but limit large mouse-wheel/accelerated
// deltas to one step.
export function wheelZoomFactor(event: Pick<WheelEvent, 'deltaY' | 'deltaMode'>): number {
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  const delta = event.deltaY * unit;
  if (!Number.isFinite(delta)) return 1;
  return Math.exp(-Math.max(-MAX_STEP, Math.min(MAX_STEP, delta * SENSITIVITY)));
}
