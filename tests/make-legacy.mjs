// Makes the backward-compatibility fixtures: for each release tag, the app of that release (from git) is run in a
// fresh profile and its Welcome document is saved as that release saved files (tests/fixtures/legacy/<tag>.diagramtex),
// with that release's LaTeX export of it (<tag>.tex) where it had one.
// Run once per new fixture:  node tests/make-legacy.mjs v1.0.0 v1.10.0 …
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { serve, launch } from './chrome.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'tests/fixtures/legacy');
for (const tag of process.argv.slice(2)) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dtx-legacy-'));
  // The whole tree of the tag: from v1.38.0 on, public/js/app.bundle.js is built from src/ and not in git, so that
  // release's own compiler builds it (with its own lockfile's dependencies), as its tests would have.
  execFileSync('sh', ['-c', `git archive --format=tar "$1" | tar -x -C "$2"`, 'sh', tag, dir], { cwd: ROOT, stdio: 'inherit' });
  if (!fs.existsSync(path.join(dir, 'public/js/app.bundle.js')) && fs.existsSync(path.join(dir, 'scripts/compile.js'))) {
    console.log(tag, 'compiling (public/js/app.bundle.js is not in git)');
    execFileSync('npm', ['ci', '--include=dev', '--no-audit', '--no-fund', '--silent'], { cwd: dir, stdio: 'inherit' });
    execFileSync(process.execPath, ['scripts/compile.js'], { cwd: dir, stdio: 'inherit' });
  }
  const srv = await serve(path.join(dir, 'public'));
  const b = await launch(`http://127.0.0.1:${srv.port}/`);
  const r = await b.ev(`
    const d = TD.state.doc;
    const file = { app: 'diagramtex', version: 3, kind: d.kind || 'classic', name: d.name, page: d.page, ...(d.kind === 'page' ? { sheet: d.sheet } : { blocks: d.blocks }) };
    let tex = null; try { if (TD.docToLatex) tex = TD.docToLatex(d); } catch (e) { tex = null; }
    return { version: TD.VERSION, file: JSON.stringify(file, null, 1), tex };`);
  b.close(); srv.close();
  fs.writeFileSync(path.join(OUT, `${tag}.diagramtex`), r.file);
  if (r.tex) fs.writeFileSync(path.join(OUT, `${tag}.tex`), r.tex);
  console.log(tag, r.version, r.file.length, 'bytes', r.tex ? '+ tex' : '');
  fs.rmSync(dir, { recursive: true, force: true });
}
