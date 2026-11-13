import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/automata.ts';
const { layout, libsOf, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.automata = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "State machine", summary: `${L.M.states.length} states · ${L.M.edges.length} transitions`, src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: `\\usetikzlibrary{${libsOf(s.src).join(', ')}}`, helpAfter: "; builds with pdfLaTeX.",
        actions: [{"class": "wide primary", "action": "editfsm", "label": "Edit State Machine…"}, {"class": "wide", "action": "copyfsm", "label": "Copy TikZ Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editfsm') { if (TD.fsmOpen) TD.fsmOpen(s.id); return; }
      if (act !== 'copyfsm') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('State Machine Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied TikZ code';
    },
  };
