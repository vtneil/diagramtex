// Prerender the stable shell so loading, phone guidance and page text need no JavaScript.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const esbuild = require('esbuild');
const { compile } = require('svelte/compiler');
async function renderIndex() {
  const filename = path.resolve(__dirname, '../src/ui/AppShell.svelte');
  const source = compile(fs.readFileSync(filename, 'utf8'), { filename, generate: 'server', preserveWhitespace: true }).js.code;
  const result = await esbuild.build({ stdin: { contents: source, resolveDir: path.dirname(filename) }, bundle: true, platform: 'node', format: 'cjs', write: false,
    plugins: [{ name: 'svelte-server', setup(build) {
      build.onLoad({ filter: /\.svelte$/ }, ({ path: filename }) => ({
        contents: compile(fs.readFileSync(filename, 'utf8'), { filename, generate: 'server', preserveWhitespace: true }).js.code,
        loader: 'js', resolveDir: path.dirname(filename),
      }));
    } }],
  });
  const mod = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, mod, mod.exports);
  const { render } = require('svelte/server');
  const { body } = render(mod.exports.default);
  const preflight = esbuild.transformSync(fs.readFileSync(path.resolve(__dirname, '../src/platform/preflight.ts'), 'utf8'), { loader: 'ts', format: 'iife', target: 'es2020' }).code;
  const inline = '\n' + preflight;
  // The preflight is the page's only inline script: allow exactly it by hash instead of 'unsafe-inline', so markup
  // injected into the page (an onerror attribute, a javascript: link) cannot run.
  const hash = "'sha256-" + crypto.createHash('sha256').update(inline).digest('base64') + "'";
  const html = fs.readFileSync(path.resolve(__dirname, '../src/index.html'), 'utf8');
  const csp = /(script-src 'self') 'unsafe-inline'/;
  if (!csp.test(html)) throw new Error("src/index.html: expected script-src 'self' 'unsafe-inline' in the Content-Security-Policy");
  return html.replace(csp, `$1 ${hash}`).replace('<!-- application-preflight -->', '<script>' + inline + '</script>').replace('<!-- application-shell -->', body);
}
module.exports = { renderIndex };
