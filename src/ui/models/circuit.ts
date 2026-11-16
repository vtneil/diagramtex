import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { isWire, fullCode } from '../../domain/circuit.ts';

TD.panels = TD.panels || {};
TD.panels.cz = {
    model(s) {
      const parts = (s.items || []).filter((it: any) => !isWire(it)).length;
      return { parts, wires: (s.items || []).length - parts, raw: (s.raw || '').trim() ? (s.raw || '').trim().split('\n').length : 0 };
    },
    apply() { return false; },
    action(s, act) {
      if (act === 'editcz') { TD.czOpen && TD.czOpen(s.id); return; }
      if (act !== 'copycz') return;
      const txt = `\\begin{circuitikz}\n${fullCode(s)}\n\\end{circuitikz}\n`;
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.circuitikz.code', 'circuitikz Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.circuitikz.code', 'Copied circuitikz code');
    },
  };
