// In-page test library. Suites (tests/suites/*.js) call T.test(name, fn); fn may be async.
// Inside a test: T.eq / T.ok assert; T.golden(name, text) compares text with tests/golden/<name> (in Node);
// T.tex(name, source, files?, engine?) asks Node to compile a standalone document with pdflatex (or engine 'xelatex'); files ({ 'path': base64 })
// are written next to it first (the pictures a .zip export carries).
// T.fixtures holds the fixture files ({ 'legacy/v1.0.0.diagramtex': text, … }), set by the runner.
(function () {
  const tests = [];
  let cur = null;
  const show = (v) => { try { return JSON.stringify(v); } catch (e) { return String(v); } };
  const T = (window.T = {
    fixtures: {},
    test(name, fn) { tests.push({ name, fn }); },
    ok(c, msg) { if (!c) throw new Error(msg || 'expected a true value'); },
    eq(a, b, msg) {
      if (show(a) !== show(b)) {
        const A = show(a), B = show(b);
        let i = 0; while (i < A.length && A[i] === B[i]) i++;
        throw new Error(`${msg ? msg + ': ' : ''}values differ at character ${i}\n  got:      …${A.slice(Math.max(0, i - 60), i + 120)}\n  expected: …${B.slice(Math.max(0, i - 60), i + 120)}`);
      }
    },
    // Gecko creates a separate clipboard for synthetic ClipboardEvents. Supply
    // the fixture explicitly, so these handler tests exercise identical data in every engine.
    clipboardEvent(type, { clipboardData, ...options }) {
      const event = new ClipboardEvent(type, options);
      Object.defineProperty(event, 'clipboardData', { value: clipboardData });
      return event;
    },
    async expectInlineHandlerCsp(action) {
      const name = cur.name;
      await window.__testInlineHandlerCsp('begin', name);
      try {
        const result = await action();
        // Allow parser/image callbacks and their console events to finish while
        // the scope is active; the caller checks that no handler executed.
        await new Promise(resolve => setTimeout(resolve, 0));
        return result;
      } finally { await window.__testInlineHandlerCsp('end', name); }
    },
    golden(name, text) { cur.goldens.push({ name, text }); },
    tex(name, src, files, engine) { cur.tex.push({ name, src, files: files || null, engine: engine === 'xelatex' ? 'xelatex' : 'pdflatex' }); },
    // a shape of `type` with the app's defaults, at (x, y) in cm
    make(type, o = {}, tool) {
      const D = { stroke: '#000000', fill: null, width: 1, dash: 'solid', color: '#000000', size: 'normalsize', font: 'default', ballColor: '#a05a5a' };
      const s = TD.TYPES[type].create({ x: (o.x || 0) * TD.PX_PER_CM, y: (o.y || 0) * TD.PX_PER_CM }, D, tool || type);
      return { id: 't' + Math.random().toString(36).slice(2, 8), ...s, ...o.set };
    },
    async run(filter) {
      const out = [];
      for (const t of tests) {
        if (filter && !t.name.includes(filter)) continue;
        cur = { name: t.name, ok: true, err: null, goldens: [], tex: [] };
        const t0 = performance.now();
        try { await t.fn(); } catch (e) { cur.ok = false; cur.err = e?.stack ? (e.stack.includes(e.message) ? e.stack : `${e.name}: ${e.message}\n${e.stack}`) : String(e); }
        cur.ms = Math.round(performance.now() - t0);
        out.push(cur);
      }
      return out;
    },
  });
})();
