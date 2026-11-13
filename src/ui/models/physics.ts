import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/physics.ts';
const { solve, KIND } = panelServices;

TD.panels = TD.panels || {};
TD.panels.physics = {
    model(s) {
      const R = solve(s.src);
      return { src: s.src, domain: R.domain ? R.domain.label : 'no domain', warnings: R.warnings.map((w: any) => w.msg),
        results: R.results.map((r: any) => ({ ...r, status: (KIND[r.kind] || KIND.exact)[0], title: (KIND[r.kind] || KIND.exact)[1] + (r.note ? ' — ' + r.note : '') })) };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editphysics') { if (TD.physicsOpen) TD.physicsOpen(s.id); return; }
      if (act !== 'copyphysics') return;
      const txt = TD.toTikz([s], { standalone: false });
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('TikZ Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied TikZ code';
    },
  };
