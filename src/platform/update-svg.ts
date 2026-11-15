import type { SvgLabelResources } from './svg-label-resources';
import { runtime as TD } from '../runtime';
import { previewFadeFinished } from './preview-fade';

const revisions = new WeakMap<Element, object>();
const decoded = new Map<string, Promise<void>>();
function decode(source: string): Promise<void> {
  const known = decoded.get(source); if (known) return known;
  const ready = new Promise<void>(resolve => {
    const image = new Image(); image.onload = () => { void image.decode().then(resolve, resolve); };
    image.onerror = () => resolve(); image.src = source;
  });
  decoded.set(source, ready);
  if (decoded.size > 256) decoded.delete(decoded.keys().next().value!);
  return ready;
}

// Parse only SVG geometry, not megabytes of unchanged embedded font/image data.
// Reuse image elements so pending previews keep their decoded resources while
// neighbouring geometry and the ready label's attributes change.
export function updateSvg(root: Element, markup: string, resources?: SvgLabelResources): void {
  const sources: string[] = [];
  const light = markup.replace(/<image\b[^>]*>/g, tag => {
    if (!/class="svg-label(?:\s|")/.test(tag)) return tag;
    return tag.replace(/href="([^"]*)"/, (_, source: string) => {
      sources.push(source); return `data-label-slot="${sources.length - 1}"`;
    });
  });
  const template = root.ownerDocument.createElementNS(root.namespaceURI, root.namespaceURI === 'http://www.w3.org/2000/svg' ? 'g' : 'div');
  template.innerHTML = light;
  const previous = [...root.querySelectorAll('image.svg-label')];
  for (const next of template.querySelectorAll('image[data-label-slot]')) {
    const index = +next.getAttribute('data-label-slot')!;
    next.removeAttribute('data-label-slot');
    const image = previous[index] || next;
    const revision = {}; revisions.set(image, revision);
    const provisional = image !== next && next.classList.contains('math-pending');
    const source = provisional ? (resources?.source(image.getAttribute('href') || '') || image.getAttribute('href') || sources[index]) : sources[index];
    const promoting = image.classList.contains('math-pending') && !next.classList.contains('math-pending');
    const commit = () => {
      for (const attr of [...image.attributes]) if (attr.name !== 'href' && !(provisional && ['width', 'height'].includes(attr.name)) && !next.hasAttribute(attr.name)) image.removeAttribute(attr.name);
      for (const attr of [...next.attributes]) if (!(provisional && ['width', 'height'].includes(attr.name)) && image.getAttribute(attr.name) !== attr.value) image.setAttribute(attr.name, attr.value);
    };
    let work: Promise<void> | undefined;
    if (resources) work = resources.assign(image, source, commit, promoting);
    else if (promoting && image.getAttribute('href') !== source) {
      work = decode(source).then(() => {
        if (revisions.get(image) !== revision || !image.isConnected) return;
        commit(); image.setAttribute('href', source);
        return previewFadeFinished(image);
      });
    } else { commit(); image.setAttribute('href', source); if (promoting) work = previewFadeFinished(image); }
    if (work) TD.math.trackView(work);
    if (image !== next) next.replaceWith(image);
  }
  root.replaceChildren(...template.childNodes);
}
