# Browser testing

Install dependencies and browser binaries:

```sh
npm ci
npx playwright install chromium webkit firefox
# Linux CI images also need OS libraries:
# npx playwright install --with-deps chromium webkit firefox
npm test
```

The main runner now executes every suite in `tests/suites/` in **Chromium, WebKit and Firefox (Gecko)**. All three get the same fixture files, test code, golden checks and LaTeX
compilation checks. It uses new isolated profiles, local bundled fonts, a fixed
viewport and no service worker, without opening personal browser data.
Installed Google Chrome is used when available (`CHROME=/path` overrides it);
otherwise Playwright's Chromium is used. WebKit is the Playwright build, not the
installed Safari app; run manual Safari checks when shipping browser fixes.

Additional real-input tests run in each browser before the in-page suites:
language selection with the mouse in light/dark mode and persistence after reload;
keyboard selection and dismissal; and document/diagram controls, title renaming
and engine selection; language links in both guides; and unchanged maths during
English → Thai → English switches. The maths check compares exact pixels, logical
measurements, selected engine and document source in both Diagram and Document
views, for both KaTeX and Temml. It includes accents, fractions, sums, matrices and
Thai text. The shared renderer marks formula language as unknown (`lang=""`),
separating formula shaping from UI locale. Removing this boundary reproduces the
WebKit vector-accent width change and fails the test.

Synthetic `.click()` does not reproduce Safari's mouse-focus
sequence: a button can lose focus on mouse down, hiding a popover before click.
The shared language menu now prevents that default blur and focuses the option.

```sh
npm run test:webkit
npm run test:firefox
npm run test:chromium
node tests/run.mjs 'Localization:' --webkit
node tests/run.mjs 'Browser UI:'
node tests/run.mjs --dist          # after npm run build
node tests/run.mjs --no-tex        # same suites/goldens; skips pdflatex
```

The CI build runs the full suite against `dist/` in all three browsers with `--no-tex`.
Local `npm test` also compiles the exported LaTeX, cached by content and TeX version.

`npm run test:clipping` compares KaTeX label images with an unclipped copy of the
same contents in all three browsers. Integral limits and trigonometric superscripts
are checked at four font sizes, magnified six times. This catches clipping shared
by every browser that browser parity cannot detect. Label images retain the
measured text paint overflow around their logical layout box; geometry and hit
targets continue to use the logical box.

`npm run test:alignment` checks painted positions for left, centre and right
alignment in both maths engines and all three browsers, on the canvas and in standalone SVGs.
It covers natural multiline labels and explicitly sized text boxes. The browser
UI suite also opens the Document editor and verifies its compact single-row
toolbar, retained text selection, and access to controls on narrow paper.

`npm run test:performance` uses an optional ignored local
`tests/test_page.diagramtex`, or generated maths labels when that file is absent.
Set `DIAGRAMTEX_PERFORMANCE_FILE` to use another local project. It runs each browser and
engine. It reports frame and input-handler timings for wheel scroll and zoom at
100% and 400%, and also exercises a middle-button pointer pan. It asserts that
view-only movement does not parse formulae, clear measurement caches or replace
shape nodes. Unrelated font-loading notifications must also leave drawing caches
intact. Timing values are diagnostic rather than CI pass/fail thresholds; native
Safari still needs separate profiling. See [the investigation](rendering-performance.md).

Native macOS Safari has a separate diagnostic runner. Enable Remote Automation
in Safari, start `/usr/bin/safaridriver -p 48484`, then run
`npm run test:safari -- --dist --bitmap-experiment` after building. It requests
automatic profiling, creates its own automation session, and closes only that
session. `SAFARIDRIVER_URL` overrides the local driver URL. The report includes
the actual Safari version, viewport and device pixel ratio. Ablation trials
remove label images or prose objects; the optional bitmap trial changes only
the test session's image resources. It is not a production preview renderer.

`npm run test:document-performance` uses 100 generated Classic Document text
blocks in both maths engines and all three browsers. Zoom must retain content/divider nodes,
avoid natural block measurements and leave the rapidly changing control style
off the paper root. The runner records timings without hardware-dependent CI
thresholds; `--containment-experiment` applies a diagnostic containment rule.

`npm run test:display` compares mounted canvas labels with the self-contained
vector-export resource at fractional positions, rotation and 25–400% zoom.
It checks resource bytes as well as painted glyphs. `--html-image-experiment`
reproduces a rejected display path; `--report-only` records its known differences.
The main suite checks Blob sharing, unchanged URLs during camera movement,
export independence and URL retirement after the last mounted reference.

