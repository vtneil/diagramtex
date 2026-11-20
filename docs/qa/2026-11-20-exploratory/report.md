# DiagramTeX exploratory test — 20 November 2026

Tested v1.55.5 on the development server (http://127.0.0.1:5173/) by using the app as a person would: real pointer
drags, typing, keyboard shortcuts, file open and save, reloads, two tabs, mode switches and long sequences of
edits. Five testers worked in parallel in headless Chromium, each on one area (canvas, block editors, the other
modes, files and import/export, Document view with language, appearance and screen sizes); plots, 3D figures,
physics, import and a WebKit pass were done alongside. Exported LaTeX was compiled with pdflatex (TeX Live 2026)
and the PDFs were compared with the canvas.

Every finding was reproduced at least twice. **Verified** means it was reproduced again independently of the
tester who found it. The 13 November smoke test ([report](../2026-11-13-smoke/report.md)) already covers
unlabelled inspector fields and toolbar overflow; they are not repeated here.

Evidence is in [evidence/](evidence/). File names start with the finding they belong to.

## Summary

| Severity | Count | Meaning |
|---|---|---|
| High | 7 | Work is lost or corrupted, or the exported LaTeX no longer compiles or no longer matches the canvas |
| Medium | 21 | A feature or flow is broken, or gives a wrong result, but there is a way round it |
| Low | 30 | Wrong text, cosmetic problems, small inconsistencies |

## High

### H1. Display maths typed in source mode is shown raw, and an edit in the page then breaks the document

**Verified.** Document view, Text block.

1. New Classic document → **+ Text**. Press **</>** (Edit the LaTeX source).
2. Type `Intro.`, a blank line, then `\[ a_1^2 + b_2 \]`. Press **</>** again and click outside.
3. The page shows the raw source `\[ a_1ˆ2 + b_2 \]`, not maths. The export already disagrees with the view:
   `$\displaystyle a_1^2 + b_2$`.
4. Click at the end of that paragraph in the page, type `!`, click outside.

**Actual:** the stored source is rewritten to `\[ a\_1\^{}2 + b\_2 \]!`; the export becomes
`$\displaystyle a\_1\^{}2 + b\_2$!`, and pdflatex stops: `! Please use \mathaccent for accents in math mode.`
The whole document no longer compiles.

**Also:** `\begin{align} x^2 &= 1 \end{align}` shows as `\beginalign xˆ2 &= 1 \endalign` and exports `\&=`;
`Text $$x_1^2$$ more` (display maths mid-paragraph) exports as the literal text `\$\$x\_1\^{}2\$\$`.

**Expected:** source-mode LaTeX that the exporter understands is shown as maths, and editing elsewhere in the
paragraph never escapes it.

Likely cause: the inline editor (`src/application/doc-inline.ts`) does not treat `\[…\]`, `$$…$$` or environments
as maths when it turns the page back into source, while the exporter (`docview.ts`) does.

Evidence: [h1-bracket-shown-raw.png](evidence/h1-bracket-shown-raw.png),
[h1-source-escaped-after-edit.png](evidence/h1-source-escaped-after-edit.png),
[h1-align-shown-raw.png](evidence/h1-align-shown-raw.png), [h1-export-fails.tex](evidence/h1-export-fails.tex).

### H2. Page mode: changing the paper moves objects on later pages, and the change cannot be undone

**Verified.**

1. Page mode → **New** → **+ Add page**.
2. On page 2, draw a rectangle 3.3 cm below the top of the paper. LaTeX: `(4.5,-5.55) rectangle (10.5,-3.3)`.
3. In the right panel change Paper from A4 to A5.
4. Press ⌘Z.

**Actual:** after step 3 the rectangle is exported at `(4.5,-14.25) rectangle (10.5,-12)`: it moved 8.7 cm down
page 2, the difference between the A4 and A5 heights. With A5 landscape on a fuller file, page 2's objects ended
below the bottom of the paper and a tree on page 1 straddled the gap between pages, while the page cards still
counted them on their pages. The paper change is not on the undo stack: the Undo button stays as it was and ⌘Z
deletes the rectangle, leaving the paper at A5. Orientation and margin changes behave the same.

**Expected:** the guide says an object "belongs to the page under its centre and moves with it", so it keeps its
place on its page; and page setup changes undo like any other edit.

Evidence: [h2-page-a4-before.png](evidence/h2-page-a4-before.png),
[h2-page-a5-after.png](evidence/h2-page-a5-after.png),
[h2-page-a5-landscape-off-paper.png](evidence/h2-page-a5-landscape-off-paper.png).

### H3. Any visual edit in a block editor deletes every `%` comment in its code

**Verified** (Quantum). Also seen in Circuit and the commutative diagram editor.

1. Insert a Quantum block and open it (Enter).
2. In the code pane add a line `% keep me` under `\begin{quantikz}`. The drawing updates and the comment stays.
3. Click **Add a wire at the bottom**.

**Actual:** the wire is added and `% keep me` is gone. ⌘Z restores the earlier code without the comment, and Done
saves it without the comment. In Circuit, nudging the resistor removed both a full-line comment and an
end-of-line `% source note`; in tikz-cd, **Add a column at the end** removed both.

**Expected:** the guide: "Parts you didn't touch keep the code you wrote".

Evidence: [h3-quantum-comment-gone.png](evidence/h3-quantum-comment-gone.png),
[h3-circuit-comment-gone.png](evidence/h3-circuit-comment-gone.png).

### H4. After importing TikZ that sets `every node/.style={draw}`, the PDF boxes text that the canvas does not

**Verified,** compiled.

1. Paste onto the canvas:
   ```latex
   \begin{tikzpicture}[every node/.style={draw}]
     \node (a) at (0,0) {A};
     \node (b) at (3,0) {B};
     \draw[->] (a) -- node[above, draw=none] {yes} (b);
   \end{tikzpicture}
   ```
2. Add a text label `hello` with the Text tool.
3. Export (LaTeX, ⌘E) and compile.

**Actual:** the export keeps `every node/.style={draw}` on the picture but writes the label as
`node[auto, pos=0.5] {yes}`, dropping `draw=none`, and the new text as `\node at (…) {hello};`. In the PDF both
"yes" and "hello" have boxes; on the canvas neither does. Any text added to such a diagram later is boxed in the
PDF.

**Expected:** what the canvas shows is what compiles: nodes that the canvas draws without a border are written
with `draw=none`, or the picture style is not kept for converted shapes.

Evidence: [h4-canvas-unboxed.png](evidence/h4-canvas-unboxed.png), [h4-pdf-boxed.png](evidence/h4-pdf-boxed.png),
[h4-export.tex](evidence/h4-export.tex).

### H5. Undo and Redo reach across files: Redo in a new, empty file deletes another file

**Verified.**

1. Create a file and name it "Beta". Delete it with the × on its row.
2. ⌘Z: Beta comes back.
3. Create a new file with **+**.
4. Its Undo button is disabled but Redo is enabled. Press ⇧⌘Z.

**Actual:** Beta goes back to the Recycle Bin while "Untitled" is open. Pressing ⌘Z repeatedly in an empty new
file restores other deleted files one after another.

**Expected:** the guide: "Undo history is kept per file". A new file has nothing to undo or redo; deleting and
restoring a file belongs to the file list, not to whichever file is open.

Evidence: [h5-redo-in-new-file.png](evidence/h5-redo-in-new-file.png),
[h5-redo-in-new-file-2.png](evidence/h5-redo-in-new-file-2.png).

### H6. A file with an unknown block type is reported as unopenable but still added, and typing in it is lost

1. Open [h6-unknownblock.diagramtex](evidence/h6-unknownblock.diagramtex): a valid Classic file with one extra block
   `{"type":"whatever"}`, as a file from a newer version could be.
2. The dialog says `It isn't a DiagramTeX file (Cannot read properties of undefined (reading 'length')).`
3. The file is nevertheless in the list as "Unknown block" and open. Click another file, then "Unknown block"
   again.
4. The top bar says "Unknown block" but the page shows the other file's title and text. Click "Empty paragraph —
   click to write" and type.

**Actual:** the typed text disappears and is saved to neither file. The console logs
`TypeError: Cannot read properties of undefined (reading 'length') at pageHtml` on every render.

**Expected:** either the file opens with the unknown block kept and shown as a placeholder, or it is not added at
all. Likely cause: `src/application/docview.ts` treats every block that is not text, table or image as a diagram
(`b.shapes.length`).

Evidence: [h6-unknown-selected-shows-other-file.png](evidence/h6-unknown-selected-shows-other-file.png),
[h6-typed-text-lost.png](evidence/h6-typed-text-lost.png).

### H7. Quantum: one missing `}` collapses the circuit silently, Done saves code that will not compile, and a later edit deletes a wire

1. Insert a Quantum block and open it.
2. In the code, delete the `}` of `\gate{H}`.

**Actual:** the drawing becomes "1 wire · 2 steps" with an empty box and no message (the Chemistry and tikz-cd
editors do show one for similar mistakes). ⌘Enter saves it; the exported LaTeX fails with `! Missing } inserted.`
and takes the whole document down with it. With the broken text `\gate{\\`, clicking the empty box and pressing X
wrote `\gate{X}` over the cell and removed the swallowed second wire
(`\lstick{\ket{0}} & & \targ{} & \meter{}`) from the code.

**Expected:** unbalanced braces are reported in the code pane, and editing never deletes code the editor could not
read.

Evidence: [h7-quantum-brace-collapsed.png](evidence/h7-quantum-brace-collapsed.png),
[h7-quantum-edit-deletes-wire.png](evidence/h7-quantum-edit-deletes-wire.png),
[h7-quantum-export-fails.tex](evidence/h7-quantum-export-fails.tex).

## Medium

### Canvas and properties

**M1. Typed numbers in the properties panel snap back to the old value, and the next edit builds on it.**
*Verified.* Draw a rectangle, type 3 in Line width, press Enter: the shape gets 3 px but the field shows 1 again.
The same happens for Corner radius, Rotation, Label size (px) and Default style → Line width; the fields correct
themselves only when the shape is selected again. Typing 6 and then pressing ↑ gives 5.25, built from the stale
5, so the 6 is lost. Likely `src/ui/live-value.ts` writes back the value the panel last received on blur, and the
panel is not re-rendered after a number commit. Geometry fields (x, y, w, h) are fine.
[m-stale-panel-values.png](evidence/m-stale-panel-values.png)

**M2. Choosing the Fill bucket removes the fill of the selected shape.** *Verified.* Fill a rectangle blue, keep it
selected, press K (or click the bucket). Its fill becomes the bucket's colour at once, which starts as "none".
`app.ts` around line 1852: `if (t === 'bucket' && previous !== 'bucket') fillShapes(selected())`. The bucket's
colour is also the Default style fill, so picking a bucket colour fills every new shape.
[m-bucket-clears-fill.png](evidence/m-bucket-clears-fill.png)

**M3. Snapping aligns to the outside of the stroke, so identical shapes drift.** *Verified.* Four identical
rectangle drags 100 px apart give left edges 2.25, 2.21, 2.20, 2.19 cm, each wider than the last; a line meant to
be horizontal comes out `(7.24,-6.24) -- (11.25,-6.25)`; next to a 10 px line, a new line snaps 5 px past its
visible end. `snapPoint` in `app.ts` builds its targets from `TD.bbox`, which includes the stroke width.
[m-snap-drift.png](evidence/m-snap-drift.png)

**M4. A dropdown keeps focus after a mouse pick and swallows tool shortcuts.** Select a rectangle, pick Dash →
Dashed with the mouse, press L: the dash changes to "Long dashes" and the tool stays Select. On an arrow, S after
picking an end tip gives "Stealth, reversed", H gives "Harpoon". `renderPropsKeepPicker` deliberately puts focus
back on the select.

### Top bar and modes

**M5. After switching modes the top bar overflows: the LaTeX button is off-screen and the mode buttons move under
the pointer.** *Verified.* At 1440 px, fresh load: LaTeX ends at x = 1432. Classic → Page → Table → Classic: it
ends at 1509, outside the window (⌘E still works; reload fixes it). The mode labels stay expanded after a switch,
and because each switch collapses or expands them, a second click on Quick 400 ms after the first lands on
Whiteboard. Look at `fitToolbar` (`src/ui/kit/toolbar.ts`, the `lean` class) not being re-measured on a mode
change. [m-topbar-latex-offscreen.png](evidence/m-topbar-latex-offscreen.png)

**M6. Table: a cell being typed into is lost on reload or tab close.** Double-click a cell (or start typing),
type 5.55, wait 3 s, reload: the cell reverts. The same edit through the formula bar survives, as does unfinished
text in Page, Whiteboard and Quick.

**M7. Table: the grid is a keyboard trap.** Tab and Shift+Tab never leave `.tb-gridwrap`, at the last cell or the
first, before or after Esc. Only the mouse gets out (WCAG 2.1.2).

**M8. Quick: the start of a long formula cannot be seen.** `START + a_{0} + … + a_{59} + END` opens at a₂₆ and
cannot be scrolled further left. `.qk-stage` is a centred flex box with `overflow-x: auto`; use
`justify-content: safe center` (or `margin: auto` on the child). The PNG and SVG are complete.
[m-quick-long-formula.png](evidence/m-quick-long-formula.png)

**M9. Whiteboard: Fit cannot bring far-apart objects into view.** A rectangle near (4, −4) and an ellipse at
(300, −200): Fit stops at 10% and shows neither; manual zoom goes down to 3%. `app.ts` `zoomFit`:
`Math.max(0.1, …)`.

**M10. Whiteboard: objects beyond about 575 cm from the origin export LaTeX that fails** with `! Dimension too
large` (TeX's limit), with no warning. Forty wheel flicks reach 2000 cm.

### Document view

**M11. Page setup allows a negative text width.** Left/right margins 15 and 10 on A4, or Paper → Custom with width
0: the panel says "Text width −4 cm", the preview breaks to one letter per line, and the export writes
`left=15cm, right=10cm` or `paperwidth=0cm`. Each field alone is checked, but not against each other.
[m-negative-text-width.png](evidence/m-negative-text-width.png)

**M12. The "Diagram 1 of N" selector goes stale in Document view.** After **+ Diagram**, Move up/down or deleting a
diagram block, `#blockSel` still shows the old count (and Next stays disabled) until the view is switched. The
chooser it opens is correct. Likely the `[data-add]` / `[data-mv]` handlers in `docview.ts` call
`changed(); render();` without `updateTopbar`. Found by two testers.

**M13. Tablet portrait (820 × 1180) is hard to use.** The document opens at 35% (Fit Width keeps room for the Page
setup panel even when it is folded; with the sidebar hidden it reaches only 60% with 300 px empty on the right),
the in-page **+ Text / + Diagram / + Table / + Image** buttons scale down to about 19 × 8 px, the status bar
covers the sidebar footer, and Undo, Print, Export and LaTeX are scrolled off the top bar with nothing showing
they are there. [m-tablet-portrait.png](evidence/m-tablet-portrait.png)

### Import

**M14. A node on a `rectangle` path is placed at a corner.** *Verified.*
`\draw[red] (0,0) rectangle (2,1) node[midway] {Hi};` shows "Hi" at the top-right corner and, converted to shapes,
is written `\node at (2,1) {Hi};`; `\draw (6,0) rectangle node {Box} (8,1);` puts "Box" at the start corner.
TikZ centres both. Kept as written, the code is right but the canvas, Document view and web page show the corner.
[m-rectangle-node-corner.png](evidence/m-rectangle-node-corner.png)

**M15. Importing a .tex with lists shows the raw commands as one paragraph.** `\begin{itemize}\item First …` is
shown as "\beginitemize \item First bold \item Second x² \enditemize …" in one paragraph, braces dropped.
Re-importing the app's own Welcome export does the same to every list. The LaTeX export is still right.
[m-imported-lists-garbled.png](evidence/m-imported-lists-garbled.png)

### Block editors

**M16. ⌘Enter (Done) does nothing while a palette item has focus, in 14 of 15 editors.** *Verified* (commutative
diagram). Clicking or dragging a palette item focuses it, so this happens after almost any palette use; ⌘S still
works. Only Quantum is right. `src/editors/cdeditor.ts` (about line 941) returns early on Enter over `.qe-item`
without checking ⌘/Ctrl; `qceditor.ts:1342` checks `!e.metaKey && !e.ctrlKey`.

**M17. 2D Geometry: a dragged point lands short of the pointer.** The first move of each drag is dropped: a fast
drag of P from (0,0) to (1,0) writes `(P) at (0.1,0)`; a 10-step drag to (1.3, 0.7) lands at (1.15, 0.65). The
same drag in the Graph editor is exact.

**M18. UML: an object with "Instance of" is drawn as `obj1 : Circle}}`** in the editor, on the canvas and in the
palette thumbnail ("obj : C}}"). The PDF is right. `src/domain/uml.ts:640-641`.
[m-uml-object-braces.png](evidence/m-uml-object-braces.png)

**M19. Circuit: nudging a part with an arrow key disconnects it.** Select R in the default circuit, press ↑: R moves
to y = 2.25, the wires stay at y = 2 and the circuit is open. Dragging with the mouse keeps the wires attached.

### Files

**M20. Two tabs on the same file drop an edit made within about 300 ms of the other tab's.** Draw in tab 1, then
200–300 ms later in tab 2: both settle on one shape fewer, also after reload. With 500 ms or more between them both
survive.

### Reported during the fixes

**M21. Document view: clicking inside a formula's edit box closes it.** Click a `$…$` or `$$…$$` formula in a text
block being edited: its box opens; click in the box to move the caret and it disappears. The maths colouring drawn
over the box (`.tx-hl`) should let clicks through, but `#docPop > * { pointer-events: auto }` overrode it, so the
press landed on the colouring, the box lost focus and closed.

## Low

### Behaviour

- **L1.** Solid of revolution: a negative or zero Sweep silently becomes 10°; the field still shows "−90" with no
  message (`src/domain/figures3d.ts:296` clamps to [10, 360]). [l-negative-sweep.png](evidence/l-negative-sweep.png)
- **L2.** Double-clicking inside an unfilled rectangle does nothing (only the stroke is hit), and the label the
  user then types runs as tool shortcuts: `o` starts an arc, `l` the line tool.
- **L3.** The `/` palette lists two identical "Ellipse · Shapes · Basic shapes" entries; one draws a TikZ `ellipse`,
  the other a four-curve path named "Shape".
- **L4.** Auto plot ranges come from the sampled values, so `sin(x)` gets `ymin=-0.9999` and loses its −1 tick.
- **L5.** Esc does not cancel a drag in progress (new shape or move).
- **L6.** A mixed selection shows the first object's colour and width, with no "mixed" state.
- **L7.** The zoom field keeps focus after Enter, so the next shortcut key is typed into it.
- **L8.** A paragraph box's handles keep the old height after the text rewraps narrower.
- **L9.** Right-click → Paste ignores where the user right-clicked.
- **L10.** In the Welcome sample, the arrows from "?" to "Done" and from the spring to the ball are not attached, so
  moving "Done" leaves them behind.
- **L11.** Circuit: the code pane keeps its sideways scroll when a block (even another one) is reopened, so every
  line starts cut off.
- **L12.** K-map: `\overline{B}\overline{D}` is drawn as one continuous bar, which reads as NOT(BD).
- **L13.** Graph and Automaton: the inline label box (about 300 × 165 px) covers the item being labelled.
- **L14.** ZX Phase and tikz-cd arrow Label: autocomplete stays open after Enter.
- **L15.** Quick: Copy PNG on an invalid formula replaces the specific error with "Fix the formula first".
- **L16.** Touch: no long-press opens the object menu, which the panel points to ("Right-click for more"); on iPad
  Safari rotate, flip and align may be out of reach. Not checked on a device.
- **L17.** Opening a .diagramtex whose name already exists adds a second file with the identical name; "Import as
  New Document" always names the file "Imported".
- **L18.** Importing a full .tex: `\section` comes back unnumbered, `\author` is dropped, a figure caption becomes a
  paragraph, a .tex without a picture gains an empty diagram, and a round trip duplicates
  `\usepackage{amsmath}` / `amssymb` once.

### Output

- **L19.** Export and save file names drop every non-ASCII character: "การทดลองที่ 1" saves as `_1.png`
  (`app.ts:5314`). Every diagram exported from one document gets the document's name.
- **L20.** Document titles are not escaped: `<`, `>` and `"` print as ¡ ¿ and a curly quote, and an emoji stops the
  compile (`Unicode character 🎉 not set up`).
- **L21.** PNG export offers sizes that then fail (2400 DPI on a 15 × 12 cm diagram; 300 DPI on a large whiteboard,
  35 365 × 23 495 px) with no warning in the panel, only a 3-second hint after.
- **L22.** The web-page export of a document falls back to Times; the app shows KaTeX_Main, which the file embeds.
- **L23.** Very long unbreakable words: the browser's print shrinks the whole document to about 65%.

### Text

- **L24.** The guide is out of date in places: ⌘⇧E no longer writes a `% diagramtex-data:` comment and files do not
  "re-import exactly" (the dialog's red note says so, even for one plain circle that does); rotation is from tabs
  outside the middle of each edge, not "just outside a corner"; Page export uses `lrbox` and eso-pic, not
  `remember picture, overlay`.
- **L25.** Thai: untranslated "Previous diagram" / "Next diagram" (`ui.previousDiagram`, `ui.nextDiagram`), "(font
  default)", "Solid", "none", label positions, keycap names, the whole Circuit palette (`czcore.ts`,
  `czparts-*.ts`); new documents are named "Untitled" (and titled `\title{Untitled}`); "Node text" is cut off in the
  panel; the version link's tooltip changes language only after a reload.
- **L26.** Document view: the Export tooltip says "Export this diagram as PNG (choose DPI), SVG or PDF" but the menu
  offers PDF and Web page.
- **L27.** The empty whiteboard says "Ctrl+scroll" (hard-coded in `AppShell.svelte` and `messages.ts`) while the
  tooltip says ⌘-scroll; `#btnNewDoc` is always labelled "New document"; Page margin fields are labelled "Top" and
  "Left" but set top/bottom and left/right.
- **L28.** Block editors: after ⌘S the Discard dialog still says "Your edits since opening the editor will be lost";
  the tikz-cd hint "An arrow with no direction (like `\arrow[r]`)" (`cd.ts:491`, similar in `zx.ts:498`); paste
  messages "Pasted as a Chemistry", "Pasted as a XyMatrix", and "Imported 1 shape" for blocks.
- **L29.** Open errors are vague: "It isn't a DiagramTeX file (not a DiagramTeX file)", also for a real file with one
  unknown shape type or a newer version.
- **L30.** Cosmetic: one-word Circuit palette names are drawn smaller than longer ones (`fit-item.ts`); the Automaton
  panel's library chip overflows the panel edge; library symbols are all named "Shape" in Layers; KaTeX
  strict-mode warnings in the console while typing commands such as `\o…` and `\i…`.

## What worked

- **Exports compile and match.** The whole 42-diagram Welcome document compiles to 28 pages with no errors. Every
  block's standalone export compiled and matched its canvas (except M18's label and H7). PNG at 24–900 DPI has the
  right size; SVG embeds its fonts; the PDF has the true page size. WebKit's PNG export matches the canvas.
