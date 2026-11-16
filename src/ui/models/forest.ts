import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { layout, fullCode } from '../../domain/forest.ts';

TD.panels = TD.panels || {};
TD.panels.forest = {
    model(s) {
      const L = layout(s);
      const pkg = `\\usepackage${L.libs.filter((l: any) => !l.startsWith('tikz:')).length ? `[${L.libs.filter((l: any) => !l.startsWith('tikz:')).join(', ')}]` : ''}{forest}`;
      return { kind: 'source' as const, title: "forest", summary: L.n === 1 ? msg('model.forest.summary1', '1 node') : msg('model.forest.summary', '{n} nodes', { n: L.n }), src: s.src,
        rows: 7, warnings: L.warnings, helpBefore: msg('model.help.tree', 'Double-click the tree to edit it visually. Exported with '), package: pkg, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editft", "label": msg('model.edit.tree', 'Edit Tree…')}, {"class": "wide", "action": "copyft", "label": msg('model.copy.forest.code', 'Copy forest Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editft') { if (TD.ftOpen) TD.ftOpen(s.id); return; }
      if (act !== 'copyft') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.forest.code', 'forest Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.forest.code', 'Copied forest code');
    },
  };