`npm run test:text-width -- --dist` checks WebKit's painted repeated-word widths
on the same canvas in both engines, at 75%, 175% and 400% zoom, DPR 1 and DPR 2,
and two fractional camera positions. It compares bold prose and maths text in
labels with different suffixes and a wider multiline/matrix context. Screenshots
measure the actual word ink rather than relying only on DOM boxes. The bound is
two CSS pixels, allowing edge rasterisation at fractional positions. The current
192 captures pass; screenshots and measurements are saved in a temporary report
folder. `--chromium` runs the same cases in Chromium instead. No renderer offsets
or browser-specific style changes are applied. **This test does not establish parity for
prose following different formulae on the same wrapped line.** Its two-pixel
raster tolerance also does not establish subpixel layout equality.

`npm run test:inline-layout` is a strict, app-independent regression diagnostic
for the remaining WebKit inline-layout issue. It uses one bundled font, ordinary
HTML and fractional-width empty spacers. There is no KaTeX/Temml, application
stylesheet, SVG/foreignObject, engine change, Blob URL or fade. Identical text
currently measures 56.375px throughout Chromium and alternates between 57px and
58px in WebKit. The strict command intentionally fails while this discrepancy
remains; it is not included in CI as a passing guard. `-- --report-only` records
the same measurements without a failing exit status. Each run produces a
standalone HTML reproduction, local font, paired screenshots and JSON in a
temporary directory. The HTML can also be opened independently in native Safari.


Native Safari accepts `--no-profiling` for frame measurements without inspector
overhead, `--document` for Classic Document zoom, and `--data-image-control` to
compare the live Blob path with identical SVG data URIs. `--capture-variants`
saves paired screenshots. The HTML-image and fixed-density bitmap experiments
remain diagnostic only. See [the investigation](rendering-performance.md) for
accepted changes and rejected alternatives.

## Export snapshots

Both browsers compare against the same text goldens in `tests/golden/`. The former
WebKit-only overrides have been removed along with the browser-specific KaTeX
MathML fallback. Shared placement snapshots were regenerated after loading fonts before measurement
and retaining fractional font-design metrics. This also corrects directory-tree
measurements made with the typewriter font. Updates affect measured bounds and
consistent 3D depth ordering, not the exported formula source.

```sh
node tests/run.mjs --chromium --update
npm test
```

## Direct rendering parity

```sh
npm run test:parity
node tests/rendering-parity.mjs --dist
node tests/rendering-parity.mjs --report-only  # collect evidence without a failing exit
```

Twenty-one formulae cover scripts, fractions, integrals, sums, matrices, cases,
brackets, vectors, font variants, radicals, accents, text, boxes, nested accents, braces, aligned equations and labelled arrows. Each engine (KaTeX
and Temml) is compared between browsers in canvas labels at 25%, 100% and 200%,
ordinary document maths and standalone SVG exports: **420 comparisons** (Chromium–WebKit and Chromium–Firefox).
Standalone SVGs open as XML in a separate page using embedded fonts and styles.

The runner waits for fonts and paint, then compares logical width/height and
rasterised ink. Geometry may differ by at most 2px or 3%, whichever is larger.
Ink may differ by at most 8% after a two-pixel neighbourhood search to allow
antialiasing. Missing glyph ink, invalid SVG/XML and runtime errors also fail.
No expected visual differences are silently accepted as new baselines.

The output directory is printed at completion. `report.html` contains paired
screenshots and every formula's result; `report.json` contains dimensions, ink
bounds, mismatch ratios and errors. The command returns nonzero on mismatches.
Both engines now pass all 420 comparisons at these original tolerances. KaTeX
keeps its HTML renderer. Temml's MathML is laid out as SVG paths by the local
MathJax typesetter, avoiding independent native-MathML geometry decisions.

The SVG label boundary is an image containing the engine's unchanged layout in
an origin-based viewport. The outer diagram transforms the whole image. The
label has its actual styled fonts embedded; only needed faces are copied. The
same normal HTML layout is used for measurement, with bundled fonts loaded before
first use. This removes floating positioned descendants without a symbol offset,
browser-specific coordinate adjustment or renderer substitution for WebKit.
Exports remain self-contained and vector based, though embedded label fonts can
make SVG files larger. The image cache is bounded to 256 entries.

## Complementary layout and painting checks

```sh
npm run test:rendering
npm run test:document
```

The painting check catches labels drawn outside their SVG foreignObject bounds
through zoom, scroll, block editing and offline SVG/HTML export. Correct DOM
geometry alone misses the WebKit displaced-glyph bug. The document check verifies
fixed paper width, line wrapping, divider positions, zoom anchoring, print layout
and clearance for the right scrollbar in all three browsers. The painting check also verifies that coloured hats and vectors stay above and
horizontally attached to their bases after panning at 75%, 150% and 200% zoom.

