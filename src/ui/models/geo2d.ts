import { captions } from '../../i18n/messages';
import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { panelServices } from '../../domain/geo2d.ts';
const { layout, sliders, fmt, G, fullCode } = panelServices;
import { row, section } from '../forms';

TD.panels = TD.panels || {};
TD.panels.geo2d = {
    model(s) {
      const L = layout(s.src), S = sliders(L);
      const rows = S.map((x: any) => ({ kind: 'row' as const, label: [x.name], labelClass: 'mono', labelTitle: '\\' + x.name, controls: [{ kind: 'angle' as const,
        value: x.v, numericValue: fmt(x.v, 3), unit: '',
        attrs: { 'data-g2': x.name, min: x.lo, max: x.hi, step: x.step, 'aria-label': x.name },
        numericAttrs: { 'data-g2n': x.name, step: x.step * 10, 'aria-label': x.name } }] }));
      rows.push(row(captions["ui.scale"], { kind: 'input' as const, value: fmt(L.scale, 2), attrs: { type: 'number', 'data-g2': 'scale', step: '0.25', min: '0.1' } }));
      rows.push({ kind: 'help' as const, text: [...(S.length ? [msg('geo2d.help.sliders', 'Each value set to a number in the code gets a slider. ')] : []), msg('geo2d.help.edit', 'Double-click the figure to edit it: drag points, add vectors, projections, angle marks, plots and measures.')] });
      return { sections: [section(msg('geo2d.title', '2D geometry'), rows, 'sec'),
        section('TikZ', [{ kind: 'column' as const, value: s.src, attrs: { class: 'code', 'data-p': 'src', spellcheck: 'false', rows: '12' } },
          ...L.warnings.map((text: any) => ({ kind: 'error' as const, text })),
          { kind: 'help' as const, text: [msg('geo2d.help.plain', 'Plain TikZ; angle marks add '), { code: '\\usetikzlibrary{angles, quotes}' }, msg('geo2d.help.scope', ". The picture's options go on a scope.")] }], 'sec'),
        { class: 'sec', rows: [{ kind: 'button' as const, class: 'wide primary', action: 'editgeo2d', label: msg('model.edit.2d.geometry', 'Edit 2D Geometry…') }, { kind: 'button' as const, class: 'wide', action: 'copygeo2d', label: msg('ui.copy.tikz.code', 'Copy TikZ Code') }] }]
        .map((sec, i) => i === 0 ? { ...sec, summary: 'TikZ' } : sec) };
    },
    apply(s, t) {
      if (t.dataset.p === 'src') { s.src = t.value; return false; }
      const k = t.dataset.g2 || t.dataset.g2n;
      if (!k) return false;
      const v = parseFloat(t.value);
      if (!isFinite(v)) return false;
      if (k === 'scale') { if (v > 0) s.src = G.setScale(s.src, v, true); return false; }
      const L = layout(s.src), m = L.macros.get(k);
      if (!m || !m.literal) return false;
      s.src = G.edits(s.src, [{ ...m.span, t: fmt(v, 3) }]);
      return true;
    },
    action(s, act) {
      if (act === 'editgeo2d') { if (TD.geo2dOpen) TD.geo2dOpen(s.id); return; }
      if (act !== 'copygeo2d') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('ui.tikz.code', 'TikZ Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.tikz.code', 'Copied TikZ code');
    },
  };
