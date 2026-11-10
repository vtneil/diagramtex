# DiagramTeX interface system: "drafting table"

## Intent
- **Who:** someone writing a paper, problem set or lecture notes who needs a figure in their LaTeX. They come from a `.tex` file and go back to one.
- **Task:** draw a precise figure and get clean TikZ out of it.
- **Feel:** a drafting table with engineering paper, ink and a red pencil. It should be quiet, exact and warm. It should not feel like a SaaS dashboard.

## Signature
**Centimetre rulers** run along the top and left edges of the canvas, in TikZ coordinates with y pointing up (`#rulerX`, `#rulerY`, drawn by `drawRulers()` in `js/app.js`).
- The tick step adapts to zoom: 0.25 → 500 cm, with labels at least 56px apart. Steps of 1 or 2 cm get quarter subdivisions; steps of 5 get fifths.
- The selection's extent is shaded on both rulers in a red-pencil wash.
- A red hairline marks the cursor position.

## Tokens (`css/style.css` `:root`)
| token | value | role |
|---|---|---|
| `--paper` | #f4f2ec | app base, canvas surround, document desk |
| `--sheet` | #fffdf8 | panels, drawing sheet |
| `--sheet-raised` | #ffffff | popovers, menus, modals, buttons |
| `--well` | #f3f0e8 | read-only or disabled fields, hover on buttons and menu rows. Editable fields are white (`--sheet-raised`) like buttons: a tinted box means the value can't be changed |
| `--ink` | #1c1b19 | text, primary buttons, active states |
| `--graphite` | #5d5b55 | secondary text, icons |
| `--pencil` | #6f6c64 | metadata, ruler labels (4.7:1 on paper; the old #8f8c84 was 3.0:1 and failed AA) |
| `--faint` | #bab7ae | disabled, minor ticks |
| `--rule` / `-soft` / `-strong` | ink at 12 / 7 / 24% | hairlines |
| `--wash` / `-strong` | ink at 4.5 / 8.5% | hover / active fills |
| `--grid-minor` / `--grid-major` | #e6ece2 / #cad8c5 | engineering paper |
| `--redpen` | #c8361d | selection, handles, marquee, destructive actions |
| `--bluepen` | #2459a6 | construction: control points, guides, snap, focus ring |
| `--canvas` | #fffdf8 (dark: #ebe9e2) | the drawing sheet and typeset page: user content stays on a light surface in both appearances |

**Logo:** "Node to Node", a coral round node and a blue square node joined by an indigo backslash edge (lavender `#F1EFFF` on dark). Kit, colours and rules live in `design/logo/` (`GUIDELINES.md`; early concepts in `concepts/`). In the app it appears in three places:
- **Top bar:** the mark (20px) followed by the outlined Inter Display Bold wordmark; below 1361px only the mark shows.
- **Loading screen:** an inline `#splash` in `index.html` paints the paper colour at once. The mark fades in only after 150ms, so fast loads never flash it; while it shows, the edge draws from the round node to the square, holds, then lifts off; it stays still under reduced motion. It's lifted on `load` plus fonts (at most 1.5s more), never later than 8s.
- **Icons:** favicon (small cut, edge lightens in dark tab bars) and the app icon (indigo tile).

**Colour restraint:** apart from user content and the logo, the only colour in the interface comes from the two pens. Active tools and menu highlights use ink, not an accent hue. Segmented controls are a recessed track with a raised selected segment; every track uses 3px padding and a 3px gap between segments (2px felt cramped, 4px looked worse).

## Appearance
- Appearance is System / Light / Dark (a deliberate override of HIG dark-mode.md), an icon-only segmented control (monitor, sun, crescent moon) at the right end of the top bar. At ≤1100px only the current icon shows and clicking it cycles System → Light → Dark. The choice is stored in localStorage `texdiagram.theme`; an inline head script resolves it to `data-theme` on `<html>` before the CSS loads, and System follows `prefers-color-scheme`. Dark redefines the same tokens on `:root[data-theme=dark]`.
- The drawing sheet, page sheets and the typeset document page stay light (`--canvas`, softened in dark) so user colours read correctly; `.doc-page` re-declares the light tokens for everything drawn on it.
- `prefers-contrast: more` strengthens rules and promotes `--pencil` to `--graphite`.

