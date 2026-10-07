// Walking and the camera, with the game's default keys:
// W/S forward and back, A/D turn, Q/E step sideways, Space jump, right mouse held = steer,
// left mouse held = look around, both mouse buttons = walk forward, wheel = zoom (Zoom in / Zoom out can have keys too).
// On a touch screen: one finger dragged over the scene turns you (as the right mouse button does), two fingers pinch
// to zoom, a tap is a click; walking comes from the stick (setStick) and jumping from a button (jump).
import * as THREE from 'three';

const RUN_SPEED = 7;          // yards per second
const BACK_SPEED = 4.5;
const TURN_SPEED = Math.PI;   // radians per second
const JUMP_SPEED = 7.96;
const GRAVITY = 19.29;
const MOUSE_TURN = 0.005;     // radians per pixel
const TOUCH_TURN = 0.007;
const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.6;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// world: { half, wallHeight, colliders: [{ x, z, r }], onClick(x, y) (optional),
//          binds: { forward, back, turnLeft, turnRight, strafeLeft, strafeRight, jump } - key codes, may change any time,
//          claimed(keyEvent) -> true when that key with its modifiers is bound to an action (optional),
//          onWheel(wheelEvent) -> true when the wheel was used for an action instead of zooming (optional) }
// The arrow keys always move you as well.
export function createControls(canvas, camera, world) {
  const start = { x: 0, z: 24, yaw: 0 };
  const player = { x: start.x, z: start.z, yaw: start.yaw, height: 0, fall: 0, moving: false };
  const view = { offset: 0, pitch: 0.3, distance: 11 };   // offset = camera angle relative to the character's back
  let eyeHeight = EYE_HEIGHT;                             // what the camera looks at: the head of the race you play
  const keys = new Set();
  const mouse = { left: false, right: false };
  const fingers = new Map();                              // fingers on the scene: pointer id -> { x, y }
  const stick = { x: 0, y: 0 };                           // the walking stick of a touch screen: x to the right, y forward
  let pinch = 0, jumpAsked = false;

  function reset() {
    player.x = start.x; player.z = start.z; player.yaw = start.yaw; player.height = 0; player.fall = 0;
    view.offset = 0; view.pitch = 0.3; view.distance = 11;
  }

  // --- Keyboard -------------------------------------------------------------
  const B = world.binds, ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  function isMoveKey(code) {
    return ARROWS.indexOf(code) >= 0 || code === B.forward || code === B.back || code === B.turnLeft || code === B.turnRight ||
      code === B.strafeLeft || code === B.strafeRight || code === B.jump;
  }
  window.addEventListener('keydown', function (e) {
    if (e.metaKey) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;   // typing must not walk the character
    if (world.claimed && world.claimed(e)) return;        // this key with the modifier held is bound to something else
    if (e.target instanceof HTMLButtonElement && e.code === 'Space') e.target.blur();
    if (isMoveKey(e.code)) { keys.add(e.code); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { keys.delete(e.code); });
  window.addEventListener('blur', function () { keys.clear(); mouse.left = mouse.right = false; showCursor(); });

  // --- Mouse ----------------------------------------------------------------
  function showCursor() {
    canvas.classList.toggle('steer', mouse.right);
    canvas.classList.toggle('look', mouse.left && !mouse.right);
  }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  let pressed = null;                                     // where and when the left button went down
  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch') {
      fingers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (fingers.size === 1) {
        pressed = { x: e.clientX, y: e.clientY, at: performance.now() };
        player.yaw = wrapAngle(player.yaw + view.offset); // you turn with the camera
        view.offset = 0;
      } else { pressed = null; pinch = 0; }
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* the finger is already gone */ }
      return;
    }
    if (e.button === 0) { mouse.left = true; pressed = { x: e.clientX, y: e.clientY, at: performance.now() }; }
    if (e.button === 2) {
      mouse.right = true;
      player.yaw = wrapAngle(player.yaw + view.offset);   // the character turns to where the camera looks
      view.offset = 0;
    }
    canvas.setPointerCapture(e.pointerId);
    showCursor();
  });
  function release(e) {
    if (e.pointerType === 'touch') {
      fingers.delete(e.pointerId);
      pinch = 0;
      if (pressed && !fingers.size && world.onClick && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 10 && performance.now() - pressed.at < 400) world.onClick(e.clientX, e.clientY);
      if (!fingers.size) pressed = null;
      return;
    }
    if (e.button === 0) {
      mouse.left = false;
      // A short press without dragging is a click on whatever is under the pointer (a dummy, to target it).
      if (pressed && world.onClick && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 5 && performance.now() - pressed.at < 400) world.onClick(e.clientX, e.clientY);
      pressed = null;
    }
    if (e.button === 2) mouse.right = false;
    if (!mouse.left && !mouse.right && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    showCursor();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', function (e) { fingers.delete(e.pointerId); pinch = 0; mouse.left = mouse.right = false; showCursor(); });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType === 'touch') {
      const f = fingers.get(e.pointerId);
      if (!f) return;
      const dx = e.clientX - f.x, dy = e.clientY - f.y;   // worked out here: touch screens do not always report the movement
      f.x = e.clientX; f.y = e.clientY;
      if (fingers.size === 1) {
        player.yaw = wrapAngle(player.yaw - dx * TOUCH_TURN);
        view.pitch = Math.min(1.45, Math.max(-0.12, view.pitch + dy * TOUCH_TURN));
      } else if (fingers.size === 2) {
        const both = Array.from(fingers.values()), apart = Math.hypot(both[0].x - both[1].x, both[0].y - both[1].y);
        if (pinch > 0 && apart > 0) view.distance = Math.min(30, Math.max(3, view.distance * pinch / apart));
        pinch = apart;
      }
      return;
    }
    if (!mouse.left && !mouse.right) return;
    if (mouse.right) player.yaw = wrapAngle(player.yaw - e.movementX * MOUSE_TURN);
    else view.offset = wrapAngle(view.offset - e.movementX * MOUSE_TURN);
    view.pitch = Math.min(1.45, Math.max(-0.12, view.pitch + e.movementY * MOUSE_TURN));
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (world.onWheel && world.onWheel(e)) return;        // the wheel with a modifier held may be bound to an action
    zoom(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });
  // One step closer (-1) or further away (1): the wheel, or the Zoom in / Zoom out keys.
  function zoom(direction) {
    if (direction) view.distance = Math.min(30, Math.max(3, view.distance * (direction > 0 ? 1.12 : 0.89)));
  }

  // --- Each frame -----------------------------------------------------------
  function down(a, b) { return keys.has(a) || keys.has(b) ? 1 : 0; }

  function collide() {
    const limit = world.half - PLAYER_RADIUS - 0.4;
    player.x = Math.min(limit, Math.max(-limit, player.x));
    player.z = Math.min(limit, Math.max(-limit, player.z));
    world.colliders.forEach(function (c) {
      const dx = player.x - c.x, dz = player.z - c.z, min = c.r + PLAYER_RADIUS;
      const d = Math.hypot(dx, dz);
      if (d >= min) return;
      if (d < 0.0001) { player.z = c.z + min; return; }
      player.x = c.x + dx / d * min;
      player.z = c.z + dz / d * min;
    });
  }

  const target = new THREE.Vector3(), dir = new THREE.Vector3();

  function update(dt) {
    const left = down(B.turnLeft, 'ArrowLeft'), right = down(B.turnRight, 'ArrowRight');
    let forward = down(B.forward, 'ArrowUp') - down(B.back, 'ArrowDown');
    if (mouse.left && mouse.right) forward = 1;
    let sideways = (keys.has(B.strafeRight) ? 1 : 0) - (keys.has(B.strafeLeft) ? 1 : 0);
    if (mouse.right) sideways += right - left;            // while steering, A and D step sideways
    else player.yaw = wrapAngle(player.yaw + (left - right) * TURN_SPEED * dt);
    forward += stick.y; sideways += stick.x;
    forward = Math.max(-1, Math.min(1, forward));
    sideways = Math.max(-1, Math.min(1, sideways));

    player.moving = forward !== 0 || sideways !== 0;
    if (player.moving) {
      const length = Math.hypot(forward, sideways), speed = forward / length < -0.5 ? BACK_SPEED : RUN_SPEED;   // mostly backward is slower
      const f = forward / length * speed * dt, s = sideways / length * speed * dt;
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      player.x += -sin * f + cos * s;                     // forward is (-sin, -cos), right is (cos, -sin)
      player.z += -cos * f - sin * s;
      if (!mouse.left) view.offset *= Math.exp(-4 * dt);  // the camera swings back behind you
    }
    collide();

    if ((keys.has(B.jump) || jumpAsked) && player.height === 0) player.fall = JUMP_SPEED;
    jumpAsked = false;
    if (player.height > 0 || player.fall > 0) {
      player.height += player.fall * dt;
      player.fall -= GRAVITY * dt;
      if (player.height <= 0) { player.height = 0; player.fall = 0; }
    }

    // Camera: on a sphere around the character's head, pulled in when a wall, the floor or the ceiling is in the way.
    const yaw = player.yaw + view.offset, flat = Math.cos(view.pitch);
    target.set(player.x, eyeHeight + player.height, player.z);
    dir.set(Math.sin(yaw) * flat, Math.sin(view.pitch), Math.cos(yaw) * flat);
    let distance = view.distance;
    const edge = world.half - 0.6;
    if (dir.x > 0) distance = Math.min(distance, (edge - target.x) / dir.x);
    if (dir.x < 0) distance = Math.min(distance, (-edge - target.x) / dir.x);
    if (dir.z > 0) distance = Math.min(distance, (edge - target.z) / dir.z);
    if (dir.z < 0) distance = Math.min(distance, (-edge - target.z) / dir.z);
    if (dir.y > 0) distance = Math.min(distance, (world.wallHeight - 0.6 - target.y) / dir.y);
    if (dir.y < 0) distance = Math.min(distance, (0.3 - target.y) / dir.y);
    camera.position.copy(target).addScaledVector(dir, Math.max(0.5, distance));
    camera.lookAt(target);
  }

  return {
    player: player, view: view, update: update, reset: reset, zoom: zoom,
    setEyeHeight: function (height) { if (height > 0) eyeHeight = Math.max(0.6, Math.min(2.6, height)); },
    setStick: function (x, y) { stick.x = x; stick.y = y; },
    jump: function () { jumpAsked = true; }
  };
}
