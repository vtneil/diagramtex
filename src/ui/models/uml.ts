import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/uml.ts';
const { layout, libsOf, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.uml = {
    model(s) {
      const L = layout(s), its: any[] = L.M.items;
      const n = its.filter((it) => it.k === 'class').length;
      const r = its.filter((it) => it.k === 'rel' || it.k === 'draw').length + its.reduce((a: number, it) => a + (it.k === 'class' ? it.inherits.length + it.implements.length : 0), 0);
      const libs = libsOf(s.src);
      return { kind: 'source' as const, title: "UML class diagram", summary: `${n} ${n === 1 ? 'class' : 'classes'} · ${r} ${r === 1 ? 'relation' : 'relations'}`, src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: `\\usepackage{pgf-umlcd}${libs.length ? `, \\usetikzlibrary{${libs.join(', ')}}` : ''}`, helpAfter: "; builds with pdfLaTeX.",
        actions: [{"class": "wide primary", "action": "edituml", "label": "Edit Class Diagram…"}, {"class": "wide", "action": "copyuml", "label": "Copy pgf-umlcd Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'edituml') { if (TD.umlOpen) TD.umlOpen(s.id); return; }
      if (act !== 'copyuml') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Class Diagram Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied pgf-umlcd code';
    },
  };