## Depth and shape
Hairline rgba rules and rounded corners: `--r-sm` 4px, `--r` 6px (buttons, inputs, segmented tracks, menu rows), `--r-lg` 10px (popovers, menus, cards), `--r-xl` 12px (modals). Corners nest concentrically: a shape inset N px inside another takes the outer radius minus N. Segments are 3px inside a 6px track with 3px padding (radius `calc(var(--r) - 3px)`). Menus (context, dash/width, select, LaTeX autocomplete) have 4px padding and 6px rows inside a 10px shell. Selected rows are marked by fill, not an edge bar, because a bar does not sit well on a rounded row. Every menu (context, select, dash/width) highlights the hovered row the same way: the `--well` tone, text and icons unchanged; destructive rows turn the red pen. Submenus sit 4px clear of their parent, first row level with the row that opened it, with no icon column. Square corners were tried and rejected as less friendly; chamfered (diagonal-cut) corners were considered and not used.
- Shadows are used only where something floats above the sheet: popovers, menus, the colour picker, modals, the inline editor and the document page.
- Menus open below their control (above when there is no room) and line up with the edge nearest the window side the control sits on: in the properties panel and the Export popover, the menu's right edge meets the control's right edge and the menu grows left; elsewhere the left edges meet.
- Elevation goes paper → sheet → sheet-raised.

## Typography
The UI uses only two families: sans and mono. The serif (`--font-tex`, KaTeX_Main) is kept for content: text on the canvas (`.tx`) and the typeset document page (`.doc-page`). Never use it for UI chrome.
- **UI:** system-ui at 13px. Labels are 12px in graphite.
- **Section titles** (`.sec-title`, `.pop-title`, `.panel-head span`, `.sc`): 11px, weight 600, sentence case, in pencil.
- **Type scale:** 10 (rulers, captions) · 11 · 12 · 13 (body) · 15 (titles). Nothing below 10px (HIG macOS minimum).
- **Labels:** buttons, menu items and dialog titles use title-style capitalisation; checkbox labels and hints use sentence case. On macOS, shortcuts show as glyphs in the order ⌥⇧⌘.
- **Numbers:** ui-monospace with tabular-nums for numeric inputs, the status line, rulers and the doc HUD.

## Spacing and measurements
- 4px base.
- Top bar 44px with 28px controls (8px above and below); toolbar groups are separated by space, not rules; one prominent action (TikZ).
- Tool rail 48px with 32px rounded buttons; document list 200px with inset 28px rows; properties panel 280px (`--props-w`) with 12×16 section padding and an 84px label column.
- Panel headers 40px; rulers 18px; status line 24px.
- Every control is `--ctl` 28px (HIG macOS default); dense secondary controls are `--ctl-sm` 24px (HIG minimum 20). Context-menu rows 26px, inset 5px.
- As the window narrows the toolbar sheds the wordmark (≤1360), segment icons (≤1240) and button icons (≤1140).

## Selection language
- **Marquee**: drag left-to-right for a window selection (shapes wholly inside; red-pen dashed box). Drag right-to-left for a crossing selection (anything whose drawn outline or fill the box touches, not just its bounding box), shown in highlighter yellow (`--marker`).
- **Selection box:** red pencil, 1px, dashed 4/3.
- **Group box:** red, dotted 1/3.
- **Main handles:** 7.5px squares with a white fill and red stroke.
- **Control points** (curves, plots, XyMatrix arrows): blue circles.
- **Marquee:** red wash with a dashed edge.

