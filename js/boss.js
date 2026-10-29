// Boss fights (Xn, 2026-10-29). The first: Onyxia, as in the Classic fight with the Warder of Season of Mastery
// walking in at phase 2. Numbers and timers from the game's data and the Classic fight. Xn's choices:
//   - the kill lasts about 4 minutes and she loses health at an even pace whether you attack or not (a timed fight:
//     her health follows the clock, phase 2 at 65%, phase 3 at 40%; your damage is counted, not taken from her);
//   - a ghost tank holds her the whole fight; the first wave of whelps is 20, and they gather at the mouth of each egg
//     cave where a ghost off-tank holds them; a ghost off-tank holds the Warder in the tunnel;
//   - her fireballs sometimes go at you, sometimes at other places in the room; Deep Breath hits 4,000-5,000 a time.
// The rules of casting stay in combat.js. This file moves the creatures, decides what the boss does, and hurts you
// through combat.injure(); the ghost raid's healers give it back a few seconds later (combat.heal()), and the ghost
// raid kills the adds (combat.raidHurt()).
import * as THREE from 'three';
import { LAIR, caveOf, walkable, inChamber, ERUPT_REACH } from './lair.js';
import { makeOnyxia, makeWhelp, makeWarder, makeGhostTank } from './onyxia.js';

// Xn, 2026-10-29: phase 2 twice as long as an even pace would make it ("let the fight extend over 4 minutes"):
// 100% to 65% in 84 s, 65% to 40% in 168 s, 40% to 0% in 96 s. Her health follows this whatever you do.
const CURVE = [[0, 100], [84, 65], [252, 40], [348, 0]];
const SECONDS = 348;
const WAVE = 20, EXTRA = 8, FIRST_WHELP = 3, COUNT = 2 + WAVE + EXTRA;
const HEALTH = { onyxia: 1099230, warder: 106821, whelp: 3052 };
const BREATH_REACH = 21, BREATH_STEP = 7.8;           // Deep Breath: how far each burst reaches, how far apart they are
const RUN = 9, WHELP_SPEED = 8, WARDER_SPEED = 5, FLY_SPEED = 16, CROSS_SPEED = 22;

// How much each thing hurts (the game's own spell values; marked "guess" where no source has a number).
const DMG = {
  flameBreath: [3063, 3937], cleave: [3000, 4000] /* guess: her melee is not known */, wingBuffet: [563, 937], tailSweep: [600, 1000],
  fireball: [1700, 2300], deepBreath: [4000, 5000], eruption: [1425, 1575], whelp: [450, 650] /* guess */,
  fireNova: [900, 1100] /* guess */, flameLash: [56, 64], heatedGround: [950, 1050] /* guess: every second in an egg cave during Deep Breath */
};

export const BOSSES = [
  { id: 'onyxia', name: 'Onyxia', where: "Onyxia's Lair", seconds: SECONDS,
    short: 'About six minutes. Stay off her front and tail, dodge Deep Breath, keep out of the egg caves, mind the lava after each fear. She is immune to fire.',
    text: 'About six minutes in her lair. A ghost tank holds her; she loses health on a fixed schedule (phase 2 at 65% after 1:24, phase 3 at 40% after 4:12), so the fight is about staying alive and keeping your damage up. She is immune to fire: Immolate, Searing Pain, Soul Fire and the Imp\'s Firebolt do nothing to her. ' +
          'Phase 1: stand on her side - Flame Breath, Cleave and Wing Buffet hit the front, Tail Sweep the back. ' +
          'Phase 2: she flies; fireballs land on you and around the room, Deep Breath burns a lane across the cave at least twice (watch for the emote and get to the side), 20 whelps come out of the egg caves and more later, and an Onyxian Warder walks in. Stay out of the egg caves: they burn while she breathes. ' +
          'Phase 3: she lands; Bellowing Roar fears everyone, and the lava cracks erupt after each fear.' }
];

export function bossChallenge(id) {
  const b = BOSSES.filter(function (x) { return x.id === id; })[0];
  if (!b) return null;
  const healths = [HEALTH.onyxia, HEALTH.warder], absent = [];
  for (let i = 3; i <= COUNT; i++) healths.push(HEALTH.whelp);
  for (let i = 2; i <= COUNT; i++) absent.push(i);
  // The sim cannot fight Onyxia: it is measured in a fight of the same length on one target with about as much moving
  // (phase 2's repositioning and phase 3's fears).
  return { id: 'boss:' + id, boss: id, name: b.name, text: b.short, long: b.text, targets: COUNT, fight: { timed: true, seconds: SECONDS },
           curve: CURVE, immune: { 1: { fire: true } },
           healths: healths, absent: absent, simTargets: 1, sim: { moveEvery: 20, moveDuration: 3, hitEvery: 0 } };
}

function rand(a, b) { return a + Math.random() * (b - a); }
function roll(r) { return Math.round(rand(r[0], r[1])); }
function yawTo(fx, fz, tx, tz) { return Math.atan2(-(tx - fx), -(tz - fz)); }
function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function turn(from, to, rate, dt) { const d = wrap(to - from); return from + Math.max(-rate * dt, Math.min(rate * dt, d)); }

