// Scripted fights ("encounters"): things happen at set moments instead of at an even beat.
//   fire  - a patch of fire lands where you stand. It shows 2 seconds early; every second you stand in it once it
//           burns, you take a hit (your cast is pushed back).
//   move  - you are made to move for a while: only instant spells work.
//   hits  - a barrage: for a while you take a hit every so often.
//   call  - a dummy is called out: switch to it. Nothing else happens; how fast you switched is kept for the review.
//   add   - a dummy joins the fight, in the first place that is free (it waits for one if none is).
// The rules of casting stay in combat.js: this file only says when you are made to move, calls combat.hit(), and
// draws the fire. The sim cannot follow a script, so its number is for a fight of the same length with about as much
// moving and as many hits, spread evenly (see simFight below).
import * as THREE from 'three';
import { light } from './kit.js';

const FIRE_RADIUS = 4, FIRE_WARN = 2, FIRE_BURN = 8, FIRE_STEP_OUT = 1.5, WARN = 3;

function every(first, step, until, make) {
  const list = [];
  for (let at = first; at <= until; at += step) list.push(make(at));
  return list;
}

// Which dummy is called when: never the one called before, and each about as often.
const CALLS = [2, 3, 1, 3, 2, 1, 2, 3, 1, 2];

export const ENCOUNTERS = [
  { id: 'targetCalls', name: 'Target calls', targets: 3, fight: { timed: true, seconds: 120 },
    text: 'Two minutes on three dummies. Every 12 seconds another dummy is called out: switch to it (Tab or a click) as fast as you can. The review says how fast you were.',
    script: CALLS.map(function (n, i) { return { at: 6 + i * 12, call: n }; }) },
  { id: 'adds', name: 'Reinforcements', targets: 3, fight: { timed: false, seconds: 120 }, healths: [60000, 12000, 12000], absent: [2, 3], simTargets: 1, simHealth: 96000,
    text: 'A boss with 60,000 health. After 15, 45 and 75 seconds an add with 12,000 health joins it. It ends when everything is dead. The sim cannot do adds: it is measured on one dummy with the same total health.',
    script: [{ at: 15, add: true }, { at: 45, add: true }, { at: 75, add: true }] },
  { id: 'fireDance', name: 'Fire dance', targets: 1, fight: { timed: true, seconds: 120 },
    text: 'Two minutes. Every 15 seconds fire lands where you stand: step out of it, or it pushes your casts back.',
    script: every(10, 15, 100, function (at) { return { at: at, fire: true }; }) },
  { id: 'barrage', name: 'Barrage', targets: 1, fight: { timed: true, seconds: 120 },
    text: 'Two minutes. Every 30 seconds you are hit every 1.5 seconds for 10 seconds. A warning comes 3 seconds before.',
    script: every(20, 30, 110, function (at) { return { at: at, hits: 10, every: 1.5 }; }) },
  { id: 'gauntlet', name: 'The gauntlet', targets: 3, fight: { timed: true, seconds: 180 },
    text: 'Three minutes on three dummies with everything at once: fire, being made to run, and barrages.',
    script: [{ at: 15, fire: true }, { at: 30, move: 5 }, { at: 45, hits: 10, every: 1.5 }, { at: 65, fire: true }, { at: 80, move: 6 },
             { at: 95, fire: true }, { at: 110, hits: 12, every: 1.5 }, { at: 130, move: 5 }, { at: 142, fire: true }, { at: 155, hits: 10, every: 1.5 }, { at: 170, fire: true }] }
];

// The even fight the sim plays instead: as many movement phases and hits as the script has, spread over its length.
export function simFight(encounter) {
  const seconds = encounter.fight.seconds;
  let moves = 0, moving = 0, hits = 0;
  encounter.script.forEach(function (e) {
    if (e.fire) { moves++; moving += FIRE_STEP_OUT; }
    if (e.move) { moves++; moving += e.move; }
    if (e.hits) hits += Math.floor(e.hits / e.every) + 1;
  });
  return { moveEvery: moves ? Math.round(10 * seconds / (moves + 1)) / 10 : 0, moveDuration: moves ? Math.round(10 * moving / moves) / 10 : 0,
           hitEvery: hits ? Math.round(10 * seconds / hits) / 10 : 0 };
}

