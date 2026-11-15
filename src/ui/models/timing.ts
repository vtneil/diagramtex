import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/timing.ts';
const { layout, num, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.timing = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: msg('model.timing', 'Timing'), summary: L.M.rows.length === 1 ? msg('model.timing.summary1', '1 signal · {periods} periods', { periods: num(L.maxW) }) : msg('model.timing.summary', '{n} signals · {periods} periods', { n: L.M.rows.length, periods: num(L.maxW) }), src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: `\\usepackage{tikz-timing}`, helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{"class": "wide primary", "action": "edittiming", "label": msg('model.edit.timing', 'Edit Timing…')}, {"class": "wide", "action": "copytiming", "label": msg('model.copy.timing.code', 'Copy Timing Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'edittiming') { if (TD.timingOpen) TD.timingOpen(s.id); return; }
      if (act !== 'copytiming') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.timing.code', 'Timing Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.timing.code', 'Copied timing code');
    },
  };
