/**
 * UNIAJC · Cálculo — piscina con fondo inclinado.
 * Reconoce dimensiones, mide franjas y calcula volumen y tiempo de llenado.
 */
(function () {
  'use strict';

  var container = document.getElementById('poolVolumeGame');
  if (!container) return;

  var PLAN = { left: 48, right: 302, top: 92, bottom: 454 };
  var PROFILE = { left: 350, right: 524, top: 150, bottom: 438 };
  var WORLD = { length: 10, width: 5 };
  var STRIP_COUNT = 8;
  var SPEED = 190;
  var BEACON_RADIUS = 30;
  var SANS = 'Inter, Manrope, "Helvetica Neue", Arial, sans-serif';
  var MATH = 'Cambria Math, "STIX Two Math", Georgia, serif';
  var COLORS = {
    background: 0x0d1510,
    shallow: 0x719d83,
    deep: 0x244d5a,
    grid: 0xa8c5ae,
    sand: 0xe8d4b7,
    paper: 0xf4efe7,
    scan: 0x9dc182,
    ink: 0x101113
  };
  var reducedMotion = Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var ui = {
    phase: document.getElementById('poolMissionPhase'),
    order: document.getElementById('poolMissionOrder'),
    equation: document.getElementById('poolMissionEquation'),
    readout: document.getElementById('poolMissionReadout'),
    progress: document.getElementById('poolMissionProgress'),
    progressFill: document.getElementById('poolMissionProgressFill'),
    volume: document.getElementById('poolMissionVolume'),
    time: document.getElementById('poolMissionTime'),
    flow: document.getElementById('poolFlowRate'),
    live: document.getElementById('poolMissionLive'),
    fallback: document.getElementById('poolMissionFallback'),
    start: document.querySelector('[data-pool-start]'),
    restart: document.querySelector('[data-pool-restart]'),
    limits: {}
  };

  Array.prototype.slice.call(document.querySelectorAll('[data-pool-limit]')).forEach(function (item) {
    ui.limits[item.getAttribute('data-pool-limit')] = {
      item: item,
      value: item.querySelector('strong')
    };
  });

  var missionApi = null;
  var lastVolume = 0;
  var timer = 0;

  function emitPoolEvent(type, detail) {
    document.dispatchEvent(new CustomEvent('pool:' + type, { detail: detail || {} }));
  }

  function announce(text) {
    if (!ui.live) return;
    window.clearTimeout(timer);
    ui.live.textContent = '';
    timer = window.setTimeout(function () { ui.live.textContent = text; }, 60);
  }

  function text(element, value) {
    if (element) element.textContent = value;
  }

  function format(value) {
    return value.toFixed(1).replace('.', ',');
  }

  function toX(x) {
    return PLAN.left + (x / WORLD.length) * (PLAN.right - PLAN.left);
  }

  function toY(y) {
    return PLAN.bottom - (y / WORLD.width) * (PLAN.bottom - PLAN.top);
  }

  function depthAt(x) {
    return 1 + 0.2 * x;
  }

  function setProgress(value) {
    text(ui.progress, value + ' / ' + STRIP_COUNT);
    if (ui.progressFill) ui.progressFill.style.width = ((value / STRIP_COUNT) * 100) + '%';
  }

  function setLimit(key, value) {
    var limit = ui.limits[key];
    if (!limit) return;
    limit.value.textContent = value;
    limit.item.classList.add('is-collected');
  }

  function resetLimits() {
    Object.keys(ui.limits).forEach(function (key) {
      ui.limits[key].value.textContent = '?';
      ui.limits[key].item.classList.remove('is-collected');
    });
  }

  function setFormula(complete) {
    if (!ui.equation) return;
    ui.equation.innerHTML = 'V = <span class="pool-mission-integral">∫</span><sub>0</sub><sup>5</sup><span class="pool-mission-integral">∫</span><sub>0</sub><sup>10</sup> (1 + 0,2<em>x</em>) d<em>x</em> d<em>y</em>';
    if (complete) ui.equation.innerHTML += '<strong>= 100 m³</strong>';
  }

  function updateTime() {
    var flow = Number(ui.flow && ui.flow.value);
    if (!lastVolume || !flow || flow <= 0) {
      text(ui.time, '—');
      return;
    }
    text(ui.time, format(lastVolume / flow) + ' min');
  }

  function resetUI() {
    text(ui.phase, 'Inspección');
    text(ui.order, 'sin definir');
    text(ui.readout, 'Reconocé los cuatro bordes de la piscina.');
    text(ui.volume, '—');
    lastVolume = 0;
    updateTime();
    setProgress(0);
    setFormula(false);
    resetLimits();
    if (ui.start) ui.start.disabled = true;
    emitPoolEvent('reset');
  }

  var SceneBase = (window.Phaser && window.Phaser.Scene) || function () {};

  class PoolScene extends SceneBase {
    constructor() {
      super({ key: 'PoolScene' });
    }

    create() {
      this.phase = 'limits';
      this.collected = { shallow: false, deep: false, length: false, width: false };
      this.stripIndex = 0;
      this.volume = 0;
      this.pointerTarget = null;
      this.scanLocked = false;
      this.drawPool();
      this.measuredColumns = this.add.graphics().setDepth(3);
      this.createBeacons();
      this.createProbe();
      this.setupInput();
      missionApi = { start: this.startScan.bind(this), restart: this.restart.bind(this) };
      resetUI();
      announce('Inspección iniciada. Medí la piscina antes de abrir las válvulas.');
    }

    drawPool() {
      var graphics = this.add.graphics().setDepth(0);
      graphics.fillStyle(COLORS.background, 1);
      graphics.fillRect(0, 0, 560, 560);

      this.add.text(PLAN.left, PLAN.top - 34, 'PLANTA · 10 m × 5 m', {
        fontFamily: SANS, fontSize: '14px', color: '#e8d4b7'
      });
      graphics.fillStyle(COLORS.shallow, 0.85);
      graphics.fillRect(PLAN.left, PLAN.top, PLAN.right - PLAN.left, PLAN.bottom - PLAN.top);
      var segments = 20;
      for (var i = 0; i < segments; i += 1) {
        var x0 = i * WORLD.length / segments;
        var x1 = (i + 1) * WORLD.length / segments;
        var color = Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.IntegerToColor(COLORS.shallow),
          Phaser.Display.Color.IntegerToColor(COLORS.deep),
          segments - 1,
          i
        );
        var rgb = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
        graphics.fillStyle(rgb, 0.92);
        graphics.fillRect(toX(x0), PLAN.top, toX(x1) - toX(x0) + 1, PLAN.bottom - PLAN.top);
      }
      graphics.lineStyle(1, COLORS.grid, 0.22);
      for (var x = 1; x < WORLD.length; x += 1) graphics.lineBetween(toX(x), PLAN.top, toX(x), PLAN.bottom);
      for (var y = 1; y < WORLD.width; y += 1) graphics.lineBetween(PLAN.left, toY(y), PLAN.right, toY(y));
      graphics.lineStyle(2, COLORS.sand, 0.9);
      graphics.strokeRect(PLAN.left, PLAN.top, PLAN.right - PLAN.left, PLAN.bottom - PLAN.top);
      this.add.text(PLAN.left, PLAN.bottom + 19, '0', { fontFamily: SANS, fontSize: '13px', color: '#b7c3b7' }).setOrigin(0.5);
      this.add.text(PLAN.right, PLAN.bottom + 19, '10 m', { fontFamily: SANS, fontSize: '13px', color: '#b7c3b7' }).setOrigin(0.5);
      this.add.text(PLAN.left - 8, PLAN.top - 10, 'y', { fontFamily: MATH, fontSize: '20px', color: '#e8d4b7' });
      this.add.text(PLAN.right + 12, PLAN.bottom + 2, 'x', { fontFamily: MATH, fontSize: '20px', color: '#e8d4b7' });

      this.drawProfile();
    }

    drawProfile() {
      var profile = this.add.graphics().setDepth(1);
      this.add.text(PROFILE.left, PROFILE.top - 34, 'CORTE LATERAL · PROFUNDIDAD', {
        fontFamily: SANS, fontSize: '14px', color: '#e8d4b7'
      });
      profile.fillStyle(0x2e6170, 0.72);
      profile.beginPath();
      profile.moveTo(PROFILE.left, PROFILE.top);
      profile.lineTo(PROFILE.right, PROFILE.top);
      profile.lineTo(PROFILE.right, PROFILE.bottom);
      profile.lineTo(PROFILE.left, PROFILE.bottom - 145);
      profile.closePath();
      profile.fillPath();
      profile.lineStyle(2, COLORS.sand, 0.9);
      profile.lineBetween(PROFILE.left, PROFILE.top, PROFILE.right, PROFILE.top);
      profile.lineBetween(PROFILE.left, PROFILE.top, PROFILE.left, PROFILE.bottom - 145);
      profile.lineBetween(PROFILE.right, PROFILE.top, PROFILE.right, PROFILE.bottom);
      profile.lineStyle(3, COLORS.deep, 1);
      profile.lineBetween(PROFILE.left, PROFILE.bottom - 145, PROFILE.right, PROFILE.bottom);
      profile.lineStyle(1, COLORS.grid, 0.25);
      for (var depth = 1; depth <= 3; depth += 1) {
        var level = PROFILE.top + depth * 72;
        profile.lineBetween(PROFILE.left - 5, level, PROFILE.left, level);
      }
      this.add.text(PROFILE.left - 10, PROFILE.bottom - 145, '1 m', { fontFamily: MATH, fontSize: '14px', color: '#b7c3b7' }).setOrigin(1, 0.5);
      this.add.text(PROFILE.right + 8, PROFILE.bottom - 5, '3 m', { fontFamily: MATH, fontSize: '14px', color: '#b7c3b7' }).setOrigin(0, 0.5);
      this.add.text(PROFILE.left, PROFILE.bottom + 21, 'extremo superficial', { fontFamily: SANS, fontSize: '11px', color: '#b7c3b7' });
      this.add.text(PROFILE.right, PROFILE.bottom + 21, 'extremo profundo', { fontFamily: SANS, fontSize: '11px', color: '#b7c3b7' }).setOrigin(1, 0);
    }

    createBeacons() {
      var configs = [
        { key: 'shallow', x: 0, y: 2.5, label: '1 m' },
        { key: 'deep', x: 10, y: 2.5, label: '3 m' },
        { key: 'length', x: 5, y: 0, label: '10 m' },
        { key: 'width', x: 5, y: 5, label: '5 m' }
      ];
      this.beacons = configs.map(function (config) {
        var beacon = this.add.container(toX(config.x), toY(config.y)).setDepth(5);
        var ring = this.add.circle(0, 0, 14, COLORS.ink, 0.8).setStrokeStyle(2, COLORS.sand, 0.95);
        var dot = this.add.circle(0, 0, 4, COLORS.sand, 1);
        var check = this.add.text(0, 0, '✓', { fontFamily: SANS, fontSize: '16px', color: '#203327' }).setOrigin(0.5).setVisible(false);
        var label = this.add.text(0, -25, config.label, { fontFamily: MATH, fontSize: '17px', color: '#e8d4b7' }).setOrigin(0.5);
        beacon.add([ring, dot, check, label]);
        return { key: config.key, x: toX(config.x), y: toY(config.y), ring: ring, check: check };
      }, this);
    }

    createProbe() {
      var probe = this.add.container(toX(5), toY(2.5)).setDepth(7);
      var mast = this.add.graphics();
      mast.lineStyle(2, COLORS.sand, 0.95);
      mast.lineBetween(0, -20, 0, 12);
      mast.lineStyle(1, COLORS.scan, 0.8);
      mast.lineBetween(-9, 12, 9, 12);
      var head = this.add.rectangle(0, -21, 14, 8, COLORS.paper, 1).setStrokeStyle(2, COLORS.ink, 0.9);
      var sensor = this.add.circle(0, 13, 4, COLORS.scan, 1).setStrokeStyle(1, COLORS.paper, 0.9);
      var wave = this.add.arc(0, 18, 12, 25, 205, false, COLORS.scan, 0).setStrokeStyle(1, COLORS.scan, 0.9);
      probe.add([mast, head, sensor, wave]);
      this.probe = probe;
    }

    setupInput() {
      var canvas = this.game.canvas;
      var self = this;
      canvas.setAttribute('tabindex', '0');
      canvas.setAttribute('aria-label', 'Planta y corte lateral de una piscina rectangular con fondo inclinado. Mové la sonda de profundidad.');
      this.cursors = this.input.keyboard.createCursorKeys();
      this.wasd = this.input.keyboard.addKeys('W,A,S,D');
      this.input.on('pointerdown', function (pointer) {
        canvas.focus();
        self.pointerTarget = { x: Phaser.Math.Clamp(pointer.x, PLAN.left, PLAN.right), y: Phaser.Math.Clamp(pointer.y, PLAN.top, PLAN.bottom) };
      });
      this.input.on('pointermove', function (pointer) {
        if (pointer.isDown) self.pointerTarget = { x: Phaser.Math.Clamp(pointer.x, PLAN.left, PLAN.right), y: Phaser.Math.Clamp(pointer.y, PLAN.top, PLAN.bottom) };
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
        this.probe.x = Phaser.Math.Clamp(this.probe.x + dx / length * SPEED * delta / 1000, PLAN.left, PLAN.right);
        this.probe.y = Phaser.Math.Clamp(this.probe.y + dy / length * SPEED * delta / 1000, PLAN.top, PLAN.bottom);
      } else if (this.pointerTarget) {
        var targetX = this.pointerTarget.x - this.probe.x;
        var targetY = this.pointerTarget.y - this.probe.y;
        var distance = Math.sqrt(targetX * targetX + targetY * targetY);
        if (distance > 4) {
          var step = Math.min(distance, SPEED * delta / 1000);
          this.probe.x += targetX / distance * step;
          this.probe.y += targetY / distance * step;
        } else this.pointerTarget = null;
      }
      emitPoolEvent('probe', {
        x: ((this.probe.x - PLAN.left) / (PLAN.right - PLAN.left)) * WORLD.length,
        z: ((PLAN.bottom - this.probe.y) / (PLAN.bottom - PLAN.top)) * WORLD.width - WORLD.width / 2
      });
      if (this.phase === 'limits') this.checkLimits();
      if (this.phase === 'scan') this.checkStrip();
    }

    checkLimits() {
      var self = this;
      this.beacons.forEach(function (beacon) {
        if (self.collected[beacon.key]) return;
        if (Phaser.Math.Distance.Between(self.probe.x, self.probe.y, beacon.x, beacon.y) > BEACON_RADIUS) return;
        self.collected[beacon.key] = true;
        beacon.ring.setStrokeStyle(2, COLORS.scan, 1);
        beacon.check.setVisible(true);
        var values = { shallow: '1 m', deep: '3 m', length: '10 m', width: '5 m' };
        setLimit(beacon.key, values[beacon.key]);
        var count = Object.keys(self.collected).filter(function (key) { return self.collected[key]; }).length;
        text(ui.readout, count === 4 ? 'Piscina medida. Barré franjas para acumular volumen.' : 'Dato registrado: ' + values[beacon.key] + '.');
        announce('Dato registrado.');
        if (count === 4) {
          self.phase = 'choose';
          text(ui.phase, 'Elegir barrido');
          if (ui.start) ui.start.disabled = false;
          announce('Piscina medida. Iniciá el barrido de franjas.');
        }
      });
    }

    startScan() {
      if (this.phase !== 'choose') return;
      this.phase = 'scan';
      this.stripIndex = 0;
      this.volume = 0;
      this.scanLocked = false;
      if (ui.start) ui.start.disabled = true;
      text(ui.order, 'dx dy');
      text(ui.phase, 'Medición · 1 / ' + STRIP_COUNT);
      text(ui.readout, 'Llevá el sensor hasta la franja iluminada.');
      setProgress(0);
      this.activateStrip();
      emitPoolEvent('start');
    }

    activateStrip() {
      if (this.guide) this.guide.destroy();
      var step = WORLD.length / STRIP_COUNT;
      var x0 = this.stripIndex * step;
      var x1 = (this.stripIndex + 1) * step;
      this.guide = this.add.graphics().setDepth(4);
      this.guide.lineStyle(3, COLORS.scan, 0.95);
      var middle = (x0 + x1) / 2;
      this.guide.lineBetween(toX(middle), PLAN.top, toX(middle), PLAN.bottom);
      var profileBottom = (PROFILE.bottom - 145) + (middle / WORLD.length) * 145;
      this.guide.lineBetween(PROFILE.left + (middle / WORLD.length) * (PROFILE.right - PROFILE.left), PROFILE.top,
        PROFILE.left + (middle / WORLD.length) * (PROFILE.right - PROFILE.left), profileBottom);
    }

    checkStrip() {
      if (this.scanLocked) return;
      var step = WORLD.length / STRIP_COUNT;
      var x0 = this.stripIndex * step;
      var x1 = (this.stripIndex + 1) * step;
      var targetX = toX((x0 + x1) / 2);
      var targetY = toY(WORLD.width / 2);
      if (Phaser.Math.Distance.Between(this.probe.x, this.probe.y, targetX, targetY) > 30) return;
      this.scanLocked = true;
      var dx = step;
      var width = WORLD.width;
      var depth = depthAt((x0 + x1) / 2);
      var contribution = depth * dx * width;
      this.volume += contribution;
      var columnX = PROFILE.left + ((x0 + x1) / 2 / WORLD.length) * (PROFILE.right - PROFILE.left);
      var columnBottom = (PROFILE.bottom - 145) + (((x0 + x1) / 2) / WORLD.length) * 145;
      this.measuredColumns.lineStyle(4, COLORS.scan, 0.85);
      this.measuredColumns.lineBetween(columnX, PROFILE.top, columnX, columnBottom);
      setProgress(this.stripIndex + 1);
      text(ui.readout, 'Franja medida: ΔV = ' + format(contribution) + ' m³ · acumulado = ' + format(this.volume) + ' m³.');
      emitPoolEvent('strip', {
        index: this.stripIndex,
        volume: this.volume,
        depth: depth
      });
      announce('Franja medida. Profundidad media: ' + format(depth) + ' metros.');
      this.stripIndex += 1;
      if (this.stripIndex >= STRIP_COUNT) {
        this.finish();
        return;
      }
      text(ui.phase, 'Medición · ' + (this.stripIndex + 1) + ' / ' + STRIP_COUNT);
      this.time.delayedCall(reducedMotion ? 0 : 250, function () {
        this.scanLocked = false;
        this.activateStrip();
      }, [], this);
    }

    finish() {
      this.phase = 'complete';
      if (this.guide) this.guide.destroy();
      lastVolume = 100;
      text(ui.phase, 'Listo para llenar');
      setFormula(true);
      text(ui.volume, '100 m³');
      updateTime();
      text(ui.readout, 'El volumen exacto es 100 m³. Ahora podés abrir las válvulas.');
      emitPoolEvent('complete', { volume: 100 });
      announce('Medición completa. La piscina necesita 100 metros cúbicos de agua.');
    }

    restart() {
      this.scene.restart();
    }
  }

  function showFallback() {
    if (ui.fallback) ui.fallback.hidden = false;
    text(ui.phase, 'Sin conexión');
    text(ui.readout, 'El volumen exacto es 100 m³. Con 2,5 m³/min, el llenado tarda 40 minutos.');
    if (ui.start) ui.start.disabled = true;
  }

  resetUI();
  if (ui.flow) ui.flow.addEventListener('input', updateTime);
  if (ui.start) ui.start.addEventListener('click', function () { if (missionApi) missionApi.start(); });
  if (ui.restart) ui.restart.addEventListener('click', function () { if (missionApi) missionApi.restart(); });

  if (!window.Phaser || !window.Phaser.Scene || window.__phaserFailed) {
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
      scene: [PoolScene]
    });
  } catch (error) {
    showFallback();
  }
}());
