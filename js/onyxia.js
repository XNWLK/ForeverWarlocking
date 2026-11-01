// The creatures of the Onyxia fight: Onyxia herself (the default dragon of js/creatures.js), her whelps and the
// Onyxian Warder. The ghost tanks are the tanks of the ghost raid (js/creatures.js).
import * as THREE from 'three';
import { flat, glow, groundShadow } from './kit.js';
import { mesh, joint, bone, approach, creature, makeDragon } from './creatures.js';

const HORN = 0xc8b48e, EYE = 0xffa040;

export function makeOnyxia() { return makeDragon(); }

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
