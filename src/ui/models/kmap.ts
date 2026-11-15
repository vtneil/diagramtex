import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/kmap.ts';
const { layout, varsOf, fullCode } = panelServices;

TD.panels = TD.panels || {};
TD.panels.kmap = {
    model(s) {
      const L = layout(s), M = L.M, n = varsOf(M.X, M.Y, M.Z);
      return { kind: 'source' as const, title: msg('ui.karnaugh.map', 'Karnaugh map'), summary: M.groups.length === 1 ? msg('model.kmap.summary1', '{n} variables · 1 group', { n }) : msg('model.kmap.summary', '{n} variables · {groups} groups', { n, groups: M.groups.length }), src: s.src,
        rows: 8, warnings: L.warnings, helpBefore: msg('model.help.map', 'Double-click the map to edit it visually. Exported with '), package: `\\usepackage{karnaugh-map}`, helpAfter: ".",
        actions: [{"class": "wide primary", "action": "editkmap", "label": msg('model.edit.karnaugh.map', 'Edit Karnaugh Map…')}, {"class": "wide", "action": "copykmap", "label": msg('model.copy.karnaugh.map.code', 'Copy Karnaugh Map Code')}] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editkmap') { if (TD.kmapOpen) TD.kmapOpen(s.id); return; }
      if (act !== 'copykmap') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.karnaugh.map.code', 'Karnaugh Map Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.karnaugh.map.code', 'Copied Karnaugh map code');
    },
  };
