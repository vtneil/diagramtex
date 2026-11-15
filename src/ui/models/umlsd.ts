import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { sdPanelServices } from '../../domain/umlsd.ts';

TD.panels = TD.panels || {};
TD.panels.umlsd = {
    model(s) {
      const L = sdPanelServices.layout(s), n = L.order.length, m = L.lines.filter((l: any) => !l.ret).length;
      return { kind: 'source' as const, title: msg('model.uml.sequence.diagram', 'UML sequence diagram'), summary: msg('model.uml.summary', '{classes} · {relations}', { classes: n === 1 ? t('model.umlsd.inst1', '1 instance') : t('model.umlsd.insts', '{n} instances', { n }), relations: m === 1 ? t('model.umlsd.msg1', '1 message') : t('model.umlsd.msgs', '{n} messages', { n: m }) }), src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: '\\usepackage{pgf-umlsd}', helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{"class": "wide primary", "action": "editumlsd", "label": msg('model.edit.sequence.diagram', 'Edit Sequence Diagram…')}, {"class": "wide", "action": "copyumlsd", "label": msg('model.copy.pgf.umlsd.code', 'Copy pgf-umlsd Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editumlsd') { if (TD.umlsdOpen) TD.umlsdOpen(s.id); return; }
      if (act !== 'copyumlsd') return;
      const txt = sdPanelServices.fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.sequence.diagram.code', 'Sequence Diagram Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.pgf.umlsd.code', 'Copied pgf-umlsd code');
    },
  };
