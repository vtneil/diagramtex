import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/kmap.ts';
const { layout, varsOf, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.kmap = {
    model(s) {
      const L = layout(s), M = L.M, n = varsOf(M.X, M.Y, M.Z);
      return { kind: 'source' as const, title: "Karnaugh map", summary: `${n} variables · ${M.groups.length} group${M.groups.length === 1 ? '' : 's'}`, src: s.src,
        rows: 8, warnings: L.warnings, helpBefore: "Double-click the map to edit it visually. Exported with ", package: `\\usepackage{karnaugh-map}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editkmap", "label": "Edit Karnaugh Map…"}, {"class": "wide", "action": "copykmap", "label": "Copy Karnaugh Map Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editkmap') { if (TD.kmapOpen) TD.kmapOpen(s.id); return; }
      if (act !== 'copykmap') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Karnaugh Map Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied Karnaugh map code';
    },
  };
