// Common code-editor history and save/discard lifecycle. Domain gestures and rendering stay local.
(function () {
  const TD = window.TD;
  /**
   * @param {{state: function(): Object, snapshot: function(): string,
   * restore: function(string): void, updateTools: function(): void}} hooks
   * History state is owned by each open session; a reopened editor cannot reuse another session's undo.
   */
  function history(hooks) {
    const { state, snapshot, restore, updateTools } = hooks;
    function begin() { const e = state(); if (e.pending == null) e.pending = snapshot(); }
    function commit() {
      const e = state();
      if (e.pending == null) return;
      const now = snapshot();
      if (now !== e.pending) { e.undo.push(e.pending); if (e.undo.length > 200) e.undo.shift(); e.redo = []; }
      e.pending = null;
      updateTools();
    }
    function undo() { commit(); const e = state(); if (!e.undo.length) return; e.redo.push(snapshot()); restore(e.undo.pop()); }
    function redo() { commit(); const e = state(); if (!e.redo.length) return; e.undo.push(snapshot()); restore(e.redo.pop()); }
    return { begin, commit, undo, redo };
  }
  /**
   * The editor supplies its source reader, pending-edit commit and domain cleanup. Prompts and
   * save-baseline timing match the original K-map/bit-field editors, including save-without-closing.
   */
  function lifecycle({ state, clear, snapshot, commit, root, code, readCode, setTip, tip, discardTitle, beforeClose }) {
    TD.unsaved.push(() => !!state() && snapshot() !== state().start);
    function save() {
      if (document.activeElement === code) readCode();
      commit();
      const e = state(), src = snapshot();
      if (src !== e.start) { e.start = src; e.done({ src }); }
      setTip('Saved to the page');
      setTimeout(() => { if (state()) setTipAfterSave(); }, 1500);
    }
    // Avoid erasing a newer, domain-specific hint while the saved message's timer is pending.
    function setTipAfterSave() {
      if (tip && tip.textContent === 'Saved to the page') setTip('');
    }
    async function finish(ok) {
      if (!state()) return;
      if (beforeClose) beforeClose();
      if (document.activeElement === code) readCode();
      if (document.activeElement && root.contains(document.activeElement)) document.activeElement.blur();
      commit();
      const e = state(), src = snapshot(), changed = src !== e.start;
      if (!ok && changed && !(await TD.confirm(discardTitle, 'Your edits since opening the editor will be lost.', { ok: 'Discard', danger: true }))) return;
      const done = e.done;
      root.hidden = true;
      document.body.classList.remove('cz-open');
      clear();
      if (ok && changed) done({ src });
    }
    return { save, finish };
  }
  TD.editorSession = { history, lifecycle };
})();
