import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { layout, switchType, fullCode } from '../../domain/xy.ts';

TD.panels = TD.panels || {};
TD.panels.xy = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "xymatrix", summary: `${L.R} × ${L.C}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: `\\usepackage[all]{xy}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editxy", "label": msg('model.edit.diagram', 'Edit Diagram…')}, {"class": "wide", "action": "copyxy", "label": msg('model.copy.xymatrix.code', 'Copy xymatrix Code')}, {"class": "wide", "action": "toCd", "label": msg('model.convert.to.tikz.cd', 'Convert to tikz-cd')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editxy') { if (TD.xyOpen) TD.xyOpen(s.id); return; }
      if (act === 'toCd') return switchType(s);
      if (act !== 'copyxy') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.xymatrix.code', 'xymatrix Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.xymatrix.code', 'Copied xymatrix code');
    },
  };
