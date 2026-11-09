# DiagramTeX

A browser-based diagram and document editor in the spirit of Mathcha. You draw with the mouse, type labels with `$…$` LaTeX math, and export clean **TikZ / pgfplots / LaTeX**. It is plain HTML/CSS/JS with no build step.

## Run

The site lives in `public/`; serve that folder. Everything is local: KaTeX 0.19.1 lives in `public/vendor/katex` and Temml 0.14.0 in `public/vendor/temml`, so no CDN is needed and it works offline. Opening `public/index.html` directly also works in most browsers.

```bash
python3 -m http.server 5173 --directory public
```

Then open http://localhost:5173.

## Deploy (Cloudflare Workers)

`wrangler.toml` publishes `public/` as a static-assets-only Worker (no server code, no build step):

```bash
npx wrangler deploy
```

`npx wrangler dev` previews it locally first.

## Features

### Drawing
- **Tool rail** (Mathcha-style; buttons with a small corner triangle open a flyout):
  - select, maths (`M`, a text object that starts in `$…$`), text (`T`)
  - **Lines:** line, curve, arrow, curved arrow, polyline, smooth closed blob, arc (angle mark), spring
  - **Shapes:** rectangle variants (rounded, snipped), 33 basic shapes and 28 flowchart symbols
  - **Misc:** axes, wave, brace, ruler, grid and more, ball, dot, plus 35 electrical symbols (resistor, capacitor, inductor, sources, diode, transistor, logic gates, ground…)
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
  - **XyMatrix / commutative diagram:** cells use `&` and `\\`. To add an arrow, drag from the orange dot under one cell onto another cell. Each arrow has a label, side, style (→, ↠, ↪, ↦, dashed, =, ↔) and bend. **Copy as tikz-cd** is also available.
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
- **Groups** (Ctrl+G, Ctrl+Shift+G): clicking any member selects the whole group, and align/distribute move a group as one block. Plots and XyMatrix are moved by rotate/flip but not rotated themselves.

### Two kinds of file
- The top bar's main switch is **Page | Classic**.
- **Page** files: one free-form sheet, described below.
- **Classic** files: diagrams, plus a document view that arranges them with text, as in Mathcha. While Classic is selected, a second switch, **Diagram | Document**, appears beside it.
- Choosing Page or Classic opens the last file of that kind, or starts a new one. The sidebar lists only files of the current kind, and **New** makes a file of that kind.
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
- Documents are autosaved in localStorage. The top bar has one-click buttons:
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
- **Export LaTeX:** writes the whole document as an `article` with `geometry` page settings, and each diagram in a `tikzpicture`. Each picture carries a `% texdiagram-data:` comment, so files this app exports re-import exactly, plots included.
- **Import LaTeX/TikZ:** paste code or open a `.tex` file.
  - Transforms: `rotate`, `rotate around`, `shift`, `xshift`, `yshift` on paths, nodes and (nested) scopes; `transform shape` decides whether text in a rotated scope turns too. `even odd rule` paths with several parts become a Region with holes.
  - Supported: `\draw`, `\fill`, `\filldraw`, `\node`, `\coordinate`.
  - Path operations: `--`, `..controls..`, `|-`, `rectangle`, `circle`, `ellipse`, `arc`, `to[bend]`, `grid`, inline nodes.
  - Options: colours (including `red!50`), widths, dashes, arrows, `scale`, and polar and relative coordinates.
  - Document text becomes text blocks, and `\documentclass` / `geometry` options become the page setup.
  - Hand-written `axis` and `tikzcd` environments are skipped, with a warning.

## Coordinates

1 cm in TikZ is 40 px on the canvas. The y axis is flipped: canvas y points down, TikZ y points up. The faint cross on the canvas marks the TikZ origin.

## Files

- `public/js/shapes.js`: basic shape types (geometry, handles, SVG, TikZ), colours, fonts, preamble
- `public/js/fills.js`: gradient and pattern fills (SVG defs, TikZ shadings and patterns, picker tabs), dash and width presets
- `public/js/colorpicker.js`: colour picker popover (Basic / Gradient / Pattern tabs)
- `public/js/symbols.js`: symbol library (141 shapes as one box-based `sym` type), image objects
- `public/js/boolean.js`: Combine (shape booleans): outlines, edge splitting and the region builder
- `public/js/rotate.js`: free rotation (the `angle` property, rotated handles, `TD.rotateShape`)
- `public/js/texcomplete.js`: LaTeX command suggestions while typing
- `public/js/texcommands.js`: every command KaTeX and Temml support, with its number of arguments. It is generated, so do not edit it; rebuild with `node scripts/gen-texcommands.js` after updating either engine.
- `public/js/mathengine.js`: the maths renderer (`TD.math.render`), switching between KaTeX and Temml
- `public/js/plots.js`: expression parser, 2D/3D plot and pie rendering, pgfplots export
- `public/js/cd.js`: XyMatrix / commutative diagrams, tikz-cd export
- `public/js/tikzimport.js`: LaTeX/TikZ importer
- `public/js/app.js`: editor state, interaction, history, properties panel, storage, menu, export
- `public/js/docview.js`: document view and whole-document LaTeX export
- `public/css/style.css`, `public/index.html`: UI
- `wrangler.toml`: Cloudflare Workers deployment (serves `public/`)
- `scripts/gen-texcommands.js`: regenerates `public/js/texcommands.js`
- `.interface-design/system.md`: design direction, tokens and measurements for the UI ("drafting table")
- `public/vendor/katex/`: KaTeX 0.19.1 (MIT license, `.woff2` fonts only)
- `public/vendor/temml/`: Temml 0.14.0 (MIT license): `temml.min.js`, `Temml-Latin-Modern.css`, `Temml.woff2`, and `latinmodernmath.woff2` (Latin Modern Math, GUST font license; taken from the Temml repository because the npm package does not include it)

The LaTeX output has not been compiled here, because no TeX installation was available. If `pdflatex` reports a problem, please file it.
