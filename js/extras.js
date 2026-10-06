// The bar on the right and what it switches on or opens:
//   - the rotation panel (what the sim plays), the race against the sim, mistake callouts;
//   - the character, talents and buffs sheets - read-only, because all of it comes from the Warlock SIM;
//   - latency, fight presets, drills and the seeded fight, and copying the combat log.
// The rules of the fight are not in here: this file only shows things and tells main.js what was chosen.
import { getSetting, setSetting } from './settings.js';
import { setTip } from './tooltip.js';
import { ACTION_SPELLS } from './combat.js';

// Drills: short fights with one thing to practise. They do not change your saved fight settings.
export const DRILLS = [
  { id: 'opener', name: 'Opener', text: '30 seconds on one dummy. The first casts decide it.', targets: 1, fight: { timed: true, seconds: 30 } },
  { id: 'execute', name: 'Execute phase', text: '45 seconds on a dummy that is in execute range from the first second.', targets: 1, fight: { timed: true, seconds: 45 }, executePct: 100 },
  { id: 'threeDummies', name: 'Three dummies', text: '90 seconds on three dummies: keep your DoTs on all of them.', targets: 3, fight: { timed: true, seconds: 90 } },
  { id: 'movement', name: 'Movement', text: 'Two minutes. Every 20 seconds you have to move for 5.', targets: 1, fight: { timed: true, seconds: 120, moveEvery: 20, moveDuration: 5 } },
  { id: 'underFire', name: 'Under fire', text: '90 seconds while you take a hit every 2 seconds.', targets: 1, fight: { timed: true, seconds: 90, hitEvery: 2 } },
  { id: 'longHaul', name: 'Long haul', text: 'Five minutes on one dummy. Mana decides it.', targets: 1, fight: { timed: true, seconds: 300 } }
];
// Presets: one click for a common fight. These do change your saved fight settings.
export const PRESETS = [
  { name: '1 dummy, 50,000 health', dummies: 1, health: 50000, fight: { timed: false, seconds: 120, moveEvery: 0, moveDuration: 0, hitEvery: 0 } },
  { name: '1 dummy, 3 minutes', dummies: 1, fight: { timed: true, seconds: 180, moveEvery: 0, moveDuration: 0, hitEvery: 0 } },
  { name: '2 dummies, 2 minutes, moving', dummies: 2, fight: { timed: true, seconds: 120, moveEvery: 30, moveDuration: 5, hitEvery: 0 } },
  { name: '3 dummies, 2 minutes', dummies: 3, fight: { timed: true, seconds: 120, moveEvery: 0, moveDuration: 0, hitEvery: 0 } }
];
// How a drill is graded: your DPS as a share of what the sim reaches in the same fight.
export function gradeFor(pct) { return pct >= 100 ? 'S' : pct >= 95 ? 'A' : pct >= 88 ? 'B' : pct >= 78 ? 'C' : 'D'; }

const SHOW_DEFAULT = { rotation: false, race: true, callouts: false };
const FROM_SIM = 'Read-only: this comes from the Warlock SIM. To change it, change it there and bring the codes over with Import.';
const TREES = [['affliction', 'Affliction'], ['demonology', 'Demonology'], ['destruction', 'Destruction']];
const STATS = [
  ['maxHealth', 'Health', 0], ['maxMana', 'Mana', 0], ['int', 'Intellect', 0], ['spi', 'Spirit', 0], ['sta', 'Stamina', 0],
  ['sp', 'Spell power', 0], ['shadowSp', 'Shadow spell power', 0, true], ['fireSp', 'Fire spell power', 0, true],
  ['hitPct', 'Spell hit chance', 1, false, '%'], ['critPct', 'Spell crit chance', 2, false, '%'], ['hastePct', 'Spell haste', 1, false, '%'],
  ['mp5', 'Mana every 5 s', 0], ['shadowDmgPct', 'Shadow damage', 1, true, '%'], ['fireDmgPct', 'Fire damage', 1, true, '%'], ['allDmgPct', 'All damage', 1, true, '%']
];
const WATCHED = ['immolate', 'corruption', 'baneOfAgony', 'siphonLife'];   // DoTs whose falling off is worth a word

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

