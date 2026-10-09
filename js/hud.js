// The frames and bars around the scene: unit frames, buffs and debuffs, cast bar, action bar, combat log, damage
// meter, floating damage numbers, and the pickers for build and race.
import { getName, setName, maxLength } from './names.js';
import { parseHealth } from './settings.js';
import { setTip, initTips, refreshTips } from './tooltip.js';
import { keyCombo, mouseCombo, wheelCombo, comboLabel, isModifier } from './keys.js';
import { isTouch } from './touch.js';

export const ACTION_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'KeyR', 'KeyF', 'KeyT', 'KeyG', 'KeyC', 'KeyV', 'KeyB'];
const LOG_LINES = 9;

function byId(id) { return document.getElementById(id); }
function whole(n) { return Math.round(n).toLocaleString('en-US'); }
// What a bar says: "650 / 1,000  65%". The percentage never says 0% while something is left, nor 100% when it is not
// full. Very long numbers drop the maximum so the text still fits its bar.
function amount(now, max) {
  const pct = now <= 0 ? 0 : now >= max ? 100 : Math.max(1, Math.min(99, Math.round(100 * now / max)));
  const full = whole(now) + ' / ' + whole(max) + '\u2002' + pct + '%';
  return full.length <= 24 ? full : whole(now) + '\u2002' + pct + '%';
}

// Only touch the page when something really changed (this runs every picture).
function setText(el, text) { if (el._text !== text) { el._text = text; el.textContent = text; } }
function setWidth(el, pct) { const w = pct.toFixed(1) + '%'; if (el._width !== w) { el._width = w; el.style.width = w; } }
// How much of a cooldown is left (0..1): drawn as a clock-hand sweep.
function setLeft(el, left) {
  const v = left <= 0 ? '0' : left.toFixed(3);
  if (el._left === v) return;
  el._left = v;
  el.style.setProperty('--left', v);
  el.classList.toggle('none', left <= 0);
}
function setClass(el, name, on) { if (el['_c' + name] !== on) { el['_c' + name] = on; el.classList.toggle(name, on); } }

// Buffs and debuffs that are not spells of their own: which picture and name to show.
const AURA_INFO = {
  coe: { icon: 'curseOfElements', name: 'Curse of the Elements' },
  isb: { icon: 'talent_improvedShadowBolt', name: 'Improved Shadow Bolt' },
  shadowTrance: { icon: 'shadowTrance', name: 'Shadow Trance' },
  decimation: { icon: 'talent_decimation', name: 'Decimation' },
  bloodFury: { icon: 'racial_bloodFury', name: 'Blood Fury' },
  berserking: { icon: 'racial_berserking', name: 'Berserking' },
  eureka: { icon: 'racial_eureka', name: 'Eureka!' },
  snfShadow: { icon: 'talent_shadowAndFlame', name: 'Shadow and Flame (Shadow)' },
  snfFire: { icon: 'talent_shadowAndFlame', name: 'Shadow and Flame (Fire)' },
  brand: { icon: 'talent_demonicBrand', name: 'Demonic Brand' }
};
// The data's tooltip texts carry a few leftovers of the formulas they were made from.
function tidy(text) {
  return text.replace(/\s*\*\s*\(+1\)+/g, '').replace(/\[\(([^\[\]]*)\)\]/g, '$1').replace(/ {2,}/g, ' ');
}
function span(seconds) {
  const s = Math.round(seconds * 100) / 100;
  return s >= 60 ? (Math.round(s / 6) / 10) + ' min' : s + ' sec';
}
const PET_KIND = { imp: 'Imp', succubus: 'Succubus', felhunter: 'Felhunter', voidwalker: 'Voidwalker' };
const PET_ATTACK = { 'pet:firebolt': 'Firebolt', 'pet:lashOfPain': 'Lash of Pain', 'pet:melee': 'melee', 'pet:windfury': 'Windfury attack', 'pet:flametongue': 'Flametongue Totem', 'pet:brand': 'Demonic Brand' };
export const RACIAL_ICON = { 'Blood Fury': 'racial_bloodFury', 'Berserking': 'racial_berserking', 'Eureka!': 'racial_eureka' };