The view-update regression also checks that pan/zoom obtains canvas geometry
before SVG writes. Ruler tests exercise resizing and rendered tick alignment,
so a stale viewport snapshot cannot silently pass the performance checks.

PWA tests simulate browser install offers and verify user-triggered prompting,
English/Thai labels, dismissal, expired offers, and installation notifications
from this tab or another tab. Installed display modes and the legacy standalone
flag hide the action. These tests exercise the UI lifecycle without installing
an app on the test machine; native prompt availability is controlled by the browser.

## Engine switching while rendering

`npm run test:math-loading` tests Chromium, WebKit and Firefox with a real compilation
worker and controlled result delivery. It verifies bidirectional reuse of existing engine
image URLs and DOM nodes, progressive replacement, responsive pan/selection/name
editing, cancelled stale results, complete exports, preserved Document editors,
and the yielding fallback when workers are unavailable.

`npm run test:math-loading-performance` measures a cold KaTeX-to-Temml switch
(`--reverse` measures Temml-to-KaTeX)
using the same optional local/generated fixture as the movement benchmark.
`--document` selects 100 generated text blocks instead. Timings are reported;
the assertions require worker use, input before loading finishes and zero target
compilations on the UI thread. `--profile --chromium` saves a diagnostic CPU
profile under `/tmp/diagramtex-loading-profile.json`. Native Safari's equivalent
is `npm run test:safari -- --dist --no-profiling --transition`.

Preview-dependent visual/timing checks await `TD.math.whenReady()` before taking
final measurements. The runtime check switches to Temml after an offline reload
and from a local file, verifying the worker precache and cooperative fallback.

## Output while rendering

`npm run test:output-readiness -- --dist` gates real worker delivery in Chromium
and WebKit for both switch directions. Global Print, Ctrl/Cmd+P, export-menu
PNG/SVG/PDF, HTML and LaTeX actions are blocked while compilation or staged
publication is pending. The controls re-enable automatically; `.diagramtex`
project saving remains available. Existing export popovers close when rendering
starts, and stale controls and keyboard shortcuts cannot bypass the guard.

Right-click image/code output checks the selected objects' dependencies instead
of global readiness, including labels inside components. A ready object can
export SVG or PNG while other objects remain pending; unfinished objects cannot.
Readiness probes force deferred compilation for cold objects. They do not
synchronously compile equations to answer a readiness check.

Browser-menu Print cannot be cancelled from `beforeprint`; while busy, print
styles hide the document and show only a localized not-ready notice. The test
checks these styles and their cleanup. Low-level final SVG/TikZ builders remain
available for internal composition; user-facing actions enforce the output gate.

## Preview replacement and Page printing

`npm run test:preview-fade -- --dist` independently holds real worker results
and image decoding in Chromium, WebKit and Firefox, in both engine directions. The old
image node, URL and dimensions must remain unchanged until decoding completes.
The new preview must then regain opacity monotonically over 300ms, with no blank
or downward flash. Reduced-motion mode keeps full contrast and swaps decoded
content without animation. A cancelled decode cannot publish into the next engine
or hold its readiness promise open. Readiness includes the finite reveal, so
output controls stay blocked until it finishes.

Document blocks publish once all their formulas are ready. Stable HTML wrappers
fade as a unit; nested pending labels do not multiply opacity. Canvas and sidebar
labels retain their decoded resources until replacement is ready.

`npm run test:page-print -- --dist` exercises the actual two-page print preparation
in both engines. HTML sheet containers fill the printable page area; absolutely
positioned SVGs preserve their aspect ratio inside those containers. Physical
paper dimensions are declared by `@page`, rather than duplicated as a normal-flow
SVG height. Chromium's produced PDF is checked for exactly two pages.

Native Safari 27.2 was also checked using the system print-preview UI, with the
same A4 printer, scaling, duplex and header/footer settings: the old layout showed
four sheets, with a blank after each source page; the page-area layout showed two.
No physical print job was sent. Playwright WebKit and Safari WebDriver do not
expose PDF printing here, so the automated WebKit check validates prepared layout,
while the native preview count is a separate manual regression check.

## Generation priority

`npm run test:math-priority -- --dist` checks real worker dispatch in Chromium
and WebKit. On an engine change, visible canvas objects are requested first,
followed by the rest of the current Page sheet and then background content.
Page membership is captured from the existing measured geometry before clearing
engine caches, so the selected-element Properties panel can replace page
thumbnails without losing current-page priority. Cached bounds are read without
regenerating their label HTML.

Document requests use the old block rectangles: visible blocks first, then other
blocks on the current page. Ready blocks publish in the same priority order,
including when many blocks share one cached formula. Heading counters are still
computed in document order, and model/z-order are unchanged. The active Classic
diagram and on-screen Whiteboard objects are checked too.

