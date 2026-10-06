// Spell animations. Every spell has its own look: what gathers while you cast, what flies, what happens where it
// lands, and what hangs on the dummy while a DoT or curse is on it. Looks only - when damage happens is decided in
// combat.js. One unit is one yard.
import * as THREE from 'three';
import { light, halo, canvasTexture } from './kit.js';

const BALL = new THREE.IcosahedronGeometry(1, 1);
const SHARD = new THREE.IcosahedronGeometry(1, 0);
const RING = new THREE.RingGeometry(0.82, 1, 40);
const THIN_RING = new THREE.RingGeometry(0.93, 1, 48);
const FLAME = new THREE.ConeGeometry(0.5, 1, 5);
const SLASH = new THREE.PlaneGeometry(1, 0.12);
const BEAM = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const STRAW = new THREE.BoxGeometry(0.03, 0.22, 0.03);

// How each spell looks. cast = colour of what gathers at the staff and of the circle at your feet; bolt = it flies
// to the target; land / apply / tick = what plays on the target when it hits, is put on, or ticks.
export const SPELL_FX = {
  shadowBolt:      { cast: 0xa06bff, bolt: { style: 'shadow', color: 0x8a4cff, core: 0x1c0a38, size: 0.34, speed: 40 }, land: 'shadowHit' },
  soulFire:        { cast: 0xff8a2a, bolt: { style: 'fire', color: 0xff6a1a, core: 0xfff0b0, size: 0.6, speed: 32 }, land: 'explosion' },
  incinerate:      { cast: 0xffa53a, bolt: { style: 'fire', color: 0xffa53a, core: 0xfff3c4, size: 0.3, speed: 44 }, land: 'fireHit' },
  deathCoil:       { cast: 0x6dff8f, bolt: { style: 'coil', color: 0x58e06f, core: 0xe8ffe0, size: 0.34, speed: 28 }, land: 'coilHit' },
  searingPain:     { cast: 0xff8a2a, land: 'sear' },
  conflagrate:     { cast: 0xff6a1a, land: 'explosion' },
  shadowburn:      { cast: 0x7a3cff, land: 'implode' },
  immolate:        { cast: 0xff8a2a, land: 'eruption', tick: 'burn' },
  corruption:      { cast: 0x9a4cff, apply: 'smoke', tick: 'rot' },
  baneOfAgony:     { cast: 0xc04cff, apply: 'sigil', color: 0xc04cff, tick: 'rot' },
  baneOfDoom:      { cast: 0xff3355, apply: 'sigil', color: 0xff3355, tick: 'doom' },
  curseOfElements: { cast: 0x7d6bff, apply: 'curse' },
  siphonLife:      { cast: 0x6dff8f, apply: 'siphon', tick: 'leech' },
  drainLife:       { cast: 0x8dff9a, tick: 'leech' },
  wrack:           { cast: 0xb07cff, tick: 'wrack' },
  lifeTap:         { cast: 0xff4a5a },
  baneOfHavoc:     { cast: 0xff5ca8, apply: 'sigil', color: 0xff5ca8 },
  rainOfFire:      { cast: 0xff8a2a, tick: 'scorch' },
  hellfire:        { cast: 0xff5a1a, tick: 'scorch' },
  'pet:firebolt':  { bolt: { style: 'fire', color: 0xff8a2a, core: 0xfff0b0, size: 0.2, speed: 40 }, land: 'emberHit' },
  'pet:lashOfPain': { land: 'lash' },
  'pet:melee':     { land: 'slash' },
  'pet:brand':     { land: 'brand' }
};

