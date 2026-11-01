// The boss-fight engine: what every boss fight shares. A boss is a definition (js/bosses.js lists them): its targets,
// its room, its health curve, and a script that decides what it does. This file runs the script, keeps the shared
// state, hurts you and heals you back (the ghost raid's healers), moves and animates every creature, plays every look
// (and hands it to "Watch it again"), and answers main.js (names, plates, the meter's groups, the boss frame, the
// replay's snapshots). The rules of casting stay in combat.js.
//
// A definition:
//   { id, name, where, seconds, curve, short, text, sim, immune (optional), hidden (true: not in the Bosses list),
//     slots: [null, { name, health, sub, small, group, markScale, absent }, ...]  - target 1 is the boss
//     collider: yards (the boss stands in the way while it is on the ground), heal: [2.5, 4] (seconds until the
//     healers give back a hit), deathLine, room(scene) -> a room (js/room.js), script(R) -> the script }
// The script gets R (below) and returns any of:
//   reset() (a new fight: put everything back), start(t, player) (the pull), act(dt, t, player) (while the fight runs:
//   the boss decides), always(dt, t, player) (every frame once it began, also after it ended), move(dt, t) (positions),
//   phaseName(), doing() (for the boss frame), zones(player) (danger shown to the test bot), snapshot() / applySnap(s)
//   (its own part of the replay), died() (the boss fell).
import * as THREE from 'three';

