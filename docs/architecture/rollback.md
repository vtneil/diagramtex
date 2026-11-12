# Coupling reduction baseline

Baseline commit: `aac0211fd8323bf550d7737f14d05e40aad4c9a651fe1596c433d0ce8701d45a`

The working tree was clean before this work began on 2026-11-12.
This commit preserves the complete original source and UI.
Inspect it with `git show <commit>:<path>` or restore selected files with
`git restore --source=<commit> -- <paths>` after saving subsequent work.

The implementation will preserve classic-script/local-file loading, visual UI,
code preservation, editor placement rules and legacy document compatibility.

## Verification after the initial architecture pass

- Baseline: 248/248 tests, 164 golden files, 194 cached LaTeX compilations.
- Refactored: 253/253 tests, the same 164 golden files and 194 cached compilations.
- Existing workflow benchmark: all 10 tasks pass, with the same 31 total steps.
- Production build succeeds. Real-pointer opening/closing checks pass for all 14 visual
  block editors in both source and production builds, after their initial layout settles.
- Block-menu screenshots from the baseline and refactored source are byte-identical;
  browser measurements also match labels, bounds, fonts and colours.

See [extending-blocks.md](extending-blocks.md) for the new boundaries and remaining work.

## Existing behavior observed separately

Closing some editors before their initial animation-frame layout runs can throw a
null-session error. The ZX case was reproduced against the baseline commit as well.
This pass does not change those editors' scheduled layout callbacks. The pointer smoke
check waits for initial layout before closing; it does not claim to cover rapid-close
races. This remains a focused follow-up rather than an unreported refactoring regression.
