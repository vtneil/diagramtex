import { captions } from '../../i18n/messages';
import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { layout, fmt, setScale, setView, fullCode } from '../../domain/geo3d.ts';
import { row, section } from '../forms';

TD.panels = TD.panels || {};
TD.panels.geo3d = {
    model(s) {
      const L = layout(s.src), th = L.view.th, ph = L.view.ph;
      const angle = (key: any, value: any, min: any, max: any) => row(key === 'th' ? msg('geo3d.tiltTheta', 'Tilt θ') : msg('geo3d.turnPhi', 'Turn φ'), { kind: 'angle' as const, value: fmt(value, 0), numericValue: fmt(value, 0), unit: '°',
        attrs: { 'data-slider-default': key === 'th' ? 70 : 110, ['data-g3']: key, min, max, step: '1', 'aria-label': key === 'th' ? 'Tilt' : 'Turn' },
        captionAttrs: { 'aria-label': key === 'th' ? msg('geo3d.tilt', 'Tilt') : msg('geo3d.turn', 'Turn') } });
      return { sections: [
        { ...section(captions["ui.3d.geometry"], [angle('th', th, 0, 180), angle('ph', ((ph % 360) + 360) % 360, 0, 360),
          row(captions["ui.scale"], { kind: 'input' as const, value: fmt(L.scale, 2), attrs: { type: 'number', 'data-g3': 'scale', step: '0.25', min: '0.1' } }),
          { kind: 'help' as const, text: [msg('geo3d.help.edit', 'Turn the view here, or double-click the figure to edit it: drag points, add vectors, planes, angles and frames.')] }], 'sec'), summary: 'tikz-3dplot' },
        section(captions["ui.tikz.3dplot"], [{ kind: 'column' as const, value: s.src, attrs: { class: 'code', 'data-p': 'src', spellcheck: 'false', rows: '12' } },
          ...L.warnings.map((text: any) => ({ kind: 'error' as const, text })),
          { kind: 'help' as const, text: [msg('model.help.with', 'Exported with '), { code: '\\usepackage{tikz-3dplot}' }, msg('geo3d.help.scope', "; the picture's options go on a scope.")] }], 'sec'),
        { class: 'sec', rows: [{ kind: 'button' as const, class: 'wide primary', action: 'editgeo3d', label: msg('model.edit.3d.geometry', 'Edit 3D Geometry…') }, { kind: 'button' as const, class: 'wide', action: 'copygeo3d', label: msg('model.copy.tikz.3dplot.code', 'Copy tikz-3dplot Code') }] },
      ] };
    },
    apply(s, t) {
      if (t.dataset.p === 'src') { s.src = t.value; return false; }
      const k = t.dataset.g3 || t.dataset.g3n;
      if (!k) return false;
      const v = parseFloat(t.value);
      if (!isFinite(v)) return false;
      const L = layout(s.src);
      if (k === 'scale') { if (v > 0) s.src = setScale(s.src, v); return false; }
      s.src = setView(s.src, k === 'th' ? v : L.view.th, k === 'ph' ? v : L.view.ph);
      return true;
    },
    action(s, act) {
      if (act === 'editgeo3d') { if (TD.geo3dOpen) TD.geo3dOpen(s.id); return; }
      if (act !== 'copygeo3d') return;
      const txt = fullCode(s.src) + '\n';
      (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).catch(() => TD.prompt(t('model.tikz.3dplot.code', 'tikz-3dplot Code'), txt, { multiline: true, readonly: true, message: t('model.copyFailed', 'Copying failed: select the code and copy it yourself.'), ok: t('ui.done', 'Done'), cancel: null }));
      return t('model.copied.tikz.3dplot.code', 'Copied tikz-3dplot code');
    },
  };
