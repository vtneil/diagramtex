import { conformNumbers } from './conform';
import type { Block, DiagramDocument, FileKind, PageSettings, Shape, Sheet } from './contracts';

export function normalizeKind(kind?: string): FileKind {
  return kind === 'page' || kind === 'board' ? kind : 'classic';
}

export function createDocumentFactory({ uid, upgrade, pageDefaults, onDropped }: {
  uid(): string;
  /** Repairs a shape in place; false when the shape cannot be drawn, and it is left out. */
  upgrade(shape: Shape): boolean | void;
  /** Told how many shapes were left out of a document. */
  onDropped?(count: number): void;
  pageDefaults: PageSettings;
}) {
  return function makeDocument(name?: string, blocks?: Block[], active?: number,
    page?: PageSettings, savedSheet?: Partial<Sheet>, kind?: string): DiagramDocument {
    // ids are unique within a document (history is keyed by them): a repeated or missing one gets a new id
    const seen = new Set<string>();
    let dropped = 0;
    const fix = (shape: Shape) => {
      if (!shape || typeof shape !== 'object') { dropped++; return false; }
      if (!shape.id || typeof shape.id !== 'string' || seen.has(shape.id)) shape.id = uid();
      seen.add(shape.id);
      if (upgrade(shape) === false) { dropped++; return false; }
      return true;
    };
    if (!blocks || !blocks.length) blocks = [{ type: 'diagram', shapes: [] }];
    if (!blocks.some(b => b.type === 'diagram')) blocks.push({ type: 'diagram', shapes: [] });
    for (const block of blocks) if (block.type === 'diagram') {
      block.shapes = block.shapes || [];
      block.shapes = block.shapes.filter(fix);
    }
    if (!(active !== undefined && blocks[active]?.type === 'diagram')) {
      active = blocks.findIndex(b => b.type === 'diagram');
    }
    const cleanGuides = (owner: { guides?: any[] }) => {
      if (!Array.isArray(owner.guides)) { delete owner.guides; return; }
      const ids = new Set<string>();
      owner.guides = owner.guides.filter(g => g && (g.axis === 'x' || g.axis === 'y') && typeof g.position === 'number' && Number.isFinite(g.position)).map(g => {
        const id = typeof g.id === 'string' && g.id && !ids.has(g.id) ? g.id : uid(); ids.add(id);
        return { id, axis: g.axis, position: g.position };
      });
    };
    for (const block of blocks) cleanGuides(block);
    const sheet: Sheet = { pages: 1, shapes: [], ...savedSheet };
    cleanGuides(sheet);
    sheet.shapes = (Array.isArray(sheet.shapes) ? sheet.shapes : []).filter(fix);
    if (dropped) onDropped?.(dropped);
    const fullPage = { ...pageDefaults, ...page };
    conformNumbers(fullPage as unknown as Record<string, unknown>, pageDefaults as unknown as Record<string, unknown>);
    sheet.pages = Math.max(1, Math.floor(Number(sheet.pages)) || 1);
    const doc = { kind: normalizeKind(kind), name: name || 'Untitled', blocks, active: active!,
      page: fullPage, sheet } as DiagramDocument;
    Object.defineProperty(doc, 'shapes', {
      get: () => doc.kind === 'page' ? doc.sheet.shapes : doc.blocks[doc.active].shapes,
      set: (value: Shape[]) => { if (doc.kind === 'page') doc.sheet.shapes = value; else doc.blocks[doc.active].shapes = value; },
      enumerable: false,
    });
    return doc;
  };
}