- **Files.** A saved .diagramtex reopens byte-identical (Classic and Page). Empty, random, truncated and wrongly
  shaped files are refused with a dialog; a 3 MB file with 20 000 shapes opens. File list create, rename (Thai,
  emoji, 551 characters), folders, sort, reorder, delete and restore, Recycle Bin.
- **Editing.** Every tool family; selection, resize, rotate, flip, duplicate, copy and paste (also across
  documents), grouping, z-order, Layers lock and hide; connectors that stay attached; an 11-step undo and redo that
  returns to an identical drawing; plot and 3D figure parameters with clear errors for bad input; undo of each
  plot property edit in turn.
- **Physics.** The incline's normal force, friction (kinetic and static), critical angle and acceleration agree
  with hand calculation (g = 9.80665).
- **Block editors.** All enabled blocks insert and open; Cancel and Esc ask before discarding; ⌘S keeps the editor
  open; one canvas undo reverts a whole block edit; pasting each block's code makes the right block.
- **Modes.** Each mode keeps its own files and undo history; Page pages, Whiteboard pan and zoom, Table imports
  (LaTeX with merged cells, CSV, Markdown, TSV) and Quick output all work; reload keeps everything.
- **Document view, language, appearance.** Typing shortcuts, inline maths, MathLive, KaTeX/Temml switching, page
  setup reaching the LaTeX, wide diagrams scaled; English ↔ Thai remembered; dark mode readable with exports still
  black on white; the phone page.

