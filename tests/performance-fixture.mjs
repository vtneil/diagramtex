// Private local projects are optional and never tracked. Clean checkouts use
// generated maths labels so the performance regression still runs in CI.
import fs from 'node:fs';

export function performanceFixture() {
  const explicit = process.env.DIAGRAMTEX_PERFORMANCE_FILE;
  const local = new URL('./test_page.diagramtex', import.meta.url);
  if (explicit) return fs.readFileSync(explicit, 'utf8');
  if (fs.existsSync(local)) return fs.readFileSync(local, 'utf8');
  const formulas = [String.raw`$\vec F=q(\vec E+\vec v\times\vec B)$`,
    String.raw`$\displaystyle\int_0^\infty e^{-x^2}\,dx=\frac{\sqrt\pi}{2}$`,
    String.raw`$\begin{pmatrix}a&b\\c&d\end{pmatrix}$`,
    String.raw`$\hat x+\bar y+\overline{AB}$`];
  return JSON.stringify({ app: 'diagramtex', version: 3, kind: 'page', name: 'Generated performance fixture',
    sheet: { pages: 2, shapes: Array.from({ length: 96 }, (_, i) => ({
      id: `performance-${i}`, type: 'text', x: 100 + i % 3 * 220, y: 80 + Math.floor(i / 3) * 60,
      text: formulas[i % formulas.length], size: 'normalsize', color: '#000000', opacity: 1,
    })) } });
}
