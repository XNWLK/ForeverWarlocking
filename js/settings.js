// The choices that are kept in this browser between visits: build, race, the dummy's health, range rings on or off.

const STORE_KEY = 'forever-warlocking.settings';
const DEFAULTS = { build: null, race: 'human', dummyHealth: 10000, rings: true };

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
