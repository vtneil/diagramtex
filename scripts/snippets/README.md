# Snippet corpus for the offline parity run

Real LaTeX, cut out of real documents, to check what DiagramTeX can render and how closely it matches LaTeX. It
covers three classes:

- **math**: a formula as a label would hold it.
- **tikz**: one `tikzpicture`. Tags give quotas to families such as geometry (geo2d), flowcharts, 3D solids, plots,
  decorations and styles.
- **lib**: one library block, matching the app's blocks and the packages its importer knows. The libraries are:
  - quantikz (qc), tikz-cd (cd), xymatrix (xy), forest
  - circuitikz (cz), chemfig, tikz-chemlab (chemlab), tikz-timing (timing), bytefield, karnaugh-map (kmap)
  - pgf-umlcd (uml), pgf-umlsd (umlsd), tikz-feynman (feynman), tikz-3dplot (geo3d), automata, zx-calculus (zx)
  - blochsphere (bloch), TikZ `\graph` (graph), pgfplots (plots, with tags for 3D, bars, contour, scatter,
    groupplots, polar and log axes, fill-between, functions and data), pgf-pie (pie charts), tkz-euclide
  - smartdiagram, tikz-qtree, pgfgantt, tikz-network, bodegraph

Classic Document text is out of scope. So is the physics block: it reads its own `\physics{…}` notation, which
real documents don't contain.

There are two tiers:

- **Curated** (`cases/`, about 10,000): a stratified pick with a dev/held-out split.
- **Raw** (`raw-diagrams.jsonl`): every distinct diagram from every source that compiled cleanly, with its document
  in `work/pool/` and its PDF in `work/compile/`.

This is an offline run, not a test: nothing here runs in `npm test` or CI. The corpus tools are Python standard
library only; the comparison runner (`compare.mjs`) is Node with the repo's own dev dependencies (Playwright, pngjs).
Everything they download or produce lives in `ext/snippets/` (gitignored). **Snippets are never
committed.** Sources keep their own licences: arXiv papers each have the author's licence, TeX.SE posts are
CC BY-SA (attribute by URI), DaTikZ rows carry their origin, and the CTAN manuals are under their packages' licences.
`manifest.json` records the provenance of every snippet.

## Layout

```
scripts/snippets/
  common.py            paths, polite HTTP, TeX lexing (comments as TeX reads them, balanced groups, environments)
  fetch.py             raw sources -> ext/snippets/raw/
  extract.py           documents -> work/candidates.jsonl.gz (one standalone document per snippet)
  curate.py            de-duplicate, stratified pick (pool / final), probe
  compile.py           compile in the locked-down TeX Live container -> work/compile/
  container/texrun.py  runs inside the container
  run.py               unattended driver: list + download arXiv, checkpoint (extract/pool/compile/final) every 2 h
  compare.mjs          the comparison runner: each case through the app, scored against its LaTeX reference
  ink.mjs, ink-worker.mjs   the ink-match scorer (Node, worker threads)
  raster.py            PDFs -> PNGs at 254 dpi in the same container (container/rasterrun.py runs inside)
ext/snippets/
  raw/{arxiv,datikz,texse,ctan}/   downloads as fetched (archives are read in memory, never unpacked)
  work/candidates.jsonl.gz         every candidate, with its document
  work/pool/<id>.tex               the oversampled pick that gets compiled
  work/compile/<id>.{json,pdf,log} compile results (cached by the document's SHA-256)
  cases/{math,tikz,lib/<lib>}/<id>.{tex,pdf}   the frozen corpus and its reference PDFs
  manifest.json, REPORT.md, raw-diagrams.jsonl
  work/run.log, work/status.json   the driver's progress
  compare/refs/<id>.{png,json}     the references drawn at 254 dpi (shared by every run)
  compare/runs/<run>/              one comparison run (see below)
```

## Running it

Run every script with `python3 -I` from the repository root. Docker must be running, and the pinned image must be
pulled first: `docker pull texlive/texlive@sha256:b20c42c2…` (the full digest is in `compile.py`).

