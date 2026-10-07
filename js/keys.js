// A key or mouse button, with the modifiers held, as one piece of text: 'KeyQ', 'Shift+Digit1', 'Ctrl+Alt+KeyE',
// 'Mouse4', 'Shift+Mouse3', 'Ctrl+WheelUp'. This is what the Keybinds panel stores and what a press is compared with.
// Keys are named by their place on the keyboard (e.code), so they are the same on every layout.

const MODIFIER = /^(Shift|Control|Alt|Meta|OS)(Left|Right)?$/;
export function isModifier(code) { return MODIFIER.test(code); }
function held(e) { return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : ''); }

// A key press. A modifier pressed by itself is just that key (so nothing is ever bound to "Shift+Shift").
export function keyCombo(e) { return isModifier(e.code) ? e.code : held(e) + e.code; }
// The middle button and the two thumb buttons. Left and right belong to the camera.
export function mouseCombo(e) {
  const name = e.button === 1 ? 'Mouse3' : e.button === 3 ? 'Mouse4' : e.button === 4 ? 'Mouse5' : null;
  return name ? held(e) + name : null;
}
// With Shift some browsers report wheel movement sideways.
export function wheelCombo(e) {
  const mods = held(e), turn = e.deltaY || e.deltaX;
  return turn ? mods + (turn < 0 ? 'WheelUp' : 'WheelDown') : null;
}

export function hasModifier(combo) { return !!combo && combo.indexOf('+') > 0; }
export function plainKey(combo) { return combo ? combo.slice(combo.lastIndexOf('+') + 1) : ''; }
export function isMouse(combo) { return /^(Mouse\d|Wheel(Up|Down))$/.test(plainKey(combo)); }

export const MOVE_BINDS = ['forward', 'back', 'turnLeft', 'turnRight', 'strafeLeft', 'strafeRight', 'jump'];
export const DEFAULT_BINDS = { forward: 'KeyW', back: 'KeyS', turnLeft: '', turnRight: '', strafeLeft: 'KeyA', strafeRight: 'KeyD',
  jump: 'Space', nextTarget: 'Tab', cancel: 'Escape', petAttack: '', petFollow: '', reset: '',
  zoomIn: 'Shift+WheelUp', zoomOut: 'Shift+WheelDown' };

// Upgrade old defaults once, preserving custom bindings and any spell already using a new default.
export function migrateControlBinds(saved, codes) {
  const legacy = { turnLeft: 'KeyA', turnRight: 'KeyD', strafeLeft: 'KeyQ', strafeRight: 'KeyE', zoomIn: 'WheelUp', zoomOut: 'WheelDown' };
  const binds = { ...DEFAULT_BINDS, ...legacy, ...saved };
  for (const [id, old] of Object.entries(legacy)) {
    const next = DEFAULT_BINDS[id];
    if (binds[id] !== old) continue;
    if (next && (codes.includes(next) || Object.keys(binds).some(k => k !== id && binds[k] === next))) continue;
    binds[id] = next;
  }
  return binds;
}

// A modified wheel turn still zooms when its plain wheel direction is assigned to the camera.
// The caller must try exact action bindings first, so a spell on Shift+wheel always wins.
export function zoomDirection(combo, binds, wheelFallback = false) {
  if (!combo) return 0;
  if (combo === binds.zoomIn) return -1;
  if (combo === binds.zoomOut) return 1;
  const plain = plainKey(combo);
  return wheelFallback && hasModifier(combo) && /^Wheel(Up|Down)$/.test(plain) ? zoomDirection(plain, binds) : 0;
}

// Share the existing swap behavior with camera keys, without moving a wheel/modifier binding onto walking.
export function assignBinding(codes, binds, id, code) {
  if (MOVE_BINDS.includes(id)) {
    if (isMouse(code)) return 'Walking and jumping take a plain key';
    code = plainKey(code);
  }
  if (/^Arrow/.test(plainKey(code))) return 'The arrow keys always move you';
  const old = typeof id === 'number' ? codes[id] : binds[id];
  if ((isMouse(old) || hasModifier(old)) && MOVE_BINDS.some(k => k !== id && binds[k] === code)) {
    return 'That key is used for movement. Change its movement binding first.';
  }
  codes.forEach((c, i) => { if (c === code && i !== id) codes[i] = old; });
  Object.keys(binds).forEach(k => { if (binds[k] === code && k !== id) binds[k] = old; });
  if (typeof id === 'number') codes[id] = code; else binds[id] = code;
  return null;
}

const NAMED = { Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
                AltLeft: 'Alt', AltRight: 'Alt', CapsLock: 'Caps', Backspace: 'Back' };
const MOUSE_LONG = { Mouse3: 'Middle mouse', Mouse4: 'Mouse 4', Mouse5: 'Mouse 5', WheelUp: 'Wheel up', WheelDown: 'Wheel down' };
const MOUSE_SHORT = { Mouse3: 'M3', Mouse4: 'M4', Mouse5: 'M5', WheelUp: 'WU', WheelDown: 'WD' };
// What to print for a key when the browser cannot tell us the letter on the keyboard in use.
function plainLabel(code) {
  const m = /^(?:Key|Digit)(.)$/.exec(code);
  if (m) return m[1];
  if (NAMED[code]) return NAMED[code];
  return code.replace('Numpad', 'N').replace('Arrow', '').replace('Bracket', '').replace('Backquote', '`').replace('Minus', '-').replace('Equal', '=').slice(0, 4);
}

// What to show for a combination. layout: the browser's map from key places to letters (or null); short: the few
// characters that fit on an action bar slot ("S-1", "CA-Q", "M4") instead of the full "Shift+1".
export function comboLabel(combo, layout, short) {
  if (!combo) return '';
  const parts = combo.split('+'), key = parts.pop();
  const letter = layout && layout.get(key);
  const name = short && MOUSE_SHORT[key] ? MOUSE_SHORT[key] : MOUSE_LONG[key] || (letter ? letter.toUpperCase() : plainLabel(key));
  if (!parts.length) return name;
  return short ? parts.map(function (p) { return p.charAt(0); }).join('') + '-' + name : parts.join('+') + '+' + name;
}
