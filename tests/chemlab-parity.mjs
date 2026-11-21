// Chemistry Laboratory (src/domain/chemlab.ts) against tikz-chemlab itself: every command in several variants, every
// drawing macro, and composite set-ups, each compiled by pdflatex (one standalone page per picture), rasterised by
// Ghostscript, and compared pixel by pixel with the app's drawing of the same code at the same scale (80 px per cm).
//
// Each side's pixels are looked for on the other, within RADIUS px: an inked pixel needs ink there (the shape), and a
// solid one (it and its eight neighbours one colour: a fill, a liquid, the core of a thick line) needs a colour within
// COLOUR per channel there (the colour). Anti-aliased edges are judged by shape only: Ghostscript's stroke adjustment
// makes a thin line two black pixels where Chrome spreads it grey over two, and that is the rasterisers, not the
// drawing. A missing part, a shifted one, a wrong width past the radius or a wrong colour all count. Pictures with
// random contents (bubbles, filings: pgfmath's random numbers aren't the app's) are drawn in the report but not
// scored. xcolor runs with [rgb], so a cmyk colour is converted by xcolor's formula on both sides rather than by
// Ghostscript's colour management.
//
//   node tests/chemlab-parity.mjs                 compare, fail on any picture past its limit
//   node tests/chemlab-parity.mjs --report-only   write the evidence without failing
//   node tests/chemlab-parity.mjs tilt            only the cases whose name contains "tilt"
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PNG } from 'pngjs';
import { serve } from './chrome.mjs';
import { launchBrowser } from './browser.mjs';
import { prepare, APP_DIR, args, positional } from './args.mjs';

const PX_CM = 80, DPI = PX_CM * 2.54, BORDER_PT = 4, RADIUS = 2, COLOUR = 56, LIMIT = 0.02;

// ---------------------------------------------------------------- cases
const cases = [];
const pic = (body, env = '') => `\\begin{tikzpicture}${env ? `[${env}]` : ''}\n${body}\n\\end{tikzpicture}`;
const add = (name, body, o = {}) => cases.push({ name, src: pic(body, o.env), random: !!o.random, limit: o.limit ?? LIMIT, page: o.page ?? 2 });
const GLASS = ['tube', 'roundFlask', 'beaker', 'erlenmeyer', 'reagentBottle', 'volumetricFlask', 'watchGlass'];
const LIQUIDS = ['liquidStyle1', 'liquidStyle2', 'liquidStyle3', 'Champagne', 'Blood', 'Cobalt', 'Oil', 'Vinegar', 'AqueousPhase', 'OrganicPhase', 'Diffusion', 'BlueDiffusion', 'MixtureDiffusion2', 'YellowStripes', 'Ball3D'];
// \tkzColumn's stoppers are a Lines pattern 0.707pt apart (about two pixels here) of 0.4pt lines: Ghostscript's stroke
// adjustment fills it nearly solid grey where Chrome draws the 57% it covers, so pictures with the column allow 8%
const COLUMN = { limit: 0.08 };

// \tkzTestTube: every glass, tilts, three liquids, every liquid style, fittings, clamp, tag
add('tube', '\\tkzTestTube');
for (const g of GLASS) add(`tube-glass-${g}`, `\\tkzTestTube[glassType=${g}, liquidLevel1=60]`);
for (const t of [15, 30, 45, 90, -30, -60]) add(`tube-tilt-${t}`, `\\tkzTestTube[tiltAngle=${t}, liquidLevel1=50]`);
add('tube-tilt-beaker', '\\tkzTestTube[glassType=beaker, tiltAngle=20, liquidLevel1=40]');
add('tube-tilt-flask', '\\tkzTestTube[glassType=roundFlask, tiltAngle=-25, liquidLevel1=50]');
add('tube-three-liquids', '\\tkzTestTube[liquidLevel1=90, liquidLevel2=60, liquidLevel3=30]');
add('tube-three-liquids-erlen', '\\tkzTestTube[glassType=erlenmeyer, liquidLevel1=80, liquidStyle1=Oil, liquidLevel2=50, liquidStyle2=Blood, liquidLevel3=20, liquidStyle3=Cobalt]');
add('tube-empty', '\\tkzTestTube[liquidLevel1=0]');
add('tube-full', '\\tkzTestTube[liquidLevel1=100]');
for (const s of LIQUIDS) add(`tube-liquid-${s}`, `\\tkzTestTube[glassType=beaker, liquidLevel1=70, liquidStyle1=${s}]`);
for (const f of ['stopper', 'straightTube', 'elbowTube', 'uTube']) add(`tube-fit-${f}`, `\\tkzTestTube[${f}]`);
add('tube-clamp', '\\tkzTestTube[clamp]');
add('tube-tag', '\\tkzTestTube[glassType=beaker, label, Number=A]');
add('tube-tag-tilt', '\\tkzTestTube[label, Number=2, tiltAngle=20]');
add('tube-noDefaults', '\\tkzTestTube[noDefaults=true]');

