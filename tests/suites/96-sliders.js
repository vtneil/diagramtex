// Slider gestures must reach real application models, not only change a DOM value.
const dbl = node => node.dispatchEvent(new MouseEvent('dblclick', {bubbles:true, cancelable:true}));
const click = node => node.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true}));
const wait = () => new Promise(r => setTimeout(r, 40));
const enter = (value, key='Enter') => {
  const input = document.querySelector('.slider-value-editor');
  T.ok(input, 'numeric editor opened');
  input.value = value;
  input.dispatchEvent(new KeyboardEvent('keydown', {key, bubbles:true}));
};
const board = shape => {
  TD.app.newDoc('Slider checks', null, null, null, null, 'board');
  TD.state.doc.shapes.push(shape); TD.state.sel = new Set([shape.id]);
  TD.app.render(); TD.app.renderProps();
};
T.test('sliders: opacity value editing, cancel, limits, keyboard and default reset', async () => {
  const shape = {...TD.TYPES.text.create({x:0,y:0}, TD.state.defaults), id:'slider-text', opacity:0.5};
  board(shape); await wait();
  const slider = () => document.querySelector('#props input[data-key="opacity"]');
  const readout = () => slider().parentElement.querySelector('.slider-value');
  click(readout()); enter('0.75'); await wait();
  T.eq(shape.opacity, 0.75, 'precise input updates model');
  click(readout()); enter('0.25', 'Escape'); await wait();
  T.eq(shape.opacity, 0.75, 'Escape cancels');
  click(readout()); enter('2');
  T.ok(document.querySelector('.slider-value-editor'), 'out-of-range entry stays open');
  enter('1', 'Escape');
  readout().dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', bubbles:true}));
  enter('0.4'); await wait();
  T.eq(shape.opacity, 0.4, 'keyboard edits readout');
  dbl(slider()); await wait();
  T.eq(shape.opacity, 1, 'reset uses opacity default');
});
T.test('sliders: symbol-specific reset and shared angle readout', async () => {
  const shape = {type:'sym', kind:'e-pulse', id:'slider-wave', x:0,y:0,w:100,h:50,duty:80,phase:40,opacity:1};
  board(shape); await wait();
  dbl(document.querySelector('#props input[data-key="duty"]')); await wait();
  T.eq(shape.duty, 30, 'pulse duty default differs from square wave');
  dbl(document.querySelector('#props input[data-key="phase"]')); await wait();
  T.eq(shape.phase, 0, 'phase resets to zero');
  const bloch = {type:'bloch', id:'slider-bloch', x:0,y:0,src:'\\begin{blochsphere}[tilt=40,rotation=50]\n\\end{blochsphere}'};
  board(bloch); await wait();
  const slider = document.querySelector('#bloch-tilt');
  click(slider.parentElement.querySelector('.slider-value'));
  T.ok(document.activeElement.classList.contains('slider-value-editor'), 'angle uses shared value editor');
  enter('60', 'Escape');
  dbl(slider); await wait();
  T.eq(Number(document.querySelector('#bloch-tilt').value), 15, 'Bloch tilt resets to package default');
});
T.test('sliders: quantum label edit, blur commit, reset and undo', async () => {
  TD.qcEditor.open({type:'qc',src:'\\begin{quantikz}\n\\gate{H}\\gategroup[1,steps=1,style={draw=none},label style={label position=below,yshift=-0.8cm}]{test} &\n\\end{quantikz}'}, () => {});
  await wait();
  const root = document.querySelector('#qcModal'), q = s => root.querySelector(s);
  try {
    window.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowUp',bubbles:true}));
    const slider = () => q('input[data-f^="offsety:"]');
    click(slider().parentElement.querySelector('.slider-value'));
    enter('-1', 'Escape');
    T.ok(q('.cz-code textarea').value.includes('yshift=-0.8cm'), 'Escape cancels inside a block editor');
    T.eq(document.querySelectorAll('.slider-value-editor').length,0,'cancel removes numeric entry');
    click(slider().parentElement.querySelector('.slider-value'));
    const input = document.querySelector('.slider-value-editor');
    input.value='-0.65'; input.blur(); await wait();
    T.ok(q('.cz-code textarea').value.includes('yshift=-0.65cm'), 'blur commits code');
    dbl(slider()); await wait();
    T.ok(q('.cz-code textarea').value.includes('yshift=-0.4cm'), 'below label resets to its baseline');
    q('[data-qe="undo"]').click(); await wait();
    T.ok(q('.cz-code textarea').value.includes('yshift=-0.65cm'), 'reset is undoable');
  } finally { q('[data-qe="done"]').click(); }
});
T.test('sliders: source variable reset survives panel rebuild and percentage readouts edit displayed units', async () => {
  const shape = {type:'geo2d',id:'slider-geo',x:0,y:0,src:'\\begin{tikzpicture}\n\\def\\a{10}\n\\draw (0,0) -- (\\a,1);\n\\end{tikzpicture}'};
  board(shape); await wait();
  const slider = () => document.querySelector('#props input[data-g2="a"]');
  T.ok(slider(), 'source variable has a slider');
  slider().value='1'; slider().dispatchEvent(new Event('input',{bubbles:true})); slider().dispatchEvent(new Event('change',{bubbles:true})); await wait();
  TD.app.renderProps(); await wait();
  dbl(slider()); await wait();
  T.ok(shape.src.includes('{10}'), 'reset restores initial definition after range shrinks');
  // Percentage conversion also serves the document image-width toolbar.
  const host = document.createElement('div');
  host.innerHTML='<label><input type="range" min="0.1" max="1" step="0.05" value="0.6" data-slider-default="0.6"><output class="slider-value">60%</output></label>';
  document.body.append(host);
  try {
    click(host.querySelector('output'));
    T.eq(document.querySelector('.slider-value-editor').value, '60', 'editor shows percentage');
    enter('75');
    T.eq(host.querySelector('input').value, '0.75', 'percentage entry converts to ratio');
    dbl(host.querySelector('input'));
    T.eq(host.querySelector('input').value, '0.6', 'ratio default restored');
  } finally { host.remove(); }
});
T.test('sliders: readout and focused editor styling match panels and toolbars in both themes', async () => {
  const theme = document.documentElement.dataset.theme;
  const styles = (el, keys) => keys.map(key => getComputedStyle(el)[key]);
  const readoutKeys = ['fontFamily','fontSize','fontWeight','color','textAlign','whiteSpace','minWidth'];
  const editorKeys = ['fontFamily','fontSize','fontWeight','color','backgroundColor','padding','height','border','boxShadow'];
  const host = document.createElement('div');
  host.className='fmt-bar'; host.innerHTML='<label class="rng"><input type="range" min="0.1" max="1" step="0.05" value="0.6" data-slider-default="0.6"><output class="slider-value">60%</output></label>';
  document.body.append(host);
  try {
    for (const appearance of ['light','dark']) {
      document.documentElement.dataset.theme=appearance;
      const shape = {...TD.TYPES.text.create({x:0,y:0}, TD.state.defaults), id:'slider-style', opacity:0.5};
      board(shape); await wait();
      const readout = document.querySelector('#props .slider-value');
      const expectedReadout = styles(readout,readoutKeys);
      click(readout);
      const expectedEditor = styles(document.querySelector('.slider-value-editor'),editorKeys);
      enter('', 'Escape');
      T.eq(document.documentElement.dataset.theme,appearance,'theme after cancelling value editor');
      T.eq(styles(host.querySelector('output'),readoutKeys),expectedReadout,'toolbar readout: '+appearance);
      click(host.querySelector('output'));
      T.eq(styles(document.querySelector('.slider-value-editor'),editorKeys),expectedEditor,'toolbar editor: '+appearance);
      enter('', 'Escape');
      TD.qcEditor.open({type:'qc',src:'\\begin{quantikz}\\gate{H}\\gategroup[1,steps=1,style={draw=none}]{test} &\\end{quantikz}'},()=>{});
      await wait();
      try {
        window.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
        const value = document.querySelector('#qcModal .slider-value');
        T.eq(styles(value,readoutKeys),expectedReadout,'block editor readout: '+appearance);
        click(value);
        T.eq(styles(document.querySelector('.slider-value-editor'),editorKeys),expectedEditor,'block editor numeric entry: '+appearance);
        enter('', 'Escape');
        T.eq(document.querySelectorAll('.slider-value-editor').length,0,'no shared editor remains after cancel');
      } finally { document.querySelector('#qcModal [data-qe="done"]').click(); }
      const bloch = T.make('bloch'); board(bloch); await wait();
      const angle = document.querySelector('#bloch-tilt').parentElement.querySelector('.slider-value');
      T.eq(styles(angle,readoutKeys),expectedReadout,'angle readout: '+appearance);
      click(angle); enter('35'); await wait();
      T.eq(document.querySelector('#bloch-tilt').value,'35','angle commits through shared editor');
    }
  } finally { document.querySelector('.slider-value-editor')?.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})); host.remove(); document.documentElement.dataset.theme=theme; }
});
