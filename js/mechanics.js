// The toolbox of boss mechanics, ready to plug into a boss script (js/raid.js: R.use(mechanic)). Each one draws itself,
// hurts you through R.hurt (so the healers and the review know), says what it does in the log, is put back for a new
// fight (reset), is kept in "Watch it again" (snapshot / apply), and shows the test bot where it is dangerous (zones).
// None of them knows any boss: numbers, names and colours come from the script.
//
//   facing / inCone / behind / inLane / coneZone   where you stand against a creature (front, back, a lane)
//   knockback, knockYards                          a push that carries you
//   circleStrikes   circles on the floor that land after a delay (a fireball at you or at a spot, a meteor, a slam)
//   pools           fire or void on the floor that burns every second you stand in it
//   fear            you run about at random for a few seconds
//   pulse           the whole raid is hit at once
//   spread          a circle on you: anyone else in it when it ends makes it hurt
//   bomb            you carry a bomb: when it goes off it hits everyone near you - run away from the group
//   charge          the boss marks a line toward you and rushes along it
//   adds            adds that walk in, are held by a ghost off-tank, or chase you for a while
//   shield          the boss is shielded: your spells do nothing to it
//   enrage          at a set second the boss enrages and hits harder and harder
//   curse           a curse on you that lowers your damage until the raid removes it
import * as THREE from 'three';
import { segmentDistance } from './room.js';

// ---------- where you stand ----------
// src: { x, z, yaw } (a creature: models face -z). How far you are, which way from its front (cos 1 = straight ahead,
// -1 = straight behind), on which side (1 / -1), its forward direction and the direction from it to you.
export function facing(src, p) {
  const dx = p.x - src.x, dz = p.z - src.z, d = Math.hypot(dx, dz) || 0.001;
  const fx = -Math.sin(src.yaw), fz = -Math.cos(src.yaw);
  return { d: d, cos: (dx * fx + dz * fz) / d, side: dx * -fz + dz * fx > 0 ? 1 : -1, fx: fx, fz: fz, dx: dx / d, dz: dz / d };
}
// In front within `range` (+ reach: part of a big creature's body) and halfAngle radians of its nose; behind the same way.
export function inCone(src, p, range, halfAngle, reach) { const r = facing(src, p); return r.d <= range + (reach || 0) && r.cos >= Math.cos(halfAngle); }
export function behind(src, p, range, halfAngle, reach) { const r = facing(src, p); return r.d <= range + (reach || 0) && -r.cos >= Math.cos(halfAngle); }
export function inLane(x, z, ax, az, bx, bz, halfWidth) { return segmentDistance(x, z, ax, az, bx, bz) <= halfWidth; }
// The same shapes for the test bot (zones): a cone in front (back: true behind), a lane, a circle.
export function coneZone(src, range, halfAngle, reach, back) { return { type: 'cone', x: src.x, z: src.z, yaw: src.yaw + (back ? Math.PI : 0), r: range + (reach || 0), a: halfAngle }; }

// ---------- a push ----------
// Speed in yards a second along (dx, dz); it dies away at `fade` (5 by default): speed / fade = the yards it carries you.
export function knockback(R, dx, dz, speed, hop, fade) { R.controls.shove(dx * speed, dz * speed, hop, fade); }
export function knockYards(R, dx, dz, yards, hop) { const fade = 2.8, len = Math.hypot(dx, dz) || 1; R.controls.shove(dx / len * yards * fade, dz / len * yards * fade, hop, fade); }

// A flat ring and a disc on the floor, used by several mechanics.
function floorMark(group, radius, ringColor, fillColor) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.95, radius, 56), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(radius, 48), new THREE.MeshBasicMaterial({ color: fillColor, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide }));
  ring.rotation.x = fill.rotation.x = -Math.PI / 2;
  ring.position.y = 0.12; fill.position.y = 0.11;
  g.add(ring, fill);
  g.visible = false;
  group.add(g);
  return { group: g, ring: ring, fill: fill, live: false };
}
function pool(list, make) { for (let i = 0; i < list.length; i++) if (!list[i].live) return list[i]; const m = make(); list.push(m); return m; }

