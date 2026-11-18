import { onLocale } from '../i18n';
import { blockCaption } from '../i18n/shapes';
// Typed extension registry. Domain modules register behavior; the app owns transactions.
import type { Shape } from './contracts';
import type { EditorHost, EditorMemo } from './editor-session';
export interface Box { x: number; y: number; w: number; h: number }
export interface PositionedShape extends Shape { x: number; y: number; src: string }
export interface BlockResult { src: string; [key: string]: unknown }
/** An editor view. A dockable one can also open embedded in a pane (Quick), handing back every edit, until close(). */
export interface BlockEditorView {
  open(shape: PositionedShape, done: (result: BlockResult) => void, options?: unknown, host?: EditorHost): void;
  dockable?: boolean;
  close?(): void;
}
export interface BlockEditor {
  get(): BlockEditorView | null | undefined;
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
        button.innerHTML = menu.icon;
        const text = document.createTextNode('');
        button.appendChild(text);
        // captions follow the interface language (src/i18n/shapes.ts); English is the definition's own
        onLocale(() => { button.title = blockCaption(type, 'title', menu.title); text.data = blockCaption(type, 'label', menu.label); });
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
    // Quick: blocks whose editor can be embedded in a pane
    dockable: (type: string) => !!definitions.get(type)?.editor?.get()?.dockable,
    // Embed the block's editor in `dock`, editing `shape` in place; changed() follows every edit. Nothing on the
    // canvas is touched, so the layout shift that keeps a placed block still is not needed here. `memo` reopens it
    // where it was left (view, selection, undo history); keep() receives that memo when it is taken out again.
    dock(shape: PositionedShape, dock: HTMLElement, changed: (shape: PositionedShape) => void, memo?: EditorMemo | null, keep?: (memo: EditorMemo) => void) {
      const editor = definitions.get(shape.type)?.editor, view = editor?.get();
      if (!editor || !view?.dockable || (editor.available && !editor.available())) return false;
      if (editor.prepare) editor.prepare(shape);
      view.open(shape, (result) => {
        if (editor.apply) editor.apply(shape, result); else shape.src = result.src;
        changed(shape);
      }, editor.options ? editor.options() : undefined, { dock, memo, keep });
      return true;
    },
    undock(type: string) { definitions.get(type)?.editor?.get()?.close?.(); },
  };
}
