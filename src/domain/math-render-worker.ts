import { mathmlSvg } from './mathml-svg';
import type { MathJob, MathResult } from './math-render-protocol';
const scope = globalThis as unknown as {
  importScripts(...urls: string[]): void;
  katex: { renderToString(tex: string, options: object): string };
  temml: { renderToString(tex: string, options: object): string };
  onmessage: (event: MessageEvent<MathJob>) => void;
  postMessage(result: MathResult): void;
};
scope.importScripts('vendor/temml/temml.min.js', 'vendor/katex/katex.min.js');
scope.onmessage = ({ data: job }) => {
  const options = { displayMode: job.display, macros: { ...job.macros }, throwOnError: true };
  try {
    const html = scope[job.engine].renderToString(job.tex, options);
    scope.postMessage({ id: job.id, html: job.engine === 'temml' ? mathmlSvg(html) : html });
  } catch (error) {
    // Keep Temml's ordinary error preview and the parse message for editors.
    const html = scope[job.engine].renderToString(job.tex, { ...options, throwOnError: false });
    const escaped = job.tex.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    scope.postMessage({ id: job.id, html: (html.includes('temml-error') || html.includes('katex-error')) ? html : `<i>${escaped}</i>`, error: String((error as Error).message || error) });
  }
};
