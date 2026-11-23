// Puts the in-browser LaTeX's bundles into public/tex/bundle from the GitHub release pinned in
// scripts/tex-bundle.lock.json (made by scripts/tex-bundle-pack.mjs), checking the archive's SHA-256 against the lock.
// CI's build runs it before `npm run build`, so every deploy serves the bundles from the site itself. Nothing to do
// when the folder already holds the pinned bundles; a copy of the archive in .tex-bundle/ is used before downloading.
//
//   node scripts/tex-bundle-fetch.mjs            fetch if needed
//   node scripts/tex-bundle-fetch.mjs --force    replace public/tex/bundle even if it looks current
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { BUNDLE, LOCK, STORE, ENGINES, bundleVersions, sha256File } from './tex-bundle-lib.mjs';

const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
const same = (v) => v && ENGINES.every((e) => v[e] === lock.versions[e]);
if (!process.argv.includes('--force') && same(bundleVersions())) {
  console.log(`public/tex/bundle: already ${lock.tag}`);
  process.exit(0);
}
fs.mkdirSync(STORE, { recursive: true });
const archive = path.join(STORE, lock.file);
const good = async () => fs.existsSync(archive) && fs.statSync(archive).size === lock.size && (await sha256File(archive)) === lock.sha256;
if (!(await good())) {
  const url = `https://github.com/${lock.repo}/releases/download/${lock.tag}/${lock.file}`;
  console.log(`downloading ${url} (${(lock.size / 1e6).toFixed(1)} MB)`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${url}: ${res.status} ${res.statusText}`);
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(archive + '.part'));
  fs.renameSync(archive + '.part', archive);
  if (!(await good())) { fs.rmSync(archive); throw new Error(`${lock.file}: not the archive pinned in scripts/tex-bundle.lock.json (size or SHA-256 differs)`); }
}
// unpacked beside the folder, then swapped in, so a failure leaves the old one
const tmp = BUNDLE + '.new';
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });
execFileSync('tar', ['-xf', archive, '-C', tmp], { stdio: 'inherit' });
if (!same(bundleVersions(tmp))) throw new Error(`${lock.file} unpacked, but its manifests are not the versions in the lock`);
fs.rmSync(BUNDLE, { recursive: true, force: true });
fs.renameSync(tmp, BUNDLE);
console.log(`public/tex/bundle: ${lock.tag} (${ENGINES.map((e) => `${e} ${lock.versions[e]}`).join(', ')})`);
