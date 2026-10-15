// Runs on another processor core, so the game never stutters while this calculates.
//
// Works out what the DPS sim's priority list reaches with the same character, settings and fight:
// - a fight that ends when the dummies are dead: the sim fights for a set time, so the fight length is adjusted until
//   the sim's damage equals the health of all dummies together;
// - a timed fight: the sim simply fights for that long.
// - a fight with infinite health that you ended (job.cut = how long yours lasted): the sim fights longer than that,
//   and what it had done by that second is reported - like you, it did not know when the fight would end. (A sim
//   that fights for exactly that long would skip what no longer pays, Bane of Doom for one, and be ahead for it.)
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
  cfg.fight.precast = job.precast || '';                   // the spell you opened the fight with before it began, if any
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
  var curve = null, casts = null, petHits = null, mana = null, opener = null;
  var cut = job.cut > 0 ? Math.min(job.cut, seconds) : 0, part = null;   // part: the fight up to the cut, summed over the logged fights
  try {
    var count = Math.max(1, Math.ceil(seconds)), sums = new Array(count + 1).fill(0), RUNS = 40;
    var taps = 0, tapMana = 0, endMana = 0, lowMana = 0, movingTaps = 0;       // the mana review: averages of these fights
    var starts = {};                                                           // how each of these fights opened: its first 8 casts
    cfg.fight.duration = seconds;
    if (cut) part = { dmg: 0, rows: {}, up: {}, idle: 0, taps: 0, tapMana: 0, movingTaps: 0, end: 0, min: 0 };
    for (var n = 0; n < RUNS; n++) {
      var one = WL.simulateOnce(job.build, job.race, cfg, { seed: n === 0 && job.seed != null ? job.seed : 1000 + n * 7919, log: true });
      (one.log || []).forEach(function (line) { if (line.dmg > 0) sums[Math.min(count, Math.floor(line.t) + 1)] += line.dmg; });
      taps += one.lifeTaps || 0; tapMana += one.manaFromTaps || 0; endMana += one.endMana || 0; lowMana += isFinite(one.minMana) ? one.minMana : 0; movingTaps += one.movingTaps || 0;
      var cast = (one.log || []).filter(function (line) { return line.type === 'cast' && !/^(summon:|demonicSacrifice|felDomination)/.test(line.spell); });
      var first = cast.slice(0, 8).map(function (line) { return line.spell.replace(/^x\d:/, ''); }).join(' ');   // the spell, whichever dummy it went to
      starts[first] = (starts[first] || 0) + 1;
      if (n === 0) casts = cast.map(function (line) { return { t: line.t, k: line.spell, d: line.channel || line.castTime || 0, ch: line.channel ? 1 : 0 }; });
      // The pet's spells in that same fight (Firebolt, Lash of Pain; landed or missed), for the ghost's demon. Plain melee
      // swings are not in the log: the ghost's Succubus swings at her own pace.
      if (n === 0) petHits = (one.log || []).filter(function (line) { return (line.type === 'pet' || line.type === 'miss') && /^pet:(firebolt|lashOfPain)$/.test(line.spell); })
        .map(function (line) { return { t: line.t, k: line.spell }; });
      if (part) {
        var busyUntil = 0, lastMana = null, lowest = Infinity;
        (one.log || []).forEach(function (line) {
          if (line.t >= cut) return;
          var pet = line.type === 'pet' || (line.type === 'miss' && /^pet:/.test(line.spell));   // the pet's attacks count as its casts, as in the sim's own table
          var row = line.dmg > 0 || line.type === 'cast' || pet ? part.rows[line.spell] || (part.rows[line.spell] = { casts: 0, dmg: 0 }) : null;
          if (line.dmg > 0) { row.dmg += line.dmg; part.dmg += line.dmg; }
          if (pet) row.casts++;
          if (line.type === 'cast') {
            if (!/^(summon:|demonicSacrifice|felDomination)/.test(line.spell)) row.casts++;
            if (line.t > busyUntil) part.idle += line.t - busyUntil;                  // nothing was cast, and no global cooldown ran
            busyUntil = Math.max(busyUntil, line.t + Math.max(line.channel || line.castTime || 0, line.gcd || 0));
            if (line.spell === 'lifeTap') { part.taps++; part.tapMana += line.gain || 0; if (line.moving) part.movingTaps++; }
          }
          if (line.mana != null) { lastMana = line.mana; if (line.mana < lowest) lowest = line.mana; }
        });
        if (cut > busyUntil) part.idle += cut - busyUntil;
        part.end += lastMana != null ? lastMana : 0; part.min += isFinite(lowest) ? lowest : 0;
        Object.keys(one.auras || {}).forEach(function (k) {
          one.auras[k].forEach(function (span) { if (span[0] < cut) part.up[k] = (part.up[k] || 0) + Math.min(span[1], cut) - span[0]; });
        });
      }
    }
    curve = [0];
    for (var i = 1; i <= count; i++) curve.push(curve[i - 1] + sums[i] / RUNS);
    var scale = curve[count] > 0 ? result.dps * seconds / curve[count] : 1;     // ends exactly where the average does
    curve = curve.map(function (v) { return v * scale; });
    mana = { taps: taps / RUNS, tapMana: tapMana / RUNS, end: endMana / RUNS, min: lowMana / RUNS, movingTaps: movingTaps / RUNS };
    // The opener: the way most of these fights began (one fight alone may hold a miss, and so a spell cast twice).
    var usual = Object.keys(starts).sort(function (a, b) { return starts[b] - starts[a]; })[0];
    opener = usual ? usual.split(' ') : null;
    if (part) part.scale = scale;
  } catch (err) { curve = null; part = null; }
  // The sim's highest fight, for the faint line in the review's graph: the same fights again to find which one it
  // was, then that one with its log. It runs the sim's full time also when the fight ends on health, so that the line
  // ends at the sim's highest DPS (cut off at the dummies' health it would hide what made that fight the highest).
  var top = null;
  try {
    var best = -1, bestDps = -1;
    for (var f = 0; f < result.iterations; f++) {
      var fp = WL.fightParams(cfg, f);
      var dps = WL.simulateOnce(job.build, job.race, cfg, { stats: result.stats, table: result.table, seed: fp.seed, duration: fp.duration, log: false }).dps;
      if (dps > bestDps) { bestDps = dps; best = f; }
    }
    var bp = WL.fightParams(cfg, best), size = Math.max(1, Math.ceil(seconds)), per = new Array(size + 1).fill(0);
    var high = WL.simulateOnce(job.build, job.race, cfg, { stats: result.stats, table: result.table, seed: bp.seed, duration: bp.duration, log: true });
    (high.log || []).forEach(function (line) { if (line.dmg > 0) per[Math.min(size, Math.floor(line.t) + 1)] += line.dmg; });
    var logged = per.reduce(function (a, b) { return a + b; }, 0), fit = logged > 0 ? result.dpsMax * seconds / logged : 1;   // ends exactly at the highest DPS
    top = [0];
    for (var s = 1; s <= size; s++) top.push(top[s - 1] + per[s] * fit);
  } catch (err) { top = null; }
  var rows = {};
  Object.keys(result.bySpell).forEach(function (k) { rows[k] = { casts: result.bySpell[k].casts, dmg: result.bySpell[k].dmg }; });
  // A fight you ended: everything as it stood at that second, averaged over the logged fights.
  if (part && curve) {
    var whole = Math.floor(cut), done = part.dmg / RUNS * part.scale, share = cut / seconds, up = {}, cutRows = {};
    var cutCurve = curve.slice(0, whole + 1);
    if (cut > whole) cutCurve.push(done);                  // the last second is a part of one
    Object.keys(part.rows).forEach(function (k) { cutRows[k] = { casts: part.rows[k].casts / RUNS, dmg: part.rows[k].dmg / RUNS * part.scale }; });
    Object.keys(part.up).forEach(function (k) { up[k] = 100 * part.up[k] / RUNS / cut; });
    self.postMessage({ id: job.id, precast: job.precast || '', dps: done / cut, max: result.dpsMax, seconds: cut, fights: RUNS, bySpell: cutRows, uptime: up, cut: true,
                       idle: part.idle / RUNS, spirit: result.mana.spiritRegenAvg * share, health: result.health, tps: result.tps, lifeTaps: part.taps / RUNS, pushbackTime: result.pushback.time * share,
                       curve: cutCurve, top: null, casts: (casts || []).filter(function (c) { return c.t < cut; }), petHits: (petHits || []).filter(function (c) { return c.t < cut; }),
                       mana: { taps: part.taps / RUNS, tapMana: part.tapMana / RUNS, end: part.end / RUNS, min: part.min / RUNS, movingTaps: part.movingTaps / RUNS }, opener: opener });
    return;
  }
  self.postMessage({ id: job.id, precast: job.precast || '', dps: result.dps, max: result.dpsMax, seconds: seconds, fights: result.iterations, bySpell: rows, uptime: result.uptimePct,
                     idle: result.mana.idleSecAvg, spirit: result.mana.spiritRegenAvg, health: result.health, tps: result.tps, lifeTaps: result.lifeTaps, pushbackTime: result.pushback.time, curve: curve, top: top, casts: casts, petHits: petHits, mana: mana, opener: opener });
};
