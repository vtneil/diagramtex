# How closely LaTeX matches the canvas

You draw in DiagramTeX, copy the code, paste it into Overleaf or your own `.tex` file and compile. This page
answers how close the result comes to what you saw, with measured numbers, side-by-side samples, and the
differences that are still there.

**In short:** across 48 test figures, **99.4 % of the ink lands within 0.5 mm** of where the canvas drew it
(median 99.9 %), and **99.9 % lands within 1 mm**. Every figure type scores at least 97 % within 0.5 mm.
Shapes, arrows, symbols, plots, 3D figures and every block (quantum circuits, trees, commutative diagrams,
circuits, automata, timing diagrams, Karnaugh maps, chemistry, UML class and sequence diagrams, 2D geometry,
bit fields, physics) are drawn in the same places. What is left is mostly the font: the canvas draws letters
a little heavier than pdflatex does.

The test setup, per-commit fixes and every image are in [docs/latex-parity/](docs/latex-parity/README.md).

## How it was measured

1. Each test figure is exported with the same code the **Code** dialog and `.tex` export produce (standalone).
   It is compiled with **pdflatex** (TeX Live 2026, pgf 3.1, pgfplots 1.18) and rasterised by Ghostscript at
   100 px per cm.
2. The app's own PNG export of the same shapes is made at the same scale.
3. Both are cropped to two registration dots placed at the figure's corners, so they share one frame.
4. **Match score**: the share of all inked pixels, from both pictures, that have ink from the other picture
   within a given distance. 100 % means every line, letter and fill drawn by one is also drawn by the other,
   within that tolerance.

The 0.2 mm column is close to an exact pixel overlap, so anti-aliasing and the heavier canvas font pull it
down (text-heavy figures score lowest there). **Read the 0.5 mm column** as "looks the same on paper" and the
1 mm column as "same layout, maybe nudged".

Measured on DiagramTeX 1.40.0 with the fixes described below. 168 figures were run in all; the tables show the
scored ones.

## Scores

| Figure type | Test figures | ≤ 0.2 mm | ≤ 0.5 mm | ≤ 1 mm | ≤ 0.5 mm in 1.22.0 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Lines, arrow tips, dashes, ticked shafts | 5 | 99.4 % | 99.9 % | 100 % | 99.8 % |
| Shapes, fills, translucent shapes | 2 | 97.3 % | 98.9 % | 100 % | 98.9 % |
| Text and maths labels | 2 | 87.6 % | 98.9 % | 100 % | 98.9 % |
| Symbol library (basic, electrical, flowchart, physics) | 4 | 99.8 % | 100 % | 100 % | 100 % |
| Pie chart | 1 | 99.1 % | 99.9 % | 100 % | 99.9 % |
| 2D plots: function, line, scatter, area, bar, contour, heatmap | 7 | 99.0 % | 99.7 % | 99.9 % | 99.7 % |
| 3D plots: function, surface, mesh, parametric, curve, scatter | 6 | 97.7 % | 99.3 % | 99.8 % | 99.3 % |
| 3D solids and revolve | 4 | 99.5 % | 99.7 % | 99.8 % | 99.8 % |
| Quantum circuit (quantikz) | blk_qc | 99.2 % | 100 % | 100 % | 100 % |
| Tree (forest) | blk_forest | 91.7 % | 100 % | 100 % | 100 % |
| Commutative diagram (tikz-cd) | blk_cd | 98.2 % | 100 % | 100 % | 100 % |
| Karnaugh map | blk_kmap | 99.5 % | 100 % | 100 % | 100 % |
| Timing diagram (tikz-timing) | blk_timing | 99.1 % | 99.8 % | 100 % | 99.8 % |
| Automaton | blk_automata | 99.4 % | 100 % | 100 % | 100 % |
| Circuit (circuitikz) | blk_cz | 93.9 % | 98.4 % | 100 % | 98.4 % |
| Chemistry (chemfig) | blk_chem | 91.2 % | 100 % | 100 % | 100 % |
| ZX calculus | blk_zx | 100 % | 100 % | 100 % | 100 % |
| Bloch sphere | blk_bloch | 94.1 % | 97.7 % | 99.2 % | 97.7 % |
| Feynman diagram | blk_feynman | 90.9 % | 97.4 % | 100 % | 97.4 % |
| 3D geometry (tikz-3dplot) | blk_geo3d | 89.5 % | 97.0 % | 100 % | 97.0 % |
| UML class diagram (pgf-umlcd) | blk_uml | 94.5 % | 98.0 % | 99.9 % | |
| UML sequence diagram (pgf-umlsd) | blk_umlsd | 96.7 % | 100 % | 100 % | |
| 2D geometry | blk_geo2d | 85.7 % | 97.4 % | 100 % | |
| Pictures (PNG, JPEG, SVG via `\includesvg`, rotated and translucent) | 4 | 100 % | 100 % | 100 % | |
| Bit field (bytefield) | blk_bytefield | 95.0 % | 99.9 % | 100 % | |
| Physics diagram | blk_physics | 98.6 % | 99.8 % | 100 % | |
| **All 48 figures** (mean / median) | | 97.1 / 99.0 % | **99.4 / 99.9 %** | 99.9 / 100 % | |

