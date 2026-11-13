import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/bytefield.ts';
const { layout, summary, exportCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.bytefield = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "Bit field", summary: `${summary(L)}`, src: s.src,
        rows: 8, warnings: L.warnings, helpBefore: "Double-click the field to edit it visually. Exported with ", package: `\\usepackage{bytefield}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editbf", "label": "Edit Bit Field…"}, {"class": "wide", "action": "copybf", "label": "Copy Bit Field Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editbf') { if (TD.bytefieldOpen) TD.bytefieldOpen(s.id); return; }
      if (act !== 'copybf') return;
      const txt = exportCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Bit Field Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied bit field code';
    },
  };
