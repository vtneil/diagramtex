---
name: diagramtex-ui
description: House rules for any change to DiagramTeX's interface (public/css, public/index.html, app.js, docview.js, quick.js, the block editors). Use before adding or changing a control, panel, menu, toolbar, mode, dialog, animation, zoom or layout, and when reviewing UI. It lists the quirks the owner has already corrected, so they are not repeated.
---

# DiagramTeX UI rules

The full design system is `.interface-design/system.md` (tokens, sizes, every component). Read the sections
for what you are touching. This file is the short list of what the owner checks every time. Breaking any of
these has already earned a correction once.

## 1. Nothing moves unless the user moved it

The most frequent complaint. Before finishing, flip every switch, mode and state you touched and check that
nothing else shifts.

- **Switches and bars keep their place across modes.** When a mode hides controls, hide them with
  `visibility: hidden` (they keep their room), not `display: none`. Examples: the Diagram | Document switch,
  the top-bar file buttons in Quick mode, the engine box anchored to the sidebar bottom.
- **Hovering a switch whose labels open out opens all of them** (`#kindSeg:hover`), so choosing doesn't make
  it wiggle.
- **Folding a sidebar or panel doesn't move the canvas or the page.** Selecting something doesn't move a pane.
- **Re-rendering keeps the scroll.** Save `scrollTop`/`scrollLeft` around anything that lays out at another
  zoom. Anchor the element under the pointer (see `renderKeep` in docview.js) and focus with
  `{ preventScroll: true }`. Opening, switching and leaving an edit must not jump the page.
- **No flashes in animations**: no grey layout for a frame, and no scroll bar that disappears and comes back
  while a pane eases open or shut.

## 2. The floating right panel is not part of the view

`#rightCol` floats over the stage (`--props-w` 280px + 8px each side). Centring, Fit, Fit Width, empty
hints and the document page all use the area to its left (`fitArea()` in app.js, `padding-right` on
`#docview`). Never centre across the whole window.

## 3. Nothing overlaps or interferes

Check stacking and hit areas wherever two floating things meet. Fixed so far:
- block tools vs the editing card's toolbar
- arrows over text
- a fold button over the browser's scroll bar (the whole header became the click target instead)
- rotate zones over resize handles (rotate zones point straight out from each edge's middle, never a
  circle round the corner)

Raise the z-index of the thing the user is reaching for, and keep it clear of rounded corners.

## 4. Colour means something

- The only interface colour is ink plus two pens: `--redpen` for selection and danger, `--bluepen` for focus
  and construction. Active states use ink. User content and the logo are the only other colour.
- **Editable fields are white** (`--sheet-raised` with a `--rule-strong` border). A tinted (`--well`) box
  means read-only, so **a text field is never tinted**.
- Buttons must not look like fields: panel actions use a `--wash-strong` fill with no border, and top-bar
  output buttons are outlined. All buttons in a group share one colour; solid black was rejected as too loud.
- **Anything destructive turns red pen on hover**, everywhere: menus, block editors, the trash icon.
- Maths inside LaTeX source fields is `--mathpen` green (`texhighlight.js`).
- Icons are monotone line icons. Show emphasis with filled vs outlined, never with colour.

## 5. Shape and spacing

- 4px grid. Controls are `--ctl` 28px; `--ctl-sm` 24px only for dense secondary ones. UI text is Inter
  Display (Medium as normal) plus mono for numbers. **No serif in the UI**: `--font-tex` is for content only.
- Radii: `--r-sm` 4px, `--r` 6px, `--r-lg` 10px, `--r-xl` 12px. **Corners nest concentrically**: inner
  radius = outer radius − inset. A button in a corner sits the same distance from the right edge and the
  bottom edge.
- Gaps between options or menu rows equal the container's padding. Segmented tracks use 3px padding and a
  3px gap: 2px felt cramped and 4px looked worse.
- Menus on the right side of the window line up with their control's right edge and grow left.
- Toolbars stay on one line at a 1400px window. Measure them (`scrollWidth`, the tops of the children); don't
  eyeball them.

## 6. Use the app's own pieces

- Dropdowns: a plain `<select>` gets the custom menu from `selectmenu.js`. Don't build another, and never let
  a native menu show.
- Dialogs: `TD.confirm` / `TD.prompt` / `TD.alert` (`dialog.js`), never `alert` / `confirm` / `prompt`.
  Buttons name the action, and destructive ones pass `danger: true`.
- Tooltips: a `title` becomes the app's tooltip (`tooltip.js`), shown after a delay. Shortcuts show ⌘ / ⌥ / ⇧
  on Mac, never "Ctrl".
- Switches: `.seg` plus `segthumb.js` for the sliding knob (220ms, `--ease`, still under reduced motion).
- Cursors: standard CSS cursors (`*-resize`, `move`, `grab`). The hand (`pointer`) is for buttons and links
  only, never canvas handles.

## 7. Interaction habits the owner expects

- Things that open on a choice open on **hover** (tool flyouts), with a short grace period to cross gaps.
- Item actions (rotate, mirror, insert, delete) go in a **right-click menu** on the item, shared across the
  main app and the block editors. Don't put them in a side pane.
- Rename **in place**, where the item is (a sidebar row or a group name). Double-clicking a label edits it in
  the user's chosen input mode (LaTeX or MathLive).
- Placing a block only selects it; it never opens its editor on its own.
- Editors open roomy, not one line high. ⌘S inside an editor saves and keeps it open, so Esc doesn't ask to
  discard.
- Paste lands in the middle of the visible view. A zoom percentage is a field you can type in; 1:1 and Fit
  are separate buttons.
- Icons point the way they act: tree-direction icons follow the tree, and insert-before/after icons show
  where the new item goes.
- Every open and close animates (about 220–240ms, eased out) and respects reduced motion.

## 8. Before saying a UI change is done

1. Run the `texdiagram` server from `.claude/launch.json` (port 5173). The Python server lets browsers cache
   JS and CSS, so fetch changed files with `fetch(url, { cache: 'reload' })` before `location.reload()`.
   The owner tests in Brave on a Mac, over localhost.
2. Check light and dark (`resize_window` colorScheme), a 1400×900 window and the narrower browser pane.
3. Flip every mode and switch you touched, and check rule 1.
4. Test on a scratch document made with **New**, and delete it afterwards from the sidebar's right-click
   menu. Never delete or edit the owner's documents.
5. When a decision changes the system, update `.interface-design/system.md`, and the README if users see it.
6. Commit or release only when asked. A release bumps `TD.VERSION` in `js/shapes.js` and `CACHE` in
   `sw.js`, commits as "Title (vX.Y.Z)", tags `vX.Y.Z` and pushes both. Deploy (`npx wrangler deploy`) only
   when asked.
