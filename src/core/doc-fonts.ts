// A Classic Document's font, and an object's own font, as each LaTeX engine writes them. Shared by the app's LaTeX
// (src/domain/shapes.ts, src/application/docview.ts) and the bundle generator (scripts/tex-bundle.mjs), which makes
// sure the in-browser engines have every file these lines load. No imports: Node runs this file as it is.
//
// pdfLaTeX uses the Type 1 packages (newtx, newpx, tgheros); XeLaTeX uses fontspec with the same faces as OpenType,
// named by file (the in-browser XeTeX finds fonts by file name only). Maths stays in the classic maths fonts with both
// engines (newtxmath, newpxmath, or Computer Modern), so every block's maths reads the same. Thai (the TLWG fonts):
// XeLaTeX sets it from their OpenType faces; pdfLaTeX from their Type 1 faces in the LTH encoding (fonts-tlwg), each run
// of Thai written as \tdth{…} (see THAI_PDF). A Thai document font with pdfLaTeX sets its Thai; its Latin letters stay in
// Computer Modern, and the code says so.

export type TexEngine = 'pdflatex' | 'xelatex';

export interface DocFont {
  key: string;
  /** the name in the menu (the Thai fonts with their Thai names) */
  label: string;
  /** the preview's CSS font-family */
  css: string;
  /** a Thai font: XeLaTeX only */
  thai?: boolean;
  /** preamble lines for each engine (none: LaTeX's default, Computer Modern / Latin Modern) */
  pdflatex: string[];
  xelatex: string[];
}

// fontspec by file: family name, then the four faces' file names
const spec = (file: string, faces: [string, string, string, string], extra = '') =>
  `{${file}}[Extension=.otf, UprightFont=${faces[0]}, BoldFont=${faces[1]}, ItalicFont=${faces[2]}, BoldItalicFont=${faces[3]}${extra}]`;
const GYRE: [string, string, string, string] = ['*-regular', '*-bold', '*-italic', '*-bolditalic'];
export const FONT_SPEC: Record<string, string> = {
  termes: spec('texgyretermes', GYRE),
  pagella: spec('texgyrepagella', GYRE),
  heros: spec('texgyreheros', GYRE),
  cursor: spec('texgyrecursor', GYRE),
  lmroman: spec('lmroman10', GYRE),
  kinnari: spec('Kinnari', ['*', '*-Bold', '*-Italic', '*-BoldItalic'], ', Script=Thai'),
  garuda: spec('Garuda', ['*', '*-Bold', '*-Oblique', '*-BoldOblique'], ', Script=Thai'),
  laksaman: spec('Laksaman', ['*', '*-Bold', '*-Italic', '*-BoldItalic'], ', Script=Thai'),
};
const thai = (key: 'kinnari' | 'garuda' | 'laksaman', label: string, css: string): DocFont => ({
  key, label, css, thai: true, pdflatex: [`\\newcommand*\\tdthaifam{${key}}`],
  xelatex: ['\\usepackage{fontspec}', `\\setmainfont${FONT_SPEC[key]}`],
});

export const DOC_FONTS: DocFont[] = [
  { key: 'cm', label: 'Computer Modern', css: 'KaTeX_Main, "Latin Modern Roman", "CMU Serif", serif', pdflatex: [], xelatex: [] },
  { key: 'lm', label: 'Latin Modern', css: '"Latin Modern Roman", KaTeX_Main, "CMU Serif", serif',
    pdflatex: ['\\usepackage[T1]{fontenc}', '\\usepackage{lmodern}'], xelatex: [] },
  { key: 'times', label: 'Times (TeX Gyre Termes)', css: '"TeX Gyre Termes", "Times New Roman", Times, serif',
    pdflatex: ['\\usepackage[T1]{fontenc}', '\\usepackage{newtxtext,newtxmath}'],
    xelatex: ['\\usepackage{newtxmath}', '\\usepackage[no-math]{fontspec}', `\\setmainfont${FONT_SPEC.termes}`] },
  { key: 'palatino', label: 'Palatino (TeX Gyre Pagella)', css: '"TeX Gyre Pagella", Palatino, "Palatino Linotype", "Book Antiqua", serif',
    pdflatex: ['\\usepackage[T1]{fontenc}', '\\usepackage{newpxtext,newpxmath}'],
    xelatex: ['\\usepackage{newpxmath}', '\\usepackage[no-math]{fontspec}', `\\setmainfont${FONT_SPEC.pagella}`] },
  { key: 'helvetica', label: 'Helvetica (TeX Gyre Heros)', css: '"TeX Gyre Heros", Helvetica, Arial, sans-serif',
    pdflatex: ['\\usepackage[T1]{fontenc}', '\\usepackage{tgheros}', '\\renewcommand{\\familydefault}{\\sfdefault}'],
    xelatex: ['\\usepackage{fontspec}', `\\setmainfont${FONT_SPEC.heros}`, `\\setsansfont${FONT_SPEC.heros}`] },
  thai('kinnari', 'Kinnari (กินรี)', 'Kinnari, serif'),
  thai('garuda', 'Garuda (ครุฑ)', 'Garuda, sans-serif'),
  thai('laksaman', 'Laksaman (ลักษมัณ)', 'Laksaman, sans-serif'),
];
export const docFont = (key: unknown): DocFont => DOC_FONTS.find((f) => f.key === key) || DOC_FONTS[0];

