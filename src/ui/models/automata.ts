import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/automata.ts';
const { layout, libsOf, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.automata = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: msg('ui.state.machine', 'State machine'), summary: msg('model.fsm.summary', '{states} states · {edges} transitions', { states: L.M.states.length, edges: L.M.edges.length }), src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: `\\usetikzlibrary{${libsOf(s.src).join(', ')}}`, helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{"class": "wide primary", "action": "editfsm", "label": msg('model.edit.state.machine', 'Edit State Machine…')}, {"class": "wide", "action": "copyfsm", "label": msg('ui.copy.tikz.code', 'Copy TikZ Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editfsm') { if (TD.fsmOpen) TD.fsmOpen(s.id); return; }
      if (act !== 'copyfsm') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.state.machine.code', 'State Machine Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.tikz.code', 'Copied TikZ code');
    },
  };
