import type { Message } from './i18n';
import type { createBlocks } from './core/blocks';
import type { createProjectFiles } from './core/project-files';
import type { createDocumentFactory } from './core/document';
import type { createDocumentHistory } from './core/history';
import type { createEditorSession } from './core/editor-session';
import type { BlochPanelModel, PanelView, SourcePanelModel } from './ui/contracts';

export interface Runtime {
  state: import('./core/state').EditorState;
  /** Extensible registrations made by block engines and editor plug-ins. */
  [registration: string]: any;
  docStore: import('./platform/browser-store').DocumentStore & {
    ready: Promise<boolean>; flush(): void;
    on(hooks: { write?: (ok: boolean, error?: unknown) => void; remote?: (key: string) => void }): void;
  };
  blocks: ReturnType<typeof createBlocks>;
  TYPES: Record<string, any>;
  projectFiles: ReturnType<typeof createProjectFiles>;
  unsaved: (() => boolean)[];
  confirm(title: string | Message, message: string | Message, options: { ok?: string | Message; danger?: boolean }): Promise<boolean>;
  createDocumentFactory: typeof createDocumentFactory;
  createDocumentHistory: typeof createDocumentHistory;
  editorSession: ReturnType<typeof createEditorSession>;
  panelViews: Record<string, PanelView>;
  panels: Record<string, { [operation: string]: any; model(shape: any): any; apply?(...args: any[]): any; action?(...args: any[]): any }> & { bloch: { [operation: string]: any; model(shape: { src: string }): BlochPanelModel } };
  texColor: { [operation: string]: any; label(value: string, fallback?: string): string; swatch(value: string, fallback?: string): string; unwrap(value: string): string };
}
declare global {
  interface Window { TD: Runtime; TDTheme: typeof TDTheme; [external: string]: any }
  var TDTheme: { get(): string; set(theme: string): void };
}
