# How the DiagramTeX interface is built

Read this before changing code in the shell, the kit, a panel, a block or a block editor. The rules for what to
build are in `../SKILL.md`; this file says where things live and how they fit together.

- **Shell:** `src/index.html` is the template and `src/ui/AppShell.svelte` the shell, prerendered into
  `public/index.html` by `scripts/prerender.js`. Prerendering runs outside a browser, so whatever
  AppShell imports (kit components included) must load without `window` or `document` (`runtime.ts` and the
  tooltip service check for them). `src/main.ts` boots everything. Services are registered on the
  shared `runtime` object (`src/runtime.ts`, also `window.TD`) in `src/register-services.ts` and
  `src/register-blocks.ts`. Styles load in this order: `public/css/tokens.css` (every token, light, dark and
  Increase Contrast), `kit.css` (the kit's controls), `style.css` (areas), then one file for each large area
  (`table.css`, `kmap.css`, `bytefield.css`, `language-menu.css`).
- **The interface kit** (`src/ui/kit`, imported from `'../kit'`) holds the app's controls as Svelte components:
  `Icon` (a named icon from `icons.ts`; `iconSvg(name)` gives the same markup to string-building code),
  `Button` (`variant` default / `primary` / `flat`, `size` `sm`, `danger`, optional leading `icon`), `IconButton`
  (icon only, `title` required, `flat` by default), `Segmented` (a switch: `options`, `many` for toggles, `panel`
  for the properties track), `Checkbox` and `Switch`, `Select` (every pick-one list: option drawings, notes, swatches and groups; `columns` for tiles; `pictures` for picture tiles; `custom` for a typed value; `attached` for a chevron joined to a field), `TextField`, `TexField`
  (`tx` math/text, `none`), `NumberField`, `ColourButton` (swatch and name), `Slider` (with its readout; `defaultValue` for the double-click reset), `Menu` and
  `openContextMenu(items, x, y, pick, { below, owner })` (a right-click menu from data; `below` opens it under a control, `owner` lets that control toggle it), `TextPopup` and `openTextPopup(host, opts)`
  (the in-place label editor, LaTeX or MathLive), `Tooltip` (what every `title` becomes), `Popover` (a panel opened from a control, `below` or `beside`; `openPopover(anchor, { content })` from string-building code)
  and `Flyout` (a tool group that opens on hover; `panel` shows an element the app builds, as the rail's groups do), `PanelSection` / `FormRow` / `Help` (panel sections, labelled
  rows, help, hint and error lines), `Badge`, `EmptyState`, `SearchField`, `Tile` / `TileGrid` (the flyouts' tiles; app-level `ui/ToolPanel.svelte` draws a flyout's sections from data, `ui/ExportPanel.svelte` both Export panels), `SplitButton`,
  `ListRow` (renamed in place), `Toolbar` / `ToolbarGroup`, `Palette` and `CodePane` (a block editor's columns), `EditorFrame` (a block editor's whole window),
  `Dialog` (what `TD.confirm` and friends draw), a `soon` option on buttons and tiles, `Kbd`
  (`keyLabel()` turns `Ctrl+Z` into ⌘Z on a Mac), `Separator` and `Spacer`. Fields keep `liveValue` inside.
  Their CSS is global and class-based in `kit.css`, so code that still builds HTML strings matches them;
  `buttonClass()` gives the button classes; `emptyStateHtml()` / `badgeHtml()` / `splitButtonHtml()` (`kit/markup.ts`)
  an empty message, a count and a split button; `fitToolbar(el)` (`kit/toolbar.ts`) gives a string-built bar the
  Toolbar's narrowing (icons dropped, sideways scroll, edge fades, wheel). Lists are Svelte on `ListRow`
  (`src/ui/FileList.svelte`, `LayerList.svelte`, `QuickList.svelte`), mounted with `renderView` into the list
  element; the area's code keeps its drag, menu and click handlers, which find rows by their data attributes. Behaviour stays in the shared services (`segthumb.ts`,
  `selectmenu.ts`, `sliders.ts`, `tooltip.ts`), which act on every matching element, kit-drawn or not. Never
  hand-write markup the kit has a component for, and never pass icons into a component as SVG strings: add the
  drawing to `icons.ts` once. `npm run dev` serves every component and variant at `/kit.html` (light, dark,
  English, Thai); a new component or variant goes there too. `npm run check` runs `tests/legacy-ui.mjs`, which
  fails when hand-written control markup grows in any file and asks for the baseline to be lowered (`--update`)
  when it shrinks.
