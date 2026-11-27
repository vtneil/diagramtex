# Codebase Bug Audit — `src/` (2026-11-27)

Static & code-path audit of `src/` (~96.6k LOC; `npm run check` passed with 0 errors and 0 warnings at time of audit) across four areas:

1. Domain parsers, evaluators, importers & exporters (`src/domain/`)
2. Core services, platform persistence & cross-cutting security/XSS (`src/core/`, `src/platform/`, `src/main.ts`, sinks across `src/`)
3. Application state, canvas interaction & document view (`src/application/`)
4. Overlay block editors & Svelte UI services/components (`src/editors/`, `src/ui/`)

All findings below were verified against source lines.

---

## Summary

| Severity | Count | Focus |
| --- | ---: | --- |
| **Critical** | 5 | Infinite loops / OOM hangs on malformed TeX/TikZ/block input |
| **High** | 10 | HTML/SVG injection & `conformShape()` bypasses, data loss, dead feature, editor crashes |
| **Medium** | 10 | Async/disk race conditions, broken undo/recovery, edge-case crashes, listener leaks |
| **Low** | 5 | Unhandled `TypeError`, keyboard focus edge case, timer race, prototype lookup |

---

## Critical

### 1. Infinite loops on unclosed `[` / `{` in PGFPlots importer
- **Location:** `src/domain/pgfplots-import.ts:276-286`, `351-356` (also missing `-1` checks at `249`, `251`, `261`, `265`, `304`)
- **Root Cause:** `matchClose()` returns `-1` when a bracket or brace is unclosed. Multiple branches in `scan()` do not check `e < 0` before advancing the cursor:
  - `\legend` / `\addlegendentry` (L278–284): `i = e + 1` or `j = skipWs(e + 1)` resets the index to `0`.
  - `DEFINES` such as `\newcommand` (L353–355): `k = matchClose(s, k) + 1` resets `k` to `0`, then `skipArgs(0)` returns `0`, setting `i = 0`.
  `while (i < s.length)` then re-reads from index `0` forever.
- **Trigger:**
  - `\begin{axis}\addlegendentry{unclosed\end{axis}`
  - `\begin{axis}\addlegendentry[unclosed\end{axis}`
  - `\begin{axis}\newcommand{unclosed\end{axis}`
- **Suggested Fix:** Check `if (e < 0)` after every `matchClose()` call and add a monotonic progress guard (`if (i <= prev) i = prev + 1`) on `scan()`'s `while` loop.

### 2. Four infinite loops (+ OOM) on unclosed delimiters and unbounded repeat count in `timing.ts`
- **Location:** `src/domain/timing.ts:236-237`, `303-309` (`readChars`), `339-344`, `378-385`, `389-395` (`readExtra`)
- **Root Cause:**
  1. `close()` returns `-1` on unclosed `{` or `[`. Four branches (`!{...`/`@{...`, `\begin{pgfonlayer}{...`, `\vertlines`/`\horlines`, `\tablegrid`/`\fulltablegrid`) assign `i = e + 1` without checking `e < 0`, rewinding to `0` while pushing to `out` until OOM.
  2. In `readChars` (L236–237), `n = Math.round(parseFloat(nm[0]))` has no upper bound; `for (let r = 0; r < n; r++)` hangs/OOMs on huge repeat counts.
- **Trigger:**
  - Row: `A & !{unclosed` or `A & 99999999{H}`
  - Extra code: `\extracode \vertlines[unclosed` / `\tablegrid[unclosed` / `\begin{pgfonlayer}{unclosed`
- **Suggested Fix:** Guard every `close()` with `if (e < 0) { i = s.length; break; }`, add a monotonic loop guard, and cap `n` in `readChars` (e.g. `Math.min(n, 2000)`).

### 3. Infinite loop + OOM in TikZ `\matrix` with whitespace `ampersand replacement`
- **Location:** `src/domain/tikzimport.ts:2428` (`matrixStatement`), `2381-2384` (`matrixRows`)
- **Root Cause:** `parseOpts` strips outer `{}` from `ampersand replacement={ }`, leaving `ampO.v = ' '` (truthy). L2428 computes `amp = ampO?.v ? String(ampO.v).trim() : '&'`, yielding `amp = ''`. In `matrixRows()`, `body.startsWith('', i)` is always `true` at `d === 0`, and `i += amp.length` adds `0`, pushing empty cells until OOM.
- **Trigger:** `\begin{tikzpicture}\matrix[ampersand replacement={ }] {a & b \\};\end{tikzpicture}`
- **Suggested Fix:** Compute `const amp = String(ampO?.v ?? '').trim() || '&';`.

