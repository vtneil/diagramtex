// Typed extension registry. Domain modules register behavior; the app owns transactions.
import type { Shape } from './contracts';
export interface Box { x: number; y: number; w: number; h: number }
export interface PositionedShape extends Shape { x: number; y: number; src: string }
export interface BlockResult { src: string; [key: string]: unknown }
export interface BlockEditor {
  get(): { open(shape: PositionedShape, done: (result: BlockResult) => void, options?: unknown): void } | null | undefined;
  alias: string;
  available?(): boolean;
  prepare?(shape: PositionedShape): void;
  options?(): unknown;
  apply?(target: PositionedShape, result: BlockResult): void;
  layout?(shape: PositionedShape): { bb: Box; empty?: boolean };
  keepEmptyBounds?: boolean;
}
export interface BlockDefinition {
  menu: { order: number; label: string; title: string; icon: string; flyout?: string };
  fixed: boolean;
  geometry?: string[][];
  refreshOnDoubleClick?: boolean;
  nodeImport?: { order: number; re: RegExp; bb?(shape: PositionedShape): Box; opts?: unknown; dedent?: boolean; place?(...args: any[]): any };
  editor?: BlockEditor;
}
export function createBlocks(types: Record<string, unknown>, alias: (name: string, open: (id: string) => unknown) => void) {
  const definitions = new Map<string, BlockDefinition>();
  let openById: ((id: string) => unknown) | null = null;
  return {
    register(type: string, definition: BlockDefinition) {
      if (!types[type]) throw new Error('Block needs a shape type: ' + type);
      if (definitions.has(type)) throw new Error('Duplicate block: ' + type);
      definitions.set(type, definition);
      if (definition.editor) alias(definition.editor.alias, (id: string) => openById && openById(id));
    },
    get: (type: string) => definitions.get(type),
    entries: () => definitions.entries(),
    editable: (type: string) => !!definitions.get(type)?.editor,
    nodeImports: () => [...definitions].filter(([, b]) => b.nodeImport)
      .map(([type, b]) => ({ type, ...b.nodeImport! })).sort((a, b) => a.order - b.order),
    bindOpen(fn: (id: string) => unknown) { openById = fn; },
    renderMenu(container: HTMLElement) {
      // a block with its own toolbar menu (menu.flyout) is listed there instead
      const buttons = [...definitions].filter(([, b]) => !b.menu.flyout).sort((a, b) => a[1].menu.order - b[1].menu.order).map(([type, { menu }]) => {
        const button = document.createElement('button');
        button.dataset.insert = type;
        button.title = menu.title;
        button.innerHTML = menu.icon;
        button.appendChild(document.createTextNode(menu.label));
        return button;
      });
      container.prepend(...buttons); // keep the purposeful coming-soon entries after active blocks
    },
    // The callback receives an operation, not a detached shape: the app re-resolves the live id
    // before applying it, so deleting an object while an editor is open cannot resurrect it.
    open(shape: PositionedShape, commit: (operation: (target: PositionedShape) => void) => void) {
      const editor = definitions.get(shape.type)?.editor;
      if (!editor) return false;
      const view = editor.get();
      if (!view || (editor.available && !editor.available())) return true;
      if (editor.prepare) editor.prepare(shape);
      view.open(shape, (result) => commit((target) => {
        const was = editor.layout && editor.layout(target);
        if (editor.apply) editor.apply(target, result); else target.src = result.src;
        const now = editor.layout && editor.layout(target);
        if (was && now && (editor.keepEmptyBounds || (!was.empty && !now.empty))) {
          target.x += now.bb.x - was.bb.x;
          target.y += now.bb.y - was.bb.y;
        }
      }), editor.options ? editor.options() : undefined);
      return true;
    },
  };
}
