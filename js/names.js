// The names shown in the frames. Anyone can change them by clicking a name; a change is kept in this browser.

const DEFAULTS = { warlock: 'Xn', imp: 'Yazpad', succubus: 'Rob', dummy: 'Mage dummy', felhunter: 'Felhunter', voidwalker: 'Voidwalker' };
const MAX_LENGTH = { warlock: 12, imp: 12, succubus: 12, dummy: 20, felhunter: 12, voidwalker: 12 };
import { storageKey, readStored } from './layout-mode.js';
const BASE_KEY = 'forever-warlocking.names', STORE_KEY = storageKey(BASE_KEY);

let saved = {};
try {
  saved = readStored(window.localStorage, BASE_KEY);
} catch (e) {
  saved = {};
}

export function maxLength(key) { return MAX_LENGTH[key]; }

export function getName(key) {
  return typeof saved[key] === 'string' && saved[key] ? saved[key] : DEFAULTS[key];
}

// Returns the name now in use: the cleaned-up new one, or the old one when the new one is empty.
export function setName(key, value) {
  const clean = String(value).replace(/\s+/g, ' ').trim().slice(0, MAX_LENGTH[key]).trim();
  if (!clean) return getName(key);
  if (clean === DEFAULTS[key]) delete saved[key]; else saved[key] = clean;
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(saved));
  } catch (e) {
    // Private windows may refuse storage; the name then lasts until the page is closed.
  }
  return clean;
}
