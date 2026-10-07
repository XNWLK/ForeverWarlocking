// Setup editing uses the vendored sim's configuration and codecs. No spell values live here.
export const GEAR_FIELDS = [
  ['sp', 'Spell power', 100000], ['shadowSp', 'Extra Shadow spell power', 100000], ['fireSp', 'Extra Fire spell power', 100000],
  ['hitPct', 'Spell hit from gear (%)', 100], ['critPct', 'Unbuffed sheet spell crit (%)', 100], ['hastePct', 'Spell haste from gear (%)', 1000],
  ['int', 'Intellect from gear', 100000], ['spi', 'Spirit from gear', 100000], ['sta', 'Stamina from gear', 100000],
  ['agi', 'Agility from gear', 100000], ['mp5', 'Mana per 5 seconds from gear', 100000], ['pierce', 'Spell Pierce', 100000]
];
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
// Shared by gameplay and the setup preview so both use exactly the same supported effects.
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
export function setSetupToggle(config, section, key, on) {
  const items = config[section], item = items?.[key];
  if (!item || unsupportedSetting(section, item)) return;
  item.on = !!on;
  if (on) {
    Object.entries(items).forEach(([otherKey, other]) => {
      if (otherKey !== key && ((item.excl && other.excl === item.excl) || (item.group && other.group === item.group))) other.on = false;
    });
    if (item.requires && items[item.requires]) items[item.requires].on = true;
  } else Object.values(items).forEach(other => { if (other.requires === key) other.on = false; });
}
// Profiles and defaults affect the fields exposed here, leaving imported fight/advanced settings intact.
export function copySetupFields(target, source) {
  GEAR_FIELDS.forEach(([key]) => { target.gear[key] = source.gear[key]; });
  ['name', 'critIncludesAll', 'weaponIsSword'].forEach(key => { target.gear[key] = source.gear[key]; });
  ['buffs', 'debuffs', 'consumables'].forEach(section => Object.entries(target[section]).forEach(([key, item]) => {
    if (!unsupportedSetting(section, item) && source[section][key]) item.on = !!source[section][key].on;
  }));
  target.options.bookRanks = !!source.options.bookRanks;
  return target;
}
export function validateSetup(config) {
  const errors = [];
  GEAR_FIELDS.forEach(([key, label, max]) => {
    const value = config.gear[key];
    if (!Number.isFinite(value) || value < 0 || value > max) errors.push(label + ' must be a number from 0 to ' + max.toLocaleString('en-US') + '.');
  });
  return errors;
}
