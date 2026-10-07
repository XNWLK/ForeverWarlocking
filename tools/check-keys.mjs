import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { wheelCombo, zoomDirection, assignBinding, comboLabel, DEFAULT_BINDS, migrateControlBinds } from '../js/keys.js';

let checks = 0;
function check(name, fn) { fn(); checks++; console.log('OK: ' + name); }
const defaults = () => ({ ...DEFAULT_BINDS, zoomIn: 'WheelUp', zoomOut: 'WheelDown' });

check('new defaults strafe on A/D, leave turn keys unbound and require Shift to zoom', () => {
  assert.equal(DEFAULT_BINDS.strafeLeft, 'KeyA'); assert.equal(DEFAULT_BINDS.strafeRight, 'KeyD');
  assert.equal(DEFAULT_BINDS.turnLeft, ''); assert.equal(DEFAULT_BINDS.turnRight, '');
  assert.equal(zoomDirection('Shift+WheelUp', DEFAULT_BINDS, true), -1);
  assert.equal(zoomDirection('Shift+WheelDown', DEFAULT_BINDS, true), 1);
  assert.equal(zoomDirection('WheelUp', DEFAULT_BINDS, true), 0);
  assert.equal(zoomDirection('WheelDown', DEFAULT_BINDS, true), 0);
});
check('existing unchanged control defaults upgrade without touching spell bindings', () => {
  const codes = ['KeyQ', 'KeyE', 'Digit1'], copy = codes.slice();
  assert.deepEqual(migrateControlBinds({}, codes), DEFAULT_BINDS);
  assert.deepEqual(codes, copy);
});
check('upgrading defaults preserves custom controls and avoids newly occupied keys', () => {
  const custom = { strafeLeft: 'Digit7', strafeRight: 'Digit6', zoomIn: 'KeyZ', petAttack: 'Mouse4' };
  const binds = migrateControlBinds(custom, ['KeyQ']);
  for (const key of Object.keys(custom)) assert.equal(binds[key], custom[key]);
  assert.equal(binds.turnLeft, ''); assert.equal(binds.turnRight, '');
  const conflicts = migrateControlBinds({}, ['KeyA', 'Shift+WheelUp']);
  assert.equal(conflicts.strafeLeft, 'KeyQ'); assert.equal(conflicts.zoomIn, 'WheelUp');
});

check('wheel capture includes plain, modified and sideways Shift scrolling', () => {
  assert.equal(wheelCombo({ deltaY: -100 }), 'WheelUp');
  assert.equal(wheelCombo({ deltaY: 100 }), 'WheelDown');
  assert.equal(wheelCombo({ deltaY: 0, deltaX: -100, shiftKey: true }), 'Shift+WheelUp');
  assert.equal(wheelCombo({ deltaY: 100, ctrlKey: true, altKey: true }), 'Ctrl+Alt+WheelDown');
  assert.equal(wheelCombo({ deltaY: 0, deltaX: 0 }), null);
  assert.equal(comboLabel('Shift+WheelUp'), 'Shift+Wheel up');
});
check('a custom plain-wheel camera binding still accepts unassigned modifiers', () => {
  const binds = defaults();
  assert.equal(zoomDirection('WheelUp', binds), -1);
  assert.equal(zoomDirection('WheelDown', binds), 1);
  assert.equal(zoomDirection('Shift+WheelUp', binds, true), -1);
  assert.equal(zoomDirection('Shift+WheelDown', binds, true), 1);
  assert.equal(zoomDirection('Alt+WheelUp', binds, true), -1);
});
check('explicit Shift-only and keyboard zoom do not retain hidden wheel bindings', () => {
  const binds = { zoomIn: 'Shift+WheelUp', zoomOut: 'KeyZ' };
  assert.equal(zoomDirection('Shift+WheelUp', binds), -1);
  assert.equal(zoomDirection('WheelUp', binds, true), 0);
  assert.equal(zoomDirection('Ctrl+WheelUp', binds, true), 0);
  assert.equal(zoomDirection('WheelDown', binds, true), 0);
  assert.equal(zoomDirection('KeyZ', binds), 1);
  assert.equal(zoomDirection(null, binds, true), 0);
});
check('camera and spell bindings swap without duplicate actions', () => {
  const codes = ['Digit1', 'Shift+WheelUp'], binds = defaults();
  assert.equal(assignBinding(codes, binds, 'zoomIn', 'Shift+WheelUp'), null);
  assert.deepEqual(codes, ['Digit1', 'WheelUp']);
  assert.equal(binds.zoomIn, 'Shift+WheelUp');
  assert.equal(assignBinding(codes, binds, 0, 'Shift+WheelUp'), null);
  assert.equal(binds.zoomIn, 'Digit1');
  assert.equal(codes[0], 'Shift+WheelUp');
});
check('camera zoom directions can trade places', () => {
  const binds = defaults();
  assert.equal(assignBinding([], binds, 'zoomIn', 'WheelDown'), null);
  assert.equal(binds.zoomIn, 'WheelDown'); assert.equal(binds.zoomOut, 'WheelUp');
});
check('movement conflicts reject wheel/modifier swaps without changing any binding', () => {
  for (const old of ['WheelUp', 'Shift+KeyZ']) {
    const binds = { ...defaults(), zoomIn: old }, before = JSON.stringify(binds), codes = ['Digit1'];
    assert.match(assignBinding(codes, binds, 'zoomIn', 'KeyW'), /movement/);
    assert.equal(JSON.stringify(binds), before); assert.deepEqual(codes, ['Digit1']);
  }
  assert.match(assignBinding([], defaults(), 'forward', 'WheelUp'), /plain key/);
  assert.match(assignBinding([], defaults(), 'zoomIn', 'Shift+ArrowUp'), /arrow keys/);
});

