---
name: diagramtex-ui
description: House rules for any change to DiagramTeX's interface (public/css, src/index.html, src/ui (Svelte), src/application/app.ts, src/application/docview.ts, src/ui/services/quick.ts, the block editors). Use before adding or changing a control, panel, menu, toolbar, mode, dialog, animation, zoom or layout, before adding a block or block editor, and when reviewing UI. It says how the interface is built, which shared pieces to reuse, and the quirks the owner has already corrected, so they are not repeated.
---

# DiagramTeX UI rules

The full design system is `.interface-design/system.md`, covering tokens, sizes and every component. Read the
sections for what you are touching. This file is the short list of what the owner checks every time: how the
interface is put together, what to reuse, and rules that have each earned a correction once already.

## 0. How the interface is built

- **Shell:** `src/index.html` is the template and `src/ui/AppShell.svelte` the shell, prerendered into
  `public/index.html` by `scripts/prerender.js`. `src/main.ts` boots everything. Services are registered on the
  shared `runtime` object (`src/runtime.ts`, also `window.TD`) in `src/register-services.ts` and
  `src/register-blocks.ts`. Styles are `public/css/style.css`, plus one file for each large area (`table.css`,
  `kmap.css`, `bytefield.css`, `language-menu.css`).
- **Most of the app is still imperative.** `src/application/app.ts` (canvas, panel and menus),
  `docview.ts` (Document view) and the block editors (`src/editors/*.ts`) build DOM and wire events
  themselves. Svelte owns the shell, the properties panels and the editor frames. Add to whichever side
  already owns the area; don't port an area to Svelte as a side effect.
- **A block** (an object with its own package, such as `kmap` or `chemfig`) is spread over these files:
  - `src/domain/<block>.ts`: parser and writer, layout, canvas drawing and export. It defines
    `TD.TYPES.<type>` (`create`, `svg`, `tikz`, `anchors`…) and calls
    `TD.blocks.register(type, { menu, fixed, geometry, nodeImport, editor })` (`src/core/blocks.ts`). The
    `menu` entry places it in the Blocks flyout (order, label, title, 32×24 line icon), and `nodeImport`
    lets pasted and imported code come back as the block.
  - `src/ui/models/<block>.ts`: `TD.panels.<type>.model(shape)` returns the panel's model. Panel text
    uses `message()` descriptors, not finished strings.
  - `src/ui/panels.svelte.ts`: maps the type to a panel view. Most blocks use `SourcePanel` (title,
    summary, code, warnings and actions); scientific objects use `FormPanel`; a block that needs more gets
    its own `*Panel.svelte`.
  - `src/editors/<x>editor.ts` with `src/ui/editors/<X>editorFrame.svelte`: the overlay editor. The frame
    is static markup mounted once with `mountFrame` (`src/ui/mount-frame.ts`). It takes icons and key
    names as `p0…pn` props and translates its captions with `t(…, $locale)`. The controller fills it.
- **Every block editor has the same layout,** copied from an existing frame: `.modal-box.cz-box` with a
  `.modal-head` (icon, title, `.cz-tools` flat icon buttons, a spacer, then Cancel and **Done** (primary)),
  and a `.cz-body` with `.cz-pal` (search field and list), `.cz-stage` (the SVG and `.cz-tip`) and
  `.cz-side` (`.cz-props` over `.cz-code`: a head with the package name, a count and Copy, the textarea,
  and `.cz-msg`). Don't invent a new arrangement.

## 1. Nothing moves unless the user moved it

The most frequent complaint. Before finishing, flip every switch, mode and state you touched and check that
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
  while a pane eases open or shut.

## 2. The floating right panel is not part of the view

`#rightCol` floats over the stage (`--props-w` 280px + 8px each side). Centring, Fit, Fit Width, empty
hints, pasting and the document page all use the area to its left (`fitArea()` in src/application/app.ts,
`padding-right` on `#docview`). Never centre across the whole window.

## 3. Nothing overlaps or interferes