// ---------- circle strikes ----------
// opts: { radius (5), ring (0xffa040), fill (0xff5a14), name ('strike': its looks are called name + '.bolt' / '.boom') }
// cast({ x, z, follow (true: it follows you until it lands), delay (3), dmg: [low, high], what, from(into) (where a
//        bolt starts: it flies the last half second; none = it just lands), radius })
export function circleStrikes(R, opts) {
  opts = Object.assign({ radius: 5, ring: 0xffa040, fill: 0xff5a14, name: 'strike' }, opts || {});
  const marks = [], live = [], tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
  function mark(radius) { return pool(marks.filter(function (m) { return m.radius === radius; }), function () { const m = floorMark(R.group, radius, opts.ring, opts.fill); m.radius = radius; marks.push(m); return m; }); }
  R.fx(opts.name + '.bolt', function (fx) { R.effects.bolt(tmp.set(fx.a[0], fx.a[1], fx.a[2]), tmp2.set(fx.b[0], 0.5, fx.b[1]), { style: 'fire', color: opts.ring === 0xffa040 ? 0xff6a1a : opts.ring, core: 0xfff0b0, size: 1.1, speed: 70 }, function () {}); });
  R.fx(opts.name + '.boom', function (fx) { R.effects.play('explosion', { at: tmp.set(fx.x, 0.6, fx.z) }); R.effects.ring(tmp.set(fx.x, 0.2, fx.z), 0xff8a2a, 1, (fx.r || 5) * 1.1, 0.5, false); });
  function clear() { live.length = 0; marks.forEach(function (m) { m.live = false; m.group.visible = false; }); }
  return {
    cast: function (o) {
      const radius = o.radius || opts.radius, m = mark(radius);
      m.live = true; m.group.visible = true; m.group.position.set(o.x, 0, o.z);
      live.push({ lands: R.t + (o.delay || 3), delay: o.delay || 3, player: !!o.follow, x: o.x, z: o.z, mark: m, flying: false, cast: R.t,
                  dmg: o.dmg, what: o.what, from: o.from, radius: radius });
      R.count(opts.name);
    },
    update: function (dt, t, player) {
      live.forEach(function (f) {
        if (f.player) { f.x = player.x; f.z = player.z; f.mark.group.position.set(f.x, 0, f.z); }
        f.mark.fill.material.opacity = 0.12 + 0.35 * Math.min(1, (t - f.cast) / f.delay);
        if (f.from && !f.flying && t >= f.lands - 0.5) {
          f.flying = true;
          const a = f.from(tmp);
          R.visual({ n: opts.name + '.bolt', a: [a.x, a.y, a.z], b: [f.x, f.z] });
        }
      });
      for (let i = live.length - 1; i >= 0; i--) {
        const f = live[i];
        if (t < f.lands) continue;
        live.splice(i, 1);
        f.mark.live = false; f.mark.group.visible = false;
        R.visual({ n: opts.name + '.boom', x: f.x, z: f.z, r: f.radius });
        if (R.S.over) continue;
        if (f.player || Math.hypot(player.x - f.x, player.z - f.z) <= f.radius) R.hurt(R.roll(f.dmg), f.what);
      }
    },
    stop: clear, reset: clear,
    zones: function () { return live.map(function (f) { return { type: 'circle', x: f.x, z: f.z, r: f.radius, soon: f.lands - R.t, follows: f.player }; }); },
    snapshot: function () { return live.map(function (f) { return [Math.round(f.x * 100) / 100, Math.round(f.z * 100) / 100, Math.round(f.mark.fill.material.opacity * 100) / 100, f.radius]; }); },
    apply: function (s) {
      marks.forEach(function (m) { m.live = false; m.group.visible = false; });
      (s || []).forEach(function (p) { const m = mark(p[3] || opts.radius); m.live = true; m.group.visible = true; m.group.position.set(p[0], 0, p[1]); m.fill.material.opacity = p[2]; });
    },
    active: function () { return live.length; }
  };
}

