/** One clipped SVG view reuses the live scene, including decoded label images. No reparsing or camera changes. */
export function createCanvasMagnifier(stage: HTMLElement, canvas: SVGSVGElement, view: () => { x: number; y: number; zoom: number }) {
  const lens = document.createElement('div'); lens.className = 'canvas-magnifier'; lens.hidden = true;
  lens.setAttribute('aria-hidden', 'true'); lens.setAttribute('inert', '');
  lens.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg"><use href="#pageLayer"/><use href="#grid"/><use href="#content"/></svg><span></span>';
  stage.append(lens);
  const image = lens.querySelector('svg')!, label = lens.querySelector('span')!;
  let factor = 3, pointer: { clientX: number; clientY: number } | null = null;
  function show(e: { clientX: number; clientY: number }) {
    pointer = { clientX: e.clientX, clientY: e.clientY };
    const r = canvas.getBoundingClientRect(), host = stage.getBoundingClientRect(), v = view();
    if (!r.width || !r.height || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) { lens.hidden = true; pointer = null; return; }
    const diameter = Math.min(220, r.width, r.height), extent = diameter / (v.zoom * factor);
    const x = v.x + (e.clientX - r.left) / v.zoom, y = v.y + (e.clientY - r.top) / v.zoom;
    image.setAttribute('viewBox', `${x - extent / 2} ${y - extent / 2} ${extent} ${extent}`);
    lens.style.width = lens.style.height = diameter + 'px';
    lens.style.left = Math.max(r.left-host.left, Math.min(e.clientX-host.left-diameter/2, r.right-host.left-diameter)) + 'px';
    lens.style.top = Math.max(r.top-host.top, Math.min(e.clientY-host.top-diameter/2, r.bottom-host.top-diameter)) + 'px';
    label.textContent = factor.toFixed(1).replace('.0','') + '×'; lens.hidden = false;
  }
  return { show, hide() { lens.hidden = true; pointer = null; }, refresh() { if (pointer) show(pointer); },
    zoom(step: number) { factor = Math.max(1.5, Math.min(8, factor * step)); if (pointer) show(pointer); },
    get factor() { return factor; }, get element() { return lens; } };
}