// \tkzRoundFlask: glasses, every fitting, tilt, tag
add('roundflask', '\\tkzRoundFlask');
for (const g of ['roundFlask', 'beaker', 'erlenmeyer', 'reagentBottle', 'volumetricFlask']) add(`roundflask-glass-${g}`, `\\tkzRoundFlask[glassType=${g}]`);
for (const f of ['stopper', 'straightTube', 'elbowTube', 'uTube', 'uTubeLong', 'curvedTube', 'curvedTubeShort', 'doubleTube', 'condenserBulbs']) add(`roundflask-fit-${f}`, `\\tkzRoundFlask[glassType=roundFlask, ${f}]`);
add('roundflask-tilt', '\\tkzRoundFlask[glassType=roundFlask, tiltAngle=20, liquidLevel1=60]');
add('roundflask-tag', '\\tkzRoundFlask[glassType=erlenmeyer, label, Number=1]');
add('roundflask-liquids', '\\tkzRoundFlask[glassType=beaker, liquidLevel1=80, liquidStyle1=AqueousPhase, liquidLevel2=40, liquidStyle2=OrganicPhase]');

// \tkzHeatTube and \tkzHeatFlask: burner, bubbling, tube only, gas collection, fittings
add('heattube', '\\tkzHeatTube');
add('heattube-bubbling', '\\tkzHeatTube[bubbling]');
add('heattube-tubeOnly', '\\tkzHeatTube[tubeOnly]');
add('heattube-noburner', '\\tkzHeatTube[bunsenBurner=false]');
for (const f of ['stopper', 'straightTube', 'elbowTube', 'uTube']) add(`heattube-fit-${f}`, `\\tkzHeatTube[${f}]`);
add('heattube-clamp-tag', '\\tkzHeatTube[clamp, label, Number=B]');
add('heattube-glass', '\\tkzHeatTube[glassType=roundFlask, liquidLevel1=40]');
add('heatflask', '\\tkzHeatFlask');
for (const g of ['roundFlask', 'erlenmeyer', 'beaker']) add(`heatflask-glass-${g}`, `\\tkzHeatFlask[glassType=${g}, stopper]`);
for (const f of ['straightTube', 'elbowTube', 'uTube', 'uTubeLong', 'curvedTube', 'curvedTubeShort', 'doubleTube']) add(`heatflask-fit-${f}`, `\\tkzHeatFlask[glassType=roundFlask, ${f}]`);
add('heatflask-gas', '\\tkzHeatFlask[glassType=roundFlask, curvedTube, gasCollection]');
add('heatflask-bubbling', '\\tkzHeatFlask[glassType=roundFlask, doubleTube, bubbling]');
add('heatflask-noburner', '\\tkzHeatFlask[glassType=roundFlask, bunsenBurner=false, stopper]');
add('heatflask-liquid', '\\tkzHeatFlask[glassType=erlenmeyer, liquidLevel1=30, liquidStyle1=Blood]');

// \tkzFunnel, \tkzGraduatedCylinder, pipettes
add('funnel', '\\tkzFunnel');
for (const g of ['beaker', 'erlenmeyer', 'roundFlask']) add(`funnel-glass-${g}`, `\\tkzFunnel[glassType=${g}]`);
for (const t of [20, -20]) add(`funnel-tilt-${t}`, `\\tkzFunnel[tiltAngle=${t}]`);
add('cylinder', '\\tkzGraduatedCylinder');
add('cylinder-level', '\\tkzGraduatedCylinder[liquidLevel1=85, liquidStyle1=Blood]');
add('cylinder-tilt', '\\tkzGraduatedCylinder[tiltAngle=15]');
add('cylinder-two', '\\tkzGraduatedCylinder[liquidLevel1=70, liquidLevel2=30]');
add('pipette', '\\tkzPipette');
add('pipette-level', '\\tkzPipette[reagentLevel=8, reagentColor=blue]');
add('largepipette', '\\tkzLargePipette');
add('largepipette-level', '\\tkzLargePipette[reagentLevel=20]');

