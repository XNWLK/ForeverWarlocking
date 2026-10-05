// Low-poly models made for this project, built from simple shapes. One unit is one yard.
// Characters are built facing -z (their back is toward +z).
import * as THREE from 'three';
import { flat, glow, light, add, halo, groundShadow } from './kit.js';

// The Warlock: layered robe, horned shoulder plates, deep hood with glowing eyes, a cape, and a staff whose crystal
// floats in a claw. About two yards tall.
export function makeWarlock() {
  const root = new THREE.Group();   // stays on the ground (position and facing)
  const rig = new THREE.Group();    // the body: bobs while walking, rises in a jump
  root.add(rig);
  root.add(groundShadow(0.8));

  const robe = flat(0x6a2f96), robeDark = flat(0x42195f), lining = flat(0x241036), gold = flat(0xd2a83c), skin = flat(0xcfa184);
  const bone = flat(0xcabfa6), wood = flat(0x4a2f1a), leather = flat(0x3a2414), iron = flat(0x3b3846);

  // Robe: a flared skirt in two layers, a front panel with a gold edge, a hem band.
  add(rig, new THREE.CylinderGeometry(0.3, 0.62, 1.08, 10), robe, 0, 0.56, 0);
  add(rig, new THREE.CylinderGeometry(0.63, 0.66, 0.1, 10), gold, 0, 0.06, 0);
  add(rig, new THREE.CylinderGeometry(0.33, 0.5, 0.5, 10), robeDark, 0, 0.92, 0);
  const panel = add(rig, new THREE.BoxGeometry(0.26, 0.98, 0.03), lining, 0, 0.56, -0.5);
  panel.rotation.x = 0.3;
  [-1, 1].forEach(function (s) { const edge = add(rig, new THREE.BoxGeometry(0.03, 0.98, 0.035), gold, s * 0.145, 0.56, -0.5); edge.rotation.x = 0.3; });
  const rune = add(rig, new THREE.OctahedronGeometry(0.07, 0), glow(0x7dffc0), 0, 0.62, -0.535);
  rune.scale.set(0.8, 1.3, 0.3);

  // Belt with a skull buckle, a pouch and a book.
  add(rig, new THREE.CylinderGeometry(0.335, 0.335, 0.1, 10), leather, 0, 1.13, 0);
  add(rig, new THREE.IcosahedronGeometry(0.075, 0), bone, 0, 1.13, -0.34);
  add(rig, new THREE.BoxGeometry(0.14, 0.16, 0.1), leather, 0.3, 1.02, -0.14);
  const book = add(rig, new THREE.BoxGeometry(0.06, 0.24, 0.18), flat(0x6b1f2a), -0.36, 1.0, 0.02);
  book.rotation.z = 0.2;
  add(rig, new THREE.BoxGeometry(0.065, 0.05, 0.185), gold, -0.36, 1.0, 0.02).rotation.z = 0.2;

  // Chest and mantle.
  add(rig, new THREE.CylinderGeometry(0.35, 0.3, 0.5, 10), robe, 0, 1.4, 0);
  add(rig, new THREE.CylinderGeometry(0.2, 0.43, 0.2, 10), robeDark, 0, 1.69, 0);
  add(rig, new THREE.CylinderGeometry(0.44, 0.44, 0.04, 10), gold, 0, 1.6, 0);

  // Cape down the back; it lags a little when you walk.
  const cape = new THREE.Group();
  cape.position.set(0, 1.66, 0.2);
  rig.add(cape);
  add(cape, new THREE.BoxGeometry(0.72, 1.3, 0.04), lining, 0, -0.66, 0.08);
  add(cape, new THREE.BoxGeometry(0.76, 0.06, 0.05), gold, 0, -1.3, 0.085);

  // Shoulder plates with horns and a gem each; the arms hang from pivots so they can swing and rise.
  const arms = [];
  [-1, 1].forEach(function (side) {
    const pad = add(rig, new THREE.IcosahedronGeometry(0.24, 0), iron, side * 0.43, 1.66, 0);
    pad.scale.set(1.15, 0.8, 1.1);
    add(rig, new THREE.TorusGeometry(0.2, 0.025, 5, 10), gold, side * 0.43, 1.6, 0).rotation.x = Math.PI / 2;
    const horn = add(rig, new THREE.ConeGeometry(0.075, 0.42, 5), bone, side * 0.55, 1.9, 0.02);
    horn.rotation.z = -side * 0.6;
    const horn2 = add(rig, new THREE.ConeGeometry(0.05, 0.26, 5), bone, side * 0.38, 1.87, 0.08);
    horn2.rotation.set(-0.3, 0, -side * 0.15);
    add(rig, new THREE.OctahedronGeometry(0.05, 0), glow(0x7dffc0), side * 0.47, 1.72, -0.2);

    const arm = new THREE.Group();
    arm.position.set(side * 0.44, 1.56, 0);
    rig.add(arm);
    add(arm, new THREE.CylinderGeometry(0.1, 0.13, 0.42, 7), robe, 0, -0.22, 0);
    add(arm, new THREE.CylinderGeometry(0.13, 0.19, 0.24, 7), robeDark, 0, -0.5, 0);
    add(arm, new THREE.CylinderGeometry(0.19, 0.19, 0.03, 7), gold, 0, -0.62, 0);
    add(arm, new THREE.IcosahedronGeometry(0.085, 0), skin, 0, -0.68, 0);
    arms.push(arm);
  });
  const armLeft = arms[0], armRight = arms[1];

  // Head in a deep hood: only the eyes show.
  add(rig, new THREE.IcosahedronGeometry(0.165, 1), skin, 0, 1.88, -0.01);
  const hood = add(rig, new THREE.IcosahedronGeometry(0.24, 1), robeDark, 0, 1.92, 0.05);
  hood.scale.set(1, 1.08, 1.12);
  add(rig, new THREE.CylinderGeometry(0.2, 0.235, 0.12, 9, 1, true), lining, 0, 1.86, -0.09).rotation.x = 0.35;
  const tip = add(rig, new THREE.ConeGeometry(0.12, 0.36, 6), robeDark, 0, 2.03, 0.27);
  tip.rotation.x = 1.95;
  [-1, 1].forEach(function (s) { add(rig, new THREE.SphereGeometry(0.022, 6, 4), glow(0xa8ffd8), s * 0.06, 1.9, -0.17); });

  // Staff in the right hand: a dark shaft, a bone claw, a crystal floating in it.
  const staff = new THREE.Group();
  staff.position.set(0.0, -0.68, -0.08);
  armRight.add(staff);
  add(staff, new THREE.CylinderGeometry(0.035, 0.045, 2.3, 6), wood, 0, 0.42, 0);
  add(staff, new THREE.CylinderGeometry(0.055, 0.055, 0.14, 6), gold, 0, 0.0, 0);
  add(staff, new THREE.CylinderGeometry(0.06, 0.04, 0.12, 6), iron, 0, 1.5, 0);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    const claw = add(staff, new THREE.ConeGeometry(0.04, 0.4, 4), bone, Math.sin(a) * 0.13, 1.72, Math.cos(a) * 0.13);
    claw.rotation.set(-Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
  }
  const crystalMaterial = glow(0x7dffc0);
  const crystal = add(staff, new THREE.OctahedronGeometry(0.13, 0), crystalMaterial, 0, 1.86, 0);
  crystal.scale.set(0.8, 1.35, 0.8);
  const shine = halo(0x7dffc0, 1.1, 0.7);
  shine.position.set(0, 1.86, 0);
  staff.add(shine);

  // While a spell is being cast the crystal grows and takes the colour of its school, and the arms rise.
  const IDLE = new THREE.Color(0x7dffc0), SHADOW = new THREE.Color(0xb07cff), FIRE = new THREE.Color(0xff9a3d);
  let stride = 0, casting = 0;
  function update(dt, time, moving, jumpHeight, school) {
    stride = moving ? stride + dt * 10.5 : 0;
    casting += ((school ? 1 : 0) - casting) * Math.min(1, dt * 9);
    const swing = moving ? Math.sin(stride) : 0, breath = Math.sin(time * 1.6) * 0.012;
    rig.position.y = jumpHeight + (moving ? Math.abs(Math.sin(stride)) * 0.06 : breath);
    rig.rotation.x = moving ? -0.07 : casting * 0.05;
    armLeft.rotation.x = swing * 0.5 - casting * 1.45 + Math.sin(time * 9) * 0.05 * casting;
    armLeft.rotation.z = casting * 0.25;
    armRight.rotation.x = -0.22 - swing * 0.18 - casting * 0.5;
    cape.rotation.x = 0.06 + (moving ? 0.3 + Math.sin(stride * 0.5) * 0.06 : Math.sin(time * 1.1) * 0.02);
    const target = school === 'fire' ? FIRE : school ? SHADOW : IDLE;
    crystalMaterial.color.lerp(target, Math.min(1, dt * 12));
    shine.material.color.copy(crystalMaterial.color);
    crystal.rotation.y = time * (1.2 + casting * 6);
    crystal.position.y = 1.86 + Math.sin(time * 2.4) * 0.03;
    const pulse = 1 + Math.sin(time * (school ? 14 : 3)) * 0.1 + casting * 0.7;
    crystal.scale.set(0.8 * pulse, 1.35 * pulse, 0.8 * pulse);
    shine.scale.setScalar(1.1 + casting * 1.6 + Math.sin(time * 5) * 0.08);
  }

  // Where the crystal is in the world (bolts and beams start here).
  function orbPosition(target) { return crystal.getWorldPosition(target); }

  return { root: root, update: update, orbPosition: orbPosition };
}

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
  let rock = 0, rockSpeed = 0, fallen = 0, dead = false, selected = true;
  function hit(strength) { rockSpeed -= 1.6 * strength; }
  function setDead(value) { dead = value; circle.visible = selected && !dead; }
  function setSelected(value) { selected = value; circle.visible = selected && !dead; }
  function update(dt, time) {
    rockSpeed += (-rock * 140 - rockSpeed * 9) * dt;       // a damped spring
    rock += rockSpeed * dt;
    fallen += ((dead ? 1 : 0) - fallen) * Math.min(1, dt * 6);
    body.rotation.x = rock - fallen * 1.45;
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
