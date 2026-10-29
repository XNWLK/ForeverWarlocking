// The creatures of the Onyxia fight, made from simple shapes like everything else here (no game models):
// Onyxia herself, her whelps, the Onyxian Warder and the ghost tanks of the raid.
// Each one can stand in for a training dummy: root, radius, chest / head (where spells land and numbers float, in the
// model's own space), chestAt / headAt (the same in the room, kept up to date by place()), hit(), setDead(),
// setSelected(), update(dt, time). Models face -z, like the Warlock.
import * as THREE from 'three';
import { flat, glow, halo, groundShadow } from './kit.js';

const SCALE_DARK = 0x3a2e36, SCALE_MID = 0x54404a, BELLY = 0x7a5a48, MEMBRANE = 0x3a1618, HORN = 0xc8b48e, EYE = 0xffa040;

function mesh(geometry, material, parent, x, y, z) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x || 0, y || 0, z || 0);
  if (material.isMeshLambertMaterial) { m.castShadow = true; m.receiveShadow = true; }
  if (parent) parent.add(m);
  return m;
}
function joint(parent, x, y, z) { const g = new THREE.Group(); g.position.set(x || 0, y || 0, z || 0); parent.add(g); return g; }
// A bone from the joint's origin along +y (rotate the joint to point it).
function bone(parent, length, r0, r1, material, sides) {
  const m = mesh(new THREE.CylinderGeometry(r1, r0, length, sides || 7), material, parent, 0, length / 2, 0);
  return m;
}
function circleUnder(radius) {
  const circle = new THREE.Mesh(new THREE.RingGeometry(radius * 1.05, radius * 1.05 + Math.max(0.17, radius * 0.06), 64),
    new THREE.MeshBasicMaterial({ color: 0xe0483c, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  circle.rotation.x = -Math.PI / 2;
  circle.position.y = 0.07;
  return circle;
}
function approach(v, target, rate, dt) { return v + (target - v) * Math.min(1, rate * dt); }

// What every creature shares: where it is, the target circle, and keeping chestAt / headAt in the room.
function creature(root, radius, chest, head, ground) {
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

// ---------- Onyxia ----------
export function makeOnyxia() {
  const root = new THREE.Group(), ground = new THREE.Group(), lift = new THREE.Group();
  root.add(ground, lift);
  const shadow = groundShadow(7, 0.4);
  ground.add(shadow);
  const scales = flat(SCALE_DARK), mid = flat(SCALE_MID), belly = flat(BELLY), horn = flat(HORN);
  const membrane = new THREE.MeshLambertMaterial({ color: MEMBRANE, side: THREE.DoubleSide, flatShading: true });
  const eyes = glow(EYE);

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
    const shine = halo(EYE, 1.4, 0.55);
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

  const out = creature(root, 6.5, new THREE.Vector3(0, 5.2, 0), new THREE.Vector3(0, 11.5, 0), ground);
  lift.position.y = 0;
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

// ---------- an Onyxian Whelp ----------
const WHELP_GEO = {
  body: new THREE.SphereGeometry(1, 8, 6), head: new THREE.BoxGeometry(0.34, 0.28, 0.46), snout: new THREE.BoxGeometry(0.2, 0.16, 0.26),
  tail: new THREE.ConeGeometry(0.12, 1.0, 5), leg: new THREE.CylinderGeometry(0.05, 0.07, 0.36, 4), horn: new THREE.ConeGeometry(0.04, 0.2, 3),
  wing: (function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.15, 1.1, 0.1, 0.1, 0.35, 0, 0.45], 3));
    g.computeVertexNormals();
    return g;
  })()
};
export function makeWhelp() {
  const root = new THREE.Group(), ground = new THREE.Group(), lift = new THREE.Group();
  root.add(ground, lift);
  ground.add(groundShadow(0.7, 0.3));
  const dark = flat(0x1e1720), midM = flat(0x3a2a34), wingM = new THREE.MeshLambertMaterial({ color: 0x4a1c24, side: THREE.DoubleSide, flatShading: true });
  const body = joint(lift, 0, 0.55, 0);
  mesh(WHELP_GEO.body, dark, body).scale.set(0.32, 0.28, 0.55);
  const head = joint(body, 0, 0.22, -0.55);
  mesh(WHELP_GEO.head, dark, head);
  mesh(WHELP_GEO.snout, midM, head, 0, -0.03, -0.32);
  for (let s = -1; s <= 1; s += 2) {
    const h = mesh(WHELP_GEO.horn, midM, head, s * 0.1, 0.18, 0.1); h.rotation.x = -0.7;
    mesh(new THREE.SphereGeometry(0.035, 4, 3), glow(EYE), head, s * 0.12, 0.05, -0.2);
  }
  const tail = mesh(WHELP_GEO.tail, midM, body, 0, 0, 0.85);
  tail.rotation.x = Math.PI / 2 + 0.15;
  const legs = [];
  [[-0.18, -0.3], [0.18, -0.3], [-0.18, 0.3], [0.18, 0.3]].forEach(function (p, i) {
    const l = joint(body, p[0], -0.12, p[1]);
    mesh(WHELP_GEO.leg, midM, l, 0, -0.18, 0);
    legs.push({ j: l, phase: i % 3 ? Math.PI : 0 });
  });
  const wings = [-1, 1].map(function (s) {
    const w = joint(body, s * 0.18, 0.18, -0.1);
    const m = mesh(WHELP_GEO.wing, wingM, w);
    m.scale.x = s;
    return w;
  });
  let moving = false, phase = Math.random() * 6, lunge = 0, hitShake = 0, fallen = 0, fadeT = 0;
  function update(dt, time) {
    phase += dt * (moving ? 14 : 5);
    body.position.y = 0.55 + (moving ? Math.abs(Math.sin(phase)) * 0.12 : Math.sin(phase * 0.5) * 0.03);
    legs.forEach(function (l) { l.j.rotation.x = moving ? Math.sin(phase + l.phase) * 0.7 : 0; });
    wings.forEach(function (w, i) { w.rotation.z = (i ? -1 : 1) * (0.2 + Math.sin(time * (moving ? 18 : 6) + i) * (moving ? 0.6 : 0.25)); });
    lunge = Math.max(0, lunge - dt * 4);
    head.position.z = -0.55 - Math.sin(lunge * Math.PI) * 0.25;
    tail.rotation.z = Math.sin(time * 3 + phase) * 0.3;
    hitShake = Math.max(0, hitShake - dt * 4);
    body.rotation.z = hitShake * Math.sin(time * 50) * 0.2;
    fallen = approach(fallen, out.dead ? 1 : 0, 6, dt);
    body.rotation.z += fallen * 1.5;
    if (out.dead) { fadeT += dt; if (fadeT > 6) root.visible = false; } else fadeT = 0;
    if (out.selected) out.circle.material.opacity = 0.75 + Math.sin(time * 4) * 0.15;
  }
  const out = creature(root, 0.9, new THREE.Vector3(0, 0.6, 0), new THREE.Vector3(0, 1.1, 0), ground);
  out.update = update;
  out.hit = function (s) { hitShake = Math.min(1, hitShake + s * 0.5); };
  out.setDead = function (value) { out.dead = value; out.circle.visible = out.selected && !value; if (!value) { root.visible = true; fadeT = 0; } };
  out.setMoving = function (m) { moving = m; };
  out.attack = function () { lunge = 1; };
  return out;
}

// ---------- the Onyxian Warder ----------
export function makeWarder() {
  const root = new THREE.Group(), ground = new THREE.Group();
  root.add(ground);
  ground.add(groundShadow(1.3, 0.32));
  const skin = flat(0x7a2c20), plate = flat(0x2a1e1e), horn = flat(HORN), wingM = new THREE.MeshLambertMaterial({ color: 0x4a1c1c, side: THREE.DoubleSide, flatShading: true });
  const hips = joint(root, 0, 1.55, 0);
  const legs = [-1, 1].map(function (s) {
    const thigh = joint(hips, s * 0.38, 0, 0);
    thigh.rotation.x = Math.PI;
    bone(thigh, 0.85, 0.24, 0.2, skin);
    const shin = joint(thigh, 0, 0.85, 0);
    bone(shin, 0.8, 0.18, 0.14, plate);
    mesh(new THREE.BoxGeometry(0.3, 0.14, 0.5), plate, shin, 0, 0.82, -0.12);
    return { thigh: thigh, shin: shin, s: s };
  });
  const chest = joint(hips, 0, 0.1, 0);
  mesh(new THREE.BoxGeometry(0.95, 1.1, 0.6), skin, chest, 0, 0.6, 0);
  mesh(new THREE.BoxGeometry(1.05, 0.5, 0.68), plate, chest, 0, 0.95, 0);
  [-1, 1].forEach(function (s) {
    const pad = mesh(new THREE.ConeGeometry(0.3, 0.5, 4), plate, chest, s * 0.62, 1.2, 0); pad.rotation.z = -s * 0.6;
    const w = joint(chest, s * 0.3, 1.0, 0.3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, s * 1.4, 0.7, 0.4, s * 0.9, -0.6, 0.5, 0, 0, 0, s * 0.9, -0.6, 0.5, s * 0.2, -0.9, 0.2], 3));
    g.computeVertexNormals();
    mesh(g, wingM, w);
  });
  const headJ = joint(chest, 0, 1.3, -0.05);
  mesh(new THREE.BoxGeometry(0.45, 0.42, 0.55), skin, headJ, 0, 0.2, 0);
  mesh(new THREE.BoxGeometry(0.3, 0.24, 0.45), skin, headJ, 0, 0.12, -0.42);
  [-1, 1].forEach(function (s) {
    const h = mesh(new THREE.ConeGeometry(0.07, 0.55, 4), horn, headJ, s * 0.18, 0.5, 0.12); h.rotation.set(-0.8, 0, -s * 0.3);
    mesh(new THREE.SphereGeometry(0.05, 4, 3), glow(EYE), headJ, s * 0.14, 0.26, -0.3);
  });
  const arms = [-1, 1].map(function (s) {
    const sh = joint(chest, s * 0.6, 1.05, 0);
    sh.rotation.x = Math.PI;
    bone(sh, 0.7, 0.17, 0.14, skin);
    const el = joint(sh, 0, 0.7, 0);
    bone(el, 0.65, 0.14, 0.11, plate);
    return { sh: sh, el: el, s: s };
  });
  // A halberd in the right hand.
  const weapon = joint(arms[1].el, 0, 0.65, 0);
  const pole = mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.6, 5), flat(0x3a2a1a), weapon, 0, 0, 0);
  pole.rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.05, 0.5, 0.35), flat(0x9a9aa4), weapon, 0, 0.1, -1.2);
  const tail = mesh(new THREE.ConeGeometry(0.15, 1.2, 5), skin, hips, 0, -0.1, 0.6);
  tail.rotation.x = Math.PI / 2 + 0.5;
  let moving = false, phase = 0, swing = 0, nova = 0, hitShake = 0, fallen = 0;
  function update(dt, time) {
    phase += dt * (moving ? 8 : 0);
    legs.forEach(function (l) { const a = moving ? Math.sin(phase + (l.s > 0 ? Math.PI : 0)) * 0.6 : 0; l.thigh.rotation.x = Math.PI + a; l.shin.rotation.x = Math.max(0, -a) * 0.8; });
    swing = Math.max(0, swing - dt * 2.5); nova = Math.max(0, nova - dt * 1.5);
    arms[1].sh.rotation.x = Math.PI - 0.6 - Math.sin(swing * Math.PI) * 1.6 - nova * 1.2;
    arms[0].sh.rotation.x = Math.PI - 0.3 - nova * 2.2;
    arms[0].sh.rotation.z = -nova * 0.6;
    tail.rotation.z = Math.sin(time * 1.6) * 0.25;
    hitShake = Math.max(0, hitShake - dt * 4);
    fallen = approach(fallen, out.dead ? 1 : 0, 5, dt);
    hips.rotation.x = -fallen * 1.4;
    hips.position.y = 1.55 - fallen * 1.1;
    chest.rotation.z = hitShake * Math.sin(time * 45) * 0.08;
    if (out.selected) out.circle.material.opacity = 0.75 + Math.sin(time * 4) * 0.15;
  }
  const out = creature(root, 1.3, new THREE.Vector3(0, 2.3, 0), new THREE.Vector3(0, 3.6, 0), ground);
  out.update = update;
  out.hit = function (s) { hitShake = Math.min(1, hitShake + s * 0.4); };
  out.setDead = function (value) { out.dead = value; out.circle.visible = out.selected && !value; };
  out.setMoving = function (m) { moving = m; };
  out.attack = function () { swing = 1; };
  out.nova = function () { nova = 1; };
  return out;
}

