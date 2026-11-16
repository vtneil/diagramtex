// Public editor interactions: growth feedback and ZX editing/history.
const gridRefreshFrame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
T.test('grid editor refresh: add row and column hover feedback in Quantum, ZX, CD and XY', async () => {
  for (const [editor, selector, attr, src, X] of [
    [TD.qcEditor, '#qcModal', 'qe', '\\begin{quantikz}\\gate{H} & \\meter{}\\end{quantikz}'],
    [TD.zxEditor, '#zxModal', 'ze', '\\begin{ZX}\\zxZ{} & \\zxX{}\\end{ZX}'],
    [TD.cdEditor, '#cdModal', 'ce', '\\begin{tikzcd}A & B\\end{tikzcd}'],
    [TD.cdEditor, '#cdModal', 'ce', '\\xymatrix{A & B}', TD.xy],
  ]) {
    editor.open({src}, () => {}, X); await gridRefreshFrame();
    const root = document.querySelector(selector), svg = root.querySelector('.cz-svg');
    try {
      for (const action of ['addrow', 'addcol']) {
        const button = root.querySelector(`[data-${attr}="${action}"]`);
        button.dispatchEvent(new PointerEvent('pointerenter'));
        const hover = svg.querySelector('.qe-hover'), strips = svg.querySelectorAll('.qe-grow');
        T.ok(hover, selector + ' ' + action + ' shows feedback');
        const strip = strips[action === 'addrow' ? 1 : 0];
        for (const name of ['x','y','width','height']) T.eq(hover.getAttribute(name), strip.getAttribute(name), 'highlight covers full strip: ' + name);
        button.dispatchEvent(new PointerEvent('pointerleave'));
        T.ok(!svg.querySelector('.qe-hover'), 'hover clears on leaving button');
        const box = svg.querySelectorAll('.qe-grow')[action === 'addrow' ? 1 : 0].getBoundingClientRect();
        svg.dispatchEvent(new PointerEvent('pointermove', { bubbles:true, clientX:box.x+box.width/2, clientY:box.y+box.height/2 }));
        T.ok(svg.querySelector('.qe-hover'), 'stage growth strip also highlights');
        svg.dispatchEvent(new PointerEvent('pointerleave'));
      }
    } finally { root.querySelector(`[data-${attr}="cancel"]`).click(); }
  }
});

T.test('grid editor refresh: ZX spacing, wiring, phases, duplication and undo', async () => {
  let saved;
  TD.zxEditor.open({src:'\\begin{ZX}[bold]\\zxZ{} & \\zxX{}\\end{ZX}'}, value => saved=value);
  await gridRefreshFrame();
  const root=document.querySelector('#zxModal'), svg=root.querySelector('.cz-svg'), code=()=>root.querySelector('.cz-code textarea').value;
  const action=name=>root.querySelector(`[data-ze="${name}"]`).click();
  const originalCapture=svg.setPointerCapture; svg.setPointerCapture=()=>{};
  const point=c=>{
    const col=svg.querySelector('.qe-grow'), d=svg.querySelector('.qe-rule').getAttribute('d');
    const xs=[...d.matchAll(/M([\d.-]+),[\d.-]+V/g)].map(m=>Number(m[1]));
    const r=svg.getBoundingClientRect();return [r.x+(xs[c]+xs[c+1])/2,r.y+Number(col.getAttribute('y'))+Number(col.getAttribute('height'))/2];
  };
  const click=c=>{const [clientX,clientY]=point(c);for(const type of ['pointerdown','pointerup']) svg.dispatchEvent(new PointerEvent(type,{bubbles:true,button:0,pointerId:1,clientX,clientY}));};
  try {
    const spacing=root.querySelector('[data-f="spacing-row"]');spacing.focus();spacing.value='3';spacing.dispatchEvent(new Event('input',{bubbles:true}));spacing.blur();
    T.ok(code().includes('row sep=3mm') && code().includes('bold'), 'spacing preserves unrelated options');
    action('undo');T.ok(!code().includes('row sep='), 'spacing edit is undoable');
    action('wire');click(0);
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    T.ok(!svg.querySelector('.ze-draft') && !code().includes('\\rar'), 'Escape cancels pending connection without edits');
    click(0);T.ok(svg.querySelector('.ze-draft'), 'click starts wire preview');click(1);
    T.ok(code().includes('\\rar'), 'second click connects nodes');
    action('undo');T.ok(!code().includes('\\rar'), 'wire is one undo step');
    action('redo');T.ok(code().includes('\\rar'), 'wire can be redone');
    action('select');click(0);
    [...root.querySelectorAll('[data-zs="preset"]')].find(b=>b.dataset.v==='\\pi').click();
    T.ok(code().includes('\\zxZ{\\pi}') && code().includes('\\rar'), 'phase preset preserves wire');
    window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',ctrlKey:true,bubbles:true,cancelable:true}));T.eq((code().match(/\\zxZ\{\\pi\}/g)||[]).length,2,'duplicate uses next empty cell');
    action('undo');T.eq((code().match(/\\zxZ\{\\pi\}/g)||[]).length,1,'duplicate is one undo step');
    action('done');T.ok(saved.src.includes('\\zxZ{\\pi}') && saved.src.includes('\\rar'), 'Done returns edited source');
  } finally {
    svg.setPointerCapture=originalCapture;
    if(!root.hidden) { root.querySelector('.cz-code textarea').value='\\begin{ZX}[bold]\\zxZ{} & \\zxX{}\\end{ZX}'; root.querySelector('.cz-code textarea').dispatchEvent(new Event('input',{bubbles:true})); action('done'); }
  }
});
