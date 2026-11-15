// Static pages work without JavaScript; enhance language links with the current section
// and remember explicit choices using the same device preference as the editor.
(function () {
  function updateLinks() {
    document.querySelectorAll('[data-guide-lang]').forEach(function (link) {
      link.hash = location.hash;
    });
  }
  updateLinks();
  addEventListener('hashchange', updateLinks);
  document.querySelectorAll('[data-guide-lang]').forEach(function (link) {
    link.addEventListener('click', function () {
      try { localStorage.setItem('diagramtex.language', link.dataset.guideLang); } catch (e) { /* storage blocked */ }
    });
  });
})();
