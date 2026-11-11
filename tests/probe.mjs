// ad-hoc: node tests/probe.mjs file.js — runs the file's body in the app page (with KIT loaded) and prints the result
import fs from 'node:fs'; import path from 'node:path';
import { serve, launch } from './chrome.mjs';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const srv = await serve(path.join(ROOT, 'public')); const b = await launch(`http://127.0.0.1:${srv.port}/`);
try {
  const PT = path.join(ROOT, 'docs/latex-parity/tools');
  await b.ev(['harness.js', 'scenes.js', 'scenes-kit.js'].map((f) => fs.readFileSync(path.join(PT, f), 'utf8')).join('\n;\n') + '\nwindow.KIT = KIT; return true;');
  const r = await b.ev(fs.readFileSync(process.argv[2], 'utf8'), 60000);
  console.log(typeof r === 'string' ? r : JSON.stringify(r, null, 1));
} finally { b.close(); srv.close(); if (b.logs.length) console.log('page errors:\n' + b.logs.join('\n')); }
