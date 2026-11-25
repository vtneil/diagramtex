// Temml remains the TeX parser. Lay out its MathML once in JavaScript rather
// than asking each browser's MathML implementation to choose geometry.
import { mathjax } from '@mathjax/src/js/mathjax.js';
import { MathML } from '@mathjax/src/js/input/mathml.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { MathJaxTexFont } from '@mathjax/mathjax-tex-font/js/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';

const REFERENCE_EM = 16;
const adaptor = liteAdaptor({ fontSize: REFERENCE_EM });
RegisterHTMLHandler(adaptor);
const outputJax = new SVG({ fontData: MathJaxTexFont, fontCache: 'none', linebreaks: { inline: false } });
const document = mathjax.document('', {
  InputJax: new MathML(),
  OutputJax: outputJax,
});
const cache = new Map<string, string>();

export function mathmlSvg(source: string): string {
  const known = cache.get(source); if (known) return known;
  const parsed = adaptor.parse(source, 'text/html');
  const root = adaptor.tags(adaptor.body(parsed), 'math')[0];
  if (!root) throw new Error('The maths parser did not produce MathML');
  // Classes supplied by Temml implement native-browser presentation corrections.
  // They are not part of the MathML semantics and must not style the SVG output.
  const visit = (node: any) => {
    if (adaptor.kind(node).startsWith('#')) return;
    if (adaptor.kind(node) === 'mtable') {
      // Temml expresses column gaps as CSS cell padding. SVG layout consumes
      // MathML columnspacing instead; translate the declared gaps once and remove
      // the CSS padding so it cannot be counted again during cell placement.
      const rows = adaptor.childNodes(node).filter((child): child is ReturnType<typeof adaptor.node> => ['mtr', 'mlabeledtr'].includes(adaptor.kind(child)));
      const cells = rows.map(row => adaptor.childNodes(row).filter((child): child is ReturnType<typeof adaptor.node> => adaptor.kind(child) === 'mtd'));
      const columns = Math.max(0, ...cells.map(row => row.length));
      const padding = (cell: any, side: string) => {
        const style = String(adaptor.getAttribute(cell, 'style') || '');
        const value = style.split(';').map(part => part.split(':')).find(([name]) => name.trim() === `padding-${side}`)?.[1] || '';
        const match = /^\s*([\d.]+)(em|pt|px)\s*$/.exec(value);
        if (!match) return 0;
        return Number(match[1]) * (match[2] === 'pt' ? (96 / 72) / REFERENCE_EM : match[2] === 'px' ? 1 / REFERENCE_EM : 1);
      };
      if (cells.some(row => row.some(cell => /padding-(left|right)/.test(adaptor.getAttribute(cell, 'style') || '')))) {
        const gaps = Array.from({ length: Math.max(0, columns - 1) }, (_, column) =>
          Math.max(0, ...cells.filter(row => row.length > column + 1).map(row => padding(row[column], 'right') + padding(row[column + 1], 'left'))));
        // one column has no gap to give (an empty columnspacing is an error in Firefox)
        if (gaps.length) adaptor.setAttribute(node, 'columnspacing', gaps.map(gap => `${gap}em`).join(' '));
        for (const row of cells) for (const cell of row) {
          const style = String(adaptor.getAttribute(cell, 'style') || '');
          adaptor.setAttribute(cell, 'style', style.replace(/(?:^|;)\s*padding-(?:left|right)\s*:[^;]*/g, ''));
        }
      }
    }
    if (adaptor.kind(node) === 'mtd') {
      if (adaptor.hasClass(node, 'tml-right')) adaptor.setAttribute(node, 'columnalign', 'right');
      if (adaptor.hasClass(node, 'tml-left')) adaptor.setAttribute(node, 'columnalign', 'left');
    }
    adaptor.removeAttribute(node, 'class');
    const style = adaptor.getAttribute(node, 'style');
    if (style) adaptor.setAttribute(node, 'style', style.replace(/(?:^|;)\s*(?:transform|position)\s*:[^;]*/g, ''));
    for (const child of adaptor.childNodes(node)) visit(child);
  };
  visit(root);
  const output = document.convert(adaptor.outerHTML(root), { em: REFERENCE_EM, ex: REFERENCE_EM / 2, containerWidth: 80 * REFERENCE_EM });
  const roots = adaptor.childNodes(output).filter(node => adaptor.kind(node) === 'svg');
  if (roots.length !== 1) throw new Error('A formula must have one complete SVG viewport');
  const svg = roots[0] as ReturnType<typeof adaptor.node>;
  if (!svg) throw new Error('The maths layout did not produce SVG');
  // MathJax's viewBox is in thousandths of an em. Express its intrinsic size and
  // baseline directly in em, avoiding the browser's font-dependent ex conversion.
  const [, top, width, height] = adaptor.getAttribute(svg, 'viewBox').split(/\s+/).map(Number);
  adaptor.setAttribute(svg, 'width', `${width / 1000}em`);
  adaptor.setAttribute(svg, 'height', `${height / 1000}em`);
  adaptor.setStyle(svg, 'vertical-align', `${-(top + height) / 1000}em`);
  adaptor.setAttribute(svg, 'aria-hidden', 'true');
  adaptor.setAttribute(svg, 'lang', 'en');
  adaptor.setAttribute(svg, 'xml:lang', 'en');
  const style = adaptor.node('style', {}, [adaptor.text(adaptor.cssText(outputJax.styleSheet(document) as ReturnType<typeof adaptor.node>))], 'http://www.w3.org/2000/svg');
  adaptor.append(svg, style);
  const result = adaptor.outerHTML(svg);
  cache.set(source, result);
  if (cache.size > 512) cache.delete(cache.keys().next().value!);
  return result;
}
