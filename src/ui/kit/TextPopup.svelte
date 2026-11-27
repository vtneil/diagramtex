<script lang="ts" module>
  export type TextPopupKind = 'line' | 'para' | 'code';
</script>
<script lang="ts">
  // The in-place text editor that opens over an item (double-click a label): a LaTeX field, highlighted and with
  // LaTeX autocomplete (texhighlight.ts and texcomplete.ts act on it), or MathLive (one maths field per line,
  // TD.input.mount), following the Text input setting. It floats in a positioned `host`, its top centre at
  // (x, y) in host pixels, kept 8px inside the host. Esc, a click away, or Enter finishes; for a paragraph or code
  // Enter is a new line and ⌘/Ctrl+Enter finishes. ⌘B, ⌘I and ⌘U format the selection in LaTeX, as text or maths
  // (tex-format.ts). It fades in and out.
  // Open it with openTextPopup() (text-popup.ts) from code that isn't Svelte.
  import { onMount, tick, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { runtime as TD } from '../../runtime';
  import { locale, t } from '../../i18n';
  import { isMac } from './keys';
  import { texFormatKey } from '../tex-format';
  let { value = '', kind = 'line', math = false, bare = false, prose, start, caret, roomy = false, mode, x, y, width, placeholder, label, oninput, ondone, onfallback }: {
    /** the text when it opens; later changes are ignored, the field is the user's */
    value?: string;
    /** line: Enter finishes · para: Enter is a new line, ⌘Enter finishes · code: para in mono, caret at the end */
    kind?: TextPopupKind;
    /** the content is maths without $ (a quantikz gate): green throughout, and MathLive starts in maths */
    math?: boolean;
    /** a lone command such as \ket{0} is maths in MathLive */
    bare?: boolean;
    /** MathLive: new lines start as text (a text box) rather than maths; defaults to !math */
    prose?: boolean;
    /** MathLive, opened empty: start in maths or in text (default: maths for `math`, else text) */
    start?: 'math' | 'text';
    /** LaTeX field: where the caret starts: 'all' selects the text (the default; code: 'end'), a number places it there */
    caret?: 'all' | 'end' | number;
    /** the canvas's text editor: a roomier field (76px for a line), resizable by its corner, under the app's popovers */
    roomy?: boolean;
    /** 'latex' | 'mathlive'; defaults to the Text input setting (code is always LaTeX) */
    mode?: 'latex' | 'mathlive';
    x: number; y: number;
    /** box width in px (default 300 for a line, 360 for a paragraph, 520 for code) */
    width?: number;
    placeholder?: string;
    /** a name for the field, for screen readers */
    label?: string;
    oninput?: (text: string) => void;
    ondone: () => void;
    /** MathLive couldn't load (offline before it was cached): this edit goes on in the LaTeX field */
    onfallback?: () => void;
  } = $props();
  // the field owns the text once open
  // svelte-ignore state_referenced_locally
  const v0 = value;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const multi = $derived(kind !== 'line');
  const mod = isMac ? '⌘' : 'Ctrl+';
  // the input mode is chosen once, when it opens (a failed MathLive load falls back to LaTeX)
  // svelte-ignore state_referenced_locally
  let useMl = $state(kind !== 'code' && (mode ?? TD.input?.mode) === 'mathlive');
  let box: HTMLElement | undefined = $state();
  let done = false;
  let ml: { destroy(): void } | null = null;

  const shown = $derived(placeholder ?? (
    kind === 'code' ? t('ed.code', 'quantikz code — Enter for a new line, {mod}Enter or Esc to finish', { mod }, $locale)
    : kind === 'para' ? t('ed.para', 'Paragraph, $math$ — Enter for a new line, {mod}Enter or Esc to finish', { mod }, $locale)
    : math ? t('input.ph.math', 'Maths, without $ — Enter to finish', {}, $locale)
    : t('input.ph.text', 'Text, $math$ — Enter to finish', {}, $locale)));
  const w = $derived(width ?? (kind === 'code' ? 520 : kind === 'para' ? 360 : useMl ? 320 : 300));

  function finish() { if (done) return; done = true; ondone(); }
  // The box sits in the browser's top layer (a manual popover), over everything (the tool rail, the side panes, an
  // editor's frame) however large it is resized, while staying in its host in the page, so keys, focus and clicks
  // still belong there. (x, y) are in the host's pixels; place() turns them into the window's.
  let anchor: HTMLElement | null = null;
  const hostOf = (el: HTMLElement) => { let h = el.parentElement; while (h && h !== document.body && getComputedStyle(h).position === 'static') h = h.parentElement; return h; };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  /** Keep the whole box in its host's visible area (it is centred on x by translateX(-50%)) while it fits there, and
   *  always in the window: it can't be made larger than the window less 8px each side (kit.css), and resizing it
   *  past its host's edge moves it back inside the window rather than off it. */
  export function place() {
    if (!box || box.classList.contains('leaving') || !box.isConnected) return;
    const host = anchor ?? (anchor = hostOf(box));
    if (!box.matches(':popover-open')) { try { box.showPopover(); } catch { /* not in the page yet */ } }
    const r = host ? host.getBoundingClientRect() : { left: 0, top: 0 };
    const W = host?.clientWidth ?? innerWidth, H = host?.clientHeight ?? innerHeight, sx = host?.scrollLeft ?? 0, sy = host?.scrollTop ?? 0;
    const L = r.left + (host?.clientLeft ?? 0), T = r.top + (host?.clientTop ?? 0);
    const bw = box.offsetWidth, bh = box.offsetHeight;
    const cx = L + clamp(x - sx, bw / 2 + 8, W - bw / 2 - 8), top = T + clamp(y - sy, 8, H - bh - 8);
    box.style.left = clamp(cx, bw / 2 + 8, innerWidth - bw / 2 - 8) + 'px';
    box.style.top = clamp(top, 8, innerHeight - bh - 8) + 'px';
  }
  /** Fades in (140ms) and out (120ms): from a parent's {#if}, or unmount(…, { outro: true }) (text-popup.ts). */
  function pop(node: Element, _: unknown, { direction }: { direction: 'in' | 'out' | 'both' }) {
    if (direction === 'out') { done = true; node.classList.add('leaving'); }
    return { duration: reduced() ? 0 : direction === 'out' ? 120 : 140, easing: cubicOut, css: (k: number) => `opacity: ${k}; scale: ${0.97 + 0.03 * k}` };
  }

  // ---- the LaTeX field ----
  function size(ta: HTMLTextAreaElement) {
    const [lo, hi] = kind === 'code' ? [150, 260] : kind === 'para' ? [120, 260] : roomy ? [76, 260] : [40, 160];
    ta.style.height = 'auto';
    ta.style.height = Math.min(Math.max(ta.scrollHeight + 2, lo), hi) + 'px';
  }
  // Attachments re-run when what they read changes: untracked, so a box that moves (x, y) never resets the text
  function field(ta: HTMLTextAreaElement) {
    // shown first (place opens the popover), then sized: measured before, it takes the full 160px over what it labels
    untrack(() => { ta.value = v0; place(); size(ta); place(); });
    const start = () => {
      ta.focus({ preventScroll: true });
      if (ta.value !== v0) return; // typing already started
      const at = caret ?? (kind === 'code' ? 'end' : 'all');
      if (typeof at === 'number') ta.setSelectionRange(at, at);
      else if (at === 'end') { ta.setSelectionRange(ta.value.length, ta.value.length); ta.scrollTop = ta.scrollHeight; } else ta.select();
    };
    // focused at once (it is shown by now), so keys typed straight after the double-click are the label's, not the
    // canvas's shortcuts; again a frame later, in case what opened it was still taking the focus
    start();
    requestAnimationFrame(() => { if (!done && document.activeElement !== ta) start(); });
  }
  function keys(e: KeyboardEvent) {
    e.stopPropagation(); // keep typing away from the app's shortcuts
    // ⌘B / ⌘I / ⌘U write \textbf… or \mathbf…, as the selection is text or maths (not in code: quantikz source)
    if (kind !== 'code' && texFormatKey(e, e.currentTarget as HTMLTextAreaElement, math)) return;
    if (e.key === 'Escape' || (e.key === 'Enter' && (multi ? e.metaKey || e.ctrlKey : !e.shiftKey))) { e.preventDefault(); finish(); }
  }
  function typed(e: Event) { const ta = e.currentTarget as HTMLTextAreaElement; oninput?.(ta.value); size(ta); place(); }
  function blur(e: FocusEvent) { const ta = e.currentTarget as HTMLTextAreaElement; setTimeout(() => { if (document.activeElement !== ta) finish(); }, 0); }

  // ---- MathLive ----
  function mathlive(host: HTMLElement) {
    TD.input.load().then(() => {
      if (done) return;
      const wrap = math ? !!v0 : bare && /^\s*\\[A-Za-z]/.test(v0) && !v0.includes('$');
      ml = TD.input.mount(host, {
        text: wrap ? `$${v0}$` : v0, para: multi, prose: prose ?? !math, start: v0 ? 'end' : start ?? (math ? 'math' : 'text'),
        // a line that is all maths goes back without its $ where the content is maths already (a maths label: even
        // one opened empty, which isn't wrapped but starts in maths mode)
        onInput: (v: string) => { const u = /^\$([^$]*)\$$/.exec(v); oninput?.((math || wrap) && u ? u[1] : v); place(); },
        onDone: finish,
      });
      tick().then(place);
    }, () => { if (done) return; TD.input.set('latex'); useMl = false; onfallback?.(); }); // offline before it was cached
    return () => { if (ml) { const m = ml; ml = null; m.destroy(); } };
  }

  onMount(() => {
    place();
    // in the window's coordinates now: follow a scrolled host or a resized window
    const follow = () => place();
    addEventListener('scroll', follow, true); addEventListener('resize', follow);
    // resized by its corner (or grown by typing): kept in the window
    const ro = new ResizeObserver(follow);
    if (box) ro.observe(box);
    return () => { done = true; if (ml) ml.destroy(); ro.disconnect(); removeEventListener('scroll', follow, true); removeEventListener('resize', follow); };
  });
  $effect(() => { void x; void y; void w; place(); });
</script>
{#if useMl}
  <div bind:this={box} popover="manual" in:pop|global out:pop|global class={['td-pop-ml', 'text-pop', kind === 'para' && 'para', roomy && 'roomy']} style:width={w + 'px'} role="group" aria-label={label ?? t('ui.text.and.maths.editor', 'Text and maths editor', {}, $locale)} {@attach mathlive}><div class="ml-load">{t('ed.loadingMathLive', 'Loading MathLive…', {}, $locale)}</div></div>
{:else}
  <textarea bind:this={box} popover="manual" in:pop|global out:pop|global class={['td-pop-ta', 'text-pop', kind !== 'line' && kind, roomy && 'roomy']} style:width={w + 'px'} rows="1" spellcheck="false" data-tx={math ? 'math' : undefined}
    placeholder={shown} aria-label={label ?? shown} {@attach field} onkeydown={keys} oninput={typed} onblur={blur}></textarea>
{/if}
