// Compile the module graph to one classic bundle: static servers and file:// both work.
// Development builds (`minify` false: node scripts/compile.js, the dev server, the tests) compile Svelte in dev mode
// (runtime checks and warnings) and write a source map that points at the .ts / .svelte sources; production builds
// (`minify` true: scripts/build.js) resolve the `production` export conditions, so esm-env's DEV is false there.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const remapping = require('@jridgewell/remapping');
const { renderIndex } = require('./prerender');
const { compile, compileModule } = require('svelte/compiler');

// esbuild reads an inline source map from loaded contents and chains it into the bundle's map.
const withMap = (code, map) => map
  ? `${code}\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${Buffer.from(JSON.stringify(map)).toString('base64')}\n`
  : code;

function options({ minify = false, write = true } = {}) {
  const dev = !minify, maps = !minify;
  return {
    entryPoints: [path.resolve(__dirname, '../src/main.ts')],
    outfile: path.resolve(__dirname, '../public/js/app.bundle.js'),
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020',
    loader: { '.woff2': 'dataurl', '.css': 'text' },
    // Use the selected SVG font as the default too; omit the unused NewCM tables.
    alias: { '#default-font/svg/default.js': path.resolve(__dirname, '../node_modules/@mathjax/mathjax-tex-font/mjs/svg/default.js') },
    // Without a `development` / `production` condition, esm-env (Svelte's DEV flag) falls back to false everywhere.
    conditions: [minify ? 'production' : 'development'],
    minify, write, sourcemap: maps, legalComments: 'inline',
    plugins: [{ name: 'esm-env', setup(build) {
      // esm-env re-exports `export default false` files, which esbuild does not inline across modules, so Svelte's
      // `if (DEV) ...` branches would survive minification; plain `export const` values are inlined and dropped.
      build.onResolve({ filter: /^esm-env$/ }, () => ({ path: 'esm-env', namespace: 'esm-env' }));
      build.onLoad({ filter: /.*/, namespace: 'esm-env' }, () => ({ contents: `export const BROWSER = true, DEV = ${dev}, NODE = false;`, loader: 'js' }));
    } }, { name: 'prerender', setup(build) {
      if (write) build.onEnd(async result => { if (!result.errors.length) fs.writeFileSync(path.resolve(__dirname, '../public/index.html'), await renderIndex()); });
    } }, { name: 'svelte', setup(build) {
      build.onLoad({ filter: /\.svelte\.ts$/ }, ({ path: filename }) => {
        // TypeScript first (esbuild), then the runes (Svelte); the two maps are chained back to the .svelte.ts file.
        const ts = esbuild.transformSync(fs.readFileSync(filename, 'utf8'), { loader: 'ts', target: 'esnext',
          sourcemap: maps ? 'external' : false, sourcefile: path.basename(filename) });
        const result = compileModule(ts.code, { filename, generate: 'client', dev });
        let map = null;
        if (maps) {
          const tsMap = JSON.parse(ts.map);
          map = remapping([JSON.parse(JSON.stringify(result.js.map)), tsMap], () => null);
          map.sources = [path.basename(filename)];
          map.sourcesContent = tsMap.sourcesContent;
        }
        return { contents: withMap(result.js.code, map), loader: 'js', resolveDir: path.dirname(filename) };
      });
      build.onLoad({ filter: /\.svelte$/ }, ({ path: filename }) => {
        const source = fs.readFileSync(filename, 'utf8');
        const result = compile(source, { filename, generate: 'client', css: 'injected', dev, runes: true,
          // Preserve inline whitespace from existing panel templates, including degree units.
          preserveWhitespace: true });
        let map = null;
        if (maps) {
          map = JSON.parse(JSON.stringify(result.js.map));
          map.sources = [path.basename(filename)];
          map.sourcesContent = [source];
        }
        return { watchFiles: [path.resolve(__dirname, '../src/index.html'), path.resolve(__dirname, '../src/platform/preflight.ts')], contents: withMap(result.js.code, map), loader: 'js', resolveDir: path.dirname(filename),
          warnings: result.warnings.map(w => ({ text: w.message,
            location: w.start ? { file: filename, line: w.start.line, column: w.start.column } : undefined })) };
      });
    } }],
  };
}
function workerOptions({ minify = false, write = true } = {}) {
  return { entryPoints: [path.resolve(__dirname, '../src/domain/math-render-worker.ts')],
    outfile: path.resolve(__dirname, '../public/math-render-worker.js'),
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify, write,
    alias: { '#default-font/svg/default.js': path.resolve(__dirname, '../node_modules/@mathjax/mathjax-tex-font/mjs/svg/default.js') },
    legalComments: 'inline' };
}
// the in-browser pdfLaTeX's worker (src/platform/tex-worker.ts), beside the engine it loads in public/tex/
function texWorkerOptions({ minify = false, write = true } = {}) {
  return { entryPoints: [path.resolve(__dirname, '../src/platform/tex-worker.ts')], outfile: path.resolve(__dirname, '../public/tex/tex-worker.js'),
    bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify, write, legalComments: 'inline' };
}
async function compileApp(settings) {
  const [application, worker, texWorker] = await Promise.all([esbuild.build(options(settings)), esbuild.build(workerOptions(settings)), esbuild.build(texWorkerOptions(settings))]);
  if (application.outputFiles) application.outputFiles.push(...worker.outputFiles, ...texWorker.outputFiles);
  return application;
}
// The interface kit catalog (public/kit.html): the app's compile settings with its own entry, no prerender.
function catalogOptions() {
  const base = options();
  return { ...base, entryPoints: [path.resolve(__dirname, '../src/ui/kit/catalog/main.ts')],
    outfile: path.resolve(__dirname, '../public/js/kit.bundle.js'), plugins: base.plugins.filter(p => p.name !== 'prerender') };
}
module.exports = { compileApp, options, workerOptions, texWorkerOptions, catalogOptions, renderIndex };
if (require.main === module) compileApp().catch(() => { process.exitCode = 1; });
