// Two practice aids you can switch on in the bar on the right:
//   - DoT timers: a bar per DoT of yours that is running, shortest first, on every dummy;
//   - the sim's next cast: what the sim's priority list would cast in your place right now.
// Looks only; the rules are in combat.js (combat.simWould asks the priority list).

function byId(id) { return document.getElementById(id); }

// handlers: icon(key) -> picture address, hint(key or null, racial) -> light up that spell on the action bar
export function createAids(WL, handlers) {
  const bars = byId('dotBars'), hintBox = byId('simHint'), hintIcon = byId('simHintIcon'), hintText = byId('simHintText');
  const rotationList = byId('rotationList');
  let character = null, rows = {}, lastBars = -1, lastHint = -1, shownHint = '';

  function setCharacter(c) {
    character = c;
    bars.textContent = ''; rows = {};
    lastBars = lastHint = -1; shownHint = '';
    hintBox.hidden = true;
    handlers.hint(null, false);
  }

  // ---------- DoT timers ----------
  function showBars(combat, now, on) {
    if (!on || !character) { if (!bars.hidden) bars.hidden = true; return; }
    const stamp = Math.floor(now * 20);
    if (stamp === lastBars) return;
    lastBars = stamp;
    const S = combat.state, list = [];
    for (let i = 1; i <= character.targets; i++) {
      if (!combat.alive(i) || S.over) continue;
      Object.keys(S.targets[i].dots).forEach(function (key) {
        const left = combat.dotLeft(key, i);
        if (left > 0 && character.spells[key]) list.push({ id: i + ':' + key, key: key, target: i, left: left, span: character.spells[key].duration });
      });
      if (combat.havocOn() === i) list.push({ id: i + ':baneOfHavoc', key: 'baneOfHavoc', target: i, left: S.havoc.expires - S.t, span: character.spells.baneOfHavoc.duration });
    }
    list.sort(function (a, b) { return (a.target === S.target ? 0 : 1) - (b.target === S.target ? 0 : 1) || a.left - b.left; });
    const seen = {};
    list.slice(0, 12).forEach(function (d, place) {
      let row = rows[d.id];
      if (!row) {
        const box = document.createElement('div'), fill = document.createElement('i'), img = document.createElement('img');
        const track = document.createElement('div'); track.className = 'dotbar-track';
        const name = document.createElement('span'), secs = document.createElement('b');
        box.className = 'dotbar' + (character.spells[d.key].school === 'fire' ? ' fire' : '');
        img.src = handlers.icon(d.key) || ''; img.alt = '';
        name.textContent = character.spells[d.key].name + (character.targets > 1 ? ' · ' + d.target : '');
        track.append(fill, name, secs);
        box.append(img, track);
        bars.appendChild(box);
        row = rows[d.id] = { box: box, fill: fill, secs: secs, order: -1, text: '', soon: null, other: null };
      }
      seen[d.id] = true;
      if (row.order !== place) { row.order = place; row.box.style.order = String(place); }
      row.fill.style.width = Math.max(0, Math.min(100, 100 * d.left / d.span)).toFixed(1) + '%';
      const text = d.left >= 9.95 ? String(Math.round(d.left)) : d.left.toFixed(1);
      if (row.text !== text) { row.text = text; row.secs.textContent = text; }
      // "Soon": the moment the sim would cast it again (it runs out before a new cast could land).
      const soon = d.key !== 'baneOfHavoc' && d.key !== 'baneOfDoom' && d.left <= combat.castTime(d.key) + combat.gcd();
      if (row.soon !== soon) { row.soon = soon; row.box.classList.toggle('soon', soon); }
      const other = d.target !== S.target;
      if (row.other !== other) { row.other = other; row.box.classList.toggle('other', other); }
    });
    Object.keys(rows).forEach(function (id) { if (!seen[id]) { rows[id].box.remove(); delete rows[id]; } });
    const empty = !list.length;
    if (bars.hidden !== empty) bars.hidden = empty;
  }

  // ---------- the sim's next cast ----------
  function showHint(combat, now, on, sim) {
    if (!on || !character) {
      if (shownHint !== '') { shownHint = ''; hintBox.hidden = true; handlers.hint(null, false); mark(null); }
      return;
    }
    const stamp = Math.floor(now * 10);
    if (stamp === lastHint) return;
    lastHint = stamp;
    const S = combat.state;
    let remaining = Infinity;
    if (combat.timed) remaining = combat.timeLeft();
    else if (sim && sim.dps > 0) {                         // about how long the dummies still last at the sim's pace
      let health = 0;
      for (let i = 1; i <= character.targets; i++) if (combat.alive(i)) health += S.targets[i].health;
      remaining = health / sim.dps;
    }
    const w = S.over ? null : combat.simWould(remaining);
    const id = S.over ? 'over' : w ? w.key + '|' + w.target + '|' + w.action + '|' + w.racial + '|' + S.target : 'none';
    if (id === shownHint) return;
    shownHint = id;
    hintBox.hidden = false;
    if (S.over) { hintIcon.hidden = true; hintText.textContent = 'The fight is over'; handlers.hint(null, false); mark(null); return; }
    if (!w) { hintIcon.hidden = true; hintText.textContent = 'The sim would wait'; handlers.hint(null, false); mark(null); return; }
    const spell = character.spells[w.key], icon = handlers.icon(w.key);
    hintIcon.hidden = !icon;
    if (icon) hintIcon.src = icon;
    hintText.textContent = (spell ? spell.name : w.key) +
      (character.targets > 1 && w.key !== 'lifeTap' && w.target !== S.target ? ' on dummy ' + w.target : '') +
      (w.racial && character.racial ? ', ' + character.racial.name + ' first' : '');
    handlers.hint(w.key, w.racial);
    mark(w.action);
  }
  // The line of the rotation panel that applies right now.
  function mark(action) {
    Array.prototype.forEach.call(rotationList.children, function (li) { li.classList.toggle('now', !!action && li.dataset.action === action); });
  }

  return {
    setCharacter: setCharacter,
    // show: the switches { dotBars, hint }; sim: the worker's result or null
    render: function (combat, now, show, sim) { showBars(combat, now, !!show.dotBars); showHint(combat, now, !!show.hint, sim); }
  };
}
