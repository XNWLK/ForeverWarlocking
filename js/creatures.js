// Creatures for boss fights, made from simple shapes like everything else here (no game models):
// the pieces every creature shares, a dragon (Onyxia is the default one), a giant, a demon, an elemental, and the see-through
// members of the ghost raid (tank, melee, healer, caster).
// A creature can stand in for a training dummy: root, radius, chest / head (where spells land and numbers float, in the
// model's own space), chestAt / headAt (the same in the room, kept up to date by place()), hit(), setDead(),
// setSelected(), update(dt, time), and place(x, z, yaw, y). Most also have setMoving(on), act(name, seconds) ('swing',
// 'cast', 'roar', 'stomp') and castFrom(into) (where their spells start). Models face -z, like the Warlock.
import * as THREE from 'three';
import { flat, glow, halo, groundShadow } from './kit.js';

export function mesh(geometry, material, parent, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x || 0, y || 0, z || 0);
  if (material.isMeshLambertMaterial) { m.castShadow = true; m.receiveShadow = true; }
  if (parent) parent.add(m);
  return m;
}
export function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }
// A bone from the joint's origin along +y (rotate the joint to point it).
export function bone(parent, length, r0, r1, material, sides) {
  const m = mesh(new THREE.CylinderGeometry(r1, r0, length, sides || 7), material, parent, 0, length / 2, 0);
  return m;
}
export function circleUnder(radius) {
  const circle = new THREE.Mesh(new THREE.RingGeometry(radius * 1.05, radius * 1.05 + Math.max(0.17, radius * 0.06), 64),
    new THREE.MeshBasicMaterial({ color: 0xe0483c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.07;
  return circle;
}
export function approach(v, target, rate, dt) { return v + (target - v) * Math.min(1, rate * dt); }

// What every creature shares: where it is, the target circle, and keeping chestAt / headAt in the room.
export function creature(root, radius, chest, head, ground) {
  const circle = circleUnder(radius);
  ground.add(circle);
  const out = {
    root: root, radius: radius, chest: chest, head: head,
    chestAt: new THREE.Vector3(), headAt: new THREE.Vector3(),
    x: 0, z: 0, y: 0, yaw: 0, selected: false, dead: false,
    place: function (x, z, yaw, y) {
      out.x = x; out.z = z; if (yaw != null) out.yaw = yaw; out.y = y || 0;
      root.position.set(x, 0, z);
      root.rotation.y = out.yaw;
      out.chestAt.set(x, chest.y + out.y, z);
      out.headAt.set(x, head.y + out.y, z);
    },
    setSelected: function (v) { out.selected = v; circle.visible = v && !out.dead; },
    circle: circle
  };
  circle.visible = false;
  return out;
}

// ---------- a dragon (Onyxia is the default one) ----------
// opts: { size (1 = Onyxia, 6.5 yards from her middle to her edge), colors: { dark, mid, belly, membrane, horn, eye } }.
// Onyxia's model is this with nothing changed.
const DRAGON = { dark: 0x3a2e36, mid: 0x54404a, belly: 0x7a5a48, membrane: 0x3a1618, horn: 0xc8b48e, eye: 0xffa040 };
export function makeDragon(opts) {
  const C = Object.assign({}, DRAGON, opts && opts.colors), size = (opts && opts.size) || 1;
  const root = new THREE.Group(), ground = new THREE.Group(), lift = new THREE.Group();
  root.add(ground, lift);
  const shadow = groundShadow(7, 0.4);
  ground.add(shadow);
  const scales = flat(C.dark), mid = flat(C.mid), belly = flat(C.belly), horn = flat(C.horn);
  const membrane = new THREE.MeshLambertMaterial({ color: C.membrane, side: THREE.DoubleSide, flatShading: true });
  const eyes = glow(C.eye);

  const body = joint(lift, 0, 4.2, 0);
  const torso = mesh(new THREE.SphereGeometry(1, 12, 9), scales, body);
  torso.scale.set(2.5, 2.2, 5.2);
  const chestPlate = mesh(new THREE.SphereGeometry(1, 10, 8), belly, body, 0, -0.8, -0.6);
  chestPlate.scale.set(2.0, 1.4, 4.4);
  for (let i = 0; i < 9; i++) {                          // the ridge along her back
    const spike = mesh(new THREE.ConeGeometry(0.32, 1.3 - Math.abs(i - 3) * 0.08, 4), mid, body, 0, 2.15 - Math.abs(i - 4) * 0.08, -3.6 + i * 0.95);
    spike.rotation.x = 0.5;
  }

  // Neck: five joints from the chest up and forward; the head at the end.
  const neck = [];
  let at = joint(body, 0, 1.0, -4.4);
  for (let i = 0; i < 5; i++) {
    neck.push(at);
    const seg = bone(at, 1.6, 0.95 - i * 0.1, 0.85 - i * 0.1, i % 2 ? scales : mid);
    const ridge = mesh(new THREE.ConeGeometry(0.2, 0.7, 4), mid, at, 0, 0.8, 0.75 - i * 0.05);
    ridge.rotation.x = 0.9;
    void seg;
    at = joint(at, 0, 1.6, 0);
  }
  const head = at;
  const skull = mesh(new THREE.BoxGeometry(1.5, 1.2, 2.0), scales, head, 0, 0.3, -0.5);
  const snout = mesh(new THREE.BoxGeometry(1.0, 0.7, 1.9), mid, head, 0, 0.25, -2.2);
  snout.rotation.x = 0.06;
  const jaw = joint(head, 0, -0.2, -0.6);
  mesh(new THREE.BoxGeometry(1.0, 0.35, 2.6), belly, jaw, 0, 0, -1.2);
  for (let s = -1; s <= 1; s += 2) {
    const h1 = joint(head, s * 0.55, 0.85, 0.2);
    h1.rotation.set(-1.0, 0, s * -0.35);
    bone(h1, 1.6, 0.22, 0.12, horn, 5);
    const h2 = joint(h1, 0, 1.6, 0);
    h2.rotation.x = -0.7;
    mesh(new THREE.ConeGeometry(0.12, 1.1, 5), horn, h2, 0, 0.55, 0);
    const brow = mesh(new THREE.ConeGeometry(0.14, 0.7, 4), horn, head, s * 0.75, 0.5, -0.9);
    brow.rotation.set(-1.2, 0, s * -0.9);
    const eye = mesh(new THREE.SphereGeometry(0.16, 6, 5), eyes, head, s * 0.66, 0.55, -1.25);
    const shine = halo(C.eye, 1.4, 0.55);
    shine.position.copy(eye.position);
    head.add(shine);
    mesh(new THREE.ConeGeometry(0.07, 0.32, 3), horn, head, s * 0.38, -0.12, -2.9).rotation.x = Math.PI;   // fangs
  }
  void skull;
  const mouth = joint(head, 0, 0.05, -3.2);              // where her fire comes from

  // Tail: eight joints back from the hips, thinner each time, spikes on top, a blade at the end.
  const tail = [];
  at = joint(body, 0, 0.2, 4.6);
  at.rotation.x = Math.PI / 2 + 0.25;
  for (let i = 0; i < 8; i++) {
    tail.push(at);
    bone(at, 1.7, 0.95 - i * 0.11, 0.85 - i * 0.11, i % 2 ? scales : mid);
    const sp = mesh(new THREE.ConeGeometry(0.16, 0.6, 4), mid, at, 0, 0.85, -(0.85 - i * 0.1));
    sp.rotation.x = -1.2;
    at = joint(at, 0, 1.7, 0);
  }
  const blade = mesh(new THREE.ConeGeometry(0.45, 1.6, 4), horn, at, 0, 0.6, 0);
  blade.scale.z = 0.3;

  // Legs: hips and shoulders, each with a knee and a foot with claws.
  const legs = [];
  [[-1.9, -0.9, -2.6, 0], [1.9, -0.9, -2.6, Math.PI], [-2.0, -0.6, 2.8, Math.PI], [2.0, -0.6, 2.8, 0]].forEach(function (p, i) {
    const hip = joint(body, p[0], p[1], p[2]);
    hip.rotation.x = Math.PI;                            // pointing down
    bone(hip, 2.2, 0.75, 0.55, scales);
    const knee = joint(hip, 0, 2.2, 0);
    bone(knee, 2.0, 0.5, 0.35, mid);
    const foot = joint(knee, 0, 2.0, 0);
    mesh(new THREE.BoxGeometry(0.9, 0.35, 1.2), scales, foot, 0, 0.1, -0.35);
    for (let c = -1; c <= 1; c++) { const claw = mesh(new THREE.ConeGeometry(0.1, 0.5, 3), horn, foot, c * 0.3, 0.1, -1.05); claw.rotation.x = -Math.PI / 2; }
    legs.push({ hip: hip, knee: knee, phase: p[3], front: i < 2 });
  });

  // Wings: an arm with three fingers and a skin between them, built once; folding turns and squeezes the whole wing.
  const wings = [];
  [-1, 1].forEach(function (s) {
    const pivot = joint(body, s * 1.9, 1.5, -2.2);
    const shape = joint(pivot);
    const P = { shoulder: [0, 0, 0], elbow: [5, 0.6, -0.6], wrist: [9, 1.0, 0.6], t1: [14.5, 0.6, 1.6], t2: [13, 0, 5.2], t3: [9.5, -0.2, 7.8], rear: [1.4, 0, 6.2] };
    const tri = [P.shoulder, P.elbow, P.wrist, P.wrist, P.t1, P.t2, P.wrist, P.t2, P.t3, P.wrist, P.t3, P.rear, P.wrist, P.rear, P.shoulder];
    const verts = [];
    tri.forEach(function (v) { verts.push(s * v[0], v[1], v[2]); });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    const skin = mesh(geo, membrane, shape);
    skin.castShadow = true;
    [['shoulder', 'elbow', 0.32], ['elbow', 'wrist', 0.26], ['wrist', 't1', 0.16], ['wrist', 't2', 0.14], ['wrist', 't3', 0.12]].forEach(function (b) {
      const a = P[b[0]], c = P[b[1]];
      const from = new THREE.Vector3(s * a[0], a[1], a[2]), to = new THREE.Vector3(s * c[0], c[1], c[2]);
      const len = from.distanceTo(to);
      const m = mesh(new THREE.CylinderGeometry(b[2] * 0.7, b[2], len, 5), mid, shape);
      m.position.copy(from).add(to).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
    });
    const claw = mesh(new THREE.ConeGeometry(0.15, 0.7, 4), horn, shape, s * P.wrist[0], P.wrist[1] + 0.3, P.wrist[2]);
    void claw;
    wings.push({ pivot: pivot, shape: shape, side: s });
  });

  // ---------- how she moves ----------
  // Smoothed values; the pose and any action set where they go.
  const v = { height: 2.0, neckLift: 0.1, headPitch: 0.3, jaw: 0, tailSwing: 0, tailLift: -0.1, fold: 0.15, raise: 0.2, flap: 0, lean: 0, roll: 0, fly: 0, crouch: 1 };
  let mode = 'sleep', action = null, actionT = 0, actionLen = 0, walkPhase = 0, speed = 0, flapPhase = 0, hitShake = 0, deadT = 0;
  const target = {};
  function pose() {
    // Resting values for each mode.
    if (mode === 'sleep') Object.assign(target, { height: 2.2, neckLift: -0.55, headPitch: 0.5, jaw: 0, tailSwing: 0.35, tailLift: -0.2, fold: 0.1, raise: 0.05, lean: 0.06, fly: 0, crouch: 1 });
    else if (mode === 'fly') Object.assign(target, { height: 4.2, neckLift: 0.15, headPitch: 0.25, jaw: 0, tailSwing: 0, tailLift: 0.1, fold: 1, raise: 0.1, lean: -0.08, fly: 1, crouch: 0 });
    else if (mode === 'dead') Object.assign(target, { height: 1.6, neckLift: -0.6, headPitch: 0.6, jaw: 0.4, tailSwing: 0.5, tailLift: -0.25, fold: 0.6, raise: -0.4, lean: 0.1, fly: 0, crouch: 1 });
    else Object.assign(target, { height: 4.2, neckLift: 0.3, headPitch: 0.15, jaw: 0, tailSwing: 0, tailLift: 0.0, fold: 0.2, raise: 0.25, lean: 0, fly: 0, crouch: 0 });
    if (mode === 'stand' && speed > 0.5) target.tailSwing = Math.sin(walkPhase * 0.5) * 0.15;
  }
  // An action bends the pose for a moment.
  function bend(t, p) {
    const k = t;                                         // 0..1 through the action
    if (action === 'breath') {                           // rears back, then breathes fire forward and down
      if (k < 0.55) { target.neckLift = 0.6; target.headPitch = -0.4; target.jaw = 0.2; }
      else { target.neckLift = 0.0; target.headPitch = 0.55; target.jaw = 1; }
    } else if (action === 'deep') { target.neckLift = -0.05; target.headPitch = 0.75; target.jaw = 1; }
    else if (action === 'roar') { target.neckLift = 0.75; target.headPitch = -0.7; target.jaw = k > 0.25 ? 1 : 0.3; }
    else if (action === 'tail') { target.tailSwing = Math.sin(k * Math.PI * 2) * 1.2; target.tailLift = 0.25; }
    else if (action === 'buffet') { target.fold = 1; target.raise = Math.sin(k * Math.PI) * 1.1; target.lean = 0.12; }
    else if (action === 'cleave' || action === 'knock') { target.neckLift = k < 0.4 ? 0.5 : -0.2; target.headPitch = k < 0.4 ? -0.2 : 0.5; target.jaw = k < 0.4 ? 0.6 : 0.2; }
    else if (action === 'fireball') { target.headPitch = k < 0.5 ? -0.2 : 0.5; target.jaw = 1; }
    void p;
  }
  function update(dt, time) {
    pose();
    if (action) {
      actionT += dt;
      bend(Math.min(1, actionT / actionLen));
      if (actionT >= actionLen) action = null;
    }
    const rate = action ? 9 : 3;
    Object.keys(target).forEach(function (k) { v[k] = approach(v[k], target[k], k === 'jaw' ? 12 : rate, dt); });
    if (mode === 'dead') deadT += dt;
    // The body.
    body.position.y = v.height + Math.sin(time * 1.4) * 0.05 * (1 - v.fly) + (mode === 'fly' ? Math.sin(time * 2.2) * 0.35 : 0);
    body.rotation.x = v.lean + (speed > 0.5 && mode === 'stand' ? Math.sin(walkPhase * 2) * 0.03 : 0);
    body.rotation.z = (mode === 'dead' ? Math.min(1, deadT * 0.8) * 0.9 : 0) + hitShake * Math.sin(time * 40) * 0.02;
    hitShake = Math.max(0, hitShake - dt * 3);
    // Neck and head.
    neck.forEach(function (j, i) {
      const base = i === 0 ? -0.75 : 0;                  // the neck leaves the chest leaning forward
      j.rotation.x = base + (-0.35 + v.neckLift * 0.5) * (i < 2 ? 1 : -0.4) + Math.sin(time * 1.1 + i * 0.6) * 0.03;
    });
    head.rotation.x = -1.2 + v.headPitch + 0.75;
    jaw.rotation.x = v.jaw * 0.6;
    // Tail.
    tail.forEach(function (j, i) {
      j.rotation.z = v.tailSwing * (0.12 + i * 0.04) + Math.sin(time * 1.3 + i * 0.7) * 0.04 * (1 - v.fly * 0.5);
      if (i > 0) j.rotation.x = v.tailLift * 0.18 + (mode === 'sleep' ? 0.08 : 0);
    });
    // Legs: a walk cycle while she moves, tucked in flight, folded under her asleep or dead.
    walkPhase += speed * dt * 0.55;
    legs.forEach(function (l) {
      const swing = speed > 0.5 && mode === 'stand' ? Math.sin(walkPhase + l.phase) * 0.45 : 0;
      const fold = Math.max(v.crouch * (mode === 'sleep' || mode === 'dead' ? 1 : 0), 0) * 1.2;
      l.hip.rotation.x = Math.PI + swing + v.fly * (l.front ? -0.9 : 0.9) + fold * (l.front ? -0.6 : 0.6);
      l.knee.rotation.x = (l.front ? 0.35 : -0.45) + Math.max(0, -swing) * 0.6 * (l.front ? 1 : -1) + v.fly * (l.front ? 1.3 : -1.4) + fold * (l.front ? 1.6 : -1.7);
    });
    // Wings: folded along her back, open in flight (flapping), a great beat for Wing Buffet.
    const flapping = mode === 'fly' ? 1 : action === 'buffet' ? 0.6 : 0;
    flapPhase += dt * (mode === 'fly' ? 3.4 : 6);
    wings.forEach(function (w) {
      const s = w.side, open = v.fold;
      w.shape.scale.set(0.35 + open * 0.65, 1, 0.45 + open * 0.55);
      w.pivot.rotation.z = s * (0.35 + (1 - open) * 0.55 - v.raise * 0.6 - flapping * Math.sin(flapPhase) * 0.55);
      w.pivot.rotation.y = s * -(1 - open) * 0.5;
      w.pivot.rotation.x = (1 - open) * -0.15;
    });
    shadow.scale.setScalar(1 - Math.min(0.6, out.y / 50));
    shadow.material.opacity = 0.4 - Math.min(0.3, out.y / 80);
    if (out.selected) out.circle.material.opacity = 0.75 + Math.sin(time * 4) * 0.15;
  }

  const out = creature(root, 6.5 * size, new THREE.Vector3(0, 5.2 * size, 0), new THREE.Vector3(0, 11.5 * size, 0), ground);
  lift.position.y = 0;
  if (size !== 1) { lift.scale.setScalar(size); ground.scale.setScalar(size); }
  const place = out.place;
  out.place = function (x, z, yaw, y) {
    place(x, z, yaw, y);
    lift.position.y = out.y;
    ground.visible = true;
  };
  out.update = update;
  out.hit = function (strength) { hitShake = Math.min(1, hitShake + strength * 0.15); };
  out.setDead = function (value) {
    out.dead = value;
    out.circle.visible = out.selected && !value;
    if (value) { mode = 'dead'; deadT = 0; action = null; }
    else if (mode === 'dead') mode = 'sleep';
  };
  out.setMode = function (m) { if (!out.dead) mode = m; };
  out.mode = function () { return mode; };
  out.act = function (name, seconds) { if (out.dead) return; action = name; actionT = 0; actionLen = seconds || 1; };
  out.setSpeed = function (s) { speed = s; };
  out.mouthAt = function (into) { root.updateMatrixWorld(true); return mouth.getWorldPosition(into); };
  out.flying = function () { return mode === 'fly'; };
  return out;
}

// ---------- ghost raid members: see-through tanks, melee, healers and casters ----------
// They stand around a boss so the room feels like a raid. place(x, z, yaw), update(dt, time), setMoving(on), and what
// each one does now and then: swing() (tank, melee), cast() (healer, caster), knocked() (thrown up by a boss).
// The tank is the ghost tank of the Onyxia fight, unchanged.
const GHOST = new THREE.MeshLambertMaterial({ color: 0xb8d4ff, emissive: 0x3a5a96, emissiveIntensity: 0.6, transparent: true, opacity: 0.32, depthWrite: false, flatShading: true });
const GHOST_GLOW = new THREE.MeshBasicMaterial({ color: 0xd8ecff, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending });
export function makeGhostRaider(role) {
  role = role || 'tank';
  const root = new THREE.Group();
  const m = GHOST;
  const hips = joint(root, 0, 1.0, 0);
  const legs = [-1, 1].map(function (s) { const l = joint(hips, s * 0.2, 0, 0); l.rotation.x = Math.PI; bone(l, 1.0, 0.16, 0.12, m); return l; });
  const chest = joint(hips, 0, 0, 0);
  let swordArm = null, shieldArm = null, offArm = null, glowBall = null;
  if (role === 'tank') {
    mesh(new THREE.BoxGeometry(0.7, 0.85, 0.42), m, chest, 0, 0.45, 0);
    mesh(new THREE.BoxGeometry(0.95, 0.25, 0.5), m, chest, 0, 0.85, 0);
    mesh(new THREE.BoxGeometry(0.34, 0.38, 0.36), m, chest, 0, 1.2, 0);
    shieldArm = joint(chest, -0.5, 0.8, 0);
    mesh(new THREE.BoxGeometry(0.08, 0.95, 0.7), m, shieldArm, -0.08, -0.35, -0.25);
    swordArm = joint(chest, 0.5, 0.8, 0);
    swordArm.rotation.x = Math.PI;
    bone(swordArm, 0.6, 0.1, 0.08, m);
    mesh(new THREE.BoxGeometry(0.06, 1.1, 0.12), m, swordArm, 0, 1.1, -0.1);
  } else {
    const robe = role === 'healer' || role === 'caster';
    mesh(new THREE.BoxGeometry(robe ? 0.55 : 0.6, 0.8, 0.36), m, chest, 0, 0.42, 0);
    if (robe) mesh(new THREE.CylinderGeometry(0.3, 0.5, 0.95, 8), m, hips, 0, -0.45, 0);       // a robe over the legs
    mesh(new THREE.SphereGeometry(0.2, 8, 6), m, chest, 0, 1.08, 0);
    if (robe) mesh(new THREE.ConeGeometry(0.22, 0.4, 8), m, chest, 0, 1.3, 0.04);            // a hood
    swordArm = joint(chest, 0.38, 0.75, 0);
    swordArm.rotation.x = Math.PI;
    bone(swordArm, 0.6, 0.09, 0.07, m);
    offArm = joint(chest, -0.38, 0.75, 0);
    offArm.rotation.x = Math.PI;
    bone(offArm, 0.6, 0.09, 0.07, m);
    if (role === 'melee') {                              // a blade in each hand
      mesh(new THREE.BoxGeometry(0.05, 0.6, 0.08), m, swordArm, 0, 0.85, -0.05);
      mesh(new THREE.BoxGeometry(0.05, 0.6, 0.08), m, offArm, 0, 0.85, -0.05);
    } else {                                             // a staff, and light in the hand while casting
      mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.7, 5), m, offArm, 0, 0.5, 0);
      glowBall = mesh(new THREE.SphereGeometry(0.13, 8, 6), GHOST_GLOW, swordArm, 0, 0.68, -0.04);
      glowBall.visible = false;
    }
  }
  let swing = 0, walk = 0, moving = false, knock = 0, cast = 0;
  const out = {
    root: root, role: role, x: 0, z: 0, yaw: 0,
    place: function (x, z, yaw) { out.x = x; out.z = z; if (yaw != null) out.yaw = yaw; root.position.set(x, 0, z); root.rotation.y = out.yaw; },
    update: function (dt, time) {
      walk += dt * (moving ? 9 : 0);
      legs.forEach(function (l, i) { l.rotation.x = Math.PI + (moving ? Math.sin(walk + i * Math.PI) * 0.6 : 0); });
      swing = Math.max(0, swing - dt * 2.2);
      cast = Math.max(0, cast - dt * 0.8);
      knock = Math.max(0, knock - dt * 1.5);
      hips.position.y = 1.0 + Math.sin(knock * Math.PI) * 1.2;
      chest.rotation.x = Math.sin(knock * Math.PI) * 0.5;
      if (role === 'tank') {
        swordArm.rotation.x = Math.PI - 0.5 - Math.sin(swing * Math.PI) * 1.9;
        shieldArm.rotation.x = -0.3 + Math.sin(time * 1.3) * 0.04;
      } else if (role === 'melee') {
        swordArm.rotation.x = Math.PI - 0.7 - Math.sin(swing * Math.PI) * 1.7;
        offArm.rotation.x = Math.PI - 0.7 - Math.sin(Math.max(0, swing - 0.3) * Math.PI) * 1.5;
        chest.rotation.x += 0.15;
      } else {
        const lift = Math.min(1, cast * 3);
        swordArm.rotation.x = Math.PI - 0.3 - lift * 1.6 + Math.sin(time * 6) * 0.05 * lift;
        offArm.rotation.x = Math.PI - 0.25;
        glowBall.visible = cast > 0.02;
        glowBall.scale.setScalar(0.6 + lift * 0.6 + Math.sin(time * 12) * 0.08);
      }
    },
    swing: function () { swing = 1; },
    cast: function () { cast = 1; },
    knocked: function () { knock = 1; },
    setMoving: function (v) { moving = v; }
  };
  root.traverse(function (p) { if (p.isMesh) { p.castShadow = false; p.receiveShadow = false; } });
  return out;
}
export function makeGhostTank() { return makeGhostRaider('tank'); }

// ---------- a body with two arms and two legs, for a giant or a demon ----------
// opts: { size (a Human is about 1), colors: { skin, armor, trim, eye }, horns, wings, tail, hooves, weapon: 'club' |
// 'sword' | 'axe' | 'none' }. Returns the parts so a model can add its own.
function humanoid(opts) {
  const C = opts.colors;
  const root = new THREE.Group(), ground = new THREE.Group(), body = new THREE.Group();
  root.add(ground, body);
  const skin = flat(C.skin), armor = flat(C.armor), trim = flat(C.trim);
  const hips = joint(body, 0, 1.5, 0);
  const legs = [-1, 1].map(function (s) {
    const thigh = joint(hips, s * 0.42, 0, 0);
    thigh.rotation.x = Math.PI;
    bone(thigh, 0.8, 0.3, 0.24, opts.hooves ? skin : armor);
    const shin = joint(thigh, 0, 0.8, 0);
    if (opts.hooves) shin.rotation.x = -0.6;                // a demon's legs bend back
    bone(shin, 0.78, 0.22, 0.15, skin);
    const foot = joint(shin, 0, 0.78, 0);
    if (opts.hooves) { foot.rotation.x = 0.6; mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.22, 6), trim, foot, 0, 0.05, 0); }
    else mesh(new THREE.BoxGeometry(0.32, 0.18, 0.55), armor, foot, 0, 0.04, -0.12);
    return { thigh: thigh, shin: shin, s: s };
  });
  const chest = joint(hips, 0, 0.05, 0);
  mesh(new THREE.BoxGeometry(1.15, 0.6, 0.65), skin, chest, 0, 0.3, 0);          // belly
  const torso = mesh(new THREE.BoxGeometry(1.45, 0.85, 0.8), armor, chest, 0, 0.95, 0);
  void torso;
  mesh(new THREE.BoxGeometry(1.55, 0.14, 0.86), trim, chest, 0, 0.58, 0);         // belt
  [-1, 1].forEach(function (s) {
    const pad = mesh(new THREE.SphereGeometry(0.36, 8, 6), armor, chest, s * 0.86, 1.36, 0);
    pad.scale.set(1, 0.7, 1.1);
    const spike = mesh(new THREE.ConeGeometry(0.1, 0.42, 5), trim, chest, s * 0.98, 1.62, 0);
    spike.rotation.z = -s * 0.45;
  });
  const neck = joint(chest, 0, 1.42, 0);
  const head = joint(neck, 0, 0.12, 0);
  mesh(new THREE.BoxGeometry(0.62, 0.62, 0.62), skin, head, 0, 0.28, 0);
  mesh(new THREE.BoxGeometry(0.5, 0.22, 0.32), skin, head, 0, 0.08, -0.3);        // jaw
  const eyes = glow(C.eye);
  [-1, 1].forEach(function (s) {
    mesh(new THREE.SphereGeometry(0.06, 5, 4), eyes, head, s * 0.15, 0.36, -0.32);
    if (opts.horns) {
      const h1 = joint(head, s * 0.26, 0.5, 0);
      h1.rotation.set(-0.5, 0, -s * 0.9);
      bone(h1, 0.55, 0.1, 0.06, trim, 5);
      const h2 = joint(h1, 0, 0.55, 0);
      h2.rotation.z = s * 1.3;
      mesh(new THREE.ConeGeometry(0.06, 0.4, 5), trim, h2, 0, 0.2, 0);
    }
  });
  const arms = [-1, 1].map(function (s) {
    const sh = joint(chest, s * 0.92, 1.25, 0);
    sh.rotation.x = Math.PI;
    sh.rotation.z = s * 0.12;
    bone(sh, 0.75, 0.22, 0.18, skin);
    const el = joint(sh, 0, 0.75, 0);
    bone(el, 0.7, 0.18, 0.14, armor);
    const hand = joint(el, 0, 0.74, 0);
    mesh(new THREE.SphereGeometry(0.17, 6, 5), skin, hand, 0, 0.05, 0);
    return { sh: sh, el: el, hand: hand, s: s };
  });
  // The weapon in the right hand.
  const grip = joint(arms[1].hand, 0, 0.08, 0);
  if (opts.weapon === 'club') {
    mesh(new THREE.CylinderGeometry(0.07, 0.09, 1.0, 6), flat(0x4a3424), grip, 0, 0.5, 0);
    mesh(new THREE.CylinderGeometry(0.26, 0.16, 0.9, 7), flat(0x5a4030), grip, 0, 1.3, 0);
  } else if (opts.weapon === 'sword') {
    mesh(new THREE.BoxGeometry(0.1, 0.32, 0.1), trim, grip, 0, 0.16, 0);
    mesh(new THREE.BoxGeometry(0.5, 0.08, 0.14), trim, grip, 0, 0.36, 0);
    mesh(new THREE.BoxGeometry(0.16, 1.7, 0.05), flat(0xb8bcc8), grip, 0, 1.25, 0);
  } else if (opts.weapon === 'axe') {
    mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), flat(0x3a2a1a), grip, 0, 0.8, 0);
    const blade = mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.06, 12, 1, false, 0, Math.PI), flat(0xa0a4b0), grip, 0.05, 1.45, 0);
    blade.rotation.set(Math.PI / 2, 0, Math.PI / 2);
  }
  let tail = null;
  if (opts.tail) {
    tail = joint(hips, 0, -0.1, 0.35);
    tail.rotation.x = Math.PI / 2 + 0.6;
    bone(tail, 1.1, 0.13, 0.05, skin);
  }
  const wings = [];
  if (opts.wings) {
    const membrane = new THREE.MeshLambertMaterial({ color: C.wing || C.armor, side: THREE.DoubleSide, flatShading: true });
    [-1, 1].forEach(function (s) {
      const w = joint(chest, s * 0.35, 1.2, 0.35);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s * 2.1, 1.1, 0.5, s * 1.6, -0.9, 0.7, 0, 0, 0, s * 1.6, -0.9, 0.7, s * 0.4, -1.3, 0.3], 3));
      g.computeVertexNormals();
      mesh(g, membrane, w);
      wings.push({ j: w, s: s });
    });
  }
  return { root: root, ground: ground, body: body, hips: hips, legs: legs, chest: chest, neck: neck, head: head, arms: arms, grip: grip, tail: tail, wings: wings };
}

