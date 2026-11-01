// Onyxia (Xn, 2026-10-29), as in the Classic fight with the Warder of Season of Mastery walking in at phase 2. Numbers
// and timers from the game's data and the Classic fight. Xn's choices:
//   - the kill lasts about 6 minutes and she loses health at an even pace whether you attack or not (a timed fight:
//     her health follows the clock along CURVE; your damage is counted, not taken from her);
//   - a ghost tank holds her the whole fight; the first wave of whelps is 20, and they gather at the mouth of each egg
//     cave where a ghost off-tank holds them; a ghost off-tank holds the Warder in the tunnel;
//   - her fireballs sometimes go at you, sometimes at other places in the room; Deep Breath hits 4,000-5,000 a time.
// The engine (js/raid.js) runs this script; the shared mechanics come from js/mechanics.js; the room is js/lair.js.
import * as THREE from 'three';
import { LAIR, caveOf, inChamber, ERUPT_REACH, buildLair } from './lair.js';
import { makeOnyxia, makeWhelp, makeWarder } from './onyxia.js';
import { makeGhostTank } from './creatures.js';
import { facing, inCone, behind, coneZone, knockback, circleStrikes, fear, adds } from './mechanics.js';

// Xn, 2026-10-29: phase 2 twice as long as an even pace would make it ("let the fight extend over 4 minutes"):
// 100% to 65% in 84 s, 65% to 40% in 168 s, 40% to 0% in 96 s. Her health follows this whatever you do.
const CURVE = [[0, 100], [84, 65], [252, 40], [348, 0]];
const SECONDS = 348;
const WAVE = 20, EXTRA = 8, FIRST_WHELP = 3, COUNT = 2 + WAVE + EXTRA;
const HEALTH = { onyxia: 1099230, warder: 106821, whelp: 3052 };
const BREATH_REACH = 21, BREATH_STEP = 7.8;           // Deep Breath: how far each burst reaches, how far apart they are
const RUN = 9, FLY_SPEED = 16, CROSS_SPEED = 22;

// How much each thing hurts (the game's own spell values; marked "guess" where no source has a number).
const DMG = {
  flameBreath: [3063, 3937], cleave: [3000, 4000] /* guess: her melee is not known */, wingBuffet: [563, 937], tailSweep: [600, 1000],
  fireball: [1700, 2300], deepBreath: [4000, 5000], eruption: [1425, 1575], whelp: [450, 650] /* guess */,
  fireNova: [900, 1100] /* guess */, flameLash: [56, 64], heatedGround: [950, 1050] /* guess: every second in an egg cave during Deep Breath */
};

const SLOTS = [null, { name: 'Onyxia', health: HEALTH.onyxia, group: 'Onyxia', markScale: 3.2 },
               { name: 'Onyxian Warder', health: HEALTH.warder, sub: 'Elite', group: 'Warder', markScale: 1.2, absent: true }];
for (let i = FIRST_WHELP; i <= COUNT; i++) SLOTS.push({ name: 'Onyxian Whelp', health: HEALTH.whelp, sub: 'Whelp', group: 'Whelps', small: true, markScale: 0.45, absent: true });
const WHELP_SLOTS = [];
for (let i = FIRST_WHELP; i <= COUNT; i++) WHELP_SLOTS.push(i);

export const ONYXIA = {
  id: 'onyxia', name: 'Onyxia', where: "Onyxia's Lair", seconds: SECONDS, curve: CURVE, slots: SLOTS, collider: 5,
  deathLine: 'Onyxia dies. The lair falls silent.',
  short: 'About six minutes. Stay off her front and tail, dodge Deep Breath, keep out of the egg caves, mind the lava after each fear.',
  text: 'About six minutes in her lair. A ghost tank holds her; she loses health on a fixed schedule (phase 2 at 65% after 1:24, phase 3 at 40% after 4:12), so the fight is about staying alive and keeping your damage up. ' +
        'Phase 1: stand on her side - Flame Breath, Cleave and Wing Buffet hit the front, Tail Sweep the back. ' +
        'Phase 2: she flies; fireballs land on you and around the room, Deep Breath burns a lane across the cave at least twice (watch for the emote and get to the side), 20 whelps come out of the egg caves and more later, and an Onyxian Warder walks in. Stay out of the egg caves: they burn while she breathes. ' +
        'Phase 3: she lands; Bellowing Roar fears everyone, and the lava cracks erupt after each fear.',
  // The sim cannot fight Onyxia: it is measured in a fight of the same length on one target with about as much moving
  // (phase 2's repositioning and phase 3's fears). Not immune to fire (Xn, 2026-10-30: "so we can practice every build").
  sim: { moveEvery: 20, moveDuration: 3, hitEvery: 0 },
  room: buildLair,
  script: onyxiaScript
};

