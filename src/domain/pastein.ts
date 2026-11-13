import { runtime as TD } from '../runtime';
// What text pasted or dropped from elsewhere becomes. No DOM.
//   'tex'    TikZ or LaTeX with pictures (a tikzpicture, a document, \draw … lines): imported
//   'block'  a bare block environment (quantikz, tikzcd, \chemfig, \xymatrix …): imported as that block
//   'svg'    SVG markup: a picture
//   'image'  a data: URL of a picture: a picture
//   'math'   a formula or a symbol (\alpha, x^2, $…$, \[…\]): a text object holding it as maths
//   'text'   anything else: a text object (TeX's special characters escaped)
(function () {
  const PICTURE = /\\(begin\{(tikzpicture|circuitikz|document)\}|draw|fill|filldraw|shade|node|path|coordinate|tikzset|usetikzlibrary)\b/;
  // commands that set text rather than maths: a line starting with one stays text
  const TEXTCMD = /^\\(text\w*|emph|underline|section|subsection|paragraph|par|item|begin\{(itemize|enumerate|center|flushleft|flushright|quote)\}|LaTeX|TeX|today|footnote|cite|ref|url|href|hspace|vspace|quad|qquad)\b/;

  /** the block a bare environment opens, by the same patterns the importer uses for node text */
  function blockOf(t: string) {
    for (const B of TD.blocks.nodeImports()) {
      const m = B.re.exec(t);
      if (m && m.index === 0 && TD.TYPES[B.type]) return B.type;
    }
    return null;
  }
  function kind(text: string): string {
    const t = String(text || '').trim();
    if (!t) return 'empty';
    if (/^data:image\/[\w.+-]+(;[\w=-]+)*,\S+$/.test(t)) return 'image';
    if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg\b[\s\S]*<\/svg>$/i.test(t)) return 'svg';
    if (PICTURE.test(t)) return 'tex';
    if (blockOf(t)) return 'block';
    if (/^(\$\$?)[\s\S]+\1$|^\\\[[\s\S]+\\\]$|^\\\([\s\S]+\\\)$/.test(t) || /^\\begin\{(equation|align|gather|multline)\*?\}/.test(t)) return 'math';
    if (t.includes('$')) return 'text'; // text with maths in it: kept as written
    if (/\\[a-zA-Z]/.test(t)) return TEXTCMD.test(t) || t.includes('\n') ? 'text' : 'math';
    // one short token with a sub- or superscript (x^2, a_{ij}, E=mc^2), not a file name
    if (!/\s/.test(t) && t.length <= 40 && (/\^/.test(t) || /_\{/.test(t) || /^[A-Za-z]\w?_\w$/.test(t)) && !/[./:]/.test(t)) return 'math';
    return 'text';
  }
  /** the text a text object gets (inline maths between $…$; lines kept) */
  function asText(text: string, k = kind(text)) {
    const t = String(text || '').replace(/\r\n?/g, '\n').trim();
    if (k === 'math') {
      const m = /^\$\$([\s\S]+)\$\$$/.exec(t) || /^\$([\s\S]+)\$$/.exec(t) || /^\\\[([\s\S]+)\\\]$/.exec(t) || /^\\\(([\s\S]+)\\\)$/.exec(t);
      const env = /^\\begin\{(equation|align|gather|multline)\*?\}([\s\S]*)\\end\{\1\*?\}$/.exec(t);
      const body = (env ? env[2].replace(/\\label\{[^}]*\}/g, '') : m ? m[1] : t).trim();
      // a displayed formula's lines are one formula here: line breaks become spaces, aligned rows run on
      return `$${body.replace(/\s*\\\\\s*/g, ' \\quad ').replace(/&/g, '').replace(/\s*\n\s*/g, ' ')}$`;
    }
    if (k !== 'text') return t;
    if (/[\\$]/.test(t)) return t; // already LaTeX
    // plain text: the characters TeX would read as commands are escaped (% & # are escaped on export)
    return t.replace(/[{}_^~]/g, (c) => ({ '{': '\\{', '}': '\\}', _: '\\_', '^': '\\^{}', '~': '\\textasciitilde{}' } as Record<string, string>)[c]);
  }
  /** a bare block as the importer reads it: the environment as one node of a picture */
  const asPicture = (text: string) => `\\begin{tikzpicture}\n\\node at (0,0) {${String(text).trim()}};\n\\end{tikzpicture}`;
  TD.pasteIn = { kind, asText, asPicture, blockOf };
})();
