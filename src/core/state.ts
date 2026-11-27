import type { GridStyle, GridAxes } from '../ui/canvas-grid';
import type { DiagramDocument, HistoryState } from './contracts';
export const SNAP_MODES = ['objects','grid','both','off'] as const;
export type SnapMode = typeof SNAP_MODES[number];
export interface EditorState extends HistoryState {
  vertex?: { id: string; i: number } | null;
  docId: string | null;
  mode: 'diagram' | 'document' | 'page' | 'board';
  tool: string;
  view: { x: number; y: number; zoom: number };
  grid: boolean;
  gridCm: number;
  gridStyle: GridStyle;
  /** the oblique grid's axes (degrees, as TikZ measures them) */
  gridAxes: GridAxes;
  snap: boolean;
  snapMode: SnapMode;
  defaults: { stroke: string | null; fill: unknown; width: number; dash: string; color: string; size: string | number; font: string; ballColor: string; [key: string]: unknown };
}
export function createEditorState(makeDocument: (name?: string) => DiagramDocument): EditorState {
  return {
    docId: null, doc: makeDocument('Untitled'), mode: 'diagram', sel: new Set(), tool: 'select',
    view: { x: -60, y: -60, zoom: 1 }, grid: true, gridCm: 0.25, gridStyle: 'grid', gridAxes: [0, 45], snap: true, snapMode: 'both',
    defaults: { stroke: '#000000', fill: null, width: 1, dash: 'solid', color: '#000000', size: 'normalsize', font: 'default', ballColor: '#a05a5a' },
    undo: [], redo: [],
  };
}