// \tkzTitration: glasses, burette off, pH meter, stirrer, levels, colours, texts
add('titration', '\\tkzTitration');
for (const g of ['roundFlask', 'beaker', 'erlenmeyer', 'reagentBottle']) add(`titration-glass-${g}`, `\\tkzTitration[glassType=${g}]`);
add('titration-noburette', '\\tkzTitration[glassType=erlenmeyer, burette=false]');
add('titration-ph', '\\tkzTitration[glassType=beaker, pHMeter]');
add('titration-stirrer', '\\tkzTitration[glassType=beaker, magneticStirrer]');
add('titration-ph-stirrer', '\\tkzTitration[glassType=beaker, pHMeter, magneticStirrer]');
add('titration-levels', '\\tkzTitration[glassType=erlenmeyer, buretteLevel=8, liquidLevel1=30, buretteColor=red]');
add('titration-texts', '\\tkzTitration[glassType=erlenmeyer, buretteReagent=NaOH, beakerReagent=HCl]');

// \tkzDistillation and \tkzSeparatoryFunnel
add('distillation', '\\tkzDistillation', COLUMN);
add('distillation-oil', '\\tkzDistillation[MixtureStyle=Oil, DistillateColor=red]', COLUMN);
add('separatory', '\\tkzSeparatoryFunnel');
add('separatory-levels', '\\tkzSeparatoryFunnel[liquidLevel1=6, liquidLevel2=9]');
add('separatory-open', '\\tkzSeparatoryFunnel[TapOpen, stopper=false]');

// every drawing macro on its own
for (const m of ['Stand', 'Column', 'BunsenBurner', 'BunsenBurnerGrill', 'FlameGrill', 'Thermometer', 'Condenser', 'Heater', 'CrystallizingDish',
  'InvertedTube', 'TestTubeRack', 'HeaterRoundFlask', 'RoundFlaskReflux', 'CondenserBulbs', 'CondenserStem', 'CondenserBody', 'BeakerBody', 'BeakerRim',
  'ErlenmeyerBody', 'ReagentBottleBody', 'WatchGlassBody', 'WatchGlassBase', 'VolumetricFlask', 'RoundFlaskSimple', 'TestTubeBody', 'TestTubeStopper',
  'TestTubeClamp', 'TestTubeStraightTube', 'TestTubeElbowTube', 'TestTubeUTube', 'TestTubeUTubeLong', 'CurvedTube', 'CurvedTubeShort', 'TestTubeDoubleTube',
  'FunnelBody', 'Stopper', 'TapOpen', 'TapClosed', 'SeparatoryFunnelBody', 'BuretteBody', 'BuretteStopcock', 'BuretteGraduation', 'TitrationPHMeter',
  'TitrationStand', 'TitrationStirBar', 'PipetteBody', 'LargePipetteBody', 'Drop', 'GraduatedCylinderBody', 'GraduatedCylinderRim', 'GraduatedCylinderBase',
  'GraduatedCylinderGraduation', 'DistillationFractionated', 'GraduatedCylinderSmall', 'GraduatedCylinderWithLiquid',
  // defined but never called by the package itself
  'CurvedTubeShortDoubleTube', 'RoundFlaskGrill', 'FunnelOutline', 'Nails', 'Copper', 'Zinc']) add(`macro-${m}`, `\\tkz${m}`, /Column|DistillationFractionated/.test(m) ? COLUMN : {});

// random contents: shown, not scored
for (const s of ['tkzChampagneBubbles', 'tkzBubbles', 'tkzBalls', 'tkzFilaments', 'tkzBubblesThreeD']) add(`random-${s}`, `\\tkzTestTube[glassType=beaker, liquidLevel1=70, substance={\\${s}}]`, { random: true });
for (const s of ['tkzCopperTurnings', 'tkzIronNail', 'tkzZincGranules']) add(`random-${s}`, `\\tkzTestTube[glassType=beaker, liquidLevel1=50, solid={\\${s}}]`, { random: true });

