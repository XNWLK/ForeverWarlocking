import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readConfiguration, practiceConfiguration } from '../js/configuration.js';
import { createCombat } from '../js/combat.js';
const require = createRequire(import.meta.url), WL = require('./load-sim.js').load();
const snapshot = c => JSON.stringify(WL.settingsSnapshot(c));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('OK: ' + name); }
check('decoding imported settings does not mutate defaults or earlier configurations', () => {
  const before = snapshot(WL.DEFAULT_CONFIG), applied = readConfiguration(WL, ''), code = WL.encodeSettings(applied);
  const draft = readConfiguration(WL, code); draft.gear.sp = 825; draft.buffs.blessingOfKings.on = false;
  assert.equal(snapshot(WL.DEFAULT_CONFIG), before); assert.equal(WL.encodeSettings(applied), code);
});
check('gear, buff, consumable and book-rank changes round trip through the original settings codec', () => {
  const draft = readConfiguration(WL, ''); Object.assign(draft.gear, { sp: 825, hitPct: 12.5, int: 225, shadowSp: 33, critIncludesAll: true, weaponIsSword: false });
  draft.options.bookRanks = true; draft.buffs.blessingOfKings.on = false;
  draft.consumables.greaterArcaneElixir.on = true; draft.debuffs.coeOther.on = true;
  assert.equal(snapshot(readConfiguration(WL, WL.encodeSettings(draft))), snapshot(draft));
});
check('imported settings and gameplay use the same resulting stats for every ready build and race', () => {
  const source = readConfiguration(WL, ''); Object.assign(source.gear, { sp: 825, hitPct: 12.5, int: 225, spi: 85, mp5: 20 });
  source.buffs.blessingOfKings.on = false; source.consumables.greaterArcaneElixir.on = true;
  for (const build of WL.BUILDS) for (const raceKey of WL.RACE_KEYS) {
    const preview = WL.computeStats(build, raceKey, practiceConfiguration(source).config);
    const c = createCombat({ WL, build, raceKey, config: practiceConfiguration(readConfiguration(WL, WL.encodeSettings(source))).config, timedDuration: 60 });
    for (const stat of ['sp', 'hitPct', 'critPct', 'hastePct', 'maxMana', 'maxHealth', 'spi', 'mp5']) assert.equal(c.stats[stat], preview[stat], stat);
  }
});
check('unsupported cooldowns stay inactive in practice without destroying imported data', () => {
  const source = readConfiguration(WL, ''); source.buffs.manaTide.on = true; source.consumables.majorManaPotion.on = true;
  const before = snapshot(source), { config, leftOut } = practiceConfiguration(source);
  assert.equal(config.buffs.manaTide.on, false); assert.equal(config.consumables.majorManaPotion.on, false);
  assert.equal(leftOut.length, 2); assert.equal(snapshot(source), before);
});
console.log(checks + ' setup checks passed.');