// ---------- a ghost tank of the raid: a see-through warrior with sword and shield ----------
const GHOST_TANK = new THREE.MeshLambertMaterial({ color: 0xb8d4ff, emissive: 0x3a5a96, emissiveIntensity: 0.6, transparent: true, opacity: 0.32, depthWrite: false, flatShading: true });
export function makeGhostTank() {
  const root = new THREE.Group();
  const m = GHOST_TANK;
  const hips = joint(root, 0, 1.0, 0);
  const legs = [-1, 1].map(function (s) { const l = joint(hips, s * 0.2, 0, 0); l.rotation.x = Math.PI; bone(l, 1.0, 0.16, 0.12, m); return l; });
  const chest = joint(hips, 0, 0, 0);
  mesh(new THREE.BoxGeometry(0.7, 0.85, 0.42), m, chest, 0, 0.45, 0);
  mesh(new THREE.BoxGeometry(0.95, 0.25, 0.5), m, chest, 0, 0.85, 0);
  mesh(new THREE.BoxGeometry(0.34, 0.38, 0.36), m, chest, 0, 1.2, 0);
  const shieldArm = joint(chest, -0.5, 0.8, 0);
  const shield = mesh(new THREE.BoxGeometry(0.08, 0.95, 0.7), m, shieldArm, -0.08, -0.35, -0.25);
  void shield;
  const swordArm = joint(chest, 0.5, 0.8, 0);
  swordArm.rotation.x = Math.PI;
  bone(swordArm, 0.6, 0.1, 0.08, m);
  const sword = mesh(new THREE.BoxGeometry(0.06, 1.1, 0.12), m, swordArm, 0, 1.1, -0.1);
  void sword;
  let swing = 0, walk = 0, moving = false, knock = 0;
  const out = {
    root: root, x: 0, z: 0, yaw: 0,
    place: function (x, z, yaw) { out.x = x; out.z = z; if (yaw != null) out.yaw = yaw; root.position.set(x, 0, z); root.rotation.y = out.yaw; },
    update: function (dt, time) {
      walk += dt * (moving ? 9 : 0);
      legs.forEach(function (l, i) { l.rotation.x = Math.PI + (moving ? Math.sin(walk + i * Math.PI) * 0.6 : 0); });
      swing = Math.max(0, swing - dt * 2.2);
      swordArm.rotation.x = Math.PI - 0.5 - Math.sin(swing * Math.PI) * 1.9;
      shieldArm.rotation.x = -0.3 + Math.sin(time * 1.3) * 0.04;
      knock = Math.max(0, knock - dt * 1.5);
      hips.position.y = 1.0 + Math.sin(knock * Math.PI) * 1.2;
      chest.rotation.x = Math.sin(knock * Math.PI) * 0.5;
    },
    swing: function () { swing = 1; },
    knocked: function () { knock = 1; },
    setMoving: function (v) { moving = v; }
  };
  root.traverse(function (p) { if (p.isMesh) { p.castShadow = false; p.receiveShadow = false; } });
  return out;
}
