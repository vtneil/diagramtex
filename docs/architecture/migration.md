# TypeScript and Svelte migration

Starting commit (before migration): `c9cc9012e17fc400de75b3a5512620883dd68210627dd632542024c93298fa1f`

The starting working tree was clean. This commit is the rollback reference for design,
interaction, document formats, generated LaTeX and scientific behavior. No file-format
transition or deployment is part of this migration.

## Completed scope

- All application modules under `src/` are TypeScript or Svelte with TypeScript.
  This includes every diagram, physics, geometry, maths and LaTeX engine, all editor
  controllers, persistence and browser services. Build scripts and the test harness
  remain development-time JavaScript/Python.
- Svelte owns the application shell, shared style/geometry properties, variables,
  components, page/document settings, all specialist property panels, all 15 visual
  editors' frames and inspectors, and shared dialogs. Components reuse the existing
  CSS and controls; no new component library or visual theme was introduced.
- `src/core/` owns document construction, undo/redo, source-editor sessions, the block
  registry, autosave, state and version-3 project-file encoding/legacy migrations.
  `src/platform/` owns storage, file linking, downloads and startup behavior.
- `src/domain/` owns scientific models, parsing, layout, calculations and SVG/TikZ
  generation. `src/ui/models/` adapts those engines to component models and commands.
  Scientific property markup was removed from engine implementations.
- `src/main.ts` declares startup order. Modules import a shared application context
  from `src/runtime.ts`; `window.TD` remains the supported debugging/test API.
  `src/register-blocks.ts` and `src/register-services.ts` register shared services.
- The former `TD.morph` renderer and all panel-HTML fallbacks were removed.
  Retained Svelte views preserve focused input nodes, raw values and caret positions
  during live updates, while the existing transaction paths own edits and undo.
  Imperative segmented-control decorations are removed when a reused container
  changes into another kind of field.

Canvas gestures, SVG rendering, rich document content and some floating menus remain
imperative TypeScript, integrated with the components. These are useful rendering and
interaction boundaries. The runtime registries and extensible parser/shape payloads
still contain explicit dynamic types; the conversion does not make every scientific
syntax tree an exhaustive discriminated union. Core state/history and UI model contracts
are checked, and the full application passes the checker with `strict: true`,
`allowJs: false`, no `ts-nocheck` files and no ignored checker errors.

## Static build and development

Use Node.js 22 or later and the locked dependencies:

```sh
npm ci
npm run dev
npm run check
npm test
npm run build
```

The watcher serves `public/` at `http://127.0.0.1:5173`; reload after edits. Alternatively,
run `npm run compile` before using another static server or opening `public/index.html`.

`src/index.html` is the document template. The build prerenders `AppShell.svelte` and
compiles `src/platform/preflight.ts` inline before styling. Thus the phone explanation,
loading screen, page text, storage-key migration and appearance initialization remain
available at their original startup points. The client hydrates the same shell.
`public/index.html` is generated from these sources; edit the sources instead.

Compilation produces one classic `public/js/app.bundle.js` and a development source map.
Production compilation writes only to `dist/`, with one application script, joined CSS,
local fonts and maths libraries, license notices and a derived offline precache. CSS
minification removes whitespace while retaining original values and selectors, avoiding
colour-rounding changes to antialiased borders. The
browser never requests TypeScript or Svelte source. Static hosting, installation,
offline reload and direct `file://` startup remain supported. No application server,
CDN or runtime framework service is required. Production builds do not rewrite the
watched development output. Wrangler watches `src/` and `public/`.

## UI preservation brief

Retain the drafting-table workflow: paper/sheet/ink/graphite tokens, Atkinson Hyperlegible Next,
existing density, 28px controls, 280px property window, icons, labels, order, focus,
keyboard paths and animations. Components introduce no design CSS. Generated SVG/math
is still rendered by the existing engines; ordinary form content uses component markup.

## Verification

Before migration: 301 tests, 166 golden exports, 235 cached LaTeX compilations,
10 mouse/keyboard workflows (31 steps) and 15 editor entry points.

The expanded suite has **312 passing tests**, the same **166 unchanged golden exports**
and **235 cached LaTeX compilations**. Added checks cover document aliases/history,
component focus/caret/source preservation, transaction boundaries, panel lifecycle,
complete view registration and inspector-decoration cleanup. Engine conversion was
also compared at the compiled JavaScript level before UI changes; calculations and
parser implementations were preserved.

Commands for repeatable validation:

```sh
npm run check
node tests/run.mjs
npm run build
node tests/run.mjs --dist
node tests/bench.mjs --dist
node tests/blocks-workflow.mjs dist
node tests/runtime.mjs --dist
DIAGRAMTEX_BASELINE=/path/to/baseline node tests/migration-ui.mjs --dist
DIAGRAMTEX_BASELINE=/path/to/baseline node tests/editor-migration-ui.mjs --dist
DIAGRAMTEX_BASELINE=/path/to/baseline node tests/shell-migration-ui.mjs --dist
```

Export the recorded starting commit to a temporary checkout for baseline comparisons.
The tests never update goldens. Visual comparison checks control values/datasets,
computed styles, geometry, exact PNG bytes and, for the main panels, project bytes and
TikZ. Only animation/caret painting is disabled, equally on both sides. Property panels
are checked at 1600/1024/820px in both themes; shared settings add defaults, variables,
custom pages/documents, components, multiple selection and polylines. All 15 editors
have frame/inspector comparisons; `MIGRATION_PICK=1` exercises selected objects and
`MIGRATION_PICK=arrow` also exercises CD/Xy arrow controls. `MIGRATION_TYPES` and
`MIGRATION_SCENARIOS` can select a subset. Artifacts are written to temporary directories.

Runtime checks verify consumed shared links, persistence after a genuinely offline reload
with HTTP caching disabled, precached maths/fonts and direct-file startup. The pointer
smoke test opens every visual editor by double-click and closes it with Escape.

A pre-existing baseline limitation was found during the expanded image-panel comparison:
image TikZ export throws `this.fileName is not a function` through the rotation wrapper.
Resolved in the subsequent image-export fix: the wrapper calls the original exporter
with the shape definition as its receiver. Regression checks cover named/generated
filenames, dimensions, graphicx, rotation, opacity and mixed-shape export. Image-panel
visual comparisons exclude the intentionally changed LaTeX result.

Final production verification:

- TypeScript/Svelte checker: 0 errors and 0 warnings; build and whitespace checks pass.
- Source and production: 312/312 tests, 166 golden files and 235 cached TeX compiles.
- Production pointer/keyboard workflows: 10 tasks, unchanged 31 steps; all 15 visual editors open/close.
- Production visual matrix: 162 panel comparisons, 30 editor comparisons and 32 shared-settings
  comparisons pass (224 total), with exact pixels and the comparison contracts above.
- Source and production: shared-link startup, persisted offline reload and direct-file startup pass.
- Connected Browser walkthrough: placed a quantum circuit, edited its input label, verified live
  source/preview changes, undid the edit and reloaded the persisted circuit; no console errors.

Changes remain in the local working tree. Nothing was deployed or pushed.
