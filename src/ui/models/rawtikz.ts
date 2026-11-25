import { runtime as TD } from '../../runtime';
import { t, message as msg } from '../../i18n';
import { prevOf, refresh } from '../../domain/rawtikz.ts';

TD.panels = TD.panels || {};
TD.panels.tikz = {
    model(s) {
      const count = prevOf(s).length;
      return { count, code: s.code || '', lint: TD.lint ? TD.lint(s.code || '', { preview: false }) : [], issues: s.issues || [],
        description: s.kind === 'defs' ? msg('raw.defs', 'Definitions, exported where they were written.') : s.ctx && s.ctx.length ? msg('raw.keptScoped', 'Kept exactly as written and exported unchanged, inside the scopes it was in. Dragging it adds a shift.') : msg('raw.kept', 'Kept exactly as written and exported unchanged. Dragging it adds a shift.'),
        scopes: s.ctx || [], convert: !!count && s.kind !== 'defs',
        // drawn by pdfLaTeX, or why not (src/application/kept-preview.ts)
        drawn: TD.keptPreview ? TD.keptPreview.status(s) : { kind: 'none' } };
    },
    apply(s, t) { if (t.dataset.p === 'code') { s.code = t.value; refresh(s); } return false; },
    action(s, act) {
      if (act === 'rawdraw') {
        const mb = (n: number) => `${(n / 1e6).toFixed(n < 1e7 ? 1 : 0)} MB`;
        void TD.keptPreview.allow((done: number, total: number) => TD.app.showHint?.(t('tex.downloadingOf', 'Downloading the LaTeX engine: {done} of {total}…', { done: mb(done), total: mb(total) }), 0))
          .then(() => TD.app.showHint?.('', 0))
          .catch((e: any) => TD.app.showHint?.(t('tex.failed', 'The LaTeX engine could not start: {error}', { error: e?.message || String(e) }), 5000));
        return t('kept.starting', 'Starting the LaTeX engine…');
      }
      if (act !== 'rawconvert') return;
      const list = TD.app.state.doc.shapes, i = list.indexOf(s);
      if (i < 0) return;
      const made = prevOf(s).map((p: any) => {
        const c = JSON.parse(JSON.stringify(p));
        if (s.x || s.y) TD.translate(c, s.x || 0, s.y || 0);
        return { ...c, id: TD.app.uid() };
      });
      list.splice(i, 1, ...made);
      TD.app.state.sel = new Set(made.map((c: any) => c.id));
      return made.length === 1 ? t('raw.converted1', 'Converted to 1 shape') : t('raw.converted', 'Converted to {n} shapes', { n: made.length });
    },
  };

TD.panels.coord = {
    model(s) { return { name: s.tikzName || '' }; },
    apply(s, t) { if (t.dataset.p === 'tikzName') s.tikzName = t.value.replace(/[(),;.\s]/g, ''); return false; },
  };
