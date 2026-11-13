import { runtime as TD } from '../../runtime';
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
    return { kind: 'source' as const, title: 'Table', summary: `${nr} × ${nc}`, src: bad ? typed!.src : r.code,
      rows: 10, warnings: bad ? ['This doesn’t read as a table yet: the table keeps its last version.'] : [],
      helpBefore: `Double-click the table to edit it in the Table workspace. Exported as a tabular in a node${pk.length ? ' with ' : '.'}`, package: pk.length ? `\\usepackage{${pk.join(', ')}}` : '', helpAfter: pk.length ? '.' : '',
      actions: [{ class: 'wide primary', action: 'edittable', label: 'Edit Table…' }, { class: 'wide', action: 'copytable', label: 'Copy Table Code' }] };
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
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt('Table Code', txt, { multiline: true, readonly: true, message: 'Copying failed: select the code and copy it yourself.', ok: 'Done', cancel: null }));
    return 'Copied the table code';
  },
};