// How a humanoid moves: a walk, an idle sway, a swing, a cast (both hands up), a roar, a stomp, a flinch, a fall.
function animateHumanoid(p, out, height) {
  let moving = false, phase = 0, action = null, actionT = 0, actionLen = 1, hitShake = 0, fallen = 0, fadeT = 0;
  out.update = function (dt, time) {
    phase += dt * (moving ? 6 : 0);
    const k = action ? Math.min(1, actionT / actionLen) : 0;
    if (action) { actionT += dt; if (actionT >= actionLen) action = null; }
    p.legs.forEach(function (l) { const a = moving ? Math.sin(phase + (l.s > 0 ? Math.PI : 0)) * 0.55 : 0; l.thigh.rotation.x = Math.PI + a; });
    p.body.position.y = moving ? Math.abs(Math.sin(phase)) * 0.08 : Math.sin(time * 1.2) * 0.03;
    const swing = action === 'swing' ? Math.sin(k * Math.PI) : 0, cast = action === 'cast' ? Math.sin(Math.min(1, k * 1.4) * Math.PI / 2) * (k < 0.85 ? 1 : (1 - k) / 0.15) : 0;
    const roar = action === 'roar' ? Math.sin(k * Math.PI) : 0, stomp = action === 'stomp' ? Math.sin(k * Math.PI) : 0;
    p.arms[1].sh.rotation.x = Math.PI - 0.25 - swing * 2.4 - cast * 2.6 - roar * 0.8;
    p.arms[0].sh.rotation.x = Math.PI - 0.15 - cast * 2.6 - roar * 0.8 + (moving ? Math.sin(phase) * 0.3 : 0);
    p.arms[1].el.rotation.x = -0.3 - swing * 0.5;
    p.arms[0].el.rotation.x = -0.2;
    p.chest.rotation.x = swing * 0.35 - roar * 0.25 + stomp * 0.2;
    p.head.rotation.x = -roar * 0.5;
    p.legs[1].thigh.rotation.x -= stomp * 0.9;
    p.hips.position.y = 1.5 - stomp * 0.15;
    if (p.tail) p.tail.rotation.z = Math.sin(time * 1.7) * 0.35;
    p.wings.forEach(function (w) { w.j.rotation.y = w.s * (0.3 + Math.sin(time * 2) * 0.12 + roar * 0.5); });
    hitShake = Math.max(0, hitShake - dt * 4);
    p.chest.rotation.z = hitShake * Math.sin(time * 45) * 0.08;
    fallen = approach(fallen, out.dead ? 1 : 0, 4, dt);
    p.hips.rotation.x = -fallen * 1.4;
    p.hips.position.y -= fallen * 1.0;
    if (out.selected) out.circle.material.opacity = 0.75 + Math.sin(time * 4) * 0.15;
    if (out.dead && out.fades) { fadeT += dt; if (fadeT > 6) out.root.visible = false; } else fadeT = 0;
  };
  out.hit = function (s) { hitShake = Math.min(1, hitShake + s * 0.3); };
  out.setDead = function (value) { out.dead = value; out.circle.visible = out.selected && !value; if (!value) { out.root.visible = true; fadeT = 0; } if (value) action = null; };
  out.setMoving = function (m) { moving = m; };
  out.isMoving = function () { return moving; };
  out.act = function (name, seconds) { if (out.dead) return; action = name; actionT = 0; actionLen = seconds || 1; };
  out.attack = function () { out.act('swing', 0.7); };
  // Where its spells start: the right hand (in the room).
  out.castFrom = function (into) { out.root.updateMatrixWorld(true); return p.arms[1].hand.getWorldPosition(into); };
  void height;
}

