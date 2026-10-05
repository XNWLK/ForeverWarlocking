// The chamber: a wide, quiet hall of dark violet stone. Eight plain pillars with one band of light each, four bowls
// of shadowflame, and a summoning circle in the middle. Kept simple on purpose, so nothing competes with the fight.
// One unit is one yard. The first dummy stands in the middle (0, 0, 0).
import * as THREE from 'three';
import { flat, glow, light, add, halo, canvasTexture, seeded } from './kit.js';

export const HALF = 48;          // the hall is 96 x 96 yards
const WALL_HEIGHT = 20;

// Large smooth flagstones: each a slightly different shade, thin dark joints, nothing else.
function floorTexture() {
  const texture = canvasTexture(1024, function (g, size) {
    const rnd = seeded(11), n = 4, w = size / n;
    g.fillStyle = '#0f0a14';
    g.fillRect(0, 0, size, size);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const shade = 0.93 + rnd() * 0.14;
        g.fillStyle = 'rgb(' + Math.round(54 * shade) + ',' + Math.round(45 * shade) + ',' + Math.round(64 * shade) + ')';
        g.fillRect(c * w + 2, r * w + 2, w - 4, w - 4);
      }
    }
  });
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;         // stays crisp where the floor runs away from you
  return texture;
}

// Walls: plain stone that darkens toward the ceiling.
function wallTexture() {
  return canvasTexture(256, function (g, size) {
    const grad = g.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, '#120b18');
    grad.addColorStop(0.55, '#281d33');
    grad.addColorStop(1, '#362844');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  });
}