export function createEffects(scene) {
  const live = [];                 // short-lived things: { object, materials, update(dt) -> true when finished }
  const group = new THREE.Group();
  scene.add(group);

  function spawn(object, materials, update) {
    group.add(object);
    live.push({ object: object, materials: materials, update: update });
    return object;
  }
  function later(seconds, fn) {
    let left = seconds;
    live.push({ object: null, materials: [], update: function (dt) { left -= dt; if (left > 0) return false; fn(); return true; } });
  }

  // Three lights that flash where something big lands (always in the scene, dark when idle).
  const flashes = [0, 1, 2].map(function () { const l = new THREE.PointLight(0xffffff, 0, 30, 1.6); scene.add(l); return { lamp: l, left: 0, life: 1, peak: 0 }; });
  let nextFlash = 0;
  function flash(at, color, strength) {
    const f = flashes[nextFlash++ % flashes.length];
    f.lamp.color.set(color); f.lamp.position.copy(at); f.lamp.position.y += 0.6;
    f.peak = strength; f.life = f.left = 0.28;
  }

  // ---------- the pieces ----------
  // A ball of light that swells and fades.
  function ball(at, color, size, life) {
    let age = 0;
    const material = light(color, 0.9), mesh = new THREE.Mesh(BALL, material);
    mesh.position.copy(at);
    spawn(mesh, [material], function (dt) {
      age += dt;
      const k = age / life;
      mesh.scale.setScalar(size * (0.25 + 0.75 * Math.sqrt(k)));
      material.opacity = 0.9 * (1 - k) * (1 - k);
      return k >= 1;
    });
  }
  // A flat ring that grows (or, with from > to, closes in). Lies on the floor unless `upright`.
  function ring(at, color, from, to, life, thin, tilt) {
    let age = 0;
    const material = light(color, 0.9), mesh = new THREE.Mesh(thin ? THIN_RING : RING, material);
    mesh.position.copy(at);
    mesh.rotation.x = tilt == null ? -Math.PI / 2 : tilt;
    spawn(mesh, [material], function (dt) {
      age += dt;
      const k = age / life;
      mesh.scale.setScalar(from + (to - from) * (1 - (1 - k) * (1 - k)));
      material.opacity = 0.9 * (1 - k);
      return k >= 1;
    });
    return mesh;
  }
  // Shards thrown outward that fall and fade.
  function sparks(at, color, count, power) {
    for (let i = 0; i < count; i++) {
      const life = 0.35 + Math.random() * 0.4;
      const vx = (Math.random() - 0.5) * 7 * power, vz = (Math.random() - 0.5) * 7 * power;
      let vy = 1.5 + Math.random() * 4.5 * power, age = 0;
      const material = light(color, 1), mesh = new THREE.Mesh(SHARD, material);
      mesh.position.copy(at);
      mesh.scale.setScalar(0.05 + Math.random() * 0.07);
      spawn(mesh, [material], function (dt) {
        age += dt;
        vy -= 12 * dt;
        mesh.position.x += vx * dt; mesh.position.y += vy * dt; mesh.position.z += vz * dt;
        mesh.rotation.x += dt * 9;
        material.opacity = 1 - age / life;
        return age >= life;
      });
    }
  }
  // A soft puff that drifts (smoke, a lick of flame, a wisp).
  function puff(at, color, size, life, vx, vy, vz, grow) {
    let age = 0;
    const sprite = halo(color, size, 0.8);
    sprite.position.copy(at);
    spawn(sprite, [sprite.material], function (dt) {
      age += dt;
      const k = age / life;
      sprite.position.x += vx * dt; sprite.position.y += vy * dt; sprite.position.z += vz * dt;
      sprite.scale.setScalar(size * (1 + (grow || 0) * k));
      sprite.material.opacity = 0.8 * (1 - k);
      return k >= 1;
    });
  }
  // Flames that shoot up from a spot and die down.
  function column(at, color, core, height, width, life) {
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, r = i ? width : 0, tall = height * (i ? 0.6 + Math.random() * 0.35 : 1), wait = Math.random() * 0.08;
      let age = -wait;
      const material = light(i % 2 ? color : core, 0.85), mesh = new THREE.Mesh(FLAME, material);
      mesh.position.set(at.x + Math.sin(a) * r, at.y, at.z + Math.cos(a) * r);
      mesh.scale.set(0.001, 0.001, 0.001);
      spawn(mesh, [material], function (dt) {
        age += dt;
        if (age < 0) return false;
        const k = age / life, up = Math.sin(Math.min(1, k * 2.2) * Math.PI / 2);
        mesh.scale.set(width * 1.5 * (1 - k * 0.6), tall * up, width * 1.5 * (1 - k * 0.6));
        mesh.position.y = at.y + tall * up * 0.5;
        material.opacity = 0.85 * (1 - k * k);
        return k >= 1;
      });
    }
  }
  // Small lights that travel from one place to another on a curved path (life being drawn, a soul returning).
  function orbs(from, to, color, count, life) {
    for (let i = 0; i < count; i++) {
      const a = from.clone(), b = to.clone(), side = (Math.random() - 0.5) * 3, lift = 0.6 + Math.random() * 1.4, wait = i * 0.07;
      let age = -wait;
      const sprite = halo(color, 0.55, 0.95);
      sprite.position.copy(a);
      sprite.visible = false;
      spawn(sprite, [sprite.material], function (dt) {
        age += dt;
        if (age < 0) return false;
        sprite.visible = true;
        const k = age / life, bow = Math.sin(k * Math.PI);
        sprite.position.lerpVectors(a, b, k * k * (3 - 2 * k));
        sprite.position.y += bow * lift; sprite.position.x += bow * side * 0.5;
        sprite.scale.setScalar(0.55 * (1 - k * 0.5));
        return k >= 1;
      });
    }
  }
  // A sigil that drops from above onto the target and breaks open.
  function sigilDrop(at, color, size) {
    const mesh = ring(new THREE.Vector3(at.x, at.y + 4, at.z), color, size, size, 0.34, false);
    const start = at.y + 4;
    let age = 0;
    live.push({ object: null, materials: [], update: function (dt) { age += dt; mesh.position.y = start - 4 * Math.min(1, (age / 0.3) * (age / 0.3)); mesh.rotation.z = age * 9; return age >= 0.34; } });
    later(0.3, function () { ring(at, color, size, size * 2.4, 0.4, true); ball(at, color, size * 1.2, 0.3); flash(at, color, 60); });
  }
  // A short bright stroke through the target (a lash, a claw, a flame cutting across).
  function stroke(at, color, length, turn, life) {
    let age = 0;
    const material = light(color, 1), mesh = new THREE.Mesh(SLASH, material);
    mesh.position.copy(at);
    mesh.rotation.z = turn;
    spawn(mesh, [material], function (dt) {
      age += dt;
      const k = age / life;
      mesh.scale.set(length * (0.3 + 1.2 * k), 1 + 2 * (1 - k), 1);
      mesh.lookAt(lookAt);
      mesh.rotateZ(turn);
      material.opacity = 1 - k;
      return k >= 1;
    });
  }
  const lookAt = new THREE.Vector3();      // where the camera is (strokes face it); set every picture
  // A thin line of light from your staff to the target that is gone in a blink: what an instant spell looks like on
  // its way (spells that fly as a bolt do not need it).
  const UP = new THREE.Vector3(0, 1, 0), along = new THREE.Vector3();
  function streak(from, to, color) {
    let age = 0;
    const life = 0.2, material = light(color, 0.9), coreMaterial = light(0xffffff, 0.9);
    const mesh = new THREE.Mesh(BEAM, material), core = new THREE.Mesh(BEAM, coreMaterial), holder = new THREE.Group();
    const a = from.clone(), b = to.clone();
    along.subVectors(b, a);
    const length = along.length();
    holder.position.copy(a);
    holder.quaternion.setFromUnitVectors(UP, along.normalize());
    holder.add(mesh, core);
    spawn(holder, [material, coreMaterial], function (dt) {
      age += dt;
      const k = age / life, lead = Math.min(1, k * 2.5), tail = Math.max(0, k * 1.6 - 0.6);      // the line runs out to the target, then its tail follows
      holder.position.lerpVectors(a, b, (lead + tail) / 2);
      mesh.scale.set(0.09 * (1 - k * 0.6), Math.max(0.01, length * (lead - tail)), 0.09 * (1 - k * 0.6));
      core.scale.set(0.03, Math.max(0.01, length * (lead - tail)), 0.03);
      material.opacity = 0.75 * (1 - k * k);
      coreMaterial.opacity = 0.9 * (1 - k);
      return k >= 1;
    });
    puff(a, color, 0.9, 0.22, 0, 0.3, 0, 0.6);
  }

  // A bolt from `from` to `to`; `arrive` is called when it gets there. Shadow bolts drag two dark moons round them,
  // fire leaves flames behind, a death coil trails pale wisps.
  function bolt(from, to, o, arrive) {
    const start = from.clone(), end = to.clone();
    const distance = Math.max(start.distanceTo(end), 0.001), time = distance / o.speed;
    let age = 0, sinceTrail = 0;
    const head = new THREE.Group(), materials = [];
    function part(geometry, color, opacity, scale) {
      const m = light(color, opacity), mesh = new THREE.Mesh(geometry, m);
      mesh.scale.setScalar(scale);
      materials.push(m);
      head.add(mesh);
      return mesh;
    }
    const glowBall = part(BALL, o.color, 0.55, o.size);
    const core = o.style === 'shadow'
      ? (function () { const m = new THREE.MeshBasicMaterial({ color: o.core }), mesh = new THREE.Mesh(BALL, m); mesh.scale.setScalar(o.size * 0.6); materials.push(m); head.add(mesh); return mesh; })()
      : part(BALL, o.core, 1, o.size * 0.55);
    const shine = halo(o.color, o.size * 5, 0.7);
    materials.push(shine.material);
    head.add(shine);
    const moons = o.style === 'shadow' ? [part(SHARD, 0xc9a8ff, 0.9, o.size * 0.3), part(SHARD, 0xc9a8ff, 0.9, o.size * 0.3)] : [];
    head.position.copy(start);
    spawn(head, materials, function (dt) {
      age += dt; sinceTrail += dt;
      const k = Math.min(1, age / time);
      head.position.lerpVectors(start, end, k);
      head.position.y += Math.sin(k * Math.PI) * distance * 0.03;
      glowBall.scale.setScalar(o.size * (1 + Math.sin(age * 40) * 0.15));
      core.rotation.y = age * 9;
      moons.forEach(function (m, i) { const a = age * 22 + i * Math.PI; m.position.set(Math.cos(a) * o.size * 1.5, Math.sin(a) * o.size * 1.5, 0); });
      if (sinceTrail > 0.022) {
        sinceTrail = 0;
        const j = o.size * 0.5;
        if (o.style === 'fire') puff(head.position, Math.random() > 0.5 ? o.color : 0xffd27a, o.size * 3, 0.32, (Math.random() - 0.5) * j * 4, 0.9 + Math.random(), (Math.random() - 0.5) * j * 4, -0.6);
        else if (o.style === 'coil') puff(head.position, o.color, o.size * 2.6, 0.45, (Math.random() - 0.5) * 1.2, 0.5, (Math.random() - 0.5) * 1.2, 0.8);
        else puff(head.position, 0x6a3cd8, o.size * 2.8, 0.35, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, -0.5);
      }
      if (k >= 1) { if (arrive) arrive(); return true; }
      return false;
    });
    return time;
  }

  // A burning rock from the ceiling (Rain of Fire).
  const meteorFrom = new THREE.Vector3();
  function meteor(at) {
    meteorFrom.set(at.x + 2.5, at.y + 15, at.z + 1.5);
    bolt(meteorFrom, at, { style: 'fire', color: 0xff7a1f, core: 0xfff0b0, size: 0.26, speed: 46 }, function () {
      ball(at, 0xff8a2a, 1.1, 0.3); ring(at, 0xff8a2a, 0.3, 1.6, 0.35, true); sparks(at, 0xffc23d, 4, 0.7);
    });
  }

  // ---------- what plays for each spell ----------
  const tmp = new THREE.Vector3(), feet = new THREE.Vector3();
  const RECIPES = {
    shadowHit: function (p) {
      ball(p.at, 0x8a4cff, 1.5, 0.35); ball(p.at, 0x2a0e55, 0.9, 0.5); ring(p.at, 0xb79bff, 0.3, 2.0, 0.4, true, 0);
      sparks(p.at, 0x9a6cff, 10, 1);
      for (let i = 0; i < 5; i++) puff(p.at, 0x5a2cc8, 1.4, 0.6, (Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3, 1);
      flash(p.at, 0x8a4cff, 90);
    },
    fireHit: function (p) {
      ball(p.at, 0xffa53a, 1.4, 0.3); ball(p.at, 0xfff0b0, 0.7, 0.2); sparks(p.at, 0xffc23d, 10, 1);
      column(tmp.set(p.at.x, p.at.y - 0.6, p.at.z), 0xff7a1f, 0xffd27a, 1.5, 0.3, 0.45);
      flash(p.at, 0xff8a2a, 80);
    },
    emberHit: function (p) { ball(p.at, 0xff8a2a, 0.9, 0.25); sparks(p.at, 0xffc23d, 5, 0.7); flash(p.at, 0xff8a2a, 30); },
    explosion: function (p) {
      ball(p.at, 0xff6a1a, 3.0, 0.45); ball(p.at, 0xfff0b0, 1.6, 0.25); ring(p.at, 0xffa53a, 0.4, 4.2, 0.5, false, 0);
      feet.set(p.at.x, 0.08, p.at.z);
      ring(feet, 0xff7a1f, 0.5, 4.5, 0.6, true);
      sparks(p.at, 0xffc23d, 26, 1.5);
      column(tmp.set(p.at.x, 0.1, p.at.z), 0xff6a1a, 0xffd27a, 4.2, 0.55, 0.7);
      for (let i = 0; i < 6; i++) puff(p.at, 0x3a2a2a, 2.2, 1.0, (Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 1.2);
      flash(p.at, 0xff7a1f, 260);
    },
    implode: function (p) {                       // the dark closes in on the target, then bursts
      ring(p.at, 0x7a3cff, 3.4, 0.2, 0.22, false, 0); ring(p.at, 0x2a0e55, 2.4, 0.1, 0.22, true, 0);
      const at = p.at.clone();
      later(0.2, function () { ball(at, 0x7a3cff, 2.3, 0.4); ball(at, 0xe6d6ff, 0.9, 0.2); sparks(at, 0xb79bff, 16, 1.3); flash(at, 0x7a3cff, 160); });
    },
    sear: function (p) {                          // a quick cut of flame across the target
      stroke(p.at, 0xffc23d, 2.2, 0.7, 0.22); stroke(p.at, 0xff7a1f, 2.2, -0.7, 0.26);
      ball(p.at, 0xff8a2a, 1.1, 0.25); sparks(p.at, 0xffc23d, 7, 0.9);
      column(tmp.set(p.at.x, p.at.y - 0.8, p.at.z), 0xff7a1f, 0xffd27a, 1.2, 0.22, 0.35);
      flash(p.at, 0xff8a2a, 70);
    },
    eruption: function (p) {                      // Immolate: fire bursts up from the floor under the target
      feet.set(p.at.x, 0.08, p.at.z);
      ring(feet, 0xff7a1f, 0.4, 2.4, 0.45, false);
      column(feet, 0xff6a1a, 0xffd27a, 3.4, 0.5, 0.7);
      sparks(tmp.set(p.at.x, 0.4, p.at.z), 0xffc23d, 12, 1);
      flash(p.at, 0xff7a1f, 110);
    },
    burn: function (p) { puff(tmp.set(p.at.x + (Math.random() - 0.5), p.at.y - 0.6, p.at.z + (Math.random() - 0.5)), 0xff8a2a, 1.3, 0.5, 0, 2.2, 0, -0.5); sparks(p.at, 0xffc23d, 2, 0.5); },
    smoke: function (p) {                         // Corruption: dark smoke winds up around the target
      for (let i = 0; i < 10; i++) {
        const a = i * 0.9, at = new THREE.Vector3(p.at.x + Math.sin(a) * 0.9, 0.3 + i * 0.25, p.at.z + Math.cos(a) * 0.9);
        (function (at, i) { later(i * 0.04, function () { puff(at, i % 2 ? 0x7a3cff : 0x3a1a7a, 1.5, 0.8, 0, 1.2, 0, 0.8); }); })(at, i);
      }
      ring(feet.set(p.at.x, 0.08, p.at.z), 0x8a3cff, 0.4, 2.0, 0.5, true);
    },
    rot: function (p) { puff(tmp.set(p.at.x + (Math.random() - 0.5) * 0.8, p.at.y - 0.2, p.at.z + (Math.random() - 0.5) * 0.8), 0x7a3cff, 1.1, 0.55, 0, 0.9, 0, 0.6); },
    sigil: function (p) { sigilDrop(p.at, p.color || 0xc04cff, 0.9); },
    doom: function (p) {                          // Bane of Doom goes off
      feet.set(p.at.x, 0.08, p.at.z);
      column(feet, 0xff3355, 0xffb0b8, 6, 0.7, 0.9);
      ball(p.at, 0xff3355, 3.6, 0.5); ball(p.at, 0xffffff, 1.6, 0.25); ring(feet, 0xff3355, 0.5, 6, 0.7, false);
      sparks(p.at, 0xff8a94, 30, 1.6); flash(p.at, 0xff3355, 320);
    },
    curse: function (p) {                         // Curse of the Elements: rings spread on the floor, runes rise
      feet.set(p.at.x, 0.08, p.at.z);
      ring(feet, 0x7d6bff, 0.3, 2.6, 0.5, false); ring(feet, 0xc9b8ff, 0.3, 3.4, 0.7, true);
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; puff(tmp.set(p.at.x + Math.sin(a) * 1.3, 0.4, p.at.z + Math.cos(a) * 1.3), 0x9a8cff, 0.8, 0.9, 0, 2.4, 0, -0.4); }
    },
    siphon: function (p) { ball(p.at, 0x6dff8f, 1.2, 0.3); ring(p.at, 0x6dff8f, 0.3, 1.6, 0.4, true, 0); if (p.caster) orbs(p.at, p.caster, 0x8dffb0, 3, 0.6); },
    leech: function (p) { if (p.caster) orbs(p.at, p.caster, 0x8dffb0, 2, 0.55); ball(p.at, 0x8dff9a, 0.6, 0.25); },
    wrack: function (p) { ball(p.at, 0xb07cff, 0.8, 0.25); sparks(p.at, 0xc9a8ff, 3, 0.7); stroke(p.at, 0xc9a8ff, 1.4, Math.random() * 3, 0.18); },
    scorch: function (p) { ball(p.at, 0xff8a2a, 0.8, 0.25); puff(p.at, 0xff7a1f, 1.2, 0.4, 0, 1.6, 0, -0.4); },
    coilHit: function (p) {                       // Death Coil: a green burst, and life drifting back to you
      ball(p.at, 0x58e06f, 1.7, 0.4); ring(p.at, 0xa8ffb8, 0.3, 2.2, 0.45, true, 0); sparks(p.at, 0x8dffb0, 8, 1);
      for (let i = 0; i < 4; i++) puff(p.at, 0x58e06f, 1.3, 0.7, (Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2, 0.8);
      if (p.caster) orbs(p.at, p.caster, 0x8dffb0, 5, 0.8);
      flash(p.at, 0x58e06f, 100);
    },
    lifeTap: function (p) {                       // life drawn up out of yourself, turning to mana
      feet.set(p.caster.x, 0.08, p.caster.z);
      ring(feet, 0xff4a5a, 1.4, 0.2, 0.4, false);
      for (let i = 0; i < 7; i++) { const a = i * 0.9; puff(tmp.set(p.caster.x + Math.sin(a) * 0.6, 0.3 + i * 0.12, p.caster.z + Math.cos(a) * 0.6), 0xff4a5a, 0.8, 0.6, 0, 2.6, 0, -0.5); }
      const head = new THREE.Vector3(p.caster.x, 2.3, p.caster.z);
      later(0.3, function () { ball(head, 0x5a9cff, 1.0, 0.35); ring(head, 0x8dc0ff, 0.2, 1.2, 0.4, true); });
    },
    lash: function (p) { stroke(p.at, 0xff8ad8, 2.4, 0.4, 0.2); ball(p.at, 0xd06cff, 0.9, 0.25); sparks(p.at, 0xff8ad8, 5, 0.8); },
    slash: function (p) { stroke(p.at, 0xffffff, 1.5, -0.6 + Math.random() * 1.2, 0.15); },
    brand: function (p) { ring(p.at, 0xff5ca8, 0.2, 1.3, 0.3, true, 0); ball(p.at, 0xff5ca8, 0.7, 0.2); },
    straw: function (p) {                         // bits of straw knocked out of the dummy
      for (let i = 0; i < (p.many ? 7 : 3); i++) {
        const life = 0.5 + Math.random() * 0.4, vx = (Math.random() - 0.5) * 5, vz = (Math.random() - 0.5) * 5;
        let vy = 1.5 + Math.random() * 3, age = 0;
        const material = new THREE.MeshBasicMaterial({ color: 0xd8bd6a, transparent: true }), mesh = new THREE.Mesh(STRAW, material);
        mesh.position.copy(p.at);
        mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
        spawn(mesh, [material], function (dt) {
          age += dt; vy -= 11 * dt;
          mesh.position.x += vx * dt; mesh.position.y = Math.max(0.05, mesh.position.y + vy * dt); mesh.position.z += vz * dt;
          mesh.rotation.x += dt * 7; mesh.rotation.z += dt * 5;
          material.opacity = Math.min(1, 2 * (1 - age / life));
          return age >= life;
        });
      }
    },
    death: function (p) { ball(p.at, 0xffffff, 2.6, 0.5); ring(feet.set(p.at.x, 0.08, p.at.z), 0xb79bff, 0.5, 5, 0.7, false); sparks(p.at, 0xd8ccff, 24, 1.4); flash(p.at, 0xffffff, 200); }
  };
  // p: { at: where on the target, caster: where your staff is, color, crit }
  function play(name, p) {
    const recipe = RECIPES[name];
    if (!recipe) return;
    recipe(p);
    if (p.crit && p.at) { ring(p.at, 0xffe27a, 0.4, 3.0, 0.4, true, 0); sparks(p.at, 0xffe27a, 8, 1.4); flash(p.at, 0xffe27a, 120); }
  }

  // ---------- while you cast: motes gathering at the staff, and a turning circle of runes at your feet ----------
  const motes = [];
  const moteMaterial = light(0xffffff, 0.9);
  for (let i = 0; i < 9; i++) {
    const mote = new THREE.Mesh(SHARD, moteMaterial);
    mote.visible = false;
    group.add(mote);
    motes.push(mote);
  }
  const circleMap = canvasTexture(512, function (g, size) {
    const c = size / 2;
    g.strokeStyle = '#ffffff'; g.lineCap = 'round';
    [[0.46, 8], [0.4, 3], [0.26, 4]].forEach(function (r) { g.lineWidth = r[1]; g.beginPath(); g.arc(c, c, size * r[0], 0, Math.PI * 2); g.stroke(); });
    g.lineWidth = 4;
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6;
      g.save(); g.translate(c + Math.cos(a) * size * 0.33, c + Math.sin(a) * size * 0.33); g.rotate(a + Math.PI / 2);
      g.beginPath(); g.moveTo(-8, 14); g.lineTo(i % 2 ? 8 : -2, -14); g.lineTo(8, i % 3 ? 10 : -2); g.stroke();
      g.restore();
    }
    g.beginPath();
    for (let i = 0; i <= 3; i++) { const a = -Math.PI / 2 + i * Math.PI * 2 / 3; g[i ? 'lineTo' : 'moveTo'](c + Math.cos(a) * size * 0.26, c + Math.sin(a) * size * 0.26); }
    g.stroke();
  });
  // The spell itself gathering at the crystal: a ball of the spell's colour that grows as the cast bar fills.
  const chargeMaterial = light(0xffffff, 0.75), charge = new THREE.Mesh(BALL, chargeMaterial), chargeGlow = halo(0xffffff, 1, 0.6);
  charge.visible = chargeGlow.visible = false;
  group.add(charge, chargeGlow);
  const castCircleMaterial = new THREE.MeshBasicMaterial({ map: circleMap, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const castCircle = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), castCircleMaterial);
  castCircle.rotation.x = -Math.PI / 2;
  castCircle.position.y = 0.07;
  group.add(castCircle);
  let castShown = 0;
  // at: where the staff's crystal is, or null when you are not casting; progress: 0 at the start of the cast, 1 at
  // its end; ground: { x, z } where you stand; dt: seconds since the last picture.
  function casting(at, color, progress, time, ground, dt) {
    castShown += ((at ? 1 : 0) - castShown) * Math.min(1, (dt || 0.016) * 10);
    for (let i = 0; i < motes.length; i++) {
      const mote = motes[i];
      mote.visible = !!at;
      if (!at) continue;
      const turn = time * 5 + i * (Math.PI * 2 / motes.length), radius = 0.2 + (1 - progress) * 0.85;
      mote.position.set(at.x + Math.cos(turn) * radius, at.y + Math.sin(turn * 1.7 + i) * radius * 0.6, at.z + Math.sin(turn) * radius);
      mote.scale.setScalar(0.035 + progress * 0.04);
      mote.rotation.y = turn;
    }
    charge.visible = chargeGlow.visible = !!at;
    if (at) {
      moteMaterial.color.set(color); castCircleMaterial.color.set(color); chargeMaterial.color.set(color); chargeGlow.material.color.set(color);
      const size = 0.08 + progress * 0.22 + Math.sin(time * 31) * 0.012;
      charge.position.copy(at); chargeGlow.position.copy(at);
      charge.scale.setScalar(size);
      chargeGlow.scale.setScalar(0.8 + progress * 2.2);
      chargeGlow.material.opacity = 0.35 + progress * 0.4;
    }
    castCircle.visible = castShown > 0.02;
    if (ground) castCircle.position.set(ground.x, 0.07, ground.z);
    castCircle.scale.setScalar(2.2 + castShown * 1.4);
    castCircle.rotation.z = time * 1.4;
    castCircleMaterial.opacity = castShown * (0.55 + Math.sin(time * 6) * 0.12);
  }

  // ---------- what hangs on a dummy while a DoT or curse is on it ----------
  const marks = [null, {}, {}, {}];              // one set per dummy
  function mark(name, build) {
    for (let ti = 1; ti <= 3; ti++) {
      const holder = new THREE.Group(), g = new THREE.Group();
      holder.visible = false;
      holder.add(g);
      scene.add(holder);
      marks[ti][name] = { holder: holder, update: build(g) };
    }
  }
  mark('immolate', function (g) {                 // flames licking up the dummy
    const flames = [];
    for (let i = 0; i < 7; i++) {
      const fl = new THREE.Mesh(FLAME, light(i % 2 ? 0xffc23d : 0xff7a1f, 0.75));
      const a = i * Math.PI * 2 / 7;
      fl.position.set(Math.sin(a) * 0.62, 0.6 + (i % 3) * 0.6, Math.cos(a) * 0.62);
      g.add(fl);
      flames.push(fl);
    }
    const shine = halo(0xff8a2a, 4.5, 0.4);
    shine.position.y = 1.6;
    g.add(shine);
    return function (time) {
      flames.forEach(function (fl, i) {
        const f = 1 + Math.sin(time * 11 + i * 2.1) * 0.25 + Math.sin(time * 23 + i) * 0.12;
        fl.scale.set(0.5, 0.8 * f, 0.5);
      });
      shine.material.opacity = 0.32 + Math.sin(time * 9) * 0.08;
    };
  });
  mark('corruption', function (g) {               // dark wisps winding round it
    const wisps = [];
    for (let i = 0; i < 6; i++) { const w = halo(i % 2 ? 0x8a3cff : 0x5a2cc8, 0.75, 0.85); g.add(w); wisps.push(w); }
    return function (time) {
      wisps.forEach(function (w, i) {
        const a = time * 2.2 + i * (Math.PI * 2 / 6);
        w.position.set(Math.sin(a) * 1.0, 1.3 + Math.sin(time * 1.7 + i * 1.3) * 0.9, Math.cos(a) * 1.0);
      });
    };
  });
  mark('siphonLife', function (g) {               // green motes circling the other way
    const wisps = [];
    for (let i = 0; i < 3; i++) { const w = halo(0x6dff8f, 0.6, 0.85); g.add(w); wisps.push(w); }
    return function (time) {
      wisps.forEach(function (w, i) {
        const a = -time * 2.8 + i * (Math.PI * 2 / 3);
        w.position.set(Math.sin(a) * 0.8, 2.0 + Math.sin(time * 2.3 + i) * 0.5, Math.cos(a) * 0.8);
      });
    };
  });
  function sigil(color, size, height) {             // a turning sigil above its head
    return function (g) {
      const outer = new THREE.Mesh(RING, light(color, 0.85)), inner = new THREE.Mesh(RING, light(color, 0.6));
      outer.rotation.x = inner.rotation.x = -Math.PI / 2;
      outer.scale.setScalar(size); inner.scale.setScalar(size * 0.55);
      const gem = new THREE.Mesh(SHARD, light(color, 0.9));
      gem.scale.setScalar(size * 0.22);
      const shine = halo(color, size * 3.5, 0.5);
      g.add(outer, inner, gem, shine);
      g.position.y = height;
      return function (time) {
        outer.rotation.z = time * 0.9; inner.rotation.z = -time * 1.6;
        gem.rotation.y = time * 2; gem.position.y = Math.sin(time * 2.4) * 0.08;
      };
    };
  }
  mark('baneOfAgony', sigil(0xc04cff, 0.55, 4.05));
  mark('baneOfDoom', sigil(0xff3355, 0.8, 4.15));
  mark('havoc', sigil(0xff5ca8, 0.68, 4.1));
  mark('coe', function (g) {                        // a violet ring of runes on the floor around it
    const ringMesh = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshBasicMaterial({ map: circleMap, color: 0x7d6bff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    ringMesh.rotation.x = -Math.PI / 2;
    ringMesh.position.y = 0.08;
    g.add(ringMesh);
    return function (time) { ringMesh.material.opacity = 0.45 + Math.sin(time * 2.5) * 0.2; ringMesh.rotation.z = -time * 0.5; };
  });

  // ti: which dummy (1-3); at: where it stands { x, z }; on: { immolate: true, corruption: false, ... }
  function setMarks(ti, at, on, time) {
    for (const name in marks[ti]) {
      const m = marks[ti][name], show = !!on[name];
      m.holder.visible = show;
      if (!show) continue;
      m.holder.position.set(at.x, 0, at.z);
      m.update(time);
    }
  }

  function remove(item) {
    if (item.object) group.remove(item.object);
    item.materials.forEach(function (m) { m.dispose(); });
  }
  // camera: where you look from (strokes turn to face it).
  function update(dt, cameraPosition) {
    if (cameraPosition) lookAt.copy(cameraPosition);
    for (let i = live.length - 1; i >= 0; i--) {
      if (!live[i].update(dt)) continue;
      remove(live[i]);
      live.splice(i, 1);
    }
    flashes.forEach(function (f) {
      if (f.left <= 0) { f.lamp.intensity = 0; return; }
      f.left -= dt;
      f.lamp.intensity = f.peak * Math.max(0, f.left / f.life);
    });
  }
  function clear() {
    for (let ti = 1; ti <= 3; ti++) for (const name in marks[ti]) marks[ti][name].holder.visible = false;
    live.forEach(remove);
    live.length = 0;
    flashes.forEach(function (f) { f.left = 0; f.lamp.intensity = 0; });
  }

  return { streak: streak, play: play, bolt: bolt, meteor: meteor, ball: ball, ring: ring, casting: casting, setMarks: setMarks, update: update, clear: clear, count: function () { return live.length; } };
}
