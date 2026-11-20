---
name: release
description: Cut a DiagramTeX release. Usage `/release <subminor|minor>`. Bumps TD.VERSION and the service-worker CACHE, squashes the un-pushed commits into one "Title (vX.Y.Z)" commit, tags vX.Y.Z, and pushes the branch and the tag. Does not deploy.
argument-hint: <subminor|minor>
disable-model-invocation: true
---

# /release <subminor|minor>

Version is `X.Y.Z`: Y is **minor**, Z is **subminor**.

- `subminor` → Z+1 (e.g. 1.55.3 → 1.55.4)
- `minor` → Y+1, Z reset to 0 (e.g. 1.55.3 → 1.56.0)

If the argument is missing or is neither word, ask which one. Never guess.

## Steps

1. **Preflight.** Run `git status -sb` and `git fetch origin`.
   - Must be on a branch with an upstream, and at least one un-pushed commit (`git log @{u}..HEAD`). If there are none, stop and say so.
   - Uncommitted changes: the user's working tree is part of the release only if they say so. If the tree is dirty, list the files and ask whether to include them in the release commit or stop. Never discard them.
   - If the branch is behind or diverged from upstream, stop and report; do not force anything.
2. **Compute the new version** from `TD.VERSION = 'X.Y.Z'` in `src/domain/shapes.ts` and apply the rule above.
3. **Bump both files.**
   - `src/domain/shapes.ts`: the `TD.VERSION` literal.
   - `public/sw.js`: `const CACHE = 'diagramtex-vN'` → `vN+1`.
4. **Title.** Write the commit title from the un-pushed commits (`git log @{u}..HEAD --format=%s`): one line in the style of earlier release commits (`git log -5 --format=%s`), listing what changed for the user. End it with ` (vX.Y.Z)`.
5. **Squash** the un-pushed commits (plus the version bump, and any dirty files the user approved) into a single commit with that title:
   `git reset --soft @{u}` then `git add` the bumped files (and approved files) and `git commit -m "Title (vX.Y.Z)"`. Keep the commit's attribution trailer if the session asks for one.
6. **Tag:** `git tag vX.Y.Z` (annotated is not needed; match existing tags: check `git tag -l | tail -3`). If the tag already exists, stop.
7. **Push** the branch and the tag: `git push origin <branch>` then `git push origin vX.Y.Z`. No force pushes. If the push is rejected, stop and report.
8. **Report** the new version, the commit title, and the pushed ref names.

## Rules

- Never deploy (`npx wrangler deploy`) unless the user asks separately.
- Never ask whether to tag: a release always tags.
- Squashing rewrites only un-pushed commits, so it is safe; never squash anything already on the remote.
