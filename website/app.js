/* Cairn — showcase site. Vanilla, no dependency, nothing to build. */
(function () {
  'use strict';

  var root = document.documentElement;

  /*
   * Theme — dark by default, persisted under the app's own key `cairn.theme`.
   * The initial attribute is set by the inline script in <head> so the page
   * never paints the wrong theme; here we only handle the toggle. In private
   * mode the toggle still works, it just does not survive a reload.
   */
  var toggle = document.getElementById('themeToggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      try {
        localStorage.setItem('cairn.theme', next);
      } catch (e) {}
    });
  }

  /* ── Nav: frosted only once the canvas scrolls under it ──────────────── */
  var nav = document.getElementById('nav');
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle('scrolled', window.scrollY > 12);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ── Smooth scroll for in-page anchors ───────────────────────────────── */
  var calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  Array.prototype.forEach.call(document.querySelectorAll('a[href^="#"]'), function (link) {
    link.addEventListener('click', function (ev) {
      var id = link.getAttribute('href').slice(1);
      if (!id) return;
      var target = document.getElementById(id);
      if (!target) return;
      ev.preventDefault();
      target.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', '#' + id);
    });
  });

  /* ── Footer year ─────────────────────────────────────────────────────── */
  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
})();
