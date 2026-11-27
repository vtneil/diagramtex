import { runtime as TD } from '../runtime';
import { advancedBasicExamples } from './examples/advanced-basic';
import { advancedBlockExamples } from './examples/advanced-blocks';
import { exampleReferences } from './examples/references';

// Each figure is its own editable diagram block. Fixed styles isolate it from the user's drawing defaults.
export function exampleDiagramBlocks(uid: () => string) {
  const defaults = { stroke: '#000000', fill: null, color: '#000000', ballColor: '#a05a5a', size: 'normalsize', font: 'default', width: 1.5, dash: 'solid' };
  const blocks: any[] = [{ type: 'text', text: '# Example Diagrams\nForty-two advanced, editable constructions adapted from the linked references. Double-click a diagram to enter its canvas; double-click a package-based block to open its editor. Each caption lists the tools used and links to the reference. The first two retain the original reference figures; the incline retains the corrected block and force placements.' }];
  let number = 0, shapes: any[] = [];
  const add = (type: string, tool: string, props: any = {}) => {
    const shape = { ...(TD.TYPES[type].create?.({ x: 0, y: 0 }, defaults, tool) || { type, ...defaults, opacity: 1 }), ...props, id: uid() };
    if (type === 'sym' && (!shape.w || !shape.h)) { const { x, y } = shape; TD.TYPES.sym.fix(shape); shape.x = x; shape.y = y; }
    delete shape._pw; delete shape._ph;
    shapes.push(shape); return shape;
  };
  const text = (x: number, y: number, value: string, props = {}) => add('text', 'text', { x, y, text: value, valign: 'middle', size: 17, ...props });
  const line = (x1: number, y1: number, x2: number, y2: number, props = {}) => add('line', 'line', { x1, y1, x2, y2, ...props });
  const arrow = (x1: number, y1: number, x2: number, y2: number, props = {}) => line(x1, y1, x2, y2, { endTip: 'stealth', ...props });
  const sym = (kind: string, x: number, y: number, w: number, h: number, props = {}) => add('sym', 'sym:' + kind, { x, y, w, h, ...props });
  const ellipse = (cx: number, cy: number, rx: number, ry: number, props = {}) => add('ellipse', 'ellipse', { cx, cy, rx, ry, ...props });
  const example = (title: string, tip: string, draw: () => void, credit = 'Original adaptation for DiagramTeX.') => {
    shapes = []; draw();
    const [source, url] = exampleReferences[number];
    blocks.push({ type: 'text', text: `## ${++number}. ${title}\n${tip}\nReference: \\href{${url}}{${source}}. ${credit}` }, { type: 'diagram', shapes });
  };
  const subhead = (title: string) => blocks.push({ type: 'text', text: '## ' + title });
  const clone = (items: any[]) => { for (const s of structuredClone(items)) { s.id = uid(); shapes.push(s); } };
  const tools = { add, text, line, arrow, sym, ellipse, example, clone, blue: '#2459a6', red: '#bd3b36', grey: '#777777' };
  subhead('Basic shapes and drawing tools');
  advancedBasicExamples(tools);
  subhead('Block editors, plots and 3D');
  advancedBlockExamples(tools);
  return blocks;
}
export type ExampleTools = {
  add: (type: string, tool: string, props?: any) => any;
  text: (x: number, y: number, value: string, props?: any) => any;
  line: (x1: number, y1: number, x2: number, y2: number, props?: any) => any;
  arrow: (x1: number, y1: number, x2: number, y2: number, props?: any) => any;
  sym: (kind: string, x: number, y: number, w: number, h: number, props?: any) => any;
  ellipse: (cx: number, cy: number, rx: number, ry: number, props?: any) => any;
  example: (title: string, tip: string, draw: () => void, credit?: string) => void;
  clone: (shapes: any[]) => void;
  blue: string; red: string; grey: string;
};
