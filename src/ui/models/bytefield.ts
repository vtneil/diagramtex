import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/bytefield.ts';
const { layout, summary, exportCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.bytefield = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: msg('ui.bit.field', 'Bit field'), summary: `${summary(L)}`, src: s.src,
        rows: 8, warnings: L.warnings, helpBefore: msg('model.help.field', 'Double-click the field to edit it visually. Exported with '), package: `\\usepackage{bytefield}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editbf", "label": msg('model.edit.bit.field', 'Edit Bit Field…')}, {"class": "wide", "action": "copybf", "label": msg('model.copy.bit.field.code', 'Copy Bit Field Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editbf') { if (TD.bytefieldOpen) TD.bytefieldOpen(s.id); return; }
      if (act !== 'copybf') return;
      const txt = exportCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.bit.field.code', 'Bit Field Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.bit.field.code', 'Copied bit field code');
    },
  };
