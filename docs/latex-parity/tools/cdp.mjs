// Drives a headless Chrome (started with --remote-debugging-port) that has the parity server page open.

// Usage (CDP=<chrome debug port>):
//   node cdp.mjs nav <url>              open a URL (waits 3 s)
//   node cdp.mjs eval '<js body>'       run an async function body in the page, print the JSON result
//   node cdp.mjs evalf <file.js>        same, body read from a file
//   node cdp.mjs run <name> [more...]   reload harness+scenes, run scene(s) from scenes-kit.js, print P.run results
const [cmd, ...args] = process.argv.slice(2);
const fs = await import('fs'); const path = await import('path');
const HERE = path.dirname(new URL(import.meta.url).pathname);
const TOOLS = HERE; // harness.js and scenes.js sit next to this file
const port = process.env.CDP || '9341';
const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
const pg = list.find((t) => t.type === 'page');
const ws = new WebSocket(pg.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
ws.onmessage = (m) => { const d = JSON.parse(m.data); if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); } };
await new Promise((r) => ws.onopen = r);
const send = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 1000, deviceScaleFactor: 1, mobile: false });
const ev = async (body) => {
  const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true, timeout: 600000 });
  return r.result?.result?.value ?? r.result?.exceptionDetails?.exception?.description ?? r;
};
if (cmd === 'nav') { await send('Page.navigate', { url: args[0] }); await new Promise((r) => setTimeout(r, 3000)); console.log('ok'); }
if (cmd === 'eval') console.log(JSON.stringify(await ev(args[0]), null, 1));
if (cmd === 'evalf') console.log(JSON.stringify(await ev(fs.readFileSync(args[0], 'utf8')), null, 1));
if (cmd === 'run') {
  // fresh page so edited app JS is picked up (the parity server sends no-store)
  await send('Page.reload', { ignoreCache: true }); await new Promise((r) => setTimeout(r, 3500));
  const code = ['harness.js', 'scenes.js'].map((f) => fs.readFileSync(path.join(TOOLS, f), 'utf8')).join('\n;\n') + '\n;\n' + fs.readFileSync(path.join(HERE, 'scenes-kit.js'), 'utf8');
  console.log(JSON.stringify(await ev(code + `
    const out = {};
    for (const n of ${JSON.stringify(args)}) {
      if (!KIT[n]) { out[n] = 'no such scene'; continue; }
      const l = KIT[n]();
      TD.state.doc.shapes = l.map((s) => ({ ...s })); TD.app.render(); await new Promise((r) => setTimeout(r, 1200));
      try { const r = await P.run(n, l, KIT_OPT[n] || {}); out[n] = r.error ? 'LATEX ERROR: ' + r.error : 'ok'; } catch (e) { out[n] = 'ERR ' + e.message; }
    }
    return out;`), null, 1));
}
ws.close(); process.exit(0);
