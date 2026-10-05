// The chamber: a warlock's sanctum of calm grey stone. The stone itself is neutral and easy on the eyes; the colour
// sits in what is magic or cloth: a violet summoning circle, purple banners on the pillars, fel-green fire in four
// bowls, a little brass. The floor is paved in rings around the circle.
// One unit is one yard. The first dummy stands in the middle (0, 0, 0).
import * as THREE from 'three';
import { flat, glow, light, add, halo, canvasTexture, seeded } from './kit.js';

export const HALF = 48;          // the hall is 96 x 96 yards
const WALL_HEIGHT = 20;
const BRASS = 0x8c7340;

// The floor, drawn once for the whole hall: grey flagstones laid in rings around the middle, each a slightly
// different shade (some a touch warmer, some cooler), soft joints, and a darker polished disc with two brass lines
// where the summoning circle is.
function floorTexture() {
  const texture = canvasTexture(2048, function (g, size) {
    const rnd = seeded(11), c = size / 2, yd = size / (HALF * 2), TWO_PI = Math.PI * 2;
    const INNER = 10.6, STEP = 5.2, GAP = 0.06;
    g.fillStyle = '#24232a';                                    // the joints: only a little darker than the stones
    g.fillRect(0, 0, size, size);
    for (let r1 = INNER; r1 < HALF * 1.45; r1 += STEP) {
      const r2 = r1 + STEP, count = Math.max(8, Math.round(Math.PI * (r1 + r2) / 6.5)), offset = rnd() * Math.PI;
      for (let i = 0; i < count; i++) {
        const a1 = offset + i * TWO_PI / count, a2 = a1 + TWO_PI / count;
        const shade = 0.9 + rnd() * 0.2, warm = rnd() * 7;
        g.fillStyle = 'rgb(' + Math.round((57 + warm) * shade) + ',' + Math.round(58 * shade) + ',' + Math.round((70 - warm) * shade) + ')';
        g.beginPath();
        g.arc(c, c, (r2 - GAP) * yd, a1 + GAP / r2, a2 - GAP / r2);
        g.arc(c, c, (r1 + GAP) * yd, a2 - GAP / r1, a1 + GAP / r1, true);
        g.closePath();
        g.fill();
      }
    }
    g.fillStyle = 'rgb(40,39,47)';
    g.beginPath(); g.arc(c, c, (INNER - GAP) * yd, 0, TWO_PI); g.fill();
    g.strokeStyle = '#7d6638';
    g.lineWidth = 3; g.beginPath(); g.arc(c, c, (INNER - 0.5) * yd, 0, TWO_PI); g.stroke();
    g.lineWidth = 1.5; g.beginPath(); g.arc(c, c, (INNER - 0.85) * yd, 0, TWO_PI); g.stroke();
  });
  texture.anisotropy = 8;         // stays crisp where the floor runs away from you
  return texture;
}

// Walls: plain grey stone that darkens toward the ceiling.
function wallTexture() {
  return canvasTexture(256, function (g, size) {
    const grad = g.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#111015');
    grad.addColorStop(0.55, '#27262e');
    grad.addColorStop(1, '#35343e');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  });
}

// The summoning circle: rings, a five-pointed star and rune marks (outer layer), a small ring (inner layer).
function circleTexture(inner) {
  return canvasTexture(1024, function (g, size) {
    const c = size / 2, rnd = seeded(7);
    g.strokeStyle = inner ? '#dccdf2' : '#a17fdc';
    g.lineCap = 'round'; g.lineJoin = 'round';
    function ring(r, width) { g.lineWidth = width; g.beginPath(); g.arc(c, c, size * r, 0, Math.PI * 2); g.stroke(); }
    if (inner) { ring(0.19, 4); ring(0.165, 1.5); return; }
    ring(0.47, 6); ring(0.425, 2); ring(0.335, 3);
    g.lineWidth = 4; g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * size * 0.335, c + Math.sin(a) * size * 0.335);
    }
    g.stroke();
    g.lineWidth = 3;
    for (let i = 0; i < 20; i++) {          // rune marks between the two outer rings
      const a = i * Math.PI / 10;
      g.save();
      g.translate(c + Math.cos(a) * size * 0.447, c + Math.sin(a) * size * 0.447);
      g.rotate(a + Math.PI / 2);
      g.beginPath();
      g.moveTo(-7, 9); g.lineTo(-7 + rnd() * 14, -9); g.lineTo(7, rnd() * 18 - 9);
      if (rnd() > 0.5) { g.moveTo(-6, 0); g.lineTo(6, 0); }
      g.stroke();
      g.restore();
    }
  });
}

