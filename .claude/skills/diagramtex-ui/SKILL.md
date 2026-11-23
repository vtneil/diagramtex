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
  `public/index.html` by `scripts/prerender.js`. Prerendering runs outside a browser, so whatever
  AppShell imports (kit components included) must load without `window` or `document` (`runtime.ts` and the
  tooltip service check for them). `src/main.ts` boots everything. Services are registered on the
  shared `runtime` object (`src/runtime.ts`, also `window.TD`) in `src/register-services.ts` and
  `src/register-blocks.ts`. Styles load in this order: `public/css/tokens.css` (every token, light, dark and
  Increase Contrast), `kit.css` (the kit's controls), `style.css` (areas), then one file for each large area
  (`table.css`, `kmap.css`, `bytefield.css`, `language-menu.css`).
- **The interface kit** (`src/ui/kit`, imported from `'../kit'`) holds the app's controls as Svelte components:
  `Icon` (a named icon from `icons.ts`; `iconSvg(name)` gives the same markup to string-building code),
  `Button` (`variant` default / `primary` / `flat`, `size` `sm`, `danger`, optional leading `icon`), `IconButton`
  (icon only, `title` required, `flat` by default), `Segmented` (a switch: `options`, `many` for toggles, `panel`
  for the properties track), `Checkbox` and `Switch`, `Select` (every pick-one list: option drawings, notes, swatches and groups; `columns` for tiles; `pictures` for picture tiles; `custom` for a typed value; `attached` for a chevron joined to a field), `TextField`, `TexField`
  (`tx` math/text, `none`), `NumberField`, `ColourButton` (swatch and name), `Slider` (with its readout; `defaultValue` for the double-click reset), `Menu` and
  `openContextMenu(items, x, y, pick, { below, owner })` (a right-click menu from data; `below` opens it under a control, `owner` lets that control toggle it), `TextPopup` and `openTextPopup(host, opts)`
  (the in-place label editor, LaTeX or MathLive), `Tooltip` (what every `title` becomes), `Popover` (a panel opened from a control, `below` or `beside`; `openPopover(anchor, { content })` from string-building code)
  and `Flyout` (a tool group that opens on hover; `panel` shows an element the app builds, as the rail's groups do), `PanelSection` / `FormRow` / `Help` (panel sections, labelled
  rows, help, hint and error lines), `Badge`, `EmptyState`, `SearchField`, `Tile` / `TileGrid` (the flyouts' tiles; app-level `ui/ToolPanel.svelte` draws a flyout's sections from data, `ui/ExportPanel.svelte` both Export panels), `SplitButton`,
  `ListRow` (renamed in place), `Toolbar` / `ToolbarGroup`, `Palette` and `CodePane` (a block editor's columns), `EditorFrame` (a block editor's whole window),
  `Dialog` (what `TD.confirm` and friends draw), a `soon` option on buttons and tiles, `Kbd`
  (`keyLabel()` turns `Ctrl+Z` into ⌘Z on a Mac), `Separator` and `Spacer`. Fields keep `liveValue` inside.
  Their CSS is global and class-based in `kit.css`, so code that still builds HTML strings matches them;
  `buttonClass()` gives the button classes; `emptyStateHtml()` / `badgeHtml()` / `splitButtonHtml()` (`kit/markup.ts`)
  an empty message, a count and a split button; `fitToolbar(el)` (`kit/toolbar.ts`) gives a string-built bar the
  Toolbar's narrowing (icons dropped, sideways scroll, edge fades, wheel). Lists are Svelte on `ListRow`
  (`src/ui/FileList.svelte`, `LayerList.svelte`, `QuickList.svelte`), mounted with `renderView` into the list
  element; the area's code keeps its drag, menu and click handlers, which find rows by their data attributes. Behaviour stays in the shared services (`segthumb.ts`,
  `selectmenu.ts`, `sliders.ts`, `tooltip.ts`), which act on every matching element, kit-drawn or not. Never
  hand-write markup the kit has a component for, and never pass icons into a component as SVG strings: add the
  drawing to `icons.ts` once. `npm run dev` serves every component and variant at `/kit.html` (light, dark,
  English, Thai); a new component or variant goes there too. `npm run check` runs `tests/legacy-ui.mjs`, which
  fails when hand-written control markup grows in any file and asks for the baseline to be lowered (`--update`)
  when it shrinks.
