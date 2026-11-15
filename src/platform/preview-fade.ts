// Readiness includes the finite opacity reveal, so print/export cannot capture a
// half-faded presentation. Reduced-motion styles create no transition to await.
export async function previewFadeFinished(element: Element): Promise<void> {
  const owners = new Set([element, element.closest('.blk-body, .tg-in, .tb-prev')].filter((owner): owner is Element => !!owner));
  const fades = [...owners].flatMap(owner => owner.getAnimations()).filter(animation => (animation as CSSTransition).transitionProperty === 'opacity');
  await Promise.all(fades.map(animation => animation.finished.then(() => {}, () => {})));
}
