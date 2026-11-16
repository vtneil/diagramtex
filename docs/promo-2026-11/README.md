# DiagramTeX promotional screenshot pack

15 consolidated promotional images, each **1920 × 1080 PNG**. The upload-ready set is in `final/`; the ZIP contains exactly these 15 images. `contact-sheet.png` is a separate overview, not an additional upload slot.

Each image uses real captures of the local app, with one direct description and feature notes. Modal tools are shown in full-screen captures with the surrounding app visible; companion views show related features. These are promotional compositions, not invented interface mockups. Original full-window captures are retained in `raw/`.

## Suggested upload order and coverage

1. Overview — mathematics, drawing, plots, circuits, quantum circuits, commutative diagrams; left half light mode, right half dark mode.
2. Quality of life — multi-selection, alignment/distribution, ruler guides, snapping, command search, export options.
3. Table — spreadsheet editing, grouped headers, vertically merged method names spanning two rows, booktabs preview, importing and copying.
4. Table formatting — siunitx, decimal alignment, rounding, scientific notation, uncertainties, generated LaTeX.
5. Circuits — light-mode editor with searchable parts, circuitikz, connection-aware wires, voltage/current labels.
6. Quantum + ZX — teleportation, classical corrections, gate palettes, spacing, spiders and wires.
7. Chemistry — the supplied polymer reaction, reusable submolecules, charged groups, chemfig and hreac.
8. Timing + state machines — clocks, buses, high-Z signals, intervals, states, transitions and automatic layout.
9. Digital logic — six-variable Karnaugh maps, checked groups, simplified functions, IPv4 bytefield layout.
10. Software diagrams — UML classes, ownership/inheritance, multiplicities, nested sequence calls.
11. Commutative diagrams — tikz-cd + xymatrix, arrow styles, labelled arrows, package conversion.
12. Trees — forest, decision trees, templates, direct node editing, source preservation.
13. Geometry — 2D + 3D editors, coordinates, projections, angle marks and editable TikZ.
14. Scientific toolbox — mechanics, optics, waveforms, 3D plots, solids of revolution, Feynman, trees, ZX and Bloch spheres.
15. Document + Quick — text/maths around a figure, LaTeX article output, formula PNG/SVG.

The wording describes app capabilities without claiming competitor exclusivity. Specialized block editors remain experimental in the app; verify generated LaTeX before publication of scientific results.

## Files and reproduction

- `final/`: the 15 upload-ready images.
- `raw/`: original app screenshots without composition descriptions.
- `index.html`: gallery of the final set; open locally in a browser.
- `contact-sheet.png`: all 15 images at a glance.
- `manifest.json`: filenames, titles and featured capabilities.
- Numbered `.html` files: editable compositions using the original captures.
- `build.py`: rebuilds the compositions and gallery.
- `render.cjs`: renders the compositions using Playwright and installed Chrome.

From the repository root:

```sh
python3 docs/promo-2026-11/build.py
node docs/promo-2026-11/render.cjs
```

Verified: 15 final images, each exactly 1920 × 1080. Final compositions were checked for overflow, stray dialogs and clipped focal content.

Chemistry source is preserved verbatim in `chemistry.tex`. The app renders the supplied reaction while reporting a parser warning about an empty `{}` group; the capture retains that warning.
