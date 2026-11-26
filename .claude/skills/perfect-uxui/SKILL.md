---
name: perfect-uxui
description: DiagramTeX's one UI/UX skill. It holds the house rules for any change to the interface (public/css, src/index.html, src/ui (Svelte), src/application/app.ts, src/application/docview.ts, src/ui/services/quick.ts, the block editors), with Linear's method and Apple's Human Interface Guidelines folded in, and the owner's decisions ranked above both wherever they disagree (fonts, colour, radii, sizes, copy, motion). Use it before adding or changing a control, panel, menu, toolbar, mode, dialog, animation, zoom, caption or layout, before adding a block or block editor, when choosing between two designs, when reviewing or critiquing UI ("is this good UI?", a screenshot, a PR), and before proposing a pattern taken from another product.
---

# Perfect UX/UI: DiagramTeX house rules, with Linear and Apple folded in

This is the only interface skill the project needs. It combines three sources:

1. **DiagramTeX's own rules** (the base). These are the owner's corrections, `.interface-design/system.md` and
   `public/css/tokens.css`.
2. **Linear's method:** calm chrome, structure you feel rather than see, dense aligned rows, keyboard-first speed.
3. **Apple's Human Interface Guidelines:** the eight principles, the accessibility floors, macOS sizes, and the rules
   for writing, feedback and review.

**Precedence: house rules, then Linear, then Apple.** Where the app has decided something, that wins (§2 lists every
clash). Use Linear and Apple only to fill gaps, and record any new decision in `.interface-design/system.md`.

Where to read further:
- `references/building.md`: how the interface is built (the shell, the kit's components, lists, a block's files,
  the block editor layout). Read it before touching code.
