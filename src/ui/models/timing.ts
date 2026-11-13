import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/timing.ts';
const { layout, num, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.timing = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "Timing", summary: `${L.M.rows.length} signal${L.M.rows.length === 1 ? '' : 's'} · ${num(L.maxW)} periods`, src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: `\\usepackage{tikz-timing}`, helpAfter: "; builds with pdfLaTeX.",
        actions: [{"class": "wide primary", "action": "edittiming", "label": "Edit Timing…"}, {"class": "wide", "action": "copytiming", "label": "Copy Timing Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'edittiming') { if (TD.timingOpen) TD.timingOpen(s.id); return; }
      if (act !== 'copytiming') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Timing Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied timing code';
    },
  };
