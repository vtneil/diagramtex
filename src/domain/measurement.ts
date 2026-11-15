import katexCss from '../../public/vendor/katex/katex.min.css';
let root: ShadowRoot | undefined;
let measure: HTMLDivElement;

// MathJax SVGs contain stylesheets. Inserting them into an ordinary hidden div
// invalidates styles throughout the visible document. Shadow DOM confines those
// rules and the temporary layout to the measurement surface.
export function measurementRoot(): ShadowRoot {
  if (root) return root;
  const host = document.getElementById('measureHost')!;
  root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = katexCss.replace(/@font-face\s*\{[^}]*\}/g, '') + `
    *{box-sizing:border-box}
    .tx{font-family:var(--font-tex);line-height:1.2;white-space:pre;text-align:center;display:inline-block;pointer-events:none}
    .tx .katex{font-size:1em}
    .td-math{display:inline-block;line-height:0;white-space:nowrap}
    .td-math-display{display:block;text-align:center;margin:1em 0}
    .td-math-placeholder{outline:.06em dashed currentColor}
    #measure{position:absolute;left:-10000px;top:0;visibility:hidden}
  `;
  measure = document.createElement('div'); measure.id = 'measure'; measure.className = 'tx';
  root.append(style, measure);
  return root;
}
export function measurementElement(): HTMLDivElement { measurementRoot(); return measure; }