// handlers: onChallenge(challenge or null), onPreset(preset), onLatency(ms), fullLog() -> text, log(text, kind)
export function createExtras(WL, handlers) {
  let character = null, config = null, leftOut = [], challenge = null;
  function show() { return Object.assign({}, SHOW_DEFAULT, getSetting('show') || {}); }

  // ---------- the switches ----------
  const rotationPanel = byId('rotationPanel'), race = byId('race');
  const switches = { rotation: byId('swRotation'), race: byId('swRace'), callouts: byId('swCallouts') };
  function applyShow() {
    const s = show();
    Object.keys(switches).forEach(function (k) { switches[k].checked = !!s[k]; });
    rotationPanel.hidden = !s.rotation;
    race.hidden = !s.race;
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
    if (character.build.notes) { sheetBody.appendChild(el('h3', 'Notes on this build')); sheetBody.appendChild(el('p', tidy([].concat(character.build.notes).join(' ')), 'hint')); }
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
  PRESETS.forEach(function (p) {
    const button = el('button', p.name);
    button.type = 'button';
    button.addEventListener('click', function () { button.blur(); handlers.onPreset(p); });
    byId('presets').appendChild(button);
  });

  // ---------- drills and the seeded fight ----------
  const drillButtons = {};
  function best(id) { const all = getSetting('drills') || {}; return all[id] || null; }
  function fillDrills() {
    DRILLS.forEach(function (d) {
      let button = drillButtons[d.id];
      if (!button) {
        button = drillButtons[d.id] = document.createElement('button');
        button.type = 'button';
        button.append(el('span', d.name), el('small'));
        button.addEventListener('click', function () { button.blur(); handlers.onChallenge(challenge && challenge.id === d.id ? null : Object.assign({ drill: true }, d)); });
        setTip(button, function () {
          const b = best(d.id);
          return { title: d.name, right: 'Drill', text: d.text, notes: ['Graded against the sim in the same fight: S from 100%, A from 95%, B from 88%, C from 78%.', b ? 'Your best: ' + b.grade + ' (' + b.pct + '% of the sim, ' + whole(b.dps) + ' DPS).' : 'Not played yet.'] };
        });
        byId('drills').appendChild(button);
      }
      const b = best(d.id);
      button.lastChild.textContent = b ? b.grade + ' ' + b.pct + '%' : '';
      button.classList.toggle('on', !!challenge && challenge.id === d.id);
    });
  }
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
    handlers.onChallenge({ id: 'seed', seeded: true, name: 'Seeded fight "' + word + '"', word: word, seed: seedNumber(word), targets: 1,
                           text: 'Two minutes on one dummy with the dice fixed by the seed.', fight: { timed: true, seconds: 120 } });
  });
  byId('challengeEnd').addEventListener('click', function () { handlers.onChallenge(null); });
  byId('btnCopyLog').addEventListener('click', function () { byId('btnCopyLog').blur(); copyText(handlers.fullLog(), byId('btnCopyLog')); });

  // ---------- callouts ----------
  const calloutBox = byId('callout');
  let calloutUntil = 0, clock = 0;
  function callout(text) {
    calloutBox.textContent = text;
    calloutBox.classList.add('show');
    calloutUntil = clock + 2.4;
    handlers.log(text, 'miss');
  }
  let watch = { dots: {}, coe: {}, consumed: {}, idle: 0, idleSaid: false, full: 0, fullSaid: false, last: 0, t: -1 };
  function watchFight(combat, now) {
    const S = combat.state, dt = Math.min(0.25, Math.max(0, now - watch.last));
    watch.last = now;
    if (S.t < watch.t || combat.fightSeconds() <= 0 || S.over) {           // a new fight, not started, or over: nothing to say
      watch.dots = {}; watch.coe = {}; watch.idle = 0; watch.idleSaid = false; watch.full = 0; watch.fullSaid = false;
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
  function simAt(curve, t) {
    if (!curve || !curve.length) return 0;
    if (t >= curve.length - 1) return curve[curve.length - 1];
    const i = Math.floor(t), f = t - i;
    return curve[i] + (curve[i + 1] - curve[i]) * f;
  }
  let lastRace = '';
  function showRace(combat, sim) {
    const t = combat.fightSeconds(), mine = combat.result.total;
    let text = '', you = 0, them = 0;
    if (!sim || !sim.curve) text = 'The sim is still working out its fight';
    else {
      const end = sim.curve[sim.curve.length - 1] || 1, theirs = simAt(sim.curve, t), gap = mine - theirs;
      you = Math.min(100, 100 * mine / end); them = Math.min(100, 100 * theirs / end);
      if (t <= 0) text = 'Starts with your first cast';
      else if (Math.abs(gap) < 0.5) text = 'Level with the sim';
      else text = (gap > 0 ? whole(gap) + ' ahead' : whole(-gap) + ' behind') + (theirs > 0 ? ' · ' + Math.round(100 * mine / theirs) + '% of the sim' : '');
    }
    const id = text + '|' + you.toFixed(1) + '|' + them.toFixed(1);
    if (id === lastRace) return;
    lastRace = id;
    raceText.textContent = text;
    raceYou.style.width = you.toFixed(1) + '%';
    raceSim.style.width = them.toFixed(1) + '%';
  }

  return {
    // c: the character (as hud.setCharacter gets it); cfg: the fight's settings; left: what an imported code had
    // that is not playable; ch: the drill or seeded fight that is running, or null.
    setCharacter: function (c, cfg, left, ch) {
      character = c; config = cfg; leftOut = left || []; challenge = ch || null;
      fillRotation();
      fillDrills();
      const tag = byId('challengeTag');
      tag.hidden = !challenge;
      if (challenge) byId('challengeText').textContent = (challenge.drill ? 'Drill: ' : '') + challenge.name + ' · ' + challenge.text;
      latency.value = String(getSetting('latency') || 0);
      if (!sheet.hidden && openTab) showSheet(openTab);
      lastRace = '';
    },
    render: function (combat, now, sim) {
      clock = now;
      if (calloutUntil && now > calloutUntil) { calloutUntil = 0; calloutBox.classList.remove('show'); }
      const s = show();
      if (s.callouts && character) watchFight(combat, now);
      if (s.race) showRace(combat, sim);
    },
    // An event from the casting rules (only what the callouts need to know).
    event: function (e, combat) { if (e.type === 'consume') watch.consumed[e.key + e.target] = combat.state.t; },
    refreshDrills: fillDrills,
    sheetOpen: function () { return !sheet.hidden; },
    closeSheet: function () { sheet.hidden = true; },
    copy: copyText
  };
}
