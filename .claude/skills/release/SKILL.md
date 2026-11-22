---
name: release
description: Cut a DiagramTeX release or preview. Usage `/release <subminor|minor|preview>`. subminor/minor bump TD.VERSION and the service-worker CACHE, squash the un-pushed commits into one "Title (vX.Y.Z)" commit, tag vX.Y.Z, and push the branch and the tag; pushing the tag deploys to production through CI (after every check passes) and publishes a GitHub Release. preview squashes and pushes the branch only (no bump, no tag), which updates the Cloudflare Preview.
argument-hint: <subminor|minor|preview>
disable-model-invocation: true
---

# /release <subminor|minor|preview>

Version is `X.Y.Z`: Y is **minor**, Z is **subminor**.

- `subminor` → Z+1 (e.g. 1.55.3 → 1.55.4)
- `minor` → Y+1, Z reset to 0 (e.g. 1.55.3 → 1.56.0)
- `preview` → no new version and no tag: squash and push only. Pushing the branch updates the "main" Cloudflare
  Preview (https://main-diagramtex.igniting.workers.dev); production is untouched. The next `subminor` or `minor`
  bumps from the last tagged version as usual.

If the argument is missing or is none of these words, ask which one. Never guess.

## Steps

1. **Preflight.** Run `git status -sb` and `git fetch origin`.
   - Must be on a branch with an upstream, and at least one un-pushed commit (`git log @{u}..HEAD`). If there are none, stop and say so.
   - Uncommitted changes: the user's working tree is part of the release only if they say so. If the tree is dirty, list the files and ask whether to include them in the release commit or stop. Never discard them.
   - If the branch is behind or diverged from upstream, stop and report; do not force anything.
2. **Compute the new version** from `TD.VERSION = 'X.Y.Z'` in `src/domain/shapes.ts` and apply the rule above. *preview: skip.*
3. **Bump both files.** *preview: skip.*
   - `src/domain/shapes.ts`: the `TD.VERSION` literal.
   - `public/sw.js`: `const CACHE = 'diagramtex-vN'` → `vN+1`.
4. **Title.** Write the commit title from the un-pushed commits (`git log @{u}..HEAD --format=%s`): one line in the style of earlier release commits (`git log -5 --format=%s`), listing what changed for the user. End it with ` (vX.Y.Z)`. *preview: no version suffix.*
5. **Squash** the un-pushed commits (plus the version bump, and any dirty files the user approved) into a single commit with that title:
   `git reset --soft @{u}` then `git add` the bumped files (and approved files) and `git commit -m "<title>"`. Keep the commit's attribution trailer if the session asks for one.
6. **Tag:** `git tag vX.Y.Z` (annotated is not needed; match existing tags: check `git tag -l | tail -3`). If the tag already exists, stop. *preview: skip.*
7. **Push** the branch, then the tag: `git push origin <branch>` then `git push origin vX.Y.Z` (*preview: the branch only*). No force pushes. If the push is rejected, stop and report.
8. **Report** the commit title and the pushed ref names.
   - subminor/minor: the new version too, and that the tag's CI run deploys it: `gh run list -L 2` shows it, and production updates and the GitHub Release appears only once every check on the tag passes.
   - preview: that the branch's CI run updates https://main-diagramtex.igniting.workers.dev once build, typecheck and label-glyphs pass, and that production is unchanged.

## Rules

- Pushing the branch updates the "main" Cloudflare Preview; pushing the tag deploys production (the `preview` and `deploy` jobs in `.github/workflows/ci.yml`). Never run `npx wrangler deploy` by hand unless the user asks separately.
- subminor and minor always tag: never ask whether to. preview never tags and never bumps the version.
- Squashing rewrites only un-pushed commits, so it is safe; never squash anything already on the remote.
