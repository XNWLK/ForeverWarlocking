// The boss test bot (for checks, not part of the game; loaded only when asked for: FW.bossTest(id, opts) in the
// browser console). It plays a boss fight from the pull to the end the way the sim's priority list would, as fast as
// the page can go (nothing is drawn while it runs), and reports what happened:
//   - when each phase came, the boss's yells and emotes, what it cast;
//   - every hit you took, by what, how often and how much; whether you died, and of what;
//   - your DPS against the sim's, adds that came in and fell, and how long it took.
// opts: { mode: 'stand' (only walks to stay in range) | 'dodge' (also steps out of every danger the fight shows),
//         seed: a number = the same dice every time (Math.random is replaced while it runs), step: seconds a frame
//         (0.05), chunk: frames between breaths for the page (250), immortal: true = you cannot die, so the whole
//         fight is seen even standing in everything, until: a second to stop at, leaving the fight there }
// Returns a Promise of the report; FW.bossTest also prints a short summary.

function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A danger zone (from the fight's zones()) covers a point.
function inZone(z, x, y) {
  if (z.type === 'circle') return Math.hypot(x - z.x, y - z.z) <= z.r + 0.6;
  if (z.type === 'lane') {
    const dx = z.bx - z.ax, dz = z.bz - z.az, len = dx * dx + dz * dz;
    const t = len ? Math.max(0, Math.min(1, ((x - z.ax) * dx + (y - z.az) * dz) / len)) : 0;
    return Math.hypot(x - (z.ax + dx * t), y - (z.az + dz * t)) <= z.w / 2 + 0.6;
  }
  if (z.type === 'cone') {
    const dx = x - z.x, dy = y - z.z, d = Math.hypot(dx, dy) || 0.001;
    if (d > z.r + 0.6) return false;
    const fx = -Math.sin(z.yaw), fz = -Math.cos(z.yaw);
    return (dx * fx + dy * fz) / d >= Math.cos(z.a + 0.1);
  }
  if (z.type === 'ring') { const d = Math.hypot(x - z.x, y - z.z); return d >= z.r0 - 0.6 && d <= z.r1 + 0.6; }
  if (z.type === 'area') return !!(z.test && z.test(x, y));
  return false;
}

// A short breath for the page between chunks of frames. Not setTimeout: a hidden tab slows timers down to one a second.
const channel = new MessageChannel(), waiting = [];
channel.port1.onmessage = function () { const fn = waiting.shift(); if (fn) fn(); };
function breathe(fn) { waiting.push(fn); channel.port2.postMessage(0); }

export function runBossBot(FW, id, opts) {
  opts = Object.assign({ mode: 'stand', seed: null, step: 0.05, chunk: 250 }, opts || {});
  const realRandom = Math.random, realNow = performance.now.bind(performance);
  let off = 0;
  performance.now = function () { return realNow() + off; };
  FW.renderer.setAnimationLoop(null);
  FW.fast = true;
  const began = realNow();
  // Out of any boss fight first and one frame on, so every run starts the same way (from the entrance, the clock caught up).
  FW.leaveBoss();
  FW.frame();
  if (opts.seed != null) Math.random = mulberry(opts.seed);
  FW.startBoss(id);
  const fight = FW.bossFight, combat0 = FW.combat;
  FW.setTarget(1);
  const report = { boss: id, mode: opts.mode, seed: opts.seed, phases: [], said: [], doing: {}, hits: {}, taken: 0, healed: 0,
                   died: null, frames: 0 };
  let lastPhase = null, lastBanner = '', lastDoing = '', walking = false, frames = 0;
  const spawned = {};

  function remaining(c) { return c.timed ? c.timeLeft() : 120; }
  function boss() { return { x: FW.dummies[1].x, z: FW.dummies[1].z, r: FW.dummies[1].radius }; }

  // Where to stand: as near as possible, inside the room, out of every danger, within spell range of the boss's edge.
  function safeSpot(player, zones, range) {
    const b = boss(), room = fight.room || {};
    const ok = function (x, z) {
      if (room.walkable && !room.walkable(x, z)) return false;
      if (zones.some(function (zn) { return inZone(zn, x, z); })) return false;
      return Math.hypot(x - b.x, z - b.z) - b.r <= range;
    };
    if (ok(player.x, player.z)) return null;
    for (let r = 2; r <= 40; r += 2) {
      for (let k = 0; k < 24; k++) {
        const a = k / 24 * Math.PI * 2, x = player.x + Math.sin(a) * r, z = player.z + Math.cos(a) * r;
        if (ok(x, z)) return { x: x, z: z };
      }
    }
    return null;
  }

  function walkTo(p) {
    const player = FW.player;
    if (!p) { if (walking) { FW.controls.setStick(0, 0); walking = false; } return; }
    player.yaw = Math.atan2(-(p.x - player.x), -(p.z - player.z));
    FW.controls.setStick(0, 1);
    walking = true;
  }

  function step() {
    if (opts.immortal && FW.combat.state.fightStart !== null) FW.combat.state.health = 1e7;   // unkillable: every phase gets seen
    off += opts.step * 1000;
    FW.frame();
    frames++;
    const c = FW.combat, S = c.state, player = FW.player;
    if (c !== combat0) return 'replaced';
    const t = S.fightStart === null ? 0 : c.fightSeconds();
    // What the fight shows: its phase, its yells and emotes, what the boss is doing.
    const phase = fight.phaseName ? fight.phaseName() : '';
    if (phase !== lastPhase) { report.phases.push([phase, Math.round(t * 10) / 10]); lastPhase = phase; }
    const banner = FW.ctx.banner ? FW.ctx.banner.text : '';
    if (banner && banner !== lastBanner && !/^\d/.test(banner)) report.said.push([Math.round(t * 10) / 10, banner]);
    lastBanner = banner;
    const doing = fight.doing ? fight.doing() : '';
    if (doing && doing !== lastDoing) report.doing[doing] = (report.doing[doing] || 0) + 1;
    lastDoing = doing;
    for (let i = 2; i <= fight.count; i++) if (S.targets[i] && !S.targets[i].absent && !spawned[i]) spawned[i] = true;
    if (S.over) return 'over';
    if (opts.until && t >= opts.until) return 'until';    // stop here and leave the fight as it is (to look at it)
    // Walking: out of danger (dodge), into range of the boss (both).
    const feared = fight.feared && fight.feared();
    if (!feared) {
      const zones = opts.mode === 'dodge' && fight.zones ? fight.zones(player) : [];
      walkTo(safeSpot(player, zones, 27));
    } else walkTo(null);
    // Casting: what the sim would cast, when you are free and standing still.
    if (!walking && !feared && c.readyAt() <= S.t + 1e-6 && !S.cast && !S.channel) {
      if (S.target !== 1 && c.alive(1)) FW.setTarget(1);
      const w = c.simWould(remaining(c));
      if (w) {
        if (w.amplify) FW.press('amplifyCurse');
        if (w.racial) FW.press('racial');
        FW.press(w.key);
      }
    }
    return null;
  }

  function finish(why) {
    FW.controls.setStick(0, 0);
    const c = FW.combat, S = c.state;
    // Every hit you took, from the combat log ("<what> hits you for <n>.").
    (FW.fightLog ? FW.fightLog() : []).forEach(function (line) {
      const m = /^(.+) hits you for ([\d,]+)\.$/.exec(line[1]);
      if (m) {
        const n = Number(m[2].replace(/,/g, '')), h = report.hits[m[1]] || (report.hits[m[1]] = { n: 0, total: 0 });
        h.n++; h.total += n; report.taken += n;
      }
      if (/^You died/.test(line[1])) report.died = { at: line[0] };
    });
    const seconds = c.fightSeconds();
    report.seconds = Math.round(seconds * 10) / 10;
    report.endedBy = why === 'over' ? (report.died ? 'death' : 'time') : why;
    report.dps = Math.round(seconds > 0 ? c.result.total / seconds : 0);
    report.simDps = FW.simResult ? Math.round(FW.simResult.dps) : null;
    report.pct = report.simDps ? Math.round(100 * report.dps / report.simDps) : null;
    report.lowestHealth = Math.round(S.minHealth != null ? S.minHealth : 0);
    report.addsIn = Object.keys(spawned).length;
    report.addsDown = Object.keys(spawned).filter(function (i) { return S.targets[i].dead; }).length;
    if (fight.stats) report.stats = fight.stats();
    report.frames = frames;
    report.ms = Math.round(realNow() - began);
    Math.random = realRandom;
    performance.now = realNow;
    FW.resyncClock();                                    // the game clock was ahead by the time the bot ran
    FW.fast = false;
    FW.renderer.setAnimationLoop(FW.frame);
    return report;
  }

  return new Promise(function (resolve) {
    function chunk() {
      for (let i = 0; i < opts.chunk; i++) {
        const done = step();
        if (done || frames > 40 * 60 * 20) { resolve(finish(done || 'too long')); return; }
      }
      breathe(chunk);
    }
    chunk();
  });
}

// A few lines for the console.
export function summary(r) {
  const hits = Object.keys(r.hits).sort(function (a, b) { return r.hits[b].total - r.hits[a].total; })
    .map(function (k) { return '  ' + k + ': ' + r.hits[k].n + 'x, ' + r.hits[k].total.toLocaleString('en-US'); });
  return [r.boss + ' (' + r.mode + (r.seed != null ? ', seed ' + r.seed : '') + '): ' + r.endedBy + ' at ' + r.seconds + ' s, ' + r.dps + ' DPS' +
          (r.pct != null ? ' (' + r.pct + '% of the sim)' : '') + ', lowest health ' + r.lowestHealth,
          'Phases: ' + r.phases.map(function (p) { return p[0] + ' @' + p[1]; }).join(', '),
          'Adds: ' + r.addsIn + ' in, ' + r.addsDown + ' down. Took ' + r.taken.toLocaleString('en-US') + ':'].concat(hits).join('\n');
}

// Many runs of the same fight, added up: averages (and lowest / highest) of everything the reports count. Seeds do not
// make runs repeat exactly (the sim's answers come back at their own moments), so compare such averages instead.
export function runMany(FW, id, opts, n) {
  const reports = [];
  function next() {
    if (reports.length >= n) return Promise.resolve(addUp(reports));
    return runBossBot(FW, id, opts).then(function (r) { reports.push(r); return next(); });
  }
  return next();
}
function addUp(list) {
  const out = { runs: list.length, died: 0, seconds: [], dps: [], addsIn: [], addsDown: [], phases: {}, said: {}, doing: {}, hits: {} };
  function put(map, key, v) { (map[key] || (map[key] = [])).push(v); }
  list.forEach(function (r) {
    if (r.endedBy === 'death') out.died++;
    out.seconds.push(r.seconds); out.dps.push(r.dps); out.addsIn.push(r.addsIn); out.addsDown.push(r.addsDown);
    r.phases.forEach(function (p) { put(out.phases, p[0], p[1]); });
    const said = {};
    r.said.forEach(function (s) { const k = s[1].replace(/\d+/g, '#'); said[k] = (said[k] || 0) + 1; });
    Object.keys(said).forEach(function (k) { put(out.said, k, said[k]); });
    Object.keys(r.doing).forEach(function (k) { put(out.doing, k, r.doing[k]); });
    Object.keys(r.hits).forEach(function (k) { put(out.hits, k + ' (hits)', r.hits[k].n); put(out.hits, k + ' (total)', r.hits[k].total); });
  });
  function stat(a) { const m = a.reduce(function (x, y) { return x + y; }, 0) / list.length; return [Math.round(m * 10) / 10, Math.min.apply(null, a), Math.max.apply(null, a), a.length]; }
  ['seconds', 'dps', 'addsIn', 'addsDown'].forEach(function (k) { out[k] = stat(out[k]); });
  ['phases', 'said', 'doing', 'hits'].forEach(function (k) { Object.keys(out[k]).forEach(function (j) { out[k][j] = stat(out[k][j]); }); });
  return out;
}