// ---------- pools on the floor ----------
// opts: { color (0xff5a14 fire; 0x7a3aff void), name ('pool') }
// place({ x, z, radius (4), lasts (20), every (1), dmg, what, telegraph (seconds of a warning ring first, 0) })
export function pools(R, opts) {
  opts = Object.assign({ color: 0xff5a14, name: 'pool' }, opts || {});
  const list = [], meshes = [];
  const disc = new THREE.CircleGeometry(1, 40), ringGeo = new THREE.RingGeometry(0.92, 1, 48);
  function mesh() {
    return pool(meshes, function () {
      const g = new THREE.Group();
      const fill = new THREE.Mesh(disc, new THREE.MeshBasicMaterial({ color: opts.color, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: opts.color, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }));
      fill.rotation.x = ring.rotation.x = -Math.PI / 2;
      fill.position.y = 0.09; ring.position.y = 0.1;
      g.add(fill, ring);
      g.visible = false;
      R.group.add(g);
      return { group: g, fill: fill, ring: ring, live: false };
    });
  }
  function clear() { list.length = 0; meshes.forEach(function (m) { m.live = false; m.group.visible = false; }); }
  function show(p, t) {
    const armed = t >= p.armed, k = armed ? 1 : Math.max(0, (t - p.at) / Math.max(0.01, p.armed - p.at));
    p.mesh.group.position.set(p.x, 0, p.z);
    p.mesh.group.scale.setScalar(p.radius);
    p.mesh.fill.material.opacity = armed ? 0.35 + 0.08 * Math.sin(t * 6 + p.x) : 0.08 + 0.12 * k;
    p.mesh.ring.material.opacity = armed ? 0.9 : 0.4 + 0.5 * k;
  }
  return {
    place: function (o) {
      const t = R.t, m = mesh();
      m.live = true; m.group.visible = true;
      const p = { x: o.x, z: o.z, radius: o.radius || 4, at: t, armed: t + (o.telegraph || 0), ends: t + (o.telegraph || 0) + (o.lasts || 20),
                  every: o.every || 1, next: t + (o.telegraph || 0), dmg: o.dmg, what: o.what, mesh: m };
      list.push(p);
      show(p, t);
      R.count(opts.name);
    },
    update: function (dt, t, player) {
      for (let i = list.length - 1; i >= 0; i--) {
        const p = list[i];
        if (t >= p.ends) { p.mesh.live = false; p.mesh.group.visible = false; list.splice(i, 1); continue; }
        show(p, t);
        if (t < p.armed || R.S.over) continue;
        if (t >= p.next && Math.hypot(player.x - p.x, player.z - p.z) <= p.radius) { p.next = t + p.every; R.hurt(R.roll(p.dmg), p.what); }
        else if (t >= p.next) p.next = t;                 // standing outside: the next second you step in, it burns
      }
    },
    stop: clear, reset: clear,
    zones: function () { return list.map(function (p) { return { type: 'circle', x: p.x, z: p.z, r: p.radius, soon: Math.max(0, p.armed - R.t) }; }); },
    snapshot: function () { return list.map(function (p) { return [Math.round(p.x * 100) / 100, Math.round(p.z * 100) / 100, p.radius, Math.round(p.at * 10) / 10, Math.round(p.armed * 10) / 10]; }); },
    apply: function (s) {
      meshes.forEach(function (m) { m.live = false; m.group.visible = false; });
      (s || []).forEach(function (q) { const m = mesh(); m.live = true; m.group.visible = true; show({ x: q[0], z: q[1], radius: q[2], at: q[3], armed: q[4], mesh: m }, q[4] + 1); });
    },
    count: function () { return list.length; }
  };
}

