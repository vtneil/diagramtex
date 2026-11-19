// Shared precision entry and reset gestures for every native numeric slider.
import { t } from '../../i18n';
const rangeSelector = 'input[type="range"]:not(.cp input)';
const readoutSelector = '.slider-value';
const sliderFor = (el: Element) => el.parentElement?.querySelector<HTMLInputElement>(rangeSelector) || null;
const readoutFor = (slider: HTMLInputElement) => slider.parentElement?.querySelector<HTMLElement>(readoutSelector);
let editor: HTMLInputElement | null = null;
let finishEditor: ((commit: boolean) => void) | null = null;
function apply(slider: HTMLInputElement, value: number) {
  if (!slider.isConnected || slider.disabled || !Number.isFinite(value)) return;
  slider.focus();
  // The range input applies its own limits and step, just like dragging it.
  slider.value = String(value);
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  slider.blur();
}
function editValue(readout: HTMLElement, slider: HTMLInputElement) {
  editor?.blur();
  if (editor) return; // Resolve an invalid entry before opening another one.
  const rect = readout.getBoundingClientRect(), input = document.createElement('input');
  input.type = 'number'; input.className = 'slider-value-editor';
  // The editor is UI chrome even when its slider sits on the light typeset page.
  const theme = getComputedStyle(document.documentElement);
  for (const token of ['--ink', '--sheet-raised', '--bluepen', '--shadow-pop']) input.style.setProperty(token, theme.getPropertyValue(token));
  const scale = readout.textContent?.trim().endsWith('%') ? 100 : 1;
  input.value = String(Number(slider.value) * scale);
  if (slider.min) input.min = String(Number(slider.min) * scale);
  if (slider.max) input.max = String(Number(slider.max) * scale);
  input.step = slider.step === 'any' ? 'any' : String(Number(slider.step || 1) * scale);
  input.setAttribute('aria-label', slider.getAttribute('aria-label') || slider.labels?.[0]?.textContent || t('slider.value', 'Slider value'));
  input.style.left = `${Math.max(4, Math.min(rect.left, innerWidth - 100))}px`;
  input.style.top = `${Math.max(4, Math.min(rect.top, innerHeight - 32))}px`;
  input.style.width = `${Math.max(80, rect.width)}px`;
  let finished = false;
  const finish = (commit: boolean) => {
    if (finished) return;
    if (commit && (!input.value || !input.checkValidity())) { input.reportValidity(); input.focus(); return; }
    finished = true; editor = null; finishEditor = null;
    const value = input.valueAsNumber / scale;
    input.blur(); input.remove();
    if (commit) apply(slider, value);
  };
  input.addEventListener('blur', () => finish(true));
  (readout.parentElement || document.body).append(input); editor = input; finishEditor = finish; input.focus(); input.select();
}
// Block editors capture Escape at window level; numeric entry must handle it first.
let installed = false;
/** Start the slider gestures (once): the app at boot, and the kit's Slider as it mounts. */
export function installSliders() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
window.addEventListener('keydown', e => {
  if (e.target !== editor || (e.key !== 'Enter' && e.key !== 'Escape')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  finishEditor?.(e.key === 'Enter');
}, true);
document.addEventListener('dblclick', e => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.matches(rangeSelector)) {
    const slider = target as HTMLInputElement;
    if (slider.dataset.sliderDefault == null) return;
    e.preventDefault(); e.stopPropagation();
    const value = Number(slider.dataset.sliderDefault);
    if (slider.min && value < Number(slider.min)) slider.min = String(value);
    if (slider.max && value > Number(slider.max)) slider.max = String(value);
    apply(slider, value);
    return;
  }
}, true);
document.addEventListener('click', e => {
  const target = e.target;
  if (!(target instanceof Element)) return;
  if (target.matches('input')) return;
  const readout = target.closest<HTMLElement>(readoutSelector), slider = readout && sliderFor(readout);
  if (!readout || !slider || slider.disabled) return;
  e.preventDefault(); e.stopPropagation(); editValue(readout, slider);
}, true);
document.addEventListener('keydown', e => {
  const readout = e.target;
  if (!(readout instanceof HTMLElement)) return;
  if ((e.key === 'Enter' || e.key === ' ') && readout.matches(readoutSelector)) {
    const slider = sliderFor(readout);
    if (slider && !slider.disabled) { e.preventDefault(); e.stopPropagation(); editValue(readout, slider); }
  }
}, true);
// A slider presses (shrinks while held, kit.css) about its thumb, so the thumb stays under the pointer: --thumb-at
// is where the value sits along the track (0–1), set as the press starts and as the value moves.
function thumbAt(e: Event) {
  const r = e.target;
  if (!(r instanceof HTMLInputElement) || r.type !== 'range') return;
  const min = r.min === '' ? 0 : +r.min, max = r.max === '' ? 100 : +r.max;
  r.style.setProperty('--thumb-at', String(max > min ? Math.min(1, Math.max(0, (+r.value - min) / (max - min))) : 0.5));
}
document.addEventListener('pointerdown', thumbAt, true);
document.addEventListener('input', thumbAt, true);
// Readouts added by any panel share keyboard access and the same affordance.
function decorate() {
  if (editor && (!editor.isConnected || editor.closest('[hidden]'))) finishEditor?.(false);
  document.querySelectorAll<HTMLInputElement>(rangeSelector).forEach(slider => {
    const readout = readoutFor(slider);
    if (!readout) return;
    readout.tabIndex = slider.disabled ? -1 : 0;
    readout.setAttribute('aria-disabled', String(slider.disabled));
    if (readout.dataset.sliderValue != null) return;
    readout.dataset.sliderValue = ''; readout.setAttribute('role', 'button');
    readout.setAttribute('aria-label', t('slider.editValue', 'Edit slider value'));
  });
}
new MutationObserver(decorate).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'hidden'] });
decorate();
}
// starts on import, as the app has always loaded it (src/main.ts keeps the order); kit components call it again, harmlessly
installSliders();
