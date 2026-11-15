import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/feynman.ts';
const { layout, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.feynman = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: msg('model.feynman', 'Feynman'), summary: msg('model.feyn.summary', '{vertices} vertices · {lines} lines', { vertices: L.M.vertices.length, lines: L.M.edges.length }), src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: `\\usepackage{tikz-feynman}`, helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{"class": "wide primary", "action": "editfeyn", "label": msg('model.edit.feynman', 'Edit Feynman…')}, {"class": "wide", "action": "copyfeyn", "label": msg('model.copy.feynman.code', 'Copy Feynman Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editfeyn') { if (TD.feynOpen) TD.feynOpen(s.id); return; }
      if (act !== 'copyfeyn') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.feynman.code', 'Feynman Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.feynman.code', 'Copied Feynman code');
    },
  };
