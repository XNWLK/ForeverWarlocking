// The test arena: not a real boss (hidden from the Bosses list; FW.bossTest('testbed') or FW.startBoss('testbed') from the
// console). It exists to try the boss-fight parts together before a real boss needs them: a room from the room
// builder with pillars and braziers, a giant, elemental and demon adds, the ghost raid standing around, and every
// mechanic of the toolbox once or more. Its numbers mean nothing; nothing here is a claim about any game.
import * as THREE from 'three';
import { buildRoom } from './room.js';
import { makeGiant, makeElemental, makeDemon, makeGhostRaider } from './creatures.js';
import { facing, inCone, coneZone, knockYards, circleStrikes, pools, fear, pulse, spread, bomb, charge, adds, shield, enrage, curse } from './mechanics.js';

// A round arena with an entrance to the south.
function circle(r, n, cx, cz) { const out = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; out.push([cx + Math.sin(a) * r, cz - Math.cos(a) * r]); } return out; }
const ARENA = circle(34, 28, 0, 0);
const GATE = [[-6, 30], [6, 30], [6.5, 52], [-6.5, 52]];
const SECONDS = 180;
const SLOTS = [null, { name: 'Test Giant', health: 1000000, group: 'Giant', markScale: 1.6 }];
for (let i = 2; i <= 5; i++) SLOTS.push({ name: 'Test Elemental', health: 40000, sub: 'Add', group: 'Adds', markScale: 0.9, absent: true });
SLOTS.push({ name: 'Test Demon', health: 90000, sub: 'Elite', group: 'Adds', markScale: 1.1, absent: true });
const ADD_SLOTS = [2, 3, 4, 5], DEMON = 6;

export const TESTBED = {
  id: 'testbed', name: 'Test Giant', where: 'Test arena', seconds: SECONDS, hidden: true, collider: 2.6,
  curve: [[0, 100], [60, 70], [120, 40], [180, 0]], slots: SLOTS,
  short: 'A test fight for the boss-fight parts.', text: 'A test fight for the boss-fight parts. Not a real boss.',
  sim: { moveEvery: 20, moveDuration: 3, hitEvery: 0 },
  room: function (scene) {
    return buildRoom(scene, {
      areas: [{ name: 'arena', poly: ARENA }, { name: 'gate', poly: GATE }], seed: 7, wallHeight: 30, wallColor: 0x8a8090, wallShade: [0.9, 0.9, 1.0],
      floor: { base: '#2a2630', area: 'rgba(80,74,90,0.55)' }, rockColor: 0x3a3440,
      light: { hemi: [0xb8b0c8, 0x16121c, 1.0], ambient: [0x4a4458, 0.7], key: { color: 0xf4f0ff, intensity: 1.6, from: [-20, 60, -20], to: [0, 0, 0] } },
      props: [{ type: 'pillar', x: -20, z: -14 }, { type: 'pillar', x: 20, z: -14 }, { type: 'pillar', x: -20, z: 16 }, { type: 'pillar', x: 20, z: 16 },
              { type: 'brazier', x: -9, z: -28 }, { type: 'brazier', x: 9, z: -28 }],
      look: { background: 0x08070c, fog: [0x0c0a12, 50, 140] }, start: { x: -16, z: 6, yaw: -2.2 }
    });
  },
  script: testScript
};