// composites: the accumulator, the picture's own transformation, styles, labels, set-ups
add('chain-titrations', '\\tkzTitration[glassType=erlenmeyer]\n\\tkzTitration[glassType=beaker, pHMeter]');
add('chain-mixed', '\\tkzHeatFlask[glassType=roundFlask, stopper]\n\\tkzRoundFlask[glassType=erlenmeyer]\n\\tkzTitration');
add('chain-settings-carry', '\\tkzTitration[glassType=beaker, liquidLevel1=30]\n\\tkzTitration');
add('scaled', '\\tkzTestTube[liquidLevel1=40]\n\\begin{scope}[shift={(3,0)}]\\tkzTestTube[glassType=erlenmeyer, liquidStyle1=Champagne]\\end{scope}', { env: 'scale=0.5' });
add('scaled-titration', '\\tkzTitration[glassType=erlenmeyer]', { env: 'scale=0.6' });
add('xscale', '\\tkzTestTube[glassType=beaker, liquidLevel1=50]', { env: 'xscale=1.5' });
add('rotated-scope', '\\begin{scope}[rotate=30]\\tkzTestTube[liquidLevel1=60]\\end{scope}');
// one piece scaled by its own scope, as the editor's Scale field writes it
add('item-scale', '\\tkzTestTube[liquidLevel1=40]\n\\begin{scope}[shift={(3,0)}, scale=0.5]\\tkzTestTube[glassType=erlenmeyer]\\end{scope}');
add('item-scale-chain', '\\begin{scope}[shift={(8,0)}, scale=1.5]\\tkzTitration\\end{scope}\n\\tkzTitration[pHMeter]', { env: 'scale=0.4' });
add('item-scale-tilted', '\\begin{scope}[scale=0.6]\\tkzTestTube[tiltAngle=30, liquidLevel1=50, liquidLevel2=20]\\end{scope}');
add('mirrored', '\\begin{scope}[xscale=-1]\\tkzHeatTube\\end{scope}');
add('mirrored-wide', '\\begin{scope}[xscale=-2]\\tkzTestTube[glassType=beaker]\\end{scope}');
// the funnel's test tube takes its fittings and clamp
for (const f of ['stopper', 'straightTube', 'elbowTube', 'uTube', 'clamp']) add(`funnel-${f}`, `\\tkzFunnel[${f}]`);
// a substance on its own, with its count and colour
add('random-bare-substances', '\\tkzFilaments[8]{blue}\n\\begin{scope}[shift={(4,0)}]\\tkzBubblesThreeD{green}\\end{scope}\n\\begin{scope}[shift={(8,0)}]\\tkzBalls[5]\\end{scope}', { random: true });
// noDefaults is read before a call's own options: on the call it does nothing; set before, the tubes keep \chemlabset's
add('nodefaults-call', '\\chemlabset{liquidLevel1=90, liquidStyle1=Blood}\n\\tkzTestTube[noDefaults]');
add('nodefaults-set', '\\chemlabset{liquidLevel1=90, liquidStyle1=Blood, noDefaults}\n\\tkzTestTube\n\\begin{scope}[shift={(3,0)}]\\tkzTestTube[glassType=beaker]\\end{scope}');
add('tube-tilt-120', '\\tkzTestTube[tiltAngle=120, liquidLevel1=50]');
add('shifted-scopes', '\\begin{scope}[shift={(0,0)}]\\tkzTestTube\\end{scope}\n\\begin{scope}[shift={(3,1)}]\\tkzTestTube[glassType=beaker]\\end{scope}\n\\begin{scope}[shift={(6,-1)}]\\tkzGraduatedCylinder\\end{scope}');
add('style-publication', '\\chemlabset{style=publication}\n\\tkzTestTube[glassType=beaker]\n\\begin{scope}[shift={(3,0)}]\\tkzGraduatedCylinder\\end{scope}');
add('style-presentation', '\\chemlabset{style=presentation}\n\\tkzTestTube[glassType=erlenmeyer]');
add('style-linewidth', '\\chemlabset{line width=1.2pt}\n\\tkzTestTube');
// the four widths one by one, as the Picture panel writes them: words, lengths and a bare number (pt)
add('style-widths', '\\chemlabset{outline width=thick, ellipse width=0.1cm, tube ellipse width=2pt, graduation width=semithick}\n\\tkzTestTube\n\\begin{scope}[shift={(3,0)}]\\tkzTestTube[glassType=beaker]\\end{scope}\n\\begin{scope}[shift={(6,0)}]\\tkzGraduatedCylinder\\end{scope}');
add('style-widths-after-style', '\\chemlabset{style=bold, outline line width=0.5pt, graduation width=3}\n\\tkzTestTube[glassType=erlenmeyer]\n\\begin{scope}[shift={(3,0)}]\\tkzGraduatedCylinder\\end{scope}');
// the flame: its size and four colours
add('flame-settings', '\\chemlabset{flame scale=1.5, flame outer color=red, flame outer end color=orange, flame inner color=blue, flame inner end color=white}\n\\tkzHeatTube\n\\begin{scope}[shift={(6,0)}]\\tkzBunsenBurnerGrill\\end{scope}');
add('flame-small', '\\chemlabset{flame scale=0.6}\n\\tkzHeatFlask[glassType=roundFlask]');
add('style-custom-liquid', '\\tkzTestTube[glassType=beaker, liquidLevel1=60, liquidStyle1=MyLiquid]', { env: 'MyLiquid/.style={fill=green!60!black,draw=none}' });
add('labels', '\\tkzTestTube[glassType=beaker]\n\\node at (0,-1.5) {Beaker};\n\\draw[->] (2,3) -- (0.6,2);\n\\node[right] at (2,3) {$\\mathrm{H_2O}$};');
// text is measured by the app's text engine (shared by every block), whose interword space is about 0.3pt narrower than
// cmr10's: two-word labels at the picture's edge make the page up to 3 px (0.9pt) narrower
add('labels-placement', '\\tkzTestTube[glassType=beaker]\n\\node[above] at (0,4) {above};\n\\node[below right] at (1,0) {below right};\n\\node[anchor=north east] at (-1,3) {NE};\n\\node[left=0.5cm] at (-1,1) {left};\n\\node[right, xshift=5pt, yshift=-3pt] at (1,2) {shifted};\n\\node[anchor=base] at (0,-1) {base, g};', { page: 3 });
add('labels-scaled', '\\tkzTestTube[glassType=erlenmeyer]\n\\node[right] at (1,3) {Flask};\n\\node[below] at (0,0) {$\\mathrm{CuSO_4}$};', { env: 'scale=0.6' });
add('setup-stand-tube-burner', '\\tkzStand\n\\begin{scope}[shift={(1.5,2)}]\\tkzTestTube[clamp]\\end{scope}\n\\begin{scope}[shift={(1.5,-1)}]\\tkzBunsenBurner\\end{scope}');
add('setup-reflux', '\\tkzRoundFlask[glassType=roundFlask, condenserBulbs, liquidLevel1=35]');
add('setup-crystallisation', '\\tkzCrystallizingDish\n\\begin{scope}[shift={(0,0.3)}]\\tkzInvertedTube\\end{scope}');
add('setup-rack', '\\tkzTestTubeRack');

