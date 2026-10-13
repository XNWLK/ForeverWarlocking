// Two practice aids you can switch on in the bar on the right:
//   - DoT timers: a bar per DoT of yours that is running, shortest first, on every dummy (its picture beside it);
//   - the sim's next cast: what the sim's priority list would cast in your place right now, and why.
// Looks only; the rules are in combat.js (combat.simWould asks the priority list).

function byId(id) { return document.getElementById(id); }

// handlers: icon(key) -> picture address, hint(key or null, racial) -> light up that spell on the action bar
export function createAids(WL, handlers) {
  const bars = byId('dotBars'), hintBox = byId('simHint'), hintIcon = byId('simHintIcon'), hintText = byId('simHintText'), hintWhy = byId('simHintWhy');
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
        const box = document.createElement('div'), track = document.createElement('div'), fill = document.createElement('i'), img = document.createElement('img');
        const name = document.createElement('span'), secs = document.createElement('b');
        box.className = 'dotbar' + (character.spells[d.key].school === 'fire' ? ' fire' : '');
        track.className = 'dotbar-track';
        img.src = handlers.icon(d.key) || ''; img.alt = '';
        name.textContent = character.spells[d.key].name + (character.targets > 1 ? ' · ' + d.target : '');
        track.append(fill, name, secs);                    // the picture stands beside the bar, not on it (Xn)
        box.append(img, track);
        bars.appendChild(box);
        row = rows[d.id] = { box: box, fill: fill, secs: secs, order: -1, text: '', now: null, next: null, other: null };
      }
      seen[d.id] = true;
      if (row.order !== place) { row.order = place; row.box.style.order = String(place); }
      row.fill.style.width = Math.max(0, Math.min(100, 100 * d.left / d.span)).toFixed(1) + '%';
      const text = d.left >= 9.95 ? String(Math.round(d.left)) : d.left.toFixed(1);
      if (row.text !== text) { row.text = text; row.secs.textContent = text; }
      // Gold ("now"): a cast started now lands as the old one runs out, so no tick is cut off - the moment the sim
      // recasts it. A pale edge ("next"): it is due right after your next cast or global cooldown, so do not start
      // anything long. An instant DoT never turns gold: it is recast when it has run out.
      const cue = d.key !== 'baneOfHavoc' && d.key !== 'baneOfDoom', castTime = cue ? combat.castTime(d.key) : 0;
      const now = cue && castTime > 0 && d.left <= castTime, next = cue && !now && d.left <= castTime + combat.gcd();
      if (row.now !== now) { row.now = now; row.box.classList.toggle('now', now); }
      if (row.next !== next) { row.next = next; row.box.classList.toggle('next', next); }
      const other = d.target !== S.target;
      if (row.other !== other) { row.other = other; row.box.classList.toggle('other', other); }
    });
    Object.keys(rows).forEach(function (id) { if (!seen[id]) { rows[id].box.remove(); delete rows[id]; } });
    const empty = !list.length;
    if (bars.hidden !== empty) bars.hidden = empty;
  }

  // ---------- the sim's next cast ----------
  // Why the sim would cast it, in a few words: the line of its priority list that applies, said as what is the case
  // right now. No numbers that count down - the line must not flicker.
  const FILLER = { wrack: 1, shadowBolt: 1, incinerate: 1, drainLife: 1, hellfire: 1, rainOfFire: 1, searingPain: 1 };
  function reason(w, combat) {
    const many = character.targets > 1, there = many ? 'dummy ' + w.target : 'the target';
    const name = function (k) { return character.spells[k] ? character.spells[k].name : k; };
    if (w.why === 'havoc') return 'with two or more dummies it goes on the second one first';
    if (w.why === 'mana') return 'not enough mana for ' + name(w.need);
    if (w.why === 'moving') return 'you have to move anyway, and mana is not full';
    const a = w.action, missing = 'it is not on ' + there;
    if (a === 'curseOfElements' || a === 'baneOfAgony') return a === 'baneOfAgony' ? 'no Bane is on ' + there : missing;
    if (a === 'bane') return w.key === 'baneOfDoom' ? 'it is ready and the fight lasts long enough for it' : 'no Bane is on ' + there;
    if (a === 'corruption' || a === 'siphonLife' || a === 'immolate' || a === 'multiDot') {
      return combat.dotLeft(w.key, w.target) > 0 ? 'it is about to run out: the cast lands as the old one ends' : missing;
    }
    if (a === 'shadowTrance') return 'Shadow Trance is up: this one is instant';
    if (a === 'isbUpkeep') return 'Improved Shadow Bolt is not on ' + there;
    if (a === 'shadowBoltSpread') return there + ' has your DoTs but no Improved Shadow Bolt';
    if (a === 'conflagrate') return 'it is ready and Immolate is on ' + there;
    if (a === 'conflagrateExpire') return 'Immolate is about to run out';
    if (a === 'conflagrateSnF' || a === 'shadowburnSnF') return 'Shadow and Flame is about to run out';
    if (a === 'shadowburn' || a === 'deathCoil' || a === 'soulFireShards') return 'it is ready';
    if (a === 'deathCoilFinisher') return 'the fight is nearly over: the filler would not land in time';
    if (a === 'searingPainExecute') return 'execute phase';
    if (a === 'searingPainDecimation') return 'execute phase: it sets off Decimation for Soul Fire';
    if (a === 'searingPainBrand') return 'Demonic Brand is not on ' + there;
    if (a === 'soulFire') return 'Decimation is up';
    if (a === 'lifeTapPet') return 'your pet is nearly out of mana';
    if (a === 'lifeTapBelow') {
      const p = character.build.params && character.build.params.lifeTapBelow;
      return p ? 'mana is below ' + p.pct + '% and the fight still lasts' : 'mana is low and the fight still lasts';
    }
    if (a === 'wrackDots') return 'your DoTs have time left: room for a channel';
    if (FILLER[a]) return 'nothing else is due: the filler';
    return '';
  }
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
    else if (combat.endless) remaining = Infinity;        // infinite health: nobody knows when it ends
    else if (sim && sim.dps > 0) {                         // about how long the dummies still last at the sim's pace
      let health = 0;
      for (let i = 1; i <= character.targets; i++) if (combat.alive(i)) health += S.targets[i].health;
      remaining = health / sim.dps;
    }
    const w = S.over ? null : combat.simWould(remaining);
    const why = w ? reason(w, combat) : '';
    const id = S.over ? 'over' : w ? w.key + '|' + w.target + '|' + w.action + '|' + w.racial + '|' + S.target + '|' + why : 'none';
    if (id === shownHint) return;
    shownHint = id;
    hintBox.hidden = false;
    hintWhy.textContent = why ? '– ' + why : '';
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
  // ---------- the opener trainer ----------
  // The sim's usual first casts in this fight (sim.opener, from the worker) as a row of pictures. Your own casts
  // tick them off in order: the same spell is right, another one is wrong. Which dummy it went to is not looked at.
  // Off the global cooldown (the race's cooldown, Bane of Havoc) and casts you stopped do not count on either side.
  const openerBox = byId('opener'), openerIcons = byId('openerIcons'), openerText = byId('openerText');
  let openerFor = null, openerCells = [], openerShown = '', openerDone = 0, lastOpener = -1;
  function myCasts(record) {
    return record.casts.filter(function (c) { return !c.off && !(c.kind === 'cast' && c.stopped); }).map(function (c) { return c.key; });
  }
  function simOpener(sim) { return sim && sim.opener ? sim.opener.filter(function (k) { return k !== 'baneOfHavoc'; }) : null; }
  function spellName(key) { return character.spells[key] ? character.spells[key].name : key; }
  // What the review says: { of, right, text } or null when there is nothing to compare.
  function openerResult(sim, record) {
    const list = simOpener(sim);
    if (!list || !list.length || !character) return null;
    const mine = myCasts(record).slice(0, list.length);
    if (!mine.length) return null;
    let right = 0, slip = '';
    mine.forEach(function (k, i) {
      if (k === list[i]) right++;
      else if (!slip) slip = 'cast ' + (i + 1) + ' was ' + spellName(k) + ' where the sim casts ' + spellName(list[i]);
    });
    return { of: list.length, right: right, text: right + ' of ' + mine.length + ' the same as the sim\'s' + (slip ? ' (' + slip + ')' : '') };
  }
  function showOpener(combat, now, on, sim, recorder) {
    const list = on && character ? simOpener(sim) : null;
    if (!list || !list.length) { if (!openerBox.hidden) openerBox.hidden = true; openerFor = null; return; }
    const stamp = Math.floor(now * 10);
    if (stamp === lastOpener) return;
    lastOpener = stamp;
    if (openerFor !== sim.opener) {                         // a new list: draw its pictures
      openerFor = sim.opener; openerShown = ''; openerDone = 0;
      openerIcons.textContent = '';
      openerCells = list.map(function (key) {
        const cell = document.createElement('i'), icon = handlers.icon(key);
        if (icon) cell.style.backgroundImage = 'url("' + icon + '")';
        openerIcons.appendChild(cell);
        return cell;
      });
    }
    const mine = myCasts(recorder.data()).slice(0, list.length), id = mine.join(' ');
    if (id !== openerShown) {
      openerShown = id;
      let right = 0;
      openerCells.forEach(function (cell, i) {
        const cast = mine[i], ok = cast === list[i];
        if (ok) right++;
        cell.className = cast == null ? (i === mine.length ? 'next' : '') : ok ? 'right' : 'wrong';
        cell.title = spellName(list[i]) + (cast != null && !ok ? ' - you cast ' + spellName(cast) : '');
        delete cell.dataset.tip;
      });
      openerText.textContent = mine.length ? right + ' of ' + mine.length : '';
      openerDone = mine.length >= list.length ? now : 0;
    }
    // Once the opener is through it stays for a few seconds, then makes room.
    const hide = openerDone > 0 && now - openerDone > 6;
    if (openerBox.hidden !== hide) openerBox.hidden = hide;
  }

  // The line of the rotation panel that applies right now.
  function mark(action) {
    Array.prototype.forEach.call(rotationList.children, function (li) { li.classList.toggle('now', !!action && li.dataset.action === action); });
  }

  return {
    setCharacter: setCharacter,
    openerResult: openerResult,
    // show: the switches { dotBars, hint, opener }; sim: the worker's result or null; recorder: the fight's record
    render: function (combat, now, show, sim, recorder) {
      showBars(combat, now, !!show.dotBars); showHint(combat, now, !!show.hint, sim); showOpener(combat, now, !!show.opener, sim, recorder);
    }
  };
}
