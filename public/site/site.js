// The package pages' only script, loaded in <head> so the theme is set before the page paints.
// Light / Dark, as the app resolves it: its stored choice, or the system's. The app's tokens (css/tokens.css) switch on
// <html data-theme>.
(function () {
  var pick = null, mq = matchMedia('(prefers-color-scheme: dark)');
  try { pick = localStorage.getItem('diagramtex.theme'); } catch (e) { /* storage blocked */ }
  function apply() { document.documentElement.dataset.theme = pick === 'light' || pick === 'dark' ? pick : mq.matches ? 'dark' : 'light'; }
  apply();
  mq.addEventListener('change', apply);
})();
// Copy buttons on the code samples
document.addEventListener('click', function (e) {
  var b = e.target.closest && e.target.closest('button.copy');
  if (!b) return;
  var code = b.parentNode.querySelector('pre code');
  if (!code || !navigator.clipboard) return;
  navigator.clipboard.writeText(code.textContent).then(function () {
    b.textContent = 'Copied';
    setTimeout(function () { b.textContent = 'Copy'; }, 1600);
  }, function () { /* clipboard refused: the code can still be selected */ });
});
// "Edit this example here" (figure.try): only where the editor fits (it needs a computer or a tablet, as the app does);
// a click puts the app in a frame in the picture's place, in Quick on the page's block, starting on the example.
// The app is loaded only then: it is several megabytes, too much for every visit to the page.
document.addEventListener('DOMContentLoaded', function () {
  var roomy = matchMedia('(min-width: 900px) and (min-height: 600px)');
  var figs = document.querySelectorAll('figure.try');
  function sync() { figs.forEach(function (f) { var b = f.querySelector('.try-btn'); if (b) b.hidden = !roomy.matches; }); }
  sync();
  roomy.addEventListener('change', sync);
  figs.forEach(function (f) {
    var b = f.querySelector('.try-btn');
    if (!b) return;
    b.addEventListener('click', function () {
      var frame = document.createElement('iframe');
      frame.src = '../?embed=' + encodeURIComponent(f.dataset.embed) + '#draft=' + f.dataset.draft;
      frame.title = 'DiagramTeX editor';
      frame.setAttribute('allow', 'clipboard-write');
      f.querySelector('img').replaceWith(frame);
      b.remove();
      frame.focus();
    });
  });
});