```sh
python3 -I scripts/snippets/fetch.py datikz          # ~50k DaTikZ rows, code and provenance only (~1 h, polite)
python3 -I scripts/snippets/fetch.py arxiv-list      # 800 papers DaTikZ drew from + 1400 sampled by category
python3 -I scripts/snippets/fetch.py arxiv           # their e-prints: one connection, >= 3 s apart (~2-3 h)
curl -L -o ext/snippets/raw/texse/tex.stackexchange.com.7z \
  https://archive.org/download/stackexchange/tex.stackexchange.com.7z
python3 -I scripts/snippets/fetch.py texse           # posts with code from relevant tags -> posts.jsonl
python3 -I scripts/snippets/fetch.py ctan            # the target packages' manuals from the local TeX Live
python3 -I scripts/snippets/extract.py               # -> work/candidates.jsonl.gz
python3 -I scripts/snippets/curate.py pool           # -> work/pool/ (targets x 1.8)
python3 -I scripts/snippets/compile.py               # -> work/compile/ (-j 10 containers)
python3 -I scripts/snippets/curate.py final          # -> cases/, manifest.json, REPORT.md
```

Or all of it, unattended (overnight): `caffeinate -is nohup python3 -I scripts/snippets/run.py --papers 10000 >
ext/snippets/work/run.out 2>&1 &`. That gives 10,000 arXiv papers: all 2,789 that DaTikZ drew TikZ from, and the
rest sampled by category. At 3 s or more per e-print, it runs through the night.

Every step can be resumed: fetches skip what they already have, compiles are cached by content, and picks are
seeded (`--seed`). `curate.py probe --n 240 [--source arxiv]` compiles a random sample of candidates and tallies
the failures. Use it after changing `extract.py`.

## How a snippet is made (extract.py)

1. **Documents.** For arXiv, every file in the e-print with `\documentclass` and `\begin{document}` is a document,
   with `\input`, `\include`, `\subfile`, `\import` and `\includestandalone` inlined (a standalone figure contributes
   its body only). A DaTikZ row is one document. Each TeX.SE code block is one document, or a fragment when it has
   no `\begin{document}`. For CTAN, manuals and `.dtx` documentation are used, the `.dtx` with its implementation
   removed. DaTikZ's augmented rows and its LLM-generated origins (`gpt4`, `chatgpt`) are left out: real documents
   only. TikZiT style files (`.tikzstyles`) are read with the sources.
2. **Comments** are removed as TeX reads them: the comment, its newline and the next line's leading spaces. A
   whole-line comment never becomes a blank line, which TeX would read as `\par`.
3. **Snippets.**
   - Drawings are the outermost drawing environments (`tikzpicture`, `circuitikz`, `tikzcd`, `quantikz`, `forest`,
     `tikztimingtable`, `bytefield`, `karnaugh-map`, `sequencediagram`, `ZX`, `blochsphere`), plus `\xymatrix`,
     `\chemfig`, `\schemestart…\schemestop` and `\feynmandiagram`.
   - A `tikzpicture` is filed under a library when its content is that library's (pgfplots axes, circuitikz parts,
     UML classes, Feynman diagrams, `\tdplot…`, tkz-euclide, tikz-chemlab apparatus, automata states).
   - Formulas come from `$…$`, `\(…\)`, `\[…\]`, `$$…$$` and the amsmath environments, outside drawings,
     definitions and verbatim. Each formula is normalised to what a label holds:
     - `align` and `flalign` become `aligned`; `gather` becomes `gathered`, `multline` becomes `multlined`, and
       `alignat` becomes `alignedat`.
     - `split` becomes `aligned`.
     - Labels, tags and `\nonumber` are removed.
     - The document sets the formula as `$\displaystyle …$` (display) or `$…$` (inline).
   - Each document gives at most 30 inline and 30 display formulas (a seeded sample).
4. **Dropped:**
   - `remember picture` or overlays
   - `\tikzmark`
   - external images or data files
   - beamer overlays
   - LuaLaTeX graph drawing
   - gnuplot or shell escape
   - anything over 400 lines or 40 kB
   - pictures that draw nothing
   - formulas with references, citations, `\intertext` or `#`
   - trivial inline maths (such as `$n$`)
