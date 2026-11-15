import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/uml.ts';
const { layout, libsOf, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.uml = {
    model(s) {
      const L = layout(s), its: any[] = L.M.items;
      const n = its.filter((it) => it.k === 'class').length;
      const r = its.filter((it) => it.k === 'rel' || it.k === 'draw').length + its.reduce((a: number, it) => a + (it.k === 'class' ? it.inherits.length + it.implements.length : 0), 0);
      const libs = libsOf(s.src);
      return { kind: 'source' as const, title: msg('model.uml.class.diagram', 'UML class diagram'), summary: msg('model.uml.summary', '{classes} · {relations}', { classes: n === 1 ? t('model.uml.class1', '1 class') : t('model.uml.classes', '{n} classes', { n }), relations: r === 1 ? t('model.uml.rel1', '1 relation') : t('model.uml.rels', '{n} relations', { n: r }) }), src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: `\\usepackage{pgf-umlcd}${libs.length ? `, \\usetikzlibrary{${libs.join(', ')}}` : ''}`, helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{"class": "wide primary", "action": "edituml", "label": msg('model.edit.class.diagram', 'Edit Class Diagram…')}, {"class": "wide", "action": "copyuml", "label": msg('model.copy.pgf.umlcd.code', 'Copy pgf-umlcd Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'edituml') { if (TD.umlOpen) TD.umlOpen(s.id); return; }
      if (act !== 'copyuml') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.class.diagram.code', 'Class Diagram Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.pgf.umlcd.code', 'Copied pgf-umlcd code');
    },
  };
