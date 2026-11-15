# Synthetic all-mode stress bundles

These files contain generated data only. They do not use `tests/test_page.diagramtex` or any private project.

| Bundle | Elements per file | Total top-level elements | Page sheets |
| --- | ---: | ---: | ---: |
| `all-modes.diagramtex` | 3,048 | 12,192 | 191 |
| `interactive.diagramtex` | 508 | 2,032 | 32 |

Each bundle imports four files: Document, Diagram, Page, and Whiteboard. Document and Diagram are both Classic files in the current file format. For the file named **Stress — Diagram (select Diagram)**, choose the **Diagram** selector after opening it; bundle imports do not preserve that view preference.

Every file covers all **40 registered element types**, using 127 templates. The mix includes 31 symbol variants, 2D and 3D plots, 3D primitives, solids of revolution, all registered physics domains, electrical and quantum circuits, chemistry, Feynman diagrams, trees, automata, UML, sequence diagrams, commutative diagrams, Karnaugh maps, bytefields, timing diagrams, tables, images, components, raw TikZ previews, geometry, and drawing primitives. Named coordinates are included even though they are intentionally invisible in exports.

Twelve equation families cover integrals, limits, sums, products, fractions, matrices, aligned equations, accents/vectors, roots, font variants, and overbraces. Distinct indices exercise cold compilation alongside repeated formulas. The large Document also contains 3,048 inline formulas, separate from its diagram elements, plus text and table blocks. Every source template is checked for valid geometry and rendered through both engines during generation. Each file passes the app's project codec; `manifest.json` records coverage, counts, and size.

## Reproduce

```sh
npm run build
node tests/generate-stress-bundle.mjs --dist
node tests/generate-stress-bundle.mjs --dist --repeats=4 --output=interactive
```

The seed is fixed. `--repeats=N` changes load; `--output=name` writes a separate bundle and manifest. Generated files use the app's current constructors and renderer, so re-generation follows intentional changes to the app's starter examples.

## Exercise

Drop a bundle onto the app or open it with Import. Open each imported file, switch KaTeX → Temml → KaTeX, pan/zoom/scroll during loading, inspect page thumbnails, and edit a text block before rendering finishes. The Whiteboard includes negative coordinates as well as positive coordinates.

The optional automated runner imports the real bundle through the file input in isolated Chromium, WebKit and Firefox profiles, opens each file, checks that every element and type survives construction, and can wait for both engine switches:

```sh
node tests/stress-bundle.mjs --dist --fixture=interactive --switch-engines
node tests/stress-bundle.mjs --dist --fixture=all-modes
node tests/stress-bundle.mjs --dist --firefox --fixture=interactive --switch-engines
```

These heavy checks are deliberately excluded from normal CI. The bundles live outside `tests/fixtures/`, which the shared suite injects wholesale into every browser, so normal test runs do not load the stress data. They are stress cases, not performance guarantees.

## Observed extreme-case limit

Opening the 12,192-element bundle's full **Document** currently throws Chromium's `RangeError: Invalid string length` while constructing the Document preview. The Document preview constructs a single large HTML/SVG string from its 763 blocks; that string exceeds the browser's size limit before it can paint. The fixture is retained unchanged to reproduce that failure. Use the smaller companion to exercise progressive loading independently of that extreme limit.

The smaller companion completed all four modes and both engine switches in Chromium, retaining all 508 elements and all 40 types in each file. WebKit did not complete its first Document case after approximately three minutes at full CPU; that isolated browser session was stopped. This is recorded as an unresolved stress failure, not a passing WebKit check. The optional runner limits each file case to 180 seconds (`--timeout=milliseconds` overrides it).

Firefox/Gecko also completed the smaller companion in all four modes with both
engine switches, retaining all 508 elements and all 40 types per file. Page mode
retained all 32 page previews without canvas hit-area rectangles. This result
uses the same fixtures and assertions as the Chromium/WebKit runner; it does
not resolve the larger Document string-size limit or the recorded WebKit stress
limit above.
