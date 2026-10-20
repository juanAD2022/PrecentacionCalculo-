/**
 * UNIAJC · Cálculo — misión de cobertura con dron.
 * Simulador cartográfico construido con Phaser: reconocimiento de límites,
 * elección del barrido y acumulación de la cobertura del lote.
 */
(function () {
  'use strict';

  var container = document.getElementById('droneGame');
  if (!container) return;

  var SANS = 'Inter, Manrope, "Helvetica Neue", Arial, sans-serif';
  var MATH = 'Cambria Math, "STIX Two Math", Georgia, serif';

  var FIELD = { left: 130, right: 430, top: 55, bottom: 505 };
  var WORLD = { xMax: 2, yMax: 3 };
  var STRIP_COUNT = 6;
  var DRONE_SPEED = 190;
  var BEACON_RADIUS = 36;
  var SCAN_THRESHOLD = 0.82;

  var COLORS = {
    background: 0x0d1510,
    field: 0x203327,
    crop: 0x2c4635,
    grid: 0x9aa69a,
    sand: 0xe8d4b7,
    paper: 0xf4efe7,
    scan: 0x7fa86a,
    scanBright: 0x9dc182,
    ink: 0x101113,
    muted: 0x99a79b
  };

  var LIMIT_VALUES = { xMin: 0, xMax: 2, yMin: 0, yMax: 3 };

  var BEACONS = [
    { key: 'yMax', x: 0.55, y: 3, label: 'y = 3', dx: 0, dy: -34, origin: [0.5, 1] },
    { key: 'xMax', x: 2, y: 1.65, label: 'x = 2', dx: 34, dy: 0, origin: [0, 0.5] },
    { key: 'yMin', x: 0.55, y: 0, label: 'y = 0', dx: 0, dy: 34, origin: [0.5, 0] },
    { key: 'xMin', x: 0, y: 1.65, label: 'x = 0', dx: -34, dy: 0, origin: [1, 0.5] }
  ];

  var reducedMotion = Boolean(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function byId(id) {
    return document.getElementById(id);
  }

  function emptyLimits() {
    return { xMin: false, xMax: false, yMin: false, yMax: false };
  }

  function toX(x) {
    return FIELD.left + (x / WORLD.xMax) * (FIELD.right - FIELD.left);
  }

  function toY(y) {
    return FIELD.bottom - (y / WORLD.yMax) * (FIELD.bottom - FIELD.top);
  }

  function pxToWorldX(px) {
    return ((px - FIELD.left) / (FIELD.right - FIELD.left)) * WORLD.xMax;
  }

  function pxToWorldY(py) {
    return ((FIELD.bottom - py) / (FIELD.bottom - FIELD.top)) * WORLD.yMax;
  }

  function stripBounds(index, vertical) {
    if (vertical) {
      var step = WORLD.xMax / STRIP_COUNT;
      return { x0: index * step, x1: (index + 1) * step, y0: 0, y1: WORLD.yMax };
    }
    var row = WORLD.yMax / STRIP_COUNT;
    return { x0: 0, x1: WORLD.xMax, y0: index * row, y1: (index + 1) * row };
  }

  var ui = {
    phase: byId('missionPhase'),
    status: byId('missionStatus'),
    area: byId('missionArea'),
    fill: byId('missionProgressFill'),
    order: byId('missionOrderLabel'),
    formula: byId('missionFormula'),
    accumulation: byId('missionAccumulation'),
    integralResolution: byId('missionIntegralResolution'),
    stripCalculation: byId('missionStripCalculation'),
    accumulationEquation: byId('missionAccumulationEquation'),
    outerTop: byId('missionOuterTop'),
    outerBottom: byId('missionOuterBottom'),
    innerTop: byId('missionInnerTop'),
    innerBottom: byId('missionInnerBottom'),
    innerDiff: byId('missionInnerDiff'),
    outerDiff: byId('missionOuterDiff'),
    formulaResult: byId('missionFormulaResult'),
    live: byId('missionLive'),
    fallback: byId('missionFallback'),
    bonus: byId('missionBonus'),
    bonusFeedback: byId('missionBonusFeedback'),
    restart: document.querySelector('[data-mission-restart]'),
    limits: {},
    sweepButtons: Array.prototype.slice.call(document.querySelectorAll('[data-sweep]')),
    bonusButtons: Array.prototype.slice.call(document.querySelectorAll('[data-bonus-answer]'))
  };

  Array.prototype.slice.call(document.querySelectorAll('[data-limit]')).forEach(function (chip) {
    var key = chip.getAttribute('data-limit');
    ui.limits[key] = {
      chip: chip,
      value: chip.querySelector('[data-limit-value]')
    };
  });

  var missionApi = null;
  var bonusSolved = false;
  var announceTimer = 0;

  function announce(text) {
    if (!ui.live) return;
    window.clearTimeout(announceTimer);
    ui.live.textContent = '';
    announceTimer = window.setTimeout(function () {
      ui.live.textContent = text;
    }, 60);
  }

  function setPhase(text) {
    if (ui.phase) ui.phase.textContent = text;
  }

  function setStatus(text) {
    if (ui.status) ui.status.textContent = text;
  }

  function setArea(value) {
    if (ui.area) ui.area.textContent = value + ' / ' + STRIP_COUNT + ' u²';
    if (ui.fill) ui.fill.style.width = ((value / STRIP_COUNT) * 100) + '%';
  }

  function markLimit(key) {
    var item = ui.limits[key];
    if (!item) return;
    item.collected = true;
    item.chip.classList.add('is-collected');
    item.value.textContent = String(LIMIT_VALUES[key]);
  }

  function renderFormula(order, limits) {
    if (!ui.formula) return;

    var xMin = limits.xMin ? '0' : '?';
    var xMax = limits.xMax ? '2' : '?';
    var yMin = limits.yMin ? '0' : '?';
    var yMax = limits.yMax ? '3' : '?';
    var outerTop = xMax;
    var outerBottom = xMin;
    var innerTop = yMax;
    var innerBottom = yMin;
    var innerDiff = 'y';
    var outerDiff = 'x';

    if (order === 'horizontal') {
      outerTop = yMax;
      outerBottom = yMin;
      innerTop = xMax;
      innerBottom = xMin;
      innerDiff = 'x';
      outerDiff = 'y';
    }

    if (ui.outerTop) ui.outerTop.textContent = outerTop;
    if (ui.outerBottom) ui.outerBottom.textContent = outerBottom;
    if (ui.innerTop) ui.innerTop.textContent = innerTop;
    if (ui.innerBottom) ui.innerBottom.textContent = innerBottom;
    if (ui.innerDiff) ui.innerDiff.innerHTML = 'd<em>' + innerDiff + '</em>';
    if (ui.outerDiff) ui.outerDiff.innerHTML = 'd<em>' + outerDiff + '</em>';

    if (ui.order) {
      ui.order.textContent = order === 'vertical'
        ? 'dy → dx'
        : order === 'horizontal' ? 'dx → dy' : 'sin definir';
    }

    ui.formula.setAttribute('aria-label', 'Integral de ' + outerBottom + ' a ' + outerTop +
      ', integral de ' + innerBottom + ' a ' + innerTop + ', 1 d' + innerDiff + ' d' + outerDiff);
  }

  function setFormulaResult(value) {
    if (!ui.formulaResult) return;
    ui.formulaResult.hidden = value < 1;
    ui.formulaResult.textContent = value > 0 ? '= ' + value + ' u²' : '';
  }

  function updateAccumulation(order, count, animateLatest) {
    if (!ui.accumulation || !ui.integralResolution || !ui.stripCalculation || !ui.accumulationEquation) return;

    ui.accumulation.hidden = !order;
    if (order === 'vertical') {
      ui.integralResolution.textContent = count === STRIP_COUNT
        ? '∫₀³ 1 dy = 3 → ∫₀² 3 dx = [3x]₀² = 6 u²'
        : '∫₀³ 1 dy = 3 → ∫₀² 3 dx';
      ui.stripCalculation.textContent = 'Δx = 2/6 = 1/3 → 3 · 1/3 = 1 u²';
    } else if (order === 'horizontal') {
      ui.integralResolution.textContent = count === STRIP_COUNT
        ? '∫₀² 1 dx = 2 → ∫₀³ 2 dy = [2y]₀³ = 6 u²'
        : '∫₀² 1 dx = 2 → ∫₀³ 2 dy';
      ui.stripCalculation.textContent = 'Δy = 3/6 = 1/2 → 2 · 1/2 = 1 u²';
    } else {
      ui.integralResolution.textContent = '';
      ui.stripCalculation.textContent = '';
    }

    while (ui.accumulationEquation.firstChild) {
      ui.accumulationEquation.removeChild(ui.accumulationEquation.firstChild);
    }

    if (!count) {
      var empty = document.createElement('span');
      empty.className = 'mission-accumulation__empty';
      empty.textContent = '0 u²';
      ui.accumulationEquation.appendChild(empty);
      ui.accumulationEquation.setAttribute('aria-label', 'Acumulado: cero unidades cuadradas.');
      return;
    }

    var terms = [];
    for (var i = 0; i < count; i += 1) {
      if (i > 0) {
        var plus = document.createElement('span');
        plus.className = 'mission-accumulation__operator';
        plus.textContent = '+';
        ui.accumulationEquation.appendChild(plus);
      }

      var term = document.createElement('span');
      term.className = 'mission-accumulation__term';
      if (animateLatest && i === count - 1) term.classList.add('is-new');
      term.textContent = '1';
      ui.accumulationEquation.appendChild(term);
      terms.push('1');
    }

    var stripLabel = count === 1 ? 'Una franja.' : count + ' franjas.';
    var unitLabel = count === 1 ? 'unidad cuadrada.' : 'unidades cuadradas.';
    ui.accumulationEquation.setAttribute('aria-label', stripLabel + ' Suma: ' + terms.join(' más ') +
      '. Total: ' + count + ' ' + unitLabel);
  }

  function setSweepEnabled(enabled) {
    ui.sweepButtons.forEach(function (button) {
      button.disabled = !enabled;
      button.classList.toggle('is-ready', enabled);
    });
  }

  function markChosenOrder(order) {
    ui.sweepButtons.forEach(function (button) {
      button.disabled = true;
      button.classList.remove('is-ready');
      button.classList.toggle('is-active', button.getAttribute('data-sweep') === order);
    });
  }

  function resetUI() {
    setPhase('Reconocimiento');
    setStatus('Recolectá los cuatro límites del lote.');
    setArea(0);
    setFormulaResult(0);
    updateAccumulation(null, 0, false);
    setSweepEnabled(false);
    renderFormula(null, emptyLimits());

    Object.keys(ui.limits).forEach(function (key) {
      var item = ui.limits[key];
      item.collected = false;
      item.chip.classList.remove('is-collected');
      item.value.textContent = '?';
    });

    ui.sweepButtons.forEach(function (button) {
      button.classList.remove('is-active', 'is-ready');
    });

    if (ui.order) ui.order.textContent = 'sin definir';
    window.clearTimeout(announceTimer);
    if (ui.live) ui.live.textContent = '';
    if (ui.bonus) ui.bonus.hidden = true;
    if (ui.bonusFeedback) {
      ui.bonusFeedback.textContent = '';
      ui.bonusFeedback.classList.remove('is-correct', 'is-wrong');
    }

    bonusSolved = false;
    ui.bonusButtons.forEach(function (button) {
      button.disabled = false;
      button.classList.remove('is-correct', 'is-wrong');
    });
  }

  function revealBonus() {
    if (!ui.bonus) return;
    ui.bonus.hidden = false;
  }

  function answerBonus(value) {
    if (!ui.bonusFeedback || bonusSolved) return;

    if (value === '24') {
      bonusSolved = true;
      ui.bonusFeedback.textContent = 'Exacto: 24. Al integrar en y queda 3x + 9; al integrar en x, 6 + 18 = 24. ' +
        'La cobertura era 6 u², pero la función pondera cada punto del lote.';
      ui.bonusFeedback.classList.add('is-correct');
      ui.bonusFeedback.classList.remove('is-wrong');
      ui.bonusButtons.forEach(function (button) {
        button.disabled = true;
        button.classList.toggle('is-correct', button.getAttribute('data-bonus-answer') === '24');
      });
      announce('Respuesta correcta. El reto bonus acumula 24.');
      return;
    }

    ui.bonusFeedback.textContent = 'Todavía no. Integrá primero en y: ∫₀³ (x + 2y) dy = 3x + 9. ' +
      'Después, ese resultado se integra en x.';
    ui.bonusFeedback.classList.add('is-wrong');
    ui.bonusFeedback.classList.remove('is-correct');

    ui.bonusButtons.forEach(function (button) {
      if (button.getAttribute('data-bonus-answer') === value) {
        button.classList.add('is-wrong');
        window.setTimeout(function () {
          button.classList.remove('is-wrong');
        }, 900);
      }
    });

    announce('Ese no es el resultado. Probá integrar paso a paso.');
  }

  function showFallback() {
    var canvas = container.querySelector('canvas');
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    container.classList.add('is-fallback');
    if (ui.fallback) ui.fallback.hidden = false;
    if (ui.restart) ui.restart.disabled = true;
    setPhase('Sin conexión');
    setStatus('El simulador no está disponible. La cobertura del lote es 2 × 3 = 6 u².');
    announce('No se pudo cargar el simulador Phaser.');
  }

  var SceneBase = (window.Phaser && window.Phaser.Scene) || function () {};

  class MissionScene extends SceneBase {
    constructor() {
      super({ key: 'MissionScene' });
    }

    create() {
      this.phase = 'limits';
      this.order = null;
      this.limits = emptyLimits();
      this.pointerTarget = null;
      this.stripIndex = 0;
      this.completedStrips = 0;
      this.stripLocked = false;
      this.scanMin = 0;
      this.scanMax = 0;
      this.currentStrip = null;
      this.guide = null;
      this.targetAngle = 0;

      this.cameras.main.setBackgroundColor('#0d1510');

      this.drawField();
      this.createSweepLayer();
      this.createBeacons();
      this.createDrone();
      this.setupInput();

      missionApi = {
        startSweep: this.startSweep.bind(this),
        restart: this.restartMission.bind(this)
      };

      resetUI();
      renderFormula(null, this.limits);
      this.updateReadout();
      announce('Misión iniciada. Volá hasta los cuatro faros para registrar los límites.');
    }

    drawField() {
      var graphics = this.add.graphics().setDepth(0);

      graphics.fillStyle(COLORS.field, 1);
      graphics.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

      graphics.lineStyle(1, COLORS.crop, 0.55);
      for (var row = FIELD.left + 15; row < FIELD.right; row += 15) {
        graphics.lineBetween(row, FIELD.top, row, FIELD.bottom);
      }

      graphics.lineStyle(1, COLORS.grid, 0.08);
      for (var line = FIELD.top + 75; line < FIELD.bottom; line += 75) {
        graphics.lineBetween(FIELD.left, line, FIELD.right, line);
      }

      graphics.lineStyle(2, COLORS.sand, 0.85);
      graphics.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

      graphics.lineStyle(1, COLORS.sand, 0.22);
      graphics.strokeRect(FIELD.left + 5, FIELD.top + 5, FIELD.right - FIELD.left - 10,
        FIELD.bottom - FIELD.top - 10);

      var ticks = this.add.graphics().setDepth(1);
      ticks.lineStyle(1, 0xb7c3b7, 0.7);

      var x;
      for (x = 0; x <= WORLD.xMax; x += 1) {
        var px = toX(x);
        ticks.lineBetween(px, FIELD.bottom, px, FIELD.bottom + 6);
        this.add.text(px, FIELD.bottom + 27, String(x), {
          fontFamily: SANS,
          fontSize: '16px',
          color: '#b7c3b7'
        }).setOrigin(0.5, 0.5).setDepth(1);
      }

      for (x = 0.5; x < WORLD.xMax; x += 0.5) {
        var minorX = toX(x);
        ticks.lineBetween(minorX, FIELD.bottom, minorX, FIELD.bottom + 3);
      }

      var y;
      for (y = 0; y <= WORLD.yMax; y += 1) {
        var py = toY(y);
        ticks.lineBetween(FIELD.left - 6, py, FIELD.left, py);
        this.add.text(FIELD.left - 12, py, String(y), {
          fontFamily: SANS,
          fontSize: '16px',
          color: '#b7c3b7'
        }).setOrigin(1, 0.5).setDepth(1);
      }

      for (y = 0.5; y < WORLD.yMax; y += 0.5) {
        var minorY = toY(y);
        ticks.lineBetween(FIELD.left - 3, minorY, FIELD.left, minorY);
      }

      this.add.text(FIELD.right + 18, FIELD.bottom + 18, 'x', {
        fontFamily: MATH,
        fontSize: '22px',
        color: '#e8d4b7'
      }).setOrigin(0.5).setDepth(1);

      this.add.text(FIELD.left - 18, FIELD.top - 18, 'y', {
        fontFamily: MATH,
        fontSize: '22px',
        color: '#e8d4b7'
      }).setOrigin(0.5).setDepth(1);

      var compassX = 500;
      var compassY = 110;
      var compass = this.add.graphics().setDepth(1);
      compass.lineStyle(1, COLORS.sand, 0.45);
      compass.strokeCircle(compassX, compassY, 22);
      compass.lineStyle(1.5, COLORS.sand, 0.85);
      compass.lineBetween(compassX, compassY + 14, compassX, compassY - 14);
      compass.fillStyle(COLORS.sand, 0.9);
      compass.fillTriangle(compassX, compassY - 18, compassX - 5, compassY - 6, compassX + 5, compassY - 6);

      this.add.text(compassX, compassY - 42, 'N', {
        fontFamily: SANS,
        fontSize: '13px',
        color: '#e8d4b7'
      }).setOrigin(0.5).setAlpha(0.7).setDepth(1);

      var scale = this.add.graphics().setDepth(1);
      scale.lineStyle(1.5, COLORS.sand, 0.65);
      scale.lineBetween(450, 500, 525, 500);
      scale.lineBetween(450, 494, 450, 506);
      scale.lineBetween(525, 494, 525, 506);
      this.add.text(487, 514, '0,5 u', {
        fontFamily: SANS,
        fontSize: '12px',
        color: '#b7c3b7'
      }).setOrigin(0.5).setAlpha(0.8).setDepth(1);

      this.coordsText = this.add.text(548, 548, '', {
        fontFamily: SANS,
        fontSize: '13px',
        color: '#b7c3b7'
      }).setOrigin(1, 1).setAlpha(0.85).setDepth(1);
    }

    createSweepLayer() {
      this.stripLayer = this.add.container(0, 0).setDepth(2);
      this.strips = [];
      this.activeOutline = this.add.graphics().setDepth(3);
    }

    createBeacons() {
      this.beacons = BEACONS.map(function (config) {
        var x = toX(config.x);
        var y = toY(config.y);
        var beacon = this.add.container(x, y).setDepth(5);

        var pulse = this.add.circle(0, 0, 15, 0xffffff, 0).setStrokeStyle(1, COLORS.sand, 0.55);
        var ring = this.add.circle(0, 0, 15, COLORS.ink, 0.6).setStrokeStyle(2, COLORS.sand, 0.9);
        var dot = this.add.circle(0, 0, 4, COLORS.sand, 0.95);
        var check = this.add.text(0, 0, '✓', {
          fontFamily: SANS,
          fontSize: '16px',
          color: '#203327'
        }).setOrigin(0.5).setVisible(false);
        var label = this.add.text(config.dx, config.dy, config.label, {
          fontFamily: MATH,
          fontSize: '18px',
          color: '#e8d4b7'
        }).setOrigin(config.origin[0], config.origin[1]);

        beacon.add([pulse, ring, dot, check, label]);

        var tween = null;
        if (!reducedMotion) {
          tween = this.tweens.add({
            targets: pulse,
            scale: 1.9,
            alpha: 0,
            duration: 1700,
            repeat: -1,
            ease: 'Sine.easeOut'
          });
        }

        return {
          config: config,
          x: x,
          y: y,
          container: beacon,
          ring: ring,
          dot: dot,
          check: check,
          label: label,
          pulse: pulse,
          tween: tween,
          collected: false
        };
      }, this);
    }

    createDrone() {
      var drone = this.add.container(toX(1), toY(1.5)).setDepth(7);

      var shadow = this.add.circle(0, 0, 18, 0x000000, 0.28);
      var halo = this.add.circle(0, 0, 25, 0xffffff, 0).setStrokeStyle(1, COLORS.sand, 0.5);
      var arms = this.add.graphics();
      arms.lineStyle(4, COLORS.sand, 0.9);
      arms.lineBetween(-14, -10, 14, 10);
      arms.lineBetween(-14, 10, 14, -10);

      var rotors = [];
      var rotorPositions = [[-16, -12], [16, -12], [-16, 12], [16, 12]];

      rotorPositions.forEach(function (position, index) {
        var rotor = this.add.circle(position[0], position[1], 8, COLORS.ink, 0.7)
          .setStrokeStyle(2, COLORS.paper, 0.9);
        rotors.push(rotor);

        if (!reducedMotion) {
          this.tweens.add({
            targets: rotor,
            scaleX: 0.45,
            duration: 90 + index * 14,
            yoyo: true,
            repeat: -1,
            ease: 'Sine.easeInOut'
          });
        }
      }, this);

      var body = this.add.circle(0, 0, 7, COLORS.paper, 1).setStrokeStyle(2, COLORS.ink, 0.9);
      var light = this.add.circle(0, 0, 2.5, COLORS.scanBright, 1);

      drone.add([shadow, halo, arms].concat(rotors, [body, light]));

      if (!reducedMotion) {
        var pulse = this.add.circle(0, 0, 25, 0xffffff, 0).setStrokeStyle(1, COLORS.sand, 0.45);
        drone.addAt(pulse, 1);
        this.tweens.add({
          targets: pulse,
          scale: 1.4,
          alpha: 0,
          duration: 2100,
          repeat: -1,
          ease: 'Sine.easeOut'
        });
      }

      this.drone = drone;
    }

    setupInput() {
      var canvas = this.game.canvas;
      var self = this;

      canvas.setAttribute('tabindex', '0');
      canvas.setAttribute('aria-label', 'Mapa interactivo del lote agrícola. Volá con las flechas o arrastrando.');
      canvas.setAttribute('aria-describedby', 'missionControls');

      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D');

      var captureKeys = [
        Phaser.Input.Keyboard.KeyCodes.UP,
        Phaser.Input.Keyboard.KeyCodes.DOWN,
        Phaser.Input.Keyboard.KeyCodes.LEFT,
        Phaser.Input.Keyboard.KeyCodes.RIGHT,
        Phaser.Input.Keyboard.KeyCodes.W,
        Phaser.Input.Keyboard.KeyCodes.A,
        Phaser.Input.Keyboard.KeyCodes.S,
        Phaser.Input.Keyboard.KeyCodes.D
      ];

      function focusCanvas() {
        try {
          canvas.focus({ preventScroll: true });
        } catch (error) {
          canvas.focus();
        }
      }

      function onFocus() {
        if (!self.input.keyboard) return;
        if (self.input.keyboard.clearCaptures) self.input.keyboard.clearCaptures();
        if (self.input.keyboard.addCapture) self.input.keyboard.addCapture(captureKeys);
      }

      function onBlur() {
        if (self.input.keyboard && self.input.keyboard.clearCaptures) {
          self.input.keyboard.clearCaptures();
        }
      }

      canvas.addEventListener('focus', onFocus);
      canvas.addEventListener('blur', onBlur);

      this.events.once(Phaser.Scenes.Events.SHUTDOWN, function () {
        canvas.removeEventListener('focus', onFocus);
        canvas.removeEventListener('blur', onBlur);
        if (self.input && self.input.keyboard && self.input.keyboard.clearCaptures) {
          self.input.keyboard.clearCaptures();
        }
      });

      this.input.on('pointerdown', function (pointer) {
        focusCanvas();
        self.setPointerTarget(pointer.x, pointer.y);
      });

      this.input.on('pointermove', function (pointer) {
        if (!pointer.isDown) return;
        if (document.activeElement !== canvas) focusCanvas();
        self.setPointerTarget(pointer.x, pointer.y);
      });

      this.input.keyboard.on('keydown-ESC', function () {
        canvas.blur();
      });
    }

    setPointerTarget(x, y) {
      this.pointerTarget = {
        x: Phaser.Math.Clamp(x, FIELD.left, FIELD.right),
        y: Phaser.Math.Clamp(y, FIELD.top, FIELD.bottom)
      };
    }

    update(time, delta) {
      if (this.phase !== 'limits' && this.phase !== 'sweep' && this.phase !== 'complete') return;

      this.updateDrone(delta / 1000);
      this.updateReadout();

      if (this.phase === 'limits') this.checkBeacons();
      if (this.phase === 'sweep') this.updateScan();
    }

    updateDrone(delta) {
      var dx = 0;
      var dy = 0;
      var keyboardActive = document.activeElement === this.game.canvas;

      if (keyboardActive) {
        if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
        if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
        if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
        if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
      }

      if (dx !== 0 || dy !== 0) {
        this.pointerTarget = null;
        var length = Math.sqrt(dx * dx + dy * dy) || 1;
        dx /= length;
        dy /= length;
        this.moveDrone(dx * DRONE_SPEED * delta, dy * DRONE_SPEED * delta);
        this.targetAngle = Math.atan2(dy, dx) + Math.PI / 2;
      } else if (this.pointerTarget) {
        var targetX = this.pointerTarget.x - this.drone.x;
        var targetY = this.pointerTarget.y - this.drone.y;
        var distance = Math.sqrt(targetX * targetX + targetY * targetY);

        if (distance > 4) {
          var step = Math.min(distance, DRONE_SPEED * delta);
          this.moveDrone((targetX / distance) * step, (targetY / distance) * step);
          this.targetAngle = Math.atan2(targetY, targetX) + Math.PI / 2;
        } else {
          this.pointerTarget = null;
        }
      }

      if (!reducedMotion && (this.pointerTarget || keyboardActive)) {
        this.drone.rotation = Phaser.Math.Angle.RotateTo(this.drone.rotation, this.targetAngle, 0.16);
      }
    }

    moveDrone(dx, dy) {
      this.drone.x = Phaser.Math.Clamp(this.drone.x + dx, FIELD.left, FIELD.right);
      this.drone.y = Phaser.Math.Clamp(this.drone.y + dy, FIELD.top, FIELD.bottom);
    }

    updateReadout() {
      if (!this.coordsText) return;
      var x = pxToWorldX(this.drone.x);
      var y = pxToWorldY(this.drone.y);
      this.coordsText.setText('x ' + x.toFixed(2).replace('.', ',') + ' · y ' +
        y.toFixed(2).replace('.', ','));
    }

    checkBeacons() {
      for (var i = 0; i < this.beacons.length; i += 1) {
        var beacon = this.beacons[i];
        if (beacon.collected) continue;
        var distance = Phaser.Math.Distance.Between(this.drone.x, this.drone.y, beacon.x, beacon.y);
        if (distance < BEACON_RADIUS) {
          this.collectBeacon(beacon);
          break;
        }
      }
    }

    collectBeacon(beacon) {
      beacon.collected = true;
      this.limits[beacon.config.key] = true;

      if (beacon.tween) beacon.tween.stop();
      beacon.pulse.setVisible(false);
      beacon.ring.setFillStyle(COLORS.sand, 1).setStrokeStyle(2, COLORS.paper, 1);
      beacon.dot.setVisible(false);
      beacon.check.setVisible(true);
      beacon.label.setColor('#f4efe7');

      var burst = this.add.circle(beacon.x, beacon.y, 18, 0xffffff, 0)
        .setStrokeStyle(2, COLORS.sand, 0.9)
        .setDepth(4);

      this.tweens.add({
        targets: burst,
        scale: 2.1,
        alpha: 0,
        duration: reducedMotion ? 0 : 650,
        onComplete: function () {
          burst.destroy();
        }
      });

      markLimit(beacon.config.key);
      renderFormula(this.order, this.limits);

      var count = Object.keys(this.limits).filter(function (key) {
        return this.limits[key];
      }, this).length;

      if (count === 4) {
        this.completeLimits();
        return;
      }

      setStatus('Límite ' + beacon.config.label + ' registrado · ' + count + ' de 4.');
      announce('Límite ' + beacon.config.label + ' registrado. Quedan ' + (4 - count) + '.');
    }

    completeLimits() {
      this.phase = 'choose';
      setPhase('Elegir barrido');
      setStatus('Límites completos. Elegí cómo barrer el lote.');
      setSweepEnabled(true);
      renderFormula(null, this.limits);
      announce('Límites completos. Elegí franjas verticales u horizontales.');
    }

    restartMission() {
      this.scene.restart();
    }

    startSweep(order) {
      if (this.phase !== 'choose') return;
      if (order !== 'vertical' && order !== 'horizontal') return;

      this.order = order;
      this.phase = 'sweep';
      this.completedStrips = 0;
      this.stripLocked = false;

      markChosenOrder(order);
      renderFormula(order, this.limits);
      setFormulaResult(0);
      updateAccumulation(order, 0, false);
      setArea(0);
      setPhase('Barrido · 1 / 6');
      setStatus('Recorré el carril 1 de 6 de punta a punta.');

      this.buildStrips(order);
      this.activateStrip(0);

      announce(order === 'vertical'
        ? 'Franjas verticales: integrar en y da 3; cada ancho delta x de un tercio suma 1 unidad cuadrada.'
        : 'Franjas horizontales: integrar en x da 2; cada alto delta y de un medio suma 1 unidad cuadrada.');
    }

    buildStrips(order) {
      var vertical = order === 'vertical';
      var self = this;

      this.stripLayer.removeAll(true);
      this.strips = [];
      this.activeOutline.clear();
      this.clearGuide();

      for (var i = 0; i < STRIP_COUNT; i += 1) {
        var bounds = stripBounds(i, vertical);
        var rect;
        var scan;

        if (vertical) {
          var x = toX(bounds.x0);
          var width = toX(bounds.x1) - toX(bounds.x0);
          rect = this.add.rectangle(x, FIELD.top, width, FIELD.bottom - FIELD.top, COLORS.sand, 0)
            .setOrigin(0, 0);
          scan = this.add.rectangle(x, FIELD.bottom, width, 0, COLORS.scan, 0.5).setOrigin(0, 1);
        } else {
          var y = toY(bounds.y1);
          var height = toY(bounds.y0) - toY(bounds.y1);
          rect = this.add.rectangle(FIELD.left, y, FIELD.right - FIELD.left, height, COLORS.sand, 0)
            .setOrigin(0, 0);
          scan = this.add.rectangle(FIELD.left, y, 0, height, COLORS.scan, 0.5).setOrigin(0, 0);
        }

        this.stripLayer.add([rect, scan]);
        this.strips.push({ rect: rect, scan: scan, index: i });
      }

      this.currentStrip = null;
      this.scanMin = 0;
      this.scanMax = 0;
      self.stripIndex = 0;
    }

    activateStrip(index) {
      var strip = this.strips[index];
      if (!strip) return;

      this.stripIndex = index;
      this.currentStrip = strip;
      this.scanMin = Infinity;
      this.scanMax = -Infinity;

      var vertical = this.order === 'vertical';
      var bounds = stripBounds(index, vertical);

      this.drawActiveOutline(bounds, vertical);
      strip.rect.setFillStyle(COLORS.sand, 0.09);

      this.clearGuide();

      var guideX;
      var guideY;
      if (vertical) {
        guideX = (toX(bounds.x0) + toX(bounds.x1)) / 2;
        guideY = FIELD.bottom - 20;
      } else {
        guideX = FIELD.left + 20;
        guideY = (toY(bounds.y0) + toY(bounds.y1)) / 2;
      }

      this.guide = this.add.text(guideX, guideY, vertical ? '↑' : '→', {
        fontFamily: SANS,
        fontSize: '26px',
        color: '#f4efe7'
      }).setOrigin(0.5).setDepth(4);

      if (!reducedMotion) {
        this.tweens.add({
          targets: this.guide,
          alpha: 0.35,
          y: guideY - (vertical ? 9 : 0),
          x: guideX + (vertical ? 0 : 9),
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }

      setPhase('Barrido · ' + (index + 1) + ' / 6');
      setStatus('Recorré el carril ' + (index + 1) + ' de 6 de punta a punta.');
    }

    drawActiveOutline(bounds, vertical) {
      var g = this.activeOutline;
      g.clear();

      var x0 = toX(bounds.x0);
      var x1 = toX(bounds.x1);
      var y0 = toY(bounds.y1);
      var y1 = toY(bounds.y0);

      g.lineStyle(1, COLORS.sand, 0.4);
      g.strokeRect(x0, y0, x1 - x0, y1 - y0);

      g.lineStyle(2, COLORS.sand, 0.95);
      var length = 10;
      g.lineBetween(x0, y0, x0 + length, y0);
      g.lineBetween(x0, y0, x0, y0 + length);
      g.lineBetween(x1, y0, x1 - length, y0);
      g.lineBetween(x1, y0, x1, y0 + length);
      g.lineBetween(x0, y1, x0 + length, y1);
      g.lineBetween(x0, y1, x0, y1 - length);
      g.lineBetween(x1, y1, x1 - length, y1);
      g.lineBetween(x1, y1, x1, y1 - length);
    }

    clearGuide() {
      if (!this.guide) return;
      this.tweens.killTweensOf(this.guide);
      this.guide.destroy();
      this.guide = null;
    }

    updateScan() {
      if (this.stripLocked || !this.currentStrip) return;

      var vertical = this.order === 'vertical';
      var bounds = stripBounds(this.currentStrip.index, vertical);
      var x = pxToWorldX(this.drone.x);
      var y = pxToWorldY(this.drone.y);
      var inside = vertical
        ? x >= bounds.x0 && x <= bounds.x1
        : y >= bounds.y0 && y <= bounds.y1;

      if (!inside) return;

      var position = vertical ? y : x;
      this.scanMin = Math.min(this.scanMin, position);
      this.scanMax = Math.max(this.scanMax, position);

      var strip = this.currentStrip;

      if (vertical) {
        strip.scan.y = toY(this.scanMax);
        strip.scan.height = Math.max(0, toY(this.scanMin) - toY(this.scanMax));
      } else {
        strip.scan.x = toX(this.scanMin);
        strip.scan.width = Math.max(0, toX(this.scanMax) - toX(this.scanMin));
      }

      var span = vertical ? WORLD.yMax : WORLD.xMax;
      if (this.scanMax - this.scanMin >= span * SCAN_THRESHOLD) {
        this.completeStrip();
      }
    }

    completeStrip() {
      if (this.stripLocked || !this.currentStrip) return;

      this.stripLocked = true;
      var strip = this.currentStrip;
      var vertical = this.order === 'vertical';

      if (vertical) {
        strip.scan.y = FIELD.top;
        strip.scan.height = FIELD.bottom - FIELD.top;
      } else {
        strip.scan.x = FIELD.left;
        strip.scan.width = FIELD.right - FIELD.left;
      }

      strip.rect.setFillStyle(COLORS.sand, 0.04);
      this.completedStrips += 1;
      setArea(this.completedStrips);
      setFormulaResult(this.completedStrips);
      updateAccumulation(this.order, this.completedStrips, true);
      this.activeOutline.clear();

      this.clearGuide();

      this.showGain(strip, vertical);

      if (this.completedStrips >= STRIP_COUNT) {
        this.finishMission();
        return;
      }

      setPhase('Barrido · ' + (this.completedStrips + 1) + ' / 6');
      setStatus('Franja ' + this.completedStrips + ' lista · acumulado ' + this.completedStrips + ' u².');
      announce('Franja ' + this.completedStrips + ' suma 1 unidad cuadrada. Acumulado: ' +
        this.completedStrips + ' de 6 unidades cuadradas.');

      this.time.delayedCall(reducedMotion ? 0 : 450, function () {
        this.stripLocked = false;
        this.activateStrip(this.completedStrips);
      }, [], this);
    }

    showGain(strip, vertical) {
      if (reducedMotion) return;

      var bounds = stripBounds(strip.index, vertical);
      var x = (toX(bounds.x0) + toX(bounds.x1)) / 2;
      var y = (toY(bounds.y0) + toY(bounds.y1)) / 2;

      var gain = this.add.text(x, y, '+1 u²', {
        fontFamily: MATH,
        fontSize: '20px',
        color: '#f4efe7'
      }).setOrigin(0.5).setDepth(6).setAlpha(0);

      this.tweens.add({
        targets: gain,
        alpha: 1,
        y: y - 18,
        duration: 420,
        yoyo: true,
        hold: 260,
        onComplete: function () {
          gain.destroy();
        }
      });
    }

    finishMission() {
      this.phase = 'complete';
      this.currentStrip = null;
      this.stripLocked = true;

      this.clearGuide();

      this.activeOutline.clear();
      setPhase('Completado');
      setStatus('Misión cumplida: 6 u². La cobertura del lote es la integral iterada.');
      setFormulaResult(this.completedStrips);
      revealBonus();

      announce('Sexta franja: suma 1 unidad cuadrada. Total acumulado: 6 unidades cuadradas. ' +
        'Misión cumplida; se desbloqueó el reto bonus.');

      this.celebrate();
    }

    celebrate() {
      if (reducedMotion) return;

      var centerX = (FIELD.left + FIELD.right) / 2;
      var centerY = (FIELD.top + FIELD.bottom) / 2;

      [0, 1, 2].forEach(function (index) {
        var ring = this.add.circle(centerX, centerY, 28 + index * 10, 0xffffff, 0)
          .setStrokeStyle(2, COLORS.sand, 0.65)
          .setDepth(4);

        this.tweens.add({
          targets: ring,
          scale: 2.8 + index * 0.7,
          alpha: 0,
          duration: 900 + index * 180,
          delay: index * 110,
          onComplete: function () {
            ring.destroy();
          }
        });
      }, this);
    }
  }

  function bindUI() {
    ui.sweepButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        if (!missionApi) return;
        missionApi.startSweep(button.getAttribute('data-sweep'));
      });
    });

    if (ui.restart) {
      ui.restart.addEventListener('click', function () {
        if (missionApi) missionApi.restart();
      });
    }

    ui.bonusButtons.forEach(function (button) {
      button.addEventListener('click', function () {
        answerBonus(button.getAttribute('data-bonus-answer'));
      });
    });
  }

  var gameBooted = false;

  function bootGame() {
    if (gameBooted) return;
    gameBooted = true;

    if (!window.Phaser || !window.Phaser.Scene || window.__phaserFailed) {
      showFallback();
      return;
    }

    if (ui.fallback) ui.fallback.hidden = true;

    try {
      new Phaser.Game({
        type: Phaser.AUTO,
        parent: container,
        width: 560,
        height: 560,
        backgroundColor: '#0d1510',
        scale: {
          mode: Phaser.Scale.FIT,
          autoCenter: Phaser.Scale.CENTER_BOTH
        },
        render: {
          antialias: true
        },
        scene: [MissionScene]
      });
    } catch (error) {
      showFallback();
    }
  }

  bindUI();
  resetUI();

  if ('IntersectionObserver' in window) {
    var bootObserver = new IntersectionObserver(function (entries) {
      var visible = entries.some(function (entry) {
        return entry.isIntersecting;
      });
      if (!visible) return;
      bootObserver.disconnect();
      bootGame();
    }, { rootMargin: '700px 0px' });

    bootObserver.observe(container);
  } else {
    bootGame();
  }
}());
