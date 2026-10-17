// The bar on the right and what it switches on or opens:
//   - the rotation panel (what the sim plays), the race against the sim, mistake callouts;
//   - the character, talents and buffs sheets - read-only, because all of it comes from the Warlock SIM;
//   - latency, fight presets, the volume, a link to share, and copying the combat log.
// Challenges (today's fight, drills, scripted encounters and the seeded fight), Lessons and Progress have windows of
// their own, opened by the buttons on the left.
// The rules of the fight are not in here: this file only shows things and tells main.js what was chosen.
import { getSetting, setSetting } from './settings.js';
import { setTip } from './tooltip.js';
import { ACTION_SPELLS } from './combat.js';
import { ENCOUNTERS, simFight } from './encounter.js';
import { ROBES } from './warlock.js';
import { lessonsFor } from './lessons.js';
import { drawProgress } from './progress.js';

// Drills: short fights with one thing to practise. They do not change your saved fight settings.
export const DRILLS = [
  { id: 'opener', name: 'Opener', text: '30 seconds on one dummy. The first casts decide it.', targets: 1, fight: { timed: true, seconds: 30 } },
  { id: 'execute', name: 'Execute phase', text: '45 seconds on a dummy that is in execute range from the first second.', targets: 1, fight: { timed: true, seconds: 45 }, executePct: 100 },
  { id: 'threeDummies', name: 'Three dummies', text: '90 seconds on three dummies: keep your DoTs on all of them.', targets: 3, fight: { timed: true, seconds: 90 } },
  { id: 'movement', name: 'Movement', text: 'Two minutes. Every 20 seconds you have to move for 5.', targets: 1, fight: { timed: true, seconds: 120, moveEvery: 20, moveDuration: 5 } },
  { id: 'underFire', name: 'Under fire', text: '90 seconds while you take a hit every 2 seconds.', targets: 1, fight: { timed: true, seconds: 90, hitEvery: 2 } },
  { id: 'longHaul', name: 'Long haul', text: 'Five minutes on one dummy. Mana decides it.', targets: 1, fight: { timed: true, seconds: 300 } },
  { id: 'procs', name: 'Proc watch', text: 'Three minutes on three dummies in execute range: with DoTs on all of them Shadow Trance comes most often, and Decimation builds get theirs. The review says how fast you used each proc.',
    targets: 3, fight: { timed: true, seconds: 180 }, executePct: 100, procs: true }
];
// Today's fight: one a day, the same for everyone (the dice are fixed by the date), with your own build. The kind of
// fight changes from day to day in this order. A day is a day in UTC, so it changes at the same moment everywhere.
const DAILY = [
  { text: 'Two minutes on one dummy.', targets: 1, fight: { timed: true, seconds: 120 } },
  { text: 'Ninety seconds on three dummies.', targets: 3, fight: { timed: true, seconds: 90 } },
  { text: 'Two and a half minutes on one dummy; every 25 seconds you have to move for 4.', targets: 1, fight: { timed: true, seconds: 150, moveEvery: 25, moveDuration: 4 } },
  { text: 'Two minutes on two dummies.', targets: 2, fight: { timed: true, seconds: 120 } },
  { text: 'Two minutes on one dummy while you take a hit every 3 seconds.', targets: 1, fight: { timed: true, seconds: 120, hitEvery: 3 } },
  { text: 'One minute on a dummy that is in execute range from the first second.', targets: 1, fight: { timed: true, seconds: 60 }, executePct: 100 },
  { text: 'Three minutes on one dummy.', targets: 1, fight: { timed: true, seconds: 180 } }
];
const DAY = 86400000;
function dayKey(offset) { return new Date(Date.now() + (offset || 0) * DAY).toISOString().slice(0, 10); }   // 'YYYY-MM-DD' in UTC
function dayWords(key) { return new Date(key + 'T12:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' }); }
export function dailyFor(key) {
  const v = DAILY[Math.floor(Date.parse(key + 'T00:00:00Z') / DAY) % DAILY.length];
  return { id: 'daily', daily: true, seeded: true, day: key, name: 'Today\'s fight (' + dayWords(key) + ')', word: key, seed: Number(key.replace(/-/g, '')),
           targets: v.targets, fight: Object.assign({}, v.fight), executePct: v.executePct, share: 'daily:' + key,
           text: v.text + ' Everyone has the same dice today.' };
}
// Days in a row with today's fight played: up to today, or up to yesterday while today is still open. And the longest.
function streaks(days) {
  let now = 0;
  for (let d = days[dayKey(0)] ? 0 : 1; days[dayKey(-d)]; d++) now++;
  let longest = 0, run = 0, prev = null;
  Object.keys(days).sort().forEach(function (k) {
    run = prev && Date.parse(k + 'T00:00:00Z') - Date.parse(prev + 'T00:00:00Z') === DAY ? run + 1 : 1;
    longest = Math.max(longest, run); prev = k;
  });
  return { now: now, longest: longest, today: !!days[dayKey(0)] };
}

// Presets: one click for a common fight. These do change your saved fight settings.
export const PRESETS = [
  { name: '1 dummy, 50,000 health', dummies: 1, health: 50000, fight: { timed: false, seconds: 120, moveEvery: 0, moveDuration: 0, hitEvery: 0 } },
  { name: '1 dummy, 3 minutes', dummies: 1, fight: { timed: true, seconds: 180, moveEvery: 0, moveDuration: 0, hitEvery: 0 } },
  { name: '2 dummies, 2 minutes, moving', dummies: 2, fight: { timed: true, seconds: 120, moveEvery: 30, moveDuration: 5, hitEvery: 0 } },
  { name: '3 dummies, 2 minutes', dummies: 3, fight: { timed: true, seconds: 120, moveEvery: 0, moveDuration: 0, hitEvery: 0 } }
];
// How a drill is graded: your DPS as a share of what the sim reaches in the same fight.
export function gradeFor(pct) { return pct >= 100 ? 'S' : pct >= 95 ? 'A' : pct >= 88 ? 'B' : pct >= 78 ? 'C' : 'D'; }

