import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { layout, fullCode, dataFiles } from '../../domain/network.ts';

TD.panels = TD.panels || {};
TD.panels.network = {
  model(s: any) {
    const L = layout(s), files = dataFiles(s.src);
    const summary = files.length
      ? msg('model.network.summaryFiles', '{vertices} vertices · {edges} edges · {files} data files', { vertices: L.nodes.size, edges: L.edges.length, files: files.length })
      : msg('model.network.summary', '{vertices} vertices · {edges} edges', { vertices: L.nodes.size, edges: L.edges.length });
    return { kind: 'source' as const, title: msg('ui.network', 'Network'), summary, src: s.src,
      rows: 9, warnings: L.warnings, helpBefore: msg('model.help.diagram', 'Double-click the diagram to edit it visually. Exported with '), package: '\\usepackage{tikz-network}', helpAfter: msg('model.help.pdflatex', '; builds with pdfLaTeX.'),
      actions: [{ class: 'wide primary', action: 'editnetwork', label: msg('model.edit.network', 'Edit Network…') }, { class: 'wide', action: 'copynetwork', label: msg('ui.copy.tikz.code', 'Copy TikZ Code') }] };
  },
  apply(s: any, el: any) { if (el.dataset.p === 'src') s.src = el.value; return false; },
  action(s: any, act: string) {
    if (act === 'editnetwork') { if (TD.networkOpen) TD.networkOpen(s.id); return; }
    if (act !== 'copynetwork') return;
    const txt = fullCode(s.src) + '\n';
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.network.code', 'Network Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
    return t('model.copied.tikz.code', 'Copied TikZ code');
  },
};
