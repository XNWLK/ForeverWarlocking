import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readConfiguration, practiceConfiguration, setSetupToggle, copySetupFields, validateSetup } from '../js/configuration.js';
import { createCombat } from '../js/combat.js';
const require = createRequire(import.meta.url), WL = require('./load-sim.js').load();
const snapshot = c => JSON.stringify(WL.settingsSnapshot(c));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('OK: ' + name); }
check('draft edits never mutate defaults or the previously applied setup', () => {
  const before = snapshot(WL.DEFAULT_CONFIG), applied = readConfiguration(WL, ''), code = WL.encodeSettings(applied);
  const draft = readConfiguration(WL, code); draft.gear.sp = 825; setSetupToggle(draft, 'buffs', 'blessingOfKings', false);
  assert.equal(snapshot(WL.DEFAULT_CONFIG), before); assert.equal(WL.encodeSettings(applied), code);
});
check('gear, buff, consumable and book-rank changes round trip through the original settings codec', () => {
  const draft = readConfiguration(WL, ''); Object.assign(draft.gear, { sp: 825, hitPct: 12.5, int: 225, shadowSp: 33, critIncludesAll: true, weaponIsSword: false });
  draft.options.bookRanks = true; setSetupToggle(draft, 'buffs', 'blessingOfKings', false);
  setSetupToggle(draft, 'consumables', 'greaterArcaneElixir', true); setSetupToggle(draft, 'debuffs', 'coeOther', true);
  assert.equal(snapshot(readConfiguration(WL, WL.encodeSettings(draft))), snapshot(draft));
});
check('preview and gameplay use the same resulting stats for every ready build and race', () => {
  const source = readConfiguration(WL, ''); Object.assign(source.gear, { sp: 825, hitPct: 12.5, int: 225, spi: 85, mp5: 20 });
  setSetupToggle(source, 'buffs', 'blessingOfKings', false); setSetupToggle(source, 'consumables', 'greaterArcaneElixir', true);
  for (const build of WL.BUILDS) for (const raceKey of WL.RACE_KEYS) {
    const preview = WL.computeStats(build, raceKey, practiceConfiguration(source).config);
    const c = createCombat({ WL, build, raceKey, config: practiceConfiguration(readConfiguration(WL, WL.encodeSettings(source))).config, timedDuration: 60 });
    for (const stat of ['sp', 'hitPct', 'critPct', 'hastePct', 'maxMana', 'maxHealth', 'spi', 'mp5']) assert.equal(c.stats[stat], preview[stat], stat);
  }
});
check('air totems and non-stacking debuffs replace their previous selection', () => {
  const c = readConfiguration(WL, '');
  setSetupToggle(c, 'buffs', 'windfuryTotem', true); setSetupToggle(c, 'buffs', 'graceOfAir', true);
  assert.equal(c.buffs.windfuryTotem.on, false); assert.equal(c.buffs.graceOfAir.on, true); assert.equal(c.buffs.scrollOfAgility.on, false);
  setSetupToggle(c, 'buffs', 'tranquilAir', true); assert.equal(c.buffs.graceOfAir.on, false);
  setSetupToggle(c, 'buffs', 'blessingOfSalvation', true); assert.equal(c.buffs.tranquilAir.on, false);
  setSetupToggle(c, 'debuffs', 'exposeArmor', true); assert.equal(c.debuffs.sunderArmor.on, false);
  setSetupToggle(c, 'debuffs', 'curseOfRecklessness', true); assert.equal(c.debuffs.faerieFire.on, false);
});
check('dependent buffs enable their parent and turn off when the parent is removed', () => {
  const c = readConfiguration(WL, '');
  setSetupToggle(c, 'buffs', 'restorativeTotems', true); assert.equal(c.buffs.manaSpring.on, true);
  setSetupToggle(c, 'buffs', 'manaSpring', false); assert.equal(c.buffs.restorativeTotems.on, false);
});
check('food choices are exclusive while weapon oil and build stone can stack', () => {
  const c = readConfiguration(WL, '');
  setSetupToggle(c, 'consumables', 'nightfinSoup', true); setSetupToggle(c, 'consumables', 'runnTumTuber', true);
  assert.equal(c.consumables.nightfinSoup.on, false);
  setSetupToggle(c, 'consumables', 'brilliantWizardOil', true);
  assert.equal(c.consumables.buildOil.on, true); assert.equal(WL.weaponEffects(WL.BUILDS[0], c).length, 2);
});
check('unsupported cooldowns stay inactive in practice without destroying imported data', () => {
  const source = readConfiguration(WL, ''); source.buffs.manaTide.on = true; source.consumables.majorManaPotion.on = true;
  const before = snapshot(source), { config, leftOut } = practiceConfiguration(source);
  assert.equal(config.buffs.manaTide.on, false); assert.equal(config.consumables.majorManaPotion.on, false);
  assert.equal(leftOut.length, 2); assert.equal(snapshot(source), before);
  setSetupToggle(config, 'buffs', 'manaTide', true); assert.equal(config.buffs.manaTide.on, false);
});
check('loading profiles or defaults preserves advanced imported and fight settings', () => {
  const target = readConfiguration(WL, ''), source = readConfiguration(WL, '');
  target.fight.duration = 240; target.options.activesPolicy = 'execute'; target.petSpPct = 15;
  target.combat.targetResist.shadow = 40; target.buffs.innervate.on = true;
  source.gear.sp = 900; source.options.bookRanks = true;
  copySetupFields(target, source);
  assert.equal(target.gear.sp, 900); assert.equal(target.options.bookRanks, true);
  assert.equal(target.fight.duration, 240); assert.equal(target.options.activesPolicy, 'execute'); assert.equal(target.petSpPct, 15);
  assert.equal(target.combat.targetResist.shadow, 40); assert.equal(target.buffs.innervate.on, true);
  copySetupFields(target, WL.DEFAULT_CONFIG); assert.equal(target.gear.sp, WL.DEFAULT_CONFIG.gear.sp); assert.equal(target.fight.duration, 240);
});
check('invalid gear inputs are rejected, fractional stats and zero are allowed', () => {
  const c = readConfiguration(WL, '');
  for (const invalid of [NaN, Infinity, -1, '750', null]) { c.gear.sp = invalid; assert.ok(validateSetup(c).length); }
  c.gear.sp = 750.5; c.gear.mp5 = 0; assert.equal(validateSetup(c).length, 0);
  c.gear.hitPct = 101; assert.ok(validateSetup(c).length);
  assert.throws(() => readConfiguration(WL, 'broken'));
});
console.log(checks + ' setup checks passed.');
