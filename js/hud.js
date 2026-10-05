// The frames and bars around the scene: unit frames, buffs and debuffs, cast bar, action bar, combat log, damage
// meter, floating damage numbers, and the pickers for build and race.
import { getName, setName, maxLength } from './names.js';
import { parseHealth } from './settings.js';

export const ACTION_CODES = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'KeyR', 'KeyF', 'KeyT', 'KeyG'];
const DEFAULT_LABELS = ['1', '2', '3', '4', '5', '6', '7', '8', 'R', 'F', 'T', 'G'];
const LOG_LINES = 9;

function byId(id) { return document.getElementById(id); }
function whole(n) { return Math.round(n).toLocaleString('en-US'); }

// Only touch the page when something really changed (this runs every picture).
function setText(el, text) { if (el._text !== text) { el._text = text; el.textContent = text; } }
function setWidth(el, pct) { const w = pct.toFixed(1) + '%'; if (el._width !== w) { el._width = w; el.style.width = w; } }
function setHeight(el, pct) { const h = pct.toFixed(0) + '%'; if (el._height !== h) { el._height = h; el.style.height = h; } }
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
const PET_KIND = { imp: 'Imp', succubus: 'Succubus' };
const PET_ATTACK = { 'pet:firebolt': 'Firebolt', 'pet:lashOfPain': 'Lash of Pain', 'pet:melee': 'melee', 'pet:brand': 'Demonic Brand' };
const RACIAL_ICON = { 'Blood Fury': 'racial_bloodFury', 'Berserking': 'racial_berserking', 'Eureka!': 'racial_eureka' };

