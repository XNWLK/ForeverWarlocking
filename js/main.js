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

// ---------- the scene ----------
const canvas = document.getElementById('scene');
// 'high-performance' asks a laptop with two graphics chips for the strong one.
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
const FULL_DETAIL = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(FULL_DETAIL);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

const chamber = buildChamber(scene);
const dummy = makeDummy();
scene.add(dummy.root);
const warlock = makeWarlock();
scene.add(warlock.root);
const beam = makeBeam();
scene.add(beam.mesh);
const pet = createPet(scene);
const effects = createEffects(scene);

const colliders = chamber.colliders.concat([{ x: 0, z: 0, r: dummy.radius }]);
const controls = createControls(canvas, camera, { half: HALF, wallHeight: 20, colliders: colliders });

// ---------- the character and the fight ----------
const config = JSON.parse(JSON.stringify(WL.DEFAULT_CONFIG));
let combat = null, character = null, rings = null;
const ctx = { distance: 0, moving: false, petDistance: 0 };   // what the casting rules need to know about you and the pet
const anchor = { x: 0, y: 0, visible: false };            // where the dummy's head is on the screen
let fightClock = 0;                                       // seconds since the last reset

const hud = createHud(WL, {
  onPress: function (key) { press(key); },
  onBuild: function (key) { setSetting('build', key); newCharacter(); hud.log('Build: ' + character.build.short + '.', 'proc'); },
  onRace: function (key) { setSetting('race', key); newCharacter(); hud.log('Race: ' + WL.RACES[key].name + '.', 'proc'); },
  onDummyHealth: function (health) { setSetting('dummyHealth', health); newCharacter(); hud.log('The dummy now has ' + health.toLocaleString('en-US') + ' health.'); },
  onRings: function (on) { setSetting('rings', on); rings.visible = on; },
  onReset: function () { resetFight(); hud.log('Fight reset.'); },
  onPet: function (mode) { combat.update(fightClock, ctx); combat.petCommand(mode); }
});

// The DPS sim's average for this character on this dummy, worked out on another processor core.
let simWorker = null, simJob = 0;
function askSimAverage() {
  hud.setSimAverage(null);
  try {
    if (!simWorker) {
      simWorker = new Worker('js/sim-worker.js');
      simWorker.onmessage = function (e) { if (e.data.id === simJob) hud.setSimAverage(e.data); };
      simWorker.onerror = function () { simWorker = null; };
    }
    simWorker.postMessage({ id: ++simJob, build: character.build.key, race: character.raceKey, health: character.dummyHealth });
  } catch (e) {
    simWorker = null;                                     // no workers here: the meter just keeps showing a dash
  }
}

// What you see when something happens. A spell that flies is drawn as a bolt: its number and the dummy's flinch
// wait until the bolt arrives (the damage itself is already counted, exactly as the rules say).
let boltsInFlight = 0, deathWaiting = false;
const spot = new THREE.Vector3();
function onCombatEvent(e) {
  const fx = SPELL_FX[e.key], lands = e.type === 'hit' || e.type === 'miss';
  if (e.pet && lands && e.key !== 'pet:brand') pet.strike();

  if (lands && fx && fx.bolt) {
    hud.event(e, anchor, true);
    if (e.pet) spot.set(pet.state.x, 0.75, pet.state.z); else warlock.orbPosition(spot);
    boltsInFlight++;
    effects.bolt(spot, dummy.chest, fx.bolt, function () {
      boltsInFlight--;
      if (e.type === 'hit') { effects.burst(dummy.chest, fx.land); dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1); }
      hud.floatFor(e, anchor);
      if (deathWaiting && boltsInFlight === 0) { deathWaiting = false; dummy.setDead(true); }
    });
    return;
  }

  hud.event(e, anchor);
  if (e.type === 'hit') {
    dummy.hit(e.pet ? 0.5 : e.crit ? 1.6 : 1);
    if (fx && fx.land) effects.burst(dummy.chest, fx.land);
  } else if (e.type === 'tick') {
    dummy.hit(0.25);
    if (fx && fx.land && combat.spells[e.key] && combat.spells[e.key].kind === 'channel') effects.burst(dummy.chest, fx.land);
  } else if (e.type === 'apply') {
    if (fx && fx.land) effects.burst(dummy.chest, fx.land);
  } else if (e.type === 'mana' && e.source === 'Life Tap') {
    effects.burst(spot.set(controls.player.x, 1.2, controls.player.z), { color: 0xff4a5a, size: 1.3, ring: true });
  } else if (e.type === 'death') {
    if (boltsInFlight > 0) deathWaiting = true; else dummy.setDead(true);
  }
}