// The summoning circle: two rings and a five-pointed star (outer layer), a small ring (inner layer).
function circleTexture(inner) {
  return canvasTexture(1024, function (g, size) {
    const c = size / 2;
    g.strokeStyle = inner ? '#d9c4f0' : '#9a74d6';
    g.lineCap = 'round'; g.lineJoin = 'round';
    function ring(r, width) { g.lineWidth = width; g.beginPath(); g.arc(c, c, size * r, 0, Math.PI * 2); g.stroke(); }
    if (inner) { ring(0.19, 4); return; }
    ring(0.47, 7); ring(0.445, 2); ring(0.335, 3);
    g.lineWidth = 4; g.beginPath();
    for (let i = 0; i <= 5; i++) {
      const a = -Math.PI / 2 + i * (Math.PI * 4 / 5);
      g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * size * 0.335, c + Math.sin(a) * size * 0.335);
    }
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

  scene.background = new THREE.Color(0x0b0611);
  scene.fog = new THREE.Fog(0x0b0611, 38, 140);

  // --- Light: soft violet all round, a near-white key light that casts the shadows, a little purple from the fires.
  // Kept low on purpose: the room is the background, easy on the eyes; the characters and spells are what shines.
  scene.add(new THREE.AmbientLight(0xb8a0cc, 0.55));
  scene.add(new THREE.HemisphereLight(0xd8c4f0, 0x1a1220, 0.5));
  const key = new THREE.DirectionalLight(0xfff0ff, 1.3);
  key.position.set(14, 36, 20);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = key.shadow.camera.bottom = -40;
  key.shadow.camera.right = key.shadow.camera.top = 40;
  key.shadow.camera.near = 2; key.shadow.camera.far = 100;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.05;
  scene.add(key);
  const circleLight = new THREE.PointLight(0xb088e0, 170, 55, 1.6);
  circleLight.position.set(0, 7, 0);
  scene.add(circleLight);

  // --- Floor, walls, ceiling --------------------------------------------------------------------------------
  const floorMap = floorTexture();
  floorMap.repeat.set(6, 6);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshLambertMaterial({ map: floorMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const wallMaterial = new THREE.MeshLambertMaterial({ map: wallTexture() });
  const plinth = flat(0x150f1c), lineGlow = glow(0x6a44a8);
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
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, HALF * 2), new THREE.MeshBasicMaterial({ color: 0x0a0510 }));
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = WALL_HEIGHT;
  scene.add(ceiling);

  // --- Pillars: eight in a circle, plain, each with one band of light ------------------------------------------
  const stone = flat(0x483a58), stoneDark = flat(0x30253c);
  const R = 39;
  for (let i = 0; i < 8; i++) {
    const angle = (i + 0.5) * Math.PI / 4, x = Math.sin(angle) * R, z = Math.cos(angle) * R;
    const pillar = new THREE.Group();
    pillar.position.set(x, 0, z);
    pillar.rotation.y = angle;
    add(pillar, new THREE.CylinderGeometry(2.3, 2.5, 0.7, 12), stoneDark, 0, 0.35, 0);
    add(pillar, new THREE.CylinderGeometry(1.55, 1.7, WALL_HEIGHT - 2.1, 12), stone, 0, 0.7 + (WALL_HEIGHT - 2.1) / 2, 0);
    add(pillar, new THREE.CylinderGeometry(2.5, 1.6, 1.4, 12), stoneDark, 0, WALL_HEIGHT - 0.7, 0);
    const band = add(pillar, new THREE.CylinderGeometry(1.68, 1.68, 0.22, 12, 1, true), light(0x9a6ce0, 0.6), 0, 5.2, 0);
    const shine = halo(0x8a5cd0, 6, 0.12);
    shine.position.y = 5.2;
    pillar.add(shine);
    const phase = i * 0.9;
    animated.push(function (t) { band.material.opacity = 0.45 + Math.sin(t * 1.2 + phase) * 0.15; });
    scene.add(pillar);
    colliders.push({ x: x, z: z, r: 2.6 });
  }
  // A pale shaft of light falling onto the circle.
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 8.2, WALL_HEIGHT, 28, 1, true), light(0xa88ce0, 0.03));
  shaft.position.y = WALL_HEIGHT / 2;
  scene.add(shaft);
  animated.push(function (t) { shaft.material.opacity = 0.025 + Math.sin(t * 0.7) * 0.008; shaft.rotation.y = t * 0.03; });

  // --- Four bowls of shadowflame on slim stands ------------------------------------------------------------------
  const iron = flat(0x3a3044);
  for (let i = 0; i < 4; i++) {
    const angle = Math.PI / 4 + i * Math.PI / 2, x = Math.sin(angle) * 33, z = Math.cos(angle) * 33;
    const brazier = new THREE.Group();
    brazier.position.set(x, 0, z);
    add(brazier, new THREE.CylinderGeometry(0.7, 0.85, 0.16, 10), iron, 0, 0.08, 0);
    add(brazier, new THREE.CylinderGeometry(0.1, 0.14, 1.6, 8), iron, 0, 0.9, 0);
    add(brazier, new THREE.CylinderGeometry(1.0, 0.3, 0.55, 12), iron, 0, 1.9, 0);
    add(brazier, new THREE.CylinderGeometry(0.9, 0.9, 0.06, 12), glow(0x7a44c0), 0, 2.16, 0);
    const flicker = flame(brazier, 0, 2.1, 0, 1.7, 0x8f4de0, 0xd9bcf5, i * 1.7);
    const lamp = new THREE.PointLight(0xb894e6, 240, 60, 1.6);
    lamp.position.y = 3.4;
    brazier.add(lamp);
    animated.push(function (t) { lamp.intensity = 240 * (0.9 + flicker(t) * 0.6); });
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
    circleMaterial.opacity = 0.42 + Math.sin(t * 1.3) * 0.08;
    innerMaterial.opacity = 0.3 + Math.sin(t * 2.1) * 0.1;
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
  scene.add(new THREE.Points(moteGeometry, new THREE.PointsMaterial({ color: 0xc0a4e6, size: 0.12, transparent: true, opacity: 0.4, depthWrite: false })));
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
