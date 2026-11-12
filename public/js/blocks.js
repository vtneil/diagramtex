// Block integration contract. Classic script so public/index.html still opens without a build/server.
// Domain modules register behavior; the application supplies the document/history transaction.
(function () {
  const TD = window.TD;
  /**
   * @typedef {Object} BlockEditor
   * @property {function(): Object} get Resolve the editor at use time (editors load after models).
   * @property {string} alias Existing panel API, retained for compatibility.
   * @property {function(): boolean} [available]
   * @property {function(Object): void} [prepare]
   * @property {function(): Object} [options]
   * @property {function(Object, Object): void} [apply] Defaults to replacing src.
   * @property {function(Object): Object} [layout] Bounds used to preserve the drawing's position.
   * @property {boolean} [keepEmptyBounds] K-map/bytefield bounds are meaningful even when empty.
   */
  /**
   * @typedef {Object} BlockDefinition
   * @property {{order: number, label: string, title: string, icon: string, flyout?: string}} menu
   * @property {boolean} fixed Keep content upright during selection transforms.
   * @property {string[][]} [geometry]
   * @property {boolean} [refreshOnDoubleClick]
   * @property {Object} [nodeImport] TikZ-node recognition and package-specific placement.
   * @property {BlockEditor} [editor]
   */
  const definitions = new Map();
  let openById = null;
  TD.blocks = {
    /** @param {string} type @param {BlockDefinition} definition */
    register(type, definition) {
      if (!TD.TYPES[type]) throw new Error('Block needs a shape type: ' + type);
      if (definitions.has(type)) throw new Error('Duplicate block: ' + type);
      definitions.set(type, definition);
      if (definition.editor) TD[definition.editor.alias] = (id) => openById && openById(id);
    },
    get: (type) => definitions.get(type),
    entries: () => definitions.entries(),
    editable: (type) => !!definitions.get(type)?.editor,
    nodeImports: () => [...definitions].filter(([, b]) => b.nodeImport)
      .map(([type, b]) => ({ type, ...b.nodeImport })).sort((a, b) => a.order - b.order),
    bindOpen(fn) { openById = fn; },
    renderMenu(container) {
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
    open(shape, commit) {
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
})();
