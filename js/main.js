// Forever Warlocking - start-up and the frame loop.
import * as THREE from 'three';
import { buildChamber, makeRangeRings, HALF } from './chamber.js';
import { makeDummy, makeBeam } from './models.js';
import { makeWarlock } from './warlock.js';
import { createControls } from './controls.js';
import { createHud, ACTION_CODES, RACIAL_ICON } from './hud.js';
import { createCombat, actionBarFor } from './combat.js';
import { getSetting, setSetting, getStore, saveStore } from './settings.js';
import { createPet } from './pets.js';
import { createEffects, SPELL_FX } from './effects.js';
import { createPanels } from './panels.js';
import { createSound } from './sound.js';
import { createExtras, gradeFor } from './extras.js';
import { keyCombo, mouseCombo, wheelCombo, hasModifier, isMouse, plainKey } from './keys.js';
import { createRecorder } from './record.js';
import { createEncounter } from './encounter.js';
import { createAids } from './aids.js';
import { makeLink, readLink } from './share.js';
import { createTouch, isTouch } from './touch.js';
import { createGamepad, PAD_LABELS } from './gamepad.js';
import { makeCard, copyCard, saveCard } from './card.js';
import { getName } from './names.js';
import { createGhost } from './ghost.js';
import { createReplay } from './replay.js';
import { judgeLesson } from './lessons.js';
import { noteProgress } from './progress.js';
import { costs } from './cost.js';

const WL = window.WL;
// A demon's melee reach in yards, from the Warlock data (the Succubus: 5). The data names none for the Felhunter and
// the Voidwalker, which an imported build may bring: they get the same 5.
function petMeleeRange(cfg, key) {
  const pc = cfg && cfg.pets && cfg.pets[key];
  return (pc && pc.melee && pc.melee.range) || 5;
}

// Where the dummies stand (yards; the first one in the middle of the summoning circle). Six yards apart: Rain of Fire
// on the middle one reaches all three, and Hellfire reaches all three when you stand between them.
const SPOTS = [null, { x: 0, z: 0 }, { x: -6, z: 0 }, { x: 6, z: 0 }];
const GAPS = SPOTS.map(function (a) { return SPOTS.map(function (b) { return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 0; }); });

// ---------- the scene ----------
const canvas = document.getElementById('scene');
// 'high-performance' asks a laptop with two graphics chips for the strong one.
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
const FULL_DETAIL = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);   // phones have very dense screens and small graphics chips
renderer.setPixelRatio(FULL_DETAIL);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping;     // keeps purple purple (the filmic one turned it blue)
renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

const chamber = buildChamber(scene);
const dummies = [null];
for (let i = 1; i <= 3; i++) {
  const d = makeDummy();
  d.root.position.set(SPOTS[i].x, 0, SPOTS[i].z);
  d.chestAt = new THREE.Vector3(SPOTS[i].x, d.chest.y, SPOTS[i].z);
  d.headAt = new THREE.Vector3(SPOTS[i].x, d.head.y, SPOTS[i].z);
  d.root.visible = false;
  scene.add(d.root);
  dummies.push(d);
}
const warlock = makeWarlock();
scene.add(warlock.root);
const beam = makeBeam();
scene.add(beam.mesh);
const pet = createPet(scene);
const effects = createEffects(scene);
// The sim as a ghost beside you (a switch in the bar on the right): looks only.
const ghost = createGhost(scene, makeWarlock, effects, window.WL, function (key) { return iconFor(key); });

// Every key that is not a slot on the action bar. Yours are kept in the browser; '' = no key.
const DEFAULT_BINDS = { forward: 'KeyW', back: 'KeyS', turnLeft: 'KeyA', turnRight: 'KeyD', strafeLeft: 'KeyQ', strafeRight: 'KeyE',
                        jump: 'Space', nextTarget: 'Tab', cancel: 'Escape', petAttack: '', petFollow: '', reset: '', pull: '', zoomIn: '', zoomOut: '' };
const binds = Object.assign({}, DEFAULT_BINDS, getSetting('binds') || {});
// Walking and jumping are keys you hold: they take a plain key. Everything else also takes a key with Shift, Ctrl or
// Alt held, a mouse button, or the wheel with a modifier (js/keys.js).
const MOVE_BINDS = ['forward', 'back', 'turnLeft', 'turnRight', 'strafeLeft', 'strafeRight', 'jump'];
const ACTION_BINDS = ['nextTarget', 'cancel', 'petAttack', 'petFollow', 'reset', 'pull', 'zoomIn', 'zoomOut'];

const colliders = chamber.colliders.slice(), fixedColliders = colliders.length;
const controls = createControls(canvas, camera, {
  half: HALF, wallHeight: 20, colliders: colliders, onClick: clickScene, binds: binds,
  claimed: function (e) { const combo = keyCombo(e); return combo !== e.code && bound(combo); },   // Shift+W is a spell's key: do not walk
  onWheel: function (e) { const combo = wheelCombo(e); return !!combo && act(combo); }
});
// Touch screens: the stick, the round buttons and the menu (nothing happens here on a desktop).
const touch = createTouch({
  stick: function (x, y) { controls.setStick(x, y); },
  jump: function () { controls.jump(); },
  cancel: function () { combat.cancel(); },
  nextTarget: function () { nextTarget(); },
  review: function () { reviewOrEnd(); },
  helpSeen: function () { return getSetting('touchHelp') === true; },
  helpDone: function () { setSetting('touchHelp', true); }
});

// ---------- the character and the fight ----------
let config = null, combat = null, character = null, rings = null, targets = 1, simResult = null;
// The sim's numbers for this fight: without a precast ('') and with each spell you could precast. simResult is the
// one that fits what you did; until a precast's own numbers are in, the plain ones stay on screen.
let simResults = {};
let customBuild = null, leftOut = [];                     // an imported build; what an imported settings code has that is not playable here
let codePrecast = '';                                      // the precast an imported settings code names (not taken over)
// The pull timer: pull = the countdown that is running ({ at: the fight clock at zero, seconds, beep }); pullInfo =
// how the last countdown ended, for the review; pullNote = what the banner says for a moment afterwards.
let pull = null, pullInfo = null, pullNote = null;
const sound = createSound(getSetting('sound') === true, getSetting('volume'));   // off until you switch it on (Xn)
const recorder = createRecorder();                          // what happened when, for the review's timeline
// Where everyone was and what happened, for watching the fight again afterwards (the review's "Watch it again").
const replay = createReplay({ onClose: function () { endReplay(); }, onSeek: function () { seekReplay(); } });
// A drill or a seeded fight that is running: it sets the fight for as long as it lasts and leaves your saved fight
// settings alone. null = your own settings.
let challenge = null;
let myCurve = [0];                                         // your damage by the end of each second of this fight (for the review's graph)
let manaCurve = [], manaEnd = null;                        // your mana at the start of each second, and what was left when the fight ended
let fightBest = null, challengeOut = null;                 // what this fight came to, worked out once when it is over
let fightLogged = false;                                   // this fight is on the list of your results (once it has ended)
let progressDue = false;                                   // this fight goes on the Progress page once the sim's number is in
let raceBest = null;                                       // your best in this fight, for the race in the meter: its damage curve, or just its pace
// Procs you got and what became of them (the "Proc watch" drill): open = the one that is up, list = the ones before.
let procLog = { open: null, list: [] };
let prevCast = null, castStopped = false, humming = false, bannerKind = '';
let keyCodes = ACTION_CODES.slice();

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// The settings of the fight: the DPS sim's defaults, then an imported settings code, then the fight options.
// Things a code switches on that you would have to press during the fight (potions, runes, explosives, Power
// Infusion, Mana Tide, Innervate) are not playable here, so they are switched off - for you and for the sim average.
function buildConfig() {
  const cfg = clone(WL.DEFAULT_CONFIG), base = clone(WL.DEFAULT_CONFIG.fight);
  leftOut = []; codePrecast = '';
  const code = getSetting('settingsCode');
  if (code) {
    try {
      WL.applySettings(cfg, WL.decodeSettings(code));
      // A precast set in the sim's settings is not taken over: here you precast by starting the cast yourself before
      // the fight, and the sim average then gets the same precast (askSimAverage).
      codePrecast = cfg.fight.precast ? (WL.SPELLS[cfg.fight.precast] || {}).name || cfg.fight.precast : '';
      cfg.fight.precast = base.precast || '';
      ['duration', 'durationVarPct', 'iterations', 'weightIterations', 'seed', 'targets', 'multiDot', 'moveEvery', 'moveDuration',
       'hitEvery', 'latencyMs', 'travelMs', 'lifeTapWhileMoving'].forEach(function (k) { cfg.fight[k] = base[k]; });
    } catch (e) { /* a code that no longer decodes is ignored */ }
  }
  Object.keys(cfg.consumables).forEach(function (k) {
    const c = cfg.consumables[k];
    if (c.on && (c.spPotion || c.manaRestore || c.explosive)) { c.on = false; leftOut.push(c.name); }
  });
  const exclusive = {};
  Object.keys(cfg.buffs).forEach(function (k) {
    const b = cfg.buffs[k];
    if (b.on && (b.tide || b.innervate || b.spellDmgPct)) { b.on = false; leftOut.push(b.name); }
    // Buffs that cannot be up together share a tag (none do since the patch of 2026-10-16; the Shaman totems did): the
    // first listed one counts, as in the sim. One switched off here blocks nothing.
    if (b.on) {
      const tags = WL.buffExcl(b);
      if (tags.some(function (t) { return exclusive[t]; })) b.on = false; else tags.forEach(function (t) { exclusive[t] = true; });
    }
  });
  const fight = fightOptions();
  cfg.fight.latencyMs = Math.max(0, Number(getSetting('latency')) || 0);      // the sim average waits this long after each cast
  if (challenge && challenge.executePct) cfg.fight.executePct = challenge.executePct;
  cfg.fight.moveEvery = fight.moveEvery > 0 && fight.moveDuration > 0 ? fight.moveEvery : 0;
  cfg.fight.moveDuration = cfg.fight.moveEvery ? fight.moveDuration : 0;
  cfg.fight.hitEvery = fight.hitEvery;
  return cfg;
}
function fightOptions() {
  const none = { timed: false, seconds: 120, endless: '', moveEvery: 0, moveDuration: 0, hitEvery: 0 };
  const f = challenge ? Object.assign(none, challenge.fight) : Object.assign(none, getSetting('fight') || {});
  if (f.endless) { f.endless = f.endless === 'execute' ? 'execute' : 'full'; f.timed = false; }   // infinite health: '' | 'full' | 'execute'
  return f;
}
// Changing the fight by hand ends a drill or seeded fight.
function leaveChallenge() { if (challenge) { challenge = null; hud.log('Challenge ended.'); } }

