// Smoke test for the vendored sim copy: loads it, builds stats and the spell table, runs one fight.
// Usage: node tools/check-vendor.js      (run it after every tools/sync-sim.ps1)
const { load, manifest } = require('./load-sim.js');

const m = manifest(), WL = load(), problems = [];
function need(cond, msg) { if (!cond) problems.push(msg); }

['SPELLS', 'TALENTS', 'TALENT_BY_KEY', 'TREES', 'RACES', 'BUILDS', 'DEFAULT_CONFIG', 'CONSUMABLES', 'ICONS', 'SPELL_TEXT', 'TALENT_TEXT', 'ACTIONS']
  .forEach(k => need(WL[k], 'WL.' + k + ' is missing'));
['computeStats', 'buildSpellTable', 'simulateOnce', 'makeRng', 'resistProfile', 'talentValue', 'validateBuild', 'spellsFor']
  .forEach(k => need(typeof WL[k] === 'function', 'WL.' + k + '() is missing'));

let line = '';
if (!problems.length) {
  const cfg = JSON.parse(JSON.stringify(WL.DEFAULT_CONFIG)), build = WL.BUILDS[0];
  const stats = WL.computeStats(build, 'human', cfg), table = WL.buildSpellTable(build, stats, cfg);
  need(stats.sp > 0 && stats.maxMana > 0, 'computeStats returned no spell power / mana');
  need(table.shadowBolt && table.shadowBolt.directDmg > 0, 'buildSpellTable has no Shadow Bolt damage');
  const fight = WL.simulateOnce(build, 'human', cfg, { seed: 1, duration: 60, log: true });
  need(fight.dps > 0 && fight.log.length > 10, 'simulateOnce produced no damage / log');
  line = build.short + ', Human: ' + stats.sp + ' spell power, Shadow Bolt ' + Math.round(table.shadowBolt.directDmg) +
    ' per hit, sample 60 s fight ' + fight.dps.toFixed(1) + ' DPS';
}

console.log('Vendored sim: commit ' + m.commit + ' (' + m.subject + '), synced ' + m.synced + (m.uncommittedChanges ? ', WITH uncommitted sim changes' : ''));
console.log(Object.keys(WL.SPELLS).length + ' spells, ' + WL.TALENTS.length + ' talents, ' + WL.BUILDS.length + ' builds, ' +
  Object.keys(WL.RACES).length + ' races, ' + Object.keys(WL.CONSUMABLES).length + ' consumables, ' + Object.keys(WL.ICONS).length + ' icons');
if (line) console.log(line);
if (problems.length) { console.log('FAIL\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('OK');