## Status line (`#status`)
- Zoom in the status bar: − [field] + 1:1 Fit. The percentage is a text field: click selects it, type a number (with or without %), Enter or leaving applies, Esc reverts; values clamp to 10–800%. 1:1 is the dedicated reset to 100%.
- Grid spacing is the same kind of field (`grid [0.25] cm · snap on`): 0.05–5 cm, an app preference saved with snap. Minor lines follow it; major lines stay on whole centimetres when the spacing divides 1 cm, else every 4th line.
- Groups (position · selection · grid/snap | pages | zoom) are separated by empty space in `--gutter`, a step deeper than the bar, so the groups read as separate pieces. The gap before zoom only shows with the page navigator.
Shows the cursor as `x · y cm`, the selection as N selected with its width × height in cm, and the grid size and snap state. Zoom controls −, %, + and Fit sit on the right.

## Page mode
- The sheet is `--sheet-raised` (white) on the `--paper` desk with a faint offset shadow (ink at 10%); the grid drops to 55% opacity.
- Margins are `--bluepen` dashed 4/3 at 35% opacity: construction lines, like the other blue guides. They hide with the grid.
- Content outside the paper is covered by a desk-coloured mask at 72%, so it reads as "off the page" without disappearing.
- Page numbers sit outside the top-right corner in mono, in pencil.

## Fill picker
- The colour picker gains Basic / Gradient / Pattern tabs only for fills. The active tab is ink text with a 2px ink underline (no accent colour).
- Gradient stops are small pentagon markers under the bar; the selected one is red pencil.
- The width and dash dropdowns preview the actual stroke at real width, with the px value and its pt equivalent in mono.

## Status
- Saving is continuous, so the top bar shows no save state. The sidebar footer says "Autosave enabled"; only a failure changes it (red text plus a one-off hint, since the sidebar can be hidden). After it sit the GitLab mark (14px, pencil grey like the text, ink on hover, 20px hit area; links to the repository) and the version, which links to that release's tag. The status stays on one line and ellipsises rather than wrapping.
- The app version sits at the right of the same footer (`v1.1.0`, mono, same muted colour). Its single source is `TD.VERSION` at the top of `js/shapes.js`: bump it with each release tag. The page-layout LaTeX export header also carries it.

