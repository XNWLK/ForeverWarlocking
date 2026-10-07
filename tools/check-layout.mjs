import assert from 'node:assert/strict';
import { readStored, storageKey } from '../js/layout-mode.js';
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('OK: ' + name); }
function memory(initial = {}) {
  const data = new Map(Object.entries(initial)), writes = [];
  return { data, writes, getItem: k => data.get(k) ?? null, setItem(k, v) { writes.push(k); data.set(k, v); } };
}
const key = 'forever-warlocking.settings', original = JSON.stringify({ race: 'human', fight: { timed: true, seconds: 120 }, setupProfiles: [{ name: 'Raid', code: 'WFS1:example' }] });
check('current layout reads its existing setup without migration or writes', () => {
  const store = memory({ [key]: original }); assert.deepEqual(readStored(store, key, false), JSON.parse(original)); assert.deepEqual(store.writes, []);
});
check('preview copies once and cannot overwrite the current setup', () => {
  const store = memory({ [key]: original }), draft = readStored(store, key, true);
  draft.fight.seconds = 90; draft.setupProfiles[0].name = 'Preview raid'; store.setItem(storageKey(key, true), JSON.stringify(draft));
  assert.equal(store.getItem(key), original); assert.equal(readStored(store, key, true).fight.seconds, 90);
  store.setItem(key, JSON.stringify({ race: 'orc' })); assert.equal(readStored(store, key, true).race, 'human');
});
check('an empty first preview still has its own independent snapshot', () => {
  const store = memory(); assert.deepEqual(readStored(store, key, true), {});
  store.setItem(key, original); assert.deepEqual(readStored(store, key, true), {});
});
check('names use the same isolated storage rule', () => {
  const nameKey = 'forever-warlocking.names', store = memory({ [nameKey]: '{"warlock":"Original"}' });
  readStored(store, nameKey, true); store.setItem(storageKey(nameKey, true), '{"warlock":"Preview"}');
  assert.equal(readStored(store, nameKey, false).warlock, 'Original'); assert.equal(readStored(store, nameKey, true).warlock, 'Preview');
});
check('invalid saves recover without rewriting the current version', () => {
  for (const raw of ['broken', '[]', '42']) {
    const store = memory({ [key]: raw }); assert.deepEqual(readStored(store, key, false), {}); assert.equal(store.getItem(key), raw);
  }
});
check('storage write restrictions retain the copied setup for the session', () => {
  const store = memory({ [key]: original }); store.setItem = () => { throw Error('quota'); };
  assert.equal(readStored(store, key, true).race, 'human'); assert.equal(store.getItem(key), original);
});
console.log(checks + ' layout isolation checks passed.');
