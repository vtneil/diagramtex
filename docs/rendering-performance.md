# Rendering performance investigation

Fixture: `tests/test_page.diagramtex` (QC Cheatsheet), 107 top-level shapes.
Baseline: commit `9b93952`. Chromium uses the installed Google Chrome; WebKit uses
Playwright's isolated desktop build. Tests do not open the user's browser profile.

## Confirmed redraw loop

The application previously listened to every `document.fonts.loadingdone` event,
cleared every text cache, and rendered the entire canvas. The Temml run repeatedly
received completion notifications for the UI's Inter Display font. CPU sampling
showed `render → paint → measureBatch`, Temml `toMarkup`, and `labelImage` running
throughout view-only wheel movement. The redraw handler was called from the font
listener rather than the wheel handler. Removing canvas nodes did not stop this
work, so the embedded-image byte count alone did not explain the slowdown.

Drawing fonts are already explicitly loaded by `labelFontsReady` before app
initialisation. The blanket font listener and redundant `fonts.ready` redraw have
been removed. Later UI/editor fonts do not change the drawing's font metrics.
Explicit engine changes still clear the drawing caches and render normally.

An isolated 45-frame wheel trial, with the first five frames discarded:

| Browser | Engine | Operation | Median before | Median after |
| --- | --- | --- | ---: | ---: |
| Chromium | KaTeX | Scroll/pan | 16.7 ms | 16.7 ms |
| Chromium | Temml | Scroll/pan | 33.8 ms | 16.7 ms |
| Chromium | Temml | Zoom | 34.5 ms | 16.7 ms |
| WebKit | KaTeX | Scroll/pan | 17 ms | 17 ms |
| WebKit | Temml | Scroll/pan | 17 ms | 17 ms |

These are frame pacing measurements on one machine, not general FPS guarantees.
The reusable performance check also covers 400% zoom, counts parsing/cache
invalidation/shape-node replacement, and exercises real pointer panning. The
supplied Page file uses wheel movement to scroll/pan; it is not Classic Document
mode, which uses a separate HTML scrolling surface.

## Repeated prose width discrepancy (historical diagnosis)

**2026-11-15 update:** mixed diagram labels now finish layout in reference-em
space and publish explicit SVG geometry. This fixes the reported baseline and
word-width cases without changing WebKit itself. The earlier investigations
below describe the failure that led to that change; the app-independent native
HTML reproduction still fails. See the vector-label implementation section.

The two labels `6lax7ct5` and `e37rz9e0` contain the same word `permutes`, following
different matrix formulae. Both use 14.06px KaTeX_Main regular text. After font
loading completes, standalone copies of their embedded SVGs give these DOM Range
widths:

| Browser | Engine | First label | Second label |
| --- | --- | ---: | ---: |
| Chromium | KaTeX | 56.375 px | 56.375 px |
| Chromium | Temml | 56.375 px | 56.375 px |
| WebKit | KaTeX | 58 px | 57 px |
| WebKit | Temml | 58 px | 57 px |

Copying the same styles and contents into ordinary HTML reproduces WebKit's
58/57 discrepancy. Switching `text-rendering` to `geometricPrecision`, disabling
kerning, or adding an SVG viewBox does not remove it. Giving each prose run an
independent inline-block layout makes both widths 57px, which localises the
problem to inline run layout/rounding beside the different formulae. That is a
localisation result, not proof of a specific WebKit implementation defect.

No inline-block workaround was applied: grouping entire prose segments that way
would change normal wrapping. No font substitution, pixel offsets, or per-symbol
adjustments were applied. Rendering all labels in reference-em space was also
rejected because it failed WebKit painted-glyph checks. The existing clipping
and accent fixes remain intact. This width issue remains unresolved.