// handlers: burn(at) - a lick of flame at this spot (drawn by the spell effects)
export function createEncounter(scene, handlers) {
  const patches = [];                                      // fire on the floor: { group, disc, ring, x, z, at, done, nextHit }
  let script = null, state = [], wasOver = false;
  const out = { forced: false, banner: null, called: 0 };  // called: the dummy that is called out right now (0 = none)

  function patch() {
    const group = new THREE.Group(), disc = new THREE.Mesh(new THREE.CircleGeometry(FIRE_RADIUS, 40), light(0xff5a1a, 0.2));
    const ring = new THREE.Mesh(new THREE.RingGeometry(FIRE_RADIUS - 0.14, FIRE_RADIUS, 56), light(0xffc23d, 0.9));
    disc.rotation.x = ring.rotation.x = -Math.PI / 2;
    disc.position.y = 0.09; ring.position.y = 0.1;
    group.add(disc, ring);
    group.visible = false;
    scene.add(group);
    return { group: group, disc: disc, ring: ring, x: 0, z: 0, at: 0, live: false, nextHit: 0, puff: 0 };
  }
  function freePatch() {
    for (let i = 0; i < patches.length; i++) if (!patches[i].live) return patches[i];
    const p = patch();
    patches.push(p);
    return p;
  }

  function reset() {
    state = (script || []).map(function () { return { started: false, hitsDone: 0, reaction: null }; });
    patches.forEach(function (p) { p.live = false; p.group.visible = false; });
    out.forced = false; out.banner = null; out.called = 0; wasOver = false;
  }
  function start(encounter) { script = encounter ? encounter.script : null; reset(); }

  // t: seconds into the fight (0 before it starts); player: { x, z }; combat: the casting rules; dt: seconds since
  // the last picture. Sets out.forced (you are made to move) and out.banner ({ text, soon } or null).
  function update(dt, time, player, combat) {
    out.forced = false; out.banner = null; out.called = 0;
    if (!script) return out;
    const S = combat.state, t = combat.fightSeconds();
    if (S.over || S.fightStart === null) {
      if (S.over && !wasOver) { wasOver = true; patches.forEach(function (p) { p.live = false; p.group.visible = false; }); }
      return out;
    }
    let soon = null, soonIn = Infinity, inFire = false, call = null;
    script.forEach(function (e, i) {
      const st = state[i], until = e.at - t;
      if (e.fire) {
        if (!st.started && until <= FIRE_WARN) {           // it shows where you stand now, and burns from e.at
          st.started = true;
          const p = freePatch();
          p.live = true; p.x = player.x; p.z = player.z; p.at = e.at; p.nextHit = e.at; p.puff = 0;
          p.group.position.set(p.x, 0, p.z);
          p.group.visible = true;
        }
        if (until > 0 && until <= WARN && until < soonIn) { soonIn = until; soon = 'Fire under you in ' + until.toFixed(1); }
      } else if (e.move) {
        if (until > 0 && until <= WARN && until < soonIn) { soonIn = until; soon = 'Move in ' + until.toFixed(1); }
        if (until <= 0 && until > -e.move) { out.forced = true; out.banner = { text: 'Move!  ' + (e.move + until).toFixed(1), soon: false }; }
      } else if (e.call) {
        if (until <= 0) { st.started = true; call = { e: e, st: st }; }   // the latest call that has come is the one that counts
      } else if (e.add) {
        if (until > 0 && until <= WARN && until < soonIn) { soonIn = until; soon = 'An add in ' + until.toFixed(1); }
        if (until <= 0 && !st.started) {
          for (let ti = 2; ti <= combat.targetCount && !st.started; ti++) if (!combat.alive(ti) && combat.spawn(ti)) st.started = true;
        }
      } else if (e.hits) {
        if (until > 0 && until <= WARN && until < soonIn) { soonIn = until; soon = 'Barrage in ' + until.toFixed(1); }
        if (until <= 0 && until > -e.hits - 0.01) {
          while (st.hitsDone * e.every <= -until + 1e-6 && st.hitsDone * e.every <= e.hits + 1e-6) { st.hitsDone++; combat.hit(); }
          if (!out.banner) out.banner = { text: 'Under attack  ' + Math.max(0, e.hits + until).toFixed(1), soon: true };
        }
      }
    });

    patches.forEach(function (p) {
      if (!p.live) return;
      const age = t - p.at;                                // below 0: still the warning
      if (age >= FIRE_BURN) { p.live = false; p.group.visible = false; return; }
      const burning = age >= 0, fade = burning ? Math.min(1, (FIRE_BURN - age) / 0.8) : 1;
      p.disc.material.opacity = (burning ? 0.34 + Math.sin(time * 13) * 0.08 : 0.1 + 0.12 * (1 + age / FIRE_WARN)) * fade;
      p.ring.material.opacity = (burning ? 0.85 : 0.5 + Math.sin(time * 18) * 0.4) * fade;
      p.ring.scale.setScalar(burning ? 1 : 1 + 0.25 * (-age / FIRE_WARN));
      if (!burning) return;
      p.puff -= dt;
      if (p.puff <= 0) {
        p.puff = 0.07;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * (FIRE_RADIUS - 0.4);
        handlers.burn(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r);
      }
      if (Math.hypot(player.x - p.x, player.z - p.z) < FIRE_RADIUS) {
        inFire = true;
        if (t >= p.nextHit) { p.nextHit = t + 1; combat.hit(); }
      } else p.nextHit = Math.max(p.nextHit, t + 0.25);    // stepping back in costs you again almost at once
    });
    if (call) {
      out.called = call.e.call;
      if (S.target === call.e.call) { if (call.st.reaction === null) call.st.reaction = Math.max(0, t - call.e.at); }
      else if (call.st.reaction === null && !out.banner) out.banner = { text: 'Switch to dummy ' + call.e.call + '!', soon: false };
    }
    if (inFire) out.banner = { text: 'Get out of the fire!', soon: false };
    else if (!out.banner && soon) out.banner = { text: soon, soon: true };
    return out;
  }

  // What the review says about a fight with target calls (null when the script has none, or none has come yet).
  function notes() {
    const calls = (script || []).map(function (e, i) { return e.call && state[i].started ? state[i] : null; }).filter(Boolean);
    if (!calls.length) return null;
    const made = calls.filter(function (st) { return st.reaction !== null; }).map(function (st) { return st.reaction; });
    if (!made.length) return 'Target calls: ' + calls.length + ', and you followed none of them.';
    const mean = made.reduce(function (a, b) { return a + b; }, 0) / made.length, slow = Math.max.apply(null, made), missed = calls.length - made.length;
    return 'Target calls: ' + calls.length + '. You switched after ' + mean.toFixed(1) + ' s on average (slowest ' + slow.toFixed(1) + ' s)' +
      (missed ? '; ' + (missed === 1 ? 'one call' : missed + ' calls') + ' you did not follow.' : '.');
  }

  return { start: start, reset: reset, update: update, state: out, notes: notes };
}
