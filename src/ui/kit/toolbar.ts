import { locale, t } from '../../i18n';
import { buttonClass } from './button';
import { iconSvg } from './icons';

// How a one-line toolbar copes with too little width, for Toolbar.svelte and for bars built as strings (the Table's
// and the Document view's) or in the shell (the top bar). It never wraps: first (`lean`) it drops the icons of
// controls that also have a label, then it scrolls sideways with no scroll bar, a plain mouse wheel scrolling it too,
// and the side with more to see fades out over 32px (`more-l` / `more-r`, kit.css). It measures the bar itself, so it
// works in a panel as well as across the window. With `arrows`, a side with more to see also shows a ‹ or › button
// that scrolls the bar on by most of its width, so a bar that has lost half its controls (the top bar on a tablet)
// says so; they are for the pointer and touch, keyboard focus scrolls the bar itself. Returns a function that stops it.
export function fitToolbar(bar: HTMLElement, { lean = true, arrows = false }: { lean?: boolean; arrows?: boolean } = {}): () => void {
  const over = () => bar.scrollWidth > bar.clientWidth + 1;
  const arrow = (dir: -1 | 1) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = buttonClass({ icon: true, variant: 'flat', extra: 'tb-arrow ' + (dir < 0 ? 'tb-arrow-l' : 'tb-arrow-r') });
    b.tabIndex = -1;
    b.setAttribute('aria-hidden', 'true');
    b.innerHTML = iconSvg(dir < 0 ? 'scrollBack' : 'scrollOn');
    b.hidden = true;
    b.addEventListener('click', () => bar.scrollBy({ left: dir * Math.max(80, bar.clientWidth * 0.7), behavior: 'smooth' }));
    return b;
  };
  const back = arrows ? arrow(-1) : null, on = arrows ? arrow(1) : null;
  if (back && on) { bar.classList.add('has-arrows'); bar.prepend(back); bar.append(on); }
  const untitle = back && on ? locale.subscribe(() => {
    back.title = t('ui.scrollBack', 'Show the controls to the left');
    on.title = t('ui.scrollOn', 'Show the controls to the right');
  }) : null;
  const edges = () => {
    const l = bar.scrollLeft > 1, r = bar.scrollLeft + bar.clientWidth < bar.scrollWidth - 1;
    bar.classList.toggle('more-l', l);
    bar.classList.toggle('more-r', r);
    if (back && on) { back.hidden = !l; on.hidden = !r; }
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
  // the bar and each control: a group shown or hidden changes the content's width. Not the arrows: fit shows and hides
  // them, and an element watched that changes size in its own observer's callback is a "ResizeObserver loop" (an error)
  const ro = new ResizeObserver(fit);
  const watch = () => { ro.disconnect(); ro.observe(bar); for (const c of bar.children) if (c !== back && c !== on) ro.observe(c); };
  const mo = new MutationObserver(watch);
  watch();
  mo.observe(bar, { childList: true });
  bar.addEventListener('scroll', edges, { passive: true });
  bar.addEventListener('wheel', wheel, { passive: false });
  fit();
  return () => {
    untitle?.(); back?.remove(); on?.remove(); bar.classList.remove('has-arrows');
    ro.disconnect(); mo.disconnect();
    bar.removeEventListener('scroll', edges);
    bar.removeEventListener('wheel', wheel);
  };
}