/** The preamble lines for a document font with an engine (a Thai font with pdfLaTeX: the font for its Thai text). */
export const docFontPreamble = (key: unknown, engine: TexEngine): string[] => [...docFont(key)[engine]];

/**
 * An object's own font (TD.FONTS: default, cmr, cmss, cmtt, times, arial, courier, garuda, kinnari, laksaman) in a
 * document set in `doc`: the switch written in the object's font= option, and any preamble lines it needs. With the
 * document in Computer Modern and pdfLaTeX, what the app has always written.
 */
export function objectFont(key: unknown, engine: TexEngine, doc: unknown = 'cm'): { code: string; pre: string[] } {
  const d = docFont(doc).key, plain = d === 'cm' || (engine === 'xelatex' && d === 'lm');
  const family = (name: string, file: keyof typeof FONT_SPEC) =>
    ({ code: `\\${name}`, pre: ['\\usepackage{fontspec}', `\\newfontfamily\\${name}${FONT_SPEC[file]}`] });
  switch (key) {
    case 'cmr': return plain ? { code: '\\rmfamily', pre: [] }
      : engine === 'xelatex' ? family('tdlmroman', 'lmroman') : { code: '\\fontfamily{cmr}\\selectfont', pre: [] };
    case 'cmss': return d === 'cm' || (engine === 'xelatex' && d !== 'helvetica') ? { code: '\\sffamily', pre: [] }
      : engine === 'xelatex' ? { code: '\\fontfamily{lmss}\\selectfont', pre: [] } : { code: '\\fontfamily{cmss}\\selectfont', pre: [] };
    case 'cmtt': return d === 'cm' || engine === 'xelatex' ? { code: '\\ttfamily', pre: [] } : { code: '\\fontfamily{cmtt}\\selectfont', pre: [] };
    case 'times': return engine === 'xelatex' ? family('tdtermes', 'termes') : { code: '\\fontfamily{ptm}\\selectfont', pre: [] };
    case 'arial': return engine === 'xelatex' ? family('tdheros', 'heros') : { code: '\\fontfamily{phv}\\selectfont', pre: [] };
    case 'courier': return engine === 'xelatex' ? family('tdcursor', 'cursor') : { code: '\\fontfamily{pcr}\\selectfont', pre: [] };
    // pdfLaTeX: the whole text in the font's LTH face (its Latin letters too, as with XeLaTeX), and its Thai runs
    case 'garuda': case 'kinnari': case 'laksaman':
      return engine === 'xelatex' ? family('td' + key, key)
        : { code: `\\fontencoding{LTH}\\fontfamily{${key}}\\selectfont\\def\\tdthaifam{${key}}`, pre: [...THAI_PDF] };
    default: return { code: '', pre: [] };
  }
}

/** Thai letters (U+0E00–U+0E7F) in some text: what needs XeLaTeX and a Thai font. */
export const hasThai = (text: string) => /[฀-๿]/.test(text);

/**
 * XeLaTeX preamble lines for Thai text in a document whose font has no Thai: XeTeX switches to a Thai font (Kinnari)
 * for each run of Thai letters by itself (\XeTeXinterchartoks), and \tdbr marks where a line may break inside Thai
 * (see thaiBreaks).
 */
