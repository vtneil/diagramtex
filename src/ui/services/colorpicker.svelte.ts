import { mount, unmount, flushSync } from 'svelte';
import { runtime as TD } from '../../runtime';
import { t } from '../../i18n';
import { openPopover, type PopoverHandle } from '../kit/open-popover';
import ColorPicker, { type ColorPickerModel, type ColorPickerActions } from '../ColorPicker.svelte';
import { hsv2rgb, rgb2hsv } from './colour-math';
// The colour picker (src/ui/ColorPicker.svelte) in the kit's Popover: TD.openColorPicker(anchor, opts) opens it under
// its control, TD.closeColorPicker() closes it; it closes on Esc and on a press outside it, fading as every popover
// does. Its state is `cur` (the colour as hue, saturation, value and alpha, and what the caller asked for) and the
// model drawn from it. Preset colours are the user's (saved in localStorage), or xcolor's names in a LaTeX block.
(function () {
  const LS = 'diagramtex.presets';
  const DEFAULT_PRESETS = ['#c62828', '#e8a33d', '#f5e44c', '#7e5530', '#8fd14f', '#4a7a1e', '#b02ad6', '#8a2be2',
    '#5b8ede', '#7adfc5', '#c5e897', '#000000', '#4a4a4a', '#9e9e9e', '#808080', '#ffffff'];
  let presets: string[];
  try { presets = JSON.parse(localStorage.getItem(LS) as string) || DEFAULT_PRESETS.slice(); } catch { presets = DEFAULT_PRESETS.slice(); }
  const TEX_PRESETS = ['red', 'orange', 'yellow', 'green', 'teal', 'cyan', 'blue', 'violet',
    'red!20', 'orange!20', 'yellow!20', 'green!20', 'teal!20', 'cyan!20', 'blue!20', 'violet!20',
    'magenta', 'pink', 'brown', 'olive', 'black', 'darkgray', 'gray', 'white'];
  const savePresets = () => { try { localStorage.setItem(LS, JSON.stringify(presets)); } catch { /* ignore */ } };

  const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
  const hex2 = (n: number) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  function parse(c: any) {
    const p = TD.parseColor(c || '#000000');
    const n = parseInt(p.hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: p.a };
  }
  const toStr = (r: number, g: number, b: number, a: number) => '#' + hex2(r) + hex2(g) + hex2(b) + (a < 0.999 ? hex2(a * 255) : '');

  // cur: the caller's options (onInput, onChange, onClose, tex …), the anchor, and the colour being picked
  let cur: any = null, pop: PopoverHandle | null = null, view: ReturnType<typeof mount> | null = null;
  const model: ColorPickerModel = $state({ tabs: false, tab: 'basic', nullable: false, noneLabel: '', h: 0, s: 0, v: 0, a: 1, none: false, presets: [], canEdit: true, editing: false, grad: null, pat: null });

  function setRGB(r: number, g: number, b: number, a: number) { const [h, s, v] = rgb2hsv(r, g, b); if (s > 0 && v > 0) cur.h = h; cur.s = s; cur.v = v; cur.a = a; }
  function value() {
    if (cur.tab === 'grad') return JSON.parse(JSON.stringify(cur.grad));
    if (cur.tab === 'pat') return { ...cur.pat };
    if (cur.none) return null;
    const [r, g, b] = hsv2rgb(cur.h, cur.s, cur.v);
    return toStr(r, g, b, cur.a);
  }
  // the swatches: the user's presets, or (tex) xcolor's named colours, which a block editor writes by name
  const shown = () => (cur && cur.tex ? TEX_PRESETS.map((n) => TD.tikzColor(n) || '#000000') : presets);
  // the model from cur
  function sync() {
    Object.assign(model, { h: cur.h, s: cur.s, v: cur.v, a: cur.a, none: !!cur.none, tab: cur.tab, editing: !!cur.editing, canEdit: !cur.tex,
      grad: cur.grad && JSON.parse(JSON.stringify(cur.grad)), pat: cur.pat && { ...cur.pat },
      presets: shown().map((c: string, i: number) => ({ css: TD.css(c), title: cur.tex ? TEX_PRESETS[i] : c })) });
    flushSync();
  }
  function emit(final: boolean) {
    sync();
    const v = value();
    if (final) cur.onChange?.(v); else cur.onInput?.(v);
  }
  const act: ColorPickerActions = {
    tab(tab) { if (!cur) return; cur.tab = tab; if (tab === 'grad') cur.grad ||= TD.fillPanes.defaultGrad(cur.base); if (tab === 'pat') cur.pat ||= TD.fillPanes.defaultPat(cur.base); emit(true); },
    none() { cur.none = true; emit(true); close(); },
    sv(s, v, final) { cur.s = s; cur.v = v; cur.none = false; emit(final); },
    hue(h, final) { cur.h = h; cur.none = false; emit(final); },
    alpha(a, final) { cur.a = a; cur.none = false; emit(final); },
    field(f, raw) {
      if (!cur) return;
      const rgb = hsv2rgb(cur.h, cur.s, cur.v);
      let v = raw.trim();
      if (f === 'hex') {
        v = v.replace('#', '');
        if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
        if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) { sync(); return; }
        const p = parse('#' + v);
        setRGB(p.r, p.g, p.b, p.a);
      } else if (f === 'a') cur.a = clamp(+v || 0, 0, 100) / 100;
      else { rgb[{ r: 0, g: 1, b: 2 }[f]] = clamp(+v || 0, 0, 255); setRGB(rgb[0], rgb[1], rgb[2], cur.a); }
      cur.none = false;
      emit(true);
    },
    preset(i) {
      if (cur.editing) { presets[i] = value(); savePresets(); sync(); return; }
      const p = parse(shown()[i]);
      setRGB(p.r, p.g, p.b, p.a);
      cur.none = false;
      emit(true);
    },
    edit() { cur.editing = !cur.editing; sync(); },
    fill(v, final) { if (!cur) return; if (cur.tab === 'grad') cur.grad = v; else if (cur.tab === 'pat') cur.pat = v; emit(final); },
  };
  function close() { pop?.close(); }
  // the popover's own close (Esc, a press outside, close()): a focused field gives its value first
  function closed(p: PopoverHandle) {
    if (p.el.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    if (view) { void unmount(view); view = null; }
    if (pop === p) pop = null;
    const c = cur; cur = null;
    c?.onClose?.();
  }
  TD.colorPresets = () => presets.slice();

  // opts: { value, nullable, fills (show Gradient / Pattern tabs), onInput(v), onChange(v), onClose(), noneLabel ("Default" in tex mode), tex }
  TD.openColorPicker = function (anchor: any, opts: any) {
    if (cur) close();
    const rich = opts.value && typeof opts.value === 'object';
    const p = parse(rich ? null : opts.value);
    cur = { ...opts, anchor, h: 0, s: 0, v: 0, a: 1, none: !opts.value, editing: false, tab: rich && opts.fills ? (opts.value.g ? 'grad' : 'pat') : 'basic', base: rich ? null : opts.value,
      grad: rich && opts.value.g ? JSON.parse(JSON.stringify(opts.value)) : null, pat: rich && opts.value.p ? { ...opts.value } : null };
    setRGB(p.r, p.g, p.b, p.a);
    Object.assign(model, { tabs: !!opts.fills, nullable: !!opts.nullable, noneLabel: opts.noneLabel || (opts.tex ? t('ui.default', 'Default') : t('color.none', 'No Colour')) });
    sync();
    const handle: PopoverHandle = openPopover(anchor, {
      class: 'cp', inset: 12, width: 240, label: t('ui.colour', 'Colour'),
      content(body) { view = mount(ColorPicker, { target: body, props: { model, act } }); },
      onclose: () => closed(handle),
    });
    pop = handle;
  };
  TD.closeColorPicker = close;
  TD.colorPickerOpen = () => !!cur;
  // Esc closes the picker before anything under it hears it (an Export panel it was opened from, an editor)
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && cur) { e.preventDefault(); e.stopPropagation(); close(); } }, true);

  // ---------------------------------------------------------------- LaTeX colours in the block editors
  // A colour field (texColour() in src/ui/editor-fields.ts, drawn by Control.svelte) is this picker's button, its value
  // (an xcolor spec) and a hidden input carrying the field's own data-* attributes. Picking fires focusin / input /
  // change / focusout on that input, as a select would, so each editor's own handlers read it unchanged.
  const XBASE = ['red', 'green', 'blue', 'cyan', 'magenta', 'yellow', 'black', 'white', 'gray', 'darkgray', 'lightgray', 'brown', 'lime', 'olive', 'orange', 'pink', 'purple', 'teal', 'violet'];
  let byHex: any = null;
  // a picked #rrggbb → xcolor's name when it is one (a preset), else the rgb,255 expression
  function spec(hex: any) {
    const h = String(hex || '').toLowerCase().slice(0, 7);
    if (!/^#[0-9a-f]{6}$/.test(h)) return null;
    if (!byHex) { byHex = {}; for (const n of TEX_PRESETS.concat(XBASE)) { const x = TD.tikzColor(n); if (x && !byHex[x.toLowerCase()]) byHex[x.toLowerCase()] = n; } }
    if (byHex[h]) return byHex[h];
    const n = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    return `rgb,255:red,${n[0]};green,${n[1]};blue,${n[2]}`;
  }
  const label = (v: any, dflt: any) => (!v ? dflt || t('ui.default', 'Default') : v.replace(/^\{?rgb,\s*255\s*:\s*red,\s*(\d+);\s*green,\s*(\d+);\s*blue,\s*(\d+)\}?$/, 'RGB $1, $2, $3'));
  const swatch = (v: any, dflt: any) => { const x = v && TD.tikzColor(v); return x ? TD.css(x) : dflt || 'transparent'; };
  // a braced spec when it has commas (rgb,255:…), for key=value lists
  const wrap = (v: any) => (v && /[,;]/.test(v) && !/^\{.*\}$/.test(v) ? `{${v}}` : v);
  const unwrap = (v: any) => String(v || '').trim().replace(/^\{([^{}]*)\}$/, '$1');
  TD.texColor = { spec, label, swatch, wrap, unwrap, PRESETS: TEX_PRESETS };

  document.addEventListener('click', (e) => {
    const btn = (e.target! as Element).closest('button[data-tc]');
    if (!btn || (btn as HTMLButtonElement).disabled) return;
    const inp = btn.parentElement!.querySelector('input[type=hidden]');
    if (!inp) return;
    // the panel may be redrawn while the picker is open: find the field again by its attributes
    const sel = 'input[type=hidden]' + [...inp.attributes].filter((a) => a.name.startsWith('data-')).map((a) => `[${a.name}="${CSS.escape(a.value)}"]`).join('');
    const root = btn.closest('.cz-props, #props, [data-panel]') || document;
    const live = () => (inp.isConnected ? inp : (root.isConnected ? root : document).querySelector(sel) || inp);
    const fire = (type: any) => live().dispatchEvent(new Event(type, { bubbles: true }));
    const show = (v: any) => {
      const i = live(), b = i.parentElement!.querySelector('button[data-tc]'), c = i.parentElement!.querySelector('.cval');
      if (b) { b.classList.toggle('none', !v && !(b as HTMLElement).dataset.dsw); (b.querySelector('span'))!.style.background = swatch(v, (b as HTMLElement).dataset.dsw); }
      if (c) c.textContent = label(v, b && (b as HTMLElement).dataset.dl);
    };
    let last = (inp as HTMLInputElement).value;
    const set = (final: any) => (hex: any) => {
      const v = hex ? spec(hex) : '';
      if (hex && !v) return;
      if (v !== last) { (live() as HTMLInputElement).value = v; last = v; show(v); fire('input'); }
      if (final) fire('change');
    };
    fire('focusin');
    TD.openColorPicker(btn, { value: ((inp as HTMLInputElement).value && TD.tikzColor((inp as HTMLInputElement).value)) || null, nullable: (btn as HTMLElement).dataset.tc === 'n', noneLabel: (btn as HTMLElement).dataset.dl || t('ui.default', 'Default'), tex: true,
      onInput: set(false), onChange: set(true), onClose() { fire('focusout'); } });
  });
})();
