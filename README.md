<p align="center">
  <a href="https://diagramtex.igniting.space/"><img src="design/logo/final/lockup-horizontal.svg" alt="DiagramTeX logo" height="64"></a>
</p>

# DiagramTeX: free online TikZ and LaTeX diagram editor

**DiagramTeX** lets you draw diagrams in your browser and export them as clean **TikZ**, **circuitikz**, **pgfplots**, **tikz-cd**, **quantikz**, **forest**, **zx-calculus** and **blochsphere** code for LaTeX. Draw shapes, arrows, circuits, plots, commutative diagrams, quantum circuits, trees, ZX diagrams and Bloch spheres with the mouse, type labels in LaTeX maths (`$…$`), then paste the code into Overleaf or any LaTeX document.

It is **free and open source** ([MIT License](LICENSE)), **works offline**, and needs **no sign-up, login or payment**. Your diagrams stay in your browser; nothing is uploaded.

**[Open DiagramTeX: diagramtex.igniting.space](https://diagramtex.igniting.space/)**

## Why DiagramTeX

- **Visual TikZ editor:** draw instead of guessing coordinates, and get readable `tikzpicture` code with the packages and libraries listed for you.
- **LaTeX maths everywhere:** labels render with KaTeX or Temml as you type, with LaTeX command suggestions and maths highlighting.
- **Import existing TikZ:** open a `.tex` file or paste TikZ code to keep editing figures you already have.
- **Offline and private:** an installable web app (PWA). After the first visit it runs without an internet connection, and documents are saved in your browser.
- **Privacy-focused:** no account, no analytics, no cookies, no ads. See [Privacy](#privacy).
- **No account, no cost:** open the page and start drawing.
- **No build step:** plain HTML, CSS and JavaScript, easy to self-host.

## What you can draw

- **Physics diagrams:** springs, waves, balls, axes, rulers, vectors, fields and force diagrams.
- **Circuit diagrams:** a drag-and-drop circuit editor with 266 `circuitikz` components (resistors, capacitors, inductors, sources, meters, diodes, transistors, op-amps, switches, logic gates, flip-flops, ICs, block-diagram parts) that exports `circuitikz` code, plus 35 quick electrical symbols and waveforms.
- **Function plots and charts:** 2D and 3D pgfplots (functions, parametric, polar, implicit, inequalities, vector fields, contour, heatmap, bar, scatter) and pie charts.
- **Commutative diagrams:** a `tikz-cd` editor: type or drop objects on a grid, drag arrows from cell to cell, and pick each arrow's style, label, bend and shift, with the code live beside it.
- **Bloch spheres:** a `blochsphere` block drawn with the package's own geometry; set the radius, view angles, ball style and states in the panel.
- **Quantum circuits:** a drag-and-drop `quantikz` editor (gates, controls, CNOT/controlled-U/Toffoli/SWAP, meters, labels, wire types, slices, groups) with the code live beside it.
- **Trees:** a `forest` editor for syntax trees, org charts, directory trees, decision and probability trees: add, move and restyle nodes by keyboard or drag, with templates and the code live beside it.
- **ZX diagrams:** a `zx-calculus` editor: drop Z and X spiders, Hadamard boxes and points on a grid, drag a node's handle to wire it to another, and pick each wire's shape from pictures.
- **Flowcharts and block diagrams:** 28 flowchart symbols, 33 basic shapes and 27 block arrows.
- **Whole pages and documents:** lay out text, maths and figures on A4 or Letter pages and export a complete LaTeX `article`.

## Quick start

1. Open **[diagramtex.igniting.space](https://diagramtex.igniting.space/)**.
2. Pick a tool from the left rail and draw. Type `$…$` in a label for maths.
3. Press **Ctrl/⌘+E** to open the TikZ code and copy it, or **Ctrl/⌘+Shift+E** to download the whole document as `.tex`.
4. Paste the code into your LaTeX document and compile.

A new browser opens with a short welcome file: a few lines on how the app works and one example of each kind of object (text, formulae, shapes, a circuit, a quantum circuit, a plot, a commutative diagram).

To use it offline, install it from your browser (the install icon in the address bar, or **Add to Home Screen** on a phone).

### Run it locally

The site lives in `public/`; serve that folder. KaTeX 0.19.1, Temml 0.14.0 and MathLive are in `public/vendor`, so no CDN is needed. Opening `public/index.html` directly also works in most browsers.

```bash
python3 -m http.server 5173 --directory public
```

Then open http://localhost:5173.

### Self-host on Cloudflare Workers

`wrangler.toml` publishes a static-assets-only Worker (no server code). Before each deploy, wrangler runs `scripts/build.js`, which copies `public/` to `dist/` with the JS and CSS minified by esbuild, and serves `dist/`:

```bash
npx wrangler deploy
```

`npx wrangler dev` previews it locally first.

## Feature reference

### Drawing
- **Tool rail** (Mathcha-style; buttons with a small corner triangle open a flyout):
  - select, maths (`M`, a text object that starts in `$…$`), text (`T`)
  - **Lines:** line, curve, arrow, curved arrow, polyline, smooth closed blob, arc (angle mark), spring
  - **Shapes:** rectangle variants (rounded, snipped), 33 basic shapes and 28 flowchart symbols
  - **Electrical:** Circuit… (the circuit editor, below), the common electrical symbols (resistor, capacitor, inductor, sources, diode, transistor, logic gates, ground…) and a Waveforms group (sine, square, pulse, negative pulse, triangle, sawtooth, trapezoid, rectified and half-wave rectified sine, chopped). Waveforms repeat as you widen them; set the wavelength, start position, duty cycle (square, pulses) or firing angle (chopped) in the panel
  - **Misc:** axes, wave, brace, ruler, grid and more, ball, dot
  - **Arrows:** 27 block arrows
  - **Plots** (the Insert menu), **Image** (`I`: PNG, JPEG, GIF, WebP or SVG; exported with `\includegraphics`), **Pencil** (`N`: freehand, smoothed and exported as Bézier curves)
  - Library symbols export as exact TikZ paths, can hold centred text, and can be rotated and flipped.
  - **Misc shapes keep their detail size when resized**, as in Mathcha: stretching a wave adds periods instead of widening them, a coil adds loops, a brace keeps its curls, and a ruler or grid adds ticks or cells. Their detail sizes are in the panel: wave **Period width** and **Start position**, coil **Loop pitch** / **Loop size**, axis **Tick spacing** and **Show numbers**, ruler **Tick spacing** / **Tick size**, grid **Cell size** / **Corner shift** / **Border**. Symbols also have **Rotation** and **Skew X**.
  - **Spring** has a **Loop pitch**, so a longer spring gets more coils. A **ticked** line shaft has tick spacing and size.
  - **Polyline points:** click a point to choose it, drag a **+** to add one, double-click to remove one (or use **Add point** / **Remove point** in the panel).
- **Insert menu** (the Plots button): you can click to place an item or drag out a box.
  - **2D plots (pgfplots):** function, line, scatter, area, bar, contour, heatmap.
  - **3D plots:** surface, mesh, scatter, and function `z = f(x, y)`. The view angles follow pgfplots `view={az}{el}`.
  - **Pie chart:** one `label value [#color]` per line.
- **Blocks menu** (the cube button below Plots): CD, Bloch, Quantum, Circuit, Tree and ZX. A new block starts with `large` labels, whatever the default text size is.
- **Grid editors** (Quantum, ZX, CD): point just left of a row or just above a column and a bin appears; click it to delete that row or column. Every field in an editor's panel updates the others as you type (a label and its code, an option and its buttons).
- **Plots:** each plot can have several series, given as expressions (`sin(x)*exp(-x/4)`, `x^2+y^2`, …) or as data. You can set axis labels, ranges, grid, legend, colormaps (hot, viridis, jet, cool, gray) and a colour bar. Expression errors show in the panel and on the canvas.
  - **Function plot series types** (Mathcha's set): regular `y = f(x)`, **inequality** (`y < f(x)`, `≤`, `>`, `≥`; shaded, with a dashed edge when strict), **bounded region** between `f` and `g`, **x in terms of y**, **parametric** `(x(t), y(t))`, **polar** `r(θ)`, **implicit** `F(x, y) = 0`, **points**, **vectors** (`x y` or `x y u v`), **vector field** `(P, Q)` and **phase portrait** (trajectories with arrows).
  - **Variables:** one line such as `a = 2, b = 0.5` per plot; every series can use them.
- **LaTeX labels:** text and path labels render `$…$` maths. Path labels use TikZ `auto` / `swap` placement, so the canvas matches the output.
- **LaTeX engine** (left sidebar, under the file list): choose how maths is previewed. It only changes the preview; the exported LaTeX is the same. The choice is saved in this browser.
  - **KaTeX** (default): HTML and CSS, so it looks the same in every browser.
  - **Temml**: MathML set in Latin Modern Math by the browser. It covers more LaTeX and looks closer to MathJax / TeX, but fine details (accent widths, stretchy brackets) vary a little between browsers.
  - Exported SVGs carry the stylesheet for the engine in use. Temml SVGs keep real MathML.
- **Styling:**
  - colour picker with presets, alpha and "No colour"
  - **fills** with three tabs: Basic (a colour), **Gradient** (linear or radial, 12 presets, rotate, scale, centre and draggable colour stops; exported as pgf shadings) and **Pattern** (vertical, horizontal, grid, diagonal, crosshatch, bricks, dots, with size, line width and colour; exported with `patterns.meta`)
  - line width presets, dash presets (dotted, dashed, dash dot, densely dashed, long dashes…) or a custom `on off …` pattern in pt (`dash pattern=`), arrow tips, opacity
  - text boxes: drag the handle on a text's right edge to give it a wrap width, then choose left / centre / right / justify (`text width=`, `align=`)
  - math in text and Math objects: `$…$` is inline; `$$…$$` or `\[…\]` is display style (full-size fractions, sums and limits), exported as `$\displaystyle …$`, and imported back the same way. **Math style** (Inline / Display) in the properties panel switches every formula in the selected objects at once.
  - **command suggestions:** type `\` in the canvas text editor, the Text / Label fields or a Document text block, and matching LaTeX commands appear at the caret with a rendered preview. About 250 common ones (Greek, operators, arrows, `\frac`, `\sqrt`, matrices, `aligned`, `cases`…) come first, then everything else the selected engine supports, such as `\bra`, `\ket` and `\braket` (about 900 for KaTeX and 1,000 for Temml). Use ↑ ↓ to choose, Enter or Tab to insert (the caret lands in the first `{}`), and Esc to close.
  - font family, bold/italic, and font size: `\tiny` … `\Huge` or a custom px size (exported as `\fontsize`)
- **Rulers and status line:** the canvas has centimetre rulers in TikZ coordinates (y up). They show the selection's extent in red and the cursor position. The bottom status line shows the cursor (cm), the selection size, the grid and snap state, and zoom.
- **Precision:** 0.25 cm grid. Shapes snap to the grid and to other shapes' points; hold **Alt** to bypass snapping. **Shift** constrains to 15° angles and to squares/circles. The panel shows numeric geometry in TikZ cm.
- **Editing:** multi-select, move, resize handles, copy/paste/duplicate, undo/redo, arrow-key nudge.
- **Free rotation:** hover just outside any corner of the selection and the cursor turns into a rotate arrow; drag to rotate (hold **Shift** for 15° steps). One shape rotates about its own centre; several rotate together about the selection's centre. Rectangles, ellipses, text, images and symbols keep a **Rotation** angle (also typed in the panel; exported with `rotate around`), and lines, curves, polylines, arcs, springs and regions have their points rotated. Resize handles follow the rotation, and the opposite side stays put while you drag one.
- **Combine** (select two or more closed shapes, then use the **Combine** row in the panel or right-click → Combine): **Unite**, **Intersect**, **Subtract** (the shapes above are cut out of the bottom one), **Exclude** (keeps the areas covered an odd number of times) and **Divide** (splits into every overlap piece). Works on rectangles (rounded too), ellipses, balls, dots, closed polylines and blobs, filled symbols, and earlier results. The result is a **Region**: a polygon path that can have holes, exported with `even odd rule`.
- **Right-click menu:** copy, copy TikZ code, copy text, cut, paste, duplicate, delete, group/ungroup, and these submenus:
  - Combine: unite, intersect, subtract, exclude, divide
  - Arrange: front, forward, backward, back
  - Rotate: 90° either way, flip horizontally/vertically
  - Align: left, center, right, top, middle, bottom
  - Distribute: horizontally, vertically
- **Groups** (Ctrl+G, Ctrl+Shift+G): clicking any member selects the whole group, and align/distribute move a group as one block. Plots and blocks are moved by rotate/flip but not rotated themselves.
- **Layers panel** (under the properties panel, top first): click a row to select it, Shift-click for a range, Ctrl/⌘-click to add or remove. Drag rows to restack them; drop onto an open group to put a shape in it, or out of it to take it out. Groups fold open and closed. Each row has an eye (hide: not drawn or exported) and a lock (shown on canvas but can't be picked). Double-click a name to rename it; renaming a group renames the whole group. Hovering a row outlines it on the canvas. The footer groups, ungroups and deletes; right-click a row for Rename, Hide/Show, Lock/Unlock and the usual menu. Click the header to fold the panel away.

### Electrical circuits (circuitikz)
- **Electrical → Circuit…** (or **Blocks → Circuit**) adds a circuit block; double-click it (or press Enter) to open the circuit editor in an overlay, so the tool rail stays uncluttered.
- **Parts:** 266 `circuitikz` components in searchable categories. Click a part and click the grid (it lands where the blue preview shows it), or drag it in; drag from start to end to set a two-terminal part's length.
- **Wires** (`W`) snap to part pins and stay attached when parts move. Nodes such as transistors, op-amps and ICs are auto-named (`Q1`, `U1`…), so wires export as `(Q1.B)`.
- **Properties:** label, annotation, voltage and current arrows, open/closed ends (`*-o`), rotation, mirroring (X left to right, Y top to bottom, from the right-click menu or the keys) and extra options. Labels take maths: `$R_1$`, `$10\,\mathrm{k\Omega}$`. Double-click a part to edit its label (a node's text) in place, in LaTeX or MathLive as set under Text input. A part is picked by clicking anywhere on its body, not only on its lines.
- **Code, side by side:** the `circuitikz` source sits on the right of the editor and follows the drawing as you work. Type in it and the drawing follows after a short pause; lines the editor can't draw are kept and exported as written.
- **Saving:** Done (⌘/Ctrl+Enter) writes the circuit back and closes; ⌘/Ctrl+S writes it back and keeps the editor open, so Esc afterwards closes without asking. This applies to the quantum editor too.
- Export: the circuit goes into the picture as a `scope` and the preamble gets `\usepackage{circuitikz}`. **Copy circuitikz Code** in the panel gives a standalone `circuitikz` environment.

### Quantum circuits (quantikz)
- **Blocks → Quantum** adds a circuit. Double-click it, press Enter or use **Edit Circuit…** in the panel to open the quantum circuit editor.
- **Editor:** the circuit sits on a grid of cells (wires × steps). Drag an element from the palette onto a cell, or click it to place it in the selected cell. Keys place the common ones and step right: `H X Y Z S T U`, `C` control, `O` open control, `+` target, `M` meter. Drop on the dashed row or column to add a wire or a step. Right-click a cell (or a selected range) to insert wires above or below, insert steps before or after, delete wires or steps, or clear cells.
- Controls link to the nearest gate or target in their step; drag the blue handle to link another wire. Drag a cell to move it (Alt copies), Shift-click or drag to select a range, ⌘C/⌘V copy and paste cells. The panel edits labels, spans, links, wire types, slices and groups; inserting or deleting wires and steps keeps links and spans pointing at the same wires. A selected gate has a handle on its corner: drag it, or type in **Min width** / **Min height**, to set the gate's minimum size (`\gate[][width][height]{…}`, which widens its column as in quantikz). Drag the handle back to the gate's own size, or up or left, and it goes back to auto. Drag the bar on a gate's top or bottom edge to stretch it up or down over neighbouring wires (`\gate[n]`); it stops at the first wire that already has something in that step. Double-click a gate (or any element with a label, such as a stick or a meter) to edit its label in place, in LaTeX or MathLive as set under Text input.
- The `quantikz` code is live on the right, both ways. Cells you didn't touch keep the code you wrote, and commands the editor doesn't draw are kept as written. It is exported inside `\begin{quantikz}` with `\usetikzlibrary{quantikz2}`.
- The canvas draws an approximation of quantikz's layout: gates, controls and targets, swaps, meters, wire labels (`\lstick`, `\rstick`), slices, gate groups, bundles and classical wires.
- Maths inside gate arguments and `$…$` in labels is highlighted green, and typing `\` suggests quantikz commands as well as LaTeX ones.

### ZX diagrams (zx-calculus)
- **Blocks → ZX** adds a diagram. Double-click it, press Enter or use **Edit ZX…** in the panel to open the ZX editor.
- **Editor:** the diagram sits on a grid of cells. Drag a spider, Hadamard box, point, loop or text from the palette onto a cell, or select a cell and type `Z`, `X`, `H`, `N` (point) or `L` (loop). Drop on the dashed row or column to grow the diagram. Right-click a cell to insert or delete rows and columns, add a loop or clear it; right-click a wire to delete it.
- **Wires:** hover or select a node and drag the blue handle on its right to another cell (an empty end gets a `\zxN{}` point). Click a wire to choose its shape from pictures (straight, the package's `o` / `s` / `C` curves and more), put an H, Z or X marker on it, or make it classical, bold or dashed.
- **Nodes:** the panel sets a spider's colour, phase (plain or a fraction, with its sign), where the phase goes (in the node or in a label beside it), the gap before its column, and lists the wires leaving it. Double-click a spider or press Enter to type its phase.
- The `zx-calculus` code is live on the right, both ways; cells you didn't touch keep the code you wrote. It is exported inside `\begin{ZX}` with `\usepackage{zx-calculus}`, and **Import LaTeX/TikZ** turns a `ZX` environment back into a diagram.

### Commutative diagrams (tikz-cd)
- **Blocks → CD** adds a diagram. Double-click it, press Enter or use **Edit Diagram…** in the panel to open the CD editor. Older XyMatrix shapes open as CD blocks.
- **Editor:** the diagram sits on a grid of cells. Select a cell and type to write its object, or drop one from the palette (A, 0, ℤ, A ⊕ B, Hom(A, B), …). Drag from one cell to another to draw an arrow in the style picked in the palette (arrow, maps to, inclusion, onto, into, dashed, implies, equal, both ways, line, harpoon, squiggly). Drag a cell to move it (Alt copies); right-click for rows and columns.
- **Arrows:** the panel sets the label (Side and At apply once it has one), the head (pictures), the line (solid, dashed, dotted, squiggly), a crossing gap, bend and shift, each on its own so none undoes another, and shows the arrow's options as written; **Reverse** swaps its ends. Picking Dashed or Squiggly in the palette changes only the line.
- The `tikz-cd` code is live on the right, both ways; cells you didn't touch keep the code you wrote. The canvas sizes cells as tikz-cd does. It is exported inside `\begin{tikzcd}` with `\usepackage{tikz-cd}` (and `decorations.pathmorphing` for squiggly arrows).

### Bloch spheres (blochsphere)
- **Blocks → Bloch** adds a sphere. Its `blochsphere` code is the object: the canvas draws it with the package's projection, circles, shaded ball and state vectors.
- **Panel:** radius; **Tilt** and **Rotation** sliders (click the degree value to type one); the ball as Shaded, Outline or None; **Colours** for the ball, lines (grid and axes), states and labels, written as the package's own `color`, `style`, `statecolor` and each label's `\node` colour (named xcolor colours, since the package does not take hex); and a **States** table with each state's label (maths), θ and φ, a bin to delete it and **Add State**. The code below is editable too; commands the panel doesn't cover are kept as written.
- Exported with `\usepackage{blochsphere}`.

### Three kinds of file
- The top bar's main switch is **Classic | Page | Whiteboard**.
- **Page** files: one free-form sheet, described below.
- **Whiteboard** files: one endless canvas with no page and no edges. Draw anywhere; scroll (two fingers on a trackpad) to move around, pinch or Ctrl/⌘+scroll to zoom from 3% to 800%, and use the **Hand** tool (`H`) or Space-drag to grab the board. A dot grid replaces the lines and rulers and stays evenly spaced at any zoom. **Fit** brings everything into view. Export, TikZ code and import work as for a Classic diagram, sized to what you drew; files save as `.board.json`.
- **Classic** files: diagrams, plus a document view that arranges them with text, as in Mathcha. While Classic is selected, a second switch, **Diagram | Document**, appears beside it.
- Choosing Page, Classic or Whiteboard opens the last file of that kind, or starts a new one. The sidebar lists only files of the current kind, and **New** makes a file of that kind.
- The properties panel floats over the top right of the canvas: click its heading to fold it up, and again to open it. The button at the left end of the top bar folds the file list away.
- **Save** (Ctrl+Shift+S) downloads a `.json` file that records its kind (`"kind": "page"` or `"classic"`; Page files are named `*.page.json`). **Open** (Ctrl+O) loads it back into the right mode. Older `.json` files open as Classic.
- Older browser-stored files that held both kinds of content are split into two files the first time the app loads.

### Page mode
- **Page** is a free-form sheet of paper: place text, maths, shapes, plots and images anywhere on it, in one step. It is the thing Mathcha doesn't have.
  - The paper size, orientation and margins come from the page setup (shared with Document view). Margins are blue dashed guides; page corners, margins and centre lines are snap points.
  - **Multiple pages** stack down the canvas; anything outside the paper is dimmed.
  - With nothing selected, the right panel lists every page with a thumbnail and its object count. Click a page to jump to it. Each page can be moved up or down, duplicated or deleted, and you can insert a blank page after it. **+ Add page** adds one at the end (up to 50).
  - An object belongs to the page under its centre, so moving, duplicating or deleting a page takes its objects with it. All page actions can be undone.
  - The status bar shows **Page k / n**, with ‹ › buttons and **+ Page** (inserts after the current page). PgUp / PgDn also move between pages.
  - Rulers measure from the paper's top-left corner.
- **LaTeX / TikZ export** writes a complete `article`: one `tikzpicture[remember picture, overlay]` per page anchored at `current page.north west`, so every object keeps its exact position. Compile twice.
- **Export** (see below) saves each page as PNG, SVG or PDF, and **Print / PDF** prints each page at true size.

### Documents
- Each file is a **document** made of text blocks and diagram blocks. Use **Diagram / Document** in the top bar to switch views.
  - Text blocks support `# Heading`, `$inline$` and `$$display$$` math, `\textbf{}` and `\emph{}`.
  - Double-click a diagram block, or press **Edit**, to open it on the canvas. In diagram view, a selector picks between diagrams.
- **Page setup** (right panel in document view): paper (A4, A5, B5, US Letter, US Legal, custom), orientation, margins, font size (10/11/12 pt) and whether to show a title. The page preview is true to scale and marks approximate page breaks; you can fit it to the width or view at 100%.
  - Diagrams wider than the text width are scaled down, both in the preview and in the export (`\resizebox{\linewidth}{!}{…}`).
- Documents are autosaved in the browser (IndexedDB). The top bar has one-click buttons:
  - new, open (Ctrl+O, `.json` / `.tex`), save file (Ctrl+Shift+S), import LaTeX/TikZ
  - print / PDF (Ctrl+P), **Export** (PNG / SVG / PDF), **TikZ** (Ctrl+E), **LaTeX** (Ctrl+Shift+E), HTML
- The ◧ button at the far left hides the document list.

### Export and import
- **Export** button (top bar, Page and Classic diagram views) opens a small menu:
  - **PNG** at a chosen DPI (72, 96, 150, 300, 600 or any value from 24 to 2400). The DPI is written into the file, so it opens at true size. A transparent background is available for Classic diagrams.
  - **SVG**: vector, with the maths stylesheet included.
  - **PDF**: one page per Page-mode sheet (true paper size), or the diagram's size in Classic. The pages are pictures at the chosen DPI; for a vector PDF, use Print → Save as PDF, or compile the LaTeX.
  - The menu shows the output size in px and cm, and remembers your choices.
- **Export TikZ** (Ctrl/⌘+E): a `tikzpicture` snippet or a `standalone` document, for everything or only the selection. The header comment lists the needed packages and libraries (`pgfplots`, `arrows.meta`, …).
- **Export LaTeX:** writes the whole document as an `article` with `geometry` page settings, and each diagram in a `tikzpicture`. Each picture carries a `% diagramtex-data:` comment, so files this app exports re-import exactly, plots included.
- **Import LaTeX/TikZ:** paste code or open a `.tex` file.
  - Transforms: `rotate`, `rotate around`, `shift`, `xshift`, `yshift` on paths, nodes and (nested) scopes; `transform shape` decides whether text in a rotated scope turns too. `even odd rule` paths with several parts become a Region with holes.
  - Supported: `\draw`, `\fill`, `\filldraw`, `\node`, `\coordinate`.
  - Path operations: `--`, `..controls..`, `|-`, `rectangle`, `circle`, `ellipse`, `arc`, `to[bend]`, `grid`, inline nodes.
  - Options: colours (including `red!50`), widths, dashes, arrows, `scale`, and polar and relative coordinates.
  - Document text becomes text blocks, and `\documentclass` / `geometry` options become the page setup.
  - Hand-written `axis` and `tikzcd` environments are skipped, with a warning.

## Privacy

DiagramTeX is privacy-focused by design:

- **Your work never leaves your device.** Documents, settings and the clipboard live in your browser's storage. There is no server-side storage, so there is nothing to upload, sync or leak.
- **No account.** No sign-up, login, email or payment, ever.
- **No tracking.** No analytics, telemetry, cookies, ads or third-party scripts. The app, its maths engines (KaTeX, Temml, MathLive) and fonts are served from the same site, and after the first visit the app runs fully offline.
- **Files stay yours.** Save, Open, Import and Export work on files on your own computer. One thing to know: a standalone SVG or HTML export links the maths fonts from the jsDelivr CDN so it displays correctly anywhere; the TikZ and LaTeX code you copy contains no links at all.
- **Open source.** Every line is in this repository ([MIT License](LICENSE)), and you can self-host it as plain static files.

## Coordinates

1 cm in TikZ is 40 px on the canvas. The y axis is flipped: canvas y points down, TikZ y points up. The faint cross on the canvas marks the TikZ origin.

## FAQ

**Is DiagramTeX free?**
Yes. It is free and open source, with no paid tier, account or login.

**Does it work offline?**
Yes. It is a progressive web app: after the first visit it works without a connection, and you can install it like a desktop app.

**Does it work on phones and tablets?**
Tablets, yes, including a phone opened flat or turned sideways. A phone held upright shows a notice asking you to continue on a bigger screen: the editor needs the room.

**How large can a drawing get?**
Tens of thousands of objects. Only what is near the view is drawn, so panning, zooming and editing stay smooth at 20,000 objects; showing all of them at once when zoomed right out is slower. Dragging a large selection slides it as one piece and moves the objects once when you let go, and undo keeps only what each step changed. Files are kept in IndexedDB, which holds far more than the few megabytes of local storage; if the browser still runs out of room, autosave says so: use **Save** to keep the file.

**Where are my diagrams stored?**
In your browser: files in IndexedDB, settings in local storage. Files saved by older versions move to IndexedDB the first time the app opens. Nothing is sent to a server. Use **Save** to keep a `.json` copy as a file.

**Can I use the output in Overleaf?**
Yes. Open the TikZ code (Ctrl/⌘+E), copy it and paste it into your Overleaf project. The comment at the top lists the packages and TikZ libraries to load.

**Can I edit TikZ code I already have?**
Yes, for most `\draw`, `\fill`, `\node` and `\coordinate` paths: use **Import LaTeX/TikZ** and paste the code or open the `.tex` file. Files exported by DiagramTeX re-import exactly, plots included.

**Which LaTeX packages does the output need?**
TikZ, plus `circuitikz` for circuits, `pgfplots` for plots, `tikz-cd` for commutative diagrams, the `quantikz2` TikZ library for quantum circuits, `forest` for trees, `zx-calculus` for ZX diagrams and `blochsphere` for Bloch spheres. The export lists what each figure needs.

## Project structure

- `public/js/shapes.js`: basic shape types (geometry, handles, SVG, TikZ), colours, fonts, preamble
- `public/js/fills.js`: gradient and pattern fills (SVG defs, TikZ shadings and patterns, picker tabs), dash and width presets
- `public/js/colorpicker.js`: colour picker popover (Basic / Gradient / Pattern tabs)
- `public/js/symbols.js`: symbol library (141 shapes as one box-based `sym` type), image objects
- `public/js/boolean.js`: Combine (shape booleans): outlines, edge splitting and the region builder
- `public/js/rotate.js`: free rotation (the `angle` property, rotated handles, `TD.rotateShape`)
- `public/js/quantum.js`: quantum circuits: quantikz parser, canvas drawing and export
- `public/js/circuit.js`: the circuit block (`cz` type): item model, canvas drawing, circuitikz export and parser
- `public/js/czeditor.js`: the overlay circuit editor (palette, drag-and-drop stage, properties and live code)
- `public/js/qceditor.js`: the overlay quantum circuit editor (palette, cell grid, properties and live quantikz code)
- `public/js/zx.js`: ZX diagrams: zx-calculus parser, layout, canvas drawing and export
- `public/js/zxeditor.js`: the overlay ZX editor (palette, cell grid, wire handles and shapes, live zx-calculus code)
- `public/js/tooltip.js`: the app's own tooltips (every `title` becomes a styled `data-tip`)
- `public/js/czcore.js`: circuitikz part registry and drawing API; parts live in `czparts-wires.js`, `czparts-passive.js`, `czparts-semi.js`, `czparts-sources.js`, `czparts-switch.js` and `czparts-blocks.js`
- `public/js/texhighlight.js`: maths highlighting in the LaTeX text fields
- `public/js/mathinput.js`: the canvas text editor's LaTeX and MathLive input modes
- `public/js/dialog.js`, `public/js/selectmenu.js`: in-app dialogs and dropdown menus
- `public/js/texcomplete.js`: LaTeX command suggestions while typing
- `public/js/texcommands.js`: every command KaTeX and Temml support, with its number of arguments. It is generated, so do not edit it; rebuild with `node scripts/gen-texcommands.js` after updating either engine.
- `public/js/mathengine.js`: the maths renderer (`TD.math.render`), switching between KaTeX and Temml
- `public/js/plots.js`: expression parser, 2D/3D plot and pie rendering, pgfplots export
- `public/js/cd.js`: commutative diagrams: tikz-cd parser, layout, canvas drawing and export
- `public/js/cdeditor.js`: the overlay CD editor (palette, cell grid, arrows, live tikz-cd code)
- `public/js/bloch.js`: Bloch spheres: blochsphere parser, canvas drawing, panel and export
- `public/js/segthumb.js`: the sliding knob of segmented switches
- `public/js/tikzimport.js`: LaTeX/TikZ importer
- `public/js/storage.js`: files and the file list in IndexedDB (read into memory at start, written in the background, shared between tabs)
- `public/js/app.js`: editor state, interaction, history, properties panel, storage, menu, export
- `public/js/docview.js`: document view and whole-document LaTeX export
- `public/css/style.css`, `public/index.html`: UI
- `public/fonts/`: Inter Display, the UI typeface (SIL Open Font License, `Inter-LICENSE.txt`)
- `public/sw.js`, `public/manifest.webmanifest`: offline cache and install manifest
- `design/logo/`: logo kit and usage guide
- `wrangler.toml`: Cloudflare Workers deployment (builds and serves `dist/`)
- `scripts/build.js`: copies `public/` to `dist/`, minifying JS and CSS (run by wrangler before deploy)
- `scripts/gen-texcommands.js`: regenerates `public/js/texcommands.js`
- `scripts/cz-sheet.js`: draws every circuitikz part with its pins on one SVG sheet, for checking part drawings by eye
- `.interface-design/system.md`: design direction, tokens and measurements for the UI ("drafting table")
- `public/vendor/katex/`: KaTeX 0.19.1 (MIT license, `.woff2` fonts only)
- `public/vendor/mathlive/`: MathLive, for the canvas editor's interactive maths input mode
- `public/vendor/temml/`: Temml 0.14.0 (MIT license): `temml.min.js`, `Temml-Latin-Modern.css`, `Temml.woff2`, and `latinmodernmath.woff2` (Latin Modern Math, GUST font license; taken from the Temml repository because the npm package does not include it)

## Contributing

Bug reports and ideas are welcome in the [issue tracker](https://gitlab.com/igniting-space/diagramtex/-/issues). If `pdflatex` reports a problem with exported code, please include the code and the error.

## License

DiagramTeX is released under the [MIT License](LICENSE). © 2026 Vivatsathorn Thitasirivit.

It bundles KaTeX (MIT), Temml (MIT), MathLive (MIT), the Latin Modern Math font (GUST Font License) and Inter Display (SIL Open Font License); see their licence files in `public/vendor/` and `public/fonts/`.