function onyxiaScript(R) {
  const lair = R.room, effects = R.effects, rand = R.rand, roll = R.roll, yawTo = R.yawTo, turn = R.turn;
  // ---------- the creatures ----------
  const onyxia = R.body(1, makeOnyxia()), warder = R.body(2, makeWarder());
  WHELP_SLOTS.forEach(function (s) { R.body(s, makeWhelp()); });
  const tanks = { main: R.prop(makeGhostTank()), east: R.prop(makeGhostTank()), west: R.prop(makeGhostTank()), warder: R.prop(makeGhostTank()) };
  // ---------- the mechanics ----------
  const fireballs = R.use(circleStrikes(R, { radius: 5, name: 'fireball' }));
  const fearing = R.use(fear(R, { speed: 6.5 }));
  const whelps = R.use(adds(R, { speed: 8, reach: 1.6, swing: { every: 2, dmg: DMG.whelp, what: 'Onyxian Whelp' }, heldSwing: [1.2, 2.2], rate: [100, 150], chaseFor: 10 }));
  const warders = R.use(adds(R, { speed: 5, heldSwing: null, rate: [1900, 2300], perFrame: true,
                                  held: function (a, t) { O.warder.nova = t + rand(4, 8); O.warder.lash = t + rand(3, 6); } }));

  let O = null;                                          // this fight's own state
  function mouthAt(into) { return onyxia.mouthAt(into); }

  // ---------- her looks (each also goes to "Watch it again") ----------
  const V = new THREE.Vector3(), V2 = new THREE.Vector3();
  R.fx('act', function (fx) { onyxia.act(fx.a, fx.s); });
  R.fx('cone', function (fx) {
    for (let i = 0; i < 26; i++) {
      const a = fx.yaw + rand(-fx.a, fx.a), r = rand(4, fx.r), ax = -Math.sin(a), az = -Math.cos(a);
      const at = V.set(fx.x + ax * r, 0.8 + Math.random() * 2, fx.z + az * r);
      if (i < 10) effects.play('burn', { at: at });
      else effects.puff(at, i % 2 ? 0xff7a1f : 0xffc23d, 2.2 + Math.random() * 1.5, 0.7, ax * 2, 1.2, az * 2, 0.6);
    }
    effects.ball(V.set(fx.m[0], fx.m[1], fx.m[2]), 0xffa040, 1.6, 0.35);
  });
  R.fx('buffet', function (fx) { effects.ring(V.set(fx.x, 0.3, fx.z), 0xd8c0a0, 2, 30, 0.6, true); });
  R.fx('tail', function (fx) { effects.ring(V.set(fx.x, 0.4, fx.z), 0xc8a080, 1, 14, 0.5, true); });
  R.fx('burst', function (fx) {                          // fire across the whole width of the lane
    for (let k = -2; k <= 2; k++) {
      const off = k * BREATH_REACH * 0.4, x = fx.x + (fx.nx || 0) * off, z = fx.z + (fx.nz || 0) * off;
      effects.column(V.set(x, 0, z), 0xff6a1a, 0xffd27a, 8, 3.6, 0.8);
      if (k % 2 === 0) effects.puff(V.set(x, 1, z), 0xff7a1f, 7, 1.0, 0, 2.5, 0, 0.8);
    }
  });
  R.fx('erupt', function (fx) {
    const fis = lair.fissures[fx.i];
    if (!fis) return;
    [fis.points[1], fis.points[3]].forEach(function (p) { effects.column(V.set(p[0], 0, p[1]), 0xff5a14, 0xffd27a, 4.5, 1.4, 0.6); });
    effects.puff(V.set(fis.cx, 0.8, fis.cz), 0xff7a1f, 4, 0.7, 0, 2, 0, 0.8);
  });
  R.fx('nova', function (fx) { effects.ring(V.set(fx.x, 0.4, fx.z), 0xff6a1a, 1, 10, 0.6, false); effects.ring(V.set(fx.x, 0.6, fx.z), 0xffc23d, 0.5, 8, 0.5, true); warder.nova(); });
  R.fx('hatch', function (fx) { effects.sparks(V.set(fx.x, 0.8, fx.z), 0x9a6aff, 10, 1); });
  R.fx('tank', function (fx) { if (tanks[fx.w]) tanks[fx.w][fx.k](); });
  R.fx('warder', function () { warder.attack(); });
  function act(name, seconds) { R.visual({ n: 'act', a: name, s: seconds }); }
  // Fire poured out in a cone in front of her (Flame Breath; looks only).
  function coneFire(range, halfAngle) {
    onyxia.mouthAt(V2);
    R.visual({ n: 'cone', x: O.ony.x, z: O.ony.z, yaw: O.ony.yaw, m: [V2.x, V2.y, V2.z], r: range, a: halfAngle });
  }

  // ---------- a new fight ----------
  function reset() {
    O = {
      ony: { x: LAIR.home.x, z: LAIR.home.z, y: 0, yaw: Math.PI, goal: null, cross: false },
      point: 0,                                          // her place in the air (index into LAIR.flight)
      next: {},                                          // when each ability comes next (fight seconds)
      cast: null,                                        // { name, ends } an ability with a cast time
      breath: null,                                      // Deep Breath: { step: 'inhale' | 'cross', ends, from, to, dropped }
      wave: { due: Infinity, left: 0, every: [1, 2.5], first: true },
      warder: { nova: 0, lash: 0 },
      erupt: null,                                       // { from, ends, list: [{ at, fissure, done }] }
      roar: null,                                        // { ends } the roar being cast
      tankGoal: { x: LAIR.tank.x, z: LAIR.tank.z },
      hatchAt: 0, heat: 0, heatAt: 0, heatSaid: false, breaths: 0, airFrom: 0
    };
    lair.eggs.forEach(function (e) { e.hatched = false; e.mesh.visible = true; });
    onyxia.setDead(false);
    onyxia.setMode('sleep');
    onyxia.place(O.ony.x, O.ony.z, O.ony.yaw, 0);
    warder.setDead(false);
    warder.root.visible = false;
    warder.place(LAIR.tunnelEnd.x, LAIR.tunnelEnd.z, Math.PI);
    WHELP_SLOTS.forEach(function (s) { R.bodies[s].setDead(false); R.bodies[s].root.visible = false; });
    tanks.main.place(LAIR.tank.x, LAIR.tank.z, Math.PI);
    tanks.east.place(LAIR.offtank.east.x, LAIR.offtank.east.z, yawTo(LAIR.offtank.east.x, LAIR.offtank.east.z, LAIR.pack.east.x, LAIR.pack.east.z));
    tanks.west.place(LAIR.offtank.west.x, LAIR.offtank.west.z, yawTo(LAIR.offtank.west.x, LAIR.offtank.west.z, LAIR.pack.west.x, LAIR.pack.west.z));
    tanks.warder.place(LAIR.offtank.warder.x, LAIR.offtank.warder.z, 0);
    lair.setFissures(0);
    lair.setHeat(0);
  }

  // ---------- phase 1 and 3: on the ground ----------
  function groundTimers(t, third) {
    O.next.flameBreath = t + rand(10, 20);
    O.next.cleave = t + rand(2, 5);
    O.next.tailSweep = t + rand(15, 20);
    O.next.wingBuffet = t + rand(10, 20);
    O.next.knockAway = t + (third ? rand(10, 20) : rand(20, 30));
    O.next.melee = t + 2;
  }
  const REACH = onyxia.radius * 0.5;                     // part of her body counts toward a reach
  function groundAbilities(t, player) {
    if (O.cast) {
      if (t < O.cast.ends) return;
      const name = O.cast.name;
      O.cast = null;
      if (name === 'flameBreath') {
        coneFire(45, Math.PI / 4);
        if (inCone(O.ony, player, 45, Math.PI / 4, REACH)) R.hurt(roll(DMG.flameBreath), "Onyxia's Flame Breath");
        R.sound.play('ignite');
      } else if (name === 'wingBuffet') {
        R.visual({ n: 'buffet', x: O.ony.x, z: O.ony.z });
        if (inCone(O.ony, player, 30, 0.9, REACH)) {
          R.hurt(roll(DMG.wingBuffet), "Onyxia's Wing Buffet");
          const r = facing(O.ony, player);
          knockback(R, r.dx, r.dz, 24, 5);
        }
      }
      return;
    }
    if (t >= O.next.flameBreath) { O.cast = { name: 'flameBreath', ends: t + 2 }; act('breath', 3.0); O.next.flameBreath = t + 2 + rand(10, 20); return; }
    if (t >= O.next.wingBuffet) { O.cast = { name: 'wingBuffet', ends: t + 1 }; act('buffet', 1.3); O.next.wingBuffet = t + 1 + rand(15, 30); return; }
    if (t >= O.next.tailSweep) {
      act('tail', 0.9);
      O.next.tailSweep = t + rand(15, 20);
      const o = O.ony;
      R.visual({ n: 'tail', x: o.x + Math.sin(o.yaw) * 10, z: o.z + Math.cos(o.yaw) * 10 });
      if (behind(O.ony, player, 30, 0.9, REACH)) {
        R.hurt(roll(DMG.tailSweep), "Onyxia's Tail Sweep");
        // Flung about 40 yards (Xn) to the side you stand on, and a little back: speed / fade = distance.
        const r = facing(O.ony, player), sx = -r.fz * r.side - r.fx * 0.3, sz = r.fx * r.side - r.fz * 0.3, len = Math.hypot(sx, sz) || 1;
        knockback(R, sx / len, sz / len, 112, 9, 2.8);
      }
      return;
    }
    if (t >= O.next.cleave) {
      act('cleave', 0.8);
      O.next.cleave = t + rand(5, 10);
      R.visual({ n: 'tank', w: 'main', k: 'swing' });
      if (inCone(O.ony, player, 12, 1.05, REACH)) R.hurt(roll(DMG.cleave), "Onyxia's Cleave");
      return;
    }
    if (t >= O.next.knockAway) {
      act('knock', 0.8);
      R.visual({ n: 'tank', w: 'main', k: 'knocked' });
      O.next.knockAway = t + rand(25, 40);
      return;
    }
    if (t >= O.next.melee) { O.next.melee = t + 2; R.visual({ n: 'tank', w: 'main', k: 'swing' }); }
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
    fireballs.cast({ x: x, z: z, follow: atYou, delay: 3, dmg: DMG.fireball, what: "Onyxia's Fireball", from: mouthAt });
    act('fireball', 0.8);
  }
  function flyTo(p, height) { O.ony.goal = { x: p.x, z: p.z, y: height == null ? LAIR.flyHeight : height }; }
  function airMove(t) {
    if (O.breath) return;
    if (t < O.next.move) return;
    // At least two Deep Breaths in every phase 2 (Xn: "people need to test that mechanic out"): the first move of the air
    // phase is one, and another comes at the first move a minute later; after that it is up to chance again.
    let choice = Math.floor(Math.random() * 3);
    if (O.breaths === 0 || (O.breaths === 1 && t >= O.airFrom + 60)) choice = 0;
    if (choice === 0) {                                  // Deep Breath: she breathes in, then crosses to the far side
      const from = LAIR.flight[O.point], to = (O.point + 4) % 8;
      O.breath = { step: 'inhale', ends: t + 5, from: { x: from.x, z: from.z }, to: to, dropped: 0 };
      O.breaths++;
      R.say('Onyxia takes in a deep breath...', 'miss', 5);
      act('roar', 5);
      R.sound.play('warn');
      O.next.move = t + 5 + 25;
      R.count('deep breath');
    } else {
      O.point = (O.point + (choice === 1 ? 7 : 1)) % 8;
      flyTo(LAIR.flight[O.point]);
      O.next.move = t + rand(15, 25);
    }
  }
  function deepBreath(t, player) {
    const b = O.breath;
    if (!b) return;
    if (b.step === 'inhale') {
      if (t < b.ends) return;
      b.step = 'cross';
      act('deep', 6);
      O.point = b.to;
      flyTo(LAIR.flight[b.to]);
      O.ony.cross = true;
      return;
    }
    // A burst of fire on the floor every so many yards she flies; each burns BREATH_REACH yards around it (three times
    // as wide as first built, Xn), so the middle of the lane is hit about five times and its edge once.
    const o = O.ony, done = Math.hypot(o.x - b.from.x, o.z - b.from.z), STEP = BREATH_STEP, end = LAIR.flight[b.to];
    while (b.dropped * STEP <= done) {
      const total = Math.hypot(end.x - b.from.x, end.z - b.from.z), k = Math.min(1, (b.dropped * STEP) / total);
      const x = b.from.x + (end.x - b.from.x) * k, z = b.from.z + (end.z - b.from.z) * k;
      b.dropped++;
      const lx = end.x - b.from.x, lz = end.z - b.from.z, ll = Math.hypot(lx, lz) || 1;
      R.visual({ n: 'burst', x: x, z: z, nx: -lz / ll, nz: lx / ll });
      if (!R.S.over && Math.hypot(player.x - x, player.z - z) <= BREATH_REACH) R.hurt(roll(DMG.deepBreath), "Onyxia's Deep Breath");
    }
    if (!O.ony.goal) { O.breath = null; O.ony.cross = false; onyxia.act('deep', 0.01); }
  }

  // ---------- whelps ----------
  function launchWhelp(slot, side, x, z, chase) {
    const deep = LAIR.caveDeep[side];
    const path = chase ? [] : [deep[1], deep[2], { x: LAIR.pack[side].x + rand(-2.5, 2.5), z: LAIR.pack[side].z + rand(-2.5, 2.5) }];
    return whelps.spawn(slot, { x: x, z: z, path: path, chase: chase, holdAt: LAIR.offtank[side], packAt: LAIR.pack[side] });
  }
  function spawnPair() {
    ['east', 'west'].forEach(function (side) {
      const slot = whelps.free(WHELP_SLOTS, FIRST_WHELP);
      const deep = LAIR.caveDeep[side][0];
      if (slot && launchWhelp(slot, side, deep.x + rand(-2, 2), deep.z + rand(-3, 3), false)) O.wave.left--;
    });
  }
  function whelpWaves(t) {
    if (t < O.wave.due) return;
    if (O.wave.left <= 0) {                              // the wave is out: the next one, smaller, about 90 seconds after it began
      O.wave.left = 2 * Math.round(rand(2, 5));
      O.wave.first = false;
      O.wave.every = [2, 4];
      O.wave.due = t + 90 - WAVE * 1.75;
      return;
    }
    if (O.wave.first && O.wave.left === WAVE) R.say('Onyxian Whelps pour out of the egg caves!', 'proc', 3);
    spawnPair();
    O.wave.due = t + rand(O.wave.every[0], O.wave.every[1]);
  }
  // Walking into an egg cave hatches the eggs around you: the whelps go for you until an off-tank picks them up.
  function eggs(t, player) {
    const cave = caveOf(player.x, player.z);
    if (!cave || t < O.hatchAt) return;
    let hatched = 0;
    lair.eggs.forEach(function (e) {
      if (e.hatched || e.cave !== cave || hatched >= 3 || Math.hypot(e.x - player.x, e.z - player.z) > 4) return;
      const slot = whelps.free(WHELP_SLOTS, FIRST_WHELP + WAVE);
      if (!slot) return;
      e.hatched = true; e.mesh.visible = false;
      R.visual({ n: 'hatch', x: e.x, z: e.z });
      if (launchWhelp(slot, cave, e.x, e.z, true)) hatched++;
    });
    if (hatched) { O.hatchAt = t + 1; R.say('You stepped on her eggs: ' + (hatched === 1 ? 'a whelp hatches' : hatched + ' whelps hatch') + '!', 'miss', 2.5); }
  }

  // While she breathes, the egg caves are searing hot: nobody hides from Deep Breath in them.
  function heatStep(dt, t, player) {
    const hot = !!O.breath && !R.S.over;
    O.heat += ((hot ? 1 : 0) - O.heat) * Math.min(1, dt * 3);
    lair.setHeat(O.heat);
    if (!hot) { O.heatSaid = false; return; }
    if (!caveOf(player.x, player.z)) return;
    if (!O.heatSaid) { O.heatSaid = true; R.log('The egg cave is searing hot!', 'miss'); }
    if (t >= O.heatAt) { O.heatAt = t + 1; R.hurt(roll(DMG.heatedGround), 'Heated Ground'); }
  }

  // ---------- the Warder: Fire Nova and Flame Lash while its off-tank holds it ----------
  function warderStep(t, player) {
    if (warders.state(2) !== 'held' || R.S.over) return;
    const W = warders.where(2);
    if (t >= O.warder.nova) {
      O.warder.nova = t + rand(8, 12);
      R.visual({ n: 'nova', x: W.x, z: W.z });
      if (Math.hypot(player.x - W.x, player.z - W.z) <= 10) R.hurt(roll(DMG.fireNova), "Onyxian Warder's Fire Nova");
    }
    if (t >= O.warder.lash) {
      O.warder.lash = t + rand(8, 12);
      R.visual({ n: 'warder' });
      R.visual({ n: 'tank', w: 'warder', k: 'swing' });
      if (Math.hypot(player.x - W.x, player.z - W.z) <= 20) R.hurt(roll(DMG.flameLash), "Onyxian Warder's Flame Lash");
    }
  }

  // ---------- phase 3: Bellowing Roar, the fear, the lava ----------
  function roarStep(t, player) {
    if (O.roar) {
      R.S.shake = 0.6;
      if (t < O.roar.ends) return;
      O.roar = null;
      R.S.shake = 0;
      if (!R.S.over) {
        fearing.start(3);
        R.log('Onyxia\'s Bellowing Roar: you flee in fear!', 'miss');
      }
      // The cracks erupt again and again while you are feared, and a few seconds after (Xn: "make the fire pop up more
      // frequent when feared"): each one about every second, from the moment the roar lands.
      const list = [];
      lair.fissures.forEach(function (f) { for (let at = t + rand(0.2, 1.0); at < t + 6; at += rand(0.8, 1.4)) list.push({ at: at, fissure: f, done: false }); });
      O.erupt = { from: t, ends: t + 6.5, list: list };
      O.next.roar = t + rand(15, 45);
      return;
    }
    if (t >= O.next.roar && !O.cast) {
      O.roar = { ends: t + 1.5 };
      act('roar', 1.8);
      R.say("Onyxia's Bellowing Roar!", 'miss', 2);
      R.sound.play('warn');
      R.count('bellowing roar');
    }
  }
  function eruptStep(t, player) {
    const E = O.erupt;
    if (!E) { lair.setFissures(O.roar ? 0.7 : 0); return; }
    lair.setFissures(1);
    E.list.forEach(function (e) {
      if (e.done || t < e.at) return;
      e.done = true;
      R.visual({ n: 'erupt', i: lair.fissures.indexOf(e.fissure) });
      const near = lair.nearestFissure(player.x, player.z);
      if (!R.S.over && near.fissure === e.fissure && near.distance <= ERUPT_REACH) R.hurt(roll(DMG.eruption), 'Lava Eruption');
    });
    if (t >= E.ends) O.erupt = null;
  }

  // ---------- moving her and her tank ----------
  function moveOnyxia(dt) {
    const o = O.ony, phase = R.S.phase;
    if (o.goal) {
      const dx = o.goal.x - o.x, dz = o.goal.z - o.z, dy = o.goal.y - o.y, d = Math.hypot(dx, dz), d3 = Math.hypot(d, dy);
      const speed = phase === 'toLiftoff' ? RUN : phase === 'liftoff' ? 5 : o.cross ? CROSS_SPEED : FLY_SPEED;
      if (d3 > 0.3) {
        const step = Math.min(d3, speed * dt);
        o.x += dx / d3 * step; o.z += dz / d3 * step; o.y += dy / d3 * step;
        if (d > 1 && (phase === 'toLiftoff' || o.cross || phase === 'toNorth' || phase === 'landing' || phase === 'air')) o.yaw = turn(o.yaw, yawTo(o.x, o.z, o.goal.x, o.goal.z), 3, dt);
        onyxia.setSpeed(phase === 'toLiftoff' ? RUN : 0);
      } else {
        o.y = o.goal.y;
        o.goal = null;
        onyxia.setSpeed(0);
      }
    } else onyxia.setSpeed(0);
    // Facing: her tank on the ground; the middle of the room in the air.
    if (!o.goal && (phase === 'p1' || phase === 'p3')) o.yaw = turn(o.yaw, yawTo(o.x, o.z, tanks.main.x, tanks.main.z), 1.6, dt);
    if (!o.goal && phase === 'air' && !O.breath) o.yaw = turn(o.yaw, yawTo(o.x, o.z, 0, 0), 1.2, dt);
    onyxia.place(o.x, o.z, o.yaw, o.y);
  }
  function moveTank(dt) {
    const tk = tanks.main, g = O.tankGoal, dx = g.x - tk.x, dz = g.z - tk.z, d = Math.hypot(dx, dz);
    if (d > 0.3) { const step = Math.min(d, 7 * dt); tk.setMoving(true); tk.place(tk.x + dx / d * step, tk.z + dz / d * step, yawTo(tk.x, tk.z, g.x, g.z)); }
    else { tk.setMoving(false); tk.place(tk.x, tk.z, yawTo(tk.x, tk.z, O.ony.x, O.ony.z)); }
  }

  function phaseName() { const p = R.S.phase; return p === 'p1' || p === 'asleep' ? 'phase 1' : p === 'p3' ? 'phase 3' : p === 'landing' ? 'landing' : 'phase 2'; }

  return {
    reset: reset,
    start: function (t) {
      R.S.phase = 'p1';
      onyxia.setMode('stand');
      R.say('Onyxia: "How fortuitous. Usually, I must leave my lair in order to feed."', 'proc', 4);
      groundTimers(t, false);
    },
    // While the fight runs: the phases and what she does in each.
    act: function (dt, t, player) {
      const S = R.S, hp = R.combat.state.targets[1].hpPct;
      if (S.phase === 'p1') {
        groundAbilities(t, player);
        if (hp <= 65 && !O.cast) {
          S.phase = 'toLiftoff';
          R.say('Onyxia: "This meaningless exertion bores me. I\'ll incinerate you all from above!"', 'proc', 4);
          O.ony.goal = { x: LAIR.liftoff.x, z: LAIR.liftoff.z, y: 0 };
          O.tankGoal = { x: 0, z: -18 };
          O.next.warder = t + 8;                         // the Warder walks in once she is up
        }
      }
      if (O.next.warder && t >= O.next.warder) {          // the Warder walks in through the tunnel
        O.next.warder = 0;
        if (warders.spawn(2, { x: LAIR.tunnelEnd.x, z: LAIR.tunnelEnd.z, path: [LAIR.pack.warder], holdAt: LAIR.offtank.warder })) R.log('An Onyxian Warder comes in through the tunnel.', 'proc');
      }
      if (S.phase === 'toLiftoff') {
        if (!O.ony.goal) { S.phase = 'liftoff'; O.next.liftoff = t + 3.5; onyxia.setMode('fly'); O.ony.goal = { x: O.ony.x, z: O.ony.z, y: LAIR.flyHeight * 0.6 }; }
      } else if (S.phase === 'liftoff') {
        if (t >= O.next.liftoff) {
          S.phase = 'toNorth';
          O.wave = { due: t + 3, left: WAVE, every: [1, 2.5], first: true };
          O.point = 0;
          flyTo(LAIR.flight[0]);
        }
      } else if (S.phase === 'toNorth') {
        if (!O.ony.goal) { S.phase = 'air'; O.airFrom = t; O.next.fireball = t; O.next.move = t + 25; }
      } else if (S.phase === 'air') {
        if (!O.breath && t >= O.next.fireball) { fireball(t, player); O.next.fireball = t + rand(3, 5); }
        airMove(t);
        deepBreath(t, player);
        if (hp <= 40 && !O.breath) {
          S.phase = 'landing';
          R.say('Onyxia: "It seems you\'ll need another lesson, mortals!"', 'proc', 4);
          O.ony.goal = { x: LAIR.land.x, z: LAIR.land.z, y: 0 };
          O.tankGoal = { x: LAIR.landTank.x, z: LAIR.landTank.z };
          O.wave.due = Infinity;
        }
      } else if (S.phase === 'landing') {
        if (!O.ony.goal) {
          if (!O.next.landed) { O.next.landed = t + 2; onyxia.setMode('stand'); }
          else if (t >= O.next.landed) { S.phase = 'p3'; groundTimers(t, true); O.next.roar = t; O.next.smallWhelps = t + rand(20, 30); }
        }
      } else if (S.phase === 'p3') {
        // Now and then a few whelps crawl out (about five): held by the off-tanks like the others.
        if (t >= O.next.smallWhelps) {
          O.next.smallWhelps = t + rand(35, 50);
          let out = 0;
          ['east', 'west'].forEach(function (side) {
            const n = Math.random() < 0.5 ? 2 : 3, deep = LAIR.caveDeep[side][0];
            for (let k = 0; k < n; k++) { const slot = whelps.free(WHELP_SLOTS, FIRST_WHELP); if (slot && launchWhelp(slot, side, deep.x + rand(-2, 2), deep.z + rand(-3, 3), false)) out++; }
          });
          if (out) R.log('More whelps crawl out of the egg caves.', 'proc');
        }
        roarStep(t, player);
        if (!O.roar) groundAbilities(t, player);
      }
      whelpWaves(t);
      eggs(t, player);
    },
    // Every frame once the fight began (also after it ended).
    always: function (dt, t, player) {
      heatStep(dt, t, player);
      warderStep(t, player);
      eruptStep(t, player);
    },
    move: function (dt) { moveOnyxia(dt); moveTank(dt); },
    phaseName: phaseName,
    // What she is doing right now, for her frame ('' = nothing worth a word).
    doing: function () {
      const p = R.S.phase;
      if (O.breath) return O.breath.step === 'inhale' ? 'Taking in a deep breath...' : 'Deep Breath';
      if (O.roar) return 'Casting Bellowing Roar';
      if (O.cast) return O.cast.name === 'flameBreath' ? 'Casting Flame Breath' : 'Casting Wing Buffet';
      if (p === 'toLiftoff' || p === 'liftoff') return 'Taking off';
      if (p === 'landing') return 'Landing';
      if (p === 'air' || p === 'toNorth') return 'In the air';
      return '';
    },
    // Where it is dangerous right now (for the test bot): her front and tail on the ground, the lane of a Deep Breath,
    // the egg caves (always: eggs; while she breathes: heat), the lava cracks around a roar, the Warder's Fire Nova.
    zones: function () {
      const list = [], p = R.S.phase, o = O.ony;
      if ((p === 'p1' || p === 'p3') && o.y < 1) {
        list.push(coneZone(o, 45, Math.PI / 4, REACH), coneZone(o, 30, 0.9, REACH), coneZone(o, 12, 1.05, REACH), coneZone(o, 30, 0.9, REACH, true));
      }
      if (O.breath) {
        const end = LAIR.flight[O.breath.to];
        list.push({ type: 'lane', ax: O.breath.from.x, az: O.breath.from.z, bx: end.x, bz: end.z, w: BREATH_REACH * 2 + 2 });
      }
      list.push({ type: 'area', test: function (x, z) { return !!caveOf(x, z); } });
      if (O.roar || O.erupt || p === 'p3') list.push({ type: 'area', test: function (x, z) { return lair.nearestFissure(x, z).distance <= ERUPT_REACH + 0.6; } });
      if (warders.state(2) === 'held') { const W = warders.where(2); list.push({ type: 'circle', x: W.x, z: W.z, r: 10 }); }
      return list;
    },
    // Her own part of the replay: her pose and the room's lava and heat.
    snapshot: function () { return { om: onyxia.mode(), os: R.S.phase === 'toLiftoff' && O.ony.goal ? 1 : 0, fl: lair.fissureLevel(), ht: Math.round(O.heat * 100) / 100 }; },
    applySnap: function (s) {
      if (!s) return;
      if (!onyxia.dead) onyxia.setMode(s.om);
      onyxia.setSpeed(s.os ? RUN : 0);
      lair.setFissures(s.fl);
      lair.setHeat(s.ht);
    },
    died: function () {}
  };
}