Check stacking and hit areas wherever two floating things meet. Fixed so far:
- block tools vs the editing card's toolbar
- arrows over text
- a fold button over the browser's scroll bar (the whole header became the click target instead)
- rotate zones over resize handles (rotate zones are small tabs straight out from each edge's middle, kept
  9px clear of handles, never a circle round the corner)
- keys in an embedded (Quick) editor's output bar reaching the editor (`data-outside`)

Raise the z-index of the thing the user is reaching for, and keep it clear of rounded corners.

## 4. Colour means something

- The only interface colour is ink plus two pens: `--redpen` for selection and danger, `--bluepen` for focus
  and construction. Active states use ink. `--marker` (amber) only marks something waiting: unsaved changes
  or a newer version. User content and the logo are the only other colour.
- **Editable fields are white** (`--sheet-raised` with a `--rule-strong` border). A tinted (`--well`) box
  means read-only, so **a text field is never tinted**.
- **Every button is the app's one outlined button** (the default `button`): panel actions, top-bar output
  buttons, list actions. No grey-filled (`--wash-strong`, borderless) buttons; the owner had them all changed.
  Only `.primary` is solid, and only for the one main action (Done, Copy PNG). Solid black was rejected as
  too loud for anything else. Toolbar icons are `.icon.flat`.
- **Anything destructive turns red pen on hover**, everywhere: menus, block editors, the bin icon. The bin is
  one drawing everywhere (`M4 5.5h12M8 5.5V3.5h4v2M5.5 5.5l1 12h7l1-12`, 20-unit box).
- Maths inside LaTeX source fields is `--mathpen` green (`src/ui/services/texhighlight.ts`).
- Icons are monotone line icons (graphite, about 1.2–1.5px). Show emphasis with filled vs outlined, never
  with colour. The one serif glyph in the UI is the italic maths *x*, because it stands for content.
- User content stays on a light surface in both appearances (`--canvas`, `.doc-page`). Check light and dark.

## 5. Shape and spacing

- 4px grid. Controls are `--ctl` 28px; `--ctl-sm` 24px only for dense secondary ones. UI text is Inter
  Display (Medium as normal, 13px; labels 12px; section titles 11px/600 in pencil) plus mono with tabular
  numbers for values. Nothing below 10px. **No serif in the UI**: `--font-tex` is for content only.
- Radii (style.css `:root`): `--r-sm` 4px (swatches, kbd, segments), `--r` 8px (buttons, inputs, tracks,
  menu rows), `--r-lg` 12px (menus, popovers, cards: 8 + 4 inset), `--r-xl` 20px (modals: head buttons sit
  12px in, 8 + 12).
- **Corners nest concentrically**: inner radius = outer radius − inset. When you make a new container, work
  its radius out from what sits in it (the button radius plus its inset), written as a `calc()` on the
  tokens, rather than picking a token by eye. A button in a corner sits the same distance from the right
  edge and the bottom edge. Square and chamfered corners were both tried and rejected. What the CSS has now:

  | container | content inset | corner |
  |---|---|---|
  | segment in a `.seg` track | 3px | `calc(var(--r) - 3px)` = 5px inside the 8px track |
  | menu, select menu, autocomplete, dash/width (`.ctx`, `.selmenu`, `.ddpop`) | 4px | `--r-lg` 12px (8 + 4) |
  | properties / layers window, cards, popovers | 8px from the stage | `--r-lg` 12px |
  | tool flyout (`.popover.flyout`) | 8px | `calc(var(--r) + 8px)` = 16px |
  | Export popover (`.exp-pop`) | 12px | `calc(var(--r) + 12px)` = 20px |
  | block editor and other modals (`.modal-box`) | head buttons 12px from the right | `--r-xl` 20px |
  | dialog (`.tdd-box`) | `--tdd-inset` 14px | `calc(var(--r) + var(--tdd-inset))` = 22px |
  | tooltip, swatch, kbd | none | `--r-sm` 4px |

