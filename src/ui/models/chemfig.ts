import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/chemfig.ts';
const { layout, counts } = panelServices;

TD.panels = TD.panels || {};
TD.panels.chemfig = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "Chemistry", summary: `${counts(L)}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: "Double-click the block to edit it visually. Exported with ", package: `\\usepackage{chemfig}`, helpAfter: "; builds with pdfLaTeX.",
        actions: [{"class": "wide primary", "action": "editchem", "label": "Edit Chemistry…"}, {"class": "wide", "action": "copychem", "label": "Copy chemfig Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editchem') { if (TD.chemOpen) TD.chemOpen(s.id); return; }
      if (act !== 'copychem') return;
      const txt = String(s.src || '').trim() + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('chemfig Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied chemfig code';
    },
  };
