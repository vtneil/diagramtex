// Packs the in-browser LaTeX's bundles (public/tex/bundle, made by scripts/tex-bundle.mjs) into one archive for a
// GitHub release, and pins it in scripts/tex-bundle.lock.json (tag, file, SHA-256), which CI's build fetches by
// (scripts/tex-bundle-fetch.mjs). Run it after making new bundles, then publish the archive as it says and commit the lock:
//
//   node scripts/tex-bundle-pack.mjs
//   gh release create <tag> .tex-bundle/<file> --latest=false --title … --notes …
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { BUNDLE, LOCK, STORE, ENGINES, bundleVersions, bundleFiles, sha256File } from './tex-bundle-lib.mjs';

const versions = bundleVersions();
if (!versions) throw new Error(`public/tex/bundle is incomplete: make it with node scripts/tex-bundle.mjs`);
const texlive = JSON.parse(fs.readFileSync(path.join(BUNDLE, ENGINES[0], 'manifest.json'), 'utf8')).texlive;
const id = crypto.createHash('sha256').update(ENGINES.map((e) => versions[e]).join('\n')).digest('hex').slice(0, 12);
const tag = `tex-${texlive}-${id}`, file = `diagramtex-${tag}.tar`;
fs.mkdirSync(STORE, { recursive: true });
const list = path.join(STORE, 'files.txt'), out = path.join(STORE, file);
fs.writeFileSync(list, bundleFiles().join('\n') + '\n');
// chunks are gzipped already and the fonts hardly compress: a plain tar. No macOS metadata files (._*).
// No owner names from this machine either (bsdtar on macOS, GNU tar on Linux spell it differently).
const bsd = /bsdtar/.test(execFileSync('tar', ['--version'], { encoding: 'utf8' }));
const owner = bsd ? ['--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root'] : ['--owner=0', '--group=0', '--numeric-owner'];
execFileSync('tar', ['-cf', out, ...owner, '-C', BUNDLE, '-T', list], { env: { ...process.env, COPYFILE_DISABLE: '1' }, stdio: 'inherit' });
fs.rmSync(list);
const lock = { repo: 'vtneil/diagramtex', tag, file, size: fs.statSync(out).size, sha256: await sha256File(out), texlive, versions };
fs.writeFileSync(LOCK, JSON.stringify(lock, null, 2) + '\n');
console.log(`${path.relative(process.cwd(), out)}: ${(lock.size / 1e6).toFixed(1)} MB, sha256 ${lock.sha256}`);
console.log(`pinned in ${path.relative(process.cwd(), LOCK)}; publish with:\n  gh release create ${tag} ${path.relative(process.cwd(), out)} --latest=false --title "TeX Live ${texlive} bundle ${id}"`);
