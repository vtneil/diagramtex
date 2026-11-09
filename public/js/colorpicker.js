// Popover color picker: saturation/value square, hue + alpha sliders, hex/RGBA inputs,
// optional "No Color", and editable preset swatches (saved in localStorage).
(function () {
  const TD = (window.TD = window.TD || {});
  const LS = 'texdiagram.presets';
  const DEFAULT_PRESETS = ['#c62828', '#e8a33d', '#f5e44c', '#7e5530', '#8fd14f', '#4a7a1e', '#b02ad6', '#8a2be2',
    '#5b8ede', '#7adfc5', '#c5e897', '#000000', '#4a4a4a', '#9e9e9e', '#808080', '#ffffff'];
  let presets;
  try { presets = JSON.parse(localStorage.getItem(LS)) || DEFAULT_PRESETS.slice(); } catch (e) { presets = DEFAULT_PRESETS.slice(); }
  const savePresets = () => { try { localStorage.setItem(LS, JSON.stringify(presets)); } catch (e) { /* ignore */ } };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hex2 = (n) => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');
  function hsv2rgb(h, s, v) {
    const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
    return [f(5) * 255, f(3) * 255, f(1) * 255];
  }
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) {
      if (mx === r) h = 60 * (((g - b) / d) % 6);
      else if (mx === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    return [(h + 360) % 360, mx ? d / mx : 0, mx];
  }
  function parse(c) {
    const p = TD.parseColor(c || '#000000');
    const n = parseInt(p.hex.slice(1), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: p.a };
  }
  const toStr = (r, g, b, a) => '#' + hex2(r) + hex2(g) + hex2(b) + (a < 0.999 ? hex2(a * 255) : '');

  let el = null, cur = null;

  function build() {
    el = document.createElement('div');
    el.className = 'cp';
    el.innerHTML = `
      <div class="cp-tabs"><button type="button" data-tab="basic">Basic</button><button type="button" data-tab="grad">Gradient</button><button type="button" data-tab="pat">Pattern</button></div>
      <div class="cp-pane" data-pane="basic">
      <button class="cp-none" type="button">No Color</button>
      <div class="cp-sv"><div class="cp-sv-white"></div><div class="cp-sv-black"></div><div class="cp-knob"></div></div>
      <div class="cp-row">
        <div class="cp-sliders">
          <div class="cp-hue"><div class="cp-thumb"></div></div>
          <div class="cp-alpha"><div class="cp-alpha-grad"></div><div class="cp-thumb"></div></div>
        </div>
        <div class="cp-preview"><div></div></div>
      </div>
      <div class="cp-inputs">
        <label><input data-f="hex" maxlength="8"><span>Hex</span></label>
        <label><input data-f="r" type="number" min="0" max="255"><span>R</span></label>
        <label><input data-f="g" type="number" min="0" max="255"><span>G</span></label>
        <label><input data-f="b" type="number" min="0" max="255"><span>B</span></label>
        <label><input data-f="a" type="number" min="0" max="100"><span>A</span></label>
      </div>
      <div class="cp-presets"></div>
      <button class="cp-edit" type="button">Change Preset Colors</button>
      </div>
      <div class="cp-pane fp" data-pane="grad"></div>
      <div class="cp-pane fp" data-pane="pat"></div>`;
    el.querySelector('.cp-tabs').onclick = (e) => { const t = e.target.closest('[data-tab]'); if (t && cur) { showTab(t.dataset.tab); emit(true); } };
    document.body.appendChild(el);

    const drag = (target, fn) => {
      target.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        target.setPointerCapture(e.pointerId);
        const move = (ev) => { const r = target.getBoundingClientRect(); fn(clamp((ev.clientX - r.left) / r.width, 0, 1), clamp((ev.clientY - r.top) / r.height, 0, 1)); emit(false); };
        move(e);
        const up = () => { target.removeEventListener('pointermove', move); target.removeEventListener('pointerup', up); emit(true); };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
      });
    };
    drag(el.querySelector('.cp-sv'), (x, y) => { cur.s = x; cur.v = 1 - y; cur.none = false; });
    drag(el.querySelector('.cp-hue'), (x) => { cur.h = x * 360; cur.none = false; });
    drag(el.querySelector('.cp-alpha'), (x) => { cur.a = x; cur.none = false; });

    el.querySelector('.cp-inputs').addEventListener('change', (e) => {
      const f = e.target.dataset.f;
      const rgb = hsv2rgb(cur.h, cur.s, cur.v);
      let v = e.target.value.trim();
      if (f === 'hex') {
        v = v.replace('#', '');
        if (/^[0-9a-f]{3}$/i.test(v)) v = v.split('').map((c) => c + c).join('');
        if (!/^([0-9a-f]{6}|[0-9a-f]{8})$/i.test(v)) { sync(); return; }
        const p = parse('#' + v);
        setRGB(p.r, p.g, p.b, p.a);
      } else if (f === 'a') cur.a = clamp(+v || 0, 0, 100) / 100;
      else { const i = { r: 0, g: 1, b: 2 }[f]; rgb[i] = clamp(+v || 0, 0, 255); setRGB(rgb[0], rgb[1], rgb[2], cur.a); }
      cur.none = false;
      emit(true);
    });
    el.querySelector('.cp-none').onclick = () => { cur.none = true; emit(true); close(); };
    el.querySelector('.cp-edit').onclick = () => {
      cur.editing = !cur.editing;
      el.classList.toggle('editing', cur.editing);
      el.querySelector('.cp-edit').textContent = cur.editing ? 'Done (click a swatch to replace it)' : 'Change Preset Colors';
    };
    el.querySelector('.cp-presets').addEventListener('click', (e) => {
      const i = e.target.dataset.i;
      if (i == null) return;
      if (cur.editing) { presets[i] = value(); savePresets(); renderPresets(); return; }
      const p = parse(presets[i]);
      setRGB(p.r, p.g, p.b, p.a);
      cur.none = false;
      emit(true);
    });
    document.addEventListener('pointerdown', (e) => { if (el.style.display === 'block' && !el.contains(e.target) && e.target !== cur.anchor) close(); }, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && el.style.display === 'block') { e.stopPropagation(); close(); } }, true);
  }

  function setRGB(r, g, b, a) { const [h, s, v] = rgb2hsv(r, g, b); if (s > 0 && v > 0) cur.h = h; cur.s = s; cur.v = v; cur.a = a; }
  function basicValue() {
    if (cur.none) return null;
    const [r, g, b] = hsv2rgb(cur.h, cur.s, cur.v);
    return toStr(r, g, b, cur.a);
  }
  function showTab(tab) {
    cur.tab = tab;
    el.querySelectorAll('.cp-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    el.querySelectorAll('.cp-pane').forEach((p) => { p.hidden = p.dataset.pane !== tab; });
    const pane = el.querySelector(`[data-pane="${tab}"]`);
    if (tab === 'grad') {
      cur.grad = cur.grad || TD.fillPanes.defaultGrad(cur.base);
      TD.fillPanes.grad(pane, () => cur.grad, (v, final) => { cur.grad = v; emit(final); });
    } else if (tab === 'pat') {
      cur.pat = cur.pat || TD.fillPanes.defaultPat(cur.base);
      TD.fillPanes.pat(pane, () => cur.pat, (v, final) => { cur.pat = v; emit(final); });
    }
    place();
  }
  function value() {
    if (cur.tab === 'grad') return JSON.parse(JSON.stringify(cur.grad));
    if (cur.tab === 'pat') return { ...cur.pat };
    if (cur.none) return null;
    const [r, g, b] = hsv2rgb(cur.h, cur.s, cur.v);
    return toStr(r, g, b, cur.a);
  }
  function renderPresets() {
    el.querySelector('.cp-presets').innerHTML = presets.map((c, i) => `<button type="button" data-i="${i}" style="background:${TD.css(c)}" title="${c}"></button>`).join('');
  }
  function sync() {
    const [r, g, b] = hsv2rgb(cur.h, cur.s, cur.v);
    const hue = hsv2rgb(cur.h, 1, 1).map(Math.round);
    el.querySelector('.cp-sv').style.background = `rgb(${hue})`;
    const knob = el.querySelector('.cp-knob');
    knob.style.left = cur.s * 100 + '%'; knob.style.top = (1 - cur.v) * 100 + '%';
    el.querySelector('.cp-hue .cp-thumb').style.left = (cur.h / 360) * 100 + '%';
    el.querySelector('.cp-alpha .cp-thumb').style.left = cur.a * 100 + '%';
    el.querySelector('.cp-alpha-grad').style.background = `linear-gradient(to right, rgba(${r},${g},${b},0), rgb(${r},${g},${b}))`;
    el.querySelector('.cp-preview div').style.background = cur.none ? 'transparent' : `rgba(${r},${g},${b},${cur.a})`;
    el.querySelector('.cp-preview').classList.toggle('none', !!cur.none);
    const set = (f, v) => { const i = el.querySelector(`[data-f="${f}"]`); if (document.activeElement !== i) i.value = v; };
    set('hex', (hex2(r) + hex2(g) + hex2(b)).toUpperCase());
    set('r', Math.round(r)); set('g', Math.round(g)); set('b', Math.round(b)); set('a', Math.round(cur.a * 100));
  }
  function emit(final) {
    sync();
    const v = value();
    if (final) cur.onChange && cur.onChange(v); else cur.onInput && cur.onInput(v);
  }
  function close() {
    if (!el || el.style.display !== 'block') return;
    el.style.display = 'none';
    const c = cur; cur = null;
    c.onClose && c.onClose();
  }

  function place() {
    if (!cur) return;
    const r = cur.anchor.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    el.style.left = clamp(r.right - w, 8, innerWidth - w - 8) + 'px';
    el.style.top = (r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
  }
  TD.colorPresets = () => presets.slice();

  // opts: { value, nullable, fills (show Gradient / Pattern tabs), onInput(v), onChange(v), onClose() }
  TD.openColorPicker = function (anchor, opts) {
    if (!el) build();
    if (cur) close();
    const rich = opts.value && typeof opts.value === 'object';
    const p = parse(opts.value);
    cur = { ...opts, anchor, h: 0, s: 0, v: 0, a: 1, none: !opts.value, editing: false, tab: 'basic', base: rich ? null : opts.value,
      grad: rich && opts.value.g ? JSON.parse(JSON.stringify(opts.value)) : null, pat: rich && opts.value.p ? { ...opts.value } : null };
    setRGB(p.r, p.g, p.b, p.a);
    el.classList.remove('editing');
    el.querySelector('.cp-edit').textContent = 'Change Preset Colors';
    el.querySelector('.cp-none').style.display = opts.nullable ? '' : 'none';
    renderPresets();
    sync();
    el.style.display = 'block';
    el.querySelector('.cp-tabs').hidden = !opts.fills;
    showTab(rich && opts.fills ? (opts.value.g ? 'grad' : 'pat') : 'basic');
  };
  TD.closeColorPicker = close;
})();
