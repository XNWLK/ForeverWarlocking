// The choices that are kept in this browser between visits: build, race, the dummies' health and number, range rings.

const STORE_KEY = 'forever-warlocking.settings';
const DEFAULTS = {
  pullSeconds: 5,
  pullEnabled: false,                  // optional countdown beside Challenges; None until selected
  build: null, race: 'human', dummyHealth: 50000, rings: true, dummies: 1, sound: false,
  fight: { timed: false, seconds: 120, moveEvery: 0, moveDuration: 0, hitEvery: 0 },   // how the fight ends, movement, hits taken
  buildCode: '', settingsCode: '',     // imported from the DPS sim
  homes: {}, keys: null,               // your own places for spells on the bar, and your own keys for the slots
  binds: null,                         // your own keys for walking, jumping, targeting, the pet, stopping a cast
  show: null,                          // the switches in the bar on the right: { rotation, race, callouts }
  latency: 0,                          // milliseconds every key press takes to arrive
  drills: {},                          // your best result per drill or encounter: { id: { grade, pct, dps } }
  bests: {},                           // your best result per fight you set up yourself: { fight: { dps, pct, at } }
  volume: 0.6,                         // how loud the sounds are, 0 to 1
  touchHelp: false                     // the note about touch controls was shown (touch screens only)
};

let saved = {};
try {
  saved = JSON.parse(window.localStorage.getItem(STORE_KEY)) || {};
} catch (e) {
  saved = {};
}

export function getSetting(key) {
  return saved[key] !== undefined && saved[key] !== null ? saved[key] : DEFAULTS[key];
}

export function setSetting(key, value) {
  saved[key] = value;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch (e) {
    // Private windows may refuse storage; the choice then lasts until the page is closed.
  }
}

export const DUMMY_HEALTH_MIN = 100;
export const DUMMY_HEALTH_MAX = 100000000;

// Turns what was typed into a health pool, or null when it is not a usable number ("25k" and "1.5m" are understood).
export function parseHealth(text) {
  const match = String(text).replace(/[\s,_']/g, '').toLowerCase().match(/^(\d+(?:\.\d+)?)([km]?)$/);
  if (!match) return null;
  const value = Math.round(parseFloat(match[1]) * (match[2] === 'k' ? 1000 : match[2] === 'm' ? 1000000 : 1));
  return value >= DUMMY_HEALTH_MIN && value <= DUMMY_HEALTH_MAX ? value : null;
}
