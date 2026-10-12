// A controller (gamepad): walk with the left stick, turn and look with the right one, cast with the four face
// buttons - alone, with the left trigger held, with the right trigger held, or with both, which gives the 15 slots
// of the action bar. The layout is fixed:
//   A B X Y          slots 1 to 4          LB            jump
//   LT + A B X Y     slots 5 to 8          RB            next dummy
//   RT + A B X Y     slots 9 to 12         D-pad up      pull timer        D-pad down   stop casting
//   LT + RT + A B X  slots 13 to 15        D-pad left    pet: follow       D-pad right  pet: attack
//   Start            reset the fight       Back / View   open or close the fight review
// Menus and windows still take the mouse. Nothing here knows the rules of the fight: it only says what was pressed.

const DEAD = 0.22;              // a stick this close to its middle counts as at rest
const TURN = 2.7, LOOK = 1.5;   // radians a second with the right stick pushed all the way
const FACE = ['A', 'B', 'X', 'Y'];

// What to press for each of the 15 slots, short enough to print on a slot.
export const PAD_LABELS = (function () {
  const out = [];
  ['', 'L·', 'R·', 'LR·'].forEach(function (mod) { FACE.forEach(function (f) { out.push(mod + f); }); });
  return out.slice(0, 15);
})();

function rest(v) { return Math.abs(v) < DEAD ? 0 : (v - Math.sign(v) * DEAD) / (1 - DEAD); }

// handlers: walk(x, y) - the left stick, x to the right and y forward, each -1..1; turn(yaw, pitch) - radians to
//           turn right and to look down by this picture; slot(index); jump(); nextTarget(); pull(); cancel();
//           pet('attack' | 'follow'); reset(); review(); inUse() - called whenever the controller is touched
export function createGamepad(handlers) {
  let before = [], walking = false;

  function pick() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected && pads[i].buttons.length >= 10) return pads[i];
    return null;
  }

  // Called every picture; dt = seconds since the last one.
  function poll(dt) {
    const pad = pick();
    if (!pad) {
      if (walking) { walking = false; handlers.walk(0, 0); }
      before = [];
      return;
    }
    const axes = pad.axes, down = pad.buttons.map(function (b) { return b.pressed || b.value > 0.5; });
    const x = rest(axes[0] || 0), y = rest(axes[1] || 0), rx = rest(axes[2] || 0), ry = rest(axes[3] || 0);
    let used = !!(x || y || rx || ry);
    if (x || y || walking) { walking = !!(x || y); handlers.walk(x, -y); }
    if (rx || ry) handlers.turn(rx * TURN * dt, ry * LOOK * dt);

    function hit(i) { return down[i] && !before[i]; }
    const shift = (down[6] ? 4 : 0) + (down[7] ? 8 : 0);
    for (let f = 0; f < 4; f++) if (hit(f)) { used = true; if (shift + f < 15) handlers.slot(shift + f); }
    if (hit(4)) { used = true; handlers.jump(); }
    if (hit(5)) { used = true; handlers.nextTarget(); }
    if (hit(8)) { used = true; handlers.review(); }
    if (hit(9)) { used = true; handlers.reset(); }
    if (hit(12)) { used = true; handlers.pull(); }
    if (hit(13)) { used = true; handlers.cancel(); }
    if (hit(14)) { used = true; handlers.pet('follow'); }
    if (hit(15)) { used = true; handlers.pet('attack'); }
    if (down[6] || down[7]) used = true;
    before = down;
    if (used) handlers.inUse();
  }

  return { poll: poll, connected: function () { return !!pick(); } };
}
