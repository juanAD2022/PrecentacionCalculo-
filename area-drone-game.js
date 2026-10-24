/**
 * UNIAJC · Cálculo — misión agrícola de área.
 * Mide una parcela bajo y = x² con franjas y conecta la estimación con la integral doble.
 */
(function () {
  'use strict';

  var container = document.getElementById('areaDroneGame');
  if (!container) return;

  var FIELD = { left: 105, right: 475, top: 65, bottom: 475 };
  var WORLD = { minX: -1, maxX: 1, minY: 0, maxY: 1 };
  var STRIP_COUNT = 8;
  var DRONE_SPEED = 190;
  var BEACON_RADIUS = 30;
  var SANS = 'Inter, Manrope, "Helvetica Neue", Arial, sans-serif';
  var MATH = 'Cambria Math, "STIX Two Math", Georgia, serif';
  var COLORS = {
    background: 0x0d1510,
    field: 0x203327,
    region: 0x486b47,
    regionEdge: 0xa8c58f,
    grid: 0x9aa69a,
    sand: 0xe8d4b7,
    paper: 0xf4efe7,
    scan: 0x9dc182,
    muted: 0xb7c3b7,
    ink: 0x101113
  };
  var reducedMotion = Boolean(window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var ui = {
    phase: document.getElementById('areaMissionPhase'),
    type: document.getElementById('areaMissionType'),
    equation: document.getElementById('areaMissionEquation'),
    readout: document.getElementById('areaMissionReadout'),
    progress: document.getElementById('areaMissionProgress'),
    progressFill: document.getElementById('areaMissionProgressFill'),
    live: document.getElementById('areaMissionLive'),
    fallback: document.getElementById('areaMissionFallback'),
    restart: document.querySelector('[data-area-restart]'),
    sweepButtons: Array.prototype.slice.call(document.querySelectorAll('[data-area-sweep]')),
    limits: {}
  };

  Array.prototype.slice.call(document.querySelectorAll('[data-area-limit]')).forEach(function (chip) {
    ui.limits[chip.getAttribute('data-area-limit')] = {
      chip: chip,
      value: chip.querySelector('strong')
    };
  });

  var missionApi = null;
  var announceTimer = 0;

  function announce(text) {
    if (!ui.live) return;
    window.clearTimeout(announceTimer);
    ui.live.textContent = '';
    announceTimer = window.setTimeout(function () {
      ui.live.textContent = text;
    }, 60);
  }

  function setText(element, value) {
    if (element) element.textContent = value;
  }

  function setPhase(value) {
    setText(ui.phase, value);
  }

  function setProgress(value) {
    setText(ui.progress, value + ' / ' + STRIP_COUNT);
    if (ui.progressFill) ui.progressFill.style.width = ((value / STRIP_COUNT) * 100) + '%';
  }

  function format(value) {
    return value.toFixed(3).replace('.', ',');
  }

  function setLimits(key, value) {
    var limit = ui.limits[key];
    if (!limit) return;
    limit.value.textContent = value;
    limit.chip.classList.add('is-collected');
  }

  function resetLimits() {
    Object.keys(ui.limits).forEach(function (key) {
      ui.limits[key].value.textContent = '?';
      ui.limits[key].chip.classList.remove('is-collected');
    });
  }

  function setSweepEnabled(enabled) {
    ui.sweepButtons.forEach(function (button) {
      button.disabled = !enabled;
      button.classList.toggle('is-ready', enabled);
    });
  }

  function setFormula(order, complete) {
    if (!ui.type || !ui.equation) return;
    ui.type.textContent = order === 'vertical' ? 'TIPO I' : order === 'horizontal' ? 'TIPO II' : 'sin definir';
    if (!order) {
      ui.equation.innerHTML = 'A = ∬<sub>R</sub> 1 dA';
      return;
    }
    ui.equation.innerHTML = order === 'vertical'
      ? 'A = <span class="area-mission-integral">∫</span><sub>−1</sub><sup>1</sup><span class="area-mission-integral">∫</span><sub>0</sub><sup><em>x</em>²</sup> 1 d<em>y</em> d<em>x</em>'
      : 'A = <span class="area-mission-integral">∫</span><sub>0</sub><sup>1</sup> [<span class="area-mission-integral">∫</span><sub>−1</sub><sup>−√<em>y</em></sup> + <span class="area-mission-integral">∫</span><sub>√<em>y</em></sub><sup>1</sup>] 1 d<em>x</em> d<em>y</em>';
    if (complete) {
      ui.equation.innerHTML += '<strong class="area-mission-result"> = 2/3 ≈ 0,667 u²</strong>';
    }
  }

  function setReadout(value) {
    setText(ui.readout, value);
  }

  function stripContribution(order, index) {
    var step = (WORLD.maxX - WORLD.minX) / STRIP_COUNT;
    var width = step;
    if (order === 'vertical') {
      var x0 = WORLD.minX + index * step;
      var x1 = x0 + step;
      return ((x0 + x1) / 2) * ((x0 + x1) / 2) * width;
    }
    var yStep = (WORLD.maxY - WORLD.minY) / STRIP_COUNT;
    var y = WORLD.minY + (index + 0.5) * yStep;
    return 2 * (1 - Math.sqrt(y)) * yStep;
  }

  function stripBounds(order, index) {
    if (order === 'vertical') {
      var stepX = (WORLD.maxX - WORLD.minX) / STRIP_COUNT;
      return {
        x0: WORLD.minX + index * stepX,
        x1: WORLD.minX + (index + 1) * stepX,
        y0: 0,
        y1: 1
      };
    }
    var stepY = (WORLD.maxY - WORLD.minY) / STRIP_COUNT;
    return {
      x0: -1,
      x1: 1,
      y0: index * stepY,
      y1: (index + 1) * stepY
    };
  }

  function pointInRegion(x, y) {
    return y >= -0.01 && y <= x * x + 0.02;
  }

  var SceneBase = (window.Phaser && window.Phaser.Scene) || function () {};

  class AreaMissionScene extends SceneBase {
    constructor() {
      super({ key: 'AreaMissionScene' });
    }

    create() {
      this.phase = 'limits';
      this.order = null;
      this.collected = { left: false, right: false, base: false, curve: false };
      this.pointerTarget = null;
      this.stripIndex = 0;
      this.total = 0;
      this.scanLocked = false;
      this.drawField();
      this.createDrone();
      this.createBeacons();
      this.setupInput();
      missionApi = {
        startSweep: this.startSweep.bind(this),
        restart: this.restart.bind(this)
      };
      resetUI();
      announce('Misión iniciada. Reconocé las fronteras de la parcela.');
    }

    drawField() {
      var graphics = this.add.graphics().setDepth(0);
      graphics.fillStyle(COLORS.field, 1);
      graphics.fillRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);
      graphics.lineStyle(1, COLORS.grid, 0.12);
      for (var i = 1; i < 8; i += 1) {
        var x = FIELD.left + i * ((FIELD.right - FIELD.left) / 8);
        graphics.lineBetween(x, FIELD.top, x, FIELD.bottom);
      }
      for (var j = 1; j < 8; j += 1) {
        var y = FIELD.bottom - j * ((FIELD.bottom - FIELD.top) / 8);
        graphics.lineBetween(FIELD.left, y, FIELD.right, y);
      }

      var region = this.add.graphics().setDepth(1);
      region.fillStyle(COLORS.region, 0.85);
      region.beginPath();
      region.moveTo(toX(-1), toY(0));
      for (var left = -1; left <= 1; left += 0.05) region.lineTo(toX(left), toY(left * left));
      region.lineTo(toX(1), toY(0));
      region.closePath();
      region.fillPath();
      region.lineStyle(3, COLORS.regionEdge, 0.9);
      region.beginPath();
      for (var curve = -1; curve <= 1; curve += 0.05) {
        if (curve === -1) region.moveTo(toX(curve), toY(curve * curve));
        else region.lineTo(toX(curve), toY(curve * curve));
      }
      region.strokePath();
      region.lineBetween(toX(-1), toY(0), toX(1), toY(0));
      graphics.lineStyle(2, COLORS.sand, 0.85);
      graphics.strokeRect(FIELD.left, FIELD.top, FIELD.right - FIELD.left, FIELD.bottom - FIELD.top);

      this.add.text(FIELD.right + 16, FIELD.bottom + 12, 'x', { fontFamily: MATH, fontSize: '22px', color: '#e8d4b7' }).setOrigin(0.5);
      this.add.text(FIELD.left - 16, FIELD.top - 16, 'y', { fontFamily: MATH, fontSize: '22px', color: '#e8d4b7' }).setOrigin(0.5);
      this.add.text(toX(-1), FIELD.bottom + 23, '−1', { fontFamily: SANS, fontSize: '14px', color: '#b7c3b7' }).setOrigin(0.5);
      this.add.text(toX(0), FIELD.bottom + 23, '0', { fontFamily: SANS, fontSize: '14px', color: '#b7c3b7' }).setOrigin(0.5);
      this.add.text(toX(1), FIELD.bottom + 23, '1', { fontFamily: SANS, fontSize: '14px', color: '#b7c3b7' }).setOrigin(0.5);
      this.add.text(toX(0.62), toY(0.48), 'R', { fontFamily: MATH, fontSize: '28px', color: '#f4efe7' }).setAlpha(0.8);
    }

    createBeacons() {
      var configs = [
        { key: 'left', x: -1, y: 1, label: 'x = −1' },
        { key: 'right', x: 1, y: 1, label: 'x = 1' },
        { key: 'base', x: 0, y: 0, label: 'y = 0' },
        { key: 'curve', x: -0.5, y: 0.25, label: 'y = x²' }
      ];
      this.beacons = configs.map(function (config) {
        var beacon = this.add.container(toX(config.x), toY(config.y)).setDepth(5);
        var ring = this.add.circle(0, 0, 14, COLORS.ink, 0.75).setStrokeStyle(2, COLORS.sand, 0.9);
        var dot = this.add.circle(0, 0, 4, COLORS.sand, 1);
        var check = this.add.text(0, 0, '✓', { fontFamily: SANS, fontSize: '16px', color: '#203327' }).setOrigin(0.5).setVisible(false);
        var label = this.add.text(0, -26, config.label, { fontFamily: MATH, fontSize: '16px', color: '#e8d4b7' }).setOrigin(0.5);
        beacon.add([ring, dot, check, label]);
        return { key: config.key, x: toX(config.x), y: toY(config.y), ring: ring, check: check };
      }, this);
    }

    createDrone() {
      var drone = this.add.container(toX(0), toY(0.5)).setDepth(7);
      var arms = this.add.graphics();
      arms.lineStyle(4, COLORS.sand, 0.9);
      arms.lineBetween(-14, -10, 14, 10);
      arms.lineBetween(-14, 10, 14, -10);
      var body = this.add.circle(0, 0, 7, COLORS.paper, 1).setStrokeStyle(2, COLORS.ink, 0.9);
      var light = this.add.circle(0, 0, 3, COLORS.scan, 1);
      drone.add([arms, body, light]);
      this.drone = drone;
    }

    setupInput() {
      var canvas = this.game.canvas;
      var self = this;
      canvas.setAttribute('tabindex', '0');
      canvas.setAttribute('aria-label', 'Mapa interactivo de una parcela agrícola irregular.');
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D');
      this.input.on('pointerdown', function (pointer) {
        canvas.focus();
        self.pointerTarget = { x: Phaser.Math.Clamp(pointer.x, FIELD.left, FIELD.right), y: Phaser.Math.Clamp(pointer.y, FIELD.top, FIELD.bottom) };
      });
      this.input.on('pointermove', function (pointer) {
        if (pointer.isDown) self.pointerTarget = { x: Phaser.Math.Clamp(pointer.x, FIELD.left, FIELD.right), y: Phaser.Math.Clamp(pointer.y, FIELD.top, FIELD.bottom) };
      });
    }

    update(time, delta) {
      if (this.phase === 'complete') return;
      var dx = 0;
      var dy = 0;
      if (document.activeElement === this.game.canvas) {
        if (this.cursors.left.isDown || this.wasd.A.isDown) dx -= 1;
        if (this.cursors.right.isDown || this.wasd.D.isDown) dx += 1;
        if (this.cursors.up.isDown || this.wasd.W.isDown) dy -= 1;
        if (this.cursors.down.isDown || this.wasd.S.isDown) dy += 1;
      }
      if (dx || dy) {
        var length = Math.sqrt(dx * dx + dy * dy) || 1;
        this.drone.x = Phaser.Math.Clamp(this.drone.x + (dx / length) * DRONE_SPEED * delta / 1000, FIELD.left, FIELD.right);
        this.drone.y = Phaser.Math.Clamp(this.drone.y + (dy / length) * DRONE_SPEED * delta / 1000, FIELD.top, FIELD.bottom);
      } else if (this.pointerTarget) {
        var targetX = this.pointerTarget.x - this.drone.x;
        var targetY = this.pointerTarget.y - this.drone.y;
        var distance = Math.sqrt(targetX * targetX + targetY * targetY);
        if (distance > 4) {
          var step = Math.min(distance, DRONE_SPEED * delta / 1000);
          this.drone.x += targetX / distance * step;
          this.drone.y += targetY / distance * step;
        } else this.pointerTarget = null;
      }
      if (this.phase === 'limits') this.checkBeacons();
      if (this.phase === 'scan') this.checkStrip();
    }

    checkBeacons() {
      var self = this;
      this.beacons.forEach(function (beacon) {
        if (self.collected[beacon.key]) return;
        if (Phaser.Math.Distance.Between(self.drone.x, self.drone.y, beacon.x, beacon.y) > BEACON_RADIUS) return;
        self.collected[beacon.key] = true;
        beacon.ring.setStrokeStyle(2, COLORS.scan, 1);
        beacon.check.setVisible(true);
        var values = { left: '−1', right: '1', base: '0', curve: 'y = x²' };
        setLimits(beacon.key, values[beacon.key]);
        var count = Object.keys(self.collected).filter(function (key) { return self.collected[key]; }).length;
        setReadout(count === 4 ? 'Límites listos. Elegí cómo barrer la parcela.' : 'Frontera registrada: ' + values[beacon.key] + '.');
        announce('Frontera registrada.');
        if (count === 4) {
          setPhase('Elegir barrido');
          setSweepEnabled(true);
        }
      });
    }

    startSweep(order) {
      if (this.phase !== 'limits') return;
      this.phase = 'scan';
      this.order = order;
      this.stripIndex = 0;
      this.total = 0;
      this.scanLocked = false;
      setSweepEnabled(false);
      setFormula(order, false);
      setPhase('Medición · 1 / ' + STRIP_COUNT);
      setReadout('Llevá el dron hasta la franja iluminada.');
      setProgress(0);
      this.activateStrip();
      announce('Barrido iniciado. Volá hasta la primera franja.');
    }

    activateStrip() {
      if (this.stripGuide) this.stripGuide.destroy();
      var bounds = stripBounds(this.order, this.stripIndex);
      this.stripGuide = this.add.graphics().setDepth(4);
      var x0 = toX(bounds.x0);
      var x1 = toX(bounds.x1);
      var y0 = toY(bounds.y0);
      var y1 = toY(bounds.y1);
      this.stripGuide.lineStyle(3, COLORS.scan, 0.95);
      if (this.order === 'vertical') this.stripGuide.lineBetween((x0 + x1) / 2, y0, (x0 + x1) / 2, toY(((bounds.x0 + bounds.x1) / 2) ** 2));
      else this.stripGuide.lineBetween(x0, (y0 + y1) / 2, x1, (y0 + y1) / 2);
    }

    checkStrip() {
      if (this.scanLocked) return;
      var bounds = stripBounds(this.order, this.stripIndex);
      var middleY = (bounds.y0 + bounds.y1) / 2;
      var targetX = this.order === 'vertical'
        ? toX((bounds.x0 + bounds.x1) / 2)
        : toX(-(1 + Math.sqrt(middleY)) / 2);
      var targetY = this.order === 'vertical'
        ? toY(((bounds.x0 + bounds.x1) / 2) ** 2 / 2)
        : toY(middleY);
      if (Phaser.Math.Distance.Between(this.drone.x, this.drone.y, targetX, targetY) > 30) return;
      this.scanLocked = true;
      var contribution = stripContribution(this.order, this.stripIndex);
      this.total += contribution;
      setProgress(this.stripIndex + 1);
      setReadout('Franja medida: ΔA ≈ ' + format(contribution) + ' u² · acumulado ≈ ' + format(this.total) + ' u².');
      announce('Franja medida. Aporte: ' + format(contribution) + ' unidades cuadradas.');
      this.stripIndex += 1;
      if (this.stripIndex >= STRIP_COUNT) {
        this.finish();
        return;
      }
      setPhase('Medición · ' + (this.stripIndex + 1) + ' / ' + STRIP_COUNT);
      this.time.delayedCall(reducedMotion ? 0 : 300, function () {
        this.scanLocked = false;
        this.activateStrip();
      }, [], this);
    }

    finish() {
      this.phase = 'complete';
      if (this.stripGuide) this.stripGuide.destroy();
      setPhase('Completado');
      setFormula(this.order, true);
      setReadout('Estimación por franjas: ≈ ' + format(this.total) + ' u². Valor exacto: 2/3 ≈ 0,667 u².');
      announce('Misión cumplida. La superficie cultivable es dos tercios de unidad cuadrada.');
    }

    restart() {
      this.scene.restart();
    }
  }

  function resetUI() {
    setPhase('Reconocimiento');
    setText(ui.type, 'sin definir');
    setFormula(null, false);
    setReadout('Primero reconocé las cuatro fronteras.');
    setProgress(0);
    resetLimits();
    setSweepEnabled(false);
  }

  function showFallback() {
    if (ui.fallback) ui.fallback.hidden = false;
    setPhase('Sin conexión');
    setReadout('La fórmula exacta de la parcela es A = 2/3 u².');
    if (ui.restart) ui.restart.disabled = true;
  }

  ui.sweepButtons.forEach(function (button) {
    button.addEventListener('click', function () {
      if (missionApi) missionApi.startSweep(button.getAttribute('data-area-sweep'));
    });
  });
  if (ui.restart) ui.restart.addEventListener('click', function () { if (missionApi) missionApi.restart(); });

  if (!window.Phaser || !window.Phaser.Scene || window.__phaserFailed) {
    resetUI();
    showFallback();
    return;
  }

  try {
    new Phaser.Game({
      type: Phaser.AUTO,
      parent: container,
      width: 560,
      height: 560,
      backgroundColor: '#0d1510',
      scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
      render: { antialias: true },
      scene: [AreaMissionScene]
    });
  } catch (error) {
    resetUI();
    showFallback();
  }
}());

function toX(x) {
  return 105 + ((x + 1) / 2) * 370;
}

function toY(y) {
  return 475 - y * 410;
}