const only = positional;
const run = only.length ? cases.filter((c) => only.some((o) => c.name.includes(o))) : cases;
if (!run.length) throw new Error('No case matches ' + only.join(', '));

// ---------------------------------------------------------------- pdflatex and Ghostscript
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diagramtex-chemlab-parity-'));
// \chemlabset may hold beyond its picture: each case is its own document, compiled in one run of a tiny driver
const tex = (c) => `\\PassOptionsToPackage{rgb}{xcolor}\n\\documentclass[tikz,border=${BORDER_PT}pt]{standalone}\n\\usepackage{tikz-chemlab}\n\\begin{document}\n${c.src}\n\\end{document}\n`;
const failed = [];
await Promise.all(Array.from({ length: 6 }, async (_x, w) => {
  for (let i = w; i < run.length; i += 6) {
    const c = run[i], base = `case-${String(i).padStart(3, '0')}`;
    fs.writeFileSync(path.join(dir, base + '.tex'), tex(c));
    try {
      await new Promise((ok, no) => {
        import('node:child_process').then(({ execFile }) => execFile('pdflatex', ['-interaction=nonstopmode', '-halt-on-error', base + '.tex'], { cwd: dir, timeout: 120000, maxBuffer: 1 << 24 }, (e, out) => (e ? no(Object.assign(e, { out })) : ok(out))));
      });
      execFileSync('gs', ['-q', '-dNOPAUSE', '-dBATCH', '-sDEVICE=png16m', `-r${DPI}`, '-dGraphicsAlphaBits=4', '-dTextAlphaBits=4', `-sOutputFile=${base}-tex.png`, base + '.pdf'], { cwd: dir });
      c.file = base;
    } catch (e) { failed.push(`${c.name}: pdflatex: ${String(e.out || e.message).split('\n').filter((l) => /^!/.test(l)).join(' ')}`); }
  }
}));

