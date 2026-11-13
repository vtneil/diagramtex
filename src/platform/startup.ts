import { runtime } from '../runtime';
// Keep the original font/store loading limits and optional offline registration.
const splash = document.getElementById('splash');
if (splash) {
  let done = false;
  const hide = () => {
    if (done) return;
    done = true;
    splash.classList.add('out');
    setTimeout(() => splash.remove(), 300);
  };
  addEventListener('load', () => {
    const fonts = document.fonts?.ready || Promise.resolve();
    Promise.all([runtime.ready, Promise.race([fonts, new Promise<void>(resolve => setTimeout(resolve, 1500))])])
      .then(() => requestAnimationFrame(() => requestAnimationFrame(hide)));
  });
  setTimeout(hide, 8000);
}
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}