// ---------- a giant: a big brute with a weapon ----------
// opts: { size (2.5), colors: { skin, armor, trim, eye }, weapon ('club'), horns (false), name }
export function makeGiant(opts) {
  opts = Object.assign({ size: 2.5, weapon: 'club', horns: false }, opts || {});
  opts.colors = Object.assign({ skin: 0x7a6a5a, armor: 0x4a3a30, trim: 0x8a7a5a, eye: 0xffd070 }, opts.colors);
  const p = humanoid(opts), s = opts.size;
  p.body.scale.setScalar(s);
  p.ground.add(groundShadow(1.1 * s, 0.35));
  const out = creature(p.root, 1.0 * s, new THREE.Vector3(0, 2.0 * s, 0), new THREE.Vector3(0, 3.2 * s, 0), p.ground);
  animateHumanoid(p, out, 3.2 * s);
  return out;
}

// ---------- a demon: horns, hooves, wings and a tail, fel eyes ----------
// opts: { size (2), colors: { skin, armor, trim, eye, wing }, wings (true), weapon ('sword') }
export function makeDemon(opts) {
  opts = Object.assign({ size: 2, weapon: 'sword', wings: true }, opts || {});
  opts.horns = true; opts.tail = true; opts.hooves = true;
  opts.colors = Object.assign({ skin: 0x8a2a24, armor: 0x2a1a1e, trim: 0x6a5a40, eye: 0x7aff4a, wing: 0x3a1218 }, opts.colors);
  const p = humanoid(opts), s = opts.size;
  p.body.scale.setScalar(s);
  p.ground.add(groundShadow(1.0 * s, 0.35));
  // A faint fel glow around it.
  const aura = halo(opts.colors.eye, 3.2 * s, 0.12);
  aura.position.y = 1.8 * s;
  p.root.add(aura);
  const out = creature(p.root, 0.95 * s, new THREE.Vector3(0, 2.0 * s, 0), new THREE.Vector3(0, 3.3 * s, 0), p.ground);
  animateHumanoid(p, out, 3.3 * s);
  return out;
}

