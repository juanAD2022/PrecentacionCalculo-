/**
 * UNIAJC · Cálculo — interacciones de la presentación editorial.
 * Progreso de lectura, revelado al desplazarse, navegación por secciones y fullscreen.
 */
(function () {
  'use strict';

  var sections = Array.prototype.slice.call(document.querySelectorAll('main > section[id]'));
  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.site-nav a[href^="#"]'));
  var progress = document.getElementById('readingProgress');
  var fullscreenButton = document.querySelector('.fullscreen-button');
  var activeSectionId = '';
  var scheduled = false;

  document.documentElement.classList.add('js');

  /* Reveal sections progressively, but show everything if IO is unavailable. */
  var revealElements = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -35px 0px' });

    revealElements.forEach(function (element) {
      revealObserver.observe(element);
    });
  } else {
    revealElements.forEach(function (element) {
      element.classList.add('is-visible');
    });
  }

  /* Mark the section nearest the reading line in the top navigation. */
  function updateReadingState() {
    scheduled = false;

    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var percentage = maxScroll > 0 ? Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100)) : 0;
    progress.style.width = percentage + '%';

    var readingLine = window.innerHeight * 0.34;
    var current = sections[0];
    sections.forEach(function (section) {
      if (section.getBoundingClientRect().top <= readingLine) current = section;
    });

    if (current && current.id !== activeSectionId) {
      activeSectionId = current.id;
      navLinks.forEach(function (link) {
        if (link.getAttribute('href') === '#' + activeSectionId) {
          link.setAttribute('aria-current', 'location');
        } else {
          link.removeAttribute('aria-current');
        }
      });
    }
  }

  function scheduleReadingState() {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(updateReadingState);
  }

  window.addEventListener('scroll', scheduleReadingState, { passive: true });
  window.addEventListener('resize', scheduleReadingState, { passive: true });
  window.addEventListener('hashchange', scheduleReadingState);
  updateReadingState();

  /* Keyboard support keeps the web presentation comfortable to present. */
  function moveSection(direction) {
    var currentIndex = sections.findIndex(function (section) { return section.id === activeSectionId; });
    if (currentIndex < 0) currentIndex = 0;
    var destination = sections[Math.max(0, Math.min(sections.length - 1, currentIndex + direction))];
    if (destination) destination.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('a, button, input, textarea, select, [contenteditable="true"]')) return;

    if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      moveSection(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault();
      moveSection(-1);
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault();
      toggleFullscreen();
    }
  });

  function toggleFullscreen() {
    var root = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      var request = root.requestFullscreen || root.webkitRequestFullscreen;
      if (request) request.call(root);
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document);
    }
  }

  if (fullscreenButton) fullscreenButton.addEventListener('click', toggleFullscreen);
})();