The 2026-11-15 recurrence was reduced further in
`tests/inline-text-layout.mjs`: the same word following empty HTML inline-block
spacers of widths 90px through 91px (steps of 1/16px), in the bundled regular
face at 14.06px. Chromium gives 56.375px throughout; WebKit alternates between
57px and 58px. Neither math engine nor any app rendering code is present in the
standalone reproduction. A fourfold CSS transform makes the effect easier to
inspect but is divided out of the reported metrics. WebKit's
[open font quantization report](https://bugs.webkit.org/show_bug.cgi?id=308463)
is consistent with this evidence; this is an inference, not a confirmed mapping
to that particular browser defect.

Enabling kerning/ligatures, changing text-rendering, disabling font synthesis or
text autosizing did not remove the discrepancy. Root/line positioning and
containment did not remove it either. Font-design-space HTML image experiments
were rejected again because real WebKit paint checks lost glyphs. None of these
experimental changes were retained. A robust solution must preserve wrapping,
font semantics and actual painted output; grouping complete prose into atomic
inline blocks is insufficient because it changes wrapping in fixed-width labels.

The formula with a normal superscript and an explicit `\mathit` superscript
also requests different faces. KaTeX maps mathnormal to KaTeX_Math italic and
mathit to KaTeX_Main italic. These should not be force-normalized by the app.
A mixed-font superscript fixture now participates in the direct browser parity
suite. This does not establish that every detail in a user screenshot is
explained by the font commands.


## Native Safari and image resources

The severe slowdown is now reproduced in **native Safari 27.2** using
safaridriver with automatic profiling enabled. The automation viewport was
1600 × 648 CSS pixels at DPR 2 (the inspector occupies part of the window).
It occurs in the development and production builds, at both 100% and 400%.
Headless Playwright WebKit did not reproduce it; its results cannot substitute
for native Safari checks.

The final production run dismissed onboarding and asserted that no dialog
remained before measuring. Earlier exploratory captures with onboarding open
are excluded from the figures below. Native profiling introduced variable frame
intervals even for an empty canvas, so this table reports **median synchronous
input-handler work**, not a promised frame rate. The final quick comparison used
15 events per trial, discarding the first five. Inputs use synthetic WheelEvents
to exercise the app handler; these are not measurements of OS input latency:

| Resource treatment | KaTeX scroll handler | KaTeX zoom handler | Temml scroll handler | Temml zoom handler |
| --- | ---: | ---: | ---: | ---: |
| Original SVG label images | 33 ms | 123 ms | 21 ms | 78 ms |
| Same labels as PNG images | 4 ms | 12 ms | 4 ms | 12 ms |

These figures are for 100%; 400% showed the same separation. Removing label
images also reduced handlers to approximately 2–4ms. The parser and measurement
cache invalidation counters remained zero throughout movement. Keeping the same
image elements, positions and dimensions but replacing their resources with
PNGs removes most of the blocking work. This localises the native Safari cost
to the SVG-backed label resource path rather than repeated formula parsing.
A subsequent layout-read probe found 90 canvas `getBoundingClientRect` calls
across 15 scroll events and another 90 across 15 zoom events. Their accumulated
synchronous time was 467ms for scrolling and 1,384ms for zooming. Ruler
`clientWidth`/`clientHeight` reads contributed only a few milliseconds. The
canvas reads happen between SVG writes in the view update path, so native Safari
is repeatedly forced to settle geometry for the SVG-backed scene.

### Geometry batching implemented

A synchronous view update now reads the canvas and ruler dimensions first.
Navigation, culling, rulers and paper layers reuse that snapshot during their
SVG writes. The snapshot is discarded in `finally` when the update ends; it is
not a persistent viewport cache, so the next input or resize measures afresh.

A paired native Safari production run, with the same fixture, viewport, DPR and
profiling settings, measured these median input-handler times at 100%:

| Engine | Scroll before | Scroll after | Zoom before | Zoom after |
| --- | ---: | ---: | ---: | ---: |
| KaTeX | 31 ms | 1 ms | 117 ms | 1 ms |
| Temml | 19 ms | 1 ms | 72 ms | 1 ms |

The 400% trials likewise measured 1ms after batching. Canvas geometry reads fell
from 90 to 30 over 15 events (six to two per event). KaTeX zoom geometry-read
time fell from 1,317ms accumulated to 3ms. Parsing and cache invalidation stayed
at zero. Profiler frame intervals remain variable, so these are measurements of
blocking handler work, not a claim of a particular display frame rate.

The regression suite now rejects canvas geometry reads after the view's SVG
writes begin, and continues to test ruler alignment after pan, zoom and resize.
The label renderer, font metrics, image resources and vector exports are
unchanged by batching. No bitmap cache or per-symbol adjustments were needed
for this improvement. The separate text-width discrepancy is still unresolved.

The bitmap trial is a diagnostic control, **not a shipped rendering change**.
It uses fixed 2× resources and therefore does not establish acceptable sharpness
at high zoom. A production implementation needs resolution-aware caching based
on zoom and DPR, bounded memory use, careful refresh scheduling, and unchanged
self-contained vector exports. The text-width issue above is separate and
remains unresolved.

The earlier 40 MB (KaTeX) and 28 MB (Temml) figures count base64 resource strings
across the page DOM, including sidebar and hidden-view previews. They are not
network transfer sizes or measurements of retained graphics memory. One sampled
DOM contained 123 labels in the canvas, another 123 in Properties, and 58 in the
hidden document view. Reducing repeated font/CSS resources is a remaining
optimisation candidate, not a demonstrated explanation for all reported stalls.

## Reproduction

```sh
npm run test:performance
# Native Safari (macOS, Remote Automation enabled; separate terminal):
# /usr/bin/safaridriver -p 48484
npm run test:safari -- --dist --bitmap-experiment --compare-images --quick
npm run test:performance -- --chromium
npm run test:performance -- --webkit
npm run test:clipping
npm run test:parity
```

The performance runner writes a JSON report to a temporary artifact directory.
Absolute timings should be compared with the same browser, fixture, viewport,
zoom and hardware, with other browser benchmarks stopped.

For a shorter layout-read investigation, use
`npm run test:safari -- --dist --quick --katex --one-zoom --baseline-only --layout-reads`.
It times `getBoundingClientRect`, `clientWidth` and `clientHeight` calls, without
changing the application renderer. The runner closes only its own automation
session and records partial results even when a trial fails.

## Verification after geometry batching

- Native Safari: both engines at 100% and 400%; approximately 1ms median
  input-handler work, no reparsing or measurement-cache invalidation.
- Chromium/WebKit: 934 regression assertions passed, including all 368 shared
  goldens; 588 LaTeX compilations checked (576 cached).
- Visual parity: 180/180 comparisons; clipping: all 16 cases passed.
- Performance invariants and real middle-button panning passed in both browsers.
- Type checking and production build passed.

The full regression runner still exits nonzero because Chromium reports the
pre-existing CSP block from the deliberately malicious HTML-import fixture,
even though all 934 assertions pass. That message was also present before this
batching change; it has not been suppressed as part of this performance fix.

## Follow-up: resource identity and document zoom (v1.47.4 baseline)

Keep compilation, layout, image loading and painting separate when diagnosing
movement. The baseline's approximately 1ms input handlers did not imply smooth
frames. With native Safari's inspector closed (`--no-profiling`), the local Page
fixture still took approximately 32–33ms per scroll/zoom frame. Removing label
images reduced that to 17ms. Restricting mounted labels to the viewport, freezing
view-dependent custom properties, and promoting the whole canvas with
`will-change` did not materially improve that dense visible scene.

### Accepted: Blob-backed live SVG images

Changing only the resource URL, from a data URI to a Blob URL containing the
**same SVG bytes**, reduced native Safari frame intervals to approximately 17ms.
The SVG `<image>`, dimensions, font data, formula output and camera geometry stay
unchanged. This isolates a cost in Safari's data-URI image resource path; it does
not identify a particular WebKit implementation function.

`SvgLabelResources` now manages resources for the mounted canvas and Document
view diagrams. Identical labels share a URL within each owner; pan and zoom do
not create resources. Removing the final mounted reference retires a resource.
Revocation waits for its local image request to finish, avoiding a race when a
new label is removed before the browser starts loading it. There is no retained
cache of unmounted images. SVG/PNG/PDF/HTML exports continue to generate the
original self-contained data URIs from model data, independent of screen URLs.
No bitmap rendering, UA branch, font replacement or coordinate correction is
introduced.

A paired native Safari 27.2 run, viewport 1600×948, DPR 2, with profiling off:

| Engine / scale | Data URI scroll / zoom frame | Blob scroll / zoom frame |
| --- | ---: | ---: |
| KaTeX / 100% | 31 / 32 ms | 17 / 17 ms |
| KaTeX / 400% | 30 / 32 ms | 17 / 17 ms |
| Temml / 100% | 20 / 21 ms | 17 / 17 ms |
| Temml / 400% | 20 / 21 ms | 17 / 17 ms |

These are medians from short synthetic-wheel trials, not OS input-latency or
universal FPS guarantees. The initial paired KaTeX native screenshots had zero
changed colour channels. The display/export test compares painted scripts,
accents and multiline text in both engines and browsers at 25%, 100%, 175% and
400%, including rotation and fractional positioning. It also checks that the
mounted Blob and exported data URI contain identical SVG text.

### Accepted: keep Document camera changes separate from content layout

Classic Document zoom previously removed/recreated every divider, measured the
last block's natural geometry, and changed an inherited `--unzoom` custom
property on the whole paper. The latter forced style recalculation through the
formula DOM even though only floating block controls needed that value.

Pagination and natural dimensions now update when content/settings/layout
change. Camera zoom reuses those dimensions, scales the sheet, and updates
`--unzoom` only on the controls. The existing ResizeObserver still tracks
images and growing editors. Zoom-point anchoring, minimum-size scrolling,
resizing, page boundaries and print layout retain their regression coverage.

100 generated text blocks, same two formulae per block, at approximately 100%:

| Browser / engine | Before median zoom handler | After |
| --- | ---: | ---: |
| Chromium / KaTeX | 8.7 ms | 1.3 ms |
| Chromium / Temml | 6.4 ms | 1.2 ms |
| Playwright WebKit / KaTeX | 55 ms | 8–9 ms |
| Playwright WebKit / Temml | 13 ms | 1–2 ms |
| Native Safari / KaTeX | 38 ms | 8–9 ms |
| Native Safari / Temml | 9 ms | 2 ms |

The 45-event test formerly observed 540 content/divider mutations and 90 natural
block geometry reads. Both counts are now zero. These results describe Classic
Document mode; the Page fixture above exercises the separate SVG canvas.

### Accepted: avoid redundant canvas updates

Canvas view updates draw each ruler once, retain paper/page-number nodes during
pan, and skip model-dependent status/layers refreshes. Full model/selection
updates still refresh those panels. Geometry and zoom changes invalidate the
paper cache; the outside-paper dimming path still follows the viewport.
Performance tests assert the reduced DOM work independently of timings.

### Rejected or deferred experiments

- **HTML `<img>` promotion:** the same self-contained SVG resources displayed via
  HTML images also reached 17ms in native Safari. It was rejected: multiline
  KaTeX spacing changed on WebKit at high zoom. Adding an origin-zero viewBox or
  changing font smoothing did not resolve that discrepancy. Run
  `npm run test:display -- --html-image-experiment --report-only` to reproduce;
  this path is diagnostic only.
- **CSS containment:** `contain: layout style` on the paper did not measurably
  improve the 100-block trial after the custom-property fix. No containment rule
  was added. Paint containment can clip glyph overflow; `content-visibility`
  with estimated intrinsic heights also needs explicit pagination/scroll-anchor
  validation before adoption. [CSS containment](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Using).
- **R-tree culling:** useful for large sparse scenes; the app already has coarse
  viewport culling above 400 top-level shapes. A spatial index must be updated
  after edits, engine/font changes and undo, and preserve model paint order.
  The dense visible fixture did not improve when offscreen labels were hidden,
  so an index is not a replacement for fixing its measured image-painting cost.
- **Workers/WASM:** potentially useful for opening/editing expensive formulae.
  Movement already performs zero parsing. MathJax's LiteAdaptor is JavaScript;
  WASM is not a prerequisite. DOM-dependent KaTeX measurement cannot simply be
  moved to a worker. [Worker limitations](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API).
- **Path merging and quantization:** Temml maths already uses SVG glyph paths
  with `fontCache: 'none'` (no `<use>` cache). Flattening transforms and merging
  paths must preserve paint order, opacity, clipping and fill rules. Coordinate
  rounding is approximate, not inherently lossless; a claimed fixed percentage
  saving needs measurement. Converting KaTeX to another path engine would also
  change the renderer rather than optimise its existing display pipeline.
- **Two-phase compositor zoom:** a reasonable later experiment. Validate the
  final and in-gesture images, pixel density, memory bounds, coordinate mapping
  and scroll anchoring. Blanket per-equation GPU promotion or filter/mask bans
  are not justified by these measurements. Equation internals already avoid
  normal hit-testing; the canvas uses explicit interaction geometry.

### Commands

```sh
npm run test:document-performance -- --dist
npm run test:display -- --dist
npm run test:safari -- --dist --no-profiling --baseline-only --quick --data-image-control --capture-variants
npm run test:safari -- --dist --no-profiling --baseline-only --quick --document
# Optional diagnostic controls:
npm run test:document-performance -- --dist --containment-experiment
npm run test:display -- --dist --html-image-experiment --report-only
```

Profiling adds substantial overhead and changes the viewport when the inspector
opens. Compare like-for-like runs, and run timing benchmarks sequentially. Keep
the broader Safari roadmap item open: this does not establish smoothness for all
document sizes, displays, browsers or interaction types.

Final checks for this follow-up: type checking and production build passed;
942/942 regression assertions and 368 shared goldens passed (LaTeX compiles
skipped); 180/180 browser parity comparisons and 32/32 mounted display/export
comparisons passed. Clipping, alignment, WebKit accent movement, Document layout,
resource lifetime, offline reload and file-URL label loading passed. The full
runner still exits 1 for the existing deliberate HTML-import CSP error; no new
image-loading/runtime errors remained. The focused resource suite exits 0.

## Responsive engine switching

Engine switches in both directions compile previews in a dedicated local Web
Worker. It runs KaTeX’s HTML renderer or Temml’s parser and the same `mathmlSvg`
implementation/font data used by final synchronous rendering. Neither the document nor its shapes are modified by
preview work. Requests are deduplicated by formula/options, with bounded result
caches; successful KaTeX output is cached too.

On switching engines, the current engine’s image resources and their DOM elements stay
in place, with reduced opacity. Cached sizes provide provisional geometry. A
formula without a previous rendered result uses a small outline placeholder instead
of synchronously compiling another renderer on the UI thread. Worker results
become visible in batches of at most two formulae per animation frame. Formula
IDs identify dependent measurements/shapes, so unrelated objects retain their
cached markup. Cached target results also publish progressively on return
switches, avoiding a full-document replacement burst. SVG updates reuse image elements and parse geometry separately
from large embedded image/font attributes.

Document mode retains existing blocks and editors at the start of a transition.
Ready blocks update in batches of at most four per frame, preserving focus,
selection and scroll. Page boundaries remain provisional and stable until the
final pagination pass. Repeated live MathJax styles are installed once instead
of inserting an identical stylesheet for every inline equation. Export markup
continues to carry its own styles.

A CPU profile of the first worker prototype found substantial remaining UI work
in repeated Layers rebuilds and forced layout, despite zero target compilation
on the main thread. Progress updates now patch only affected sidebar thumbnails.
Temporary equation measurement also uses a contained Shadow DOM: MathJax's SVG
stylesheets no longer invalidate the visible document when a hidden probe is
updated. KaTeX's exact measurement styles and fonts are retained. Shared goldens,
clipping, alignment and painted display/export checks guard this boundary.

Switching back or opening another document cancels pending compilation and
terminates its worker. Request IDs prevent late responses from publishing stale
output. Completed results can be reused on later switches. Hosted/offline builds
precache `math-render-worker.js` and both engines’ local vendor scripts. Browsers that
prohibit workers (including local `file://` pages) yield between individual
formulae using scheduled tasks; one formula cannot be preempted in that fallback.

`TD.math.whenReady()` waits for both formula publication and staged Document
updates. Steady-state performance/visual tests wait on it before measuring.
User-facing print and export actions are blocked while rendering is pending.
Right-click output checks only the selected objects and can proceed when those
objects are ready. Final builders use self-contained resources, never provisional
markup; PNG helpers reject unready output rather than waiting for unrelated jobs.

### Transition evidence

The optional ignored local Page fixture produced 162 unique formula requests.
With initial KaTeX fonts/images settled, sequential isolated runs measured:

| Browser | Switch handler | Time to all published previews | UI-thread target compilations |
| --- | ---: | ---: | ---: |
| Chromium | 32 ms | 3.21 s | 0 |
| Playwright WebKit | 23 ms | 3.71 s | 0 |
| Native Safari 27.2, DPR 2 (earlier core-worker trial) | 25 ms | 2.13 s | 0 |

The final automated runs include staged sidebar updates in completion time.
The native trial predates that sidebar staging and is evidence of the worker/input
path, rather than a directly comparable final completion time.

Input dispatched while compilation was pending ran successfully. The native
trial also panned the canvas throughout loading. These are local diagnostic
figures, not fixed frame-rate guarantees. Native Safari's longest sampled frame
was 149ms; remaining browser painting/DOM work can still cause shorter stalls.
The corresponding 100-text-block Document trial used two repeated formulae;
it switched in approximately 8ms (Chromium) and 22ms (WebKit), then progressively
updated the blocks. Compilation and DOM publication are measured separately.

The reverse Temml-to-KaTeX trial on the same Page fixture switched in 27ms
(Chromium) and 35ms (WebKit), with complete publication in 3.46s and 4.05s.
The 100-block Document reverse trial switched in 7ms and 19ms, completing in
471ms and 706ms. Both browsers executed queued input while loading, with zero
target compilations on the UI thread. These timings include progressive DOM
publication and are local diagnostics, not frame-rate guarantees.

`tests/math-loading.mjs` gates delivery from a real worker to test existing image
and element identity, partial updates, panning/selection, editing, cancellation,
final exports and the cooperative fallback. It also verifies that Document
updates retain the exact editor node, focus, contents and selection range.

```sh
npm run test:math-loading -- --dist
npm run test:math-loading-performance -- --dist
npm run test:math-loading-performance -- --dist --document
npm run test:math-loading-performance -- --dist --reverse
npm run test:safari -- --dist --no-profiling --transition
```

## Decoded preview publication and print page areas

Finished SVG labels now keep the previous decoded image and its dimensions until
the replacement is decoded. Resource owners retain both referenced and preparing
URLs during this interval. Revision checks prevent a cancelled or superseded
image from being published later. Provisional markup also preserves the currently
presented source, even if a newer result has entered the compilation cache.

A native CSS opacity transition restores contrast over 300ms. Readiness tracks
image publication and finite opacity transitions; it does not leave print/export
enabled midway through the reveal. Reduced-motion styles retain full contrast
throughout and omit transitions. Document blocks wait for all their formulas
before publishing, and nested pending wrappers share one opacity treatment.
No filters, per-label `will-change`, bitmap conversion or geometry offsets are used.

Page printing uses an HTML sheet filling the browser's available print area,
with its SVG positioned inside that sheet. `@page` owns physical paper dimensions.
The previous normal-flow SVG repeated physical page height and fragmented past
the available area in native Safari: a two-page A4 fixture showed four sheets.
The new layout showed two under the same print settings; Chromium's PDF also
contains two. See `tests/page-print.mjs` and the native-check notes in
[browser testing](browser-testing.md).

With decoded publication and the reveal included, the same optional Page fixture
completed a cold KaTeX-to-Temml switch in 4.12s (Chromium) and 4.65s (WebKit), with
36ms/33ms switch handlers and no target compilation on the main thread. Queued
input executed during loading. These local diagnostic numbers supersede the
pre-reveal completion times above; they are not frame-rate guarantees. The
Document camera regression still retained all divider nodes with no content
mutations or natural-layout reads during zoom.

## Current-view generation priority

Engine changes snapshot visible canvas objects and the current Page sheet before
clearing the old engine's text caches. Existing measured bounds can be read
without regenerating cached label HTML. This keeps page priority independent of
the sidebar's currently mounted Properties panel. Visible/current-page requests
are primed before background bounds and thumbnail passes; thumbnail staging uses
the same object priorities.

Compilation now has a single in-flight request, with unstarted jobs held in the
main application's priority queue. Completed/cached output still publishes at
most two formulas per frame, ordered by priority. Shared formula requests promote
the existing job rather than duplicating work. The cooperative fallback uses the
same selection rule. Cancellation invalidates any scheduled dispatch callback.

Document mode captures old block rectangles and prioritizes visible blocks and
the current page. It computes heading context in source order and separately
orders publication, so shared/cached results cannot make the top of a long file
consume every publication slot before the user's viewport. This changes work
order only; document order, canvas z-order and final rendering stay intact.

## Vector composition for mixed diagram labels

The original image boundary prevented WebKit foreignObject transform failures,
but still laid out each image's HTML at its small, final font size. That retained
inline rounding and baseline quantization inside the resource. Merely increasing
HTML layout size and scaling its foreignObject was rejected: real painted tests
lost positioned glyphs in WebKit.

Mixed diagram labels now use the same 1024px reference em as text measurement.
Zero-height baseline markers are inserted/read/removed in batches inside the
contained measurement surface, yielding the actual baselines of each inline run.
They do not move glyphs or add visible offsets. A source-coordinate SVG replaces
the HTML: font outlines retain their exact advances, mathematical SVGs retain
their viewBoxes, and CSS rules/backgrounds/overflow clips become SVG geometry.
In particular, KaTeX's radical tails retain their clipping boundary. The output
has no foreignObject; pan/zoom continue to reuse one retained image per label.

A build-time Fontkit extractor produces 20 outline tables from the existing
bundled fonts (about 1.23MB uncompressed source data). No runtime font parser is
added. Synthetic/system-font styles and unsupported scripts retain SVG text and
font fallback; the renderer retains measured Unicode line breaks and word origins rather
than imposing whitespace-only word wrapping. Decorated text retains
native SVG decoration, including spaces. Ordinary Document prose remains HTML.

The three reported inputs are checked against a real pdfLaTeX reference. The
reference confirms a shared baseline for the final bold A and `unitary`, and
identical Computer Modern advances for the two `permutes` runs. Browser SVG
baseline transforms agree, repeated glyph path data/advances are identical, and
prose advances are within .002em of the LaTeX font. Camera tests cover DPR 1/2,
fractional positions and up to 1200% scale. The comparison sheet uses one nominal
font size across LaTeX, Chromium and WebKit; each engine keeps its own formula
fonts and spacing. This is not a claim that complete formula spacing is identical
to TeX: for example, the bundled web font's prose space differs from CMR's TeX
space. No spacing offsets, font substitutions or forced text lengths were added.

Use `npm run test:mixed-labels -- --dist` and
`npm run reference:mixed-labels` to reproduce the proof and reference. The
existing clipping, accent, alignment, export parity, progressive loading and
camera-performance checks also cover this publication boundary.

## Gecko regression coverage

The automated browser matrix now includes Firefox alongside Chromium and WebKit.
The same font data, SVG paths, rendering references and tolerances apply. Firefox
passes the mixed-label LaTeX baseline/advance checks at DPR 1/2 and 100–1200% zoom,
plus direct formula parity against Chromium, clipping, alignment and retained
screen/export image checks. No Gecko-specific rendering offsets or alternate
snapshots are introduced.

Camera and Document performance tests assert zero formula parsing and retained
geometry/DOM during view-only changes. Background engine-switch tests check that
input runs while generation is pending and target compilation stays in workers.
Timing samples are diagnostic, not portable speed guarantees.
