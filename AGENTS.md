## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.

## Documentation

- The user guide (`public/guide/index.html`, with the Thai translation in `public/guide/th.html`) is the full manual: every tool, block, mode, export and shortcut. When a change is visible to users, update the guide.
- The guide's screenshots (`public/guide/img/*.webp`, Thai interface in `img/th/`) are taken from the real app by `npm run guide:shots` (`scripts/guide-shots/scenes.mjs` sets each one up; pass scene names to retake only those). When a change alters what a screenshot shows, retake it.
- The package pages (`public/<page>/index.html`: `circuitikz-editor`, `quantikz-editor`, `karnaugh-map-latex`, `chemfig-editor`, `tikz-timing-editor`, `tikz-cd-editor`, `tikz-feynman-editor`; styled by `public/site/` on the app's `css/tokens.css`) are static pages for search engines, one block each, written by hand. Each shows the example its guide screenshot shows: `node scripts/package-pages.mjs` writes in the code the app makes for it, the share link, the embed's drawing, the example's name and the screenshot's alt text from the guide. Run it after retaking those screenshots or changing those Welcome examples or the export; `tests/package-pages.mjs` fails when a page's code is no longer what the app writes. "Edit this example here" opens the app's Quick editor in a frame (`?embed=<block>#draft=<code>`). The build lists every page with a canonical address in `sitemap.xml`.
- `README.md` is a short overview that points to the guide. Update it only for a new block, mode or headline feature, or when the setup, test or deploy commands change. Do not add per-feature detail there.