- **Moving to the kit, smallest pieces first.** Primitives (done; `Control.svelte`, `FormRows.svelte` and the
  hand-written panels are built from them), then composites (Menu and MenuItem for the eight editors'
  `mItem` copies, Popover/Flyout, Toolbar, Palette, CodePane), then one `EditorFrame` layout for the block
  editors (all built; now replacing the copies from `.interface-design/kit-map.md`), then the app's areas (tool rail, status line, file list, top bar, `app.ts` menus). Each step replaces
  every copy of what it covers and deletes the CSS it takes over. The drawing itself stays imperative: the
  canvas, editor stages (`patchSvg`) and the Document page.
- **The rest of the app is still imperative.** `src/application/app.ts` (canvas, panel and menus),
  `docview.ts` (Document view) and the block editors (`src/editors/*.ts`) build DOM and wire events
  themselves. Svelte owns the shell, the properties panels, the editor frames, Quick's views, the Table's
  (`ui/TableWorkspace.svelte`, `ui/TablePanel.svelte`: models drawn in place; the grid stays imperative) and the
  Document's controls (`ui/DocumentView.svelte`, `ui/DocBlockChrome.svelte`; the page stays markup). Add to whichever side
  already owns the area, using kit components and classes; port an area to Svelte only as a planned kit step,
  not as a side effect.
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
    is one `<EditorFrame …>` (`src/ui/kit/EditorFrame.svelte`) mounted once with `mountFrame`
    (`src/ui/mount-frame.ts`): its name, `data-<act>` prefix, title, icon, captions (`t(…, $locale)`) and a
    `tools` snippet of `IconButton`s and `Separator`s. The controller fills it, finding its parts by class.
- **Every block editor has the same layout,** EditorFrame's: `.modal-box.cz-box` with a `.modal-head` (icon,
  title, `.cz-tools` flat icon buttons, a spacer, then Cancel and **Done** (primary)), and a `.cz-body` with
  `.cz-pal` (search field and list), `.cz-stage` (the SVG and `.cz-tip`) and `.cz-side` (`.cz-props` over
  `.cz-code`: a head with the package name, a count and Copy, the textarea, and `.cz-msg`). Every editor is
  the same size, one rule in kit.css. Don't invent a new arrangement or a per-editor size.

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
  or a newer version. User content and the logo are the only other colour, besides the top bar's save status dot
  (red / yellow / blue pens and `--okpen` green for a file saved to disk; nowhere else).
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
- Icons are monotone line icons (graphite, about 1.2–1.5px). Show emphasis with filled vs outlined, never
  with colour. The one serif glyph in the UI is the italic maths *x*, because it stands for content.
- User content stays on a light surface in both appearances (`--canvas`, `.doc-page`). Check light and dark.

## 5. Shape and spacing

- 4px grid. Controls are `--ctl` 28px; `--ctl-sm` 24px only for dense secondary ones. UI text is Atkinson
  Hyperlegible Next (Medium as normal, 13px; labels 12px; section titles 11px/600 in pencil) plus Atkinson
  Hyperlegible Mono with tabular numbers for values and code, with Thai in Sarabun, all served from `public/fonts/`. Nothing below 10px. **No serif in the UI**: `--font-tex` is for content only.
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

- **Buttons and icons:** `Button`, `IconButton` and `Icon` from `src/ui/kit` (see section 0). Shortcuts in a
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
- **Switches:** `Segmented` in Svelte (`.seg`, or `.seg-ctl` with `panel`), plus `src/ui/services/segthumb.ts` for the sliding knob (220ms, `--ease`, still under
  reduced motion). On/off flags that belong together share one `.seg.ze-flags` track (`many`) with no knob; the
  toggled one fades instead (200ms, from the same service). `Segmented` starts the service itself. A single
  on/off setting is `Switch` (a checkbox with `role="switch"`). Alignment is `Segmented` with `class="seg-align"` and the registry's align icons (`ALIGN_ICON` in `src/ui/kit/icons.ts`).
- **Colours:** always `ColourButton` (the `.cbtn` swatch + `.cval` name) + `TD.openColorPicker` (src/ui/ColorPicker.svelte in the kit
  Popover; a grid of colour chips is the kit's `Swatches`); in LaTeX blocks,
  `TD.texColor` / `texColour()` so presets are written as xcolor names. Toolbar colour buttons are a
  `SplitButton` with `toolbar`, `icon="textColour"` or `"fillColour"` and `swatch` (the colour, which tints the icon's `.sw` bar). Never `<input type="color">` or a swatch dropdown.
- **Sliders:** `Slider`: a native range with `accent-color: var(--ink)` and a `.slider-value` readout
  (`src/ui/services/sliders.ts`).
- **Dialogs:** `TD.confirm` / `TD.prompt` / `TD.alert` (`src/ui/services/dialog.ts`), never `alert` /
  `confirm` / `prompt`. The title asks the question; buttons name the action; destructive ones pass
  `danger: true`.
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