## Status

| Finding | Status |
|---|---|
| H1 | **Fixed.** One splitter (`splitDisplay` in `src/application/doc-inline.ts`) cuts `$$…$$`, `\[…\]` and the amsmath display environments out of a text block for the page, the in-place editor and the export alike, so a display is drawn as maths, edited as one formula and written back as typed; an environment is exported as written (no `\&`). A display and the paragraph round it with no blank line between stay one paragraph, and `\\[2pt]` keeps its spacing. Test: "Document display maths typed as \[…\] or an environment…" in `tests/browser-ui.mjs`; the edited document compiles. |
| H2 | **Fixed.** A Page file's paper, orientation and margins are part of its undo history (`src/core/history.ts`), and changing them moves everything on page 2 onwards by its page's shift, so each object keeps its place on its page (`setSheetPage` in `src/application/app.ts`). Test: "Page: a new paper or orientation keeps every object on its page, and is one undo step". |
| H3 | **Fixed.** `keepComments` (`src/editors/keep-comments.ts`) carries the comments of the code as last written (opened, typed or restored) into the code each model-based editor writes from its drawing, matching lines while ignoring spaces and a row's `\\`; a changed line keeps its comment, and a deleted line's comment stays where the line was. It is wired into the history snapshot, so undo, Done and the code pane all keep comments (13 editors; tikz-cd and xymatrix in their own dialect). The 3D and physics editors already edit their text in place. Circuit, which stores parts and not text, now reads a comment with the statement it sits by (`cmt` on the part, or in the raw lines) and writes it back there; comment lines no longer count as "lines that can't be drawn". Test: "Block editors keep % comments through edits made in the drawing, undo and Done" (Quantum, tikz-cd, Circuit). |
| H4 | **Fixed.** The picture options kept from an import that every node or path takes (`every …/.style`, `nodes={…}`, `inner sep=…` and the other node-only keys) are no longer written on the picture when its code is written from the shapes: they go in a scope round the statements kept as written, which rely on them (`pictureOpts` in `src/domain/shapes.ts`). Code written from a shape already says all it means, so text added later and labels rewritten from the model compile unboxed, as the canvas shows them; named styles and `>=Tip` stay on the picture. Compiled. Test: "styled node import: every node/.style holds only the statements kept as written…" in `tests/suites/99-styled-node-import.js`. |
| H5 | **Fixed,** keeping the owner's design (undo still reaches a file deleted from another file that was there: "switch, delete and go back"). Each file-list step remembers the files listed once it was done or undone (`seen`), and only those reach it (`fileStep` in `src/application/app.ts`), so a file made or opened afterwards has nothing to undo or redo. Test: "history: a file made after a delete or its undo has nothing to undo or redo…" in `tests/suites/88-recovery.js`. |
| H6 | **Fixed.** The page draws a block of a kind it doesn't know as a note ("A block this version of DiagramTeX can't show (whatever). It is kept as it is.", in Thai too) instead of as a diagram, so opening the file no longer throws, it opens and switches like any other, and typing is kept. The block is saved as it came and the LaTeX export leaves it out with a comment (`src/application/docview.ts`). Test: "robustness: a block of a kind this version does not know…" in `tests/suites/84-robustness.js`. |
| H7 | **Fixed.** Quantum reports braces that don't pair under the code ("A { in the circuit is not closed: everything after it is read as one cell…", also in the block's panel; `braceFault` in `src/domain/quantum.ts`). A cell whose braces don't pair is kept as written whatever is done to it in the drawing, and while one exists the drawing is read back from the code after each edit, with a tip when a change to it was not kept (`src/editors/qceditor.ts`), so no edit deletes the code it swallowed; closing the brace brings every wire back. Done still saves what was typed, with the note showing. Test: "Quantum: an unclosed { is reported, and edits in the drawing never delete the code it swallowed". |
| M1 | **Fixed.** After a committed property the panel is drawn again from the shape (`src/application/app.ts`, the `change` handler), so Line width, Corner radius, Rotation, Label size (px) and Default style keep what was typed, and ↑/↓ step on from it. Test: "Properties: a typed number stays in its field…". |
| M2 | **Fixed,** keeping the designed behaviour (choosing the bucket fills the selection at once, and a colour picked for it recolours the selection; `tests/construction-tools.mjs` asserts both). The bucket now has its own colour, remembered with the preferences (`bucketFill`), so picking one no longer changes Default style for new shapes, and an empty bucket never clears a fill when it is chosen. The construction test sets the bucket's colour instead of Default style's. Test: "Fill bucket: an empty bucket never clears the selection…". |
| M3 | **Fixed** for what drifted: a point being placed (a new shape's corner, a line's end) snaps to a shape's box without the half of the stroke outside its outline (`snapBox` in `src/application/app.ts`), so identical shapes drawn in turn stay identical and a line starts on the edge it was drawn from. Moving shapes still lines up the outside of the stroke, as `tests/snapping-modes.mjs` asks; among shapes of one width it does not drift. Test: "New shapes' points snap to outlines…". |
| M4 | **Fixed.** A closed dropdown last used with the pointer hands a typed letter on as a shortcut instead of searching its list (`src/ui/services/selectmenu.svelte.ts`); reached by the keyboard, type-ahead still works. Test: "A dropdown picked with the mouse lets the next letter be a tool shortcut…". |
| M5 | **By design** (confirmed by the owner): hovering the file-type switch opens every label and the top bar makes room for them, pushing what follows (LaTeX can go past the edge while the pointer is there; the » arrow from M13 shows it). Not changed. |
| M6 | **Fixed.** The Table workspace saves at once when the page is hidden or left, with the text of a cell still being typed into (`saveNow` in `src/ui/services/table.ts`); the editor stays open. Test: "Table: a cell still being typed into is kept when the page is reloaded". |
| M7 | **Fixed.** Tab still moves along a row; past the row's end (Shift+Tab before its start), from a cell or its editor, focus moves on out of the grid. Test: "Table: Tab moves along a row and then out of the grid…". |
| M8 | **Fixed.** `.qk-stage` centres its picture with auto margins instead of `justify-content: center`, so a formula wider than the box starts at its left edge and all of it scrolls into view (`public/css/style.css`). Test: "Quick: a formula wider than its box can be scrolled to its start…". |
| M9 | **Fixed.** Fit goes as far out as zooming by hand does (3% on a Whiteboard; `zoomFit` in `src/application/app.ts`). Test: "Whiteboard: Fit brings objects far apart into view…". |
| M10 | **Fixed.** A drawing beyond 560 cm from the origin is exported moved back to it by whole centimetres (`TD.texReach` in `src/domain/shapes.ts`, used by the TikZ export and the document export); one more than 560 cm across, which TeX can't hold however it is placed, gets a `% Note:` saying so. Compiled. Test: "robustness: a drawing far from the origin…" in `tests/suites/84-robustness.js`. |
| M11 | **Fixed.** A page setup change that would leave less than 1 cm for text (margins against the paper, or a custom paper too small) is refused with a hint, in the Document and Page setups (`TD.pageFits` in `src/domain/shapes.ts`). Test: "Page setup refuses margins or a paper size that leave no room for text". |
| M12 | **Fixed.** The diagram navigator is updated after every change to the Document page (`updateBlockNav` in `src/application/app.ts`, called from `changed` in `docview.ts`). Test: "Document: \"Diagram 1 of N\" follows a diagram added on the page". |
| M13 | **Fixed.** A Document view too narrow to keep a 560 px page beside the panel (`doc-narrow`, `docview.ts`) fits the page to the whole width with the panel floating over it (71% instead of 35% at 820 × 1180), and puts the zoom bar at the left, clear of the sidebar. The page's + Text / + Diagram bars keep their screen size at any zoom, as the block tools do. The kit's `fitToolbar` gained `arrows`: the top bar shows «  » at an end with more, which scroll it on (they take no room, so nothing moves). Test: "Tablet held upright: …". |
| M14 | **Fixed.** The importer places a node on a `rectangle` the way TikZ does: `pos=t` (midway 0.5, near start/end) runs from the first corner to the second, and a node written inside the operation (`rectangle node {…} (b)`) waits for the second corner and sits at 0.5 by default (`nodeAt`, `lastRect`, `rectNodes` in `src/domain/tikzimport.ts`). Test: "rectangle import: …" (`tests/suites/99-styled-node-import.js`). |
| M15 | **Fixed.** Imported document text turns `itemize` / `enumerate` (nested, and the export's `\item[$\square$]` / `\item[$\boxtimes$]` checklist items) into the text block's own list lines (`listsToText` in `src/domain/tikzimport.ts`); the Welcome export re-imported writes the same lists back. Test: "document import: itemize and enumerate …" (`tests/suites/84-robustness.js`). |
| M16 | **Fixed.** The 15 editors' "a focused palette item keeps Enter and Space" check is one helper, `pressesFocused` in `src/editors/editor-menu.ts`, which lets ⌘ / Ctrl / Alt+Enter through to the editor. Test: "Block editors: Ctrl/⌘+Enter is Done while a palette item has focus" (every block editor). |
| M17 | **Fixed.** The drag's "⇧ changed" check compared `false` with an unset flag, so the first move of every point drag restarted the drag from the pointer and was lost (3D Geometry too); it now starts unset as false (`src/editors/g3editor.ts`). Test: "2D Geometry: a dragged point lands under the pointer, however fast the drag". |
| M18 | **Fixed.** UML draws TeX's extra space after `:` `.` `?` `!` as `$\kern1.11pt$`; inside a `{…}` group that maths cut the group in two, so a wrapped `\underline{\textbf{obj1 : Circle}}` showed its second half as "Circle}}". The space is now added only outside groups (`sf` in `src/domain/uml.ts`). Test: "uml: an object named \"obj : Class\" that wraps is drawn whole…" (`tests/suites/87-uml.js`). |
| M19 | **Fixed.** An arrow-key nudge now does what a drag's drop does: a terminal that touched another part's gets a wire to it (`terminalContacts` / `contactWires` in `src/editors/czeditor.ts`), and wires already on its pins follow, so later nudges stretch them. Test: "Circuit: nudging a part with the arrow keys keeps it connected, as dragging does". |
| M20 | **Fixed.** When another tab saves the open file while this tab has unsaved changes, the two are merged instead of this tab's next save replacing the other's: a three-way merge from what both last shared (`src/core/merge.ts`; shapes by id, so each tab's new shapes are kept; what only one tab changed comes from it; where both changed the same thing this tab's is kept, and the hint says so), then saved. A file whose kind differs keeps the old warning. Test: "Two tabs on one file: shapes drawn in each within a moment are both kept". |
| M21 | **Fixed.** `#docPop > :not(.tx-hl)` in `public/css/style.css`; the display maths test now clicks in the box and checks it stays open with the caret where it was clicked. |
| L1 | **Fixed.** A Sweep outside 10°–360° is an error under the field ("The sweep needs 10° to 360°") instead of silently becoming 10° (`src/domain/figures3d.ts`; the error shows after the sweep row, `src/ui/models/figures3d.ts`). Test: in `tests/suites/91-solids.js`. |
| L2 | **Fixed.** With Select, a double-click inside a closed, unfilled box (rectangle, ellipse, closed polygon, library symbol) opens its label, as on its stroke, so what is typed next is the label, not tool shortcuts (`app.ts`, before the marquee starts). Typed at once it is too: the label box takes the focus as it opens (`TextPopup.svelte`), a press that opens an edit cancels the mousedown that would take the focus back, and two presses are timed by the events, so a busy page still sees a double-click. Test: "Double-clicking inside a box with no fill labels it, and the typing goes into the label". |
| L3 | **Fixed.** The library's ellipse is named "Oval" and the hatch presets "Hatch (ground)" … "Hatch (screen)", and the `/` palette cuts a title at " (A)", " — " or ": " only, so no two results read the same (`src/domain/symbols.ts`, `src/ui/services/palette.svelte.ts`). Test: "no two results read the same" in `tests/suites/92-search.js`. |
| L4 | **Fixed.** An auto range within 0.1% of a round value (a tenth of the span's order) snaps to it, so `sin(x)` runs from −1 to 1 and keeps both ticks; an imported pgfplots range is left alone (`limits` in `src/domain/plots.ts`). Goldens `kit/plot_function`, `plot_area`, `plot_curve3d`, `plot_surface3d`, `plt_legend_se` and `legacy/v1.10.0`, `v1.15.0`, `v1.18.0`, `v1.22.0` updated. Test: in `tests/suites/69-plot-layout.js`. |
| L5 | **Fixed.** Esc during a drag puts everything back as it was and leaves no undo step: a new shape or pencil stroke is removed, a move, rotation or handle drag is undone (connector ends too), a marquee restores the selection, a text frame or guide drag is dropped (`cancelDrag` in `app.ts`). Guide: "Esc while dragging". Test: "Esc during a drag puts back what it changed: a shape being drawn, a move, a resize". |
| L6 | **Fixed.** A field whose value differs across the selection shows "Mixed" (Thai ต่างกัน): a colour as a split swatch of the first two, a list with no option chosen, a number empty with the placeholder (`fieldModel` in `app.ts`; `mixed` on the kit's `Select` and `StyleField`; a row in the kit catalogue). Test: "Several objects that differ show "Mixed" in the panel, and a value chosen there sets them all". |
| L7 | **Fixed.** The zoom and grid fields select their text on focus and give focus back after Enter, so the next key is a shortcut again (`selectOnFocus` in `app.ts`). Test: "The zoom and grid fields: a click selects the value, Enter applies it and gives the keys back to the canvas". |
| L8 | **Fixed.** Narrowing a paragraph box grows its frame to the rewrapped text, so the handles sit on the box (`setHandle` for paragraphs in `src/domain/shapes.ts`). Test: in `tests/suites/68-text-styles.js`. |
| L9 | **Fixed.** Right-click → Paste centres the copy on the point right-clicked (`ctxFor.at`, `paste(at)` in `app.ts`). Test: "Right-click → Paste puts the copy where the right-click was". |
| L10 | **Fixed.** In the Welcome sample the arrows Idea → ? → Done and the spring are attached to their shapes (`link1`/`link2` in `src/application/examples/welcome-edits.ts`, and in `sample()`), so they follow a drag. Test: "Welcome sample: dragging "Done" or the ball brings the arrow and the spring along". |
| L11 | **Fixed.** Every block editor opens with its code pane at the first column and line (`lifecycle().show` in `src/core/editor-session.ts`). Test: "Circuit: a block opens with its code at the first column…". |
| L12 | **Fixed.** Two barred factors side by side are written with a thin space, `\overline{B}\,\overline{D}`, so the bars stay apart (`product` in `src/domain/kmap.ts`, sums of products and products of sums). Test: `tests/suites/74-kmap-terms.js`. |
| L13 | **Fixed.** The in-place label box measured its height before it was shown and opened 160 px tall; it is now sized once open, so it is one line high under the node (`TextPopup.svelte`, every editor's label box). Test: "Graph and Automaton: the label box opens one line high, under the node". |
| L14 | **Fixed.** The block editors listen for keys on `window` first and stopped Enter before the LaTeX command list saw it; their shared first check (`inEditorMenu`) now leaves ↑↓, Enter, Tab and Esc to the list while it is open on the focused field (`TD.texComplete.owns`). Test: "Block editors: Enter takes the LaTeX command list's choice and closes it (ZX Phase, tikz-cd arrow Label)". |
| L15 | **Fixed.** Copy PNG (and the other outputs) on a broken formula keeps the formula's error: "Fix the formula first: …" (`src/ui/services/quick.ts`). Test: "Quick: Copy PNG on a broken formula keeps saying what is wrong with it". |
| L16 | **Fixed** (not tried on a device): a finger held still for half a second on the canvas opens the object menu, as a right-click does, after undoing what the press started; a pinch or a move of more than 8 px is not a long press (`app.ts`, `canvasMenu`). Rotate, flip and align are in that menu. Guide: the right-click line. Test: "Touch: a finger held still on an object opens its menu, and the press moves nothing". |
| L17 | **Fixed.** A file opened from disk whose name is taken gets a name of its own ("… copy"), as pasted and shared files already did; Import as New Document names the file after its `\title`, else the `.tex` it came from, else "Imported", never an existing name. Test: "Opening a file whose name is taken, or importing .tex as a new document, gives the new file a name of its own". |
| L18 | **Fixed** in part. `\section{…}` (not starred) turns on numbered headings; `\author{…}` is kept as the page's new **Author** setting (Document settings, under Title; drawn under the title and exported as `\author`); a figure's `\caption` becomes a centred line of small text under its diagram (diagram blocks have no caption of their own; giving them one is a feature for the owner); the export no longer loads a picture's `amsmath`/`amssymb`/`xcolor` again. **Not changed:** a Classic document always keeps one diagram block (the canvas needs one, `src/core/document.ts`); an empty one exports nothing. Guide updated. Test: "document import: numbered sections, the author, a figure caption and the preamble's packages…" in `tests/suites/84-robustness.js` (compiled). |
| L19 | **Fixed.** File names keep letters, marks and digits of any script ("การทดลองที่ 1" → `การทดลองที่_1.png`); in Diagram view a Classic file's diagram exports under its own name, or numbered (`-diagram-2`) when there are several (`cleanName`, `picSlug` in `app.ts`; the Table's file names too). Test: "export names…" in `tests/suites/83-image-export.js`. |
| L20 | **Fixed.** The LaTeX title (and author) write `<` `>` `"` as `\textless{}`, `\textgreater{}` and T1's straight quote, and leave emoji out (pdfLaTeX has no glyph for them); © ® ™ stay (`plainTex` in `docview.ts`). Test: "document export: a title with < > " prints them…" in `tests/suites/30-roundtrip.js` (compiled). |
| L21 | **Fixed.** The Export panel says before exporting when a PNG (or flattened PDF) would be too large for the browser, with the highest DPI that works, and the button is off until then (`rasterFits`, `maxDpi` in `app.ts`; an `error` row in `ExportPanel.svelte`); the DPI field holds four digits. Test: "Export: a PNG size the browser can't draw is said in the panel…". |
| L22 | **Fixed.** The web page export sets its text in KaTeX_Main, which it embeds (the page's own rule was left out of the file because it uses the app's colours). Test: "Web page export: the text is set in KaTeX_Main…". |
| L23 | **Fixed.** A word longer than the line wraps at the page's edge (tables too), and in print the blocks sit flush with the text column instead of 9 px past it, so the print is not shrunk (`style.css`). Test: "Document: a word longer than the line wraps, so the page (and its print) keeps its width". |
| L24 | **Fixed.** Guide (both languages): rotation from just outside the middle of an edge; Page export with `eso-pic` in one run; the whole-document export carries no data comment, with what comes back as shapes and what as TikZ; a hand-written `axis` becomes a plot, a bare `tikzcd` is not read. The LaTeX window's "can't restore exactly" note shows only when importing the code again would leave TikZ code (`restorable` in `app.ts`). Test: "LaTeX window: the "can't restore exactly" note shows only for code that would come back as TikZ". |
| L25 | **Fixed,** with two left as they are. Translated: Previous/Next diagram, the ZX editor's tools and hints, hatch fields, the gallery title; dash patterns, arrow tips, shafts, crossings, "(font default)", label positions and anchors (with the TikZ keyword kept in brackets: "บน (above)"; `src/i18n/names.ts`); the whole Circuit palette, 417 parts and 25 groups (`src/i18n/th/circuit.ts`, found by English names too); "Node text" and "Wrap width" shortened to fit; the version link's tip follows the language. `tests/localization.mjs` now fails on any caption without Thai (package names and the like listed as content). **Kept:** keycap names (Thai keyboards are labelled in English), and new files named "Untitled" (a Thai default name would go into `\title`, which pdfLaTeX can't set). Test: "Thai: option names, the version tip and the Circuit palette are translated, and no panel label is cut off". |
| L26 | **Fixed.** The Export button's tip names what its panel offers in each view: "Export the document as a PDF or a web page" in Document view, PNG, SVG, PDF or a web page elsewhere. Test: "Export button: its tip names what the panel offers in each view". |
| L27 | **Fixed.** The empty whiteboard names ⌘ on a Mac (Ctrl elsewhere); the + button's name and tip follow the file kind and the language; the Page margin fields are named "Margins: Top / bottom" and "Margins: Left / right". Test: "Words: the empty whiteboard names this computer's zoom key…". |
| L28 | **Fixed.** After ⌘S, Cancel asks about "Your edits since you last saved"; the tikz-cd and ZX hints give `\arrow[]` / `\ar[]` as an arrow with no direction; a pasted or imported block is named ("Pasted the Chemistry block"), not counted as a shape. Test: "Block editor words: Cancel after a save loses only what came since it; a pasted block is named". |
| L29 | **Fixed.** A file that can't be opened says why: saved by a newer version (with its file version), holding objects this version doesn't know (named), or not a DiagramTeX drawing at all (`fail` in `src/core/project-files.ts`, the open dialog in `app.ts`). Tests: "Opening a file that fails says why…"; `tests/suites/86-data.js` expects the new reason for an inherited type name. |
| L30 | **Fixed.** In a one-column palette only a word wider than its row is made smaller, so one-word Circuit names are no longer shrunk (`fit-item.ts`); code in a panel's help line wraps at its spaces (the Automaton panel's library line); Layers names a library symbol by its text or the symbol's name, not "Shape"; KaTeX renders with `strict: 'ignore'`, so typing `\o…` or `\i…` writes nothing to the console. Test: "Cosmetics: Circuit names one size, the Automaton panel's code inside it, symbols named in Layers, no KaTeX strict warnings". |
