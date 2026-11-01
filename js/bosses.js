// Every boss fight there is, and how a fight against one is set up. A new boss = a file with its definition (see
// js/raid.js for what goes in one; js/boss-onyxia.js is the first), added to DEFS below.
import { createRaid } from './raid.js';
import { ONYXIA } from './boss-onyxia.js';
import { TESTBED } from './boss-testbed.js';

const DEFS = { onyxia: ONYXIA, testbed: TESTBED };

// The list in the Bosses window (a definition with `hidden` is left out: test fights).
export const BOSSES = Object.keys(DEFS).map(function (k) { return DEFS[k]; }).filter(function (d) { return !d.hidden; });
export function bossDef(id) { return DEFS[id] || null; }

// The challenge main.js starts: target 1 is the boss, its health on the clock (the curve); adds come in by themselves.
export function bossChallenge(id) {
  const b = DEFS[id];
  if (!b) return null;
  const slots = b.slots, healths = [], absent = [];
  for (let i = 1; i < slots.length; i++) { healths.push(slots[i].health); if (slots[i].absent) absent.push(i); }
  return { id: 'boss:' + id, boss: id, name: b.name, text: b.short, long: b.text, targets: slots.length - 1, fight: { timed: true, seconds: b.seconds },
           curve: b.curve, immune: b.immune || null, healths: healths, absent: absent, simTargets: 1, sim: b.sim };
}

// The fight itself (creatures, room, script), made the first time it is needed.
export function makeBossFight(id, scene, h) { return createRaid(scene, h, DEFS[id]); }
