import fonts from './label-glyphs';
import { escapeHtml } from '../core/html';

type Font = (typeof fonts)[string];
const esc = escapeHtml;
const ns = 'http://www.w3.org/2000/svg';
let fontMetrics: CanvasRenderingContext2D | null | undefined;
// Read baselines in their real inline contexts. A font box alone is insufficient:
// WebKit's Range top can depend on the glyphs. Batch all marker writes and reads
// so one label does not force a new layout for every glyph or text run.
function baselines(root: HTMLElement): WeakMap<Text, { y: number; top: number }> {
  const values = new WeakMap<Text, { y: number; top: number }>();
  const entries: { node: Text; marker: HTMLElement; top: number }[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if ((!/[^\s\u200b]/u.test(node.data) && decorations(node.parentElement) === 'none') || node.parentElement?.closest('svg,math,style,script,.katex-mathml')) continue;
    range.selectNodeContents(node); const rect = range.getClientRects()[0]; if (!rect) continue;
    const marker = document.createElement('span');
    marker.style.cssText = 'display:inline-block!important;position:static!important;width:0!important;height:0!important;padding:0!important;margin:0!important;border:0!important;vertical-align:baseline!important;font-size:0!important;line-height:0!important';
    entries.push({ node, marker, top: rect.top });
  }
  for (const { node, marker } of entries) node.before(marker);
  for (const { node, marker, top } of entries) {
    range.selectNodeContents(node); const after = range.getClientRects()[0];
    values.set(node, { y: marker.getBoundingClientRect().top - ((after?.top ?? top) - top), top });
  }
  for (const { marker } of entries) marker.remove();
  return values;
}

function decorations(element: Element | null): string {
  const values = new Set<string>();
  for (let parent = element; parent; parent = parent.parentElement) {
    for (const value of getComputedStyle(parent).textDecorationLine.split(' ')) if (value !== 'none') values.add(value);
  }
  return [...values].join(' ') || 'none';
}