export const thaiFallback = (font: 'kinnari' | 'garuda' | 'laksaman' = 'kinnari'): string[] => [
  '\\usepackage{fontspec}',
  `\\newfontfamily\\tdthai${FONT_SPEC[font]}`,
  '\\newXeTeXintercharclass\\tdThaiClass',
  '\\count255="0E00 \\loop\\ifnum\\count255<"0E80 \\XeTeXcharclass\\count255=\\tdThaiClass\\advance\\count255 by 1 \\repeat',
  // only where the font in use has no Thai: text in a Thai font (an object's Garuda, say) keeps it
  '\\XeTeXinterchartoks 0 \\tdThaiClass={\\begingroup\\iffontchar\\font"0E01 \\else\\tdthai\\fi}',
  '\\XeTeXinterchartoks 4095 \\tdThaiClass={\\begingroup\\iffontchar\\font"0E01 \\else\\tdthai\\fi}',
  '\\XeTeXinterchartoks \\tdThaiClass 0={\\endgroup}',
  '\\XeTeXinterchartoks \\tdThaiClass 4095={\\endgroup}',
  '\\XeTeXinterchartokenstate=1',
];
/**
 * pdfLaTeX preamble lines for Thai: the LTH encoding of the TLWG fonts (fonts-tlwg: TIS-620 codes, U+0E01–U+0E5B less
 * 0x0E00 plus 0xA0), \tdthai to switch to the Thai font (\tdthaifam, Kinnari unless the document's or an object's
 * Thai font says otherwise), and each Thai letter declared for UTF-8 input. A run of Thai is written \tdth{…} (thaiRuns):
 * in one font, so the font's ligatures place its vowels and tone marks; a letter outside one still prints, in its own
 * group. The source keeps its Thai as written.
 */
export const THAI_PDF: string[] = [
  '\\makeatletter\\input{lthenc.def}\\makeatother',
  '\\providecommand*\\tdthaifam{kinnari}',
  '\\DeclareRobustCommand*\\tdthai{\\fontencoding{LTH}\\fontfamily{\\tdthaifam}\\selectfont}',
  '\\DeclareRobustCommand*\\tdth[1]{\\ifmmode\\mbox{\\tdthai#1}\\else{\\tdthai#1}\\fi}',
  '\\makeatletter\\def\\tdLTH{LTH}\\def\\tdthaichar#1{\\ifx\\f@encoding\\tdLTH\\char#1 \\else{\\tdthai\\char#1 }\\fi}\\makeatother',
  '\\ExplSyntaxOn\\int_step_inline:nnn{"0E01}{"0E5B}{\\exp_args:Nee\\DeclareUnicodeCharacter{\\int_to_Hex:n{#1}}{\\exp_not:N\\tdthaichar{\\int_eval:n{#1-"0E00+"A0}}}}\\ExplSyntaxOff',
];
/** Defines \tdbr: a place a line may break, taking no room (Thai writes no spaces between words). */
export const THAI_BREAK_DEF = '\\providecommand*\\tdbr{\\penalty0\\relax}';

/**
 * Thai words marked with \tdbr between them, so LaTeX can break a line inside a run of Thai. The browser's own word
 * dictionary finds the words (Intl.Segmenter); XeTeX's (\XeTeXlinebreaklocale) is not in the in-browser engine, and
 * marking them here gives every XeLaTeX the same lines. Where Intl.Segmenter is missing, the text is left as it is.
 */
export function thaiBreaks(tex: string): string {
  const Seg = (Intl as any).Segmenter;
  if (!Seg || !hasThai(tex)) return tex;
  const seg = new Seg('th', { granularity: 'word' });
  // not in comment lines (a note naming a Thai font)
  return tex.split('\n').map((line) => (/^\s*%/.test(line) ? line : line.replace(/[฀-๿]+/g, (run) => [...seg.segment(run)].map((x: any) => x.segment).join('\\tdbr ')))).join('\n');
}

/** pdfLaTeX: each run of Thai (its words joined by \tdbr) as \tdth{…}, outside comment lines (see THAI_PDF). */
export const thaiRuns = (tex: string): string => !hasThai(tex) ? tex : tex.split('\n')
  .map((line) => (/^\s*%/.test(line) ? line : line.replace(/[\u0E01-\u0E5B]+(?:\\tdbr [\u0E01-\u0E5B]+)*/g, '\\tdth{$&}'))).join('\n');

/** The last step of an engine's LaTeX: where Thai lines may break, and with pdfLaTeX each Thai run marked. */
export const finishThai = (tex: string, engine: TexEngine): string => engine === 'xelatex' ? thaiBreaks(tex) : thaiRuns(thaiBreaks(tex));
