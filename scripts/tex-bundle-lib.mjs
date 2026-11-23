// Shared by scripts/tex-bundle-pack.mjs and scripts/tex-bundle-fetch.mjs: where the in-browser LaTeX's bundles live
// (public/tex/bundle: one folder per engine and the fonts both share), the lock that pins the published copy, and a
// check that a folder holds every file its manifests name.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BUNDLE = path.join(ROOT, 'public/tex/bundle');
export const LOCK = path.join(ROOT, 'scripts/tex-bundle.lock.json');
export const STORE = path.join(ROOT, '.tex-bundle'); // the downloaded or packed archive (gitignored; CI caches it)
export const ENGINES = ['pdftex', 'xetex'];

export const sha256File = (file) => new Promise((res, rej) => {
  const h = crypto.createHash('sha256');
  fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

/** Each engine's manifest version in `dir`, or null when one is missing or a file it names is absent or the wrong size. */
export function bundleVersions(dir = BUNDLE) {
  const out = {};
  for (const e of ENGINES) {
    const mf = path.join(dir, e, 'manifest.json');
    if (!fs.existsSync(mf)) return null;
    const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
    for (const c of m.chunks) if (fs.statSync(path.join(dir, e, c.file), { throwIfNoEntry: false })?.size !== c.size) return null;
    for (const [file, len] of Object.values(m.lazy || {})) if (fs.statSync(path.join(dir, e, file), { throwIfNoEntry: false })?.size !== len) return null;
    out[e] = m.version;
  }
  return out;
}

/** Every file of the bundles, relative to `dir`, sorted: the manifests and what they name, nothing else. */
export function bundleFiles(dir = BUNDLE) {
  const files = new Set();
  for (const e of ENGINES) {
    const m = JSON.parse(fs.readFileSync(path.join(dir, e, 'manifest.json'), 'utf8'));
    files.add(`${e}/manifest.json`);
    for (const c of m.chunks) files.add(`${e}/${c.file}`);
    for (const [file] of Object.values(m.lazy || {})) files.add(path.posix.normalize(`${e}/${file}`));
  }
  return [...files].sort();
}