// ---------- fear ----------
// start(seconds): you run off in a random direction, a new one every 0.7-1.2 s, only where you can walk; you cannot cast.
// opts: { speed (6.5) }
export function fear(R, opts) {
  opts = Object.assign({ speed: 6.5 }, opts || {});
  let F = null;
  const tmp = new THREE.Vector3();
  R.fx('fear.ring', function (fx) { R.effects.ring(tmp.set(fx.x, 1, fx.z), 0x9a5aff, 0.5, 3, 0.6, true); });
  function end() { if (F) { F = null; R.controls.steer(null); } }
  return {
    start: function (seconds) { F = { ends: R.t + seconds, turnAt: R.t }; R.visual({ n: 'fear.ring', x: R.player.x, z: R.player.z }); R.count('fear'); },
    update: function (dt, t, player) {
      if (!F) return;
      if (t >= F.ends || R.S.over) { end(); return; }
      if (t >= F.turnAt) {
        F.turnAt = t + R.rand(0.7, 1.2);
        for (let k = 0; k < 12; k++) {
          const a = Math.random() * Math.PI * 2, vx = Math.sin(a) * opts.speed, vz = Math.cos(a) * opts.speed;
          if (R.room.walkable(player.x + vx * 1.2, player.z + vz * 1.2)) { R.controls.steer(vx, vz); break; }
        }
      }
    },
    over: end, reset: end, stop: end,
    feared: function () { return !!F; },
    snapshot: function () { return F ? 1 : 0; }
  };
}

// ---------- the whole raid is hit ----------
// go(dmg, what, from) - a ring rolls out from `from` ({ x, z }) and everyone takes it. opts: { color (0xc06aff) }
export function pulse(R, opts) {
  opts = Object.assign({ color: 0xc06aff }, opts || {});
  const tmp = new THREE.Vector3();
  R.fx('pulse.ring', function (fx) { R.effects.ring(tmp.set(fx.x, 0.5, fx.z), opts.color, 1, 45, 0.9, false); R.effects.ring(tmp.set(fx.x, 1.5, fx.z), opts.color, 0.5, 30, 0.7, true); });
  return {
    go: function (dmg, what, from) { R.visual({ n: 'pulse.ring', x: from.x, z: from.z }); R.count('pulse'); if (!R.S.over) R.hurt(R.roll(dmg), what); }
  };
}

// ---------- a circle on you (spread out) ----------
// mark({ radius (6), delay (6), dmg, what }) - a ring around you for `delay` seconds; when it ends, anyone of the ghost
// raid inside it is hit and so are you (once per person inside). Nobody inside: nothing happens.
export function spread(R, opts) {
  opts = Object.assign({ color: 0x5ad0ff }, opts || {});
  let M = null;
  const m = floorMark(R.group, 1, opts.color, opts.color);
  const tmp = new THREE.Vector3();
  R.fx('spread.end', function (fx) { R.effects.ring(tmp.set(fx.x, 0.4, fx.z), opts.color, 1, fx.r, 0.5, false); });
  function end() { M = null; m.group.visible = false; }
  return {
    mark: function (o) {
      M = { radius: o.radius || 6, ends: R.t + (o.delay || 6), dmg: o.dmg, what: o.what };
      m.group.visible = true; m.group.scale.setScalar(M.radius);
      R.log('A circle forms around you: keep everyone out of it.', 'miss');
      R.count('spread');
    },
    update: function (dt, t, player) {
      if (!M) return;
      m.group.position.set(player.x, 0, player.z);
      m.fill.material.opacity = 0.1 + 0.2 * Math.abs(Math.sin(t * 4));
      if (t < M.ends) return;
      const inside = R.raidSpots().filter(function (p) { return Math.hypot(p.x - player.x, p.z - player.z) <= M.radius; }).length;
      R.visual({ n: 'spread.end', x: player.x, z: player.z, r: M.radius });
      if (inside && !R.S.over) { R.hurt(R.roll(M.dmg) * inside, M.what); R.log('Your circle caught ' + inside + (inside === 1 ? ' raider.' : ' raiders.'), 'miss'); R.count('spread mistakes', inside); }
      end();
    },
    stop: end, reset: end, over: end,
    zones: function (player) {
      // Danger is other people near you: the bot steps away from each raider.
      if (!M) return [];
      return R.raidSpots().map(function (p) { return { type: 'circle', x: p.x, z: p.z, r: M.radius, soon: M.ends - R.t }; });
    },
    snapshot: function () { return M ? [M.radius] : null; },
    apply: function (s) { m.group.visible = !!s; if (s) m.group.scale.setScalar(s[0]); }
  };
}

