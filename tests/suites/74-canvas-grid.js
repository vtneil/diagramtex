T.test('canvas grid: four choices work in Diagram, Whiteboard and Page and share one preference', async () => {
  const app = TD.app, state = app.state, previous = { style: state.gridStyle, grid: state.grid, mode: state.mode };
  const select = document.querySelector('#gridStyle'), rect = document.querySelector('#gridRect');
  const click = value => select.querySelector(`[data-grid-style="${value}"]`).click();
  const choose = value => { if (!state.grid || state.gridStyle !== value) click(value); };
  const selected = () => select.querySelector('[aria-checked="true"]').dataset.gridStyle;
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  try {
    T.eq(Array.from(select.querySelectorAll('[role=radio]')).map(o => o.dataset.gridStyle), ['grid', 'dot', 'isometric', 'isometric-dot']);
    T.ok(!document.querySelector('#btnGrid'), 'no separate visibility button');
    const ids = { grid: 'gridMajor', dot: 'gridDots', isometric: 'gridIsometric', 'isometric-dot': 'gridIsometricDots' };
    for (const mode of ['diagram', 'board', 'page']) {
      app.cmd.setMode(mode); await frame();
      for (const style of Object.keys(ids)) {
        choose(style);
        T.eq(state.gridStyle, style, 'shared preference updated');
        T.eq(select.querySelectorAll('[aria-checked="true"]').length, 1, 'exactly one style selected');
        T.ok(getComputedStyle(rect).fill.includes(ids[style]), `${mode} renders ${style}`);
        T.ok(state.grid, 'choosing style shows grid');
        click(style);
        T.ok(!state.grid, 'clicking active style hides grid');
        T.eq(select.querySelectorAll('[aria-checked="true"]').length, 0, 'no active style when grid hidden');
        T.eq(select.querySelectorAll('[tabindex="0"]').length, 1, 'hidden selector remains keyboard accessible');
        click(style); T.ok(state.grid, 'clicking again shows grid');
        app.cmd.toggleGrid(); T.ok(document.querySelector('#stage').classList.contains('hide-grid'), 'G hides selected style');
        app.cmd.toggleGrid(); T.eq(selected(), style, 'G preserves selected style');
      }
    }
    choose('grid');
    select.querySelector('[data-grid-style="grid"]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    T.eq(selected(), 'dot', 'arrow key selects next style');
    T.eq(document.activeElement.dataset.gridStyle, 'dot', 'keyboard focus follows selection');
    choose('isometric-dot');
    for (const mode of ['diagram', 'board', 'page']) { app.cmd.setMode(mode); await frame(); app.render(); T.eq(selected(), 'isometric-dot', 'same choice follows all canvas modes'); }
    const originalZoom = state.view.zoom;
    for (const z of [.3, .7, 1, 3]) {
      app.cmd.zoomTo(z);
      choose('isometric');
      const line = document.querySelector('#gridIsometric'), dot = document.querySelector('#gridIsometricDots');
      const size = [line.getAttribute('width'), line.getAttribute('height')];
      choose('isometric-dot');
      T.eq([dot.getAttribute('width'), dot.getAttribute('height')], size, 'isometric lines and dots share zoom spacing');
    }
    app.cmd.zoomTo(originalZoom);
  } finally {
    state.gridStyle = previous.style; state.grid = previous.grid;
    app.cmd.setMode(previous.mode); await frame(); app.render();
  }
});

T.test('canvas grid: selector is hidden in Document, Quick and Table and restored in canvas modes', async () => {
  const app = TD.app, previous = { mode: app.state.mode, quick: app.cmd.inQuick(), table: app.cmd.inTable() };
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const buttons = () => [...document.querySelectorAll('#gridFlags button')];
  const hidden = mode => T.ok(buttons().every(b => getComputedStyle(b).visibility === 'hidden'), `${mode}: all grid and snap buttons inherit hidden mode visibility`);
  const visible = mode => T.ok(buttons().filter(b => b.tabIndex === 0 || b.id === 'btnSnap').every(b => getComputedStyle(b).visibility === 'visible'), `${mode}: remembered grid and snap are visible`);
  try {
    app.cmd.setQuick(false); app.cmd.setTable(false);
    for (const mode of ['diagram', 'page', 'board']) {
      app.cmd.setMode(mode); await frame(); visible(mode);
      const button = document.querySelector('#gridStyle [tabindex="0"]');
      button.focus();
      T.eq(document.activeElement, button, `${mode}: selector receives keyboard focus`);
      app.cmd.setQuick(true); await frame(); hidden(`${mode} → Quick`);
      app.cmd.setQuick(false); await frame(); visible(`${mode} ← Quick`);
      app.cmd.setTable(true); await frame(); hidden(`${mode} → Table`);
      app.cmd.setTable(false); await frame(); visible(`${mode} ← Table`);
    }
    app.cmd.setMode('document'); await frame(); hidden('Classic Document');
    app.cmd.setQuick(true); await frame(); hidden('Document → Quick');
    app.cmd.setQuick(false); app.cmd.setTable(true); await frame(); hidden('Document → Table');
    app.cmd.setTable(false); await frame(); hidden('Document restored');
    app.cmd.setMode('diagram'); await frame(); visible('Classic Diagram restored');
  } finally {
    app.cmd.setQuick(false); app.cmd.setTable(false); app.cmd.setMode(previous.mode);
    if (previous.quick) app.cmd.setQuick(true);
    if (previous.table) app.cmd.setTable(true);
    await frame();
  }
});
