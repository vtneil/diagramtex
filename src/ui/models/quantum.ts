import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/quantum.ts';
const { layout, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.qc = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "quantikz", summary: `${L.R} × ${L.C}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: "Double-click the circuit to edit it visually. Exported with ", package: `\\usetikzlibrary{quantikz2}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editqc", "label": "Edit Circuit…"}, {"class": "wide", "action": "copyqc", "label": "Copy quantikz Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editqc') { if (TD.qcOpen) TD.qcOpen(s.id); return; }
      if (act !== 'copyqc') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('quantikz Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied quantikz code';
    },
  };