// ---------- a bomb on you ----------
// mark({ radius (10), delay (8), dmg, what }) - when it goes off it hits you and everyone of the ghost raid within
// `radius` of you (each one counted as a mistake): carry it away from the group.
export function bomb(R, opts) {
  opts = Object.assign({ color: 0xff3a3a }, opts || {});
  let B = null;
  const m = floorMark(R.group, 1, opts.color, opts.color);
  const tmp = new THREE.Vector3();
  R.fx('bomb.boom', function (fx) { R.effects.play('explosion', { at: tmp.set(fx.x, 1, fx.z) }); R.effects.ring(tmp.set(fx.x, 0.3, fx.z), opts.color, 1, fx.r, 0.6, false); });
  function end() { B = null; m.group.visible = false; }
  return {
    mark: function (o) {
      B = { radius: o.radius || 10, ends: R.t + (o.delay || 8), dmg: o.dmg, what: o.what };
      m.group.visible = true; m.group.scale.setScalar(B.radius);
      R.log('You carry a bomb! Run away from the raid.', 'miss');
      R.count('bomb');
    },
    update: function (dt, t, player) {
      if (!B) return;
      m.group.position.set(player.x, 0, player.z);
      const left = B.ends - t;
      m.fill.material.opacity = 0.1 + 0.25 * Math.abs(Math.sin(t * (left < 2 ? 10 : 4)));
      if (t < B.ends) return;
      const caught = R.raidSpots().filter(function (p) { return Math.hypot(p.x - player.x, p.z - player.z) <= B.radius; }).length;
      R.visual({ n: 'bomb.boom', x: player.x, z: player.z, r: B.radius });
      if (!R.S.over) R.hurt(R.roll(B.dmg), B.what);
      if (caught) { R.log('The bomb hit ' + caught + ' of the raid.', 'miss'); R.count('bomb mistakes', caught); }
      end();
    },
    stop: end, reset: end, over: end,
    zones: function () { if (!B) return []; return R.raidSpots().map(function (p) { return { type: 'circle', x: p.x, z: p.z, r: B.radius, soon: B.ends - R.t }; }); },
    snapshot: function () { return B ? [B.radius] : null; },
    apply: function (s) { m.group.visible = !!s; if (s) m.group.scale.setScalar(s[0]); }
  };
}