export function createHud(WL, handlers) {
  const hud = byId('hud'), logLines = byId('logLines'), floaters = byId('floaters');
  const el = {
    distance: byId('targetDistance'), mana: byId('playerMana'), manaFill: byId('playerManaFill'), health: byId('playerHealth'),
    targetFrame: byId('targetFrame'), targetHealth: byId('targetHealth'), targetFill: byId('targetHealthFill'), executeMark: byId('executeMark'),
    debuffs: byId('targetDebuffs'), buffs: byId('playerBuffs'),
    castBar: byId('castBar'), castFill: byId('castFill'), castText: byId('castText'), error: byId('errorText'),
    bar: byId('actionBar'), dps: byId('meterDps'), damage: byId('meterDamage'), time: byId('meterTime'), spells: byId('meterSpells'),
    buildLabel: byId('buildLabel'), sim: byId('meterSim'), threat: byId('meterThreat'),
    petFrame: byId('petFrame'), petSub: byId('petSub'), petManaFill: byId('petManaFill'), petManaText: byId('petManaText'),
    petAttack: byId('btnPetAttack'), petFollow: byId('btnPetFollow'),
    targetSub: byId('targetSub'), perDummy: byId('meterDummies'), perDummyLabel: byId('meterDummiesLabel')
  };
  let codes = ACTION_CODES.slice(), layout = null, slots = [], character = null, currentTarget = 1, lastCombat = null;
  initTips();
  // A key with its modifiers in full ("Shift+1", "Mouse 4"), and the short form that fits on a slot ("S-1", "M4").
  function labelFor(code) { return comboLabel(code, layout, false); }
  function slotLabel(code) { return comboLabel(code, layout, true); }
  function showKeyLabels() { slots.forEach(function (slot, i) { slot.kbd.textContent = slotLabel(codes[i]); }); }

  // With several dummies each gets a number after its name.
  function dummyName(ti) { return getName('dummy') + (character && character.targets > 1 ? ' ' + (ti || currentTarget) : ''); }

  // A small plate above every dummy when there is more than one: name and health. Click it to target that dummy.
  const plates = [null];
  for (let i = 1; i <= 3; i++) {
    const plate = document.createElement('div'), auras = document.createElement('span'), tag = document.createElement('span');
    const name = document.createElement('span'), bar = document.createElement('i'), fill = document.createElement('b');
    plate.className = 'plate';
    plate.hidden = true;
    auras.className = 'auras';
    tag.className = 'tag';
    bar.appendChild(fill);
    tag.append(name, bar);
    plate.append(auras, tag);
    plate.addEventListener('click', function () { handlers.onTarget(i); });
    byId('plates').appendChild(plate);
    plates.push({ box: plate, name: name, fill: fill, auras: auras });
  }

  // Desktop only, but keep the frames from overlapping in a small window.
  // On a touch screen the layout is made for a phone held either way: it is scaled by the short side.
  function fit() {
    hud.style.zoom = String(isTouch ? Math.min(1.5, Math.max(0.8, Math.min(window.innerWidth, window.innerHeight) / 390))
                                    : Math.min(1, Math.max(0.5, window.innerWidth / 1280)));
  }
  window.addEventListener('resize', fit);
  fit();

  // The letters printed on the slots follow the keyboard in use (the keys themselves are chosen by position).
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then(function (map) { layout = map; showKeyLabels(); if (character) showBinds(); }).catch(function () {});
  }

  // ---------- combat log ----------
  const everything = [];                                    // every line since the page opened, with its fight time, for "Copy the whole log"
  function log(text, kind) {
    const at = lastCombat ? lastCombat.fightSeconds() : 0;
    everything.push('[' + (at > 0 ? at.toFixed(1).padStart(6) : '   0.0') + '] ' + text);
    if (everything.length > 20000) everything.splice(0, 5000);
    const line = document.createElement('li');
    line.textContent = text;
    if (kind) line.className = kind;
    logLines.appendChild(line);
    while (logLines.children.length > LOG_LINES) logLines.removeChild(logLines.firstChild);
  }

  // ---------- names and the dummy's health: click to type ----------
  function editable(button, read, write, limit) {
    button.addEventListener('click', function () {
      const input = document.createElement('input');
      input.className = button.classList.contains('name') ? 'name-edit' : '';
      input.value = read();
      const max = limit ? limit() : 0;
      if (max) input.maxLength = max;
      input.setAttribute('aria-label', 'New value');
      let done = false;
      function finish(keep) {
        if (done) return;
        done = true;
        input.remove();
        button.hidden = false;
        if (keep) write(input.value);
      }
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
        e.stopPropagation();
      });
      input.addEventListener('blur', function () { finish(true); });
      button.hidden = true;
      button.after(input);
      input.focus();
      input.select();
    });
  }

  function wireNames() {
    document.querySelectorAll('#hud button.name').forEach(function (button) {
      button.title = 'Click to rename';
      editable(button, function () { return getName(button.dataset.name); }, function (value) {
        const key = button.dataset.name, before = getName(key), after = setName(key, value);
        button.textContent = after;
        if (after !== before) log(before + ' is now called ' + after + '.');
      }, function () { return maxLength(button.dataset.name); });
    });
  }
  function showNames() {
    document.querySelectorAll('#hud button.name').forEach(function (button) {
      button.textContent = getName(button.dataset.name);
    });
  }
  wireNames();

  editable(el.targetHealth, function () { return String(character ? character.dummyHealth : ''); }, function (value) {
    if (character && character.timed) { showError('This is a timed fight: change it under Fight'); return; }
    const health = parseHealth(value);
    if (health === null) { showError('Health must be a number from 100 to 100,000,000'); return; }
    handlers.onDummyHealth(health);
  });

  // ---------- pickers ----------
  const panels = { build: byId('buildPanel'), race: byId('racePanel'), keys: byId('keysPanel'), fight: byId('fightPanel'), import: byId('importPanel') };
  const panelButtons = { build: byId('btnBuild'), race: byId('btnRace'), keys: byId('btnKeys'), fight: byId('btnFight'), import: byId('btnImport') };
  function showPanel(which) {
    Object.keys(panels).forEach(function (k) {
      const open = k === which && panels[k].hidden;
      panels[k].hidden = !open;
      panelButtons[k].classList.toggle('on', open);
    });
  }
  Object.keys(panelButtons).forEach(function (k) { panelButtons[k].addEventListener('click', function () { showPanel(k); }); });

  function fillPickers() {
    const builds = byId('buildOptions'), races = byId('raceOptions');
    builds.textContent = ''; races.textContent = '';
    // Listed in the order of their DPS in the DPS sim (data/build-order.js); a build the list does not know comes last.
    const ranking = (window.FW_BUILD_ORDER && window.FW_BUILD_ORDER.order) || [], rank = {};
    ranking.forEach(function (r, i) { rank[r.key] = { place: i, dps: r.dps, race: r.race }; });
    function place(b) { return b.custom ? -1 : rank[b.key] ? rank[b.key].place : 999; }      // an imported build comes first
    const listed = (character ? character.builds : WL.BUILDS).slice().sort(function (a, b) { return place(a) - place(b); });
    listed.forEach(function (b) {
      const button = document.createElement('button');
      button.type = 'button';
      if (b.pet && WL.ICONS['pet_' + b.pet]) { const img = document.createElement('img'); img.src = WL.ICONS['pet_' + b.pet]; img.alt = ''; button.appendChild(img); }
      else { const gap = document.createElement('span'); gap.className = 'no-icon'; button.appendChild(gap); }
      button.appendChild(document.createTextNode(b.short));
      const dps = document.createElement('small'), r = b.custom ? null : rank[b.key];
      dps.textContent = b.custom ? 'imported' : r ? Math.round(r.dps) + ' DPS' : '';
      const notes = b.notes ? [].concat(b.notes).join(' ').replace(/\s*\[A\d+\]/g, '') : '';
      if (r || notes) button.title = (r ? 'In the Warlock SIM: ' + r.dps + ' DPS as ' + WL.RACES[r.race].name + ' (its best race), on a boss with raid buffs.' : '') +
        (notes ? (r ? '\n\n' : '') + 'Its notes on this build: ' + notes : '');
      button.appendChild(dps);
      if (character && b.key === character.build.key) button.className = 'on';
      button.addEventListener('click', function () { showPanel(null); handlers.onBuild(b.key); });
      builds.appendChild(button);
    });
    WL.RACE_KEYS.forEach(function (key) {
      const button = document.createElement('button');
      button.type = 'button';
      const img = document.createElement('img'); img.src = WL.ICONS['race_' + key]; img.alt = ''; button.appendChild(img);
      button.appendChild(document.createTextNode(WL.RACES[key].name));
      const racials = document.createElement('small');
      racials.textContent = WL.RACES[key].racials.map(function (r) { return r.name; }).join(', ');
      button.appendChild(racials);
      if (character && key === character.raceKey) button.className = 'on';
      button.addEventListener('click', function () { showPanel(null); handlers.onRace(key); });
      races.appendChild(button);
    });
  }

  const dummyButtons = Array.prototype.slice.call(document.querySelectorAll('#hud button[data-dummies]'));
  dummyButtons.forEach(function (button) {
    button.addEventListener('click', function () { button.blur(); handlers.onDummies(Number(button.dataset.dummies)); });
  });
  const ringsButton = byId('btnRings');
  ringsButton.addEventListener('click', function () { setRings(!ringsButton.classList.contains('on')); handlers.onRings(ringsButton.classList.contains('on')); });
  function setRings(on) { ringsButton.classList.toggle('on', on); ringsButton.setAttribute('aria-pressed', String(on)); }
  byId('btnReset').addEventListener('click', function () { handlers.onReset(); });
  const pullButton = byId('btnPull');
  pullButton.addEventListener('click', function () { pullButton.blur(); handlers.onPull(); });
  function setPull(on) { if (pullButton.classList.contains('on') !== on) pullButton.classList.toggle('on', on); }
  // Top left: each button opens its address in a new tab.
  document.querySelectorAll('#links button[data-link]').forEach(function (button) {
    button.addEventListener('click', function () { button.blur(); window.open(button.dataset.link, '_blank', 'noopener'); });
  });
  const soundButton = byId('btnSound');
  function setSound(on) { soundButton.classList.toggle('on', on); soundButton.setAttribute('aria-pressed', String(on)); }
  soundButton.addEventListener('click', function () { soundButton.blur(); const on = !soundButton.classList.contains('on'); setSound(on); handlers.onSound(on); });

  // Keybinds: every key in one list. Click a key, press the new one.
  const BIND_ROWS = [['forward', 'Walk forward'], ['back', 'Walk back'], ['turnLeft', 'Turn left'], ['turnRight', 'Turn right'],
    ['strafeLeft', 'Step left'], ['strafeRight', 'Step right'], ['jump', 'Jump'], ['nextTarget', 'Next dummy'],
    ['cancel', 'Stop casting'], ['petAttack', 'Pet: attack'], ['petFollow', 'Pet: follow'], ['reset', 'Reset the fight'], ['pull', 'Pull timer'],
    ['zoomIn', 'Zoom in'], ['zoomOut', 'Zoom out']];
  let binds = {}, capture = null;                          // capture = the key we are waiting for: { id, button }
  function bindRow(holder, id, text, code) {
    const row = document.createElement('div'), label = document.createElement('span'), button = document.createElement('button');
    row.className = 'bind';
    label.textContent = text;
    button.type = 'button';
    button.textContent = code ? labelFor(code) : 'none';
    if (!code) button.className = 'unset';
    button.addEventListener('click', function () {
      if (capture) showBinds();
      capture = { id: id, button: button };
      button.textContent = 'press it';
      button.className = 'waiting';
      button.blur();
    });
    row.append(label, button);
    holder.appendChild(row);
  }
  function showBinds() {
    capture = null;
    const left = byId('bindsLeft'), right = byId('bindsRight');
    left.textContent = ''; right.textContent = '';
    BIND_ROWS.forEach(function (r) { bindRow(left, r[0], r[1], binds[r[0]]); });
    slots.forEach(function (slot, i) {
      if (!slot.key) return;
      const name = slot.key === 'racial' ? character.racial.name : character.spells[slot.key].name;
      bindRow(right, i, name, codes[i]);
    });
  }
  byId('bindsReset').addEventListener('click', function () { handlers.onKeysReset(); });

  // Edit bar: click two slots to swap what is in them; click a slot and press a key to give it that key.
  let editing = false, picked = -1;
  const editButton = byId('btnEdit'), editStrip = byId('editStrip');
  function setEditing(on) {
    editing = on; picked = -1;
    editStrip.hidden = !on;
    el.bar.classList.toggle('editing', on);
    editButton.classList.toggle('on', on);
    slots.forEach(function (slot) { slot.button.classList.remove('picked'); });
  }
  function pickSlot(i) {
    if (picked === i) { picked = -1; slots[i].button.classList.remove('picked'); return; }
    if (picked < 0) { picked = i; slots[i].button.classList.add('picked'); return; }
    const a = picked;
    picked = -1;
    handlers.onSwap(a, i);
  }
  editButton.addEventListener('click', function () { editButton.blur(); setEditing(!editing); });
  byId('editDone').addEventListener('click', function () { setEditing(false); });
  byId('editReset').addEventListener('click', function () { handlers.onBarReset(); });
  window.addEventListener('keydown', function (e) {       // a key press that is meant as a new key, not as an action
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (capture) {                                         // the Keybinds panel is waiting for a key
      e.preventDefault();
      e.stopImmediatePropagation();
      if (isModifier(e.code)) return;                      // Shift, Ctrl or Alt held: the key that follows is the one
      const id = capture.id;
      capture = null;
      if (e.code === 'Escape') showBinds(); else handlers.onRebind(id, keyCombo(e));
      return;
    }
    if (!editing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') { setEditing(false); return; }
    if (picked < 0 || e.repeat || isModifier(e.code)) return;
    const slot = picked;
    slots[slot].button.classList.remove('picked');
    picked = -1;
    handlers.onRebind(slot, keyCombo(e));
  }, true);
  // The same for a mouse button (middle, or a thumb button) and for the wheel with a modifier held.
  function waiting() { return capture ? capture.id : editing && picked >= 0 ? picked : null; }
  function take(e, combo) {
    const id = waiting();
    if (id === null || !combo) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (capture) capture = null; else { slots[picked].button.classList.remove('picked'); picked = -1; }
    handlers.onRebind(id, combo);
  }
  window.addEventListener('mousedown', function (e) { take(e, mouseCombo(e)); }, true);
  window.addEventListener('wheel', function (e) { take(e, wheelCombo(e)); }, { capture: true, passive: false });
  el.petAttack.addEventListener('click', function () { el.petAttack.blur(); handlers.onPet('attack'); });
  el.petFollow.addEventListener('click', function () { el.petFollow.blur(); handlers.onPet('follow'); });

  // ---------- the character on screen ----------
  // c: { build, raceKey, stats, table, spells, bar: [spell keys], racial, dummyHealth, executePct }
  function setCharacter(c) {
    character = c;
    lastCombat = null;
    byId('playerPortrait').src = WL.ICONS['race_' + c.raceKey];
    byId('petPortrait').src = c.build.pet ? WL.ICONS['pet_' + c.build.pet] || '' : '';
    byId('petPortrait').title = c.build.pet ? PET_KIND[c.build.pet] || '' : '';
    byId('playerSub').textContent = 'Level 60 ' + WL.RACES[c.raceKey].name;
    el.health.textContent = amount(c.stats.maxHealth, c.stats.maxHealth);
    el.buildLabel.textContent = c.build.short;
    el.buildLabel.title = c.build.name;
    el.executeMark.style.left = c.executePct + '%';
    dummyButtons.forEach(function (button) { button.classList.toggle('on', Number(button.dataset.dummies) === c.targets); });
    el.perDummy.hidden = el.perDummyLabel.hidden = c.targets < 2;
    currentTarget = 1;

    const petName = byId('petName');
    el.petFrame.classList.toggle('none', !c.build.pet);
    if (c.build.pet) {
      petName.dataset.name = c.build.pet;
      petName.hidden = false;
    } else {
      petName.hidden = true;
      el.petSub._text = null;
      el.petSub.textContent = 'No pet in this build';
    }
    setSimAverage(null);
    showNames();
    fillPickers();

    el.bar.textContent = '';
    slots = codes.map(function (code, i) {
      const key = c.bar[i] || null;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'slot' + (key ? '' : ' empty');
      const slot = { key: key, button: button, cool: null, secs: null, count: null, kbd: document.createElement('kbd') };
      if (key) {
        const racial = key === 'racial' ? c.racial : null;
        const name = racial ? racial.name : c.spells[key].name;
        const img = document.createElement('img');
        img.src = WL.ICONS[racial ? RACIAL_ICON[racial.name] : key] || '';
        img.alt = name;
        slot.cool = document.createElement('span'); slot.cool.className = 'cool';
        slot.secs = document.createElement('span'); slot.secs.className = 'secs';
        slot.count = document.createElement('span'); slot.count.className = 'count';
        button.append(img, slot.cool, slot.secs, slot.count);
        setTip(button, function () { return spellTip(i); });
      }
      button.addEventListener('click', function () { button.blur(); if (editing) pickSlot(i); else if (key) handlers.onPress(key); });
      slot.kbd.textContent = slotLabel(code);
      button.appendChild(slot.kbd);
      el.bar.appendChild(button);
      return slot;
    });
    lastMeter = -1;
    [el.debuffs, el.buffs].concat(plates.slice(1).map(function (p) { return p.auras; })).forEach(function (h) { h._ids = null; h.textContent = ''; });
    picked = -1;
    el.bar.classList.toggle('editing', editing);
    showBinds();
  }

  // ---------- tooltips ----------
  function spellText(id) { const t = WL.SPELL_TEXT && WL.SPELL_TEXT[id]; return typeof t === 'string' ? tidy(t) : ''; }
  function talentRank(key) { return (character.build.talents && character.build.talents[key]) || 0; }
  function talentText(key) {
    const rank = talentRank(key), t = WL.TALENT_TEXT && WL.TALENT_TEXT[key];
    return rank && t ? tidy(t[Math.min(rank, t.length) - 1]) : '';
  }
  function talentValue(key, field) {
    const rank = talentRank(key), t = (WL.TALENTS || []).filter(function (x) { return x.key === key; })[0];
    return rank && t && t.v && t.v[field] ? t.v[field][Math.min(rank, t.v[field].length) - 1] : null;
  }
  // What a spell does for you with this gear and these talents (before crits and what is on the dummy).
  function yours(key) {
    const e = character.table[key], s = character.spells[key], parts = [];
    if (e.directDmg) parts.push('about ' + whole(e.directDmg) + (s.aoe ? ' to each dummy' : ' a hit'));
    if (e.tickDmg && e.ticks) {
      if (s.kind === 'channel') parts.push('about ' + whole(e.tickDmg) + ' a tick' + (s.aoe ? ' to each dummy' : '') + ', ' + e.ticks + ' ticks');
      else if (e.ticks === 1) parts.push('about ' + whole(e.tickDmg) + ' after ' + span(s.duration));
      else parts.push('about ' + whole(e.tickDmg * e.ticks) + ' over ' + span(s.duration) + (s.ramp ? '' : ' (' + whole(e.tickDmg) + ' a tick)'));
    }
    return parts.length ? { text: 'For you: ' + parts.join(', then ') + '.', yours: true } : null;
  }

  // The spell in slot i: what it costs and how long it takes right now, what it does, and its key.
  function spellTip(i) {
    const slot = slots[i], key = slot && slot.key, c = character;
    if (!key) return null;
    const keyLine = 'Key: ' + labelFor(codes[i]);
    if (key === 'racial') {
      return { title: c.racial.name, right: 'Racial', rows: [['Instant', span(c.racial.cd) + ' cooldown']],
               text: spellText(c.racial.id), notes: ['Not on the global cooldown.', keyLine] };
    }
    const e = c.table[key], s = c.spells[key];
    const cost = lastCombat ? lastCombat.cost(key) : e.cost, cast = lastCombat ? lastCombat.castTime(key) : e.cast;
    const rows = [[cost > 0.5 ? whole(cost) + ' Mana' : '', e.range ? e.range + ' yd range' : '']];
    rows.push([s.kind === 'channel' ? 'Channeled, ' + span(s.duration) : cast > 0.005 ? span(cast) + ' cast' : 'Instant', e.cd ? span(e.cd) + ' cooldown' : '']);
    if (s.shards) rows.push(['Reagent: Soul Shard', 'never runs out']);
    if (s.healthCost) rows.push(['Costs ' + whole(s.healthCost) + ' health', '']);
    const notes = [yours(key)];
    if (key === 'lifeTap') {                               // what a tap gives you, and when the sim taps with this build
      const better = talentValue('improvedLifeTap', 'manaPct') || 0;
      notes.push({ text: 'For you: about ' + whole((s.manaBase + c.stats.spi) * (1 + better / 100)) + ' mana a tap.', yours: true });
      ['lifeTapBelow', 'lifeTapPet'].forEach(function (action) {
        if (c.build.rotation.indexOf(action) >= 0 && WL.actionLabel) notes.push('This build in the sim: ' + WL.actionLabel(c.build, action) + '.');
      });
      notes.push('The sim also taps whenever mana is too low for the next spell.');
    }
    if (s.selfDamage && lastCombat) notes.push('Every tick also burns you for ' + whole(lastCombat.selfTick(key)) + '. It stops by itself before a tick would kill you.');
    if (s.leech) notes.push('What it deals comes back to you as health.');
    if (s.threatMult && lastCombat) notes.push('Causes ' + (Math.round(lastCombat.threatMult(key) * 100) / 100) + ' times its damage as threat.');
    if (e.radius) notes.push('Hits every dummy within ' + e.radius + ' yd of ' + (e.range ? 'your target.' : 'you.'));
    if (key === 'baneOfHavoc') notes.push('Not on the global cooldown.');
    notes.push(keyLine);
    return { title: s.name, right: s.rank ? 'Rank ' + s.rank : '', rows: rows, text: spellText(s.id), notes: notes };
  }

  // What a buff or debuff says: by its key. Texts from the game's data where they describe the effect itself.
  function auraText(key) {
    const c = character;
    if (c.spells[key]) return spellText(c.spells[key].id);
    if (key === 'coe') return c.spells.curseOfElements ? spellText(c.spells.curseOfElements.id) : '';
    if (key === 'havoc') return c.spells.baneOfHavoc ? spellText(c.spells.baneOfHavoc.id) : '';
    if (key === 'isb') return talentText('improvedShadowBolt');
    if (key === 'shadowTrance') return 'Your next Shadow Bolt is instant.';
    if (key === 'decimation') { const v = talentValue('decimation', 'sfCastRedPct'); return 'Soul Fire casts ' + (v ? v + '% ' : '') + 'faster and costs no Soul Shard.'; }
    if (key === 'snfShadow' || key === 'snfFire') { const v = talentValue('shadowAndFlame', 'schoolPct'); return 'All ' + (key === 'snfFire' ? 'Fire' : 'Shadow') + ' damage you deal is increased' + (v ? ' by ' + v + '%.' : '.'); }
    if (key === 'brand') return 'Your pet\'s next attacks against this target deal extra damage.';
    if (key === 'bloodFury' || key === 'berserking' || key === 'eureka') return c.racial ? spellText(c.racial.id) : '';
    return '';
  }
  function auraTip(a) {
    const left = a.text ? (a.text.charAt(0) === 'x' ? a.text.slice(1) + ' left' : /m$/.test(a.text) ? a.text.replace('m', ' min left') : a.text + ' sec left') : '';
    return { title: a.name, right: left, text: a.desc != null ? a.desc : auraText(a.key), notes: a.notes || [] };
  }

  // ---------- every picture ----------
  let lastMeter = -1, lastAuras = { debuffs: '', buffs: '' }, errorUntil = 0, interruptedUntil = 0, clock = 0;

  function auraList(holder, which, list) {
    const id = list.map(function (a) { return a.key; }).join(',');
    if (holder._ids !== id) {
      holder._ids = id;
      holder.textContent = '';
      list.forEach(function (a, i) {
        const box = document.createElement('span');
        box.className = 'aura';
        setTip(box, function () { const now = holder._list && holder._list[i]; return now ? auraTip(now) : null; });
        const img = document.createElement('img');
        img.src = WL.ICONS[a.icon] || ''; img.alt = a.name;
        const b = document.createElement('b');
        box.append(img, b);
        holder.appendChild(box);
      });
    }
    holder._list = list;
    list.forEach(function (a, i) { setText(holder.children[i].lastChild, a.text); });
  }
  function seconds(left) { return left === Infinity ? '' : left >= 60 ? Math.ceil(left / 60) + 'm' : left >= 9.5 ? String(Math.round(left)) : left.toFixed(1); }

  // The DoTs and debuffs on dummy i, with the seconds (or charges) left.
  function aurasOn(combat, i) {
    const S = combat.state, c = character, t = S.targets[i];
    const list = Object.keys(t.dots).filter(function (k) { return combat.dotLeft(k, i) > 0; }).map(function (k) {
      return { key: k, icon: k, name: c.spells[k].name, text: seconds(combat.dotLeft(k, i)) };
    });
    ['coe', 'isb'].forEach(function (k) { if (combat.debuff(i, k)) list.push({ key: k, icon: AURA_INFO[k].icon, name: AURA_INFO[k].name, text: seconds(t.deb[k] - S.t) }); });
    if (combat.debuff(i, 'brand') && t.brandCharges > 0) list.push({ key: 'brand', icon: AURA_INFO.brand.icon, name: AURA_INFO.brand.name, text: 'x' + t.brandCharges });
    if (combat.havocOn() === i) list.push({ key: 'havoc', icon: 'baneOfHavoc', name: 'Bane of Havoc', text: seconds(S.havoc.expires - S.t) });
    return list;
  }

  // combat: the object from createCombat; ctx: { distances, moving }; now: seconds since the page started;
  // anchors: where each dummy's head is on the screen ([, a1, a2, a3], each { x, y, visible }).
  function render(combat, ctx, now, anchors) {
    clock = now;
    lastCombat = combat;
    refreshTips(now);
    const S = combat.state, c = character, ti = S.target, cur = combat.current, distance = ctx.distances[ti];
    currentTarget = ti;

    setText(el.distance, distance.toFixed(1) + ' yd');
    setClass(el.distance, 'far', distance > c.maxRange);
    setText(el.targetSub, c.targets > 1 ? ti + ' of ' + c.targets : 'Boss');
    const nameButton = el.targetFrame.querySelector('button.name');
    if (!nameButton.hidden) setText(nameButton, getName('dummy'));

    for (let i = 1; i <= 3; i++) {
      const plate = plates[i], a = anchors && anchors[i], show = i <= c.targets && !!a && a.visible;
      if (plate.box.hidden !== !show) plate.box.hidden = !show;
      if (!show) continue;
      const t = S.targets[i], left = Math.round(a.x) + 'px', top = Math.round(a.y - 14) + 'px';
      if (plate.box._left !== left) { plate.box._left = left; plate.box.style.left = left; }
      if (plate.box._top !== top) { plate.box._top = top; plate.box.style.top = top; }
      setClass(plate.box, 'solo', c.targets === 1);
      auraList(plate.auras, 'plate', aurasOn(combat, i));
      setText(plate.name, dummyName(i));
      setWidth(plate.fill, 100 * t.health / t.maxHealth);
      setClass(plate.box, 'current', i === ti);
      setClass(plate.box, 'dead', t.dead);
    }

    const mana = Math.min(S.mana, c.stats.maxMana);
    setText(el.mana, amount(mana, c.stats.maxMana));
    setWidth(el.manaFill, 100 * mana / c.stats.maxMana);
    // Your health: Life Tap and Hellfire take it, the healing you are given and your leeching spells bring it back.
    const health = Math.max(0, Math.min(S.health, c.stats.maxHealth));
    setText(el.health, amount(health, c.stats.maxHealth));
    setWidth(el.health.previousElementSibling, 100 * health / c.stats.maxHealth);
    setClass(el.health.parentElement, 'low', health <= 2 * (c.spells.lifeTap.healthCost || 0));
    // A light edge on the mana bar while Spirit is giving mana back (no mana spent for 5 seconds).
    setClass(el.manaFill.parentElement, 'regen', !S.over && combat.spiritIn() === 0 && mana < c.stats.maxMana - 0.5);
    if (combat.timed) {
      const left = combat.timeLeft();
      setText(el.targetHealth, Math.ceil(cur.hpPct) + '%  ·  ' + Math.floor(left / 60) + ':' + String(Math.floor(left % 60)).padStart(2, '0') + ' left');
    } else setText(el.targetHealth, amount(Math.ceil(cur.health), cur.maxHealth));
    const phase = combat.movePhase(), banner = moveBanner;
    if (ctx.banner) { banner.hidden = false; setClass(banner, 'soon', !!ctx.banner.soon); setText(banner, ctx.banner.text); }   // a scripted fight says what is happening
    else if (phase && phase.moving) { banner.hidden = false; setClass(banner, 'soon', false); setText(banner, 'Move!  ' + phase.left.toFixed(1)); }
    else if (phase && phase.next != null && phase.next <= 3) { banner.hidden = false; setClass(banner, 'soon', true); setText(banner, 'Move in ' + phase.next.toFixed(1)); }
    else if (!banner.hidden) banner.hidden = true;
    moveFloats(now);
    setWidth(el.targetFill, 100 * cur.health / cur.maxHealth);
    setClass(el.targetFrame, 'execute', !cur.dead && combat.executePhase());

    // Debuffs on the dummy, then your own buffs.
    const debuffs = aurasOn(combat, ti);
    auraList(el.debuffs, 'debuffs', debuffs);
    const buffs = (c.standing || []).map(function (b) {
      return { key: b.key, icon: b.icon, name: b.name, text: '', desc: b.id ? spellText(b.id) : '', notes: [b.desc, b.from ? 'From: ' + b.from : ''] };
    });
    ['shadowTrance', 'decimation', 'bloodFury', 'berserking', 'snfShadow', 'snfFire'].forEach(function (k) {
      if (combat.buff(k)) buffs.push({ key: k, icon: AURA_INFO[k].icon, name: AURA_INFO[k].name, text: seconds(S.buffs[k] - S.t) });
    });
    if (combat.eurekaUp()) buffs.push({ key: 'eureka', icon: AURA_INFO.eureka.icon, name: AURA_INFO.eureka.name, text: 'x' + S.eurekaCharges });
    auraList(el.buffs, 'buffs', buffs);

    // The pet: what it is doing, and its mana.
    const pet = combat.pet;
    if (pet) {
      const doing = S.over ? 'idle' : pet.active ? 'attacking' : pet.mode === 'attack' ? 'running in' : 'following';
      setText(el.petSub, doing);                           // what kind of demon it is shows in its picture
      setWidth(el.petManaFill, 100 * combat.petMana() / pet.maxMana);
      setText(el.petManaText, amount(combat.petMana(), pet.maxMana));
      setClass(el.petAttack, 'on', pet.mode === 'attack');
      setClass(el.petFollow, 'on', pet.mode !== 'attack');
    }

    // Cast bar: fills for a cast, drains for a channel.
    const cast = S.cast, channel = S.channel;
    if (cast || channel) {
      const a = cast || channel, left = Math.max(0, a.end - S.t), span = a.end - a.start;
      setClass(el.castBar, 'idle', false);
      setClass(el.castBar, 'interrupted', false);
      setClass(el.castBar, 'channel', !!channel);
      setWidth(el.castFill, 100 * (channel ? left / span : 1 - left / span));
      setText(el.castText, c.spells[a.key].name + '  ' + left.toFixed(1));
    } else if (now < interruptedUntil) {
      setClass(el.castBar, 'idle', false);
      setClass(el.castBar, 'interrupted', true);
      setText(el.castText, 'Interrupted');
    } else {
      setClass(el.castBar, 'idle', true);
      setClass(el.castBar, 'interrupted', false);
    }
    setClass(el.error, 'show', now < errorUntil);

    // Action bar: cooldown sweep, what you cannot cast right now, what is being cast.
    const gcdLeft = Math.max(0, S.gcdReady - S.t), gcdSpan = Math.max(S.gcdReady - S.gcdStart, 0.001);
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i], key = slot.key;
      if (!key) continue;
      // A spell that is still being cast has no cooldown yet: it starts when the cast is complete.
      const own = cast && cast.key === key ? 0 : Math.max(0, (S.cds[key] || 0) - S.t);
      const span = key === 'racial' ? c.racial.cd : c.table[key].cd || 0, offGcd = key === 'racial' || key === 'baneOfHavoc';
      let frac = 0, text = '';
      if (own > gcdLeft && span) { frac = own / span; text = own >= 60 ? Math.ceil(own / 60) + 'm' : String(Math.ceil(own)); }
      else if (!offGcd && gcdLeft > 0) frac = gcdLeft / gcdSpan;
      setLeft(slot.cool, Math.min(1, frac));
      setText(slot.secs, text);
      const why = key === 'racial' || S.over ? null : combat.blocked(key, ctx);
      setClass(slot.button, 'no-mana', why === 'mana');
      setClass(slot.button, 'no-range', why === 'range');
      setClass(slot.button, 'unusable', why === 'shards' || why === 'health' || why === 'immolate' || why === 'dead' || S.over);
      setClass(slot.button, 'active', !!((cast && cast.key === key) || (channel && channel.key === key)));
      setClass(slot.button, 'queued', combat.queuedKey === key);
      setClass(slot.button, 'proc', (key === 'shadowBolt' && combat.buff('shadowTrance')) || (key === 'soulFire' && combat.buff('decimation')));
      // Soul Shards are shown only when they can run out (they do not, since the sim made them unlimited).
      setText(slot.count, c.spells[key] && c.spells[key].shards && isFinite(S.shards) ? String(S.shards) : key === 'racial' && S.eurekaCharges ? String(S.eurekaCharges) : '');
    }

    // Damage meter, a few times a second.
    const stamp = Math.floor(now * 4);
    if (stamp !== lastMeter) {
      lastMeter = stamp;
      const res = combat.result, time = combat.fightSeconds();
      setText(el.dps, whole(time > 0.5 ? res.total / time : 0));
      setText(el.damage, whole(res.total));
      setText(el.time, Math.floor(time / 60) + ':' + String(Math.floor(time % 60)).padStart(2, '0'));
      setText(el.threat, whole(time > 0.5 ? res.threat / time : 0) + ' a second');
      const sums = {};
      Object.keys(res.bySpell).forEach(function (k) {
        const base = k.replace(/^x\d:/, '');
        if (res.bySpell[k].dmg > 0) sums[base] = (sums[base] || 0) + res.bySpell[k].dmg;
      });
      const rows = Object.keys(sums).sort(function (a, b) { return sums[b] - sums[a]; }).slice(0, 7);
      while (el.spells.children.length > rows.length) el.spells.removeChild(el.spells.lastChild);
      while (el.spells.children.length < rows.length) {
        const li = document.createElement('li');
        li.append(document.createElement('i'), document.createElement('span'), document.createElement('span'));
        el.spells.appendChild(li);
      }
      const top = rows.length ? sums[rows[0]] : 1;
      rows.forEach(function (k, i) {
        const li = el.spells.children[i], dmg = sums[k], s = c.spells[k];
        setClass(li, 'fire', !!s && s.school === 'fire');
        setClass(li, 'pet', k.indexOf('pet:') === 0);
        setWidth(li.children[0], 100 * dmg / top);
        setText(li.children[1], s ? s.name : label(k));
        setText(li.children[2], whole(dmg) + '  ' + Math.round(100 * dmg / res.total) + '%');
      });
      if (c.targets > 1) {
        const parts = [];
        for (let i = 1; i <= c.targets; i++) parts.push(whole(res.byTarget[i]));
        setText(el.perDummy, parts.join(' · '));
      }
    }
  }

  // What to call damage that is not one of your own spells: the pet's attacks carry the pet's name.
  function label(key) {
    if (key === 'touchOfTheGrave') return 'Touch of the Grave';
    if (key === 'pet:brand') return 'Demonic Brand';
    if (key === 'pet:flametongue') return 'Flametongue Totem';
    if (PET_ATTACK[key]) return getName(character.build.pet) + ': ' + PET_ATTACK[key].charAt(0).toUpperCase() + PET_ATTACK[key].slice(1);
    return key;
  }

  // The sim's next cast, lit up on the bar (key: a spell or null; racial: the race's cooldown goes first).
  function setHint(key, racial) {
    slots.forEach(function (slot) {
      const on = !!slot.key && (slot.key === key || (racial && slot.key === 'racial'));
      setClass(slot.button, 'hint', on);
    });
  }
  // Your best in the fight that is set up now (text, or '' when there is none yet).
  function setBest(text, hint) {
    const dd = byId('meterBest');
    dd.textContent = text || '–';
    dd.title = hint || '';
    delete dd.dataset.tip;
  }

  // The DPS sim's result for this dummy: null while it is being worked out.
  let simAverage = null;
  function setSimAverage(result) {
    simAverage = result;
    el.sim.textContent = result ? whole(result.dps) + ' DPS' : '\u2026';
    el.sim.title = result ? 'The sim needs ' + result.seconds.toFixed(1) + ' s for the same total health (' + result.fights + ' fights)' : 'Calculating';
  }

  // ---------- things that happen ----------
  function showError(text) {
    el.error.textContent = text;
    errorUntil = clock + 1.6;
  }

  // Damage numbers, like the game's: gold for your spells, white for the pet, large with a pop for a crit. Each one
  // is tied to its dummy and placed anew every picture, so it stays over the dummy when the camera moves.
  const floats = [], FLOAT_LIFE = 1.5, LANES = [0, -40, 40, -20, 20];
  let lane = 0;
  const moveBanner = byId('moveBanner');
  function float(text, classes, anchor) {
    if (!anchor) return;
    const node = document.createElement('div');
    node.className = 'float ' + classes;
    node.textContent = text;
    node.style.opacity = '0';
    floaters.appendChild(node);
    floats.push({ node: node, anchor: anchor, born: clock, dx: LANES[lane++ % LANES.length], crit: classes.indexOf('crit') >= 0 });
    if (floats.length > 40) { floats[0].node.remove(); floats.shift(); }
  }
  function moveFloats(now) {
    for (let i = floats.length - 1; i >= 0; i--) {
      const fl = floats[i], age = now - fl.born;
      if (age >= FLOAT_LIFE) { fl.node.remove(); floats.splice(i, 1); continue; }
      if (!fl.anchor.visible) { fl.node.style.opacity = '0'; continue; }
      const pop = fl.crit ? 1 + 0.9 * Math.max(0, 1 - age / 0.18) : 1 + 0.25 * Math.max(0, 1 - age / 0.12);
      const rise = 62 + 64 * (1 - Math.pow(1 - age / FLOAT_LIFE, 2));
      fl.node.style.transform = 'translate(' + (fl.anchor.x + fl.dx).toFixed(1) + 'px,' + (fl.anchor.y - rise).toFixed(1) + 'px) translate(-50%, -50%) scale(' + pop.toFixed(3) + ')';
      fl.node.style.opacity = age > FLOAT_LIFE - 0.4 ? Math.max(0, (FLOAT_LIFE - age) / 0.4).toFixed(2) : '1';
    }
  }

  // The number that floats up for a hit, a tick or a miss.
  function floatFor(e, anchor) {
    if (e.type === 'miss') { if (!e.pet) float('Miss', 'miss', anchor); return; }
    float(whole(e.amount), (e.pet ? 'pet' : e.type === 'tick' ? 'small' : '') + (e.crit ? ' crit' : ''), anchor);
  }

  // e: an event from the casting rules; anchor: where the dummy's head is on the screen { x, y, visible };
  // quiet: write the log line but leave the floating number for later (a bolt is still on its way).
  function event(e, anchor, quiet) {
    const c = character, dummy = dummyName(e.target);
    const name = e.key && c.spells[e.key] ? c.spells[e.key].name : e.key === 'touchOfTheGrave' ? 'Touch of the Grave' : e.key === 'isb' ? 'Improved Shadow Bolt' : e.name || '';
    if (e.pet && (e.type === 'hit' || e.type === 'miss')) {
      const petName = getName(c.build.pet), attack = PET_ATTACK[e.key];
      const who = e.key === 'pet:brand' ? 'Demonic Brand' : e.key === 'pet:flametongue' ? 'Flametongue Totem' : e.key === 'pet:melee' ? petName : petName + "'s " + attack;
      if (e.type === 'miss') {
        log(e.dodge ? dummy + ' dodges ' + petName + '.' : who + ' misses ' + dummy + '.', 'miss');
      } else {
        log(who + (e.crit ? ' crits ' : ' hits ') + dummy + ' for ' + whole(e.amount) + (e.glance ? ' (glancing).' : e.crit ? '!' : '.'), e.crit ? 'crit' : '');
        if (!quiet) floatFor(e, anchor);
      }
    } else if (e.type === 'petMode') {
      log(getName(c.build.pet) + (e.mode === 'attack' ? ' attacks' + (c.targets > 1 ? ' ' + dummy : '') + '.' : ' follows you.'), 'proc');
    } else if (e.type === 'havoc') {
      float(whole(e.amount), 'small', anchor);
    } else if (e.type === 'target') {
      if (c.targets > 1) log((e.auto ? 'New target: ' : 'Target: ') + dummy + '.');
    } else if (e.type === 'petCast') {
      // shown by the Imp itself
    } else if (e.type === 'hit') {
      log(name + (e.crit ? ' crits ' : ' hits ') + dummy + ' for ' + whole(e.amount) + (e.crit ? '!' : '.'), e.crit ? 'crit' : '');
      if (!quiet) floatFor(e, anchor);
    } else if (e.type === 'tick') {
      log(name + ' ticks ' + (c.targets > 1 ? dummy + ' ' : '') + 'for ' + whole(e.amount) + (e.crit ? ' (crit).' : '.'), e.crit ? 'crit' : '');
      floatFor(e, anchor);
    } else if (e.type === 'miss') {
      log(name + ' misses ' + dummy + '.', 'miss');
      if (!quiet) floatFor(e, anchor);
    } else if (e.type === 'apply') {
      log(dummy + ' is afflicted by ' + (e.key === 'brand' ? 'Demonic Brand' : name) + '.');
    } else if (e.type === 'mana') {
      if (e.amount >= 0.5) log('+' + whole(e.amount) + ' mana (' + e.source + ').', 'gain');
    } else if (e.type === 'proc') {
      log('You gain ' + AURA_INFO[e.name].name + '.', 'proc');
    } else if (e.type === 'used') {
      log('You use ' + e.name + '.', 'proc');
    } else if (e.type === 'expire') {
      log(AURA_INFO[e.name].name + ' fades.');
    } else if (e.type === 'consume') {
      log('Conflagrate consumes ' + name + '.');
    } else if (e.type === 'refund') {
      log('Shadow and Flame returns the Soul Shard.', 'proc');
    } else if (e.type === 'interrupt') {
      if (e.reason === 'health') { interruptedUntil = clock + 0.7; log(name + ' stops: its next tick would kill you.', 'miss'); }
      else if (e.reason !== 'clipped' && e.reason !== 'dead') { interruptedUntil = clock + 0.7; log(name + ' interrupted.', 'miss'); }
    } else if (e.type === 'heal') {
      if (e.amount >= 0.5) log('You are healed for ' + whole(e.amount) + '.', 'gain');
    } else if (e.type === 'selfHit') {
      // Hellfire burning you: it shows on your health bar
    } else if (e.type === 'pushback') {
      log(name + (e.channel ? ' cut short by ' : ' pushed back ') + e.lost.toFixed(1) + ' s.', 'miss');
    } else if (e.type === 'pushResist') {
      log('You keep casting through the hit.');
    } else if (e.type === 'fail') {
      showError(e.text);
    } else if (e.type === 'death') {
      if (!e.last) { log(dummy + ' dies.', 'crit'); return; }
      log((e.timed ? 'Time is up. ' : dummy + ' dies. ') + whole(e.total) + ' damage in ' + e.seconds.toFixed(1) + ' s: ' + whole(e.dps) + ' DPS.', 'crit');
      if (simAverage) log('The sim averages ' + whole(simAverage.dps) + ' DPS here. You: ' + Math.round(100 * e.dps / simAverage.dps) + '%.', 'proc');
      log('Reset starts a new fight. "Review the fight" shows where the time went.');
    }
  }

  return {
    log: log, render: render, event: event, setCharacter: setCharacter, setRings: setRings, showError: showError,
    setSimAverage: setSimAverage, floatFor: floatFor, setSound: setSound, setHint: setHint, setBest: setBest, setPull: setPull,
    labelFor: labelFor,
    fullLog: function () { return everything.join('\n'); },
    setKeys: function (list) { codes = list.slice(); showKeyLabels(); if (character) showBinds(); },
    setBinds: function (map) { binds = map; if (character) showBinds(); },
    anyPanelOpen: function () { return Object.keys(panels).some(function (k) { return !panels[k].hidden; }); },
    closePanels: function () { let any = false; Object.keys(panels).forEach(function (k) { if (!panels[k].hidden) any = true; }); showPanel(null); return any; },
    simAverage: function () { return simAverage; }, dummyName: dummyName,
    petName: function () { return character && character.build.pet ? getName(character.build.pet) : ''; }
  };
}