### 4. Infinite loops + OOM in `chemfig.ts` (hashed wedge step `<= 0` and unclosed `\chemmove` `to[`)
- **Location:** `src/domain/chemfig.ts:800`, `1111-1115` (`drawBond` / `applyKV`), `1934-1938` (`readPath`)
- **Root Cause:**
  1. `applyKV` sets `P.dashOn` (`cram dash width`) and `P.dashOff` (`cram dash sep`) without enforcing a positive step. In `drawBond()` (L800), `for (let s0 = 0; s0 < Lb; s0 += P.dashOn + P.dashOff)` loops forever and appends to `d` until OOM whenever `P.dashOn + P.dashOff <= 0`.
  2. In `readPath()` (L1937), `close(p, i)` is not checked for `e < 0`. When `[` is unclosed, `e = -1` sets `i = 0`, re-reading `(a)` and `to[` forever until OOM.
- **Trigger:**
  - `\setchemfig{cram dash width=0pt, cram dash sep=0pt}\chemfig{A>:B}`
  - `\chemfig{@{a}A-@{b}B}\chemmove{\draw (a) to[bend left (b);}`
- **Suggested Fix:** Require `const step = P.dashOn + P.dashOff; if (step > 1e-6)` in `drawBond()`; return `null` when `e < 0` in `readPath()`.