## Text
- Text tool: a click places a line of text; a drag (at least 12 screen px each way) draws a paragraph box. A box has a fixed frame (`tw` × `th`), text wraps at its width from the top, eight handles resize it, and overflow runs on below the frame instead of being hidden. In a box, Enter is a new line and ⌘↩ or Esc finishes.
- The inline text editor opens roomy: 360px wide (or the paragraph frame's on-screen width, up to 640px), at least three lines tall, 14px mono. It grows with the text up to 260px, then scrolls, and stays inside the canvas.

- Align applies to all text: a segmented control of four heavy-bar icons (Left, Centre, Right, Justify), 30px segments, stroke 2 with butt caps. Justify is shown but disabled until the text has a wrap width. Point text defaults to Centre, paragraph boxes to Left; TikZ gets `align=…` on multi-line nodes.

## Cursors
- Use the standard CSS cursor for what a drag will do. Never `pointer` (the hand) on canvas handles: the hand is for links and buttons.
- Edge and corner handles resize: `ew-`, `ns-`, `nesw-` or `nwse-resize`, turned with the shape's rotation and snapped to the nearest of the four. Text wrap and circle radius handles count as edges.
- Point handles (line ends, vertices, arc ends, arc centre) and shape bodies: `move`. Space held: `grab`; while panning: `grabbing`. Rotation zone: the custom rotate cursor. The zone is a small tab straight out from the middle of each edge (28px wide centred on the edge's midpoint, narrower on a short edge; 9–26px out along the outward normal). A strip along the whole edge was tried and felt too greedy, as was a radial zone around the corners. It stays 9px clear of the resize handles the shape actually has, so a near miss on a handle still resizes, and it never covers another shape: pressing on another shape selects it.
- During a handle drag the canvas keeps the handle's cursor, so it doesn't flicker when the pointer outruns the handle.

## Installable app (PWA)
- `public/manifest.webmanifest` (standalone, cream background) and `public/sw.js` make the site installable: Chrome/Edge show an Install button in the address bar, Safari uses File › Add to Dock (iOS: Share › Add to Home Screen).
- `sw.js` precaches every same-origin file, so the app works offline from the first visit. Fetches go network first, falling back to the cache when offline or after 4s, so a deploy shows on the next load. Cross-origin requests pass through. Bump `CACHE` in `sw.js` when the file list changes.
- Icon (`public/icons/`): engineering-paper grid, a ball-shaded charge and an ink arrow. `icon.svg` is the rounded tile (favicon and "any"); `icon-maskable.svg` is full-bleed with the art in the safe zone. PNGs are rendered from these at 32, 180, 192 and 512.
- `theme-color` follows the appearance (#fffdf8 light, #242320 dark), so the installed window's title bar matches the top bar.

## Files sidebar
- Right-click a file: Open (if not the open one), Rename…, Duplicate, Save As…; Copy, Paste; Download (.json); Export ▸ LaTeX, TikZ (Classic), HTML, Image, Print; Delete. Rename/Duplicate/Save As/Copy/Paste/Delete work on that file in place; Download/Export/Print open it first, since they act on the open file.
- Rename… turns the row's name into a field in place (Enter or clicking away keeps it, Esc cancels); the file isn't opened, and the top-bar name follows when it is the open file. With the sidebar hidden it falls back to the top-bar name field.
- Right-click the empty list area: New, Open File…, Paste.
- Copy puts the project JSON (same as Download) on the system clipboard; Paste opens it as a new file and never reuses an existing name ("… copy", "… copy 2").

## Dialogs (`js/dialog.js`)
- Never use the browser's `alert` / `confirm` / `prompt`. Use `TD.confirm(title, message, opts)`, `TD.prompt(title, value, opts)`, `TD.alert(title, message)`; each returns a Promise.
- The title asks the question ("Delete "Name"?"); the message says what happens. Buttons name the action ("Delete", "Save", "Add Link"), never "OK" when a verb fits.
- Destructive actions pass `danger: true`: red button, focus starts on Cancel, so a stray Return can't delete.
- Esc cancels, Enter takes the default, Tab stays inside, focus returns to where it was. One dialog at a time.
- Buttons sit the same distance (`--tdd-inset`, 14px) from the right and bottom edges, and the sheet's corner is concentric with theirs: radius = button radius + inset (6 + 14 = 20px). Text keeps its 20px inset.

## Attached connectors
- Lines, arrows, curves and springs attach an end that is dropped on a shape's outline or one of its snap points. The end is stored as a position in the shape's frame (`link1` / `link2` = `{ id, u, v }`) and follows the shape when it moves, resizes or rotates.
- While drawing or dragging an end, the shape it will attach to gets a soft blue outline and the end snaps onto the outline. Attached end handles are filled blue.
- Moving, nudging or rotating the connector without its shapes detaches it, as does typing an end's coordinates or dragging the end off. Alt places an end without attaching.
- Copies keep links only to shapes copied with them. TikZ export uses plain coordinates.

## Text input modes (`js/mathinput.js`)
- The sidebar's "Text input" control picks LaTeX (a plain textarea, maths as `$…$`) or MathLive (an interactive maths editor), stored in localStorage `texdiagram.input`. Both edit the same stored text; only the on-canvas editor changes. The props-panel textarea and Document-mode blocks stay LaTeX.
- MathLive (vendor/mathlive, 0.111.1) loads on first use and reuses KaTeX's fonts. One `<math-field>` per line; prose is MathLive text mode, maths its maths mode, and `$` switches between them. A line converts as `Force $F = ma$ here ⇄ \text{Force }F = ma\text{ here}` and is rewritten only once edited. MathLive's spelled-out characters (`\textbraceleft` …) are stored as the usual escapes.
- Keys: Enter done, Shift+Enter new line (paragraphs: Enter new line, ⌘/Ctrl+Enter done), Esc done, Backspace on an empty line removes it, ↑/↓ at a line edge moves between lines.

## Prose text commands (`TD.prose` in `js/shapes.js`)
- Prose outside `$…$` renders common text commands on canvas: `\textbf \textit \emph \textsl \underline \texttt \textsf \textrm \textsc \textup \textmd \textnormal`, symbols (`\ldots \S \textdegree \LaTeX` …), escapes (`\% \$ \_ \{ \}`), `~` as a no-break space, and `--`/`---`/``` `` ```/`''` ligatures. Unknown commands show as source. Export passes the source through unchanged.

## Top bar
- Order: sidebar toggle, file icons, Page/Classic switch, document name, … Diagram/Document, undo/redo, grid/snap, print, Export · Code · LaTeX, appearance icons. Groups are 16px apart.
- Export opens a popover: PNG, SVG, PDF or Web page (the whole file as one self-contained .html). In Document view it offers only Web page. Code (`</>` icon) shows the TikZ, or the page's LaTeX, to copy; LaTeX downloads the whole file as a compilable .tex.
- Export, Code and LaTeX share one outlined style (the default button). Solid black output buttons were tried and were the loudest thing on screen; a soft fill and a blue-pen tint were also considered.
- Panel actions (Bring to Front, Duplicate, Delete …) use a soft `--wash-strong` fill with no border, so they never read as white fields. Delete turns the red pen on hover.
- A maths-only command in prose (`\alpha`, `\frac{a}{b}`, `\degree`) won't compile, so it stays as typed with a red-pen dotted underline and a hint ("Maths command: put it in $…$", plus the text spelling where one exists, such as `\textdegree`). Commands that are fine in text (`\hspace`, `\small`, `\ref` …) and unknown commands are not flagged. The underline is app-only: never printed or exported.
- LaTeX source fields (canvas editor, Text / Label in the panel, Document text blocks) colour maths (`$…$`, `$$…$$`, `\[…\]`) in `--mathpen` green, as a LaTeX editor does; an unclosed `$` colours to the end of the line while typing. Done by a copy of the text laid over the focused field (`js/texhighlight.js`); the field keeps caret, selection and spell-check. In quantikz code the green follows what LaTeX sets as maths: cells are tikz-cd cells, so `\gate`, `\phase`, `\push`, `\meter`, `\meterD`, `\measure`, `\measuretab`, `\qwbundle` labels and bare cell text are green whole; `\lstick`, `\rstick`, `\midstick`, `\slice`, `\gategroup` labels are text, green only inside `$…$`; options, wire numbers and comments stay plain.
- Copied shapes (Copy, Cut, Copy as TikZ) are also kept in local storage (`texdiagram.clip`), so Paste works in the app's other windows and tabs; the newest copy from any window wins. Paste lands centred in the visible canvas (moved by whole grid steps, so it stays on the grid); pasting again without moving the view steps each copy 2 grid squares down-right. Duplicate still offsets from the original.
- Command suggestions follow the caret: inside maths, every command; in prose, only commands that work in text (`TD.prose.textOk`: the prose commands and symbols, `\text…`, sizes, spacing, refs).
- In quantikz code (the canvas code editor and the panel's code field) suggestions follow the circuit: at cell level the quantikz commands (Gate, Control, Measure, Wire, Label, Group), each previewed as a small drawing by the circuit renderer itself in the UI's ink (`TD.qcMini`; gate fills use `--qc-paper`, the row's own opaque colour, `--wash-strong-solid` when highlighted); inside a command's `{…}` every maths command; inside `[…]` none. `&` and `\\` reset the context, so a half-typed bracket doesn't leak into the next cell.

## Quantum circuits (`js/quantum.js`)
- Insert → Diagrams → Quantum. The object *is* its quantikz source: it is drawn as vectors (an approximation of quantikz2's layout, wires run the full width unless `\setwiretype` / `\wireoverride` say otherwise) and is edited in the quantum editor (`js/qceditor.js`, below). Insert opens it; double-click, Enter, the context menu's Edit or the panel's Edit Circuit… open it again, and Done is one undo step. The panel shows the code, any commands that aren't drawn (kept in the code, red-pen lines), Edit Circuit… (primary) and Copy quantikz Code. A circuit with nothing drawn falls back to its grid's extent.
- Drawn: `\gate` (incl. `[wires=n]`, `\gate[…][min width][min height]{…}`, which widens the column, and `style={minimum width/height/size=…}`, which grows only the box, over its neighbours, as quantikz does; the panel warns about that and about `$` inside a gate, which quantikz already sets as maths), `\ctrl \octrl \control \ocontrol \targ \targX \swap \phase \meter \meterD \measuretab \lstick \rstick` (incl. braces for `[wires=n]`), `\push \midstick \qw \cw \qwbundle \setwiretype \wireoverride \wire[d|u|l|r][n]{q|c} \vqw \vcw \cwbend \slice \gategroup \ground`, and `row sep` / `column sep` / `wire types` options. Gate contents are maths (with or without `$`); stick, slice and group labels are text (a bare command such as `\ket{0}` in a stick is maths, as it is in LaTeX). `\setwiretype` also sets the wire coming into its own cell, as quantikz2 draws it.
- Geometry is calibrated against compiled quantikz2 (TeX Live 2026): row and column sep 0.5cm between cell edges, everything `thick`, gates are their text plus 4pt a side, meters 2em × 1.5em, control dots 0.12cm, stick labels hang off a zero-width column, slices red and dashed 5pt/3pt, gategroups solid with 4pt + ⅓em to spare and their label 0.2cm above. The compiled circuit lands within about 1mm of the drawing.
- Export: `\usetikzlibrary{quantikz2}` and the code unchanged in an option-free `\node` (options would leak into the circuit's nodes), centred on the drawing, inside `\pgfinterruptpicture`. Import turns a bare `\begin{quantikz}` or one inside a `\node` back into the object.

## Quantum circuit editor (`js/qceditor.js`)
- Same shell as the circuit editor (`#qcModal` reuses the `cz-*` classes): header with add wire, add step, clear, undo, redo, fit, Cancel and Done; palette | stage | side pane (properties over the live quantikz code, count “R wires · C steps”, Copy, warnings).
- Palette: a 3-column grid of tiles (`.qe-item`, 72px high) in Gates, Controls, Measure, Labels, Wires, Annotations. Each tile is a quantikz drawing (`TD.qcMini`) at one shared scale (1.5×, shrunk only to fit 64×44px), so wires and gates keep the same weight, over an 11px graphite name. Click places into the selected cell and steps right, or arms the element (marker wash) for clicking cells; drag drops on a cell.
- Stage: the circuit drawn by the canvas renderer on paper (`#fffdf8`), over faint cell rules at the midpoints between columns and rows. A dashed column and row with a + past the end take drops that add a step or a wire. Hover is a 4% ink wash; a drop target is a bluepen outline on a 12% bluepen wash; the selection (a cell or a range) is the red-pen wash. A selected control shows its link as a dashed bluepen line with a hollow bluepen knob on the wire it reaches; drag the knob to relink.
- Right-click on a cell opens a `.ctx` menu inside the modal (`.qe-ctx`, z-index 1500): Insert Wire Above / Below, Insert Step Before / After, Delete Wire(s), Delete Step(s), Clear Cell(s). It acts on the selection when the click is inside it, otherwise selects the cell first. The side pane no longer carries wire / step buttons. Insert and delete items use three-bar icons (`QI` in qceditor.js), monotone like every other icon: two outlined bars (the wires that stay) and one filled bar offset to where the new wire or step goes (first for above/before, last for below/after); delete fills the middle bar with a knocked-out ×. Steps are the same icons transposed. The header's add-wire and add-step buttons use the below/after icons.
- Hovering or dropping on the growing row or column highlights the whole strip, not one cell.
- A selected one-wire-or-more gate shows its box dashed in red pen with an 8px handle (`--handle` fill, red-pen stroke) on the lower right; dragging it sets `\gate[][min width][min height]{…}` in 0.05cm steps (the tip shows the values; at the fitted size it reverts to auto). The panel has Min width / Min height number fields in cm (placeholder “auto”). An unset width before a set height is written as quantikz's default `1.5pt`. The handle is the lower right corner: the size follows the pointer's travel from where the drag began (the column's left edge and the wire's top stay put), so right / down grows the gate and left / up shrinks it; at or below the fitted size it is auto again. The Min width / Min height fields and the cell's Code field follow the drag live.
- The same gate has a 16×6 bar (`.qe-span`, same fill and stroke, `ns-resize`) centred on its top and bottom edges. The bottom bar sets how many wires it spans; the top bar moves its top wire (the gate's cell moves up or down with it, controls that point at it follow), keeping the bottom where it was. Either stops at the first non-empty cell in that step, so a gate never covers another element. The tip shows the wires; the Wires and Code fields follow live; one undo step.
- Double-click a gate or another element with a label (`LABEL` in qceditor.js: gates, phases, meters, sticks, push, midstick, bundles) to edit the label in a popup under it (`TD.input.popup`, below). Gate, phase and bundle labels are maths (no `$`); stick labels are text, with a lone command such as `\ket{0}` edited as maths. Double-click is detected from pointerdown timing, as on the canvas, because redraws between the clicks swap the target and no native dblclick arrives.
- Side-pane fields and the code textarea use `--sheet-raised`, like the main panel's fields, in both editors.
- Model: rows of cells. A cell keeps its own text until it is changed, so hand-written code survives; cells with commands the editor doesn't know are opaque and kept. Inserting or deleting wires and steps remaps links (`ctrl octrl swap vqw vcw cwbend`), spans (`gate lstick rstick`) and group sizes. The code is written with the `&` signs lined up.
- Keys (captured while open): arrows (Shift extends), `H X Y Z S T U C O M +`, Delete, Enter (first field), ⌘C/⌘X/⌘V cells, ⌘A, ⌘Z/⇧⌘Z/⌘Y, ⌘F or /, 0 fit, Space-drag or middle-drag pan, wheel pan, ⌘/Ctrl-wheel zoom, Esc (disarm, deselect, cancel), ⌘Enter Done, ⌘S save to the page and keep editing. A circuit that grows past the view is fitted again.

## Electrical circuits (`js/circuit.js`, `js/czeditor.js`)
- The rail's Electrical flyout holds Circuit… (a `pop-grid cz-entry` row), then two `pop-title` sections, Symbols and Waveforms; Misc no longer carries electrical symbols. Waveforms (`cat: 'wave'`, 135×40) are periodic like the Misc wave: one period is a list of pieces (flat, ramp, sine; curved pieces are cubic Hermite at ⅛-period steps), widening adds periods, and the panel has Wave length, Start position, and Duty cycle (square, pulses; 5–95%) or Firing angle (chopped; 0–175°). A file from before has no wavelength, so one period fills the width as it used to. Insert → Circuit does the same.
- Circuit and quantum editor tool rows (`.cz-tools`) follow the main tool rail: 32px buttons 4px apart, 18px icons, graphite at rest, `--wash` on hover, `--ink` fill with a `--sheet` icon when active, 20px separators with 6px of air each side.
- Editor side panels (`.cz-props`) follow `#props`: 84px labels, 8px between controls, no margin above the first row or below the last; the first section's title names the item (13px/600 ink, like `#props h3`), later section titles are subsections (11px/600 pencil).
- Circuit editor: a click with a part picked places a two-terminal part centred on the pointer, exactly where its blue preview was (a drag still runs from start to end). Each two-terminal part has a filled hit box over its body as well as the 12px lead line, so clicking between a capacitor's plates or inside a resistor's zigzag picks it. Double-click a part (not a wire) to edit its label (`l`; a node's `text`) in the label popup.
- Label popup (`TD.input.popup(host, opts)` in mathinput.js): the canvas inline editor's box (`.td-pop-ta`, LaTeX) or MathLive box (`.td-pop-ml`), per the Text input setting, positioned under the item and following pans and zooms. Enter, Esc or clicking away finishes; the edit is one undo step. The editors' window key handlers leave keys inside a popup alone.
- Maths is green (`--mathpen`) in the sub-editors' LaTeX fields as on the canvas (texhighlight.js), in the label popup and the side-panel fields alike. Circuit labels, annotations, voltage/current labels and node text colour only what is inside `$…$`. Quantum gate, phase and bundle labels are maths throughout (`data-tx="math"`), so the whole field is green and completion offers maths commands; sticks, meters, slices and groups are text (`data-tx="text"`), green only inside `$…$`.

## Tooltips (`js/tooltip.js`)
- The app draws its own tooltips; the browser's never show. Every `title` attribute, including ones added or changed later, moves to `data-tip` (a MutationObserver); icon-only controls and fields get it as their `aria-label`, others as `aria-description`.
- `.td-tip`: `--ink` fill, `--sheet` text, 12px/500 UI type, `--r-sm` corners, `--shadow-pop`, max 280px wide, 6px below the control (above it near the bottom edge), kept 8px inside the window, z-index 3000.
- Shows after 800 ms of hover; moving straight to another control shows its tip at once (within 400 ms). Pressing, typing, scrolling or leaving hides it; keyboard focus (`:focus-visible`) shows it too. Touch never shows one.
- A shortcut in brackets is set apart as a key hint: “Undo (⌘Z)” ends with a muted ⌘Z; “Wire (W): drag between points…” puts “Wire W” on the first line and the description muted under it.
- The circuit block (`cz`) is a list of circuitikz items in local cm (y up), drawn on the canvas with the same renderer as the editor. Leads are wire weight (0.4pt), part bodies twice that. Double-click, Enter or the panel's Edit Circuit… opens the editor.
- The editor is a large overlay modal (`#czModal`, 1600×900 max, 97vw × 93vh): a header with tool buttons (select, wire, rotate, flip, delete, undo, redo, fit), Cancel and Done (primary); below, palette 240px | paper-coloured stage on a 0.25cm grid | side pane 400px (200 / 300 under 1100px; one column with the palette hidden under 800px). The side pane stacks the selection's properties (hidden when nothing is selected, at most 55% high) over the code: a head with “circuitikz”, the count “n parts · m wires” and Copy, then a mono textarea on `--well` (on focus `--sheet-raised` with a 2px bluepen bar on the left). The drawing rewrites the code unless the textarea has focus; typing is read back 250ms after the last key and on blur, as one undo step. There are no Draw/Code tabs. The stage is paper, like the page, so parts read as ink on paper in both themes.
- Palette: search field on top, categories as `<details>` (the common ones open). Click to arm a part, or drag it onto the stage.
- Its shortcuts are captured while it is open (V, W, R, F, Delete, ⌘Z/⇧⌘Z, ⌘D, ⌘A, ⌘F or /, arrows, 0, Esc, ⌘Enter, ⌘S), so the main editor's stay off. ⌘S (Ctrl+S) writes the work back to the page as one undo step there and keeps the editor open, showing “Saved to the page” in the tip for 1.5 s; Esc afterwards closes without asking, as nothing is left to discard. The browser's Save Page never opens. Cancel with changes asks with the standard danger confirm (Discard).

