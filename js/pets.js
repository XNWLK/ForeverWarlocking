// The pets in the room: the Imp and the Succubus as low-poly models, and how they move.
// The rules of their attacks are in combat.js; this file only decides where the pet stands and how it looks.
// One unit is one yard. Models are built facing -z, like the Warlock.
import * as THREE from 'three';
import { flat, glow, light, add, halo, groundShadow } from './kit.js';

const RUN_SPEED = 9;            // a little faster than you, so it catches up
const FOLLOW_BACK = 1.5, FOLLOW_LEFT = 1.7;
const MELEE_SPOT = 2.4;         // where the Succubus stands, measured from the middle of its dummy

// The Imp: a small hunched fiend that scampers along on two clawed feet. Big ears, little wings (too small to fly
// with), a tail with a burning tip, and a ball of fire between its hands while it casts.
function makeImp() {
  const root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig, groundShadow(0.42));
  const skin = flat(0xbf4526), dark = flat(0x7a2418), belly = flat(0xd9713f), bone = flat(0xe6d9b8), claw = flat(0x2a1612);

  const body = add(rig, new THREE.IcosahedronGeometry(0.28, 1), skin, 0, 0.55, 0.02);
  body.scale.set(1, 1.15, 0.95);
  add(rig, new THREE.IcosahedronGeometry(0.19, 0), belly, 0, 0.5, -0.12).scale.set(1, 1.1, 0.7);
  const head = new THREE.Group();
  head.position.set(0, 0.98, -0.06);
  rig.add(head);
  add(head, new THREE.IcosahedronGeometry(0.25, 1), skin, 0, 0, 0).scale.set(1.05, 0.95, 1);
  add(head, new THREE.ConeGeometry(0.09, 0.2, 4), skin, 0, -0.08, -0.23).rotation.x = -1.9;      // snout
  add(head, new THREE.BoxGeometry(0.2, 0.025, 0.03), claw, 0, -0.13, -0.2);                        // grin
  [-1, 1].forEach(function (side) {
    const ear = add(head, new THREE.ConeGeometry(0.09, 0.55, 4), skin, side * 0.36, 0.1, 0.04);
    ear.rotation.set(0.2, 0, -side * 1.2);
    ear.scale.z = 0.35;
    const horn = add(head, new THREE.ConeGeometry(0.045, 0.2, 4), bone, side * 0.11, 0.24, -0.04);
    horn.rotation.z = -side * 0.3;
    add(head, new THREE.SphereGeometry(0.045, 6, 5), glow(0xb6ff5c), side * 0.1, 0.03, -0.2);
    const wing = add(rig, new THREE.ConeGeometry(0.2, 0.42, 3), dark, side * 0.28, 0.82, 0.24);
    wing.scale.z = 0.12;
    wing.rotation.set(0.3, side * 0.5, side * 0.9);
    wing.userData.side = side;
    const leg = new THREE.Group();                                                                  // legs swing from the hip
    leg.position.set(side * 0.13, 0.36, 0.02);
    rig.add(leg);
    add(leg, new THREE.CylinderGeometry(0.055, 0.065, 0.3, 5), dark, 0, -0.16, 0);
    add(leg, new THREE.ConeGeometry(0.07, 0.18, 4), claw, 0, -0.31, -0.07).rotation.x = -1.3;
    leg.userData.leg = side;
  });
  const wings = rig.children.filter(function (m) { return m.userData.side; });
  const legs = rig.children.filter(function (m) { return m.userData.leg; });
  const arms = [-1, 1].map(function (side) {
    const arm = new THREE.Group();
    arm.position.set(side * 0.26, 0.68, -0.04);
    rig.add(arm);
    add(arm, new THREE.CylinderGeometry(0.04, 0.05, 0.36, 5), skin, 0, -0.16, 0);
    add(arm, new THREE.IcosahedronGeometry(0.06, 0), claw, 0, -0.36, 0);
    arm.userData.side = side;
    return arm;
  });
  const tail = new THREE.Group();
  tail.position.set(0, 0.42, 0.26);
  rig.add(tail);
  add(tail, new THREE.CylinderGeometry(0.03, 0.045, 0.45, 4), dark, 0, 0.12, 0.16).rotation.x = -0.9;
  const tailFlame = add(tail, new THREE.ConeGeometry(0.06, 0.2, 5), glow(0x9dff6a), 0, 0.3, 0.36);
  const fire = add(rig, new THREE.IcosahedronGeometry(0.13, 0), glow(0xffa23d), 0, 0.62, -0.42);
  const fireGlow = halo(0xff8a2a, 1.2, 0.8);
  fireGlow.position.copy(fire.position);
  rig.add(fireGlow);
  fire.visible = fireGlow.visible = false;

  let throwing = 0;
  function update(dt, time, moving, cast) {
    throwing = Math.max(0, throwing - dt * 4);
    // On its feet: a quick hopping scamper with a waddle while it runs, a little bounce on the spot otherwise.
    const step = time * 15;
    rig.position.y = moving ? Math.abs(Math.sin(step)) * 0.09 : Math.abs(Math.sin(time * 2.6)) * 0.02;
    rig.rotation.x = moving ? -0.25 : -0.05 - cast * 0.1;
    rig.rotation.z = moving ? Math.sin(step) * 0.12 : 0;
    head.rotation.z = Math.sin(time * 1.7) * 0.08;
    legs.forEach(function (leg) { leg.rotation.x = moving ? Math.sin(step) * leg.userData.leg * 0.8 : 0; });
    wings.forEach(function (w) { w.rotation.z = w.userData.side * (0.9 + Math.sin(time * (moving ? 9 : 2.4)) * (moving ? 0.25 : 0.1)); });
    arms.forEach(function (arm) {                           // a positive angle swings the hand forward
      arm.rotation.x = cast * 1.5 + throwing * 0.9 + (moving ? Math.sin(step) * -arm.userData.side * 0.6 : 0);
      arm.rotation.z = arm.userData.side * (0.25 - cast * 0.45);
    });
    tail.rotation.y = Math.sin(time * 2.6) * 0.5;
    tailFlame.scale.y = 1 + Math.sin(time * 19) * 0.3;
    fire.visible = fireGlow.visible = cast > 0;
    fire.scale.setScalar(0.25 + cast * 1.15 + Math.sin(time * 25) * 0.08);
    fire.rotation.y = time * 6;
    fireGlow.scale.setScalar(0.4 + cast * 1.4);
  }
  return { root: root, update: update, strike: function () { throwing = 1; } };
}