// ---------- a charge ----------
// start({ body (who charges: a creature), delay (2), width (4), speed (30), dmg, what, knock (yards, 10) }) - a line from
// it to where you stand now; after `delay` it rushes along it; you are hit if you are still in the line when it passes.
// While it runs, moving() is true: the script must not move that creature itself.
export function charge(R, opts) {
  opts = Object.assign({ color: 0xff7a3a }, opts || {});
  let C = null;
  const lane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: opts.color, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }));
  lane.rotation.order = 'YXZ';
  lane.visible = false;
  R.group.add(lane);
  const tmp = new THREE.Vector3();
  R.fx('charge.dust', function (fx) { R.effects.puff(tmp.set(fx.x, 0.6, fx.z), 0xc8a080, 3, 0.8, 0, 1, 0, 0.6); });
  function showLane(c) {
    const dx = c.bx - c.ax, dz = c.bz - c.az, len = Math.hypot(dx, dz) || 0.01;
    lane.visible = true;
    lane.position.set((c.ax + c.bx) / 2, 0.1, (c.az + c.bz) / 2);
    lane.rotation.set(-Math.PI / 2, Math.atan2(-dx, -dz), 0);
    lane.scale.set(c.width, len, 1);
  }
  function end() { C = null; lane.visible = false; }
  return {
    start: function (o) {
      const b = o.body, p = R.player, dx = p.x - b.x, dz = p.z - b.z, len = Math.hypot(dx, dz) || 1;
      const far = len + 6;                               // it runs a little past where you stood
      C = { body: b, ax: b.x, az: b.z, bx: b.x + dx / len * far, bz: b.z + dz / len * far, width: o.width || 4, go: R.t + (o.delay == null ? 2 : o.delay),
            speed: o.speed || 30, dmg: o.dmg, what: o.what, knock: o.knock == null ? 10 : o.knock, hit: false, done: 0 };
      if (!R.room.walkable(C.bx, C.bz)) { C.bx = b.x + dx / len * len; C.bz = b.z + dz / len * len; }
      showLane(C);
      R.count('charge');
    },
    update: function (dt, t, player) {
      if (!C) return;
      if (t < C.go) { lane.material.opacity = 0.15 + 0.2 * ((t * 3) % 1); return; }
      const total = Math.hypot(C.bx - C.ax, C.bz - C.az), was = C.done;
      C.done = Math.min(total, C.done + C.speed * dt);
      const k = C.done / total, x = C.ax + (C.bx - C.ax) * k, z = C.az + (C.bz - C.az) * k;
      C.body.place(x, z, R.yawTo(C.ax, C.az, C.bx, C.bz), C.body.y || 0);
      if (C.body.setMoving) C.body.setMoving(true);
      if (Math.floor(was / 3) !== Math.floor(C.done / 3)) R.visual({ n: 'charge.dust', x: x, z: z });
      if (!C.hit && !R.S.over && Math.hypot(player.x - x, player.z - z) <= C.width / 2 + (C.body.radius || 1)) {
        C.hit = true;
        R.hurt(R.roll(C.dmg), C.what);
        const nx = -(C.bz - C.az) / total, nz = (C.bx - C.ax) / total, side = (player.x - x) * nx + (player.z - z) * nz >= 0 ? 1 : -1;
        if (C.knock) knockYards(R, nx * side, nz * side, C.knock, 6);
      }
      if (C.done >= total) { if (C.body.setMoving) C.body.setMoving(false); end(); }
    },
    stop: end, reset: end,
    moving: function () { return !!C && R.t >= C.go; },
    active: function () { return !!C; },
    zones: function () { return C ? [{ type: 'lane', ax: C.ax, az: C.az, bx: C.bx, bz: C.bz, w: C.width + 2 * (C.body.radius || 1), soon: C.go - R.t }] : []; },
    snapshot: function () { return C && R.t < C.go ? [C.ax, C.az, C.bx, C.bz, C.width].map(function (v) { return Math.round(v * 100) / 100; }) : null; },
    apply: function (s) { if (s) showLane({ ax: s[0], az: s[1], bx: s[2], bz: s[3], width: s[4] }); else lane.visible = false; }
  };
}

