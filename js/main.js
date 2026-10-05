// Forever Warlocking - start-up and the frame loop.
import * as THREE from 'three';
import { buildChamber, makeRangeRings, HALF } from './chamber.js';
import { makeWarlock, makeDummy, makeBeam } from './models.js';
import { createControls } from './controls.js';
import { createHud, ACTION_CODES } from './hud.js';
import { createCombat, actionBarFor } from './combat.js';
import { getSetting, setSetting } from './settings.js';
import { createPet } from './pets.js';
import { createEffects, SPELL_FX } from './effects.js';
import { createPanels } from './panels.js';
import { createSound } from './sound.js';

const WL = window.WL;
const PET_MELEE_RANGE = 5;      // the Succubus's melee reach in yards: this project's own number (not in the sim data)

// Where the dummies stand (yards; the first one in the middle of the summoning circle). Six yards apart: Rain of Fire
// on the middle one reaches all three, and Hellfire reaches all three when you stand between them.
const SPOTS = [null, { x: 0, z: 0 }, { x: -6, z: 0 }, { x: 6, z: 0 }];
const GAPS = SPOTS.map(function (a) { return SPOTS.map(function (b) { return a && b ? Math.hypot(a.x - b.x, a.z - b.z) : 0; }); });

// ---------- the scene ----------
const canvas = document.getElementById('scene');
// 'high-performance' asks a laptop with two graphics chips for the strong one.
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
const FULL_DETAIL = Math.min(window.devicePixelRatio || 1, 2);
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

// Every key that is not a slot on the action bar. Yours are kept in the browser; '' = no key.
const DEFAULT_BINDS = { forward: 'KeyW', back: 'KeyS', turnLeft: 'KeyA', turnRight: 'KeyD', strafeLeft: 'KeyQ', strafeRight: 'KeyE',
                        jump: 'Space', nextTarget: 'Tab', cancel: 'Escape', petAttack: '', petFollow: '' };
const binds = Object.assign({}, DEFAULT_BINDS, getSetting('binds') || {});

const colliders = chamber.colliders.slice(), fixedColliders = colliders.length;
const controls = createControls(canvas, camera, { half: HALF, wallHeight: 20, colliders: colliders, onClick: clickScene, binds: binds });

// ---------- the character and the fight ----------
let config = null, combat = null, character = null, rings = null, targets = 1, simResult = null;
let customBuild = null, leftOut = [];                     // an imported build; what an imported settings code has that is not playable here
const sound = createSound(getSetting('sound') === true);   // off until you switch it on (Xn)
let keyCodes = ACTION_CODES.slice();

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// The settings of the fight: the DPS sim's defaults, then an imported settings code, then the fight options.
// Things a code switches on that you would have to press during the fight (potions, runes, explosives, Power
// Infusion, Mana Tide, Innervate) are not playable here, so they are switched off - for you and for the sim average.
function buildConfig() {
  const cfg = clone(WL.DEFAULT_CONFIG), base = clone(WL.DEFAULT_CONFIG.fight);
  leftOut = [];
  const code = getSetting('settingsCode');
  if (code) {
    try {
      WL.applySettings(cfg, WL.decodeSettings(code));
      ['duration', 'durationVarPct', 'iterations', 'weightIterations', 'seed', 'targets', 'multiDot', 'moveEvery', 'moveDuration',
       'hitEvery', 'latencyMs', 'travelMs', 'lifeTapWhileMoving'].forEach(function (k) { cfg.fight[k] = base[k]; });
    } catch (e) { /* a code that no longer decodes is ignored */ }
  }
  Object.keys(cfg.consumables).forEach(function (k) {
    const c = cfg.consumables[k];
    if (c.on && (c.spPotion || c.manaRestore || c.explosive)) { c.on = false; leftOut.push(c.name); }
  });
  Object.keys(cfg.buffs).forEach(function (k) {
    const b = cfg.buffs[k];
    if (b.on && (b.tide || b.innervate || b.spellDmgPct)) { b.on = false; leftOut.push(b.name); }
  });
  const fight = fightOptions();
  cfg.fight.moveEvery = fight.moveEvery > 0 && fight.moveDuration > 0 ? fight.moveEvery : 0;
  cfg.fight.moveDuration = cfg.fight.moveEvery ? fight.moveDuration : 0;
  cfg.fight.hitEvery = fight.hitEvery;
  return cfg;
}
function fightOptions() { return Object.assign({ timed: false, seconds: 120, moveEvery: 0, moveDuration: 0, hitEvery: 0 }, getSetting('fight') || {}); }

