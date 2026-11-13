import { runtime as TD } from '../runtime';
// Pictures the LaTeX refers to. Each export names its pictures once (two different pictures that would share a
// name get -2, -3 …), and while an export runs inside collect() every picture it writes is recorded with its
// data, so a .zip can carry exactly the files the .tex uses. No DOM.
(function () {
  // what pdflatex takes as is; anything else is turned into a PNG before it goes in a bundle
  const KIND: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', 'svg+xml': 'svg', svg: 'svg', pdf: 'pdf' };
  const mime = (src: string) => ((/^data:(?:image|application)\/([\w.+-]+)/.exec(src || '') || [])[1] || '').toLowerCase();
  /** the extension the picture has in LaTeX: png, jpg, svg or pdf (a GIF or WebP goes in as PNG) */
  const ext = (src: string) => KIND[mime(src)] || 'png';
  /** a file name LaTeX reads safely: letters, digits, - and _, then the picture's extension */
  function fileName(name: string, src: string) {
    const base = String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '') || 'image';
    return `${base}.${ext(src)}`;
  }
  let active: Map<string, string> | null = null;
  /** the name this picture takes in this export (X is the export's context), recorded for the bundle */
  function use(X: any, name: string, src: string) {
    const used: Map<string, string> = X.images || (X.images = new Map());
    let out = name;
    if (used.has(out) && used.get(out) !== src) {
      const dot = name.lastIndexOf('.'), base = name.slice(0, dot), e = name.slice(dot);
      let k = 2;
      while (used.has(`${base}-${k}${e}`) && used.get(`${base}-${k}${e}`) !== src) k++;
      out = `${base}-${k}${e}`;
    }
    used.set(out, src);
    if (active && src) active.set(out, src);
    return out;
  }
  /** runs an export and returns what it wrote with the pictures it refers to */
  function collect<R>(fn: () => R): { result: R; files: Map<string, string> } {
    const prev = active, files = new Map<string, string>();
    active = files;
    try { return { result: fn(), files }; } finally { active = prev; }
  }
  /** \includegraphics, or \includesvg for an SVG (svg package; base name without the extension) */
  function include(X: any, name: string, opts: string) {
    if (/\.svg$/i.test(name)) { X.pkgs.add('svg'); return `\\includesvg[${opts}]{${name.replace(/\.svg$/i, '')}}`; }
    X.pkgs.add('graphicx');
    return `\\includegraphics[${opts}]{${name}}`;
  }
  /** svg.sty looks for an SVG converted without Inkscape here (inkscapelatex=false, the default path) */
  const svgFallback = (name: string) => `svg-inkscape/${name.replace(/\.svg$/i, '')}_svg-raw.pdf`;
  // The svg package as exported: Inkscape converts each SVG (with shell escape, as on Overleaf). The other
  // .zip has a PDF of each SVG beside it, and its LaTeX tells the package never to call Inkscape.
  const SVG_PKG = '\\usepackage[inkscapelatex=false]{svg}', SVG_PKG_NO_INKSCAPE = '\\usepackage[inkscape=false, inkscapelatex=false]{svg}';
  /** the LaTeX for the .zip whose SVGs come as PDFs: the package set to use them, not Inkscape */
  const noInkscape = (tex: string) => tex.split('\n').map((l) => (l === SVG_PKG ? SVG_PKG_NO_INKSCAPE : l)).join('\n');
  TD.texImages = { ext, mime, fileName, use, collect, include, svgFallback, SVG_PKG, noInkscape };
})();
