// Register core services on the shared application context and retained debug API.
import { createProjectFiles } from './core/project-files';
import { createDocumentFactory } from './core/document';
import { createDocumentHistory } from './core/history';
import { createEditorSession } from './core/editor-session';

import { runtime } from './runtime';
runtime.createDocumentFactory = createDocumentFactory;
runtime.createDocumentHistory = createDocumentHistory;
runtime.editorSession = createEditorSession({
  unsaved: runtime.unsaved,
  // Dialog registers later in startup; resolve it at the time it is used.
  confirm: (...args) => runtime.confirm(...args),
});

runtime.projectFiles = createProjectFiles(runtime.TYPES);
