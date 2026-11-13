# Block integration and editor services

## Baseline and scope

The original coupling-reduction baseline is recorded in [rollback.md](rollback.md).
The subsequent TypeScript/Svelte migration baseline and current boundaries are in
[migration.md](migration.md). UI, version 3 file formats and domain behavior remain
compatible. Source modules compile into a classic script for static and local-file use.

## Adding a specialist block

1. Import `runtime` from `src/runtime.ts`. Define shape behavior in `runtime.TYPES`, put property models/actions in `src/ui/models/`, and register its Svelte view in `src/ui/panels.svelte.ts`.
2. In the same domain module, call `TD.blocks.register(type, definition)`.
3. Import model and editor modules in `src/main.ts` in dependency order. Add any new
   non-bundled runtime assets to `public/sw.js` for source/offline hosting. The
   production build derives its precache from the output automatically.
4. Add domain tests, an export/round-trip fixture and, when needed, LaTeX compilation checks.

`src/core/blocks.ts` documents the registration contract. A registration provides:

- Menu label, tooltip, SVG icon and explicit display order. Future-feature placeholders
  remain in HTML; existing block markup and menu order are preserved.
- Whether selection transforms keep the content upright, and the geometry fields exposed
  by the main property panel. All built-in property panels use Svelte views.
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

`src/core/editor-session.ts` supplies history and save/discard lifecycle utilities.
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

`src/core/project-files.ts` owns normalization of file kinds, validation of known shape
types, legacy shape-array loading, retired-object removal and version 3 serialization.
The application retains storage orchestration, file linking, dialogs and document switching.
Existing legacy fixture tests protect the supported formats; serialization remains byte
compatible. Shape-specific `upgrade` hooks still run when the app constructs a document.

Shared services have TypeScript contracts in `src/core/`. Registration modules install
the retained `TD` APIs for debugging and existing editor entry points. The app
uses typed document creation and history services; DOM, input completion and persistence
hooks remain in the application. `src/main.ts` records the startup graph explicitly.
Run `npm run compile` before serving or opening the static source site.

## Verification

- `node tests/run.mjs`: regression suites, golden exports and LaTeX compilation.
- `node tests/run.mjs architecture`: menu equivalence, editor entry points, document undo,
  editor save/discard/reopen and project-codec compatibility.
- `node tests/blocks-workflow.mjs`: real double-click and Escape for every visual block editor.
- `node tests/blocks-workflow.mjs dist`: the same workflow against the production bundle.
- `node tests/bench.mjs`: existing mouse/keyboard workflow costs and outcomes.
- `npm run build`: production bundling and precache generation.

## Maintenance boundaries

Application source, including every scientific engine, is TypeScript. Svelte owns the
shell, main properties, document/page settings, block panels, editor frames and inspectors.
Canvas drawing, source parsers, gestures and generated document/export content remain
imperative TypeScript modules. Keep their algorithms separate from component markup.
See [migration.md](migration.md) for verification and typing boundaries.

No new file-format migration is needed for this pass. When one becomes necessary, add
an explicit version transition in the codec, retain current-version output until the
format intentionally changes, and add fixtures before changing stored data.
