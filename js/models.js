// Low-poly models made for this project, built from simple shapes. One unit is one yard.
// The dummy and the channel beam; the Warlock is in warlock.js, the pets in pets.js.
import * as THREE from 'three';
import { flat, light, add, groundShadow } from './kit.js';

// The training dummy: a straw-stuffed figure roped to a post, a horned bucket helm, a round shield for a chest and a
// wooden sword. Built facing +z.
export function makeDummy() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.25);
  root.add(body);
  root.add(groundShadow(1.4));

  const stone = flat(0x4b4656), wood = flat(0x6b4423), woodDark = flat(0x4a2e17), sack = flat(0xb0935a), sackLight = flat(0xc9ad72);
  const rope = flat(0x4a3a22), bone = flat(0xd9d2bf), iron = flat(0x6d6a78), white = flat(0xe9e4da), red = flat(0xb8322b), straw = flat(0xd8bd6a);

  // Base: a stone ring with crossed planks.
  add(body, new THREE.CylinderGeometry(0.86, 1.0, 0.2, 10), stone, 0, 0.1, 0);
  add(body, new THREE.BoxGeometry(1.5, 0.1, 0.22), woodDark, 0, 0.24, 0).rotation.y = 0.6;
  add(body, new THREE.BoxGeometry(1.5, 0.1, 0.22), woodDark, 0, 0.25, 0).rotation.y = -0.6;

  // Post and cross-arm.
  add(body, new THREE.CylinderGeometry(0.12, 0.15, 2.2, 7), wood, 0, 1.32, 0);
  add(body, new THREE.BoxGeometry(1.95, 0.15, 0.15), wood, 0, 2.04, 0);
  [0.5, 0.75, 0.95].forEach(function (y) { add(body, new THREE.CylinderGeometry(0.16, 0.16, 0.05, 7), rope, 0, y, 0); });

  // Stuffed sack for a body, tied with rope, with a patch; straw sticking out at the neck and the arm ends.
  const torso = add(body, new THREE.IcosahedronGeometry(0.46, 1), sack, 0, 1.72, 0);
  torso.scale.set(1, 1.15, 0.85);
  add(body, new THREE.CylinderGeometry(0.4, 0.4, 0.05, 9), rope, 0, 1.42, 0);
  add(body, new THREE.CylinderGeometry(0.42, 0.42, 0.05, 9), rope, 0, 2.1, 0);
  add(body, new THREE.BoxGeometry(0.22, 0.2, 0.03), flat(0x7a5a34), -0.2, 1.52, 0.37).rotation.z = 0.2;
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7, tuft = add(body, new THREE.ConeGeometry(0.035, 0.26, 4), straw, Math.sin(a) * 0.2, 2.26, Math.cos(a) * 0.2);
    tuft.rotation.set(Math.cos(a) * 0.9, 0, -Math.sin(a) * 0.9);
  }
  [-1, 1].forEach(function (side) {
    add(body, new THREE.IcosahedronGeometry(0.19, 0), sack, side * 0.9, 2.04, 0);
    add(body, new THREE.CylinderGeometry(0.2, 0.2, 0.04, 7), rope, side * 0.72, 2.04, 0).rotation.z = Math.PI / 2;
    for (let i = 0; i < 4; i++) {
      const tuft = add(body, new THREE.ConeGeometry(0.03, 0.24, 4), straw, side * 1.08, 2.04 + (i - 1.5) * 0.06, (i % 2 - 0.5) * 0.12);
      tuft.rotation.z = -side * (1.3 + i * 0.12);
    }
  });

  // Head: a sack under a dented bucket helm with horns and an eye slit.
  add(body, new THREE.IcosahedronGeometry(0.28, 0), sackLight, 0, 2.52, 0);
  add(body, new THREE.CylinderGeometry(0.3, 0.33, 0.36, 8), iron, 0, 2.66, 0);
  add(body, new THREE.CylinderGeometry(0.34, 0.34, 0.05, 8), flat(0x4a4854), 0, 2.5, 0);
  add(body, new THREE.BoxGeometry(0.3, 0.05, 0.03), flat(0x15131b), 0, 2.64, 0.31);
  [-1, 1].forEach(function (side) {
    const horn = add(body, new THREE.ConeGeometry(0.075, 0.42, 5), bone, side * 0.36, 2.86, 0);
    horn.rotation.z = -side * 0.75;
  });

  // A torn red scarf round the neck; its two tails stir a little, and whip about when the dummy is hit.
  add(body, new THREE.CylinderGeometry(0.26, 0.3, 0.12, 9), red, 0, 2.3, 0);
  const tails = [[-0.16, 0.5, 0.25], [0.02, 0.38, -0.2]].map(function (t) {
    const tail = new THREE.Group();
    tail.position.set(t[0], 2.28, -0.27);
    body.add(tail);
    add(tail, new THREE.BoxGeometry(0.13, t[1], 0.02), red, 0, -t[1] / 2, 0);
    tail.userData.lean = t[2];
    return tail;
  });

  // Shield on the chest with painted rings and an iron boss; a wooden sword on the right arm.
  [[0.46, 0.06, woodDark], [0.4, 0.07, white], [0.28, 0.08, red], [0.15, 0.09, white]].forEach(function (ring) {
    const disc = add(body, new THREE.CylinderGeometry(ring[0], ring[0], ring[1], 16), ring[2], 0, 1.74, 0.42);
    disc.rotation.x = Math.PI / 2;
  });
  add(body, new THREE.IcosahedronGeometry(0.07, 0), iron, 0, 1.74, 0.5);
  const sword = new THREE.Group();
  sword.position.set(0.95, 2.04, 0.1);
  sword.rotation.set(0.5, 0, -0.25);
  body.add(sword);
  add(sword, new THREE.BoxGeometry(0.07, 0.9, 0.025), woodDark, 0, 0.5, 0);
  add(sword, new THREE.BoxGeometry(0.3, 0.05, 0.05), wood, 0, 0.06, 0);

  // Two arrows left in it by someone else.
  [[-0.25, 1.95, 0.3, 0.5, 0.3], [0.3, 1.5, 0.35, -0.3, -0.5]].forEach(function (a) {
    const arrow = new THREE.Group();
    arrow.position.set(a[0], a[1], a[2]);
    arrow.rotation.set(Math.PI / 2 + a[3], 0, a[4]);
    body.add(arrow);
    add(arrow, new THREE.CylinderGeometry(0.012, 0.012, 0.5, 4), wood, 0, 0.25, 0);
    add(arrow, new THREE.ConeGeometry(0.05, 0.12, 3), red, 0, 0.5, 0);
  });

  // Red circle on the ground: this is your target.
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.62, 44),
    new THREE.MeshBasicMaterial({ color: 0xe0483c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide })
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.06;
  root.add(circle);

  // A hit makes the dummy rock back; at zero health it falls over until the next fight.
  // The red circle shows only under the dummy you have targeted.
  // It also wobbles to one side or the other, so no two hits look the same.
  let rock = 0, rockSpeed = 0, roll = 0, rollSpeed = 0, fallen = 0, dead = false, selected = true;
  function hit(strength) { rockSpeed -= 1.6 * strength; rollSpeed += (Math.random() - 0.5) * 2.2 * strength; }
  function setDead(value) { dead = value; circle.visible = selected && !dead; }
  function setSelected(value) { selected = value; circle.visible = selected && !dead; }
  function update(dt, time) {
    rockSpeed += (-rock * 140 - rockSpeed * 9) * dt;       // a damped spring
    rock += rockSpeed * dt;
    rollSpeed += (-roll * 110 - rollSpeed * 7) * dt;
    roll += rollSpeed * dt;
    fallen += ((dead ? 1 : 0) - fallen) * Math.min(1, dt * 6);
    body.rotation.x = rock - fallen * 1.45;
    body.rotation.z = roll * (1 - fallen);
    if (time != null) tails.forEach(function (tail, i) {
      tail.rotation.x = -0.12 + Math.sin(time * 1.3 + i * 2) * 0.05 - rock * 2.2;
      tail.rotation.z = tail.userData.lean + Math.sin(time * 0.9 + i) * 0.04 - roll * 2.5;
    });
    if (time != null) circle.material.opacity = 0.75 + Math.sin(time * 4) * 0.15;
  }

  return { root: root, radius: 1.2, hit: hit, setDead: setDead, setSelected: setSelected, update: update, chest: new THREE.Vector3(0, 2.2, 0), head: new THREE.Vector3(0, 3.1, 0) };
}

// A beam between two points, for channelled spells: a bright core inside a wider glow that wavers.
export function makeBeam() {
  const group = new THREE.Group();
  const coreMaterial = light(0xffffff, 0.9), material = light(0x8dff9a, 0.45);
  const core = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6, 1, true), coreMaterial);
  const outer = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1, 8, 1, true), material);
  group.add(core, outer);
  group.visible = false;
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  function set(from, to, time) {
    dir.subVectors(to, from);
    const length = dir.length();
    group.position.copy(from).addScaledVector(dir, 0.5);
    group.quaternion.setFromUnitVectors(up, dir.normalize());
    const pulse = 1 + Math.sin(time * 30) * 0.3;
    core.scale.set(1, length, 1);
    outer.scale.set(pulse, length, pulse);
    material.opacity = 0.35 + Math.sin(time * 17) * 0.12;
    group.visible = true;
  }
  return { mesh: group, set: set, hide: function () { group.visible = false; }, material: material };
}
