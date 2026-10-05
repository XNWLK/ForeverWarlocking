// The frames and bars around the scene. In this first step most of them are in place but empty:
// casting, pets and more dummies fill them in later.

const ACTION_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', 'R', 'F', 'Z', 'X'];

function byId(id) { return document.getElementById(id); }

function fillSlots(holder, count) {
  for (let i = 0; i < count; i++) holder.appendChild(document.createElement('span'));
}

export function createHud(character) {
  const hud = byId('hud'), logLines = byId('logLines'), distance = byId('targetDistance');

  // Desktop only, but keep the frames from overlapping in a small window.
  function fit() { hud.style.zoom = String(Math.min(1, Math.max(0.5, window.innerWidth / 1280))); }
  window.addEventListener('resize', fit);
  fit();

  byId('playerPortrait').src = character.portrait;
  byId('playerSub').textContent = 'Level 60 ' + character.raceName;
  byId('playerHealth').textContent = character.health.toLocaleString('en-US') + ' / ' + character.health.toLocaleString('en-US');
  byId('playerMana').textContent = character.mana.toLocaleString('en-US') + ' / ' + character.mana.toLocaleString('en-US');

  fillSlots(byId('targetDebuffs'), 6);
  fillSlots(byId('playerBuffs'), 8);

  const bar = byId('actionBar');
  ACTION_KEYS.forEach(function (key) {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const label = document.createElement('kbd');
    label.textContent = key;
    slot.appendChild(label);
    bar.appendChild(slot);
  });

  function log(text, note) {
    const line = document.createElement('li');
    line.textContent = text;
    if (note) line.className = 'note';
    logLines.appendChild(line);
    while (logLines.children.length > 8) logLines.removeChild(logLines.firstChild);
  }

  document.querySelectorAll('#hud button.soon').forEach(function (button) {
    button.title = 'Not built yet';
    button.addEventListener('click', function () { log(button.dataset.soon + ': not built yet.'); });
  });

  const keysPanel = byId('keysPanel'), keysButton = byId('btnKeys');
  keysButton.addEventListener('click', function () {
    keysPanel.hidden = !keysPanel.hidden;
    keysButton.classList.toggle('on', !keysPanel.hidden);
  });

  let lastDistance = '';
  function setDistance(yards, inRange) {
    const text = yards.toFixed(1) + ' yd';
    if (text === lastDistance) return;
    lastDistance = text;
    distance.textContent = text;
    distance.classList.toggle('far', !inRange);
  }

  return {
    log: log,
    setDistance: setDistance,
    onRings: function (handler) {
      const button = byId('btnRings');
      button.addEventListener('click', function () {
        const on = !button.classList.contains('on');
        button.classList.toggle('on', on);
        button.setAttribute('aria-pressed', String(on));
        handler(on);
      });
    },
    onReset: function (handler) { byId('btnReset').addEventListener('click', handler); }
  };
}