- Gaps between options equal the container's padding. Segmented tracks use 3px padding and a 3px gap: 2px
  felt cramped and 4px looked worse. Menus have 4px padding round `--ctl` 28px rows with `--r` corners;
  select and dash/width rows sit 4px apart, while context-menu rows touch and are grouped by `hr` rules.
- Measurements to match: top bar two 44px rows; groups 16px apart; tool rail 48px with 32px buttons; file
  list 200px with 28px rows inset 8px; properties panel 280px, sections 12×16px, an 84px label column,
  40px head; rulers 18px; status line 24px; on/off switch 28×16 with a 12px knob; picture-menu tiles 76px.
- Menus open below their control (above when there is no room). On the right side of the window (the
  properties panel, Export) they line up with the control's right edge and grow left; elsewhere left edges
  meet. Submenus sit 4px clear of their parent.
- Selected rows are marked by a fill, never an edge bar. Hover in every menu is the `--well` tone.
- Toolbars stay on one line at a 1400px window. Measure them (`scrollWidth`, the tops of the children); don't
  eyeball them. Narrower, they shed labels and icons in steps and then scroll; they never wrap mid-control.
- No pills, cards or boxes inside boxes: the phone page and the guide were flattened for this.

## 6. Use the app's own pieces

Before writing a control, look for it here. Build a new shared piece only when two places need it, and then
replace the copies.

- **Panel forms:** build `FormPanelModel` sections with the helpers in `src/ui/forms.ts` (`section`, `row`,
  `input`, `number`, `check`, `select`, `help`, `errors`) and, in editors, `src/ui/editor-fields.ts`
  (`field`, `numField` with a unit, `segments` for an icon or text switch, `codeRow`, `note`, `actionRow`,
  `texColour`). `Control.svelte` / `FormRows.svelte` render them, with the label column, ARIA names and
  translated captions already handled. TeX fields set `data-tx: 'math' | 'text'`, which gives the standard
  placeholders **Maths, without $** and **Text, $math$**.
- **Field values in Svelte:** use `{@attach liveValue(x)}` (`src/ui/live-value.ts`), never `value={x}`. A plain
  binding rewrites the field while the user types (e.g. `0.` becomes `0`). The exception is a dialog's prompt
  field, which gets its text once and is never written again. Every input needs a name: `aria-label` or a
  linked `<label>`.
- **Dropdowns:** a plain `<select>` gets the custom menu from `src/ui/services/selectmenu.ts`; add
  `data-pics="name"` with `TD.selectPics[name]` for a grid of picture tiles. Don't build another, and never
  let a native menu show.
- **Switches:** `.seg` plus `src/ui/services/segthumb.ts` for the sliding knob (220ms, `--ease`, still under
  reduced motion). On/off flags that belong together share one `.seg.ze-flags` track with no knob. A single
  on/off setting is a checkbox with `role="switch"`. Alignment is `src/ui/align-switch.ts`.
- **Colours:** always `.cbtn` swatch + `.cval` name + `TD.openColorPicker`; in LaTeX blocks,
  `TD.texColor` / `texColour()` so presets are written as xcolor names. Toolbar colour buttons are
  `colourSplit` (`src/ui/colour-split.ts`). Never `<input type="color">` or a swatch dropdown.
- **Sliders:** native range with `accent-color: var(--ink)` and a `.slider-value` readout
  (`src/ui/services/sliders.ts`).
- **Dialogs:** `TD.confirm` / `TD.prompt` / `TD.alert` (`src/ui/services/dialog.ts`), never `alert` /
  `confirm` / `prompt`. The title asks the question; buttons name the action; destructive ones pass
  `danger: true`.
- **Tooltips:** a `title` becomes the app's tooltip (`src/ui/services/tooltip.ts`). Write shortcuts the
  Windows way once ("Undo (Ctrl+Z)"); on a Mac they show as ⌘ / ⌥ / ⇧ glyphs, never "Ctrl".