// ---------- adds ----------
// opts: { speed (8), reach (1.6: how close it comes to you when it chases you), swing: { every (2), dmg, what } (on you while
//         it chases you), heldSwing: [1.2, 2.2] (a swing at its off-tank now and then, looks only), rate: [100, 150] (what
//         the ghost raid does to it a second while it is held: rolled once per add, or every frame with perFrame: true),
//         chaseShare (0.5: the raid's share while it chases you), chaseFor (10 s), jitter (2.5 yards around the place
//         it is held), held(a, t) (called when it gets there) }
// spawn(slot, { x, z, path: [{ x, z }] (where it walks; at the end an off-tank holds it), chase (true: it goes for you
//        first), holdAt: { x, z } (the off-tank it faces), packAt: { x, z } (where it is held after chasing) })
export function adds(R, opts) {
  opts = Object.assign({ speed: 8, reach: 1.6, heldSwing: [1.2, 2.2], rate: [100, 150], chaseShare: 0.5, chaseFor: 10, jitter: 2.5 }, opts || {});
  const all = [];
  R.fx('adds.swing', function (fx) { const b = R.bodies[fx.s]; if (b && b.attack) b.attack(); });
  function find(slot) { for (let i = 0; i < all.length; i++) if (all[i].slot === slot) return all[i]; return null; }
  function hide() { all.length = 0; }
  return {
    // The first add among `slots` that is free to come in (never used, or fallen and gone).
    free: function (list, from) {
      for (let k = 0; k < list.length; k++) {
        const s = list[k], a = find(s);
        if (from != null && s < from) continue;
        if (!a || a.state === 'idle' || (a.state === 'dead' && R.combat.state.targets[s].dead)) return s;
      }
      if (from != null) for (let k = 0; k < list.length; k++) { const a = find(list[k]); if (!a || a.state === 'idle' || a.state === 'dead') return list[k]; }
      return null;
    },
    spawn: function (slot, o) {
      if (!R.combat.spawn(slot)) return false;
      const body = R.bodies[slot];
      body.setDead(false); body.root.visible = true;
      let a = find(slot);
      if (!a) { a = { slot: slot }; all.push(a); }
      a.x = o.x; a.z = o.z; a.holdAt = o.holdAt; a.packAt = o.packAt || (o.path && o.path[o.path.length - 1]) || { x: o.x, z: o.z };
      a.path = o.chase ? [] : (o.path || []).slice();
      a.state = o.chase ? 'chase' : 'run';
      a.chaseUntil = R.t + opts.chaseFor;
      a.swingAt = 0;
      a.rate = Array.isArray(opts.rate) && !opts.perFrame ? R.rand(opts.rate[0], opts.rate[1]) : opts.rate;
      body.place(a.x, a.z, body.yaw);
      R.count('adds');
      return true;
    },
    state: function (slot) { const a = find(slot); return a ? a.state : 'idle'; },
    where: function (slot) { return find(slot); },
    update: function (dt, t, player) {
      all.forEach(function (a) {
        const body = R.bodies[a.slot];
        if (a.state === 'idle') return;
        if (R.combat.state.targets[a.slot].dead) { if (a.state !== 'dead') a.state = 'dead'; if (body.setMoving) body.setMoving(false); return; }
        let goal = null;
        if (a.state === 'run') goal = a.path[0];
        else if (a.state === 'chase') {
          goal = { x: player.x, z: player.z };
          if (t >= a.chaseUntil) {                        // an off-tank picks it up
            a.state = 'run';
            a.path = [{ x: a.packAt.x + R.rand(-opts.jitter, opts.jitter), z: a.packAt.z + R.rand(-opts.jitter, opts.jitter) }];
            goal = a.path[0];
          }
        }
        if (a.state === 'held') {
          if (body.setMoving) body.setMoving(false);
          const h = a.holdAt || player;
          body.place(a.x, a.z, R.yawTo(a.x, a.z, h.x, h.z));
          if (opts.heldSwing && t >= a.swingAt) { a.swingAt = t + R.rand(opts.heldSwing[0], opts.heldSwing[1]); R.visual({ n: 'adds.swing', s: a.slot }); }
          if (!R.S.over) R.combat.raidHurt(a.slot, (opts.perFrame ? R.rand(opts.rate[0], opts.rate[1]) : a.rate) * dt);   // the raid's spells
          return;
        }
        if (!goal) return;
        const dx = goal.x - a.x, dz = goal.z - a.z, d = Math.hypot(dx, dz);
        const reach = a.state === 'chase' ? opts.reach : 0.3;
        if (d > reach + 0.05) {                           // (a margin: walking to exactly `reach` would never count as there)
          const step = Math.min(a.state === 'chase' ? d - reach : d, opts.speed * dt);
          a.x += dx / d * step; a.z += dz / d * step;
          if (body.setMoving) body.setMoving(true);
          body.place(a.x, a.z, R.yawTo(a.x, a.z, goal.x, goal.z));
        } else {
          if (body.setMoving) body.setMoving(false);
          if (a.state === 'run') { a.path.shift(); if (!a.path.length) { a.state = 'held'; if (opts.held) opts.held(a, t); } }
          else if (a.state === 'chase' && t >= a.swingAt && !R.S.over && opts.swing) {
            a.swingAt = t + (opts.swing.every || 2);
            R.visual({ n: 'adds.swing', s: a.slot });
            R.hurt(R.roll(opts.swing.dmg), opts.swing.what);
          }
        }
        if (a.state === 'chase' && !R.S.over) R.combat.raidHurt(a.slot, (opts.perFrame ? R.rand(opts.rate[0], opts.rate[1]) : a.rate) * opts.chaseShare * dt);
      });
    },
    reset: hide,
    zones: function () { return all.filter(function (a) { return a.state === 'chase'; }).map(function (a) { return { type: 'circle', x: a.x, z: a.z, r: opts.reach + 1 }; }); }
  };
}

