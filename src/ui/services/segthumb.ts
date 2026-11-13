import { runtime as TD } from '../../runtime';
// Switches (segmented controls): the raised knob under the chosen segment is one element per switch that
// slides to the new choice, instead of each segment drawing its own and the knob jumping. It works for
// every switch in the app, including those built later or rebuilt as HTML on each change (the properties
// panel, the export menu): a switch rebuilt right after a click in a switch like it starts its knob where
// the old one was, so the choice still slides. Without the script the segments draw their own knob.
(function () {
  const SEL = '.seg, #props .seg-ctl, .cz-props .seg-ctl, #engineBox .eng-seg, #inputBox .eng-seg, .fp-seg, .cp-tabs';
  const MOVE_MS = 600; // a switch rebuilt within this long of a click slides from the clicked one's knob
  const SLIDE_MS = 240; // a slide's length (the CSS transition), plus a little
  const live = new Map(); // switch → { thumb, shown }
  let intent: any = null; // { key, rect, t }: the knob of the switch last clicked
  let queued = false;

  const buttons = (c: any) => c.querySelectorAll(':scope > button');
  const key = (c: any) => [c.className, c.getAttribute('aria-label') || '']
    .concat([...buttons(c)].map((b) => b.getAttribute('aria-label') || b.getAttribute('title') || b.dataset.tip || b.textContent.trim()))
    .join('|');
  const rectOf = (b: any) => ({ x: b.offsetLeft, y: b.offsetTop, w: b.offsetWidth, h: b.offsetHeight });
  const hidden = (el: any) => !el.isConnected || !el.getClientRects().length;

  const ro = new ResizeObserver(() => schedule());
  const mo = new MutationObserver((recs) => {
    for (const r of recs) {
      // Svelte can reuse a control container for a different kind of field.
      // Its imperative decoration belongs only to segmented controls.
      if (live.has(r.target) && !(r.target as Element).matches(SEL)) {
        release(r.target); schedule(); continue;
      }
      const c = (r.target as Element).closest && (r.target as Element).closest(SEL);
      if (c && live.has(c)) { if (r.type === 'childList') watchButtons(c); place(c, true); }
    }
  });
  function watchButtons(c: any) { for (const b of buttons(c)) ro.observe(b); }

  function release(c: any) {
    live.get(c)?.thumb.remove();
    c.classList.remove('has-thumb');
    ro.unobserve(c);
    for (const b of buttons(c)) ro.unobserve(b);
    live.delete(c);
  }

  function attach(c: any) {
    const thumb = document.createElement('span');
    thumb.className = 'seg-thumb';
    thumb.setAttribute('aria-hidden', 'true');
    c.prepend(thumb);
    c.classList.add('has-thumb');
    const s = { thumb, shown: false, until: 0 };
    live.set(c, s);
    ro.observe(c);
    watchButtons(c);
    mo.observe(c, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    // a rebuilt copy of the switch just clicked: start from the old knob and slide
    if (intent && performance.now() - intent.t < MOVE_MS && intent.key === key(c)) {
      set(s, intent.rect, true);
      s.shown = true;
      s.until = performance.now() + SLIDE_MS;
      intent = null;
    }
    return s;
  }
  function set(s: any, r: any, instant: any) {
    const st = s.thumb.style;
    if (instant) st.transition = 'none';
    st.transform = `translate(${r.x}px, ${r.y}px)`;
    st.width = r.w + 'px';
    st.height = r.h + 'px';
    st.opacity = '1';
    if (instant) { void s.thumb.offsetWidth; st.transition = ''; }
  }
  // A new choice slides; a size change (the window, a name opening out on hover) is followed frame by
  // frame without easing, so the knob never lags behind its segment, unless it lands during a slide.
  function place(c: any, choice?: any) {
    const s = live.get(c) || attach(c);
    const on = c.querySelector(':scope > button.on');
    if (!on || hidden(c)) {
      s.thumb.style.opacity = '0';
      s.shown = false;
      return;
    }
    // first sight, or shown again after being hidden: no slide in from wherever it was
    const now = performance.now();
    if (choice && s.shown) s.until = now + SLIDE_MS;
    set(s, rectOf(on), !s.shown || now > s.until);
    s.shown = true;
  }
  function scan() {
    queued = false;
    for (const c of live.keys()) if (!c.isConnected || !c.matches(SEL) || c.classList.contains('ze-flags')) release(c);
    // Drop observations on retired containers as views mount and unmount.
    mo.disconnect();
    for (const c of live.keys()) mo.observe(c, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    // a row of independent toggles (.ze-flags) can have several on: no single knob, each draws its own
    document.querySelectorAll(SEL).forEach((c) => { if (!c.classList.contains('ze-flags')) place(c); });
  }
  function schedule() { if (!queued) { queued = true; requestAnimationFrame(scan); } }

  // new switches: anything added outside the drawing (whose SVG changes all the time) may hold one
  new MutationObserver((recs) => {
    for (const r of recs) {
      if (r.target instanceof SVGElement) continue;
      for (const n of r.addedNodes) {
        if (n.nodeType === 1 && !(n instanceof SVGElement) && ((n as Element).matches(SEL) || (n as Element).querySelector(SEL))) return schedule();
      }
    }
  }).observe(document.body, { subtree: true, childList: true });

  document.addEventListener('click', (e) => {
    const b = (e.target! as Element).closest && (e.target! as Element).closest('button');
    const c = b && b.parentElement;
    const s = c && live.get(c);
    if (s && s.shown) {
      // where the knob is now, mid-slide included
      const t = s.thumb, m = new DOMMatrix(getComputedStyle(t).transform);
      intent = { key: key(c), rect: { x: m.m41, y: m.m42, w: t.offsetWidth, h: t.offsetHeight }, t: performance.now() };
    }
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', schedule); else schedule();
  if (document.fonts) document.fonts.ready.then(schedule);
})();
