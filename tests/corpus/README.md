# DaTikZ native-import coverage

Use real TikZ/image pairs to guide **source → native editable objects → exported TikZ** work. Dataset: https://huggingface.co/datasets/nllg/datikz.

This corpus is opt-in and generated artifacts are ignored. It does not add a dataset download to the regular app tests.

## Reproduce the initial evaluation

No extra Python packages are needed for a bounded scan:

```sh
python scripts/datikz-corpus.py --max-rows 500 --samples 32 --images
node tests/datikz-corpus.mjs
```

Open `artifacts/datikz/report.html` for an offline side-by-side gallery. The right side renders **native objects only**, excluding preserved-code previews. `results.json` holds per-row outcomes, blockers, object counts and feature coverage. Original code and reference images are under `cases/`; generated SVG/TeX outputs are under `rendered/`. Exported TeX is saved for inspection, never automatically executed.

The scanner records the dataset commit, split, row index, exact source hash, source URI, origin, augmentation flag, seed and chosen cases. Half the cases use seeded random selection; half maximise feature/origin/size diversity. Only selected reference images are downloaded. Dataset viewer rows are cached by commit and checked for truncation/revision mismatches. The rows API serves the current commit; historical revisions require the streaming backend. Signed image links expire, so retain downloaded references for exact reproduction.

The initial run used commit `2d03e7098ab71186a8a7f96c0d115dcda320243f`, scanning 500 training rows and selecting 32 cases. The 561-row test split was not used. Structural results:

| Result | Cases |
|---|---:|
| Native objects, no import warnings | 1 |
| Partial native conversion | 4 |
| Opaque code only | 26 |
| Empty | 1 |

This deliberately mixed sample does **not** estimate whole-dataset coverage. Nor does a `native` status mean the picture matches the reference. Inspect the pair before calling it a rendering success. References may include margins, resized text, multiple figures or document content, so raw pixel-difference thresholds would be misleading without alignment and review.

## Inventory and prioritisation

`inventory.json` contains occurrence and document-frequency counts for commands, environments, libraries, packages, bracket/style keys, and feature families. These are lexical signals, not a complete TikZ grammar or LLM/BPE tokens. Bracket keys include document/package options; feature flags are heuristics. Count prevalence on the scanned pool, not only the selected showcase cases.

The initial pool includes `calc` in 116 rows, `positioning` in 111, `fit` in 43, `patterns` in 41 and `matrix` in 32. Picture-option blockers affect 15 selected cases; text-option blockers affect 12. Repeated gaps include inherited defaults (`every node`, line caps/joins and independent axis scales), edge semantics, inline path coordinates, matrix/chain layout and more general PGF macros/conditionals. Prioritise these families over adding isolated examples until they pass.

## Broader inventories

The optional Hugging Face streaming backend projects code/provenance columns at a pinned commit. Use a virtual environment with `datasets` installed:

```sh
python scripts/datikz-corpus.py --backend datasets \
  --revision 2d03e7098ab71186a8a7f96c0d115dcda320243f \
  --max-rows 49692 --samples 100 --out artifacts/datikz/full
```

That path was not exercised in the initial run; the zero-dependency rows API was. It does not fetch reference images. The code projection follows Hugging Face's documented Parquet streaming `columns` option: https://huggingface.co/docs/datasets/stream.

`--backend jsonl --input path/to/rows.jsonl` inventories local rows offline. `--split test` must be explicit; keep it held out while fixing training examples. Default evaluation is diagnostic; add `--require-native` only when intentionally gating a reviewed subset. Imported external assets are blocked, and per-case timeouts restart the browser so one pathological figure cannot stall the full run.

Before promoting corpus cases into committed regression fixtures, retain source attribution and review the upstream source's licence; the dataset does not provide one blanket licence for all underlying sources. Keep the bulk corpus and reference images local. Reduce failures to focused regression cases where practical, then validate edited exports through the existing reviewed TeX tests.

## Tool checks

```sh
python tests/corpus/test_datikz.py
node --check tests/datikz-corpus.mjs
```
