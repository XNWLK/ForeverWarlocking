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

const colliders = chamber.colliders.slice(), fixedColliders = colliders.length;
const controls = createControls(canvas, camera, { half: HALF, wallHeight: 20, colliders: colliders, onClick: clickScene });

// ---------- the character and the fight ----------
const config = JSON.parse(JSON.stringify(WL.DEFAULT_CONFIG));
let combat = null, character = null, rings = null, targets = 1;
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
  onPet: function (mode) { combat.update(fightClock, ctx); combat.petCommand(mode); }
});

// The DPS sim's average for this character on these dummies, worked out on another processor core.
let simWorker = null, simJob = 0;
function askSimAverage() {
  hud.setSimAverage(null);
  try {
    if (!simWorker) {
      simWorker = new Worker('js/sim-worker.js');
      simWorker.onmessage = function (e) { if (e.data.id === simJob) hud.setSimAverage(e.data); };
      simWorker.onerror = function () { simWorker = null; };
    }
    simWorker.postMessage({ id: ++simJob, build: character.build.key, race: character.raceKey, health: character.dummyHealth * targets, targets: targets });
  } catch (e) {
    simWorker = null;                                     // no workers here: the meter just keeps showing a dash
  }
}

// What you see when something happens. A spell that flies is drawn as a bolt: its number and the dummy's flinch
// wait until the bolt arrives (the damage itself is already counted, exactly as the rules say).
const boltsAt = [0, 0, 0, 0], deathWaiting = [false, false, false, false];
const spot = new THREE.Vector3();
function onCombatEvent(e) {
  const ti = e.target || combat.state.target, dummy = dummies[ti], anchor = anchors[ti];
  const fx = SPELL_FX[e.key], lands = e.type === 'hit' || e.type === 'miss';
  if (e.pet && lands && e.key !== 'pet:brand') pet.strike();

  if (lands && fx && fx.bolt) {
    hud.event(e, anchor, true);
    if (e.pet) spot.set(pet.state.x, 0.75, pet.state.z); else warlock.orbPosition(spot);
    boltsAt[ti]++;
    effects.bolt(spot, dummy.chestAt, fx.bolt, function () {
      boltsAt[ti]--;
      if (e.type === 'hit') { effects.burst(dummy.chestAt, fx.land); dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1); }
      hud.floatFor(e, anchor);
      if (deathWaiting[ti] && boltsAt[ti] === 0) { deathWaiting[ti] = false; dummy.setDead(true); }
    });
    return;
  }

  hud.event(e, anchor);
  if (e.type === 'hit') {
    dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1);
    if (fx && fx.land) effects.burst(dummy.chestAt, fx.land);
  } else if (e.type === 'tick') {
    dummy.hit(0.25);
    if (fx && fx.land && combat.spells[e.key] && combat.spells[e.key].kind === 'channel') effects.burst(dummy.chestAt, fx.land);
  } else if (e.type === 'havoc') {
    dummy.hit(0.2);
  } else if (e.type === 'apply') {
    if (fx && fx.land) effects.burst(dummy.chestAt, fx.land);
  } else if (e.type === 'mana' && e.source === 'Life Tap') {
    effects.burst(spot.set(controls.player.x, 1.2, controls.player.z), { color: 0xff4a5a, size: 1.3, ring: true });
  } else if (e.type === 'death') {
    if (boltsAt[ti] > 0) deathWaiting[ti] = true; else dummy.setDead(true);
  }
}

function buildByKey(key) { return WL.BUILDS.filter(function (b) { return b.key === key; })[0] || null; }

// The build you start with before you have picked one: the highest in the sim's DPS ranking.
function startingBuild() {
  const ranking = (window.FW_BUILD_ORDER && window.FW_BUILD_ORDER.order) || [];
  for (let i = 0; i < ranking.length; i++) {
    const build = buildByKey(ranking[i].key);
    if (build) return build;
  }
  return WL.BUILDS[0];
}