function testScript(R) {
  const rand = R.rand, yawTo = R.yawTo, turn = R.turn;
  const giant = R.body(1, makeGiant({ size: 2.6, weapon: 'club', horns: true }));
  ADD_SLOTS.forEach(function (s, i) { const e = R.body(s, makeElemental({ kind: ['earth', 'fire', 'water', 'air'][i], size: 0.9 })); e.fades = true; });
  R.body(DEMON, makeDemon({ size: 1.4 }));
  // The ghost raid: two tanks, melee behind the boss, casters and healers at range.
  const tank = R.prop(makeGhostRaider('tank')), offtank = R.prop(makeGhostRaider('tank'));
  const melee = [R.prop(makeGhostRaider('melee')), R.prop(makeGhostRaider('melee')), R.prop(makeGhostRaider('melee'))];
  const casters = [R.prop(makeGhostRaider('caster')), R.prop(makeGhostRaider('caster')), R.prop(makeGhostRaider('caster'))];
  const healers = [R.prop(makeGhostRaider('healer')), R.prop(makeGhostRaider('healer'))];
  // The mechanics, every one of them.
  const strikes = R.use(circleStrikes(R, { radius: 5, name: 'meteor' }));
  const fire = R.use(pools(R, { color: 0xff5a14, name: 'fire' }));
  const voids = R.use(pools(R, { color: 0x7a3aff, name: 'void' }));
  const fearing = R.use(fear(R));
  const nova = R.use(pulse(R, { color: 0xc06aff }));
  const circleOn = R.use(spread(R));
  const bombOn = R.use(bomb(R));
  const rush = R.use(charge(R));
  const elementals = R.use(adds(R, { speed: 6, rate: [700, 900], heldSwing: [1.5, 2.5], swing: { every: 2, dmg: [300, 400], what: 'Test Elemental' } }));
  const demons = R.use(adds(R, { speed: 5, rate: [1300, 1600], heldSwing: [1.4, 2.0] }));
  const bubble = R.use(shield(R));
  R.use(enrage(R, { at: 170, every: 2, dmg: [3000, 4000], text: 'Test Giant becomes enraged!' }));
  const hex = R.use(curse(R));

  let G = null;
  const HOME = { x: 0, z: -14 }, V = new THREE.Vector3();
  R.fx('giant', function (fx) { giant.act(fx.a, fx.s); });
  R.fx('slam', function (fx) { R.effects.ring(V.set(fx.x, 0.3, fx.z), 0xd8c8a0, 1, 14, 0.6, true); });
  R.fx('raider', function (fx) { const p = R.props[fx.i]; if (p && p[fx.k]) p[fx.k](); });
  function act(a, s) { R.visual({ n: 'giant', a: a, s: s }); }

  function reset() {
    G = { x: HOME.x, z: HOME.z, yaw: 0, next: {}, cast: null, phase2: false, phase3: false };
    giant.setDead(false); giant.place(G.x, G.z, 0); giant.root.visible = true;
    ADD_SLOTS.concat([DEMON]).forEach(function (s) { R.bodies[s].setDead(false); R.bodies[s].root.visible = false; });
    tank.place(0, -22, 0);
    offtank.place(16, 22, Math.PI);
    melee.forEach(function (m, i) { m.place(-3 + i * 3, -7, Math.PI); });
    casters.forEach(function (c, i) { c.place(-12 + i * 12, 14, Math.PI); });
    healers.forEach(function (h, i) { h.place(-8 + i * 16, 22, Math.PI); });
  }
  const REACH = giant.radius * 0.5;
  function abilities(t, player) {
    const N = G.next;
    if (G.cast) {
      if (t < G.cast.ends) return;
      const c = G.cast; G.cast = null;
      if (c.name === 'cleave') { if (inCone(G, player, 10, 1.0, REACH)) R.hurt(R.roll([1500, 2000]), 'Test Cleave'); R.visual({ n: 'raider', i: 0, k: 'knocked' }); }
      if (c.name === 'stomp') {
        R.visual({ n: 'slam', x: G.x, z: G.z });
        const r = facing(G, player);
        if (r.d <= 14) { R.hurt(R.roll([800, 1200]), 'Test Stomp'); knockYards(R, r.dx, r.dz, 18, 6); }
      }
      return;
    }
    if (t >= N.cleave) { G.cast = { name: 'cleave', ends: t + 1.2 }; act('swing', 1.2); N.cleave = t + rand(8, 12); return; }
    if (t >= N.meteor) { strikes.cast({ x: player.x, z: player.z, follow: true, delay: 3, dmg: [1200, 1600], what: 'Test Meteor', from: function (into) { return giant.castFrom(into); } }); act('cast', 1); N.meteor = t + rand(9, 13); return; }
    if (t >= N.fire) {
      const p = R.room.randomPoint(Math.random, 'arena', 4);
      fire.place({ x: p.x, z: p.z, radius: 4, lasts: 25, telegraph: 2, dmg: [500, 700], what: 'Test Fire' });
      N.fire = t + rand(6, 9); return;
    }
    if (t >= N.pulse) { nova.go([600, 800], 'Test Nova', G); act('roar', 1.2); N.pulse = t + 20; return; }
    if (t >= N.charge && !rush.active()) { R.say('Test Giant turns to charge you!', 'miss', 2); rush.start({ body: giant, delay: 2, width: 4, speed: 28, dmg: [1500, 2000], what: 'Test Charge', knock: 12 }); N.charge = t + 25; return; }
    if (G.phase2 && t >= N.spread) { circleOn.mark({ radius: 6, delay: 6, dmg: [900, 1100], what: 'Test Circle' }); N.spread = t + 24; return; }
    if (G.phase2 && t >= N.curse) { hex.put({ pct: 25, lasts: 20, removedAfter: [6, 10], name: 'Curse of the Test' }); N.curse = t + 30; return; }
    if (G.phase2 && t >= N.void) { const p = R.room.randomPoint(Math.random, 'arena', 4); voids.place({ x: p.x, z: p.z, radius: 5, lasts: 30, dmg: [700, 900], what: 'Test Void' }); N.void = t + 12; return; }
    if (G.phase3 && t >= N.fear) { R.say('Test Giant roars!', 'miss', 2); act('roar', 1.5); fearing.start(3); N.fear = t + 20; return; }
    if (G.phase3 && t >= N.bomb) { bombOn.mark({ radius: 10, delay: 8, dmg: [1000, 1400], what: 'Test Bomb' }); N.bomb = t + 26; return; }
    if (G.phase3 && t >= N.stomp) { G.cast = { name: 'stomp', ends: t + 1.5 }; act('stomp', 1.5); N.stomp = t + 15; return; }
  }

  return {
    reset: reset,
    start: function (t) {
      R.S.phase = 'p1';
      R.say('Test Giant: "Let us see what you can do."', 'proc', 3);
      G.next = { cleave: t + 4, meteor: t + 6, fire: t + 3, pulse: t + 12, charge: t + 18, spread: Infinity, curse: Infinity, void: Infinity, fear: Infinity, bomb: Infinity, stomp: Infinity };
    },
    act: function (dt, t, player) {
      const hp = R.combat.state.targets[1].hpPct, N = G.next;
      if (!G.phase2 && hp <= 70) {
        G.phase2 = true; R.S.phase = 'p2';
        bubble.up(8, 'Test Giant shields himself! Adds come in.');
        ADD_SLOTS.forEach(function (s, i) { const x = -6 + i * 4; elementals.spawn(s, { x: x, z: 50, path: [{ x: x * 0.5, z: 34 }, { x: 14 + i * 1.5, z: 26 }], holdAt: offtank }); });
        N.spread = t + 10; N.curse = t + 14; N.void = t + 5;
      }
      if (!G.phase3 && hp <= 40) {
        G.phase3 = true; R.S.phase = 'p3';
        R.say('Test Giant: "Enough!"', 'proc', 3);
        demons.spawn(DEMON, { x: 0, z: 50, path: [{ x: 0, z: 30 }, { x: 14, z: 25 }], holdAt: offtank });
        N.fear = t + 5; N.bomb = t + 12; N.stomp = t + 8;
      }
      if (!rush.moving()) abilities(t, player);
      // The ghost raid does its thing now and then.
      if (Math.random() < dt * 0.8) R.visual({ n: 'raider', i: 2 + Math.floor(Math.random() * 3), k: 'swing' });
      if (Math.random() < dt * 0.6) R.visual({ n: 'raider', i: 5 + Math.floor(Math.random() * 5), k: 'cast' });
    },
    move: function (dt) {
      if (rush.moving()) return;                          // the charge moves it
      // Back home after a charge, facing the tank.
      const dx = HOME.x - giant.x, dz = HOME.z - giant.z, d = Math.hypot(dx, dz);
      if (!rush.active() && d > 0.4) { const step = Math.min(d, 8 * dt); giant.setMoving(true); giant.place(giant.x + dx / d * step, giant.z + dz / d * step, yawTo(giant.x, giant.z, HOME.x, HOME.z)); }
      else if (!rush.active()) { giant.setMoving(false); G.yaw = turn(giant.yaw, yawTo(giant.x, giant.z, tank.x, tank.z), 2, dt); giant.place(giant.x, giant.z, G.yaw); }
      G.x = giant.x; G.z = giant.z; G.yaw = giant.yaw;
      tank.place(tank.x, tank.z, yawTo(tank.x, tank.z, giant.x, giant.z));
    },
    phaseName: function () { return R.S.phase === 'p3' ? 'phase 3' : R.S.phase === 'p2' ? 'phase 2' : 'phase 1'; },
    doing: function () { if (bubble.isUp()) return 'Shielded'; if (rush.active()) return 'Charging'; if (G.cast) return G.cast.name === 'cleave' ? 'Casting Test Cleave' : 'Casting Test Stomp'; return ''; },
    zones: function () {
      const list = [coneZone(G, 10, 1.0, REACH)];
      if (G.cast && G.cast.name === 'stomp') list.push({ type: 'circle', x: G.x, z: G.z, r: 14 });
      return list;
    }
  };
}
