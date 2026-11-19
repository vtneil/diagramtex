<script lang="ts">
  import GridStyleButtons from './GridStyleButtons.svelte';
  import Flyout from './kit/Flyout.svelte';
  import SplitButton from './kit/SplitButton.svelte';
  import Tile from './kit/Tile.svelte';
  import TileGrid from './kit/TileGrid.svelte';
  import Button from './kit/Button.svelte';
  import IconButton from './kit/IconButton.svelte';
  import Select from './kit/Select.svelte';
  import Checkbox from './kit/Checkbox.svelte';
  import Segmented from './kit/Segmented.svelte';
  import Spacer from './kit/Spacer.svelte';
  import Icon from './kit/Icon.svelte';
  import { onMount } from 'svelte';
  import { t, caption, message, locale, setLocale, rich, type Message } from '../i18n';

  let modeSelectorsExpanded = $state(false);
  type InstallPrompt = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
  let installPrompt = $state.raw<InstallPrompt | null>(null);
  let installed = $state(false);
  onMount(() => {
    let channel: BroadcastChannel | null = null;
    const markInstalled = () => { installed = true; installPrompt = null; };
    try {
      channel = new BroadcastChannel('diagramtex-pwa-install');
      channel.onmessage = event => { if (event.data === 'installed') markInstalled(); };
    } catch { /* Cross-tab notifications can be unavailable on local files. */ }
    const mode = matchMedia('(display-mode: standalone), (display-mode: minimal-ui), (display-mode: window-controls-overlay)');
    const appWindow = () => mode.matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const syncMode = () => { if (appWindow()) { markInstalled(); channel?.postMessage('installed'); } };
    const offer = (event: Event) => {
      if (appWindow()) return;
      event.preventDefault();
      // A fresh browser offer is authoritative, including after an uninstall.
      installed = false;
      installPrompt = event as InstallPrompt;
    };
    const complete = () => { markInstalled(); channel?.postMessage('installed'); };
    syncMode();
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', complete);
    mode.addEventListener('change', syncMode);
    return () => {
      window.removeEventListener('beforeinstallprompt', offer);
      window.removeEventListener('appinstalled', complete);
      mode.removeEventListener('change', syncMode);
      channel?.close();
    };
  });
  const KINDS: [Message, string][] = [
    [message('phone.kind.circuits', 'Circuits'), 'circuitikz'], [message('phone.kind.quantum', 'Quantum circuits'), 'quantikz'],
    [message('phone.kind.cd', 'Commutative diagrams'), 'tikz-cd'], [message('phone.kind.plots', 'Plots and charts'), 'pgfplots'],
    [message('phone.kind.3d', '3D figures'), 'tikz-3dplot'], [message('phone.kind.feynman', 'Feynman diagrams'), 'tikz-feynman'],
    [message('phone.kind.trees', 'Trees'), 'forest'], [message('phone.kind.graphs', 'Graphs'), 'graphs'], [message('phone.kind.automata', 'State machines'), 'automata'],
    [message('phone.kind.chem', 'Chemical structures'), 'chemfig'], [message('phone.kind.tables', 'Tables'), 'booktabs'],
  ];
  const GUIDE: [Message, string][] = [
    [message('phone.g.start', 'Get started'), 'start'], [message('phone.g.drawing', 'Drawing'), 'drawing'], [message('phone.g.maths', 'LaTeX maths'), 'maths'],
    [message('phone.g.blocks', 'Blocks: circuits, plots, 3D…'), 'blocks'], [message('phone.g.export', 'Getting TikZ and LaTeX out'), 'export'],
    [message('phone.g.import', 'Importing TikZ'), 'import'], [message('phone.g.faq', 'Questions'), 'faq'],
  ];
  const guideHref = (anchor: string) => ($locale === 'th' ? 'guide/th.html' : 'guide/') + (anchor ? '#' + anchor : '');
  // the editor needs a computer: send the address there (the share sheet, or the clipboard)
  let shared = $state(false);
  async function shareLink() {
    const url = location.origin + '/';
    try {
      if (navigator.share) { await navigator.share({ title: 'DiagramTeX', url }); return; }
      await navigator.clipboard.writeText(url);
      shared = true; setTimeout(() => { shared = false; }, 2400);
    } catch { /* the share sheet was closed */ }
  }
  async function installApp() {
    const offer = installPrompt;
    if (!offer || installed) return;
    installPrompt = null; // A browser offer can be prompted only once.
    try {
      await offer.prompt();
      if ((await offer.userChoice).outcome === 'accepted') installed = true;
    } catch { /* Wait for a fresh browser offer if installation is no longer available. */ }
  }