function fontOf(style: CSSStyleDeclaration): Font | undefined {
  for (const family of style.fontFamily.replace(/["']/g, '').split(',').map(s => s.trim())) {
    const font = fonts[[family, style.fontStyle, style.fontWeight].join('|')];
    if (font) return font;
  }
}
// These bundled TrueType outlines contain absolute move/line/quadratic commands.
// Translate the actual font coordinates; keep their original precision.
function shifted(path: string, advance: number): string {
  if (!advance) return path;
  return path.replace(/([MLQC])([^MLQCZ]*)/g, (_, command: string, values: string) =>
    command + values.trim().split(/[ ,]+/).map((value, i) => i % 2 ? value : String(Number(value) + advance)).join(' '));
}

export interface VectorLabel { body: string; left: number; top: number; right: number; bottom: number; needsFonts: boolean }
export function vectorLabel(root: HTMLElement, origin: DOMRect, width: number, height: number): VectorLabel {
  const parts: string[] = [], measuredBaselines = baselines(root);
  let left = 0, top = 0, right = width, bottom = height, needsFonts = false, clipId = 0;
  const clips: DOMRect[] = [];
  const include = (x: number, y: number, w: number, h: number) => {
    if (![x, y, w, h].every(Number.isFinite)) return;
    for (const clip of clips) {
      const endX = Math.min(x + w, clip.right), endY = Math.min(y + h, clip.bottom);
      x = Math.max(x, clip.left); y = Math.max(y, clip.top); w = endX - x; h = endY - y;
      if (w < 0 || h < 0) return;
    }
    left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + w); bottom = Math.max(bottom, y + h);
  };
  const rectangle = (rect: DOMRect, fill: string) => {
    if (!rect.width || !rect.height || fill === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(fill)) return;
    const x = rect.left - origin.left, y = rect.top - origin.top;
    parts.push(`<rect x="${x}" y="${y}" width="${rect.width}" height="${rect.height}" fill="${esc(fill)}"/>`);
    include(x, y, rect.width, rect.height);
  };
  function text(node: Text, style: CSSStyleDeclaration, decoration: string, mirrored: boolean) {
    const value = node.data, font = fontOf(style), size = parseFloat(style.fontSize);
    const base = measuredBaselines.get(node), range = document.createRange();
    if (!base) return;
    // A word is shaped from the font's own advances. Whitespace remains in the
    // HTML layout, so wrapping and justification determine each word's origin.
    // Unsupported scripts/variants retain native SVG text shaping and fallback.
    for (const word of value.matchAll(/[^\s\u200b]+|[\s]+/gu)) {
      if (!/\S/u.test(word[0]) && decoration === 'none') continue;
      const start = word.index!; range.setStart(node, start); range.setEnd(node, start + word[0].length);
      const rects = [...range.getClientRects()];
      const runs: { value: string; rect: DOMRect }[] = [];
      if (rects.length <= 1) { if (rects[0]) runs.push({ value: word[0], rect: rects[0] }); }
      else {
        // Native Unicode line breaking can divide CJK/Thai words without spaces.
        // Keep those line boundaries rather than imposing Latin word wrapping.
        let index = start;
        for (const char of word[0]) {
          range.setStart(node, index); index += char.length; range.setEnd(node, index);
          const rect = range.getBoundingClientRect(), last = runs[runs.length - 1];
          if (last && last.rect.top === rect.top) {
            last.value += char;
            last.rect = new DOMRect(last.rect.left, last.rect.top, rect.right - last.rect.left, last.rect.height);
          } else runs.push({ value: char, rect });
        }
      }
      for (const run of runs) {
        const x = (mirrored ? run.rect.right : run.rect.left) - origin.left, y = base.y - origin.top + run.rect.top - base.top;
        const outlined = font && style.fontVariantCaps === 'normal' && !/\p{Mark}/u.test(run.value) &&
          [...run.value].every(char => font.chars[char.codePointAt(0)!] != null) && decoration === 'none';
        if (outlined) {
          let advance = 0, path = ''; const scale = size / font.em;
          for (const char of run.value) {
            const [w, d, x0, y0, x1, y1] = font.glyphs[font.chars[char.codePointAt(0)!]];
            path += shifted(d, advance);
            if (d) include(x + (mirrored ? -(advance + x1) : advance + x0) * scale, y - y1 * scale, (x1 - x0) * scale, (y1 - y0) * scale);
            advance += w;
          }
          parts.push(`<path data-label-text="${esc(run.value)}"${node.parentElement?.closest('.accent-body') ? ' data-label-accent="true"' : ''} data-baseline="${y}" data-advance="${advance * scale}" transform="translate(${x} ${y}) scale(${mirrored ? -scale : scale} ${-scale})" fill="${esc(style.color)}" d="${path}"/>`);
        } else {
          const usesBundled = !!font && [...run.value].some(char => font.chars[char.codePointAt(0)!] != null);
          if (usesBundled) needsFonts = true;
          const family = usesBundled ? style.fontFamily : style.fontFamily.replace(/\bKaTeX_\w+\s*,\s*/g, '') || 'serif';
          parts.push(`<text x="0" y="0" transform="translate(${x} ${y}) scale(${mirrored ? -1 : 1} 1)" fill="${esc(style.color)}" style="font-family:${esc(family)};font-size:${size}px;font-weight:${style.fontWeight};font-style:${style.fontStyle};font-variant:${style.fontVariant};text-decoration:${decoration};white-space:pre">${esc(run.value)}</text>`);
          include(run.rect.left - origin.left, run.rect.top - origin.top, run.rect.width, run.rect.height);
          // Native fallback ink can overhang its allocation, notably italic
          // system faces. TextMetrics expands the viewport without moving it.
          if (fontMetrics === undefined) fontMetrics = document.createElement('canvas').getContext('2d');
          if (fontMetrics) {
            fontMetrics.font = `${style.fontStyle} ${style.fontVariantCaps === 'small-caps' ? 'small-caps ' : ''}${style.fontWeight} ${size}px ${family}`;
            const ink = fontMetrics.measureText(run.value);
            const a = mirrored ? x - ink.actualBoundingBoxRight : x - ink.actualBoundingBoxLeft;
            include(a, y - ink.actualBoundingBoxAscent, ink.actualBoundingBoxLeft + ink.actualBoundingBoxRight, ink.actualBoundingBoxAscent + ink.actualBoundingBoxDescent);
          }
        }
      }
    }
  }
  function visit(element: Element, inheritedDecoration = 'none', inheritedReflection = false) {
    if (element.matches('.katex-mathml,style,script,annotation,math')) return;
    const style = getComputedStyle(element);
    if (style.display === 'none') return;
    const matrix = style.transform === 'none' ? null : new DOMMatrix(style.transform);
    const mirrored = inheritedReflection !== !!(matrix && matrix.a < 0 && matrix.d > 0 && matrix.b === 0 && matrix.c === 0);
    const decoration = [...new Set([inheritedDecoration, style.textDecorationLine].join(' ').split(' ').filter(value => value !== 'none'))].join(' ') || 'none';
    if (element.namespaceURI === ns && element.tagName.toLowerCase() === 'svg') {
      const rect = element.getBoundingClientRect(), clone = element.cloneNode(true) as SVGElement;
      clone.setAttribute('x', String(rect.left - origin.left)); clone.setAttribute('y', String(rect.top - origin.top));
      clone.setAttribute('width', String(rect.width)); clone.setAttribute('height', String(rect.height));
      clone.setAttribute('style', `overflow:visible;color:${style.color};font-size:${style.fontSize}`);
      // KaTeX's stylesheet paints its pictures (.katex svg: filled and stroked in the text's colour, paths unstroked),
      // and a label's picture has no stylesheet: \cancel's line and a coloured radical or brace need it on them
      if (element.closest('.katex')) {
        for (const [name, value] of [['fill', 'currentColor'], ['stroke', 'currentColor'], ['stroke-width', '1']]) if (!clone.hasAttribute(name)) clone.setAttribute(name, value);
        for (const path of clone.querySelectorAll('path')) if (!path.hasAttribute('stroke')) path.setAttribute('stroke', 'none');
      }
      if (element.closest('.accent-body')) clone.setAttribute('data-label-accent', 'true');
      if (element.closest('.td-math')) {
        const box = element.getAttribute('viewBox')?.split(/\s+/).map(Number);
        if (box?.length === 4) clone.setAttribute('data-label-math-baseline', String(rect.top - origin.top - box[1] * rect.height / box[3]));
      }
      const content = new XMLSerializer().serializeToString(clone);
      parts.push(mirrored ? `<g transform="translate(${rect.left + rect.right - 2 * origin.left} 0) scale(-1 1)">${content}</g>` : content);
      include(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height); return;
    }
    for (const rect of element.getClientRects()) {
      rectangle(rect, style.backgroundColor);
      const borders = [
        [style.borderTopWidth, style.borderTopColor, rect.left, rect.top, rect.width, parseFloat(style.borderTopWidth)],
        [style.borderBottomWidth, style.borderBottomColor, rect.left, rect.bottom - parseFloat(style.borderBottomWidth), rect.width, parseFloat(style.borderBottomWidth)],
        [style.borderLeftWidth, style.borderLeftColor, rect.left, rect.top, parseFloat(style.borderLeftWidth), rect.height],
        [style.borderRightWidth, style.borderRightColor, rect.right - parseFloat(style.borderRightWidth), rect.top, parseFloat(style.borderRightWidth), rect.height],
      ] as [string, string, number, number, number, number][];
      const kinds = [style.borderTopStyle, style.borderBottomStyle, style.borderLeftStyle, style.borderRightStyle];
      borders.forEach(([amount, color, x, y, w, h], i) => {
        const thickness = parseFloat(amount); if (!thickness) return;
        if (kinds[i] === 'dashed' || kinds[i] === 'dotted') {
          const ax = x - origin.left, ay = y - origin.top;
          const a = i < 2 ? [ax, ay + h / 2] : [ax + w / 2, ay], b = i < 2 ? [ax + w, ay + h / 2] : [ax + w / 2, ay + h];
          const dash = thickness * (kinds[i] === 'dashed' ? 3 : 1);
          parts.push(`<path d="M${a.join(' ')}L${b.join(' ')}" fill="none" stroke="${esc(color)}" stroke-width="${thickness}" stroke-dasharray="${dash} ${dash}"/>`);
          include(x - origin.left, y - origin.top, w, h);
        } else rectangle(new DOMRect(x, y, w, h), color);
      });
    }
    const outline = parseFloat(style.outlineWidth);
    if (outline && style.outlineStyle !== 'none') {
      const rect = element.getBoundingClientRect(), x = rect.left - origin.left, y = rect.top - origin.top;
      const dash = style.outlineStyle === 'dashed' ? ` stroke-dasharray="${outline * 3} ${outline * 3}"` : style.outlineStyle === 'dotted' ? ` stroke-dasharray="${outline} ${outline}"` : '';
      parts.push(`<rect x="${x - outline / 2}" y="${y - outline / 2}" width="${rect.width + outline}" height="${rect.height + outline}" fill="none" stroke="${esc(style.outlineColor)}" stroke-width="${outline}"${dash}/>`);
      include(x - outline, y - outline, rect.width + 2 * outline, rect.height + 2 * outline);
    }
    const clipped = [style.overflowX, style.overflowY].some(value => value === 'hidden' || value === 'clip');
    if (clipped) {
      const rect = element.getBoundingClientRect(), id = `label-clip-${++clipId}`;
      const clip = new DOMRect(rect.left - origin.left, rect.top - origin.top, rect.width, rect.height);
      clips.push(clip);
      parts.push(`<defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${clip.x}" y="${clip.y}" width="${clip.width}" height="${clip.height}"/></clipPath></defs><g clip-path="url(#${id})">`);
    }
    for (const child of element.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) text(child as Text, style, decoration, mirrored);
      else if (child.nodeType === Node.ELEMENT_NODE) visit(child as Element, decoration, mirrored);
    }
    if (clipped) { parts.push('</g>'); clips.pop(); }
  }
  visit(root);
  return { body: parts.join(''), left, top, right, bottom, needsFonts };
}
