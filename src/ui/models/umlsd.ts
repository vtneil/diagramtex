import { runtime as TD } from '../../runtime';
import { sdPanelServices } from '../../domain/umlsd.ts';

TD.panels = TD.panels || {};
TD.panels.umlsd = {
    model(s) {
      const L = sdPanelServices.layout(s), n = L.order.length, m = L.lines.filter((l: any) => !l.ret).length;
      return { kind: 'source' as const, title: "UML sequence diagram", summary: `${n} ${n === 1 ? 'instance' : 'instances'} · ${m} ${m === 1 ? 'message' : 'messages'}`, src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: '\\usepackage{pgf-umlsd}', helpAfter: "; builds with pdfLaTeX.",
        actions: [{"class": "wide primary", "action": "editumlsd", "label": "Edit Sequence Diagram…"}, {"class": "wide", "action": "copyumlsd", "label": "Copy pgf-umlsd Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editumlsd') { if (TD.umlsdOpen) TD.umlsdOpen(s.id); return; }
      if (act !== 'copyumlsd') return;
      const txt = sdPanelServices.fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Sequence Diagram Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied pgf-umlsd code';
    },
  };
