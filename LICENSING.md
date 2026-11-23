# DiagramTeX licensing

Copyright © 2026 Vivatsathorn Thitasirivit.

SPDX-License-Identifier: AGPL-3.0-or-later

The DiagramTeX application is licensed under the GNU Affero General Public License, version 3 or (at your option) any later version. See [LICENSE](LICENSE) for the full terms.

### Licensing of generated content

DiagramTeX is licensed under the GNU Affero General Public License v3.0.

Diagrams, LaTeX code, images, PDFs, and other content created using DiagramTeX are not subject to the AGPL solely because they were produced with DiagramTeX. Users may use their original creations in academic publications, commercial projects, proprietary documents, and other works without additional licensing obligations imposed by DiagramTeX.

Third-party assets or content incorporated into an output may remain subject to their own licenses.

### Third-party software and assets

Bundled third-party software and fonts retain their own licencss and copyright notices, shipped beside them in `public/vendor/`, `public/fonts/` and `public/tex/` (or `vendor/`, `fonts/` and `tex/` in the built distribution). All are compatible with AGPL-3.0-or-later.

| Component | Where | License | License file |
|---|---|---|---|
| Svelte (compiled into the app script) | `vendor/svelte/` | MIT | `LICENSE.txt` |
| MathJax 4.1.3 and TeX font data (parts bundled into the app script) | `vendor/mathjax/` | Apache-2.0 | `LICENSE.txt`, `NOTICE.txt` |
| KaTeX (script and stylesheet) | `vendor/katex/` | MIT | `LICENSE` |
| KaTeX fonts | `vendor/katex/fonts/` | SIL OFL 1.1 | `FONTS-LICENSE.txt` |
| Temml | `vendor/temml/` | MIT | `LICENSE` |
| Latin Modern Math (Temml's font) | `vendor/temml/` | GUST Font License (LPPL 1.3c or later) | `FONTS-LICENSE.txt` |
| Temml.woff2 (clone of KaTeX_Script) | `vendor/temml/` | SIL OFL 1.1 | `../katex/FONTS-LICENSE.txt` |
| MathLive 0.111.1 | `vendor/mathlive/` | MIT | `LICENSE.txt` |
| Atkinson Hyperlegible Next and Mono | `fonts/` | SIL OFL 1.1 | `AtkinsonHyperlegible*-LICENSE.txt` |
| Sarabun (Thai) | `fonts/` | SIL OFL 1.1 | `Sarabun-LICENSE.txt` |
| TLWG Garuda, Kinnari, Laksaman (v0.7.4, converted from WOFF to WOFF2) | `fonts/` | GPL-2.0-or-later with the font-embedding exception, used here under GPL-3.0 terms | `TLWG-LICENSE.txt` |
| SwiftLaTeX engines (release v20022022: `swiftlatexpdftex`, `swiftlatexxetex` and `swiftlatexdvipdfm`, `.js` and `.wasm`: pdfTeX 1.40.21, XeTeX 0.999992, dvipdfmx) | `tex/` | AGPL-3.0 (SwiftLaTeX); pdfTeX, XeTeX and dvipdfmx themselves GPL-2.0-or-later | `LICENSE-swiftlatex.txt` |
| TeX Live files for the engines (`tex/bundle/pdftex/`, `tex/bundle/xetex/`, made by `scripts/tex-bundle.mjs`, kept out of the repository and published as a GitHub release archive pinned in `scripts/tex-bundle.lock.json`; downloaded only on a first compile or with Download TeX engine; the cm-super fonts both share in `tex/bundle/fonts/` only when a document uses one) | `tex/bundle/` | Each file under its own free license, mostly LPPL 1.3c, with GPL, OFL, GUST Font License (Latin Modern, the TeX Gyre fonts), GPL with the font exception (the TLWG Thai fonts) and public-domain files; all are free software under the TeX Live licensing rules | each bundle's `manifest.json` names every file |

The fonts are separate data files served alongside the application, not part of its combined work. The TLWG exception means documents and exports that embed these fonts are not covered by the GPL. No fonts or scripts are loaded from third-party servers.
