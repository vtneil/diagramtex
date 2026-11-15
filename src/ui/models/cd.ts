import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/cd.ts';
const { layout, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.cd = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "tikz-cd", summary: `${L.R} × ${L.C}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: `\\usepackage{tikz-cd}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editcd", "label": msg('model.edit.diagram', 'Edit Diagram…')}, {"class": "wide", "action": "copycd", "label": msg('model.copy.tikz.cd.code', 'Copy tikz-cd Code')}, {"class": "wide", "action": "toXy", "label": msg('model.convert.to.xymatrix', 'Convert to xymatrix')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editcd') { if (TD.cdOpen) TD.cdOpen(s.id); return; }
      if (act === 'toXy') return TD.xy.switchType(s);
      if (act !== 'copycd') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.tikz.cd.code', 'tikz-cd Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.tikz.cd.code', 'Copied tikz-cd code');
    },
  };
