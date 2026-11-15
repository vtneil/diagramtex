import type { GridStyle } from '../ui/canvas-grid';
import type { DiagramDocument, HistoryState } from './contracts';
export interface EditorState extends HistoryState {
  vertex?: { id: string; i: number } | null;
  docId: string | null;
  mode: 'diagram' | 'document' | 'page' | 'board';
  tool: string;
  view: { x: number; y: number; zoom: number };
  grid: boolean;
  gridCm: number;
  gridStyle: GridStyle;
  snap: boolean;
  defaults: { stroke: string | null; fill: unknown; width: number; dash: string; color: string; size: string | number; font: string; ballColor: string; [key: string]: unknown };
}
export function createEditorState(makeDocument: (name?: string) => DiagramDocument): EditorState {
  return {
    docId: null, doc: makeDocument('Untitled'), mode: 'diagram', sel: new Set(), tool: 'select',
    view: { x: -60, y: -60, zoom: 1 }, grid: true, gridCm: 0.25, gridStyle: 'grid', snap: true,
    defaults: { stroke: '#000000', fill: null, width: 1, dash: 'solid', color: '#000000', size: 'normalsize', font: 'default', ballColor: '#a05a5a' },
    undo: [], redo: [],
  };
}