Only one compilation is sent to the worker at a time. Unstarted work stays in
the application priority queue; an already-running formula is allowed to finish.
Cached result publication and the one-formula-per-task fallback use the same
priorities. The test covers both engine directions, warm caches, scrolled
Documents, nested view modes and a missing Worker API.

### Expected CSP diagnostics in negative tests

The malicious HTML table-import case wraps only its hostile payload in
`T.expectInlineHandlerCsp`. The runner records at most one exact inline-handler
`script-src` rejection during that scope under **expected security rejections**.
Some browsers keep the parsed document inert without emitting a console error,
so no diagnostic is required. The test still asserts that the handler/script did
not execute and that active markup did not enter the imported model.

Unexpected console errors, other CSP violations, additional matching violations,
and the same rejection outside that scope still fail the run. Page exceptions
remain fatal. `tests/console-errors.test.mjs` verifies those boundaries and runs
with the shared suite. This changes test reporting only; the app's CSP is unchanged.

### Mixed math/prose vector labels and LaTeX reference

`npm run test:mixed-labels -- --dist` covers the three reported unitary/permutation
labels, in both maths engines and all three browsers, DPR 1/2, 100%, 400% and 1200% camera scale,
and two fractional positions. Labels are first created through the real app.
The emitted SVG must contain explicit outlines for these bundled-font cases,
with no foreignObject or native text. Tests compare actual path baseline
transforms (and the Temml SVG's mathematical origin), equal path data/advances
for the repeated word, and painted image ink. Raster tolerance is two physical
pixels at the antialiasing edges; advances must be exactly equal across contexts.

An independently compiled pdfLaTeX/Computer Modern reference supplies word
advances and the A–unitary baseline difference. Prose advances agree within
.002em; the baseline difference agrees within .00002em. No label is stretched to
meet those bounds. `npm run reference:mixed-labels` regenerates the checked-in
reference metrics and PNG using `pdflatex` and `uv`/PyMuPDF, and retains the PDF
and source in a temporary directory. Normal CI needs neither TeX nor Python for
this test. Each browser run writes a `comparison.html` sheet at a common nominal
font size, standalone browser SVGs, word screenshots and measurements. Formula
fonts and spacing remain engine-specific; the sheet exposes those differences.

`npm run generate:label-glyphs` extracts the exact outlines/advances from the
bundled KaTeX WOFF2 fonts with build-time Fontkit. CI checks reproducibility.
The fonts currently have no contextual shaping tables; generation fails if a
future font requires them. The font engine/WOFF2 decoder is not shipped to the
browser. Unsupported scripts, system fonts, small caps and text decoration use
native SVG text with applicable bundled faces embedded. The ordinary HTML
inline-layout diagnostic remains a known browser failure, separate from the
fixed mixed diagram-label path. Normal Document prose/editor HTML is unchanged.

`npm run test:format-preview` checks font, math style and size dropdown previews
with real mouse and keyboard interaction in Chromium, WebKit and Firefox, on both maths engines.
It verifies cancellation, selection-wide commits, live numeric sizes, undo, and that
provisional formatting cannot leak into saved project data or SVG exports. It also
checks Classic diagram names through rename, undo/redo, project round trips and reload.

### Firefox / Gecko coverage

The shared browser launcher rejects unknown engine names; a Firefox request cannot
silently run Chromium. Every shared standalone suite uses the same three-engine
matrix. Pass `--firefox`, `--webkit` or `--chromium` to select one engine; omitting
browser flags runs all three. `test:parity -- --firefox` compares Firefox directly
with Chromium, using the existing geometry and ink limits and shared references.
The default parity run compares both WebKit and Firefox with Chromium.

Coverage includes real mouse/keyboard UI controls, saving and undo, both maths
engines, mixed-label baselines and repeated widths against the compiled LaTeX
reference, clipping, accents, display/export parity, Document layout and page
boundaries, print layout, background generation/readiness, fading, formatting
previews, and cache invariants during pan/zoom. Heavy stress bundles remain
optional: `npm run test:stress -- --firefox --fixture=interactive --switch-engines`.

Gecko gives synthetic `ClipboardEvent` instances their own clipboard instead of
retaining the supplied `DataTransfer`. Handler tests explicitly attach the same
fixture clipboard in every browser. This tests application clipboard handlers;
it does not claim to test OS clipboard integration. Error reports include both
message and stack, since Firefox stacks do not include the error message.

Playwright Firefox is an isolated patched build, not an installed personal
Firefox profile. Native print dialogs still need manual checks. Playwright's
PDF generation endpoint is Chromium-only; all three engines verify the prepared
print sheets, and Chromium additionally verifies the generated PDF page count.