// Builds the character from the chosen build and race and starts a fresh fight.
function newCharacter() {
  const build = WL.BUILDS.filter(function (b) { return b.key === getSetting('build'); })[0] || WL.BUILDS[0];
  const raceKey = WL.RACES[getSetting('race')] && WL.RACE_KEYS.indexOf(getSetting('race')) >= 0 ? getSetting('race') : 'human';
  const dummyHealth = getSetting('dummyHealth');
  combat = createCombat({ WL: WL, build: build, raceKey: raceKey, config: config, dummyHealth: dummyHealth, onEvent: onCombatEvent, petMeleeRange: PET_MELEE_RANGE });
  pet.setKind(build.pet || null);
  const bar = actionBarFor(build, combat.table, WL.RACES[raceKey], ACTION_CODES.length);
  const ranges = bar.filter(function (k) { return combat.table[k]; }).map(function (k) { return combat.table[k].range; });
  character = {
    build: build, raceKey: raceKey, stats: combat.stats, table: combat.table, spells: combat.spells, bar: bar,
    racial: combat.racial(), dummyHealth: dummyHealth, executePct: config.fight.executePct,
    maxRange: Math.max.apply(null, ranges.concat([0]))
  };
  hud.setCharacter(character);

  // Range rings follow the character: its spell range (Destructive Reach included), Drain Life, the Succubus.
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
  dummy.setDead(false);
  pet.sendHome();
  effects.clear();
  boltsInFlight = 0;
  deathWaiting = false;
}

function press(key) {
  if (!key) return;
  combat.update(fightClock, ctx);
  combat.press(key, ctx);
}

// Action keys by their place on the keyboard; Escape stops a cast.
window.addEventListener('keydown', function (e) {
  if (e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.target instanceof HTMLInputElement) return;
  if (e.code === 'Escape') { combat.cancel(); return; }
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
const from = new THREE.Vector3(), to = new THREE.Vector3(), head = new THREE.Vector3();
function frame() {
  const elapsed = clock.getDelta(), dt = Math.min(0.05, elapsed), time = clock.elapsedTime;
  watchSpeed(elapsed, time);

  controls.update(dt);
  const player = controls.player;
  ctx.distance = Math.hypot(player.x, player.z);
  ctx.moving = player.moving;

  // The pet walks first, so the casting rules know whether it is in range.
  const P = combat.pet;
  if (P) {
    const petCast = P.casting ? Math.min(1, (combat.state.t - P.casting.start) / (P.casting.end - P.casting.start)) : 0;
    pet.update(dt, time, player, P.mode, P.range, petCast, combat.state.over);
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
  dummy.update(dt);
  chamber.update(time);

  // Spell looks: motes at the staff while casting, marks on the dummy for what is on it, bolts and bursts.
  warlock.root.updateMatrixWorld();
  if (casting) {
    const fx = SPELL_FX[casting.key];
    effects.casting(warlock.orbPosition(from), fx ? fx.cast : 0xffffff, S.cast ? (S.t - S.cast.start) / (S.cast.end - S.cast.start) : 0.6, time);
  } else effects.casting(null);
  effects.setMarks(S.over ? {} : {
    immolate: combat.dotLeft('immolate') > 0, corruption: combat.dotLeft('corruption') > 0, siphonLife: combat.dotLeft('siphonLife') > 0,
    baneOfAgony: combat.dotLeft('baneOfAgony') > 0, baneOfDoom: combat.dotLeft('baneOfDoom') > 0, coe: combat.buff('coe')
  }, time);
  effects.update(dt);

  if (S.channel) {
    beam.material.color.set(S.channel.key === 'wrack' ? 0xb07cff : 0x8dff9a);
    beam.set(warlock.orbPosition(from), to.copy(dummy.chest), time);
  } else beam.hide();

  renderer.render(scene, camera);

  head.copy(dummy.head).project(camera);
  anchor.visible = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
  anchor.x = (head.x * 0.5 + 0.5) * window.innerWidth;
  anchor.y = (-head.y * 0.5 + 0.5) * window.innerHeight;
  hud.render(combat, ctx, time);
}
renderer.setAnimationLoop(frame);

// For checks from the browser console.
window.FW = {
  player: controls.player, view: controls.view, scene: scene, camera: camera, renderer: renderer, frame: frame,
  speed: speed, watchSpeed: watchSpeed, press: press,
  pet: pet, ctx: ctx, effects: effects,
  get combat() { return combat; }, get character() { return character; }, get rings() { return rings; }
};
