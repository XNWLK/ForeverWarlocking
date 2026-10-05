// The fel chamber: a dark stone hall with pillars, braziers of green fire and a summoning circle.
// One unit is one yard. The dummy stands in the middle (0, 0, 0).
import * as THREE from 'three';

export const HALF = 48;          // the hall is 96 x 96 yards
const WALL_HEIGHT = 20;

function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Small repeatable random numbers, so the stones look the same on every visit.
function seeded(seed) {
  let s = seed;
  return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

function stoneTexture(columns, rows, base, seed) {
  const texture = canvasTexture(512, function (g, size) {
    const rnd = seeded(seed), w = size / columns, h = size / rows;
    g.fillStyle = '#17131f';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const shade = 0.82 + rnd() * 0.36;
        g.fillStyle = 'rgb(' + base.map(function (v) { return Math.round(v * shade); }).join(',') + ')';
        const offset = rows > columns && r % 2 ? w / 2 : 0;   // brick rows are staggered
        g.fillRect(c * w + offset + 2, r * h + 2, w - 4, h - 4);
        if (offset && c === columns - 1) g.fillRect(-w / 2 + 2, r * h + 2, w - 4, h - 4);
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function circleTexture() {
  return canvasTexture(1024, function (g, size) {
    const c = size / 2, rnd = seeded(7);
    g.strokeStyle = '#b79bff';
    g.lineCap = 'round';
    [[0.47, 10], [0.43, 3], [0.33, 5], [0.12, 3]].forEach(function (ring) {
      g.lineWidth = ring[1];
      g.beginPath(); g.arc(c, c, size * ring[0], 0, Math.PI * 2); g.stroke();
    });
    g.lineWidth = 5;
    g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * size * 0.33, c + Math.sin(a) * size * 0.33);
    }
    g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 20; i++) {          // rune marks between the two outer rings
      const a = i * Math.PI / 10;
      g.save();
      g.translate(c + Math.cos(a) * size * 0.38, c + Math.sin(a) * size * 0.38);
      g.rotate(a + Math.PI / 2);
      g.beginPath();
      g.moveTo(-10, 12); g.lineTo(-10 + rnd() * 20, -12); g.lineTo(10, rnd() * 24 - 12);
      if (rnd() > 0.5) { g.moveTo(-8, 0); g.lineTo(8, 0); }
      g.stroke();
      g.restore();
    }
  });
}

function bannerTexture() {
  return canvasTexture(256, function (g, size) {
    g.fillStyle = '#35195c'; g.fillRect(0, 0, size, size);
    g.strokeStyle = '#1c0d33'; g.lineWidth = 18; g.strokeRect(9, 9, size - 18, size - 18);
    g.strokeStyle = '#56e3a4'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(128, 120, 46, 0, Math.PI * 2);
    g.moveTo(128, 46); g.lineTo(128, 210); g.moveTo(90, 176); g.lineTo(166, 176);
    g.stroke();
  });
}

function labelSprite(text, color) {
  const texture = canvasTexture(256, function (g) {
    g.font = '600 64px "Segoe UI", system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 10; g.strokeStyle = 'rgba(0,0,0,0.85)'; g.strokeText(text, 128, 128);
    g.fillStyle = color; g.fillText(text, 128, 128);
  });
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.4, 2.4, 1);
  return sprite;
}

