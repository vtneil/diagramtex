// A PDF's first page as a picture (PNG), for code drawn by the in-browser LaTeX (src/application/kept-preview.ts).
// pdf.js (Mozilla, Apache-2.0: public/tex/pdfjs, its legacy build) is loaded the first time, from this site, beside the
// LaTeX engine it serves; nothing leaves the browser. Its fonts are the PDF's own (pdfTeX embeds every one).

let lib: Promise<any> | null = null;
const url = (f: string) => new URL('tex/pdfjs/' + f, document.baseURI).href;
function load() {
  // (a module from a URL, which the bundler leaves to the browser)
  const src = url('pdf.min.mjs');
  return lib ??= import(/* @vite-ignore */ src).then((m) => {
    m.GlobalWorkerOptions.workerSrc = url('pdf.worker.min.mjs');
    return m;
  }).catch((e) => { lib = null; throw e; });
}

export interface PdfImage {
  /** data:image/png */
  href: string;
  /** the page, in PDF points (1/72 in) */
  width: number; height: number;
}

/**
 * The PDF's first page drawn at `scale` pixels per PDF point, smaller where it would pass `maxPixels`: a PNG, with
 * the page's size. A transparent background, so it sits on the canvas as LaTeX's ink alone.
 */
export async function pdfImage(pdf: Uint8Array, scale: number, maxPixels = 16e6): Promise<PdfImage> {
  const pdfjs = await load();
  // a copy: pdf.js takes the bytes over (the caller may keep its own)
  const doc = await pdfjs.getDocument({ data: pdf.slice(), isEvalSupported: false, disableAutoFetch: true, verbosity: 0 }).promise;
  try {
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const s = Math.min(scale, Math.sqrt(maxPixels / Math.max(1, base.width * base.height)));
    const vp = page.getViewport({ scale: s });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(vp.width)); canvas.height = Math.max(1, Math.ceil(vp.height));
    const ctx = canvas.getContext('2d')!;
    await page.render({ canvasContext: ctx, canvas, viewport: vp, background: 'rgba(0,0,0,0)' }).promise;
    const href = canvas.toDataURL('image/png');
    canvas.width = canvas.height = 0;
    return { href, width: base.width, height: base.height };
  } finally { void doc.destroy(); }
}