// The Succubus: tall and lithe, curved horns, long hair, bat wings, hooves, a tail, and a whip that cracks forward.
function makeSuccubus() {
  const root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig, groundShadow(0.6));
  const skin = flat(0xcf86b8), skinDark = flat(0xa5628f), cloth = flat(0x351846), hair = flat(0x1b1024), bone = flat(0xd9d2bf);
  const wing = flat(0x55285c), membrane = flat(0x7d3a78), leather = flat(0x2a1a14), gold = flat(0xd2a83c);

  [-1, 1].forEach(function (side) {
    add(rig, new THREE.CylinderGeometry(0.11, 0.075, 0.52, 6), skin, side * 0.13, 0.86, 0);          // thigh
    add(rig, new THREE.CylinderGeometry(0.075, 0.05, 0.46, 6), skinDark, side * 0.13, 0.38, 0.03);    // shin
    add(rig, new THREE.CylinderGeometry(0.06, 0.085, 0.16, 5), leather, side * 0.13, 0.08, 0);        // hoof
    add(rig, new THREE.CylinderGeometry(0.085, 0.085, 0.04, 6), gold, side * 0.13, 0.6, 0.02);        // anklet band
  });
  add(rig, new THREE.CylinderGeometry(0.2, 0.25, 0.26, 8), cloth, 0, 1.12, 0);                         // hips
  const sash = add(rig, new THREE.BoxGeometry(0.14, 0.5, 0.03), cloth, 0, 0.88, -0.2);
  sash.rotation.x = 0.12;
  add(rig, new THREE.CylinderGeometry(0.255, 0.255, 0.05, 8), gold, 0, 1.24, 0);
  add(rig, new THREE.CylinderGeometry(0.2, 0.15, 0.36, 8), skin, 0, 1.44, 0);                          // waist
  add(rig, new THREE.CylinderGeometry(0.22, 0.2, 0.22, 8), cloth, 0, 1.66, 0);                         // chest wrap
  add(rig, new THREE.CylinderGeometry(0.09, 0.16, 0.14, 7), skin, 0, 1.82, 0);                         // shoulders to neck

  const head = new THREE.Group();
  head.position.set(0, 2.0, 0);
  rig.add(head);
  add(head, new THREE.IcosahedronGeometry(0.16, 1), skin, 0, 0, -0.01);
  const locks = add(head, new THREE.IcosahedronGeometry(0.19, 0), hair, 0, 0.03, 0.06);
  locks.scale.set(1.05, 1.1, 1.1);
  add(head, new THREE.ConeGeometry(0.16, 0.7, 6), hair, 0, -0.3, 0.16).rotation.x = -0.25;             // hair down the back
  [-1, 1].forEach(function (side) {
    const horn = add(head, new THREE.ConeGeometry(0.05, 0.36, 5), bone, side * 0.15, 0.2, 0.02);
    horn.rotation.set(-0.5, 0, -side * 0.75);
    add(head, new THREE.SphereGeometry(0.02, 5, 4), glow(0xff8ad8), side * 0.06, 0.0, -0.16);
  });

  // Bat wings: a bony arm with two leaves of membrane each; they open and close slowly.
  const wings = [-1, 1].map(function (side) {
    const w = new THREE.Group();
    w.position.set(side * 0.12, 1.72, 0.14);
    rig.add(w);
    const armBone = add(w, new THREE.CylinderGeometry(0.025, 0.035, 0.8, 4), wing, side * 0.3, 0.3, 0.05);
    armBone.rotation.z = -side * 0.75;
    const a = add(w, new THREE.ConeGeometry(0.34, 0.9, 3), membrane, side * 0.42, 0.05, 0.08);
    a.scale.z = 0.08; a.rotation.z = side * 0.35;
    const b = add(w, new THREE.ConeGeometry(0.26, 0.7, 3), membrane, side * 0.72, 0.18, 0.1);
    b.scale.z = 0.08; b.rotation.z = side * 0.85;
    w.userData.side = side;
    return w;
  });

  const tail = new THREE.Group();
  tail.position.set(0, 1.05, 0.2);
  rig.add(tail);
  add(tail, new THREE.CylinderGeometry(0.025, 0.045, 0.7, 4), skinDark, 0, -0.2, 0.26).rotation.x = -0.95;
  add(tail, new THREE.ConeGeometry(0.06, 0.16, 3), skinDark, 0, -0.42, 0.58).rotation.x = -1.9;

  const armLeft = new THREE.Group();
  armLeft.position.set(-0.24, 1.76, 0);
  rig.add(armLeft);
  add(armLeft, new THREE.CylinderGeometry(0.05, 0.04, 0.62, 5), skin, 0, -0.3, 0);
  armLeft.rotation.z = -0.25;

  // The whip arm swings forward on an attack; the whip trails a bright line while it cracks.
  const arm = new THREE.Group();
  arm.position.set(0.24, 1.76, 0);
  rig.add(arm);
  add(arm, new THREE.CylinderGeometry(0.05, 0.04, 0.62, 5), skin, 0, -0.3, 0);
  add(arm, new THREE.CylinderGeometry(0.03, 0.03, 0.16, 5), leather, 0, -0.62, -0.02);
  const whip = add(arm, new THREE.CylinderGeometry(0.02, 0.006, 1.7, 4), leather, 0, -0.66, -0.9);
  whip.rotation.x = Math.PI / 2;
  const crack = add(arm, new THREE.CylinderGeometry(0.05, 0.01, 1.7, 5, 1, true), light(0xff8ad8, 0.0), 0, -0.66, -0.9);
  crack.rotation.x = Math.PI / 2;

  let swing = 0;
  function update(dt, time, moving) {
    swing = Math.max(0, swing - dt * 3.5);
    rig.position.y = moving ? Math.abs(Math.sin(time * 11)) * 0.06 : Math.sin(time * 2) * 0.015;
    rig.rotation.x = moving ? -0.1 : -swing * 0.14;
    rig.rotation.y = moving ? 0 : Math.sin(time * 1.3) * 0.06;
    arm.rotation.x = 0.35 + Math.sin(swing * Math.PI) * 1.6;
    armLeft.rotation.x = moving ? Math.sin(time * 11) * 0.5 : 0.1;
    crack.material.opacity = Math.sin(swing * Math.PI) * 0.8;
    wings.forEach(function (w) { w.rotation.y = w.userData.side * (0.35 + Math.sin(time * 1.8) * 0.18 + swing * 0.4); });
    tail.rotation.y = Math.sin(time * 2.2) * 0.45;
    head.rotation.y = Math.sin(time * 0.9) * 0.12;
  }
  return { root: root, update: update, strike: function () { swing = 1; } };
}

