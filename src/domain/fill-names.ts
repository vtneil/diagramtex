import { t } from '../i18n';
// The names of the hatch patterns and gradients (TD.PATTERNS in src/domain/fills.ts), in the interface language.
const PATTERN: Record<string, () => string> = {
  vlines: () => t('color.pat.vlines', 'Vertical lines'), hlines: () => t('color.pat.hlines', 'Horizontal lines'), grid: () => t('color.pat.grid', 'Grid'),
  ne: () => t('color.pat.ne', 'North-east lines'), nw: () => t('color.pat.nw', 'North-west lines'), cross: () => t('color.pat.cross', 'Crosshatch'),
  bricks: () => t('color.pat.bricks', 'Bricks'), dots: () => t('color.pat.dots', 'Dots'),
};
/** `_lang` only makes a Svelte caller re-run on a language switch */
export const patternName = (k: string, _lang?: string): string => (PATTERN[k] ? PATTERN[k]() : t('color.pattern', 'Pattern'));
export const gradientName = (kind: string): string => (kind === 'radial' ? t('color.radialGradient', 'Radial gradient') : t('color.linearGradient', 'Linear gradient'));
