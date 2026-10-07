// Decode imported WarlockSIM settings and exclude effects unsupported by the runner.
export const cloneConfig = value => JSON.parse(JSON.stringify(value));
export function readConfiguration(WL, code) {
  const config = cloneConfig(WL.DEFAULT_CONFIG);
  if (code) WL.applySettings(config, WL.decodeSettings(code));
  return config;
}
export function unsupportedSetting(section, item) {
  if (section === 'consumables' && (item.spPotion || item.manaRestore || item.explosive)) return 'Active items are not playable in the 3D sim yet.';
  if (section === 'buffs' && (item.tide || item.innervate || item.spellDmgPct)) return 'This external cooldown is not playable in the 3D sim yet.';
  return '';
}
// Pass the same supported configuration to gameplay and the sim comparison.
export function practiceConfiguration(source) {
  const config = cloneConfig(source), leftOut = [];
  ['buffs', 'consumables'].forEach(section => Object.values(config[section]).forEach(item => {
    if (item.on && unsupportedSetting(section, item)) { item.on = false; leftOut.push(item.name); }
  }));
  const exclusive = {};
  Object.values(config.buffs).forEach(b => {
    if (b.on && b.excl) { if (exclusive[b.excl]) b.on = false; else exclusive[b.excl] = true; }
  });
  return { config, leftOut };
}