</script>

  <!-- A phone held upright gets this short introduction instead of the editor. It is prerendered, so it is also
       what search engines index for the page on a phone. -->
  <div id="phoneWall">
    <header class="pw-top">
      <span class="pw-brand"><img src="icons/icon.svg" width="28" height="28" alt="">{t("ui.diagramtex", "DiagramTeX", {}, $locale)}</span>
      <button type="button" class="pw-lang" lang={$locale === 'th' ? 'en' : 'th'} onclick={() => setLocale($locale === 'th' ? 'en' : 'th')}>{$locale === 'th' ? 'English' : 'ไทย'}</button>
    </header>
    <article class="pw-page" aria-labelledby="phoneWallTitle">
      <section class="pw-hero">
        <h1 id="phoneWallTitle">{t("phone.title", "Free online TikZ and LaTeX diagram editor", {}, $locale)}</h1>
        <p class="pw-lead">{t("ui.draw.physics.and.maths.diagrams.in.your.browser.and.export.them.as.latex.tikz.pd", "Draw physics and maths diagrams in your browser and export them as LaTeX/TikZ, PDF, SVG or PNG. Circuits, quantum circuits, commutative diagrams, Bloch spheres, trees and plots, with maths typeset as you type. Free, and it works offline.", {}, $locale)}</p>
        <div class="pw-notice" data-nosnippet>
          <p id="phoneWallText">{@html rich(t("shell.sentence1", "<b>The editor needs a bigger screen.</b> Open <strong>diagramtex.com</strong> on a computer or a tablet to start drawing.", {}, $locale))}</p>
          <div class="pw-actions">
            <button type="button" class="pw-btn pw-share" onclick={shareLink}>{shared ? t("phone.copied", "Link copied", {}, $locale) : t("phone.send", "Send the link to my computer", {}, $locale)}</button>
            <a class="pw-btn pw-out" href={guideHref('')}>{t("phone.guide", "Read the guide", {}, $locale)}</a>
          </div>
        </div>
      </section>
      <figure class="pw-shot">
        <img src="guide/img/phone-canvas.webp" width="1000" height="530" loading="lazy" decoding="async" alt={t("phone.shot.alt", "A DiagramTeX canvas with formulae, a flowchart, an RC circuit, a plot, a quantum circuit and a commutative diagram", {}, $locale)}>
        <figcaption>{t("phone.shot.caption", "One canvas: formulae, shapes, a circuit, a plot, a quantum circuit and a commutative diagram, all exported as TikZ.", {}, $locale)}</figcaption>
      </figure>
      <!-- Quick's formula, usable right here (src/ui/services/quick.ts draws it into #pwQuick) -->
      <section class="pw-quick" aria-labelledby="pwQuickTitle" data-nosnippet>
        <h2 id="pwQuickTitle">{t("phone.quick.title", "Try it: a formula as a picture", {}, $locale)}</h2>
        <p class="pw-sub">{t("phone.quick.sub", "Type LaTeX, then copy the formula as a PNG for chats, slides or notes. Diagrams, blocks and the full editor are waiting on a computer.", {}, $locale)}</p>
        <div id="pwQuick"></div>
      </section>
      <section aria-labelledby="pwHow">
        <h2 id="pwHow">{t("phone.how", "How it works", {}, $locale)}</h2>
        <ol class="pw-steps">
          <li>{@html rich(t("phone.step1", "<b>Draw</b> with the mouse: shapes, arrows, text and ready-made blocks for circuits, plots and more.", {}, $locale))}</li>
          <li>{@html rich(t("phone.step2", "<b>Type maths</b> in labels as LaTeX between dollar signs. It is typeset as you type.", {}, $locale))}</li>
          <li>{@html rich(t("phone.step3", "<b>Copy the TikZ</b> into Overleaf or any LaTeX document, or export PDF, SVG or PNG.", {}, $locale))}</li>
        </ol>
      </section>
      <section aria-labelledby="pwKinds">
        <h2 id="pwKinds">{t("phone.kinds", "What you can draw", {}, $locale)}</h2>
        <ul class="pw-kinds">
          {#each KINDS as [name, pkg] (pkg)}<li><span>{caption(name, $locale)}</span><code>{pkg}</code></li>{/each}
        </ul>
      </section>
      <section aria-labelledby="pwGuide">
        <h2 id="pwGuide">{t("phone.guide.title", "Guide", {}, $locale)}</h2>
        <ul class="pw-links">
          {#each GUIDE as [name, anchor] (anchor)}<li><a href={guideHref(anchor)}>{caption(name, $locale)}</a></li>{/each}
        </ul>
      </section>
      <ul class="pw-facts">
        <li>{t("phone.fact.free", "Free and open source", {}, $locale)}</li>
        <li>{t("phone.fact.offline", "Works offline", {}, $locale)}</li>
        <li>{t("phone.fact.account", "No sign-up", {}, $locale)}</li>
        <li>{t("ui.nothing.is.uploaded.your.files.stay.on.your.device", "Nothing is uploaded: your files stay on your device.", {}, $locale)}</li>
      </ul>
    </article>
  </div>
  <div id="splash" role="status" aria-label={t("ui.loading.diagramtex", "Loading DiagramTeX", {}, $locale)}><svg viewBox="0 0 256 256" aria-hidden="true"><path class="edge" d="M76 76L182 182"/><circle cx="76" cy="76" r="46" fill="#FF5A3C"/><rect x="138" y="138" width="88" height="88" rx="14" fill="#2F7BFF"/></svg></div>
  <header id="topbar" role="toolbar" aria-label={t("ui.document", "Document", {}, $locale)}>
    <div class="topbar-row doc-row">
      <div class="brand" role="img" aria-label={t("ui.diagramtex", "DiagramTeX", {}, $locale)} title={t("ui.diagramtex", "DiagramTeX", {}, $locale)}><svg class="brand-mark" viewBox="30 30 196 196" aria-hidden="true"><path class="brand-ink" d="M85.19 66.81L191.19 172.81L172.81 191.19L66.81 85.19Z"/><circle cx="76" cy="76" r="46" fill="#FF5A3C"/><rect x="138" y="138" width="88" height="88" rx="14" fill="#2F7BFF"/></svg><svg class="brand-word" viewBox="286 30 734 196" aria-hidden="true"><path class="brand-ink" d="M327.06 176C356.51 176 374.49 157.5 374.49 127.92C374.49 98.46 356.32 79.96 327.44 79.96H293.15V176ZM313.01 159.31V96.66H326.22C345.3 96.66 354.51 107.74 354.51 127.92C354.51 148.16 345.43 159.31 326.03 159.31ZM382.68 176H401.69V107.94H382.68ZM392.15 99.37C398.41 99.37 402.98 95.05 402.98 89.25C402.98 83.45 398.41 79.13 392.15 79.13C385.9 79.13 381.33 83.45 381.33 89.25C381.33 95.05 385.9 99.37 392.15 99.37ZM433.34 177.16C443.78 177.16 449.65 173.04 453.26 166.4H453.51V176H472.08V129.85C472.08 115.29 461.38 106.52 442.75 106.52C424.06 106.52 412.97 115.41 412.13 129.46H429.99C430.44 124.24 435.08 120.63 442.17 120.63C449.13 120.63 453.32 124.12 453.32 129.14V129.59C453.32 133.98 448.94 134.56 436.5 135.78C422.32 137.07 409.94 141.45 409.94 156.79C409.94 170.39 419.74 177.16 433.34 177.16ZM438.62 163.95C432.24 163.95 428.12 161.11 428.12 156.28C428.12 150.86 433.28 148.35 439.79 147.38C445.91 146.42 451.26 145.51 453.45 144.29V151.12C453.45 158.47 447.78 163.95 438.62 163.95ZM515.07 203.84C534.79 203.84 548.32 194.95 548.32 173.36V107.94H529.57V117.8H529.5C525.19 110.26 518.1 106.52 509.27 106.52C491.86 106.52 479.94 121.02 479.94 141.45C479.94 161.76 491.61 176.06 509.39 176.06C518.29 176.06 525.44 172.46 529.5 164.46H529.57V174.9C529.57 184.7 524.35 189.86 515.07 189.86C507.98 189.86 502.95 186.96 501.6 181.8H483.29C485.22 195.01 495.73 203.84 515.07 203.84ZM514.29 160.85C505.08 160.85 499.08 153.7 499.08 141.2C499.08 128.69 505.08 121.6 514.29 121.6C523.9 121.6 530.28 129.34 530.28 141.2C530.28 153.12 523.9 160.85 514.29 160.85ZM559.22 176H578.23V139.13C578.23 128.88 583.97 123.47 591.77 123.47C594.99 123.47 598.53 123.73 599.95 123.79V107.62C598.4 107.55 596.54 107.49 594.34 107.49C585.38 107.49 580.23 111.35 577.71 119.54H577.52V107.94H559.22ZM626.7 177.16C637.14 177.16 643.01 173.04 646.62 166.4H646.87V176H665.44V129.85C665.44 115.29 654.74 106.52 636.11 106.52C617.42 106.52 606.33 115.41 605.49 129.46H623.35C623.8 124.24 628.44 120.63 635.53 120.63C642.49 120.63 646.68 124.12 646.68 129.14V129.59C646.68 133.98 642.3 134.56 629.86 135.78C615.68 137.07 603.3 141.45 603.3 156.79C603.3 170.39 613.1 177.16 626.7 177.16ZM631.98 163.95C625.6 163.95 621.48 161.11 621.48 156.28C621.48 150.86 626.63 148.35 633.14 147.38C639.27 146.42 644.62 145.51 646.81 144.29V151.12C646.81 158.47 641.14 163.95 631.98 163.95ZM676.26 176H695.28V135.85C695.28 127.08 700.69 122.18 707.46 122.18C714.1 122.18 718.74 126.76 718.74 133.85V176H737.04V135.01C737.04 127.4 741.62 122.18 748.97 122.18C755.48 122.18 760.5 126.18 760.5 134.36V176H779.45V130.88C779.45 115.29 769.72 106.52 756.64 106.52C746.78 106.52 738.4 111.48 734.85 119.8C732.02 111.48 724.35 106.52 715.19 106.52C706.56 106.52 698.63 110.97 694.57 120.18V107.94H676.26ZM786.54 96.98H815.68V176H835.53V96.98H864.6V79.96H786.54ZM894.95 177.55C911.45 177.55 924.6 168.14 927.12 154.6H909.78C908.04 159.89 902.95 163.3 895.53 163.3C885.54 163.3 879.74 156.79 879.42 146.74H927.82V141.65C927.82 120.89 914.35 106.39 894.31 106.39C874.78 106.39 860.92 121.28 860.92 142.03C860.92 162.72 874.33 177.55 894.95 177.55ZM879.55 134.62C880.58 126.11 886.19 120.83 894.7 120.83C903.27 120.83 908.94 126.11 909.91 134.62ZM929.5 176H951.87L965.72 155.7C968.82 151.19 971.78 146.67 974.75 142.1C977.65 146.67 980.55 151.19 983.58 155.7L997.05 176H1019.99L986.09 126.31L1017.22 79.96H995.24L984.41 96.27C981.13 101.23 978.03 106.2 974.94 111.16C971.91 106.2 968.82 101.23 965.66 96.27L955.02 79.96H932.53L963.98 126.89Z"/></svg></div>
      <span id="autosaveNote" class="autosave-note" title={t("ui.every.change.is.saved.in.this.browser.as.you.work", "Every change is saved in this browser as you work", {}, $locale)}>{t("save.autosaveBrowser", "Autosave is enabled (browser)", {}, $locale)}</span>
      <div class="doc-name-wrap">
        <input id="docName" class="doc-name" spellcheck="false" title={t("ui.document.name", "Document name", {}, $locale)} aria-label={t("ui.document.name", "Document name", {}, $locale)}>
        <span id="saveState" role="status" title={t("ui.every.change.is.saved.in.this.browser.as.you.work", "Every change is saved in this browser as you work", {}, $locale)}></span>
      </div>
      <div class="spacer"></div>
      {#if installPrompt && !installed}
        <Button id="btnInstall" onclick={installApp} title={t('pwa.install.tip', 'Install DiagramTeX as an app', {}, $locale)} class="pwa-install" icon="download"><span>{t('pwa.install', 'Install', {}, $locale)}</span></Button>
      {/if}
      <details class="language-picker" id="languagePicker">
        <summary id="languageTrigger" aria-label={t("ui.interface.language", 'Interface language', {}, $locale)} aria-haspopup="menu" aria-expanded="false" title={`${t("ui.language", 'Language', {}, $locale)}: ${$locale === 'th' ? 'ไทย' : 'English'}`}>
          <span class="language-flag" aria-hidden="true">{$locale === 'th' ? '🇹🇭' : '🇬🇧'}</span><span>{$locale === 'th' ? 'TH' : 'EN'}</span>
          <svg class="language-chevron" viewBox="0 0 12 12" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>
        </summary>
        <div class="language-options" popover="manual" role="menu" aria-label={t("ui.language", 'Language', {}, $locale)}>
          <button type="button" class="language-option" role="menuitemradio" aria-checked={$locale === 'en'} data-language="en" lang="en" onclick={() => setLocale('en')}><span class="language-flag" aria-hidden="true">🇬🇧</span><span>English</span>{#if $locale === 'en'}<span class="language-check" aria-hidden="true">✓</span>{/if}</button>
          <button type="button" class="language-option" role="menuitemradio" aria-checked={$locale === 'th'} data-language="th" lang="th" onclick={() => setLocale('th')}><span class="language-flag" aria-hidden="true">🇹🇭</span><span>ไทย</span>{#if $locale === 'th'}<span class="language-check" aria-hidden="true">✓</span>{/if}</button>
        </div>
      </details>
      <Segmented class="theme-seg" id="themeBox" label={t("ui.appearance", "Appearance", {}, $locale)} options={[
        { icon: 'themeSystem', title: t("ui.appearance.follow.the.system", "Appearance: follow the system", {}, $locale), name: t("ui.system.appearance", "System appearance", {}, $locale), attrs: { 'data-theme-pick': 'system' } },
        { icon: 'themeLight', title: t("ui.appearance.always.light", "Appearance: always light", {}, $locale), name: t("ui.light.appearance", "Light appearance", {}, $locale), attrs: { 'data-theme-pick': 'light' } },
        { icon: 'themeDark', title: t("ui.appearance.always.dark", "Appearance: always dark", {}, $locale), name: t("ui.dark.appearance", "Dark appearance", {}, $locale), attrs: { 'data-theme-pick': 'dark' } },
      ]} />
    </div>
    <div class="topbar-row tools-row" id="topbarTools">
    <IconButton id="btnSidebar" title={t("ui.show.hide.document.list", "Show / hide document list", {}, $locale)} aria-label={t("ui.toggle.document.list", "Toggle document list", {}, $locale)} icon="sidebar" />
    <div class="group files-grp">
      <IconButton data-cmd="new" title={t("ui.new.document", "New document", {}, $locale)} icon="newFile" variant="default" />
      <IconButton data-cmd="open" title={t("ui.open.a.diagramtex.file.page.classic.or.whiteboard.older.json.files.too.or.a.tex.", "Open a .diagramtex file (Page, Classic or Whiteboard; older .json files too) or a .tex file (Ctrl+O)", {}, $locale)} icon="open" variant="default" />
      <IconButton data-cmd="save" title={t("ui.save.to.a.diagramtex.file.that.you.can.open.again.ctrl.shift.s", "Save to a .diagramtex file that you can open again (Ctrl+Shift+S)", {}, $locale)} icon="save" variant="default" />
      <IconButton data-cmd="import" title={t("ui.import.latex.tikz.code", "Import LaTeX / TikZ code", {}, $locale)} icon="importFile" variant="default" />
    </div>
    <div class="mode-selectors" role="group" class:expanded={modeSelectorsExpanded} onpointerleave={() => modeSelectorsExpanded = false}>
      <Segmented id="kindSeg" onpointerenter={(event) => { if (event.pointerType === 'mouse') modeSelectorsExpanded = true; }} label={t("ui.file.type", "File type", {}, $locale)} options={[
        { icon: 'fileClassic', label: t("ui.classic", "Classic", {}, $locale), labelClass: 'lbl', class: 'toggle', title: t("ui.classic.file.diagrams.and.a.document.that.arranges.them.with.text", "Classic file — diagrams, and a document that arranges them with text", {}, $locale), attrs: { 'data-kind': 'classic' } },
        { icon: 'filePage', label: t("ui.page", "Page", {}, $locale), labelClass: 'lbl', class: 'toggle', title: t("ui.page.file.free.form.page.place.text.maths.shapes.and.plots.anywhere.on.the.paper", "Page file — free-form page: place text, maths, shapes and plots anywhere on the paper", {}, $locale), attrs: { 'data-mode': 'page' } },
        { icon: 'fileBoard', label: t("ui.whiteboard", "Whiteboard", {}, $locale), labelClass: 'lbl', class: 'toggle', title: t("ui.whiteboard.an.endless.canvas.draw.anywhere.scroll.to.pan.pinch.or.ctrl.scroll.to", "Whiteboard — an endless canvas: draw anywhere, scroll to pan, pinch or Ctrl+scroll to zoom", {}, $locale), attrs: { 'data-mode': 'board' } },
        { icon: 'fileTable', label: t("ui.table", "Table", {}, $locale), labelClass: 'lbl', class: 'toggle', title: t("ui.table.import.a.table.excel.google.sheets.csv.latex.format.it.and.copy.it.as.late", "Table — import a table (Excel, Google Sheets, CSV, LaTeX…), format it, and copy it as LaTeX or a picture", {}, $locale), attrs: { 'data-table': '' } },
        { icon: 'fileQuick', label: t("ui.quick", "Quick", {}, $locale), labelClass: 'lbl', class: 'toggle', title: t("ui.quick.type.one.formula.and.copy.it.as.a.picture.png.or.svg", "Quick — type one formula and copy it as a picture (PNG or SVG)", {}, $locale), attrs: { 'data-quick': '' } },
      ]} />
      <Segmented class="sub" id="classicSeg" label={t("ui.view", "View", {}, $locale)} options={[
        { icon: 'viewDocument', label: t("ui.document", "Document", {}, $locale), class: 'toggle', title: t("ui.classic.file.page.with.text.and.diagrams", "Classic file — page with text and diagrams", {}, $locale), on: true, attrs: { 'data-mode': 'document' } },
        { icon: 'viewDiagram', label: t("ui.diagram", "Diagram", {}, $locale), class: 'toggle', title: t("ui.classic.file.edit.a.diagram.on.the.canvas", "Classic file — edit a diagram on the canvas", {}, $locale), attrs: { 'data-mode': 'diagram' } },
      ]} />
    </div>
    <div class="spacer"></div>
    <div id="blockNav" class="diagram-nav" hidden>
      <IconButton id="blockPrev" title={t('ui.previousDiagram', 'Previous diagram', {}, $locale)} icon="prev" variant="default" />
      <Button id="blockSel" aria-haspopup="dialog" title={t("ui.diagram.in.this.document", "Diagram in this document", {}, $locale)} hidden />
      <IconButton id="blockRename" title={t('ui.renameDiagram', 'Rename diagram', {}, $locale)} icon="renameItem" variant="default" />
      <IconButton id="blockNext" title={t('ui.nextDiagram', 'Next diagram', {}, $locale)} icon="next" variant="default" />
    </div>
    <div class="group">
      <IconButton id="btnUndo" title={t("ui.undo.ctrl.z", "Undo (Ctrl+Z)", {}, $locale)} icon="undo" variant="default" />
      <IconButton id="btnRedo" title={t("ui.redo.ctrl.shift.z", "Redo (Ctrl+Shift+Z)", {}, $locale)} icon="redo" variant="default" />
    </div>
    <Segmented many class="flag-seg diag-only" id="gridFlags" label={t("ui.grid", "Grid", {}, $locale)} options={[
        { icon: 'guides', title: t('assist.guides', 'Guides', {}, $locale), attrs: { id: 'btnGuides', 'data-cmd': 'guides' } },
        { icon: 'snap', title: t("ui.snap.to.grid.points.hold.alt.to.bypass", "Snap to grid & points (hold Alt to bypass)", {}, $locale), on: true, attrs: { id: 'btnSnap' } },
      ]}><GridStyleButtons id="gridStyle" /></Segmented>
    <div class="group">
      <IconButton data-cmd="print" title={t("ui.print.save.as.pdf.ctrl.p", "Print / save as PDF (Ctrl+P)", {}, $locale)} icon="print" variant="default" />
    </div>
    <div class="group">
      <Button data-cmd="export" id="btnExport" title={t("ui.export.as.png.choose.dpi.svg.pdf.or.a.web.page", "Export as PNG (choose DPI), SVG, PDF or a web page", {}, $locale)} aria-haspopup="dialog" class="exp-btn" icon="export">{t("ui.export", "Export", {}, $locale)}</Button>
      <Button data-cmd="tikz" id="btnTikz" title={t("ui.latex.code.for.this.diagram.or.the.whole.document.to.copy.or.download.ctrl.e", "LaTeX code for this diagram or the whole document, to copy or download (Ctrl+E)", {}, $locale)} icon="code">{t("ui.latex", "LaTeX", {}, $locale)}</Button>
    </div>
    <input id="fileInput" type="file" accept=".diagramtex,.json,.tex,.tikz,.txt,application/json,text/x-tex" hidden>
    </div>
  </header>

  <div id="main">
    <aside id="files">
      <div class="panel-head">
        <span id="filesTitle">{t("ui.documents", "Documents", {}, $locale)}</span>
        <div class="head-acts">
          <IconButton id="btnSortDocs" title={t("ui.sort", "Sort", {}, $locale)} aria-label={t("ui.sort.files", "Sort files", {}, $locale)} aria-haspopup="menu" aria-expanded="false" icon="sort" variant="default" />
          <IconButton id="btnNewDoc" title={t("ui.new.document", "New document", {}, $locale)} aria-label={t("ui.new.document", "New document", {}, $locale)} icon="add" variant="default" />
        </div>
      </div>
      <ul id="docList" role="listbox" aria-labelledby="filesTitle"></ul>
      <ul id="quickList" aria-label={t("quick.list", "Quick", {}, $locale)}></ul>
      <Button id="binRow" title={t("ui.recycle.bin.deleted.files.and.folders.kept.for.30.days", "Recycle Bin: deleted files and folders, kept for 30 days", {}, $locale)} class="bin-row"><Icon name="delete" /><span>{t("ui.recycle.bin", "Recycle Bin", {}, $locale)}</span><span class="bin-n"></span></Button>
      <section id="inputBox" aria-label={t("ui.text.input", "Text input", {}, $locale)}></section>
      <section id="engineBox" aria-label={t("ui.latex.engine", "LaTeX engine", {}, $locale)}></section>
      <div class="files-foot"><a class="app-src" href="https://gitlab.com/igniting-space/diagramtex" target="_blank" rel="noopener" title={t("ui.diagramtex.on.gitlab", "DiagramTeX on GitLab", {}, $locale)} aria-label={t("ui.diagramtex.on.gitlab", "DiagramTeX on GitLab", {}, $locale)}><svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true"><path d="m23.6004 9.5927-.0337-.0862L20.3.9814a.851.851 0 0 0-.3362-.405.8748.8748 0 0 0-.9997.0539.8748.8748 0 0 0-.29.4399l-2.2055 6.748H7.5375l-2.2057-6.748a.8573.8573 0 0 0-.29-.4412.8748.8748 0 0 0-.9997-.0537.8585.8585 0 0 0-.3362.4049L.4332 9.5015l-.0325.0862a6.0657 6.0657 0 0 0 2.0119 7.0105l.0113.0087.03.0213 4.976 3.7264 2.462 1.8633 1.4995 1.1321a1.0085 1.0085 0 0 0 1.2197 0l1.4995-1.1321 2.4619-1.8633 5.006-3.7489.0125-.01a6.0682 6.0682 0 0 0 2.0094-7.003z"/></svg></a><a class="app-src" href={$locale === 'th' ? 'guide/th.html' : 'guide/'} target="_blank" rel="noopener" title={t("ui.guide.how.to.use.diagramtex", "Guide: how to use DiagramTeX", {}, $locale)} aria-label={t("ui.guide.how.to.use.diagramtex", "Guide: how to use DiagramTeX", {}, $locale)}><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true"><path d="M8 3.5C6.5 2.3 4.3 2 2 2.3v10.2c2.3-.3 4.5 0 6 1.2 1.5-1.2 3.7-1.5 6-1.2V2.3c-2.3-.3-4.5 0-6 1.2zM8 3.5v10.2"/></svg></a><!-- svelte-ignore a11y_consider_explicit_label (Preserve the existing shell semantics during migration.) --><a class="app-ver" id="appVer" target="_blank" rel="noopener"></a></div>
    </aside>

    <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role (Preserve the existing shell semantics during migration.) --><nav id="tools" role="toolbar" aria-orientation="vertical" aria-label={t("ui.drawing.tools", "Drawing tools", {}, $locale)}>
      <IconButton data-tool="select" title={t("ui.select.move.v", "Select / move (V)", {}, $locale)} icon="select" />
      <IconButton data-tool="hand" title={t("ui.hand.h.drag.to.move.around.space.drag.works.with.any.tool", "Hand (H): drag to move around. Space-drag works with any tool", {}, $locale)} icon="hand" />
      <div class="sep"></div>
      <IconButton data-tool="magnify" title={t('assist.magnify', 'Magnifying glass (Z)', {}, $locale)} icon="magnify" />
      <IconButton data-tool="bucket" title={t('assist.bucket', 'Fill bucket (K)', {}, $locale)} icon="bucket" />
      <IconButton data-tool="math" title={t("ui.math.m.text.box.that.starts.in", "Math (M) — text box that starts in $…$", {}, $locale)} icon="toolMath" />
      <IconButton data-tool="text" title={t("ui.text.t.click.for.a.line.drag.for.a.paragraph.box.use.for.math", "Text (T): click for a line, drag for a paragraph box. Use $...$ for math", {}, $locale)} icon="toolText" />
      <div class="sep"></div>
      <Flyout icon="groupLines" data-fly="lines" panel="fly-lines" title={t("ui.lines.curves.polygons.arcs.springs", "Lines, curves, polygons, arcs, springs", {}, $locale)} />
      <Flyout icon="groupShapes" data-fly="shapes" panel="fly-shapes" title={t("ui.shapes.and.flowchart", "Shapes and flowchart", {}, $locale)} />
      <Flyout icon="groupElectrical" data-fly="elec" panel="fly-elec" title={t("ui.electrical.symbols.waveforms.and.circuits", "Electrical symbols, waveforms and circuits", {}, $locale)} />
      <Flyout icon="groupPhysics" data-fly="phys" panel="fly-phys" title={t("ui.physics.experimental.results.and.drawings.might.not.be.correct.computed.figures.", "Physics (experimental; results and drawings might not be correct): computed figures (mechanics, optics, fields, waves, spacetime, energy levels) and mechanics and optics symbols", {}, $locale)} />
      <Flyout icon="groupMisc" data-fly="misc" panel="fly-misc" title={t("ui.axis.wave.brace.ruler.grid", "Axis, wave, brace, ruler, grid", {}, $locale)} />
      <Flyout icon="groupArrows" data-fly="arrows" panel="fly-arrows" title={t("ui.block.arrows", "Block arrows", {}, $locale)} />
      <Flyout icon="groupPlots" data-fly="insertPop" width={324} id="btnInsert" panel="insertPop" title={t("ui.2d.plots.and.charts.function.line.scatter.area.bar.pie.contour.heatmap", "2D plots and charts: function, line, scatter, area, bar, pie, contour, heatmap", {}, $locale)} />
      <Flyout icon="groupPlots3d" data-fly="plots3d" width={324} id="btnPlots3d" panel="fly-plots3d" title={t("ui.3d.plots.surfaces.parametric.surfaces.space.curves.scatter", "3D plots: surfaces, parametric surfaces, space curves, scatter", {}, $locale)} />
      <Flyout icon="groupFigures3d" data-fly="figures3d" width={324} id="btnFigures3d" panel="fly-figures3d" title={t("ui.3d.figures.solid.regions.solids.of.revolution.basic.solids", "3D figures: solid regions, solids of revolution, basic solids", {}, $locale)} />
      <Flyout icon="groupBlocks" data-fly="blocks" width={324} id="btnBlocks" panel="fly-blocks" title={t("ui.blocks.experimental.some.inputs.might.not.be.rendered.correctly.commutative.diag", "Blocks (experimental; some inputs might not be rendered correctly): commutative diagram, Bloch sphere, quantum circuit, circuit, tree, ZX, Feynman, timing, state machine, Karnaugh map, bit field, chemistry, 2D and 3D geometry", {}, $locale)} />
      <div class="sep"></div>
      <IconButton data-tool="image" title={t("ui.image.i.inserted.with.includegraphics", "Image (I) — inserted with \\includegraphics", {}, $locale)} icon="toolImage" />
      <IconButton data-tool="pencil" title={t("ui.pencil.n.freehand.smoothed", "Pencil (N) — freehand, smoothed", {}, $locale)} icon="pencil" />
    </nav>
    <input type="file" id="imageInput" accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" hidden>
    <!-- the tool groups' panels (filled by src/application/app.ts), each shown in its Flyout while open -->
    <div class="fly-panels" hidden>
    <div id="fly-lines" class="fly-panel"></div>
    <div id="fly-shapes" class="fly-panel"></div>
    <div id="fly-misc" class="fly-panel"></div>
    <div id="fly-phys" class="fly-panel"></div>
    <div id="fly-arrows" class="fly-panel"></div>
    <div id="fly-elec" class="fly-panel"></div>
    <div id="insertPop" class="fly-panel">
      <div class="pop-title">{t("ui.2d.plots", "2D plots", {}, $locale)}</div>
      <TileGrid>
        <Tile data-insert="plot:function" svg={`<svg viewBox="0 0 32 24"><path d="M2 12h28M16 2v20"/><path d="M3 12c3-9 7-9 10 0s7 9 10 0 5-6 6-5" class="c1"/></svg>`} label={t("ui.function", "Function", {}, $locale)} />
        <Tile data-insert="plot:line" svg={`<svg viewBox="0 0 32 24"><path d="M3 21h27M3 21V2"/><path d="M5 18l6-6 6 2 6-8 5 1" class="c1"/></svg>`} label={t("ui.line", "Line", {}, $locale)} />
        <Tile data-insert="plot:scatter" svg={`<svg viewBox="0 0 32 24"><path d="M3 21h27M3 21V2"/><g class="dots"><circle cx="8" cy="16" r="1.6"/><circle cx="12" cy="13" r="1.6"/><circle cx="16" cy="14" r="1.6"/><circle cx="20" cy="9" r="1.6"/><circle cx="25" cy="6" r="1.6"/></g></svg>`} label={t("ui.scatter", "Scatter", {}, $locale)} />
        <Tile data-insert="plot:area" svg={`<svg viewBox="0 0 32 24"><path d="M3 21h27M3 21V2"/><path d="M4 21c5 0 6-14 12-14s7 14 12 14z" class="a1"/></svg>`} label={t("ui.area", "Area", {}, $locale)} />
        <Tile data-insert="plot:bar" svg={`<svg viewBox="0 0 32 24"><path d="M3 21h27M3 21V2"/><g class="bars"><rect x="6" y="13" width="4" height="8"/><rect x="12" y="7" width="4" height="14"/><rect x="18" y="15" width="4" height="6"/><rect x="24" y="9" width="4" height="12"/></g></svg>`} label={t("ui.bar", "Bar", {}, $locale)} />
        <Tile data-insert="pie" svg={`<svg viewBox="0 0 32 24"><circle cx="16" cy="12" r="9" class="a1"/><path d="M16 12V3M16 12l8 4M16 12l-6 7"/></svg>`} label={t("ui.pie", "Pie", {}, $locale)} />
        <Tile data-insert="plot:contour" svg={`<svg viewBox="0 0 32 24"><ellipse cx="16" cy="12" rx="12" ry="9" class="c1"/><ellipse cx="16" cy="12" rx="8" ry="6" class="c2"/><ellipse cx="16" cy="12" rx="3.5" ry="2.5" class="c3"/></svg>`} label={t("ui.contour", "Contour", {}, $locale)} />
        <Tile data-insert="plot:heatmap" svg={`<svg viewBox="0 0 32 24"><g class="heat"><rect x="4" y="3" width="8" height="6" fill="#f5c542"/><rect x="12" y="3" width="8" height="6" fill="#e2572b"/><rect x="20" y="3" width="8" height="6" fill="#f5c542"/><rect x="4" y="9" width="8" height="6" fill="#e2572b"/><rect x="12" y="9" width="8" height="6" fill="#b3122e"/><rect x="20" y="9" width="8" height="6" fill="#e2572b"/><rect x="4" y="15" width="8" height="6" fill="#f5c542"/><rect x="12" y="15" width="8" height="6" fill="#e2572b"/><rect x="20" y="15" width="8" height="6" fill="#f5c542"/></g></svg>`} label={t("ui.heatmap", "Heatmap", {}, $locale)} />
      </TileGrid>
    </div>
    <div id="fly-plots3d" class="fly-panel">
      <div class="pop-title">{t("ui.3d.plots", "3D plots", {}, $locale)}</div>
      <TileGrid>
        <Tile data-insert="plot:surface3d" title={t("ui.surface.z.f.x.y.shaded.or.as.a.mesh.type.in.pgfplots", "Surface z = f(x, y), shaded or as a mesh (Type), in pgfplots", {}, $locale)} svg={`<svg viewBox="0 0 32 24"><path d="M3 15.5c4-.5 6.5-1.5 8.5-5S14.5 4 16 4s2.5 3 4.5 6.5 4.5 4.5 8.5 5L16 21z" class="a1"/><path d="M7.5 17.6c3-1.2 4.8-3.6 6-7M24.5 17.6c-3-1.2-4.8-3.6-6-7M9.5 15.4c2.2.9 4.4 1.3 6.5 1.3s4.3-.4 6.5-1.3"/></svg>`} label={t("ui.surface", "Surface", {}, $locale)} />
        <Tile data-insert="plot:param3d" title={t("ui.parametric.surface.x.u.v.y.u.v.z.u.v.in.pgfplots", "Parametric surface (x(u, v), y(u, v), z(u, v)), in pgfplots", {}, $locale)} svg={`<svg viewBox="0 0 32 24"><ellipse cx="16" cy="12" rx="12.5" ry="7.5" class="a1"/><path d="M10.5 10.5c3.5 2.2 7.5 2.2 11 0M12 11.4c2.6-1.3 5.4-1.3 8 0M3.6 12.6c1.2 3.2 6.3 5.4 12.4 5.4s11.2-2.2 12.4-5.4M16 14.2v5.3M9.2 13.4l-2 4.2M22.8 13.4l2 4.2"/></svg>`} label={t("ui.parametric", "Parametric", {}, $locale)} />
        <Tile data-insert="plot:curve3d" title={t("ui.space.curve.x.t.y.t.z.t.in.pgfplots", "Space curve (x(t), y(t), z(t)), in pgfplots", {}, $locale)} svg={`<svg viewBox="0 0 32 24"><path d="M4 16l12 5 12-5M16 21V4"/><path d="M8 17c0-3 16-3 16 0s-16 3-16-3 16-6 16-3-16 2-16-3" class="c1"/></svg>`} label={t("ui.space.curve", "Space curve", {}, $locale)} />
        <Tile data-insert="plot:scatter3d" title={t("ui.points.x.y.z.from.data.in.pgfplots", "Points (x, y, z) from data, in pgfplots", {}, $locale)} svg={`<svg viewBox="0 0 32 24"><path d="M4 16l12 5 12-5M16 21V4"/><g class="dots"><circle cx="9" cy="10" r="1.5"/><circle cx="14" cy="7" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="24" cy="6" r="1.5"/><circle cx="12" cy="14" r="1.5"/></g></svg>`} label={t("ui.scatter.3d", "Scatter 3D", {}, $locale)} />
      </TileGrid>
    </div>
    <div id="fly-figures3d" class="fly-panel">
      <div class="pop-title">{t("ui.3d.figures", "3D figures", {}, $locale)}</div>
      <TileGrid>
        <Tile data-insert="solid" title={t("ui.solid.region.e.over.a.base.d.between.two.surfaces.a.disk.rectangle.polar.curve.o", "Solid region E over a base D between two surfaces: a disk, rectangle, polar curve or cylindrical wedge, and Riemann columns, in plain TikZ", {}, $locale)} svg={`<svg viewBox="0 0 32 24"><ellipse cx="16" cy="21" rx="9" ry="2.2" class="a1"/><path d="M8 5v9M24 5v9"/><ellipse cx="16" cy="5" rx="8" ry="2.4"/><path d="M8 14a8 2.4 0 0016 0"/><path d="M8 14a8 2.4 0 0116 0" stroke-dasharray="1.6 1.4"/></svg>`} label={t("ui.solid.region", "Solid region", {}, $locale)} />
        <Tile data-insert="revolve:disk" title={t("ui.solid.of.revolution.disks.and.washers.about.the.x.axis.shells.about.the.y.axis.c", "Solid of revolution: disks and washers about the x-axis, shells about the y-axis, cut open, with a slice, in plain TikZ", {}, $locale)} svg={`<svg viewBox="0 0 32 24"><path d="M2 12h28"/><ellipse cx="7" cy="12" rx="2" ry="4"/><ellipse cx="25" cy="12" rx="3" ry="9" class="a1"/><path d="M7 8c6-1 12-4 18-5M7 16c6 1 12 4 18 5"/></svg>`} label={t("ui.revolution", "Revolution", {}, $locale)} />
        <Tile data-insert="prim3d:box" title={t("ui.basic.solid.box.cube.cylinder.cone.frustum.hollow.cylinder.sphere.hemisphere.sph", "Basic solid: box, cube, cylinder, cone, frustum, hollow cylinder, sphere, hemisphere, spherical cap, ellipsoid, torus, prism, hexagonal prism, pyramid, tetrahedron, octahedron or spherical wedge (Shape), shaded or as a line drawing, in plain TikZ", {}, $locale)} svg={`<svg viewBox="0 0 32 24"><path d="M5 9l9-4 13 3v11l-9 4-13-3z" class="a1"/><path d="M5 9l13 3 9-4M18 12v11"/></svg>`} label={t("ui.solid", "Solid", {}, $locale)} />
      </TileGrid>
    </div>
    <div id="fly-blocks" class="fly-panel"></div>
    </div>

    <div id="stage">
      <svg id="canvas" lang="en" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="gridMinor" width="10" height="10" patternUnits="userSpaceOnUse">
            <path d="M10 0H0V10" fill="none" class="grid-minor"/>
          </pattern>
          <pattern id="gridDots" width="40" height="40" patternUnits="userSpaceOnUse"><circle r="1" class="grid-dot"/></pattern>
          <pattern id="gridIsometric" width="40" height="40" patternUnits="userSpaceOnUse"><path fill="none" class="grid-minor"/></pattern>
          <pattern id="gridIsometricDots" width="40" height="40" patternUnits="userSpaceOnUse"><circle class="grid-dot"/><circle class="grid-dot"/></pattern>
          <pattern id="gridMajor" width="40" height="40" patternUnits="userSpaceOnUse">
            <rect width="40" height="40" fill="url(#gridMinor)"/>
            <path d="M40 0H0V40" fill="none" class="grid-major"/>
          </pattern>
        </defs>
        <rect id="paper" fill="#fff"/>
        <g id="pageLayer"></g>
        <rect id="gridRect" fill="url(#gridMajor)"/>
        <path id="origin" class="origin"/>
        <g id="content"></g>
        <path id="pageMask" fill-rule="evenodd"/>
        <g id="pageLabels"></g>
        <g id="overlay"></g>
      </svg>
      <div class="ruler" id="rulerCorner" title={t("ui.tikz.centimetres", "TikZ centimetres", {}, $locale)}>{t("ui.cm", "cm", {}, $locale)}</div>
      <div class="ruler" id="rulerX"><svg></svg></div>
      <div class="ruler" id="rulerY"><svg></svg></div>
      <div id="status">
        <span id="cursorPos">{t("ui.x.0.00.y.0.00.cm", "x 0.00 · y 0.00 cm", {}, $locale)}</span>
        <span id="selInfo"></span>
        <span id="gridInfo"><label for="gridVal">{t("ui.grid.variant1", "grid", {}, $locale)}</label><input id="gridVal" type="text" inputmode="decimal" value="0.25" title={t("ui.grid.spacing.in.cm.type.a.value.and.press.enter", "Grid spacing in cm: type a value and press Enter", {}, $locale)} aria-label={t("ui.grid.spacing.cm", "Grid spacing (cm)", {}, $locale)} autocomplete="off" spellcheck="false">{" "}{t("shell.gridUnit", "cm", {}, $locale)}{" · "}<span id="snapInfo">{t("ui.snap.on", "snap on", {}, $locale)}</span></span>
        <span class="grow"></span>
        <div class="zoom pagenav" id="pageNav" hidden>
          <Button id="pagePrev" title={t("ui.previous.page.pgup", "Previous page (PgUp)", {}, $locale)}>‹</Button>
          <span id="pageNavVal">{t("ui.page.1.1", "Page 1 / 1", {}, $locale)}</span>
          <Button id="pageNext" title={t("ui.next.page.pgdn", "Next page (PgDn)", {}, $locale)}>›</Button>
          <Button id="pageAdd" title={t("ui.insert.a.blank.page.after.this.one", "Insert a blank page after this one", {}, $locale)}>{t("ui.page.variant1", "+ Page", {}, $locale)}</Button>
        </div>
        <span class="gap" aria-hidden="true"></span>
        <div class="zoom">
          <Button id="zoomOut" title={t("ui.zoom.out.ctrl", "Zoom out (Ctrl+-)", {}, $locale)}>−</Button>
          <input id="zoomVal" type="text" inputmode="decimal" value="100%" title={t("ui.zoom.type.a.percentage.and.press.enter", "Zoom: type a percentage and press Enter", {}, $locale)} aria-label={t("ui.zoom.percentage", "Zoom percentage", {}, $locale)} autocomplete="off" spellcheck="false">
          <Button id="zoomIn" title={t("ui.zoom.in.ctrl", "Zoom in (Ctrl+=)", {}, $locale)}>+</Button>
          <Button id="zoomReset" title={t("ui.actual.size.100.ctrl.0", "Actual size, 100% (Ctrl+0)", {}, $locale)}>1:1</Button>
          <Button id="zoomFit" title={t("ui.zoom.to.fit.the.whole.drawing", "Zoom to fit the whole drawing", {}, $locale)}>{t("ui.fit", "Fit", {}, $locale)}</Button>
          <Button id="zoomFitW" title={t("ui.zoom.to.fit.the.width.from.the.top", "Zoom to fit the width, from the top", {}, $locale)}>{t("ui.fit.width", "Fit Width", {}, $locale)}</Button>
        </div>
      </div>
      <div id="hint"></div>
      <div id="emptyHint" hidden>
        <div class="eh-diagram">
          <div class="eh-title">{t("ui.empty.diagram", "Empty diagram", {}, $locale)}</div>
          <div>{@html rich(t("shell.sentence4", "Pick a tool on the left, or press <kbd>L</kbd> line \u00b7 <kbd>R</kbd> rectangle \u00b7 <kbd>T</kbd> text (drag for a paragraph box).", {}, $locale))}</div>
          <div>{@html rich(t("shell.sentence5", "Plots and charts are under the <b>Plots</b> button; commutative diagrams, Bloch spheres, quantum circuits, circuits, trees, ZX and Feynman diagrams, timing diagrams, state machines, Karnaugh maps, bit fields, chemistry and 2D and 3D geometry under <b>Blocks</b>; surfaces and solids under <b>3D</b>. Right-click objects for more.", {}, $locale))}</div>
        </div>
        <div class="eh-board">
          <div class="eh-title">{t("ui.empty.whiteboard", "Empty whiteboard", {}, $locale)}</div>
          <div>{@html rich(t("shell.sentence6", "Draw anywhere: the board has no edges. Scroll to move around, pinch or <kbd>Ctrl</kbd>+scroll to zoom, <kbd>H</kbd> or <kbd>Space</kbd>-drag to grab it.", {}, $locale))}</div>
          <div>{@html rich(t("shell.sentence7", "Shapes, text, maths, plots and circuits are on the left. <b>Fit</b> brings everything back into view.", {}, $locale))}</div>
        </div>
        <div class="eh-page">
          <div class="eh-title">{t("ui.empty.page", "Empty page", {}, $locale)}</div>
          <div>{@html rich(t("shell.sentence8", "Place anything straight onto the paper: <kbd>T</kbd> text \u00b7 <kbd>M</kbd> maths \u00b7 shapes, plots and images from the left.", {}, $locale))}</div>
          <div>{@html rich(t("shell.sentence9", "The blue dashed margins are guides you can snap to. Export with <b>LaTeX</b>: everything keeps its exact position.", {}, $locale))}</div>
        </div>
        <div class="eh-search">{@html rich(t("shell.sentence10", "Press <kbd>/</kbd> to search every tool, shape and command.", {}, $locale))}</div>
      </div>
    </div>

    <div id="rightCol">
    <section id="propsWin" aria-label={t("ui.properties", "Properties", {}, $locale)}>
      <div id="propsHead"><IconButton id="propsToggle" aria-controls="props" aria-expanded="true" title={t("ui.collapse.panel", "Collapse panel", {}, $locale)} icon="chevronUp" /></div>
      <aside id="props"></aside>
    </section>
    <section id="layersWin" aria-label={t("ui.layers", "Layers", {}, $locale)}>
      <div id="layersHead"><h3>{t("ui.layers.variant1", "Layers ", {}, $locale)}<small id="layersCount"></small></h3><IconButton id="layersToggle" aria-controls="layers" aria-expanded="true" title={t("ui.collapse.panel", "Collapse panel", {}, $locale)} icon="chevronDown" /></div>
      <ul id="layers" role="listbox" aria-label={t("ui.layers.top.first", "Layers, top first", {}, $locale)} aria-multiselectable="true"></ul>
      <div id="layersFoot">
        <IconButton data-la="newgroup" title={t("ui.group.the.selection.ctrl.g", "Group the selection (Ctrl+G)", {}, $locale)} icon="newGroup" />
        <IconButton data-la="ungroup" title={t("ui.ungroup.ctrl.shift.g", "Ungroup (Ctrl+Shift+G)", {}, $locale)} icon="ungroup" />
        <IconButton data-la="del" title={t("ui.delete.the.selection.del", "Delete the selection (Del)", {}, $locale)} icon="delete" danger />
      </div>
    </section>
    </div>
    <div id="docview"></div>
    <section id="quick" aria-label={t("ui.quick.formula", "Quick formula", {}, $locale)} hidden></section>
    <section id="tableview" aria-label={t("ui.table", "Table", {}, $locale)} hidden></section>
  </div>

  <div id="modal" class="fades" hidden>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="tikzTitle">
      <div class="modal-head">
        <strong id="tikzTitle">{t("ui.tikz.code", "TikZ Code", {}, $locale)}</strong>
        <Select id="tikzScope" title={t("ui.what.the.code.holds", "What the code holds", {}, $locale)} aria-label={t("ui.code.for", "Code for", {}, $locale)} options={[{ value: 'pic', label: t("ui.tikz.picture", "TikZ picture", {}, $locale) }, { value: 'standalone', label: t("ui.standalone.document", "Standalone document", {}, $locale) }, { value: 'doc', label: t("ui.whole.document", "Whole document", {}, $locale) }]} />
        <span id="tikzSelWrap"><Checkbox id="tikzSelOnly">{t("ui.selection.only.variant1", " Selection only", {}, $locale).trim()}</Checkbox></span>
        <Spacer />
        <Button id="tikzDownload" title={t("ui.the.latex.alone", "The LaTeX alone", {}, $locale)}>{t("ui.download.tex", "Download .tex", {}, $locale)}</Button>
        <SplitButton id="tikzZipWrap" mainId="tikzZip" moreId="tikzZipMore" hidden label={t("ui.download.zip", "Download .zip", {}, $locale)} moreTitle={t("ui.more.ways.to.download.the.zip", "More ways to download the .zip", {}, $locale)} />
        <Button id="tikzCopy" variant="primary">{t("ui.copy", "Copy", {}, $locale)}</Button>
        <IconButton id="modalClose" icon="close" title={t("ui.close", "Close", {}, $locale)} />
      </div>
      <div id="tikzOut" class="codeview" tabindex="0" role="textbox" aria-readonly="true" aria-multiline="true" aria-label={t("ui.latex.code", "LaTeX code", {}, $locale)}></div>
      <div id="tikzLint" class="modal-foot report"></div>
    </div>
  </div>

  <div id="importModal" class="modal fades" hidden>
    <div class="modal-box" role="dialog" aria-modal="true" aria-labelledby="impTitle">
      <div class="modal-head">
        <strong id="impTitle">{t("ui.import.latex.or.tikz", "Import LaTeX or TikZ", {}, $locale)}</strong>
        <Segmented id="impHow" label={t("ui.what.tikz.that.can.t.be.read.exactly.becomes", "What TikZ that can't be read exactly becomes", {}, $locale)} options={[{ label: t("ui.as.written", "As Written", {}, $locale), title: t("ui.keep.it.as.written.exported.exactly.as.it.is.drawn.as.an.approximation.and.group", "Keep it as written: exported exactly as it is, drawn as an approximation, and grouped so it moves as one", {}, $locale), on: true, attrs: { 'data-how': 'code' } }, { label: t("ui.editable.shapes", "Editable Shapes", {}, $locale), title: t("ui.turn.it.into.ordinary.shapes.you.can.edit.drawn.and.exported.from.the.shapes.so.", "Turn it into ordinary shapes you can edit: drawn and exported from the shapes, so some details may change", {}, $locale), attrs: { 'data-how': 'shapes' } }]} />
        <Spacer />
        <Button id="impFile">{t("ui.choose.file", "Choose File…", {}, $locale)}</Button>
        <Button id="impNew" title={t("ui.create.a.new.document.from.the.code", "Create a new document from the code", {}, $locale)}>{t("ui.import.as.new.document", "Import as New Document", {}, $locale)}</Button>
        <Button id="impInsert" variant="primary" title={t("ui.add.the.shapes.to.the.current.diagram.in.the.middle.of.the.view", "Add the shapes to the current diagram, in the middle of the view", {}, $locale)}>{t("ui.insert.into.diagram", "Insert into Diagram", {}, $locale)}</Button>
        <IconButton id="impClose" icon="close" title={t("ui.close", "Close", {}, $locale)} />
      </div>
      <div class="imp-note" role="note">{t("imp.support.note", "Supported sections become shapes. Other sections stay as code; unresolved sections have no preview. Editable Shapes may omit unsupported details.", {}, $locale)}</div>
      <textarea id="impText" spellcheck="false" placeholder={t("ui.paste.a.tikzpicture.a.bare.list.of.draw.node.commands.or.a.whole.latex.document.", "Paste a tikzpicture, a bare list of \\draw / \\node commands, or a whole LaTeX document.\nSupported: \\draw \\fill \\filldraw \\shade \\node \\coordinate \\definecolor, -- / .. controls .. / rectangle / circle / ellipse / arc / cycle, arrows, colours, line widths, dashes, opacity, zigzag springs.\nA full document is split into text and diagram blocks.", {}, $locale)}></textarea>
      <details class="imp-definitions">
        <summary>{t("imp.definitions", "Include definitions and libraries", {}, $locale)}</summary>
        <label for="impDefs">{t("imp.definitions.help", "Optional preamble used by this figure, such as \\tikzset and \\usetikzlibrary.", {}, $locale)}</label>
        <textarea id="impDefs" rows="3" spellcheck="false" aria-label={t("imp.definitions", "Include definitions and libraries", {}, $locale)}></textarea>
      </details>
      <div id="impMsg" class="modal-foot"></div>
    </div>
  </div>

  <div id="measureHost" lang="en"></div>

