// Captions for option lists the domain keeps as data (src/domain/shapes.ts, fills.ts, node-features.ts): the keys are
// what shapes store and the English names are the lists' own. Each caption is a literal t() here, so the catalogue
// check (tests/localization.mjs) sees it and asks for its Thai. TikZ arrow names (Stealth, Latex, To) stay as they are.
import { t } from './index';

type Names = Record<string, () => string>;
const pick = (names: Names, key: string, english: string) => names[key]?.() ?? english;

const DASH: Names = {
  solid: () => t('dash.solid', 'Solid'), dotted: () => t('dash.dotted', 'Dotted'), dashed: () => t('dash.dashed', 'Dashed'),
  dashdot: () => t('dash.dashdot', 'Dash dot'), 'p:1.5 1.5': () => t('dash.dense', 'Densely dashed'),
  'p:6 3': () => t('dash.long', 'Long dashes'), 'p:6 2 1 2 1 2': () => t('dash.dashdotdot', 'Dash dot dot'),
};
const TIP: Names = {
  none: () => t('tip.none', 'None'), to: () => t('tip.to', 'To (open)'),
  stealthr: () => t('tip.stealthr', 'Stealth, reversed'), latexr: () => t('tip.latexr', 'Latex, reversed'), tor: () => t('tip.tor', 'To, reversed'),
  stealth2: () => t('tip.stealth2', 'Double stealth'), latex2: () => t('tip.latex2', 'Double latex'), to2: () => t('tip.to2', 'Double to'),
  harpoon: () => t('tip.harpoon', 'Harpoon (left)'), harpoonr: () => t('tip.harpoonr', 'Harpoon (right)'),
  hooks: () => t('tip.hooks', 'Hooks'), hook: () => t('tip.hook', 'Hook'),
  bar: () => t('tip.bar', 'Bar'), bar2: () => t('tip.bar2', 'Double bar'), tobar: () => t('tip.tobar', 'To with bar'),
  bracket: () => t('tip.bracket', 'Bracket'), bracketr: () => t('tip.bracketr', 'Bracket, reversed'),
  paren: () => t('tip.paren', 'Parenthesis'), parenr: () => t('tip.parenr', 'Parenthesis, reversed'),
  circle: () => t('tip.circle', 'Circle'), ocircle: () => t('tip.ocircle', 'Open circle'),
  square: () => t('tip.square', 'Square'), osquare: () => t('tip.osquare', 'Open square'),
  diamond: () => t('tip.diamond', 'Diamond'), odiamond: () => t('tip.odiamond', 'Open diamond'), plus: () => t('tip.plus', 'Cross (rays)'),
};
const SHAFT: Names = {
  single: () => t('shaft.single', 'Single'), double: () => t('shaft.double', 'Double'), wave: () => t('shaft.wave', 'Wavy'), ticks: () => t('shaft.ticks', 'Ticked'),
};
const CROSS: Names = {
  none: () => t('cross.none', 'None'), hop: () => t('cross.hop', 'Hop over lines below'), gap: () => t('cross.gap', 'Gap (white halo)'),
};
// TikZ placements and anchors: the keyword is what the code says, so a translated name keeps it in brackets
const PLACE: Names = {
  above: () => t('pos.above', 'above'), 'above right': () => t('pos.aboveRight', 'above right'), right: () => t('pos.right', 'right'),
  'below right': () => t('pos.belowRight', 'below right'), below: () => t('pos.below', 'below'), 'below left': () => t('pos.belowLeft', 'below left'),
  left: () => t('pos.left', 'left'), 'above left': () => t('pos.aboveLeft', 'above left'),
};
const ANCHOR: Names = {
  center: () => t('anchor.center', 'center'), north: () => t('anchor.north', 'north'), 'north east': () => t('anchor.northEast', 'north east'),
  east: () => t('anchor.east', 'east'), 'south east': () => t('anchor.southEast', 'south east'), south: () => t('anchor.south', 'south'),
  'south west': () => t('anchor.southWest', 'south west'), west: () => t('anchor.west', 'west'), 'north west': () => t('anchor.northWest', 'north west'),
};
const keyword = (name: string, key: string) => (name === key ? key : `${name} (${key})`);

export const dashName = (key: string, english: string) => pick(DASH, key, english);
export const tipName = (key: string, english: string) => pick(TIP, key, english);
export const shaftName = (key: string, english: string) => pick(SHAFT, key, english);
export const placeName = (key: string) => keyword(pick(PLACE, key, key), key);
export const anchorName = (key: string) => keyword(pick(ANCHOR, key, key), key);
/** A select field's option in the properties panel, by the field it belongs to; null when it has no caption here. */
export function optionName(field: string, key: string): string | null {
  if (field === 'cross') return CROSS[key]?.() ?? null;
  if (field === 'font' && key === 'default') return t('font.default', '(font default)');
  return null;
}
