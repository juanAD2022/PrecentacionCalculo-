(function () {
  'use strict';

  var container = document.getElementById('poolVolume3d');
  if (!container) return;

  var LENGTH = 10;
  var WIDTH = 5;
  var STRIPS = 8;
  var COLORS = {
    water: 0x2e9bb2,
    waterLight: 0x75d1d5,
    bottom: 0x214756,
    wall: 0x8dc8cf,
    probe: 0xe8d4b7,
    scan: 0x9dc182,
    ink: 0x0d1510
  };

  if (window.__poolThreeFailed || !window.THREE || !window.THREE.OrbitControls) {
    setState('Visor 3D no disponible');
    return;
  }

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.ink);
  var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(13, 11, 13);

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  } catch (error) {
    setState('WebGL no disponible');
    return;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(COLORS.ink, 1);
  renderer.domElement.setAttribute('tabindex', '0');
  renderer.domElement.setAttribute('aria-label', 'Visor 3D rotatable de la piscina con fondo inclinado.');
  container.replaceChildren(renderer.domElement);
  container.classList.add('is-3d');

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 8;
  controls.maxDistance = 24;
  controls.maxPolarAngle = Math.PI * 0.88;
  controls.target.set(0, -0.4, 0);

  scene.add(new THREE.HemisphereLight(0xb9d6d8, 0x10241d, 2.2));
  var keyLight = new THREE.DirectionalLight(0xffffff, 2.8);
  keyLight.position.set(-6, 12, 8);
  scene.add(keyLight);
  var rimLight = new THREE.DirectionalLight(0x75d1d5, 1.2);
  rimLight.position.set(8, 4, -8);
  scene.add(rimLight);

  var poolGroup = new THREE.Group();
  var measurementGroup = new THREE.Group();
  var probe = new THREE.Group();
  scene.add(poolGroup, measurementGroup, probe);
  var waterSurface;
  var waterVolume;
  var fillAnimation = null;

  function setState(value) {
    var state = document.getElementById('pool3dState');
    if (state) state.textContent = value;
  }

  function depthAt(x) {
    return 2 + 0.2 * x;
  }

  function depthY(x) {
    return -depthAt(x);
  }

  function material(color, opacity, transparent) {
    return new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.45,
      metalness: 0.05,
      opacity: opacity,
      transparent: transparent
    });
  }

  function addSlopedSurface() {
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -5, depthY(-5), -2.5, 5, depthY(5), -2.5,
      5, depthY(5), 2.5, -5, depthY(-5), 2.5
    ], 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    poolGroup.add(new THREE.Mesh(geometry, material(COLORS.bottom, 1, false)));
  }

  function addQuad(vertices, target, mat) {
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setIndex([0, 1, 2, 0, 2, 3]);
    geometry.computeVertexNormals();
    target.add(new THREE.Mesh(geometry, mat));
  }

  function addPool() {
    addSlopedSurface();
    var glass = material(COLORS.wall, 0.34, true);
    addQuad([-5, 0, -2.5, 5, 0, -2.5, 5, depthY(5), -2.5, -5, depthY(-5), -2.5], poolGroup, glass);
    addQuad([-5, 0, 2.5, -5, depthY(-5), 2.5, 5, depthY(5), 2.5, 5, 0, 2.5], poolGroup, glass);
    addQuad([-5, 0, -2.5, -5, depthY(-5), -2.5, -5, depthY(-5), 2.5, -5, 0, 2.5], poolGroup, glass);
    addQuad([5, 0, -2.5, 5, 0, 2.5, 5, depthY(5), 2.5, 5, depthY(5), -2.5], poolGroup, glass);

    waterSurface = new THREE.Mesh(new THREE.BoxGeometry(LENGTH, 0.08, WIDTH), material(COLORS.waterLight, 0.5, true));
    waterSurface.position.y = -3;
    waterSurface.visible = false;
    poolGroup.add(waterSurface);

    var waterGeometry = new THREE.BufferGeometry();
    waterGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      -5, 0, -2.5, 5, 0, -2.5, 5, 0, 2.5, -5, 0, 2.5,
      -5, depthY(-5), -2.5, 5, depthY(5), -2.5, 5, depthY(5), 2.5, -5, depthY(-5), 2.5
    ], 3));
    waterGeometry.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
    waterGeometry.computeVertexNormals();
    waterVolume = new THREE.Mesh(waterGeometry, material(COLORS.water, 0, true));
    poolGroup.add(waterVolume);

    var grid = new THREE.GridHelper(10, 10, 0x9aa69a, 0x9aa69a);
    grid.scale.z = 0.5;
    grid.position.y = 0.1;
    grid.material.opacity = 0.22;
    grid.material.transparent = true;
    poolGroup.add(grid);
  }

  function addProbe() {
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.55), material(COLORS.probe, 1, false));
    head.position.y = 0.8;
    var rod = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.4, 10), material(COLORS.probe, 0.9, false));
    rod.position.y = 0.1;
    var sensor = new THREE.Mesh(new THREE.SphereGeometry(0.11, 12, 8), material(COLORS.scan, 1, false));
    sensor.position.y = -0.62;
    probe.add(head, rod, sensor);
  }

  function addColumn(index) {
    var width = LENGTH / STRIPS;
    var x = -LENGTH / 2 + (index + 0.5) * width;
    var depth = depthAt(x);
    var column = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, depth, WIDTH * 0.82), material(COLORS.scan, 0.36, true));
    column.position.set(x, -depth / 2, 0);
    measurementGroup.add(column);
  }

  function resetView() {
    camera.position.set(13, 11, 13);
    controls.target.set(0, -0.4, 0);
    controls.update();
  }

  function reset() {
    measurementGroup.clear();
    probe.position.set(0, 0, 0);
    if (waterSurface) waterSurface.visible = false;
    if (waterVolume) {
      waterVolume.visible = false;
      waterVolume.material.opacity = 0;
    }
    fillAnimation = null;
    setState('Esperando mediciones');
    resetView();
  }

  function syncProbe(detail) {
    probe.position.x = THREE.MathUtils.clamp(Number(detail.x) - LENGTH / 2, -5, 5);
    probe.position.z = THREE.MathUtils.clamp(Number(detail.z), -WIDTH / 2, WIDTH / 2);
  }

  function animateFill() {
    if (fillAnimation) return;
    fillAnimation = { start: performance.now(), duration: 4200 };
    if (waterSurface) {
      waterSurface.visible = true;
      waterSurface.position.y = -3;
    }
    if (waterVolume) waterVolume.visible = true;
    setState('Llenando piscina');
  }

  function render(now) {
    if (fillAnimation) {
      var progress = Math.min(1, (now - fillAnimation.start) / fillAnimation.duration);
      var eased = 1 - Math.pow(1 - progress, 3);
      waterSurface.position.y = -3 + eased * 3;
      waterVolume.material.opacity = eased * 0.32;
      if (progress >= 1) {
        fillAnimation = null;
        setState('Piscina llena · 100 m³');
      }
    }
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  function resize() {
    var width = container.clientWidth;
    var height = container.clientHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  addPool();
  addProbe();
  reset();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(render);

  document.addEventListener('pool:reset', reset);
  document.addEventListener('pool:probe', function (event) { syncProbe(event.detail); });
  document.addEventListener('pool:strip', function (event) {
    addColumn(event.detail.index);
    setState('Midiendo franja ' + (event.detail.index + 1) + ' / ' + STRIPS);
  });
  document.addEventListener('pool:start', function () { setState('Medición en curso'); });
  document.addEventListener('pool:complete', animateFill);

  document.querySelectorAll('[data-pool-view]').forEach(function (button) {
    button.addEventListener('click', function () {
      var view = button.getAttribute('data-pool-view');
      if (view === 'top') camera.position.set(0, 17, 0.01);
      else if (view === 'side') camera.position.set(15, 4, 0.01);
      else resetView();
      controls.target.set(0, -0.4, 0);
      controls.update();
    });
  });

  function showFallback() {
    var state = document.getElementById('pool3dState');
    if (state) state.textContent = 'Visor 3D no disponible';
  }
}());
