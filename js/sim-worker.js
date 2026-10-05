// Runs on another processor core, so the game never stutters while this calculates.
//
// Works out what the DPS sim's priority list reaches on these dummies with the same character: the sim fights for a
// set time, the dummies have a set health, so the fight length is adjusted until the sim's damage equals the health of
// all dummies together. With several dummies the sim keeps its DoTs on all of them.
self.window = self;

var request = new XMLHttpRequest();
request.open('GET', '../vendor/warlock-sim/manifest.json', false);
request.send();
var files = JSON.parse(request.responseText).files.filter(function (f) { return !/icons|tooltips/.test(f); });
importScripts.apply(null, files.map(function (f) { return '../vendor/warlock-sim/' + f; }));

self.onmessage = function (e) {
  var job = e.data, WL = self.WL;
  var build = WL.BUILDS.filter(function (b) { return b.key === job.build; })[0];
  var cfg = JSON.parse(JSON.stringify(WL.DEFAULT_CONFIG));
  cfg.fight.durationVarPct = 0;
  cfg.fight.targets = job.targets || 1;
  cfg.fight.multiDot = cfg.fight.targets > 1;
  var seconds = job.health / 600, result = null;
  for (var round = 0; round < 5; round++) {
    cfg.fight.duration = seconds;
    var fights = Math.max(5, Math.min(400, Math.round(40000 / seconds)));
    result = WL.simulate(build, job.race, cfg, { iterations: fights, log: false });
    var next = job.health / result.dps;
    var settled = Math.abs(next - seconds) / seconds < 0.01;
    seconds = next;
    if (settled) break;
  }
  self.postMessage({ id: job.id, dps: result.dps, seconds: seconds, fights: result.iterations });
};