// ---------- an elemental: a floating heart with pieces turning around it ----------
// opts: { kind: 'fire' | 'water' | 'earth' | 'air' | 'shadow', size (2) }
const ELEMENTS = {
  fire: { core: 0xffb040, piece: 0xff5a14, glow: 0xff7a1f, shape: 'cone' },
  water: { core: 0x9adcff, piece: 0x3a8adf, glow: 0x5ab4ff, shape: 'ball' },
  earth: { core: 0xc8a070, piece: 0x5a4a3a, glow: 0xa08050, shape: 'rock' },
  air: { core: 0xe8f4ff, piece: 0xb8d0e8, glow: 0xd0e8ff, shape: 'shard' },
  shadow: { core: 0xb38aff, piece: 0x2a1a3a, glow: 0x7a4aff, shape: 'shard' }
};
export function makeElemental(opts) {
  opts = Object.assign({ kind: 'fire', size: 2 }, opts || {});
  const E = ELEMENTS[opts.kind] || ELEMENTS.fire, s = opts.size;
  const root = new THREE.Group(), ground = new THREE.Group(), body = new THREE.Group();
  root.add(ground, body);
  ground.add(groundShadow(1.1 * s, 0.3));
  body.scale.setScalar(s);
  const heart = mesh(new THREE.IcosahedronGeometry(0.55, 1), glow(E.core), body, 0, 1.9, 0);
  const shine = halo(E.glow, 4, 0.5);
  shine.position.y = 1.9;
  body.add(shine);
  const pieceMat = E.shape === 'ball' ? new THREE.MeshLambertMaterial({ color: E.piece, transparent: true, opacity: 0.8, flatShading: true }) : flat(E.piece, { emissive: E.glow, emissiveIntensity: 0.25 });
  const geo = E.shape === 'cone' ? new THREE.ConeGeometry(0.22, 0.7, 5) : E.shape === 'ball' ? new THREE.SphereGeometry(0.28, 8, 6) :
              E.shape === 'rock' ? new THREE.DodecahedronGeometry(0.34, 0) : new THREE.OctahedronGeometry(0.26, 0);
  const pieces = [];
  for (let i = 0; i < 14; i++) {
    const m = mesh(geo, pieceMat, body);
    pieces.push({ m: m, ring: i % 3, a: i / 14 * Math.PI * 2 * 3, speed: 0.6 + (i % 4) * 0.25, r: 0.85 + (i % 3) * 0.35, y: 0.9 + (i % 5) * 0.4 });
  }
  // Arms: two clusters that reach forward to cast.
  const hands = [-1, 1].map(function (side) { const j = joint(body, side * 1.2, 2.0, -0.3); mesh(geo, pieceMat, j); mesh(geo, pieceMat, j, 0, -0.35, 0); return j; });
  let action = null, actionT = 0, actionLen = 1, hitShake = 0, fallen = 0, moving = false, fadeT = 0;
  const out = creature(root, 1.0 * s, new THREE.Vector3(0, 1.9 * s, 0), new THREE.Vector3(0, 3.0 * s, 0), ground);
  out.update = function (dt, time) {
    const k = action ? Math.min(1, actionT / actionLen) : 0;
    if (action) { actionT += dt; if (actionT >= actionLen) action = null; }
    const cast = action === 'cast' || action === 'swing' ? Math.sin(k * Math.PI) : 0, roar = action === 'roar' || action === 'stomp' ? Math.sin(k * Math.PI) : 0;
    fallen = approach(fallen, out.dead ? 1 : 0, 3, dt);
    const spin = (1 - fallen) * (1 + roar * 2);
    pieces.forEach(function (p, i) {
      p.a += dt * p.speed * spin * (p.ring === 1 ? -1 : 1);
      const r = p.r * (1 + roar * 0.5) * (1 - fallen * 0.3);
      p.m.position.set(Math.cos(p.a) * r, p.y * (1 - fallen * 0.85) + Math.sin(time * 2 + i) * 0.08, Math.sin(p.a) * r);
      p.m.rotation.set(time * p.speed, p.a, 0);
    });
    heart.position.y = 1.9 - fallen * 1.5 + Math.sin(time * 1.5) * 0.12;
    heart.scale.setScalar(1 + Math.sin(time * 5) * 0.06 + cast * 0.3);
    shine.position.y = heart.position.y;
    shine.material.opacity = (0.5 + cast * 0.4) * (1 - fallen * 0.8);
    hands.forEach(function (h, i) { h.position.z = -0.3 - cast * 0.8; h.position.y = 2.0 + cast * 0.5 - fallen * 1.6 + Math.sin(time * 2 + i * 2) * 0.1; });
    body.position.y = moving ? Math.sin(time * 6) * 0.06 : 0;
    hitShake = Math.max(0, hitShake - dt * 4);
    body.rotation.z = hitShake * Math.sin(time * 40) * 0.06;
    if (out.selected) out.circle.material.opacity = 0.75 + Math.sin(time * 4) * 0.15;
    if (out.dead && out.fades) { fadeT += dt; if (fadeT > 6) root.visible = false; } else fadeT = 0;
  };
  out.hit = function (v) { hitShake = Math.min(1, hitShake + v * 0.3); };
  out.setDead = function (value) { out.dead = value; out.circle.visible = out.selected && !value; if (value) action = null; else { root.visible = true; fadeT = 0; } };
  out.setMoving = function (m) { moving = m; };
  out.isMoving = function () { return moving; };
  out.act = function (name, seconds) { if (out.dead) return; action = name; actionT = 0; actionLen = seconds || 1; };
  out.attack = function () { out.act('swing', 0.6); };
  out.castFrom = function (into) { root.updateMatrixWorld(true); return heart.getWorldPosition(into); };
  return out;
}