5. **The preamble** is rebuilt for each snippet:
   - **Packages** are the source's own, except:
     - packages that need shell escape or outside files, that draw on the page by themselves (line numbers,
       frames, watermarks), that change spacing or page geometry, that only work under one class (`amsaddr`), or
       that are biblatex or input encodings (`PKG_DROP`). Page geometry would move the content off the cropped page.
     - font families (`PKG_FONTS`)
     - local packages
     - anything not on TeX's search path in TeX Live's `ls-R`

     `fontenc` keeps only the encodings Computer Modern has. Font declarations naming any other encoding (such as
     STIX's LS1) are dropped. Every package's options are passed with `\PassOptionsToPackage` first, so adding
     `tikz` ahead of a library that needs it never clashes. A `\usepackage` after `\begin{document}` (an
     example in a manual) is ignored.
   - **TikZ, PGF and pgfplots libraries** that TeX Live doesn't have are removed (`missing_libs`). A snippet that
     needs `graphdrawing` (LuaTeX) is dropped. `expl3` blocks (`\ExplSyntaxOn…Off`) are kept whole.
   - **TikZ libraries** and **styles** (`\tikzset`, `\pgfplotsset`, `\ctikzset`, `\setchemfig`, …) go with every
     drawing. A setting made in the body counts only inside the group or environment it was made in, as in TeX.
   - **Definitions** (`\newcommand`, `\def`, `\let`, `\DeclareMathOperator`, `\newif`, `\newlength`, environments,
     chemfig submolecules, counters, …) are included only when the snippet uses them, following their bodies
     transitively. Definitions from local `.sty` files count too. Colours are included when their name is used.
   - The snippet's library package (and `tikz`) is added when missing, and so are `amsmath` and `amssymb` (unless
     a symbol font that clashes with them is loaded). Maths also gets `mathtools`. Additions are recorded in
     `added`.
   - **Engine:** pdfLaTeX, or XeLaTeX when the source loads fontspec, unicode-math or polyglossia. When a document
     loads both fontspec and fontenc or inputenc (an `\ifxetex` switch read flat), pdfLaTeX is kept. Snippets that
     need LuaLaTeX are dropped.
   - **Fonts are normalised to Computer Modern** for parity (`fonts_stripped`). Text size is the standalone
     default, 10 pt. The source's class and options are not kept.

## Choosing (curate.py)

- **De-duplication:** exact duplicates (after normalising comments and spacing), then near-duplicates (the same code
  up to numbers, case and spacing). The copy from the highest-priority source is kept, in the order arXiv, TeX.SE,
  DaTikZ, CTAN.
- **Targets:** math 3000, tikz 4000, lib 3000. Each library gets an equal share of the 3000, at least 50 (where
  that many exist) and at most 300. A library that real papers rarely use may be topped up from CTAN manuals past
  the caps, to 100 (`--lib-backfill`).
- **Each pick, seeded:**
  - Tag quotas are filled first, rarest tag first. Math tags are constructs; TikZ tags are feature families.
  - Then the rest is filled at random.
  - At most 3 snippets come from one source document. A CTAN manual may give up to 15 % of a stratum.
  - Each source has a maximum share of a class (`MAX_SHARE`).
- **`pool`** writes every distinct diagram (the raw tier), plus maths at its target × 1.8, to compile. With
  `--no-all-diagrams` it writes only the oversampled pick. **`final`** picks the targets again from the pool snippets that compiled
  cleanly. That means:
  - one page
  - ink present
  - no glyph missing from a real font (stray text that lands in nullfont inside a picture is ignored, as TeX
    ignores it)
  - ink no larger than 50 cm
- **Split:** every fifth snippet of each stratum, in a seeded order, is **held out** (20 %). Tune on `dev` and
  report on `heldout`.

## Compiling safely (compile.py)

Untrusted TeX is compiled only in `texlive/texlive` (TeX Live 2026, pinned by digest). Each container has:

- no network
- a read-only root
- `/tmp` in memory
- no capabilities and no new privileges
- a non-root user
- limits on memory, CPU and processes

The snippets are mounted read-only and only the output directory is writable. TeX runs with `-no-shell-escape`,
`shell_escape=f` and `openout_any=p` (writes stay in its working directory), a 60 s limit per run and
`-halt-on-error`, and it runs again when the log asks. Note that `openin_any=p` does not stop `\input` of an
absolute path, so reads are confined by the container, which holds nothing private.

Each result records:

- the status
- the first errors
- a missing file
- the page count
- missing glyphs
- undefined control sequences
- overfull boxes
- the ink bounding box (Ghostscript's bbox device)
- the time taken

## What each case records (manifest.json)

- `id`: 16 hex characters of the SHA-256 of the class and the normalised snippet code
- `class`, `lib`, `tags`, `split`, `path`
- `source` and `meta`: the arXiv id, DaTikZ row, TeX.SE post or CTAN file, with a URI
- `main` and `line`: the file and the approximate line (in the comment-stripped text)
- `engine`, `added`, `fonts_stripped`, `dropped_pkgs`, `missing_pkgs`, `defs` (definitions pulled in)
- for maths, `formula`, `display` and `env`
- `compile`: the engine, seconds and ink bounding box of the reference

Each `.tex` file starts with the same provenance as comments, and its `.pdf` is the LaTeX reference.

## Comparing with the app (compare.mjs)

`compare.mjs` puts each case through the app the way a user would bring it in, draws what the app makes at
100 px/cm and scores it against the LaTeX reference. It reuses the test helpers (`tests/chrome.mjs`,
`tests/browser.mjs`, `tests/args.mjs`) but is not a test.

```sh
node scripts/snippets/compare.mjs                       # curated dev cases, KaTeX: refs, render, score, export, report
node scripts/snippets/compare.mjs --sample 300          # a stratified sample (at least 3 per class or library)
node scripts/snippets/compare.mjs --lib tikz-cd,chemfig --run cd-chem
node scripts/snippets/compare.mjs --engine temml        # the other maths engine (its own run folder)
node scripts/snippets/compare.mjs report                # one phase: refs | render | score | export | report
node scripts/snippets/compare.mjs --split heldout       # the held-out cases: once, for the numbers you report
node scripts/snippets/compare.mjs --set raw             # every clean raw diagram (held-out ids stay held out)
```

What happens to a case:

- **Pictures** go through `TD.importLatex` as the Import dialog takes them: the whole standalone document, or, for a
  bare block (`\begin{tikzcd}`, `\chemfig`, `$\xymatrix{…}$` …), the block as one node of a picture with the preamble
  as the dialog's definitions (which is what a paste does with a block). How a paste would read the snippet
  (`TD.pasteIn.kind`) is recorded beside it; a picture it would turn into a text object is a *paste misread*.
- **Formulas** are set in a text object exactly as LaTeX set them (`$…$`, or `$\displaystyle …$` for a displayed
  one), on one line as a paste puts them. Formulas that need the document's own macros (tagged `user-macros`) are
  reported apart: a text object has only the engine's commands.
- The status is the importer's: `native` (all native objects), `partial` (some code kept as written, or warnings),
  `opaque` (all kept as written), `empty`, `invalid-geometry`; for formulas `ok` or `math-error`; and `error` or
  `timeout` in the runner. The app's picture (the canvas view: native objects and the previews of kept code) is
  drawn with `TD.app.pngOf` at 254 dpi; its TikZ export (`TD.toTikz`, standalone) is kept too.
- Nothing in a case reaches the network: the page may load only the app's own server, `data:` and `blob:`.

The scores (`ink.mjs`) are the repo's ink match (as `tests/ink-match.js` and `tests/import-parity.mjs`): both pictures
are cut to their ink and the app's is shifted to where they agree best; **r2, r5, r10** are the share of all ink
pixels, from both, that have ink of the other within 0.2, 0.5 or 1 mm. **fit** is the scale-free score (the app's
picture fitted to the reference's size, 1% tolerance) and **scale** the ratio of the ink boxes, so a picture right in
shape but drawn at another size shows as such. The export is compiled and drawn in the container and scored against
the reference (B) and against the app's own picture (C). The reference PDFs and the export PDFs are drawn by
Ghostscript in the container (`raster.py`), never on the host.

Each run's folder (`ext/snippets/compare/runs/<run>/`, by default `<set>-<split>-<engine>`) holds:

- `render.jsonl`: per case, the status, paste reading, counts, block types, warnings, kept-code issues, formula
  errors, app commit, time; `app/<id>.png` and `export/<id>.tex`
- `score.jsonl`: r2/r5/r10, fit, scale, offset; `export-score.jsonl`: the export's compile result and scores B and C
- `REPORT.md`: by class, library, source and (formulas) feature, with the ranked importer warnings, kept-code
  issues, engine errors, paste misreads and export errors
- `gallery.html`: the lowest scores and a sample of failures, with LaTeX, the app, an overlay (grey both, red app
  only, blue LaTeX only) and the compiled export side by side. It's local only: the snippets are third-party text.

Every phase resumes: rendering skips cases already in `render.jsonl` (`--force` redoes them, `--retry-failed` redoes
timeouts and runner errors), scores are cached by the PNGs' and PDFs' hashes, and exports by their source's. Rows
record the app's commit, so re-render (`--force`, or a new `--run`) after changing the app. Tune on dev; run
held-out only to report.