- **Menus:** the main app and Quick use the shared `#ctxMenu` (`TD.app.cmd.openMenu`). Block editors build
  a `.ctx` menu of `.ctx-item` rows (icon, label, `<kbd>`, `danger` class), placed with `positionMenu`
  (`src/ui/menu-position.ts`). Copy an existing editor's `mItem` rather than inventing a new row.
- **Editor plumbing:** undo/redo via `TD.editorSession.history`; Cancel/Done/⌘S, the discard prompt and
  `TD.unsaved` via `TD.editorSession.lifecycle`; embedding in Quick via `TD.editorSession.dockable`
  (`src/core/editor-session.ts`). Label editing in place uses `TD.input.popup`, which follows the user's
  LaTeX or MathLive setting. Grid editors share the delete gutters (`TD.gridDel`) and the insert/delete
  icons (`src/ui/grid-icons.ts`).
- **Cursors:** standard CSS cursors (`*-resize`, `move`, `grab`). The hand (`pointer`) is for buttons and
  links only, never canvas handles.
- **Palette items** in block editors are `<button>`s (no `role="listitem"`) and must work with Enter and
  Space, not only with the pointer.
- **Coming soon:** a feature not yet built is shown as `.soon` (`aria-disabled`, dashed, 45%), never hidden.

## 7. Interface text

- Every caption the user reads goes through `t(id, English)` in code, `t(id, English, {}, $locale)` in
  Svelte, or `message(id, English)` in a model. Add its Thai to the right catalog in the same change
  (`src/i18n/th.ts`, `th/app.ts`, `th/views.ts`, `th/editors-a.ts`, `th/editors-b.ts`; an id lives in one).
  Values, names, code and anything exported are never translated. See `docs/interface-languages.md`.
- One sentence is one message with `{placeholders}`; plurals are two messages; `<kbd>` and bold go through
  `rich()`. Text computed at module load must be lazy. Controllers that build captions re-run them with
  `onLocale(…)`.
- Buttons, menu items and dialog titles use title-style capitalisation; checkbox labels and hints use
  sentence case. A `…` marks an action that opens something to fill in.
- Thai runs longer: check narrow controls (switch segments, palette names, menu rows) in Thai.
  `node tests/localization.mjs` must pass.

## 8. Interaction habits the owner expects

- Things that open on a choice open on **hover** (tool flyouts, 120ms), with a grace period (280ms) to
  cross gaps; a click pins them open.
- Item actions (rotate, mirror, insert, delete) go in a **right-click menu** on the item, shared across the
  main app, Quick and the block editors. Don't put them in a side pane.
- Rename **in place**, where the item is (a sidebar row or a group name). Double-clicking a label edits it in
  the user's chosen input mode (LaTeX or MathLive).
- Placing a block only selects it; it never opens its editor on its own. Double-click, Enter or the panel's
  **Edit …** button opens it.
- Editors open roomy, not one line high. ⌘S inside an editor saves and keeps it open, so Esc doesn't ask to
  discard. Code and drawing are live both ways, and code the editor can't draw is kept as written.
- Paste lands in the middle of the visible view. A zoom percentage is a field you can type in; 1:1 and Fit
  are separate buttons.
- Icons point the way they act: tree-direction icons follow the tree, and insert-before/after icons show
  where the new item goes.
- Every open and close animates (about 220–240ms, `--ease`, eased out) and respects reduced motion.

## 9. Before saying a UI change is done

1. Run the `texdiagram` config from `.claude/launch.json` (`npm run dev`, port 5173), which rebuilds the
   bundle as you save; reload with `fetch(url, { cache: 'reload' })` first if a file looks stale. The
   `texdiagram-dist` config (port 5174) serves a production build from `dist/`. The owner tests in Brave on
   a Mac, over localhost.
2. Check light and dark (`resize_window` colorScheme), a 1400×900 window, the narrower browser pane, and
   Thai.
3. Flip every mode and switch you touched, and check rule 1.
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
