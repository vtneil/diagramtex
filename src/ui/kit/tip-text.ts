// How a tooltip reads its text. A trailing "(shortcut)" is set apart as a key: "Rotate 90° (R)". A title written
// "Name (key): what it does" shows the name and key over a muted line: "Wire (W): drag between points". A title of two
// lines shows the second as that muted line: "Changes are saved to a.diagramtex\nEvery change is saved to it as you work".
export interface TipParts { label: string; key?: string; sub?: string }
const KEY = '((?:⌘|⇧|⌥|⌃|Ctrl\\+|Shift\\+|Alt\\+|Cmd\\+)*[^\\s()]{1,6})';
const TRAILING = new RegExp(`\\s\\(${KEY}\\)$`);
const LEAD = new RegExp(`^([^()]{1,40}?) \\(${KEY}\\)\\s*[:—–-]\\s*(.+)$`);
export function parseTip(text: string): TipParts {
  const nl = text.indexOf('\n');
  if (nl > 0) return { ...parseTip(text.slice(0, nl)), sub: text.slice(nl + 1).trim() || undefined };
  const lead = LEAD.exec(text);
  if (lead) return { label: lead[1], key: lead[2], sub: lead[3] };
  const m = TRAILING.exec(text);
  return m ? { label: text.slice(0, m.index), key: m[1] } : { label: text };
}