// Robes are earned with grades in the challenges (drills and encounters alike). What each one takes:
const ROBE_HOW = { violet: 'Yours from the start.', ash: 'Finish any challenge.', fel: 'A grade of B or better in any challenge.', ember: 'An A or better in three challenges.',
                   frost: 'An S in any challenge.', bone: 'An A or better in every encounter.', void: 'An S in five challenges.', gold: 'An S in every drill and every encounter.' };
const GRADE_RANK = { S: 5, A: 4, B: 3, C: 2, D: 1 };
// drills: your best per challenge ({ id: { grade } }). Returns { robe key: true when you may wear it }.
export function robesEarned(drills) {
  const rank = function (d) { return GRADE_RANK[((drills || {})[d.id] || {}).grade] || 0; };
  const all = DRILLS.concat(ENCOUNTERS).map(rank), fights = ENCOUNTERS.map(rank);
  const count = function (min) { return all.filter(function (g) { return g >= min; }).length; };
  return { violet: true, ash: count(1) >= 1, fel: count(3) >= 1, ember: count(4) >= 3, frost: count(5) >= 1,
           bone: fights.every(function (g) { return g >= 4; }), void: count(5) >= 5, gold: all.every(function (g) { return g >= 5; }) };
}

const SHOW_DEFAULT = { rotation: false, race: true, callouts: false, dotBars: false, hint: false, opener: false, ghost: true, alerts: true };
const FROM_SIM = 'Read-only: this comes from the Warlock SIM. To change it, change it there and bring the codes over with Import.';
const TREES = [['affliction', 'Affliction'], ['demonology', 'Demonology'], ['destruction', 'Destruction']];
const STATS = [
  ['maxHealth', 'Health', 0], ['maxMana', 'Mana', 0], ['int', 'Intellect', 0], ['spi', 'Spirit', 0], ['sta', 'Stamina', 0],
  ['sp', 'Spell power', 0], ['shadowSp', 'Shadow spell power', 0, true], ['fireSp', 'Fire spell power', 0, true],
  ['hitPct', 'Spell hit chance', 1, false, '%'], ['critPct', 'Spell crit chance', 2, false, '%'], ['hastePct', 'Spell haste', 1, false, '%'],
  ['mp5', 'Mana every 5 s', 0], ['shadowDmgPct', 'Shadow damage', 1, true, '%'], ['fireDmgPct', 'Fire damage', 1, true, '%'], ['allDmgPct', 'All damage', 1, true, '%']
];
const WATCHED = ['immolate', 'corruption', 'baneOfAgony', 'siphonLife'];   // DoTs whose falling off is worth a word
// The gear builder of the Warlock SIM: its slots and the stats an item can carry (an imported code may hold them).
const SLOT_NAMES = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Back', chest: 'Chest', shirt: 'Shirt', tabard: 'Tabard', wrist: 'Wrist',
                     hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Ring', finger2: 'Ring', trinket1: 'Trinket', trinket2: 'Trinket',
                     mainHand: 'Main Hand', offHand: 'Off Hand', ranged: 'Wand' };
const GEAR_STATS = [['sp', ' spell power'], ['shadowSp', ' Shadow spell power'], ['fireSp', ' Fire spell power'], ['hitPct', '% hit'], ['critPct', '% crit'],
                    ['hastePct', '% haste'], ['pierce', ' Spell Pierce'], ['int', ' Intellect'], ['spi', ' Spirit'], ['sta', ' Stamina'], ['mp5', ' mana every 5 s']];
function statText(stats) {
  return GEAR_STATS.filter(function (g) { return +(stats || {})[g[0]]; }).map(function (g) { const v = +stats[g[0]]; return (v > 0 ? '+' : '\u2212') + Math.abs(v) + g[1]; }).join(', ');
}

