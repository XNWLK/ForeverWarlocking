// Touch screens (phones, and tablets without a mouse): a stick to walk, round buttons for what the keyboard did, and
// a menu that holds the bars that sit at the top and on the right of the desktop screen. The scene itself takes the
// fingers directly (js/controls.js): drag to turn, pinch to zoom, tap a dummy to target it.
// The layout is in css/game.css under ".touch"; this file switches it on and wires the touch-only parts.

function byId(id) { return document.getElementById(id); }

// A touch screen is the main way in: a phone or tablet. A laptop with a touch screen and a mouse stays on the desktop
// layout. "?touch=1" or "?touch=0" in the address forces it either way (for trying it out).
export const isTouch = (function () {
  const forced = /[?&]touch=([01])/.exec(window.location.search);
  if (forced) return forced[1] === '1';
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const fine = window.matchMedia && window.matchMedia('(any-pointer: fine)').matches;
  const phone = navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  return (coarse && !fine) || phone;
})();
if (isTouch) document.documentElement.classList.add('touch');

// handlers: stick(x, y) - where the walking stick points (-1..1 each, y forward), jump(), cancel(), nextTarget(),
//           review(), helpSeen() -> true when the first-visit note was shown before, helpDone()
export function createTouch(handlers) {
  if (!isTouch) return { on: false, closeMenu: function () {}, setTargets: function () {} };

  // ---------- the menu: the desktop's bars, moved into one sheet ----------
  const menu = byId('touchMenu'), body = byId('touchMenuBody');
  ['challengeBar', 'topBar', 'side', 'links'].forEach(function (id) { body.appendChild(byId(id)); });
  byId('challengeBar').querySelector('.group').appendChild(byId('btnReview'));
  document.querySelectorAll('#side details').forEach(function (d) { d.open = true; });
  function closeMenu() { menu.hidden = true; }
  byId('btnMenu').addEventListener('click', function () { menu.hidden = !menu.hidden; menu.scrollTop = 0; });
  byId('touchMenuClose').addEventListener('click', closeMenu);
  // These open a window of their own or start something: the menu gets out of the way.
  ['btnChallenges', 'btnReview', 'btnSheet', 'btnTalents', 'btnBuffs', 'btnReset'].forEach(function (id) { byId(id).addEventListener('click', closeMenu); });
  byId('meter').addEventListener('click', function () { handlers.review(); });     // a tap on your DPS opens the review

  // ---------- the stick ----------
  const stick = byId('stick'), knob = stick.firstElementChild;
  let finger = null;
  function point(e) {
    const r = stick.getBoundingClientRect(), half = r.width / 2;
    let x = (e.clientX - r.left - half) / half, y = (e.clientY - r.top - half) / half;
    const length = Math.hypot(x, y);
    if (length > 1) { x /= length; y /= length; }
    knob.style.transform = 'translate(' + (x * 65).toFixed(0) + '%,' + (y * 65).toFixed(0) + '%)';
    if (length < 0.22) handlers.stick(0, 0); else handlers.stick(x, -y);           // a small dead spot in the middle
  }
  function letGo(e) {
    if (e.pointerId !== finger) return;
    finger = null;
    knob.style.transform = '';
    handlers.stick(0, 0);
  }
  stick.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    finger = e.pointerId;
    try { stick.setPointerCapture(finger); } catch (err) { /* the finger is already gone */ }
    point(e);
  });
  stick.addEventListener('pointermove', function (e) { if (e.pointerId === finger) point(e); });
  stick.addEventListener('pointerup', letGo);
  stick.addEventListener('pointercancel', letGo);
  window.addEventListener('blur', function () { finger = null; knob.style.transform = ''; handlers.stick(0, 0); });

  // ---------- the round buttons ----------
  function tap(id, fn) { byId(id).addEventListener('pointerdown', function (e) { e.preventDefault(); fn(); }); }
  tap('btnTouchJump', handlers.jump);
  tap('btnTouchStop', handlers.cancel);
  tap('btnTouchTarget', handlers.nextTarget);

  // A long press must not bring up the browser's own menu (save picture, copy, look up).
  document.addEventListener('contextmenu', function (e) { if (!(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) e.preventDefault(); });

  // ---------- a note on the first visit ----------
  const help = byId('touchHelp');
  if (!handlers.helpSeen()) {
    help.hidden = false;
    const done = function () { if (help.hidden) return; help.hidden = true; handlers.helpDone(); };
    help.addEventListener('click', done);
    window.setTimeout(done, 12000);
  }

  return {
    on: true, closeMenu: closeMenu,
    setTargets: function (count) { byId('btnTouchTarget').hidden = count < 2; }    // "Target" only with more than one dummy
  };
}
