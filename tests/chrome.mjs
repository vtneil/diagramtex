// Headless Chrome on a throwaway profile, driven over the DevTools protocol (no dependencies).
// serve(dir, extra) serves a folder (and extra URL prefixes → folders) with no caching;
// launch(url) opens it and returns { ev(body), close() }.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.webmanifest': 'application/manifest+json',
  '.tex': 'text/plain', '.diagramtex': 'application/json', '.txt': 'text/plain' };

export function serve(root, extra = {}) {
  const srv = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let base = root;
    for (const [pre, dir] of Object.entries(extra)) if (p.startsWith(pre)) { base = dir; p = p.slice(pre.length - 1); }
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(base, path.normalize(p));
    if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  });
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r({ port: srv.address().port, close: () => srv.close() })));
}

const CHROME = process.env.CHROME || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
  .find((p) => fs.existsSync(p));

export async function launch(url) {
  if (!CHROME) throw new Error('Chrome not found (set CHROME=/path/to/chrome)');
  const prof = fs.mkdtempSync(path.join(os.tmpdir(), 'dtx-test-'));
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${prof}`, '--no-first-run',
    '--no-default-browser-check', '--disable-extensions', '--window-size=1600,1000', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const t = setTimeout(() => rej(new Error('Chrome did not start')), 20000);
    proc.stderr.on('data', (d) => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(t); res(m[1]); } });
  });
  const port = new URL(wsUrl).port;
  const pg = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(pg.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d); pending.delete(d.id); }
    if (d.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text));
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') logs.push('console.error: ' + d.params.args.map((a) => a.value ?? a.description).join(' '));
  };
  await new Promise((r) => (ws.onopen = r));
  // a call answered by nothing (the page navigated under it) gives up after `ms`
  const send = (method, params = {}, ms = 30000) => new Promise((r) => {
    const i = ++id; const t = setTimeout(() => { pending.delete(i); r({ result: { exceptionDetails: { text: 'timeout: ' + method } } }); }, ms);
    pending.set(i, (d) => { clearTimeout(t); r(d); }); ws.send(JSON.stringify({ id: i, method, params }));
  });
  await send('Runtime.enable');
  await send('Network.enable');
  await send('Network.setBypassServiceWorker', { bypass: true });
  await send('Page.enable');
  await send('Page.navigate', { url });
  const ev = async (body, ms = 600000) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${body}})()`, awaitPromise: true, returnByValue: true }, ms);
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
    return r.result?.result?.value;
  };
  // wait for the page's scripts
  for (let k = 0; k < 200; k++) {
    try { if (await ev('return !!(window.TD && TD.state && TD.state.doc)', 2000)) break; } catch (e) { /* still loading */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  await ev('if (TD.ready) await TD.ready; return true', 30000);
  return { ev, logs, close: () => { try { ws.close(); } catch (e) { /* closed */ } proc.kill(); setTimeout(() => fs.rmSync(prof, { recursive: true, force: true }), 500); } };
}