export function buildChamber(scene) {
  const colliders = [];      // round obstacles: { x, z, r }
  const animated = [];       // functions called every frame with the time in seconds

  scene.background = new THREE.Color(0x0d0a16);
  scene.fog = new THREE.Fog(0x0d0a16, 40, 150);

  // --- Light --------------------------------------------------------------
  scene.add(new THREE.AmbientLight(0x9a8ad8, 0.9));
  scene.add(new THREE.HemisphereLight(0xb7a6ff, 0x221a30, 0.8));
  const sun = new THREE.DirectionalLight(0xd6ccff, 1.1);
  sun.position.set(18, 40, 30);
  scene.add(sun);
  const circleLight = new THREE.PointLight(0x9a6cff, 260, 60, 1.6);
  circleLight.position.set(0, 7, 0);
  scene.add(circleLight);

  // --- Floor, walls, ceiling ----------------------------------------------
  const floorMap = stoneTexture(8, 8, [86, 80, 104], 11);
  floorMap.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: floorMap }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const wallMap = stoneTexture(4, 8, [70, 58, 104], 23);
  wallMap.repeat.set(8, 2);
  const wallMaterial = new THREE.MeshLambertMaterial({ map: wallMap });
  const bannerMaterial = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide });
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.rotation.y = i * Math.PI / 2;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, WALL_HEIGHT), wallMaterial);
    wall.position.set(0, WALL_HEIGHT / 2, -HALF);
    side.add(wall);
    [-22, 22].forEach(function (x) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(5, 11), bannerMaterial);
      banner.position.set(x, 11, -HALF + 0.15);
      side.add(banner);
    });
    scene.add(side);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: 0x0a0812 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;
  scene.add(ceiling);

  // --- Pillars: eight in a circle around the middle ------------------------
  const pillarStone = new THREE.MeshLambertMaterial({ color: 0x4a4266, flatShading: true });
  const pillarDark = new THREE.MeshLambertMaterial({ color: 0x322b47, flatShading: true });
  const runeGlow = new THREE.MeshBasicMaterial({ color: 0xa98bff });
  for (let i = 0; i < 8; i++) {
    const angle = (i + 0.5) * Math.PI / 4, x = Math.sin(angle) * 39, z = Math.cos(angle) * 39;
    const pillar = new THREE.Group();
    pillar.position.set(x, 0, z);
    pillar.rotation.y = angle;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, WALL_HEIGHT, 8), pillarStone);
    shaft.position.y = WALL_HEIGHT / 2;
    const base = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.2, 4.2), pillarDark);
    base.position.y = 0.6;
    const top = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1, 4.2), pillarDark);
    top.position.y = WALL_HEIGHT - 0.5;
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.45, 2.4, 0.12), runeGlow);   // faces the middle
    rune.position.set(0, 5.5, -1.62);
    pillar.add(shaft, base, top, rune);
    scene.add(pillar);
    colliders.push({ x: x, z: z, r: 2.6 });
  }

  // --- Braziers: four bowls of green fire ---------------------------------
  const iron = new THREE.MeshLambertMaterial({ color: 0x2a2633, flatShading: true });
  const flameOuter = new THREE.MeshBasicMaterial({ color: 0x3df0a0, transparent: true, opacity: 0.9 });
  const flameInner = new THREE.MeshBasicMaterial({ color: 0xd0ffe8 });
  const coals = new THREE.MeshBasicMaterial({ color: 0x2bd98a });
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(angle) * 33, z = Math.cos(angle) * 33;
    const brazier = new THREE.Group();
    brazier.position.set(x, 0, z);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 1.3, 6), iron);
    stand.position.y = 0.65;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.5, 0.55, 8), iron);
    bowl.position.y = 1.55;
    const bed = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 8), coals);
    bed.position.y = 1.82;
    const outer = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.8, 6), flameOuter);
    outer.position.y = 2.7;
    const inner = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 5), flameInner);
    inner.position.y = 2.4;
    const light = new THREE.PointLight(0x4dffb0, 420, 70, 1.6);
    light.position.y = 3.4;
    brazier.add(stand, bowl, bed, outer, inner, light);
    scene.add(brazier);
    colliders.push({ x: x, z: z, r: 1.3 });
    const phase = i * 1.7;
    animated.push(function (t) {
      const flicker = Math.sin(t * 9 + phase) * 0.12 + Math.sin(t * 23 + phase * 2) * 0.08;
      outer.scale.set(1 - flicker * 0.4, 1 + flicker, 1 - flicker * 0.4);
      outer.position.y = 1.8 + 0.9 * (1 + flicker);
      inner.scale.y = 1 + flicker * 1.4;
      inner.rotation.y = t * 2 + phase;
      light.intensity = 420 * (0.88 + flicker);
    });
  }

  // --- Summoning circle under the dummy ------------------------------------
  const circleMaterial = new THREE.MeshBasicMaterial({
    map: circleTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), circleMaterial);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.04;
  scene.add(circle);
  animated.push(function (t) {
    circle.rotation.z = t * 0.05;
    circleMaterial.opacity = 0.75 + Math.sin(t * 1.3) * 0.2;
  });

  // --- Motes drifting up through the hall ----------------------------------
  const MOTES = 240, rnd = seeded(99);
  const positions = new Float32Array(MOTES * 3), speeds = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    positions[i * 3] = (rnd() * 2 - 1) * 44;
    positions[i * 3 + 1] = rnd() * 16;
    positions[i * 3 + 2] = (rnd() * 2 - 1) * 44;
    speeds[i] = 0.25 + rnd() * 0.6;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(moteGeometry, new THREE.PointsMaterial({
    color: 0xb9a8ff, size: 0.16, transparent: true, opacity: 0.7, depthWrite: false
  })));
  let lastTime = 0;
  animated.push(function (t) {
    const dt = Math.min(0.1, t - lastTime);
    lastTime = t;
    for (let i = 0; i < MOTES; i++) {
      positions[i * 3 + 1] += speeds[i] * dt;
      if (positions[i * 3 + 1] > 16) positions[i * 3 + 1] = 0;
    }
    moteGeometry.attributes.position.needsUpdate = true;
  });

  return {
    colliders: colliders,
    update: function (time) { animated.forEach(function (fn) { fn(time); }); }
  };
}

// Rings on the ground around a target, one per range in yards, each with its label.
export function makeRangeRings(ranges) {
  const group = new THREE.Group();
  ranges.forEach(function (ring) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(ring.yards - 0.09, ring.yards + 0.09, 160),
      new THREE.MeshBasicMaterial({ color: ring.color, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.05;
    group.add(mesh);
    [-0.5, 0.5].forEach(function (angle) {            // a label to the left and right of the way in
      const label = labelSprite(ring.yards + ' yd', '#' + ring.color.toString(16).padStart(6, '0'));
      label.position.set(Math.sin(angle) * ring.yards, 0.9, Math.cos(angle) * ring.yards);
      group.add(label);
    });
  });
  return group;
}