// ---------------------------------------------------------------- the app's drawing, at the same scale
await prepare();
const server = await serve(APP_DIR);
const b = await launchBrowser('chromium', `http://127.0.0.1:${server.port}/`);
const results = [];
try {
  await b.ev(`await TD.math.whenReady(); await document.fonts.ready; return 1;`);
  for (const c of run) {
    if (!c.file) continue;
    const ref = PNG.sync.read(fs.readFileSync(path.join(dir, c.file + '-tex.png')));
    const info = await b.page.evaluate(async ({ src, W, H, PX_CM, BORDER_PT }) => {
      const C = TD.chemlab, L = C.layout({ src }), s = PX_CM / TD.PX_PER_CM, bpx = BORDER_PT / TD.PT_PER_PX;
      document.querySelector('#clparity')?.remove();
      const host = document.createElement('div'); host.id = 'clparity';
      host.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:2147483647;background:#fff`;
      host.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="${L.bb.x - bpx} ${L.bb.y - bpx} ${W / s} ${H / s}" style="display:block;background:#fff">${C.markup(L, { export: true }, 'p_')}</svg>`;
      document.body.append(host);
      await document.fonts.ready;
      await Promise.all([...host.querySelectorAll('image')].map((im) => new Promise((r) => { const i = new Image(); i.onload = i.onerror = r; i.src = im.getAttribute('href'); })));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      // the page pdflatex makes: the picture's box and the border, at 80 px per cm
      return { w: (L.bb.w + 2 * bpx) * s, h: (L.bb.h + 2 * bpx) * s, warnings: L.warnings.map((x) => x.key) };
    }, { src: c.src, W: ref.width, H: ref.height, PX_CM, BORDER_PT });
    await b.page.setViewportSize({ width: Math.max(800, ref.width + 20), height: Math.max(600, ref.height + 20) });
    const shot = PNG.sync.read(await b.page.locator('#clparity svg').screenshot({ path: path.join(dir, c.file + '-app.png') }));
    results.push({ c, ref, app: shot, info });
  }
  await b.page.evaluate(() => document.querySelector('#clparity')?.remove());
} finally { await b.close(); server.close(); }

// ---------------------------------------------------------------- comparing
const at = (p, x, y) => (y * p.width + x) * 4;
const inked = (p, x, y) => { const i = at(p, x, y); return Math.min(p.data[i], p.data[i + 1], p.data[i + 2]) < 240; };
function solid(p, x, y) {
  const i = at(p, x, y);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= p.width || Y >= p.height) return false;
    const j = at(p, X, Y);
    if (Math.abs(p.data[i] - p.data[j]) > 8 || Math.abs(p.data[i + 1] - p.data[j + 1]) > 8 || Math.abs(p.data[i + 2] - p.data[j + 2]) > 8) return false;
  }
  return true;
}
// is pixel (x, y) of A found on B within RADIUS: ink for ink, and for a solid pixel its colour too
function found(A, B, x, y) {
  const i = at(A, x, y), col = solid(A, x, y);
  let ink = false;
  for (let dy = -RADIUS; dy <= RADIUS; dy++) for (let dx = -RADIUS; dx <= RADIUS; dx++) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= B.width || Y >= B.height || !inked(B, X, Y)) continue;
    if (!col) return true;
    ink = true;
    const j = at(B, X, Y);
    if (Math.abs(A.data[i] - B.data[j]) <= COLOUR && Math.abs(A.data[i + 1] - B.data[j + 1]) <= COLOUR && Math.abs(A.data[i + 2] - B.data[j + 2]) <= COLOUR) return true;
  }
  return col ? false : ink;
}
const report = [];
for (const { c, ref, app, info } of results) {
  const W = Math.min(ref.width, app.width), H = Math.min(ref.height, app.height), diff = new PNG({ width: W, height: H });
  let union = 0, texOnly = 0, appOnly = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const o = (y * W + x) * 4, a = inked(ref, x, y), p = inked(app, x, y);
    diff.data[o + 3] = 255;
    if (!a && !p) { diff.data[o] = diff.data[o + 1] = diff.data[o + 2] = 255; continue; }
    union++;
    const ta = a && !found(ref, app, x, y) ? 1 : 0, pa = p && !found(app, ref, x, y) ? 1 : 0;
    texOnly += ta; appOnly += pa;
    if (ta && pa) { diff.data[o] = 150; diff.data[o + 1] = 0; diff.data[o + 2] = 180; }
    else if (ta) { diff.data[o] = 220; diff.data[o + 1] = 30; diff.data[o + 2] = 30; }
    else if (pa) { diff.data[o] = 30; diff.data[o + 1] = 90; diff.data[o + 2] = 230; }
    else { const i = at(ref, x, y), g = Math.round(200 + (ref.data[i] + ref.data[i + 1] + ref.data[i + 2]) / 3 * 55 / 255); diff.data[o] = diff.data[o + 1] = diff.data[o + 2] = g; }
  }
  fs.writeFileSync(path.join(dir, c.file + '-diff.png'), PNG.sync.write(diff));
  const off = Math.max(Math.abs(info.w - ref.width), Math.abs(info.h - ref.height));
  const score = (texOnly + appOnly) / Math.max(1, union), errors = [];
  if (!c.random && score > c.limit) errors.push(`${(score * 100).toFixed(1)}% unmatched (limit ${(c.limit * 100).toFixed(0)}%)`);
  // scattered contents outside a glass make a page as big as where they fell
  if (off > c.page && !c.random) errors.push(`page ${info.w.toFixed(1)}×${info.h.toFixed(1)} px, pdflatex ${ref.width}×${ref.height}`);
  if (info.warnings.length) errors.push('app warnings: ' + info.warnings.join(', '));
  report.push({ name: c.name, src: c.src, random: c.random, score, texOnly, appOnly, union, size: [ref.width, ref.height], errors, file: c.file });
}
report.sort((a, b) => b.score - a.score);
const bad = report.filter((r) => r.errors.length);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
fs.writeFileSync(path.join(dir, 'report.json'), JSON.stringify({ thresholds: { radius: RADIUS, colour: COLOUR, limit: LIMIT, pxPerCm: PX_CM }, failed, report }, null, 2));
fs.writeFileSync(path.join(dir, 'report.html'), `<!doctype html><meta charset="utf-8"><title>tikz-chemlab parity</title>
<style>body{font:14px system-ui;margin:24px;color:#222}section{border-top:1px solid #ddd;padding:12px 0}h2{font-size:15px;margin:0 0 6px}.fail h2{color:#b00}
.row{display:flex;gap:8px;align-items:flex-start}.row figure{margin:0}.row img{max-width:31vw;max-height:520px;border:1px solid #ccc;background:#fff}figcaption{font-size:12px;color:#666}pre{font-size:12px;background:#f6f6f6;padding:6px;white-space:pre-wrap}</style>
<h1>tikz-chemlab parity: ${report.length - bad.length}/${report.length} within their limits</h1>
<p>${PX_CM} px/cm; a pixel matches when the other side has a colour within ${COLOUR} per channel within ${RADIUS} px. Diff: red only in pdflatex, blue only in the app, purple both. Random contents are not scored.</p>
${failed.map((f) => `<p class="fail">${esc(f)}</p>`).join('')}
${report.map((r) => `<section class="${r.errors.length ? 'fail' : ''}"><h2>${esc(r.name)} · ${(r.score * 100).toFixed(2)}%${r.random ? ' · random, not scored' : ''}${r.errors.length ? ' · ' + esc(r.errors.join('; ')) : ''}</h2><pre>${esc(r.src)}</pre>
<div class="row"><figure><img src="${r.file}-tex.png"><figcaption>pdflatex</figcaption></figure><figure><img src="${r.file}-app.png"><figcaption>app</figcaption></figure><figure><img src="${r.file}-diff.png"><figcaption>diff</figcaption></figure></div></section>`).join('')}`);
console.log(`${report.length - bad.length}/${report.length} pictures match pdflatex within their limits (${(LIMIT * 100).toFixed(0)}% unless noted)${failed.length ? `; ${failed.length} did not compile` : ''}`);
for (const r of bad) console.log(`✗ ${r.name}: ${r.errors.join('; ')}`);
for (const f of failed) console.log('✗ ' + f);
console.log('Parity report: ' + path.join(dir, 'report.html'));
if ((bad.length || failed.length) && !args.includes('--report-only')) process.exitCode = 1;