// An imported build code becomes one more build in the list. Returns the reasons when it cannot be played.
function readCustomBuild() {
  customBuild = null;
  const code = getSetting('buildCode');
  if (!code) return [];
  try {
    const b = WL.decodeBuild(code), problems = WL.validateBuild(b);
    if (problems.length) return (b.migrated || []).concat(problems);   // a removed talent's points left unspent can break the tree
    b.key = 'custom'; b.custom = true; b.name = b.short;
    b.rotation = b.rotation.filter(function (a) { return a !== 'swapToImp' && a !== 'swapToSuccubus'; });   // no pet swap here
    delete b.timeline;
    customBuild = b;
    return [];
  } catch (e) { return [e.message]; }
}
function allBuilds() { return (customBuild ? [customBuild] : []).concat(WL.BUILDS); }

// What the casting rules need to know about where everyone stands.
const ctx = { moving: false, distances: [0, 0, 0, 0], gaps: GAPS, petDistance: 0 };
const anchors = [null, { x: 0, y: 0, visible: false }, { x: 0, y: 0, visible: false }, { x: 0, y: 0, visible: false }];   // the dummies' heads on screen
let fightClock = 0;                                       // seconds since the last reset

const hud = createHud(WL, {
  onPress: function (key) { press(key); },
  onBuild: function (key) { touch.closeMenu(); setSetting('build', key); newCharacter(); hud.log('Build: ' + character.build.short + '.', 'proc'); },
  onRace: function (key) { touch.closeMenu(); setSetting('race', key); newCharacter(); hud.log('Race: ' + WL.RACES[key].name + '.', 'proc'); },
  onDummyHealth: function (health) { leaveChallenge(); setSetting('dummyHealth', health); newCharacter(); hud.log((targets > 1 ? 'Each dummy' : 'The dummy') + ' now has ' + health.toLocaleString('en-US') + ' health.'); },
  onDummies: function (count) { leaveChallenge(); setSetting('dummies', count); newCharacter(); hud.log(count === 1 ? 'One dummy.' : count + ' dummies. Tab or a click changes your target.', 'proc'); },
  onTarget: function (ti) { setTarget(ti); },
  onRings: function (on) { setSetting('rings', on); rings.visible = on; },
  onReset: function () { resetFight(); hud.log('Fight reset.'); },
  onPull: function () { togglePull(); },
  onPet: function (mode) { combat.update(fightClock, ctx); combat.petCommand(mode); },
  onSound: function (on) { setSetting('sound', on); sound.setOn(on); },
  // Edit bar: swap what is in two slots, give a slot another key, or go back to the default.
  onSwap: function (a, b) {
    const homes = Object.assign({}, getSetting('homes')), A = character.bar[a], B = character.bar[b];
    if (!A && !B) return;
    if (A) homes[A] = b;
    if (B) homes[B] = a;
    setSetting('homes', homes);
    newCharacter();
  },
  // A new key for a slot (id = its number) or for another action (id = its name). A key that is in use trades places.
  onRebind: function (id, code) {
    if (MOVE_BINDS.indexOf(id) >= 0) {
      if (isMouse(code)) { hud.showError('Walking and jumping take a plain key'); hud.setBinds(binds); return; }
      if (hasModifier(code)) code = plainKey(code);
    }
    if (/^Arrow/.test(code)) { hud.showError('The arrow keys always move you'); hud.setBinds(binds); return; }
    const old = typeof id === 'number' ? keyCodes[id] : binds[id];
    keyCodes.forEach(function (c, i) { if (c === code && i !== id) keyCodes[i] = old; });
    Object.keys(binds).forEach(function (k) { if (binds[k] === code && k !== id) binds[k] = old; });
    if (typeof id === 'number') keyCodes[id] = code; else binds[id] = code;
    setSetting('keys', keyCodes.slice());
    setSetting('binds', Object.assign({}, binds));
    hud.setKeys(keyCodes);
    hud.setBinds(binds);
  },
  onKeysReset: function () {
    setSetting('keys', null); setSetting('binds', null);
    keyCodes = ACTION_CODES.slice();
    Object.keys(DEFAULT_BINDS).forEach(function (k) { binds[k] = DEFAULT_BINDS[k]; });
    hud.setKeys(keyCodes);
    hud.setBinds(binds);
    hud.log('All keys are back to their defaults.');
  },
  onBarReset: function () {
    setSetting('homes', {}); setSetting('keys', null);
    keyCodes = ACTION_CODES.slice();
    hud.setKeys(keyCodes);
    newCharacter();
    hud.log('The action bar is back to its default.');
  }
});

const extras = createExtras(WL, {
  // A drill, a seeded fight, or null to go back to your own fight settings.
  onChallenge: function (next) {
    touch.closeMenu();
    challenge = next;
    hud.closePanels();
    newCharacter();
    if (next) { hud.log((next.encounter ? 'Encounter: ' : next.drill ? 'Drill: ' : '') + next.name + '. ' + next.text, 'proc'); hud.log('It starts when your first spell takes effect. "End" at the top goes back to your own fight.'); }
    else hud.log('Back to your own fight settings.');
  },
  onPreset: function (p) {
    touch.closeMenu();
    challenge = null;
    setSetting('dummies', p.dummies);
    if (p.health) setSetting('dummyHealth', p.health);
    setSetting('fight', Object.assign({}, p.fight));
    newCharacter();
    hud.log('Fight: ' + p.name + '.', 'proc');
  },
  onLatency: function (ms) {
    setSetting('latency', ms);
    newCharacter();
    hud.log(ms ? 'Latency: ' + ms + ' ms. Every key press arrives that much later; the sim average waits as long after each cast.' : 'No latency.');
  },
  onVolume: function (value) { setSetting('volume', value); sound.setVolume(value); },
  onRobe: function (key) { warlock.setRobe(key); hud.log('You put on another robe.', 'proc'); },
  onUiScale: function (value) { hud.setScale(value); },
  shareLink: shareLink,
  fullLog: function () { return hud.fullLog(); },
  log: function (text, kind) { hud.log(text, kind); }
});

// What a spell's picture is (the race's cooldown has its own).
function iconFor(key) {
  if (key === 'racial') return character && character.racial ? WL.ICONS[RACIAL_ICON[character.racial.name]] || '' : '';
  return WL.ICONS[key] || '';
}
const aids = createAids(WL, { icon: iconFor, hint: function (key, racial) { hud.setHint(key, racial); } });
const burnAt = new THREE.Vector3();
const encounter = createEncounter(scene, { burn: function (x, z) { effects.play('burn', { at: burnAt.set(x, 0.9, z) }); } });

// A link that opens this page with the fight you have set up (and the challenge you are in).
function shareLink() {
  const custom = !!character.build.custom;
  return makeLink({ build: custom ? 'custom' : character.build.key, race: character.raceKey, dummies: getSetting('dummies'), health: getSetting('dummyHealth'),
                    fight: getSetting('fight'), latency: getSetting('latency'), buildCode: custom ? getSetting('buildCode') : '',
                    settingsCode: getSetting('settingsCode'), challenge: challenge ? challenge.share : '' });
}

