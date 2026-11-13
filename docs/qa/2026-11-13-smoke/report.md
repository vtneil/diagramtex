# DiagramTeX smoke test — 13 November 2026

Tested the development app at http://127.0.0.1:5174/ in Orca's built-in browser, with real clicks, drags, typing and keyboard shortcuts. Supporting repository tests ran in isolated Chrome profiles. No application fixes were made during this audit. The earlier PORT override in scripts/dev.js remains.

Post-restart checks are recorded in [recovery.md](recovery.md): malformed-input recovery across all 15 editors, a further syntax-feedback finding, SVG image editing/persistence, and the native file-picker automation limitation.

## Result

No confirmed crash or data-loss defect in the controlled checks. There are confirmed accessibility defects, including a quantum-editor keyboard activation bug, and several practical usability improvements. See the [block-editor interaction pass](block-editors.md). This is a broad smoke test, **not certification of every component, parameter combination or scientific result**.

## Findings, in priority order

### P2 — Inspector inputs lack accessible names

**Reproduce:** create a Function plot and inspect its properties with a screen reader or accessibility tree. Title, x/y labels, series expressions, geometry and several select/checkbox controls are exposed without meaningful names. For example the plot snapshot has `textbox` with no name for the title, and the x-label input is unnamed despite containing `$x$`. Table cells likewise appear as nine unnamed textboxes.

**Impact:** users cannot reliably distinguish the fields without their visual position. A value or the placeholder “auto” does not identify a field's purpose.

**Expected:** associate visible captions using `for`/`id` or `aria-labelledby`. Give compound range fields distinct names such as “X minimum” and “X maximum”; table cells need row/column context.

**Evidence:** [plot accessibility snapshot](evidence/plot-Function.txt), [table snapshot](evidence/table-insert.txt), [plot screenshot](evidence/plot-inspector.png). Shared caption/control rendering is in src/ui/FormRows.svelte and src/ui/Control.svelte. FormRows contains explicit label-association warning suppressions; the clean static check does not prove accessible naming.

### P3 — Overflowing toolbar actions are hard to discover

At the observed 1169 CSS pixel browser width, the long document name and mode controls push right-hand actions partly or fully offscreen. LaTeX is clipped and appearance controls are outside the initial view. The toolbar intentionally supports horizontal scrolling and edge fades; these controls are not necessarily unreachable, but the hidden scrollbar makes that recovery obscure.

**Improve:** put secondary actions into a visible More menu, or provide explicit overflow chevrons; constrain the name field before hiding export actions. Keep export and undo easy to reach.

**Evidence:** [narrow toolbar screenshot](evidence/narrow-toolbar.png); public/css/style.css around #topbar defines horizontal scrolling with its scrollbar hidden.

### P3 — Dense specialist menus need a shorter repeat-insertion path

Combining different block families repeatedly requires returning to icon-only category menus. The `/` command palette exists and works, so global tool search is **not missing**. A visible search affordance plus Recent/Favourite tools would make the existing breadth easier to use. The default empty-state help mentions `/`, but that help disappears once drawing starts.

### P3 — Placement preview and viewport assistance would help mixed diagrams

Default specialist blocks vary greatly in size. The bit field is much wider than a chemistry or ZX block; physics defaults can extend beneath the floating inspector. A size-aware placement preview, “fit newly inserted object”, and optional overlap warnings would reduce correction work. The overlapping items in the mixed-canvas screenshot were deliberately placed by this test; overlap itself is not a rendering bug.

### P3 — Unavailable features occupy primary menu space

Table mode and Tensor, String, Braid and UML entries are explicitly disabled/coming soon. These are unfinished features, not broken implemented tools. Separate them from available choices or make their status visible without hover. Document table blocks do work independently of the unavailable Table mode.

## Checks and coverage

| Area | Result / limit |
|---|---|
| Repository regression suite | 312/312 passed; 166 golden files; 235 LaTeX compilations served from cache |
| User workflow benchmarks | All 10 passed: labelled box, change label, attached arrow, duplication, text, TikZ copy/paste, shape copy/paste, linked components, expression placement |
| Specialist editors | All 15 passed content edit/apply/reopen/cancel and parent Undo/Redo; all 15 also passed graphical tool edits with local Undo/Redo and Done. See [editor details](block-editors.md). Original double-click/Escape checks also passed |
| Static check | svelte-check: 0 errors, 0 warnings |
| Mixed specialist canvas | Placed CD, XyMatrix, Bloch, quantum circuit, circuit, tree, ZX, Feynman, timing, automaton, Karnaugh map, bit field, chemistry, 2D geometry and 3D geometry together |
| Plot presets | All eight 2D menu presets and seven 3D menu presets inserted; exact object types recorded in verified-presets.txt. Default insertion only, not every series or solid subtype |
| Physics | Each of Mechanics, Optics, Fields, Waves, Spacetime and Energy levels inserted and rendered; numerical correctness not independently checked |
| Drawing | Real-pointer rectangle/label, arrow/move, grouping, duplication, undo/redo, text/math and pencil actions exercised; workflow benchmark supplies controlled outcome checks |
| Other drawing families | Diamond, Star, Capacitor, Brace and Grid sampled; full menu inventories inspected. Not every shape, block arrow or circuit component placed |
| Undo and persistence | Controlled case: rectangle → insert Function plot → Undo leaves the same rectangle → reload retains it. See before/after JSON evidence |
| Modes | Classic document/diagram, Page, Whiteboard and Quick opened |
| Document table | Inserted table, filled nine cells including math, added row/column and changed alignment |
| TikZ import | Imported editable rectangle, arrow and formula label into an existing drawing; resulting imported shapes grouped separately |
| Image export | PNG and SVG downloads confirmed. PNG decoded as 2709×2173 and visually inspected; SVG parsed as XML with valid dimensions. This is not a pixel-for-pixel comparison |
| Quick formula | Changed formula to a Gaussian integral; PNG download confirmed |
| Command palette | `/` opens searchable tools/commands; Escape dismisses; Mac shortcut labels display correctly |
| Console | No entries in sampled console reads, including after import and export |
| Save to file | Button click exercised; completed disk write not verified. No success claim or bug conclusion |

## Scope still needing dedicated verification

- Full 415-component circuit library, pin wiring combinations and each advanced editor's editing operations.
- Every flowchart/basic/block-arrow/optics/mechanics symbol and every line construction mode.
- All physics presets and parameter boundaries, invalid inputs, scientific correctness.
- File picker save/open round trip, permissions/cancel/error paths, overwrite behavior and recovery.
- PDF/print output, image import formats, clipboard images, independent compilation of this exact mixed document, SVG/PNG parity under transparency and different DPI.
- Recycle-bin/folder lifecycle, large-document performance, touch, mobile widths, complete keyboard navigation and dark-mode contrast.

The initial mixed-canvas plot pass had ambiguous placements. A separate clean-document preset verification records exact resulting shape types in [verified-presets.txt](evidence/verified-presets.txt); do not infer an undo defect from the exploratory run. A controlled insert/undo reproduction passed.

## Evidence and follow-up

[evidence/mixed-blocks.png](evidence/mixed-blocks.png) shows the specialist combination. [evidence/mixed-export.svg](evidence/mixed-export.svg) is an actual downloaded export. Regression, workflow, block-editor and static-check logs are under evidence/. Detailed temporary action receipts and exploratory scripts remain at /tmp/texdiagram-smoke for this session.

Recommended order: fix accessible field naming; improve toolbar overflow; add recent tools and placement/viewport assistance; then expand the UI tests to cover editor content changes and real file round trips. No speculative functional defect was promoted to a confirmed bug.
