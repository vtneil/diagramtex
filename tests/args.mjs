// Command-line arguments shared by the tests/*.mjs scripts.
//
//   --dist (or a bare `dist`, the older form)   test the production build in dist/ (run `node scripts/build.js` first)
//                                               instead of compiling src/ into public/ and testing that
//
// Everything else is left to the script: `flag('--update')`, and `positional`, the arguments that are not flags
// and not the bare `dist`.
import path from 'node:path';
import { compileApp } from '../scripts/compile.js';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const args = process.argv.slice(2);
export const DIST = args.includes('--dist') || args.includes('dist');
/** dist/ or public/: the folder the app is served from */
export const APP_DIR = path.join(ROOT, DIST ? 'dist' : 'public');
export const APP_NAME = DIST ? 'dist' : 'public';
export const positional = args.filter((a) => !a.startsWith('--') && a !== 'dist');
export const flag = (name) => args.includes(name);

/** Compile src/ into public/ unless the run tests dist/, which scripts/build.js has already written. */
export async function prepare() { if (!DIST) await compileApp(); }