// ---------- a shield on the boss ----------
// up(seconds) - your spells do nothing to target `slot` (1) while it lasts (combat.setImmune); a bubble shows round it.
export function shield(R, opts) {
  opts = Object.assign({ slot: 1, color: 0x9ad8ff }, opts || {});
  let until = 0;
  const bubble = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), new THREE.MeshBasicMaterial({ color: opts.color, transparent: true, opacity: 0.18, depthWrite: false, blending: THREE.AdditiveBlending }));
  bubble.visible = false;
  R.group.add(bubble);
  function down() { if (until) { until = 0; bubble.visible = false; if (R.combat) R.combat.setImmune(opts.slot, null); } }
  return {
    up: function (seconds, text) {
      until = R.t + seconds;
      R.combat.setImmune(opts.slot, { all: true });
      bubble.visible = true;
      if (text) R.say(text, 'miss', 3);
      R.count('shield');
    },
    update: function (dt, t) {
      if (!until) return;
      if (t >= until || R.S.over) { down(); R.log(R.def.slots[opts.slot].name + "'s shield fades.", 'proc'); return; }
      const b = R.bodies[opts.slot];
      bubble.position.set(b.x, (b.y || 0) + b.chest.y, b.z);
      bubble.scale.setScalar((b.radius || 1) * 1.6 * (1 + Math.sin(t * 3) * 0.03));
    },
    reset: down, stop: down, over: down,
    isUp: function () { return !!until; },
    snapshot: function () { return until ? 1 : 0; },
    apply: function (s) { bubble.visible = !!s; }
  };
}

// ---------- enrage ----------
// opts: { at (seconds), every (2), dmg ([9000, 11000]), what, text } - from `at` on, a heavy hit every `every` seconds.
export function enrage(R, opts) {
  opts = Object.assign({ every: 2, dmg: [9000, 11000] }, opts || {});
  let on = false, next = 0;
  return {
    update: function (dt, t) {
      if (R.S.over) return;
      if (!on && t >= opts.at) { on = true; next = t; R.say(opts.text || R.def.slots[1].name + ' becomes enraged!', 'miss', 4); R.count('enrage'); }
      if (on && t >= next) { next = t + opts.every; R.hurt(R.roll(opts.dmg), opts.what || R.def.slots[1].name + "'s Enrage"); }
    },
    reset: function () { on = false; next = 0; },
    active: function () { return on; }
  };
}

// ---------- a curse on you ----------
// put({ pct (25: your damage lower by that much), lasts (20), removedAfter: [6, 10] (seconds until the ghost raid takes it
//      off; none = it runs its time), name, text }) - combat.setOutMult; aura() is what the buff row shows.
// opts: { icon (a picture of the sim's data: 'debuff_curseOfRecklessness') }
export function curse(R, opts) {
  opts = Object.assign({ icon: null }, opts || {});
  let C = null;
  function end(said) { if (C) { if (R.combat) R.combat.setOutMult(1); if (said && !R.S.over) R.log(C.name + ' is removed.', 'proc'); C = null; } }
  return {
    put: function (o) {
      end(false);
      const lasts = o.lasts || 20, off = o.removedAfter ? R.rand(o.removedAfter[0], o.removedAfter[1]) : lasts;
      C = { pct: o.pct || 25, ends: R.t + Math.min(lasts, off), name: o.name || 'Curse', text: o.text || '' };
      R.combat.setOutMult(1 - C.pct / 100);
      R.log('You are afflicted by ' + C.name + ': your damage is ' + C.pct + '% lower.', 'miss');
      R.count('curse');
    },
    update: function (dt, t) { if (C && (t >= C.ends || R.S.over)) end(true); },
    reset: function () { end(false); }, over: function () { end(false); },
    // For the buff row: { key, name, left (seconds), text } or null.
    aura: function () { return C ? { key: 'bossCurse', icon: opts.icon || 'debuff_curseOfRecklessness', name: C.name, left: Math.max(0, C.ends - R.t), text: C.text || 'Your damage is ' + C.pct + '% lower.' } : null; },
    snapshot: function () { return C ? 1 : 0; }
  };
}
