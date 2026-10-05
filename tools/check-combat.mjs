// Checks the real-time casting rules (js/combat.js) against the fight engine of the vendored sim.
//
// For every ready build and every race the engine plays one fight by its priority list. The casts it made are then
// replayed as button presses through js/combat.js with the same random seed. Both must deal the same damage, spell by
// spell, the pet's attacks included. The pet attacks from the first moment, as it does in the engine.
//
// Run: node tools/check-combat.mjs
import { createRequire } from 'node:module';
import { createCombat } from '../js/combat.js';

const require = createRequire(import.meta.url);
const WL = require('./load-sim.js').load();

const DURATION = 120, SEEDS = [1, 2, 3];
const ctx = { distance: 10, moving: false, petDistance: 0 };
let fights = 0, failures = 0;

for (const build of WL.BUILDS) {
  for (const raceKey of WL.RACE_KEYS) {
    for (const seed of SEEDS) {
      const cfg = JSON.parse(JSON.stringify(WL.DEFAULT_CONFIG));
      const sim = WL.simulateOnce(build, raceKey, cfg, { seed: seed, duration: DURATION, log: true });

      const combat = createCombat({ WL: WL, build: build, raceKey: raceKey, config: cfg, seed: seed, linearDuration: DURATION });
      const problems = [];
      combat.petCommand('attack');
      combat.update(0, ctx);
      for (const entry of sim.log) {
        if (entry.type !== 'cast' && entry.type !== 'racial') continue;
        // The engine's log rounds times to a millisecond. The exact moment is when the caster became free, or (when a
        // channel was cut short for this cast) the channel tick it was cut at - take whichever lies at the logged time.
        combat.update(entry.t - 0.001, ctx);
        let at = entry.t, off = 0.00051;
        for (const candidate of [combat.readyAt()].concat(combat.eventTimes())) {
          if (Math.abs(candidate - entry.t) < off) { at = candidate; off = Math.abs(candidate - entry.t); }
        }
        combat.update(at, ctx);
        const result = combat.press(entry.type === 'racial' ? 'racial' : entry.spell, ctx);
        if (!result.ok) problems.push('refused ' + entry.spell + ' at ' + entry.t + ' s (' + result.reason + ')');
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
        console.log('FAIL ' + build.key + ' / ' + raceKey + ' / seed ' + seed);
        problems.slice(0, 6).forEach(p => console.log('   ' + p));
      }
    }
  }
}

console.log(failures ? 'FAIL: ' + failures + ' of ' + fights + ' fights differ' : 'OK: ' + fights + ' fights, same damage as the engine in every one');
process.exit(failures ? 1 : 0);
