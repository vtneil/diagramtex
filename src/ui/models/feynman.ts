import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/feynman.ts';
const { layout, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.feynman = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "Feynman", summary: `${L.M.vertices.length} vertices · ${L.M.edges.length} lines`, src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: `\\usepackage{tikz-feynman}`, helpAfter: "; builds with pdfLaTeX.",
        actions: [{"class": "wide primary", "action": "editfeyn", "label": "Edit Feynman…"}, {"class": "wide", "action": "copyfeyn", "label": "Copy Feynman Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editfeyn') { if (TD.feynOpen) TD.feynOpen(s.id); return; }
      if (act !== 'copyfeyn') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Feynman Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied Feynman code';
    },
  };
