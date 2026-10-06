// Runs on another processor core, so the game never stutters while this calculates.
//
// Works out what the DPS sim's priority list reaches with the same character, settings and fight:
// - a fight that ends when the dummies are dead: the sim fights for a set time, so the fight length is adjusted until
//   the sim's damage equals the health of all dummies together;
// - a timed fight: the sim simply fights for that long.
// With several dummies the sim keeps its DoTs on all of them. Besides the DPS it reports what the review compares:
// casts and damage per spell, how long each DoT was up, time without a cast, Life Taps.
self.window = self;

// The page starts this file with its version in the address (?v=...); the same goes on every file fetched here, so
// the worker never mixes old and new files after an update.
var version = self.location.search || '';
var request = new XMLHttpRequest();
request.open('GET', '../vendor/warlock-sim/manifest.json' + version, false);
request.send();
var files = JSON.parse(request.responseText).files.filter(function (f) { return !/icons|tooltips/.test(f); });
importScripts.apply(null, files.map(function (f) { return '../vendor/warlock-sim/' + f + version; }));

self.onmessage = function (e) {
  var job = e.data, WL = self.WL, cfg = job.config, result = null, seconds;
  cfg.fight.durationVarPct = 0;
  cfg.fight.targets = job.targets || 1;
  cfg.fight.multiDot = cfg.fight.targets > 1;
  function run() {
    cfg.fight.duration = seconds;
    return WL.simulate(job.build, job.race, cfg, { iterations: Math.max(5, Math.min(400, Math.round(40000 / seconds))), log: false });
  }
  if (job.timed) { seconds = job.seconds; result = run(); }
  else {
    seconds = job.health / 600;
    for (var round = 0; round < 5; round++) {
      result = run();
      var next = job.health / result.dps, settled = Math.abs(next - seconds) / seconds < 0.01;
      seconds = next;
      if (settled) break;
    }
  }
  // The race and the review's graph: how much damage the sim has done by each second, averaged over a number of
  // its fights (each with other dice).
  // The review's timeline also shows what the sim cast in the first of those fights (job.seed: a seeded fight plays
  // it with the same dice as you).
  var curve = null, casts = null;
  try {
    var count = Math.max(1, Math.ceil(seconds)), sums = new Array(count + 1).fill(0), RUNS = 40;
    cfg.fight.duration = seconds;
    for (var n = 0; n < RUNS; n++) {
      var one = WL.simulateOnce(job.build, job.race, cfg, { seed: n === 0 && job.seed != null ? job.seed : 1000 + n * 7919, log: true });
      (one.log || []).forEach(function (line) { if (line.dmg > 0) sums[Math.min(count, Math.floor(line.t) + 1)] += line.dmg; });
      if (n === 0) {
        casts = (one.log || []).filter(function (line) { return line.type === 'cast' && !/^(summon:|demonicSacrifice|felDomination)/.test(line.spell); })
          .map(function (line) { return { t: line.t, k: line.spell, d: line.channel || line.castTime || 0, ch: line.channel ? 1 : 0 }; });
      }
    }
    curve = [0];
    for (var i = 1; i <= count; i++) curve.push(curve[i - 1] + sums[i] / RUNS);
    var scale = curve[count] > 0 ? result.dps * seconds / curve[count] : 1;     // ends exactly where the average does
    curve = curve.map(function (v) { return v * scale; });
  } catch (err) { curve = null; }
  var rows = {};
  Object.keys(result.bySpell).forEach(function (k) { rows[k] = { casts: result.bySpell[k].casts, dmg: result.bySpell[k].dmg }; });
  self.postMessage({ id: job.id, dps: result.dps, seconds: seconds, fights: result.iterations, bySpell: rows, uptime: result.uptimePct,
                     idle: result.mana.idleSecAvg, lifeTaps: result.lifeTaps, pushbackTime: result.pushback.time, curve: curve, casts: casts });
};
