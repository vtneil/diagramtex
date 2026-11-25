import { mathmlSvg } from './mathml-svg';
import type { MathJob, MathResult } from './math-render-protocol';
import { defineFunctions } from './math-functions';
import { escapeHtml } from '../core/html';
const scope = globalThis as unknown as {
  importScripts(...urls: string[]): void;
  katex: { renderToString(tex: string, options: object): string };
  temml: { renderToString(tex: string, options: object): string };
  onmessage: (event: MessageEvent<MathJob | MathJob[]>) => void;
  postMessage(result: MathResult | MathResult[]): void;
};
scope.importScripts('vendor/temml/temml.min.js', 'vendor/temml/contrib/mhchem.min.js', 'vendor/katex/katex-td2.min.js', 'vendor/katex/contrib/mhchem.min.js');
// the tests and look-aheads the page's engines have too (\ifthenelse, \nonscript …)
defineFunctions(scope.katex); defineFunctions(scope.temml);
function compile(job: MathJob): MathResult {
  const options = { displayMode: job.display, macros: { ...job.macros }, throwOnError: true, ...(job.engine === 'katex' ? { strict: 'ignore' } : {}) }; // as mathengine.ts
  try {
    const html = scope[job.engine].renderToString(job.tex, options);
    return { id: job.id, html: job.engine === 'temml' ? mathmlSvg(html) : html };
  } catch (error) {
    // Keep Temml's ordinary error preview and the parse message for editors.
    const html = scope[job.engine].renderToString(job.tex, { ...options, throwOnError: false });
    const escaped = escapeHtml(job.tex);
    return { id: job.id, html: (html.includes('temml-error') || html.includes('katex-error')) ? html : `<i>${escaped}</i>`, error: String((error as Error).message || error) };
  }
}
// a batch comes back in one message, so the page isn't woken once per formula
scope.onmessage = ({ data }) => { scope.postMessage(Array.isArray(data) ? data.map(compile) : compile(data)); };