- **Moving to the kit, smallest pieces first.** Primitives (done; `Control.svelte`, `FormRows.svelte` and the
  hand-written panels are built from them), then composites (Menu and MenuItem for the eight editors'
  `mItem` copies, Popover/Flyout, Toolbar, Palette, CodePane), then one `EditorFrame` layout for the block
  editors (all built; now replacing the copies from `.interface-design/kit-map.md`), then the app's areas (tool rail, status line, file list, top bar, `app.ts` menus). Each step replaces
  every copy of what it covers and deletes the CSS it takes over. The drawing itself stays imperative: the
  canvas, editor stages (`patchSvg`) and the Document page.
- **The rest of the app is still imperative.** `src/application/app.ts` (canvas, panel and menus),
  `docview.ts` (Document view) and the block editors (`src/editors/*.ts`) build DOM and wire events
  themselves. Svelte owns the shell, the properties panels, the editor frames, Quick's views, the Table's
  (`ui/TableWorkspace.svelte`, `ui/TablePanel.svelte`: models drawn in place; the grid stays imperative) and the
  Document's controls (`ui/DocumentView.svelte`, `ui/DocBlockChrome.svelte`; the page stays markup). Add to whichever side
  already owns the area, using kit components and classes; port an area to Svelte only as a planned kit step,
  not as a side effect.
- **A block** (an object with its own package, such as `kmap` or `chemfig`) is spread over these files:
  - `src/domain/<block>.ts`: parser and writer, layout, canvas drawing and export. It defines
    `TD.TYPES.<type>` (`create`, `svg`, `tikz`, `anchors`…) and calls
    `TD.blocks.register(type, { menu, fixed, geometry, nodeImport, editor })` (`src/core/blocks.ts`). The
    `menu` entry places it in the Blocks flyout (order, label, title, 32×24 line icon), and `nodeImport`
    lets pasted and imported code come back as the block.
  - `src/ui/models/<block>.ts`: `TD.panels.<type>.model(shape)` returns the panel's model. Panel text
    uses `message()` descriptors, not finished strings.
  - `src/ui/panels.svelte.ts`: maps the type to a panel view. Most blocks use `SourcePanel` (title,
    summary, code, warnings and actions); scientific objects use `FormPanel`; a block that needs more gets
    its own `*Panel.svelte`.
  - `src/editors/<x>editor.ts` with `src/ui/editors/<X>editorFrame.svelte`: the overlay editor. The frame
    is one `<EditorFrame …>` (`src/ui/kit/EditorFrame.svelte`) mounted once with `mountFrame`
    (`src/ui/mount-frame.ts`): its name, `data-<act>` prefix, title, icon, captions (`t(…, $locale)`) and a
    `tools` snippet of `IconButton`s and `Separator`s. The controller fills it, finding its parts by class.
- **Every block editor has the same layout,** EditorFrame's: `.modal-box.cz-box` with a `.modal-head` (icon,
  title, `.cz-tools` flat icon buttons, a spacer, then Cancel and **Done** (primary)), and a `.cz-body` with
  `.cz-pal` (search field and list), `.cz-stage` (the SVG and `.cz-tip`) and `.cz-side` (`.cz-props` over
  `.cz-code`: a head with the package name, a count and Copy, the textarea, and `.cz-msg`). Every editor is
  the same size, one rule in kit.css. Don't invent a new arrangement or a per-editor size.

