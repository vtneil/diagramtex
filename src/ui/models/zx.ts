import { runtime as TD } from '../../runtime';
import { layout, fullCode } from '../../domain/zx.ts';

TD.panels = TD.panels || {};
TD.panels.zx = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "ZX", summary: `${L.R} × ${L.C}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: "Double-click the diagram to edit it visually. Exported with ", package: `\\usepackage{zx-calculus}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editzx", "label": "Edit ZX…"}, {"class": "wide", "action": "copyzx", "label": "Copy ZX Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editzx') { if (TD.zxOpen) TD.zxOpen(s.id); return; }
      if (act !== 'copyzx') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('ZX Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied ZX code';
    },
  };