// An imported build code becomes one more build in the list. Returns the reasons when it cannot be played.
function readCustomBuild() {
  customBuild = null;
  const code = getSetting('buildCode');
  if (!code) return [];
  try {
    const b = WL.decodeBuild(code), problems = WL.validateBuild(b);
    if (problems.length) return problems;
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
  onBuild: function (key) { setSetting('build', key); newCharacter(); hud.log('Build: ' + character.build.short + '.', 'proc'); },
  onRace: function (key) { setSetting('race', key); newCharacter(); hud.log('Race: ' + WL.RACES[key].name + '.', 'proc'); },
  onDummyHealth: function (health) { setSetting('dummyHealth', health); newCharacter(); hud.log((targets > 1 ? 'Each dummy' : 'The dummy') + ' now has ' + health.toLocaleString('en-US') + ' health.'); },
  onDummies: function (count) { setSetting('dummies', count); newCharacter(); hud.log(count === 1 ? 'One dummy.' : count + ' dummies. Tab or a click changes your target.', 'proc'); },
  onTarget: function (ti) { setTarget(ti); },
  onRings: function (on) { setSetting('rings', on); rings.visible = on; },
  onReset: function () { resetFight(); hud.log('Fight reset.'); },
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

const panels = createPanels({
  onFight: function (options) {
    setSetting('fight', options);
    hud.closePanels();
    newCharacter();
    hud.log(options.timed ? 'Timed fight: ' + options.seconds + ' s.' : 'The fight ends when the dummies are dead.', 'proc');
    if (config.fight.moveEvery) hud.log('You have to move every ' + config.fight.moveEvery + ' s for ' + config.fight.moveDuration + ' s.');
    if (config.fight.hitEvery) hud.log('You take a hit every ' + config.fight.hitEvery + ' s.');
  },
  // Codes from the DPS sim: a build (WFB1:...) and / or settings (WFS1:...). Empty = remove.
  onImport: function (buildCode, settingsCode) {
    const lines = [];
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
    } else if (buildCode) { lines.push('Build imported: ' + customBuild.short + '.'); setSetting('build', 'custom'); }
    else if (getSetting('build') === 'custom') setSetting('build', null);
    setSetting('settingsCode', settingsCode);
    newCharacter();
    if (settingsInfo) lines.push('Settings imported: ' + settingsInfo.replace(/ · \d+ s · \d+ fights$/, '') + '.');
    if (leftOut.length) lines.push('Not playable here yet, so switched off (also for the sim average): ' + leftOut.join(', ') + '.');
    if (!buildCode && !settingsCode) lines.push('Nothing imported: the ready builds with the default gear and buffs.');
    panels.setImport(getSetting('buildCode'), getSetting('settingsCode'), lines, bad);
  },
  onReview: function () { showReview(); }
});

function showReview() {
  if (!combat || combat.fightSeconds() <= 0) { hud.showError('Nothing to review yet: fight first'); return; }
  panels.showReview({
    seconds: combat.fightSeconds(), result: combat.result, sim: simResult, spells: combat.spells, targets: targets,
    timed: combat.timed, hasPet: !!combat.pet, petName: hud.petName(), dummyName: hud.dummyName
  });
}

// The DPS sim's average for this character on these dummies, worked out on another processor core.
let simWorker = null, simJob = 0;
function askSimAverage() {
  simResult = null;
  hud.setSimAverage(null);
  try {
    if (!simWorker) {
      simWorker = new Worker('js/sim-worker.js');
      simWorker.onmessage = function (e) {
        if (e.data.id !== simJob) return;
        simResult = e.data;
        hud.setSimAverage(e.data);
        if (panels.reviewOpen()) showReview();               // the review was waiting for these numbers
      };
      simWorker.onerror = function () { simWorker = null; };
    }
    const fight = fightOptions();
    simWorker.postMessage({ id: ++simJob, build: clone(character.build), race: character.raceKey, config: clone(config), targets: targets,
                            health: character.dummyHealth * targets, timed: fight.timed, seconds: fight.seconds });
  } catch (e) {
    simWorker = null;                                     // no workers here: the meter just keeps showing a dash
  }
}

// What you see when something happens. A spell that flies is drawn as a bolt: its number and the dummy's flinch
// wait until the bolt arrives (the damage itself is already counted, exactly as the rules say).
const boltsAt = [0, 0, 0, 0], deathWaiting = [false, false, false, false];
const spot = new THREE.Vector3(), staffAt = new THREE.Vector3();
function hitSound(e) { sound.play(e.school === 'fire' ? 'hitFire' : 'hitShadow'); if (e.crit) sound.play('crit'); }
function onCombatEvent(e) {
  const ti = e.target || combat.state.target, dummy = dummies[ti], anchor = anchors[ti];
  const fx = SPELL_FX[e.key], lands = e.type === 'hit' || e.type === 'miss';
  if (e.pet && lands && e.key !== 'pet:brand') pet.strike();

  // Sounds.
  if (e.type === 'cast') {
    if (e.key === 'lifeTap') sound.play('lifeTap');
    else if (e.castTime > 0 || e.channel) sound.play(combat.spells[e.key].school === 'fire' ? 'castFire' : 'castShadow');
  } else if (e.type === 'fail') sound.play('error');
  else if (e.type === 'tick') sound.play('tick');
  else if (e.type === 'apply') sound.play('apply');
  else if (e.type === 'proc') sound.play('proc');
  else if (e.type === 'pushback') sound.play('pushback');
  else if (e.type === 'death') sound.play('death');
  else if (e.type === 'miss' && !e.pet) sound.play('miss');
  else if (e.type === 'hit' && e.pet && !(fx && fx.bolt)) sound.play('pet');
  else if (e.type === 'hit' && !e.pet && !(fx && fx.bolt)) hitSound(e);
  if (lands && fx && fx.bolt) sound.play('bolt');

  // Where your staff's crystal is right now (life drawn from the target flows back to it).
  warlock.orbPosition(staffAt);
  const where = { at: dummy.chestAt, caster: staffAt, color: fx && fx.color, crit: !!e.crit && e.type === 'hit' };

  if (lands && fx && fx.bolt) {
    hud.event(e, anchor, true);
    if (e.pet) spot.set(pet.state.x, 0.85, pet.state.z); else spot.copy(staffAt);
    boltsAt[ti]++;
    effects.bolt(spot, dummy.chestAt, fx.bolt, function () {
      boltsAt[ti]--;
      if (e.type === 'hit') { warlock.orbPosition(staffAt); effects.play(fx.land, where); dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1); hitSound(e); }
      hud.floatFor(e, anchor);
      if (deathWaiting[ti] && boltsAt[ti] === 0) { deathWaiting[ti] = false; dummy.setDead(true); effects.play('death', where); }
    });
    return;
  }

  hud.event(e, anchor);
  if (e.type === 'hit') {
    dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1);
    if (fx && fx.land) effects.play(fx.land, where);
  } else if (e.type === 'tick') {
    dummy.hit(0.25);
    if (fx && fx.tick) effects.play(fx.tick, where);
  } else if (e.type === 'havoc') {
    dummy.hit(0.2);
    effects.play('brand', where);
  } else if (e.type === 'apply') {
    if (fx && fx.apply) effects.play(fx.apply, where);
  } else if (e.type === 'mana' && e.source === 'Life Tap') {
    effects.play('lifeTap', { caster: spot.set(controls.player.x, 1.2, controls.player.z) });
  } else if (e.type === 'death') {
    if (!e.timed) { if (boltsAt[ti] > 0) deathWaiting[ti] = true; else { dummy.setDead(true); effects.play('death', where); } }
    if (e.last) window.setTimeout(function () { if (combat.state.over) showReview(); }, 1200);   // the review opens by itself
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
    const what = build.sacrifice === 'imp' ? 'Imp' : build.sacrifice === 'succubus' ? 'Succubus' : build.sacrifice;
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
  const build = buildByKey(getSetting('build')) || startingBuild();
  const raceKey = WL.RACES[getSetting('race')] && WL.RACE_KEYS.indexOf(getSetting('race')) >= 0 ? getSetting('race') : 'human';
  const dummyHealth = getSetting('dummyHealth');
  targets = Math.max(1, Math.min(3, Number(getSetting('dummies')) || 1));
  config = buildConfig();
  const fight = fightOptions();
  combat = createCombat({ WL: WL, build: build, raceKey: raceKey, config: config, dummyHealth: dummyHealth, targets: targets,
                          timedDuration: fight.timed ? fight.seconds : 0, onEvent: onCombatEvent, petMeleeRange: PET_MELEE_RANGE });
  pet.setKind(build.pet === 'imp' ? 'imp' : build.pet ? 'succubus' : null);   // other demons borrow the Succubus's shape
  const bar = actionBarFor(build, combat.table, WL.RACES[raceKey], ACTION_CODES.length, getSetting('homes'));
  panels.setFight(fight);
  panels.hideReview();
  const ranges = bar.filter(function (k) { return combat.table[k]; }).map(function (k) { return combat.table[k].range; });
  character = {
    build: build, raceKey: raceKey, stats: combat.stats, table: combat.table, spells: combat.spells, bar: bar,
    racial: combat.racial(), dummyHealth: dummyHealth, executePct: config.fight.executePct, targets: targets,
    builds: allBuilds(), timed: fight.timed,
    maxRange: Math.max.apply(null, ranges.concat([0]))
  };
  character.standing = standingBuffs(build, combat.stats);
  hud.setCharacter(character);

  // The dummies in the room, and what you cannot walk through.
  colliders.length = fixedColliders;
  for (let i = 1; i <= 3; i++) {
    dummies[i].root.visible = i <= targets;
    if (i <= targets) colliders.push({ x: SPOTS[i].x, z: SPOTS[i].z, r: dummies[i].radius });
  }

  // Range rings around your target: your spell range (Destructive Reach included), Drain Life, the Succubus.
  if (rings) scene.remove(rings);
  const list = [{ yards: character.maxRange, color: 0xb9a8ff }];
  if (combat.table.drainLife && combat.table.drainLife.range !== character.maxRange) list.push({ yards: combat.table.drainLife.range, color: 0x58e0a8 });
  if (build.pet === 'succubus') list.push({ yards: PET_MELEE_RANGE, color: 0xff9d7a });
  rings = makeRangeRings(list);
  rings.visible = getSetting('rings');
  scene.add(rings);
  resetFight();
  askSimAverage();
}