// ---------- your best per fight ----------
// A fight you set up yourself is told apart by everything that changes its numbers: build, race, dummies, how it
// ends, movement and hits, imported gear and buffs, latency. Challenges keep their own bests (per drill).
function hash(text) { let h = 2166136261; for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
function fightKey() {
  const f = fightOptions(), b = character.build, code = getSetting('settingsCode'), late = Number(getSetting('latency')) || 0;
  return [b.custom ? 'c' + hash(getSetting('buildCode')) : b.key, character.raceKey, targets, f.endless ? 'e' + f.endless : f.timed ? 't' + f.seconds : 'h' + character.dummyHealth,
          f.moveEvery > 0 && f.moveDuration > 0 ? 'm' + f.moveEvery + '-' + f.moveDuration : '', f.hitEvery > 0 ? 'x' + f.hitEvery : '',
          code ? 's' + hash(code) : '', late ? 'l' + late : '',
          combat.state.precastKey ? 'p' + combat.state.precastKey : ''].join('|');   // a fight opened with a precast has its own best
}
// The name your results in this fight are kept under (the progress chart in the review, the curve of your best):
// a fight you set up yourself by everything that changes its numbers, a challenge by itself, the build and the race.
function resultKey() {
  const b = character.build;
  return challenge ? 'ch:' + challenge.share + '|' + (b.custom ? 'c' + hash(getSetting('buildCode')) : b.key) + '|' + character.raceKey : fightKey();
}
// A fight that ran to its end goes on the list of your results in this fight: [when, DPS], the last 30 of them.
function noteResult() {
  if (fightLogged || !combat.state.over || combat.endless) return;   // infinite health: you choose how long it lasts, so two of them do not compare
  const seconds = combat.fightSeconds(), dps = seconds > 0 ? combat.result.total / seconds : 0;
  if (!(dps > 0)) return;
  fightLogged = true;
  const all = getStore('history'), key = resultKey(), list = all[key] || (all[key] = []);
  list.push([Date.now(), Math.round(dps)]);
  if (list.length > 30) list.splice(0, list.length - 30);
  const keys = Object.keys(all), newest = function (k) { return all[k][all[k].length - 1][0]; };
  if (keys.length > 200) keys.sort(function (a, b) { return newest(a) - newest(b); }).slice(0, keys.length - 200).forEach(function (k) { delete all[k]; });
  saveStore('history');
}
// A fight that ran to its end goes on the Progress page: your share of the sim and what "What it cost you" lists,
// each kind of mistake as a share of your DPS. Waits for the sim's number (progressDue).
function noteProgressNow() {
  if (!progressDue || !combat.state.over || !simResult) return;
  progressDue = false;
  const d = reviewData(), dps = d.seconds > 0 ? combat.result.total / d.seconds : 0;
  if (!(dps > 0)) return;
  const c = costs(d), m = {};
  if (c) c.rows.forEach(function (r) { m[r.kind] = (m[r.kind] || 0) + 100 * r.dps / dps; });
  Object.keys(m).forEach(function (k) { m[k] = Math.round(m[k] * 10) / 10; });
  noteProgress({ b: character.lessonKey, n: character.build.short, r: character.raceKey, s: Math.round(d.seconds * 10) / 10, dps: Math.round(dps),
                 f: challenge ? (challenge.lesson ? 'lesson' : challenge.daily ? 'daily' : challenge.seeded ? 'seed' : 'challenge') : 'own',
                 pct: Math.round(100 * dps / simResult.dps), m: m });
}
// The name the curve of your best is kept under: the fight you set up, or the drill (whatever build you played it with,
// like the drill's best itself). A seeded fight keeps no best.
function bestKey() { return challenge ? (challenge.drill ? 'ch:' + challenge.share : null) : combat.endless ? null : fightKey(); }
// Keeps the damage curve of a new best (at most 150 points, 80 fights), so that later runs can race it.
function saveBestCurve() {
  const key = bestKey(), seconds = combat.fightSeconds();
  if (!key || !(seconds > 0)) return;
  const all = getStore('curves'), step = Math.max(1, Math.ceil((myCurve.length - 1) / 150)), points = [];
  for (let i = 0; i < myCurve.length; i += step) points.push(Math.round(myCurve[i]));
  all[key] = { s: Math.round(seconds * 100) / 100, d: Math.round(combat.result.total), n: step, c: points, at: Date.now() };
  const keys = Object.keys(all);
  if (keys.length > 80) keys.sort(function (a, b) { return all[a].at - all[b].at; }).slice(0, keys.length - 80).forEach(function (k) { delete all[k]; });
  saveStore('curves');
}
function showBest() {
  const curveKey = bestKey(), curve = curveKey ? getStore('curves')[curveKey] || null : null;
  if (challenge) {
    const d = challenge.drill ? (getSetting('drills') || {})[challenge.id] : null;
    raceBest = d ? curve || { pace: d.dps } : null;
  } else {
    const mine = (getSetting('bests') || {})[fightKey()];
    raceBest = mine ? curve || { pace: mine.dps } : null;   // a best from before curves were kept: its average pace
  }
  if (challenge) {
    const b = challenge.drill ? (getSetting('drills') || {})[challenge.id] : null;
    hud.setBest(b ? b.grade + ' \u00b7 ' + b.pct + '%' : '', b ? 'Your best in this challenge: ' + b.dps.toLocaleString('en-US') + ' DPS, ' + b.pct + '% of the sim' : 'No result yet in this challenge');
    return;
  }
  if (combat.endless) { raceBest = null; hud.setBest('', 'A fight with infinite health keeps no best: you decide how long it lasts'); return; }
  const b = (getSetting('bests') || {})[fightKey()];
  hud.setBest(b ? b.dps.toLocaleString('en-US') + ' DPS' : '', b ? 'Your best in the fight that is set up now' + (b.pct ? ': ' + b.pct + '% of the sim' : '') : 'No result yet for the fight that is set up now');
}
// Once the fight is over: is this your best? Returns { record, best, previous } (null in a challenge or an empty fight).
function settleBest() {
  if (challenge || !combat.state.over || combat.endless) return null;
  const seconds = combat.fightSeconds(), dps = seconds > 0 ? combat.result.total / seconds : 0;
  if (!(dps > 0)) return null;
  const pct = simResult ? Math.round(100 * dps / simResult.dps) : 0;
  if (fightBest) {
    if (fightBest.record && !fightBest.best.pct && pct) {  // the sim's number came in after the fight ended
      fightBest.best.pct = pct;
      const all = Object.assign({}, getSetting('bests'));
      all[fightKey()] = fightBest.best;
      setSetting('bests', all);
      showBest();
    }
    return fightBest;
  }
  const all = Object.assign({}, getSetting('bests')), key = fightKey(), old = all[key] || null, mine = { dps: Math.round(dps), pct: pct, at: Date.now() };
  if (!old || mine.dps > old.dps) {
    all[key] = mine;
    const keys = Object.keys(all);
    if (keys.length > 300) keys.sort(function (a, b) { return all[a].at - all[b].at; }).slice(0, keys.length - 300).forEach(function (k) { delete all[k]; });
    setSetting('bests', all);
    saveBestCurve();
    fightBest = { record: true, best: mine, previous: old };
  } else fightBest = { record: false, best: old, previous: null };
  showBest();
  return fightBest;
}

const panels = createPanels({
  onFight: function (options) {
    touch.closeMenu();
    leaveChallenge();
    setSetting('fight', options);
    hud.closePanels();
    newCharacter();
    hud.log(options.endless ? 'The dummies have infinite health' + (options.endless === 'execute' ? ' and stand in execute range all the time' : '') + '. You end the fight yourself: "Review the fight" reads "End the fight and review" while it runs.'
      : options.timed ? 'Timed fight: ' + options.seconds + ' s.' : 'The fight ends when the dummies are dead.', 'proc');
    if (config.fight.moveEvery) hud.log('You have to move every ' + config.fight.moveEvery + ' s for ' + config.fight.moveDuration + ' s.');
    if (config.fight.hitEvery) hud.log('You take a hit every ' + config.fight.hitEvery + ' s.');
  },
  // Codes from the DPS sim: a build (WFB1:...) and / or settings (WFS1:...). Empty = remove.
  // link: a share link of the DPS sim instead (...#share=code) - it carries settings and maybe a build and a race.
  // It is turned into the two codes (and the race is set), then everything goes on as if they had been pasted.
  onImport: function (buildCode, settingsCode, link, first) {
    if (link) {
      const typed = { build: buildCode, settings: settingsCode }, self = this;
      const fail = function (text) { panels.setImport(typed.build, typed.settings, ['Share link: ' + text], true, link); };
      if (!WL.decodeShare) { fail('this copy of the sim cannot read share links.'); return; }
      WL.decodeShare(WL.shareFromHash(link) || link).then(function (p) {
        const cfg = clone(WL.DEFAULT_CONFIG), unknown = WL.applySettings(cfg, p.s || WL.settingsMerge(p.d)), said = ['its settings'];
        let build = typed.build;
        if (typeof p.b === 'string') {
          if (WL.BUILDS.some(function (b) { return b.key === p.b; })) { setSetting('build', p.b); build = ''; said.push('the build ' + WL.BUILDS.filter(function (b) { return b.key === p.b; })[0].short); }
          else said.push('a build that is not among the ready builds here (left out)');
        } else if (p.b && typeof p.b === 'object') { build = WL.BUILD_CODE_PREFIX + btoa(unescape(encodeURIComponent(JSON.stringify(p.b)))); said.push('a build of its own'); }
        if (p.r && WL.RACES[p.r] && WL.RACE_KEYS.indexOf(p.r) >= 0) { setSetting('race', p.r); said.push('the race ' + WL.RACES[p.r].name); }
        const lines = ['Share link read: ' + said.join(', ') + '.'];
        if (unknown.length) lines.push('Ignored (not in this copy of the sim): ' + unknown.join(', ') + '.');
        if (p.d && p.f !== WL.defaultsMark()) lines.push('The link was made with another version of the sim: settings that were at their default then are at the defaults of this copy.');
        self.onImport(build, WL.encodeSettings(cfg), '', lines);
      }, function (e) { fail(e.message); });
      return;
    }
    const lines = first || [];
    let bad = false, settingsInfo = null;
    if (settingsCode) {
      try { settingsInfo = WL.describeSettings(WL.decodeSettings(settingsCode)); }
      catch (e) { lines.push('Settings: ' + e.message + '.'); bad = true; settingsCode = getSetting('settingsCode'); }
    }
    const before = getSetting('buildCode');
    setSetting('buildCode', buildCode);
    const problems = readCustomBuild();
    if (problems.length) {
      lines.push('Build not imported: ' + problems.slice(0, 3).join('; ') + '.');
      bad = true;
      setSetting('buildCode', before);
      readCustomBuild();
    } else if (buildCode) {
      lines.push('Build imported: ' + customBuild.short + '.');
      if (customBuild.migrated) lines.push(customBuild.migrated.join('; ') + '.');   // a talent a Forever patch removed (Malediction)
      setSetting('build', 'custom');
    }
    else if (getSetting('build') === 'custom') setSetting('build', null);
    setSetting('settingsCode', settingsCode);
    newCharacter();
    if (settingsInfo) lines.push('Settings imported: ' + settingsInfo.replace(/ · \d+ s · \d+ fights$/, '') + '.');
    if (codePrecast) lines.push('The precast in the code (' + codePrecast + ') is not taken over: here you precast by starting the cast yourself before the fight, and the sim average then does the same.');
    if (leftOut.length) lines.push('Not playable here yet, so switched off (also for the sim average): ' + leftOut.join(', ') + '.');
    if (!buildCode && !settingsCode) lines.push('Nothing imported: the ready builds with the default gear and buffs.');
    panels.setImport(getSetting('buildCode'), getSetting('settingsCode'), lines, bad);
  },
  onReview: function () { reviewOrEnd(); }
});

// What a finished drill or seeded fight comes to: its grade against the sim, and a line to pass on.
function challengeResult() {
  if (!challenge || !combat.state.over || !simResult) return challenge ? { name: challenge.name, waiting: true, lesson: !!challenge.lesson } : null;
  if (challengeOut) return challengeOut;
  const seconds = combat.fightSeconds(), dps = seconds > 0 ? combat.result.total / seconds : 0, pct = Math.round(100 * dps / simResult.dps);
  const out = { name: challenge.name, grade: gradeFor(pct), pct: pct, dps: dps };
  out.line = 'Forever Warlocking · ' + challenge.name + ' · ' + character.build.short + ' · ' + WL.RACES[character.raceKey].name + ' · ' +
    Math.round(dps).toLocaleString('en-US') + ' DPS · ' + pct + '% of the sim (' + out.grade + ')';
  if (challenge.drill) {
    const all = Object.assign({}, getSetting('drills')), old = all[challenge.id];
    if (!old || pct > old.pct) { all[challenge.id] = { grade: out.grade, pct: pct, dps: Math.round(dps) }; setSetting('drills', all); out.record = true; extras.refreshDrills(); saveBestCurve(); }
    out.best = all[challenge.id];
    showBest();
  }
  // A lesson: its checks decide whether it is passed (and the next one opens).
  if (challenge.lesson) {
    const verdict = judgeLesson(challenge.lesson, { res: combat.result, seconds: seconds, sim: simResult, procs: procSummary(), targets: targets });
    if (verdict.waiting) return { name: challenge.name, waiting: true, lesson: true };
    const lesson = challenge, next = verdict.passed ? extras.nextLesson(lesson) : null;
    if (verdict.passed) extras.lessonPassed(lesson);
    out.lesson = { passed: verdict.passed, rows: verdict.rows,
                   again: function () { extras.startLesson(lesson); }, next: next ? function () { extras.startLesson(next); } : null, list: function () { extras.openLessons(); } };
  }
  const daily = challenge.daily ? extras.recordDaily(challenge, out) : null;   // today's fight: your result of the day and your streak
  out.notes = [encounter.notes(), challenge.procs ? procNotes() : null, daily].filter(Boolean);
  const robes = challenge.drill ? extras.newRobes() : [];   // a grade may have earned you a robe
  if (robes.length) {
    out.notes.push((robes.length === 1 ? 'A new robe is yours: ' : 'New robes are yours: ') + robes.join(', ') + '. Put it on in the Challenges window.');
    hud.log((robes.length === 1 ? 'New robe earned: ' : 'New robes earned: ') + robes.join(', ') + '.', 'crit');
  }
  out.link = shareLink();
  challengeOut = out;
  return out;
}
// Your procs in numbers (for the lessons): how many came, how many you used, how fast on average, how many were wasted.
function procSummary() {
  const used = procLog.list.filter(function (p) { return p.after != null; }), open = procLog.open;
  const late = open && combat.state.t - open.at > 10 ? 1 : 0;
  return { all: procLog.list.length + (open ? 1 : 0), used: used.length, lost: procLog.list.length - used.length + late,
           mean: used.length ? used.reduce(function (sum, p) { return sum + p.after; }, 0) / used.length : 0 };
}
// What became of your procs, for the review of the "Proc watch" drill.
function procNotes() {
  const used = procLog.list.filter(function (p) { return p.after != null; }), open = procLog.open;
  const late = open && combat.state.t - open.at > 10 ? 1 : 0, lost = procLog.list.length - used.length + late, all = procLog.list.length + (open ? 1 : 0);
  if (!all) return 'Procs: none came in this fight (Shadow Trance and Decimation; not every build has one).';
  const mean = used.reduce(function (sum, p) { return sum + p.after; }, 0) / Math.max(1, used.length), slow = used.reduce(function (m, p) { return Math.max(m, p.after); }, 0);
  return 'Procs: ' + all + '. ' + (used.length ? 'You used ' + used.length + ', after ' + mean.toFixed(1) + ' s on average (slowest ' + slow.toFixed(1) + ' s)' : 'You used none') +
    (lost ? '; ' + lost + ' ran out or ' + (lost === 1 ? 'was' : 'were') + ' overwritten unused' : '') + (open && !late ? '; one was still up at the end' : '') + '.';
}
// The fight that is set up, in a few words (for the result picture).
function fightWords() {
  if (challenge) return (challenge.encounter ? 'Encounter: ' : challenge.seeded ? '' : 'Drill: ') + challenge.name;
  const f = fightOptions();
  return (targets === 1 ? '1 dummy' : targets + ' dummies') + '  \u00b7  ' + (f.endless ? 'infinite health' + (f.endless === 'execute' ? ', execute range' : '') : f.timed ? f.seconds + ' s' : character.dummyHealth.toLocaleString('en-US') + ' health' + (targets > 1 ? ' each' : '')) +
    (f.moveEvery > 0 && f.moveDuration > 0 ? '  \u00b7  moving ' + f.moveDuration + ' s every ' + f.moveEvery + ' s' : '') + (f.hitEvery > 0 ? '  \u00b7  a hit every ' + f.hitEvery + ' s' : '');
}
const CARD_NAMES = { 'pet:firebolt': 'Firebolt', 'pet:lashOfPain': 'Lash of Pain', 'pet:melee': 'Pet melee',
                     'pet:brand': 'Demonic Brand', touchOfTheGrave: 'Touch of the Grave' };
const CARD_ICONS = { 'pet:firebolt': 'firebolt', 'pet:lashOfPain': 'lashOfPain', 'pet:brand': 'searingPain' };
// The result of the fight as a picture: how = 'copy' (onto the clipboard) or 'save' (as a file). The button says how it went.
function resultPicture(how, button) {
  const seconds = combat.fightSeconds(), res = combat.result, sums = {}, drill = challengeOut;
  Object.keys(res.bySpell).forEach(function (k) { const base = k.replace(/^x\d:/, ''); if (res.bySpell[k].dmg > 0) sums[base] = (sums[base] || 0) + res.bySpell[k].dmg; });
  const spells = Object.keys(sums).sort(function (a, b) { return sums[b] - sums[a]; }).slice(0, 3).map(function (k) {
    const pet = k.indexOf('pet:') === 0;
    return { name: combat.spells[k] ? combat.spells[k].name : CARD_NAMES[k] || k, pct: 100 * sums[k] / res.total,
             icon: WL.ICONS[CARD_ICONS[k]] || (pet ? WL.ICONS['pet_' + character.build.pet] : iconFor(k)) || '' };
  });
  const say = function (text) { const was = button.textContent; button.textContent = text; window.setTimeout(function () { button.textContent = was; }, 1800); };
  makeCard({ name: getName('warlock'), build: character.build.short, race: WL.RACES[character.raceKey].name, raceIcon: WL.ICONS['race_' + character.raceKey] || '',
             fight: fightWords(), dps: seconds > 0 ? res.total / seconds : 0, seconds: seconds, simDps: simResult ? simResult.dps : 0,
             grade: drill && drill.grade ? drill.grade : '', curve: myCurve.slice(), simCurve: simResult && simResult.curve ? simResult.curve : null, spells: spells,
             site: window.location.host + window.location.pathname.replace(/\/$/, '') }).then(function (canvas) {
    const file = 'forever-warlocking-' + Math.round(seconds > 0 ? res.total / seconds : 0) + '-dps.png';
    if (how === 'save') { saveCard(canvas, file); say('Saved'); return; }
    copyCard(canvas).then(function (ok) { if (ok) say('Copied'); else { saveCard(canvas, file); say('Saved as a file instead'); } });
  });
}
// "Review the fight": a running fight with infinite health is ended by it. The sim is then asked what it had done by
// that second, so that the review compares like with like (its numbers come in a moment later).
function reviewOrEnd() {
  if (!combat.endless || combat.state.over) { showReview(); return; }
  combat.update(fightClock, ctx);
  const seconds = combat.fightSeconds();
  if (!(seconds > 0)) { hud.showError('Nothing to review yet: fight first'); return; }
  askSimAverage(seconds);
  combat.stop();
  showReview();
}
// What the review shows (and what "What it cost you" is worked out from).
function reviewData() {
  return {
    record: recorder.data(), icon: iconFor, racialName: character.racial ? character.racial.name : '', sameDice: !!(challenge && challenge.seeded),
    health: { min: combat.state.minHealth, max: character.stats.maxHealth },
    seconds: combat.fightSeconds(), result: combat.result, sim: simResult, spells: combat.spells, targets: targets,
    table: combat.table, gcd: combat.gcd(), pull: pullInfo, precast: combat.state.precastKey, over: combat.state.over,
    mana: { curve: manaCurve, max: character.stats.maxMana, end: manaEnd != null ? manaEnd : combat.state.mana, gain: combat.tapGain(),
            tapHealth: combat.spells.lifeTap.healthCost || 0,
            rule: character.build.rotation.indexOf('lifeTapBelow') >= 0 && WL.actionLabel ? WL.actionLabel(character.build, 'lifeTapBelow') : '' },
    timed: combat.timed || combat.endless, endless: character.endless, hasPet: !!combat.pet, petName: hud.petName(), dummyName: hud.dummyName
  };
}
function showReview() {
  if (!combat || combat.fightSeconds() <= 0) { hud.showError('Nothing to review yet: fight first'); return; }
  const d = reviewData();
  panels.showReview(Object.assign(d, {
    picture: resultPicture, replay: combat.state.over && replay.has() ? startReplay : null,
    curve: myCurve, challenge: challengeResult(), copy: extras.copy, best: settleBest(),
    history: { list: (getStore('history')[resultKey()] || []).slice(), counted: fightLogged },
    opener: aids.openerResult(simResult, d.record)
  }));
}

// The DPS sim's average for this character on these dummies, worked out on another processor core.
let simWorker = null, simJob = 0, reviewEnds = false;
// The spells of this character that can be cast before the fight so that they land as it begins.
function precastChoices() {
  return (WL.PRECAST_SPELLS || []).filter(function (k) { return character.bar.indexOf(k) >= 0 && combat.table[k] && combat.table[k].cast > 0; });
}
// Shows the sim's numbers that fit the fight: with the precast you opened with, or without one.
function useSimResult() {
  const next = simResults[(combat && combat.state.precastKey) || ''] || simResults[''] || null;
  if (next === simResult) return;
  simResult = next;
  hud.setSimAverage(next);
  noteProgressNow();                                       // a fight that ended before the sim's number was in
  if (panels.reviewOpen() && combat.fightSeconds() > 0) showReview();   // the review was waiting for these numbers
}
// A fight with infinite health: while it runs, the sim's ten-minute fight on such dummies is what you are measured
// against; ended (seconds = how long yours lasted), what the sim had done by that second of such a long fight (the
// worker cuts it there: neither of you knew when the fight would end). The sim's health falls with time, so "never
// in execute range" is an execute threshold of 0 for it, and "always" one above 100.
const ENDLESS_SIM = 600;
let simEnded = false;                                      // the sim's numbers are for a fight you ended, not for the next one
function askSimAverage(seconds) {
  simResult = null; simResults = {};
  simEnded = seconds > 0;
  hud.setSimAverage(null);
  try {
    if (!simWorker) {
      simWorker = new Worker('js/sim-worker.js' + new URL(import.meta.url).search);   // the same version as this file
      simWorker.onmessage = function (e) {
        if (e.data.id !== simJob) return;
        simResults[e.data.precast || ''] = e.data;
        useSimResult();
      };
      simWorker.onerror = function () { simWorker = null; };
    }
    const fight = fightOptions(), simConfig = clone(config);
    if (challenge && challenge.sim) Object.assign(simConfig.fight, challenge.sim);   // an encounter: the even fight the sim plays instead
    if (fight.endless) simConfig.fight.executePct = fight.endless === 'execute' ? 101 : 0;
    const job = { id: ++simJob, build: clone(character.build), race: character.raceKey, config: simConfig, targets: (challenge && challenge.simTargets) || targets,
                  health: (challenge && challenge.simHealth) || character.dummyHealth * targets, timed: fight.timed || !!fight.endless,
                  seconds: fight.endless ? (simEnded ? Math.max(ENDLESS_SIM, Math.ceil(seconds) + 120) : ENDLESS_SIM) : fight.seconds, cut: simEnded ? seconds : 0,
                  seed: challenge && challenge.seeded ? challenge.seed : null, precast: '' };
    if (simEnded) { simWorker.postMessage(Object.assign(job, { precast: combat.state.precastKey || '' })); return; }   // the fight is over: only the way you opened it
    simWorker.postMessage(job);
    // Then the same fight opened with each spell you could precast, so the right numbers are ready when you do.
    precastChoices().forEach(function (k) { simWorker.postMessage(Object.assign({}, job, { precast: k })); });
  } catch (e) {
    simWorker = null;                                     // no workers here: the meter just keeps showing a dash
  }
}

// What you see when something happens. A spell that flies is drawn as a bolt: its number and the dummy's flinch
// wait until the bolt arrives (the damage itself is already counted, exactly as the rules say).
const boltsAt = [0, 0, 0, 0], deathWaiting = [false, false, false, false];
const spot = new THREE.Vector3(), staffAt = new THREE.Vector3();
// Which sound a spell makes when it takes hold of the target (a DoT, a curse). Damage over time itself is silent.
const APPLY_SOUND = { corruption: 'rot', siphonLife: 'rot', curseOfElements: 'curse', baneOfAgony: 'curse', baneOfDoom: 'curse', baneOfHavoc: 'curse' };
function hitSound(e) {
  if (e.pet) { sound.play('petHit'); return; }
  sound.play(e.key === 'immolate' ? 'ignite' : e.school === 'fire' ? 'hitFire' : 'hitShadow');
  if (e.crit) sound.play('big');
}
// What a cast or channel sounds like while it lasts.
function castSound(key) {
  const spell = combat.spells[key];
  return spell.school === 'fire' ? 'fire' : spell.leech ? 'drain' : 'shadow';
}
function onCombatEvent(e) {
  if (e.type === 'precast') {                              // you opened with a precast (key), or it was stopped after the pull (null)
    useSimResult();
    showBest();
    if (e.key) hud.log('Precast: ' + combat.spells[e.key].name + '. The sim is measured with the same precast.', 'proc');
    return;
  }
  if (e.type === 'spawn') {                                // an add joins the fight (a scripted fight)
    dummies[e.target].setDead(false);
    boltsAt[e.target] = 0; deathWaiting[e.target] = false;
    setColliders();
    effects.ring(spot.set(SPOTS[e.target].x, 0.1, SPOTS[e.target].z), 0xb98aff, 0.4, 3.2, 0.7, false);
    sound.play('warn');
    hud.log(hud.dummyName(e.target) + ' joins the fight.', 'proc');
    return;
  }
  if (e.type === 'proc' && (e.name === 'shadowTrance' || e.name === 'decimation')) {
    if (procLog.open) procLog.list.push({ name: procLog.open.name });      // the one before was never used
    procLog.open = { name: e.name, at: combat.state.t };
  } else if (e.type === 'cast' && procLog.open) {
    const o = procLog.open, fits = o.name === 'shadowTrance' ? WL.isShadowBolt(e.key) && !(e.castTime > 0) : e.key === 'soulFire';
    if (fits) {
      const after = combat.state.t - o.at;
      procLog.list.push(after <= 10.05 ? { name: o.name, after: after } : { name: o.name });
      procLog.open = null;
    }
  }
  if (e.amount > 0 && (e.type === 'hit' || e.type === 'tick' || e.type === 'havoc')) {
    let second = Math.floor(combat.fightSeconds()) + 1;
    if (combat.timed) second = Math.min(second, Math.max(1, Math.ceil(combat.duration)));   // what lands as the time runs out belongs to the last second (as the sim's curve has it)
    while (myCurve.length <= second) myCurve.push(myCurve[myCurve.length - 1]);
    myCurve[second] += e.amount;
  }
  extras.event(e, combat);
  recorder.event(e, combat);
  if (combat.state.fightStart !== null) replay.event(combat.fightSeconds(), e);
  showLooks(e, false);
  if (e.type === 'death' && e.last) {
    manaEnd = combat.state.mana;                           // what you had left: it keeps regenerating after the fight
    sampleReplay(true);
    noteResult();
    progressDue = !combat.endless;
    noteProgressNow();
    const fight = combat, mine = settleBest(), drill = challengeResult();
    const better = (mine && mine.record && mine.previous) || (drill && drill.record);
    window.setTimeout(function () { if (combat === fight && combat.state.over) sound.play(better ? 'best' : 'fightEnd'); }, 500);
    if (!e.stopped) window.setTimeout(function () { if (combat.state.over && !replay.state.active) showReview(); }, 1200);   // the review opens by itself (ended by you: it is open already)
  }
}

// Shadow Trance and Decimation, made hard to miss (a switch): a word at the top, a chime, a strong glow on the button.
const ALERTS = { shadowTrance: 'Shadow Trance: Shadow Bolt is instant', decimation: 'Decimation: Soul Fire is fast and free' };
let alertTimer = 0;
function procAlert(name) {
  if (!ALERTS[name] || !extras.show().alerts) return false;
  const box = document.getElementById('procAlert');
  box.textContent = ALERTS[name];
  box.classList.remove('show'); void box.offsetWidth; box.classList.add('show');
  window.clearTimeout(alertTimer);
  alertTimer = window.setTimeout(function () { box.classList.remove('show'); }, 1800);
  return true;
}

// What you see and hear when something happens. again: the replay plays it once more (no log lines, no casting
// hum; the dummies fall as its record says).
function showLooks(e, again) {
  const ti = e.target || (again ? 1 : combat.state.target), dummy = dummies[ti], anchor = anchors[ti];
  const fx = SPELL_FX[e.key], lands = e.type === 'hit' || e.type === 'miss';
  const rides = e.key === 'pet:brand';   // extra damage that comes with the pet's own hit: no second strike, no second sound
  if (e.pet && lands && !rides) pet.strike();

  // Sounds.
  if (e.type === 'cast') {
    if (e.key === 'lifeTap') sound.play('lifeTap');
    else if ((e.castTime > 0 || e.channel) && !again) {    // it sounds for as long as it lasts
      sound.casting(castSound(e.key), e.channel || e.castTime);
      humming = true;
    }
  } else if (e.type === 'fail') sound.play('error');
  else if (e.type === 'interrupt') { castStopped = true; if (e.reason === 'moving' || e.reason === 'cancelled' || e.reason === 'health') sound.play('fizzle'); }
  else if (e.type === 'apply') sound.play(APPLY_SOUND[e.key]);
  else if (e.type === 'proc') sound.play(!again && procAlert(e.name) ? 'alert' : 'proc');
  else if (e.type === 'pushback') sound.play('pushback');
  else if (e.type === 'death') sound.play('death');
  else if (e.type === 'miss' && !e.pet) sound.play('miss');
  else if (e.type === 'hit' && e.pet && !(fx && fx.bolt)) { if (!rides) sound.play('pet'); }
  else if (e.type === 'hit' && !e.pet && !(fx && fx.bolt)) hitSound(e);
  if (lands && fx && fx.bolt && !e.pet) sound.play(fx.bolt.style === 'fire' ? 'boltFire' : 'boltShadow');

  // Where your staff's crystal is right now (life drawn from the target flows back to it).
  warlock.orbPosition(staffAt);
  const where = { at: dummy.chestAt, caster: staffAt, color: fx && fx.color, crit: !!e.crit && e.type === 'hit' };
  // An instant spell: the staff arm is thrust forward, and a line of light runs to the target (unless it flies as a bolt).
  const instant = (e.type === 'cast' && !(e.castTime > 0) && !e.channel && e.key !== 'lifeTap') || (e.type === 'apply' && e.key === 'baneOfHavoc');
  if (instant) {
    warlock.release();
    if (!(fx && fx.bolt) && !combat.spells[e.key].aoe) effects.streak(staffAt, dummy.chestAt, fx ? fx.cast : 0xffffff);
  }

  if (lands && fx && fx.bolt) {
    if (!again) hud.event(e, anchor, true);
    if (e.pet) spot.set(pet.state.x, 0.65, pet.state.z); else spot.copy(staffAt);
    boltsAt[ti]++;
    effects.bolt(spot, dummy.chestAt, fx.bolt, function () {
      boltsAt[ti]--;
      if (e.type === 'hit') { warlock.orbPosition(staffAt); effects.play(fx.land, where); effects.play('straw', { at: dummy.chestAt, many: !!e.crit }); dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1); hitSound(e); }
      hud.floatFor(e, anchor);
      if (deathWaiting[ti] && boltsAt[ti] === 0) { deathWaiting[ti] = false; dummy.setDead(true); effects.play('death', where); }
    });
    return;
  }

  if (!again) hud.event(e, anchor);
  else if (e.type === 'hit' || e.type === 'tick' || e.type === 'miss') hud.floatFor(e, anchor);
  if (e.type === 'hit') {
    dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1);
    if (fx && fx.land) effects.play(fx.land, where);
    effects.play('straw', { at: dummy.chestAt, many: !!e.crit });
  } else if (e.type === 'tick') {
    dummy.hit(0.25);
    if (fx && fx.tick) effects.play(fx.tick, where);
  } else if (e.type === 'havoc') {
    dummy.hit(0.2);
    effects.play('brand', where);
  } else if (e.type === 'apply') {
    if (fx && fx.apply) effects.play(fx.apply, where);
  } else if (e.type === 'mana' && e.source === 'Life Tap') {
    effects.play('lifeTap', { caster: spot.set(controls.player.x, 1.2 * warlock.size, controls.player.z) });
  } else if (e.type === 'death') {
    if (again) { if (!e.timed) effects.play('death', where); }
    else if (!e.timed) { if (boltsAt[ti] > 0) deathWaiting[ti] = true; else { dummy.setDead(true); effects.play('death', where); } }
  }
}

