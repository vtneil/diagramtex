/** Persisted domain objects stay extensible; each engine owns its additional fields. */
export interface Shape {
  id: string;
  type: string;
  [key: string]: any;
}
export type FileKind = 'classic' | 'board' | 'page';
export interface ShapeOwner {
  /** Optional navigation name for Classic diagram blocks. */
  name?: string;
  shapes: Shape[];
  vars?: Record<string, string>;
}
export interface Block extends ShapeOwner {
  type: string;
  [key: string]: any;
}
export interface Sheet extends ShapeOwner { pages: number }
export interface PageSettings { [key: string]: any }
export interface DiagramDocument {
  kind: FileKind;
  name: string;
  blocks: Block[];
  active: number;
  page: PageSettings;
  sheet: Sheet;
  /** A live, non-enumerable alias for the active diagram or page sheet. */
  shapes: Shape[];
}
export type ShapeChange = [id: string, json: string, position: number];
export interface HistoryStep {
  before: ShapeChange[];
  after: ShapeChange[];
  size: number;
  ib?: string[];
  ia?: string[];
  pb?: number;
  pa?: number;
  vb?: string;
  va?: string;
  nb?: string;
  na?: string;
  /** when it was done (or redone), and when it was last undone: `stamp()` order across every file */
  t?: number;
  r?: number;
}
export interface HistoryState {
  doc: DiagramDocument;
  sel: Set<string>;
  undo: HistoryStep[];
  redo: HistoryStep[];
}
export interface SourceSession {
  pending: string | null;
  undo: string[];
  redo: string[];
  start: string;
  done(result: { src: string }): void;
}
