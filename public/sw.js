// Service worker: makes DiagramTeX installable and usable offline.
// Strategy: network first (so a deploy shows up on the next load), falling back to the cached copy when
// offline or when the network is too slow. Every same-origin file is precached on install, so the app,
// both maths engines and their fonts work offline from the first visit. Cross-origin requests (the CDN
// fallback for HTML export fonts) pass straight through.
// Bump CACHE when the file list below changes; stale caches are deleted on activate.
const CACHE = 'diagramtex-v18';
const SLOW_MS = 4000;
const PRECACHE = [
    './',
    'manifest.webmanifest',
    'css/style.css',
    'fonts/InterDisplay-Medium.woff2',
    'fonts/InterDisplay-SemiBold.woff2',
    'fonts/InterDisplay-Bold.woff2',
    'fonts/InterDisplay-Italic.woff2',
    'icons/apple-touch-icon.png',
    'icons/favicon-32.png',
    'icons/favicon.svg',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'icons/icon-maskable-512.png',
    'icons/icon-maskable.svg',
    'icons/icon.svg',
    'js/storage.js',
    'js/app.js',
    'js/boolean.js',
    'js/cd.js',
    'js/quantum.js',
    'js/forest.js',
    'js/zx.js',
    'js/czcore.js',
    'js/czparts-wires.js',
    'js/czparts-passive.js',
    'js/czparts-semi.js',
    'js/czparts-sources.js',
    'js/czparts-switch.js',
    'js/czparts-blocks.js',
    'js/circuit.js',
    'js/czeditor.js',
    'js/qceditor.js',
    'js/fteditor.js',
    'js/zxeditor.js',
    'js/colorpicker.js',
    'js/dialog.js',
    'js/docview.js',
    'js/fills.js',
    'js/mathengine.js',
    'js/mathinput.js',
    'js/plots.js',
    'js/rotate.js',
    'js/selectmenu.js',
    'js/tooltip.js',
    'js/segthumb.js',
    'js/shapes.js',
    'js/symbols.js',
    'js/texcommands.js',
    'js/texhighlight.js',
    'js/texcomplete.js',
    'js/tikzimport.js',
    'vendor/katex/fonts/KaTeX_AMS-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Caligraphic-Bold.woff2',
    'vendor/katex/fonts/KaTeX_Caligraphic-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Fraktur-Bold.woff2',
    'vendor/katex/fonts/KaTeX_Fraktur-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Main-Bold.woff2',
    'vendor/katex/fonts/KaTeX_Main-BoldItalic.woff2',
    'vendor/katex/fonts/KaTeX_Main-Italic.woff2',
    'vendor/katex/fonts/KaTeX_Main-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Math-BoldItalic.woff2',
    'vendor/katex/fonts/KaTeX_Math-Italic.woff2',
    'vendor/katex/fonts/KaTeX_SansSerif-Bold.woff2',
    'vendor/katex/fonts/KaTeX_SansSerif-Italic.woff2',
    'vendor/katex/fonts/KaTeX_SansSerif-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Script-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Size1-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Size2-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Size3-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Size4-Regular.woff2',
    'vendor/katex/fonts/KaTeX_Typewriter-Regular.woff2',
    'vendor/katex/katex.min.css',
    'vendor/katex/katex.min.js',
    'vendor/temml/Temml-Latin-Modern.css',
    'vendor/temml/Temml.woff2',
    'vendor/temml/latinmodernmath.woff2',
    'vendor/mathlive/mathlive.min.js',
    'vendor/temml/temml.min.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('diagramtex-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fromCache = async () => (await cache.match(req, { ignoreSearch: true }))
      || (req.mode === 'navigate' ? cache.match('./') : undefined);
    const net = fetch(req).then((res) => {
      if (res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    });
    net.catch(() => {}); // handled below; stops an unhandled rejection when the cache wins the race
    // a slow network loses to a cached copy, but still refreshes the cache in the background
    const slow = new Promise((r) => setTimeout(r, SLOW_MS)).then(fromCache);
    try {
      const res = await Promise.race([net, slow.then((c) => c || net)]);
      return res || (await net);
    } catch (err) {
      const c = await fromCache();
      if (c) return c;
      throw err;
    }
  })());
});
