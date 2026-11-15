import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
// The Table block's panel: its LaTeX (the tabular it exports, editable: the table follows), Edit Table… (the Table
// workspace) and Copy. The block itself is in src/domain/table/index.ts.
TD.panels = TD.panels || {};
// the code typed while it doesn't read as a table yet: kept in the field, with a note, until it does
let typed: { id: string; src: string } | null = null;
TD.panels.table = {
  model(s: any) {
    const T = TD.table, B = TD.tableBlock, r = B.blockLatex(s.table);
    const bad = typed && typed.id === s.id;
    const nr = T.nRows(s.table), nc = T.nCols(s.table);
    const pk = r.packages.map((p: string) => (/\{([^}]*)\}$/.exec(p) || [])[1]).filter((n: string) => n && n !== 'xcolor');
    return { kind: 'source' as const, title: msg('ui.table', 'Table'), summary: `${nr} × ${nc}`, src: bad ? typed!.src : r.code,
      rows: 10, warnings: bad ? [msg('model.table.bad', 'This doesn’t read as a table yet: the table keeps its last version.')] : [],
      helpBefore: pk.length ? msg('model.table.helpWith', 'Double-click the table to edit it in the Table workspace. Exported as a tabular in a node with ') : msg('model.table.help', 'Double-click the table to edit it in the Table workspace. Exported as a tabular in a node.'), package: pk.length ? `\\usepackage{${pk.join(', ')}}` : '', helpAfter: pk.length ? '.' : '',
      actions: [{ class: 'wide primary', action: 'edittable', label: msg('model.edit.table', 'Edit Table…') }, { class: 'wide', action: 'copytable', label: msg('model.copy.table.code', 'Copy Table Code') }] };
  },
  apply(s: any, t: any) {
    if (t.dataset.p !== 'src') return false;
    const r = TD.tableBlock.TABLE_RE.exec(t.value) && TD.tableBlock.readTable(t.value); // a whole environment that reads as a table
    if (r) { s.table = r.table; typed = null; } else typed = { id: s.id, src: t.value };
    return false;
  },
  action(s: any, act: string) {
    if (act === 'edittable') { if (TD.tableOpen) TD.tableOpen(s.id); return; }
    if (act !== 'copytable') return;
    const r = TD.tableBlock.blockLatex(s.table);
    const txt = (r.packages.length ? `% Preamble: ${r.packages.join(' ')}\n` : '') + r.code + '\n';
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.table.code', 'Table Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
    return t('model.copied.the.table.code', 'Copied the table code');
  },
};