function byId(id) { return document.getElementById(id); }
function whole(n) { return Math.round(n).toLocaleString('en-US'); }
function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function tidy(text) { return String(text).replace(/\s*\[A\d+\]/g, '').replace(/\s*\*\s*\(+1\)+/g, '').replace(/ {2,}/g, ' '); }
function copyText(text, button) {
  function done(ok) {
    const before = button.textContent;
    button.textContent = ok ? 'Copied' : 'Could not copy';
    window.setTimeout(function () { button.textContent = before; }, 1500);
  }
  function fallback() {
    const box = document.createElement('textarea');
    box.value = text;
    box.style.position = 'fixed'; box.style.opacity = '0';
    document.body.appendChild(box);
    box.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    box.remove();
    done(ok);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
  else fallback();
}

// handlers: onChallenge(challenge or null), onPreset(preset), onLatency(ms), onVolume(0..1), shareLink() -> address,
//           fullLog() -> text, log(text, kind), onRobe(key), onUiScale(0.8..1.4)
export function createExtras(WL, handlers) {
  let character = null, config = null, leftOut = [], challenge = null;
  function show() { return Object.assign({}, SHOW_DEFAULT, getSetting('show') || {}); }

  // ---------- the switches ----------
  const rotationPanel = byId('rotationPanel'), race = byId('race');
  const switches = { rotation: byId('swRotation'), race: byId('swRace'), callouts: byId('swCallouts'), dotBars: byId('swDotBars'), hint: byId('swHint'), opener: byId('swOpener'),
                    ghost: byId('swGhost'), alerts: byId('swAlerts') };
  function applyShow() {
    const s = show();
    Object.keys(switches).forEach(function (k) { switches[k].checked = !!s[k]; });
    rotationPanel.hidden = !s.rotation;
    race.hidden = !s.race;
    document.documentElement.classList.toggle('alerts', !!s.alerts);   // the strong glow on a button whose proc is up
  }
  Object.keys(switches).forEach(function (k) {
    switches[k].addEventListener('change', function () {
      const s = show();
      s[k] = switches[k].checked;
      setSetting('show', s);
      switches[k].blur();
      applyShow();
    });
  });
  applyShow();

  // ---------- rotation panel ----------
  function fillRotation() {
    const list = byId('rotationList'), build = character.build;
    list.textContent = '';
    build.rotation.forEach(function (action) {
      const li = document.createElement('li'), spell = (ACTION_SPELLS[action] || [])[0];
      li.dataset.action = action;                          // the sim's next cast lights up its line
      const icon = spell && WL.ICONS[spell];
      if (icon) { const img = document.createElement('img'); img.src = icon; img.alt = ''; li.appendChild(img); }
      else li.appendChild(el('span', null, 'no-icon'));
      const text = (WL.actionLabel && WL.actionLabel(build, action)) || (WL.ACTIONS[action] && WL.ACTIONS[action].label) || action;
      li.appendChild(el('span', tidy(text)));
      list.appendChild(li);
    });
  }

  // ---------- the sheets: character, talents, buffs ----------
  const sheet = byId('sheet'), sheetBody = byId('sheetBody'), tabs = { character: byId('tabCharacter'), talents: byId('tabTalents'), buffs: byId('tabBuffs') };
  let openTab = null;
  function statValue(key) {
    const s = character.stats;
    if (key === 'shadowSp') return s.sp + ((s.schoolSp && s.schoolSp.shadow) || 0);
    if (key === 'fireSp') return s.sp + ((s.schoolSp && s.schoolSp.fire) || 0);
    if (key === 'shadowDmgPct') return ((s.mult && s.mult.shadow) || 1) * 100 - 100;
    if (key === 'fireDmgPct') return ((s.mult && s.mult.fire) || 1) * 100 - 100;
    if (key === 'allDmgPct') return ((s.mult && s.mult.all) || 1) * 100 - 100;
    return s[key];
  }
  function characterSheet() {
    const s = character.stats, table = document.createElement('table'), body = document.createElement('tbody');
    const head = document.createElement('tr');
    ['', '', 'Where it comes from'].forEach(function (h, i) { const th = el('th', h); if (i === 1) th.className = 'num'; head.appendChild(th); });
    const thead = document.createElement('thead'); thead.appendChild(head); table.appendChild(thead);
    STATS.forEach(function (row) {
      const value = statValue(row[0]);
      if (value == null || (row[3] && Math.abs(value - (row[0].indexOf('Sp') > 0 ? s.sp : 0)) < 0.05)) return;   // skip a school line that adds nothing
      const tr = document.createElement('tr'), unit = row[4] || '';
      tr.appendChild(el('td', row[1]));
      tr.appendChild(el('td', (row[2] ? value.toFixed(row[2]).replace(/\.?0+$/, '') : whole(value)) + unit, 'num'));
      const from = (s.breakdown || []).filter(function (b) { return b.stat === row[0]; })
        .map(function (b) { return tidy(b.source) + ' ' + (Math.round(b.value * 10) / 10); }).join(' · ');
      tr.appendChild(el('td', from, 'from'));
      body.appendChild(tr);
    });
    table.appendChild(body);
    sheetBody.appendChild(el('p', character.build.name + ' · ' + WL.RACES[character.raceKey].name + ' · level 60', 'review-head'));
    sheetBody.appendChild(table);
    gearList();
    if (character.build.notes) { sheetBody.appendChild(el('h3', 'Notes on this build')); sheetBody.appendChild(el('p', tidy([].concat(character.build.notes).join(' ')), 'hint')); }
  }
  // The items you wear, when the imported settings come from the Warlock SIM's gear builder. The numbers above
  // already hold them (the sim adds them up into the gear values); this only says what they are.
  function gearList() {
    const gb = config && config.gearBuilder;
    if (!gb || !gb.on) return;
    sheetBody.appendChild(el('h3', 'Your gear'));
    const slots = gb.slots || {}, rows = [];
    Object.keys(SLOT_NAMES).forEach(function (k) {
      const entry = slots[k];
      if (!entry) return;
      const item = entry.custom || (entry.id != null && WL.ITEMS && WL.ITEMS[entry.id]) || null;
      rows.push([SLOT_NAMES[k], item ? item.name || 'An item without a name' : 'Item ' + entry.id + ' (this page does not know it yet)', item ? statText(item.stats) : '', item && item.quality ? item.quality : '']);
    });
    const hand = statText(gb.manual);
    if (hand) rows.push(['Added by hand', 'What you typed into the sim\'s stats on top of your items', hand, '']);
    if (!rows.length) { sheetBody.appendChild(el('p', 'The gear builder is on in the imported settings, but no slot holds an item.', 'hint')); return; }
    const table = document.createElement('table'), body = document.createElement('tbody');
    rows.forEach(function (r) {
      const tr = document.createElement('tr');
      tr.appendChild(el('td', r[0]));
      tr.appendChild(el('td', r[1], 'item' + (r[3] ? ' q-' + r[3] : '')));
      tr.appendChild(el('td', r[2], 'from'));
      body.appendChild(tr);
    });
    table.appendChild(body);
    table.className = 'gear';
    sheetBody.appendChild(table);
    sheetBody.appendChild(el('p', 'From the gear builder of the Warlock SIM, brought over with Import. The numbers above already hold these items.', 'hint'));
  }
  function talentSheet() {
    const ranks = character.build.talents || {}, wrap = el('div', null, 'trees');
    TREES.forEach(function (tree) {
      const list = (WL.TALENTS || []).filter(function (t) { return t.tree === tree[0]; });
      const points = list.reduce(function (sum, t) { return sum + (ranks[t.key] || 0); }, 0);
      const box = el('div', null, 'tree');
      box.appendChild(el('h3', tree[1] + ' · ' + points));
      const grid = el('div', null, 'tree-grid');
      list.forEach(function (t) {
        const rank = ranks[t.key] || 0, cell = el('div', null, 'talent' + (rank ? '' : ' none') + (rank >= t.ranks ? ' full' : ''));
        cell.style.gridRow = String(t.row + 1); cell.style.gridColumn = String(t.col + 1);
        const icon = WL.ICONS['talent_' + t.key];
        if (icon) { const img = document.createElement('img'); img.src = icon; img.alt = t.name; cell.appendChild(img); }
        cell.appendChild(el('b', rank + '/' + t.ranks));
        setTip(cell, function () {
          const texts = WL.TALENT_TEXT && WL.TALENT_TEXT[t.key];
          return { title: t.name, right: 'Rank ' + rank + '/' + t.ranks, text: texts ? tidy(texts[Math.max(rank, 1) - 1] || texts[0]) : '', notes: rank ? [] : ['Not taken in this build.'] };
        });
        grid.appendChild(cell);
      });
      box.appendChild(grid);
      wrap.appendChild(box);
    });
    sheetBody.appendChild(el('p', character.build.name, 'review-head'));
    sheetBody.appendChild(wrap);
  }
  function buffSheet() {
    function group(title, items, iconPrefix) {
      const keys = Object.keys(items || {});
      if (!keys.length) return;
      sheetBody.appendChild(el('h3', title));
      const list = el('ul', null, 'onoff');
      keys.sort(function (a, b) { return (items[b].on ? 1 : 0) - (items[a].on ? 1 : 0); }).forEach(function (k) {
        const it = items[k], li = el('li', null, it.on ? 'on' : 'off');
        li.appendChild(el('i', it.on ? 'on' : 'off'));
        const icon = WL.ICONS[iconPrefix + k];
        if (icon) { const img = document.createElement('img'); img.src = icon; img.alt = ''; li.appendChild(img); } else li.appendChild(el('span', null, 'no-icon'));
        li.appendChild(el('span', k === 'buildOil' && character.stats.oilName ? character.stats.oilName : it.name));
        li.appendChild(el('small', tidy(it.desc || '')));
        list.appendChild(li);
      });
      sheetBody.appendChild(list);
    }
    group('Raid buffs', config.buffs, 'buff_');
    group('On the dummy', config.debuffs, 'debuff_');
    group('Consumables', config.consumables, 'consumable_');
    if (leftOut.length) sheetBody.appendChild(el('p', 'Not playable here yet, so switched off (also for the sim average): ' + leftOut.join(', ') + '.', 'hint'));
  }
  function showSheet(which) {
    if (!character) return;
    openTab = which;
    sheetBody.textContent = '';
    Object.keys(tabs).forEach(function (k) { tabs[k].classList.toggle('on', k === which); });
    byId('sheetTitle').textContent = which === 'character' ? 'Character' : which === 'talents' ? 'Talents' : 'Buffs and consumables';
    if (which === 'character') characterSheet(); else if (which === 'talents') talentSheet(); else buffSheet();
    sheet.hidden = false;
  }
  Object.keys(tabs).forEach(function (k) { tabs[k].addEventListener('click', function () { tabs[k].blur(); showSheet(k); }); });
  byId('btnSheet').addEventListener('click', function () { showSheet('character'); });
  byId('btnTalents').addEventListener('click', function () { showSheet('talents'); });
  byId('btnBuffs').addEventListener('click', function () { showSheet('buffs'); });
  byId('sheetClose').addEventListener('click', function () { sheet.hidden = true; });
  byId('sheetNote').textContent = FROM_SIM;

  // ---------- latency, presets ----------
  const latency = byId('latency');
  latency.value = String(getSetting('latency') || 0);
  latency.addEventListener('change', function () {
    const ms = Math.max(0, Math.min(1000, Math.round(Number(latency.value) || 0)));
    latency.value = String(ms);
    latency.blur();
    handlers.onLatency(ms);
  });
  latency.addEventListener('keydown', function (e) { if (e.key === 'Enter') latency.blur(); e.stopPropagation(); });
  const pullBox = byId('pullSeconds');
  pullBox.value = String(getSetting('pullSeconds') || 5);
  pullBox.addEventListener('change', function () {
    const s = Math.max(1, Math.min(30, Math.round(Number(pullBox.value) || 5)));
    pullBox.value = String(s);
    pullBox.blur();
    setSetting('pullSeconds', s);
  });
  pullBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') pullBox.blur(); e.stopPropagation(); });
  const volume = byId('volume');
  volume.value = String(Math.round(100 * (getSetting('volume') == null ? 0.6 : getSetting('volume'))));
  volume.addEventListener('input', function () { handlers.onVolume(Math.max(0, Math.min(100, Number(volume.value) || 0)) / 100); });
  volume.addEventListener('change', function () { volume.blur(); });
  byId('btnShare').addEventListener('click', function () { byId('btnShare').blur(); copyText(handlers.shareLink(), byId('btnShare')); });
  PRESETS.forEach(function (p) {
    const button = el('button', p.name);
    button.type = 'button';
    button.addEventListener('click', function () { button.blur(); handlers.onPreset(p); });
    byId('presets').appendChild(button);
  });

  // ---------- drills and the seeded fight ----------
  // Challenges have a window of their own (the gold button at the top): a card per drill with your best, and the
  // seeded fight.
  const challengeWindow = byId('challenges'), challengeButton = byId('btnChallenges'), cards = {};
  function best(id) { const all = getSetting('drills') || {}; return all[id] || null; }
  // What main.js gets for a card: the drill itself, or an encounter with its script and the even fight the sim plays.
  function asChallenge(d) {
    return d.script ? Object.assign({ drill: true, encounter: true, sim: simFight(d), share: 'encounter:' + d.id }, d)
                    : Object.assign({ drill: true, share: 'drill:' + d.id }, d);
  }
  function seeded(word) {
    return { id: 'seed', seeded: true, name: 'Seeded fight "' + word + '"', word: word, seed: seedNumber(word), targets: 1, share: 'seed:' + word,
             text: 'Two minutes on one dummy with the dice fixed by the seed.', fight: { timed: true, seconds: 120 } };
  }
  function fillDrills() {
    DRILLS.concat(ENCOUNTERS).forEach(function (d) {
      let card = cards[d.id];
      if (!card) {
        const box = el('div', null, 'card'), head = el('h4'), grade = el('b'), record = el('small'), button = el('button');
        head.append(el('span', d.name), grade);
        button.type = 'button';
        button.addEventListener('click', function () {
          const running = challenge && challenge.id === d.id;
          challengeWindow.hidden = true;
          handlers.onChallenge(running ? null : asChallenge(d));
        });
        box.append(head, el('p', d.text), record, button);
        byId(d.script ? 'encounters' : 'drills').appendChild(box);
        card = cards[d.id] = { box: box, grade: grade, record: record, button: button };
      }
      const b = best(d.id), running = !!challenge && challenge.id === d.id;
      card.grade.textContent = b ? b.grade : '';
      card.record.textContent = b ? 'Your best: ' + b.pct + '% of the sim, ' + whole(b.dps) + ' DPS' : 'Not played yet';
      card.button.textContent = running ? 'End' : b ? 'Play again' : 'Start';
      card.box.classList.toggle('on', running);
    });
    challengeButton.classList.toggle('on', !!challenge);
    fillRobes();
  }
  // The robes: a card each with its colours, what it takes, and a button to put it on once it is yours.
  const robeCards = {};
  function hex(n) { return '#' + ('000000' + n.toString(16)).slice(-6); }
  function wornRobe() { const key = getSetting('robe'), earned = robesEarned(getSetting('drills')); return earned[key] ? key : 'violet'; }
  function fillRobes() {
    const earned = robesEarned(getSetting('drills')), worn = wornRobe();
    ROBES.forEach(function (r) {
      let card = robeCards[r.key];
      if (!card) {
        const box = el('div', null, 'card robe'), head = el('h4'), swatch = el('i', null, 'swatch'), button = el('button');
        swatch.style.background = 'linear-gradient(135deg, ' + hex(r.robe) + ' 0 50%, ' + hex(r.dark) + ' 50% 100%)';
        swatch.style.borderColor = hex(r.trim);
        head.append(el('span', r.name), swatch);
        button.type = 'button';
        button.addEventListener('click', function () { button.blur(); setSetting('robe', r.key); handlers.onRobe(r.key); fillRobes(); });
        box.append(head, el('p', ROBE_HOW[r.key]), button);
        byId('robes').appendChild(box);
        card = robeCards[r.key] = { box: box, button: button };
      }
      card.button.textContent = !earned[r.key] ? 'Not earned yet' : r.key === worn ? 'Wearing it' : 'Wear';
      card.button.disabled = !earned[r.key] || r.key === worn;
      card.box.classList.toggle('on', r.key === worn);
      card.box.classList.toggle('locked', !earned[r.key]);
    });
  }
  // Today's fight: a card at the top of the Challenges window, with your result of the day and your streak.
  const dailyCard = { box: null };
  function dailyDays() { return (getSetting('daily') || {}).days || {}; }
  function fillDaily() {
    const today = dailyFor(dayKey(0)), mine = dailyDays()[today.day], st = streaks(dailyDays()), running = !!challenge && challenge.daily;
    if (!dailyCard.box) {
      const box = el('div', null, 'card wide-card daily'), head = el('h4'), grade = el('b'), text = el('p'), record = el('small'), streak = el('small', null, 'streak'), button = el('button');
      head.append(el('span'), grade);
      button.type = 'button';
      button.addEventListener('click', function () {
        button.blur();
        const on = !!challenge && challenge.daily;
        challengeWindow.hidden = true;
        handlers.onChallenge(on ? null : dailyFor(dayKey(0)));
      });
      box.append(head, text, record, streak, button);
      byId('daily').appendChild(box);
      Object.assign(dailyCard, { box: box, head: head.firstChild, grade: grade, text: text, record: record, streak: streak, button: button });
    }
    dailyCard.head.textContent = dayWords(today.day);
    dailyCard.grade.textContent = mine ? mine.grade : '';
    dailyCard.text.textContent = today.text + ' With your own build and race.';
    dailyCard.record.textContent = mine ? 'Your best today: ' + mine.pct + '% of the sim, ' + whole(mine.dps) + ' DPS' : 'Not played yet today';
    dailyCard.streak.textContent = st.now ? st.now + (st.now === 1 ? ' day' : ' days') + ' in a row' + (st.today ? '' : ': play today to keep it going') + (st.longest > st.now ? ' (your longest: ' + st.longest + ')' : '')
      : st.longest ? 'Your longest run: ' + st.longest + (st.longest === 1 ? ' day' : ' days') : 'Play it every day for a streak';
    dailyCard.button.textContent = running ? 'End' : mine ? 'Play again' : 'Start';
    dailyCard.box.classList.toggle('on', running);
  }
  challengeButton.addEventListener('click', function () { challengeButton.blur(); fillDrills(); fillDaily(); challengeWindow.hidden = !challengeWindow.hidden; });

  // ---------- lessons ----------
  // A short series per build (js/lessons.js). Passing a lesson's test opens the next one; kept per build.
  const lessonWindow = byId('lessons'), lessonList = byId('lessonList');
  function lessonDone() { return (getSetting('lessons') || {})[character.lessonKey] || {}; }
  function asLesson(l) {
    return { lesson: l, id: 'lesson:' + l.id, name: 'Lesson ' + l.number + ': ' + l.title, text: l.test.text, targets: l.test.targets,
             fight: Object.assign({}, l.test.fight), executePct: l.test.executePct, share: 'lesson:' + l.id };
  }
  function fillLessons() {
    if (!character) return;
    const list = lessonsFor(WL, character.build), done = lessonDone(), passed = list.filter(function (l) { return done[l.id]; }).length;
    lessonList.textContent = '';
    byId('lessonsHead').textContent = character.build.name + ': ' + passed + ' of ' + list.length + ' passed';
    let open = true;
    list.forEach(function (l) {
      const ok = !!done[l.id], locked = !open, running = !!challenge && challenge.lesson && challenge.lesson.id === l.id;
      const box = el('div', null, 'card lesson' + (ok ? ' passed' : '') + (locked ? ' locked' : '') + (running ? ' on' : '')), head = el('h4');
      head.append(el('span', l.number + '. ' + l.title), el('b', ok ? 'Passed' : locked ? 'Locked' : 'Open'));
      box.appendChild(head);
      l.text.forEach(function (p) { box.appendChild(el('p', p)); });
      const test = el('div', null, 'lesson-test');
      test.appendChild(el('b', 'Test: '));
      test.appendChild(document.createTextNode(l.test.text));
      const checks = el('ul');
      l.test.checks.forEach(function (c) { checks.appendChild(el('li', c.label)); });
      test.appendChild(checks);
      box.appendChild(test);
      const button = el('button', running ? 'End' : locked ? 'Pass the lesson before it first' : ok ? 'Take the test again' : 'Take the test');
      button.type = 'button';
      button.disabled = locked;
      button.addEventListener('click', function () { button.blur(); lessonWindow.hidden = true; handlers.onChallenge(running ? null : asLesson(l)); });
      box.appendChild(button);
      lessonList.appendChild(box);
      if (!ok) open = false;                              // the lessons after the first one not passed stay locked
    });
  }
  byId('btnLessons').addEventListener('click', function () { byId('btnLessons').blur(); fillLessons(); lessonWindow.hidden = !lessonWindow.hidden; });
  byId('lessonsClose').addEventListener('click', function () { lessonWindow.hidden = true; });

  // ---------- progress ----------
  const progressWindow = byId('progressWin');
  let progressPick = null;
  function fillProgress() { drawProgress(byId('progressBody'), character ? character.lessonKey : null, progressPick, function (k) { progressPick = k; fillProgress(); }); }
  byId('btnProgress').addEventListener('click', function () { byId('btnProgress').blur(); progressPick = null; fillProgress(); progressWindow.hidden = !progressWindow.hidden; });
  byId('progressClose').addEventListener('click', function () { progressWindow.hidden = true; });
  byId('challengesClose').addEventListener('click', function () { challengeWindow.hidden = true; });
  const seedBox = byId('seed'), today = new Date();
  seedBox.value = String(today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate());   // today's date: everyone who keeps it plays the same fight
  seedBox.addEventListener('keydown', function (e) { if (e.key === 'Enter') byId('seedStart').click(); e.stopPropagation(); });
  function seedNumber(text) {
    const t = String(text).trim();
    if (/^\d{1,9}$/.test(t)) return Number(t);
    let h = 2166136261;                                    // any word becomes a number, always the same one
    for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  byId('seedStart').addEventListener('click', function () {
    const word = seedBox.value.trim() || '1';
    seedBox.blur(); byId('seedStart').blur();
    challengeWindow.hidden = true;
    handlers.onChallenge(seeded(word));
  });
  byId('challengeEnd').addEventListener('click', function () { handlers.onChallenge(null); });
  byId('btnCopyLog').addEventListener('click', function () { byId('btnCopyLog').blur(); copyText(handlers.fullLog(), byId('btnCopyLog')); });

  // ---------- the screen: interface size, colour-blind colours ----------
  const sizeBox = byId('uiScale'), sizeText = byId('uiScaleText'), colourBox = byId('swColorBlind');
  function showSize(value) { sizeBox.value = String(Math.round(100 * value)); sizeText.textContent = Math.round(100 * value) + '%'; }
  showSize(getSetting('uiScale') || 1);
  sizeBox.addEventListener('input', function () {
    const value = Math.max(80, Math.min(140, Number(sizeBox.value) || 100)) / 100;
    sizeText.textContent = Math.round(100 * value) + '%';
    setSetting('uiScale', value);
    handlers.onUiScale(value);
  });
  sizeBox.addEventListener('change', function () { sizeBox.blur(); });
  function applyColours() { document.documentElement.classList.toggle('cb', getSetting('colorBlind') === true); colourBox.checked = getSetting('colorBlind') === true; }
  colourBox.addEventListener('change', function () { setSetting('colorBlind', colourBox.checked); colourBox.blur(); applyColours(); });
  applyColours();

  // ---------- callouts ----------
  const calloutBox = byId('callout');
  let calloutUntil = 0, clock = 0;
  function callout(text) {
    calloutBox.textContent = text;
    calloutBox.classList.add('show');
    calloutUntil = clock + 2.4;
    handlers.log(text, 'miss');
  }
  let watch = { dots: {}, coe: {}, consumed: {}, idle: 0, idleSaid: false, full: 0, fullSaid: false, last: 0, t: -1, clips: 0 };
  function watchFight(combat, now) {
    const S = combat.state, dt = Math.min(0.25, Math.max(0, now - watch.last));
    watch.last = now;
    if (S.t < watch.t || combat.fightSeconds() <= 0 || S.over) {           // a new fight, not started, or over: nothing to say
      watch.dots = {}; watch.coe = {}; watch.idle = 0; watch.idleSaid = false; watch.full = 0; watch.fullSaid = false; watch.clips = 0;
      watch.t = S.t;
      if (combat.fightSeconds() <= 0 || S.over) return;
    }
    watch.t = S.t;
    for (let i = 1; i <= character.targets; i++) {
      const alive = combat.alive(i), where = character.targets > 1 ? ' on dummy ' + i : '';
      WATCHED.forEach(function (key) {
        if (!character.spells[key]) return;
        const id = key + i, up = combat.dotLeft(key, i) > 0;
        if (watch.dots[id] && !up && alive && !(S.t - (watch.consumed[id] || -9) < 0.5)) callout(character.spells[key].name + ' fell off' + where);
        watch.dots[id] = up;
      });
      const cursed = !!combat.debuff(i, 'coe');
      if (watch.coe[i] && !cursed && alive) callout('Curse of the Elements fell off' + where);
      watch.coe[i] = cursed;
    }
    // A DoT cast again while it still had ticks left (one Bane pushing another off is a choice, not a slip).
    const clips = combat.result.track.clips;
    for (; watch.clips < clips.length; watch.clips++) {
      const c = clips[watch.clips];
      if (c.by === c.key && c.ticks > 0 && character.spells[c.key] && combat.fightSeconds() - c.t < 1) {   // not the old ones when the switch is turned on mid-fight
        callout(character.spells[c.key].name + ' cast again with ' + c.left.toFixed(1) + ' s left: ' + (c.ticks === 1 ? '1 tick' : c.ticks + ' ticks') + ' cut off' + (character.targets > 1 ? ' on dummy ' + c.target : ''));
      }
    }
    const phase = combat.movePhase(), busy = !!(S.cast || S.channel) || S.gcdReady > S.t || (phase && phase.moving);
    watch.idle = busy ? 0 : watch.idle + dt;
    if (busy) watch.idleSaid = false;
    if (watch.idle >= 1.2 && !watch.idleSaid) { watch.idleSaid = true; callout('Nothing cast for over a second'); }
    const full = S.mana >= character.stats.maxMana - 1;
    watch.full = full ? watch.full + dt : 0;
    if (!full) watch.fullSaid = false;
    if (watch.full >= 4 && !watch.fullSaid) { watch.fullSaid = true; callout('Mana is full: what you regain now is lost'); }
  }

  // ---------- the race against the sim ----------
  const raceYou = byId('raceYou'), raceSim = byId('raceSim'), raceText = byId('raceText');
  const raceBestRow = byId('raceBestRow'), raceBestBar = byId('raceBest'), raceBestText = byId('raceBestText');
  // Your best in this fight by fight second t: its damage curve ({ s: seconds, d: damage, n: seconds a point, c }),
  // or only its average pace ({ pace }) for a best from before curves were kept. Past its own end it counts on at
  // its average pace, as the sim does.
  function bestAt(best, t) {
    if (best.pace) return best.pace * t;
    if (t >= best.s) return best.d / best.s * t;
    const i = Math.floor(t / best.n), from = best.c[i] || 0, more = i + 1 < best.c.length;
    return from + ((more ? best.c[i + 1] : best.d) - from) * (t - i * best.n) / (more ? best.n : Math.max(0.01, best.s - i * best.n));
  }
  // The sim's damage by fight second t. Its curve ends when its own fight does (sim.seconds); in a fight on health
  // you may need longer, and from then on the sim is counted on at its average pace, so that the share shown here
  // ends at the review's (your DPS against the sim's) and not at "who filled the health pool".
  function simAt(sim, t) {
    const curve = sim.curve, last = curve.length - 1;
    if (!curve.length) return 0;
    if (sim.seconds > 0 && sim.dps > 0) {
      if (t >= sim.seconds) return sim.dps * t;
      if (t >= last - 1 && last >= 1) return curve[last - 1] + (curve[last] - curve[last - 1]) * (t - (last - 1)) / (sim.seconds - (last - 1));   // its last second may be a part of one
    }
    if (t >= last) return curve[last];
    const i = Math.floor(t), f = t - i;
    return curve[i] + (curve[i + 1] - curve[i]) * f;
  }
  let lastRace = '';
  // best: your best in this fight (see bestAt), or null when there is none yet.
  function showRace(combat, sim, best) {
    const t = combat.fightSeconds(), mine = combat.result.total, ready = !!(sim && sim.curve);
    const theirs = ready ? simAt(sim, t) : 0, old = best ? bestAt(best, t) : 0;
    // All bars are measured against the same length: the longest of the sim's whole fight, your best's whole fight,
    // and where each of them stands right now.
    const end = Math.max(ready ? sim.curve[sim.curve.length - 1] || 1 : 1, theirs, best && best.d ? best.d : 0, old, 1);
    const you = Math.min(100, 100 * mine / end), them = Math.min(100, 100 * theirs / end), before = Math.min(100, 100 * old / end);
    let text = '', bestText = '';
    if (!ready) text = 'The sim is still working out its fight';
    else {
      const gap = mine - theirs;
      if (t <= 0) text = 'Starts when your first spell takes effect';
      else if (Math.abs(gap) < 0.5) text = 'Level with the sim';
      else text = (gap > 0 ? whole(gap) + ' ahead' : whole(-gap) + ' behind') + (theirs > 0 ? ' · ' + Math.round(100 * mine / theirs) + '% of the sim' : '');
    }
    if (best && t > 0) {
      const gap = mine - old;
      bestText = Math.abs(gap) < 0.5 ? 'Level with your best' : (gap > 0 ? whole(gap) + ' ahead of' : whole(-gap) + ' behind') + ' your best';
    }
    const id = text + '|' + bestText + '|' + you.toFixed(1) + '|' + them.toFixed(1) + '|' + before.toFixed(1) + '|' + !!best;
    if (id === lastRace) return;
    lastRace = id;
    raceText.textContent = text;
    raceYou.style.width = you.toFixed(1) + '%';
    raceSim.style.width = them.toFixed(1) + '%';
    raceBestRow.hidden = !best;
    raceBestBar.style.width = before.toFixed(1) + '%';
    raceBestText.textContent = bestText;
    raceBestText.hidden = !bestText;
  }

  return {
    // c: the character (as hud.setCharacter gets it); cfg: the fight's settings; left: what an imported code had
    // that is not playable; ch: the drill or seeded fight that is running, or null.
    setCharacter: function (c, cfg, left, ch) {
      character = c; config = cfg; leftOut = left || []; challenge = ch || null;
      fillRotation();
      fillDrills();
      fillDaily();
      byId('btnLessons').classList.toggle('on', !!(challenge && challenge.lesson));
      if (!lessonWindow.hidden) fillLessons();
      const tag = byId('challengeTag');
      tag.hidden = !challenge;
      if (challenge) byId('challengeText').textContent = (challenge.encounter ? 'Encounter: ' : challenge.drill ? 'Drill: ' : '') + challenge.name + ' · ' + challenge.text;
      latency.value = String(getSetting('latency') || 0);
      if (!sheet.hidden && openTab) showSheet(openTab);
      lastRace = '';
    },
    render: function (combat, now, sim, best) {
      clock = now;
      if (calloutUntil && now > calloutUntil) { calloutUntil = 0; calloutBox.classList.remove('show'); }
      const s = show();
      if (s.callouts && character) watchFight(combat, now);
      if (s.race) showRace(combat, sim, best);
    },
    // An event from the casting rules (only what the callouts need to know).
    event: function (e, combat) { if (e.type === 'consume') watch.consumed[e.key + e.target] = combat.state.t; },
    refreshDrills: fillDrills,
    wornRobe: wornRobe,
    // The names of robes your grades have earned since this was last asked (each is named once).
    newRobes: function () {
      const earned = robesEarned(getSetting('drills')), seen = getSetting('robesSeen') || ['violet'];
      const fresh = ROBES.filter(function (r) { return earned[r.key] && seen.indexOf(r.key) < 0; });
      if (fresh.length) { setSetting('robesSeen', seen.concat(fresh.map(function (r) { return r.key; }))); fillRobes(); }
      return fresh.map(function (r) { return r.name; });
    },
    show: show,
    // A challenge named in a share link ('drill:opener', 'encounter:fireDance', 'seed:word'): start it. False when
    // there is no such challenge.
    play: function (spec) {
      const cut = String(spec).indexOf(':'), kind = String(spec).slice(0, cut), id = String(spec).slice(cut + 1);
      const found = kind === 'seed' ? (id ? seeded(id.slice(0, 24)) : null)
        : kind === 'daily' ? (/^\d{4}-\d{2}-\d{2}$/.test(id) ? dailyFor(id) : null)
        : kind === 'lesson' ? lessonsFor(WL, character.build).filter(function (l) { return l.id === id; }).map(asLesson)[0]
        : (kind === 'drill' ? DRILLS : kind === 'encounter' ? ENCOUNTERS : []).filter(function (d) { return d.id === id; }).map(asChallenge)[0];
      if (!found) return false;
      if (found.seeded) seedBox.value = found.word;
      handlers.onChallenge(found);
      return true;
    },
    sheetOpen: function () { return !sheet.hidden || !challengeWindow.hidden || !lessonWindow.hidden || !progressWindow.hidden; },
    closeSheet: function () { sheet.hidden = true; challengeWindow.hidden = true; lessonWindow.hidden = true; progressWindow.hidden = true; },
    // Lessons, for main.js and the review's buttons.
    startLesson: function (ch) { handlers.onChallenge(ch); },
    openLessons: function () { fillLessons(); lessonWindow.hidden = false; },
    lessonPassed: function (ch) {
      const all = Object.assign({}, getSetting('lessons')), mine = Object.assign({}, all[character.lessonKey]);
      if (!mine[ch.lesson.id]) mine[ch.lesson.id] = Date.now();
      all[character.lessonKey] = mine;
      setSetting('lessons', all);
      if (!lessonWindow.hidden) fillLessons();
    },
    nextLesson: function (ch) {
      const list = lessonsFor(WL, character.build), i = list.map(function (l) { return l.id; }).indexOf(ch.lesson.id);
      return i >= 0 && i + 1 < list.length ? asLesson(list[i + 1]) : null;
    },
    // Today's fight is over: keep your best of that day. Returns the line the review shows (with your streak).
    recordDaily: function (ch, out) {
      const all = Object.assign({ days: {} }, getSetting('daily')), days = Object.assign({}, all.days), old = days[ch.day];
      if (!old || out.pct > old.pct) days[ch.day] = { grade: out.grade, pct: out.pct, dps: Math.round(out.dps) };
      const keys = Object.keys(days).sort();
      if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(function (k) { delete days[k]; });
      all.days = days;
      setSetting('daily', all);
      fillDaily();
      const st = streaks(days);
      return 'Today\'s fight is done' + (ch.day === dayKey(0) ? '' : ' (for ' + dayWords(ch.day) + ')') + '. ' +
        (st.now > 1 ? st.now + ' days in a row' + (st.now >= st.longest ? ': your longest run.' : '; your longest: ' + st.longest + '.') : 'Come back tomorrow for the next one and start a streak.');
    },
    copy: copyText
  };
}
