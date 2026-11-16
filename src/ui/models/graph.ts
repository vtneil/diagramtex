import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { layout, libsOf, fullCode } from '../../domain/graph.ts';

TD.panels = TD.panels || {};
TD.panels.graph = {
    model(s) {
      const L = layout(s);
      return { kind: 'source' as const, title: msg('ui.graph', 'Graph'), summary: msg('model.graph.summary', '{nodes} nodes · {edges} edges', { nodes: L.M.nodes.length, edges: L.M.edges.length }), src: s.src,
        rows: 9, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: `\\usetikzlibrary{${libsOf(s.src).join(', ')}}`, helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
        actions: [{ class: 'wide primary', action: 'editgraph', label: msg('model.edit.graph', 'Edit Graph…') }, { class: 'wide', action: 'copygraph', label: msg('ui.copy.tikz.code', 'Copy TikZ Code') }] };
    },
    apply(s, t) { if (t.dataset.p === 'src') s.src = t.value; return false; },
    action(s, act) {
      if (act === 'editgraph') { if (TD.graphOpen) TD.graphOpen(s.id); return; }
      if (act !== 'copygraph') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.graph.code', 'Graph Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.tikz.code', 'Copied TikZ code');
    },
  };
