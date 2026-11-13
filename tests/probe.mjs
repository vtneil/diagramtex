// ad-hoc: node tests/probe.mjs file.js [--dist] — runs the file's body in the app page (with KIT loaded) and prints the result
import { APP_DIR, ROOT, positional, prepare } from './args.mjs';
import fs from 'node:fs'; import path from 'node:path';
import { serve, launch } from './chrome.mjs';
await prepare();
if (!positional[0]) throw new Error('usage: node tests/probe.mjs file.js [--dist]');
const srv = await serve(APP_DIR); const b = await launch(`http://127.0.0.1:${srv.port}/`);
try {
  const PT = path.join(ROOT, 'docs/latex-parity/tools');
  await b.ev(['harness.js', 'scenes.js', 'scenes-kit.js'].map((f) => fs.readFileSync(path.join(PT, f), 'utf8')).join('\n;\n') + '\nwindow.KIT = KIT; return true;');
  const r = await b.ev(fs.readFileSync(positional[0], 'utf8'), 60000);
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
} finally { b.close(); srv.close(); if (b.logs.length) console.log('page errors:\n' + b.logs.join('\n')); }
