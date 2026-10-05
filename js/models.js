// Low-poly models made for this project, built from simple shapes. One unit is one yard.
// Characters are built facing -z (their back is toward +z).
import * as THREE from 'three';

function flat(color, extra) {
  return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, extra));
}

function glow(color, extra) {
  return new THREE.MeshBasicMaterial(Object.assign({ color: color }, extra));
}

function add(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function groundShadow(radius) {
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 20),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.03;
  return shadow;
}

// The Warlock: robe, spiked shoulders, hood, staff with a fel orb. About two yards tall.
export function makeWarlock() {
  const root = new THREE.Group();   // stays on the ground (position and facing)
  const rig = new THREE.Group();    // the body: bobs while walking, rises in a jump
  root.add(rig);
  root.add(groundShadow(0.75));

  const robe = flat(0x4d2c80), dark = flat(0x2b1749), gold = flat(0xc9a23a), skin = flat(0xd8a888);
  const bone = flat(0x9388b8), wood = flat(0x5a3a1e);

  add(rig, new THREE.CylinderGeometry(0.26, 0.58, 1.1, 8), robe, 0, 0.55, 0);
  add(rig, new THREE.CylinderGeometry(0.585, 0.6, 0.1, 8), dark, 0, 0.05, 0);
  add(rig, new THREE.CylinderGeometry(0.29, 0.29, 0.08, 8), gold, 0, 1.1, 0);
  add(rig, new THREE.CylinderGeometry(0.32, 0.27, 0.52, 8), robe, 0, 1.38, 0);
  add(rig, new THREE.CylinderGeometry(0.2, 0.36, 0.14, 8), dark, 0, 1.67, 0);

  [-1, 1].forEach(function (side) {
    add(rig, new THREE.IcosahedronGeometry(0.21, 0), dark, side * 0.4, 1.62, 0);
    const spike = add(rig, new THREE.ConeGeometry(0.07, 0.34, 5), bone, side * 0.48, 1.86, 0);
    spike.rotation.z = -side * 0.5;
    const spike2 = add(rig, new THREE.ConeGeometry(0.05, 0.22, 5), bone, side * 0.34, 1.83, 0.04);
    spike2.rotation.z = -side * 0.15;
    const arm = add(rig, new THREE.CylinderGeometry(0.09, 0.125, 0.6, 6), robe, side * 0.43, 1.3, -0.06);
    arm.rotation.x = 0.28;
    add(rig, new THREE.IcosahedronGeometry(0.08, 0), skin, side * 0.45, 1.0, -0.15);
  });

  add(rig, new THREE.IcosahedronGeometry(0.17, 1), skin, 0, 1.86, 0);
  const hood = add(rig, new THREE.IcosahedronGeometry(0.215, 1), dark, 0, 1.89, 0.06);
  hood.scale.set(1, 1.05, 1.08);
  const tip = add(rig, new THREE.ConeGeometry(0.11, 0.3, 6), dark, 0, 1.97, 0.24);
  tip.rotation.x = 1.9;

  const staff = new THREE.Group();
  staff.position.set(0.5, 0, -0.16);
  rig.add(staff);
  add(staff, new THREE.CylinderGeometry(0.035, 0.045, 2.2, 6), wood, 0, 1.1, 0);
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI * 2 / 3;
    const prong = add(staff, new THREE.ConeGeometry(0.035, 0.26, 4), bone, Math.sin(a) * 0.11, 2.3, Math.cos(a) * 0.11);
    prong.rotation.set(-Math.cos(a) * 0.45, 0, Math.sin(a) * 0.45);
  }
  const orb = add(staff, new THREE.IcosahedronGeometry(0.12, 0), glow(0x7dffc0), 0, 2.36, 0);

  // While a spell is being cast the orb grows and takes the colour of its school.
  const ORB_IDLE = new THREE.Color(0x7dffc0), ORB_SHADOW = new THREE.Color(0xb07cff), ORB_FIRE = new THREE.Color(0xff9a3d);
  let stride = 0, casting = 0;
  function update(dt, time, moving, jumpHeight, school) {
    stride = moving ? stride + dt * 11 : 0;
    rig.position.y = jumpHeight + (moving ? Math.abs(Math.sin(stride)) * 0.06 : 0);
    rig.rotation.x = moving ? -0.07 : 0;
    staff.rotation.x = moving ? Math.sin(stride) * 0.1 : school ? -0.18 : 0;
    casting += ((school ? 1 : 0) - casting) * Math.min(1, dt * 10);
    orb.material.color.lerp(school === 'fire' ? ORB_FIRE : school ? ORB_SHADOW : ORB_IDLE, Math.min(1, dt * 12));
    orb.scale.setScalar(1 + Math.sin(time * (school ? 14 : 3)) * 0.12 + casting * 0.9);
    orb.rotation.y = time * 1.5;
  }

  // Where the orb is in the world (a beam starts here).
  function orbPosition(target) { return orb.getWorldPosition(target); }

  return { root: root, update: update, orbPosition: orbPosition };
}