// One pet in the scene. `kind` is 'imp', 'succubus' or null (no pet out).
export function createPet(scene) {
  const models = { imp: makeImp(), succubus: makeSuccubus() };
  Object.keys(models).forEach(function (k) { models[k].root.visible = false; scene.add(models[k].root); });
  const pet = { kind: null, x: 0, z: 0, yaw: 0, moving: false, distance: 0 };
  let placed = false;

  function setKind(kind) {
    Object.keys(models).forEach(function (k) { models[k].root.visible = k === kind; });
    pet.kind = kind;
    placed = false;
  }

  // player: { x, z, yaw }; mode: 'attack' or 'follow'; range: how close it must be to attack; cast: 0..1 while it is
  // casting; dead: nothing left to attack; target: { x, z } of the dummy it is sent at; colliders: [{ x, z, r }].
  function update(dt, time, player, mode, range, cast, dead, target, colliders) {
    if (!pet.kind) return;
    const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
    const homeX = player.x + sin * FOLLOW_BACK - cos * FOLLOW_LEFT, homeZ = player.z + cos * FOLLOW_BACK + sin * FOLLOW_LEFT;
    if (!placed) { pet.x = homeX; pet.z = homeZ; pet.yaw = player.yaw; placed = true; }

    let goalX = homeX, goalZ = homeZ, slack = pet.moving ? 0.15 : 1.0, faceDummy = false;
    const offX = pet.x - target.x, offZ = pet.z - target.z, fromDummy = Math.max(Math.hypot(offX, offZ), 0.001);
    if (mode === 'attack' && !dead) {
      faceDummy = true;
      if (pet.kind === 'succubus') {            // runs up to the dummy and stays at arm's length
        goalX = target.x + offX / fromDummy * MELEE_SPOT; goalZ = target.z + offZ / fromDummy * MELEE_SPOT; slack = 0.15;
      } else if (fromDummy <= range - 1) {       // the Imp casts from where it stands
        goalX = pet.x; goalZ = pet.z;
      } else {                                   // too far: walk in until it is in range
        const stop = range - 2;
        goalX = target.x + offX / fromDummy * stop; goalZ = target.z + offZ / fromDummy * stop; slack = 0.15;
      }
    }

    const dx = goalX - pet.x, dz = goalZ - pet.z, gap = Math.hypot(dx, dz);
    pet.moving = gap > slack;
    if (pet.moving) {
      const step = Math.min(gap, RUN_SPEED * dt);
      pet.x += dx / gap * step; pet.z += dz / gap * step;
      pet.yaw = Math.atan2(-dx, -dz);
      (colliders || []).forEach(function (c) {             // pushed out sideways, so it slides round what is in the way
        const ox = pet.x - c.x, oz = pet.z - c.z, d = Math.hypot(ox, oz), min = c.r + 0.45;
        if (d >= min || d < 0.0001) return;
        pet.x = c.x + ox / d * min; pet.z = c.z + oz / d * min;
      });
    } else if (faceDummy) {
      pet.yaw = Math.atan2(pet.x - target.x, pet.z - target.z);   // looking at its dummy
    } else {
      pet.yaw = player.yaw;
    }
    pet.distance = Math.hypot(pet.x - target.x, pet.z - target.z);

    const model = models[pet.kind];
    model.root.position.set(pet.x, 0, pet.z);
    model.root.rotation.y = pet.yaw;
    model.update(dt, time, pet.moving, cast);
  }

  return {
    state: pet, setKind: setKind, update: update,
    strike: function () { if (pet.kind) models[pet.kind].strike(); },
    sendHome: function () { placed = false; }
  };
}
