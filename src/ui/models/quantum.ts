import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { layout, fullCode } from '../../domain/quantum.ts';

TD.panels = TD.panels || {};
TD.panels.qc = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: "quantikz", summary: `${L.R} × ${L.C}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: msg('model.help.circuit', 'Double-click the circuit to edit it visually. Exported with '), package: `\\usetikzlibrary{${s.lib === 'quantikz' ? 'quantikz' : 'quantikz2'}}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editqc", "label": msg('ui.edit.circuit', 'Edit Circuit…')}, {"class": "wide", "action": "copyqc", "label": msg('model.copy.quantikz.code', 'Copy quantikz Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editqc') { if (TD.qcOpen) TD.qcOpen(s.id); return; }
      if (act !== 'copyqc') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.quantikz.code', 'quantikz Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.quantikz.code', 'Copied quantikz code');
    },
  };
