// Block editors redraw their whole picture as one markup string on every pointer move. Setting it with
// innerHTML made every element new each frame, so a pan or a drag rebuilt and repainted every label picture.
// patchSvg splits the markup into its top-level elements and compares them as text with the last draw: an
// unchanged element is kept, one whose contents are unchanged (a group that only moved) takes its new
// attributes (an empty element such as a label picture keeps its decoded picture when only its place
// changed), and only the rest are parsed.
type Part = { open: string; inner: string; whole: string };
type Drawn = { parts: Part[]; nodes: ChildNode[] };
const drawn = new WeakMap<Element, Drawn>();
const holder = document.createElement('template');
const STOP = /["'>]/g;

// Top-level elements of well-formed markup. Text between tags holds no '<', and a quoted attribute value may
// (an inline picture), so quotes are skipped inside tags. Returns null for anything it doesn't follow.
function split(s: string): Part[] | null {
  const parts: Part[] = [];
  let i = 0, depth = 0, start = 0, openEnd = 0;
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { if (depth || s.slice(i).trim()) return null; break; }
    if (!depth && s.slice(i, lt).trim()) return null;
    if (s.startsWith('<!--', lt)) { const e = s.indexOf('-->', lt); if (e < 0) return null; if (!depth) return null; i = e + 3; continue; }
    const closing = s[lt + 1] === '/';
    let j = lt + 1;
    for (;;) {
      STOP.lastIndex = j;
      const m = STOP.exec(s);
      if (!m) return null;
      if (m[0] === '>') { j = m.index; break; }
      const e = s.indexOf(m[0], m.index + 1);
      if (e < 0) return null;
      j = e + 1;
    }
    const selfClosing = !closing && s[j - 1] === '/';
    if (!depth) { start = lt; openEnd = j + 1; }
    if (closing) depth--; else if (!selfClosing) depth++;
    if (depth < 0) return null;
    i = j + 1;
    if (!depth) {
      const whole = s.slice(start, i);
      parts.push(selfClosing && start === lt ? { open: whole, inner: '', whole } : { open: s.slice(start, openEnd), inner: s.slice(openEnd, lt), whole });
    }
  }
  return depth ? null : parts;
}

function parse(markup: string) {
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg">${markup}</svg>`;
  const nodes = Array.from((holder.content.firstChild as Element).childNodes);
  holder.innerHTML = '';
  return nodes;
}

function takeAttributes(el: Element, from: Element) {
  for (const name of el.getAttributeNames()) if (!from.hasAttribute(name)) el.removeAttribute(name);
  for (const name of from.getAttributeNames()) { const v = from.getAttribute(name)!; if (el.getAttribute(name) !== v) el.setAttribute(name, v); }
}

const tagOf = (open: string) => /^<([^\s/>]+)/.exec(open)?.[1];

export function patchSvg(svg: Element, markup: string) {
  const parts = split(markup), last = drawn.get(svg), kids = svg.childNodes;
  const usable = parts && last && last.parts.length === parts.length && kids.length === last.nodes.length && last.nodes.every((n, i) => kids[i] === n);
  if (!parts || !usable) {
    svg.innerHTML = markup;
    if (parts && svg.childNodes.length === parts.length) drawn.set(svg, { parts, nodes: Array.from(svg.childNodes) }); else drawn.delete(svg);
    return;
  }
  const nodes = last.nodes.slice();
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i], o = last.parts[i];
    if (p.whole === o.whole) continue;
    if (p.inner === o.inner && tagOf(p.open) === tagOf(o.open)) {
      const shell = parse(p.open === p.whole ? p.open : `${p.open}</${tagOf(p.open)}>`)[0];
      if (shell && shell.nodeType === 1) { takeAttributes(nodes[i] as Element, shell as Element); continue; }
    }
    const fresh = parse(p.whole);
    if (fresh.length !== 1) { svg.innerHTML = markup; drawn.delete(svg); return; }
    svg.replaceChild(fresh[0], nodes[i]); nodes[i] = fresh[0];
  }
  drawn.set(svg, { parts, nodes });
}