Rows with several figures show the mean. The last column is the previous round (1.22.0); blank rows are
blocks added since. On the 43 figures scored both times the 0.5 mm mean is unchanged at 99.5 %: nothing
drifted, and the two figures that had (below) are fixed. The 3D sketch tool was removed in 1.33, so that row
lost its two sketch figures.

### Repeat run (16 November 2026: SVG optimisation and Scale)

I re-ran 43 of the named canvas/LaTeX scenes against the current source build, compiling every export with
`pdflatex` and scoring the app/LaTeX composites with `tools/match.py`. This is a repeat sample rather than a
replacement for the 48-figure measurement above: it does not include the four picture fixtures or every
targeted edge-case scene. The scores below use the same ink-distance method; 5 px is 0.5 mm at 100 px/cm.

| Repeat sample | Figures | ≤ 0.2 mm (mean) | ≤ 0.5 mm (mean / median) | ≤ 1 mm (lowest) |
| --- | ---: | ---: | ---: | ---: |
| Baseline scenes | 43 | 77.5 % | 99.4 / 99.8 % | 98.4 % |

At 0.5 mm, 40 of the 43 scenes scored at least 98 %. The three below that mark were the Karnaugh map
(96.0 %), shapes (97.8 %) and Bloch sphere (97.7 %). The 0.2 mm mean is especially sensitive to font weight
and rasterisation; the 0.5 mm and 1 mm columns are more useful for judging visible placement.

I also added `objectScale = 1.5` to one shape scene and one quantum-circuit scene, then compiled and scored
those exports separately. Both emitted TikZ `scale around` scopes and compiled successfully:

| Scale probe | ≤ 0.2 mm | ≤ 0.5 mm | ≤ 1 mm |
| --- | ---: | ---: | ---: |
| Scaled shape | 91.4 % | 99.4 % | 100 % |
| Scaled quantum circuit | 89.8 % | 100 % | 100 % |

The run images, `.tex` files and composites are in `/tmp/texdiagram-latex-parity-HqZ7yb` on the machine that
ran the test. These probes cover representative scaling; they do not establish parity for every scalable
object type.

Harder cases, scored separately (0.5 mm / 1 mm):

