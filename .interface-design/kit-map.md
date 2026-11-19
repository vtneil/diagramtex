# Interface kit map

The app's components, which of them the kit shares, and where each kit component will replace hand-written
code. The current phases build the kit (`src/ui/kit`, reviewed at `/kit.html` in `npm run dev`); replacing code
in the app comes afterwards, one entry of this map at a time. When an entry is replaced, tick it here and lower
the ratchet (`node tests/legacy-ui.mjs --update`).

Status: **built** (in the kit, not yet used everywhere) · **to build** (shared, not in the kit yet) · **stays**
(one place only, or drawing rather than chrome: not a kit component).

Counts after a file are copies of the hand-written markup in that file, from `tests/legacy-ui.json` where the
ratchet counts them. Paths are under `src/`.

## Primitives

| Kit component | Status | Replaces | Where (copies) |
|---|---|---|---|
| `Icon`, `iconSvg()` | built | inline `<svg viewBox="0 0 20 20">` icons, per-file icon tables (`MI`, `IC`, `icons`) | application/app.ts 10 (+ the `IC` table of the context menu), ui/services/quick.ts 5, editors/kmeditor.ts 4, ui/GridStyleButtons.svelte 4, editors/{bf,cd,cz,g3,qc} 2 each, ui/services/table.ts 2 (its icon table, drawn by the Table's Svelte views), editors/{cf,fsm,ft,fy,graph,phy,tm,uml,umlsd,zx} 1 each, ui/Variables.svelte 1, ui/align-switch.ts 1, ui/colour-split.ts 1 (the alignment and colour icon tables, drawn by the Svelte toolbars). The editors' `MI` menu-icon tables name kit icons now (Menu step done) |
| `Button` | built | `<button>` with the default, `primary` or `flat` look | application/app.ts 28 (done: the shell, ui/AppShell.svelte), ui/services/quick.ts 13, ui/CircuitPanel.svelte 2, ui/{SourcePanel,RawPanel,PhysicsPanel,ImagePanel,FormPanel,Variables,Dialog}.svelte 1 each, core/blocks.ts (`createElement('button')`) 1 |
| `IconButton` | built | `class="icon flat"` / `class="icon"` buttons; `svg` for a drawing of its own (the Table's B, I, U, merge) | application/app.ts 4, ui/Variables.svelte 1. Done: the Table's toolbar (ui/TableWorkspace.svelte) |
| `Segmented` | built | `.seg`, `.seg-ctl`, `.eng-seg`, `.fp-seg`, `.cp-tabs` tracks | application/app.ts 1 (engine); done: the shell's theme, file kind, Classic view, grid flags and import mode (ui/AppShell.svelte); the Export panels' format switch is the kit's (ui/ExportPanel.svelte), ui/services/quick.ts 2, the Table's switches (ui/TableWorkspace.svelte, ui/TablePanel.svelte), the Document's (ui/DocumentView.svelte, ui/DocBlockChrome.svelte), the colour picker's fill tabs (`.cp-tabs`) and its Gradient pane's Linear | Radial (`.fp-seg`, ui/GradientPane.svelte). Editor panels hand their switches over as `switchRow()` options (ui/forms.ts), drawn by `FormRows` as `Segmented` |
| `Checkbox`, `Switch` | built | `<input type="checkbox">`, `.chk` labels (which take the tooltip), `role="switch"` | ui/services/quick.ts 1 (Transparent in the formula bar); the Export panels' Flatten and Transparent are the kit's (ui/ExportPanel.svelte), the Table panel's (ui/TablePanel.svelte), ui/AppShell.svelte 1 |
| `Select` | replaced (panel pickers) | `<select>` + options, and every drawn dropdown: option drawings (shown in the closed control too), notes, swatches, groups, tiles (`columns`), a custom line (`custom`), a chevron joined to a field (`attached`). Replaced the `.ddsel` / `.ddbtn` buttons and their `.ddpop` picker | done: ui/StyleField.svelte's dash, shaft and arrow-tip pickers and width presets (options from `drawnPicker` in application/app.ts; the `.ddpop` code and CSS are gone). Plain `<select>`s still hand-written: application/app.ts 3, ui/services/quick.ts 2, ui/AppShell.svelte 1 (`#tikzScope`), ui/solid-icons.ts 1. (ui/services/selectmenu.ts is the menu service itself: stays) |
| `TextField`, `TexField` | built | `<input type="text">`, TeX fields with `data-tx` | ui/Variables.svelte 2, the block editors' palette search fields (the kit Palette's `SearchField`) |
| `NumberField` | built | `<input type="number">` | application/app.ts 1 (the colour picker's and its Gradient and Pattern panes' are the kit's) |
| `ColourButton` | built | `.cbtn` swatch + `.cval` name | application/app.ts (fill and stroke rows built as strings). The block editors' LaTeX colour fields are `texColour()` rows drawn by Control.svelte (`TD.texColor.field`, their string copy, is gone) |
| `Slider` | built | range input + `.slider-value`; `defaultValue` for the double-click reset (in place of `data-slider-default`) | done: the Document's image width (ui/DocBlockChrome.svelte) |
| `Kbd`, `keyLabel()` | built | `<kbd>` and `isMac ? '⌘D' : 'Ctrl+D'` | ui/AppShell.svelte 4 (empty-hint sentences, through `rich()`), ui/services/tour.svelte.ts 1 (the Save key, through markup), application/app.ts 1; the "/" search's rows are the kit's (ui/CommandSearch.svelte), each of the 16 editors 1 (their `isMac` key captions) |
| `Separator`, `Spacer` | built | `.cz-sep`, `.spacer` | ui/AppShell.svelte 4 spacers |

Already replaced: the 16 editor frames' head (IconButton, Button, Separator, Spacer, Copy); `Control.svelte` and
`FormRows.svelte` (every form panel); `StyleField`, `DocumentSettings`, `PageProperties` and `BlochPanel`;
`Inline` and `MainProperties` keys (Kbd).

## Composites

Order for this phase: Menu, then the dropdowns (merged into `Select`), TextPopup (built), Tooltip (built), Popover and
Flyout (built), then the rest (all built), then EditorFrame (built). Every kit piece is built; next is replacing the copies, one by one, from this map, in this order: (1) SearchField, EmptyState, Badge (done); (2) Popover for the Export panels, Flyout for the tool groups (done); (3) Menu for the editors' right-click menus, Select for the dash, width and tip pickers (done); (4) TextPopup for `TD.input.popup`, then the canvas text editor (done); (5) ListRow, Toolbar, SplitButton (done); (6) EditorFrame across the 16 editors (done).

| Kit component | Status | What it is | Where (copies) |
|---|---|---|---|
| `Menu`, `MenuItem`, `ContextMenu`, `openContextMenu()` | replaced (block editors, main app) | `.ctx` menu: rows of icon, label, key, tick (`menuitemradio`), danger; `hr` groups; `.ctx-head` section titles; submenus (`.has-sub` → `.ctx.sub`); keyboard; placed by `positionMenu` | Done: the Table's menus (import, borders, number format, the grid's right-click; `class: 'tb-ctx'`), with a grid of icon tiles as a `{ tiles, columns }` entry (the borders: arrow keys walk the tiles in reading order); the main app's menus, as data through `openContextMenu` (src/application/app.ts): the canvas, Layers, guide, file and folder menus and Quick's `openMenu()` (open as `#ctxMenu`; `ctxAct` does a row's act, `ctxFor` holds what it acts on), the draw-mode menu (`#modeMenu`) and the file sort menu (`#sortMenu`), both opening on hover without taking the keys (`focus: false`), and the zip menu. The kit menu takes an `id` while open (a fading one gives it up), `focus`, `align: 'end'` and `minWidth` under a control, returns its element (for hover), and runs the old menu's `onclose` when a new one replaces it. Done earlier: the 16 editors' `.qe-ctx` menus, opened with `openEditorMenu` (src/editors/editor-menu.ts); their `MI` tables now name kit icons; danger, tick and disabled are row flags |
| `TextPopup`, `openTextPopup()` | replaced (canvas, block editors) | the in-place editor that opens over an item on double-click: a LaTeX textarea (highlighted, with LaTeX autocomplete) or MathLive, following the Text input setting (`mode` overrides); `kind` line / para / code; `math` for maths without $; `roomy` for the canvas (76px line, resizable); `caret`, `start`; kept 8px inside its host; fades in and out. `openTextPopup(host, { at, width, onInput, onDone, … })` returns `place()`, `close()` | done: ui/services/mathinput.ts `TD.input.popup` is a wrapper round it (the 15 editors' labels, Document maths, Table cells in MathLive); application/app.ts's canvas text editor (`startEdit`; `#inlineEditor` / `#mlEditor` are gone). Left: ui/services/table.ts's LaTeX cell editor (`.tb-edit`, sized to the cell, not a floating card) and Document's own editors |
| `Tooltip`, `parseTip()`, `tipLayer()`, `macKeys()` | built | the app's tooltip in place of the browser's: a `title` becomes it; a shortcut at the end (`(Ctrl+Z)`) becomes a `<kbd>` shown as glyphs on a Mac; "Name (key): description" gets a muted second line; icon-only controls get their `aria-label` from it. The service (ui/services/tooltip.ts) keeps the hover, focus and title wiring and draws through the kit's one floating Tooltip | nothing to replace: every `title` in the app already uses it. Code that hides it calls `TD.tooltip.hide()` (application/app.ts 3) |
| `Popover`, `placePopover()`, `openPopover()` | replaced | a floating panel opened from a control: `below` it (above when there is no room; lined up with its right edge in the right 40% of the window, else its left) or `beside` it; padding `inset` 4 / 8 / 12px with the corner 8px more; Esc or a press outside closes it (`onclose`), Esc gives focus back and goes no further; drawn at the top of the page; fades in and out. `openPopover(anchor, { content(body) })` opens one from code that builds its panel as a string | done: the Export panel (application/app.ts `openExport`) and Quick's (ui/services/quick.ts), each 12px inset, 264 and 240px wide. The dash/width `.ddpop` went with the `Select` step |
| `Flyout` | replaced | a tool group: a button (corner mark, pressed fill while open) whose choices open beside it on hover (120ms) with a 280ms grace, switching at once between groups, pinned by a click, closed by a pick (`close` is handed to the children), a click elsewhere, Esc or a second click; Enter opens it with focus inside. `panel` shows an element built outside Svelte (kept in a hidden home while closed); `closeFlyouts`, `flyoutOpen`, `holdFlyout`, `releaseFlyout`, `onFlyoutClose` reach the group from plain code | done: the rail's ten groups (ui/AppShell.svelte; panels `#fly-*` and `#insertPop` in `.fly-panels`, built by application/app.ts); app.ts's own hover, pin and outside-press code is gone, and the draw-mode menu holds the shapes flyout open through `holdFlyout` / `releaseFlyout` |
| `SplitButton`, `splitButtonHtml()` | replaced | a main action joined to an arrow that opens choices; the arrow is handed to what it opens (`onmore`); `toolbar` is the Table/Document look (`.tb-split`), where `on` fills both halves; `id`, `mainId`, `moreId`, `hidden` for code that drives it by id; `mainAttrs`, `moreAttrs`, `mainClass` for one that handles its clicks by hook; `splitButtonHtml()` is the same markup as a string | done: ui/AppShell.svelte (`#tikzZipWrap`, its menu now the kit's `openContextMenu` with `below` and `owner`), the Table's colours, borders and number format (ui/TableWorkspace.svelte), the Document text bar's colours (ui/DocumentView.svelte) |
| `PanelSection`, `FormRow`, `Help` (`kind` help / hint / error), `TextArea` | replaced (the properties panels) | a properties section (`.sec` + `.sec-title` with a count, a `summary` at the far end of the title or `summaryInline`, a `lead` mark and an action; attributes such as `id` pass through), a labelled row (84px label column + `.ctl`; `column`, `unit`, `ctlClass`; `bare` for a control that is the cell itself; no label for a full-width row), help, hint and error lines (attributes pass through), and a field of several lines (`code`: a block's source box). They draw the panels' own markup, so the panel CSS (`#props`, `.cz-props`) still styles them | done: every properties view (ui/FormPanel, FormRows, SourcePanel, RawPanel, ImagePanel, PhysicsPanel, PointPanel, CircuitPanel, GeometryProperties, MainProperties, Variables, PageProperties, DocumentSettings, BlochPanel, editors/CircuitProperties). Left: ui/services/table.ts (right panel), application/app.ts and domain/physics.ts (hint lines) |
| `SearchField` | replaced | a search input whose placeholder is also its name (`type="search"`, liveValue) | done: the block editors' palettes (the kit Palette's). Not a copy: the "/" search (`#cmdkIn`, ui/CommandSearch.svelte) is a combobox inside a dialog, with its own icon and list (a TextField) |
| `Palette`, `filterPalette()` | replaced | the block editors' left column: search (every word of the query in the shown name, the English one, keywords or the category's title; Esc clears, then leaves; Enter picks the first match), categories (foldable with a count, `open`/`ontoggle` kept by the editor; all open while searching; `browse` ones only while not searching; a faint `note`), items as `rows` (`.cz-part`), a `grid` of tiles (`.qe-item`) or `icons` (`.sym-grid`, a category's own `layout`), the armed one and any `on` in marker yellow, `attrs`/`class` hooks, an EmptyState for no match (`emptyText`), a `notice` in place of the list; `onitemdown` starts a drag | done: all 16 block editors draw theirs from data with `editorPalette()` (src/editors/editor-palette.svelte.ts: mounts the Palette into the frame's empty `.cz-pal`, `itemclick: false` so the editor keeps its own clicks and drags, found by `data-item` or the hooks in `attrs`; Esc and Enter heard on the window before the editor's own keys) and `fitMini()` (one scale for a palette's drawings, in the markup); the per-editor `sizeMinis` palette copies, search listeners and empty messages are gone |
| `Swatches` | replaced | a grid of colour chips to pick from, `columns` across, outlined in blue pen dashes while being edited | done: the colour picker's presets (ui/ColorPicker.svelte), the Gradient pane's presets (`.fp-presets`, 6 across) and both panes' preset colours (`.fp-sw`) |
| `CodePane` | built | the editors' code column: package name, a count, Copy, a note, the code (mono, no wrap, liveValue), the message line | the 16 editor frames (`.cz-code`), filled by the 16 controllers |
| `EmptyState` | replaced | a quiet centred message where a list or view has nothing yet, with an optional title; announced (`role=status`). `emptyStateHtml()` (kit/markup.ts) gives the same markup to code that builds lists as strings | done: the 16 editors' `.cz-empty`, the "/" search's `.cmdk-empty`, the Layers list's `.ly-empty`. Kept: `#emptyHint` (the canvas's first-run card, a raised card with keys, not a list message); the Bin's and Saved copies' `.bin-none` (a list item styled with its list); `.qe-empty` (SVG text inside a grid editor's drawing) |
| `Badge` (count) and `soon` | Badge replaced; soon built | a small count beside a title (`Badge`, `faint` for palette categories; `badgeHtml()` for string-built lists); `soon` on Button, IconButton and Tile marks a feature not built yet (dashed, 45%, `aria-disabled`, out of the Tab order, clicks swallowed) | Badge done: the 16 frames' `.cz-count`, the palette category counts and notes (the kit Palette's). soon: application/app.ts (the global `.soon` click guard), ui/AppShell.svelte (the Blocks flyout's coming-soon tiles, `#kindSeg` soon segments) |
| `Tile`, `TileGrid` | replaced (flyouts) | a picture choice: drawing above, name below (a long name wraps to a second line, then is cut; `children` for a name with markup); `on`, `soon`; a grid four across, 4px apart | done: the flyouts' tiles (the 2D plots, 3D plots and 3D figures in ui/AppShell.svelte; physics, the Circuit entry and Blocks through ui/ToolPanel.svelte, from `TD.blocks.menuEntries()`). Still copies: picture tiles in `.selmenu.pics` (ui/services/selectmenu.ts, drawn by the service), ui/services/palette.ts, the diagram gallery cards, ui/PageProperties.svelte (`.pg-item`) |
| `Toolbar`, `ToolbarGroup`, `fitToolbar()` | replaced | a one-line bar of groups (a rule between them) that drops the icons of labelled controls, then scrolls with no bar and fades at the edge with more, as it narrows; measures its own width; a mouse wheel scrolls it. `fitToolbar(el, { lean })` (toolbar.ts) is that behaviour for a bar built as a string | done: the Table (ui/TableWorkspace.svelte, `.tb-bar.toolbar`), the Document text bar (ui/DocumentView.svelte, `.doc-fmt .tb-bar.toolbar`), the top bar (`#topbarTools`, `lean: false`: it sheds labels by its own rules). Left as they are: Document's table and image bars (`.fmt-bar`: a small bar with its own background, which a fade would fade too) and the Table's output bar (`.tb-outbar`, whose spacers shrink) |
| `ListRow` | replaced | a row in a list: icon (or `lead`: Layers' eye, fold and picture), name (renamed in place: double-click or F2, or `renaming` set by the list; Enter or leaving saves, Esc cancels; `renameValue` / `renamePlaceholder` when the field starts other than the name), trailing content, actions shown on hover or focus, selected by a fill, indented by `depth`; `focusable` false for rows the list's own keys reach; `renameOnDblclick` false where the list tells two clicks from a double-click | done: the file list (ui/FileList.svelte: files and folders, drag-and-drop and the menu still in application/app.ts), Layers (ui/LayerList.svelte, Layers' look kept by `.ly-row`), Quick's drafts (ui/QuickList.svelte, whose other rows are buttons). The Recycle Bin and Recovery Copies rows are Svelte too (ui/RestoreRows.svelte) but not ListRows: they are not picked, so they are plain list items with a name over a detail line, Restore and one more action |
| `Dialog` | built | `TD.confirm` / `TD.prompt` / `TD.alert`: now in the kit with its buttons from `Button`, its CSS in kit.css; ui/services/dialog.ts keeps the promise, keys and focus | done: every dialog in the app already uses it |
| `EditorFrame` | replaced | the block editors' modal: head (icon, title, `tools`, Cancel, Done), palette, stage, properties, code; with no `palette`/`stage`/`side` it draws the controllers' empty markup (found by class and `data-<act>`), otherwise the given Palette, stage or CodePane; every editor's size (up to 1600×900) is now one rule in kit.css | done: the 16 `src/ui/editors/*editorFrame.svelte` are each an `<EditorFrame …>` with its tools (IconButtons and Separators), the palette left empty for the editor's kit Palette; their DOM was compared with the originals (attributes sorted, the inline size dropped) and all 16 match. The per-editor sizes in style.css, bytefield.css, kmap.css and the 4 inline ones are gone: one rule in kit.css |

## Stays as it is

- Drawing, not chrome: the canvas, the editors' stages (`patchSvg`), the Document page, rulers, handles.
- One place only, each a Svelte view of its own (not kit pieces): the colour picker (ui/ColorPicker.svelte, in the kit
  Popover; its presets are the kit's `Swatches`), the LaTeX autocomplete (ui/TexComplete.svelte), the "/" search
  (ui/CommandSearch.svelte), the welcome tour (ui/Tour.svelte), the select menu (ui/SelectMenu.svelte); the phone
  page, the language picker, the K-map group list (`.km-groups`), the Table grid.
- Behaviour services that the kit components rely on: `segthumb.ts`, `selectmenu.svelte.ts` (opens SelectMenu and
  keeps the keys on the select), `sliders.ts`, `menu-position.ts`.

## Plan: what is not Svelte yet (surveyed 2026-11-19)

Svelte already: the shell (`AppShell.svelte`: top bar, rail, sidebar and panel frames, modal skeletons), the
properties panel (style fields, form and source panels, Variables), the 16 block editors' frames and side panels,
and the kit's floating pieces (menus, popovers, flyout shells, Select, TextPopup, the `TD.confirm` dialogs).

Still built imperatively (strings and DOM calls):

- **Main app** (`application/app.ts`): the LaTeX dialog's code view (`#tikzOut`, a line-by-line drawing of the code,
  painted in place like the canvas: it stays so) and the two dialogs' behaviour (wired by id). Their heads are kit
  controls in ui/AppShell.svelte; the lint lines (ui/LintList.svelte), the Import report (ui/ImportReport.svelte) and
  the diagram gallery (ui/DiagramGallery.svelte) are Svelte; the three fade in and out (kit/modal.ts).
- **Document view** (`application/docview.ts`, `doc-inline.ts`): only the page (drawn as markup: the blocks' text,
  tables, pictures and diagrams, for print and the HTML export too) and the inline rich-text editor. The controls are
  Svelte: ui/DocumentView.svelte (the text bar and the zoom bar, round the page, drawn in place) and
  ui/DocBlockChrome.svelte (mounted into the page's empty `.ins`, `.blk-tools` and `.fmt-bar` each time it is drawn:
  the insert bars, a block's tools, the table and image bars).
- **Table workspace** (`ui/services/table.ts`): only what is live: the grid (drawn for speed, like the canvas), the
  cell editor in place, the preview and the LaTeX view. The views are Svelte: ui/TableWorkspace.svelte (session bar,
  toolbar, cell-text bar, output bar, start screen) and ui/TablePanel.svelte (the right panel), both re-drawn in place
  from a model; the menus are the kit's. The controller still handles their clicks by hook (data-t, data-o, data-p…).
- **Quick mode** (`ui/services/quick.ts`): only what is live: the formula field (a textarea, or MathLive), the maths preview, the
  message line and the docked editor. The views are Svelte: ui/QuickFormula.svelte, ui/QuickBlock.svelte (its bar moves into
  the docked editor's head), ui/QuickList.svelte and ui/ExportPanel.svelte; a button's Copied is part of the model.
- **Block editors** (done): frames, palettes and side panels are Svelte (the palettes are the kit Palette, drawn from
  data by each controller through `editorPalette()`); the code pane's message and the stage tip are ui/EditorNote.svelte,
  drawn by `showCodeNotes(el, lines)` and `stageTip(el)` (`set`, `flash`) from src/ui/editor-notes.ts.
- **Floating services** (done): the "/" search, the colour picker, the welcome tour, the LaTeX autocomplete and the
  select menu are Svelte views drawn from models (ui/CommandSearch.svelte, ColorPicker.svelte, Tour.svelte,
  TexComplete.svelte, SelectMenu.svelte); their services keep the finding, ranking, placing and keys. The picker's Gradient and Pattern panes are
  ui/GradientPane.svelte and ui/PatternPane.svelte, on helpers from domain/fills.ts (`TD.fillPanes`).

Stays imperative on purpose: the canvas, rulers and editor drawings (SVG built for speed and patched in place:
drawings, not controls) and the behaviour services (`segthumb`, `sliders`, `tooltip`, `texhighlight`, the
magnifier), which add behaviour to elements and draw nothing of their own.

Order, agreed with the owner:
1. Commit step 5 (SplitButton, Toolbar, rename in place).
2. `test:modals` checks 600×500 and up (smaller windows get the phone page).
3. (done) The list rows in Svelte on `ListRow`: the file list (files, folders, drag-and-drop), Layers, the Recycle Bin and
   Recovery copies dialogs, Quick's drafts.
4. Step 6: `EditorFrame` across the 16 block editors (done).
5. Then, one area at a time: the main app's menus onto the kit Menu (`#ctxMenu`, draw mode, sort: done), the flyout and
   Export contents (done: ui/ToolPanel.svelte and ui/ExportPanel.svelte, the app's and Quick's Export on the one panel), the LaTeX output / Import / gallery dialogs (done), Quick (done), the Table workspace (done), the Document view (done), the
   block editors' palettes (done), and the floating services (done).

## Plan: kit components everywhere (agreed 2026-11-19)

What is Svelte but still hand-written markup, or still strings, moves onto the kit's components; the imperative
drawings (canvas, rulers, editor stages, the Document page, the Table grid, Quick's live field, the LaTeX code view)
stay. One area at a time:
1. (done) The shell (`AppShell.svelte`): every button is the kit's `Button` / `IconButton` (the top bar, the diagram
   navigation, the tool rail's single tools, the sidebar head and the Recycle Bin row, the page and zoom bar, the panel
   folds, the Layers actions); the theme, file-kind, Classic-view and grid switches are `Segmented` (the file kinds'
   labels in a `labelClass` span, opened on hover; the grid styles sit before Guides and Snap in the flags track as
   its `children`); every drawing is a named kit icon (`Icon`), the grid styles' too. The file kinds and views are
   radios: the app's mirror of `.on` sets `aria-checked` on a radio and `aria-pressed` elsewhere. Stays markup: the
   phone page, the language picker, the footer links (links, not buttons), the brand.
2. (done) The properties panels: every view's sections, rows, help lines, source boxes, buttons and fields are the
   kit's (`PanelSection`, `FormRow`, `Help`, the new `TextArea`, `Button`, `IconButton`, `TextField`); StyleField's
   alignment, vertical alignment, route and direction switches take named kit icons from the model.
2b. (done) The list rows' own buttons are the kit's: the file list's delete, Layers' eye, fold and lock (named icons
   from the model: show / hide, disclosure, lock / unlock), the bin's and Recovery's Restore and second action,
   Quick's delete (the kit's close drawing) and New (the kit's add), the diagram gallery's cards, the tool flyouts'
   symbol buttons, the grid styles (segments of a flags track: `Button` around an `Icon`). No hand-written
   `<button>` is left in a Svelte view outside the phone page and the language picker.
3. (done) The block editors' side-panel switches: a form row of kind `switch` (`switchRow()` in ui/forms.ts; the
   editors' `segments()` makes one) carries the kit Segmented's options directly (text or a drawing or a swatch,
   title, name, on, disabled, the data hooks), `many` for toggles; FormRows draws it as `Segmented panel`. No row of
   buttons marked `class: 'on'` and recognised by a `seg-ctl` class string is left.
4. (done) The Recycle Bin and Recovery Copies dialogs are Svelte views (ui/BinDialog.svelte, ui/RecoveryDialog.svelte:
   kit Buttons, Selects, Spacer, RestoreRows) drawn into the `.td-dialog` that application/app.ts opens and redraws in
   place; app.ts keeps their behaviour (buttons by class, the two settings by name, Esc, Tab kept inside). They fade
   out like the kit's confirm dialog (`fadeOutDialog`, kit/modal.ts, shared with ui/services/dialog.ts) and can open
   again while the last one fades. Not the kit `Dialog`, which is the alert / confirm / prompt box.
5. (done) The sidebar's Text input and LaTeX engine settings are one Svelte view, ui/SidebarSetting.svelte (a head, the
   kit `Segmented` and a note), drawn into `#inputBox` and `#engineBox` by ui/services/sidebar-settings.ts from
   `TD.input` and `TD.math` (modes, the choice, Temml still loading as `busy`, an engine not loaded as disabled) and
   redrawn on a change, on readiness and on a language switch. mathinput.ts and mathengine.ts keep only the
   behaviour (the click delegation, storage, loading).
6. (done) The colour picker's Gradient and Pattern panes are Svelte views (ui/GradientPane.svelte, ui/PatternPane.svelte:
   kit Swatches, Segmented, Button tiles, fields, a Remove Stop IconButton) drawn from the picker's model (`grad`,
   `pat`) and giving new values through `act.fill`; domain/fills.ts keeps the maths (`TD.fillPanes`: normalising,
   CSS and SVG previews, hex parsing). Their captions and the pattern and gradient names (domain/fill-names.ts, also
   `TD.fillLabel`) are translated. `TD.texColor.field` had no callers left and is gone.
7. (done) The string helpers are gone. The align switches take the registry's align icons (`ALIGN_ICON`, the drawings the
   properties panel already used, so the Table's and Document's lines moved 1px up and Justify's last line is full; the
   Table panel's vertical alignment takes `valignTop` … too). The grid drawings are generated in kit/icons.ts
   (`rowAbove` … `colDelete`; the Table's cell menu names them). The colour buttons are `SplitButton` with
   `icon="textColour" | "fillColour"` and `swatch` (a `--sw` the icon's `.sw` bar reads); the models give colours, not
   SVG. Left: the Table service's own icon table (`I` in ui/services/table.ts: import, print, merge, split, borders,
   the menu's rules and header icons) still passes SVG strings.
8. (done) The block editors' code-pane messages and stage tip: `showCodeNotes(codeMsg, warnings)` and one
   `stageTip(tip)` per editor (src/ui/editor-notes.ts, drawn as ui/EditorNote.svelte); the fifteen copies of `setTip`
   and their "clear it if it still says this" timers are `set` and `flash(text, ms)`. No editor writes HTML into them.
