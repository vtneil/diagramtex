// Project-file codec and legacy migrations. No DOM, storage or editor state dependencies.
// Version 3 and validation order stay unchanged for existing files and round trips.
import type { Block, FileKind, PageSettings, Shape, Sheet } from './contracts';

interface ProjectInput {
  kind?: string;
  name?: string;
  page?: PageSettings;
  shapes?: Shape[];
  blocks?: Block[];
  sheet?: Partial<Sheet>;
}
export function createProjectFiles(types: Record<string, unknown>) {
  const VERSION = 3;
  const normKind = (kind?: string): FileKind => kind === 'page' || kind === 'board' ? kind : 'classic';
  const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
  const validShapes = (value: unknown): value is Shape[] => Array.isArray(value) &&
    value.every(shape => isObject(shape) && typeof shape.type === 'string' && Object.prototype.hasOwnProperty.call(types, shape.type));
  // primitive fields of untrusted JSON: a wrong type is dropped (the defaults apply), never spread into settings
  const pageOf = (value: unknown) => (isObject(value) ? value as PageSettings : undefined);
  const RETIRED: Record<string, string> = { sketch3d: '3D sketch' };
  function dropRetired(shapes: Shape[]): { shapes: Shape[]; gone: number };
  function dropRetired(shapes: unknown): { shapes: unknown; gone: number };
  function dropRetired(shapes: unknown) {
    if (!Array.isArray(shapes)) return { shapes, gone: 0 };
    const kept = shapes.filter(shape => !(shape && Object.prototype.hasOwnProperty.call(RETIRED, shape.type)));
    return { shapes: kept, gone: shapes.length - kept.length };
  }
  function dropRetiredDoc(doc: ProjectInput | null | undefined) {
    let gone = 0;
    const take = (owner: { shapes?: Shape[] } | null | undefined) => {
      if (owner && Array.isArray(owner.shapes)) {
        const result = dropRetired(owner.shapes); owner.shapes = result.shapes; gone += result.gone;
      }
    };
    take(doc); take(doc?.sheet);
    for (const block of doc?.blocks || []) take(block);
    return gone;
  }
  function stringify(doc: ProjectInput) {
    return JSON.stringify({ app: 'diagramtex', version: VERSION, kind: normKind(doc.kind), name: doc.name, page: doc.page,
      ...(doc.kind === 'page' ? { sheet: doc.sheet } : { blocks: doc.blocks || [{ type: 'diagram', shapes: doc.shapes || [] }] }) }, null, 1);
  }
  function parse(text: string, fallbackName?: string, onRetired: (count: number) => void = () => {}) {
    // JSON is untrusted. Check the same structural boundaries as the original codec;
    // legacy shape-specific normalization still runs in document construction.
    let doc: ProjectInput;
    try { doc = JSON.parse(text); } catch { return false; }
    if (!doc || typeof doc !== 'object') return false;
    const name = (typeof doc.name === 'string' && doc.name) || fallbackName || 'Untitled';
    onRetired(dropRetiredDoc(doc));
    if (doc.kind === 'page') {
      if (!doc.sheet || !validShapes(doc.sheet.shapes)) throw new Error('not a DiagramTeX page file');
      return { kind: 'page' as const, name, page: pageOf(doc.page),
        sheet: { pages: Math.max(1, (doc.sheet.pages ?? 0) | 0), shapes: doc.sheet.shapes,
          ...(isObject(doc.sheet.vars) ? { vars: doc.sheet.vars } : {}),
          ...(Array.isArray(doc.sheet.guides) ? { guides: doc.sheet.guides } : {}) } };
    }
    let blocks = doc.blocks || (Array.isArray(doc.shapes) ? [{ type: 'diagram', shapes: doc.shapes }] : null);
    if (!Array.isArray(blocks) || blocks.some(block => !isObject(block) || typeof block.type !== 'string' || (block.type === 'diagram' && !validShapes(block.shapes)))) {
      throw new Error('not a DiagramTeX file');
    }
    const kind = doc.kind === 'board' ? 'board' : 'classic';
    if (kind === 'board') {
      const diagrams = blocks.filter(block => block.type === 'diagram'), guides = diagrams.flatMap(block => block.guides || []);
      blocks = [{ type: 'diagram', shapes: diagrams.flatMap(block => block.shapes || []), ...(guides.length ? { guides } : {}) }];
    }
    return { kind, name, page: pageOf(doc.page), blocks };
  }
  return { VERSION, normKind, validShapes, dropRetired, dropRetiredDoc, stringify, parse };
}
