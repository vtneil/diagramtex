# DiagramTeX logo: usage guide

**Idea:** a round node and a square node joined by a backslash, the character every TeX command starts with. Two node shapes and one edge make the smallest possible diagram.

## Files (`final/`)
| File | Use |
|---|---|
| `symbol.svg` | the mark on light backgrounds |
| `symbol-reversed.svg` | the mark on dark backgrounds (lavender edge) |
| `symbol-small.svg` | 16–32 px: bigger nodes, thicker edge, tighter margin |
| `favicon.svg` | browser tab: the small cut, with the edge turning lavender in dark mode |
| `lockup-horizontal.svg` / `-reversed.svg` | symbol + wordmark, the default lockup |
| `lockup-stacked.svg` | symbol over wordmark, for square or narrow spaces |
| `app-icon.svg` / `app-icon-maskable.svg` | the installed app: the reversed mark on an indigo tile |
| `variants/` | one-colour black, white and indigo of the symbol and both lockups |
| `web/` | PNG icons (already copied into `public/icons`) |

The wordmark is DiagramTeX in Inter Display Bold (SIL Open Font License), outlined, tracked −40 units, with "Te" kerned −120 units. Never retype it in live text.

## Colour
| Name | HEX | RGB | Role |
|---|---|---|---|
| Ink indigo | `#23205A` | 35 32 90 | edge, wordmark, app tile |
| Coral | `#FF5A3C` | 255 90 60 | round node |
| Pen blue | `#2F7BFF` | 47 123 255 | square node |
| Lavender | `#F1EFFF` | 241 239 255 | edge and wordmark on dark |

These are the app's pens (red, blue) and ink, brightened. Contrast: indigo on white 14.7:1; coral 3.1:1 and blue 3.9:1 on white, 4.8:1 and 3.8:1 on the indigo tile (both meet 3:1 for graphics). Coral and blue have similar greyscale values, so in greyscale the circle and square, not colour, keep the nodes apart. That is by design.

## Clear space and size
- **Clear space:** the circle's radius on every side (46 of 256 units, about 18% of the symbol's height).
- **Minimum size:** symbol 16 px using `symbol-small.svg`; master symbol from 32 px; horizontal lockup from 24 px tall.
- **Lockup proportions:** the wordmark's cap height is about half the symbol's height. The gap between symbol and wordmark is about 1.2× the circle's radius. Don't change either.

## Backgrounds
- **Light** (white, paper `#FFFDF8`, light greys): full colour.
- **Dark** (`#1C1B19`, indigo): the reversed versions. The indigo edge disappears on dark backgrounds.
- **Photos and patterns:** one-colour white or black, chosen for contrast.

## Don't
- Swap the node colours, or make both nodes the same shape.
- Rotate the mark. The edge must lean like `\`, not `/`.
- Put the full-colour version on dark or mid-tone backgrounds.
- Add shadows, gradients or outlines; stretch it; or set the wordmark in another font.
- Use the master symbol below 32 px (use the small cut).

## Open items
- **Trademark search:** a professional trademark search is recommended before public use. Node-and-edge marks are common in developer tools.
- **Sidebar:** the mark isn't in the app's sidebar yet; only the icons and favicon were replaced.
