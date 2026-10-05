// Forever Warlocking - step 1: the chamber you can walk in. No spells yet.
import * as THREE from 'three';
import { buildChamber, makeRangeRings, HALF } from './chamber.js';
import { makeWarlock, makeDummy } from './models.js';
import { createControls } from './controls.js';
import { createHud } from './hud.js';

const WL = window.WL;

// The character: for now always the first ready build as a Human. The picker comes with casting.
const config = JSON.parse(JSON.stringify(WL.DEFAULT_CONFIG));
const build = WL.BUILDS[0], raceKey = 'human';
const stats = WL.computeStats(build, raceKey, config);
const spells = WL.buildSpellTable(build, stats, config);

// Ranges in yards. Spells come from the spell table; the Succubus's melee reach is this project's own number.
const SPELL_RANGE = spells.shadowBolt.range;
const DRAIN_RANGE = spells.drainLife.range;
const PET_MELEE_RANGE = 5;

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

const rings = makeRangeRings([
  { yards: SPELL_RANGE, color: 0xb9a8ff },
  { yards: DRAIN_RANGE, color: 0x58e0a8 },
  { yards: PET_MELEE_RANGE, color: 0xff9d7a }
]);
scene.add(rings);

const colliders = chamber.colliders.concat([{ x: 0, z: 0, r: dummy.radius }]);
const controls = createControls(canvas, camera, { half: HALF, wallHeight: 20, colliders: colliders });

const hud = createHud({
  portrait: WL.ICONS['race_' + raceKey],
  raceName: WL.RACES[raceKey].name,
  pet: build.pet,
  petKind: build.pet === 'imp' ? 'Imp' : 'Succubus',
  health: Math.round(stats.maxHealth),
  mana: Math.round(stats.maxMana)
});
hud.onRings(function (on) { rings.visible = on; });
hud.onReset(function () { controls.reset(); hud.log('Back at the start.'); });
hud.log('You enter the fel chamber.', true);
hud.log('Build: ' + build.short + '.');
hud.log('Walk with W A S D. The Keys button lists the rest.');

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// A safeguard for weak graphics chips: when the picture stays under about 45 a second, draw it with less detail
// (fewer pixels, stretched to the window). If that does not make it faster, detail was not the problem: put it
// back and stop trying. Fast machines never notice any of this.
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

const clock = new THREE.Clock();
function frame() {
  const elapsed = clock.getDelta(), dt = Math.min(0.05, elapsed), time = clock.elapsedTime;
  watchSpeed(elapsed, time);
  controls.update(dt);
  const player = controls.player;
  warlock.root.position.set(player.x, 0, player.z);
  warlock.root.rotation.y = player.yaw;
  warlock.update(dt, time, player.moving, player.height);
  chamber.update(time);
  const distance = Math.hypot(player.x, player.z);
  hud.setDistance(distance, distance <= SPELL_RANGE);
  renderer.render(scene, camera);
}
renderer.setAnimationLoop(frame);

// For checks from the browser console.
window.FW = { player: controls.player, view: controls.view, rings: rings, scene: scene, camera: camera, renderer: renderer, frame: frame, speed: speed, watchSpeed: watchSpeed };