function resetFight() {
  combat.reset();
  fightClock = 0;
  for (let i = 1; i <= 3; i++) { dummies[i].setDead(false); boltsAt[i] = 0; deathWaiting[i] = false; }
  pet.sendHome();
  effects.clear();
}

function press(key) {
  if (!key) return;
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

// Keys: Escape closes what is open; the rest is whatever the Keybinds panel says.
window.addEventListener('keydown', function (e) {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
  if (e.code === 'Escape' && (panels.reviewOpen() || hud.anyPanelOpen())) { if (panels.reviewOpen()) panels.hideReview(); else hud.closePanels(); return; }
  if (e.code === binds.cancel) { combat.cancel(); return; }
  if (e.code === binds.nextTarget) { e.preventDefault(); nextTarget(); return; }
  if (binds.petAttack && e.code === binds.petAttack) { e.preventDefault(); combat.update(fightClock, ctx); combat.petCommand('attack'); return; }
  if (binds.petFollow && e.code === binds.petFollow) { e.preventDefault(); combat.update(fightClock, ctx); combat.petCommand('follow'); return; }
  const slot = keyCodes.indexOf(e.code);
  if (slot < 0) return;
  e.preventDefault();
  press(character.bar[slot]);
});

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const savedKeys = getSetting('keys');
if (Array.isArray(savedKeys) && savedKeys.length === ACTION_CODES.length) keyCodes = savedKeys.slice();
readCustomBuild();
newCharacter();
hud.setKeys(keyCodes);
hud.setBinds(binds);
hud.setSound(sound.isOn());
panels.setImport(getSetting('buildCode'), getSetting('settingsCode'), [], false);
hud.setRings(getSetting('rings'));
hud.log('You enter the fel chamber.', 'proc');
hud.log('Build: ' + character.build.short + '.');
hud.log('Cast with the keys on the action bar. Hover a spell or a buff to read it.');

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

  controls.update(dt);
  const player = controls.player;
  ctx.moving = player.moving || player.height > 0;         // a jump counts as moving: it stops the spell you are casting
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
  combat.update(fightClock, ctx);

  const phase = combat.movePhase(), mustMove = !!(phase && phase.moving);
  if (mustMove && !wasMoving) sound.play('move');
  wasMoving = mustMove;

  const S = combat.state, casting = S.cast || S.channel;
  const school = casting ? combat.spells[casting.key].school : null;
  warlock.root.position.set(player.x, 0, player.z);
  warlock.root.rotation.y = player.yaw;
  warlock.update(dt, time, player.moving, player.height, school);
  for (let i = 1; i <= targets; i++) {
    dummies[i].update(dt, time);
    dummies[i].setSelected(i === S.target);
  }
  rings.position.set(SPOTS[S.target].x, 0, SPOTS[S.target].z);
  chamber.update(time);

  // Spell looks: motes at the staff while casting, marks on the dummies for what is on them, bolts and bursts.
  warlock.root.updateMatrixWorld();
  if (casting) {
    const fx = SPELL_FX[casting.key];
    effects.casting(warlock.orbPosition(from), fx ? fx.cast : 0xffffff, S.cast ? (S.t - S.cast.start) / (S.cast.end - S.cast.start) : 0.6, time, player, dt);
  } else effects.casting(null, 0, 0, time, player, dt);
  for (let i = 1; i <= targets; i++) {
    effects.setMarks(i, SPOTS[i], combat.alive(i) ? {
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

  for (let i = 1; i <= targets; i++) {
    const anchor = anchors[i];
    head.copy(dummies[i].headAt).project(camera);
    anchor.visible = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
    anchor.x = (head.x * 0.5 + 0.5) * window.innerWidth;
    anchor.y = (-head.y * 0.5 + 0.5) * window.innerHeight;
  }
  hud.render(combat, ctx, time, anchors);
}
renderer.setAnimationLoop(frame);

// For checks from the browser console.
window.FW = {
  player: controls.player, view: controls.view, scene: scene, camera: camera, renderer: renderer, frame: frame,
  speed: speed, watchSpeed: watchSpeed, press: press, setTarget: setTarget, nextTarget: nextTarget, clickScene: clickScene,
  pet: pet, ctx: ctx, effects: effects, dummies: dummies, panels: panels, sound: sound,
  get config() { return config; }, get simResult() { return simResult; },
  get combat() { return combat; }, get character() { return character; }, get rings() { return rings; }
};
