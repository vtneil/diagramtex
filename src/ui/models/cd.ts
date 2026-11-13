import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/cd.ts';
const { layout, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.cd = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "tikz-cd", summary: `${L.R} × ${L.C}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: `\\usepackage{tikz-cd}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editcd", "label": "Edit Diagram…"}, {"class": "wide", "action": "copycd", "label": "Copy tikz-cd Code"}, {"class": "wide", "action": "toXy", "label": "Convert to xymatrix"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editcd') { if (TD.cdOpen) TD.cdOpen(s.id); return; }
      if (act === 'toXy') return TD.xy.switchType(s);
      if (act !== 'copycd') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('tikz-cd Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied tikz-cd code';
    },
  };
