// Walking and the camera, with the game's default keys:
// W/S forward and back, A/D turn, Q/E step sideways, Space jump, right mouse held = steer,
// left mouse held = look around, both mouse buttons = walk forward, wheel = zoom.
import * as THREE from 'three';

const RUN_SPEED = 7;          // yards per second
const BACK_SPEED = 4.5;
const TURN_SPEED = Math.PI;   // radians per second
const JUMP_SPEED = 7.96;
const GRAVITY = 19.29;
const MOUSE_TURN = 0.005;     // radians per pixel
const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.6;

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

// world: { half, wallHeight, colliders: [{ x, z, r }] }
export function createControls(canvas, camera, world) {
  const start = { x: 0, z: 24, yaw: 0 };
  const player = { x: start.x, z: start.z, yaw: start.yaw, height: 0, fall: 0, moving: false };
  const view = { offset: 0, pitch: 0.3, distance: 11 };   // offset = camera angle relative to the character's back
  const keys = new Set();
  const mouse = { left: false, right: false };

  function reset() {
    player.x = start.x; player.z = start.z; player.yaw = start.yaw; player.height = 0; player.fall = 0;
    view.offset = 0; view.pitch = 0.3; view.distance = 11;
  }

  // --- Keyboard -------------------------------------------------------------
  const USED = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  window.addEventListener('keydown', function (e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.target instanceof HTMLButtonElement && e.code === 'Space') e.target.blur();
    if (USED.indexOf(e.code) >= 0) { keys.add(e.code); e.preventDefault(); }
  });
  window.addEventListener('keyup', function (e) { keys.delete(e.code); });
  window.addEventListener('blur', function () { keys.clear(); mouse.left = mouse.right = false; showCursor(); });

  // --- Mouse ----------------------------------------------------------------
  function showCursor() {
    canvas.classList.toggle('steer', mouse.right);
    canvas.classList.toggle('look', mouse.left && !mouse.right);
  }
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('pointerdown', function (e) {
    if (e.button === 0) mouse.left = true;
    if (e.button === 2) {
      mouse.right = true;
      player.yaw = wrapAngle(player.yaw + view.offset);   // the character turns to where the camera looks
      view.offset = 0;
    }
    canvas.setPointerCapture(e.pointerId);
    showCursor();
  });
  function release(e) {
    if (e.button === 0) mouse.left = false;
    if (e.button === 2) mouse.right = false;
    if (!mouse.left && !mouse.right && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    showCursor();
  }
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', function () { mouse.left = mouse.right = false; showCursor(); });
  canvas.addEventListener('pointermove', function (e) {
    if (!mouse.left && !mouse.right) return;
    if (mouse.right) player.yaw = wrapAngle(player.yaw - e.movementX * MOUSE_TURN);
    else view.offset = wrapAngle(view.offset - e.movementX * MOUSE_TURN);
    view.pitch = Math.min(1.45, Math.max(-0.12, view.pitch + e.movementY * MOUSE_TURN));
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    view.distance = Math.min(30, Math.max(3, view.distance * (e.deltaY > 0 ? 1.12 : 0.89)));
  }, { passive: false });

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
    const left = down('KeyA', 'ArrowLeft'), right = down('KeyD', 'ArrowRight');
    let forward = down('KeyW', 'ArrowUp') - down('KeyS', 'ArrowDown');
    if (mouse.left && mouse.right) forward = 1;
    let sideways = (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0);
    if (mouse.right) sideways += right - left;            // while steering, A and D step sideways
    else player.yaw = wrapAngle(player.yaw + (left - right) * TURN_SPEED * dt);
    sideways = Math.max(-1, Math.min(1, sideways));

    player.moving = forward !== 0 || sideways !== 0;
    if (player.moving) {
      const length = Math.hypot(forward, sideways), speed = forward < 0 ? BACK_SPEED : RUN_SPEED;
      const f = forward / length * speed * dt, s = sideways / length * speed * dt;
      const sin = Math.sin(player.yaw), cos = Math.cos(player.yaw);
      player.x += -sin * f + cos * s;                     // forward is (-sin, -cos), right is (cos, -sin)
      player.z += -cos * f - sin * s;
      if (!mouse.left) view.offset *= Math.exp(-4 * dt);  // the camera swings back behind you
    }
    collide();

    if (keys.has('Space') && player.height === 0) player.fall = JUMP_SPEED;
    if (player.height > 0 || player.fall > 0) {
      player.height += player.fall * dt;
      player.fall -= GRAVITY * dt;
      if (player.height <= 0) { player.height = 0; player.fall = 0; }
    }

    // Camera: on a sphere around the character's head, pulled in when a wall, the floor or the ceiling is in the way.
    const yaw = player.yaw + view.offset, flat = Math.cos(view.pitch);
    target.set(player.x, EYE_HEIGHT + player.height, player.z);
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

  return { player: player, view: view, update: update, reset: reset };
}