function buildByKey(key) { return allBuilds().filter(function (b) { return b.key === key; })[0] || null; }

// The build you start with before you have picked one: the highest in the sim's DPS ranking.
function startingBuild() {
  const ranking = (window.FW_BUILD_ORDER && window.FW_BUILD_ORDER.order) || [];
  for (let i = 0; i < ranking.length; i++) {
    const build = buildByKey(ranking[i].key);
    if (build) return build;
  }
  return WL.BUILDS[0];
}

// What you are buffed with before the fight starts, as the DPS sim's settings have it: Demonic Sacrifice, the raid
// buffs that are switched on, and the consumables that last the whole fight (your Spellstone or Firestone, elixirs).
function standingBuffs(build, stats) {
  const list = [];
  if (stats.sacrificeActive && build.sacrifice) {
    const what = build.sacrifice.charAt(0).toUpperCase() + build.sacrifice.slice(1);      // Imp, Succubus, Voidwalker, Felhunter
    list.push({ key: 'sacrifice', icon: 'demonicSacrifice', name: 'Demonic Sacrifice (' + what + ')', desc: 'You sacrificed your ' + what + ' before the fight; its gift lasts the whole fight.', from: 'your talents' });
  }
  Object.keys(config.buffs).forEach(function (k) {
    const b = config.buffs[k];
    if (b.on) list.push({ key: 'buff_' + k, icon: 'buff_' + k, name: b.name, desc: b.desc || '', id: b.id, from: b.cls });
  });
  Object.keys(config.consumables).forEach(function (k) {
    const c = config.consumables[k];
    if (c.on) list.push({ key: 'con_' + k, icon: 'consumable_' + k, name: k === 'buildOil' && stats.oilName ? stats.oilName : c.name, desc: c.desc || '', from: c.cat });
  });
  return list;
}

