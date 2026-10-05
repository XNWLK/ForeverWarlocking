// Runs on another processor core, so the game never stutters while this calculates.
//
// Works out what the DPS sim's priority list reaches with the same character, settings and fight:
// - a fight that ends when the dummies are dead: the sim fights for a set time, so the fight length is adjusted until
//   the sim's damage equals the health of all dummies together;
// - a timed fight: the sim simply fights for that long.
// With several dummies the sim keeps its DoTs on all of them. Besides the DPS it reports what the review compares:
// casts and damage per spell, how long each DoT was up, time without a cast, Life Taps.
self.window = self;

var request = new XMLHttpRequest();
request.open('GET', '../vendor/warlock-sim/manifest.json', false);
request.send();
var files = JSON.parse(request.responseText).files.filter(function (f) { return !/icons|tooltips/.test(f); });
importScripts.apply(null, files.map(function (f) { return '../vendor/warlock-sim/' + f; }));

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
  var rows = {};
  Object.keys(result.bySpell).forEach(function (k) { rows[k] = { casts: result.bySpell[k].casts, dmg: result.bySpell[k].dmg }; });
  self.postMessage({ id: job.id, dps: result.dps, seconds: seconds, fights: result.iterations, bySpell: rows, uptime: result.uptimePct,
                     idle: result.mana.idleSecAvg, lifeTaps: result.lifeTaps, pushbackTime: result.pushback.time });
};
