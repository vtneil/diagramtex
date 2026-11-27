<script lang="ts" module>
  /** How the edited text is drawn (TD.textStyle): its size in px, font CSS, alignment, and whether it is a paragraph. */
  export interface TextDockLook { px: number; css: string; align?: string; para?: boolean }
</script>
<script lang="ts">
  // The canvas's LaTeX text editor: double-click a text or a label (with the LaTeX input setting) and it opens along
  // the bottom of the canvas, left of the floating panel and above the view bar. The source on the left (highlighted,
  // with LaTeX suggestions: texhighlight.ts and texcomplete.ts act on any [data-tx] field), the text as it is drawn on
  // the right, the first LaTeX error under it. Each keystroke is drawn on the canvas too.
  // Keys: Enter is a new line, as in any LaTeX editor; Ctrl/⌘+Enter, Esc, Done or a click away finishes. Cancel puts
  // the text back.
  // Open it with openTextDock() (text-dock.svelte.ts).
  import { onMount } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { runtime as TD } from '../runtime';
  import { locale, t } from '../i18n';
  import { Button, IconButton, Separator, Spacer, keyLabel, openContextMenu, type MenuEntry } from './kit';
  import { texFormatKey, applyTexFormat } from './tex-format';
  import { TEX_GLYPHS } from './tex-glyphs';
  import { envLayout, logicalLinesAt, unendedEnv, ONE_LINE_ENV } from '../core/tex-envs';

  let { value = '', title, placeholder, label, caret, look, oninput, ondone, oncancel }: {
    /** the text when it opens; later changes are ignored, the field is the user's */
    value?: string;
    title: string;
    placeholder?: string;
    /** a name for the field, for screen readers */
    label?: string;
    /** where the caret starts: a number places it there; otherwise the text is selected */
    caret?: number;
    /** how the text is drawn (TD.textStyle): its font for the preview */
    look?: () => TextDockLook;
    oninput?: (text: string) => void;
    ondone: () => void;
    oncancel?: () => void;
  } = $props();

  // svelte-ignore state_referenced_locally
  let text = $state(value);
  let root: HTMLElement | undefined = $state();
  let ta: HTMLTextAreaElement | undefined = $state();
  let envBtn: HTMLButtonElement | undefined = $state();
  let done = false;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  function finish() { if (done) return; done = true; ondone(); }
  function cancel() { if (done) return; done = true; (oncancel ?? ondone)(); }

  // ---- the preview: the text as the canvas draws it, and the first error in it ----
  const preview = $derived.by(() => {
    if (!TD.math || !TD.textHtml) return { html: '', css: '', error: '' };
    const lk = look?.() ?? { px: 13.33, css: '' };
    // the object's font and style, larger than the canvas draws it at 100%
    const css = lk.css.replace(/font-size:[^;]*;?/, '') + `font-size:${Math.round(Math.min(36, Math.max(16, lk.px * 1.5)))}px;` +
      `text-align:${lk.align && lk.align !== 'justify' ? lk.align : lk.para ? 'left' : 'center'};${lk.para ? 'white-space:pre-wrap;' : ''}`;
    const html = text.trim() ? TD.math.synchronous(() => TD.textHtml(text)) : '';
    return { html, css, error: firstError(text) };
  });
  function firstError(src: string): string {
    const open = unendedEnv(src);
    if (open) return t('dock.err.unended', '\\begin{{env}} has no \\end{{env}}: add it after the last row', { env: open }, $locale);
    for (const { line, at } of logicalLinesAt(src)) {
      for (const seg of TD.textSegments(line)) {
        if (!seg.math) continue;
        try { TD.math.synchronous(() => TD.math.render(TD.mathTex(seg), { throwOnError: true })); } catch (e) {
          const why = String((e as Error)?.message || e).replace(/^(?:KaTeX|Temml) parse error:\s*/i, '');
          return t('dock.err.line', 'Line {n}: {why}', { n: at + 1, why }, $locale);
        }
      }
    }
    return '';
  }

  // ---- the source field ----
  function field(el: HTMLTextAreaElement) {
    el.value = value;
    const start = () => {
      el.focus({ preventScroll: true });
      if (typeof caret === 'number') el.setSelectionRange(caret, caret); else el.select();
    };
    start();
    // again a frame later, in case what opened it (the double-click) was still taking the focus
    requestAnimationFrame(() => { if (!done && document.activeElement !== el) start(); });
  }
  function typed(e: Event) { text = (e.currentTarget as HTMLTextAreaElement).value; oninput?.(text); }
  function keys(e: KeyboardEvent) {
    e.stopPropagation(); // typing never reaches the canvas's shortcuts
    const el = e.currentTarget as HTMLTextAreaElement;
    if (texFormatKey(e, el)) return; // ⌘B / ⌘I / ⌘U
    if (e.key === 'Escape') { e.preventDefault(); finish(); return; }
    // Enter alone is the field's own new line
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); finish(); }
  }

  // ---- the toolbar ----
  /** Type `snippet` at the caret, the selection in place of its | (the caret goes there), as the browser's own typing
   *  so its undo takes it back. */
  function insert(snippet: string) {
    if (!ta) return;
    const a = ta.selectionStart, z = ta.selectionEnd, sel = ta.value.slice(a, z), k = snippet.indexOf('|');
    const ins = snippet.slice(0, k) + sel + snippet.slice(k + 1);
    ta.focus({ preventScroll: true });
    if (!document.execCommand?.('insertText', false, ins) || ta.value.slice(a, a + ins.length) !== ins) {
      ta.setRangeText(ins, a, z, 'end');
      ta.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const c = a + k + sel.length;
    ta.setSelectionRange(c, c);
  }
  const format = (style: 'bold' | 'italic') => { if (ta) applyTexFormat(ta, style); };
  // the maths environments most texts want, each on lines of its own (a text reads it as display maths)
  const ENVS = (): [string, string][] => [
    ['aligned', t('dock.env.aligned', 'Aligned Equations', {}, $locale)], ['gathered', t('dock.env.gathered', 'Centred Lines', {}, $locale)],
    ['cases', t('dock.env.cases', 'Cases', {}, $locale)], ['pmatrix', t('dock.env.pmatrix', 'Matrix in Parentheses', {}, $locale)],
    ['bmatrix', t('dock.env.bmatrix', 'Matrix in Brackets', {}, $locale)], ['vmatrix', t('dock.env.vmatrix', 'Determinant', {}, $locale)],
    ['array', t('dock.env.array', 'Array', {}, $locale)],
  ];
  // what each inserts, | the caret; laid out on lines of their own by envLayout, but for the matrices
  const BODY: Record<string, string> = {
    aligned: '| &= \\\\ &= ', gathered: '| \\\\ ', cases: '| & \\text{if } \\\\ & \\text{otherwise}',
    pmatrix: '| & \\\\ & ', bmatrix: '| & \\\\ & ', vmatrix: '| & \\\\ & ', array: '| & \\\\ & ',
  };
  function envMenu() {
    if (!envBtn) return;
    const items: MenuEntry[] = ENVS().map(([env, label]) => ({ act: env, label, title: `\\begin{${env}}` }));
    openContextMenu(items, 0, 0, (env) => {
      if (!ta) return;
      const at = ta.selectionStart, line = ta.value.slice(ta.value.lastIndexOf('\n', at - 1) + 1, at);
      const indent = (/^[ \t]*/.exec(line) || [''])[0], inline = ONE_LINE_ENV.test(env);
      // a block starts a line of its own; a matrix goes where the caret is
      const nl = !inline && line.trim() ? '\n' + indent : '';
      insert(nl + envLayout(`\\begin{${env}}${env === 'array' ? '{cc}' : ''} ${BODY[env]} \\end{${env}}`, indent));
    }, { below: envBtn.getBoundingClientRect(), owner: envBtn });
  }

  // ---- leaving ----
  // a press outside (on the canvas, a panel) finishes, as a click away does; not one in a menu or a suggestion list
  // this field opened
  const ours = (el: Element | null) => !!el && (!!root?.contains(el) || !!el.closest('.ctx, #texComplete, .td-tip'));
  onMount(() => {
    const away = (e: PointerEvent) => { if (!ours(e.target as Element)) finish(); };
    document.addEventListener('pointerdown', away, true);
    return () => { done = true; document.removeEventListener('pointerdown', away, true); };
  });
  // the focus moving out by the keyboard finishes too
  function left() { setTimeout(() => { const a = document.activeElement; if (!done && a && a !== document.body && !ours(a)) finish(); }, 0); }
  // pressing the dock's own background (the preview, the head) keeps the caret in the field
  function hold(e: PointerEvent) { if (!(e.target as Element).closest('button, textarea, input, a')) e.preventDefault(); }

  /** Rises from the bottom (220ms) and sinks back (160ms): mounted and unmount(…, { outro: true }) (text-dock.svelte.ts). */
  function rise(_: Element, __: unknown, { direction }: { direction: 'in' | 'out' | 'both' }) {
    return { duration: reduced() ? 0 : direction === 'out' ? 160 : 220, easing: cubicOut, css: (k: number) => `opacity: ${k}; transform: translateY(${(1 - k) * 12}px)` };
  }
</script>
<!-- svelte-ignore a11y_no_noninteractive_element_interactions (Esc from any of its controls finishes; keys stay out of the canvas) -->
<section bind:this={root} class="text-dock" aria-label={title} in:rise|global out:rise|global
  onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') { e.preventDefault(); finish(); } }} onfocusout={left} onpointerdown={hold}>
  <div class="td-head">
    <strong class="td-title">{title}</strong>
    <div class="td-tools" role="toolbar" aria-label={t('dock.tools', 'Formatting', {}, $locale)}>
      <IconButton svg={TEX_GLYPHS.b} title={t('dock.bold', 'Bold (Ctrl+B)', {}, $locale)} onclick={() => format('bold')} />
      <IconButton svg={TEX_GLYPHS.i} title={t('dock.italic', 'Italic (Ctrl+I)', {}, $locale)} onclick={() => format('italic')} />
      <IconButton svg={TEX_GLYPHS.math} title={t('doc.fmt.math', 'Inline maths $…$', {}, $locale)} onclick={() => insert('$|$')} />
      <Separator />
      <Button variant="flat" class="td-env" bind:el={envBtn} aria-haspopup="menu" title={t('dock.env.title', 'Insert a maths environment: aligned equations, cases, a matrix', {}, $locale)} onclick={envMenu}>{t('dock.env', 'Environment', {}, $locale)}<svg class="td-chev" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5l3 3 3-3"/></svg></Button>
    </div>
    <Spacer />
    <Button onclick={cancel} title={t('dock.cancel.title', 'Put the text back as it was', {}, $locale)}>{t('ui.cancel', 'Cancel', {}, $locale)}</Button>
    <Button variant="primary" onclick={finish} title="Ctrl+Enter">{t('ui.done', 'Done', {}, $locale)}</Button>
  </div>
  <div class="td-body">
    <div class="td-src">
      <textarea bind:this={ta} class="td-dock-ta" data-tx="text" spellcheck="false" {placeholder} aria-label={label ?? placeholder ?? title}
        {@attach field} oninput={typed} onkeydown={keys}></textarea>
    </div>
    <div class="td-view">
      <div class="td-page" aria-label={t('dock.preview', 'Preview', {}, $locale)} role="img">
        {#if preview.html}<div class="tx" style={preview.css}>{@html preview.html}</div>{:else}<span class="td-empty">{t('dock.empty', 'The text appears here as it is drawn', {}, $locale)}</span>{/if}
      </div>
      <div class={['td-msg', preview.error && 'err']} role="status" aria-live="polite">{preview.error || t('dock.keys', '{newline} for a new line · {done} or {esc} to finish', { newline: keyLabel('Enter'), done: keyLabel('Ctrl+Enter'), esc: 'Esc' }, $locale)}</div>
    </div>
  </div>
</section>