// Exercise the real camera's event handler without needing WebGL or the external Three.js download.
const source = fs.readFileSync(new URL('../js/controls.js', import.meta.url), 'utf8')
  .replace("import * as THREE from 'three';", '').replace('export function createControls', 'function createControls');
const keyListeners = {};
const createControls = vm.runInNewContext(source + '\ncreateControls;', {
  THREE: { Vector3: class { set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } } },
  HTMLInputElement: class {}, HTMLTextAreaElement: class {}, HTMLButtonElement: class {},
  window: { addEventListener(k, fn) { keyListeners[k] = fn; } }
});
function camera(binds = defaults(), codes = []) {
  const listeners = {}, actions = [], canvas = { addEventListener(k, fn) { listeners[k] = fn; } };
  let blocked = false;
  const cameraTarget = {};
  const controls = createControls(canvas, { position: { copy() { return this; }, addScaledVector() {} }, lookAt(v) { Object.assign(cameraTarget, v); } }, {
    half: 40, wallHeight: 20, colliders: [], binds, blocked: () => blocked,
    onWheel(e) {
      const combo = wheelCombo(e), direction = zoomDirection(combo, binds);
      if (direction) controls.zoom(direction);
      else if (codes.includes(combo)) actions.push(combo);
      else controls.zoom(zoomDirection(combo, binds, true));
    }
  });
  return { controls, actions, cameraTarget, block() { blocked = true; }, wheel(e) { listeners.wheel({ preventDefault() {}, ...e }); },
    key(type, code) { keyListeners[type]({ target: {}, code, preventDefault() {} }); } };
}
check('A and D move sideways without turning or needing the right mouse button', () => {
  for (const [key, direction] of [['KeyA', -1], ['KeyD', 1]]) {
    const c = camera({ ...DEFAULT_BINDS });
    c.key('keydown', key); c.controls.update(0.1);
    assert.ok(c.controls.player.x * direction > 0);
    assert.equal(c.controls.player.z, 24); assert.equal(c.controls.player.yaw, 0);
    c.key('keyup', key); const x = c.controls.player.x; c.controls.update(0.1);
    assert.equal(c.controls.player.x, x);
  }
});
check('plain wheel leaves the camera still with the new defaults', () => {
  const c = camera({ ...DEFAULT_BINDS });
  c.wheel({ deltaY: -100 }); c.wheel({ deltaY: 100 }); assert.equal(c.controls.view.distance, 11);
  c.wheel({ deltaY: -100, shiftKey: true }); assert.ok(c.controls.view.distance < 11);
});
check('Shift horizontal wheel changes actual camera distance in the correct direction', () => {
  const c = camera(); c.wheel({ deltaY: 0, deltaX: -100, shiftKey: true });
  assert.ok(c.controls.view.distance < 11);
  const near = c.controls.view.distance;
  c.wheel({ deltaY: 0, deltaX: 100, shiftKey: true }); assert.ok(c.controls.view.distance > near);
});
check('an exact spell wheel binding does not move the camera', () => {
  const c = camera(defaults(), ['Shift+WheelUp']);
  c.wheel({ deltaY: -100, shiftKey: true });
  assert.equal(c.controls.view.distance, 11); assert.deepEqual(c.actions, ['Shift+WheelUp']);
  c.wheel({ deltaY: -100 }); assert.ok(c.controls.view.distance < 11);
});
check('camera wheel respects a modal and zero-delta events', () => {
  const c = camera(); c.wheel({ deltaY: 0, deltaX: 0 }); assert.equal(c.controls.view.distance, 11);
  c.block(); c.wheel({ deltaY: -100 }); assert.equal(c.controls.view.distance, 11);
});
check('all zoom input routes keep the existing camera distance limits', () => {
  const c = camera();
  for (let i = 0; i < 100; i++) c.controls.zoom(-1);
  assert.equal(c.controls.view.distance, 3);
  for (let i = 0; i < 100; i++) c.controls.zoom(1);
  assert.equal(c.controls.view.distance, 30);
});
check('race camera height follows the body without changing movement, zoom or jump height', () => {
  const c = camera(), player = c.controls.player;
  for (const height of [0.935, 1.7, 1.989]) {
    c.controls.setEyeHeight(height); c.controls.update(0);
    assert.equal(c.cameraTarget.y, height);
    assert.equal(player.x, 0); assert.equal(player.z, 24); assert.equal(c.controls.view.distance, 11);
    player.height = 0.75; c.controls.update(0); assert.equal(c.cameraTarget.y, height + 0.75);
    c.controls.reset(); c.controls.update(0); assert.equal(c.cameraTarget.y, height);
  }
});
console.log(checks + ' camera and keybind checks passed.');
