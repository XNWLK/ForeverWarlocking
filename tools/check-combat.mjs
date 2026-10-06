// Checks the real-time casting rules (js/combat.js) against the fight engine of the vendored sim.
//
// For every ready build and every race the engine plays fights by its priority list. The casts it made are then
// replayed as button presses through js/combat.js with the same random seed. Both must deal the same damage, spell by
// spell and target by target, the pet's attacks included. The pet attacks from the first moment, as in the engine.
//
// Fights checked: one target (three seeds), two and three targets with DoTs kept on all of them (Bane of Havoc
// included where the build has it), Rain of Fire and Hellfire as the filler on several targets, taking a hit every
// two seconds (pushback), and movement phases.
//
// Run: node tools/check-combat.mjs
import { createRequire } from 'node:module';
import { createCombat } from '../js/combat.js';

const require = createRequire(import.meta.url);
const WL = require('./load-sim.js').load();

const DURATION = 120;
const SCENES = [
  { name: '1 target', targets: 1, seeds: [1, 2, 3] },
  { name: '2 targets', targets: 2, seeds: [4] },
  { name: '3 targets', targets: 3, seeds: [5] },
  { name: '3 targets, Rain of Fire', targets: 3, seeds: [6], filler: 'rainOfFire' },
  { name: '2 targets, Hellfire', targets: 2, seeds: [7], filler: 'hellfire' },
  { name: 'hit every 2 s (pushback)', targets: 1, seeds: [8], fight: { hitEvery: 2 } },
  { name: 'moving 4 s every 20 s', targets: 1, seeds: [9], fight: { moveEvery: 20, moveDuration: 4 } }
];
const ctx = { moving: false, petDistance: 0 };
let fights = 0, failures = 0;

function withFiller(build, filler) {
  if (!filler) return build;
  const copy = JSON.parse(JSON.stringify(build));
  copy.rotation[copy.rotation.length - 1] = filler;       // the last action of every ready build is its filler
  return copy;
}

for (const scene of SCENES) {
  for (const ready of WL.BUILDS) {
    const build = withFiller(ready, scene.filler);
    for (const raceKey of WL.RACE_KEYS) {
      for (const seed of scene.seeds) {
        const cfg = JSON.parse(JSON.stringify(WL.DEFAULT_CONFIG));
        cfg.fight.targets = scene.targets;
        cfg.fight.multiDot = scene.targets > 1;
        Object.assign(cfg.fight, scene.fight || {});
        const sim = WL.simulateOnce(build, raceKey, cfg, { seed: seed, duration: DURATION, log: true });

        const combat = createCombat({ WL: WL, build: build, raceKey: raceKey, config: cfg, seed: seed, linearDuration: DURATION, targets: scene.targets });
        const problems = [];
        let manaOff = 0;
        let freeSince = 0;                 // when the caster became free after the last cast (the engine waits from there)
        combat.petCommand('attack', 1);
        combat.update(0, ctx);
        for (const entry of sim.log) {
          if (entry.type !== 'cast' && entry.type !== 'racial') continue;
          // The engine's log rounds times to a millisecond. The exact moment is when the caster became free, or (when
          // a channel was cut short for this cast) the channel tick it was cut at, or the end of a movement phase, or
          // a tenth of a second later each time the engine found nothing to cast - whichever lies at the logged time.
          combat.update(entry.t - 0.001, ctx);
          let at = entry.t, off = 0.00051;
          const candidates = [combat.readyAt()].concat(combat.eventTimes());
          for (let j = 0; j <= 400; j++) candidates.push(freeSince + j * 0.1);
          if (cfg.fight.moveEvery) {
            const k = Math.floor(entry.t / cfg.fight.moveEvery);
            candidates.push(k * cfg.fight.moveEvery, k * cfg.fight.moveEvery + cfg.fight.moveDuration);
          }
          for (const candidate of candidates) {
            if (Math.abs(candidate - entry.t) < off) { at = candidate; off = Math.abs(candidate - entry.t); }
          }
          combat.update(at, ctx);
          // "x2:corruption" = Corruption on the second target; Bane of Havoc always goes on the second target.
          const extra = /^x(\d):(.+)$/.exec(entry.spell || '');
          const key = entry.type === 'racial' ? 'racial' : extra ? extra[2] : entry.spell;
          combat.setTarget(key === 'baneOfHavoc' ? 2 : extra ? Number(extra[1]) : 1);
          // Mana at the moment of this cast. The engine logs it (in whole numbers) right after taking the spell's price
          // and before the spell lands, so what it had before is that plus the price. This is what proves that mana
          // regeneration (MP5 and the 5-second rule) is the same here. Life Tap and the race's cooldown are left out
          // (they are logged after what they give).
          if (entry.type === 'cast' && key !== 'lifeTap' && combat.table[key] && entry.mana != null && manaOff < 3) {
            const before = combat.state.mana, engine = entry.mana + combat.cost(key);
            if (Math.abs(before - engine) > 1) { manaOff++; problems.push('mana before ' + entry.spell + ' at ' + entry.t + ' s: engine ' + engine.toFixed(1) + ', here ' + before.toFixed(1)); }
          }
          const result = combat.press(key, ctx);
          if (!result.ok) problems.push('refused ' + entry.spell + ' at ' + entry.t + ' s (' + result.reason + ')');
          freeSince = Math.max(combat.readyAt(), combat.state.channel ? combat.state.channel.end : 0);
        }
        combat.update(DURATION, ctx);

        const mine = combat.result;
        const keys = new Set(Object.keys(sim.bySpell).concat(Object.keys(mine.bySpell)));
        for (const key of keys) {
          const a = sim.bySpell[key] ? sim.bySpell[key].dmg : 0, b = mine.bySpell[key] ? mine.bySpell[key].dmg : 0;
          if (!(Math.abs(a - b) <= 1e-6 * Math.max(1, a))) problems.push(key + ': engine ' + a.toFixed(1) + ', here ' + b.toFixed(1));
        }
        if (!(Math.abs(sim.total - mine.total) <= 1e-6 * Math.max(1, sim.total))) problems.push('total: engine ' + sim.total.toFixed(1) + ', here ' + mine.total.toFixed(1));

        fights++;
        if (problems.length) {
          failures++;
          console.log('FAIL ' + scene.name + ' / ' + build.key + ' / ' + raceKey + ' / seed ' + seed);
          problems.slice(0, 6).forEach(p => console.log('   ' + p));
        }
      }
    }
  }
}

console.log(failures ? 'FAIL: ' + failures + ' of ' + fights + ' fights differ' : 'OK: ' + fights + ' fights, same damage and mana as the engine in every one');
process.exit(failures ? 1 : 0);