// h: { effects, controls, sound, log(text, kind), lair (js/lair.js) }
export function createBossFight(scene, h) {
  const lair = h.lair, effects = h.effects;
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);

  // ---------- the creatures ----------
  const onyxia = makeOnyxia(), warder = makeWarder(), whelps = [];
  group.add(onyxia.root, warder.root);
  for (let i = 0; i < WAVE + EXTRA; i++) { const w = makeWhelp(); w.root.visible = false; group.add(w.root); whelps.push(w); }
  const bodies = [null, onyxia, warder].concat(whelps);
  const spots = bodies.map(function () { return { x: 0, z: 0 }; });
  const tanks = { main: makeGhostTank(), east: makeGhostTank(), west: makeGhostTank(), warder: makeGhostTank() }, TANKS = ['main', 'east', 'west', 'warder'];
  Object.keys(tanks).forEach(function (k) { group.add(tanks[k].root); });

  // Fire on the floor where a fireball will land (a ring that fills as the cast goes on).
  const markers = [];
  function marker() {
    for (let i = 0; i < markers.length; i++) if (!markers[i].live) return markers[i];
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.RingGeometry(4.75, 5, 56), new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
    const fill = new THREE.Mesh(new THREE.CircleGeometry(5, 48), new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = fill.rotation.x = -Math.PI / 2;
    ring.position.y = 0.12; fill.position.y = 0.11;
    g.add(ring, fill);
    group.add(g);
    const m = { group: g, fill: fill, live: false };
    markers.push(m);
    return m;
  }

  // ---------- the state of one fight ----------
  let S = null;
  function fresh() {
    S = {
      phase: 'asleep', started: false, over: false,
      ony: { x: LAIR.home.x, z: LAIR.home.z, y: 0, yaw: Math.PI, goal: null, speed: 0 },
      point: 0,                                          // her place in the air (index into LAIR.flight)
      next: {},                                          // when each ability comes next (fight seconds)
      cast: null,                                        // { name, ends } an ability with a cast time
      breath: null,                                      // Deep Breath: { step: 'inhale' | 'cross', ends, from, to, dropped }
      fireballs: [],                                     // { lands, player, x, z, marker, flying }
      whelps: whelps.map(function (w, i) { return { slot: FIRST_WHELP + i, state: 'idle', x: 0, z: 0, path: [], side: 'east', swingAt: 0, chaseUntil: 0, rate: 0 }; }),
      wave: { due: Infinity, left: 0, every: [1, 2.5], first: true },
      warder: { state: 'idle', x: LAIR.tunnelEnd.x, z: LAIR.tunnelEnd.z, nova: 0, lash: 0 },
      heals: [],                                         // { at, amount }
      fear: null,                                        // { ends, turnAt }
      erupt: null,                                       // { from, ends, list: [{ at, fissure, done }] }
      roar: null,                                        // { ends } the roar being cast
      tankGoal: { x: LAIR.tank.x, z: LAIR.tank.z },
      banner: null, shake: 0, hatchAt: 0, lastT: -1, heat: 0, heatAt: 0, heatSaid: false, breaths: 0, airFrom: 0
    };
    lair.eggs.forEach(function (e) { e.hatched = false; e.mesh.visible = true; });
    markers.forEach(function (m) { m.live = false; m.group.visible = false; });
    onyxia.setDead(false);
    onyxia.setMode('sleep');
    onyxia.place(S.ony.x, S.ony.z, S.ony.yaw, 0);
    warder.setDead(false);
    warder.root.visible = false;
    warder.place(LAIR.tunnelEnd.x, LAIR.tunnelEnd.z, Math.PI);
    whelps.forEach(function (w) { w.setDead(false); w.root.visible = false; });
    tanks.main.place(LAIR.tank.x, LAIR.tank.z, Math.PI);
    tanks.east.place(LAIR.offtank.east.x, LAIR.offtank.east.z, yawTo(LAIR.offtank.east.x, LAIR.offtank.east.z, LAIR.pack.east.x, LAIR.pack.east.z));
    tanks.west.place(LAIR.offtank.west.x, LAIR.offtank.west.z, yawTo(LAIR.offtank.west.x, LAIR.offtank.west.z, LAIR.pack.west.x, LAIR.pack.west.z));
    tanks.warder.place(LAIR.offtank.warder.x, LAIR.offtank.warder.z, 0);
    lair.setFissures(0);
    lair.setHeat(0);
    syncSpots();
  }

  function syncSpots() {
    spots[1].x = S.ony.x; spots[1].z = S.ony.z;
    spots[2].x = S.warder.x; spots[2].z = S.warder.z;
    S.whelps.forEach(function (w) { spots[w.slot].x = w.x; spots[w.slot].z = w.z; });
  }

  function say(text, kind, seconds) {
    h.log(text, kind || 'proc');
    S.banner = { text: text, until: S.lastT + (seconds || 3.5), emote: kind === 'miss' };
  }

  // You are hurt; the raid's healers give it back a few seconds later.
  let combat = null;
  function hurt(amount, what) {
    if (combat.state.over || combat.state.fightStart === null) return 0;
    h.log(what + ' hits you for ' + amount.toLocaleString('en-US') + '.', 'miss');   // before the death it may cause
    const got = combat.injure(amount, what);
    if (got > 0) S.heals.push({ at: S.lastT + rand(2.5, 4), amount: got });
    return got;
  }

  // ---------- where you stand against her ----------
  function relative(player) {
    const o = S.ony, dx = player.x - o.x, dz = player.z - o.z, d = Math.hypot(dx, dz) || 0.001;
    const fx = -Math.sin(o.yaw), fz = -Math.cos(o.yaw);
    return { d: d, cos: (dx * fx + dz * fz) / d, side: dx * -fz + dz * fx > 0 ? 1 : -1, fx: fx, fz: fz, dx: dx / d, dz: dz / d };
  }
  function inFront(player, range, halfAngle) { const r = relative(player); return r.d <= range + onyxia.radius * 0.5 && r.cos >= Math.cos(halfAngle); }
  function behind(player, range, halfAngle) { const r = relative(player); return r.d <= range + onyxia.radius * 0.5 && -r.cos >= Math.cos(halfAngle); }

  const mouth = new THREE.Vector3(), tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  // Fire poured out in a cone in front of her (Flame Breath; looks only).
  function coneFire(range, halfAngle) {
    onyxia.mouthAt(mouth);
    visual({ n: 'cone', x: S.ony.x, z: S.ony.z, yaw: S.ony.yaw, m: [mouth.x, mouth.y, mouth.z], r: range, a: halfAngle });
  }
  function act(name, seconds) { visual({ n: 'act', a: name, s: seconds }); }
  // A look that the replay shows again: played now and handed to main.js (h.record) with the fight's second.
  function visual(fx) { playFx(fx); if (h.record) h.record(fx); }
  function playFx(fx) {
    switch (fx.n) {
      case 'act': onyxia.act(fx.a, fx.s); break;
      case 'cone':
        for (let i = 0; i < 26; i++) {
          const a = fx.yaw + rand(-fx.a, fx.a), r = rand(4, fx.r), ax = -Math.sin(a), az = -Math.cos(a);
          const at = tmp.set(fx.x + ax * r, 0.8 + Math.random() * 2, fx.z + az * r);
          if (i < 10) effects.play('burn', { at: at });
          else effects.puff(at, i % 2 ? 0xff7a1f : 0xffc23d, 2.2 + Math.random() * 1.5, 0.7, ax * 2, 1.2, az * 2, 0.6);
        }
        effects.ball(tmp.set(fx.m[0], fx.m[1], fx.m[2]), 0xffa040, 1.6, 0.35);
        break;
      case 'buffet': effects.ring(tmp.set(fx.x, 0.3, fx.z), 0xd8c0a0, 2, 30, 0.6, true); break;
      case 'tail': effects.ring(tmp.set(fx.x, 0.4, fx.z), 0xc8a080, 1, 14, 0.5, true); break;
      case 'bolt': effects.bolt(tmp.set(fx.a[0], fx.a[1], fx.a[2]), tmp2.set(fx.b[0], 0.5, fx.b[1]), { style: 'fire', color: 0xff6a1a, core: 0xfff0b0, size: 1.1, speed: 70 }, function () {}); break;
      case 'boom': effects.play('explosion', { at: tmp.set(fx.x, 0.6, fx.z) }); effects.ring(tmp.set(fx.x, 0.2, fx.z), 0xff8a2a, 1, 5.5, 0.5, false); break;
      case 'burst':                                       // fire across the whole width of the lane
        for (let k = -2; k <= 2; k++) {
          const off = k * BREATH_REACH * 0.4, x = fx.x + (fx.nx || 0) * off, z = fx.z + (fx.nz || 0) * off;
          effects.column(tmp.set(x, 0, z), 0xff6a1a, 0xffd27a, 8, 3.6, 0.8);
          if (k % 2 === 0) effects.puff(tmp.set(x, 1, z), 0xff7a1f, 7, 1.0, 0, 2.5, 0, 0.8);
        }
        break;
      case 'erupt': {
        const fis = lair.fissures[fx.i];
        if (!fis) break;
        [fis.points[1], fis.points[3]].forEach(function (p) { effects.column(tmp.set(p[0], 0, p[1]), 0xff5a14, 0xffd27a, 4.5, 1.4, 0.6); });
        effects.puff(tmp.set(fis.cx, 0.8, fis.cz), 0xff7a1f, 4, 0.7, 0, 2, 0, 0.8);
        break;
      }
      case 'nova': effects.ring(tmp.set(fx.x, 0.4, fx.z), 0xff6a1a, 1, 10, 0.6, false); effects.ring(tmp.set(fx.x, 0.6, fx.z), 0xffc23d, 0.5, 8, 0.5, true); warder.nova(); break;
      case 'hatch': effects.sparks(tmp.set(fx.x, 0.8, fx.z), 0x9a6aff, 10, 1); break;
      case 'fear': effects.ring(tmp.set(fx.x, 1, fx.z), 0x9a5aff, 0.5, 3, 0.6, true); break;
      case 'tank': if (tanks[fx.w]) tanks[fx.w][fx.k](); break;
      case 'warder': warder.attack(); break;
      case 'whelp': if (bodies[fx.s]) bodies[fx.s].attack(); break;
    }
  }

  // ---------- phase 1 and 3: on the ground ----------
  function groundTimers(t, third) {
    S.next.flameBreath = t + rand(10, 20);
    S.next.cleave = t + rand(2, 5);
    S.next.tailSweep = t + rand(15, 20);
    S.next.wingBuffet = t + rand(10, 20);
    S.next.knockAway = t + (third ? rand(10, 20) : rand(20, 30));
    S.next.melee = t + 2;
  }
  function groundAbilities(t, player) {
    if (S.cast) {
      if (t < S.cast.ends) return;
      const name = S.cast.name;
      S.cast = null;
      if (name === 'flameBreath') {
        coneFire(45, Math.PI / 4);
        if (inFront(player, 45, Math.PI / 4)) hurt(roll(DMG.flameBreath), "Onyxia's Flame Breath");
        h.sound.play('ignite');
      } else if (name === 'wingBuffet') {
        visual({ n: 'buffet', x: S.ony.x, z: S.ony.z });
        if (inFront(player, 30, 0.9)) {
          hurt(roll(DMG.wingBuffet), "Onyxia's Wing Buffet");
          const r = relative(player);
          h.controls.shove(r.dx * 24, r.dz * 24, 5);
        }
      }
      return;
    }
    if (t >= S.next.flameBreath) { S.cast = { name: 'flameBreath', ends: t + 2 }; act('breath', 3.0); S.next.flameBreath = t + 2 + rand(10, 20); return; }
    if (t >= S.next.wingBuffet) { S.cast = { name: 'wingBuffet', ends: t + 1 }; act('buffet', 1.3); S.next.wingBuffet = t + 1 + rand(15, 30); return; }
    if (t >= S.next.tailSweep) {
      act('tail', 0.9);
      S.next.tailSweep = t + rand(15, 20);
      const o = S.ony, back = tmp.set(o.x + Math.sin(o.yaw) * 10, 0.4, o.z + Math.cos(o.yaw) * 10);
      visual({ n: 'tail', x: back.x, z: back.z });
      if (behind(player, 30, 0.9)) {
        hurt(roll(DMG.tailSweep), "Onyxia's Tail Sweep");
        // Flung about 40 yards (Xn) to the side you stand on, and a little back: speed / fade = distance.
        const r = relative(player), sx = -r.fz * r.side - r.fx * 0.3, sz = r.fx * r.side - r.fz * 0.3, len = Math.hypot(sx, sz) || 1;
        h.controls.shove(sx / len * 112, sz / len * 112, 9, 2.8);
      }
      return;
    }
    if (t >= S.next.cleave) {
      act('cleave', 0.8);
      S.next.cleave = t + rand(5, 10);
      visual({ n: 'tank', w: 'main', k: 'swing' });
      if (inFront(player, 12, 1.05)) hurt(roll(DMG.cleave), "Onyxia's Cleave");
      return;
    }
    if (t >= S.next.knockAway) {
      act('knock', 0.8);
      visual({ n: 'tank', w: 'main', k: 'knocked' });
      S.next.knockAway = t + rand(25, 40);
      return;
    }
    if (t >= S.next.melee) { S.next.melee = t + 2; visual({ n: 'tank', w: 'main', k: 'swing' }); }
  }

  // ---------- phase 2: in the air ----------
  function fireball(t, player) {
    const atYou = Math.random() < 0.35;
    let x = player.x, z = player.z;
    if (!atYou) {                                        // somewhere the raid stands
      for (let k = 0; k < 30; k++) {
        const cx = rand(-34, 34), cz = rand(-38, 40);
        if (inChamber(cx, cz)) { x = cx; z = cz; break; }
      }
    }
    const m = marker();
    m.live = true; m.group.visible = true; m.group.position.set(x, 0, z);
    S.fireballs.push({ lands: t + 3, player: atYou, x: x, z: z, marker: m, flying: false, cast: t });
    act('fireball', 0.8);
  }
  function fireballs(t, player) {
    S.fireballs.forEach(function (f) {
      if (f.player) { f.x = player.x; f.z = player.z; f.marker.group.position.set(f.x, 0, f.z); }
      f.marker.fill.material.opacity = 0.12 + 0.35 * Math.min(1, (t - f.cast) / 3);
      if (!f.flying && t >= f.lands - 0.5) {
        f.flying = true;
        onyxia.mouthAt(mouth);
        visual({ n: 'bolt', a: [mouth.x, mouth.y, mouth.z], b: [f.x, f.z] });
      }
    });
    for (let i = S.fireballs.length - 1; i >= 0; i--) {
      const f = S.fireballs[i];
      if (t < f.lands) continue;
      S.fireballs.splice(i, 1);
      f.marker.live = false; f.marker.group.visible = false;
      visual({ n: 'boom', x: f.x, z: f.z });
      if (S.over) continue;
      if (f.player || Math.hypot(player.x - f.x, player.z - f.z) <= 5) hurt(roll(DMG.fireball), "Onyxia's Fireball");
    }
  }
  function flyTo(p, height) { S.ony.goal = { x: p.x, z: p.z, y: height == null ? LAIR.flyHeight : height }; }
  function airMove(t) {
    if (S.breath) return;
    if (t < S.next.move) return;
    // At least two Deep Breaths in every phase 2 (Xn: "people need to test that mechanic out"): the first move of the air
    // phase is one, and another comes at the first move a minute later; after that it is up to chance again.
    let choice = Math.floor(Math.random() * 3);
    if (S.breaths === 0 || (S.breaths === 1 && t >= S.airFrom + 60)) choice = 0;
    if (choice === 0) {                                  // Deep Breath: she breathes in, then crosses to the far side
      const from = LAIR.flight[S.point], to = (S.point + 4) % 8;
      S.breath = { step: 'inhale', ends: t + 5, from: { x: from.x, z: from.z }, to: to, dropped: 0 };
      S.breaths++;
      say('Onyxia takes in a deep breath...', 'miss', 5);
      act('roar', 5);
      h.sound.play('warn');
      S.next.move = t + 5 + 25;
    } else {
      S.point = (S.point + (choice === 1 ? 7 : 1)) % 8;
      flyTo(LAIR.flight[S.point]);
      S.next.move = t + rand(15, 25);
    }
  }
  function deepBreath(t, player) {
    const b = S.breath;
    if (!b) return;
    if (b.step === 'inhale') {
      if (t < b.ends) return;
      b.step = 'cross';
      act('deep', 6);
      S.point = b.to;
      flyTo(LAIR.flight[b.to]);
      S.ony.cross = true;
      return;
    }
    // A burst of fire on the floor every so many yards she flies; each burns BREATH_REACH yards around it (three times
    // as wide as first built, Xn), so the middle of the lane is hit about five times and its edge once.
    const o = S.ony, done = Math.hypot(o.x - b.from.x, o.z - b.from.z), STEP = BREATH_STEP;
    while (b.dropped * STEP <= done) {
      const total = Math.hypot(LAIR.flight[b.to].x - b.from.x, LAIR.flight[b.to].z - b.from.z), k = Math.min(1, (b.dropped * STEP) / total);
      const x = b.from.x + (LAIR.flight[b.to].x - b.from.x) * k, z = b.from.z + (LAIR.flight[b.to].z - b.from.z) * k;
      b.dropped++;
      const lx = LAIR.flight[b.to].x - b.from.x, lz = LAIR.flight[b.to].z - b.from.z, ll = Math.hypot(lx, lz) || 1;
      visual({ n: 'burst', x: x, z: z, nx: -lz / ll, nz: lx / ll });
      if (!S.over && Math.hypot(player.x - x, player.z - z) <= BREATH_REACH) hurt(roll(DMG.deepBreath), "Onyxia's Deep Breath");
    }
    if (!S.ony.goal) { S.breath = null; S.ony.cross = false; onyxia.act('deep', 0.01); }
  }

  // ---------- whelps ----------
  function freeWhelp(fromSlot) {
    for (let i = 0; i < S.whelps.length; i++) {
      const w = S.whelps[i];
      if (w.slot < fromSlot) continue;
      if (w.state === 'idle' || (w.state === 'dead' && combat.state.targets[w.slot].dead)) return w;
    }
    for (let i = 0; i < S.whelps.length; i++) { const w = S.whelps[i]; if (w.state === 'idle' || w.state === 'dead') return w; }
    return null;
  }
  function launchWhelp(w, side, x, z, chase) {
    if (!combat.spawn(w.slot)) return false;
    const body = bodies[w.slot];
    body.setDead(false); body.root.visible = true;
    w.side = side; w.x = x; w.z = z;
    const deep = LAIR.caveDeep[side];
    w.path = chase ? [] : [deep[1], deep[2], { x: LAIR.pack[side].x + rand(-2.5, 2.5), z: LAIR.pack[side].z + rand(-2.5, 2.5) }];
    w.state = chase ? 'chase' : 'run';
    w.chaseUntil = S.lastT + 10;
    w.rate = rand(100, 150);
    return true;
  }
  function spawnPair() {
    ['east', 'west'].forEach(function (side) {
      const w = freeWhelp(FIRST_WHELP);
      const deep = LAIR.caveDeep[side][0];
      if (w && launchWhelp(w, side, deep.x + rand(-2, 2), deep.z + rand(-3, 3), false)) S.wave.left--;
    });
  }
  function whelpWaves(t) {
    if (t < S.wave.due) return;
    if (S.wave.left <= 0) {                              // the wave is out: the next one, smaller, about 90 seconds after it began
      S.wave.left = 2 * Math.round(rand(2, 5));
      S.wave.first = false;
      S.wave.every = [2, 4];
      S.wave.due = t + 90 - WAVE * 1.75;
      return;
    }
    if (S.wave.first && S.wave.left === WAVE) say('Onyxian Whelps pour out of the egg caves!', 'proc', 3);
    spawnPair();
    S.wave.due = t + rand(S.wave.every[0], S.wave.every[1]);
  }
  function moveWhelps(dt, t, player) {
    S.whelps.forEach(function (w) {
      const body = bodies[w.slot];
      if (w.state === 'idle') return;
      if (combat.state.targets[w.slot].dead) { if (w.state !== 'dead') { w.state = 'dead'; } body.setMoving(false); return; }
      let goal = null;
      if (w.state === 'run') goal = w.path[0];
      else if (w.state === 'chase') {
        goal = { x: player.x, z: player.z };
        if (t >= w.chaseUntil) {                          // an off-tank picks it up
          w.state = 'run';
          w.path = [{ x: LAIR.pack[w.side].x + rand(-2.5, 2.5), z: LAIR.pack[w.side].z + rand(-2.5, 2.5) }];
          goal = w.path[0];
        }
      }
      if (w.state === 'pack') {
        body.setMoving(false);
        const ot = LAIR.offtank[w.side];
        body.place(w.x, w.z, yawTo(w.x, w.z, ot.x, ot.z));
        if (t >= w.swingAt) { w.swingAt = t + rand(1.2, 2.2); visual({ n: 'whelp', s: w.slot }); }
        if (!S.over) combat.raidHurt(w.slot, w.rate * dt);   // the raid's area spells
        return;
      }
      if (!goal) return;
      const dx = goal.x - w.x, dz = goal.z - w.z, d = Math.hypot(dx, dz);
      const reach = w.state === 'chase' ? 1.6 : 0.3;
      if (d > reach + 0.05) {                             // (a margin: walking to exactly `reach` would never count as there)
        const step = Math.min(w.state === 'chase' ? d - reach : d, WHELP_SPEED * dt);
        w.x += dx / d * step; w.z += dz / d * step;
        body.setMoving(true);
        body.place(w.x, w.z, yawTo(w.x, w.z, goal.x, goal.z));
      } else {
        body.setMoving(false);
        if (w.state === 'run') { w.path.shift(); if (!w.path.length) w.state = 'pack'; }
        else if (w.state === 'chase' && t >= w.swingAt && !S.over) {
          w.swingAt = t + 2;
          visual({ n: 'whelp', s: w.slot });
          hurt(roll(DMG.whelp), 'Onyxian Whelp');
        }
      }
      if (w.state === 'chase' && !S.over) combat.raidHurt(w.slot, w.rate * 0.5 * dt);
    });
  }
  // Walking into an egg cave hatches the eggs around you: the whelps go for you until an off-tank picks them up.
  function eggs(t, player) {
    const cave = caveOf(player.x, player.z);
    if (!cave || t < S.hatchAt) return;
    let hatched = 0;
    lair.eggs.forEach(function (e) {
      if (e.hatched || e.cave !== cave || hatched >= 3 || Math.hypot(e.x - player.x, e.z - player.z) > 4) return;
      const w = freeWhelp(FIRST_WHELP + WAVE);
      if (!w) return;
      e.hatched = true; e.mesh.visible = false;
      visual({ n: 'hatch', x: e.x, z: e.z });
      if (launchWhelp(w, cave, e.x, e.z, true)) hatched++;
    });
    if (hatched) { S.hatchAt = t + 1; say('You stepped on her eggs: ' + (hatched === 1 ? 'a whelp hatches' : hatched + ' whelps hatch') + '!', 'miss', 2.5); }
  }

  // While she breathes, the egg caves are searing hot: nobody hides from Deep Breath in them.
  function heatStep(dt, t, player) {
    const hot = !!S.breath && !S.over;
    S.heat += ((hot ? 1 : 0) - S.heat) * Math.min(1, dt * 3);
    lair.setHeat(S.heat);
    if (!hot) { S.heatSaid = false; return; }
    if (!caveOf(player.x, player.z)) return;
    if (!S.heatSaid) { S.heatSaid = true; h.log('The egg cave is searing hot!', 'miss'); }
    if (t >= S.heatAt) { S.heatAt = t + 1; hurt(roll(DMG.heatedGround), 'Heated Ground'); }
  }

  // ---------- the Warder ----------
  function warderStep(dt, t, player) {
    const W = S.warder;
    if (W.state === 'idle' || W.state === 'dead') return;
    if (combat.state.targets[2].dead) { W.state = 'dead'; warder.setMoving(false); return; }
    if (W.state === 'walk') {
      const goal = LAIR.pack.warder, dx = goal.x - W.x, dz = goal.z - W.z, d = Math.hypot(dx, dz);
      if (d > 0.3) {
        const step = Math.min(d, WARDER_SPEED * dt);
        W.x += dx / d * step; W.z += dz / d * step;
        warder.setMoving(true);
        warder.place(W.x, W.z, yawTo(W.x, W.z, goal.x, goal.z));
      } else { W.state = 'held'; warder.setMoving(false); W.nova = t + rand(4, 8); W.lash = t + rand(3, 6); }
      return;
    }
    warder.place(W.x, W.z, yawTo(W.x, W.z, LAIR.offtank.warder.x, LAIR.offtank.warder.z));
    if (!S.over) combat.raidHurt(2, rand(1900, 2300) * dt);
    if (S.over) return;
    if (t >= W.nova) {
      W.nova = t + rand(8, 12);
      visual({ n: 'nova', x: W.x, z: W.z });
      if (Math.hypot(player.x - W.x, player.z - W.z) <= 10) hurt(roll(DMG.fireNova), "Onyxian Warder's Fire Nova");
    }
    if (t >= W.lash) {
      W.lash = t + rand(8, 12);
      visual({ n: 'warder' });
      visual({ n: 'tank', w: 'warder', k: 'swing' });
      if (Math.hypot(player.x - W.x, player.z - W.z) <= 20) hurt(roll(DMG.flameLash), "Onyxian Warder's Flame Lash");
    }
  }

  // ---------- phase 3: Bellowing Roar, the fear, the lava ----------
  function roarStep(t, player) {
    if (S.roar) {
      S.shake = 0.6;
      if (t < S.roar.ends) return;
      S.roar = null;
      S.shake = 0;
      if (!S.over) {
        S.fear = { ends: t + 3, turnAt: t };
        h.log('Onyxia\'s Bellowing Roar: you flee in fear!', 'miss');
        visual({ n: 'fear', x: player.x, z: player.z });
      }
      // The cracks erupt again and again while you are feared, and a few seconds after (Xn: "make the fire pop up more
      // frequent when feared"): each one about every second, from the moment the roar lands.
      const list = [];
      lair.fissures.forEach(function (f) { for (let at = t + rand(0.2, 1.0); at < t + 6; at += rand(0.8, 1.4)) list.push({ at: at, fissure: f, done: false }); });
      S.erupt = { from: t, ends: t + 6.5, list: list };
      S.next.roar = t + rand(15, 45);
      return;
    }
    if (t >= S.next.roar && !S.cast) {
      S.roar = { ends: t + 1.5 };
      act('roar', 1.8);
      say("Onyxia's Bellowing Roar!", 'miss', 2);
      h.sound.play('warn');
    }
  }
  function fearStep(t, player) {
    if (!S.fear) return;
    if (t >= S.fear.ends || S.over) { S.fear = null; h.controls.steer(null); return; }
    if (t >= S.fear.turnAt) {
      S.fear.turnAt = t + rand(0.7, 1.2);
      for (let k = 0; k < 12; k++) {
        const a = Math.random() * Math.PI * 2, vx = Math.sin(a) * 6.5, vz = Math.cos(a) * 6.5;
        if (walkable(player.x + vx * 1.2, player.z + vz * 1.2)) { h.controls.steer(vx, vz); break; }
      }
    }
  }
  function eruptStep(t, player) {
    const E = S.erupt;
    if (!E) { lair.setFissures(S.roar ? 0.7 : 0); return; }
    lair.setFissures(1);
    E.list.forEach(function (e) {
      if (e.done || t < e.at) return;
      e.done = true;
      visual({ n: 'erupt', i: lair.fissures.indexOf(e.fissure) });
      if (!S.over && lair.nearestFissure(player.x, player.z).fissure === e.fissure && lair.nearestFissure(player.x, player.z).distance <= ERUPT_REACH) hurt(roll(DMG.eruption), 'Lava Eruption');
    });
    if (t >= E.ends) S.erupt = null;
  }

  // ---------- moving her ----------
  function moveOnyxia(dt, t) {
    const o = S.ony;
    if (o.goal) {
      const dx = o.goal.x - o.x, dz = o.goal.z - o.z, dy = o.goal.y - o.y, d = Math.hypot(dx, dz), d3 = Math.hypot(d, dy);
      const speed = S.phase === 'toLiftoff' ? RUN : S.phase === 'liftoff' ? 5 : o.cross ? CROSS_SPEED : FLY_SPEED;
      if (d3 > 0.3) {
        const step = Math.min(d3, speed * dt);
        o.x += dx / d3 * step; o.z += dz / d3 * step; o.y += dy / d3 * step;
        if (d > 1 && (S.phase === 'toLiftoff' || o.cross || S.phase === 'toNorth' || S.phase === 'landing' || S.phase === 'air')) o.yaw = turn(o.yaw, yawTo(o.x, o.z, o.goal.x, o.goal.z), 3, dt);
        onyxia.setSpeed(S.phase === 'toLiftoff' ? RUN : 0);
      } else {
        o.y = o.goal.y;
        o.goal = null;
        onyxia.setSpeed(0);
      }
    } else onyxia.setSpeed(0);
    // Facing: her tank on the ground; the middle of the room in the air.
    if (!o.goal && (S.phase === 'p1' || S.phase === 'p3')) o.yaw = turn(o.yaw, yawTo(o.x, o.z, tanks.main.x, tanks.main.z), 1.6, dt);
    if (!o.goal && S.phase === 'air' && !S.breath) o.yaw = turn(o.yaw, yawTo(o.x, o.z, 0, 0), 1.2, dt);
    onyxia.place(o.x, o.z, o.yaw, o.y);
  }
  function moveTank(dt) {
    const tk = tanks.main, g = S.tankGoal, dx = g.x - tk.x, dz = g.z - tk.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { const step = Math.min(d, 7 * dt); tk.setMoving(true); tk.place(tk.x + dx / d * step, tk.z + dz / d * step, yawTo(tk.x, tk.z, g.x, g.z)); }
    else { tk.setMoving(false); tk.place(tk.x, tk.z, yawTo(tk.x, tk.z, S.ony.x, S.ony.z)); }
  }

  // ---------- every frame ----------
  function update(dt, time, player, fight) {
    combat = fight;
    const started = fight.state.fightStart !== null, t = started ? fight.fightSeconds() : -1;
    S.lastT = t;
    S.over = fight.state.over;
    const hp = fight.state.targets[1].hpPct;
    if (started && !S.started) {
      S.started = true;
      S.phase = 'p1';
      onyxia.setMode('stand');
      say('Onyxia: "How fortuitous. Usually, I must leave my lair in order to feed."', 'proc', 4);
      groundTimers(t, false);
    }
    if (S.started && !S.over) {
      if (S.phase === 'p1') {
        groundAbilities(t, player);
        if (hp <= 65 && !S.cast) {
          S.phase = 'toLiftoff';
          say('Onyxia: "This meaningless exertion bores me. I\'ll incinerate you all from above!"', 'proc', 4);
          S.ony.goal = { x: LAIR.liftoff.x, z: LAIR.liftoff.z, y: 0 };
          S.tankGoal = { x: 0, z: -18 };
          S.next.warder = t + 8;                         // the Warder walks in once she is up
        }
      }
      if (S.next.warder && t >= S.next.warder) {          // the Warder walks in through the tunnel
        S.next.warder = 0;
        if (fight.spawn(2)) { S.warder.state = 'walk'; warder.root.visible = true; warder.setDead(false); h.log('An Onyxian Warder comes in through the tunnel.', 'proc'); }
      }
      if (S.phase === 'toLiftoff') {
        if (!S.ony.goal) { S.phase = 'liftoff'; S.next.liftoff = t + 3.5; onyxia.setMode('fly'); S.ony.goal = { x: S.ony.x, z: S.ony.z, y: LAIR.flyHeight * 0.6 }; }
      } else if (S.phase === 'liftoff') {
        if (t >= S.next.liftoff) {
          S.phase = 'toNorth';
          S.wave = { due: t + 3, left: WAVE, every: [1, 2.5], first: true };
          S.point = 0;
          flyTo(LAIR.flight[0]);
        }
      } else if (S.phase === 'toNorth') {
        if (!S.ony.goal) { S.phase = 'air'; S.airFrom = t; S.next.fireball = t; S.next.move = t + 25; }
      } else if (S.phase === 'air') {
        if (!S.breath && t >= S.next.fireball) { fireball(t, player); S.next.fireball = t + rand(3, 5); }
        airMove(t);
        deepBreath(t, player);
        if (hp <= 40 && !S.breath) {
          S.phase = 'landing';
          say('Onyxia: "It seems you\'ll need another lesson, mortals!"', 'proc', 4);
          S.ony.goal = { x: LAIR.land.x, z: LAIR.land.z, y: 0 };
          S.tankGoal = { x: LAIR.landTank.x, z: LAIR.landTank.z };
          S.wave.due = Infinity;
        }
      } else if (S.phase === 'landing') {
        if (!S.ony.goal) {
          if (!S.next.landed) { S.next.landed = t + 2; onyxia.setMode('stand'); }
          else if (t >= S.next.landed) { S.phase = 'p3'; groundTimers(t, true); S.next.roar = t; S.next.smallWhelps = t + rand(20, 30); }
        }
      } else if (S.phase === 'p3') {
        // Now and then a few whelps crawl out (about five): held by the off-tanks like the others.
        if (t >= S.next.smallWhelps) {
          S.next.smallWhelps = t + rand(35, 50);
          let out = 0;
          ['east', 'west'].forEach(function (side) {
            const n = Math.random() < 0.5 ? 2 : 3, deep = LAIR.caveDeep[side][0];
            for (let k = 0; k < n; k++) { const w = freeWhelp(FIRST_WHELP); if (w && launchWhelp(w, side, deep.x + rand(-2, 2), deep.z + rand(-3, 3), false)) out++; }
          });
          if (out) h.log('More whelps crawl out of the egg caves.', 'proc');
        }
        roarStep(t, player);
        if (!S.roar) groundAbilities(t, player);
      }
      whelpWaves(t);
      eggs(t, player);
    }
    if (S.started) {
      heatStep(dt, t, player);
      fireballs(t, player);
      warderStep(dt, t, player);
      moveWhelps(dt, t, player);
      fearStep(t, player);
      eruptStep(t, player);
      // The healers.
      for (let i = S.heals.length - 1; i >= 0; i--) if (t >= S.heals[i].at) { if (!S.over) fight.heal(S.heals[i].amount, 'the raid'); S.heals.splice(i, 1); }
    }
    if (S.over && fight.state.targets[1].hpPct <= 0.01 && !onyxia.dead) {   // the clock ran out: she is dead
      onyxia.setDead(true);
      h.log('Onyxia dies. The lair falls silent.', 'proc');
      S.fireballs.forEach(function (f) { f.marker.live = false; f.marker.group.visible = false; });
      S.fireballs.length = 0;
    }
    if (S.over && S.fear) { S.fear = null; h.controls.steer(null); }
    moveOnyxia(dt, t);
    moveTank(dt);
    syncSpots();
    // Animation.
    onyxia.update(dt, time);
    warder.update(dt, time);
    whelps.forEach(function (w) { if (w.root.visible) w.update(dt, time); });
    Object.keys(tanks).forEach(function (k) { tanks[k].update(dt, time); });
    const banner = S.banner && t < S.banner.until ? { text: S.banner.text, soon: false, emote: S.banner.emote } : null;
    if (S.banner && t >= S.banner.until) S.banner = null;
    return { banner: banner, shake: S.shake, feared: !!S.fear };
  }

  // What the replay keeps ten times a second: where everything is and how it looks.
  function r2(v) { return Math.round(v * 100) / 100; }
  function snapshot() {
    const banner = S.banner && S.lastT < S.banner.until ? S.banner.text : '';
    return {
      o: [r2(S.ony.x), r2(S.ony.z), r2(S.ony.y), r2(S.ony.yaw)], om: onyxia.mode(), od: onyxia.dead ? 1 : 0, os: S.phase === 'toLiftoff' && S.ony.goal ? 1 : 0,
      w: [r2(S.warder.x), r2(S.warder.z), r2(warder.yaw), warder.root.visible ? 1 : 0, warder.dead ? 1 : 0, S.warder.state === 'walk' ? 1 : 0],
      wh: S.whelps.map(function (w) { const b = bodies[w.slot]; return [r2(w.x), r2(w.z), r2(b.yaw), b.root.visible ? 1 : 0, b.dead ? 1 : 0, w.state === 'run' || w.state === 'chase' ? 1 : 0]; }),
      tk: TANKS.map(function (k) { return [r2(tanks[k].x), r2(tanks[k].z), r2(tanks[k].yaw)]; }),
      fl: lair.fissureLevel(), ht: r2(S.heat),
      fb: S.fireballs.map(function (f) { return [r2(f.x), r2(f.z), r2(f.marker.fill.material.opacity)]; }),
      bn: banner, fr: S.fear ? 1 : 0
    };
  }
  // Between two snapshots: positions blended, the rest from the first.
  function mixSnap(a, b, f) {
    const m = function (p, q) { return p + (q - p) * f; };
    const turnTo = function (p, q) { let d = q - p; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return p + d * f; };
    const out = Object.assign({}, a);
    out.o = [m(a.o[0], b.o[0]), m(a.o[1], b.o[1]), m(a.o[2], b.o[2]), turnTo(a.o[3], b.o[3])];
    out.w = a.w.slice(); out.w[0] = m(a.w[0], b.w[0]); out.w[1] = m(a.w[1], b.w[1]);
    out.wh = a.wh.map(function (p, i) { const q = b.wh[i]; if (!q || !p[3] || !q[3]) return p; const r = p.slice(); r[0] = m(p[0], q[0]); r[1] = m(p[1], q[1]); r[2] = turnTo(p[2], q[2]); return r; });
    out.tk = a.tk.map(function (p, i) { const q = b.tk[i]; return [m(p[0], q[0]), m(p[1], q[1]), turnTo(p[2], q[2])]; });
    return out;
  }
  // Puts every creature where a snapshot says, and moves their animations on.
  function applySnap(n, dt, time) {
    if (!n) return;
    if (onyxia.dead !== !!n.od) onyxia.setDead(!!n.od);
    if (!n.od) onyxia.setMode(n.om);
    onyxia.setSpeed(n.os ? RUN : 0);
    onyxia.place(n.o[0], n.o[1], n.o[3], n.o[2]);
    warder.root.visible = !!n.w[3];
    if (warder.dead !== !!n.w[4]) warder.setDead(!!n.w[4]);
    warder.setMoving(!!n.w[5]);
    warder.place(n.w[0], n.w[1], n.w[2]);
    n.wh.forEach(function (p, i) {
      const b = bodies[FIRST_WHELP + i];
      if (b.dead !== !!p[4]) b.setDead(!!p[4]);
      b.root.visible = !!p[3];
      b.setMoving(!!p[5]);
      b.place(p[0], p[1], p[2]);
    });
    TANKS.forEach(function (k, i) { tanks[k].place(n.tk[i][0], n.tk[i][1], n.tk[i][2]); });
    lair.setFissures(n.fl);
    lair.setHeat(n.ht);
    markers.forEach(function (mk) { mk.live = false; mk.group.visible = false; });
    n.fb.forEach(function (p) { const mk = marker(); mk.live = true; mk.group.visible = true; mk.group.position.set(p[0], 0, p[1]); mk.fill.material.opacity = p[2]; });
    onyxia.update(dt, time);
    warder.update(dt, time);
    whelps.forEach(function (w) { if (w.root.visible) w.update(dt, time); });
    TANKS.forEach(function (k) { tanks[k].update(dt, time); });
  }

  fresh();
  return {
    snapshot: snapshot, mixSnap: mixSnap, applySnap: applySnap, playFx: playFx,
    // After watching again: everything back as the fight left it.
    restore: function () { applySnap(snapshot(), 0, 0); },
    group: group, bodies: bodies, spots: spots, count: COUNT,
    show: function (on) { group.visible = on; },
    reset: function () { if (S && S.fear) h.controls.steer(null); fresh(); },
    update: update,
    feared: function () { return !!(S && S.fear); },
    flying: function (ti) { return ti === 1 && S.ony.y > 3; },
    // What stands in the way of walking: Onyxia while she is on the ground.
    collider: function () { return S.ony.y < 1 && !onyxia.dead ? { x: S.ony.x, z: S.ony.z, r: 5 } : null; },
    targetName: function (ti) { return ti === 1 ? 'Onyxia' : ti === 2 ? 'Onyxian Warder' : 'Onyxian Whelp'; },
    targetSub: function (ti) { return ti === 1 ? 'Boss · ' + phaseName() : ti === 2 ? 'Elite' : 'Whelp'; },
    smallPlate: function (ti) { return ti >= FIRST_WHELP; },
    groups: function (by) {
      let whelpDmg = 0;
      for (let i = FIRST_WHELP; i < by.length; i++) whelpDmg += by[i] || 0;
      return [{ name: 'Onyxia', dmg: by[1] || 0 }, { name: 'Warder', dmg: by[2] || 0 }, { name: 'Whelps', dmg: whelpDmg }].filter(function (g, i) { return i === 0 || g.dmg > 0; });
    },
    markScale: function (ti) { return ti === 1 ? 3.2 : ti === 2 ? 1.2 : 0.45; },
    lift: function (ti) { return ti === 1 ? S.ony.y : 0; },
    phase: function () { return S.phase; },
    state: function () { return S; }                  // for checks from the console
  };
  function phaseName() { return S.phase === 'p1' || S.phase === 'asleep' ? 'phase 1' : S.phase === 'p3' ? 'phase 3' : S.phase === 'landing' ? 'landing' : 'phase 2'; }
}
