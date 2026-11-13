// Watch the application graph and serve the original static assets, all on localhost.
const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { options } = require('./compile');
(async () => {
  // version.json is written by the release build (dist/); the dev server serves public/, so write the
  // current release there too (gitignored), or the app's update check 404s on every load.
  const VERSION = (/TD\.VERSION = '([^']+)'/.exec(fs.readFileSync(path.join(__dirname, '../src/domain/shapes.ts'), 'utf8')) || [])[1];
  if (VERSION) fs.writeFileSync(path.join(__dirname, '../public/version.json'), JSON.stringify({ version: VERSION }) + '\n');
  const ctx = await esbuild.context(options());
  await ctx.watch();
  const server = await ctx.serve({ servedir: 'public', host: '127.0.0.1', port: Number(process.env.PORT || 5173) });
  console.log(`DiagramTeX: http://${(server.hosts && server.hosts[0]) || server.host || '127.0.0.1'}:${server.port}`);
})().catch(error => { console.error(error); process.exitCode = 1; });