| Case | ≤ 0.5 mm | ≤ 1 mm |
| --- | ---: | ---: |
| Quantum: gate over several wires | 99.9 % | 100 % |
| Quantum: gate groups with labels | 98.0 % | 100 % |
| tikz-cd: tall and deep cells (∏, ∑) | 100 % | 100 % |
| xymatrix: the default square (blk_xy) | 99.3 % | 100 % |
| xymatrix: exact sequences over two rows | 99.4 % | 100 % |
| xymatrix: curves, shifts, hooks, `\|` labels | 100 % | 100 % |
| xymatrix: tips (`->>`, `>->`, `=>`, `\|->`, `=`) | 100 % | 100 % |
| xymatrix: mixed styles with `@C=3pc` | 99.7 % | 100 % |
| xymatrix: turning arrow (`` `[ul] `[l] ``…) | 89.3 % | 98.2 % |
| tikz-cd: custom `to path` with rounded corners | 87.6 % | 98.0 % |
| tikz-cd: `from=` arrows, `bend`, `crossing over` | 100 % | 100 % |
| tikz-cd: trailing `\\` before `\end{tikzcd}` | 100 % | 100 % |
| forest: probability tree (per-node `grow`) | 100 % | 100 % |
| forest: syntax tree with roofs | 100 % | 100 % |
| forest: org chart (forked edges) | 97.1 % | 100 % |
| forest: folder tree | 87.6 % | 99.1 % |
| circuitikz: voltage arrows (`v=`) | 100 % | 100 % |
| circuitikz: labels and currents on one part | 96.9 % | 99.8 % |
| circuitikz: `v^= v<= v^<=` (curved, above and backward) | 100 % | 100 % |
| circuitikz: straight voltages | 100 % | 100 % |
| circuitikz: American voltages (`+`/`−`) | 100 % | 100 % |
| circuitikz: raised voltages | 100 % | 100 % |
| circuitikz: `\ctikzset{voltage=american}` for the circuit | 100 % | 100 % |
| circuitikz: voltages on sources (generator arrow, `+`/`−`, `v_<=`) | 100 % | 100 % |
| circuitikz: current directions (`i< i>_ i_< i<^`, on a source) | 100 % | 100 % |
| circuitikz: part colour (`color=red`, `blue!70!black`) | 100 % | 100 % |
| circuitikz: `++`, `+`, `-\|`, `\|-`, `\coordinate` | 100 % | 100 % |
| circuitikz: amplifiers (`en amp`, `fd op amp`, `inst amp`, `plain amp`, `buffer`…) | 100 % | 100 % |
| circuitikz: IEEE logic ports, transmission gates, `notcirc` | 100 % | 100 % |
| circuitikz: depletion MOS and FET variants (`nmosd`, `nfetd`, `nigfetebulk`…) | 100 % | 100 % |
| circuitikz: sources (`dcvsource`, `voosource`, controlled sinusoidal…), `rmeter`, `tlmic` | 100 % | 100 % |
| circuitikz: American and European inductors, sensors; `generic`, `thermistor` | 100 % | 100 % |
| circuitikz: empty, full and stroke diodes, thyristors, triacs (33 parts) | 100 % | 100 % |
| circuitikz: crossings, arrows, poles, multiwires, IEC connectors, grounds | 100 % | 100 % |
| circuitikz: cute switches and SPDTs, `ncs`/`onos`…, `proximeter` node | 100 % | 100 % |
| circuitikz: tubes (diode to pentode, magnetron, dynode) | 100 % | 100 % |
| circuitikz: antennas (clipped waves), `harmonics`, mixers, splitters, couplers | 100 % | 100 % |
| chemfig: submolecules, Cram bonds, `cram width` (disaccharide) | 100 % | 100 % |
| chemfig: `\chemmove` curve, lone pairs, `@{db,.5}`, anchored arrow | 99.9 % | 100 % |
| chemfig: nitro resonance, two `\chemmove` curves | 99.9 % | 100 % |
| chemfig: `\hreac`, submols with arguments, `!0`, `\|`, fixed length | 100 % | 100 % |
| chemfig: text between molecules (`\quad or \quad`) | 87.4 % | 100 % |
| circuitikz: ground and supply nodes with labels | 99.1 % | 99.7 % |
| circuitikz: a node with text beside the circuit | 94.1 % | 99.3 % |
| pgf-umlsd: threads, `sdblock`, shaded instances | 99.9 % | 100 % |
| pgf-umlsd: `sdblock` with a comment | 100 % | 100 % |
| pgf-umlsd: `\setthreadbias` | 100 % | 100 % |
| pgf-umlsd: messages with a delay | 100 % | 100 % |
| pgf-umlsd: `callself`, `messcall` | 100 % | 100 % |
| pgf-umlsd: rounded and shaded instances, thread colours | 100 % | 100 % |
| Patterns (Lines, Hatch, Grid, Dots, Bricks…) | 75.6 % | 100 % |

