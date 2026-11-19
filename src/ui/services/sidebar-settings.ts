// The left sidebar's two settings, Text input (TD.input, ui/services/mathinput.ts) and LaTeX engine (TD.math,
// domain/mathengine.ts), drawn as ui/SidebarSetting.svelte into the shell's #inputBox and #engineBox. They are drawn
// again when the choice, the engine's readiness or the interface language changes; a click on a choice goes to the
// owner's set(), by its data-input / data-engine.
import { runtime as TD } from '../../runtime';
import { t, caption, onLocale } from '../../i18n';
import { renderView } from '../render-view.svelte';
import SidebarSetting from '../SidebarSetting.svelte';

(() => {
  function drawInput() {
    const box = document.getElementById('inputBox');
    if (!box || !TD.input) return;
    const { MODES, mode } = TD.input;
    renderView(box, SidebarSetting, {
      title: t('ui.text.input', 'Text input'),
      options: Object.entries<any>(MODES).map(([k, v]) => ({ label: v.name, title: t('input.modeTip', '{name} mode: {note}', { name: v.name, note: caption(v.note) }), on: k === mode, attrs: { 'data-input': k } })),
      note: caption(MODES[mode].note),
      notes: Object.values<any>(MODES).map((v) => caption(v.note)),
    });
  }
  const note = (v: any) => t('engine.note', '{note}. Exported LaTeX is the same for both engines.', { note: v.note() });
  const loading = (v: any) => t('engine.loading', 'Rendering {name}… You can keep editing.', { name: v.name });
  function drawEngine() {
    const box = document.getElementById('engineBox');
    if (!box || !TD.math) return;
    const { ENGINES, engine, busy } = TD.math;
    box.setAttribute('aria-busy', String(busy));
    renderView(box, SidebarSetting, {
      title: t('ui.latex.engine', 'LaTeX engine'),
      options: Object.entries<any>(ENGINES).map(([k, v]) => ({ label: v.name, title: v.note(), on: k === engine, disabled: !TD.math.available(k), attrs: { 'data-engine': k } })),
      note: (busy ? loading : note)(ENGINES[engine]),
      notes: Object.values<any>(ENGINES).flatMap((v) => [note(v), loading(v)]),
      status: true,
    });
  }
  const start = () => {
    TD.input?.onChange(drawInput);
    TD.math?.onChange(drawEngine);
    TD.math?.onReadiness(drawEngine); // also draws it now
    onLocale(() => { drawInput(); drawEngine(); }); // and now, and with each language
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
