// Requires pdflatex and uv. Normal browser checks read the small checked-in JSON
// and need neither TeX nor Python. This generator also renders the real PDF.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mixedLabels } from './mixed-labels-fixture.mjs';
const output = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-mixed-latex-'));
const tex = String.raw`\documentclass[border=8pt]{standalone}
\usepackage{amsmath,amssymb,braket,tikz}
\newcommand{\measure}[2]{\setbox0=\hbox{#2}\typeout{DTX:#1:\number\wd0:\number\fontdimen6\font}}
\begin{document}
\measure{word-permutes}{permutes}
\measure{word-unitary}{unitary}
` + mixedLabels.map(f => `\\measure{case-${f.name}}{${f.text}}`).join('\n') + String.raw`
\begin{tikzpicture}
` + mixedLabels.map((f, i) => `\\node[anchor=base west,inner sep=0pt] at (0,${-1.5*i}) {${f.text}};`).join('\n') + String.raw`
\end{tikzpicture}
\end{document}
`;
fs.writeFileSync(path.join(output, 'reference.tex'), tex);
const log = execFileSync('pdflatex', ['-no-shell-escape', '-interaction=nonstopmode', '-halt-on-error', '-output-directory=' + output, path.join(output, 'reference.tex')], { encoding: 'utf8' });
const measurements = Object.fromEntries([...log.matchAll(/DTX:([\w-]+):(\d+):(\d+)/g)].map(([, key, advance, em]) => [key, Number(advance) / Number(em)]));
if (Object.keys(measurements).length !== 5) throw new Error('Missing LaTeX metrics');
const baseline = JSON.parse(execFileSync('uv', ['run', '--no-project', '--with', 'pymupdf', 'python', new URL('./rendering-references/extract-mixed.py', import.meta.url).pathname, path.join(output, 'reference.pdf'), path.join(output, 'reference.png')], { encoding: 'utf8' }));
const reference = { description: 'Measured pdfLaTeX Computer Modern 10pt advances and PDF baselines; no browser-derived values', sourceHash: crypto.createHash('sha256').update(JSON.stringify(mixedLabels)).digest('hex'), measurements, ...baseline };
fs.copyFileSync(path.join(output, 'reference.png'), new URL('./rendering-references/mixed-labels.png', import.meta.url));
fs.writeFileSync(new URL('./rendering-references/mixed-labels.json', import.meta.url), JSON.stringify(reference, null, 2) + '\n');
console.log('LaTeX PDF, source and rendered reference: ' + output);
console.log(reference);
