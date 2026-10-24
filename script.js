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
  var activeSectionIndex = -1;
  var scheduled = false;

  /* The navigation lists the themes, not every chapter: each link owns the
     chapters that follow it, so the active link is the last one already started. */
  var navTargets = navLinks.map(function (link) {
    var id = link.getAttribute('href').slice(1);
    var index = sections.findIndex(function (section) { return section.id === id; });
    return { link: link, index: index };
  }).filter(function (target) { return target.index >= 0; });

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

  /* Guided calculation cards: reveal one explanatory substep at a time. */
  var steppers = Array.prototype.slice.call(document.querySelectorAll('[data-stepper]'));
  var finalAnswer = document.querySelector('[data-final-answer]');
  var stepperTitles = {
    1: [
      'Identificamos la variable constante.',
      'Separamos los términos.',
      'Calculamos las primitivas.',
      'Evaluamos los límites.',
      'Resolvemos la integral interior.'
    ],
    2: [
      'Reemplazamos la integral interior.',
      'Integramos cada término.',
      'Escribimos la primitiva completa.',
      'Evaluamos los límites.',
      'Obtenemos el valor total.'
    ],
    3: [
      'Elegimos el orden de integración.',
      'Resolvemos la integral interior.',
      'Integramos el resultado.',
      'Evaluamos los límites.',
      'Confirmamos el valor.'
    ],
    4: [
      'Elegimos el orden de integración.',
      'Resolvemos la integral interior.',
      'Integramos el resultado.',
      'Evaluamos los límites.',
      'Confirmamos el valor.'
    ],
    5: [
      'Detectamos el problema del orden original.',
      'Identificamos los límites externos.',
      'Identificamos los límites internos.',
      'Describimos la región.',
      'Comprobamos la geometría.',
      'Elegimos los nuevos límites externos.',
      'Elegimos los nuevos límites internos.',
      'Reescribimos la integral.',
      'Integramos primero en x.',
      'Integramos en y y obtenemos el resultado.'
    ],
    6: [
      'Elegimos franjas verticales.',
      'Identificamos los límites.',
      'Planteamos la integral.',
      'Integramos en y.',
      'Obtenemos el área.'
    ],
    7: [
      'Elegimos franjas horizontales.',
      'Identificamos el rango de y.',
      'Despejamos la parábola.',
      'Separamos los dos tramos.',
      'Planteamos las dos integrales.',
      'Integramos en x.',
      'Obtenemos el área.'
    ],
    8: [
      'Identificamos la base.',
      'Identificamos el techo.',
      'Elegimos el orden.',
      'Integramos en x.',
      'Evaluamos la integral interna.',
      'Planteamos la integral externa.',
      'Evaluamos en y.',
      'Obtenemos el volumen.'
    ],
    9: [
      'Identificamos la base circular.',
      'Identificamos el techo.',
      'Reconocemos el elemento de área.',
      'Planteamos la integral polar.',
      'Expandimos el integrando.',
      'Integramos en r.',
      'Planteamos la integral angular.',
      'Integramos en θ.',
      'Obtenemos el volumen.'
    ]
  };

  function updateStepper(stepper, stepIndex) {
    var steps = Array.prototype.slice.call(stepper.querySelectorAll('[data-step]'));
    var previous = stepper.querySelector('[data-stepper-previous]');
    var next = stepper.querySelector('[data-stepper-next]');
    var status = stepper.querySelector('[data-stepper-status]');
    var title = stepper.querySelector('[data-stepper-title]');
    var order = stepper.getAttribute('data-stepper-order');

    steps.forEach(function (step, index) {
      step.hidden = index !== stepIndex;
    });

    status.textContent = 'SUBPASO ' + (stepIndex + 1) + ' DE ' + steps.length;
    title.textContent = stepperTitles[order][stepIndex];
    previous.disabled = stepIndex === 0;
    next.textContent = stepIndex === steps.length - 1
      ? (order === '1' ? 'Continuar al paso 02 →' : 'Finalizar resolución')
      : 'Siguiente subpaso →';
  }

  function unlockNextStepper(stepper) {
    var nextStepper = steppers[steppers.indexOf(stepper) + 1];
    if (!nextStepper) return;
    nextStepper.classList.remove('calculation-stepper--locked');
    nextStepper.classList.add('calculation-stepper--unlocked');
    nextStepper.removeAttribute('aria-disabled');
    updateStepper(nextStepper, 0);
    nextStepper.querySelector('[data-stepper-previous]').disabled = true;
    nextStepper.querySelector('[data-stepper-next]').disabled = false;
    var nextButton = nextStepper.querySelector('[data-stepper-next]');
    if (nextButton) nextButton.focus();
  }

  steppers.forEach(function (stepper) {
    var steps = stepper.querySelectorAll('[data-step]');
    var previous = stepper.querySelector('[data-stepper-previous]');
    var next = stepper.querySelector('[data-stepper-next]');
    var state = { index: 0 };
    var locked = stepper.classList.contains('calculation-stepper--locked');

    updateStepper(stepper, 0);
    if (locked) {
      previous.disabled = true;
      next.disabled = true;
    }

    next.addEventListener('click', function () {
      if (state.index < steps.length - 1) {
        state.index += 1;
        updateStepper(stepper, state.index);
        return;
      }

      stepper.classList.add('is-complete');
      if (stepper.getAttribute('data-stepper-order') === '1') {
        unlockNextStepper(stepper);
      } else if (finalAnswer) {
        finalAnswer.classList.remove('is-pending');
        finalAnswer.setAttribute('aria-label', 'Valor de la integral: 24');
      }
    });

    previous.addEventListener('click', function () {
      if (state.index === 0) return;
      state.index -= 1;
      updateStepper(stepper, state.index);
    });
  });

  if (finalAnswer) finalAnswer.classList.add('is-pending');

  /* Classification explorer: compare vertical and horizontal cuts in context. */
  var typeExplorer = document.querySelector('[data-type-explorer]');
  if (typeExplorer) {
    var typeChoices = Array.prototype.slice.call(typeExplorer.querySelectorAll('[data-type-choice]'));
    var typePanels = Array.prototype.slice.call(document.querySelectorAll('[data-type-panel]'));
    var typeCounter = typeExplorer.querySelector('[data-type-counter]');
    var typeStageLabel = typeExplorer.querySelector('[data-type-stage-label]');
    var typeStageTitle = typeExplorer.querySelector('[data-type-stage-title]');
    var typeStageCopy = typeExplorer.querySelector('[data-type-stage-copy]');
    var typeStageFormula = typeExplorer.querySelector('[data-type-stage-formula]');
    var typePrevious = typeExplorer.querySelector('[data-type-previous]');
    var typeNext = typeExplorer.querySelector('[data-type-next]');
    var selectedType = 'I';
    var selectedStage = 0;
    var typeStages = {
      I: [
        {
          label: 'ETAPA 1 · ORIENTACIÓN',
          title: 'La franja se mueve verticalmente.',
          copy: 'Fijamos un valor de <em>x</em>. La franja entra por la curva inferior y sale por la curva superior.',
          formula: 'Variable interna: <em>y</em> · Variable externa: <em>x</em>'
        },
        {
          label: 'ETAPA 2 · LÍMITES',
          title: 'Leemos los límites de entrada y salida.',
          copy: 'Para cada <em>x</em>, la franja empieza en <em>g₁(x)</em> y termina en <em>g₂(x)</em>. El recorrido horizontal completo va de <em>a</em> a <em>b</em>.',
          formula: '<em>a</em> ≤ <em>x</em> ≤ <em>b</em> · <em>g₁(x)</em> ≤ <em>y</em> ≤ <em>g₂(x)</em>'
        },
        {
          label: 'ETAPA 3 · INTEGRAL',
          title: 'Integramos primero en y.',
          copy: 'La longitud vertical de cada franja es curva superior menos curva inferior. Por eso la integral interna usa <em>dy</em>.',
          formula: '<span class="math-symbol">∫</span><sub><em>a</em></sub><sup><em>b</em></sup><span class="math-symbol">∫</span><sub><em>g₁(x)</em></sub><sup><em>g₂(x)</em></sup> d<em>y</em> d<em>x</em>'
        },
        {
          label: 'ETAPA 4 · REGLA',
          title: 'Tipo I: verticalmente simple.',
          copy: 'Elegimos Tipo I cuando una sola franja vertical entra y sale de la región sin tener que partirla.',
          formula: '<em>A</em> = <span class="math-symbol">∫</span><sub><em>a</em></sub><sup><em>b</em></sup> [<em>g₂(x)</em> − <em>g₁(x)</em>] d<em>x</em>'
        }
      ],
      II: [
        {
          label: 'ETAPA 1 · ORIENTACIÓN',
          title: 'La franja se mueve horizontalmente.',
          copy: 'Fijamos un valor de <em>y</em>. La franja entra por la curva izquierda y sale por la curva derecha.',
          formula: 'Variable interna: <em>x</em> · Variable externa: <em>y</em>'
        },
        {
          label: 'ETAPA 2 · LÍMITES',
          title: 'Leemos los límites de entrada y salida.',
          copy: 'Para cada <em>y</em>, la franja empieza en <em>h₁(y)</em> y termina en <em>h₂(y)</em>. El recorrido vertical va de <em>c</em> a <em>d</em>.',
          formula: '<em>c</em> ≤ <em>y</em> ≤ <em>d</em> · <em>h₁(y)</em> ≤ <em>x</em> ≤ <em>h₂(y)</em>'
        },
        {
          label: 'ETAPA 3 · INTEGRAL',
          title: 'Integramos primero en x.',
          copy: 'La longitud horizontal de cada franja es curva derecha menos curva izquierda. Por eso la integral interna usa <em>dx</em>.',
          formula: '<span class="math-symbol">∫</span><sub><em>c</em></sub><sup><em>d</em></sup><span class="math-symbol">∫</span><sub><em>h₁(y)</em></sub><sup><em>h₂(y)</em></sup> d<em>x</em> d<em>y</em>'
        },
        {
          label: 'ETAPA 4 · REGLA',
          title: 'Tipo II: horizontalmente simple.',
          copy: 'Elegimos Tipo II cuando una sola franja horizontal entra y sale de la región sin tener que partirla.',
          formula: '<em>A</em> = <span class="math-symbol">∫</span><sub><em>c</em></sub><sup><em>d</em></sup> [<em>h₂(y)</em> − <em>h₁(y)</em>] d<em>y</em>'
        }
      ]
    };

    function renderTypeExplorer() {
      var stage = typeStages[selectedType][selectedStage];
      typeChoices.forEach(function (choice) {
        var active = choice.getAttribute('data-type-choice') === selectedType;
        choice.classList.toggle('is-active', active);
        choice.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      typePanels.forEach(function (panel) {
        var active = panel.getAttribute('data-type-panel') === selectedType;
        panel.classList.toggle('is-active', active);
        panel.classList.toggle('is-muted', !active);
      });
      typeCounter.textContent = 'ETAPA ' + (selectedStage + 1) + ' DE ' + typeStages[selectedType].length;
      typeStageLabel.textContent = stage.label;
      typeStageTitle.textContent = stage.title;
      typeStageCopy.innerHTML = stage.copy;
      typeStageFormula.innerHTML = stage.formula;
      typePrevious.disabled = selectedStage === 0;
      typeNext.textContent = selectedStage === typeStages[selectedType].length - 1
        ? 'Volver al inicio'
        : 'Siguiente etapa →';
    }

    typeChoices.forEach(function (choice) {
      choice.addEventListener('click', function () {
        selectedType = choice.getAttribute('data-type-choice');
        selectedStage = 0;
        renderTypeExplorer();
      });
    });
    typePrevious.addEventListener('click', function () {
      if (selectedStage === 0) return;
      selectedStage -= 1;
      renderTypeExplorer();
    });
    typeNext.addEventListener('click', function () {
      selectedStage = selectedStage === typeStages[selectedType].length - 1 ? 0 : selectedStage + 1;
      renderTypeExplorer();
    });
    renderTypeExplorer();
  }

  /* Mark the section nearest the reading line in the top navigation. */
  function updateReadingState() {
    scheduled = false;

    var maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    var percentage = maxScroll > 0 ? Math.min(100, Math.max(0, (window.scrollY / maxScroll) * 100)) : 0;
    progress.style.width = percentage + '%';

    var readingLine = window.innerHeight * 0.34;
    var currentIndex = -1;
    sections.forEach(function (section, index) {
      if (section.getBoundingClientRect().top <= readingLine) currentIndex = index;
    });

    var activeLink = null;
    navTargets.forEach(function (target) {
      if (target.index <= currentIndex) activeLink = target.link;
    });

    if (currentIndex !== activeSectionIndex) {
      activeSectionIndex = currentIndex;
      navLinks.forEach(function (link) {
        if (link === activeLink) {
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
    var currentIndex = activeSectionIndex < 0 ? 0 : activeSectionIndex;
    var destination = sections[Math.max(0, Math.min(sections.length - 1, currentIndex + direction))];
    if (destination) destination.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('keydown', function (event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest('a, button, input, textarea, select, canvas, [contenteditable="true"]')) return;

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