- `references/review.md`: how to review or improve a design (Apple's principles and lenses, the report format,
  Linear's checklist and stress test).
- `.interface-design/system.md`: exact measurements and behaviour for every area. Read the sections you touch.
- `.interface-design/kit-map.md`: which kit component replaces which hand-written copy.

Every numbered rule below has earned a correction from the owner at least once. Don't repeat them.

---

## 1. Who it is for and how it should feel

- **Who:** someone writing a paper, a problem set or lecture notes who needs a figure for their LaTeX. They arrive
  from a `.tex` file and go back to one.
- **Task:** draw a precise figure and get clean TikZ out of it.
- **Feel:** a drafting table with engineering paper, ink and a red pencil. Quiet, exact and warm. **Not a SaaS
  dashboard.**
- **Signature:** the centimetre rulers along the canvas edges, in TikZ coordinates with y up. The selection's extent is
  shaded on them in a red-pencil wash, and a red hairline follows the cursor. Spend boldness there and keep the rest
  quiet.
- **The user's content is the brightest thing on screen** (Linear: don't compete for attention you haven't earned).
  Chrome, navigation and metadata recede. When two options look equal, choose the quieter one.
- **Being editable is the product.** Something drawn in the app stays editable in the app. A compiled picture is
  acceptable only where no editor exists.
- Apple's eight principles still work as the first filter: purpose, agency, responsibility, familiarity,
  flexibility, simplicity, craft, and delight (never decoration). See `references/review.md`.

## 2. Where the house overrides Linear and Apple

Follow the **DiagramTeX** column. Never "correct" the app towards Linear or Apple.

| Topic | Linear / Apple say | DiagramTeX does (wins) |
|---|---|---|
| **UI font** | Inter or the system font; system type for controls | **Atkinson Hyperlegible Next** from `public/fonts/` at 106% (`size-adjust`). **Thai is Sarabun** at 105%, after Atkinson in `--font-ui` and `--font-mono`. Numbers and code use **Atkinson Hyperlegible Mono** with `tabular-nums`. The app ships its own fonts so the chrome looks the same on every platform |
| **Normal weight** | 400–450, with Medium only for titles and selection | **Medium (500) is normal.** The `@font-face` rules declare 500–800, so 400 draws as 500. 600 means SemiBold (section titles, the selected row); 700 means Bold |
| **Serif** | A display cut for headings | **No serif in the UI.** `--font-tex` is for content only (canvas text, the typeset page). The one exception is the italic maths *x* glyph, because it stands for content |
| **Type scale and minimum** | 13 / 12, never below 11 | Only `--fs-caption` 10, `-small` 11, `-label` 12, `-body` 13, `-title` 15. **Nothing below 10px** (Apple's macOS minimum) |
| **Bold in chrome** | None | Section titles are 11px/600 in pencil, sentence case. Selected rows are 600 |
| **Accent colour** | One accent for primary, focus and selection | **No accent hue.** The interface uses ink and two pens: `--redpen` for selection and danger, `--bluepen` for focus and construction. Active states and primary buttons are ink |
| **How tokens are made** | Built in oklch from a base, an accent and a contrast level | Fixed warm hex tokens in `tokens.css` (paper, sheet, sheet-raised, well, ink, graphite, pencil, faint, the pens), redefined for dark mode and Increase Contrast. Don't regenerate them |
| **Radii** | 4 / 6 / 8 / 12 | `--r-sm` 4, **`--r` 8 for controls and rows**, `--r-lg` 12, `--r-xl` 20. A container's radius is worked out from its contents (§8) |
| **Row height** | 32–36 for lists | **28px** (`--ctl`) for the file list, menus and ListRow. 32px for Layers and the ⌘K results |
| **Control size** | 28 default, 24 compact, 32 for primary | `--ctl` 28px (Apple's macOS default). `--ctl-sm` 24px only for dense secondary controls. Rail and editor tools are 32px; phone buttons 44px |
| **Selected vs hover** | Different looks | Hover is `--well`. Selected is a fill (`--wash-strong`, ink, 600). **Never an edge bar** |
| **Buttons** | One primary per view | **One outlined button** everywhere. `.primary` (solid ink) is only for the single main action. Toolbars use `.icon.flat`. No grey-filled buttons |
| **Focus ring** | 2px in the accent colour | **Blue pen**, `:focus-visible` only. A field being typed into keeps its ring |
| **Tooltip delay** | About 500ms | **800ms**, then instant within 400ms of the last one hiding. Ink fill, 12px Medium. A press hides it; touch never shows it |
| **Copy case** | Sentence case everywhere (Linear) | **Title-style** for buttons, menu items and dialog titles (Apple's rule). **Sentence case** for checkbox labels, hints and section titles |
| **Spelling** | — | **UK spelling** (colour, centre). **Leave "math" wherever captions already use it** ("$math$", "Math style", "display math"); never rewrite it to "maths" or the reverse. Never change LaTeX/TikZ keys or message ids |
| **Appearance** | No in-app appearance switch (Apple) | A **System / Light / Dark** switch at the right end of the top bar. This is deliberate |
| **Motion** | Hover 80–120ms, menus 120–180, panels 200–250; no press effect | Nothing runs longer than 250ms. Open and close take 220–240ms with `--ease`. **Everything you click presses** and springs back in `--t-press` (240ms, `--ease-spring`) |
| **Undo feedback** | An undo toast | The status hint names what went and the key that brings it back (`undoHint()`) |
| **Multi-select actions** | A floating action bar | The **right-click menu** (the same in the main app, Quick and every editor), plus fields in the properties panel |
| **Loading** | Skeleton rows | Keep the approximation until the real picture is ready: no spinner, no badge, no blank frame |
| **Command reach** | Every command in the menu bar (Apple) | Every command is reachable from **⌘K search** and the right-click menus. The app has no menu bar |
| **Glass and blur** | Liquid Glass on floating layers (Apple) | None. Floating layers use a solid raised sheet, a hairline and `--shadow-pop` |
| **File-type switch** | Hover must not shift the layout | Hovering `#kindSeg` opens every label and pushes the bar. The owner chose this; don't flag or "fix" it |

## 3. Nothing moves unless the user moved it

This is the most frequent complaint. Before finishing, flip every switch, mode and state you touched and check that
nothing else shifts.

- **Switches and bars keep their place across modes.** When a mode hides controls, hide them with
  `visibility: hidden` so they keep their room, not with `display: none`. Examples: the Diagram | Document
  switch, the top-bar file buttons in Quick mode, the engine box anchored to the bottom of the sidebar, and
  the Document text toolbar.
- **Hovering a switch whose labels open out opens all of them** (`#kindSeg:hover`), so choosing doesn't make
  it wiggle.
- **Folding a sidebar or panel doesn't move the canvas or the page.** Selecting something doesn't move a pane.
- **Re-rendering keeps the scroll.** Save `scrollTop`/`scrollLeft` around anything that lays out at another
  zoom. Anchor the element under the pointer (see `renderKeep` in src/application/docview.ts) and focus with
  `{ preventScroll: true }`. Opening, switching and leaving an edit must not jump the page.
- **Re-rendering keeps what the user is typing.** Panels re-render in place (`renderView`,
  `src/ui/render-view.svelte.ts`) and keep the focused field's node, value and caret. Editors redraw their
  SVG through `patchSvg` (`src/ui/svg-patch.ts`), never `innerHTML`, so unchanged elements and decoded label
  pictures survive a pan or a drag.
- **No flashes in animations**: no grey layout for a frame, and no scroll bar that disappears and comes back
  while a pane eases open or shut. A label keeps its old picture until the new one has decoded.
- **Text that changes length keeps its box.** A status line or note that can show several texts lays them all out in
  one grid cell, so the box never resizes.
- **Hover never shifts layout** (Linear): a row's actions and shortcut hints appear in room already kept for them.

## 4. The floating right panel is not part of the view

`#rightCol` floats over the stage (`--props-w` 280px + 8px each side). Centring, Fit, Fit Width, empty
hints, pasting and the document page all use the area to its left (`fitArea()` in src/application/app.ts,
`padding-right` on `#docview`). Never centre across the whole window.

## 5. Nothing overlaps or interferes

Check stacking and hit areas wherever two floating things meet. Fixed so far:
- block tools vs the editing card's toolbar
- arrows over text
- a fold button over the browser's scroll bar (the whole header became the click target instead)
- rotate zones over resize handles (rotate zones are small tabs straight out from each edge's middle, kept
  9px clear of handles, never a circle round the corner)
- keys in an embedded (Quick) editor's output bar reaching the editor (`data-outside`)

Raise the z-index of the thing the user is reaching for, and keep it clear of rounded corners. A control may look
small, but its hit area is at least 28px (Linear, Apple).

## 6. Colour means something

- The only interface colour is ink plus two pens: `--redpen` for selection and danger, `--bluepen` for focus
  and construction (control points, guides, snapping, margins, drop targets). Active states use ink. `--marker`
  (amber) only marks something waiting: unsaved changes or a newer version (and the crossing marquee). User content
  and the logo are the only other colour, besides the top bar's save status dot (red / yellow / blue pens and
  `--okpen` green for a file saved to disk; nowhere else).
- **Editable fields are white** (`--sheet-raised` with a `--rule-strong` border). A tinted (`--well`) box
  means read-only, so **a text field is never tinted**. The one exception is a search field (`SearchField`): tinted
  while unfocused, white once focused.
- **Every button is the app's one outlined button** (the default `button`): panel actions, top-bar output
  buttons, list actions. No grey-filled (`--wash-strong`, borderless) buttons; the owner had them all changed.
  Only `.primary` is solid, and only for the one main action (Done, Copy PNG). Solid black was rejected as
  too loud for anything else. Toolbar icons are `.icon.flat`.
- **Anything destructive turns red pen on hover**, everywhere: menus, block editors, the bin icon. The bin is
  one drawing everywhere (`M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12`, 20-unit box).
- Maths inside LaTeX source fields is `--mathpen` green (`src/ui/services/texhighlight.ts`).
- Icons are monotone line icons (graphite, about 1.2–1.5px), one drawing per meaning from `src/ui/kit/icons.ts`. Show
  emphasis with filled vs outlined, never with colour. Add an icon only where it carries state or speeds up a scan
  (Linear: an icon beside every label is noise).
- Selection is red pen (a 1px dashed box, 7.5px white squares as handles, a red-wash marquee).
- Elevation goes paper → sheet → sheet-raised. Shadows only where something floats (menus, popovers, the colour
  picker, modals, the inline editor) and on the document page.
- User content stays on a light surface in both appearances (`--canvas`, `.doc-page`). What the app draws on that
  canvas uses `--canvas-ink` / `-pencil` / `-paper`, never the plain tokens, which turn light in dark mode.
- Never let meaning rest on colour alone (Apple). Check light, dark and Increase Contrast
  (`prefers-contrast: more` strengthens rules and promotes `--pencil` to `--graphite`). Text contrast is at least
  4.5:1, measured from the hex values.
- No gradients, glows, glass or coloured backgrounds to show hierarchy (Linear).

## 7. Type

- UI text is **Atkinson Hyperlegible Next** (Medium as normal, 13px; labels 12px; section titles 11px/600 in pencil,
  sentence case), plus **Atkinson Hyperlegible Mono** with tabular numbers for values, coordinates, counts, the status
  line, rulers and code, with **Thai in Sarabun**, all served from `public/fonts/`. **No serif in the UI**:
  `--font-tex` is for content only.
- Sizes are tokens (`--fs-caption` 10, `-small` 11, `-label` 12, `-body` 13, `-title` 15). Nothing below 10px.
  `npm run check` fails when a stylesheet gains a colour literal or a px font size.
- Hierarchy comes from colour level (ink, graphite, pencil) and weight, not size (Linear). Never use `opacity` on text.
- A name cut short with an ellipsis shows in full in the tooltip on hover; the tooltip service does it, so no markup
  is needed. Palette item names never cut: they wrap, or shrink to 10px for a single long word.
- Thai runs longer: check narrow controls in Thai for truncation and clipped tone marks.

## 8. Shape and spacing

- 4px grid. Controls are `--ctl` 28px; `--ctl-sm` 24px only for dense secondary ones. No transition over 250ms (a
  press springs back in `--t-press`).
- Radii (`tokens.css`): `--r-sm` 4px (swatches, kbd, segments), `--r` 8px (buttons, inputs, tracks,
  menu rows), `--r-lg` 12px (menus, popovers, cards: 8 + 4 inset), `--r-xl` 20px (modals: head buttons sit
  12px in, 8 + 12).
- **Corners nest concentrically**: inner radius = outer radius − inset. When you make a new container, work
  its radius out from what sits in it (the button radius plus its inset), written as a `calc()` on the
  tokens, rather than picking a token by eye. A button in a corner sits the same distance from the right
  edge and the bottom edge. Square and chamfered corners were both tried and rejected. What the CSS has now:

  | container | content inset | corner |
  |---|---|---|
  | segment in a `.seg` track | 3px | `calc(var(--r) - 3px)` = 5px inside the 8px track |
  | menu, select menu (dash, width, tips too), autocomplete (`.ctx`, `.selmenu`) | 4px | `--r-lg` 12px (8 + 4) |
  | properties / layers window, cards, popovers | 8px from the stage | `--r-lg` 12px |
  | tool flyout (`.popover.flyout`) | 8px | `calc(var(--r) + 8px)` = 16px |
  | Export popover (`.exp-pop`) | 12px | `calc(var(--r) + 12px)` = 20px |
  | block editor and other modals (`.modal-box`) | head buttons 12px from the right | `--r-xl` 20px |
  | dialog (`.tdd-box`) | `--tdd-inset` 14px, at both ends of the button row | `calc(var(--r) + var(--tdd-inset))` = 22px |
  | tooltip, swatch, kbd | none | `--r-sm` 4px |

- Gaps between options equal the container's padding. Segmented tracks use 3px padding and a 3px gap: 2px
  felt cramped and 4px looked worse. Menus have 4px padding round `--ctl` 28px rows with `--r` corners;
  select rows sit 4px apart, while context-menu rows touch and are grouped by `hr` rules.
- Measurements to match: top bar two 44px rows; groups 16px apart; tool rail 48px with 32px buttons; file
  list 200px with 28px rows inset 8px; properties panel 280px, sections 12×16px, an 84px label column,
  40px head; rulers 18px; status line 24px; on/off switch 28×16 with a 12px knob; picture-menu tiles 76px.
- **Align on shared vertical lines** (Linear). Icon columns, titles and first columns share one x position; a short
  value must not move the column after it.
- Menus open below their control (above when there is no room). On the right side of the window (the
  properties panel, Export) they line up with the control's right edge and grow left; elsewhere left edges
  meet. Submenus sit 4px clear of their parent.
- Selected rows are marked by a fill, never an edge bar. Hover in every menu is the `--well` tone.
- Toolbars stay on one line at a 1400px window. Measure them (`scrollWidth`, the tops of the children); don't
  eyeball them. Narrower, they shed labels and icons in steps and then scroll; they never wrap mid-control.
- No pills, cards or boxes inside boxes: the phone page and the guide were flattened for this. Group with space and
  alignment; draw a hairline only when nothing else works (Linear: structure is felt, not seen).

## 9. Use the app's own pieces

Before writing a control, look for it here and in `references/building.md`. Build a new shared piece only when two
places need it, and then replace the copies. Consistency comes from reuse (Apple: familiarity).

- **Buttons and icons:** `Button`, `IconButton` and `Icon` from `src/ui/kit`. Shortcuts in a
  title are written the Windows way (`Ctrl+Enter`); never build them from `isMac`. In Svelte, a key on its own
  is `<Kbd key="Ctrl+D" />`; in strings, `keyLabel()`.
- **Panel forms:** build `FormPanelModel` sections with the helpers in `src/ui/forms.ts` (`section`, `row`,
  `input`, `number`, `check`, `select`, `help`, `errors`) and, in editors, `src/ui/editor-fields.ts`
  (`field`, `numField` with a unit, `segments` for an icon or text switch, `codeRow`, `note`, `actionRow`,
  `texColour`). `Control.svelte` / `FormRows.svelte` render them, with the label column, ARIA names and
  translated captions already handled. TeX fields set `data-tx: 'math' | 'text'`, which gives the standard
  placeholders **Maths, without $** and **Text, $math$**. A row whose `controlClass` is a `seg-ctl` track of
  buttons is drawn as the kit's `Segmented`. In a hand-written Svelte panel, use the kit's fields directly.
- **Field values in Svelte:** use `{@attach liveValue(x)}` (`src/ui/live-value.ts`), never `value={x}`. A plain
  binding rewrites the field while the user types (e.g. `0.` becomes `0`). The exception is a dialog's prompt
  field, which gets its text once and is never written again. Every input needs a name: `aria-label` or a
  linked `<label>`.
- **Dropdowns:** `Select` from the kit in Svelte, for plain and drawn lists alike (dash, width presets, tips, shafts: built by
  `drawnPicker` in app.ts); never a button that opens its own picker. Any `<select>` gets the custom menu from `src/ui/services/selectmenu.svelte.ts`; give
  `Select` `pictures` (options' `svg` and `short`; a form row's `pictures`) for a grid of picture tiles, the kit's Tile as options. Don't build another, and never
  let a native menu show.
- **Switches:** `Segmented` in Svelte (`.seg`, or `.seg-ctl` with `panel`), plus `src/ui/services/segthumb.ts` for the sliding knob (220ms, `--ease`, it slides under
  reduced motion too). On/off flags that belong together share one `.seg.ze-flags` track (`many`) with no knob; the
  toggled one fades instead (200ms, from the same service). `Segmented` starts the service itself. A single
  on/off setting is `Switch` (a checkbox with `role="switch"`). Alignment is `Segmented` with `class="seg-align"` and the registry's align icons (`ALIGN_ICON` in `src/ui/kit/icons.ts`).
- **Colours:** always `ColourButton` (the `.cbtn` swatch + `.cval` name) + `TD.openColorPicker` (src/ui/ColorPicker.svelte in the kit
  Popover; a grid of colour chips is the kit's `Swatches`); in LaTeX blocks,
  `TD.texColor` / `texColour()` so presets are written as xcolor names. Toolbar colour buttons are a
  `SplitButton` with `toolbar`, `icon="textColour"` or `"fillColour"` and `swatch` (the colour, which tints the icon's `.sw` bar). Never `<input type="color">` or a swatch dropdown.
- **Sliders:** `Slider`: a native range with `accent-color: var(--ink)` and a `.slider-value` readout
  (`src/ui/services/sliders.ts`). Click the value to type one; double-click the track to reset it to its declared
  default.
- **Dialogs:** `TD.confirm` / `TD.prompt` / `TD.alert` (`src/ui/services/dialog.ts`), never `alert` /
  `confirm` / `prompt`. The title asks the question; buttons name the action; destructive ones pass
  `danger: true`. Ask only before what can't be undone: anything undoable happens at once and the hint names the key
  that brings it back (`undoHint()`), with no "…" on its menu row.
- **Tooltips:** a `title` becomes the app's tooltip (the kit's `Tooltip`, shown by `src/ui/services/tooltip.ts`); never
  build a tooltip element. Write "Name (key): what it does" for a tool that needs a description. Write shortcuts the
  Windows way once ("Undo (Ctrl+Z)"); on a Mac they show as ⌘ / ⌥ / ⇧ glyphs, never "Ctrl".
- **Menus:** a new menu is `openContextMenu()` from the kit, with rows as data (a row's `svg` may be a whole `<svg>`; a grid
  of icon choices is a `{ tiles, columns }` entry, as the Table's borders). The Table's menus are the kit's (`openMenu` in
  `src/ui/services/table.ts`, `class: 'tb-ctx'`). The block editors' right-click
  menus are the kit's, through `src/editors/editor-menu.ts` (`openEditorMenu`, `menuRow`, and `inEditorMenu` as the
  first line of an editor's window keydown handler, so keys reach the menu); menu icons are kit names in
  `src/ui/kit/icons.ts`. The main app's menus are the kit's too: the canvas, Layers, guide, file and folder menus
  build rows with `item()` and open with `placeCtx()` as `#ctxMenu` (`ctxAct` does a row's act); Quick asks for one
  with `TD.app.cmd.openMenu`. A menu that opens on hover passes `focus: false` and keeps itself open from the element
  `openContextMenu` returns (the draw-mode and sort menus). Don't build a `.ctx` by hand.
- **Editor notes:** the code pane's message and the stage tip go through `showCodeNotes(codeMsg, lines)` and
  `stageTip(tip)` (`set(text)`, `flash(text, ms)` for "Saved to the page") from `src/ui/editor-notes.ts`; never write
  HTML into `.cz-msg` or `.cz-tip`.
- **Editor plumbing:** every block editor takes undo/redo from `TD.editorSession.history` and Cancel/Done/⌘S, the
  discard prompt, `TD.unsaved` and embedding in Quick from `TD.editorSession.lifecycle` (its differences are hooks:
  `settle`, `source`, `result`, `selOut`/`selIn`), and the stage's pointer helpers, wheel pan and zoom and fit from
  `editorStage` / `fitView` (`src/editors/editor-stage.ts`); never copy them into an editor
  (`src/core/editor-session.ts`). Label editing in place uses `TD.input.popup` (a wrapper round the kit's `openTextPopup`, which is also the canvas's
  text editor), which follows the user's
  LaTeX or MathLive setting. Grid editors share the delete gutters (`TD.gridDel`) and the insert/delete
  icons (`rowAbove` … `colDelete` in `src/ui/kit/icons.ts`).
- **Cursors:** standard CSS cursors (`*-resize`, `move`, `grab`). The hand (`pointer`) is for buttons and
  links only, never canvas handles.
- **Block editor palettes** are the kit Palette, drawn from data: `editorPalette(root, …)` and `pal.render(categories)`
  (src/editors/editor-palette.svelte.ts), with `fitMini` for the drawings. Never build a palette's HTML. Palette items are `<button>`s (no `role="listitem"`) and must work with Enter and
  Space, not only with the pointer.
- **Empty lists:** the kit's `EmptyState`: one quiet line naming the space and what to do next. No illustration
  (Linear).
- **Coming soon:** a feature not yet built is shown as `.soon` (`aria-disabled`, dashed, 45%), never hidden.

## 10. Menus, popovers, flyouts and dialogs: how they behave

- **Esc closes the top layer and gives focus back to whatever opened it.** Nothing under it hears the Esc.
- Menu rows use title-style capitals and show their shortcut. Rules separate groups. A submenu has a safe triangle
  (`src/ui/kit/menu-aim.ts`), so moving the pointer diagonally doesn't close it (Linear).
- Popovers open 6px from their control, stay 8px inside the window, and use 4, 8 or 12px padding with a corner 8px
  larger. A press outside closes them.
- Don't use a modal for a job a popover can do (Linear). Show one dialog at a time. A modal has an obvious way out and
  one short task (Apple).
- **Undo over confirm** (Linear and Apple agree). Alerts are rare and never default to OK; destructive ones start focus
  on Cancel. Feedback lives in the interface (the status hint, inline help), not in alerts.

## 11. Interaction habits the owner expects

- Things that open on a choice open on **hover** (tool flyouts, 120ms), with a grace period (280ms) to
  cross gaps; a click pins them open, and moving to another group switches at once.
- Item actions (rotate, mirror, insert, delete) go in a **right-click menu** on the item, shared across the
  main app, Quick and the block editors. Don't put them in a side pane.
- Rename **in place**, where the item is (a sidebar row or a group name). Double-clicking a label edits it in
  the user's chosen input mode (LaTeX or MathLive).
- Placing a block only selects it; it never opens its editor on its own. Double-click, Enter or the panel's
  **Edit …** button opens it.
- Editors open roomy, not one line high. ⌘S inside an editor saves and keeps it open, so Esc doesn't ask to
  discard. Code and drawing are live both ways, and code the editor can't draw is kept as written.
- Paste lands in the middle of the visible view. A zoom percentage is a field you can type in; 1:1 and Fit
  are separate buttons. ⌘= / ⌘− / ⌘0 always zoom the app (the editor, when one is open), never the browser page.
- Icons point the way they act: tree-direction icons follow the tree, and insert-before/after icons show
  where the new item goes.
- **Keyboard first** (Linear). Every common action has a key, and the key is taught where the action appears
  (tooltips, menu rows, ⌘K results). ⌘K opens the command search anywhere, even in a text field; inside a block editor
  ⌘K or ⌘F searches its palette.
- **Fast feedback.** An action shows its result within about 100ms, and long work never blocks input (Linear's
  optimistic updates; saving is continuous). Keep the click and key counts in `tests/bench.json` from growing; prefer
  a key path that keeps the hands where they are.
- A click never leaves a control highlighted: focus rings are for the keyboard (`:focus-visible`). Only a field
  being typed into keeps its ring. Never write a `:focus` rule that would also catch checkboxes, switches,
  sliders or selects; wrap such exclusions in `:where()` so the rule keeps its specificity.
- Everything clicked presses: it shrinks while held and springs back on release (kit.css). Every `<button>`
  presses on its own, hand-written ones too (the tool rail, the top bar, swatches, zoom), so no class is needed;
  so do list rows, `role=button` rows, `summary` heads, links, menu rows, selects and sliders, all to 95%; a switch
  to 90% and a checkbox to 85% (its label presses the box). Not `.soon`, a row holding its submenu, or a row while a
  button or field inside it is held. A panel head that folds its panel presses its fold button. Fields typed into
  don't press. Check a new area with the press audit: force `:active` through CDP on everything clickable and read
  `scale` (turn transitions off first, or it reads mid-way).
- Every interactive element has hover, `:focus-visible`, pressed, selected and disabled states, and loading, empty and
  error states where they apply.

## 12. Motion

- Motion explains a change; it never decorates (Linear, Apple). Animate `transform` and `opacity` only, and never
  animate list layout.
- Every open and close animates (about 220–240ms, `--ease`, eased out). Popovers and menus fade in over 140ms and out
  over 120ms at scale .97, from the corner they grow from. Dialogs: scrim 140ms, sheet from 97% in 160ms, closing in
  reverse. Tooltips fade in over 80ms. Exit is faster than entry. Nothing runs longer than 250ms.
- Things repeated all day (keyboard navigation, the command search) get little or no motion.
- `prefers-reduced-motion` stops opening, closing, folding and press animations. The switch knob's slide and the
  flags' fade still run, because they are the feedback itself.

## 13. Interface text

- Every caption the user reads goes through `t(id, English)` in code, `t(id, English, {}, $locale)` in
  Svelte, or `message(id, English)` in a model. Add its Thai to the right catalog in the same change
  (`src/i18n/th.ts`, `th/app.ts`, `th/views.ts`, `th/editors-a.ts`, `th/editors-b.ts`; an id lives in one).
  Values, names, code and anything exported are never translated. See `docs/interface-languages.md`.
- One sentence is one message with `{placeholders}`; plurals are two messages; `<kbd>` and bold go through
  `rich()`. Text computed at module load must be lazy. Controllers that build captions re-run them with
  `onLocale(…)`.
- Buttons, menu items and dialog titles use title-style capitalisation; checkbox labels and hints use
  sentence case. A `…` marks an action that opens something to fill in.
- UK spelling (colour, centre), but leave "math" where captions already use it (§2).
- Copy is short and starts with the verb. No exclamation marks, no "successfully", no apologies (Linear, Apple). Every
  label says what happens, and an action keeps its name through the flow ("Copy TikZ" gives "Copied"). Errors say what
  happened and what to do next, next to their cause. Names come from what people recognise, not from the code.
- Thai runs longer: check narrow controls (switch segments, palette names, menu rows) in Thai.
  `node tests/localization.mjs` must pass.

## 14. Accessibility floor (Apple; never traded away)

- Text contrast is at least 4.5:1, computed from token values (`--pencil` was changed from 3.0:1 to 4.7:1 for this
  reason). Type is at least 10px.
- Controls default to 28px and are never smaller than 20px; spacing between them counts too.
- Every icon-only control has a name (its required `title` becomes the `aria-label`). Every input has a label.
- The whole task can be done from the keyboard. Tab stays inside dialogs. Focus returns to where it was.
- Reduced motion and Increase Contrast both have an answer. Nothing is conveyed by colour alone.

## 15. Tried and rejected: don't propose these again

| Idea | Why it was rejected |
|---|---|
| Square or chamfered corners | Less friendly |
| A 2px or 4px gap in segmented tracks | 2px felt cramped and 4px looked worse |
| Solid black output buttons, soft-fill or blue-tint output buttons | The loudest thing on screen / not used |
| Grey-filled borderless buttons | Looked unlike the rest of the app |
| An edge bar marking a selected row | Doesn't sit well on a rounded row |
| Tinted editable fields | A tint means read-only |
| A rotate zone along a whole edge, or a radial zone round the corners | Too greedy |
| "/" to open search | Lost whenever a field had focus; ⌘K replaced it |
| An anchored expansion for the file-type switch | Built, then reverted at the owner's request |
| Native `<select>` menus, `<input type="color">`, browser dialogs or tooltips | Use the kit's versions |
| Cards, pills or boxes inside boxes (the phone page, the guide) | Flattened |
| Rotate / Mirror / Delete buttons in an editor's side pane | Item actions go in the right-click menu |
| A size of its own for each editor | One `EditorFrame` size for all |
| Opening an editor as soon as a block is placed | Placing only selects |

## 16. Designing something new

1. **Name its job** in one sentence, and rank its elements as content, control, orientation or decoration (Linear).
   Remove the decoration; dim the orientation.
2. **Look for it first:** `/kit.html`, `references/building.md`, `.interface-design/kit-map.md`, then the area's
   section of `system.md`. Extend a kit component rather than hand-write markup.
3. **Tokens only:** colours, `--fs-*`, `--ctl`, the radii, the shadows. Work out each corner from its inset.
4. **Lay it out** on the 4px grid, lined up with the columns already there. Measure that toolbars fit one line at
   1400px.
5. **Add every state**, then the keyboard path, then the pointer path, then motion within §12.
6. **Write captions** per §13, with the Thai.
7. **Stress-test it** (see `references/review.md`): light, dark, Increase Contrast; 1400×900 and the narrower pane;
   Thai; a 120-character name, a 5-digit count, nothing at all, thousands of items; every mode and switch flipped
   (§3).

## 17. Before saying a UI change is done

1. Run the `texdiagram` config from `.claude/launch.json` (`npm run dev`, port 5173), which rebuilds the
   bundle as you save; reload with `fetch(url, { cache: 'reload' })` first if a file looks stale. The
   `texdiagram-dist` config (port 5174) serves a production build from `dist/`. The owner tests in Brave on
   a Mac, over localhost.
2. Check light and dark (`resize_window` colorScheme), a 1400×900 window, the narrower browser pane, and
   Thai.
3. Flip every mode and switch you touched, and check §3.
4. Test on a scratch document made with **New**, and delete it afterwards from the sidebar's right-click
   menu. Never delete or edit the owner's documents.
5. Run `npm run check`, and the relevant tests: `npm run test:menus`, `test:modals`, `test:ux` (the click
   and key counts in `tests/bench.json` must not grow), and `node tests/run.mjs <filter>`.
6. When a decision changes the system, update `.interface-design/system.md`. When users see the change,
   update the user guide (`public/guide/index.html`, and `th.html` for Thai). Touch the README only for
   a new block, mode or headline feature.
7. Commit or release only when asked. A release bumps `TD.VERSION` in `src/domain/shapes.ts` and `CACHE` in
   `public/sw.js`, commits as "Title (vX.Y.Z)", tags `vX.Y.Z` and pushes both. Deploy (`npx wrangler deploy`) only
   when asked.

## 18. Reviewing

Follow `references/review.md`: check accessibility, then stability, then house rules, then desktop conventions, then
calm and craft, then interaction, then copy. Cite a section of this skill, of `system.md` or a HIG page, or say it is
your judgment. Never report §2 or §15 as problems.