## What changed in this round (1.40.0)

- **Sequence diagrams (pgf-umlsd):** the export put the environment in a node with `inner sep=0pt`, which
  carried into the package's own empty nodes: activation bars came out as hairlines, instances moved and
  labels sat low (62 % within 0.5 mm). The node now keeps TikZ's inner sep, and it is placed knowing that
  pgf-umlsd sets four interword spaces before its picture (13.3 pt). Every pgf-umlsd demo now scores
  99.9–100 %.
- **Chemistry `\hreac`:** the line breaks after `\definesubmol` are spaces TeX sets before the reaction. Since
  the scheme rewrite (1.30) the canvas moved the reaction right by them but left them out of its box, so
  the export landed 3.5 mm off (37.9 %, was 100 %). Back to 100 %.
- **Circuits:** a ground, supply or other node part with a label stopped the whole circuit drawing on the
  canvas (and in SVG and PNG export). Fixed; a test now draws every parity figure.
- **UML class diagrams:** a space after a colon (`name : String`) now gets TeX's extra space, as pdflatex sets
  it in running text (97.4 → 98.0 %).

## The previous round (1.22.0)

- **Quantum circuits:** wires, gates and meters now land on LaTeX's (they were about 0.1 cm off). Gate height
  is the text's height plus quantikz's padding, the target circle and meters use TeX's real em, and the
  canvas measures the picture the way TeX does, so the exported figure centres on the same point.
- **Trees:** levels are spaced by forest's own rule (font-size based `l`, then pushed clear by `l sep`),
  node boxes are as tall as their letters rather than a whole line, and nodes sit on their baseline. Trees
  were about 18 % too tall. Each node can now turn its own children (`grow`), linguistics trees use
  `sn edges`, and forked and folder trees follow forest's spacing.
- **Commutative diagrams:** cells hang on their baseline with tikz-cd's spacing, so rows with tall or deep
  maths (∏, ∑, fractions) are spaced as in LaTeX. `hook` and `hook'` now curl to the side tikz-cd draws them
  on (they were swapped).
