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
const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
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

const clock = new THREE.Clock();
function frame() {
  const dt = Math.min(0.05, clock.getDelta()), time = clock.elapsedTime;
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
window.FW = { player: controls.player, view: controls.view, rings: rings, scene: scene, camera: camera, renderer: renderer, frame: frame };
