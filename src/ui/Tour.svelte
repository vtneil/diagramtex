<script lang="ts" module>
  /** A step of the welcome tour: `at` is the part of the window its map marks; `body` is markup built by the service
   *  from translated text (escaped, with <b>, <code>, <kbd> and tags put in), `warn` gives the card a marker edge. */
  export interface TourStep { at: 'top' | 'save' | 'left' | 'right' | null; title: string; body: string; warn?: boolean }
  export interface TourModel { steps: TourStep[]; i: number }
</script>
<script lang="ts">
  // The welcome tour's card (src/ui/services/tour.svelte.ts opens it, keeps its step and handles its keys): a small
  // map of the window with the part a step talks about marked in blue pen, the step's title and text, the dots, and
  // I'm All Good, Previous and Next. The card keeps one size and its buttons keep their places from step to step
  // (a button that isn't shown keeps its room).
  import { t, locale } from '../i18n';
  import Button from './kit/Button.svelte';
  let { model: m }: { model: TourModel } = $props();
  const s = $derived(m.steps[m.i]);
  const last = $derived(m.i === m.steps.length - 1);
  const zone = (k: string) => ['zone', s.at === k && 'on'];
</script>
<div class={['tdd-box', 'tour-box', s.warn && 'warn']} role="dialog" aria-modal="true" aria-labelledby="tourTitle"
  aria-label={t('tour.step', '{title}, step {n} of {count}', { title: s.title, n: m.i + 1, count: m.steps.length }, $locale)}>
  <div class="tour-pic">
    <svg class="tour-map" viewBox="0 0 240 120" aria-hidden="true">
      <rect class="frame" x=".5" y=".5" width="239" height="119" rx="8"/>
      <path class="rule" d="M.5 16.5h239M46.5 16.5v103M58.5 16.5v103"/>
      <rect class="sheet" x="84" y="30" width="78" height="76" rx="1.5"/>
      <path class="ink" d="M96 92l14-26 12 16 10-10 16 20"/><circle class="ink" cx="110" cy="66" r="2.4"/>
      <rect class={zone('top')} x="3" y="3" width="234" height="11" rx="4"/>
      <rect class={zone('save')} x="22" y="5" width="7" height="7" rx="1.5"/>
      <rect class={zone('left')} x="3" y="19" width="53" height="98" rx="4"/>
      <g class="rows"><path d="M8 26h28M8 33h22M8 40h26"/><path d="M50 26h4M50 34h4M50 42h4M50 50h4M50 58h4"/></g>
      <rect class={zone('right')} x="180" y="22" width="54" height="72" rx="5"/>
      <g class="rows"><path d="M186 32h30M186 42h20M186 50h36M186 58h24"/></g>
    </svg>
  </div>
  <h2 id="tourTitle">{s.title}</h2>
  <!-- every step's text in one cell, only this one shown: the card keeps the room of the longest in any font and language -->
  <div class="tour-body" aria-hidden="true">{#each m.steps as step, i (i)}<div class={i === m.i ? 'on' : undefined}>{@html step.body}</div>{/each}</div>
  <!-- what screen readers hear, announced as the step changes -->
  <div class="sr-only" aria-live="polite">{@html s.body}</div>
  <div class="tdd-btns">
    <Button variant="flat" class="tour-skip" data-t="skip" style={last ? 'visibility: hidden' : undefined}>{t('tour.skip', 'I’m All Good', {}, $locale)}</Button>
    <span class="tour-dots" aria-hidden="true">{#each m.steps as _, k (k)}<i class={k === m.i ? 'on' : undefined}></i>{/each}</span>
    <Button data-t="prev" style={m.i ? undefined : 'visibility: hidden'}>{t('tour.prev', 'Previous', {}, $locale)}</Button>
    <Button variant="primary" data-t="next">{last ? t('tour.done', 'Got It', {}, $locale) : t('tour.next', 'Next', {}, $locale)}</Button>
  </div>
</div>
