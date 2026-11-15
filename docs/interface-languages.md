# Interface languages

On the first visit, DiagramTeX uses the browser’s preferred language: Thai
(`th` or `th-*`) selects Thai; every other language selects English. Use the flag selector beside
appearance in the top toolbar: **🇬🇧** for English or **🇹🇭** for Thai. The choice applies
immediately and is remembered on this device. If browser storage is blocked, it
lasts for the current session. A saved language choice takes precedence over the
browser preference. No geolocation or network lookup is used.

Thai covers the whole interface: the shell, menus, dialogs, hints, panels, the
Blocks menu and every block editor. Specialist terms stay in English where Thai
software keeps them (gate, wire, LaTeX, TikZ), and so do domain lists that name
what is exported (line styles, arrow tips, font sizes, part and gate names). The guide is available in English at `guide/` and Thai at `guide/th.html`;
its flag links preserve the current section and remember the language choice.
The welcome document is not translated. Document names, text, formulas, code,
control values and exported files are not changed by the interface language.

## Stable messages (current API)

Use `t('files.sort', 'Sort')`: the id describes the meaning and stays unchanged
when English is edited. Different contexts get different ids, even with the same
English caption. `th.ts` maps ids to Thai; missing ids fall back to inline English.
Named placeholders use `t('hint.moved', 'Moved "{name}" to {folder}', { name, folder })`.
Substitutions are literal (including `$`); render through Svelte text or escape
before inserting into HTML. Never interpolate unescaped content into `{@html}`.

Svelte calls pass `{}, $locale` (or parameters, then `$locale`) for reactivity.
Model producers mark captions with `message(id, English, params)`; `caption(value,
$locale)` renders these descriptors and leaves ordinary strings verbatim. Shared
caption descriptors live in `src/i18n/messages.ts`, indexed by stable id.
Thai is split by area: `src/i18n/th.ts` (shell, shared and Blocks menu) merges
`th/app.ts` (app.ts), `th/views.ts` (panels, views, shape names), `th/editors-a.ts`
and `th/editors-b.ts` (block editors). An id lives in exactly one of them. Row and
section helpers accept descriptors. Control text, option labels, colours and
values are ordinary content unless explicitly marked; do not infer captions by
matching their text against the catalog.

Never stitch a sentence from pieces: a sentence is one message, so Thai can
reorder it. Plurals are two whole messages (`n === 1 ? t('x.one', …) : t('x.many',
'{n} files', { n })`). For inline markup use `{@html rich(t(id, 'Press <kbd>L</kbd> …',
{}, $locale))}`: `rich()` escapes everything, then allows only `<kbd>`, `<b>` and
`<strong>` without attributes. Don't pass user content as a parameter to `rich()`.

Shape type names come from `typeName(type)` (ids `shape.<type>`, English from the
type's `name`); Blocks-menu captions from `blockCaption(type, 'label' | 'title',
English)` (ids `block.<type>.label|title`). Both are in `src/i18n/shapes.ts`.

Controllers use `onLocale(refresh)` to run once and on every locale change. It
returns a disposer: call it when a temporary controller is destroyed. Prefer
`bindCaption(element, message, attribute?)` for a persistent text node or
presentation attribute, rather than rebuilding editable fields. Dialogs accept
message descriptors for captions; inputs always remain raw. The CD editor title
and open file-sort menu demonstrate refresh without replacing document content.

Text computed at module load must be lazy (a function or a `message()`), so a
language switch reaches it the next time it is shown.

`node tests/localization.mjs` (also run by `tests/run.mjs`) rejects orphan Thai ids,
an id defined in two catalogs, conflicting English defaults, unequal named
placeholder sets, unequal `<kbd>`/`<b>`/`<strong>` markup, and `shape.`/`block.`
ids for types that don't exist. New UI text goes through `t()` with its Thai in
the same change. Do not add languages.