export function rand(a, b) { return a + Math.random() * (b - a); }
export function roll(r) { return Math.round(rand(r[0], r[1])); }
export function yawTo(fx, fz, tx, tz) { return Math.atan2(-(tx - fx), -(tz - fz)); }
export function wrap(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
export function turn(from, to, rate, dt) { const d = wrap(to - from); return from + Math.max(-rate * dt, Math.min(rate * dt, d)); }

// h: { effects, controls, sound: { play(name) }, log(text, kind), record(fx) }
export function createRaid(scene, h, def) {
  const room = def.room(scene);
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const slots = def.slots, COUNT = slots.length - 1, HEAL = def.heal || [2.5, 4];
  const bodies = [null], spots = [null], props = [], mechs = [], looks = {};
  let S = null, combat = null, script = null;

  // A creature's setMoving() also remembers it (the replay keeps it).
  function remember(m) {
    if (m.setMoving && !m.__remember) { const f = m.setMoving; m.setMoving = function (v) { m.moving = !!v; f(v); }; m.__remember = true; }
    return m;
  }

  // ---------- what a script sees ----------
  const R = {
    def: def, group: group, room: room, effects: h.effects, controls: h.controls, sound: h.sound, log: h.log,
    rand: rand, roll: roll, yawTo: yawTo, turn: turn, wrap: wrap,
    get S() { return S; }, get combat() { return combat; }, get t() { return S ? S.lastT : -1; }, player: null,
    bodies: bodies, props: props,
    // Target `slot` is this creature (the boss is slot 1).
    body: function (slot, model) {
      bodies[slot] = remember(model); spots[slot] = { x: 0, z: 0 };
      group.add(model.root);
      if (slots[slot].absent) model.root.visible = false;
      return model;
    },
    // Something that stands in the room and is no target: a ghost tank, a ghost raider.
    prop: function (model) { props.push(remember(model)); group.add(model.root); return model; },
    // A mechanic from js/mechanics.js: updated every frame, reset, kept in the replay, shown to the test bot.
    use: function (m) { mechs.push(m); return m; },
    // How a look plays: visual({ n: name, ... }) calls it now and again in the replay.
    fx: function (name, fn) { looks[name] = fn; },
    visual: function (fx) { playFx(fx); if (h.record) h.record(fx); },
    // A yell or an emote: in the log and in the banner at the top.
    say: function (text, kind, seconds) {
      h.log(text, kind || 'proc');
      S.banner = { text: text, until: S.lastT + (seconds || 3.5), emote: kind === 'miss' };
    },
    // You are hurt; the raid's healers give it back a few seconds later.
    hurt: function (amount, what) {
      if (combat.state.over || combat.state.fightStart === null) return 0;
      h.log(what + ' hits you for ' + amount.toLocaleString('en-US') + '.', 'miss');   // before the death it may cause
      const got = combat.injure(amount, what);
      if (got > 0) S.heals.push({ at: S.lastT + rand(HEAL[0], HEAL[1]), amount: got });
      const hit = S.hits[what] || (S.hits[what] = { n: 0, total: 0 });
      hit.n++; hit.total += got;
      return got;
    },
    // Counts something for the test bot's report (how often a mechanic went off, a mistake ...).
    count: function (name, n) { S.counts[name] = (S.counts[name] || 0) + (n == null ? 1 : n); },
    // Where the ghost raid stands (spread circles and bombs ask).
    raidSpots: function () { return props.filter(function (p) { return p.root.visible && p.role; }).map(function (p) { return { x: p.x, z: p.z }; }); },
    feared: function () { return mechs.some(function (m) { return m.feared && m.feared(); }); }
  };

  function playFx(fx) {
    const f = looks[fx.n];
    if (f) f(fx);
  }

  function fresh() {
    S = { phase: 'asleep', started: false, over: false, lastT: -1, banner: null, shake: 0, heals: [], hits: {}, counts: {} };
    mechs.forEach(function (m) { if (m.reset) m.reset(); });
    if (script.reset) script.reset();
    syncSpots();
  }
  function syncSpots() { for (let i = 1; i <= COUNT; i++) if (bodies[i]) { spots[i].x = bodies[i].x; spots[i].z = bodies[i].z; } }

  // ---------- every frame ----------
  function update(dt, time, player, fight) {
    combat = fight;
    R.player = player;
    const started = fight.state.fightStart !== null, t = started ? fight.fightSeconds() : -1;
    S.lastT = t;
    S.over = fight.state.over;
    if (started && !S.started) { S.started = true; if (script.start) script.start(t, player); }
    if (S.started && !S.over && script.act) script.act(dt, t, player);
    if (S.started) {
      if (script.always) script.always(dt, t, player);
      mechs.forEach(function (m) { if (m.update) m.update(dt, t, player); });
      // The healers.
      for (let i = S.heals.length - 1; i >= 0; i--) if (t >= S.heals[i].at) { if (!S.over) fight.heal(S.heals[i].amount, 'the raid'); S.heals.splice(i, 1); }
    }
    if (S.over && fight.state.targets[1].hpPct <= 0.01 && !bodies[1].dead) {   // the clock ran out: the boss is dead
      bodies[1].setDead(true);
      h.log(def.deathLine || def.name + ' dies.', 'proc');
      mechs.forEach(function (m) { if (m.stop) m.stop(); });
      if (script.died) script.died();
    }
    if (S.over) mechs.forEach(function (m) { if (m.over) m.over(); });
    if (script.move) script.move(dt, t);
    syncSpots();
    animate(dt, time);
    const banner = S.banner && t < S.banner.until ? { text: S.banner.text, soon: false, emote: S.banner.emote } : null;
    if (S.banner && t >= S.banner.until) S.banner = null;
    return { banner: banner, shake: S.shake, feared: R.feared() };
  }
  function animate(dt, time) {
    for (let i = 1; i <= COUNT; i++) if (bodies[i] && bodies[i].root.visible) bodies[i].update(dt, time);
    props.forEach(function (p) { p.update(dt, time); });
  }

  // ---------- "Watch it again": ten times a second, where everything is and how it looks ----------
  function r2(v) { return Math.round(v * 100) / 100; }
  function snapshot() {
    return {
      b: bodies.slice(1).map(function (m) { return [r2(m.x), r2(m.z), r2(m.y || 0), r2(m.yaw), m.root.visible ? 1 : 0, m.dead ? 1 : 0, m.moving ? 1 : 0]; }),
      p: props.map(function (m) { return [r2(m.x), r2(m.z), r2(m.yaw), m.root.visible ? 1 : 0]; }),
      m: mechs.map(function (m) { return m.snapshot ? m.snapshot() : null; }),
      s: script.snapshot ? script.snapshot() : null,
      bn: S.banner && S.lastT < S.banner.until ? S.banner.text : '', fr: R.feared() ? 1 : 0
    };
  }
  // Between two snapshots: positions blended, the rest from the first.
  function mixSnap(a, b, f) {
    const m = function (p, q) { return p + (q - p) * f; };
    const turnTo = function (p, q) { return p + wrap(q - p) * f; };
    const out = Object.assign({}, a);
    out.b = a.b.map(function (p, i) { const q = b.b[i]; if (!q || !p[4] || !q[4]) return p; const r = p.slice(); r[0] = m(p[0], q[0]); r[1] = m(p[1], q[1]); r[2] = m(p[2], q[2]); r[3] = turnTo(p[3], q[3]); return r; });
    out.p = a.p.map(function (p, i) { const q = b.p[i]; return q ? [m(p[0], q[0]), m(p[1], q[1]), turnTo(p[2], q[2]), p[3]] : p; });
    return out;
  }
  // Puts every creature where a snapshot says, and moves their animations on.
  function applySnap(n, dt, time) {
    if (!n) return;
    n.b.forEach(function (p, i) {
      const m = bodies[i + 1];
      if (m.dead !== !!p[5]) m.setDead(!!p[5]);
      m.root.visible = !!p[4];
      if (m.setMoving) m.setMoving(!!p[6]);
      m.place(p[0], p[1], p[3], p[2]);
    });
    n.p.forEach(function (p, i) { props[i].place(p[0], p[1], p[2]); props[i].root.visible = !!p[3]; });
    n.m.forEach(function (s, i) { if (mechs[i].apply) mechs[i].apply(s); });
    if (script.applySnap) script.applySnap(n.s);
    animate(dt, time);
  }

  script = def.script(R);
  fresh();
  return {
    def: def, room: room, group: group, bodies: bodies, spots: spots, count: COUNT,
    snapshot: snapshot, mixSnap: mixSnap, applySnap: applySnap, playFx: playFx,
    // After watching again: everything back as the fight left it.
    restore: function () { applySnap(snapshot(), 0, 0); },
    show: function (on) { group.visible = on; room.group.visible = on; },
    reset: function () { mechs.forEach(function (m) { if (m.over) m.over(); }); fresh(); },
    update: update,
    feared: function () { return !!S && R.feared(); },
    flying: function (ti) { return !!bodies[ti] && (bodies[ti].y || 0) > 3; },
    // What stands in the way of walking: the boss while it is on the ground.
    collider: function () { const b = bodies[1]; return def.collider && (b.y || 0) < 1 && !b.dead ? { x: b.x, z: b.z, r: def.collider } : null; },
    targetName: function (ti) { return slots[ti] ? slots[ti].name : ''; },
    targetSub: function (ti) { return ti === 1 ? 'Boss · ' + phaseName() : slots[ti] ? slots[ti].sub || '' : ''; },
    smallPlate: function (ti) { return !!(slots[ti] && slots[ti].small); },
    // The meter's "Per target": one line per group of targets, in their order (the boss's always).
    groups: function (by) {
      const order = [], sums = {};
      for (let i = 1; i <= COUNT; i++) { const g = slots[i].group || slots[i].name; if (!(g in sums)) { order.push(g); sums[g] = 0; } sums[g] += by[i] || 0; }
      return order.map(function (g) { return { name: g, dmg: sums[g] }; }).filter(function (g, i) { return i === 0 || g.dmg > 0; });
    },
    markScale: function (ti) { return slots[ti] && slots[ti].markScale || 1; },
    lift: function (ti) { return bodies[ti] ? bodies[ti].y || 0 : 0; },
    phase: function () { return S.phase; },
    phaseName: phaseName,
    doing: function () { return script.doing ? script.doing() : ''; },
    // What can hurt you right now, as shapes on the floor (for the test bot): mechanics' and the script's own.
    zones: function (player) {
      let list = [];
      mechs.forEach(function (m) { if (m.zones) list = list.concat(m.zones(player)); });
      if (script.zones) list = list.concat(script.zones(player));
      return list;
    },
    stats: function () { return { hits: S.hits, counts: S.counts }; },
    // What a boss has put on you (a curse ...): [{ key, icon, name, left, text }] for the buff row.
    auras: function () { return mechs.map(function (m) { return m.aura ? m.aura() : null; }).filter(Boolean); },
    state: function () { return S; },                 // for checks from the console
    script: function () { return script; }
  };
  function phaseName() { return script.phaseName ? script.phaseName() : ''; }
}
