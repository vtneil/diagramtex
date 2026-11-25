import { t as uiText, message, caption, onLocale, type Message } from '../i18n';
import FormPanel from '../ui/FormPanel.svelte';
import { renderView, isViewUpdating } from '../ui/render-view.svelte';
import { row, switchRow, section, txPlaceholder } from '../ui/forms';
import type { FormRow, FormSection, Control } from '../ui/forms';
import { note } from '../ui/editor-fields';
import CleditorFrame from '../ui/editors/CleditorFrame.svelte';
import { mountFrame } from '../ui/mount-frame';
import { runtime as TD } from '../runtime';
import { patchSvg } from '../ui/svg-patch';
import { editorPalette, fitMini } from './editor-palette.svelte';
import { openEditorMenu, closeEditorMenu, menuRow, type MenuEntry, type IconName } from './editor-menu';
import { editorKeys } from './editor-keys';
import { paletteDrag } from './palette-drag';
import { wireCode, copyCode } from './editor-code';
import { showCodeNotes, stageTip } from '../ui/editor-notes';
import { editorStage, fitView } from './editor-stage';
import { marquee, marqueeSvg, marqueeTakes, boxShape } from './marquee';
// Chemistry Laboratory editor: the overlay that opens on a Chemistry Laboratory block (tikz-chemlab). A palette of apparatus (glassware,
// set-ups, equipment) and of labels and leader lines; the picture drawn as pdfLaTeX draws it, on a grid in the
// picture's own units, where apparatus is placed, selected and moved; the selected one's settings (glass, liquids,
// fittings, burner …) on the right; and the code under them, live both ways. Only what is edited is rewritten: a moved
// call gets a scope with a shift (or has the shift its scope leads with rewritten), a changed one its options, and
// everything else stays as written. tikz-chemlab moves each \tkzTitration, \tkzHeatFlask and \tkzRoundFlask
// sideways by what the ones before it in the same group drew, so after any edit the rest are shifted back to where
// they were: nothing moves unless it was moved.
// TD.chemlabEditor.open(block, onDone): block { src }; onDone({ src }) on Done.
(function () {
  const C = TD.chemlab;
  const { esc, r2 } = TD.util;
  const $ = (s: any, r: any = document) => r.querySelector(s);
  const isMac = /Mac|iP(hone|ad|od)/.test(navigator.platform);
  const PX = TD.PX_PER_CM, GRID = 0.25;
  const CMD = isMac ? '⌘' : 'Ctrl+';
  type Pt = [number, number];

  // ---------------------------------------------------------------- DOM
  const root = document.createElement('div');
  root.id = 'clModal';
  root.className = 'modal';
  root.hidden = true;
  mountFrame(root, CleditorFrame);
  document.body.appendChild(root);
  const svg = $('.cl-svg', root), stage = $('.cz-stage', root);
  // categories fold, as the circuit editor's do: the apparatus, set-ups, equipment and labels open; the parts, fittings
  // and contents folded until opened (remembered for the next time)
  const OPEN_KEY = 'diagramtex.cl.open';
  const lsGet = (k: string, d: any) => { try { return JSON.parse(localStorage.getItem(k) as string) || d; } catch { return d; } };
  const lsSet = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private window */ } };
  const isOpen = (id: string) => { const o = lsGet(OPEN_KEY, {}); return id in o ? !!o[id] : !['parts', 'fittings', 'contents'].includes(id); };
  const pal = editorPalette(root, { placeholder: message('editor.commonA.search', 'Search'), searchLabel: message('editor.commonA.searchPalette', 'Search the palette'), label: message('editor.cl.apparatus', 'Apparatus'), listClass: 'cl-list',
    collapsible: true, isOpen, ontoggle: (id, open) => { if (isOpen(id) !== open) lsSet(OPEN_KEY, { ...lsGet(OPEN_KEY, {}), [id]: open }); }, onpick: (k) => pick(k) });
  const list = pal.list, search = pal.search;
  const props = $('.cz-props', root), count = $('.cz-count', root), codeTa = $('.cz-code textarea', root), codeMsg = $('.cz-msg', root), tip = $('.cz-tip', root), stageNote = stageTip(tip);

  // ---------------------------------------------------------------- names
  const GLASS_NAME = (g: string) => (({
    tube: () => uiText('editor.cl.glass.tube', 'Test tube'), roundFlask: () => uiText('editor.cl.glass.roundFlask', 'Round flask'), beaker: () => uiText('editor.cl.glass.beaker', 'Beaker'),
    erlenmeyer: () => uiText('editor.cl.glass.erlenmeyer', 'Erlenmeyer flask'), reagentBottle: () => uiText('editor.cl.glass.reagentBottle', 'Reagent bottle'),
    volumetricFlask: () => uiText('editor.cl.glass.volumetricFlask', 'Volumetric flask'), watchGlass: () => uiText('editor.cl.glass.watchGlass', 'Watch glass'),
  }) as Record<string, () => string>)[g]?.() ?? g;
  const CMD_NAME = (c: string) => (({
    tkzTestTube: () => uiText('editor.cl.glass.tube', 'Test tube'), tkzHeatTube: () => uiText('editor.cl.cmd.heatTube', 'Heated test tube'), tkzHeatFlask: () => uiText('editor.cl.cmd.heatFlask', 'Heated flask'),
    tkzRoundFlask: () => uiText('editor.cl.cmd.roundFlask', 'Flask set-up'), tkzFunnel: () => uiText('editor.cl.cmd.funnel', 'Funnel'), tkzGraduatedCylinder: () => uiText('editor.cl.cmd.cylinder', 'Graduated cylinder'),
    tkzPipette: () => uiText('editor.cl.cmd.pipette', 'Pipette'), tkzLargePipette: () => uiText('editor.cl.cmd.largePipette', 'Large pipette'), tkzTitration: () => uiText('editor.cl.cmd.titration', 'Titration'),
    tkzDistillation: () => uiText('editor.cl.cmd.distillation', 'Distillation'), tkzSeparatoryFunnel: () => uiText('editor.cl.cmd.separatory', 'Separatory funnel'), tkzStand: () => uiText('editor.cl.cmd.stand', 'Stand'),
    tkzColumn: () => uiText('editor.cl.cmd.column', 'Fractionating column'), tkzBunsenBurner: () => uiText('editor.cl.cmd.burner', 'Bunsen burner'), tkzThermometer: () => uiText('editor.cl.cmd.thermometer', 'Thermometer'),
    tkzCrystallizingDish: () => uiText('editor.cl.cmd.dish', 'Crystallising dish'), tkzHeaterRoundFlask: () => uiText('editor.cl.cmd.hotplate', 'Hot plate'),
    tkzGraduatedCylinderSmall: () => uiText('editor.cl.cmd.cylinderSmall', 'Small graduated cylinder'), tkzGraduatedCylinderWithLiquid: () => uiText('editor.cl.cmd.cylinderLiquid', 'Graduated cylinder with liquid'),
    tkzInvertedTube: () => uiText('editor.cl.cmd.invertedTube', 'Inverted tube'), tkzRoundFlaskReflux: () => uiText('editor.cl.cmd.refluxFlask', 'Reflux flask'),
    tkzDistillationFractionated: () => uiText('editor.cl.cmd.fractional', 'Fractional distillation'), tkzCondenser: () => uiText('editor.cl.cmd.condenser', 'Liebig condenser'),
    tkzCondenserBulbs: () => uiText('editor.cl.cmd.ballCondenser', 'Ball condenser'), tkzHeater: () => uiText('editor.cl.cmd.heater', 'Heating bath'),
    tkzTitrationStand: () => uiText('editor.cl.cmd.stirrer', 'Magnetic stirrer'), tkzTitrationPHMeter: () => uiText('editor.cl.cmd.phMeter', 'pH meter'),
    tkzTitrationStirBar: () => uiText('editor.cl.cmd.stirBar', 'Stir bar'), tkzTestTubeRack: () => uiText('editor.cl.cmd.rack', 'Test tube rack'), tkzDrop: () => uiText('editor.cl.cmd.drop', 'Drop'),
    tkzBunsenBurnerGrill: () => uiText('editor.cl.cmd.burnerGauze', 'Burner with gauze'), tkzFlameGrill: () => uiText('editor.cl.cmd.flame', 'Flame'),
    tkzTestTubeBody: () => uiText('editor.cl.cmd.tubeBody', 'Test tube body'), tkzRoundFlaskSimple: () => uiText('editor.cl.cmd.flaskBody', 'Round flask body'),
    tkzRoundFlaskGrill: () => uiText('editor.cl.cmd.flaskLow', 'Round flask, set low'), tkzBeakerBody: () => uiText('editor.cl.cmd.beakerBody', 'Beaker body'),
    tkzBeakerRim: () => uiText('editor.cl.cmd.beakerRim', 'Beaker rim and scale'), tkzErlenmeyerBody: () => uiText('editor.cl.cmd.erlenBody', 'Erlenmeyer flask body'),
    tkzReagentBottleBody: () => uiText('editor.cl.cmd.bottleBody', 'Reagent bottle body'), tkzVolumetricFlask: () => uiText('editor.cl.cmd.volBody', 'Volumetric flask body'),
    tkzWatchGlassBody: () => uiText('editor.cl.cmd.watchBody', 'Watch glass body'), tkzWatchGlassBase: () => uiText('editor.cl.cmd.watchBase', 'Watch glass stand'),
    tkzFunnelBody: () => uiText('editor.cl.cmd.funnelBody', 'Funnel body'), tkzFunnelOutline: () => uiText('editor.cl.cmd.funnelOutline', 'Funnel outline'),
    tkzSeparatoryFunnelBody: () => uiText('editor.cl.cmd.sepBody', 'Separatory funnel body'), tkzStopper: () => uiText('editor.cl.cmd.sepStopper', 'Separatory funnel stopper'),
    tkzTapOpen: () => uiText('editor.cl.cmd.tapOpen', 'Tap, open'), tkzTapClosed: () => uiText('editor.cl.cmd.tapClosed', 'Tap, closed'),
    tkzBuretteBody: () => uiText('editor.cl.cmd.buretteBody', 'Burette body'), tkzBuretteStopcock: () => uiText('editor.cl.cmd.buretteTap', 'Burette stopcock'),
    tkzBuretteGraduation: () => uiText('editor.cl.cmd.buretteScale', 'Burette scale'), tkzPipetteBody: () => uiText('editor.cl.cmd.pipetteBody', 'Pipette body'),
    tkzGraduatedCylinderBody: () => uiText('editor.cl.cmd.cylBody', 'Cylinder body'), tkzGraduatedCylinderRim: () => uiText('editor.cl.cmd.cylRim', 'Cylinder lip'),
    tkzGraduatedCylinderBase: () => uiText('editor.cl.cmd.cylBase', 'Cylinder base'), tkzGraduatedCylinderGraduation: () => uiText('editor.cl.cmd.cylScale', 'Cylinder scale'),
    tkzCondenserStem: () => uiText('editor.cl.cmd.condStem', 'Ball condenser stem'), tkzCondenserBody: () => uiText('editor.cl.cmd.condBody', 'Condenser jacket'),
    tkzTestTubeStopper: () => FIT_NAME('stopper'), tkzTestTubeClamp: () => uiText('editor.cl.clamp', 'Clamp'), tkzTestTubeStraightTube: () => FIT_NAME('straightTube'),
    tkzTestTubeElbowTube: () => FIT_NAME('elbowTube'), tkzTestTubeUTube: () => FIT_NAME('uTube'), tkzTestTubeUTubeLong: () => FIT_NAME('uTubeLong'), tkzCurvedTube: () => FIT_NAME('curvedTube'),
    tkzCurvedTubeShort: () => FIT_NAME('curvedTubeShort'), tkzTestTubeDoubleTube: () => FIT_NAME('doubleTube'),
    tkzCurvedTubeShortDoubleTube: () => uiText('editor.cl.cmd.curvedShortDouble', 'Delivery tube of the two tubes'),
    tkzNails: () => uiText('editor.cl.cmd.nail', 'One iron filing'), tkzCopper: () => uiText('editor.cl.cmd.copper', 'One copper turning'), tkzZinc: () => uiText('editor.cl.cmd.zinc', 'One zinc granule'),
  }) as Record<string, () => string>)[c]?.() ?? (C.SUBST[c] ? SUBST_NAME(c) : `\\${c}`);
  const LIQUID_NAME = (s: string) => (({
    liquidStyle1: () => uiText('editor.cl.liquid.cyan', 'Cyan'), liquidStyle2: () => uiText('editor.cl.liquid.yellow', 'Yellow'), liquidStyle3: () => uiText('editor.cl.liquid.magenta', 'Magenta'),
    Champagne: () => uiText('editor.cl.liquid.champagne', 'Champagne'), Blood: () => uiText('editor.cl.liquid.blood', 'Blood'), Cobalt: () => uiText('editor.cl.liquid.cobalt', 'Cobalt'),
    Oil: () => uiText('editor.cl.liquid.oil', 'Oil'), Vinegar: () => uiText('editor.cl.liquid.vinegar', 'Vinegar'), AqueousPhase: () => uiText('editor.cl.liquid.aqueous', 'Aqueous phase'),
    OrganicPhase: () => uiText('editor.cl.liquid.organic', 'Organic phase'), Diffusion: () => uiText('editor.cl.liquid.diffusion', 'Diffusion'), BlueDiffusion: () => uiText('editor.cl.liquid.blueDiffusion', 'Blue diffusion'),
    MixtureDiffusion2: () => uiText('editor.cl.liquid.redDiffusion', 'Red diffusion'), YellowStripes: () => uiText('editor.cl.liquid.stripes', 'Yellow stripes'), Ball3D: () => uiText('editor.cl.liquid.ball', 'Shaded'),
  }) as Record<string, () => string>)[s]?.() ?? s;
  const SUBST_NAME = (s: string) => (({
    tkzChampagneBubbles: () => uiText('editor.cl.subst.champagne', 'Champagne bubbles'), tkzBubbles: () => uiText('editor.cl.subst.bubbles', 'Bubbles'), tkzBubblesThreeD: () => uiText('editor.cl.subst.dots', 'Coloured dots'),
    tkzBalls: () => uiText('editor.cl.subst.balls', 'Beads'), tkzFilaments: () => uiText('editor.cl.subst.filaments', 'Filaments'), tkzCopperTurnings: () => uiText('editor.cl.subst.copper', 'Copper turnings'),
    tkzIronNail: () => uiText('editor.cl.subst.iron', 'Iron filings'), tkzZincGranules: () => uiText('editor.cl.subst.zinc', 'Zinc granules'),
  }) as Record<string, () => string>)[s]?.() ?? `\\${s}`;
  const FIT_NAME = (k: string) => (({
    none: () => uiText('editor.cl.fit.none', 'None'), stopper: () => uiText('editor.cl.fit.stopper', 'Stopper'), straightTube: () => uiText('editor.cl.fit.straight', 'Straight tube'),
    elbowTube: () => uiText('editor.cl.fit.elbow', 'Bent tube'), uTube: () => uiText('editor.cl.fit.uTube', 'U-tube'), uTubeLong: () => uiText('editor.cl.fit.uTubeLong', 'Long U-tube'),
    curvedTube: () => uiText('editor.cl.fit.curved', 'Delivery tube'), curvedTubeShort: () => uiText('editor.cl.fit.curvedShort', 'Short delivery tube'), doubleTube: () => uiText('editor.cl.fit.double', 'Two tubes'),
    condenserBulbs: () => uiText('editor.cl.fit.condenser', 'Reflux condenser'),
  }) as Record<string, () => string>)[k]?.() ?? k;
  // the order tikz-chemlab tries the fittings in (the first one that is on is drawn)
  const FIT_ORDER = ['straightTube', 'elbowTube', 'uTube', 'uTubeLong', 'curvedTube', 'curvedTubeShort', 'stopper', 'doubleTube', 'condenserBulbs'];

  // ---------------------------------------------------------------- palette
  // a macro placed as it is: its key is its name
  // (\tkzFilaments and \tkzBubblesThreeD take a colour, red as the panel gives them)
  const one = (cmds: string[]): [string, () => string, string][] => cmds.map((c) => [c, () => CMD_NAME(c), `\\${c}${C.SUBST[c]?.colour ? '{red}' : ''}`]);
  // [key, name, code placed (\node and \draw for the annotations)]
  const PAL: [string, () => string, [string, () => string, string][]][] = [
    ['glass', () => uiText('editor.cl.cat.glass', 'Glassware'), [
      ['tube', () => GLASS_NAME('tube'), '\\tkzTestTube'],
      ['flask', () => GLASS_NAME('roundFlask'), '\\tkzTestTube[glassType=roundFlask]'],
      ['beaker', () => GLASS_NAME('beaker'), '\\tkzTestTube[glassType=beaker]'],
      ['erlen', () => GLASS_NAME('erlenmeyer'), '\\tkzTestTube[glassType=erlenmeyer]'],
      ['bottle', () => GLASS_NAME('reagentBottle'), '\\tkzTestTube[glassType=reagentBottle]'],
      ['vol', () => GLASS_NAME('volumetricFlask'), '\\tkzTestTube[glassType=volumetricFlask]'],
      ['watch', () => GLASS_NAME('watchGlass'), '\\tkzTestTube[glassType=watchGlass]'],
      ['cyl', () => CMD_NAME('tkzGraduatedCylinder'), '\\tkzGraduatedCylinder'],
      ['funnel', () => CMD_NAME('tkzFunnel'), '\\tkzFunnel'],
      ['sep', () => CMD_NAME('tkzSeparatoryFunnel'), '\\tkzSeparatoryFunnel'],
      ['pip', () => CMD_NAME('tkzPipette'), '\\tkzPipette'],
      ...one(['tkzGraduatedCylinderSmall', 'tkzGraduatedCylinderWithLiquid', 'tkzInvertedTube', 'tkzRoundFlaskReflux']),
      // no \tkzLargePipette: tikz-chemlab's macro is an unfinished port of pst-labo's bigpipette that draws one wall
      // 23cm tall and nothing else (pdflatex does the same). It is still read, drawn and edited when written by hand.
    ]],
    ['setup', () => uiText('editor.cl.cat.setups', 'Set-ups'), [
      ['heattube', () => CMD_NAME('tkzHeatTube'), '\\tkzHeatTube'],
      ['heatflask', () => CMD_NAME('tkzHeatFlask'), '\\tkzHeatFlask[glassType=roundFlask, stopper]'],
      ['gas', () => uiText('editor.cl.pal.gas', 'Gas collection'), '\\tkzHeatFlask[glassType=roundFlask, curvedTube, gasCollection]'],
      ['reflux', () => uiText('editor.cl.pal.reflux', 'Reflux'), '\\tkzRoundFlask[glassType=roundFlask, condenserBulbs]'],
      ['titration', () => CMD_NAME('tkzTitration'), '\\tkzTitration[glassType=erlenmeyer]'],
      ['distil', () => CMD_NAME('tkzDistillation'), '\\tkzDistillation'],
      ...one(['tkzDistillationFractionated']),
    ]],
    ['kit', () => uiText('editor.cl.cat.equipment', 'Equipment'), [
      ['burner', () => CMD_NAME('tkzBunsenBurner'), '\\tkzBunsenBurner'],
      ['stand', () => CMD_NAME('tkzStand'), '\\tkzStand'],
      ['hot', () => CMD_NAME('tkzHeaterRoundFlask'), '\\tkzHeaterRoundFlask'],
      ['dish', () => CMD_NAME('tkzCrystallizingDish'), '\\tkzCrystallizingDish'],
      ['thermo', () => CMD_NAME('tkzThermometer'), '\\tkzThermometer'],
      ['column', () => CMD_NAME('tkzColumn'), '\\tkzColumn'],
      ...one(['tkzCondenser', 'tkzCondenserBulbs', 'tkzHeater', 'tkzTitrationStand', 'tkzTitrationPHMeter', 'tkzTitrationStirBar', 'tkzTestTubeRack', 'tkzDrop', 'tkzBunsenBurnerGrill', 'tkzFlameGrill']),
    ]],
    ['note', () => uiText('editor.cl.cat.notes', 'Labels'), [
      ['label', () => uiText('editor.cl.pal.label', 'Label'), ''],
      ['arrow', () => uiText('editor.cl.pal.arrow', 'Leader line'), ''],
    ]],
    // each piece the package builds the others from, drawn on its own (folded until opened)
    ['parts', () => uiText('editor.cl.cat.parts', 'Parts'), one(['tkzTestTubeBody', 'tkzRoundFlaskSimple', 'tkzRoundFlaskGrill', 'tkzBeakerBody', 'tkzBeakerRim', 'tkzErlenmeyerBody',
      'tkzReagentBottleBody', 'tkzVolumetricFlask', 'tkzWatchGlassBody', 'tkzWatchGlassBase', 'tkzFunnelBody', 'tkzFunnelOutline', 'tkzSeparatoryFunnelBody', 'tkzStopper', 'tkzTapOpen',
      'tkzTapClosed', 'tkzBuretteBody', 'tkzBuretteStopcock', 'tkzBuretteGraduation', 'tkzPipetteBody', 'tkzGraduatedCylinderBody', 'tkzGraduatedCylinderRim', 'tkzGraduatedCylinderBase',
      'tkzGraduatedCylinderGraduation', 'tkzCondenserStem', 'tkzCondenserBody'])],
    ['fittings', () => uiText('editor.cl.cat.fittings', 'Fittings'), one(['tkzTestTubeStopper', 'tkzTestTubeClamp', 'tkzTestTubeStraightTube', 'tkzTestTubeElbowTube', 'tkzTestTubeUTube',
      'tkzTestTubeUTubeLong', 'tkzCurvedTube', 'tkzCurvedTubeShort', 'tkzTestTubeDoubleTube', 'tkzCurvedTubeShortDoubleTube'])],
    // what the panel puts in a glass, scattered round the origin as the package does; and one piece of each solid
    ['contents', () => uiText('editor.cl.cat.contents', 'Contents'), one([...Object.keys(C.SUBST), 'tkzNails', 'tkzCopper', 'tkzZinc'])],
  ];
  const ITEM: Record<string, { name: () => string; code: string }> = {};
  for (const [, , its] of PAL) for (const [k, name, code] of its) ITEM[k] = { name, code };
  const NOTE_SVG: Record<string, string> = {
    label: '<svg viewBox="0 0 44 30" aria-hidden="true"><text x="22" y="20" text-anchor="middle" font-size="15" font-family="serif" fill="currentColor">Aa</text></svg>',
    arrow: '<svg viewBox="0 0 44 30" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M6 24L36 8M30 8.4l6-.4-2.6 5.4"/></svg>',
  };
  // apparatus is drawn at one scale, so a test tube stays smaller than a titration; the tallest stop at 104px
  const MINI_SCALE = 0.36;
  const miniCache = new Map<string, string>();
  function mini(k: string) {
    if (NOTE_SVG[k]) return NOTE_SVG[k];
    // a line that would come out under 0.75px at the palette's scale is drawn as a hairline
    if (!miniCache.has(k)) miniCache.set(k, C.mini(ITEM[k].code, k, 0.75 / MINI_SCALE));
    return miniCache.get(k)!;
  }
  // drawings at most 42px wide, so the narrowest paper (58px, three columns) keeps 8px each side, as above and below.
  // One scale for all, except that a piece under 30px across at it (a drop, a stir bar, a tap) grows to 30px
  function topOf(k: string) {
    if (NOTE_SVG[k]) return 1.2;
    const m = /viewBox="[^ ]+ [^ ]+ ([\d.]+) ([\d.]+)"/.exec(mini(k)), big = m ? Math.max(+m[1], +m[2]) : 0;
    return big > 0 ? Math.max(MINI_SCALE, 30 / big) : MINI_SCALE;
  }
  function buildPalette() {
    pal.render(PAL.map(([id, title, its]) => ({
      id, title: title(),
      items: its.map(([k, name, code]) => ({ id: k, label: name(), title: code ? `${name()} · ${code}` : name(), keywords: `${name()} ${code} ${k}`, svg: fitMini(mini(k), 42, 104, topOf(k)), attrs: { 'data-cl': k } })),
    })), { armed: E?.arm ?? null });
  }
  // click: arm it for placing; drag it onto the grid to place it there
  paletteDrag(list, {
    selector: '[data-cl]',
    item: (b) => b.dataset.cl!,
    keyboard: true,
    ready: () => !!E,
    pick,
    move: (d, e) => { E.hover = overStage(e) ? { at: toLocal(e, !e.altKey) } : null; E.ghost = d.k; draw(); },
    drop: (d, e) => {
      E.ghost = null;
      if (overStage(e)) place(d.k, toLocal(e, !e.altKey));
      E.hover = null; draw();
    },
  });
  function pick(k: string) {
    if (!E || !ITEM[k]) return;
    E.arm = E.arm === k ? null : k;
    buildPalette(); draw();
    setTip(!E.arm ? '' : k === 'arrow' ? uiText('editor.cl.tipArrow', 'Leader line: drag from the label to the apparatus. Esc when done.')
      : uiText('editor.cl.tipPlace', '{name}: click the grid where its base goes. Esc when done.', { name: ITEM[k].name() }));
  }
  function setTip(t: string) { stageNote.set(t); }

  // ---------------------------------------------------------------- state
  // { src, M (parsed), sel (item index) | null, multi (several), arm (palette key), view { k, ox, oy }, undo, redo, pending,
  //   start, done, drag, hover, ghost, codeAt, codeTimer }
  let E: any = null, lastDown = { t: 0, x: 0, y: 0 };
  let stopLocale: (() => void) | null = null;
  const snapshot = () => E.src;
  const { begin, commit, undo, redo } = TD.editorSession.history({ state: () => E, snapshot, restore: (src) => { setSrc(src); clampSel(); draw(); renderProps(); }, updateTools: () => updateTools(), changed: () => session.changed() });
  function setSrc(src: string) { E.src = src; E.M = C.parse(src); }
  // the model written back (only the items marked dirty change) and read again
  function flush() { setSrc(C.write(E.M)); }
  const L = () => C.layout({ src: E.src });
  const items = (): any[] => E.M.items;
  const OBJ = new Set(['app', 'scope', 'label', 'line']);
  const isObj = (it: any) => !!it && OBJ.has(it.k);
  const objIds = () => items().map((it, i) => (isObj(it) ? i : -1)).filter((i) => i >= 0);
  const selList = (): number[] => (E.multi ? E.multi.slice() : E.sel != null ? [E.sel] : []);
  function setSel(ids: number[]) {
    ids = [...new Set(ids)].sort((a, b) => a - b);
    if (ids.length > 1) { E.sel = null; E.multi = ids; } else E.sel = ids.length ? ids[0] : null;
  }
  function clampSel() {
    if (E.multi) { const m = E.multi.filter((i: number) => isObj(items()[i])); if (m.length > 1) E.multi = m; else E.sel = m.length ? m[0] : null; }
    if (E.sel != null && !isObj(items()[E.sel])) E.sel = null;
  }
  const rnd = (v: number) => Math.round(v * 1000) / 1000;
  const snapN = (n: number, on: boolean) => (on ? Math.round(n / GRID) * GRID : rnd(n));

  // ---------------------------------------------------------------- keeping places
  // where each item is drawn from (picture cm): a call's origin, a label's point, a line's first point
  const originsNow = (): (Pt | null)[] => L().origins.map((m: number[] | null) => (m ? [m[4], m[5]] : null));
  // a distance in picture cm → the picture's own units (its scale undone)
  function localD(d: Pt): Pt { const m = L().pm, iv = C.inv([m[0], m[1], m[2], m[3], 0, 0]); return C.ap(iv, d[0], d[1]); }
  function cmD(d: Pt): Pt { const m = L().pm; return [m[0] * d[0] + m[2] * d[1], m[1] * d[0] + m[3] * d[1]]; }
  // move an item by d (the picture's units): a call or a scope by the shift it leads with, a label by its point, a line by all of its
  function shiftItem(it: any, d: Pt) {
    if (it.k === 'app' || it.k === 'scope') { const a = it.at || [0, 0]; it.at = [rnd(a[0] + d[0]), rnd(a[1] + d[1])]; }
    else if (it.k === 'label') it.at = [rnd(it.at[0] + d[0]), rnd(it.at[1] + d[1])];
    else if (it.k === 'line') it.pts = it.pts.map((p: Pt) => [rnd(p[0] + d[0]), rnd(p[1] + d[1])]);
    else return;
    it.dirty = true;
  }
  // after an edit, each item with a target is shifted back onto it, first to last, until all are where they should be
  function settle(targets: Map<number, Pt>) {
    for (let n = 0; n < 3 * items().length + 3; n++) {
      const o = originsNow();
      let moved = false;
      for (const [i, t] of targets) {
        const now = o[i];
        if (!now || !items()[i]) continue;
        const d: Pt = [t[0] - now[0], t[1] - now[1]];
        if (Math.hypot(d[0], d[1]) < 2e-3) continue;
        shiftItem(items()[i], localD(d)); flush(); moved = true; break;
      }
      if (!moved) return;
    }
  }
  // change the items (add, remove, reorder, move, set options); the rest stay where they were drawn. In `mutate`, an
  // item may carry _t (where a new one goes, picture cm) or _dv (how far a moved one went, picture cm).
  function arrange(mutate: () => void) {
    const o = originsNow();
    items().forEach((it, i) => { it._k = i; });
    mutate();
    const targets = new Map<number, Pt>();
    items().forEach((it, n) => {
      const was = it._k != null ? o[it._k] : null;
      const t: Pt | null = it._t ? it._t : was ? [was[0] + (it._dv ? it._dv[0] : 0), was[1] + (it._dv ? it._dv[1] : 0)] : null;
      if (t) targets.set(n, t);
    });
    flush();
    settle(targets);
  }
  function edit(mutate: () => void) { begin(); arrange(mutate); commit(); clampSel(); draw(); renderProps(); }
  // a new item's text, its lead the one before it uses
  function lead(at: number) { const it = items()[at] || items()[at - 1]; return it ? it.lead.replace(/^[^\n]*/, '') || '\n  ' : '\n  '; }
  function insert(at: number, text: string, target: Pt | null) {
    const it = C.item(text);
    if (!it) return null;
    it.lead = lead(at);
    if (target) it._t = target;
    items().splice(at, 0, it);
    return it;
  }

  // ---------------------------------------------------------------- placing
  const fmt = (v: number) => C.num(v);
  function place(k: string, at: Pt) {
    const it = ITEM[k];
    if (!it) return;
    const pos = items().length, target = localToCm(at);
    if (k === 'label') {
      edit(() => insert(pos, `\\node at (${fmt(at[0])},${fmt(at[1])}) {Label};`, null));
      E.sel = pos; E.arm = null; buildPalette(); setTip(''); draw(); renderProps();
      const f = $('[data-lt]', props); if (f) { f.focus(); f.select(); }
      return;
    }
    if (k === 'arrow') return;
    edit(() => insert(pos, `\\begin{scope}[shift={(${fmt(at[0])},${fmt(at[1])})}]\n  ${it.code}\n\\end{scope}`.replace(/\n/g, lead(pos)), target));
    E.sel = pos; draw(); renderProps();
  }

  // ---------------------------------------------------------------- geometry
  const { rect, overStage, pos } = editorStage(svg, stage, { view: () => E?.view, zoom: [6, 400], redraw: () => draw() });
  const kk = () => E.view.k / PX;
  // picture px (y down) ↔ the stage
  const scr = (X: number, Y: number): Pt => [E.view.ox + X * kk(), E.view.oy + Y * kk()];
  const fromScr = (sx: number, sy: number): Pt => [(sx - E.view.ox) / kk(), (sy - E.view.oy) / kk()];
  // the picture's own units (y up) ↔ picture cm and px
  const localToCm = (p: Pt): Pt => C.ap(L().pm, p[0], p[1]);
  const localToScr = (p: Pt): Pt => { const c = localToCm(p); return scr(c[0] * PX, -c[1] * PX); };
  function toLocal(e: any, snapOn = true): Pt {
    const [sx, sy] = pos(e), [X, Y] = fromScr(sx, sy), q = C.ap(C.inv(L().pm), X / PX, -Y / PX);
    return [snapN(q[0], snapOn), snapN(q[1], snapOn)];
  }
  function segD(p: Pt, a: Pt, b: Pt) {
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
    return Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]);
  }
  // the item under the pointer: a leader line within a few px, else the smallest drawing whose box holds the pointer
  function objAt(e: any, px = 5) {
    const lay = L(), [sx, sy] = pos(e);
    let best: number | null = null, area = Infinity;
    items().forEach((it, i) => {
      if (!isObj(it)) return;
      if (it.k === 'line') {
        const q = it.pts.map((p: Pt) => localToScr(p));
        for (let k = 1; k < q.length; k++) if (segD([sx, sy], q[k - 1], q[k]) <= px) { best = i; area = 0; }
        return;
      }
      const b = lay.boxes[i];
      if (!b) return;
      const [x1, y1] = scr(b.x1, b.y1), [x2, y2] = scr(b.x2, b.y2);
      if (sx < x1 - px || sx > x2 + px || sy < y1 - px || sy > y2 + px) return;
      const a = (x2 - x1) * (y2 - y1);
      if (a <= area) { area = a; best = i; }
    });
    return best;
  }
  // a selected leader line's end under the pointer
  function pointAt(e: any, px = 7) {
    const it = E.sel != null ? items()[E.sel] : null;
    if (!it || it.k !== 'line') return -1;
    const [sx, sy] = pos(e);
    return it.pts.findIndex((p: Pt) => { const q = localToScr(p); return Math.hypot(q[0] - sx, q[1] - sy) <= px; });
  }
  // ---------------------------------------------------------------- handles: tilt and levels
  // A glass that takes tiltAngle turns about its origin (the foot of a test tube): its handle is a round one past the
  // glass's top, on its axis. A liquid, a burette or a pipette has a bar on each level it draws, where the surface
  // meets the glass's axis (the renderer records each level's frame: C.layout().levels). Both act on the one item
  // selected; Alt drags freely.
  const RAD = Math.PI / 180;
  const TILTED = new Set(['tkzTestTube', 'tkzRoundFlask', 'tkzGraduatedCylinder']);
  const cmOf = (e: any): Pt => { const [sx, sy] = pos(e), [X, Y] = fromScr(sx, sy); return [X / PX, -Y / PX]; };
  const cmToScr = (p: Pt): Pt => scr(p[0] * PX, -p[1] * PX);
  // a point in picture cm, in the frame m's own units
  const into = (m: number[], p: Pt): Pt => C.ap(C.inv(m), p[0], p[1]);
  // how far the glass reaches up its axis, drawn upright on its own (local units): its top and fittings
  const reach = new Map<string, number>();
  function reachOf(it: any) {
    const code = `\\${it.cmd}[${C.optsText(it.ops.filter((o: any) => o.k !== 'tiltAngle'))}]`;
    if (!reach.has(code)) { const b = C.layout({ src: `\\begin{tikzpicture}\n${code}\n\\end{tikzpicture}` }).boxes[0]; reach.set(code, b ? -b.y1 / PX : 3.5); }
    return reach.get(code)!;
  }
  const selOne = () => (E && E.sel != null && !E.multi && !E.arm ? E.sel : null);
  function tiltOf(i: number | null) {
    const it = i != null ? items()[i] : null, O = i != null ? L().origins[i] : null;
    if (!it || it.k !== 'app' || !TILTED.has(it.cmd) || !O) return null;
    const t = C.n0(optOf(it, 'tiltAngle') ?? 0), r = reachOf(it) + 0.8;
    return { it, O, t, pivot: C.ap(O, 0, 0) as Pt, tip: C.ap(O, -Math.sin(t * RAD) * r, Math.cos(t * RAD) * r) as Pt };
  }
  // the item's levels that are its own settings: the liquids its command takes (a second or third one once it is
  // drawn), the separatory funnel's two layers, a burette that is there, a pipette's reagent
  function levelsOf(i: number | null) {
    const it = i != null ? items()[i] : null, spec = it && it.k === 'app' ? C.CMDS[it.cmd] : null;
    if (!spec) return [];
    const keys: string[] = spec.keys, own = (k: string) => {
      const n = /^liquidLevel(\d)$/.exec(k);
      if (n) return keys.includes('sep') ? +n[1] <= 2 : keys.includes('liquids3') ? +n[1] === 1 || C.int(optOf(it, k) ?? C.DEFAULT[k]) > 0 : keys.includes('liquids1') && n[1] === '1';
      return keys.includes(k) && (k !== 'buretteLevel' || isOn(it, 'burette'));
    };
    return (L().levels[i!] || []).filter((lv: any) => own(lv.key) && Math.abs(lv.per) > 1e-9).map((lv: any) => {
      // the surface, y = off + per·v in its frame, where it meets the axis (x = ax in the axis frame)
      const y = lv.off + lv.per * lv.v, a0 = into(lv.m, C.ap(lv.axis, lv.ax, 0)), a1 = into(lv.m, C.ap(lv.axis, lv.ax, 1));
      const x = Math.abs(a1[1] - a0[1]) < 1e-9 ? a0[0] : a0[0] + ((y - a0[1]) / (a1[1] - a0[1])) * (a1[0] - a0[0]);
      const at = C.ap(lv.m, x, y) as Pt, along = C.ap(lv.m, x + 1, y) as Pt;
      return { ...lv, at, angle: Math.atan2(-(along[1] - at[1]), along[0] - at[0]) / RAD };
    });
  }
  // a handle of the selected item under the pointer
  function handleAt(e: any, px = 7): { kind: 'tilt' | 'level'; key?: string } | null {
    const i = selOne();
    if (i == null) return null;
    const [sx, sy] = pos(e), near = (p: Pt) => { const q = cmToScr(p); return Math.hypot(q[0] - sx, q[1] - sy) <= px; };
    const t = tiltOf(i);
    if (t && near(t.tip)) return { kind: 'tilt' };
    const lv = levelsOf(i).find((l: any) => near(l.at));
    return lv ? { kind: 'level', key: lv.key } : null;
  }
  const levelName = (it: any, key: string) => key === 'buretteLevel' ? uiText('editor.cl.buretteLevel', 'Burette level')
    : C.CMDS[it.cmd].keys.includes('sep') ? (key === 'liquidLevel1' ? uiText('editor.cl.aqueousTop', 'Aqueous to') : uiText('editor.cl.organicTop', 'Organic to'))
    : key === 'liquidLevel1' && !C.CMDS[it.cmd].keys.includes('liquids3') || key === 'reagentLevel' ? uiText('editor.cl.level', 'Level')
    : uiText('editor.cl.levelN', 'Level {n}', { n: key.slice(-1) });
  function handlesSvg() {
    const i = selOne();
    if (i == null) return '';
    let out = '';
    const t = tiltOf(i), d = E.drag;
    if (t) {
      const [ax, ay] = cmToScr(t.pivot), [bx, by] = cmToScr(t.tip), on = d && d.mode === 'tilt';
      out += `<path class="cl-stem" d="M${r2(ax)},${r2(ay)}L${r2(bx)},${r2(by)}"/><circle class="phy-h phy-hr${on ? ' on' : ''}" cx="${r2(bx)}" cy="${r2(by)}" r="5"><title>${esc(uiText('editor.cl.tiltHandle', 'Drag to tilt it about its foot'))}</title></circle>`;
    }
    for (const lv of levelsOf(i)) {
      const [X, Y] = cmToScr(lv.at), on = d && d.mode === 'level' && d.key === lv.key;
      out += `<rect class="phy-h cl-hl${on ? ' on' : ''}" x="${r2(X - 8)}" y="${r2(Y - 3)}" width="16" height="6" rx="3" transform="rotate(${r2(-lv.angle)} ${r2(X)} ${r2(Y)})"><title>${esc(uiText('editor.phy.dragHandle', 'Drag: {name}', { name: levelName(items()[i], lv.key) }))}</title></rect>`;
    }
    return out;
  }
  // a handle dragged to the pointer: the tilt in whole degrees (5° steps), a level in its own steps (five at a time)
  function dragHandle(d: any, e: any) {
    setSrc(d.src0);
    const it = items()[d.i];
    if (!it) return;
    const p = cmOf(e);
    if (d.mode === 'tilt') {
      const t = tiltOf(d.i);
      if (!t) return;
      const v = C.ap(C.inv([t.O[0], t.O[1], t.O[2], t.O[3], 0, 0]), p[0] - t.pivot[0], p[1] - t.pivot[1]);
      let a = Math.atan2(-v[0], v[1]) / RAD;
      a = Math.round(a / (e.altKey ? 1 : 5)) * (e.altKey ? 1 : 5);
      if (a <= -180) a += 360;
      setOpt(it, 'tiltAngle', a ? String(a) : null);
      setTip(`${title(it)} · ${uiText('editor.cl.tilt', 'Tilt')} ${a}°${e.altKey ? '' : uiText('editor.phy.altFree', ' · ⌥ for free')}`);
    } else {
      const lv = levelsOf(d.i).find((l: any) => l.key === d.key);
      if (!lv) return;
      const step = e.altKey ? lv.step : lv.step * 5, raw = (into(lv.m, p)[1] - lv.off) / lv.per;
      const v = Math.max(lv.min, Math.min(lv.max, Math.round(raw / step) * step));
      setOpt(it, d.key, C.num(Math.round(v * 1000) / 1000));
      setTip(`${title(it)} · ${levelName(it, d.key)} ${C.num(Math.round(v * 1000) / 1000)}${/^liquidLevel/.test(d.key) && !C.CMDS[it.cmd].keys.includes('sep') ? '%' : ''}${e.altKey ? '' : uiText('editor.phy.altFree', ' · ⌥ for free')}`);
    }
    flush();
  }
  function fit() {
    if (!E) return;
    const b = L().bb;
    E.view = fitView(rect(), { x: b.x / PX, y: b.y / PX, w: b.w / PX, h: b.h / PX }, { margin: 0.6, min: 10, max: 160 });
    draw();
  }

  // ---------------------------------------------------------------- drawing
  function grid(W: number, H: number) {
    const m = L().pm, ux = Math.hypot(m[0], m[1]) * E.view.k, uy = Math.hypot(m[2], m[3]) * E.view.k, u = Math.min(ux, uy);
    const step = u * GRID >= 7 ? GRID : u >= 7 ? 1 : 5;
    const [OX, OY] = scr(m[4] * PX, -m[5] * PX);
    let minor = '', major = '';
    for (let i = Math.floor(-OX / ux / step); i <= Math.ceil((W - OX) / ux / step); i++) { const X = Math.round(OX + i * step * ux) + 0.5, maj = Math.abs((i * step) % 1) < 1e-6; if (maj) major += `M${X},0V${H}`; else minor += `M${X},0V${H}`; }
    for (let j = Math.floor((OY - H) / uy / step); j <= Math.ceil(OY / uy / step); j++) { const Y = Math.round(OY - j * step * uy) + 0.5, maj = Math.abs((j * step) % 1) < 1e-6; if (maj) major += `M0,${Y}H${W}`; else minor += `M0,${Y}H${W}`; }
    return `<rect width="${W}" height="${H}" class="cz-bg"/><path d="${minor}" class="cz-gmin"/><path d="${major}" class="cz-gmaj"/><path class="cz-origin" d="M${r2(OX - 6)},${r2(OY)}h12M${r2(OX)},${r2(OY - 6)}v12"/>`;
  }
  function halo(i: number, cls: string) {
    const it = items()[i];
    if (!it) return '';
    if (it.k === 'line') return `<path class="${cls}" d="M${it.pts.map((p: Pt) => localToScr(p).map(r2).join(',')).join('L')}"/>`;
    const b = L().boxes[i];
    if (!b) return '';
    const [x1, y1] = scr(b.x1, b.y1), [x2, y2] = scr(b.x2, b.y2);
    return `<rect class="${cls} phy-box" x="${r2(x1 - 3)}" y="${r2(y1 - 3)}" width="${r2(x2 - x1 + 6)}" height="${r2(y2 - y1 + 6)}" rx="3"/>`;
  }
  function draw() {
    if (!E) return;
    syncCode();
    const r0 = rect(), W = r0.width, H = r0.height, lay = L();
    let out = grid(W, H);
    if (E.hover && E.hover.obj != null && !selList().includes(E.hover.obj) && !E.drag) out += halo(E.hover.obj, 'phy-hov');
    out += `<g transform="translate(${r2(E.view.ox)},${r2(E.view.oy)}) scale(${kk()})">${C.markup(lay, { export: true }, 'cle_')}</g>`;
    if (!objIds().length) out += `<text class="qe-empty" x="${r2(W / 2)}" y="${r2(H / 2 + 40)}">${esc(uiText('editor.cl.empty', 'Place apparatus from the left to start'))}</text>`;
    for (const i of selList()) out += halo(i, 'phy-sel');
    for (const w of lay.warnings) if (w.i >= 0 && !selList().includes(w.i) && isObj(items()[w.i])) out += halo(w.i, 'phy-bad');
    // where the selected item's shift puts its origin, or a leader line's ends
    const it = E.sel != null && !E.arm ? items()[E.sel] : null, o = it ? lay.origins[E.sel] : null;
    if (it && it.k === 'line') it.pts.forEach((p: Pt, k: number) => { const [X, Y] = localToScr(p), on = E.drag && E.drag.mode === 'pt' && E.drag.k === k; out += `<rect class="phy-h phy-hm${on ? ' on' : ''}" x="${r2(X - 4)}" y="${r2(Y - 4)}" width="8" height="8" rx="1.5"/>`; });
    else if (o) { const [X, Y] = scr(o[4] * PX, -o[5] * PX); out += `<path class="phy-h" d="M${r2(X)},${r2(Y - 5)}L${r2(X + 5)},${r2(Y)}L${r2(X)},${r2(Y + 5)}L${r2(X - 5)},${r2(Y)}Z"><title>${esc(uiText('editor.cl.originTip', 'Its origin: where the shift puts it'))}</title></path>`; }
    out += handlesSvg();
    if (E.drag && E.drag.mode === 'marquee' && E.drag.b) { const a = scr(E.drag.a[0], E.drag.a[1]), b = scr(E.drag.b[0], E.drag.b[1]); out += marqueeSvg(a[0], a[1], b[0], b[1]); }
    if ((E.arm || E.ghost) && E.hover && E.hover.at) { const [X, Y] = localToScr(E.hover.at); out += `<circle class="cz-snap on" cx="${r2(X)}" cy="${r2(Y)}" r="5"/>`; }
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    patchSvg(svg, out);
    svg.classList.toggle('placing', !!E.arm);
  }

  // ---------------------------------------------------------------- pointer
  function marqueeSel(d: any) {
    const lay = L(), M = marquee(d.a[0], d.a[1], d.b[0], d.b[1]), ids = [...d.base];
    items().forEach((it, i) => {
      if (!isObj(it)) return;
      if (it.k === 'line') {
        const q = it.pts.map((p: Pt) => { const c = localToCm(p); return [c[0] * PX, -c[1] * PX]; });
        if (marqueeTakes(M, { pts: q, segs: q.slice(1).map((p: Pt, k: number) => [q[k], p]) as any })) ids.push(i);
        return;
      }
      const b = lay.boxes[i];
      if (b && marqueeTakes(M, boxShape(b.x1, b.y1, b.x2, b.y2))) ids.push(i);
    });
    setSel(ids);
  }
  // move the items in ids by d (the picture's units) from the code at the drag's start
  function moveFrom(src0: string, ids: number[], d: Pt) {
    setSrc(src0);
    const dv = cmD(d);
    arrange(() => ids.forEach((i) => { const it = items()[i]; if (it) { shiftItem(it, d); it._dv = dv; } }));
  }
  svg.addEventListener('pointerdown', (e: any) => {
    if (!E || (e.button !== 0 && e.button !== 1)) return;
    const fe = document.activeElement;
    if (fe && fe !== document.body && root.contains(fe) && fe.matches('input, textarea, select')) (fe as HTMLElement).blur();
    const now = Date.now(), dbl = e.button === 0 && now - lastDown.t < 350 && Math.hypot(e.clientX - lastDown.x, e.clientY - lastDown.y) < 6;
    lastDown = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
    const [sx, sy] = pos(e);
    try { svg.setPointerCapture(e.pointerId); } catch { /* not tracked */ }
    if (e.button === 1 || E.space) { e.preventDefault(); E.drag = { mode: 'pan', sx, sy, ox: E.view.ox, oy: E.view.oy }; svg.classList.add('panning'); return; }
    if (E.arm === 'arrow') {
      const a = toLocal(e, !e.altKey), src0 = E.src, at = items().length;
      begin();
      arrange(() => insert(at, `\\draw[->] (${fmt(a[0])},${fmt(a[1])}) -- (${fmt(a[0])},${fmt(a[1])});`, null));
      E.sel = at; E.drag = { mode: 'pt', i: at, k: 1, src0: E.src, sx, sy, moved: false, created: src0 };
      draw(); return;
    }
    if (E.arm) { place(E.arm, toLocal(e, !e.altKey)); return; }
    const k = pointAt(e);
    if (k >= 0) { E.drag = { mode: 'pt', i: E.sel, k, src0: E.src, sx, sy, moved: false }; draw(); return; }
    const hd = handleAt(e);
    if (hd) { E.drag = { mode: hd.kind, key: hd.key, i: E.sel, src0: E.src, sx, sy, moved: false }; draw(); return; }
    const i = objAt(e);
    if (i != null && e.shiftKey) {
      const ids = selList();
      setSel(ids.includes(i) ? ids.filter((x) => x !== i) : [...ids, i]);
      draw(); renderProps(); return;
    }
    if (i != null) {
      if (dbl && E.sel === i) { focusField(); return; }
      const ids = E.multi && E.multi.includes(i) ? E.multi.slice() : [i];
      if (ids.length === 1) E.sel = i;
      E.drag = { mode: 'move', ids, src0: E.src, start: toLocal(e, false), sx, sy, moved: false };
      draw(); renderProps(); return;
    }
    // an empty spot: a click clears the selection, a drag draws a marquee (⇧ adds to the selection)
    const base = e.shiftKey ? selList() : [];
    if (!e.shiftKey) E.sel = null;
    E.drag = { mode: 'marquee', base, a: fromScr(sx, sy), b: null, sx, sy }; draw(); renderProps();
  });
  svg.addEventListener('pointermove', (e: any) => {
    if (!E) return;
    const d = E.drag, [sx, sy] = pos(e);
    if (!d) {
      const h: any = E.arm ? { at: toLocal(e, !e.altKey) } : (() => { const i = objAt(e); return i != null ? { obj: i } : null; })();
      const ch = JSON.stringify(h) !== JSON.stringify(E.hover);
      E.hover = h;
      const hd = E.arm ? null : handleAt(e);
      svg.classList.toggle('cl-turn', hd?.kind === 'tilt');
      svg.classList.toggle('cl-level', hd?.kind === 'level');
      svg.classList.toggle('cl-over', !E.arm && !hd && (pointAt(e) >= 0 || (h && h.obj != null)));
      if (ch) draw();
      return;
    }
    if (d.mode === 'pan') { E.view.ox = d.ox + sx - d.sx; E.view.oy = d.oy + sy - d.sy; draw(); return; }
    if (d.mode === 'marquee') {
      if (!d.b && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
      d.b = fromScr(sx, sy); marqueeSel(d); draw(); return;
    }
    if (!d.moved && Math.hypot(sx - d.sx, sy - d.sy) < 3) return;
    if (!d.moved) { begin(); d.moved = true; }
    if (d.mode === 'move') {
      // the body moves by whole grid steps, so it keeps its offset from the grid (⌥: free)
      const p = toLocal(e, false), dv: Pt = [p[0] - d.start[0], p[1] - d.start[1]];
      moveFrom(d.src0, d.ids, e.altKey ? [rnd(dv[0]), rnd(dv[1])] : [snapN(dv[0], true), snapN(dv[1], true)]);
      const it = items()[d.ids[0]], o = it ? (it.k === 'line' ? it.pts[0] : it.at) : null;
      if (d.ids.length === 1 && o) setTip(`${title(it)} · (${fmt(o[0])}, ${fmt(o[1])})${e.altKey ? '' : uiText('editor.phy.altFree', ' · ⌥ for free')}`);
      draw(); return;
    }
    if (d.mode === 'tilt' || d.mode === 'level') { dragHandle(d, e); draw(); return; }
    if (d.mode === 'pt') {
      const p = toLocal(e, !e.altKey);
      setSrc(d.src0);
      const it = items()[d.i];
      if (!it) return;
      it.pts[d.k] = p; it.dirty = true; flush();
      draw(); return;
    }
  });
  svg.addEventListener('pointerup', () => {
    if (!E || !E.drag) return;
    const d = E.drag; E.drag = null;
    svg.classList.remove('panning');
    if (d.mode === 'marquee') renderProps();
    if (d.mode === 'pt' && d.created != null) {
      // a leader line clicked rather than dragged: two units to the right
      if (!d.moved) { const it = items()[d.i]; if (it) { it.pts[1] = [rnd(it.pts[0][0] + 2), it.pts[0][1]]; it.dirty = true; flush(); } }
      commit(); E.arm = null; buildPalette(); setTip(''); renderProps();
    } else if (d.moved) { commit(); setTip(''); renderProps(); }
    draw();
  });
  svg.addEventListener('pointerleave', () => { if (E && !E.drag && E.hover) { E.hover = null; draw(); } });
  svg.addEventListener('dblclick', (e: any) => e.preventDefault());

  // right-click: the item's actions
  const MI: Record<string, IconName> = { dup: 'duplicate', up: 'moveUp', down: 'moveDown', delete: 'delete' };
  svg.addEventListener('contextmenu', (e: any) => {
    e.preventDefault();
    if (!E) return;
    const i = objAt(e);
    if (i == null) { closeEditorMenu(); return; }
    const many = !!(E.multi && E.multi.includes(i));
    if (!many) E.sel = i;
    draw(); renderProps();
    const ids = objIds();
    const rows: MenuEntry[] = [menuRow('dup', uiText('editor.phy.duplicate', 'Duplicate'), MI.dup, `${CMD}D`), '-',
      menuRow('up', uiText('editor.phy.drawEarlier', 'Draw Earlier'), MI.up, '', { disabled: many || i <= ids[0] }),
      menuRow('down', uiText('editor.phy.drawLater', 'Draw Later'), MI.down, '', { disabled: many || i >= ids[ids.length - 1] }), '-',
      menuRow('delete', uiText('editor.phy.delete', 'Delete'), MI.delete, '⌫', { danger: true })];
    openEditorMenu(e, rows, (a) => act(a));
  });

  // ---------------------------------------------------------------- item actions
  function deleteSel() {
    const ids = selList();
    if (!ids.length) return;
    edit(() => ids.sort((a, b) => b - a).forEach((i) => items().splice(i, 1)));
    E.sel = null; draw(); renderProps();
  }
  // copies just after the last one, beside what they copy (a gap of half a unit to the right)
  function duplicate() {
    const ids = selList();
    if (!ids.length) return;
    const lay = L(), o = originsNow();
    const b = ids.map((i) => lay.boxes[i]).filter(Boolean).reduce((a: any, x: any) => ({ x1: Math.min(a.x1, x.x1), x2: Math.max(a.x2, x.x2) }), { x1: Infinity, x2: -Infinity });
    const gap: Pt = isFinite(b.x1) ? localD([(b.x2 - b.x1) / PX, 0]) : [1, 0], dx: Pt = [snapN(gap[0] + 0.5, true), 0], dv = cmD(dx);
    const end = ids[ids.length - 1] + 1;
    edit(() => {
      const copies = ids.map((i) => {
        const src = items()[i], c = C.item(src.raw);
        c.lead = src.lead;
        const p = o[i];
        if (p) c._t = [p[0] + dv[0], p[1] + dv[1]]; else shiftItem(c, dx);
        return c;
      });
      items().splice(end, 0, ...copies);
    });
    setSel(ids.map((_x, k) => end + k)); draw(); renderProps();
  }
  // draw earlier or later: swapped with the next drawing item, comments and settings staying where they are
  function shift(dir: number) {
    if (E.sel == null) return;
    const ids = objIds(), at = ids.indexOf(E.sel), j = ids[at + dir];
    if (j == null) return;
    const i = E.sel;
    edit(() => { const a = items()[i], b = items()[j], la = a.lead, lb = b.lead; items()[i] = b; items()[j] = a; a.lead = lb; b.lead = la; });
    E.sel = j; draw(); renderProps();
  }
  function nudge(dx: number, dy: number) {
    const ids = selList();
    if (!ids.length) return;
    const dv = cmD([dx, dy]);
    edit(() => ids.forEach((i) => { shiftItem(items()[i], [dx, dy]); items()[i]._dv = dv; }));
  }

  // ---------------------------------------------------------------- properties
  const title = (it: any): string => {
    if (!it) return '';
    if (it.k === 'app') return it.cmd === 'tkzTestTube' ? GLASS_NAME(optOf(it, 'glassType') ?? 'tube') : CMD_NAME(it.cmd);
    if (it.k === 'scope') return uiText('editor.cl.group', 'Group');
    if (it.k === 'label') return uiText('editor.cl.pal.label', 'Label');
    if (it.k === 'line') return uiText('editor.cl.pal.arrow', 'Leader line');
    return '';
  };
  function optOf(it: any, k: string): string | null | undefined {
    const o = it.ops.find((x: any) => x.k === k);
    return o ? (o.v == null ? 'true' : C.unbrace(o.v)) : undefined;
  }
  // set a key (null: take it out, so the default holds); a true switch is written as the key alone
  function setOpt(it: any, k: string, v: string | null) {
    const at = it.ops.findIndex((x: any) => x.k === k);
    if (v == null) { if (at >= 0) it.ops.splice(at, 1); }
    else { const o = { k, v: v === 'true' && C.BOOL.includes(k) ? null : v }; if (at >= 0) it.ops[at] = o; else it.ops.push(o); }
    it.dirty = true;
  }
  const isOn = (it: any, k: string) => { const v = optOf(it, k); return v == null ? C.DEFAULT[k] === true : v === 'true'; };
  // pictures for the glass and liquid menus
  const pics = new Map<string, string>();
  // on paper, as the palette's: the glass is inked in black, as it prints
  const pic = (key: string, code: string) => { if (!pics.has(key)) pics.set(key, C.mini(code, key).replace(/^<svg /, '<svg class="paper" ')); return pics.get(key)!; };
  const glassPictures = (list: string[]) => Object.fromEntries(list.map((g) => [g, [GLASS_NAME(g), pic(`g${g}`, `\\tkzTestTube[glassType=${g}, liquidLevel1=0]`)]]));
  const liquidPictures = () => Object.fromEntries(C.LIQUIDS.map((s: string) => [s, [LIQUID_NAME(s), pic(`l${s}`, `\\tkzTestTube[glassType=beaker, liquidLevel1=70, liquidStyle1=${s}]`)]]));
  const sw = (label: Message | string, k: string, on: boolean, help?: string): FormRow =>
    switchRow([label], [[1, uiText('editor.phy.on', 'On')], [0, uiText('editor.phy.off', 'Off')]].map(([v, n]) => ({ text: String(n), on: +on === v, attrs: { 'data-lb': k, 'data-v': v } })), help ? { labelTitle: help } : {});
  const numRow = (label: string, k: string, value: any, ph: string, unit = '', attrs: Record<string, string> = {}): FormRow =>
    ({ ...row(label, { kind: 'input', value: value ?? '', attrs: { type: 'text', inputmode: 'decimal', class: 'mono', 'data-lf': k, placeholder: ph, spellcheck: 'false', ...attrs } }, ...(unit ? [{ kind: 'text' as const, text: unit }] : [])), controlClass: unit ? 'ctl unit' : 'ctl' });
  const textRow = (label: string, k: string, value: any, attr = 'data-lf'): FormRow =>
    ({ ...row(label, { kind: 'input', value: value ?? '', attrs: { type: 'text', [attr]: k, 'data-tx': 'text', placeholder: txPlaceholder('text', true), spellcheck: 'false' } }), labelTitle: uiText('editor.phy.useMaths', 'Use $…$ for maths') });
  const selRow = (label: string, k: string, value: string, options: string[][], pictures?: Record<string, any>, attr = 'data-lf'): FormRow =>
    row(label, { kind: 'select', value, attrs: { [attr]: k }, options, ...(pictures ? { pictures } : {}) } as Control);
  function colourRow(label: string, k: string, value: string | null | undefined, def: string, attr = 'data-lf'): FormRow {
    const v = value || '';
    return row(label, { kind: 'texColour', attrs: { [attr]: k }, value: v, label: v ? TD.texColor.label(v) : def, css: C.colour(v || def) || 'transparent', none: false, nullable: true,
      title: uiText('ui.colour', 'Colour'), defaultLabel: def, defaultSwatch: C.colour(def) || 'transparent' });
  }
  // what goes in the glass: a substance from the list, how many of it, and its colour when it takes one
  function substanceRows(it: any, k: 'substance' | 'solid'): FormRow[] {
    const s = C.substanceOf(optOf(it, k) ?? ''), name = s && s.name && C.SUBST[s.name] ? s.name : s ? 'other' : 'none';
    const options = [['none', uiText('editor.cl.fit.none', 'None')], ...Object.keys(C.SUBST).map((n) => [n, SUBST_NAME(n)]), ...(name === 'other' ? [['other', uiText('editor.cl.asWritten', 'As written')]] : [])];
    const rows = [selRow(k === 'solid' ? uiText('editor.cl.solid', 'Solid') : uiText('editor.cl.substance', 'Substance'), k, name, options, undefined, 'data-ls')];
    if (C.SUBST[name]) {
      rows.push(numRow(uiText('editor.cl.amount', 'Amount'), k, s.n ?? '', String(C.SUBST[name].n), '', { 'data-ln': k, 'data-lf': '' }));
      if (C.SUBST[name].colour) rows.push(colourRow(uiText('ui.colour', 'Colour'), k, s.c, 'black', 'data-lsc'));
    }
    return rows;
  }
  function writeSubstance(it: any, k: string, patch: { name?: string; n?: string; c?: string }) {
    const s = C.substanceOf(optOf(it, k) ?? '') || { name: 'none', n: null, c: null };
    const name = patch.name ?? s.name, n = patch.n !== undefined ? patch.n.trim() : s.n == null ? '' : String(s.n), c = patch.c !== undefined ? patch.c : s.c;
    if (!name || name === 'none' || !C.SUBST[name]) { setOpt(it, k, null); return; }
    const def = C.SUBST[name], num = /^\d+$/.test(n) && +n !== def.n ? `[${n}]` : '';
    setOpt(it, k, `{\\${name}${num}${def.colour ? `{${TD.texColor.wrap(c || 'red') || 'red'}}` : ''}}`);
  }
  function appRows(it: any): FormRow[] {
    const spec = C.CMDS[it.cmd], rows: FormRow[] = [];
    if (!spec) return rows;
    const lvl = (n: number) => optOf(it, `liquidLevel${n}`), eff = (n: number) => C.int(lvl(n) ?? C.DEFAULT[`liquidLevel${n}`]);
    for (const key of spec.keys) {
      if (key === 'glassType' || key === 'glassTypeTitration') {
        const list = key === 'glassType' ? C.GLASS : ['roundFlask', 'beaker', 'erlenmeyer', 'reagentBottle'];
        const v = optOf(it, 'glassType') ?? (key === 'glassType' ? 'tube' : 'roundFlask');
        rows.push(selRow(uiText('editor.cl.glass', 'Glass'), 'glassType', list.includes(v) ? v : list[0], list.map((g: string) => [g, GLASS_NAME(g)]), glassPictures(list)));
      } else if (key === 'liquids3' || key === 'liquids1') {
        const n = key === 'liquids3' ? 3 : 1;
        for (let k = 1; k <= n; k++) {
          // the second and third liquids show once the one before has a level
          if (k > 1 && !(eff(k - 1) > 0) && !(eff(k) > 0)) break;
          rows.push(numRow(n > 1 ? uiText('editor.cl.levelN', 'Level {n}', { n: k }) : uiText('editor.cl.level', 'Level'), `liquidLevel${k}`, lvl(k), String(C.DEFAULT[`liquidLevel${k}`]), '%'));
          if (eff(k) > 0) {
            const st = optOf(it, `liquidStyle${k}`) ?? `liquidStyle${k}`;
            rows.push(selRow(n > 1 ? uiText('editor.cl.liquidN', 'Liquid {n}', { n: k }) : uiText('editor.cl.liquid', 'Liquid'), `liquidStyle${k}`, st,
              [...C.LIQUIDS.map((s: string) => [s, LIQUID_NAME(s)]), ...(C.LIQUIDS.includes(st) ? [] : [[st, st]])], liquidPictures()));
          }
        }
      } else if (key === 'tiltAngle') rows.push(numRow(uiText('editor.cl.tilt', 'Tilt'), 'tiltAngle', optOf(it, 'tiltAngle'), '0', '°'));
      else if (key === 'fit') {
        const on = FIT_ORDER.find((f) => spec.fit.includes(f) && isOn(it, f)) || 'none';
        rows.push(selRow(uiText('editor.cl.fitting', 'Fitting'), 'fit', on, ['none', ...FIT_ORDER.filter((f) => spec.fit.includes(f))].map((f) => [f, FIT_NAME(f)]), undefined, 'data-lfit'));
      } else if (key === 'label') {
        rows.push(sw(uiText('editor.cl.tag', 'Label'), 'label', isOn(it, 'label'), uiText('editor.cl.tagHelp', 'A white tag on the glass, with its text')));
        if (isOn(it, 'label')) rows.push(textRow(uiText('editor.cl.tagText', 'Tag text'), 'Number', optOf(it, 'Number')));
      } else if (key === 'substance' || key === 'solid') rows.push(...substanceRows(it, key));
      else if (key === 'reagentLevel') rows.push(numRow(uiText('editor.cl.level', 'Level'), 'reagentLevel', optOf(it, 'reagentLevel'), String(C.DEFAULT.reagentLevel)));
      else if (key === 'reagentColor') rows.push(colourRow(uiText('editor.cl.reagent', 'Reagent'), 'reagentColor', optOf(it, 'reagentColor'), 'PaleOrange'));
      else if (key === 'buretteLevel') { if (isOn(it, 'burette')) rows.push(numRow(uiText('editor.cl.buretteLevel', 'Burette level'), 'buretteLevel', optOf(it, 'buretteLevel'), String(C.DEFAULT.buretteLevel))); }
      else if (key === 'buretteColor') { if (isOn(it, 'burette')) rows.push(colourRow(uiText('editor.cl.titrant', 'Titrant'), 'buretteColor', optOf(it, 'buretteColor'), 'VeryPaleOrange')); }
      else if (key === 'buretteReagent') { if (isOn(it, 'burette')) rows.push(textRow(uiText('editor.cl.buretteText', 'Burette text'), 'buretteReagent', optOf(it, 'buretteReagent'))); }
      else if (key === 'beakerReagent') rows.push(textRow(uiText('editor.cl.flaskText', 'Flask text'), 'beakerReagent', optOf(it, 'beakerReagent')));
      else if (key === 'MixtureStyle') { const st = optOf(it, 'MixtureStyle') ?? 'BlueDiffusion'; rows.push(selRow(uiText('editor.cl.mixture', 'Mixture'), 'MixtureStyle', st, [...C.LIQUIDS.map((s: string) => [s, LIQUID_NAME(s)]), ...(C.LIQUIDS.includes(st) ? [] : [[st, st]])], liquidPictures())); }
      else if (key === 'DistillateColor') rows.push(colourRow(uiText('editor.cl.distillate', 'Distillate'), 'DistillateColor', optOf(it, 'DistillateColor'), 'yellow'));
      else if (key === 'sep') {
        rows.push(numRow(uiText('editor.cl.aqueousTop', 'Aqueous to'), 'liquidLevel1', optOf(it, 'liquidLevel1'), '11', '', { title: uiText('editor.cl.sepHelp', 'The height its surface is drawn at, from the tap (2) to the neck (13)') }));
        rows.push(numRow(uiText('editor.cl.organicTop', 'Organic to'), 'liquidLevel2', optOf(it, 'liquidLevel2'), '12', '', { title: uiText('editor.cl.sepHelp', 'The height its surface is drawn at, from the tap (2) to the neck (13)') }));
      } else if (key === 'stopper') rows.push(sw(FIT_NAME('stopper'), 'stopper', isOn(it, 'stopper')));
      else if (key === 'TapOpen') rows.push(sw(uiText('editor.cl.tapOpen', 'Tap open'), 'TapOpen', isOn(it, 'TapOpen')));
      else if (key === 'clamp') rows.push(sw(uiText('editor.cl.clamp', 'Clamp'), 'clamp', isOn(it, 'clamp')));
      else if (key === 'bunsenBurner') rows.push(sw(CMD_NAME('tkzBunsenBurner'), 'bunsenBurner', isOn(it, 'bunsenBurner')));
      else if (key === 'bubbling') rows.push(sw(uiText('editor.cl.bubbling', 'Bubbling'), 'bubbling', isOn(it, 'bubbling'), uiText('editor.cl.bubblingHelp', 'The gas bubbles through a second tube')));
      else if (key === 'tubeOnly') rows.push(sw(uiText('editor.cl.tubeOnly', 'Tube only'), 'tubeOnly', isOn(it, 'tubeOnly')));
      else if (key === 'gasCollection') rows.push(sw(uiText('editor.cl.gasCollection', 'Gas jar'), 'gasCollection', isOn(it, 'gasCollection'), uiText('editor.cl.gasHelp', 'Collects the gas over water; needs a delivery tube or two tubes')));
      else if (key === 'burette') rows.push(sw(uiText('editor.cl.burette', 'Burette'), 'burette', isOn(it, 'burette')));
      else if (key === 'pHMeter') rows.push(sw(uiText('editor.cl.phMeter', 'pH meter'), 'pHMeter', isOn(it, 'pHMeter')));
      else if (key === 'magneticStirrer') rows.push(sw(uiText('editor.cl.stirrer', 'Stirrer'), 'magneticStirrer', isOn(it, 'magneticStirrer')));
    }
    return rows;
  }
  // the keys the settings above don't show, kept as written
  function extraKeys(it: any) {
    const spec = C.CMDS[it.cmd];
    if (!spec) return it.ops;
    const shown = new Set<string>();
    for (const k of spec.keys) {
      if (k === 'glassTypeTitration') shown.add('glassType');
      else if (k === 'liquids3') for (const n of [1, 2, 3]) { shown.add(`liquidLevel${n}`); shown.add(`liquidStyle${n}`); }
      else if (k === 'liquids1') { shown.add('liquidLevel1'); shown.add('liquidStyle1'); }
      else if (k === 'fit') spec.fit.forEach((f: string) => shown.add(f));
      else if (k === 'label') { shown.add('label'); shown.add('Number'); }
      else if (k === 'sep') { shown.add('liquidLevel1'); shown.add('liquidLevel2'); }
      else shown.add(k);
    }
    return it.ops.filter((o: any) => !shown.has(o.k));
  }
  const posRow = (at: Pt | null): FormRow => ({ ...row(uiText('editor.phy.position', 'Position'),
    { kind: 'input', value: at ? fmt(at[0]) : '', attrs: { type: 'text', inputmode: 'decimal', class: 'mono', 'data-lp': '0', 'aria-label': 'x', spellcheck: 'false' } },
    { kind: 'input', value: at ? fmt(at[1]) : '', attrs: { type: 'text', inputmode: 'decimal', class: 'mono', 'data-lp': '1', 'aria-label': 'y', spellcheck: 'false' } }), labelTitle: uiText('editor.cl.posHelp', 'x, y in the picture’s units, from its origin') });
  const warnRows = (i: number): FormRow[] => L().warnings.filter((w: any) => w.i === i).map((w: any) => ({ kind: 'error' as const, text: w.msg }));
  // the picture's scale (its options) and line widths (a \chemlabset{style=…} at the top)
  const LW = () => [['default', uiText('editor.cl.lw.default', 'Default')], ['publication', uiText('editor.cl.lw.publication', 'Publication')], ['presentation', uiText('editor.cl.lw.presentation', 'Presentation')],
    ['schematic', uiText('editor.cl.lw.schematic', 'Schematic')], ['draft', uiText('editor.cl.lw.draft', 'Draft')], ['bold', uiText('editor.cl.lw.bold', 'Bold')]];
  const setItem = () => items().findIndex((it) => it.k === 'set');
  const scaleOf = () => { const o = C.split(E.M.env || '').map(C.kv).find((x: any) => x.k === 'scale'); return o ? o.v : ''; };
  // a piece's (or a group's) own size: tikz-chemlab has no scale key, so it is the scale of the scope round it
  const scaleRow = (it: any): FormRow => ({
    ...(numRow(uiText('editor.cl.scale', 'Scale'), 'scale', C.scaleIn(it.k === 'scope' ? it.o : it.sc?.o ?? null), '1', '', { 'data-lf': '', 'data-lscale': '' }) as Extract<FormRow, { kind: 'row' }>),
    labelTitle: uiText('editor.cl.itemScaleHelp', 'Draws it larger or smaller about its origin, line widths too: a scale on the scope round it, since tikz-chemlab has no scale of its own'),
  });
  function renderProps() {
    if (!E) return;
    const show = (sections: FormSection[]) => renderView(props, FormPanel, { sections });
    if (E.multi) {
      show([section(uiText('editor.phy.nSelected', '{n} objects selected', { n: E.multi.length }), [note(uiText('editor.phy.multiHelp1', 'Drag any of them to move them together, or use the arrow keys. '), { kbd: '⇧' }, uiText('editor.phy.multiHelp2', '-click adds or removes one; '), { kbd: '⌫' }, uiText('editor.phy.multiHelp3', ' deletes them, '), { kbd: `${CMD}D` }, uiText('editor.phy.multiHelp4', ' duplicates them.'))], 'sec')]);
      return;
    }
    const it = E.sel != null ? items()[E.sel] : null, line = E.sel != null ? C.lineOf(E.M, E.sel) : 0;
    if (it && it.k === 'app') {
      const extra = extraKeys(it);
      show([{ ...section(title(it), [posRow(it.at || [0, 0]), scaleRow(it), ...appRows(it),
        ...(extra.length ? [note(uiText('editor.phy.keptAsWritten', 'Kept as written: '), { code: C.optsText(extra) })] : []),
        ...(C.ACC.has(it.cmd) && !it.sc ? [note(uiText('editor.cl.accNote', 'tikz-chemlab sets this one beside the one of its kind before it; moving it gives it a scope of its own.'))] : []),
        ...warnRows(E.sel)], 'sec'), summary: uiText('editor.phy.cmdLine', '{cmd} · line {n}', { cmd: `\\${it.cmd}`, n: line }) }]);
      return;
    }
    if (it && it.k === 'scope') {
      const cmds = [...new Set(it.body.filter((x: any) => x.k === 'app').map((x: any) => `\\${x.cmd}`))].join(', ');
      show([{ ...section(title(it), [posRow(it.at || [0, 0]), scaleRow(it), note(uiText('editor.cl.groupHelp', 'A scope holding several things, moved together. Edit what is inside in the code below.')), ...(cmds ? [note({ code: cmds })] : []), ...warnRows(E.sel)], 'sec'),
        summary: uiText('editor.phy.lineN', 'line {n}', { n: line }) }]);
      return;
    }
    if (it && it.k === 'label') {
      show([{ ...section(title(it), [textRow(uiText('editor.phy.text', 'Text'), 'text', it.t, 'data-lt'), posRow(it.at), ...(it.o ? [note(uiText('editor.phy.keptAsWritten', 'Kept as written: '), { code: it.o })] : []), ...warnRows(E.sel)], 'sec'),
        summary: uiText('editor.phy.lineN', 'line {n}', { n: line }) }]);
      return;
    }
    if (it && it.k === 'line') {
      const tips = tipsOf(it.o), pt = (k: number, label: string): FormRow => ({ ...row(label, { kind: 'input', value: `${fmt(it.pts[k][0])}, ${fmt(it.pts[k][1])}`, attrs: { type: 'text', class: 'mono', 'data-la': k, spellcheck: 'false' } }), labelTitle: uiText('editor.cl.posHelp', 'x, y in the picture’s units, from its origin') });
      show([{ ...section(title(it), [pt(0, uiText('editor.phy.from', 'From')), pt(it.pts.length - 1, uiText('editor.phy.to', 'To')),
        switchRow([uiText('editor.cl.tips', 'Arrow')], [['-', uiText('editor.cl.fit.none', 'None')], ['->', '→'], ['<-', '←'], ['<->', '↔']].map(([v, n]) => ({ text: n, on: tips === v, attrs: { 'data-lw': v } }))),
        ...warnRows(E.sel)], 'sec'), summary: uiText('editor.phy.lineN', 'line {n}', { n: line }) }]);
      return;
    }
    const st = setting(['style']);
    const n = C.count(L());
    // a width as written, its placeholder what it is without it (the preset, or line width=)
    const width = (label: string, i: number) => {
      const keys = WIDTH_KEYS[i], v = setting(keys), pt = widthsWithout(keys)[i];
      return { ...row(label, { kind: 'input', value: v ?? '', attrs: { type: 'text', class: 'mono', 'data-lset': keys[0], placeholder: `${Math.round(pt * 100) / 100}pt`, spellcheck: 'false' } }),
        controlClass: 'ctl', labelTitle: uiText('editor.cl.widthHelp', 'A length (1pt, 0.05cm) or thin, semithick, thick, very thick, ultra thick. Empty: the preset’s.') } as FormRow;
    };
    const flameCol = (label: string, k: string, def: string) => colourRow(label, k, setting([k]), def, 'data-lset');
    show([{ ...section(uiText('editor.cl.picture', 'Picture'), [
      numRow(uiText('editor.cl.scale', 'Scale'), 'scale', scaleOf(), '1', '', { 'data-lf': '', 'data-pic': 'scale' }),
      ...warnRows(-1),
      note(uiText('editor.cl.help1', 'Place apparatus from the left, then drag it into place ('), { kbd: '⌥' }, uiText('editor.cl.help2', ' turns snapping off). Select a piece to fill it, fit it and heat it. Positions are in the picture’s own units, from the cross at its origin.')),
    ], 'sec'), summary: n === 1 ? uiText('editor.cl.oneThing', '1 piece of apparatus') : uiText('editor.cl.nThings', '{n} pieces of apparatus', { n }) },
    section(uiText('editor.cl.lineWidths', 'Line widths'), [
      selRow(uiText('editor.cl.preset', 'Preset'), 'style', st ?? 'default', LW(), undefined, 'data-lstyle'),
      width(uiText('editor.cl.w.outline', 'Outlines'), 0), width(uiText('editor.cl.w.ellipse', 'Rims'), 1),
      width(uiText('editor.cl.w.tube', 'Tube mouths'), 2), width(uiText('editor.cl.w.graduation', 'Graduations'), 3),
    ], 'sec'),
    section(uiText('editor.cl.flame', 'Flame'), [
      numRow(uiText('editor.cl.flameScale', 'Size'), 'flame scale', setting(['flame scale']) ?? '', '1', '', { 'data-lf': '', 'data-lset': 'flame scale' }),
      // each part of the flame shades from its base colour up to its tip colour
      flameCol(uiText('editor.cl.flameOuter', 'Outer base'), 'flame outer color', 'PaleOrange'), flameCol(uiText('editor.cl.flameOuterEnd', 'Outer tip'), 'flame outer end color', 'yellow'),
      flameCol(uiText('editor.cl.flameInner', 'Inner base'), 'flame inner color', 'cyan'), flameCol(uiText('editor.cl.flameInnerEnd', 'Inner tip'), 'flame inner end color', 'white'),
      // only \tkzBunsenBurnerGrill reads them (in tikz-chemlabObj.tex); \tkzBunsenBurner's flame is drawn as it is
      note(uiText('editor.cl.flameHelp1', 'For the burner with a gauze: '), { code: '\\tkzHeatFlask' }, uiText('editor.cl.flameHelp2', ' and '), { code: '\\tkzBunsenBurnerGrill' },
        uiText('editor.cl.flameHelp3', '. The plain burner’s flame, as in '), { code: '\\tkzHeatTube' }, uiText('editor.cl.flameHelp4', ', is the package’s own.')),
    ], 'sec')]);
  }
  // \chemlabset's line widths (each with its long name) and flame, as the first \chemlabset in the picture writes them
  const WIDTH_KEYS = [['outline width', 'outline line width'], ['ellipse width', 'ellipse line width'], ['tube ellipse width', 'tube ellipse line width'], ['graduation width', 'graduation line width']];
  function setting(keys: string[]): string | null {
    const si = setItem();
    if (si < 0) return null;
    const x = C.split(items()[si].o || '').map(C.kv).filter((y: any) => keys.includes(y.k)).pop();
    return x && x.v != null ? C.unbrace(x.v) : null;
  }
  // the four widths (pt) the first \chemlabset gives, read in order as the package does, without the keys given
  function widthsWithout(skip: string[]) {
    let w = C.LINE_STYLES.default.slice();
    const si = setItem();
    for (const { k, v } of si >= 0 ? C.split(items()[si].o || '').map(C.kv) : []) {
      if (skip.includes(k) || v == null) continue;
      const val = C.unbrace(v).trim(), pt = C.widthPt(val);
      if (k === 'style' && C.LINE_STYLES[val]) w = C.LINE_STYLES[val].slice();
      else if ((k === 'line width' || k === 'linewidth') && isFinite(pt)) w = [pt, pt, pt, pt];
      else { const i = WIDTH_KEYS.findIndex((ks) => ks.includes(k)); if (i >= 0 && isFinite(pt)) w[i] = pt; }
    }
    return w;
  }
  // set one of \chemlabset's keys (null takes it out). It goes last, so a style= or line width= before it can't undo
  // it; with no \chemlabset yet, one is made at the top; one left empty goes.
  function setSetting(keys: string[], v: string | null) {
    const si = setItem();
    arrange(() => {
      if (si >= 0) {
        const S = items()[si], list = C.split(S.o || '').map((x: string) => x.trim()).filter((x: string) => x && !keys.includes(C.kv(x).k));
        if (v != null) list.push(`${keys[0]}=${v}`);
        if (list.length) { S.o = list.join(', '); S.dirty = true; } else items().splice(si, 1);
      } else if (v != null) insert(0, `\\chemlabset{${keys[0]}=${v}}`, null);
    });
  }
  // a leader line's tips: -, ->, <- or <->
  function tipsOf(o: string | null) {
    const a = C.split(o || '').find((x: string) => /^<?-+>?$/.test(x.trim()));
    return a ? (a.includes('<') ? (a.includes('>') ? '<->' : '<-') : a.includes('>') ? '->' : '-') : '-';
  }
  function setTips(it: any, v: string) {
    const rest = C.split(it.o || '').filter((x: string) => !/^<?-+>?$/.test(x.trim()));
    it.o = [...(v !== '-' ? [v] : []), ...rest].join(', ') || null; it.dirty = true;
  }
  props.addEventListener('focusin', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) begin(); });
  props.addEventListener('focusout', (e: any) => { if (!isViewUpdating() && e.target.matches('input, select')) { commit(); renderProps(); } });
  props.addEventListener('keydown', (e: any) => { if (e.key === 'Enter' && e.target.matches('input')) e.target.blur(); });
  // a setting changed: the selected item's option, position or text; the picture's scale and line widths
  function applyField(t: any) {
    const ds = t.dataset, v = String(t.value ?? '').trim(), it = E.sel != null ? items()[E.sel] : null;
    if (ds.pic === 'scale') {
      const s = parseFloat(v);
      if (v && !(s > 0)) return false;
      const o = C.split(E.M.env || '').filter((x: string) => C.kv(x).k !== 'scale');
      E.M.env = [...(v && s !== 1 ? [`scale=${v}`] : []), ...o].join(', '); E.M.headDirty = true;
      arrange(() => {});
      return true;
    }
    if (ds.lset != null) {
      const k = ds.lset, wi = WIDTH_KEYS.findIndex((ks) => ks[0] === k);
      if (wi >= 0) {
        // the package's five words, or a length (a bare number is pt)
        const val = /^-?[\d.]+$/.test(v) ? `${v}pt` : v;
        if (val && !C.LAB_WIDTHS.includes(val) && !/^-?[\d.]+\s*(pt|cm|mm|bp|in|em|ex)$/.test(val)) return false;
        setSetting(WIDTH_KEYS[wi], val || null);
      } else if (k === 'flame scale') {
        const s = parseFloat(v);
        if (v && !(s > 0)) return false;
        setSetting([k], v && s !== 1 ? C.num(s) : null);
      } else setSetting([k], v ? TD.texColor.wrap(v) : null);
      return true;
    }
    if (ds.lstyle != null) {
      const si = setItem();
      arrange(() => {
        if (si >= 0) {
          const S = items()[si], o = C.split(S.o).filter((x: string) => C.kv(x).k !== 'style');
          const all = [...(v !== 'default' ? [`style=${v}`] : []), ...o];
          if (all.length) { S.o = all.join(', '); S.dirty = true; } else items().splice(si, 1);
        } else if (v !== 'default') insert(0, `\\chemlabset{style=${v}}`, null);
      });
      return true;
    }
    if (!it) return false;
    if (ds.lp != null) {
      const n = parseFloat(v);
      if (!isFinite(n)) return false;
      const k = +ds.lp, cur = it.k === 'line' ? it.pts[0] : it.at || [0, 0], d: Pt = [k === 0 ? n - cur[0] : 0, k === 1 ? n - cur[1] : 0];
      arrange(() => { shiftItem(it, d); it._dv = cmD(d); });
      return true;
    }
    if (ds.lt != null) { arrange(() => { it.t = t.value; it.dirty = true; }); return true; }
    if (ds.lscale != null) {
      const s = parseFloat(v);
      if (v && !(s > 0)) return false;
      const val = v && s !== 1 ? C.num(s) : null;
      arrange(() => {
        if (it.k === 'scope') it.o = C.withScale(it.o, val);
        else if (it.sc) { it.sc.o = C.withScale(it.sc.o, val); it.sc.unwrap = val == null; }
        else it.so = C.withScale(null, val);
        it.dirty = true;
      });
      return true;
    }
    if (ds.la != null) {
      const p = v.split(',').map((x: string) => parseFloat(x));
      if (p.length !== 2 || !p.every(isFinite)) return false;
      arrange(() => { it.pts[+ds.la] = [p[0], p[1]]; it.dirty = true; });
      return true;
    }
    if (it.k !== 'app') return false;
    if (ds.lfit != null) {
      arrange(() => { for (const f of FIT_ORDER) if (optOf(it, f) != null) setOpt(it, f, null); if (v !== 'none') setOpt(it, v, 'true'); });
      return true;
    }
    if (ds.ls != null) { if (v === 'other') return false; arrange(() => writeSubstance(it, ds.ls, { name: v })); return true; }
    if (ds.ln != null) { if (v && !/^\d+$/.test(v)) return false; arrange(() => writeSubstance(it, ds.ln, { n: v })); return true; }
    if (ds.lsc != null) { arrange(() => writeSubstance(it, ds.lsc, { c: v })); return true; }
    if (ds.lf) {
      const k = ds.lf;
      const def = k === 'glassType' && it.cmd === 'tkzTitration' ? null : C.DEFAULT[k] ?? (k === 'liquidLevel1' && it.cmd === 'tkzSeparatoryFunnel' ? '11' : k === 'liquidLevel2' && it.cmd === 'tkzSeparatoryFunnel' ? '12' : '');
      // liquid levels are compared by \ifnum: whole numbers
      const val = /^liquidLevel/.test(k) && it.cmd !== 'tkzSeparatoryFunnel' && v ? String(Math.round(parseFloat(v)) || 0) : v;
      if (/^(liquidLevel\d|tiltAngle|reagentLevel|buretteLevel)$/.test(k) && val && !isFinite(parseFloat(val))) return false;
      arrange(() => setOpt(it, k, !val || val === String(def) ? null : /Color$/.test(k) ? TD.texColor.wrap(val) : /Reagent$|^Number$/.test(k) ? `{${val}}` : val));
      return true;
    }
    return false;
  }
  props.addEventListener('input', (ev: any) => {
    const t = ev.target;
    if (!E || !t.matches('input, select')) return;
    begin(); // a menu or a colour picked without the field taking focus first is still one undo step
    if (!applyField(t)) return;
    draw();
    if (t.tagName === 'SELECT' || t.type === 'hidden') { commit(); renderProps(); begin(); } else renderProps();
  });
  props.addEventListener('click', (ev: any) => {
    const b = ev.target.closest('[data-lb], [data-lw]'), it = E && E.sel != null ? items()[E.sel] : null;
    if (!b || !it) return;
    if (b.dataset.lw != null) { if (it.k === 'line') edit(() => setTips(it, b.dataset.lw)); return; }
    if (it.k !== 'app') return;
    const k = b.dataset.lb, on = b.dataset.v === '1';
    edit(() => setOpt(it, k, on === (C.DEFAULT[k] === true) ? null : on ? 'true' : 'false'));
  });
  function focusField() { const f = $('input[data-lt], input[data-la], input[data-lf]:not([data-pic]), input[data-lp]', props); if (f) { f.focus(); if (f.select) f.select(); } }

  // ---------------------------------------------------------------- toolbar, code, keys
  function updateTools() {
    if (!E) return;
    $('[data-le="undo"]', root).disabled = !E.undo.length;
    $('[data-le="redo"]', root).disabled = !E.redo.length;
    $('[data-le="delete"]', root).disabled = !selList().length;
    $('[data-le="dup"]', root).disabled = !selList().length;
  }
  root.addEventListener('click', (e) => { const b = (e.target as Element).closest('[data-le]'); if (b && E) act((b as HTMLElement).dataset.le!, b); });
  function act(a: string, b?: any) {
    if (a === 'undo') undo();
    else if (a === 'redo') redo();
    else if (a === 'fit') fit();
    else if (a === 'done') finish(true);
    else if (a === 'cancel') finish(false);
    else if (a === 'delete') deleteSel();
    else if (a === 'dup') duplicate();
    else if (a === 'up') shift(-1);
    else if (a === 'down') shift(1);
    else if (a === 'copy') copyCode(b, codeTa.value);
    updateTools();
  }
  function syncCode() {
    const lay = L(), n = C.count(lay), w = lay.warnings;
    count.textContent = n === 1 ? uiText('editor.cl.oneThing', '1 piece of apparatus') : uiText('editor.cl.nThings', '{n} pieces of apparatus', { n });
    // the first four warnings, each with its line, then how many more
    showCodeNotes(codeMsg, [...w.slice(0, 4).map((x: any) => (x.i >= 0 ? uiText('editor.phy.warnLine', 'Line {n}: ', { n: C.lineOf(E.M, x.i) }) : '') + caption(x.msg)),
      ...(w.length > 4 ? [uiText('editor.phy.andMore', 'and {n} more', { n: w.length - 4 })] : [])]);
    updateTools();
    if (document.activeElement === codeTa) return;
    if (E.src !== E.codeAt) { E.codeAt = E.src; codeTa.value = E.src; }
  }
  function readCode() {
    clearTimeout(E.codeTimer); E.codeTimer = null;
    if (codeTa.value === E.codeAt) return;
    begin();
    setSrc(codeTa.value); E.codeAt = codeTa.value;
    commit(); // each pause in typing is one undo step
    clampSel(); draw(); renderProps();
  }
  wireCode(codeTa, { state: () => E, read: readCode, commit, sync: syncCode });

  window.addEventListener('keydown', (e) => {
    const keys = editorKeys(e, {
      open: () => !!E && !root.hidden && !session.elsewhere(e),
      save,
      finish,
      undo,
      redo,
      escape: () => {
        if (E.arm) { E.arm = null; buildPalette(); setTip(''); draw(); return true; }
        if (selList().length) { E.sel = null; draw(); renderProps(); return true; }
        return false;
      },
    });
    if (!keys) return;
    const { mod } = keys;
    if (mod && (e.key === 'd' || e.key === 'D')) { e.preventDefault(); duplicate(); return; }
    if (mod && e.key === 'f') { e.preventDefault(); search.focus(); search.select(); return; }
    if (mod && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); setSel(objIds()); draw(); renderProps(); return; }
    if (mod) return;
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); deleteSel(); return; }
    if (e.key === '0') { fit(); return; }
    if (e.key === '/') { e.preventDefault(); search.focus(); return; }
    if (e.key === ' ') { e.preventDefault(); E.space = true; svg.classList.add('pan-ready'); return; }
    if ((e.key === 'Enter' || e.key === 'F2') && E.sel != null) { e.preventDefault(); focusField(); return; }
    if (e.key === 'Tab') {
      // walk the items in code order
      e.preventDefault();
      const ids = objIds();
      if (!ids.length) return;
      const at = ids.indexOf(E.sel), nx = at < 0 ? (e.shiftKey ? ids.length - 1 : 0) : (at + (e.shiftKey ? -1 : 1) + ids.length) % ids.length;
      E.sel = ids[nx]; draw(); renderProps(); return;
    }
    if (e.key.startsWith('Arrow') && selList().length) {
      e.preventDefault();
      const d = e.shiftKey ? 1 : GRID;
      nudge(e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0, e.key === 'ArrowUp' ? d : e.key === 'ArrowDown' ? -d : 0);
    }
  }, true);
  // space held: the open hand; moving the view: the closed hand, as on the main canvas
  window.addEventListener('keyup', (e) => { if (E && e.key === ' ') { E.space = false; svg.classList.remove('pan-ready'); } }, true);
  window.addEventListener('blur', () => { if (E) E.space = false; svg.classList.remove('pan-ready', 'panning'); });
  TD.editorSession.watchSize(root, () => { if (E && !root.hidden) draw(); });

  // ---------------------------------------------------------------- open / close
  const session = TD.editorSession.lifecycle({
    state: () => E, clear: () => { stopLocale?.(); stopLocale = null; E = null; }, snapshot, commit, root, code: codeTa, readCode, note: stageNote,
    discardTitle: () => uiText('editor.cl.discard', 'Discard changes to this lab picture?'), settle: closeEditorMenu,
  });
  const { save, finish } = session;
  // host: embedded in a pane (Quick) instead of opening over the page; each edit is handed back to done
  function open(block: any, done: any, _options?: unknown, host?: any) {
    E = { src: '', M: null, arm: null, view: { ox: 0, oy: 0, k: 40 }, undo: [], redo: [], pending: null, done, drag: null, hover: null, ghost: null, multi: null, codeAt: null, codeTimer: null };
    // choosing one item (E.sel = i, or null) ends a multiple selection
    let sel1: any = null;
    Object.defineProperty(E, 'sel', { get: () => sel1, set: (v) => { sel1 = v; E.multi = null; }, enumerable: true });
    setSrc(C.fullCode(block.src || TD.CHEMLAB_DEFAULT));
    E.start = E.src;
    session.show(host);
    pal.clear();
    buildPalette(); updateTools(); renderProps(); setTip('');
    // the palette, panel and notes follow the interface language while open
    stopLocale?.();
    let first = true;
    stopLocale = onLocale(() => { if (first) { first = false; return; } if (E) { buildPalette(); renderProps(); draw(); } });
    if (session.resumed()) draw(); // back where it was left (Quick)
    else { fit(); requestAnimationFrame(() => { if (E) fit(); }); }
  }
  TD.chemlabEditor = { open, dockable: true, close: () => session.detach(), _state: () => E };
})();
