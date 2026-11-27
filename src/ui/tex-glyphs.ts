// The letter glyphs of the LaTeX formatting buttons (Bold, Italic, Underline, Strikethrough, inline maths), drawn
// as the format itself: the Document's text toolbar and the canvas's text editor (TextDock.svelte) show the same.
export const TEX_GLYPHS = {
  b: '<b class="tb-glyph">B</b>', i: '<i class="tb-glyph" style="font-family:Georgia,serif">I</i>',
  u: '<span class="tb-glyph" style="text-decoration:underline">U</span>', s: '<span class="tb-glyph" style="text-decoration:line-through">S</span>',
  math: '<i class="tb-glyph tb-math">x</i>',
};
