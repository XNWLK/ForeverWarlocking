// A key or mouse button, with the modifiers held, as one piece of text: 'KeyQ', 'Shift+Digit1', 'Ctrl+Alt+KeyE',
// 'Mouse4', 'Shift+Mouse3', 'WheelUp', 'Ctrl+WheelDown', 'WheelLeft'. This is what the Keybinds panel stores and what
// a press is compared with.
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
// The wheel, with or without a modifier; a wheel that tilts (or a sideways swipe) is WheelLeft / WheelRight. With
// Shift held some browsers report the plain wheel as sideways, so with Shift sideways counts as up and down.
// Whatever the plain wheel is not bound to, it zooms (js/controls.js).
export function wheelCombo(e) {
  const mods = held(e);
  if (e.deltaY) return mods + (e.deltaY < 0 ? 'WheelUp' : 'WheelDown');
  if (!e.deltaX) return null;
  if (e.shiftKey) return mods + (e.deltaX < 0 ? 'WheelUp' : 'WheelDown');
  return mods + (e.deltaX < 0 ? 'WheelLeft' : 'WheelRight');
}
export function isWheel(combo) { return /^Wheel/.test(plainKey(combo)); }

export function hasModifier(combo) { return !!combo && combo.indexOf('+') > 0; }
export function plainKey(combo) { return combo ? combo.slice(combo.lastIndexOf('+') + 1) : ''; }
export function isMouse(combo) { return /^(Mouse\d|Wheel(Up|Down|Left|Right))$/.test(plainKey(combo)); }

const NAMED = { Space: 'Space', Escape: 'Esc', Tab: 'Tab', Enter: 'Enter', ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl',
                AltLeft: 'Alt', AltRight: 'Alt', CapsLock: 'Caps', Backspace: 'Back' };
const MOUSE_LONG = { Mouse3: 'Middle mouse', Mouse4: 'Mouse 4', Mouse5: 'Mouse 5', WheelUp: 'Wheel up', WheelDown: 'Wheel down', WheelLeft: 'Wheel left', WheelRight: 'Wheel right' };
const MOUSE_SHORT = { Mouse3: 'M3', Mouse4: 'M4', Mouse5: 'M5', WheelUp: 'WU', WheelDown: 'WD', WheelLeft: 'WL', WheelRight: 'WR' };
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