// Builds the character from the chosen build and race, sets up the dummies and starts a fresh fight.
function newCharacter() {
  endReplay(true);
  simEnded = false;                                        // the sim is asked afresh at the end of this function
  const build = buildByKey(getSetting('build')) || startingBuild();
  const raceKey = WL.RACES[getSetting('race')] && WL.RACE_KEYS.indexOf(getSetting('race')) >= 0 ? getSetting('race') : 'human';
  warlock.setRace(raceKey);                                // the model takes the race's shape; the camera looks at its head
  controls.setEyeHeight(1.7 * warlock.size);
  const dummyHealth = getSetting('dummyHealth');
  targets = Math.max(1, Math.min(3, Number(challenge ? challenge.targets : getSetting('dummies')) || 1));
  config = buildConfig();
  const fight = fightOptions();
  combat = createCombat({ WL: WL, build: build, raceKey: raceKey, config: config, dummyHealth: dummyHealth, targets: targets,
                          timedDuration: fight.timed ? fight.seconds : 0, onEvent: onCombatEvent, petMeleeRange: petMeleeRange(config, build.pet),
                          endless: !!fight.endless, endlessPct: fight.endless === 'execute' ? (config.fight.executePct > 20 ? 20 : config.fight.executePct / 2) : 100,   // infinite health; "in execute range" = standing at 20%
                          healths: challenge && challenge.healths, absent: challenge && challenge.absent,   // a scripted fight with adds
                          seed: challenge && challenge.seeded ? challenge.seed : undefined });   // a seeded fight rolls the same dice every time
  pet.setKind(build.pet === 'imp' ? 'imp' : build.pet ? 'succubus' : null);   // other demons borrow the Succubus's shape
  const bar = actionBarFor(build, combat.table, WL.RACES[raceKey], ACTION_CODES.length, getSetting('homes'));
  panels.setFight(fight);
  panels.hideReview();
  const ranges = bar.filter(function (k) { return combat.table[k]; }).map(function (k) { return combat.table[k].range; });
  character = {
    build: build, raceKey: raceKey, stats: combat.stats, table: combat.table, spells: combat.spells, bar: bar,
    racial: combat.racial(), dummyHealth: dummyHealth, executePct: config.fight.executePct, targets: targets,
    builds: allBuilds(), timed: fight.timed, endless: fight.endless,
    maxRange: Math.max.apply(null, ranges.concat([0])),
    lessonKey: build.custom ? 'c' + hash(getSetting('buildCode')) : build.key   // lessons and progress are kept per build
  };
  character.standing = standingBuffs(build, combat.stats);
  extras.setCharacter(character, config, leftOut, challenge);
  hud.setCharacter(character);
  aids.setCharacter(character);
  touch.setTargets(targets);
  encounter.start(challenge && challenge.encounter ? challenge : null);
  showBest();

  // The dummies in the room (what you cannot walk through is set with every new fight: setColliders).
  for (let i = 1; i <= 3; i++) dummies[i].root.visible = i <= targets;

  // Range rings around your target: your spell range (Destructive Reach included), Drain Life, the Succubus.
  if (rings) scene.remove(rings);
  const list = [{ yards: character.maxRange, color: 0xb9a8ff }];
  if (combat.table.drainLife && combat.table.drainLife.range !== character.maxRange) list.push({ yards: combat.table.drainLife.range, color: 0x58e0a8 });
  if (build.pet === 'succubus') list.push({ yards: petMeleeRange(config, build.pet), color: 0xff9d7a });
  rings = makeRangeRings(list);
  rings.visible = getSetting('rings');
  scene.add(rings);
  resetFight();
  askSimAverage();
}

