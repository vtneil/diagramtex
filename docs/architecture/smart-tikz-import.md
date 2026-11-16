# Smart TikZ import

DiagramTeX imports figures into its visual editing model. Original source accompanies imported objects; the application does not require a whole-document source editor.

## Implemented

The primary pipeline is **paste TikZ → native DiagramTeX objects → graphical edits → TikZ export**. Rendering an opaque code preview alone is not successful native conversion.

Reusable `pics/name/.style={code=...}`, `pics/name/.pic={...}`, and `pics/.cd` definitions expand into native primitives, including nested pics and pic shift/rotate transforms. Nested numeric `foreach` loops support bounded arithmetic `evaluate={\macro=expression;}` assignments with per-iteration macro scope. Elliptical polar coordinates, arithmetic opacity, axial two/three-stop gradients, and implicit fill closure are evaluated. The stacked-disk fixture becomes 22 ellipses and 198 filled polygons; unsupported/recursive constructs remain explicitly diagnosed rather than being reported as native.

`TD.importLatex(source, { definitions?, editable? })` accepts an optional preamble for a pasted picture. Definitions before a standalone `tikzpicture` are now evaluated too. Each picture starts with the document's preamble styles/macros, without inheriting another picture's local definitions. Scoped definitions are restored when the scope ends.

The bounded evaluator expands fixed and single-argument styles, defaults, and append/prefix style handlers. Expansion has both depth and work limits; recursive/unsupported styles remain code. Labelled rectangle, ellipse and circle nodes retain their borders, fills and editable body text, using text bounds, inner separation and minimum dimensions for layout. Relative positioning uses these node bounds; explicit anchor attachments survive insertion. Relative cubic controls use the start and end points respectively. Coordinate evaluation composes projections (`|-`, `-|`), interpolation, coordinate addition/subtraction, and symbolic polar directions. Evaluation follows source ordering and does not invent values for unknown symbols.

The import result includes `analysis`: entries with `id`, `status` (`editable`, `preserved`, `unresolved`), `code`, `issues`, and `preview`. This is captured before the optional lossy conversion. An unresolved node position, transform, or known unsupported layout construct suppresses that statement's preview. Named nodes propagate unresolved status to later references. Those objects retain their source even in Editable Shapes mode.

The dialog provides an optional definitions field, a preserved-code report and an unresolved-section count. A complete input document remains preferable when a picture depends on its preamble.

## Source write-back and export

Existing picture/statement signatures preserve unchanged source. Translation-only edits retain the existing shift-scope mechanism. Supported native text nodes additionally record a label span and original model text; a label-only edit patches that span when every other field still matches. Unbalanced braces and unescaped comments prevent this fast path. Other edits use the existing model writer. The source metadata is serializable with the document.

Fully native imports retain preamble definitions as source metadata rather than visible code objects. Export conservatively retains imported preamble definitions and explicit library/package declarations, including declarations accompanying an otherwise completely native picture. Definitions containing `@` are no longer discarded. This deliberately keeps extra definitions rather than attempting unsafe pruning of unknown TeX dependencies.

## Boundaries and further work

This is an incremental extension of the existing importer, not a replacement TikZ interpreter. It does not execute arbitrary TeX or load the implementations of external libraries. In particular, `node-families`, `positioning-plus`, procedural headers (`append after command`/`pgfextra`), general fit/span layout, custom `to path`, and complex edge chains are not implemented. The DMFT flowchart regression fixture checks preservation and diagnostics, not a faithful rendered reconstruction.

Further work should introduce typed coordinate/option expressions shared by preview and edit actions; accurate fit and common edge semantics; edit capability metadata; source patches for coordinates/local styling/relative offsets; dependency closure for safely extractable definitions. No TeX compilation service or remote upload was added. Broad shared-style edits must distinguish a local override from changing every user of that style.

## Verification

`node tests/run.mjs import` exercises the browser matrix, golden round trips and real pdfLaTeX compilation. `98-smart-import.js` covers parameterized/default styles, context, nested coordinates, unresolved propagation, recursive styles, scope isolation, source-label patches, explicit libraries, and the external-library flowchart. `99-pic-import.js` verifies native disk conversion, graphical insertion, primitive edits, native export compilation, pic transforms, expansion limits and loop scope. `npm run check` validates TypeScript/Svelte.
