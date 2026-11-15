import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/chemfig.ts';
const { layout, counts } = panelServices;

TD.panels = TD.panels || {};
TD.panels.chemfig = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: msg('ui.chemistry', 'Chemistry'), summary: `${counts(L)}`, src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: msg('model.help.block', 'Double-click the block to edit it visually. Exported with '), package: `\\usepackage{chemfig}`, helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{"class": "wide primary", "action": "editchem", "label": msg('model.edit.chemistry', 'Edit Chemistry…')}, {"class": "wide", "action": "copychem", "label": msg('model.copy.chemfig.code', 'Copy chemfig Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editchem') { if (TD.chemOpen) TD.chemOpen(s.id); return; }
      if (act !== 'copychem') return;
      const txt = String(s.src || '').trim() + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.chemfig.code', 'chemfig Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.chemfig.code', 'Copied chemfig code');
    },
  };