// What you cannot walk through: the room's own things and every dummy that is there right now.
function setColliders() {
  colliders.length = fixedColliders;
  for (let i = 1; i <= targets; i++) if (!combat.state.targets[i].absent) colliders.push({ x: SPOTS[i].x, z: SPOTS[i].z, r: dummies[i].radius });
}

function resetFight() {
  endReplay(true);
  combat.reset();
  replay.reset();
  ghost.place();
  setColliders();
  procLog = { open: null, list: [] };
  recorder.reset();
  encounter.reset();
  sound.stopCasting();
  fightBest = null; challengeOut = null; fightLogged = false; progressDue = false; prevCast = null; castStopped = false; humming = false; bannerKind = '';
  myCurve = [0]; manaCurve = []; manaEnd = null;
  fightClock = 0;
  pull = null; pullInfo = null; pullNote = null;
  hud.setPull(false);
  if (simEnded) askSimAverage(); else useSimResult();      // back to the numbers without a precast (after a fight you ended: the sim's long fight again)
  if (character) showBest();
  for (let i = 1; i <= 3; i++) { dummies[i].setDead(false); boltsAt[i] = 0; deathWaiting[i] = false; }
  pet.sendHome();
  effects.clear();
}

// The pull timer: a countdown to the pull, so a precast can be timed. The fight begins when it reaches zero - or
// sooner, when your spell lands (or your pet attacks) before that. Asking again stops it.
function pullSeconds() { return Math.max(1, Math.min(30, Math.round(Number(getSetting('pullSeconds')) || 5))); }
function togglePull() {
  touch.closeMenu();
  hud.closePanels();
  if (pull) { pull = null; hud.setPull(false); hud.log('Pull timer stopped.'); return; }
  resetFight();
  pull = { at: fightClock + pullSeconds(), seconds: pullSeconds(), beep: 3 };
  hud.setPull(true);
  hud.log('Pull in ' + pull.seconds + ' s. The fight begins at zero, or sooner if your spell lands first.', 'proc');
  sound.play('warn');
}

function press(key) {
  if (!key || replay.state.active) return;
  const late = Math.max(0, Number(getSetting('latency')) || 0), fight = combat;
  if (late > 0) { window.setTimeout(function () { if (combat === fight) { combat.update(fightClock, ctx); combat.press(key, ctx); } }, late); return; }
  combat.update(fightClock, ctx);
  combat.press(key, ctx);
}

function setTarget(ti) {
  if (ti < 1 || ti > targets) return;
  if (!combat.alive(ti) && !combat.state.over) { hud.showError('That dummy is down'); return; }
  combat.setTarget(ti);
}

// Tab: the next dummy that is still standing.
function nextTarget() {
  for (let step = 1; step <= targets; step++) {
    const ti = (combat.state.target - 1 + step) % targets + 1;
    if (combat.alive(ti)) { combat.setTarget(ti); return; }
  }
}

