// How a one-line toolbar copes with too little width, for Toolbar.svelte and for bars built as strings (the Table's
// and the Document view's) or in the shell (the top bar). It never wraps: first (`lean`) it drops the icons of
// controls that also have a label, then it scrolls sideways with no scroll bar, a plain mouse wheel scrolling it too,
// and the side with more to see fades out over 32px (`more-l` / `more-r`, kit.css). It measures the bar itself, so it
// works in a panel as well as across the window. Returns a function that stops it.
export function fitToolbar(bar: HTMLElement, { lean = true }: { lean?: boolean } = {}): () => void {
  const over = () => bar.scrollWidth > bar.clientWidth + 1;
  const edges = () => {
    bar.classList.toggle('more-l', bar.scrollLeft > 1);
    bar.classList.toggle('more-r', bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 1);
  };
  const fit = () => {
    // full first; lean only if the full bar doesn't fit (measured with the class off, then on)
    if (lean) { bar.classList.remove('lean'); bar.classList.toggle('lean', over()); }
    edges();
  };
  const wheel = (e: WheelEvent) => {
    // trackpads scroll sideways themselves; ⌃wheel is the browser's zoom
    if (!over() || Math.abs(e.deltaX) >= Math.abs(e.deltaY) || e.ctrlKey) return;
    e.preventDefault();
    bar.scrollLeft += e.deltaY;
  };
  // the bar and each control: a group shown or hidden changes the content's width
  const ro = new ResizeObserver(fit);
  const watch = () => { ro.disconnect(); ro.observe(bar); for (const c of bar.children) ro.observe(c); };
  const mo = new MutationObserver(watch);
  watch();
  mo.observe(bar, { childList: true });
  bar.addEventListener('scroll', edges, { passive: true });
  bar.addEventListener('wheel', wheel, { passive: false });
  fit();
  return () => {
    ro.disconnect(); mo.disconnect();
    bar.removeEventListener('scroll', edges);
    bar.removeEventListener('wheel', wheel);
  };
}
