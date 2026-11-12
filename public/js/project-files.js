// Project-file codec and legacy migrations. No DOM, storage or editor state dependencies.
// Version 3 is intentionally unchanged: saved files and embedded-source round trips keep their format.
(function () {
  const TD = window.TD, TYPES = TD.TYPES;
  const VERSION = 3;
  const normKind = (k) => (k === 'page' || k === 'board' ? k : 'classic');
  const validShapes = (a) => Array.isArray(a) && a.every((s) => s && TYPES[s.type]);
  // object types that were taken out of the app: dropped when a file or copy holding one opens
  const RETIRED = { sketch3d: '3D sketch' };
  function dropRetired(shapes) {
    if (!Array.isArray(shapes)) return { shapes, gone: 0 };
    const kept = shapes.filter((s) => !(s && RETIRED[s.type]));
    return { shapes: kept, gone: shapes.length - kept.length };
  }
  // the same over a stored or opened file ({ shapes } / { blocks } / { sheet }); returns how many went
  function dropRetiredDoc(d) {
    let gone = 0;
    const take = (o, k) => { if (o && Array.isArray(o[k])) { const r = dropRetired(o[k]); o[k] = r.shapes; gone += r.gone; } };
    take(d, 'shapes'); take(d && d.sheet, 'shapes');
    for (const b of (d && d.blocks) || []) take(b, 'shapes');
    return gone;
  }
  function projectJson(d) {
    return JSON.stringify({ app: 'diagramtex', version: VERSION, kind: normKind(d.kind), name: d.name, page: d.page,
      ...(d.kind === 'page' ? { sheet: d.sheet } : { blocks: d.blocks || [{ type: 'diagram', shapes: d.shapes || [] }] }) }, null, 1);
  }
  function parseProject(text, fallbackName, onRetired = () => {}) {
    let d; try { d = JSON.parse(text); } catch { return false; }
    if (!d || typeof d !== 'object') return false;
    const name = d.name || fallbackName || 'Untitled';
    onRetired(dropRetiredDoc(d));
    if (d.kind === 'page') {
      if (!d.sheet || !validShapes(d.sheet.shapes)) throw new Error('not a DiagramTeX page file');
      return { kind: 'page', name, page: d.page, sheet: { pages: Math.max(1, d.sheet.pages | 0), shapes: d.sheet.shapes, ...(d.sheet.vars ? { vars: d.sheet.vars } : {}) } };
    }
    let blocks = d.blocks || (Array.isArray(d.shapes) ? [{ type: 'diagram', shapes: d.shapes }] : null);
    if (!Array.isArray(blocks) || blocks.some((b) => b.type === 'diagram' && !validShapes(b.shapes))) throw new Error('not a DiagramTeX file');
    const kind = d.kind === 'board' ? 'board' : 'classic';
    // a whiteboard holds one diagram: imported blocks are merged onto it
    if (kind === 'board') blocks = [{ type: 'diagram', shapes: blocks.filter((b) => b.type === 'diagram').flatMap((b) => b.shapes || []) }];
    return { kind, name, page: d.page, blocks };
  }
  TD.projectFiles = { VERSION, normKind, validShapes, dropRetired, dropRetiredDoc,
    stringify: projectJson, parse: parseProject };
})();
