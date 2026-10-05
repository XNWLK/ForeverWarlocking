// The pets in the room: the Imp and the Succubus as low-poly models, and how they move.
// The rules of their attacks are in combat.js; this file only decides where the pet stands and how it looks.
// One unit is one yard. Models are built facing -z, like the Warlock.
import * as THREE from 'three';

const RUN_SPEED = 9;            // a little faster than you, so it catches up
const FOLLOW_BACK = 1.5, FOLLOW_LEFT = 1.7;
const MELEE_SPOT = 2.4;         // where the Succubus stands, measured from the middle of its dummy

function flat(color) { return new THREE.MeshLambertMaterial({ color: color, flatShading: true }); }
function glow(color, extra) { return new THREE.MeshBasicMaterial(Object.assign({ color: color }, extra)); }
function add(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}
function shadow(radius) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  return mesh;
}

// The Imp: small, big ears, a ball of fire between its hands while it casts.
function makeImp() {
  const root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig, shadow(0.4));
  const skin = flat(0xc0482c), dark = flat(0x7a2418), bone = flat(0xe6d9b8);
  add(rig, new THREE.IcosahedronGeometry(0.27, 0), skin, 0, 0.5, 0).scale.set(1, 1.1, 0.9);
  add(rig, new THREE.IcosahedronGeometry(0.23, 0), skin, 0, 0.92, -0.04);
  [-1, 1].forEach(function (side) {
    const ear = add(rig, new THREE.ConeGeometry(0.07, 0.42, 4), skin, side * 0.3, 1.0, 0);
    ear.rotation.z = -side * 1.15;
    const horn = add(rig, new THREE.ConeGeometry(0.04, 0.16, 4), bone, side * 0.1, 1.14, -0.02);
    horn.rotation.z = -side * 0.3;
    add(rig, new THREE.CylinderGeometry(0.05, 0.07, 0.3, 5), dark, side * 0.13, 0.15, 0);
    const arm = add(rig, new THREE.CylinderGeometry(0.04, 0.05, 0.34, 5), skin, side * 0.24, 0.58, -0.14);
    arm.rotation.x = 1.0;
    add(rig, new THREE.SphereGeometry(0.03, 6, 4), glow(0x9dff6a), side * 0.09, 0.96, -0.24);
  });
  const tail = add(rig, new THREE.ConeGeometry(0.04, 0.4, 4), dark, 0, 0.35, 0.3);
  tail.rotation.x = -1.1;
  const fire = add(rig, new THREE.IcosahedronGeometry(0.13, 0), glow(0xffa23d), 0, 0.6, -0.36);
  fire.visible = false;

  function update(dt, time, moving, cast) {
    rig.position.y = 0.12 + Math.sin(time * (moving ? 12 : 3)) * (moving ? 0.07 : 0.04);
    rig.rotation.x = moving ? -0.15 : 0;
    fire.visible = cast > 0;
    fire.scale.setScalar(0.3 + cast * 1.1 + Math.sin(time * 25) * 0.08);
    fire.rotation.y = time * 6;
  }
  return { root: root, update: update, strike: function () {} };
}

// The Succubus: tall and slender, horns, small wings, a whip.
function makeSuccubus() {
  const root = new THREE.Group(), rig = new THREE.Group();
  root.add(rig, shadow(0.6));
  const skin = flat(0xcf86b8), cloth = flat(0x3a1c4f), hair = flat(0x1d1226), bone = flat(0xd9d2bf), wing = flat(0x5a2a5e), leather = flat(0x2a1a14);
  [-1, 1].forEach(function (side) {
    add(rig, new THREE.CylinderGeometry(0.1, 0.07, 0.95, 6), skin, side * 0.13, 0.48, 0);
    add(rig, new THREE.CylinderGeometry(0.085, 0.1, 0.34, 6), cloth, side * 0.13, 0.19, 0);
    const horn = add(rig, new THREE.ConeGeometry(0.045, 0.3, 5), bone, side * 0.13, 1.98, 0.02);
    horn.rotation.z = -side * 0.5;
    const w = add(rig, new THREE.ConeGeometry(0.34, 0.75, 3), wing, side * 0.38, 1.5, 0.2);
    w.scale.z = 0.12;
    w.rotation.z = side * 0.5;
  });
  add(rig, new THREE.CylinderGeometry(0.2, 0.24, 0.3, 7), cloth, 0, 1.02, 0);
  add(rig, new THREE.CylinderGeometry(0.23, 0.15, 0.48, 7), skin, 0, 1.38, 0);
  add(rig, new THREE.CylinderGeometry(0.235, 0.2, 0.2, 7), cloth, 0, 1.5, 0);
  add(rig, new THREE.IcosahedronGeometry(0.16, 1), skin, 0, 1.8, 0);
  const locks = add(rig, new THREE.IcosahedronGeometry(0.19, 0), hair, 0, 1.82, 0.07);
  locks.scale.set(1, 1.15, 1);
  add(rig, new THREE.CylinderGeometry(0.06, 0.05, 0.5, 5), skin, -0.3, 1.3, 0).rotation.z = -0.2;
  const tail = add(rig, new THREE.ConeGeometry(0.04, 0.7, 4), skin, 0, 0.75, 0.3);
  tail.rotation.x = -0.9;

  // The whip arm swings forward on an attack.
  const arm = new THREE.Group();
  arm.position.set(0.3, 1.5, 0);
  rig.add(arm);
  add(arm, new THREE.CylinderGeometry(0.06, 0.05, 0.5, 5), skin, 0, -0.22, 0);
  const whip = add(arm, new THREE.CylinderGeometry(0.02, 0.008, 1.5, 4), leather, 0, -0.45, -0.75);
  whip.rotation.x = Math.PI / 2;

  let swing = 0;
  function update(dt, time, moving) {
    swing = Math.max(0, swing - dt * 3.5);
    rig.position.y = moving ? Math.abs(Math.sin(time * 11)) * 0.06 : Math.sin(time * 2) * 0.015;
    rig.rotation.x = moving ? -0.1 : -swing * 0.12;
    arm.rotation.x = 0.35 + Math.sin(swing * Math.PI) * 1.5;
    tail.rotation.z = Math.sin(time * 2.2) * 0.3;
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
  // casting; dead: nothing left to attack; target: { x, z } of the dummy it is sent at.
  function update(dt, time, player, mode, range, cast, dead, target) {
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