// The training dummy: a straw-stuffed figure on a post, with a round target on its chest. Built facing +z.
export function makeDummy() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  body.scale.setScalar(1.25);
  root.add(body);
  root.add(groundShadow(1.4));

  const stone = flat(0x4b4656), wood = flat(0x6b4423), sack = flat(0xb0935a), sackLight = flat(0xc7ab70);
  const rope = flat(0x4a3a22), bone = flat(0xd9d2bf), white = flat(0xe9e4da), red = flat(0xb8322b);

  add(body, new THREE.CylinderGeometry(0.85, 1.0, 0.22, 8), stone, 0, 0.11, 0);
  add(body, new THREE.CylinderGeometry(0.12, 0.15, 2.2, 6), wood, 0, 1.3, 0);
  add(body, new THREE.BoxGeometry(1.9, 0.15, 0.15), wood, 0, 2.02, 0);
  add(body, new THREE.CylinderGeometry(0.42, 0.34, 0.95, 7), sack, 0, 1.72, 0);
  add(body, new THREE.CylinderGeometry(0.4, 0.4, 0.05, 7), rope, 0, 1.4, 0);
  add(body, new THREE.CylinderGeometry(0.44, 0.44, 0.05, 7), rope, 0, 2.12, 0);
  add(body, new THREE.IcosahedronGeometry(0.3, 0), sackLight, 0, 2.55, 0);
  [-1, 1].forEach(function (side) {
    add(body, new THREE.IcosahedronGeometry(0.17, 0), sack, side * 0.95, 2.02, 0);
    const horn = add(body, new THREE.ConeGeometry(0.07, 0.36, 5), bone, side * 0.24, 2.83, 0);
    horn.rotation.z = -side * 0.55;
  });
  [[0.42, 0.06, white], [0.29, 0.08, red], [0.13, 0.1, white]].forEach(function (ring) {
    const disc = add(body, new THREE.CylinderGeometry(ring[0], ring[0], ring[1], 14), ring[2], 0, 1.74, 0.43);
    disc.rotation.x = Math.PI / 2;
  });

  // Red circle on the ground: this is your target.
  const circle = new THREE.Mesh(
    new THREE.RingGeometry(1.45, 1.6, 40),
    new THREE.MeshBasicMaterial({ color: 0xd8443a, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })
  );
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.06;
  root.add(circle);

  // A hit makes the dummy rock back; at zero health it falls over until the next fight.
  let rock = 0, rockSpeed = 0, fallen = 0, dead = false;
  function hit(strength) { rockSpeed -= 1.6 * strength; }
  function setDead(value) { dead = value; circle.visible = !value; }
  function update(dt) {
    rockSpeed += (-rock * 140 - rockSpeed * 9) * dt;       // a damped spring
    rock += rockSpeed * dt;
    fallen += ((dead ? 1 : 0) - fallen) * Math.min(1, dt * 6);
    body.rotation.x = rock - fallen * 1.45;
  }

  return { root: root, radius: 1.2, hit: hit, setDead: setDead, update: update, chest: new THREE.Vector3(0, 2.2, 0), head: new THREE.Vector3(0, 3.1, 0) };
}

// A beam between two points, for channelled spells.
export function makeBeam() {
  const material = new THREE.MeshBasicMaterial({ color: 0x8dff9a, transparent: true, opacity: 0.75, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6, 1, true), material);
  mesh.visible = false;
  const up = new THREE.Vector3(0, 1, 0), dir = new THREE.Vector3();
  function set(from, to, time) {
    dir.subVectors(to, from);
    const length = dir.length();
    mesh.position.copy(from).addScaledVector(dir, 0.5);
    mesh.quaternion.setFromUnitVectors(up, dir.normalize());
    const pulse = 1 + Math.sin(time * 30) * 0.35;
    mesh.scale.set(pulse, length, pulse);
    mesh.visible = true;
  }
  return { mesh: mesh, set: set, hide: function () { mesh.visible = false; }, material: material };
}
