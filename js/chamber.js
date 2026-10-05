// The fel chamber: a vaulted stone hall with a ring of carved pillars, braziers and wall sconces of green fire,
// hanging lanterns, banners, candles round a summoning circle, and crystals growing in the corners.
// One unit is one yard. The first dummy stands in the middle (0, 0, 0).
import * as THREE from 'three';
import { flat, glow, light, add, halo, canvasTexture, seeded } from './kit.js';

export const HALF = 48;          // the hall is 96 x 96 yards
const WALL_HEIGHT = 20;

// Flagstones: uneven shades, chipped corners, dark joints, a few cracks.
function floorTexture() {
  const texture = canvasTexture(1024, function (g, size) {
    const rnd = seeded(11), n = 8, w = size / n;
    g.fillStyle = '#120f1a';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const shade = 0.78 + rnd() * 0.4, tint = rnd();
        g.fillStyle = 'rgb(' + Math.round((70 + tint * 12) * shade) + ',' + Math.round(64 * shade) + ',' + Math.round((88 + tint * 14) * shade) + ')';
        const x = c * w + 3, y = r * w + 3, s = w - 6, chip = 6 + rnd() * 14;
        g.beginPath();
        g.moveTo(x + chip, y); g.lineTo(x + s, y); g.lineTo(x + s, y + s - chip * rnd()); g.lineTo(x + s - chip * rnd(), y + s); g.lineTo(x, y + s); g.lineTo(x, y + chip);
        g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,255,255,' + (0.02 + rnd() * 0.04) + ')';          // a lighter worn patch
        g.fillRect(x + s * rnd() * 0.5, y + s * rnd() * 0.5, s * 0.4, s * 0.3);
        if (rnd() > 0.72) {                                                        // a crack
          g.strokeStyle = 'rgba(8,6,14,0.75)'; g.lineWidth = 2;
          g.beginPath();
          let px = x + s * rnd(), py = y + 4;
          g.moveTo(px, py);
          for (let k = 0; k < 4; k++) { px += (rnd() - 0.5) * 30; py += s / 4; g.lineTo(px, py); }
          g.stroke();
        }
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function wallTexture() {
  const texture = canvasTexture(512, function (g, size) {
    const rnd = seeded(23), cols = 4, rows = 8, w = size / cols, h = size / rows;
    g.fillStyle = '#100d18';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < rows; r++) {
      for (let c = -1; c < cols; c++) {
        const shade = 0.75 + rnd() * 0.4;
        g.fillStyle = 'rgb(' + Math.round(62 * shade) + ',' + Math.round(52 * shade) + ',' + Math.round(92 * shade) + ')';
        g.fillRect(c * w + (r % 2 ? w / 2 : 0) + 2, r * h + 2, w - 4, h - 4);
        g.fillStyle = 'rgba(0,0,0,0.18)';
        g.fillRect(c * w + (r % 2 ? w / 2 : 0) + 2, r * h + h - 9, w - 4, 7);
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

function circleTexture(inner) {
  return canvasTexture(1024, function (g, size) {
    const c = size / 2, rnd = seeded(inner ? 31 : 7);
    g.strokeStyle = inner ? '#8dffc0' : '#b79bff';
    g.lineCap = 'round';
    function ring(r, width) { g.lineWidth = width; g.beginPath(); g.arc(c, c, size * r, 0, Math.PI * 2); g.stroke(); }
    if (inner) {
      ring(0.2, 5); ring(0.16, 2);
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        g.lineWidth = 3; g.beginPath();
        g.moveTo(c + Math.cos(a) * size * 0.16, c + Math.sin(a) * size * 0.16); g.lineTo(c + Math.cos(a) * size * 0.2, c + Math.sin(a) * size * 0.2);
        g.stroke();
      }
      return;
    }
    ring(0.47, 9); ring(0.44, 3); ring(0.345, 5); ring(0.33, 2);
    g.lineWidth = 5; g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * size * 0.33, c + Math.sin(a) * size * 0.33);
    }
    g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 24; i++) {          // rune marks between the two outer rings
      const a = i * Math.PI / 12;
      g.save();
      g.translate(c + Math.cos(a) * size * 0.395, c + Math.sin(a) * size * 0.395);
      g.rotate(a + Math.PI / 2);
      g.beginPath();
      g.moveTo(-9, 13); g.lineTo(-9 + rnd() * 18, -13); g.lineTo(9, rnd() * 26 - 13);
      if (rnd() > 0.5) { g.moveTo(-8, 0); g.lineTo(8, 0); }
      if (rnd() > 0.6) { g.moveTo(0, -13); g.lineTo(6, -4); }
      g.stroke();
      g.restore();
    }
    for (let i = 0; i < 5; i++) {           // a small circle at each point of the star
      const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
      g.lineWidth = 4; g.beginPath(); g.arc(c + Math.cos(a) * size * 0.33, c + Math.sin(a) * size * 0.33, 22, 0, Math.PI * 2); g.stroke();
    }
  });
}

// A banner with a swallow-tail and a fel sigil; the cut-away parts are see-through.
function bannerTexture() {
  return canvasTexture(256, function (g, size) {
    g.clearRect(0, 0, size, size);
    g.fillStyle = '#3a1a62';
    g.beginPath(); g.moveTo(8, 0); g.lineTo(248, 0); g.lineTo(248, 250); g.lineTo(128, 196); g.lineTo(8, 250); g.closePath(); g.fill();
    g.strokeStyle = '#c9a23a'; g.lineWidth = 8;
    g.beginPath(); g.moveTo(16, 4); g.lineTo(16, 232); g.lineTo(128, 182); g.lineTo(240, 232); g.lineTo(240, 4); g.stroke();
    g.strokeStyle = '#56e3a4'; g.lineWidth = 9; g.lineCap = 'round';
    g.beginPath(); g.arc(128, 88, 40, 0.25 * Math.PI, 0.75 * Math.PI, true);          // an open circle, like a horned moon
    g.moveTo(128, 60); g.lineTo(128, 150); g.moveTo(100, 122); g.lineTo(156, 122);
    g.stroke();
    g.fillStyle = '#56e3a4';
    g.beginPath(); g.arc(128, 88, 9, 0, Math.PI * 2); g.fill();
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

// A flame of three stacked cones with a soft glow behind it; returns a function that makes it flicker.
function flame(parent, x, y, z, size, color, core, phase) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  parent.add(group);
  const outer = add(group, new THREE.ConeGeometry(0.34 * size, 1.0 * size, 6), light(color, 0.85), 0, 0.5 * size, 0);
  const mid = add(group, new THREE.ConeGeometry(0.22 * size, 0.72 * size, 5), light(core, 0.9), 0, 0.4 * size, 0);
  const tip = add(group, new THREE.ConeGeometry(0.1 * size, 0.42 * size, 4), glow(0xffffff), 0, 0.3 * size, 0);
  const shine = halo(color, 3.2 * size, 0.55);
  shine.position.y = 0.5 * size;
  group.add(shine);
  return function (t) {
    const f = Math.sin(t * 9 + phase) * 0.14 + Math.sin(t * 23 + phase * 2) * 0.09;
    outer.scale.set(1 - f * 0.4, 1 + f, 1 - f * 0.4);
    outer.position.y = 0.5 * size * (1 + f);
    mid.scale.y = 1 + f * 1.3; mid.rotation.y = t * 2 + phase;
    tip.scale.y = 1 + f * 1.8;
    shine.scale.setScalar(3.2 * size * (1 + f * 0.5));
    return f;
  };
}

export function buildChamber(scene) {
  const colliders = [];      // round obstacles: { x, z, r }
  const animated = [];       // functions called every frame with the time in seconds
  const rnd = seeded(99);

  scene.background = new THREE.Color(0x0b0814);
  scene.fog = new THREE.Fog(0x0b0814, 38, 150);

  // --- Light: dim violet all round, a pale key light that casts the shadows, colour from the fires ------------
  scene.add(new THREE.AmbientLight(0x8a7ac8, 0.7));
  scene.add(new THREE.HemisphereLight(0xb7a6ff, 0x1a1424, 0.65));
  const key = new THREE.DirectionalLight(0xd9d0ff, 1.25);
  key.position.set(14, 36, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -40;
  key.shadow.camera.right = key.shadow.camera.top = 40;
  key.shadow.camera.near = 2; key.shadow.camera.far = 100;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.05;
  scene.add(key);
  const circleLight = new THREE.PointLight(0x9a6cff, 240, 60, 1.6);
  circleLight.position.set(0, 7, 0);
  scene.add(circleLight);

  // --- Floor, walls, ceiling --------------------------------------------------------------------------------
  const floorMap = floorTexture();
  floorMap.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: floorMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  // A band of darker polished stone around the summoning circle, with a thin gold line.
  const band = new THREE.Mesh(new THREE.RingGeometry(9.1, 10.4, 64), new THREE.MeshLambertMaterial({ color: 0x241d33 }));
  band.rotation.x = -Math.PI / 2; band.position.y = 0.015; band.receiveShadow = true;
  scene.add(band);
  const line = new THREE.Mesh(new THREE.RingGeometry(10.4, 10.55, 64), new THREE.MeshLambertMaterial({ color: 0x8a6e2a }));
  line.rotation.x = -Math.PI / 2; line.position.y = 0.02;
  scene.add(line);

  const wallMap = wallTexture();
  wallMap.repeat.set(8, 2);
  const wallMaterial = new THREE.MeshLambertMaterial({ map: wallMap });
  const bannerMaterial = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 });
  const dark = flat(0x241d36), darker = flat(0x191326), iron = flat(0x26222e), gold = flat(0x8a6e2a);
  let flameCount = 0;
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.rotation.y = i * Math.PI / 2;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, WALL_HEIGHT), wallMaterial);
    wall.position.set(0, WALL_HEIGHT / 2, -HALF);
    wall.receiveShadow = true;
    side.add(wall);
    add(side, new THREE.BoxGeometry(HALF * 2, 1.4, 0.8), darker, 0, 0.7, -HALF + 0.4);          // a plinth along the foot
    add(side, new THREE.BoxGeometry(HALF * 2, 1.2, 0.6), dark, 0, WALL_HEIGHT - 0.6, -HALF + 0.3);   // a cornice under the ceiling
    add(side, new THREE.BoxGeometry(HALF * 2, 0.12, 0.66), gold, 0, WALL_HEIGHT - 1.3, -HALF + 0.3);
    [-36, -18, 0, 18, 36].forEach(function (x) {                                                   // buttresses, each with a sconce
      add(side, new THREE.BoxGeometry(2.4, WALL_HEIGHT, 1.2), dark, x, WALL_HEIGHT / 2, -HALF + 0.6);
      add(side, new THREE.BoxGeometry(3, 1.6, 1.6), darker, x, 0.8, -HALF + 0.8);
      add(side, new THREE.BoxGeometry(0.16, 0.16, 1.0), iron, x, 7.0, -HALF + 1.6);
      add(side, new THREE.CylinderGeometry(0.42, 0.24, 0.36, 6), iron, x, 7.15, -HALF + 2.1);
      animated.push(flame(side, x, 7.3, -HALF + 2.1, 0.9, 0x3df0a0, 0xb8ffe0, flameCount++ * 1.3));
    });
    [-27, -9, 9, 27].forEach(function (x) {                                                        // banners between them
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(5.5, 11), bannerMaterial);
      banner.position.set(x, 11.5, -HALF + 0.25);
      side.add(banner);
      add(side, new THREE.CylinderGeometry(0.1, 0.1, 6.4, 5), gold, x, 17.05, -HALF + 0.3).rotation.z = Math.PI / 2;
      const phase = flameCount * 0.7 + x;
      animated.push(function (t) { banner.rotation.x = Math.sin(t * 0.8 + phase) * 0.025; });
    });
    scene.add(side);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: 0x08060f }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;
  scene.add(ceiling);

  // --- Pillars: eight in a circle, with a glowing rune band, joined by ribs under the ceiling -------------------
  const stone = flat(0x4a4268), stoneDark = flat(0x2f2845), runeGlow = glow(0xa98bff);
  const ribs = new THREE.Group();
  scene.add(ribs);
  const R = 39;
  for (let i = 0; i < 8; i++) {
    const angle = (i + 0.5) * Math.PI / 4, x = Math.sin(angle) * R, z = Math.cos(angle) * R;
    const pillar = new THREE.Group();
    pillar.position.set(x, 0, z);
    pillar.rotation.y = angle;
    add(pillar, new THREE.CylinderGeometry(2.5, 2.8, 0.8, 8), stoneDark, 0, 0.4, 0);
    add(pillar, new THREE.CylinderGeometry(2.0, 2.4, 0.7, 8), stone, 0, 1.15, 0);
    add(pillar, new THREE.CylinderGeometry(1.45, 1.7, WALL_HEIGHT - 4.2, 8), stone, 0, 1.5 + (WALL_HEIGHT - 4.2) / 2, 0);
    add(pillar, new THREE.CylinderGeometry(2.3, 1.5, 1.4, 8), stone, 0, WALL_HEIGHT - 2.0, 0);
    add(pillar, new THREE.BoxGeometry(5, 1.3, 5), stoneDark, 0, WALL_HEIGHT - 0.65, 0);
    add(pillar, new THREE.CylinderGeometry(1.74, 1.74, 0.25, 8), stoneDark, 0, 4.4, 0);
    add(pillar, new THREE.CylinderGeometry(1.74, 1.74, 0.25, 8), stoneDark, 0, 6.6, 0);
    const bandGlow = add(pillar, new THREE.CylinderGeometry(1.66, 1.66, 1.5, 8, 1, true), light(0x8a6cff, 0.55), 0, 5.5, 0);
    for (let k = 0; k < 8; k++) {                                       // rune strokes on the band
      const a = k * Math.PI / 4 + Math.PI / 8;
      const mark = add(pillar, new THREE.BoxGeometry(0.14, 0.9 + rnd() * 0.4, 0.06), runeGlow, Math.sin(a) * 1.66, 5.5, Math.cos(a) * 1.66);
      mark.rotation.y = a;
      mark.rotation.z = (rnd() - 0.5) * 0.7;
    }
    const phase = i * 0.9;
    animated.push(function (t) { bandGlow.material.opacity = 0.35 + Math.sin(t * 1.4 + phase) * 0.2; });
    scene.add(pillar);
    colliders.push({ x: x, z: z, r: 2.9 });

    // A rib from this pillar to the middle of the vault, and one to the next pillar.
    const rib = add(ribs, new THREE.BoxGeometry(0.9, 0.9, R), stoneDark, x / 2, WALL_HEIGHT - 0.5, z / 2);
    rib.rotation.y = angle;
    const next = (i + 1.5) * Math.PI / 4, nx = Math.sin(next) * R, nz = Math.cos(next) * R;
    const span = add(ribs, new THREE.BoxGeometry(0.8, 0.8, Math.hypot(nx - x, nz - z)), stoneDark, (x + nx) / 2, WALL_HEIGHT - 0.5, (z + nz) / 2);
    span.rotation.y = Math.atan2(nx - x, nz - z);
  }
  // The boss stone where the ribs meet, and a pale shaft of light falling from it onto the circle.
  add(scene, new THREE.CylinderGeometry(2.6, 1.6, 1.6, 8), stoneDark, 0, WALL_HEIGHT - 0.8, 0);
  add(scene, new THREE.OctahedronGeometry(0.8, 0), glow(0xb79bff), 0, WALL_HEIGHT - 2.1, 0);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 8.2, WALL_HEIGHT - 2, 28, 1, true), light(0x9a7cff, 0.055));
  shaft.position.y = (WALL_HEIGHT - 2) / 2;
  scene.add(shaft);
  animated.push(function (t) { shaft.material.opacity = 0.045 + Math.sin(t * 0.7) * 0.015; shaft.rotation.y = t * 0.03; });

  // --- Braziers: four tripods of green fire, with sparks --------------------------------------------------------
  const embers = [];
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(angle) * 33, z = Math.cos(angle) * 33;
    const brazier = new THREE.Group();
    brazier.position.set(x, 0, z);
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3, leg = add(brazier, new THREE.CylinderGeometry(0.07, 0.09, 1.9, 5), iron, Math.sin(a) * 0.5, 0.9, Math.cos(a) * 0.5);
      leg.rotation.set(Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38);
    }
    add(brazier, new THREE.TorusGeometry(0.42, 0.05, 5, 12), iron, 0, 0.9, 0).rotation.x = Math.PI / 2;
    add(brazier, new THREE.CylinderGeometry(1.0, 0.5, 0.6, 10), iron, 0, 1.75, 0);
    add(brazier, new THREE.TorusGeometry(1.0, 0.08, 6, 14), gold, 0, 2.05, 0).rotation.x = Math.PI / 2;
    add(brazier, new THREE.CylinderGeometry(0.9, 0.9, 0.08, 10), glow(0x2bd98a), 0, 2.02, 0);
    const flicker = flame(brazier, 0, 2.0, 0, 2.0, 0x3df0a0, 0xb8ffe0, i * 1.7);
    const lamp = new THREE.PointLight(0x4dffb0, 420, 70, 1.6);
    lamp.position.y = 3.4;
    brazier.add(lamp);
    animated.push(function (t) { lamp.intensity = 420 * (0.88 + flicker(t)); });
    scene.add(brazier);
    colliders.push({ x: x, z: z, r: 1.3 });
    for (let k = 0; k < 14; k++) embers.push({ x: x, z: z, phase: rnd() * 4, speed: 1.2 + rnd() * 1.6, drift: rnd() * Math.PI * 2, reach: 0.4 + rnd() * 0.7 });
  }
  const emberPositions = new Float32Array(embers.length * 3);
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPositions, 3));
  scene.add(new THREE.Points(emberGeometry, new THREE.PointsMaterial({ color: 0x9dffcf, size: 0.14, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending })));
  animated.push(function (t) {
    embers.forEach(function (e, i) {
      const life = ((t * e.speed * 0.25 + e.phase) % 1);
      emberPositions[i * 3] = e.x + Math.sin(e.drift + life * 5) * e.reach * life;
      emberPositions[i * 3 + 1] = 2.2 + life * 5;
      emberPositions[i * 3 + 2] = e.z + Math.cos(e.drift + life * 4) * e.reach * life;
    });
    emberGeometry.attributes.position.needsUpdate = true;
  });

  // --- Lanterns hanging on chains between the pillars and the middle -------------------------------------------
  for (let i = 0; i < 4; i++) {
    const angle = i * Math.PI / 2, x = Math.sin(angle) * 20, z = Math.cos(angle) * 20;
    const hang = new THREE.Group();
    hang.position.set(x, WALL_HEIGHT, z);
    scene.add(hang);
    add(hang, new THREE.CylinderGeometry(0.04, 0.04, 6.4, 4), iron, 0, -3.2, 0);
    add(hang, new THREE.CylinderGeometry(0.5, 0.36, 0.2, 6), iron, 0, -6.4, 0);
    add(hang, new THREE.CylinderGeometry(0.36, 0.36, 0.9, 6, 1, true), light(0x56e3a4, 0.35), 0, -6.95, 0);
    add(hang, new THREE.CylinderGeometry(0.36, 0.5, 0.18, 6), iron, 0, -7.5, 0);
    add(hang, new THREE.OctahedronGeometry(0.2, 0), glow(0xb8ffe0), 0, -6.95, 0);
    const shine = halo(0x56e3a4, 4.5, 0.5);
    shine.position.y = -6.95;
    hang.add(shine);
    const phase = i * 1.3;
    animated.push(function (t) { hang.rotation.x = Math.sin(t * 0.6 + phase) * 0.03; hang.rotation.z = Math.cos(t * 0.5 + phase) * 0.03; shine.scale.setScalar(4.5 + Math.sin(t * 3 + phase) * 0.4); });
  }

  // --- Summoning circle: two layers turning against each other, candles at the points of the star -------------
  const circleMaterial = new THREE.MeshBasicMaterial({ map: circleTexture(false), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), circleMaterial);
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.04;
  scene.add(circle);
  const innerMaterial = new THREE.MeshBasicMaterial({ map: circleTexture(true), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), innerMaterial);
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.05;
  scene.add(inner);
  animated.push(function (t) {
    circle.rotation.z = t * 0.05;
    inner.rotation.z = -t * 0.22;
    circleMaterial.opacity = 0.75 + Math.sin(t * 1.3) * 0.2;
    innerMaterial.opacity = 0.55 + Math.sin(t * 2.1) * 0.25;
  });
  const wax = flat(0xd8ccb0);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 + 0.3, cx = Math.sin(a) * 9.75, cz = Math.cos(a) * 9.75;
    const cluster = new THREE.Group();
    cluster.position.set(cx, 0, cz);
    scene.add(cluster);
    [[0, 0, 0.55], [0.22, 0.12, 0.38], [-0.14, 0.2, 0.28]].forEach(function (c, k) {
      add(cluster, new THREE.CylinderGeometry(0.07, 0.085, c[2], 6), wax, c[0], c[2] / 2, c[1]);
      const lit = add(cluster, new THREE.ConeGeometry(0.035, 0.14, 4), glow(0xffe6a0), c[0], c[2] + 0.08, c[1]);
      const phase = i * 2 + k;
      animated.push(function (t) { lit.scale.y = 1 + Math.sin(t * 13 + phase) * 0.25; });
    });
    add(cluster, new THREE.CylinderGeometry(0.36, 0.4, 0.04, 8), wax, 0.04, 0.02, 0.1);
    const shine = halo(0xffc46a, 1.6, 0.55);
    shine.position.set(0.04, 0.6, 0.1);
    cluster.add(shine);
  }

  // --- Crystals growing in the corners, and a lectern with an open book --------------------------------------
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(function (corner, i) {
    const cx = corner[0] * 42, cz = corner[1] * 42;
    const cluster = new THREE.Group();
    cluster.position.set(cx, 0, cz);
    scene.add(cluster);
    const crystal = glow(i % 2 ? 0x56e3a4 : 0x9a7cff);
    for (let k = 0; k < 6; k++) {
      const a = rnd() * Math.PI * 2, d = rnd() * 1.6, h = 1.6 + rnd() * 3.4;
      const shard = add(cluster, new THREE.ConeGeometry(0.3 + rnd() * 0.35, h, 5), crystal, Math.sin(a) * d, h / 2 - 0.2, Math.cos(a) * d);
      shard.rotation.set((rnd() - 0.5) * 0.7, rnd() * 3, (rnd() - 0.5) * 0.7);
    }
    add(cluster, new THREE.IcosahedronGeometry(1.9, 0), flat(0x2a2438), 0, -0.6, 0);
    const shine = halo(i % 2 ? 0x56e3a4 : 0x9a7cff, 12, 0.4);
    shine.position.y = 2.2;
    cluster.add(shine);
    const phase = i * 1.9;
    animated.push(function (t) { shine.material.opacity = 0.3 + Math.sin(t * 1.1 + phase) * 0.12; });
    colliders.push({ x: cx, z: cz, r: 2.6 });
  });
  const lectern = new THREE.Group();
  lectern.position.set(-13.5, 0, -6);
  lectern.rotation.y = 1.15;
  scene.add(lectern);
  const wood = flat(0x3d2716);
  add(lectern, new THREE.CylinderGeometry(0.5, 0.65, 0.2, 8), wood, 0, 0.1, 0);
  add(lectern, new THREE.CylinderGeometry(0.12, 0.16, 1.3, 6), wood, 0, 0.8, 0);
  const desk = add(lectern, new THREE.BoxGeometry(1.0, 0.08, 0.7), wood, 0, 1.5, 0);
  desk.rotation.x = 0.4;
  [-1, 1].forEach(function (s) { const page = add(lectern, new THREE.BoxGeometry(0.42, 0.04, 0.56), flat(0xd8ccb0), s * 0.22, 1.56, 0); page.rotation.set(0.4, 0, s * 0.12); });
  const glyph = add(lectern, new THREE.OctahedronGeometry(0.12, 0), glow(0xb79bff), 0, 2.1, -0.1);
  const glyphShine = halo(0x9a7cff, 1.6, 0.6);
  glyphShine.position.copy(glyph.position);
  lectern.add(glyphShine);
  animated.push(function (t) { glyph.position.y = 2.1 + Math.sin(t * 1.8) * 0.1; glyph.rotation.y = t * 1.4; glyphShine.position.y = glyph.position.y; });
  colliders.push({ x: -13.5, z: -6, r: 0.9 });

  // --- Motes drifting up through the hall ------------------------------------------------------------------------
  const MOTES = 260;
  const positions = new Float32Array(MOTES * 3), speeds = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    positions[i * 3] = (rnd() * 2 - 1) * 44;
    positions[i * 3 + 1] = rnd() * 16;
    positions[i * 3 + 2] = (rnd() * 2 - 1) * 44;
    speeds[i] = 0.25 + rnd() * 0.6;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0xb9a8ff, size: 0.16, transparent: true, opacity: 0.7, depthWrite: false })));
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