export function createHud(WL, handlers) {
  const hud = byId('hud'), logLines = byId('logLines'), floaters = byId('floaters');
  const el = {
    distance: byId('targetDistance'), mana: byId('playerMana'), manaFill: byId('playerManaFill'), health: byId('playerHealth'),
    targetFrame: byId('targetFrame'), targetHealth: byId('targetHealth'), targetFill: byId('targetHealthFill'), executeMark: byId('executeMark'),
    debuffs: byId('targetDebuffs'), buffs: byId('playerBuffs'),
    castBar: byId('castBar'), castFill: byId('castFill'), castText: byId('castText'), error: byId('errorText'),
    bar: byId('actionBar'), dps: byId('meterDps'), damage: byId('meterDamage'), time: byId('meterTime'), spells: byId('meterSpells'),
    buildLabel: byId('buildLabel'), sim: byId('meterSim'),
    petFrame: byId('petFrame'), petSub: byId('petSub'), petManaFill: byId('petManaFill'),
    petAttack: byId('btnPetAttack'), petFollow: byId('btnPetFollow')
  };
  let labels = DEFAULT_LABELS.slice(), slots = [], character = null;

  // Desktop only, but keep the frames from overlapping in a small window.
  function fit() { hud.style.zoom = String(Math.min(1, Math.max(0.5, window.innerWidth / 1280))); }
  window.addEventListener('resize', fit);
  fit();

  // The letters printed on the slots follow the keyboard in use (the keys themselves are chosen by position).
  if (navigator.keyboard && navigator.keyboard.getLayoutMap) {
    navigator.keyboard.getLayoutMap().then(function (map) {
      labels = ACTION_CODES.map(function (code, i) { const k = map.get(code); return k ? k.toUpperCase() : DEFAULT_LABELS[i]; });
      slots.forEach(function (slot, i) { slot.kbd.textContent = labels[i]; });
    }).catch(function () {});
  }

  // ---------- combat log ----------
  function log(text, kind) {
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
    const health = parseHealth(value);
    if (health === null) { showError('Health must be a number from 100 to 100,000,000'); return; }
    handlers.onDummyHealth(health);
  });

  // ---------- pickers ----------
  const panels = { build: byId('buildPanel'), race: byId('racePanel'), keys: byId('keysPanel') };
  const panelButtons = { build: byId('btnBuild'), race: byId('btnRace'), keys: byId('btnKeys') };
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
    WL.BUILDS.forEach(function (b) {
      const button = document.createElement('button');
      button.type = 'button';
      if (b.pet && WL.ICONS['pet_' + b.pet]) { const img = document.createElement('img'); img.src = WL.ICONS['pet_' + b.pet]; img.alt = ''; button.appendChild(img); }
      else { const gap = document.createElement('span'); gap.className = 'no-icon'; button.appendChild(gap); }
      button.appendChild(document.createTextNode(b.short));
      const pet = document.createElement('small');
      pet.textContent = b.pet === 'imp' ? 'Imp' : b.pet === 'succubus' ? 'Succubus' : 'no pet';
      button.appendChild(pet);
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

  document.querySelectorAll('#hud button.soon').forEach(function (button) {
    button.title = 'Not built yet';
    button.addEventListener('click', function () { log(button.dataset.soon + ': not built yet.'); });
  });
  const ringsButton = byId('btnRings');
  ringsButton.addEventListener('click', function () { setRings(!ringsButton.classList.contains('on')); handlers.onRings(ringsButton.classList.contains('on')); });
  function setRings(on) { ringsButton.classList.toggle('on', on); ringsButton.setAttribute('aria-pressed', String(on)); }
  byId('btnReset').addEventListener('click', function () { handlers.onReset(); });
  el.petAttack.addEventListener('click', function () { el.petAttack.blur(); handlers.onPet('attack'); });
  el.petFollow.addEventListener('click', function () { el.petFollow.blur(); handlers.onPet('follow'); });

  // ---------- the character on screen ----------
  // c: { build, raceKey, stats, table, spells, bar: [spell keys], racial, dummyHealth, executePct }
  function setCharacter(c) {
    character = c;
    byId('playerPortrait').src = WL.ICONS['race_' + c.raceKey];
    byId('playerSub').textContent = 'Level 60 ' + WL.RACES[c.raceKey].name;
    el.health.textContent = whole(c.stats.maxHealth) + ' / ' + whole(c.stats.maxHealth);
    el.buildLabel.textContent = c.build.short;
    el.buildLabel.title = c.build.name;
    el.executeMark.style.left = c.executePct + '%';

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
    slots = ACTION_CODES.map(function (code, i) {
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
        button.title = tooltip(key, name, c);
        button.addEventListener('click', function () { button.blur(); handlers.onPress(key); });
      }
      slot.kbd.textContent = labels[i];
      button.appendChild(slot.kbd);
      el.bar.appendChild(button);
      return slot;
    });
    lastMeter = -1; lastAuras = { debuffs: '', buffs: '' };
  }

  function tooltip(key, name, c) {
    if (key === 'racial') return name + '\n' + c.racial.cd + ' s cooldown, not on the global cooldown';
    const e = c.table[key], s = c.spells[key], parts = [];
    parts.push(e.cost ? Math.round(e.cost) + ' mana' : 'No mana cost');
    if (e.range) parts.push(e.range + ' yd range');
    parts.push(s.kind === 'channel' ? 'Channelled, ' + s.duration + ' s' : e.cast ? e.cast + ' s cast' : 'Instant');
    if (e.cd) parts.push(e.cd + ' s cooldown');
    if (s.shards) parts.push('1 Soul Shard');
    const text = WL.SPELL_TEXT && WL.SPELL_TEXT[key];
    return name + '\n' + parts.join(' · ') + (typeof text === 'string' ? '\n\n' + text : '');
  }

  // ---------- every picture ----------
  let lastMeter = -1, lastAuras = { debuffs: '', buffs: '' }, errorUntil = 0, interruptedUntil = 0, clock = 0;

  function auraList(holder, which, list) {
    const id = list.map(function (a) { return a.key; }).join(',');
    if (lastAuras[which] !== id) {
      lastAuras[which] = id;
      holder.textContent = '';
      list.forEach(function (a) {
        const box = document.createElement('span');
        box.className = 'aura';
        box.title = a.name;
        const img = document.createElement('img');
        img.src = WL.ICONS[a.icon] || ''; img.alt = a.name;
        const b = document.createElement('b');
        box.append(img, b);
        holder.appendChild(box);
      });
    }
    list.forEach(function (a, i) { setText(holder.children[i].lastChild, a.text); });
  }
  function seconds(left) { return left === Infinity ? '' : left >= 60 ? Math.ceil(left / 60) + 'm' : left >= 9.5 ? String(Math.round(left)) : left.toFixed(1); }

  // combat: the object from createCombat; ctx: { distance, moving }; now: seconds since the page started.
  function render(combat, ctx, now) {
    clock = now;
    const S = combat.state, c = character;

    setText(el.distance, ctx.distance.toFixed(1) + ' yd');
    setClass(el.distance, 'far', ctx.distance > c.maxRange);

    const mana = Math.min(S.mana, c.stats.maxMana);
    setText(el.mana, whole(mana) + ' / ' + whole(c.stats.maxMana));
    setWidth(el.manaFill, 100 * mana / c.stats.maxMana);
    setText(el.targetHealth, whole(Math.ceil(S.health)) + ' / ' + whole(S.maxHealth));
    setWidth(el.targetFill, 100 * S.health / S.maxHealth);
    setClass(el.targetFrame, 'execute', !S.over && combat.executePhase());

    // Debuffs on the dummy, then your own buffs.
    const debuffs = Object.keys(S.dots).filter(function (k) { return combat.dotLeft(k) > 0; }).map(function (k) {
      return { key: k, icon: k, name: c.spells[k].name, text: seconds(combat.dotLeft(k)) };
    });
    ['coe', 'isb'].forEach(function (k) { if (combat.buff(k)) debuffs.push({ key: k, icon: AURA_INFO[k].icon, name: AURA_INFO[k].name, text: seconds(S.buffs[k] - S.t) }); });
    if (combat.buff('brand') && S.brandCharges > 0) debuffs.push({ key: 'brand', icon: AURA_INFO.brand.icon, name: AURA_INFO.brand.name, text: 'x' + S.brandCharges });
    auraList(el.debuffs, 'debuffs', debuffs);
    const buffs = [];
    ['shadowTrance', 'decimation', 'bloodFury', 'berserking', 'snfShadow', 'snfFire'].forEach(function (k) {
      if (combat.buff(k)) buffs.push({ key: k, icon: AURA_INFO[k].icon, name: AURA_INFO[k].name, text: seconds(S.buffs[k] - S.t) });
    });
    if (combat.eurekaUp()) buffs.push({ key: 'eureka', icon: AURA_INFO.eureka.icon, name: AURA_INFO.eureka.name, text: 'x' + S.eurekaCharges });
    auraList(el.buffs, 'buffs', buffs);

    // The pet: what it is doing, and its mana.
    const pet = combat.pet;
    if (pet) {
      const doing = S.over ? 'idle' : pet.active ? 'attacking' : pet.mode === 'attack' ? 'running in' : 'following';
      setText(el.petSub, PET_KIND[pet.key] + ', ' + doing);
      setWidth(el.petManaFill, 100 * combat.petMana() / pet.maxMana);
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
      const own = Math.max(0, (S.cds[key] || 0) - S.t);
      const span = key === 'racial' ? c.racial.cd : c.table[key].cd || 0;
      let frac = 0, text = '';
      if (own > gcdLeft && span) { frac = own / span; text = own >= 60 ? Math.ceil(own / 60) + 'm' : String(Math.ceil(own)); }
      else if (key !== 'racial' && gcdLeft > 0) frac = gcdLeft / gcdSpan;
      setHeight(slot.cool, 100 * Math.min(1, frac));
      setText(slot.secs, text);
      const why = key === 'racial' || S.over ? null : combat.blocked(key, ctx);
      setClass(slot.button, 'no-mana', why === 'mana');
      setClass(slot.button, 'no-range', why === 'range');
      setClass(slot.button, 'unusable', why === 'shards' || why === 'immolate' || S.over);
      setClass(slot.button, 'active', !!((cast && cast.key === key) || (channel && channel.key === key)));
      setClass(slot.button, 'queued', combat.queuedKey === key);
      setClass(slot.button, 'proc', (key === 'shadowBolt' && combat.buff('shadowTrance')) || (key === 'soulFire' && combat.buff('decimation')));
      setText(slot.count, c.spells[key] && c.spells[key].shards ? String(S.shards) : key === 'racial' && S.eurekaCharges ? String(S.eurekaCharges) : '');
    }

    // Damage meter, a few times a second.
    const stamp = Math.floor(now * 4);
    if (stamp !== lastMeter) {
      lastMeter = stamp;
      const res = combat.result, time = combat.fightSeconds();
      setText(el.dps, whole(time > 0.5 ? res.total / time : 0));
      setText(el.damage, whole(res.total));
      setText(el.time, Math.floor(time / 60) + ':' + String(Math.floor(time % 60)).padStart(2, '0'));
      const rows = Object.keys(res.bySpell).filter(function (k) { return res.bySpell[k].dmg > 0; })
        .sort(function (a, b) { return res.bySpell[b].dmg - res.bySpell[a].dmg; }).slice(0, 7);
      while (el.spells.children.length > rows.length) el.spells.removeChild(el.spells.lastChild);
      while (el.spells.children.length < rows.length) {
        const li = document.createElement('li');
        li.append(document.createElement('i'), document.createElement('span'), document.createElement('span'));
        el.spells.appendChild(li);
      }
      const top = rows.length ? res.bySpell[rows[0]].dmg : 1;
      rows.forEach(function (k, i) {
        const li = el.spells.children[i], dmg = res.bySpell[k].dmg, s = c.spells[k];
        setClass(li, 'fire', !!s && s.school === 'fire');
        setClass(li, 'pet', k.indexOf('pet:') === 0);
        setWidth(li.children[0], 100 * dmg / top);
        setText(li.children[1], s ? s.name : label(k));
        setText(li.children[2], whole(dmg) + '  ' + Math.round(100 * dmg / res.total) + '%');
      });
    }
  }

  // What to call damage that is not one of your own spells: the pet's attacks carry the pet's name.
  function label(key) {
    if (key === 'touchOfTheGrave') return 'Touch of the Grave';
    if (key === 'pet:brand') return 'Demonic Brand';
    if (PET_ATTACK[key]) return getName(character.build.pet) + ': ' + PET_ATTACK[key].charAt(0).toUpperCase() + PET_ATTACK[key].slice(1);
    return key;
  }

  // The DPS sim's result for this dummy: null while it is being worked out.
  let simAverage = null;
  function setSimAverage(result) {
    simAverage = result;
    el.sim.textContent = result ? whole(result.dps) + ' DPS' : '\u2026';
    el.sim.title = result ? 'The sim kills this dummy in ' + result.seconds.toFixed(1) + ' s on average (' + result.fights + ' fights)' : 'Calculating';
  }

  // ---------- things that happen ----------
  function showError(text) {
    el.error.textContent = text;
    errorUntil = clock + 1.6;
  }

  function float(text, classes, anchor) {
    if (!anchor || !anchor.visible) return;
    const node = document.createElement('div');
    node.className = 'float ' + classes;
    node.textContent = text;
    node.style.left = (anchor.x + (Math.random() * 90 - 45)) + 'px';
    node.style.top = (anchor.y + (Math.random() * 30 - 15)) + 'px';
    node.addEventListener('animationend', function () { node.remove(); });
    floaters.appendChild(node);
  }

  // The number that floats up for a hit, a tick or a miss.
  function floatFor(e, anchor) {
    if (e.type === 'miss') { if (!e.pet) float('Miss', 'miss', anchor); return; }
    const school = e.school === 'fire' ? 'fire' : '';
    float(whole(e.amount), (e.pet ? 'pet' : e.type === 'tick' ? 'tick ' + school : school) + (e.crit ? ' crit' : ''), anchor);
  }

  // e: an event from the casting rules; anchor: where the dummy's head is on the screen { x, y, visible };
  // quiet: write the log line but leave the floating number for later (a bolt is still on its way).
  function event(e, anchor, quiet) {
    const c = character, dummy = getName('dummy');
    const name = e.key && c.spells[e.key] ? c.spells[e.key].name : e.key === 'touchOfTheGrave' ? 'Touch of the Grave' : e.key === 'isb' ? 'Improved Shadow Bolt' : e.name || '';
    if (e.pet && (e.type === 'hit' || e.type === 'miss')) {
      const petName = getName(c.build.pet), attack = PET_ATTACK[e.key];
      const who = e.key === 'pet:brand' ? 'Demonic Brand' : e.key === 'pet:melee' ? petName : petName + "'s " + attack;
      if (e.type === 'miss') {
        log(e.dodge ? dummy + ' dodges ' + petName + '.' : who + ' misses ' + dummy + '.', 'miss');
      } else {
        log(who + (e.crit ? ' crits ' : ' hits ') + dummy + ' for ' + whole(e.amount) + (e.glance ? ' (glancing).' : e.crit ? '!' : '.'), e.crit ? 'crit' : '');
        if (!quiet) floatFor(e, anchor);
      }
    } else if (e.type === 'petMode') {
      log(getName(c.build.pet) + (e.mode === 'attack' ? ' attacks.' : ' follows you.'), 'proc');
    } else if (e.type === 'petCast') {
      // shown by the Imp itself
    } else if (e.type === 'hit') {
      log(name + (e.crit ? ' crits ' : ' hits ') + dummy + ' for ' + whole(e.amount) + (e.crit ? '!' : '.'), e.crit ? 'crit' : '');
      if (!quiet) floatFor(e, anchor);
    } else if (e.type === 'tick') {
      log(name + ' ticks for ' + whole(e.amount) + (e.crit ? ' (crit).' : '.'), e.crit ? 'crit' : '');
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
      if (e.reason !== 'clipped') { interruptedUntil = clock + 0.7; log(name + ' interrupted.', 'miss'); }
    } else if (e.type === 'fail') {
      showError(e.text);
    } else if (e.type === 'death') {
      log(dummy + ' dies. ' + whole(e.total) + ' damage in ' + e.seconds.toFixed(1) + ' s: ' + whole(e.dps) + ' DPS.', 'crit');
      if (simAverage) log('The sim averages ' + whole(simAverage.dps) + ' DPS here. You: ' + Math.round(100 * e.dps / simAverage.dps) + '%.', 'proc');
      log('Press Reset to fight again.');
    }
  }

  return {
    log: log, render: render, event: event, setCharacter: setCharacter, setRings: setRings, showError: showError,
    setSimAverage: setSimAverage, floatFor: floatFor
  };
}
