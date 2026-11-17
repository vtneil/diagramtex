import { measurementRoot } from './measurement';
import { vectorLabel } from './vector-label';
// Finish mixed maths/prose layout once in reference-em space, then publish pure
// SVG geometry. Font outlines preserve advances and baselines under scene transforms;
// native SVG text remains available for unsupported scripts and system fonts.
import katexCss from '../../public/vendor/katex/katex.min.css';
import { fontData } from './label-fonts';
import { svgToSrc } from '../platform/images';

const esc = (value: string) => value.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const styles = { katex: katexCss, temml: '' };
const faces = Object.values(styles).flatMap(css => [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map(match => {
  const css = match[0], property = (name: string) => new RegExp(name + '\\s*:\\s*([^;}]*)').exec(css)?.[1].trim().replace(/["']/g, '') || '';
  const file = /url\(['"]?([^'")]+\.woff2)['"]?\)/.exec(css)?.[1].split('/').pop();
  return { source: fontData[file!], family: property('font-family'), style: property('font-style') || 'normal', weight: property('font-weight') || '400',
    css: css.replace(/url\(['"]?([^'")]+\.woff2)['"]?\)/g, (_, url: string) => `url("${fontData[url.split('/').pop()!]}")`) };
}));
// Register the exact local font bytes before any formula is measured. Waiting for
// document.fonts.ready alone does not discover faces a new formula hasn't used yet.
const registered = new Map<string, FontFace>();
for (const face of faces) {
  const key = [face.family, face.style, face.weight].join('|');
  if (registered.has(key)) continue;
  const font = new FontFace(face.family, `url("${face.source}")`, { style: face.style, weight: face.weight });
  document.fonts.add(font); registered.set(key, font);
}
export const labelFontsReady = Promise.all([...registered.values()].map(face => face.load()));

interface LabelImage { href: string; x: number; y: number; width: number; height: number }
const cache = new Map<string, LabelImage>();
let probe: HTMLDivElement | undefined;

export function labelImage(engine: 'katex' | 'temml', html: string, textStyle: string, color: string,
  width: number, height: number, align = 'center'): LabelImage {
  const key = JSON.stringify([engine, html, textStyle, color, width, height, align]);
  // least recently used goes first: a full redraw walks the labels in the same order every time, so
  // first-in-first-out would evict exactly what the next redraw needs once a scene outgrows the cache
  const known = cache.get(key); if (known) { cache.delete(key); cache.set(key, known); return known; }
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;left:-100000px;top:0;visibility:hidden;font-size:0;contain:layout style size;';
    measurementRoot().append(probe);
  }
  // Lay out once in reference-em space, matching textBox's geometry. Painting
  // uses explicit vector coordinates, never a transformed HTML foreignObject.
  const px = Number(/font-size:([\d.]+)px/.exec(textStyle)?.[1] || 16), scale = 1024 / px;
  const layoutStyle = textStyle.replace(/font-size:[\d.]+px/, 'font-size:1024px')
    .replace(/width:([\d.]+)px/, (_, value) => `width:${Number(value) * scale}px`);
  probe.innerHTML = `<div class="tx" style="${esc(layoutStyle)}color:${esc(color)};text-align:${align}">${html}</div>`;
  probe.style.width = `${width * scale}px`; probe.style.textAlign = align;
  const text = probe.firstElementChild! as HTMLElement;
  const origin = probe.getBoundingClientRect();
  const vector = vectorLabel(text, origin, width * scale, height * scale);
  const used = new Set<string>();
  if (vector.needsFonts) {
    for (const node of [text, ...text.querySelectorAll('*')]) {
      const style = getComputedStyle(node), families = style.fontFamily.replace(/["']/g, '').split(',').map(s => s.trim());
      for (const face of faces) if (families.includes(face.family)) used.add(face.css);
    }
  }
  const { left, top, right, bottom } = vector;
  const paintWidth = (right - left) / scale, paintHeight = (bottom - top) / scale;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" lang="en" xml:lang="en" width="${paintWidth}" height="${paintHeight}" viewBox="${left} ${top} ${right - left} ${bottom - top}">${used.size ? `<style>${esc([...used].join('\n'))}</style>` : ''}${vector.body}</svg>`;
  const result = { href: svgToSrc(svg), x: left / scale, y: top / scale, width: paintWidth, height: paintHeight };
  cache.set(key, result);
  if (cache.size > 1024) cache.delete(cache.keys().next().value!);
  return result;
}
