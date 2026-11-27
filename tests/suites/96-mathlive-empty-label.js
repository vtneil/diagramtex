// A maths label (a quantikz gate, a timing annotation) opened empty in MathLive: what is typed goes back as maths
// without the $…$ MathLive's line carries, as it does for a label that had text (no \gate{$x$}).
{
  const wait = (ms = 30) => new Promise(r => setTimeout(r, ms));
  T.test('MathLive: a maths label opened empty gives back its maths without $', async () => {
    await TD.input.load();
    const was = TD.input.mode, host = document.createElement('div');
    host.style.cssText = 'position: fixed; left: 0; top: 0; width: 400px; height: 300px;';
    document.body.append(host);
    TD.input.set('mathlive');
    const got = [];
    let pop = null;
    try {
      pop = TD.input.popup(host, { text: '', math: true, at: () => [200, 100], onInput: (v) => got.push(v), onDone() {} });
      let mf = null;
      for (let i = 0; i < 50 && !(mf = host.querySelector('math-field')); i++) await wait(20);
      T.ok(mf, 'MathLive is shown');
      mf.value = 'x^2'; mf.dispatchEvent(new Event('input', { bubbles: true })); await wait();
      T.eq(got.at(-1), 'x^2', 'the maths, not $x^2$');
      pop.close(); await wait(200);
      // a label that had text: unchanged
      got.length = 0;
      pop = TD.input.popup(host, { text: 'y', math: true, at: () => [200, 100], onInput: (v) => got.push(v), onDone() {} });
      mf = null;
      for (let i = 0; i < 50 && !(mf = host.querySelector('math-field')); i++) await wait(20);
      mf.value = 'y_1'; mf.dispatchEvent(new Event('input', { bubbles: true })); await wait();
      T.eq(got.at(-1), 'y_1', 'one that had text also');
    } finally { if (pop) pop.close(); await wait(200); TD.input.set(was || 'latex'); host.remove(); }
  });
}
