import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/xy.ts';
const { layout, switchType, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.xy = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "xymatrix", summary: `${L.R} × ${L.C}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: `\\usepackage[all]{xy}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editxy", "label": "Edit Diagram…"}, {"class": "wide", "action": "copyxy", "label": "Copy xymatrix Code"}, {"class": "wide", "action": "toCd", "label": "Convert to tikz-cd"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editxy') { if (TD.xyOpen) TD.xyOpen(s.id); return; }
      if (act === 'toCd') return switchType(s);
      if (act !== 'copyxy') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('xymatrix Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied xymatrix code';
    },
  };