### 5. Infinite loop + OOM (`tokens`) and uncaught `TypeError` crash (`cell` / `argAt`) in `xy.ts`
- **Location:** `src/domain/xy.ts:210-218` (`tokens`), `41` (`argAt`), `186` (`cell`)
- **Root Cause:**
  1. In `tokens()` (L215), when `^{` or `_{` is unclosed, `Z.close()` returns `-1` and `i = j + 1` resets `i = 0`, looping until OOM.
  2. In `cell()` (L186) and `argAt()` (L41), `/^\\([A-Za-z]+|.)/.exec(text.slice(i))` returns `null` if `\` is at EOF or followed by `\n` (since `.` does not match `\n`), crashing on `m![1]` / `m![0]`.
- **Trigger:**
  - Hang: `\xymatrix{ A \ar@{^{-> [r] & B }`
  - Crash: `\xymatrix{ A \` (EOF) or `\xymatrix{ A \` followed by a newline `& B }`
- **Suggested Fix:** Break when `j < 0` in `tokens()`; use `/^\\([A-Za-z]+|[\s\S]?)/` in `cell()` and `argAt()`.

---

## High

### 6. HTML/XSS injection via unescaped `align` and `borders` in Classic document blocks
- **Location:** `src/application/docview.ts:502-503`, `569-574`, `702`, `709`, `1696`, `1720`
- **Root Cause:** Untrusted `b.align` and `b.borders` from `.diagramtex` files or `#` share links are not validated on load and are interpolated raw into `style="text-align:${b.align}..."` and `class="dtab b-${b.borders}..."`. Both are injected via `innerHTML` into the live document view and into standalone exported HTML via `TD.docToHtml()` (which has no CSP).
- **Trigger:** Open a `.diagramtex` file or `#` share link with `kind: "classic"` containing `{"type": "text", "align": "\"><img src=x onerror=alert(1)><div style=\"", "text": "hi"}` or equivalent `table.borders`.
- **Suggested Fix:** Allowlist `b.align` (`left`, `center`, `right`, `justify`) and `b.borders` to valid enum values, and escape with `esc()`.

### 7. SVG/HTML injection bypassing `conformShape()` via three paths
- **Locations:**
  - `src/domain/rawtikz.ts:14`, `66`; `src/core/document.ts:21-33`, `48`
  - `src/domain/shapes.ts:1782`, `1833`, `1842`, `1853`; `src/core/conform.ts:8`, `27-37`
  - `src/core/named-styles.ts:23-26`, `36`, `39-43`, `56-68`; `src/core/document.ts:50-51`
- **Root Causes:**
  1. **`tikz.prev` nested shapes:** `makeDocument()` only runs `conformShape()` on top-level shapes. `rawtikz.ts` renders nested `shape.prev` entries via `TD.TYPES[p.type].svg()` directly into SVG markup without conforming them.
  2. **`text.radius`:** `radius` is absent from `NUMERIC`, `T.text.create()`, and `state.defaults`, so a string `radius` on a boxed `text` shape passes `conformShape()` untouched and is interpolated raw into `rx="${s.radius || 0}"` in `T.text.svg()` and `T.text.shadowShape()`.
  3. **`page.styles` (`named-styles.ts`):** `stylesOf()` and `fieldsOn()` do not restrict `style.keys` to `STYLE_KEYS` or conform their values. Applying, resetting, or syncing a style copies arbitrary unsanitized markup strings directly onto shapes.
- **Trigger:** Open an untrusted `.diagramtex` file or `#` share link carrying any of the three payloads (injects arbitrary SVG/HTML into canvas, SVG export, and CSP-free HTML export).
- **Suggested Fix:** Recursively conform `shape.prev` on load; add `'radius'` to `NUMERIC` and format with `r2(Number(s.radius) || 0)` in `T.text.svg()`; restrict and conform `style.keys` to `STYLE_KEYS`.

### 8. "Make Component" context menu action is dead code
- **Location:** `src/application/app.ts:5148`, `5518`, `5537`
- **Root Cause:** `openCtx()` registers the menu item with action `'comp:make'` (L5148). `ctxAct()` splits on `':'` (`const [a, arg] = act.split(':')`, L5518), then checks `if (a === 'comp:make') makeComponent();` (L5537). Because `a === 'comp'`, the condition is always `false`.
- **Trigger:** Select 2+ shapes on the canvas → right-click → click **Make Component**. Nothing happens.
- **Suggested Fix:** Change L5537 to `if (a === 'comp' && arg === 'make') makeComponent();`.

### 9. Crash & data loss when closing/detaching docked block editors within 250ms of code-pane typing
- **Location:** `src/core/editor-session.ts:124-132`, `151`, `165-178`; `src/editors/editor-code.ts:7-10`; all 18 block editors' `readCode()` (e.g. `bfeditor.ts:933`, `qceditor.ts:1334`, `cdeditor.ts:920`, `cfeditor.ts:1878`, `g3editor.ts:1254`, `networkeditor.ts:1425`, `tmeditor.ts:1118`)
- **Root Cause:**
  1. `detach()` (L151) calls `release()` before `finish(true)`. `release()` reparents `root` (`document.body.appendChild(root)`), dropping `document.activeElement` from `codeTa` without firing `blur`. `finish(true)` then checks `if (document.activeElement === code) readCode()`, which is `false` — losing the last <250ms of typed code and memoizing stale state.
  2. `E.codeTimer` is not cleared before `clear()` sets `E = null`. `editor-code.ts:8` schedules `setTimeout(ed.read, 250)` without guarding `ed.state()`, and none of the 18 editors' `readCode()` check `if (!E) return;` before `clearTimeout(E.codeTimer)`, throwing `TypeError` 250ms later.
- **Trigger:** In Quick mode, open any dockable block editor, type in its LaTeX code textarea, and switch drawings/modes within 250ms.
- **Suggested Fix:** Guard `if (ed.state()) ed.read()` in `editor-code.ts:8`; in `editor-session.ts:151`, flush `settle()`, `readCode()`, `commit()`, and clear pending `codeTimer` before `release()`.

### 10. MathLive corrupts initially empty `math: true` labels with nested `$...$`
- **Location:** `src/ui/kit/TextPopup.svelte:131-136`
- **Root Cause:** `wrap` is computed as `math ? !!v0 : ...`, so when `v0 === ''`, `wrap` is `false`. `onInput` reuses `wrap` (`wrap && u ? u[1] : v`) to strip outer `$...$`. When MathLive starts in math mode on an empty label and emits `"$x$"`, the `$` delimiters are not stripped, writing invalid LaTeX such as `\gate{$x$}` in `qceditor.ts:959` or annotations in `tmeditor.ts:902`.
- **Trigger:** Enable MathLive text input, open Quantum Circuit or Timing editor, double-click an empty math label, and type any expression.
- **Suggested Fix:** Change L135 to `oninput?.((math || wrap) && u ? u[1] : v);`.

### 11. `toggleFormat(..., force = true)` sets browser selection onto a detached DOM node
- **Location:** `src/application/doc-inline.ts:676-685` (called from `src/application/docview.ts:1389`, `1408`)
- **Root Cause:** When updating colour, highlight, or link on text already wrapped in an ancestor `anc` with the same command, L678 updates `anc` and calls `unwrap(e)`, detaching `e` from the DOM. L680–685 then restore the selection using `made[0]` / `last`, which still reference the detached `e` node.
- **Trigger:** In Document view inline editing, select text that already has a text colour, highlight, or link and apply a new colour/highlight/link.
- **Suggested Fix:** Replace `made[i] = anc` when unwrapping `e` on L678.

### 12. Async race in Document view `addImage()` crashes or overwrites blocks in another document
- **Location:** `src/application/docview.ts:1428-1442`
- **Root Cause:** `addImage(at, replaceIdx)` captures only numeric indices across `await readPicture(f)`. If the user switches files, reorders blocks, or switches to Page mode before decoding completes, `.then()` mutates the newly active document's `blocks` or throws `TypeError`.
- **Trigger:** Insert or replace a large image in Document view and switch files while `readPicture(f)` is in flight.
- **Suggested Fix:** Capture `const targetDoc = doc()` (and target block reference for `replaceIdx`) before `readPicture(f)` and abort if `doc() !== targetDoc`.

### 13. Silent data loss on `.xlsx` import for `#` decimal number formats
- **Location:** `src/domain/table/import.ts:830-833` (`formatXlsxNumber`)
- **Root Cause:** `x.toFixed(dm[1].replace(/#/g, '').length || 0)` strips `#` *before* computing the precision passed to `toFixed()`. Formats like `0.##` or `#,##0.###` call `x.toFixed(0)`, truncating `3.14` to `"3"`, and `0.0#` truncates `3.14` to `"3.1"`.
- **Trigger:** Import an `.xlsx` file with cells formatted using `#` after the decimal point (`0.##`, `0.0#`, `#,##0.##`).
- **Suggested Fix:** Call `x.toFixed(dm[1].length)` and trim trailing zeros only down to `minDecimals = dm[1].replace(/#/g, '').length`.

### 14. Table LaTeX export corrupts multiline math/environments and `\\cr` / `\\begin`
- **Location:** `src/domain/table/latex.ts:60-78` (`guardStructure`), `202-210` (`content`)
- **Root Cause:**
  1. `content()` unconditionally splits on `\n` and joins with ` \\ ` inside `\begin{tabular}[t]{@{}l@{}}...\end{tabular}` (or `\newline` in wrap columns), breaking multiline `$...$` or `\begin{pmatrix}...\end{pmatrix}` cells into uncompilable LaTeX.
  2. `guardStructure()` does not count preceding backslashes, so `\\cr` or `\\begin{...}` (a line break `\\` followed by text `cr`/`begin`) is rewritten to `\\textbackslash{}cr`.
- **Trigger:** Export a table cell containing `$\begin{pmatrix}\n1 & 2 \\\\\n3 & 4\n\end{pmatrix}$` or `$a +\nb$`.
- **Suggested Fix:** Split `\n` only outside math mode and `envRanges` (replacing newlines inside math/envs with spaces); skip matches preceded by an odd number of backslashes in `guardStructure()`.

### 15. Floating-point ULP infinite loops and unescaped `RegExp` crash in `pgfplots-import.ts`
- **Location:** `src/domain/pgfplots-import.ts:183`, `297`, `369` (`expandItems`), `485` (`expandList`), `794` (`xtick/ytick distance`)
- **Root Cause:**
  1. The three range loops check `(c - b) / st <= 1000` (or `200`) and iterate `v += st` with no `if (v + st === v) break;` guard (unlike `plots.ts`). When `b` is large enough that `b + st === b` in IEEE-754 double precision, the loop hangs until OOM.
  2. L183 (`declare function` parameter names) and L297 (environment names, only escaping `*`) interpolate user input unescaped into `new RegExp(...)`, throwing `SyntaxError`.
- **Trigger:** `xtick={1e16,...,10000000000000010}`, `\begin{foo(bar}`, or `declare function={f(x[1])=x;}`.
- **Suggested Fix:** Add `if (v + st === v) break;` and an explicit iteration cap to all three loops; escape all regex metacharacters before `new RegExp(...)`.

---

## Medium

### 16. Race condition between `saveDoc()` and `autoWrite()` on disk-linked files
- **Location:** `src/platform/filelink.ts:98`, `125-170`
- **Root Cause:** `autoWrite()` serializes `look()`, `write()`, and `link()` via `queue(id, ...)`, but `saveDoc()` only queues `look(id)` (L151) and runs `write(h, text)` (L160) and `link(id, h, text)` (L166) outside the queue. Concurrent calls can race on `FileSystemWritableFileStream` (an older autosave overwriting a newer manual save) or cause `autoWrite()` to see `saveDoc()`'s write before `link()` updates `r.hash`/`r.mtime` and falsely trigger `hold(id)` (external-modification conflict).
- **Suggested Fix:** Execute `write(h, text)` and `link(id, h, text)` inside `queue(id, ...)` in `saveDoc()`.

### 17. `conform()` passes `{ x: 40, y: 40 }` as `defaults` to `type.create()`, breaking untrusted shape repair
- **Location:** `src/application/app.ts:153-162`; `src/core/conform.ts:27-36`
- **Root Cause:** `type.create({ x: 0, y: 0 }, { x: 40, y: 40 }, sh.type)` passes `{ x: 40, y: 40 }` instead of `state.defaults`. Template shapes receive `stroke: undefined`, `width: undefined`, etc. Because those keys exist on `template` with value `undefined`, `conformShape()` falls back to `null` / `0` (invisible shapes) instead of `state.defaults`.
- **Suggested Fix:** Pass `state.defaults` as the second argument: `type.create({ x: 0, y: 0 }, state.defaults, sh.type)`.

### 18. `restoreRecovery()` leaves disk-linked files marked clean
- **Location:** `src/application/app.ts:999-1010`
- **Root Cause:** Restoring an older version from Version History overwrites browser storage and calls `openDoc(id)`, which marks the document synced and never calls `diskChanged(id)`. The UI shows green "saved to disk" even though the disk file still holds the pre-restore version, and closing the tab will not warn.
- **Suggested Fix:** Call `if (TD.files.fileOf(id)) diskChanged(id);` (and `scheduleSave()` if auto-saving).

### 19. Image caption `change` handler passes stale `editingIdx`, dropping undo history
- **Location:** `src/application/docview.ts:1550-1552`; `src/application/doc-history.ts:52`
- **Root Cause:** L1550 resolves the image block from `+(blk as HTMLElement).dataset.i!`, but L1552 calls `changed([editingIdx])`. Clicking outside the caption clears `editingIdx = -1` before `change` fires, causing `doc-history.ts` to skip serializing block `i` and drop the undo entry.
- **Suggested Fix:** Save `const i = +(blk as HTMLElement).dataset.i!;` and call `changed([i]);`.

### 20. `TD.docToHtml()` omits `TD.math.useMacros()` and `TD.math.synchronous()`
- **Location:** `src/application/docview.ts:1690-1695` (compare `690-694`)
- **Root Cause:** `TD.docToHtml()` calls `pageHtml(true)` directly without loading `doc().page?.macros` or running inside `TD.math.synchronous(...)`, allowing `<span class="math-pending">` placeholders or missing macros in exported standalone HTML.
- **Suggested Fix:** Call `TD.math.useMacros(doc().page?.macros)` and wrap `pageHtml(true)` in `TD.math.synchronous(...)`.

### 21. Async document/block-switch races in `app.ts` and `networkeditor.ts`
- **Location:** `src/application/app.ts:4332-4358`, `4437-4442`; `src/editors/networkeditor.ts:478-526`
- **Root Cause:**
  - `takePictures()`, `takeText()`, and URL `drop` in `app.ts` insert fetched/decoded images after `await` without verifying `state.docId` / `state.mode` did not change.
  - `networkeditor.ts` calls `E.edited.delete(name)` after `await TD.files.data.write(...)` with no `if (!E) return;` check (crashing if closed), misses a re-check after `await TD.ask(...)` in `reloadFile()`, and checks `!E` instead of session identity (`E !== cur`), allowing CSV loads to overwrite another network block in Quick mode.
- **Suggested Fix:** Capture target document/session identity before `await` and abort if it changed.

### 22. `downloadImage()` scheme filter bypass and `parseColor()` SVG attribute breakout
- **Location:** `src/platform/download.ts:37-43`; `src/core/conform.ts:33`; `src/domain/fills.ts:43`, `49-50`, `60`; `src/domain/shapes.ts:45-50`
- **Root Cause:**
  - `downloadImage()`'s denylist regex fails to block `java\tscript:alert(1)` or leading C0 control characters (`\x01javascript:...`), which browsers strip when parsing `a.href`.
  - `conformShape()` skips object fills (`{ g: ..., stops: [...] }` / `{ p: ..., color: ... }`), and `TD.parseColor()` slices `#...` without validating hex digits, letting crafted strings like `"#\"><svg"` break out of SVG attributes in `defsEl.innerHTML`.
- **Suggested Fix:** Resolve URLs via `new URL()` with a strict protocol allowlist in `downloadImage()`; validate hex digits in `TD.parseColor()` and sanitize object fills in `conformShape()`.

### 23. Null dereference in `fromMath()` on trailing `\` or `\` before newline
- **Location:** `src/ui/services/mathinput.ts:81-84`
- **Root Cause:** `/^\\([A-Za-z]+|.)/.exec(tex.slice(i))` returns `null` when `\` is at EOF or followed by `\n`, throwing `TypeError` on `c![0]`.
- **Suggested Fix:** Use `const tok = c ? c[0] : '\\';` or `/^\\([A-Za-z]+|[\s\S]?)/`.

### 24. `Space`-to-pan stuck on window blur (16/18 editors) and missing `pointercancel` / unmount cleanup
- **Locations:**
  - 16 block editors (all except `cleditor.ts:1112` and `phyeditor.ts:816`), e.g. `src/editors/qceditor.ts:1388-1404`, `src/editors/g3editor.ts:1290-1311`
  - `src/ui/services/table.ts:1086-1094`, `src/ui/ColorPicker.svelte:53-58`, `src/ui/GradientPane.svelte:41-43`, 17/18 block editors (all except `zxeditor.ts:555`)
- **Root Cause:** Holding `Space` and Alt/Cmd+Tabbing leaves `E.space = true` (and `grab` cursor in `g3editor.ts`) until `Space` is pressed again. Drag handlers in `table.ts`, `ColorPicker.svelte`, `GradientPane.svelte`, and 17/18 block editors lack `pointercancel` cleanup (and `GradientPane.svelte` leaks `window` listeners if closed via `Esc` mid-drag).
- **Suggested Fix:** Reset `E.space` on `window` `blur`; wire `pointercancel` to the `pointerup` teardown and clean up active drag listeners on component unmount.

### 25. Division by zero in `phys-optics.ts` and invalid hex colors in table LaTeX import
- **Location:** `src/domain/phys-optics.ts:89-96`; `src/domain/table/import.ts:447-449`
- **Root Cause:**
  - In `phys-optics.ts`, grazing incidence (`dt === 0`) or a zero-focal-length lens (`v.f === 0`) produces `Infinity` -> `[NaN, NaN]` rays in SVG/TikZ output.
  - In `table/import.ts`, `colorOf()` does not check `isFinite` or clamp `[0, 255]` for `rgb`/`RGB`/`gray`, emitting `#NaNNaNNaN` or negative hex strings.
- **Suggested Fix:** Guard `Math.abs(dt) < 1e-9` and `!v.f` in `phys-optics.ts`; validate `isFinite` and clamp channels to `0..255` in `colorOf()`.

---

## Low

### 26. Unhandled `TypeError` in `project-files.ts` `parse()` on non-iterable `blocks`
- **Location:** `src/core/project-files.ts:37`, `51`
- **Root Cause:** `dropRetiredDoc(doc)` iterates `doc?.blocks || []` before `parse()` verifies `Array.isArray(doc.blocks)` (L69), throwing an unhandled `TypeError` on `{"blocks": {}}` instead of returning `{ code: 'invalid' }`.
- **Suggested Fix:** Guard `if (Array.isArray(doc?.blocks))` on L37.

### 27. `Shift+Tab` crash on single-button dialogs (`TD.alert`)
- **Location:** `src/ui/services/dialog.ts:68-73`
- **Root Cause:** When `n === 1` and focus is outside the button (`i === -1`), `(-1 + (1 - 1)) % 1 === -1`, so `f[-1].focus()` throws `TypeError`.
- **Suggested Fix:** Guard `if (!n) return;` and add `+ n` before `% n`.

### 28. Rapid close/reopen timer race in Command Palette
- **Location:** `src/ui/services/palette.svelte.ts:199-215`, `249`
- **Root Cause:** `close()` schedules an untracked 120ms `setTimeout` to set `root.hidden = true`. Reopening within 120ms gets hidden when that timeout fires, and pressing `Cmd+K` during the 120ms fade calls `close()` again instead of reopening.
- **Suggested Fix:** Track and cancel `closeTimer` in `open()` and `close()`, and treat `closing` as hidden in the toggle handler.

### 29. Prototype property lookup in math expression evaluators
- **Location:** `src/domain/geo3d.ts:363`, `src/domain/params.ts:54`, `85`
- **Root Cause:** `FN[w]` looks up `Object.prototype` properties (`toString(1)`, `valueOf(1)`), injecting `"[object Object]"` into numeric evaluation.
- **Suggested Fix:** Use `Object.create(null)` or `Object.hasOwn(FN, w)`.

### 30. Literal `"undefined"` emitted for 4-part `\ang{a;b;c;d}`
- **Location:** `src/domain/math-rewrite.ts:631-634`
- **Root Cause:** `marks` only has 3 entries (`°`, `'`, `''`), so a 4th `;`-separated part appends `marks[3]` -> `"undefined"`.
- **Suggested Fix:** Use `(marks[k] || '')` or slice `parts` to 3 entries.

---

## Resolution (2026-11-27)

Every finding was checked against the source before it was changed.

| # | Outcome |
| --- | --- |
| 1–5, 15 | Fixed. A sweep of the same files found and fixed more of the same kind: the timing `M` and grid loops, `envEnd`'s regex and macro names in tikzimport, chemfig's arrow-label `*{`, and xy's `pathToTurns`. Regression test: `tests/parser-hangs.mjs` (44 cases, each in its own process with a time limit; 35 fail on the old code). Note: #5's hang trigger as written doesn't hang through `toTikzcd`, and #15's `f(x[1])` builds a valid regex; nearby variants did hang or throw. |
| 6 | Fixed: allowlists for `align`, `borders` and `size` in `docview.ts`, which the live view and both exports use. Also fixed: `b.size` in the LaTeX export and a crash on a string `b.width`. Test: `tests/suites/85-security-doc-blocks.js`. |
| 7 | Fixed: nested `prev` shapes repaired on load and on paste, `radius` made numeric (and rounded wherever it's written), named styles limited to the allowed keys, each value checked and names checked. |
| 8 | Fixed. |
| 9 | Fixed in `editor-session.ts` (new `flush()`; pending timer cleared on close) and in `editor-code.ts` (the timer only reads while the same editor is still open). Test: `tests/suites/99-editor-code-close.js`. The bug only showed in Firefox and WebKit; Chromium fires a `blur` that hides it. |
| 10 | Fixed. Test: `tests/suites/96-mathlive-empty-label.js`. |
| 11 | Fixed (impact was a lost selection only). |
| 12, 19, 20 | Fixed. |
| 13, 14 | Fixed. Ordinary table cells export byte-identical (200k random cells compared). Test: `tests/domain-edge-cases.mjs`. |
| 16, 18 | Fixed. |
| 17 | Fixed, but differently from the suggestion: templates and fallbacks use the built-in starting defaults, not `state.defaults`, because a user's custom px size would otherwise replace every loaded size. |
| 21 | Fixed in `app.ts` (file, mode and drawing re-checked after every wait, including the spreadsheet import) and `networkeditor.ts` (session identity checked after every wait). |
| 22 | Fixed: `imageUrl()` allows only `blob:`, `http(s):` and `data:image/…`; `parseColor` keeps only letters and digits; gradient and pattern fills are rebuilt from their known fields. |
| 23, 26, 28, 29, 30 | Fixed. |
| 24 | Fixed: Space is released when the window loses focus in all 16 editors that lacked it; `pointercancel` handled in 17 editors, `table.ts`, `ColorPicker.svelte` and `GradientPane.svelte`; GradientPane's window listeners removed on unmount. Test: `tests/suites/94-drag-cancel.js`. |
| 25 | Colour part fixed. The phys-optics part is not a bug: the lens refuses `f = 0` (`nonzero`), and `G.raySeg` returns null for a ray parallel to the surface. |
| 27 | Not a bug: `(-1 + 0) % 1` is `-0`, and `f[-0]` is `f[0]`. A guard for dialogs with no buttons was added. |

Also fixed: `textBox()` wrote a text's `align` raw into an inline style; the TikZ export wrote `align=` and `\<size>` raw.

The app page's CSP has no `'unsafe-inline'` for scripts: `src/index.html` holds a placeholder that `scripts/prerender.js` replaces with the preflight script's hash. A comment now says so.
