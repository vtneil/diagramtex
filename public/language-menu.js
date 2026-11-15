// Shared keyboard and dismissal behavior; <details> also works without JavaScript.
(function () {
  function install() {
    document.querySelectorAll('.language-picker').forEach(function (picker) {
      var trigger = picker.querySelector('summary');
      var menu = picker.querySelector('.language-options');
      var items = [].slice.call(picker.querySelectorAll('.language-option'));
      function close(focus) { if (menu.hidePopover) menu.hidePopover(); picker.open = false; trigger.setAttribute('aria-expanded', 'false'); if (focus) trigger.focus(); }
      function open() {
        picker.open = true;
        trigger.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        if (menu.showPopover) {
          menu.showPopover();
          var rect = trigger.getBoundingClientRect();
          var width = menu.getBoundingClientRect().width;
          var left = Math.max(8, Math.min(rect.right - width, innerWidth - width - 8));
          menu.style.left = left + 'px';
          menu.style.top = (rect.bottom + 10) + 'px';
          menu.style.setProperty('--arrow-right', Math.max(12, Math.min(width - 22, left + width - rect.right + 18)) + 'px');
        }
        trigger.setAttribute('aria-expanded', 'true');
      }
      picker.addEventListener('toggle', function () { if (picker.open) open(); else close(false); });
      addEventListener('resize', function () { close(false); });
      picker.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && picker.open) { e.preventDefault(); e.stopPropagation(); close(true); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation(); open();
        var index = items.indexOf(document.activeElement);
        var next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
          : e.key === 'ArrowDown' ? (index + 1) % items.length : (index <= 0 ? items.length - 1 : index - 1);
        items[next].focus();
      });
      // Safari does not focus buttons on mouse down. Explicitly move focus inside
      // the menu before its summary blurs, so focusout cannot hide the hit target
      // before the subsequent click reaches Svelte's language handler.
      picker.addEventListener('pointerdown', function (e) {
        var item = e.target.closest('.language-option');
        if (item) { e.preventDefault(); item.focus({ preventScroll: true }); }
      });
      picker.addEventListener('click', function (e) { if (e.target.closest('.language-option')) close(true); });
      picker.addEventListener('focusout', function (e) { if (!picker.contains(e.relatedTarget)) close(false); });
      document.addEventListener('pointerdown', function (e) { if (!picker.contains(e.target)) close(false); });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
})();
