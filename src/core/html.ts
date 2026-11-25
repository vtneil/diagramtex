/** Text made safe in HTML or XML, in text and in a double-quoted attribute: & < > " as entities. */
export const escapeHtml = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ESC[c]);
const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
