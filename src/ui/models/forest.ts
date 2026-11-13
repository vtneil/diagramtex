import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/forest.ts';
const { layout, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.forest = {
    model(s) {
      const L = layout(s);
      const pkg = `\\usepackage${L.libs.filter((l: any) => !l.startsWith('tikz:')).length ? `[${L.libs.filter((l: any) => !l.startsWith('tikz:')).join(', ')}]` : ''}{forest}`;
      return { kind: 'source' as const, title: "forest", summary: `${L.n} node${L.n === 1 ? '' : 's'}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: "Double-click the tree to edit it visually. Exported with ", package: pkg, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editft", "label": "Edit Tree…"}, {"class": "wide", "action": "copyft", "label": "Copy forest Code"}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editft') { if (TD.ftOpen) TD.ftOpen(s.id); return; }
      if (act !== 'copyft') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('forest Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied forest code';
    },
  };
