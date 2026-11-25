<script lang="ts">
  // Every kit component in every variant, in light and dark, in English and Thai: change a component, check it here.
  // Development only (npm run dev → /kit.html); not part of the app or the production build.
  import { t, caption, locale, setLocale } from '../../../i18n';
  import { SOLID_ICONS } from '../../solid-icons';
  import { runtime as TD } from '../../../runtime';
  import { Button, IconButton, Icon, ICONS, Kbd, Separator, Spacer, Segmented, Checkbox, Switch, Select, TextField, TextArea, NumberField, TexField, ColourButton, Slider, keyLabel, Menu, openContextMenu, openTextPopup, Tooltip, macKeys, Popover, Flyout, closeFlyouts, openPopover, type PopoverHandle, Badge, EmptyState, SearchField, PanelSection, FormRow, Help, Tile, TileGrid, SplitButton, ListRow, Toolbar, ToolbarGroup, Palette, Swatches, CodePane, EditorFrame, type PaletteCategory, type TextPopupKind, type IconName, type MenuEntry, type SelectOption } from '..';
  const swatchColours = ['#c62828', '#e8a33d', '#f5e44c', '#7e5530', '#8fd14f', '#4a7a1e', '#b02ad6', '#8a2be2', '#5b8ede', '#7adfc5', '#c5e897', '#000000', '#4a4a4a', '#9e9e9e', '#808080', '#ffffff'];
  let swatchEditing = $state(false), swatchPicked = $state('#c62828');
  let theme = $state(document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light');
  $effect(() => { document.documentElement.dataset.theme = theme; });
  const names = Object.keys(ICONS) as IconName[];
  // live state, so each control can be tried
  let orient = $state('portrait'), ball = $state('3d'), align = $state('l'), flags = $state({ grid: true, guides: false, snap: true });
  let tilt = $state(15), radius = $state(1.5), label = $state('\\psi'), note = $state(''), paper = $state('a4'), flatten = $state(true), bold = $state(true);
  const papers = [{ value: 'a4', label: 'A4' }, { value: 'letter', label: 'Letter' }, { value: 'custom', label: 'Custom' }];
  // a menu with every kind of row
  let drawMode = $state('corner'), picked = $state('');
  // Popover and Flyout
  // openPopover and a Flyout's `panel`: panels built as HTML strings by code outside Svelte, as the app's are
  let strPop: PopoverHandle | null = null;
  function stringPopover(btn: HTMLElement) {
    if (strPop && !strPop.closed) { strPop.close(); return; }
    strPop = openPopover(btn, { width: 240, label: 'Built as a string', content: (body) => {
      body.innerHTML = '<div class="exp-h">Built as a string</div><div class="kit-pop-note">openPopover(): code outside Svelte fills the body; the kit places it, fades it and closes it.</div>';
    } });
  }
  const fillPanel = (el: HTMLElement) => {
    el.innerHTML = '<div class="pop-title">Built outside Svelte</div><div class="sym-grid kit-sym">' + ['Axis', 'Grid', 'Brace'].map((n) => `<button type="button" data-kit-pick="${n}" title="${n}">${n[0]}</button>`).join('') + '</div>';
    el.onclick = (e) => { const b = (e.target as Element).closest<HTMLElement>('[data-kit-pick]'); if (b) { tool = b.dataset.kitPick!; closeFlyouts(); } };
  };
  let expOpen = $state(false), expBtn: HTMLButtonElement | undefined = $state(), expFmt = $state('png'), expScale = $state('2');
  let farOpen = $state(false), farBtn: HTMLButtonElement | undefined = $state();
  let tool = $state('');
  // panel pieces
  let query = $state(''), gap = $state(0.5), spacing = $state('');
  const PARTS = ['Resistor', 'Capacitor', 'Inductor', 'Diode', 'Battery', 'Ground', 'Switch', 'Lamp'];
  // tiles, split buttons, list rows, toolbars
  let plot = $state('line'), zipVia = $state(''), zipBtn: HTMLButtonElement | undefined = $state(), zipOpen = $state(false);
  let files = $state([{ id: 'a', name: 'Lecture notes', depth: 0 }, { id: 'b', name: 'Figures', depth: 0 }, { id: 'c', name: 'Circuit for problem 3 with a long name', depth: 1 }, { id: 'd', name: 'Bloch sphere', depth: 1 }]);
  let openFile = $state('a'), renamingId = $state('');
  let tbBold = $state(false), barW = $state(640);
  const PLOTS = [['line', 'Line', 'M4 24l8-8 6 4 10-12'], ['bars', 'Bars', 'M6 26V14M14 26V8M22 26V18M30 26V11'], ['scatter', 'Scatter', 'M7 20a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M13 12a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M19 18a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0M25 8a1.5 1.5 0 103 0 1.5 1.5 0 10-3 0'], ['area', 'Area', 'M4 26V18l8-6 8 4 12-10v20z'], ['pie', 'Pie', 'M18 4a11 11 0 1011 11H18z'], ['heat', 'Heat map', 'M5 5h8v8H5zM15 5h8v8h-8zM5 15h8v8H5zM15 15h8v8h-8z']];
  const tileSvg = (d: string) => `<svg viewBox="0 0 34 30"><path d="${d}"/></svg>`;
  // Palette, CodePane, Dialog
  const part = (d: string) => `<svg viewBox="0 0 44 26" fill="none" stroke="currentColor" stroke-width="1.3"><path d="${d}"/></svg>`;
  const palCats: PaletteCategory[] = [
    { id: 'passive', title: 'Passive', items: [
      { id: 'R', label: 'Resistor', alt: 'Resistor', svg: part('M2 13h10l2-5 4 10 4-10 4 10 4-10 2 5h10'), key: 'R' },
      { id: 'C', label: 'Capacitor', alt: 'Capacitor', svg: part('M2 13h18M20 5v16M24 5v16M24 13h18'), key: 'C' },
      { id: 'L', label: 'Inductor', alt: 'Inductor', svg: part('M2 13h8a3 3 0 016 0 3 3 0 016 0 3 3 0 016 0 3 3 0 016 0h8') }] },
    { id: 'sources', title: 'Sources', items: [
      { id: 'battery', label: 'Battery', alt: 'Battery', svg: part('M2 13h17M19 6v14M25 9v8M25 13h17') },
      { id: 'V', label: 'Voltage source', alt: 'Voltage source', svg: part('M2 13h12M30 13h12M22 5a8 8 0 100 16 8 8 0 000-16z'), keywords: 'supply' }] },
    { id: 'misc', title: 'Misc', items: [
      { id: 'gnd', label: 'Ground', alt: 'Ground', svg: part('M22 3v10M12 13h20M15 17h14M19 21h6') },
      { id: 'lamp', label: 'Lamp', alt: 'Lamp', svg: part('M2 13h12M30 13h12M22 5a8 8 0 100 16 8 8 0 000-16zM16 7l12 12M28 7L16 19') }] },
  ];
  let palLayout = $state<'rows' | 'grid'>('rows'), palArmed = $state(''), palOpen = $state<Record<string, boolean>>({ passive: true });
  let placed = $state<string[]>(['R', 'C']), copied = $state(false);
  const palName = (id: string) => palCats.flatMap((c) => c.items).find((i) => i.id === id)?.label ?? id;
  const code = $derived('\\begin{circuitikz}\n' + placed.map((id, k) => `  \\draw (${2 * k},0) to[${id}] (${2 * k + 2},0);`).join('\n') + '\n\\end{circuitikz}');
  let dlgSaid = $state('');
  const found = $derived(PARTS.filter((n) => n.toLowerCase().includes(query.trim().toLowerCase())));
  const LINES = [['line', 'M3 17L17 3'], ['arrow', 'M3 17L16 4M10 4h6v6'], ['dash', 'M3 17l3-3M8 12l3-3M13 7l4-4'], ['curve', 'M3 17C6 3 14 17 17 3'], ['poly', 'M3 16l5-9 4 6 5-10'], ['free', 'M3 14c3-8 5 4 8-3s4 2 6-4']];
  const SHAPES = [['rect', 'M3 5h14v10H3z'], ['round', 'M6 5h8a3 3 0 013 3v4a3 3 0 01-3 3H6a3 3 0 01-3-3V8a3 3 0 013-3z'], ['circle', 'M10 3a7 7 0 100 14 7 7 0 000-14z'], ['diamond', 'M10 2l8 8-8 8-8-8z'], ['tri', 'M10 3l8 14H2z'], ['hex', 'M6 3h8l4 7-4 7H6l-4-7z'], ['star', 'M10 2l2.4 5.2 5.6.6-4.2 3.8 1.2 5.6L10 14.4 5 17.2l1.2-5.6L2 7.8l5.6-.6z'], ['cyl', 'M4 5c0-3 12-3 12 0v10c0 3-12 3-12 0zM4 5c0 3 12 3 12 0']];
  const ico = (d: string) => `<svg viewBox="0 0 20 20"><path d="${d}"/></svg>`;
  // TextPopup: labels on a small stage; double-click one to edit it in place
  type Label = { id: string; text: string; kind: TextPopupKind; math?: boolean; x: number; y: number; note: string };
  let labels = $state<Label[]>([
    { id: 'l', text: 'Force $F = ma$', kind: 'line', x: 120, y: 40, note: 'label' },
    { id: 'g', text: 'H', kind: 'line', math: true, x: 330, y: 40, note: 'gate, maths' },
    { id: 'p', text: 'A paragraph with $x^2$\nover two lines', kind: 'para', x: 160, y: 120, note: 'paragraph' },
    { id: 'c', text: '\\lstick{$q_0$} & \\gate{H} & \\ctrl{1} \\\\', kind: 'code', x: 420, y: 120, note: 'quantikz code' },
  ]);
  let popMode = $state<'latex' | 'mathlive'>('latex'), editingId = $state(''), lastDone = $state('');
  let stage: HTMLElement | undefined = $state();
  function editLabel(l: Label, e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    editingId = l.id;
    openTextPopup(stage!, {
      text: l.text, kind: l.kind, math: l.math, mode: popMode,
      at: () => [el.offsetLeft + el.offsetWidth / 2, el.offsetTop + el.offsetHeight + 6],
      onInput: (text) => (l.text = text),
      onDone: () => { editingId = ''; lastDone = l.note; },
    });
  }
  const menuItems = $derived<MenuEntry[]>([
    { act: 'edit', label: t('editor.graph.editLabel', 'Edit Label', {}, $locale), icon: 'edit', key: 'Enter' },
    { act: 'copy', label: t('ui.copy', 'Copy', {}, $locale), icon: 'copy', key: 'Ctrl+C' },
    { act: 'paste', label: t('ui.paste', 'Paste', {}, $locale), icon: 'paste', key: 'Ctrl+V', disabled: true },
    { act: 'dup', label: t('ui.duplicate', 'Duplicate', {}, $locale), icon: 'duplicate', key: 'Ctrl+D' },
    '-',
    { act: 'rowabove', label: t('editor.commonB.insertRowAbove', 'Insert Row Above', {}, $locale), icon: 'rowAbove' },
    { act: 'rowbelow', label: t('editor.commonB.insertRowBelow', 'Insert Row Below', {}, $locale), icon: 'rowBelow' },
    { act: 'arrange', label: t('ctx.arrange', 'Arrange', {}, $locale), icon: 'rotate', sub: [
      { act: 'rot', label: t('editor.cz.rotate90', 'Rotate 90°', {}, $locale), key: 'R' }, { act: 'mx', label: t('editor.cz.mirrorLR', 'Mirror Left to Right', {}, $locale), key: 'X' }, { act: 'my', label: t('editor.cz.mirrorTB', 'Mirror Top to Bottom', {}, $locale), key: 'Y' }] },
    '-',
    { heading: 'Draw' },
    ...[['corner', 'Corner to Corner'], ['centre', 'From the Centre'], ['three', 'Three Points']].map(([m, label]) => ({ act: 'mode:' + m, label, checked: drawMode === m })),
    '-',
    { act: 'del', label: t('ui.delete', 'Delete', {}, $locale), icon: 'delete', key: 'Del', danger: true },
  ]);
  const pick = (act: string) => { picked = act; if (act.startsWith('mode:')) drawMode = act.slice(5); };
  // dropdowns: dash patterns (with a custom one), line widths, arrow tips
  const dashSvg = (da: string) => `<svg class="dprev" viewBox="0 0 48 8" preserveAspectRatio="none"><path d="M1 4H47" stroke="currentColor" stroke-width="1.5"${da ? ` stroke-dasharray="${da}"` : ''}/></svg>`;
  const DASHES = [['solid', 'Solid', ''], ['dashed', 'Dashed', '6 4'], ['dotted', 'Dotted', '1.5 3'], ['dashdot', 'Dash dot', '6 3 1.5 3'], ['densely', 'Densely dashed', '4 2']];
  let dash = $state('dashed'), customDash = $state(''), width = $state(1.5), tip = $state('stealth'), solid = $state('cone');
  // a picture menu (`pictures`): each option's drawing over its short name, the full label in its tooltip
  const solidOptions = $derived(['box', 'cube', 'cylinder', 'cone', 'sphere', 'torus', 'pyramid', 'prism'].map((v) => ({ value: v, label: caption(SOLID_ICONS[v][0], $locale), short: caption(SOLID_ICONS[v][0], $locale), svg: SOLID_ICONS[v][1] })));
  const dashOptions: SelectOption[] = DASHES.map(([value, label, da]) => ({ value, label, svg: dashSvg(da) }));
  let font = $state('atkinson');
  const fontOptions: SelectOption[] = [['atkinson', 'Atkinson Hyperlegible', '"Atkinson Hyperlegible Next", sans-serif'], ['helvetica', 'Helvetica', 'Helvetica, Arial, sans-serif'],
    ['lm', 'Latin Modern', '"Latin Modern Roman", serif'], ['times', 'Times', '"Times New Roman", Times, serif'], ['mono', 'Atkinson Hyperlegible Mono', '"Atkinson Hyperlegible Mono", monospace']]
    .map(([value, label, font]) => ({ value, label, font }));
  const widthOptions: SelectOption[] = [0.5, 1, 1.5, 2, 3, 4].map((w) => ({ value: String(w), label: `${w} px`, note: `${+(w * 0.75).toFixed(2)} pt`,
    svg: `<svg viewBox="0 0 60 10"><path d="M2 5H58" stroke="currentColor" stroke-width="${w}"/></svg>` }));
  const tipSvg = (head: string) => `<svg viewBox="0 0 52 13"><path d="M2 6.5H40" stroke="currentColor" stroke-width="1.2" fill="none"/>${head}</svg>`;
  const TIPS: [string, string, string][] = [['none', 'None', ''], ['stealth', 'Stealth', '<path d="M50 6.5L38 1.5l3 5-3 5z" fill="currentColor"/>'], ['latex', 'LaTeX', '<path d="M50 6.5L39 2.5v8z" fill="currentColor"/>'],
    ['to', 'To', '<path d="M41 2l9 4.5-9 4.5" fill="none" stroke="currentColor" stroke-width="1.2"/>'], ['bar', 'Bar', '<path d="M49 1.5v10" stroke="currentColor" stroke-width="1.5"/>'],
    ['circle', 'Circle', '<circle cx="46" cy="6.5" r="3.5" fill="currentColor"/>'], ['ocircle', 'Open circle', '<circle cx="46" cy="6.5" r="3.5" fill="none" stroke="currentColor" stroke-width="1.2"/>'],
    ['diamond', 'Diamond', '<path d="M50 6.5l-5-4-5 4 5 4z" fill="currentColor"/>'], ['square', 'Square', '<path d="M43 3h7v7h-7z" fill="currentColor"/>']];
  const tipOptions: SelectOption[] = TIPS.map(([value, title, head]) => ({ value, label: title, svg: value === 'none' ? '<span class="none">None</span>' : tipSvg(head) }));
  const keys = ['Ctrl+Z', 'Ctrl+Shift+Z', 'Ctrl+Enter', 'Alt+Shift+F', 'Del', 'V'];
</script>

<header class="kit-bar">
  <strong>DiagramTeX kit</strong>
  <span class="kit-grow"></span>
  <div class="seg" role="group" aria-label="Appearance">
    <button class:on={theme === 'light'} aria-pressed={theme === 'light'} onclick={() => (theme = 'light')}>Light</button>
    <button class:on={theme === 'dark'} aria-pressed={theme === 'dark'} onclick={() => (theme = 'dark')}>Dark</button>
  </div>
  <div class="seg" role="group" aria-label="Language">
    <button class:on={$locale === 'en'} aria-pressed={$locale === 'en'} onclick={() => setLocale('en')}>English</button>
    <button class:on={$locale === 'th'} aria-pressed={$locale === 'th'} onclick={() => setLocale('th')}>ไทย</button>
  </div>
</header>

<main class="kit">
  <section>
    <h2>Button <code>Button.svelte</code></h2>
    <p>The app's one outlined button. <code>primary</code> is only for the one main action; <code>flat</code> for toolbars.</p>
    <div class="kit-row">
      <Button>{t('ui.cancel', 'Cancel', {}, $locale)}</Button>
      <Button variant="primary" title="Ctrl+Enter">{t('ui.done', 'Done', {}, $locale)}</Button>
      <Button variant="flat">{t('ui.copy', 'Copy', {}, $locale)}</Button>
      <Button icon="duplicate">Duplicate</Button>
      <Button disabled>Disabled</Button>
      <Button variant="primary" disabled>Primary, disabled</Button>
    </div>
    <h3>Small (<code>size="sm"</code>, <code>--ctl-sm</code> 24px): only for dense secondary controls</h3>
    <div class="kit-row">
      <Button size="sm">Restore</Button>
      <IconButton size="sm" icon="delete" danger variant="default" title="Delete for ever" />
      <IconButton size="sm" icon="add" title="Add" />
    </div>
  </section>

  <section>
    <h2>IconButton <code>IconButton.svelte</code></h2>
    <p>Icon only; the required title is the tooltip and the name. Shortcuts are written the Windows way.</p>
    <div class="kit-row">
      <IconButton icon="undo" title={t('editor.commonB.undo', 'Undo ({key})', { key: 'Ctrl+Z' }, $locale)} />
      <IconButton icon="redo" title={t('editor.commonB.redo', 'Redo ({key})', { key: 'Ctrl+Shift+Z' }, $locale)} />
      <IconButton icon="delete" danger title={t('ui.delete.the.selection', 'Delete the selection (⌫)', {}, $locale)} />
      <IconButton icon="fit" title="Fit" disabled />
      <IconButton icon="select" variant="default" title="Outlined" />
    </div>
    <h3>In an editor head (<code>.modal-head .cz-tools</code>)</h3>
    <div class="modal-box kit-modal">
      <div class="modal-head">
        <strong>{t('ui.circuit', 'Circuit', {}, $locale)}</strong>
        <div class="cz-tools">
          <IconButton icon="select" on title={t('ui.select.and.move.v', 'Select and move (V)', {}, $locale)} />
          <IconButton icon="wire" title="Wire (W)" />
          <Separator />
          <IconButton icon="rotate" title="Rotate 90° (R)" />
          <IconButton icon="mirrorH" title="Mirror left to right (X)" />
          <IconButton icon="mirrorV" title="Mirror top to bottom (Y)" />
          <IconButton icon="delete" danger title={t('ui.delete.variant1', 'Delete (⌫)', {}, $locale)} />
          <Separator />
          <IconButton icon="undo" title="Undo (Ctrl+Z)" />
          <IconButton icon="redo" title="Redo (Ctrl+Shift+Z)" />
          <IconButton icon="fit" title="Fit (0)" disabled />
        </div>
        <Spacer />
        <div class="modal-actions">
          <Button>{t('ui.cancel', 'Cancel', {}, $locale)}</Button>
          <Button variant="primary">{t('ui.done', 'Done', {}, $locale)}</Button>
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2>Segmented <code>Segmented.svelte</code></h2>
    <p>A switch. One-of switches are a radio group with a sliding knob; <code>many</code> is a row of toggles that can each be on (no knob). <code>panel</code> draws the properties panel's track.</p>
    <div class="kit-row">
      <Segmented label="View" options={[{ label: 'Document', on: orient === 'portrait', attrs: { onclick: () => (orient = 'portrait') } }, { label: 'Diagram', on: orient === 'landscape', attrs: { onclick: () => (orient = 'landscape') } }]} />
      <Segmented many label="Grid" options={[{ icon: 'grid', title: 'Grid', on: flags.grid, attrs: { onclick: () => (flags.grid = !flags.grid) } }, { icon: 'fit', title: 'Guides', on: flags.guides, attrs: { onclick: () => (flags.guides = !flags.guides) } }, { icon: 'select', title: 'Snap', on: flags.snap, attrs: { onclick: () => (flags.snap = !flags.snap) } }]} />
    </div>
    <h3>In a properties panel (<code>#props</code>, 280px)</h3>
    <div id="props" class="kit-panel"><div class="sec">
      <div class="row"><span class="field-label">{t('ui.orientation', 'Orientation', {}, $locale)}</span><Segmented panel class="ctl" label="Orientation" options={[{ icon: 'portrait', title: t('ui.portrait', 'Portrait', {}, $locale), on: orient === 'portrait', attrs: { onclick: () => (orient = 'portrait') } }, { icon: 'landscape', title: t('ui.landscape', 'Landscape', {}, $locale), on: orient === 'landscape', attrs: { onclick: () => (orient = 'landscape') } }]} /></div>
      <div class="row"><span class="field-label">{t('ui.ball', 'Ball', {}, $locale)}</span><Segmented panel class="ctl txt" label="Ball" options={[['3d', t('f3.shaded', 'Shaded', {}, $locale)], ['circle', t('bloch.outline', 'Outline', {}, $locale)], ['none', t('ui.none', 'None', {}, $locale)]].map(([v, n]) => ({ label: n, on: ball === v, attrs: { onclick: () => (ball = v) } }))} /></div>
      <div class="row"><span class="field-label">Align</span><div class="ctl"><Segmented panel class="seg-align" label="Align" options={[['l', 'M4 4v12M7 7h9M7 13h6'], ['c', 'M10 4v12M4 7h12M6 13h8'], ['r', 'M16 4v12M4 7h9M7 13h6']].map(([v, d]) => ({ svg: `<svg viewBox="0 0 20 20"><path d="${d}"/></svg>`, title: v, on: align === v, attrs: { onclick: () => (align = v) } }))} /></div></div>
    </div></div>
  </section>

  <section>
    <h2>Fields <code>TextField</code>, <code>TexField</code>, <code>NumberField</code>, <code>Select</code>, <code>Checkbox</code>, <code>Switch</code>, <code>ColourButton</code>, <code>Slider</code></h2>
    <p>Fields follow the model without overwriting what is being typed (<code>liveValue</code>). Editable fields are white; TeX fields carry the standard placeholders.</p>
    <div id="props" class="kit-panel"><div class="sec">
      <div class="row"><label for="kit-note">Note</label><div class="ctl"><TextField id="kit-note" value={note} placeholder="Anything" oninput={(e) => (note = e.currentTarget.value)} /></div></div>
      <div class="row"><label for="kit-label">{t('ui.label', 'Label', {}, $locale)}</label><div class="ctl"><TexField id="kit-label" tx="math" value={label} oninput={(e) => (label = e.currentTarget.value)} /></div></div>
      <div class="row"><label for="kit-caption">Caption</label><div class="ctl"><TexField id="kit-caption" tx="text" none value="" /></div></div>
      <div class="row"><label for="kit-radius">{t('ui.radius', 'Radius', {}, $locale)}</label><div class="ctl unit"><NumberField id="kit-radius" value={radius} step="0.1" min="0.1" oninput={(e) => (radius = +e.currentTarget.value)} /><span>{t('ui.cm', 'cm', {}, $locale)}</span></div></div>
      <div class="row"><label for="kit-paper">{t('ui.paper', 'Paper', {}, $locale)}</label><div class="ctl"><Select id="kit-paper" value={paper} options={papers} onchange={(e) => (paper = e.currentTarget.value)} /></div></div>
      <div class="row"><label for="kit-tilt">{t('ui.tilt', 'Tilt', {}, $locale)}</label><div class="ctl"><Slider id="kit-tilt" defaultValue={15} min="-90" max="90" step="1" value={tilt} readout={tilt + '°'} oninput={(e) => (tilt = +e.currentTarget.value)} /></div></div>
      <div class="row"><span class="field-label">{t('ui.colour', 'Colour', {}, $locale)}</span><div class="ctl"><ColourButton css="#c0392b" title="red" label="red" /></div></div>
      <div class="row"><span class="field-label">Fill</span><div class="ctl"><ColourButton css="transparent" none title="none" label="none" /></div></div>
      <div class="row"><span class="field-label">Style</span><div class="ctl"><Checkbox checked={bold} onchange={(e) => (bold = e.currentTarget.checked)}><b>{t('ui.bold', 'Bold', {}, $locale)}</b></Checkbox></div></div>
      <div class="row"><span class="field-label">Flatten</span><div class="ctl"><Switch checked={flatten} aria-label="Flatten" onchange={(e) => (flatten = e.currentTarget.checked)} /></div></div>
    </div></div>
  </section>

  <section>
    <h2>Swatches <code>Swatches.svelte</code></h2>
    <p>Colour chips to pick from, eight across (the colour picker's presets). While they are being changed, each is outlined in blue pen dashes.</p>
    <div class="kit-panel" style="width: 240px; padding: 12px"><Swatches colours={swatchColours.map((css) => ({ css, title: css }))} editing={swatchEditing} label="Presets" onpick={(i) => (swatchPicked = swatchColours[i])} /></div>
    <p><Checkbox checked={swatchEditing} onchange={(e) => (swatchEditing = e.currentTarget.checked)}>Editing</Checkbox> Picked: <code>{swatchPicked}</code></p>
  </section>

  <section>
    <h2>Select <code>Select.svelte</code></h2>
    <p>One control for every pick-one list. A native select stays underneath (value, change events, type-to-select); the app's menu draws it. Options can carry a drawing (also shown in the closed control), a note or a font; <code>columns</code> makes tiles; <code>pictures</code> picture tiles (the kit's Tile as options: a drawing over a short name); <code>custom</code> adds a line for a typed value; <code>attached</code> is only a chevron, joined to the field before it.</p>
    <div id="props" class="kit-panel"><div class="sec">
      <div class="row"><label for="kit-font">{t('ui.font', 'Font', {}, $locale)}</label><div class="ctl"><Select id="kit-font" value={font} options={fontOptions} onchange={(e) => (font = e.currentTarget.value)} /></div></div>
      <div class="row"><label for="kit-dash">{t('style.dashPattern', 'Dash pattern', {}, $locale)}</label><div class="ctl"><Select id="kit-dash" value={dash} options={dashOptions} onchange={(e) => (dash = e.currentTarget.value)}
        custom={{ label: t('dd.custom', 'Custom…', {}, $locale), shown: 'Custom', svg: dashSvg(dash.startsWith('p:') ? dash.slice(2) : ''), value: customDash, placeholder: 'on off … (pt)', apply: (text) => { customDash = text; dash = 'p:' + text; } }} /></div></div>
      <div class="row"><label for="kit-dash-mixed">{t('style.dashPattern', 'Dash pattern', {}, $locale)} ({t('prop.mixed', 'Mixed', {}, $locale)})</label><div class="ctl"><Select id="kit-dash-mixed" value="" mixed={t('prop.mixed', 'Mixed', {}, $locale)} options={dashOptions} /></div></div>
      <div class="row"><label for="kit-width">{t('ui.width', 'Width', {}, $locale)}</label><div class="ctl"><NumberField id="kit-width" value={width} min="0.25" step="0.25" oninput={(e) => (width = +e.currentTarget.value)} /><Select attached title={t('ui.line.width.presets', 'Line width presets', {}, $locale)} value={String(width)} options={widthOptions} onchange={(e) => (width = +e.currentTarget.value)} /><span class="val">px</span></div></div>
      <div class="row"><label for="kit-tip">{t('editor.tm.tips', 'Tips', {}, $locale)}</label><div class="ctl"><Select id="kit-tip" value={tip} columns={3} options={tipOptions} onchange={(e) => (tip = e.currentTarget.value)} /></div></div>
      <div class="row"><label for="kit-solid">{t('ui.shape', 'Shape', {}, $locale)}</label><div class="ctl"><Select id="kit-solid" value={solid} pictures options={solidOptions} onchange={(e) => (solid = e.currentTarget.value)} /></div></div>
    </div></div>
  </section>

  <section>
    <h2>Menu <code>Menu.svelte</code>, <code>ContextMenu.svelte</code>, <code>openContextMenu()</code></h2>
    <p>Rows are data: icon, label, shortcut, tick for a pick-one group, danger, disabled, headings, rules and submenus. ↑ ↓ Home End move, → opens a submenu, ← closes it, Esc closes the menu.</p>
    <div class="kit-row kit-top">
      <div class="ctx kit-static"><Menu items={menuItems} onpick={pick} /></div>
      <!-- svelte-ignore a11y_no_static_element_interactions (a demo area: right-click it) -->
      <div class="kit-zone" oncontextmenu={(e) => { e.preventDefault(); openContextMenu(menuItems, e.clientX, e.clientY, pick); }}>
        Right-click here{#if picked}<br><small>picked <code>{picked}</code></small>{/if}
      </div>
    </div>
  </section>

  <section>
    <h2>TextPopup <code>TextPopup.svelte</code>, <code>openTextPopup()</code></h2>
    <p>The in-place editor over an item: double-click a label. LaTeX (highlighted, with autocomplete) or MathLive, as the Text input setting says. A line finishes on Enter; a paragraph or code on {keyLabel('Ctrl+Enter')}; Esc or a click away also finish. It stays inside its stage.</p>
    <div class="kit-row"><Segmented label="Text input" options={(['latex', 'mathlive'] as const).map((m) => ({ label: m === 'latex' ? 'LaTeX' : 'MathLive', on: popMode === m, attrs: { onclick: () => (popMode = m) } }))} />
      {#if lastDone}<small class="kit-note">finished <code>{lastDone}</code></small>{/if}</div>
    <div class="kit-stage" bind:this={stage}>
      {#each labels as l (l.id)}
        <button type="button" class="kit-label" class:on={editingId === l.id} style:left={l.x + 'px'} style:top={l.y + 'px'} title={l.note} ondblclick={(e) => editLabel(l, e)}>{l.text || '…'}</button>
      {/each}
    </div>
  </section>

  <section>
    <h2>Tooltip <code>Tooltip.svelte</code>, <code>services/tooltip.ts</code></h2>
    <p>Any <code>title</code> becomes the app's tooltip: after 800ms on hover (at once right after another), or on keyboard focus; a press hides it until the pointer leaves. A trailing shortcut is set apart, shown as glyphs on a Mac; "Name (key): what it does" gets a muted second line. Hover the buttons, or Tab to them.</p>
    <div class="kit-row kit-tips">
      {#each ['Duplicate', 'Undo (Ctrl+Z)', 'Redo (Ctrl+Shift+Z)', 'Wire (W): drag between two points to connect them', 'Zoom in or out (Ctrl+scroll)'] as tip}<Tooltip text={macKeys(tip)} />{/each}
    </div>
    <div class="kit-row">
      <IconButton icon="undo" title="Undo (Ctrl+Z)" />
      <IconButton icon="redo" title="Redo (Ctrl+Shift+Z)" />
      <Button title="Wire (W): drag between two points to connect them">Wire</Button>
      <Button title="A longer description that wraps once it reaches the tooltip's 280px limit, so it never runs across the window">Long</Button>
    </div>
  </section>

  <section>
    <h2>Popover <code>Popover.svelte</code>, <code>placePopover()</code></h2>
    <p>A panel opened from a control: below it (above when there is no room), lined up with its right edge in the right part of the window, else its left edge. Padding 4, 8 or 12px, the corner 8px more. Esc or a press outside closes it; it fades in and out.</p>
    <div class="kit-row kit-spread">
      <Button bind:el={expBtn} aria-expanded={expOpen} onclick={() => (expOpen = !expOpen)}>{t('ui.export', 'Export', {}, $locale)}…</Button>
      <Button onclick={(e) => stringPopover(e.currentTarget)}>Built as a string…</Button>
      <Button bind:el={farBtn} aria-expanded={farOpen} onclick={() => (farOpen = !farOpen)}>Right side…</Button>
    </div>
    {#if expOpen && expBtn}
      <Popover anchor={expBtn} label={t('ui.export', 'Export', {}, $locale)} width={264} onclose={() => (expOpen = false)}>
        <div class="kit-pop-body">
          <Segmented label="Format" options={['png', 'svg', 'pdf'].map((f) => ({ label: f.toUpperCase(), on: expFmt === f, attrs: { onclick: () => (expFmt = f) } }))} />
          <div class="kit-pop-row"><label for="kit-scale">Scale</label><Select id="kit-scale" value={expScale} options={['1', '2', '3', '4'].map((v) => ({ value: v, label: v + '×' }))} onchange={(e) => (expScale = e.currentTarget.value)} /></div>
          <Button variant="primary" onclick={() => (expOpen = false)}>{t('ui.export', 'Export', {}, $locale)}</Button>
        </div>
      </Popover>
    {/if}
    {#if farOpen && farBtn}
      <Popover anchor={farBtn} inset={8} label="Right side" onclose={() => (farOpen = false)}><div class="kit-pop-note">Lined up with the button's right edge, growing left.</div></Popover>
    {/if}
  </section>

  <section>
    <h2>Flyout <code>Flyout.svelte</code></h2>
    <p>A tool group. Rest the mouse on a button: its choices open after 120ms, and stay for 280ms after the mouse leaves, time to cross the gap; from one open group to the next they switch at once. A click pins it open until a choice, a click elsewhere, Esc or a second click.</p>
    <div class="kit-row kit-top">
      <div class="kit-rail">
        <Flyout svg={ico(LINES[0][1])} title="Lines">{#snippet children(close)}<div class="pop-title">Lines</div><div class="sym-grid kit-sym">{#each LINES as [n, d] (n)}<button type="button" title={n} class:on={tool === n} onclick={() => { tool = n; close(); }}>{@html ico(d)}</button>{/each}</div>{/snippet}</Flyout>
        <Flyout svg={ico(SHAPES[0][1])} title="Shapes">{#snippet children(close)}<div class="pop-title">Shapes</div><div class="sym-grid kit-sym">{#each SHAPES as [n, d] (n)}<button type="button" title={n} class:on={tool === n} onclick={() => { tool = n; close(); }}>{@html ico(d)}</button>{/each}</div>{/snippet}</Flyout>
        <Flyout icon="wire" title="Wires">{#snippet children(close)}<div class="pop-title">Wires</div><div class="sym-grid kit-sym">{#each LINES.slice(0, 3) as [n, d] (n)}<button type="button" title={n} onclick={() => { tool = 'wire ' + n; close(); }}>{@html ico(d)}</button>{/each}</div>{/snippet}</Flyout>
        <Flyout icon="groupMisc" title="Built outside Svelte (panel)" panel="kit-fly-panel" />
      </div>
      <small class="kit-note">{#if tool}tool <code>{tool}</code>{/if}</small>
    </div>
    <div class="fly-panels" hidden><div id="kit-fly-panel" class="fly-panel" {@attach fillPanel}></div></div>
  </section>

  <section>
    <h2>Panels <code>PanelSection</code>, <code>FormRow</code>, <code>Help</code>, <code>TextArea</code>, <code>Badge</code></h2>
    <p>A section (title, count, an action) of labelled rows: an 84px label column, then the controls. Help explains, a hint notes, an error says what to fix.</p>
    <div class="kit-row kit-top">
      <div id="props" class="kit-panel" style="flex: none">
        <PanelSection title="Layout" count={3}>
          {#snippet action()}<Button variant="flat" size="sm">{t('ui.reset', 'Reset', {}, $locale)}</Button>{/snippet}
          <FormRow label="Gap" for="kit-gap" unit><NumberField id="kit-gap" value={gap} step="0.1" oninput={(e) => (gap = +e.currentTarget.value)} /><span>{t('ui.cm', 'cm', {}, $locale)}</span></FormRow>
          <FormRow label="Spacing" for="kit-spacing"><TextField id="kit-spacing" value={spacing} placeholder="auto" oninput={(e) => (spacing = e.currentTarget.value)} /></FormRow>
          {#if spacing && !/^\d+(\.\d+)?(pt|cm|mm|em)?$/.test(spacing)}<Help kind="error">Spacing is a length, such as 4pt or 0.5cm.</Help>{/if}
          <Help kind="hint">Distances are measured between the outer edges.</Help>
        </PanelSection>
        <PanelSection title="About">
          <Help>Help is a paragraph of explanation, 12px graphite, for a section that needs one.</Help>
        </PanelSection>
        <PanelSection title="Source" summary="3 lines">
          <FormRow column><TextArea code aria-label="LaTeX source" rows={3} value={'\\begin{tikzpicture}\n  \\draw (0,0) -- (1,1);\n\\end{tikzpicture}'} /></FormRow>
          <Help>A summary sits at the far end of the title; <code>TextArea code</code> is a block's source box.</Help>
        </PanelSection>
      </div>
      <div class="kit-pal">
        <SearchField placeholder={t('ui.search.parts', 'Search parts', {}, $locale)} value={query} oninput={(e) => (query = e.currentTarget.value)} />
        <div class="kit-pal-list">
          <div class="kit-pal-t">Parts<Badge count={found.length} faint /></div>
          {#each found as n (n)}<div class="kit-pal-item">{n}</div>{:else}<EmptyState>No parts match “{query}”.</EmptyState>{/each}
        </div>
      </div>
      <div class="kit-col">
        <EmptyState title="No files yet">New makes one; you can also drop a .tex file here.</EmptyState>
        <div class="kit-row"><Button soon title="Tensor network — coming soon">Tensor network</Button><IconButton soon icon="layoutSpring" title="Spring layout — coming soon" /></div>
      </div>
    </div>
  </section>

  <section>
    <h2>Tile <code>Tile.svelte</code>, <code>TileGrid.svelte</code></h2>
    <p>A picture choice: a drawing over a short name. The current one has an ink edge; a feature not built yet is dashed.</p>
    <div class="kit-tiles"><TileGrid label="Plots">
      {#each PLOTS as [v, n, d] (v)}<Tile label={n} title={n + ' plot'} svg={tileSvg(d)} on={plot === v} onclick={() => (plot = v)} />{/each}
      <Tile label="Contour" title="Contour plot — coming soon" svg={tileSvg('M6 15a12 9 0 1024 0 12 9 0 10-24 0M12 15a6 4 0 1012 0 6 4 0 10-12 0')} soon />
    </TileGrid></div>
  </section>

  <section>
    <h2>SplitButton <code>SplitButton.svelte</code></h2>
    <p>A main action joined to an arrow that opens its choices. The arrow is handed to whatever it opens (a menu, a popover).</p>
    <div class="kit-row">
      <SplitButton label="Download .zip" moreTitle="More ways to download the .zip" bind:moreEl={zipBtn} expanded={zipOpen}
        onclick={() => (zipVia = 'download')} onmore={(el) => openContextMenu([{ act: 'download', label: 'Download' }, { act: 'folder', label: 'Save to a Folder…' }, { act: 'overleaf', label: 'Open in Overleaf' }], 0, 0, (a) => (zipVia = a), { anchor: el.getBoundingClientRect() })} />
      <div class="toolbar kit-tb-sample"><div class="tb-grp">
        <SplitButton toolbar svg={'<svg viewBox="0 0 20 20"><path d="M6 14l4-10 4 10M7.4 10.5h5.2"/><path d="M3 16.5h14" stroke-width="3" stroke="#c0392b"/></svg>'} title="Text colour: the last colour picked" moreTitle="Text colour: pick a colour" popup="dialog" onclick={() => (zipVia = 'colour')} />
        <SplitButton toolbar on svg={'<svg viewBox="0 0 20 20"><text x="10" y="14" text-anchor="middle" font-size="9" fill="currentColor" stroke="none">.00</text></svg>'} title="Numbers: align on the decimal point" moreTitle="Number format" onclick={() => (zipVia = 'numbers')} />
      </div></div>
      {#if zipVia}<small class="kit-note">chose <code>{zipVia}</code></small>{/if}
    </div>
  </section>

  <section>
    <h2>ListRow <code>ListRow.svelte</code></h2>
    <p>A row in a list: icon, name, actions on hover, selected by a fill, indented by depth. Double-click the name or press F2 to rename it in place; Enter or leaving saves, Esc cancels.</p>
    <ul class="kit-list" role="listbox" aria-label="Files">
      {#each files as f (f.id)}
        <ListRow name={f.name} depth={f.depth} icon={f.depth ? 'layoutLayers' : 'edit'} selected={openFile === f.id} renaming={renamingId === f.id}
          onopen={() => (openFile = f.id)} onrename={(n) => { if (n) f.name = n; renamingId = ''; }}>
          {#snippet actions()}<button type="button" class="danger" title="Move to Recycle Bin" onclick={(e) => { e.stopPropagation(); files = files.filter((x) => x.id !== f.id); }}><Icon name="delete" /></button>{/snippet}
        </ListRow>
      {/each}
    </ul>
  </section>

  <section>
    <h2>Toolbar <code>Toolbar.svelte</code>, <code>ToolbarGroup.svelte</code></h2>
    <p>One line of groups. Narrower, labelled controls drop their icons, then the bar scrolls sideways (a mouse wheel too) and fades on the side with more. Drag the width.</p>
    <input type="range" min="220" max="900" value={barW} aria-label="Toolbar width" oninput={(e) => (barW = +e.currentTarget.value)} />
    <div class="kit-tb-frame" style:width={barW + 'px'}>
      <Toolbar label="Text">
        <ToolbarGroup label="History"><IconButton icon="undo" title="Undo (Ctrl+Z)" variant="default" /><IconButton icon="redo" title="Redo (Ctrl+Shift+Z)" variant="default" /></ToolbarGroup>
        <ToolbarGroup label="Style"><IconButton icon="edit" title="Bold (Ctrl+B)" variant="default" on={tbBold} onclick={() => (tbBold = !tbBold)} /><IconButton icon="cut" title="Strike" variant="default" /></ToolbarGroup>
        <ToolbarGroup label="View"><Segmented label="View" options={[{ label: 'Rows', icon: 'rowBelow', on: true }, { label: 'Columns', icon: 'colAfter' }]} /></ToolbarGroup>
        <ToolbarGroup label="Insert"><Button icon="add">Insert Row</Button><Button icon="copy">Duplicate</Button><Button icon="delete" danger>Delete</Button></ToolbarGroup>
      </Toolbar>
    </div>
  </section>

  <section>
    <h2>Palette <code>Palette.svelte</code>, CodePane <code>CodePane.svelte</code></h2>
    <p>A block editor's two side columns. The palette: search, categories that fold with a count, items as rows or tiles; the armed item waits in marker yellow. Esc clears the search, Enter picks the first match. The code pane: package, count, Copy, the code, a message line.</p>
    <div class="kit-row"><Segmented label="Layout" options={(['rows', 'grid'] as const).map((l) => ({ label: l === 'rows' ? 'Rows' : 'Tiles', on: palLayout === l, attrs: { onclick: () => (palLayout = l) } }))} /></div>
    <div class="kit-editor">
      <Palette categories={palCats} layout={palLayout} armed={palArmed} collapsible={palLayout === 'rows'} open={palOpen} placeholder={t('ui.search.parts', 'Search parts', {}, $locale)} label={t('ui.elements', 'Elements', {}, $locale)}
        ontoggle={(id, o) => (palOpen = { ...palOpen, [id]: o })} onpick={(id) => { palArmed = palArmed === id ? '' : id; if (palArmed) placed = [...placed, id]; }} />
      <div class="kit-stage-mid"><span>{#if palArmed}Placing <b>{palName(palArmed)}</b>{:else}Pick a part{/if}</span></div>
      <aside class="cz-side kit-side">
        <CodePane title="circuitikz" label={t('ui.circuitikz.code', 'circuitikz code', {}, $locale)} value={code} count={placed.length + ' parts'} copyTitle={t('ui.copy.the.circuitikz.code', 'Copy the circuitikz code', {}, $locale)}
          oncopy={() => { navigator.clipboard?.writeText(code).catch(() => {}); copied = true; setTimeout(() => (copied = false), 1200); }}
          message={copied ? 'Copied' : placed.includes('lamp') ? 'A lamp is drawn as a generic load in the export.' : undefined} />
      </aside>
    </div>
  </section>

  <section>
    <h2>Dialog <code>Dialog.svelte</code>, <code>TD.confirm</code> / <code>TD.prompt</code> / <code>TD.alert</code> / <code>TD.choose</code></h2>
    <p>The title asks the question; the buttons name the action. A destructive one is red, and the focus starts on Cancel. Enter takes the default, Esc cancels, Tab stays inside. <code>TD.choose</code> asks how: a dropdown at the left, Cancel and the action at the right.</p>
    <div class="kit-row">
      <Button onclick={async () => (dlgSaid = String(await TD.confirm('Replace the drawing with this code?', 'The drawing is redrawn from the code; anything it can’t draw is kept as written.', { ok: 'Replace' })))}>Confirm…</Button>
      <Button danger onclick={async () => (dlgSaid = String(await TD.confirm('Delete “Lecture notes”?', 'It goes to the Recycle Bin for 30 days.', { ok: 'Delete', danger: true })))}>Delete…</Button>
      <Button onclick={async () => (dlgSaid = String(await TD.prompt('Rename Diagram', 'Free-body diagram')))}>Rename…</Button>
      <Button onclick={async () => (dlgSaid = String(await TD.prompt('Macros', '\\newcommand{\\R}{\\mathbb{R}}', { multiline: true, ok: 'Save', notes: true, preview: (v: string) => `<p>${(v.match(/\\(newcommand|def)/g) || []).length} macros</p>` })))}>Notes preview…</Button>
      <Button onclick={async () => (dlgSaid = String(await TD.alert('MathLive couldn’t load', 'This edit uses LaTeX instead.')))}>Alert…</Button>
      <Button onclick={async () => (dlgSaid = String(await TD.choose('Print', 'As shown prints what you see here. pdfLaTeX and XeLaTeX compile the file’s LaTeX and print that PDF.', ['As shown', 'pdfLaTeX', 'XeLaTeX'], { ok: 'Print', choiceLabel: 'Render with', choiceNotes: [null, 'This file has Thai: XeLaTeX sets it best, its Latin letters in the Thai font too.', null] })))}>Choose…</Button>
      {#if dlgSaid}<small class="kit-note">returned <code>{dlgSaid}</code></small>{/if}
    </div>
  </section>

  <section>
    <h2>EditorFrame <code>EditorFrame.svelte</code></h2>
    <p>Every block editor's window: icon, title and tools, then Cancel and Done; the palette, the stage, and properties over the code. The editors' controllers fill its empty parts today; an editor written in Svelte passes its own palette, stage and side, as here.</p>
    <div class="kit-frame">
      <EditorFrame name="kitEd" act="ke" title={t('ui.circuit', 'Circuit', {}, $locale)} icon={'<svg viewBox="0 0 32 24"><path d="M4 18V6h7M21 6h7v12H4"/><path d="M11 6l1.2-3 2.4 6 2.4-6 2.4 6 1.6-3" class="c1"/></svg>'}>
        {#snippet tools()}
          <IconButton icon="select" title="Select and move (V)" /><IconButton icon="wire" title="Wire (W): drag between points" /><Separator />
          <IconButton icon="rotate" title="Rotate 90° (R)" /><IconButton icon="delete" danger title="Delete (Del)" /><Separator />
          <IconButton icon="undo" title="Undo (Ctrl+Z)" /><IconButton icon="redo" title="Redo (Ctrl+Shift+Z)" /><IconButton icon="fit" title="Fit in view (0)" />
        {/snippet}
        {#snippet palette()}
          <Palette categories={palCats} layout="rows" armed={palArmed} collapsible open={palOpen} placeholder={t('ui.search.parts', 'Search parts', {}, $locale)} label={t('ui.elements', 'Elements', {}, $locale)}
            ontoggle={(id, o) => (palOpen = { ...palOpen, [id]: o })} onpick={(id) => { palArmed = palArmed === id ? '' : id; if (palArmed) placed = [...placed, id]; }} />
        {/snippet}
        {#snippet stage()}<div class="cz-stage kit-ed-stage"><span>{#if palArmed}Placing <b>{palName(palArmed)}</b>{:else}{placed.length} parts{/if}</span></div>{/snippet}
        {#snippet side()}
          <aside class="cz-side">
            <div class="cz-props"><PanelSection title={palArmed ? palName(palArmed) : 'Circuit'}><FormRow label="Label" for="kit-ed-label"><TexField id="kit-ed-label" tx="math" value="R_1" /></FormRow></PanelSection></div>
            <CodePane title="circuitikz" label={t('ui.circuitikz.code', 'circuitikz code', {}, $locale)} value={code} count={placed.length + ' parts'} oncopy={() => navigator.clipboard?.writeText(code).catch(() => {})} />
          </aside>
        {/snippet}
      </EditorFrame>
    </div>
  </section>

  <section>
    <h2>Kbd <code>Kbd.svelte</code>, <code>keyLabel()</code></h2>
    <p>Shortcuts are written the Windows way; a Mac shows glyphs in the order ⌃⌥⇧⌘. Here as this computer shows them, and as a Mac would.</p>
    <div class="kit-keys">
      {#each keys as key (key)}<code>{key}</code><span><Kbd {key} /></span><span>{keyLabel(key, true)}</span>{/each}
    </div>
  </section>

  <section>
    <h2>Icon <code>Icon.svelte</code>, <code>iconSvg()</code></h2>
    <p>One drawing per meaning, by name (<code>src/ui/kit/icons.ts</code>).</p>
    <div class="kit-icons">
      {#each names as name (name)}
        <figure><span class="kit-ic"><Icon {name} /></span><figcaption>{name}</figcaption></figure>
      {/each}
    </div>
  </section>
</main>

<style>
  :global(body) { overflow: auto; display: block; }
  .kit-bar { position: sticky; top: 0; z-index: 2; display: flex; align-items: center; gap: 12px; height: 44px; padding: 0 16px;
    background: var(--sheet); border-bottom: 1px solid var(--rule); }
  .kit-grow { flex: 1; }
  .kit { max-width: 960px; margin: 0 auto; padding: 8px 16px 48px; }
  section { padding: 24px 0; border-bottom: 1px solid var(--rule); }
  h2 { font-size: 15px; font-weight: 600; margin: 0 0 4px; }
  h3 { font-size: 11px; font-weight: 600; color: var(--pencil); margin: 20px 0 8px; }
  h2 code { font-size: 12px; font-weight: 500; color: var(--pencil); margin-left: 6px; }
  p { color: var(--graphite); margin: 0 0 12px; }
  code { font-family: var(--font-mono); font-size: 12px; }
  .kit-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .kit-modal { position: static; width: 100%; max-width: none; height: auto; transform: none; animation: none; }
  .kit-icons { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 8px; }
  figure { margin: 0; display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 8px 4px; border-radius: var(--r); }
  figure:hover { background: var(--wash); }
  .kit-ic { color: var(--graphite); }
  .kit-ic :global(svg) { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .kit-ic :global(svg .f) { fill: currentColor; }
  .kit-panel { width: 280px; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--sheet); overflow: visible; }
  .kit-top { align-items: flex-start; gap: 24px; }
  .kit-static { position: static; animation: none; }
  .kit-zone { flex: 1; min-width: 240px; min-height: 240px; display: grid; place-items: center; text-align: center; border: 1px dashed var(--rule-strong); border-radius: var(--r-lg); color: var(--pencil); user-select: none; }
  .kit-stage { position: relative; height: 300px; margin-top: 12px; overflow: hidden; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--canvas); }
  .kit-label { position: absolute; transform: translateX(-50%); max-width: 260px; padding: 4px 8px; white-space: pre-wrap; text-align: left; font: 13px/1.4 var(--font-mono); color: #1c1b19; background: none; border: 1px dashed transparent; border-radius: var(--r-sm); cursor: text; }
  .kit-label:hover, .kit-label.on { border-color: var(--bluepen); }
  .kit-note { color: var(--pencil); }
  .kit-tips { align-items: flex-start; gap: 12px; margin-bottom: 12px; }
  .kit-spread { justify-content: space-between; }
  .kit-pop-body { display: flex; flex-direction: column; gap: 12px; }
  .kit-pop-body > :global(.seg) { display: flex; }
  .kit-pop-body > :global(.seg > button) { flex: 1 1 0; }
  .kit-pop-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .kit-pop-note { padding: 4px; color: var(--graphite); }
  .kit-rail { display: flex; flex-direction: column; gap: 4px; padding: 8px; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--sheet); }
  .kit-sym { grid-template-columns: repeat(4, 36px); }
  .kit-sym button.on { background: var(--wash-strong); color: var(--ink); }
  .kit-sym :global(svg) { fill: none; stroke: currentColor; stroke-width: 1.3; stroke-linejoin: round; }
  .kit-pal { width: 200px; display: flex; flex-direction: column; gap: 8px; }
  .kit-pal-list { border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--sheet); padding: 4px 8px 8px; min-height: 120px; }
  .kit-pal-t { padding: 8px 4px 4px; font-size: 11px; font-weight: 600; color: var(--pencil); }
  .kit-pal-item { padding: 6px 4px; font-size: 12px; }
  .kit-col { display: flex; flex-direction: column; gap: 12px; width: 240px; }
  .kit-tiles { width: 324px; }
  .kit-tb-sample { height: auto; overflow: visible; }
  .kit-list { width: 240px; margin: 0; padding: 8px; display: flex; flex-direction: column; gap: 0; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--sheet); }
  .kit-tb-frame { max-width: 100%; margin-top: 12px; padding: 8px 12px; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--sheet); overflow: hidden; }
  .kit-editor { display: grid; grid-template-columns: 220px 1fr 300px; height: 420px; margin-top: 12px; border: 1px solid var(--rule); border-radius: var(--r-lg); background: var(--sheet); overflow: hidden; }
  .kit-stage-mid { display: grid; place-items: center; color: var(--pencil); background: var(--canvas); border-left: 1px solid var(--rule); }
  .kit-side { display: flex; flex-direction: column; min-height: 0; }
  .kit-frame :global(.modal-box) { position: static; width: 100%; max-width: none; height: 560px; transform: none; animation: none; }
  .kit-ed-stage { display: grid; place-items: center; color: var(--pencil); }
  .kit-keys { display: grid; grid-template-columns: repeat(3, max-content); gap: 6px 24px; align-items: center; }
  figcaption { font: 11px var(--font-mono); color: var(--pencil); }
</style>
