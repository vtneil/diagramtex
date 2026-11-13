    // Browser storage moved from texdiagram.* to diagramtex.* (v1.8.0): carry every file and setting across once,
    // before anything reads them. A key already under the new name wins; an old key that cannot be copied stays.
    (function () {
      try {
        var old: string[] = [];
        for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('texdiagram.') === 0) old.push(k); }
        old.forEach(function (k: string) {
          var nk = 'diagramtex.' + k.slice(11), v = localStorage.getItem(k);
          if (localStorage.getItem(nk) !== null) { localStorage.removeItem(k); return; }
          try { localStorage.setItem(nk, v as string); localStorage.removeItem(k); }
          catch (e) { // no room for two copies: move it instead, and put it back if even that fails
            localStorage.removeItem(k);
            try { localStorage.setItem(nk, v as string); } catch (e2) { try { localStorage.setItem(k, v as string); } catch (e3) { /* nothing more to do */ } }
          }
        });
      } catch (e) { /* storage blocked */ }
    })();

    // Appearance: System follows the OS; Light / Dark override it. Runs before the stylesheet so there is no flash.
    (function () {
      var KEY = 'diagramtex.theme', pick: string | null = null, mq = matchMedia('(prefers-color-scheme: dark)');
      try { pick = localStorage.getItem(KEY); } catch (e) { /* storage blocked */ }
      function apply() {
        var t = pick === 'light' || pick === 'dark' ? pick : mq.matches ? 'dark' : 'light';
        document.documentElement.dataset.theme = t;
        // installed-app title bar follows the appearance (the top bar's --sheet colour)
        var m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
        if (m) m.content = t === 'dark' ? '#242320' : '#fffdf8';
      }
      apply();
      mq.addEventListener('change', apply);
      window.TDTheme = {
        get: function () { return pick === 'light' || pick === 'dark' ? pick : 'system'; },
        set: function (v) {
          pick = v === 'light' || v === 'dark' ? v : null;
          try { pick ? localStorage.setItem(KEY, pick) : localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
          apply();
        },
      };
    })();

export {};
