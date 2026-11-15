T.test('Label resources: live SVG Blobs share bytes, survive view changes and release on removal', async () => {
  const previousId = TD.state.docId, previousMode = TD.state.mode, previousEngine = TD.math.engine;
  const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
  const created = [], revoked = [];
  URL.createObjectURL = function (...args) { const url = create.apply(this, args); created.push(url); return url; };
  URL.revokeObjectURL = function (url) { revoked.push(url); return revoke.call(this, url); };
  try {
    for (const engine of ['katex', 'temml']) {
      TD.math.set(engine);
      const shape = { ...TD.TYPES.text.create({ x: 100, y: 100 }, {}), id: 'resource-a', text: '$x_{resource}$' };
      TD.app.newDoc('Live resources', null, null, null, null, 'page', {
        pages: 1, shapes: [shape, { ...shape, id: 'resource-b', x: 300 }],
      });
      await TD.math.whenReady();
      const labels = () => [...document.querySelectorAll('#content image.svg-label')];
      const urls = () => labels().map(e => e.getAttribute('href'));
      const first = urls();
      T.eq(first.length, 2, 'both labels are mounted');
      T.ok(first[0].startsWith('blob:'), 'the screen uses a reusable Blob resource');
      T.eq(first[0], first[1], 'identical labels share one resource');
      T.ok(created.includes(first[0]), 'the owner created this resource');
      const exported = new DOMParser().parseFromString(TD.app.svgOf(TD.state.doc.sheet.shapes), 'image/svg+xml');
      const canonical = exported.querySelector('image.svg-label').getAttribute('href');
      T.ok(canonical.startsWith('data:image/svg+xml'), 'export stays self-contained');
      const text = decodeURIComponent(escape(atob(canonical.split(',')[1])));
      T.eq(await (await fetch(first[0])).text(), text, 'screen and export contain identical SVG bytes');
      const count = created.length;
      const canvas = document.querySelector('#canvas');
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaX: 20, deltaY: 30 }));
      canvas.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, ctrlKey: true, deltaY: -10 }));
      T.eq(JSON.stringify(urls()), JSON.stringify(first), 'pan and zoom retain image identity');
      T.eq(created.length, count, 'camera updates create no image resources');
      TD.state.doc.sheet.shapes[0].text = '$y_{resource}$'; TD.app.render();
      await TD.math.whenReady();
      T.ok(!revoked.includes(first[0]), 'a resource stays alive while another mounted label uses it');
      const changed = urls()[0];
      T.ok(changed !== first[0], 'an edited label gets its own resource');
      TD.state.doc.sheet.shapes.splice(1, 1); TD.app.render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      T.ok(revoked.includes(first[0]), 'the last removed reference releases its resource');
      TD.state.doc.sheet.shapes.length = 0; TD.app.render();
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      T.ok(revoked.includes(changed), 'clearing the canvas releases the edited resource');
    }
  } finally {
    URL.createObjectURL = create; URL.revokeObjectURL = revoke;
    TD.math.set(previousEngine); TD.app.cmd.openDoc(previousId); TD.app.cmd.setMode(previousMode);
  }
});
