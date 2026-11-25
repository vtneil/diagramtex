// circuitikz in an imported document: what its package options say (circuitikz.sty), as the Circuit block's own
// settings, and its siunitx labels. Called from the importer (tikzimport.ts, circuitBlock).

// \usepackage[…]{circuitikz} and \PassOptionsToPackage{…}{circuitikz} → the \ctikzset keys each option sets at the end
// of the package. LaTeX runs a package's options in the order the package declares them (\ProcessOptions), after its
// defaults (\ExecuteOptions), whatever order they were given in, and drops the spaces in their names.
const OPTIONS: [string, string][] = [
  ['european', 'voltage=european, current=european, inductor=european, resistor=european, logic ports=european'],
  ['american', 'voltage=american, current=american, resistor=american, inductor=american, logic ports=american'],
  ['europeanvoltage', 'voltage=european'], ['straightvoltages', 'voltage=straight'], ['americanvoltage', 'voltage=american'],
  ['europeanvoltages', 'voltage=european'], ['americanvoltages', 'voltage=american'],
  ['oldvoltagedirection', 'voltage dir=old'], ['nooldvoltagedirection', 'voltage dir=noold'], ['RPvoltages', 'voltage dir=RP'], ['EFvoltages', 'voltage dir=EF'],
  ['europeancurrent', 'current=european'], ['americancurrent', 'current=american'], ['europeancurrents', 'current=european'], ['americancurrents', 'current=american'],
  ['americanresistor', 'resistor=american'], ['europeanresistor', 'resistor=european'], ['americanresistors', 'resistor=american'], ['europeanresistors', 'resistor=european'],
  ['americaninductor', 'inductor=american'], ['europeaninductor', 'inductor=european'], ['cuteinductor', 'inductor=cute'],
  ['americaninductors', 'inductor=american'], ['europeaninductors', 'inductor=european'], ['cuteinductors', 'inductor=cute'],
  ['americanport', 'logic ports=american'], ['europeanport', 'logic ports=european'], ['americanports', 'logic ports=american'], ['europeanports', 'logic ports=european'],
  ['fulldiodes', 'diode=full'], ['emptydiodes', 'diode=empty'], ['strokediodes', 'diode=stroke'],
  ['fulldiode', 'diode=full'], ['emptydiode', 'diode=empty'], ['strokediode', 'diode=stroke'],
];

/** The options the preamble passes to circuitikz, spaces dropped. */
export function czOptions(preamble: string): string[] {
  const out: string[] = [];
  const add = (list: string) => { for (const x of list.split(',')) { const t = x.replace(/\s+/g, ''); if (t) out.push(t); } };
  for (const m of preamble.matchAll(/\\PassOptionsToPackage\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g)) if (m[2].split(',').some((p) => p.trim() === 'circuitikz')) add(m[1]);
  for (const m of preamble.matchAll(/\\usepackage\s*\[([^\]]*)\]\s*\{([^{}]*)\}/g)) if (m[2].split(',').some((p) => p.trim() === 'circuitikz')) add(m[1]);
  return out;
}

/** The \ctikzset line the options come to (the drawing styles and voltage directions they set), or ''. */
export function czSettings(options: string[]): string {
  const keys = OPTIONS.filter(([o]) => options.includes(o)).map(([, k]) => k);
  return keys.length ? `\\ctikzset{${keys.join(', ')}}` : '';
}

// circuitikz with `siunitx` reads a label `value<unit>` (one that ends in >) as $\SI{value}{unit}$ (\pgf@circ@handleSI)
const si = (t: any) => {
  const s = String(t ?? ''), a = s.indexOf('<'), b = a < 0 ? -1 : s.indexOf('>', a + 1);
  return a < 0 || b < 0 || b === a + 1 || !s.endsWith('>') ? s : `$\\SI{${s.slice(0, a)}}{${s.slice(a + 1, b)}}$`;
};
const LABEL_OPT = /^((?:l|a)_?|(?:v|i)[_^<>]{0,3})(\s*=\s*)([\s\S]*)$/;

/** Labels, annotations, voltages and currents written `value<unit>` as LaTeX typesets them with siunitx. */
export function czSiLabels(items: any[], splitTop: (s: string, sep: string) => string[]) {
  for (const it of items) {
    if (it.p) continue;
    for (const k of ['l', 'ann', 'v', 'i']) if (it[k]) it[k] = si(it[k]);
    if (it.opts) it.opts = splitTop(it.opts, ',').map((x) => {
      const m = LABEL_OPT.exec(x.trim());
      if (!m) return x.trim();
      const v = m[3].trim(), braced = /^\{[\s\S]*\}$/.test(v), t = si(braced ? v.slice(1, -1) : v);
      return t === (braced ? v.slice(1, -1) : v) ? x.trim() : `${m[1]}${m[2]}{${t}}`;
    }).join(', ');
  }
  return items;
}

/** The size the circuit's settings give its labels (a picture's font=\\small, in \\tikzset), or ''. */
export function czFontSize(set: string) {
  let size = '';
  const t = String(set || '');
  for (const m of t.matchAll(/\\tikzset\s*\{/g)) {
    // the keys at the top of the list, and every node's style (a style of its own sets only what uses it)
    const keys: string[] = [];
    let d = 0, key = '';
    for (let i = m.index! + m[0].length; i < t.length; i++) {
      const c = t[i];
      if (c === '}' && !d) break;
      if (c === '{') d++; else if (c === '}') d--;
      if (c === ',' && !d) { keys.push(key); key = ''; } else key += c;
    }
    keys.push(key);
    for (const k of keys) {
      const e = /^\s*every node\/\.(?:append )?style\s*=\s*\{([\s\S]*)\}\s*$/.exec(k), x = e ? czFontSize(`\\tikzset{${e[1]}}`) : '';
      const f = /^\s*(?:node )?font\s*=\s*\{?\s*\\(tiny|scriptsize|footnotesize|small|normalsize|large|Large|LARGE|huge|Huge)\b/.exec(k);
      if (x || f) size = x || f![1];
    }
  }
  return size;
}

// A line of a Circuit block's kept code that draws nothing: settings, or a named coordinate with no options or nodes
const SETTING_LINE = /^\\(?:ctikzset|tikzset|tikzstyle)\b|^\\coordinate\s*\([^()]*\)\s*at\s*\(.*\);(?:\s*%.*)?$/;
export const czDrawsNothing = (line: string) => SETTING_LINE.test(line.trim());

/** What a document's preamble says about circuitikz: its options as settings (pre) and whether labels use siunitx. */
export function czDocOf(preamble: string) {
  const o = czOptions(preamble);
  return { pre: czSettings(o), si: o.includes('siunitx') };
}
