import { runtime as TD } from '../../runtime';
import { panelServices } from '../../domain/circuit.ts';
const { isWire, fullCode } = panelServices;

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
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('circuitikz Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
      return 'Copied circuitikz code';
    },
  };
