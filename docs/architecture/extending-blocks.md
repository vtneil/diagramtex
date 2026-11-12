# Block integration and editor services

## Baseline and scope

The rollback commit is recorded in [rollback.md](rollback.md). This is an incremental
architecture pass: the UI, classic-script loading, version 3 file format, domain
parsers, renderers and exporters retain their existing behavior.

## Adding a specialist block

1. Define its shape behavior in `TD.TYPES` and its properties in `TD.panels`, as before.
2. In the same domain module, call `TD.blocks.register(type, definition)`.
3. Include the model and editor scripts in `public/index.html` in dependency order,
   and include new assets in `public/sw.js` for unbuilt/offline hosting. The production
   build derives its precache from the output automatically.
4. Add domain tests, an export/round-trip fixture and, when needed, LaTeX compilation checks.

`public/js/blocks.js` documents the registration contract. A registration provides:

- Menu label, tooltip, SVG icon and explicit display order. Future-feature placeholders
  remain in HTML; existing block markup and menu order are preserved.
- Whether selection transforms keep the content upright, and the geometry fields exposed
  by the main property panel. Circuit blocks intentionally retain their existing panel.
- An optional editor resolver, existing public panel alias, options and preparation hook.
- An optional result applier (circuit blocks use `items` and `raw`; others use `src`).
- Optional layout bounds for preserving the drawing's position after edits. K-map and
  bytefield intentionally apply bounds offsets even to empty layouts; other positioned
  editors require both old and new layouts to be nonempty.
- Optional TikZ-node import recognition and placement. Import precedence is explicit
  and preserves the existing parser order; syntax outside a node may still require
  specialized parser support.

The main app has one `openBlock(id)` transaction. Enter, double-click, context actions
and the retained public aliases use it. The live object is resolved again on save;
callbacks for deleted objects do not recreate them. UI selection refresh differences,
CD legacy upgrade, flat 2D geometry options and the XyMatrix adapter remain explicit.

## Shared editor infrastructure

`public/js/editor-session.js` supplies history and save/discard lifecycle utilities.
K-map and bit-field editors are the initial adopters. State remains owned by each
editor session, including the existing 200-step history limit, source snapshots,
selection clamping and domain rendering. The lifecycle preserves Save without closing,
Done, confirmation before discarding and unsaved-change checks. Bit-field label cleanup
is a domain hook.

Other editors should adopt these utilities only after checking their differences.
In particular, source snapshots, parsed models, in-place labels and selection restore
are not interchangeable across editors. Domain gestures and layout do not belong in
the shared service.

## Project files and dependencies

`public/js/project-files.js` owns normalization of file kinds, validation of known shape
types, legacy shape-array loading, retired-object removal and version 3 serialization.
The application retains storage orchestration, file linking, dialogs and document switching.
Existing legacy fixture tests protect the supported formats; serialization remains byte
compatible. Shape-specific `upgrade` hooks still run when the app constructs a document.

New source contracts have JSDoc documentation. This pass does not introduce a TypeScript
compiler or claim project-wide static type checking. Scripts still load without a server
or a build. Dependencies are documented at each new service boundary and ordered in HTML.

## Verification

- `node tests/run.mjs`: regression suites, golden exports and LaTeX compilation.
- `node tests/run.mjs architecture`: menu equivalence, editor entry points, document undo,
  editor save/discard/reopen and project-codec compatibility.
- `node tests/blocks-workflow.mjs`: real double-click and Escape for every visual block editor.
- `node tests/blocks-workflow.mjs dist`: the same workflow against the production bundle.
- `node tests/bench.mjs`: existing mouse/keyboard workflow costs and outcomes.
- `npm run build`: production bundling and precache generation.

## Remaining work

These boundaries enable later steps without a rewrite. Wider extraction of selection,
document history and export orchestration from `app.js` remains future work. So do adoption
of the editor utilities by other domains, broader command registration, project-wide
static checking and any ES-module conversion. ES modules need explicit compatibility
work because opening `public/index.html` directly is a supported workflow.

No new file-format migration is needed for this pass. When one becomes necessary, add
an explicit version transition in the codec, retain current-version output until the
format intentionally changes, and add fixtures before changing stored data.
