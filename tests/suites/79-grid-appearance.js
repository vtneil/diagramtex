T.test('grid: lines remain visible against both editors canvas in light and dark appearances', async () => {
  const root = document.documentElement, previousTheme = root.dataset.theme;
  const app = TD.app, previous = { mode: app.state.mode, grid: app.state.grid, style: app.state.gridStyle };
  const preferences = ['diagramtex.cf.grid','diagramtex.cf.gridChoice'].map(key => [key,localStorage.getItem(key)]);
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const luminance = color => {
    const channels = color.match(/[\d.]+/g).slice(0,3).map(Number).map(v => { v /= 255; return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; });
    return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
  };
  const contrast = (a,b) => (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
  try {
    app.cmd.setMode('diagram');
    app.state.grid = true; app.state.gridStyle = 'isometric'; app.render();
    TD.chemEditor.open({src:'\\chemfig{-[:30]-[:-30]}'}, () => {});
    const modal = document.querySelector('#cfModal');
    const iso = modal.querySelector('[data-grid-style="isometric"]');
    if (iso.getAttribute('aria-checked') !== 'true') iso.click();
    for (const theme of ['light','dark']) {
      root.dataset.theme = theme; await frame();
      const canvas = getComputedStyle(root).getPropertyValue('--canvas').trim();
      // Resolve the theme token to an RGB computed paint value for comparison.
      const probe = document.createElement('span'); probe.style.color = canvas; root.append(probe);
      const background = luminance(getComputedStyle(probe).color); probe.remove();
      const main = getComputedStyle(document.querySelector('#gridIsometric path')).stroke;
      const chemistry = getComputedStyle(modal.querySelector('#cf-isometric-grid path')).stroke;
      T.eq(main, chemistry, `${theme}: both editors share grid paint`);
      T.ok(contrast(luminance(main),background) >= 1.15, `${theme}: minor/isometric lines remain distinguishable from the canvas`);
      const major = getComputedStyle(document.querySelector('#gridMajor > path')).stroke;
      T.ok(contrast(luminance(major),background) > contrast(luminance(main),background), `${theme}: major lines retain stronger contrast`);
    }
  } finally {
    const modal = document.querySelector('#cfModal');
    if (modal && !modal.hidden) modal.querySelector('[data-ce="done"]').click();
    for (const [key,value] of preferences) { if (value == null) localStorage.removeItem(key); else localStorage.setItem(key,value); }
    if (previousTheme == null) delete root.dataset.theme; else root.dataset.theme = previousTheme;
    Object.assign(app.state, { grid: previous.grid, gridStyle: previous.style });
    app.cmd.setMode(previous.mode); app.render();
  }
});