// Builds the character from the chosen build and race, sets up the dummies and starts a fresh fight.
function newCharacter() {
  const build = buildByKey(getSetting('build')) || startingBuild();
  const raceKey = WL.RACES[getSetting('race')] && WL.RACE_KEYS.indexOf(getSetting('race')) >= 0 ? getSetting('race') : 'human';
  const dummyHealth = getSetting('dummyHealth');
  targets = Math.max(1, Math.min(3, Number(getSetting('dummies')) || 1));
  combat = createCombat({ WL: WL, build: build, raceKey: raceKey, config: config, dummyHealth: dummyHealth, targets: targets,
                          onEvent: onCombatEvent, petMeleeRange: PET_MELEE_RANGE });
  pet.setKind(build.pet || null);
  const bar = actionBarFor(build, combat.table, WL.RACES[raceKey], ACTION_CODES.length);
  const ranges = bar.filter(function (k) { return combat.table[k]; }).map(function (k) { return combat.table[k].range; });
  character = {
    build: build, raceKey: raceKey, stats: combat.stats, table: combat.table, spells: combat.spells, bar: bar,
    racial: combat.racial(), dummyHealth: dummyHealth, executePct: config.fight.executePct, targets: targets,
    maxRange: Math.max.apply(null, ranges.concat([0]))
  };
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

// Action keys by their place on the keyboard; Escape stops a cast; Tab changes target.
window.addEventListener('keydown', function (e) {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target instanceof HTMLInputElement) return;
  if (e.code === 'Escape') { combat.cancel(); return; }
  if (e.code === 'Tab') { e.preventDefault(); nextTarget(); return; }
  const slot = ACTION_CODES.indexOf(e.code);
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

newCharacter();
hud.setRings(getSetting('rings'));
hud.log('You enter the fel chamber.', 'proc');
hud.log('Build: ' + character.build.short + '.');
hud.log('Cast with the keys on the action bar. The Keys button lists the rest.');

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
let areaPulse = 0;
function frame() {
  const elapsed = clock.getDelta(), dt = Math.min(0.05, elapsed), time = clock.elapsedTime;
  watchSpeed(elapsed, time);

  controls.update(dt);
  const player = controls.player;
  ctx.moving = player.moving;
  for (let i = 1; i <= 3; i++) ctx.distances[i] = Math.hypot(player.x - SPOTS[i].x, player.z - SPOTS[i].z);

  // The pet walks first, so the casting rules know whether it is in range of its dummy.
  const P = combat.pet;
  if (P) {
    const petCast = P.casting ? Math.min(1, (combat.state.t - P.casting.start) / (P.casting.end - P.casting.start)) : 0;
    pet.update(dt, time, player, P.mode, P.range, petCast, combat.state.over || !combat.alive(P.target), SPOTS[P.target]);
    ctx.petDistance = pet.state.distance;
  }

  // The fight's own clock stands still while the page is hidden (a long gap counts as a quarter second at most).
  fightClock += Math.min(0.25, elapsed);
  combat.update(fightClock, ctx);

  const S = combat.state, casting = S.cast || S.channel;
  const school = casting ? combat.spells[casting.key].school : null;
  warlock.root.position.set(player.x, 0, player.z);
  warlock.root.rotation.y = player.yaw;
  warlock.update(dt, time, player.moving, player.height, school);
  for (let i = 1; i <= targets; i++) {
    dummies[i].update(dt);
    dummies[i].setSelected(i === S.target);
  }
  rings.position.set(SPOTS[S.target].x, 0, SPOTS[S.target].z);
  chamber.update(time);

  // Spell looks: motes at the staff while casting, marks on the dummies for what is on them, bolts and bursts.
  warlock.root.updateMatrixWorld();
  if (casting) {
    const fx = SPELL_FX[casting.key];
    effects.casting(warlock.orbPosition(from), fx ? fx.cast : 0xffffff, S.cast ? (S.t - S.cast.start) / (S.cast.end - S.cast.start) : 0.6, time);
  } else effects.casting(null);
  for (let i = 1; i <= targets; i++) {
    effects.setMarks(i, SPOTS[i], combat.alive(i) ? {
      immolate: combat.dotLeft('immolate', i) > 0, corruption: combat.dotLeft('corruption', i) > 0, siphonLife: combat.dotLeft('siphonLife', i) > 0,
      baneOfAgony: combat.dotLeft('baneOfAgony', i) > 0, baneOfDoom: combat.dotLeft('baneOfDoom', i) > 0,
      coe: combat.debuff(i, 'coe'), havoc: combat.havocOn() === i
    } : {}, time);
  }
  effects.update(dt);

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
        areaPulse = 0.07;
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * area.radius, at = SPOTS[S.channel.target];
        effects.burst(rain.set(at.x + Math.cos(a) * r, 0.3, at.z + Math.sin(a) * r), { color: 0xff8a2a, size: 0.9, sparks: 3 });
      } else {                                             // Hellfire
        areaPulse = 0.45;
        effects.burst(rain.set(player.x, 0.2, player.z), { color: 0xff5a1a, size: area.radius * 0.72, ring: true, life: 0.5 });
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
  pet: pet, ctx: ctx, effects: effects, dummies: dummies,
  get combat() { return combat; }, get character() { return character; }, get rings() { return rings; }
};
