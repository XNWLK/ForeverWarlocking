// A link that opens this page with a fight already set up: build, race, dummies, fight options, latency, the
// codes imported from the Warlock SIM, and the drill, encounter or seeded fight that was running.
// Everything sits after the # of the address, so nothing is sent anywhere: the page reads it and removes it.

import { simplified } from './layout-mode.js';
const NUMBER = /^\d+(\.\d+)?$/;

// state: { build, race, dummies, health, fight: { timed, seconds, moveEvery, moveDuration, hitEvery }, latency,
//          buildCode, settingsCode, challenge ('drill:opener' | 'encounter:fireDance' | 'seed:word' | '') }
export function makeLink(state) {
  const p = new URLSearchParams(), f = state.fight || {};
  p.set('v', '1');
  if (state.build) p.set('build', state.build);
  if (state.race) p.set('race', state.race);
  p.set('dummies', String(state.dummies || 1));
  p.set('fight', f.timed ? 't' + f.seconds : 'h' + state.health);
  if (f.moveEvery > 0 && f.moveDuration > 0) p.set('move', f.moveEvery + '-' + f.moveDuration);
  if (f.hitEvery > 0) p.set('hit', String(f.hitEvery));
  if (state.latency > 0) p.set('latency', String(state.latency));
  if (state.buildCode) p.set('bc', state.buildCode);
  if (state.settingsCode) p.set('sc', state.settingsCode);
  if (state.challenge) p.set('play', state.challenge);
  return window.location.origin + window.location.pathname + (simplified ? '?layout=simplified' : '') + '#' + p.toString();
}

// Reads a share link from the address and takes it out of the address bar (so a reload does not apply it again).
// Returns null when there is none, else the same shape makeLink takes (only what the link carries).
export function readLink() {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash || hash.indexOf('v=1') < 0) return null;
  let p;
  try { p = new URLSearchParams(hash); } catch (e) { return null; }
  if (p.get('v') !== '1') return null;
  try { window.history.replaceState(null, '', window.location.pathname + window.location.search); } catch (e) { /* the link then stays in the address bar */ }
  const out = { build: p.get('build') || '', race: p.get('race') || '', buildCode: p.get('bc') || '', settingsCode: p.get('sc') || '', challenge: p.get('play') || '' };
  const dummies = Number(p.get('dummies'));
  if (dummies >= 1 && dummies <= 3) out.dummies = Math.round(dummies);
  const fight = p.get('fight') || '', amount = fight.slice(1);
  if ((fight.charAt(0) === 't' || fight.charAt(0) === 'h') && NUMBER.test(amount)) {
    out.fight = { timed: fight.charAt(0) === 't', seconds: 120, moveEvery: 0, moveDuration: 0, hitEvery: 0 };
    if (out.fight.timed) out.fight.seconds = Math.max(10, Math.min(1800, Math.round(Number(amount))));
    else out.health = Math.max(100, Math.min(100000000, Math.round(Number(amount))));
    const move = (p.get('move') || '').split('-');
    if (move.length === 2 && NUMBER.test(move[0]) && NUMBER.test(move[1])) { out.fight.moveEvery = Math.min(600, Number(move[0])); out.fight.moveDuration = Math.min(60, Number(move[1])); }
    if (NUMBER.test(p.get('hit') || '')) out.fight.hitEvery = Math.min(60, Number(p.get('hit')));
  }
  if (NUMBER.test(p.get('latency') || '')) out.latency = Math.max(0, Math.min(1000, Math.round(Number(p.get('latency')))));
  return out;
}