// A long swallow-tailed banner: purple cloth, brass edging, a fel-green sigil. The cut-away parts are see-through.
function bannerTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 512;
  const g = canvas.getContext('2d');
  const cloth = g.createLinearGradient(0, 0, 0, 512);
  cloth.addColorStop(0, '#3a1d5e'); cloth.addColorStop(1, '#4f2a80');
  g.fillStyle = cloth;
  g.beginPath(); g.moveTo(4, 0); g.lineTo(124, 0); g.lineTo(124, 508); g.lineTo(64, 452); g.lineTo(4, 508); g.closePath(); g.fill();
  g.strokeStyle = '#a88a4a'; g.lineWidth = 5; g.lineJoin = 'miter';
  g.beginPath(); g.moveTo(11, 2); g.lineTo(11, 492); g.lineTo(64, 443); g.lineTo(117, 492); g.lineTo(117, 2); g.stroke();
  g.strokeStyle = '#6fe0a8'; g.lineWidth = 6; g.lineCap = 'round';
  g.beginPath(); g.arc(64, 150, 26, 0.2 * Math.PI, 0.8 * Math.PI, true);            // an open circle, like a horned moon
  g.moveTo(64, 132); g.lineTo(64, 236); g.moveTo(44, 204); g.lineTo(84, 204);
  g.stroke();
  g.fillStyle = '#6fe0a8';
  g.beginPath(); g.arc(64, 150, 7, 0, Math.PI * 2); g.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
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
  const outer = add(group, new THREE.ConeGeometry(0.34 * size, 1.0 * size, 6), light(color, 0.8), 0, 0.5 * size, 0);
  const mid = add(group, new THREE.ConeGeometry(0.22 * size, 0.72 * size, 5), light(core, 0.85), 0, 0.4 * size, 0);
  const tip = add(group, new THREE.ConeGeometry(0.1 * size, 0.42 * size, 4), glow(0xffffff), 0, 0.3 * size, 0);
  const shine = halo(color, 3.2 * size, 0.4);
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

  scene.background = new THREE.Color(0x0c0b10);
  scene.fog = new THREE.Fog(0x0c0b10, 40, 145);

  // --- Light: neutral and low, so the stone stays grey and calm. A near-white key light casts the shadows; the
  // only coloured light is a soft violet pool on the circle and a soft green one around each bowl of fire.
  scene.add(new THREE.AmbientLight(0xc0bcc8, 0.6));
  scene.add(new THREE.HemisphereLight(0xdedbe8, 0x17161b, 0.5));
  const key = new THREE.DirectionalLight(0xfff6f0, 1.3);
  key.position.set(14, 36, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -40;
  key.shadow.camera.right = key.shadow.camera.top = 40;
  key.shadow.camera.near = 2; key.shadow.camera.far = 100;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.05;
  scene.add(key);
  const circleLight = new THREE.PointLight(0xa678e6, 150, 45, 1.6);
  circleLight.position.set(0, 7, 0);
  scene.add(circleLight);

  // --- Floor, walls, ceiling --------------------------------------------------------------------------------
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: floorTexture() }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture() });
  const plinth = flat(0x1a191f), lineGlow = glow(0x6b4aa6), brass = flat(BRASS);
  for (let i = 0; i < 4; i++) {
    const side = new THREE.Group();
    side.rotation.y = i * Math.PI / 2;
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, WALL_HEIGHT), wallMaterial);
    wall.position.set(0, WALL_HEIGHT / 2, -HALF);
    wall.receiveShadow = true;
    side.add(wall);
    add(side, new THREE.BoxGeometry(HALF * 2, 1.2, 0.6), plinth, 0, 0.6, -HALF + 0.3);            // a plinth along the foot
    add(side, new THREE.BoxGeometry(HALF * 2, 0.07, 0.04), lineGlow, 0, 1.26, -HALF + 0.62);       // one thin line of light on it
    scene.add(side);
  }
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: 0x09080c }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;
  scene.add(ceiling);

  // --- Pillars: eight in a circle. Grey stone, a violet band of light between two brass rings, and a banner
  // hanging on the side that faces the middle.
  const stone = flat(0x4b4954), stoneDark = flat(0x302f37);
  const bannerMaterial = new THREE.MeshLambertMaterial({ map: bannerTexture(), side: THREE.DoubleSide, transparent: true, alphaTest: 0.5 });
  const R = 39;
  for (let i = 0; i < 8; i++) {
    const angle = (i + 0.5) * Math.PI / 4, x = Math.sin(angle) * R, z = Math.cos(angle) * R;
    const pillar = new THREE.Group();
    pillar.position.set(x, 0, z);
    pillar.rotation.y = angle;
    add(pillar, new THREE.CylinderGeometry(2.3, 2.5, 0.7, 12), stoneDark, 0, 0.35, 0);
    add(pillar, new THREE.CylinderGeometry(1.55, 1.7, WALL_HEIGHT - 2.1, 12), stone, 0, 0.7 + (WALL_HEIGHT - 2.1) / 2, 0);
    add(pillar, new THREE.CylinderGeometry(2.5, 1.6, 1.4, 12), stoneDark, 0, WALL_HEIGHT - 0.7, 0);
    const band = add(pillar, new THREE.CylinderGeometry(1.7, 1.7, 0.26, 12, 1, true), light(0x9a6ce0, 0.6), 0, 4.4, 0);
    add(pillar, new THREE.CylinderGeometry(1.74, 1.74, 0.09, 12), brass, 0, 4.62, 0);
    add(pillar, new THREE.CylinderGeometry(1.74, 1.74, 0.09, 12), brass, 0, 4.18, 0);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 7.6), bannerMaterial);
    banner.position.set(0, 10.4, -1.82);                               // -z is the side toward the middle of the hall
    banner.castShadow = true;
    pillar.add(banner);
    add(pillar, new THREE.CylinderGeometry(0.06, 0.06, 2.3, 6), brass, 0, 14.25, -1.82).rotation.z = Math.PI / 2;
    const phase = i * 0.9;
    animated.push(function (t) {
      band.material.opacity = 0.45 + Math.sin(t * 1.2 + phase) * 0.15;
      banner.rotation.x = Math.sin(t * 0.7 + phase) * 0.02;
    });
    scene.add(pillar);
    colliders.push({ x: x, z: z, r: 2.6 });
  }
  // A pale shaft of light falling onto the circle.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 8.2, WALL_HEIGHT, 28, 1, true), light(0xb0a0d8, 0.03));
  shaft.position.y = WALL_HEIGHT / 2;
  scene.add(shaft);
  animated.push(function (t) { shaft.material.opacity = 0.025 + Math.sin(t * 0.7) * 0.008; shaft.rotation.y = t * 0.03; });

  // --- Four bowls of fel fire on slim stands, each with a brass rim ----------------------------------------------
  const iron = flat(0x34333b);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(angle) * 33, z = Math.cos(angle) * 33;
    const brazier = new THREE.Group();
    brazier.position.set(x, 0, z);
    add(brazier, new THREE.CylinderGeometry(0.7, 0.85, 0.16, 10), iron, 0, 0.08, 0);
    add(brazier, new THREE.CylinderGeometry(0.1, 0.14, 1.6, 8), iron, 0, 0.9, 0);
    add(brazier, new THREE.CylinderGeometry(1.0, 0.3, 0.55, 12), iron, 0, 1.9, 0);
    add(brazier, new THREE.CylinderGeometry(1.03, 1.03, 0.07, 12), brass, 0, 2.16, 0);
    add(brazier, new THREE.CylinderGeometry(0.9, 0.9, 0.06, 12), glow(0x2fae78), 0, 2.19, 0);
    const flicker = flame(brazier, 0, 2.12, 0, 1.7, 0x3fd898, 0xb4f5d6, i * 1.7);
    const lamp = new THREE.PointLight(0x6fe0b0, 190, 50, 1.6);
    lamp.position.y = 3.4;
    brazier.add(lamp);
    animated.push(function (t) { lamp.intensity = 190 * (0.9 + flicker(t) * 0.6); });
    scene.add(brazier);
    colliders.push({ x: x, z: z, r: 1.2 });
  }

  // --- Summoning circle: two layers turning against each other ------------------------------------------------
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
    circle.rotation.z = t * 0.04;
    inner.rotation.z = -t * 0.15;
    circleMaterial.opacity = 0.48 + Math.sin(t * 1.3) * 0.08;
    innerMaterial.opacity = 0.32 + Math.sin(t * 2.1) * 0.1;
  });

  // --- A few motes drifting up through the hall ------------------------------------------------------------------
  const MOTES = 140;
  const positions = new Float32Array(MOTES * 3), speeds = new Float32Array(MOTES);
  for (let i = 0; i < MOTES; i++) {
    positions[i * 3] = (rnd() * 2 - 1) * 44;
    positions[i * 3 + 1] = rnd() * 16;
    positions[i * 3 + 2] = (rnd() * 2 - 1) * 44;
    speeds[i] = 0.25 + rnd() * 0.6;
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  scene.add(new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0xcfc8dc, size: 0.12, transparent: true, opacity: 0.4, depthWrite: false })));
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
      new THREE.MeshBasicMaterial({ color: ring.color, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })
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
