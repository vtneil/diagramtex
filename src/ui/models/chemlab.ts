import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { layout, fullCode, count } from '../../domain/chemlab.ts';

TD.panels = TD.panels || {};
TD.panels.chemlab = {
    model(s) {
      const L = layout(s), n = count(L);
      return { kind: 'source' as const, title: msg('model.chem.lab', 'Chemistry Laboratory'), summary: n === 1 ? t('editor.cl.oneThing', '1 piece of apparatus') : t('editor.cl.nThings', '{n} pieces of apparatus', { n }), src: s.src,
        rows: 9, warnings: L.warnings.map((w) => w.msg), helpBefore: msg('model.help.block', 'Double-click the block to edit it visually. Exported with '), package: '\\usepackage{tikz-chemlab}', helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{ class: 'wide primary', action: 'editchemlab', label: msg('model.edit.chem.lab', 'Edit Chemistry Laboratory…') }, { class: 'wide', action: 'copychemlab', label: msg('model.copy.chem.lab.code', 'Copy tikz-chemlab Code') }] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editchemlab') { if (TD.chemlabOpen) TD.chemlabOpen(s.id); return; }
      if (act !== 'copychemlab') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.chem.lab.code', 'tikz-chemlab Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.chem.lab.code', 'Copied tikz-chemlab code');
    },
  };