- **XyMatrix:** a new block, laid out with xy's own spacing, tips and curves. Its export centres on xy's own
  box, which leaves out curved arrows. Turning arrows (`` `ul[l] ``…) take xy's 10pt corners, and `*{}`
  objects are kept. The turns that remain off come from KaTeX setting wide maths slightly wider than TeX.
- **tikz-cd paths:** a style's `to path` (`--`, `|-`, `-|`, shifted anchors, named label points and nodes on
  the path) is drawn with its `rounded corners`; `\tikzset` styles are read; `from=` arrows, written in the
  other cell, now show; and a trailing `\\` leaves the same space below as in LaTeX.
- **Plots:** grid lines are as light as pgfplots', the top tick labels show, axis labels sit where pgfplots
  puts them, 3D plots draw their hidden box edges grey, and surface meshes are as faint as in the PDF.
- **Timing diagrams and Karnaugh maps:** row names, grids and variable names sit where the packages put
  them.
- **Circuits:** voltage arrows (`v=`) are drawn as circuitikz's curved arrow with the label under it,
  current arrows (`i=`) are bigger and in the right place, the `l_=`, `a_=`, `v_=`, `i_=` forms are shown,
  and top labels and node text (ground, supply, transistor) sit where circuitikz puts them.
- **Automata:** labels above an edge sit 0.09 cm lower, as in LaTeX.
- **Arrow tips:** re-derived from `arrows.meta`. Hooks were too big on the canvas (not in LaTeX), Square,
  Diamond, Bar, Bracket and Parenthesis tips now have LaTeX's size, and To, harpoon and reversed tips no
  longer overshoot the end of the line.
- **Curved heads everywhere:** To, its reversed, doubled and barred forms, and tikz-cd's heads are now pgf's
  Computer Modern Rightarrow curve (tikz-cd's `cm to`, its two-heads overlap and `Implies`), and xymatrix's
  `->>`, `>->` and `=>` use xy's own curved heads, so no head is drawn as a straight chevron any more.
- **Ticked shafts** carry their ticks under the arrowhead, as LaTeX does.
- **Bricks** fill exports at the canvas's brick size and line width.
- **Translucent shapes** export as one faded group (`transparency group`), so arrowheads and outlines no
  longer get darker where they overlap the line or fill. Pasting that code back in keeps the opacity.
- **Bloch sphere** arrowheads have pdflatex's size.

## Samples

Each image is three panels: the app, LaTeX, and an overlay. In the overlay, **dark** is drawn by both, **red**
only by the app and **blue** only by LaTeX. A thin red/blue fringe is half-pixel noise or the heavier canvas
font. A doubled shape is a real shift.

**UML sequence diagram: 100 % within 0.5 mm** (pgf-umlsd's threads demo: 99.9 %). Instances, activation bars,
messages and frames coincide.

![pgf-umlsd threads demo, app vs LaTeX](docs/latex-parity/sd_threads.png)

**UML class diagram: 98.0 % within 0.5 mm.** Boxes, compartments and inheritance arrows coincide; member text
ends within about 0.3 mm.

![pgf-umlcd class diagram, app vs LaTeX](docs/latex-parity/blk_uml.png)

**Quantum circuit: 100 % within 0.5 mm** (was 68 % in 1.21.0). Wires, gates and meters coincide.

![Bell circuit, app vs LaTeX](docs/latex-parity/blk_qc.png)

**Tree: 100 % within 0.5 mm.** Levels, edges and labels coincide, including per-node growth. (The basic tree
figure went from 69 % to 100 %.)

![forest probability tree, app vs LaTeX](docs/latex-parity/forest_prob.png)

**Circuit voltage arrow: 100 % within 0.5 mm.** The canvas now draws circuitikz's curved `v=` arrow.

![circuitikz voltage arrow, app vs LaTeX](docs/latex-parity/cz_v1.png)

**Timing diagram: 99.8 % within 0.5 mm** (was 86.5 %).

![Timing diagram, app vs LaTeX](docs/latex-parity/blk_timing.png)

**3D plot: 98.6 % within 0.5 mm** (was 80.7 %). Grey hidden box edges and grid as in pgfplots.

![3D scatter plot, app vs LaTeX](docs/latex-parity/plot_scatter3d.png)

**Arrow tips at 2 pt: 99.7 % within 0.5 mm.** Every tip in the library, thick enough to see its shape.

![Arrow tips at 2pt, app vs LaTeX](docs/latex-parity/tip_w2.png)

**Symbols: 100 % within 0.5 mm.** Every library symbol lands on the same pixels.

![Electrical symbols, app vs LaTeX](docs/latex-parity/sym_elec.png)

**Chemistry: 100 % within 0.5 mm.** Bond angles, double bonds and atom labels coincide.

![chemfig acetic acid and aspirin, app vs LaTeX](docs/latex-parity/blk_chem.png)

## Quirks you may notice

### Everywhere

- **Fonts.** The canvas typesets maths with KaTeX/Temml in Latin Modern-like fonts. LaTeX uses Computer
  Modern, or whatever your preamble loads. Letter shapes are near-identical, but the canvas renders them
  slightly heavier. Character widths can differ by a hair, so a long label may end 0.5–1 mm earlier or later.
  This is now the largest remaining difference.
- **Your preamble wins.** If your document loads another font package (`times`, `libertine`, `fourier`…) or
  changes `\tikzset` defaults, LaTeX follows your document, not the canvas.
- **Packages.** The first lines of every export list what it needs (`% Requires: \usepackage{tikz}
  \usetikzlibrary{...}`). Copy them into your preamble. Older TeX distributions may lack `quantikz2`,
  `tikz-timing`, `chemfig` 1.6 or `zx-calculus`. Update TeX Live, or use Overleaf, which is current.
- **Wrapped text.** A text box with a fixed width breaks lines with LaTeX's own rules. The words per line can
  differ from the canvas in a long paragraph.

### Fills

- **Pattern position.** Lines, Hatch, Dots and Bricks have the same spacing and line width in LaTeX, but
  TikZ lines its pattern tiles up with the page corner, so the stripes or dots can be shifted inside the
  shape (the patterns figure scores 75.6 % within 0.5 mm and 100 % within 1 mm for that reason). The canvas
  can't predict where your page puts the picture.
- **Translucent symbols** (library symbols, balls, dots and text with opacity) still fade fill and outline
  separately in LaTeX, so overlaps look slightly darker.

### Plots (pgfplots)

- **3D plots:** axis-label positions were tuned at the default view (25°/30°). At other view angles a label
  can sit up to about 1 mm from where pgfplots puts it.

### Blocks

- **Quantum circuits (quantikz):** classical double wires show a clearer gap on the canvas. Loading
  `quantikz2` also restyles `tikz-cd` arrows, so put quantum and commutative diagrams in separate documents
  (or separate `standalone` files) if both must look exactly like the canvas.
- **Trees (forest):** folder trees can differ by 1–2 px per row. `tier`, `fit`, `calign` variants and growth
  at angles other than multiples of 90° are approximate on the canvas (LaTeX still applies them).
- **Circuits (circuitikz):** the `v=` arrow's curve was fitted on resistors and capacitors; on other parts it
  is close but not exact. Label offsets were measured at normalsize on level paths, so other sizes and
  slanted parts can be a little off. A part with a label, an
  annotation and a voltage at once doesn't overlap them the way circuitikz does. Op-amp `+`/`−` signs can
  sit slightly apart.
- **Automata:** `bend left` edges can be about 1 mm off, and the loop on accepting states has a slightly
  different shape.
- **Bloch sphere:** the ball shading darkens a little sooner at the upper-left rim.
- **Timing diagrams:** timing options the canvas doesn't model are kept in the code, so LaTeX still applies
  them, but the canvas doesn't preview them.
- **Chemistry:** submolecules (`\definesubmol`), `\chemmove` arrows and other code the canvas can't draw stay
  in the export, so LaTeX draws them even though the canvas doesn't.
- **Feynman diagrams** placed by hand (the editor's vertices) build with pdflatex and match. Automatic layout
  (`\feynmandiagram`, `\diagram*`) needs **LuaLaTeX**, and the canvas doesn't draw it. Give the vertices
  positions to see them on the canvas.
- **Automata and 3D geometry:** extra TikZ in the block source is passed through untouched.

- **UML class diagrams:** text widths differ from pdflatex by about 1 %, so a long member can end 0.3 mm
  earlier or later.
- **2D geometry:** an angle's label and a label on a segment can sit about 1 mm higher on the canvas.

### Documents (Page mode)

- Cross-references, the contents list and citations need **two compiles**, as with any LaTeX document.
- Page breaks are LaTeX's own and may fall in a different place from the canvas preview.

## Reproduce it

The harness is in [docs/latex-parity/tools/](docs/latex-parity/tools/):

- `parity_server.py` serves the app and compiles what the page posts.
- `harness.js` composes the three panels, `scenes.js` and `scenes-kit.js` hold the test figures.
- `cdp.mjs` drives a headless Chrome on that page: `CDP=<port> node cdp.mjs run blk_qc blk_forest …`.
- `match.py <figure.cmp.png …>` prints the scores at 0, 0.2, 0.5 and 1 mm.
- Figures with pictures (`img_png`, `img_jpg`, `img_svg`, `img_rot`): `harness.js` sends the files the .zip would carry (each picture, and for an SVG the PDF in `svg-inkscape/`) to the server before compiling, so LaTeX sees what a downloaded .zip holds. The pictures land on the same pixels as the canvas; only the anti-aliasing at their edges differs (90 % at 0 mm).

Between measurement rounds, `node tests/run.mjs` guards the same figures: it keeps each one's exported TikZ
as a golden file (so any change to an export shows as a diff), compiles every export with pdflatex, checks
that each re-imports and exports again byte for byte, and runs the LaTeX checks (`TD.lint`) over them.
A change that leaves those golden files untouched cannot move the scores above.