// A click on a dummy targets it.
const raycaster = new THREE.Raycaster(), pointer = new THREE.Vector2();
function clickScene(x, y) {
  pointer.set(x / window.innerWidth * 2 - 1, -(y / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  let best = 0, bestDistance = Infinity;
  for (let i = 1; i <= targets; i++) {
    const hit = raycaster.intersectObject(dummies[i].root, true)[0];
    if (hit && hit.distance < bestDistance) { best = i; bestDistance = hit.distance; }
  }
  if (best) setTarget(best);
}

// ---------- keys and mouse buttons ----------
// Is this key, button or wheel turn (with its modifiers) bound to an action?
function bound(combo) { return !!combo && (keyCodes.indexOf(combo) >= 0 || ACTION_BINDS.some(function (k) { return binds[k] === combo; })); }
// Does what it is bound to. True when it was bound to something.
function act(combo) {
  if (!combo) return false;
  if (replay.state.active) {                               // watching a fight again: Escape stops it, other keys do nothing
    if (combo === binds.cancel) { endReplay(); return true; }
    return bound(combo);
  }
  if (combo === binds.cancel) { combat.cancel(); return true; }
  if (combo === binds.nextTarget) { nextTarget(); return true; }
  if (combo === binds.petAttack) { combat.update(fightClock, ctx); combat.petCommand('attack'); return true; }
  if (combo === binds.petFollow) { combat.update(fightClock, ctx); combat.petCommand('follow'); return true; }
  if (combo === binds.reset) { resetFight(); hud.log('Fight reset.'); return true; }
  if (combo === binds.pull) { togglePull(); return true; }
  if (combo === binds.zoomIn) { controls.zoom(-1); return true; }
  if (combo === binds.zoomOut) { controls.zoom(1); return true; }
  const slot = keyCodes.indexOf(combo);
  if (slot < 0) return false;
  press(character.bar[slot]);
  return true;
}
function typing(e) { return e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement; }
function usesAlt() { return keyCodes.concat(ACTION_BINDS.map(function (k) { return binds[k]; })).some(function (c) { return /(^|\+)Alt\+/.test(c || ''); }); }
// Escape closes what is open; the rest is whatever the Keybinds panel says.
window.addEventListener('keydown', function (e) {
  if (e.metaKey || typing(e)) return;
  const combo = keyCombo(e);
  if (e.repeat) {                                          // a held key does nothing again - except zooming
    if (combo && (combo === binds.zoomIn || combo === binds.zoomOut)) act(combo);
    if (bound(combo)) e.preventDefault();
    return;
  }
  if (e.code === 'Escape' && extras.sheetOpen()) { extras.closeSheet(); return; }
  if (e.code === 'Escape' && (panels.reviewOpen() || hud.anyPanelOpen())) { if (panels.reviewOpen()) panels.hideReview(); else hud.closePanels(); return; }
  if (act(combo)) e.preventDefault();                      // also keeps the browser from acting on Ctrl+S, Alt+D and the like
  else if (/^Alt/.test(e.code) && usesAlt()) e.preventDefault();   // Alt by itself would open the browser's menu
});
window.addEventListener('keyup', function (e) { if (/^Alt/.test(e.code) && usesAlt()) e.preventDefault(); });
// The middle button and the thumb buttons. The thumb buttons never take you a page back or forward here.
window.addEventListener('mousedown', function (e) {
  if (e.button === 3 || e.button === 4) e.preventDefault();
  const combo = mouseCombo(e);
  if (combo && !typing(e) && act(combo)) e.preventDefault();
});
['mouseup', 'auxclick'].forEach(function (type) {
  window.addEventListener(type, function (e) { if (e.button === 3 || e.button === 4 || (e.button === 1 && bound(mouseCombo(e)))) e.preventDefault(); });
});

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.fov = camera.aspect < 1 ? 74 : 55;                // a phone held upright: a wider look, or the dummies fall off the sides
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// Results from before a fight could be opened with a precast do not compare with new ones: they start over (Xn).
if (getSetting('resultsVersion') !== 2) { setSetting('bests', {}); setSetting('drills', {}); setSetting('resultsVersion', 2); }
const savedKeys = getSetting('keys');
if (Array.isArray(savedKeys) && savedKeys.length === ACTION_CODES.length) keyCodes = savedKeys.slice();
// Opened from a share link: its setup replaces the one saved in this browser (keys, names and switches stay yours).
const shared = readLink();
if (shared) {
  if (shared.buildCode) { setSetting('buildCode', shared.buildCode); setSetting('build', 'custom'); }
  else if (shared.build && shared.build !== 'custom') setSetting('build', shared.build);
  if (shared.race) setSetting('race', shared.race);
  if (shared.dummies) setSetting('dummies', shared.dummies);
  if (shared.health) setSetting('dummyHealth', shared.health);
  if (shared.fight) setSetting('fight', shared.fight);
  if (shared.latency != null || shared.fight) setSetting('latency', shared.latency || 0);
  if (shared.fight) setSetting('settingsCode', shared.settingsCode || '');
}
// A share link pasted into the address bar while the page is open only changes the part after the #: load it properly.
window.addEventListener('hashchange', function () { if (/(^#|&)v=1(&|$)/.test(window.location.hash)) window.location.reload(); });
if (readCustomBuild().length && getSetting('build') === 'custom') setSetting('build', null);   // a code that cannot be played here
hud.setScale(getSetting('uiScale'));
warlock.setRobe(extras.wornRobe());
newCharacter();
hud.setKeys(keyCodes);
hud.setBinds(binds);
hud.setSound(sound.isOn());
panels.setImport(getSetting('buildCode'), getSetting('settingsCode'), [], false);
hud.setRings(getSetting('rings'));
hud.log('You enter the fel chamber.', 'proc');
hud.log('Build: ' + character.build.short + '.');
hud.log(isTouch ? 'Tap a spell to cast it. Hold a finger on a spell or a buff to read it.' : 'Cast with the keys on the action bar. Hover a spell or a buff to read it.');
if (shared) {
  hud.log('Opened from a link: ' + character.build.short + ', ' + WL.RACES[character.raceKey].name + ', ' + targets + (targets > 1 ? ' dummies.' : ' dummy.'), 'proc');
  if (shared.challenge && !extras.play(shared.challenge)) hud.log('The challenge in the link is not known here.');
}

// ---------- a safeguard for weak graphics chips ----------
// When the picture stays under about 45 a second, draw it with less detail (fewer pixels, stretched to the window).
// If that does not make it faster, detail was not the problem: put it back and stop trying. Fast machines never
// notice any of this.
const speed = { detail: FULL_DETAIL, seconds: 0, frames: 0, slowRounds: 0, before: 0, previous: FULL_DETAIL, off: false };
function setDetail(detail) {
  speed.detail = detail;
  renderer.setPixelRatio(detail);
  resize();
}
function watchSpeed(seconds, time) {
  if (speed.off || time < 3) return;                       // the first seconds include start-up work
  if (seconds > 0.25) { speed.seconds = 0; speed.frames = 0; return; }   // the tab was hidden or the page stalled
  speed.seconds += seconds;
  speed.frames++;
  if (speed.seconds < 2) return;
  const perSecond = speed.frames / speed.seconds;
  speed.seconds = 0;
  speed.frames = 0;
  if (speed.before) {                                      // first round after lowering the detail: did it help?
    if (perSecond < speed.before * 1.1) { setDetail(speed.previous); speed.off = true; }
    else hud.log('Picture detail lowered to keep it smooth.');
    speed.before = 0;
    return;
  }
  speed.slowRounds = perSecond < 45 ? speed.slowRounds + 1 : 0;
  if (speed.slowRounds >= 2 && speed.detail > 0.6) {
    speed.slowRounds = 0;
    speed.before = perSecond;
    speed.previous = speed.detail;
    setDetail(Math.max(0.6, speed.detail * 0.75));
  }
}

// ---------- every picture ----------
const clock = new THREE.Clock();
const from = new THREE.Vector3(), head = new THREE.Vector3(), rain = new THREE.Vector3();
let areaPulse = 0, wasMoving = false;
function frame() {
  const elapsed = clock.getDelta(), dt = Math.min(0.05, elapsed), time = clock.elapsedTime;
  watchSpeed(elapsed, time);
  if (replay.state.active) { replayFrame(dt, time); return; }

  gamepad.poll(dt);
  controls.update(dt);
  const player = controls.player;
  // A scripted fight says when you are made to move, lands its fire and its hits, and says what to show.
  const script = encounter.update(dt, time, player, combat);
  ctx.forced = script.forced; ctx.banner = script.banner; ctx.called = script.called;
  if (script.forced && !combat.state.over) combat.result.track.moved += Math.min(0.25, elapsed);
  const kind = script.banner ? script.banner.text.replace(/[\d.\s]+/g, '') : '';
  if (kind !== bannerKind) { bannerKind = kind; if (script.banner) sound.play(script.banner.soon ? 'warn' : 'move'); }
  ctx.moving = player.moving || player.height > 0 || script.forced;   // a jump counts as moving: it stops the spell you are casting
  for (let i = 1; i <= 3; i++) ctx.distances[i] = Math.hypot(player.x - SPOTS[i].x, player.z - SPOTS[i].z);

  // The pet walks first, so the casting rules know whether it is in range of its dummy.
  const P = combat.pet;
  if (P) {
    const petCast = P.casting ? Math.min(1, (combat.state.t - P.casting.start) / (P.casting.end - P.casting.start)) : 0;
    pet.update(dt, time, player, P.mode, P.range, petCast, combat.state.over || !combat.alive(P.target), SPOTS[P.target], colliders);
    ctx.petDistance = pet.state.distance;
  }

  // The fight's own clock stands still while the page is hidden (a long gap counts as a quarter second at most).
  fightClock += Math.min(0.25, elapsed);
  if (pull && fightClock >= pull.at) {                     // the countdown ran out: the fight begins at that very moment
    combat.update(pull.at, ctx);
    if (combat.state.fightStart === null) {
      combat.pull();
      pullInfo = { seconds: pull.seconds, early: 0 };
      pullNote = { text: 'Pull!', until: pull.at + 1.2 };
      hud.log('Pull! The fight has begun.', 'proc');
      sound.play('move');
      pull = null; hud.setPull(false);
    }
  }
  combat.update(fightClock, ctx);
  if (pull && combat.state.fightStart !== null) {          // your spell or your pet got there before the timer
    const early = Math.max(0, pull.at - combat.state.fightStart);
    pullInfo = { seconds: pull.seconds, early: early };
    pullNote = { text: 'Pulled ' + early.toFixed(1) + ' s early', until: fightClock + 1.8 };
    hud.log('You pulled ' + early.toFixed(1) + ' s before the timer ran out.', 'miss');
    pull = null; hud.setPull(false);
  }
  if (pull) {
    const left = Math.max(0, pull.at - fightClock);
    ctx.banner = { text: 'Pull in ' + left.toFixed(1), soon: left > 3 };
    if (left <= pull.beep) { pull.beep = Math.ceil(left) - 1; sound.play('warn'); }   // a tick for each of the last three seconds
  } else if (pullNote) {
    if (fightClock < pullNote.until) ctx.banner = ctx.banner || { text: pullNote.text, soon: false };
    else pullNote = null;
  }

  if (combat.state.fightStart !== null && !combat.state.over) {
    const second = Math.floor(combat.fightSeconds());
    while (manaCurve.length <= second) manaCurve.push(combat.state.mana);
  }
  const phase = combat.movePhase(), mustMove = !!(phase && phase.moving);
  if (mustMove && !wasMoving) sound.play('move');
  wasMoving = mustMove;

  const S = combat.state, casting = S.cast || S.channel;
  const school = casting ? combat.spells[casting.key].school : null;
  recorder.sample(combat, targets, mustMove || script.forced);
  sampleReplay(false);
  // A cast that ended by itself (not stopped) goes off: the staff arm is thrust forward. The casting hum ends with it.
  if (prevCast && S.cast !== prevCast && !castStopped) warlock.release();
  prevCast = S.cast; castStopped = false;
  if (humming && !casting) { humming = false; sound.stopCasting(); }
  warlock.root.position.set(player.x, 0, player.z);
  warlock.root.rotation.y = player.yaw;
  warlock.update(dt, time, player.moving, player.height, school);
  ghost.update(dt, time, ghostView(player, S.fightStart !== null ? combat.fightSeconds() : null));
  for (let i = 1; i <= targets; i++) {
    dummies[i].root.visible = !S.targets[i].absent;        // an add that has not joined yet
    dummies[i].update(dt, time);
    dummies[i].setSelected(i === S.target);
  }
  rings.position.set(SPOTS[S.target].x, 0, SPOTS[S.target].z);
  rings.visible = getSetting('rings');
  chamber.update(time);

  // Spell looks: motes at the staff while casting, marks on the dummies for what is on them, bolts and bursts.
  warlock.root.updateMatrixWorld();
  if (casting) {
    const fx = SPELL_FX[casting.key];
    effects.casting(warlock.orbPosition(from), fx ? fx.cast : 0xffffff, S.cast ? (S.t - S.cast.start) / (S.cast.end - S.cast.start) : 0.6, time, player, dt);
  } else effects.casting(null, 0, 0, time, player, dt);
  for (let i = 1; i <= 3; i++) {                           // all three, so a dummy that is no longer there loses its marks
    effects.setMarks(i, SPOTS[i], i <= targets && combat.alive(i) ? {
      immolate: combat.dotLeft('immolate', i) > 0, corruption: combat.dotLeft('corruption', i) > 0, siphonLife: combat.dotLeft('siphonLife', i) > 0,
      baneOfAgony: combat.dotLeft('baneOfAgony', i) > 0, baneOfDoom: combat.dotLeft('baneOfDoom', i) > 0,
      coe: combat.debuff(i, 'coe'), havoc: combat.havocOn() === i
    } : {}, time);
  }
  effects.update(dt, camera.position);

  // A channel on one dummy draws a beam to it; an area channel rains fire around its dummy, or burns around you.
  const area = S.channel && combat.spells[S.channel.key].aoe ? combat.table[S.channel.key] : null;
  if (S.channel && !area) {
    beam.material.color.set(S.channel.key === 'wrack' ? 0xb07cff : 0x8dff9a);
    beam.set(warlock.orbPosition(from), dummies[S.channel.target].chestAt, time);
  } else beam.hide();
  if (area) {
    areaPulse -= dt;
    if (areaPulse <= 0) {
      if (area.range) {                                    // Rain of Fire
        areaPulse = 0.11;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * area.radius, at = SPOTS[S.channel.target];
        effects.meteor(rain.set(at.x + Math.cos(a) * r, 0.15, at.z + Math.sin(a) * r));
      } else {                                             // Hellfire
        areaPulse = 0.45;
        rain.set(player.x, 0.1, player.z);
        effects.ring(rain, 0xff5a1a, 1, area.radius, 0.55, false);
        effects.ring(rain, 0xffc23d, 0.6, area.radius * 0.7, 0.45, true);
        for (let k = 0; k < 5; k++) { const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * (area.radius - 2); effects.play('burn', { at: head.set(player.x + Math.cos(a) * r, 1.0, player.z + Math.sin(a) * r) }); }
      }
    }
  } else areaPulse = 0;

  renderer.render(scene, camera);

  for (let i = 1; i <= 3; i++) {
    const anchor = anchors[i];
    if (i > targets || S.targets[i].absent) { anchor.visible = false; continue; }  // a dummy that is gone (or not there yet) takes its damage numbers with it
    head.copy(dummies[i].headAt).project(camera);
    anchor.visible = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
    anchor.x = (head.x * 0.5 + 0.5) * window.innerWidth;
    anchor.y = (-head.y * 0.5 + 0.5) * window.innerHeight;
  }
  const ends = combat.endless && !combat.state.over && combat.state.fightStart !== null;   // "Review the fight" is what ends a fight with infinite health
  if (ends !== reviewEnds) { reviewEnds = ends; panels.setReviewButton(ends); }
  hud.render(combat, ctx, time, anchors);
  extras.render(combat, time, simResult, raceBest);
  aids.render(combat, time, extras.show(), simResult, recorder);
}
renderer.setAnimationLoop(frame);

// What the ghost needs to know: where you stand, the second of the fight (null before it begins), the sim's casts.
function ghostView(player, t) {
  const P = combat.pet, pc = config.pets[character.build.pet], swing = pc && pc.melee ? pc.melee.swing : 2;
  return { show: extras.show().ghost, race: character.raceKey, player: player, t: t, casts: simResult && simResult.casts, targets: targets, camera: camera,
           petKind: P ? (character.build.pet === 'imp' ? 'imp' : 'succubus') : null, petHits: simResult && simResult.petHits, petRange: P ? P.range : 0, swing: swing,
           over: replay.state.active ? false : combat.state.over,
           spot: function (i) { return SPOTS[i]; }, chest: function (i) { return dummies[i].chestAt; } };
}

// ---------- watching the fight again ----------
// While the fight runs: where everyone is, ten times a second (and once more as it ends).
function sampleReplay(last) {
  const S = combat.state;
  if (S.fightStart === null || (S.over && !last)) return;
  const player = controls.player, P = combat.pet, c = S.cast || S.channel, hp = [0], dead = [false], gone = [false];
  for (let i = 1; i <= targets; i++) {
    hp.push(S.targets[i].hpPct / 100);
    dead.push(!!S.targets[i].dead && !combat.timed && !combat.endless);   // a timed fight ends on the clock: nobody falls
    gone.push(!!S.targets[i].absent);
  }
  replay.sample(combat.fightSeconds(), last, {
    x: player.x, z: player.z, yaw: player.yaw, h: player.height, mv: player.moving,
    pet: P ? { x: pet.state.x, z: pet.state.z, yaw: pet.state.yaw, mv: pet.state.moving } : null,
    hp: hp, dead: dead, gone: gone, mana: S.mana / character.stats.maxMana, dmg: combat.result.total,
    cast: c ? { key: c.key, target: c.target, ch: S.channel ? 1 : 0, p: S.cast ? Math.min(1, (S.t - S.cast.start) / (S.cast.end - S.cast.start)) : 0.6 } : null
  });
}
let replayDead = [false, false, false, false], replayAuras = {}, replaySaved = null;
function startReplay() {
  if (!replay.has() || !combat.state.over) { hud.showError('Nothing to watch yet: finish a fight first'); return; }
  panels.hideReview(); touch.closeMenu(); hud.closePanels();
  const p = controls.player;
  replaySaved = { x: p.x, z: p.z, yaw: p.yaw, height: p.height };
  replayAuras = recorder.data().auras;
  replayDead = [false, false, false, false];
  for (let i = 1; i <= 3; i++) dummies[i].setDead(false);
  seekReplay();
  sound.stopCasting();
  replay.open(combat.fightSeconds());
  ghost.place();
}
function seekReplay() {
  effects.clear(); beam.hide();
  for (let i = 1; i <= 3; i++) { boltsAt[i] = 0; deathWaiting[i] = false; }
}
// quiet: a new fight or character is on its way, so the review is not opened again.
function endReplay(quiet) {
  if (!replay.state.active) return;
  replay.close();
  const p = controls.player;
  p.x = replaySaved.x; p.z = replaySaved.z; p.yaw = replaySaved.yaw; p.height = replaySaved.height;
  seekReplay();
  for (let i = 1; i <= targets; i++) dummies[i].setDead(!combat.timed && !combat.endless && combat.state.targets[i].dead);   // as the fight ended
  ghost.place();
  if (!quiet) showReview();
}
// The marks on dummy i (DoTs, curse, Havoc) at second t of the fight, from the review's record.
function marksAt(i, t) {
  const on = function (k) { return (replayAuras[i + ':' + k] || []).some(function (span) { return span[0] <= t && t < span[1]; }); };
  return { immolate: on('immolate'), corruption: on('corruption'), siphonLife: on('siphonLife'), baneOfAgony: on('baneOfAgony'), baneOfDoom: on('baneOfDoom'), coe: on('coe'), havoc: on('baneOfHavoc') };
}
function replayFrame(dt, time) {
  const R = replay.state;
  replay.advance(dt).forEach(function (e) { showLooks(e, true); });
  const s = replay.at(R.t), player = controls.player, cast = s.cast;
  player.x = s.x; player.z = s.z; player.yaw = s.yaw; player.height = s.h;
  controls.aim();                                          // the camera follows; the left mouse button still looks around
  const spell = cast ? combat.spells[cast.key] : null;
  warlock.root.position.set(s.x, 0, s.z);
  warlock.root.rotation.y = s.yaw;
  warlock.update(dt, time, s.mv, s.h, spell ? spell.school : null);
  if (combat.pet && s.pet) pet.place(s.pet.x, s.pet.z, s.pet.yaw, s.pet.mv, dt, time);
  for (let i = 1; i <= targets; i++) {
    dummies[i].root.visible = !s.gone[i];
    if (!!s.dead[i] !== replayDead[i]) { replayDead[i] = !!s.dead[i]; dummies[i].setDead(replayDead[i]); }
    dummies[i].update(dt, time);
    dummies[i].setSelected(false);
  }
  rings.visible = false;
  chamber.update(time);
  warlock.root.updateMatrixWorld();
  if (cast) { const fx = SPELL_FX[cast.key]; effects.casting(warlock.orbPosition(from), fx ? fx.cast : 0xffffff, cast.p, time, player, dt); }
  else effects.casting(null, 0, 0, time, player, dt);
  for (let i = 1; i <= 3; i++) effects.setMarks(i, SPOTS[i], i <= targets && !s.dead[i] && !s.gone[i] ? marksAt(i, R.t) : {}, time);
  if (cast && cast.ch && spell && !spell.aoe) {
    beam.material.color.set(cast.key === 'wrack' ? 0xb07cff : 0x8dff9a);
    beam.set(warlock.orbPosition(from), dummies[cast.target || 1].chestAt, time);
  } else beam.hide();
  effects.update(dt, camera.position);
  ghost.update(dt, time, ghostView({ x: s.x, z: s.z, yaw: s.yaw, moving: s.mv }, R.t >= 0 ? R.t : null));
  renderer.render(scene, camera);
  for (let i = 1; i <= 3; i++) {
    const anchor = anchors[i];
    if (i > targets || s.gone[i]) { anchor.visible = false; continue; }
    head.copy(dummies[i].headAt).project(camera);
    anchor.visible = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
    anchor.x = (head.x * 0.5 + 0.5) * window.innerWidth;
    anchor.y = (-head.y * 0.5 + 0.5) * window.innerHeight;
  }
  hud.floats(time);
  const seconds = Math.max(0, R.t);
  replay.say((spell ? (cast.ch ? 'Channelling ' : 'Casting ') + spell.name : 'Not casting') + '  ·  ' +
             Math.round(seconds > 0.5 ? s.dmg / seconds : 0).toLocaleString('en-US') + ' DPS so far  ·  mana ' + Math.round(100 * s.mana) + '%');
}

// ---------- a controller ----------
const gamepad = createGamepad({
  walk: function (x, y) { controls.setPad(x, y); },
  turn: function (yaw, pitch) { controls.turn(yaw, pitch); },
  slot: function (i) { press(character.bar[i]); },
  jump: function () { controls.jump(); },
  nextTarget: function () { nextTarget(); },
  pull: function () { togglePull(); },
  cancel: function () { combat.cancel(); },
  pet: function (mode) { combat.update(fightClock, ctx); combat.petCommand(mode); },
  reset: function () { resetFight(); hud.log('Fight reset.'); },
  review: function () { if (panels.reviewOpen()) panels.hideReview(); else reviewOrEnd(); },
  inUse: function () { hud.setPadLabels(PAD_LABELS); }       // the slots show what to press on the controller
});
// A key or a mouse button: the slots show the keys again.
['keydown', 'mousedown'].forEach(function (type) { window.addEventListener(type, function () { hud.setPadLabels(null); }, true); });

// For checks from the browser console.
window.FW = {
  extras: extras, get challenge() { return challenge; }, get myCurve() { return myCurve; },
  touch: touch, controls: controls, recorder: recorder, encounter: encounter, aids: aids, act: act, bound: bound, shareLink: shareLink, warlock: warlock,
  get keyCodes() { return keyCodes; }, binds: binds, togglePull: togglePull, get pull() { return pull; }, get pullInfo() { return pullInfo; },
  gamepad: gamepad, resultPicture: resultPicture, makeCard: makeCard, get simResults() { return simResults; }, get raceBest() { return raceBest; }, get procLog() { return procLog; },
  player: controls.player, view: controls.view, scene: scene, camera: camera, renderer: renderer, frame: frame,
  speed: speed, watchSpeed: watchSpeed, press: press, setTarget: setTarget, nextTarget: nextTarget, clickScene: clickScene,
  pet: pet, ctx: ctx, effects: effects, dummies: dummies, panels: panels, sound: sound,
  get config() { return config; }, get simResult() { return simResult; },
  ghost: ghost, replay: replay, startReplay: startReplay, endReplay: endReplay, reviewData: reviewData, procSummary: procSummary,
  get combat() { return combat; }, get character() { return character; }, get rings() { return rings; }
};
