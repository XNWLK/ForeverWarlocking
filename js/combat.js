// Casting in real time: you press, this file applies the rules.
//
// Every rule here is carried over from the fight engine in vendor/warlock-sim/engine/sim.js (the single source of
// truth) - same formulas, same order of the random rolls - so the engine's fights can be replayed here and give the
// same damage (tools/check-combat.mjs does exactly that). What is different is only who decides: there the priority
// list, here the player.
//
// No drawing and no page access in this file, so it also runs in Node for the check.
//
// Not carried over (all off in the default settings): potions and runes, explosives, Power Infusion, Mana Tide,
// Innervate.
//
// Where this goes further than the engine:
// - Pets attack only while they are told to and stand in range of their target; in the engine the pet attacks the
//   boss from the first second to the last.
// - Up to three targets, all alike: each has its own health, DoTs, curse, Improved Shadow Bolt and Demonic Brand, and
//   you may cast anything at any of them. The engine has one boss and plainer extra targets; whatever it does to them
//   happens here in the same way.
// - Area spells hit the targets that really stand in their area; in the engine they hit every target.
// - It keeps a record of the fight for the review afterwards: time spent not casting, how long each DoT was up, how
//   long the pet attacked, mana that could not be regained at a full bar.

const EPS = 1e-9;

// A press this long before you are free again is remembered and cast the moment you are (like the game client does).
export const QUEUE_WINDOW = 0.4;

export const FAIL_TEXT = {
  dead: 'Your target is dead',
  unknown: 'You do not know that spell',
  busy: 'Not ready yet',
  cooldown: 'Not ready yet',
  mana: 'Not enough mana',
  range: 'Out of range',
  moving: "Can't do that while moving",
  casting: "Can't do that while casting",
  shards: 'No Soul Shards',
  health: 'Not enough health',
  immolate: 'Requires Immolate on the target',
  noRacial: 'Your race has nothing to use',
  feared: 'You are feared',
  immune: 'That target is immune to fire',
  shielded: 'That target is shielded'
};

// The key a spell's damage is booked under: plain for the first target, x2: / x3: for the others (as in the engine).
export function rowKey(target, key) { return target > 1 ? 'x' + target + ':' + key : key; }

// opts: WL, build, raceKey, config, dummyHealth, targets (1-3), seed (optional), onEvent (optional),
//       petMeleeRange (yards),
//       healths: [h1, h2, h3] - a health pool per dummy instead of dummyHealth for all (optional),
//       absent: [2, 3] - dummies that are not there when the fight starts; spawn(ti) brings one in (optional).
//       Both are for scripted fights with adds; the engine has nothing like it, so the check never uses them.
//       timedDuration: a fight of this many seconds instead of a health pool - health falls evenly with time (as in
//       the engine) and the fight ends when the time is up,
//       linearDuration: the same health model for the check script, with the clock running from the reset.
//       endless: the dummies have infinite health - nothing takes it away, and the fight lasts until stop() is called;
//       endlessPct: the health they stand at all the while (100, or a number under the execute threshold).
//       The engine has no such fight, so the check never uses it.
//       boss: a boss fight (js/boss.js): target 1 is the boss, whose health follows timedDuration as above; the other
//       targets (up to 39 adds, `targets` counts them all) have health pools of their own (healths / absent / spawn)
//       and can die. injure(), heal() and raidHurt() are for the boss and the ghost raid. The check never uses it.
//       healthCurve: [[seconds, health %], ...] - the boss's health on the clock, not evenly (a boss fight's longer air phase).
//       immune: { target: { school: true } } - spells of that school cannot be cast at it and do nothing to it (Onyxia: fire).
// From config.fight (as in the engine): moveEvery / moveDuration = every so many seconds you have to move for so
//       long (only instants then); hitEvery = you take a hit every so many seconds, which pushes your casts back.
// ctx (given to update, press and blocked): { moving, distances: [, d1, d2, d3] you to each target,
//       gaps: [[..]] target to target, petDistance: the pet to its target }. Anything left out counts as "in range".
export function createCombat(opts) {
  const WL = opts.WL, build = opts.build, raceKey = opts.raceKey;
  // gearMode 'preBis' (the sim's page default since its v181): each build in its own Pre-BiS gear, as the engine does.
  const cfg = WL.cfgFor ? WL.cfgFor(build, opts.config) : opts.config;
  const stats = WL.computeStats(build, raceKey, cfg);
  const table = WL.buildSpellTable(build, stats, cfg);
  const SPELLS = WL.spellsFor(cfg);
  const race = WL.RACES[raceKey], cb = cfg.combat, isSB = WL.isShadowBolt;
  const emit = opts.onEvent || function () {};
  const check = !!opts.linearDuration, timed = !check && !!opts.timedDuration;
  const linear = opts.linearDuration || opts.timedDuration || 0;
  const endless = !linear && !!opts.endless, standPct = endless && opts.endlessPct > 0 ? Math.min(100, opts.endlessPct) : 100;
  const MOVE = cfg.fight.moveEvery > 0 && cfg.fight.moveDuration > 0 ? { every: cfg.fight.moveEvery, dur: cfg.fight.moveDuration } : null;
  const HIT = cfg.fight.hitEvery > 0 ? cfg.fight.hitEvery : 0;
  const AURA_PUSH = Object.keys(cfg.buffs || {}).reduce(function (a, k) { const b = cfg.buffs[k]; return a + (b.on && b.pushbackResistPct ? b.pushbackResistPct : 0); }, 0);
  const FEL_CONC = { drainLife: 1, drainSoul: 1, wrack: 1 };
  // Wrack (patch of 2026-11-10, as in the engine): while you channel it at a target, the DoTs in dotSpeedSpells on that
  // target (Corruption, Bane of Agony, Siphon Life) get an extra tick at each half-way point between two of their ticks
  // (the engine's 'halfway' model, written for dotSpeedPct 100). See xSched.
  const WRACK_X = {};
  if ((SPELLS.wrack && SPELLS.wrack.dotSpeedPct) > 0 && table.wrack && SPELLS.wrack.dotSpeedSpells) SPELLS.wrack.dotSpeedSpells.forEach(function (k) { WRACK_X[k] = true; });
  const BOSS = !check && !!opts.boss;
  const N = Math.max(1, Math.min(BOSS ? 40 : 3, opts.targets || 1));
  // Health that follows the clock (a timed fight; in a boss fight only the boss) rather than the damage taken.
  function scheduled(ti) { return !!linear && (!BOSS || ti === 1); }
  const CURVE = BOSS && opts.healthCurve ? opts.healthCurve : null;
  // What a boss's targets are immune to: { ti: { fire: true } } from the start, or { all: true } while a shield is up
  // (setImmune). OUT_MULT: your damage times this while a boss's curse is on you (setOutMult). Never outside a boss fight.
  let IMM = BOSS && opts.immune ? JSON.parse(JSON.stringify(opts.immune)) : null, OUT_MULT = 1;
  function immuneTo(ti, school) { return !!(IMM && IMM[ti] && (IMM[ti][school] || IMM[ti].all)); }
  function shielded(ti) { return !!(IMM && IMM[ti] && IMM[ti].all); }
  // Health on the clock: even (100% to 0% over the fight), or along a boss's curve.
  function scheduledPct(ft) {
    if (ft < 0) return 100;
    if (!CURVE) return Math.max(0, 100 * (1 - ft / linear));
    for (let i = 1; i < CURVE.length; i++) {
      const a = CURVE[i - 1], b = CURVE[i];
      if (ft <= b[0]) return a[1] + (b[1] - a[1]) * (ft - a[0]) / (b[0] - a[0]);
    }
    return Math.max(0, CURVE[CURVE.length - 1][1]);
  }
  const JOW = cfg.debuffs && cfg.debuffs.judgementOfWisdom && cfg.debuffs.judgementOfWisdom.on ? cfg.debuffs.judgementOfWisdom.jow : null;
  const coeFromOthers = !!(cfg.debuffs && cfg.debuffs.coeOther && cfg.debuffs.coeOther.on);
  const armorRed = WL.armorReduction(cfg);
  const petMeleeRange = opts.petMeleeRange || 5;
  const havocPct = table.baneOfHavoc ? SPELLS.baneOfHavoc.havocPct / 100 : 0;
  // The 5-second rule (Xn, 2026-10-06; as in the engine): Spirit gives mana back only while you have spent none for
  // FSR seconds - (8 + Spirit / 4) every 2 seconds, counted evenly. A spell with a cast time spends its mana when the
  // cast is complete, an instant or a channel when it starts. Nothing comes back while a channel runs. Life Tap costs health, not mana: it does not restart the
  // 5 seconds. Nothing before the first mana is spent in a fight. (MP5 from gear and buffs always runs, as before.)
  // Your health (Xn, 2026-10-07; as in the engine). It starts full. Life Tap costs health and Hellfire hits you with
  // every tick; it comes back from the healing you are given (config.fight.healAmount every healEvery seconds), from
  // Drain Life, Siphon Life, Death Coil and Touch of the Grave (what they deal), and from a sacrificed Felhunter.
  // Nothing may take you to 0: Life Tap needs more health than it costs, and Hellfire stops when its next tick would
  // kill you. Hits you are made to take (config.fight.hitEvery) only push casts back, as before.
  const HEAL = cfg.fight.healAmount > 0 && cfg.fight.healEvery > 0 ? { amt: cfg.fight.healAmount, every: cfg.fight.healEvery } : null;
  const TAP_HP = SPELLS.lifeTap.healthCost || 0;
  // Demonic Sacrifice of a Voidwalker (mana) or a Felhunter (health): a share of your maximum every few seconds.
  const SAC = cfg.demonicSacrifice && stats.sacrificeActive && (build.sacrifice === 'voidwalker' || build.sacrifice === 'felhunter') ? cfg.demonicSacrifice : null;
  const FSR = cb.fsrSeconds > 0 ? cb.fsrSeconds : 0, SPI_REGEN = FSR ? (cb.spiritRegenBase + cb.spiritRegenPerSpi * stats.spi) / 2 : 0;

  const tvCache = {};
  function tv(key, field) {
    const id = key + '/' + (field || '');
    if (tvCache[id] === undefined) tvCache[id] = WL.talentValue(build, key, field);
    return tvCache[id];
  }
  function racialOf(effect) { return race.racials.filter(function (r) { return r.effect === effect; })[0] || null; }
  const EUREKA = (function () { const c = racialOf('cooldown'); return c && c.dmgPct ? c : null; })();   // Gnome
  const TOG = racialOf('proc');                                                                           // Undead
  const COMMAND = racialOf('petDmgPct');                                                                  // Orc: demon damage +5%
  // Threat (Xn, 2026-10-07; as in the engine): 1 damage = 1 threat, Searing Pain twice that (less with Demonic Brand),
  // all of it reduced by Suppression and by threat buffs (none left: Salvation went with the patch of 2026-11-03).
  // Your pet's damage is the pet's threat, not yours. It changes nothing in the fight; it is counted so you can see it.
  // Threat buffs of one group do not stack (the biggest counts).
  const THREAT_BUFFS = (function () {
    let m = 1;
    const best = {};
    WL.activeBuffs(cfg).forEach(function (b) {
      if (!b.threatPct) return;
      if (b.group) best[b.group] = Math.max(best[b.group] || 0, b.threatPct); else m *= 1 - b.threatPct / 100;
    });
    Object.keys(best).forEach(function (g) { m *= 1 - best[g] / 100; });
    return m;
  })();
  const THREAT_ALL = (1 - tv('suppression', 'threatPct') / 100) * THREAT_BUFFS;
  function threatMult(key) {
    const s = SPELLS[key];
    let m = THREAT_ALL * ((s && s.threatMult) || 1);
    if (key === 'searingPain') m *= 1 - tv('demonicBrand', 'threatRedPct') / 100;
    return m;
  }

  let S, T, R, P, res, events, order, inst, queued, lastCtx = null, maxHealth = opts.dummyHealth || 50000;
  // Amplify Curse on your action bar (put there from the spellbook): you press it and it waits for your next Bane of
  // Agony. Off the bar it goes by itself with Bane of Agony, as in the sim. setAmplifyButton(on) sets it.
  let AMP_BTN = false;
  let holdAt = null;          // the moment extra Wrack ticks wait at (see heldX)
  const AMP_CD = 180, AMP_LASTS = 30;                     // the sim's cooldown; "Lasts 30 sec." (the talent's text)

  function reset(seed) {
    const seed0 = seed != null ? seed : (opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296));
    // One random stream per kind of roll, with the engine's own constants.
    R = { hit: WL.makeRng(seed0 ^ 0x1B873593), crit: WL.makeRng(seed0 ^ 0x85EBCA6B), proc: WL.makeRng(seed0 ^ 0xC2B2AE35),
          vuln: WL.makeRng(seed0 ^ 0x27D4EB2F), jow: WL.makeRng(seed0 ^ 0x3C6EF372),
          pet: WL.makeRng(seed0 ^ 0x165667B1), push: WL.makeRng(seed0 ^ 0x61C88647) };
    S = {
      seed: seed0, t: 0, mana: stats.maxMana, health: stats.maxHealth, minHealth: stats.maxHealth,
      shards: Infinity,                                   // Soul Shards never run out (Xn, 2026-10-07)
      gcdStart: 0, gcdReady: 0, cast: null, channel: null, ampUp: false,   // ampUp: Amplify Curse used and waiting for a Bane of Agony that lands
      wrackOn: 0,                                         // the target Wrack speeds DoTs up on (0 = none)
      wrackTime: 0, wrackOnAt: 0,                         // seconds Wrack channelled before its current channel, when that began
      wasBusy: false, busyEnd: 0, idleBase: null, idleNext: null,   // the engine's 0.1 s steps while you are free (idleWalkAt)
      lastSpend: -Infinity,                               // when mana was last spent (the 5-second rule)
      cds: {}, buffs: {}, togReady: -Infinity, petSent: false,
      target: 1, havoc: null,
      fightStart: null, fightEnd: null, over: false, presses: [],
      precastKey: null                                    // the spell you were already casting when the fight began (the sim average then precasts it too)
    };
    T = [null];
    for (let i = 1; i <= N; i++) {
      const pool = opts.healths && opts.healths[i - 1] > 0 ? opts.healths[i - 1] : maxHealth, gone = !!opts.absent && opts.absent.indexOf(i) >= 0;
      // A dummy that is not there yet counts as down (every rule already leaves a dead target alone) until spawn(i).
      T.push({ index: i, health: pool * standPct / 100, maxHealth: pool, hpPct: standPct, dead: gone, absent: gone, dots: {}, deb: {}, brandCharges: 0 });
      if (coeFromOthers && i === 1) T[i].deb.coe = Infinity;
    }
    S.targets = T;
    res = { total: 0, threat: 0, bySpell: {}, byTarget: new Array(N + 1).fill(0),
            track: { busy: 0, uptime: {}, petActive: 0, wasted: 0, spirit: 0, moved: 0, interrupts: 0, pushbacks: 0, pushbackTime: 0, lifeTaps: 0,
                     // for the review: when your first spell took effect (seconds into the fight), your mana, and DoTs cast over
                     first: null, spent: 0, tapMana: 0, tapLost: 0, tapsMoving: 0, minMana: stats.maxMana, noMana: 0, clips: [] } };
    events = []; order = 0; inst = 0; queued = null; resCache = {};
    actOpen = ACT_POL === 'pull'; doomSeen = false;                  // each fight's cooldowns wait for its own opener / Doom
    Object.keys(trUntil).forEach(function (k) { delete trUntil[k]; }); revUntil = -1;   // no trinket buff or Revelation carried over
    P = makePet(build.pet);
    S.decideSeq = order++;
  }

  // ---------- small helpers (same meaning as in the engine) ----------
  function row(key) { return res.bySpell[key] || (res.bySpell[key] = { casts: 0, landed: 0, misses: 0, hits: 0, crits: 0, ticks: 0, tickCrits: 0, dmg: 0, threat: 0 }); }
  function ready(key) { return !S.cds[key] || S.cds[key] <= S.t + EPS; }
  function buff(name) { return S.buffs[name] != null && S.buffs[name] > S.t + EPS; }
  function debuff(ti, name) { const e = T[ti].deb[name]; return e != null && e > S.t + EPS; }
  function dotLeft(key, ti) { const d = T[ti || S.target].dots[key]; return d && d.expires > S.t + EPS ? d.expires - S.t : 0; }
  function alive(ti) { return !!T[ti] && !T[ti].dead; }
  function havocOn() { return S.havoc && S.havoc.expires > S.t + EPS ? S.havoc.target : 0; }
  function hasteFactor() { return (1 + stats.hastePct / 100) * (buff('berserking') ? 1 + racialOf('cooldown').hastePct / 100 : 1); }
  function castTime(key) {
    let c = table[key].cast;
    if (key === 'soulFire' && buff('decimation')) c *= 1 - tv('decimation', 'sfCastRedPct') / 100;
    if (isSB(key) && buff('shadowTrance')) c = 0;
    return c / hasteFactor();
  }
  function gcd() { return Math.max(cb.minGcd, cb.gcd / hasteFactor()); }
  function effectiveCost(key) {
    let c = table[key].cost;
    if (eurekaAt(key, finishesAt(key))) c *= 1 - EUREKA.costRedPct / 100;   // Eureka!: when the spell will finish inside it
    return c;
  }
  // A precast gets no such room: mana does not regenerate into it before the fight (Xn, 2026-10-07; as in the engine).
  function manaCap() { return stats.maxMana + (S.cast && !S.cast.precast ? S.cast.cost : 0); }
  function gainHealth(amount) { const before = S.health; S.health = Math.min(stats.maxHealth, S.health + amount); return S.health - before; }
  function loseHealth(amount) { S.health -= amount; if (S.health < S.minHealth) S.minHealth = S.health; }
  function canTap() { return S.health > TAP_HP; }
  // Molten Skin (less damage taken) and Soul Link (30% goes to your demon, only while one is out) reduce what your own
  // spells do to you; the two multiply. Life Tap is a cost and is not reduced.
  function selfTakenMult() { return (1 - tv('moltenSkin', 'dmgTakenPct') / 100) * (stats.petActive ? 1 - tv('soulLink', 'toPetPct') / 100 : 1); }
  // What one tick of a spell that also hits you (Hellfire) does to you: its base damage, no damage talents, no crit.
  function selfTick(key) { const s = SPELLS[key]; return s.selfDamage ? Math.round((s.tickBase + s.tickCoef * spNow(table[key])) * selfTakenMult()) : 0; }
  function executePhase(ti) { return T[ti || S.target].hpPct < cfg.fight.executePct; }
  // Seconds into the fight (the engine's clock): from the reset in the check; in play from the moment the fight begins
  // (engage: your first spell taking effect, the pull timer running out, or your pet's first attack order).
  function fightTime(t) { return check ? t : S.fightStart === null ? -1 : t - S.fightStart; }
  // When a timed fight is over (Infinity while it has not started, or when it is not timed).
  function endAt() { return check ? linear : timed && S.fightStart !== null ? S.fightStart + linear : Infinity; }
  // Movement phases: from `every` seconds on, every `every` seconds you have to move for `dur` seconds.
  function forcedMove(t) {
    if (!MOVE) return false;
    const ft = fightTime(t == null ? S.t : t);
    if (ft < 0) return false;
    const k = Math.floor((ft + EPS) / MOVE.every);
    return k >= 1 && ft + EPS - k * MOVE.every < MOVE.dur;
  }
  function beginFight() {
    if (S.fightStart !== null) return;
    S.fightStart = S.t;
    // The healing you are given, and the sacrifice's ticks: all planned now when the fight has a set length (as the
    // engine does), otherwise one at a time.
    if (HEAL) { if (linear) for (let at = HEAL.every; at < linear - EPS; at += HEAL.every) push({ t: S.t + at, o: 0, type: 'heal' }); else push({ t: S.t + HEAL.every, o: 0, type: 'heal', again: true }); }
    if (SAC) { if (linear) for (let at = SAC.every; at < linear - EPS; at += SAC.every) push({ t: S.t + at, o: 0, type: 'sacTick' }); else push({ t: S.t + SAC.every, o: 0, type: 'sacTick', again: true }); }
    if (HIT) push({ t: S.t + R.push() * HIT, o: 1, type: 'dmgTaken' });    // the first hit comes somewhere in the first interval
  }
  // The fight begins and your pet joins in by itself. In play this happens when your first spell takes effect: an
  // instant or a channel when you press it, a spell with a cast bar when it lands - a spell you start before the
  // fight is a precast, and its cast time is not part of the fight (Xn, 2026-10-07). The pull timer (pull) and a pet
  // sent in first begin it too. The check script and the engine count from the start of the first cast.
  function engage(ti) {
    beginFight();
    if (!S.petSent) { S.petSent = true; if (P && P.mode !== 'attack') petCommand('attack', ti); }
  }
  // The pull timer ran out: the fight begins now, whether you are casting or not. False when it had already begun.
  // A cast bar that is running at that moment counts as your precast, however late it lands.
  function pull() {
    if (S.over || S.fightStart !== null) return false;
    if (S.cast && S.cast.precast) { S.precastKey = S.cast.key; emit({ type: 'precast', key: S.cast.key }); }
    engage(S.target);
    return true;
  }
  // What one Life Tap gives (before the bar's limit).
  function tapGain() { return (SPELLS.lifeTap.manaBase + stats.spi) * (1 + tv('improvedLifeTap', 'manaPct') / 100); }
  // A DoT that still had time left is cast over (or pushed off by another Bane): the ticks it had left are lost.
  // Kept for the review; it changes nothing in the fight.
  function noteClip(ti, oldKey, by) {
    const d = T[ti].dots[oldKey], ft = fightTime(S.t);
    if (!d || !(d.expires > S.t + EPS) || ft < 0) return;
    const every = SPELLS[oldKey].tickEvery;
    res.track.clips.push({ t: ft, key: oldKey, by: by, target: ti, left: d.expires - S.t,
                           ticks: Math.max(0, d.ticks - Math.floor((S.t - d.applied + EPS) / every)), every: every });
  }
  // Distances come from the scene; without them (the check script) everything is in range.
  function distanceTo(ti, ctx) { const c = ctx || lastCtx; return c && c.distances && c.distances[ti] != null ? c.distances[ti] : 0; }
  function gap(a, b) { const c = lastCtx; return a === b ? 0 : c && c.gaps && c.gaps[a] && c.gaps[a][b] != null ? c.gaps[a][b] : 0; }

  function push(ev) {            // events in time order; at the same time ticks (0) come before a cast ending (1)
    ev.seq = order++;
    let i = events.length;
    while (i > 0) {
      const p = events[i - 1], d = p.t - ev.t;
      if (d < -EPS || (d <= EPS && (p.o < ev.o || (p.o === ev.o && p.seq <= ev.seq)))) break;
      i--;
    }
    events.splice(i, 0, ev);
  }

  // ---------- damage ----------
  // Eureka! (Gnome; patch of 2026-10-16, as in the engine): an 8 s buff (S.buffs.eureka = when it ends). A damaging
  // spell that FINISHES while it is up gets +10% damage and -10% mana: a cast bar when it completes, an instant when it
  // is cast. A channel: its cost when it starts inside, each tick while the buff is up. DoTs (Corruption, the Banes,
  // Siphon Life) and curses get nothing; Immolate's direct hit does. The +10% adds to the spell's modifier group.
  function eurekaAt(key, t) { const k = SPELLS[key].kind; return !!EUREKA && k !== 'utility' && k !== 'dot' && S.buffs.eureka != null && S.buffs.eureka > t + EPS; }
  function eurekaUp() { return !!EUREKA && buff('eureka'); }
  function eurekaMult(key, periodic) {
    const e = table[key], g = e ? (periodic ? e.op22 : e.op0) || 0 : 0;
    return (1 + g + EUREKA.dmgPct / 100) / (1 + g);
  }
  function eurekaTick(key, periodic) { return periodic && SPELLS[key].kind === 'channel' && eurekaAt(key, S.t) ? eurekaMult(key, true) : 1; }
  function finishesAt(key) { return S.t + (SPELLS[key].kind === 'channel' ? 0 : castTime(key)); }   // a channel counts from its start
  function addOp0(key, pct) { const g = (table[key] && table[key].op0) || 0; return (1 + g + pct / 100) / (1 + g); }
  // What changes a spell's damage at this moment on this target: your buffs, and that target's own debuffs.
  function liveMult(key, periodic, ti) {
    const s = SPELLS[key];
    let m = eurekaTick(key, periodic);
    if (debuff(ti, 'coe')) m *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    if (s.school === 'shadow' && debuff(ti, 'isb')) m *= 1 + tv('improvedShadowBolt', 'debuffPct') / 100;
    if (s.school === 'shadow' && buff('snfShadow')) m *= 1 + tv('shadowAndFlame', 'schoolPct') / 100;
    if (s.school === 'fire' && buff('snfFire')) m *= 1 + tv('shadowAndFlame', 'schoolPct') / 100;
    if (s.drain && tv('soulSiphon')) {
      let n = 0;
      WL.SOUL_SIPHON_EFFECTS.forEach(function (e) { if (e === 'curseOfElements' ? debuff(ti, 'coe') : dotLeft(e, ti) > 0) n++; });
      m *= 1 + Math.min(n * tv('soulSiphon', 'perEffectPct'), tv('soulSiphon', 'maxPct')) / 100;
    }
    return m;
  }
  // Your spell power right now (Blood Fury counts while it is up). Ticks read it when they land: DoTs are dynamic.
  function spNow(e) { return (e.sp + potSp()) * (buff('bloodFury') ? 1 + racialOf('cooldown').spPct / 100 : 1); }

  let resCache = {};
  // periodic: a DoT or channel tick (sim v179, its 'fitted' model: a tick rolls a tenth of a hit's share). Area ticks
  // (Hellfire) roll as hits, as in the engine's aoeTick.
  // Sim v205 (its round 239, A128): each spell's own rule (WL.RESIST_RULES: binary / hit / tick; WL.spellResist).
  // Sim v207 (its round 241, A130): Rain of Fire's ticks roll at a tenth of the share (tickShare); resisted steps above 75%
  // are 75% partials, so a single step left can still be a resist.
  function resProf(school, ti, periodic, sk) {
    const rl = WL.RESIST_RULES[sk], g = rl ? (rl.binary ? 'b' : (rl.noBonus ? 'n' : '') + (rl.tickShare ? 's' : '')) : '';
    const coe = debuff(ti, 'coe'), id = school + (coe ? '1' : '0') + (periodic ? 't' : '') + g;
    return resCache[id] || (resCache[id] = WL.spellResist(cfg, stats.pierce, school, coe, stats.spellPen, sk, periodic));
  }
  // A binary spell that hit: fully resisted while the target has resistance left (one R.vuln roll, only then).
  function binResisted(key, ti) {
    const rl = WL.RESIST_RULES[key];
    if (!rl || !rl.binary) return false;
    const pr = resProf(SPELLS[key].school, ti, false, key);
    return pr.landP < 1 && R.vuln() >= pr.landP;
  }
  function vulnMult(school, ti, periodic, sk) {    // partial resists and Spell Pierce; sk: the spell (its resist rule)
    const pr = resProf(school, ti, periodic, sk);
    let m = pr.flat;
    if (pr.dist.length > 1 || pr.dist[0].pct) {   // sim v207: one step left is all 75% when the share is 90%+
      const x = R.vuln();
      let acc = 0;
      for (let i = 0; i < pr.dist.length; i++) {
        acc += pr.dist[i].p;
        if (x < acc || i === pr.dist.length - 1) { m *= 1 + pr.dist[i].pct / 100; break; }
      }
    }
    return m;
  }

  function hurt(ti, amount) {
    res.byTarget[ti] += amount;
    if (scheduled(ti) || endless) return;
    const t = T[ti];
    t.health = Math.max(0, t.health - amount);
    t.hpPct = 100 * t.health / t.maxHealth;
  }

  function deal(key, amount, crit, isTick, ti, extra) {
    if (BOSS && shielded(ti)) { emit({ type: 'miss', key: key, target: ti, immune: true, pet: key.indexOf('pet:') === 0 }); return; }   // a shield takes it all
    if (OUT_MULT !== 1 && key.indexOf('pet:') !== 0) amount = Math.round(amount * OUT_MULT);   // a boss's curse on you
    const rk = key === 'touchOfTheGrave' || key.indexOf('trinket:') === 0 ? key : rowKey(ti, key), r = row(rk);   // the Undead proc and a trinket's hits have one row for all targets (as in the engine)
    r.dmg += amount; res.total += amount;
    if (isTick) { r.ticks++; if (crit) r.tickCrits++; } else { r.hits++; if (crit) r.crits++; }
    hurt(ti, amount);
    if (key.indexOf('pet:') !== 0) {                       // Drain Life, Siphon Life, Death Coil, Touch of the Grave: what they deal comes back as health
      const share = key === 'touchOfTheGrave' ? 1 : (SPELLS[key] && SPELLS[key].leech) || 0;
      if (share) gainHealth(amount * share);
    }
    emit(Object.assign({ type: isTick ? 'tick' : 'hit', key: key, target: ti, amount: amount, crit: crit, school: SPELLS[key] ? SPELLS[key].school : 'shadow' }, extra));
    // Bane of Havoc: a share of what you (not the pet) do to the other targets is also done to the one it sits on.
    const hav = havocOn();
    let copied = 0;
    if (hav && havocPct && key.indexOf('pet:') !== 0 && ti !== hav && (scheduled(hav) || alive(hav))) {
      const h = row('baneOfHavoc');
      copied = amount * havocPct;
      h.dmg += copied; h.hits++; res.total += copied;
      hurt(hav, copied);
      emit({ type: 'havoc', key: 'baneOfHavoc', target: hav, amount: copied, school: 'shadow' });
      if (!scheduled(hav) && T[hav].health <= 0 && !T[hav].dead) kill(hav);
    }
    if (key.indexOf('pet:') !== 0) { const threat = (amount + copied) * threatMult(key); r.threat += threat; res.threat += threat; }   // the Havoc copy counts for the spell that caused it
    if (!scheduled(ti) && T[ti].health <= 0 && !T[ti].dead) kill(ti);
  }

  // A target is down. The fight is over when the last one falls.
  function kill(ti) {
    const t = T[ti];
    t.dead = true; t.dots = {}; t.deb = {}; t.brandCharges = 0;
    if (S.cast && S.cast.target === ti) interrupt('dead');
    if (S.channel && S.channel.target === ti && !SPELLS[S.channel.key].aoe) interrupt('dead');
    if (S.havoc && S.havoc.target === ti) S.havoc = null;
    let next = 0;
    for (let i = 1; i <= N && !next; i++) if (alive(i)) next = i;
    if (P && P.target === ti) {
      P.active = false; P.gen++; P.casting = null;
      if (next) P.target = alive(S.target) ? S.target : next;
    }
    if (!next) {
      S.over = true; S.fightEnd = S.t;
      S.cast = null; S.channel = null; events.length = 0; queued = null;
      if (P) { P.active = false; P.gen++; P.casting = null; }
    }
    const seconds = Math.max(S.t - (S.fightStart === null ? S.t : S.fightStart), 0);
    emit({ type: 'death', target: ti, last: !next, seconds: seconds, total: res.total, dps: seconds > 0 ? res.total / seconds : 0 });
    if (next && S.target === ti) { S.target = next; emit({ type: 'target', target: next, auto: true }); }
  }

  // Judgement of Wisdom sits on the first target only (the boss of the engine).
  function jowProc(pet) {
    if (!JOW || R.jow() * 100 >= JOW.chancePct) return;
    if (pet) { if (!P) return; petRegen(); P.mana = Math.min(P.maxMana, P.mana + JOW.mana); return; }
    const before = S.mana;
    S.mana = Math.min(stats.maxMana, S.mana + JOW.mana);
    emit({ type: 'mana', source: 'Judgement of Wisdom', amount: S.mana - before });
  }
  // Touch of the Grave (Undead; patch of 2026-10-16, as in the engine): a 30% chance, then its icd (15 s since 2026-10-27) before it can come
  // again (no roll meanwhile). 5% of your maximum health - so it grows with Stamina - and nothing multiplies it: no
  // auras, no Curse of the Elements, no Improved Shadow Bolt, no Shadow and Flame. No spell power, no crit, no resist.
  // key: the landing spell - Rain of Fire's cast never procs it (castNoTog; sim v209, its round 244).
  function touchOfTheGrave(ti, key) {
    if (key && SPELLS[key].castNoTog) return;
    if (TOG && !(S.togReady > S.t + EPS) && R.proc() * 100 < TOG.chancePct) {
      S.togReady = S.t + (TOG.icd || 0);
      const amount = stats.maxHealth * TOG.maxHealthPct / 100;
      row('touchOfTheGrave').casts++;
      if (alive(ti)) deal('touchOfTheGrave', amount, false, false, ti);   // on the target the spell landed on
    }
  }

  function applyDot(ti, key, snap) {
    const s = SPELLS[key], e = table[key], id = ++inst, t = T[ti];
    if (s.bane) { noteClip(ti, 'baneOfAgony', key); noteClip(ti, 'baneOfDoom', key); } else noteClip(ti, key, key);
    if (s.bane) {                                                     // one Bane per target
      delete t.dots.baneOfAgony; delete t.dots.baneOfDoom;
      if (!check && S.havoc && S.havoc.target === ti) S.havoc = null;
    }
    const d = t.dots[key] = { inst: id, applied: S.t, expires: S.t + s.duration, ticks: e.ticks, snap: snap };
    if (WRACK_X[key]) { d.xg = 0; if (S.wrackOn === ti) xSched(ti, key, d, false); }   // extra ticks under Wrack
    for (let i = 1; i <= e.ticks; i++) push({ t: S.t + i * s.tickEvery, o: 0, type: 'dotTick', key: key, target: ti, inst: id, i: i - 1 });
  }

  // ---------- Wrack's extra DoT ticks (patch of 2026-11-10; the engine's 'halfway' model, its v174) ----------
  // A DoT Wrack helps keeps its normal ticks. Every half-way point between two of them (applied + (k + 0.5) x tickEvery)
  // that falls while you channel Wrack at its target gives one extra full tick. Stopping Wrack moves nothing.
  function wrackTarget() { return S.channel && S.channel.key === 'wrack' ? S.channel.target : 0; }
  // Queue DoT d's next half-way point from now (strict: after now, right after one came), while the DoT lasts.
  function xSched(ti, key, d, strict) {
    const te = SPELLS[key].tickEvery;
    let t = d.applied + (Math.ceil((S.t - d.applied) / te - 0.5 + (strict ? 1e-6 : -1e-6)) + 0.5) * te;
    if (d.xLast != null && t <= d.xLast + 1e-6) t += te;   // a point that already ticked (Wrack restarted right then) ticks once (sim v175)
    if (t < d.expires - 1e-6) push({ t: t, o: 0, type: 'wrackX', key: key, target: ti, inst: d.inst, gen: d.xg });
  }
  // Wrack started or stopped (or moved to another target): the queued extra ticks are void (d.xg), and the DoTs on its
  // new target queue their next half-way point. Called right where a channel starts or ends (a Wrack cast again over
  // a running one at the same target changes nothing, as in the engine).
  function syncWrack() {
    const on = wrackTarget(), was = S.wrackOn;
    if (on === was) return;
    if (!on !== !was) { if (was) S.wrackTime += S.t - S.wrackOnAt; else S.wrackOnAt = S.t; }   // Wrack's share of the fight (dotValue)
    S.wrackOn = on;
    [was, on].forEach(function (ti) {
      if (!ti) return;
      const dots = T[ti].dots;
      for (const k in dots) {
        const d = dots[k];
        if (!WRACK_X[k] || d.xg == null) continue;
        d.xg++;
        if (ti === on) xSched(ti, k, d, false);
      }
    });
  }

  function periodicTick(key, snap, i, ti, extra, chan) {   // extra: an extra tick from Wrack (the log says so); chan: a channel's tick
    const s = SPELLS[key], e = table[key];
    let amount = (s.tickBase + s.tickCoef * spNow(e)) * e.periodicMult * liveMult(key, true, ti) * (snap.castMult || 1);
    if (s.ramp) amount *= s.ramp[i];
    amount *= vulnMult(s.school, ti, true, key);
    const rvc = chan && REV ? revTick() : 0;             // sim v214 (its round 250): a channel tick takes Revelation (crits) and spends it
    const crit = R.crit() * 100 < e.critPct + rvc + trCrit(key, ti);
    if (crit) amount *= e.critMult;
    deal(key, amount, crit, true, ti, extra ? { extra: true } : null);
    if (S.over) return;
    if (WL.NIGHTFALL_SPELLS.indexOf(key) >= 0 && tv('nightfall') && R.proc() * 100 < tv('nightfall', 'procPct')) {
      S.buffs.shadowTrance = S.t + 10;
      emit({ type: 'proc', name: 'shadowTrance' });
    }
  }

  // A tick of an area channel: every target in its area takes its own hit, with its own rolls. Hellfire burns around
  // you, Rain of Fire around the target it was aimed at.
  function aoeTick(key, i, aimed) {
    const s = SPELLS[key], e = table[key];
    const rvc = REV ? revTick() : 0;                  // sim v214 (its round 250): the tick takes Revelation once, before its targets
    let plain = false;                                // a landed hit of this tick that did not crit
    for (let ti = 1; ti <= N; ti++) {
      if (S.over) return;
      if (!alive(ti) || immuneTo(ti, s.school)) continue;     // a boss immune to fire takes nothing from Rain of Fire or Hellfire
      if (!check && (s.range ? gap(aimed, ti) : distanceTo(ti)) > e.radius + EPS) continue;
      const r = row(rowKey(ti, key));
      if (R.hit() * 100 >= hitNow()) { r.misses++; emit({ type: 'miss', key: key, target: ti, tick: true }); continue; }
      let amount = (s.tickBase + s.tickCoef * spNow(e)) * e.periodicMult * liveMult(key, true, ti);
      amount *= vulnMult(s.school, ti, false, key);   // area ticks roll as hits (Rain of Fire: no Pierce bonus, a tenth of the share)
      const crit = R.crit() * 100 < e.critPct + rvc + trCrit(key, ti);
      if (!crit) plain = true;
      if (crit) amount *= e.critMult;
      deal(key, amount, crit, true, ti);
    }
    if (REV && !rvc && plain && !S.over) revRoll(false);   // sim v214: one trigger roll per tick, after its targets
    if (s.selfDamage && !S.over) { const hurtYou = selfTick(key); loseHealth(hurtYou); emit({ type: 'selfHit', key: key, amount: hurtYou }); }
  }

  // A finished or instant cast arrives at its target. Returns true when it hit.
  // rev: this cast took Revelation when it completed (revTake; sim v209, its round 243).
  function land(key, castMult, ti, eureka, rev) {   // eureka: the cast finished inside Eureka!
    const s = SPELLS[key], e = table[key], r = row(rowKey(ti, key)), t = T[ti];
    if (R.hit() * 100 >= hitNow()) { r.misses++; emit({ type: 'miss', key: key, target: ti }); return false; }   // + a hit trinket (the engine's missRoll)
    if (binResisted(key, ti)) { r.misses++; r.resisted = (r.resisted || 0) + 1; emit({ type: 'miss', key: key, target: ti, resisted: true }); return false; }   // sim v205
    r.landed++;
    if (key === 'baneOfAgony') { S.ampUp = false; if (AMP_BTN) delete S.buffs.amplifyCurse; }   // Amplify Curse spent on a Bane that landed
    if (s.kind === 'utility') {
      if (key === 'curseOfElements') { t.deb.coe = S.t + s.duration; emit({ type: 'apply', key: key, target: ti }); }
      if (ti === 1) jowProc();
      return true;
    }
    if (s.kind === 'dot') {
      applyDot(ti, key, { castMult: castMult || 1 });
      emit({ type: 'apply', key: key, target: ti });
      touchOfTheGrave(ti, key);
      if (ti === 1 && !S.over) jowProc();
      return true;
    }
    let amount = (s.base + s.coef * spNow(e)) * e.directMult * liveMult(key, false, ti) * (eureka ? eurekaMult(key, false) : 1);
    if (key === 'incinerate' && dotLeft('immolate', ti) > 0) amount *= 1 + s.immolateBonusPct / 100;
    if ((isSB(key) || key === 'searingPain') && executePhase(ti) && tv('decimation')) {
      amount *= addOp0(key, tv('decimation', 'dmgPct'));
      if (!buff('decimation')) emit({ type: 'proc', name: 'decimation' });
      S.buffs.decimation = S.t + 10;
    }
    amount *= vulnMult(s.school, ti, false, key);
    // Revelation (sim v209, its round 243; any target): taken at the cast, it adds its crit here; a hit that took
    // none and does not crit may give it.
    const crit = R.crit() * 100 < e.critPct + (rev ? REV.fx.proc.pct : 0) + trCrit(key, ti);
    if (REV && !rev) revRoll(crit);
    if (crit) amount *= e.critMult;
    deal(key, amount, crit, false, ti);
    if (crit && ti === 1) trCritDone();                                // Weakness Analyzer ends on a direct crit
    // Improved Shadow Bolt: every Shadow Bolt crit applies it (Xn, 2026-10-07; there is no second hit roll for it).
    if (isSB(key) && crit && tv('improvedShadowBolt') && !t.dead) { t.deb.isb = S.t + 12; emit({ type: 'apply', key: 'isb', target: ti }); }
    if (key === 'searingPain' && tv('demonicBrand') && P && !t.dead) {  // Demonic Brand: the pet's attacks on it add damage
      if (!(debuff(ti, 'brand') && t.brandCharges > 0)) emit({ type: 'apply', key: 'brand', target: ti });
      t.deb.brand = S.t + cfg.demonicBrand.duration;
      t.brandCharges = tv('demonicBrand', 'charges');
    }
    if (key === 'conflagrate') {
      if (tv('shadowAndFlame')) S.buffs.snfShadow = S.t + 20;
      if (!(tv('shadowAndFlame') && R.proc() * 100 < tv('shadowAndFlame', 'procPct'))) { delete t.dots.immolate; emit({ type: 'consume', key: 'immolate', target: ti }); }
    }
    if (key === 'shadowburn' && tv('shadowAndFlame')) {
      S.buffs.snfFire = S.t + 20;
      if (R.proc() * 100 < tv('shadowAndFlame', 'procPct')) { S.shards++; if (isFinite(S.shards)) emit({ type: 'refund', key: 'soulShard' }); }
    }
    if (S.over) return true;
    if (s.kind === 'hybrid' && !t.dead) applyDot(ti, key, { castMult: castMult || 1 });
    touchOfTheGrave(ti, key);
    if (ti === 1 && !S.over) jowProc();
    return true;
  }

  // ---------- the pet ----------
  // Its spell power is a share of yours plus Demonic Knowledge; it uses your hit chance and your crit chance.
  function makePet(key) {
    if (!key || !cfg.options.includePetDamage) return null;
    const pc = cfg.pets[key], maxMana = pc.mana * (1 + tv('felVitality', 'manaPct') / 100);
    // Sim v209 (its round 244): mana a second = mp5PerOwnerInt x your Intellect / 5 (MP5, all the time; Imp 30%, the others
    // 10%), or manaRegen where the data has no share (Felhunter); plus an equipped item's pet MP5 (Pimgib's Collar).
    const regenAdd = (WL.trinketEquipFx ? WL.trinketEquipFx(cfg) : []).reduce(function (a, q) { return a + (q.petMp5 && (!q.pet || q.pet === key) ? q.petMp5 / 5 : 0); }, 0);
    const regen = (pc.mp5PerOwnerInt != null ? pc.mp5PerOwnerInt * stats.int / 5 : pc.manaRegen || 0) + regenAdd;
    return { key: key, c: pc, maxMana: maxMana, mana: maxMana, regen: regen, lastRegen: 0, lashReady: 0, swingReady: 0, gen: 0,
             mode: 'follow', active: false, casting: null, target: 1,
             range: pc.melee ? petMeleeRange : pc.spell.range };
  }
  function petRegen() { P.mana = Math.min(P.maxMana, P.mana + P.regen * (S.t - P.lastRegen)); P.lastRegen = S.t; }   // sim v209: P.regen (makePet)
  function petSchool() { return build.pet === 'imp' ? 'fire' : 'shadow'; }
  function petMult(school) {
    let m = (1 + tv('unholyPower', 'petDmgPct') / 100) * stats.mult.all;
    if (COMMAND) m *= 1 + COMMAND.value / 100;                                                          // Orc, patch of 2026-10-26
    if ((build.pet === 'succubus' && school === 'shadow') || (build.pet === 'imp' && school === 'fire')) m *= 1 + tv('masterDemonologist', 'schoolPct') / 100;
    if (school !== 'physical' && debuff(P.target, 'coe')) m *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    return m;
  }
  function warlockSpNow() { return (stats.sp + potSp()) * (buff('bloodFury') ? 1 + racialOf('cooldown').spPct / 100 : 1); }
  // Sim v209 (its round 244): a demon takes its share of spell power (and its attack power) from your school total -
  // generic + the better of your Shadow / Fire spell power (cfg.petSchoolSp; false = generic only), live.
  function petOwnerSp() {
    if (cfg.petSchoolSp === false) return warlockSpNow();
    const best = Math.max(0, stats.schoolSp.shadow || 0, stats.schoolSp.fire || 0);
    return (stats.sp + best + potSp()) * (buff('bloodFury') ? 1 + racialOf('cooldown').spPct / 100 : 1);
  }
  function petSp() { return petOwnerSp() * (cfg.petSpPct != null ? cfg.petSpPct : 100) / 100 + (stats.dkSp || 0); }
  // Sim v209 (its round 244): a demon's crit = cfg.petCrit - live (fromOwner false): its own (melee / spell) + your gear's
  // crit (stats.gearCritPct); fromOwner true: your spell crit.
  const PCRIT = cfg.petCrit || { fromOwner: true, ownMeleePct: 0, ownSpellPct: 0 };
  function petCritPct(melee) { return PCRIT.fromOwner ? stats.critPct : (melee ? PCRIT.ownMeleePct : PCRIT.ownSpellPct) + (stats.gearCritPct || 0); }

  // Sim v205: a demon's spell against the target's resistance after Curse of the Elements (none of your Pierce /
  // Penetration). R.pet rolls only while resistance is left. Firebolt binary; Lash of Pain and Demonic Brand partial.
  const petResCache = {};
  function petRes(school, pk, ti) { const coe = debuff(ti, 'coe'), k = school + (coe ? 1 : 0) + pk; return petResCache[k] || (petResCache[k] = WL.petResist(cfg, school, coe, pk)); }
  function petResRoll(pr) {
    if (pr.dist.length < 2 && !pr.dist[0].pct) return 1;   // sim v207: a single 75% step still counts
    const x = R.pet(); let acc = 0;
    for (let i = 0; i < pr.dist.length; i++) { acc += pr.dist[i].p; if (x < acc || i === pr.dist.length - 1) return 1 + pr.dist[i].pct / 100; }
    return 1;
  }
  function petSpellHit(sp) {
    const key = 'pet:' + sp.key, ti = P.target, r = row(rowKey(ti, key));
    P.casting = null;
    r.casts++;
    if (immuneTo(ti, sp.school)) { emit({ type: 'miss', key: key, target: ti, pet: true, immune: true }); return; }   // the Imp's Firebolt at Onyxia
    if (R.pet() * 100 >= stats.hitPct) { r.misses++; emit({ type: 'miss', key: key, target: ti, pet: true }); return; }
    const ppr = petRes(sp.school, sp.key, ti);
    if (ppr.landP < 1 && R.pet() >= ppr.landP) { r.misses++; r.resisted = (r.resisted || 0) + 1; emit({ type: 'miss', key: key, target: ti, pet: true, resisted: true }); return; }   // Firebolt is binary
    r.landed++;
    if (ti === 1) jowProc(true);
    const base = sp.base * (sp.key === 'lashOfPain' ? 1 + tv('improvedSayaad', 'lashPct') / 100 : 1);
    let amount = (base + sp.coef * petSp()) * petMult(sp.school);
    if (sp.key === 'firebolt') amount *= 1 + tv('improvedImp', 'firebolt') / 100;
    amount *= petResRoll(ppr);                                         // Lash of Pain: partial resists
    const crit = R.pet() * 100 < petCritPct(false);                   // the demon's spell crit (sim v209)
    if (crit) amount *= cb.critMultiplier;
    deal(key, amount, crit, false, ti, { pet: true, school: sp.school });
    if (!S.over && alive(ti)) brandProc(ti);
  }
  // Demonic Brand: a pet attack that lands on a branded target uses a charge and adds damage (cannot miss or crit).
  function brandProc(ti) {
    const t = T[ti];
    if (!debuff(ti, 'brand') || !(t.brandCharges > 0)) return;
    t.brandCharges--;
    const db = cfg.demonicBrand, school = petSchool();
    const amount = ((db.baseMin + db.baseMax) / 2 + db.shadowSpCoef * (warlockSpNow() + (stats.schoolSp.shadow || 0))) * petMult(school) * petResRoll(petRes(school, 'brand', ti));
    row(rowKey(ti, 'pet:brand')).casts++;
    deal('pet:brand', amount, false, false, ti, { pet: true, school: school });
  }
  function petEvent(t, o, type) { push({ t: t, o: o, type: type, gen: P.gen }); }
  function petAct() {                       // its spell: Firebolt again and again, Lash of Pain whenever it is ready
    if (!P.c.spell || (S.t >= endAt() - EPS)) return;
    petRegen();
    const sp = P.c.spell;
    if (sp.cd && P.lashReady > S.t + EPS) { petEvent(P.lashReady, 2, 'petAct'); return; }
    if (P.mana < sp.cost) { if (P.regen > 0) petEvent(S.t + Math.max(0.1, (sp.cost - P.mana) / P.regen), 2, 'petAct'); return; }   // its own regen (sim v209)
    P.mana -= sp.cost;
    if (sp.cd) P.lashReady = S.t + sp.cd;
    if (sp.cast) {
      P.casting = { start: S.t, end: S.t + sp.cast };
      emit({ type: 'petCast', key: 'pet:' + sp.key, castTime: sp.cast });
      petEvent(S.t + sp.cast, 1, 'petLand');
      petEvent(S.t + sp.cast, 2, 'petAct');
    } else {
      const gen = P.gen;
      petSpellHit(sp);
      if (!S.over && P.gen === gen) petEvent(P.lashReady || S.t + 1.5, 2, 'petAct');
    }
  }
  // The pet's melee. Windfury Totem (extra attacks) and Flametongue Totem (a Fire hit per swing) were here until the
  // patch of 2026-10-16; since then they only affect players.
  function petSwing() {
    if (S.t >= endAt() - EPS) return;
    const m = P.c.melee, ti = P.target, gen = P.gen;
    P.swingReady = S.t + m.swing;
    petMeleeAttack('pet:melee', R.pet() * 100, ti);
    if (!S.over && P.gen === gen) petEvent(S.t + m.swing, 0, 'petSwing');
  }
  function petMeleeAttack(key, roll, ti) {   // one roll decides miss, dodge, glancing, crit or hit; true if it landed
    const m = P.c.melee, r = row(rowKey(ti, key)), tb = cb.petMelee;
    r.casts++;
    const hitBonus = WL.petMeleeHit(stats, cb);   // 8/17 of your spell hit above the base, not capped, nothing ignored (sim, 2026-10-21)
    const miss = Math.max(0, tb.missPct - hitBonus);
    const critChance = Math.max(0, (m.critPct || 0) + (m.inheritSpellCrit ? petCritPct(true) : 0) - tb.critSuppressionPct);   // the demon's crit (sim v209)
    if (roll >= miss + tb.dodgePct) {
      r.landed++;
      if (ti === 1) jowProc(true);
      const dps = m.baseDps + m.apPerSp * petOwnerSp() / m.apPerDps;   // your school total (sim v209)
      let amount = dps * m.swing * (1 - armorRed) * petMult('physical') * (m.dmgPct != null ? m.dmgPct / 100 : 1);   // the Voidwalker's melee halved (sim v209)
      const glance = roll < miss + tb.dodgePct + tb.glancePct;
      const crit = !glance && roll < miss + tb.dodgePct + tb.glancePct + critChance;
      if (glance) amount *= tb.glanceDmgPct / 100;
      if (crit) amount *= 2;
      deal(key, amount, crit, false, ti, { pet: true, school: 'physical', glance: glance });
      if (!S.over && alive(ti)) brandProc(ti);
      return true;
    }
    r.misses++;
    emit({ type: 'miss', key: key, target: ti, pet: true, dodge: roll >= miss });
    return false;
  }
  // The pet attacks while it is told to and stands in range of its target. ctx.petDistance = that distance in yards.
  function syncPet(ctx) {
    if (!P || S.over) return;
    if (!alive(P.target)) { for (let i = 1; i <= N; i++) if (alive(i)) { P.target = alive(S.target) ? S.target : i; break; } }
    const distance = ctx && ctx.petDistance != null ? ctx.petDistance : 0;
    const wanted = P.mode === 'attack' && alive(P.target) && distance <= P.range + EPS;
    if (wanted === P.active) return;
    P.active = wanted;
    P.gen++;                                // whatever it had planned is dropped
    P.casting = null;
    if (!wanted) return;
    beginFight();
    if (P.c.melee) petEvent(Math.max(S.t, P.swingReady), 0, 'petSwing');
    if (P.c.spell) petEvent(S.t, 2, 'petAct');
  }
  // 'attack' sends the pet at your current target; 'follow' calls it back.
  function petCommand(mode, ti) {
    if (!P || S.over) return false;
    const target = mode === 'attack' ? (alive(ti || S.target) ? (ti || S.target) : P.target) : P.target;
    if (mode === 'attack' && target !== P.target) { P.target = target; P.active = false; P.gen++; P.casting = null; }
    P.mode = mode;
    emit({ type: 'petMode', mode: mode, target: P.target });
    return true;
  }

  // ---------- casting ----------
  // A cast bar's price is fixed when the cast starts (as in the engine) and paid at its end.
  function commit(key, startedWithDecimation, price) {
    const s = SPELLS[key], paid = price != null ? price : effectiveCost(key);
    S.mana -= paid;
    if (paid > 0) S.lastSpend = S.t;                       // the 5 seconds start again (a cast bar: at its end, which is now)
    res.track.spent += paid;
    if (S.mana < res.track.minMana) res.track.minMana = S.mana;
    if (res.track.first === null && S.fightStart !== null) res.track.first = S.t - S.fightStart;
    let castMult = 1;
    // Amplify Curse is used by itself with Bane of Agony whenever it is ready (as the engine does): that Bane's whole tick
    // value, after everything else, times 1.5 (sim 2a33649; it was the base value only).
    // As a button (AMP_BTN) its buff counts while it is up. Either way it stays up when that Bane misses and goes to the
    // next Bane of Agony that lands (sim v173: S.ampUp; land() clears it, and the button's buff, when a Bane lands).
    if (key === 'baneOfAgony' && tv('amplifyCurse')) {
      if (AMP_BTN) { if (buff('amplifyCurse')) castMult = 1 + tv('amplifyCurse', 'boaPct') / 100; }
      else {
        if (!S.ampUp && ready('amplifyCurse')) { S.ampUp = true; S.cds.amplifyCurse = S.t + AMP_CD; emit({ type: 'used', name: 'Amplify Curse' }); }
        if (S.ampUp) castMult = 1 + tv('amplifyCurse', 'boaPct') / 100;
      }
    }
    const free = key === 'soulFire' && (startedWithDecimation || buff('decimation'));
    if (s.shards && !free) S.shards -= s.shards;
    if (key === 'soulFire' && buff('decimation')) delete S.buffs.decimation;
    return { castMult: castMult };
  }

  function startCast(key, ti) {
    const s = SPELLS[key], e = table[key];
    const nCh = s.kind === 'channel' ? e.ticks : 0, chDur = s.duration;
    const castT = castTime(key), gcdT = gcd();
    const trance = isSB(key) && buff('shadowTrance');
    // A cast bar started before the fight is a precast: the fight begins when it lands (handle, 'castEnd').
    const precast = !check && S.fightStart === null && key !== 'lifeTap' && s.kind !== 'channel' && castT > EPS;
    if (key !== 'lifeTap' && !precast) engage(ti);
    S.presses.push({ t: S.t, k: key, target: ti });
    S.gcdStart = S.t; S.gcdReady = S.t + gcdT;
    emit({ type: 'cast', key: key, target: ti, castTime: castT, channel: s.kind === 'channel' ? chDur : 0 });

    if (key === 'lifeTap') {
      const gain = tapGain();
      const before = S.mana;
      loseHealth(TAP_HP);
      S.mana = Math.min(stats.maxMana, S.mana + gain);
      row('lifeTap').casts++;
      res.track.lifeTaps++;
      res.track.tapMana += S.mana - before;
      res.track.tapLost += Math.max(0, gain - (S.mana - before));
      if ((lastCtx && lastCtx.moving) || forcedMove()) res.track.tapsMoving++;
      emit({ type: 'mana', source: 'Life Tap', amount: S.mana - before });
      if (P && tv('demonicEnergies')) {     // Demonic Energies: the pet gains a share of the mana you gained
        petRegen();
        P.mana = Math.min(P.maxMana, P.mana + (S.mana - before) * tv('demonicEnergies', 'tapPct') / 100);
      }
      S.decideSeq = order++;
      return;
    }

    row(rowKey(ti, key)).casts++;
    if (s.kind === 'channel') {
      const spent = commit(key), r = row(rowKey(ti, key));
      if (e.cd) S.cds[key] = S.t + e.cd;
      const chMiss = !s.aoe && R.hit() * 100 >= hitNow(), chRes = !s.aoe && !chMiss && binResisted(key, ti);   // Drain Soul is binary (sim v205)
      if (chMiss || chRes) {                               // area channels always start; their ticks roll per target
        r.misses++; if (chRes) r.resisted = (r.resisted || 0) + 1; emit(Object.assign({ type: 'miss', key: key, target: ti }, chRes ? { resisted: true } : {}));
        syncWrack();                                       // a Wrack cast again that missed: the old one is gone too
        S.decideSeq = order++;
        return;
      }
      r.landed++;
      // Sim v209 (its round 244): Hellfire's cast targets you and rolls no procs (castOnSelf: no Touch of the Grave, no
      // Judgement of Wisdom); Rain of Fire's cast rolls them, except Touch of the Grave (castNoTog, in touchOfTheGrave).
      if (!s.castOnSelf) touchOfTheGrave(ti, key);
      if (!S.over) {
        if ((ti === 1 || s.aoe) && !s.castOnSelf) jowProc();
        const id = ++inst;
        S.channel = { key: key, inst: id, target: ti, snap: { castMult: 1 }, start: S.t, end: S.t + chDur, ticks: nCh, done: 0 };
        for (let i = 1; i <= nCh; i++) push({ t: S.t + i * s.tickEvery, o: 0, type: 'chanTick', key: key, inst: id, i: i - 1 });
        syncWrack();
      }
    } else if (castT > EPS) {
      const id = ++inst;
      // A cooldown starts when the cast is complete, not when it begins (Xn, 2026-10-06; as in the engine). It is set
      // here for the moment the cast will end; a pushback moves it along (takeHit), and a cast that is stopped never
      // had one (interrupt). Only Soul Fire has both a cast time and a cooldown.
      if (e.cd) S.cds[key] = S.t + castT + e.cd;
      S.cast = { key: key, inst: id, target: ti, start: S.t, end: S.t + castT, full: castT, hits: 0, cost: effectiveCost(key), decimation: key === 'soulFire' && buff('decimation'), precast: precast };
      push({ t: S.t + castT, o: 1, type: 'castEnd', inst: id });
    } else {
      const price = effectiveCost(key);                    // before Shadow Trance is used up: it makes the cast instant (Eureka! asks when it finishes)
      if (trance) delete S.buffs.shadowTrance;
      if (e.cd) S.cds[key] = S.t + e.cd;
      const spent = commit(key, undefined, price);
      const rvt = REV ? revTake(key) : false;              // sim v209: an instant takes Revelation when cast
      land(key, spent.castMult, ti, eurekaAt(key, S.t), rvt);
    }
    S.decideSeq = order++;
  }

  // You take a hit (config.fight.hitEvery). A cast is pushed back 1.0 / 0.8 / 0.6 / 0.4 / 0.2 s, then 0.2 s for every
  // later hit of the same cast, never further than its full length from now; a channel loses a quarter of its full
  // length. Intensity (Destruction spells), Fel Concentration (the drains) and Concentration Aura protect: one roll.
  function takeHit() {
    const c = S.channel, key = c ? c.key : S.cast && S.t < S.cast.end - EPS ? S.cast.key : null;   // not a cast ending right now
    if (!key) return;
    let protect = AURA_PUSH;
    if (SPELLS[key].tree === 'destruction') protect += tv('intensity', 'resistPct');
    if (FEL_CONC[key]) protect += tv('felConcentration', 'resistPct');
    protect = Math.min(100, protect);
    if (protect > 0 && R.push() * 100 < protect) { emit({ type: 'pushResist', key: key }); return; }
    let lost;
    if (c) {
      const end = Math.max(S.t, c.end - 0.25 * SPELLS[key].duration);
      lost = c.end - end; c.end = end;
      push({ t: c.end, o: 1, type: 'chanEnd', inst: c.inst });
    } else {
      const cs = S.cast, step = Math.max(0.2, 1 - 0.2 * cs.hits), end = Math.min(cs.end + step, S.t + cs.full);
      lost = end - cs.end; cs.hits++;
      if (lost <= EPS) return;
      cs.end = end; cs.inst = ++inst;                    // the old ending no longer counts
      if (table[cs.key] && table[cs.key].cd && S.cds[cs.key]) S.cds[cs.key] += lost;   // its cooldown starts at the later cast end
      push({ t: cs.end, o: 1, type: 'castEnd', inst: cs.inst });
    }
    res.track.pushbacks++; res.track.pushbackTime += lost;
    emit({ type: 'pushback', key: key, lost: lost, channel: !!c });
    S.decideSeq = order++;
  }

  // Stops a cast bar or a channel (you moved, pressed Escape, cast something else over a channel, or the target died).
  function interrupt(reason) {
    if ((S.cast || S.channel) && reason === 'moving') res.track.interrupts++;
    if (S.cast) {
      const key = S.cast.key;
      if (table[key].cd) delete S.cds[key];              // nothing was cast: no cooldown, no cost
      if (S.cast.precast && S.precastKey === key) { S.precastKey = null; emit({ type: 'precast', key: null }); }   // it never landed
      S.cast = null;
      S.mana = Math.min(S.mana, stats.maxMana);
      emit({ type: 'interrupt', key: key, reason: reason });
    } else if (S.channel) {
      const key = S.channel.key;
      S.channel = null;
      syncWrack();
      flushHeld();
      emit({ type: 'interrupt', key: key, reason: reason, channel: true });
    }
  }

  // ---------- what the sim uses by itself (its page defaults since v181: Pre-BiS gear, Phase 1 consumables) ----------
  // Not buttons (Xn: no potions or runes as buttons): used at the engine's moments. Before a damaging cast you can pay
  // for: the Spellblasting potion and a use trinket, by the engine's "Pop cooldowns" rule (options.activesPolicy, the
  // default 'doom'). Before any cast or Life Tap: a mana potion or rune once its amount is missing. Revelation on the
  // weapon: a direct spell that does not crit may give the next one + its crit. Use trinkets of the kinds the Pre-BiS lists
  // hold are played (crit: Weakness Analyzer; since the sim's Max Pre-BiS, 2026-11-24: dmgOver, Zarla's Snack Pouch, and
  // hit, Eye of the Beast): no Pre-BiS list has a proc trinket or a set bonus with an effect.
  const CONS = WL.activeConsumables(cfg);
  const SP_POT = CONS.filter(function (c) { return c.spPotion && WL.consumableHolds(cfg, c); })[0] || null;
  const MANA_ITEMS = CONS.filter(function (c) { return c.manaRestore; });
  // Sim (Max Pre-BiS, 2026-11-24): its lists also hold 'dmgOver' (Zarla's Snack Pouch: a summoned whelp's hits) and 'hit'
  // (Eye of the Beast: + spell hit while up), so those use kinds are played too. Other kinds are in no Pre-BiS list.
  const TR_KINDS = { crit: 1, hit: 1, dmgOver: 1 };
  const TRK = (WL.equippedTrinkets ? WL.equippedTrinkets(cfg) : []).filter(function (x) { return x.fx.use && TR_KINDS[x.fx.use.kind] && WL.fxOn(cfg, x.fx.use); });   // sim v207: an onlyVs effect is never used where it does nothing
  const TRU = (cfg.options && cfg.options.trinketUse) || {}, trUntil = {};
  // The engine's trUse, once ready and allowed: its cooldown, its buff (Golden Banana's durZones kept for the form), and
  // for 'dmgOver' its shots, one every `every` s from the use (trShot events, handled by trHit).
  function trUse(x) {
    const u = x.fx.use;
    S.cds['tr:' + x.slot] = S.t + u.cd;
    if (u.duration) trUntil[x.slot] = S.t + u.duration * (u.durZones ? WL.fxMult(cfg, { zones: u.durZones }) : 1);
    emit({ type: 'used', name: x.fx.name });
    if (u.kind === 'dmgOver') {
      row('trinket:' + x.id).casts++;
      for (let si = 1; si <= u.shots; si++) push({ t: S.t + si * u.every, o: 0, type: 'trShot', slot: x.slot });
    }
  }
  // Sim v191 (its round 219): "Activate trinket" in the priority list uses every ready on-use trinket (not the mana ones)
  // when the engine's walk down the list reaches it (off the global cooldown; the walk goes on). With it in the list, the
  // trinkets are no longer popped with the cooldowns (popActives) - "never" still keeps one unused. Here the walk is done
  // where the engine walks: at a press (tryCast, the engine's decide) and at a channel tick (aplWalk, its clip check).
  const TRK_APL = WL.effectiveRotation(build, cfg).indexOf('activateTrinket') >= 0;
  function trAplOk(x, at) {
    const u = x.fx.use, cd = S.cds['tr:' + x.slot];
    return !!u && u.kind !== 'mana' && (TRU[x.slot] || 'cds') !== 'never' && (!cd || cd <= at + EPS) && at < endAt() - EPS;
  }
  function useTrinketsApl() {
    TRK.forEach(function (x) {
      if (trAplOk(x, S.t)) trUse(x);
    });
  }
  // The end-of-fight DoT check (simWould's dotWorth): on unless the settings switch it off, as in the engine.
  const DOT_END = !(cfg.options && cfg.options.dotEndCheck === false), LAT = Math.max(0, (cfg.fight.latencyMs || 0) / 1000);
  const WRACK_GAIN_X = 1 + ((SPELLS.wrack && SPELLS.wrack.dotSpeedPct) || 0) / 100, WRACK_PARTIAL = !!(cfg.options && cfg.options.wrackLastTick === 'partial');
  let REM_GUESS = null;                                             // the page's guess of the time left in a fight on health
  function remainingNow() { return check || timed ? Math.max(0, endAt() - S.t) : REM_GUESS ? REM_GUESS() : Infinity; }
  // The engine's walk down the priority list (pickAction; at a channel tick only above that channel): it uses the trinkets
  // when it gets to "Activate trinket" before an action above it picks something.
  function aplWalk(channel) { if (TRK_APL && TRK.length && !S.over) simWould(remainingNow(), { channel: channel || null }); }
  const REV =(WL.equippedEnchantFx ? WL.equippedEnchantFx(cfg) : []).filter(function (x) { return x.fx.proc.kind === 'crit'; })[0] || null;
  let revUntil = -1;
  const ACT_POL = (cfg.options && cfg.options.activesPolicy) || 'pull';
  const ACT_DOOM = WL.effectiveRotation(build, cfg).indexOf('bane') >= 0 || (build.timeline || []).some(function (x) { return x.k === 'baneOfDoom'; });
  let actOpen = ACT_POL === 'pull', doomSeen = false;
  // Sim v212 (its round 248): under 'doom' a build that never casts Bane of Doom (Wrack DS) no longer pops its cooldowns on
  // the pull. The first use waits for the opener: right before the first cast of a filler (or conditional filler) of the
  // priority (the engine's popFill; a priority without one: the pull, as before). Blood Fury (and Power Infusion, not
  // played here) also wait while an Amplify Curse Bane of Agony is coming or is up with more than activesAmpLeft s left.
  // Berserking stays on the pull. The engine knows the action it chose; a press is matched to one by fillOf.
  const ACT_HASFILL = WL.effectiveRotation(build, cfg).some(function (k) { const a = WL.actionOf(k, build); return !!(a && (a.filler || a.preFiller)); });
  const ACT_AMP = cfg.options && cfg.options.activesAmpLeft != null ? +cfg.options.activesAmpLeft : 17;
  function fillOf(key) {                                             // the engine's popFill for a press of key now
    if (!ACT_HASFILL) return null;
    const a = WL.actionOf(simWould(remainingNow(), { pick: key }) || '', build);
    return !!(a && (a.filler || a.preFiller));
  }
  function ampHold() {                                               // hold Blood Fury for the Amplify Curse Bane of Agony?
    if (!(ACT_AMP > 0) || ACT_DOOM || ACT_POL === 'pull' || ACT_POL === 'execute' || !tv('amplifyCurse') || !table.baneOfAgony) return false;
    if (S.ampUp || (AMP_BTN && buff('amplifyCurse'))) return true;   // taken, its Bane of Agony has not landed yet
    const d = T[1].dots.baneOfAgony;
    if (d && d.expires > S.t + EPS && d.snap && d.snap.castMult > 1) return d.expires - S.t > ACT_AMP + EPS;
    return ready('amplifyCurse') && remainingNow() > SPELLS.baneOfAgony.duration;   // the next Bane of Agony takes it
  }
  function racialOk(key, fill) {                                     // the engine's racial rule (no lock: asked, not used)
    const cd = racialOf('cooldown');
    if (activesOk(key, fill, true)) return !(cd && cd.spPct && ampHold());
    return !!(cd && cd.hastePct) && !ACT_DOOM;                       // Berserking: still on the pull
  }
  function eurekaPopOk(key) {                                        // the engine's: Eureka! only before a long direct cast or channel
    const s = SPELLS[key], len = s.kind === 'channel' ? s.duration : castTime(key);
    return (s.kind === 'direct' || s.kind === 'channel') && len >= 1.4;
  }
  // Would the engine use the race's cooldown right before this press now (the check compares it with the engine's log;
  // the hint shows it)? fill: the press's popFill when known.
  function racialDue(key, fill) {
    const cd = racialOf('cooldown');
    if (!cd || !ready('racial') || !table[key] || key === 'lifeTap' || key === 'baneOfHavoc' || SPELLS[key].kind === 'utility') return false;
    if (cd === EUREKA && !eurekaPopOk(key)) return false;
    let mana = S.mana, health = S.health;                            // after the mana items the press would use (useManaItems)
    MANA_ITEMS.forEach(function (c) {
      const amt = c.manaRestore.amount || stats.maxMana * c.manaRestore.pct / 100, miss = stats.maxMana - mana;
      if (!ready('cd:' + c.cdGroup) || miss < amt) return;
      if (c.healthCost) { const hc = Math.round(c.healthCost * selfTakenMult()); if (health <= hc) return; health -= hc; }
      mana += Math.min(amt, miss);
    });
    return mana >= discountedCost(key) && racialOk(key, fill);
  }
  function potSp() { return SP_POT && buff('spPotion') ? SP_POT.spPotion.sp : 0; }
  function trUp(x) { return trUntil[x.slot] > S.t + EPS; }
  // Sim v207: × the boss type (vs); a target debuff (u.target) counts on your target only, not on extra targets.
  function trCrit(k, ti) { let c = 0; const s = SPELLS[k]; TRK.forEach(function (x) { const u = x.fx.use; if (u.kind === 'crit' && trUp(x) && (!u.tree || (s && s.tree === u.tree)) && !(u.target && ti > 1)) c += u.pct * WL.fxMult(cfg, u); }); return c; }
  function trCritDone() { TRK.forEach(function (x) { if (x.fx.use.endsOnCrit && trUp(x)) trUntil[x.slot] = -1; }); }
  // Sim (Max Pre-BiS, 2026-11-24), the engine's trHitPct / hitNow: a 'hit' trinket while up adds its pct to your uncapped
  // spell hit, up to the cap. Your hit rolls (land, area ticks, a channel's start) read it; your demon's do not.
  function hitNow() {
    let h = 0;
    TRK.forEach(function (x) { const u = x.fx.use; if (u.kind === 'hit' && trUp(x)) h += u.pct; });
    return h ? Math.min(cb.maxHitPct, stats.hitPctUncapped + h) : stats.hitPct;
  }
  // The engine's trHit: one shot of a summoned helper (Zarla's Snack Pouch's whelp, 'dmgOver'). No spell power: min..max
  // (× boss type / zone), your spell hit (hitNow) and sheet crit (× critMultiplier), Curse of the Elements on Shadow / Fire
  // / Arcane / Frost. It hits the engine's boss: dummy 1, or the first one standing once it fell. One row for all targets.
  const COE_SCHOOLS = { shadow: 1, fire: 1, arcane: 1, frost: 1 };
  function trHit(x, u) {
    let ti = 0;
    for (let i = 1; i <= N && !ti; i++) if (alive(i)) ti = i;
    if (!ti) return;
    const key = 'trinket:' + x.id, r = row(key), school = u.school || 'fire', look = { school: school, name: x.fx.name, trinket: true };
    if (immuneTo(ti, school)) { emit(Object.assign({ type: 'miss', key: key, target: ti, immune: true }, look)); return; }   // boss fights only
    if (R.hit() * 100 >= hitNow()) { r.misses++; emit(Object.assign({ type: 'miss', key: key, target: ti }, look)); return; }
    r.landed++;
    let amt = (u.min + (u.max - u.min) * R.proc()) * WL.fxMult(cfg, u);
    if (debuff(ti, 'coe') && COE_SCHOOLS[school]) amt *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    const crit = R.crit() * 100 < stats.critPct;
    if (crit) amt *= cb.critMultiplier;
    deal(key, amt, crit, false, ti, look);
  }
  // Revelation, sim v209 (its round 243): + pct % crit for 15 s (a new trigger while it is up starts the 15 s again).
  //  * Trigger: a landed direct hit that does not crit (any target) and each landed Hellfire / Rain of Fire tick that does
  //    not crit (each target) roll WL.revelationChancePct (11% x (1 - 2 x your sheet crit)). Never DoT or drain ticks.
  //  * A direct spell (or Immolate's direct part) takes it when its cast completes (an instant: when cast) and crits when
  //    it lands - or not at all if it misses. DoTs, curses and Life Tap neither use nor spend it.
  //  * Sim v214 (its round 250, a live hotfix): a channel tick (Hellfire, Rain of Fire, Drain Life, Drain Soul, Wrack) that
  //    comes while it is up takes it and spends it (revTick): that one tick crits - an area tick on every target. An area
  //    tick rolls the trigger once (not per target), after its targets, when one of them took a landed hit that did not
  //    crit; a tick that took it never rolls. No channel holds it any more (v209-v213: every tick crit until it ended).
  function revUp() { return revUntil > S.t + EPS; }                  // is it up now
  function revRoll(crit) {                                           // a landed direct hit / an area tick
    if (crit || R.proc() * 100 >= WL.revelationChancePct(cb, stats.critPct)) return;
    revUntil = S.t + REV.fx.proc.duration;
    emit({ type: 'used', name: REV.fx.name, proc: true });
  }
  function revTake(key) {                                            // the cast of key completes now: does it use (and spend) it?
    if (!REV) return false;
    const k = SPELLS[key].kind;
    if ((k !== 'direct' && k !== 'hybrid') || !revUp()) return false;
    revUntil = -1;
    return true;
  }
  function revTick() {                                               // sim v214: a channel tick now: + pct and spent, while it is up
    if (!REV || !revUp()) return 0;
    revUntil = -1; return REV.fx.proc.pct;
  }
  // fill: the press's popFill (undefined: worked out by fillOf when needed); peek: only asked, the first use stays open.
  function activesOk(key, fill, peek) {                              // the engine's activesOk ('pull', 'execute', 'doom')
    if (actOpen) return true;
    if (ACT_POL === 'execute') return peek ? executePhase(1) : actOpen = executePhase(1);
    const d = T[1].dots.baneOfDoom;
    if (d) doomSeen = true;
    if (!d || d.expires <= S.t + EPS) {                              // sim v212 (its round 248): no Doom -> after the opener
      const open = doomSeen || (ACT_DOOM ? dotLeft('baneOfAgony', 1) > 0 : (fill === undefined ? fillOf(key) : fill) !== false);
      return peek ? open : actOpen = open;
    }
    // The engine asks before it uses the race's cooldown; here a Berserking pressed at this very moment is already up.
    const bz = S.buffs.berserking, fresh = bz != null && S.cds.racial != null && Math.abs(S.cds.racial - racialOf('cooldown').cd - S.t) < EPS;
    if (fresh) delete S.buffs.berserking;
    const toBoom = d.expires - S.t, sp = SPELLS[key], len = sp.kind === 'channel' ? sp.duration : Math.max(castTime(key), gcd());
    if (fresh) S.buffs.berserking = bz;
    const open = toBoom > endAt() - S.t || toBoom <= len + EPS;
    return peek ? open : actOpen = open;
  }
  function discountedCost(key) {                                     // the price if Eureka! were popped now
    const cd = racialOf('cooldown'); let c = table[key].cost;
    if (cd && cd.costRedPct && (buff('eureka') || ready('racial'))) c *= 1 - cd.costRedPct / 100;
    return c;
  }
  function popActives(key) {                                         // right before a damaging cast
    if (!TRK_APL) TRK.forEach(function (x) {
      const pol = TRU[x.slot] || 'cds';
      const when = pol === 'never' ? false : pol === 'ready' ? true : pol === 'execute' ? executePhase(1) : activesOk(key);
      if (!when || !ready('tr:' + x.slot) || S.t >= endAt() - EPS) return;
      trUse(x);
    });
    if (activesOk(key) && SP_POT && ready('cd:' + SP_POT.cdGroup)) {
      S.cds['cd:' + SP_POT.cdGroup] = S.t + SP_POT.cd; S.buffs.spPotion = S.t + SP_POT.spPotion.duration;
      emit({ type: 'used', name: SP_POT.name });
    }
  }
  function useManaItems() {                                          // a mana potion or rune, once its amount is missing
    MANA_ITEMS.forEach(function (c) {
      let amt = c.manaRestore.amount || stats.maxMana * c.manaRestore.pct / 100;
      const miss = stats.maxMana - S.mana;
      if (!ready('cd:' + c.cdGroup) || miss < amt) return;
      if (c.healthCost) {                                            // Demonic Rune: 800 health (less with Molten Skin / Soul Link)
        const hc = Math.round(c.healthCost * selfTakenMult());
        if (S.health <= hc) return;
        loseHealth(hc);
      }
      if (amt > miss) amt = miss;
      S.cds['cd:' + c.cdGroup] = S.t + c.cd; S.mana += amt;
      res.track.consumableMana = (res.track.consumableMana || 0) + amt;
      emit({ type: 'mana', source: c.name, amount: amt });
    });
  }

  function useRacial() {
    const cd = racialOf('cooldown');
    if (!cd) return fail('racial', 'noRacial');
    if (!ready('racial')) return fail('racial', 'cooldown');
    // Not while a cast bar runs; during a channel it cancels the channel and goes off (Xn, 2026-10-29). Same for Blood
    // Fury, Berserking and Eureka!.
    if (S.cast && S.cast.end > S.t + EPS) return fail('racial', 'casting');
    if (S.channel) interrupt('clipped');
    S.cds.racial = S.t + cd.cd;
    if (cd.spPct) S.buffs.bloodFury = S.t + cd.duration;
    if (cd.hastePct) S.buffs.berserking = S.t + cd.duration;
    if (cd === EUREKA) S.buffs.eureka = S.t + cd.duration;          // 8 s (patch of 2026-10-16)
    S.presses.push({ t: S.t, k: 'racial' });
    emit({ type: 'used', name: cd.name });
    return { ok: true };
  }

  // Amplify Curse as a button: instant and not on the global cooldown (the sim uses it for free, with no time of its
  // own); like the race's cooldown it is refused while a cast bar runs and cuts a channel short. The cooldown starts
  // when you press it; the next Bane of Agony within 30 s takes it.
  function useAmplify() {
    if (!tv('amplifyCurse')) return fail('amplifyCurse', 'unknown');
    if (!ready('amplifyCurse')) return fail('amplifyCurse', 'cooldown');
    if (S.cast && S.cast.end > S.t + EPS) return fail('amplifyCurse', 'casting');
    if (S.channel) interrupt('clipped');
    S.cds.amplifyCurse = S.t + AMP_CD;
    S.buffs.amplifyCurse = S.t + AMP_LASTS;
    S.presses.push({ t: S.t, k: 'amplifyCurse' });
    emit({ type: 'used', name: 'Amplify Curse', key: 'amplifyCurse' });
    return { ok: true };
  }

  // Bane of Havoc: instant, cannot miss (as the engine casts it), and since the patch of 2026-11-10 on the global
  // cooldown like any other cast (before it was off it). It sits on one target at a time and takes the place of any
  // other Bane there.
  function castHavoc(ctx) {
    const e = table.baneOfHavoc, ti = S.target;
    if (!e) return fail('baneOfHavoc', 'unknown');
    if (!alive(ti)) return fail('baneOfHavoc', 'dead');
    if (S.mana < e.cost - 1e-6) return fail('baneOfHavoc', 'mana');
    if (distanceTo(ti, ctx) > e.range + EPS) return fail('baneOfHavoc', 'range');
    S.mana -= e.cost;
    if (e.cost > 0) S.lastSpend = S.t;
    res.track.spent += e.cost;
    if (S.mana < res.track.minMana) res.track.minMana = S.mana;
    if (!check) { noteClip(ti, 'baneOfAgony', 'baneOfHavoc'); noteClip(ti, 'baneOfDoom', 'baneOfHavoc'); delete T[ti].dots.baneOfAgony; delete T[ti].dots.baneOfDoom; }
    engage(ti);                                                       // the fight begins with it, as with any instant
    S.havoc = { target: ti, expires: S.t + SPELLS.baneOfHavoc.duration };
    row('baneOfHavoc').casts++;
    S.presses.push({ t: S.t, k: 'baneOfHavoc', target: ti });
    S.gcdStart = S.t; S.gcdReady = S.t + gcd();
    emit({ type: 'apply', key: 'baneOfHavoc', target: ti });
    S.decideSeq = order++;
    return { ok: true };
  }

  function fail(key, reason) {
    if (reason === 'mana' && S.fightStart !== null && !S.over) res.track.noMana++;
    emit({ type: 'fail', key: key, reason: reason, text: FAIL_TEXT[reason] });
    return { ok: false, reason: reason };
  }

  function needsTarget(key) { return key !== 'lifeTap' && !(SPELLS[key].aoe && !SPELLS[key].range); }

  // Why this spell cannot be cast right now (null = it can), at your current target.
  function blocked(key, ctx) {
    if (key === 'amplifyCurse') return !tv('amplifyCurse') ? 'unknown' : !ready(key) ? 'cooldown' : null;
    const s = SPELLS[key], e = table[key], ti = S.target;
    if (!e) return 'unknown';
    if (key === 'baneOfHavoc') return !alive(ti) ? 'dead' : S.mana < e.cost - 1e-6 ? 'mana' : distanceTo(ti, ctx) > e.range + EPS ? 'range' : null;
    if (!ready(key)) return 'cooldown';
    if (key === 'lifeTap' && TAP_HP && !canTap()) return 'health';
    if (s.selfDamage && S.health <= selfTick(key)) return 'health';           // its first tick would kill you
    if (needsTarget(key) && !alive(ti)) return 'dead';
    if (needsTarget(key) && immuneTo(ti, s.school)) return shielded(ti) ? 'shielded' : 'immune';
    if (key === 'conflagrate' && !(dotLeft('immolate', ti) > 0)) return 'immolate';
    if (s.shards && !(key === 'soulFire' && buff('decimation')) && S.shards < s.shards) return 'shards';
    if (S.mana < effectiveCost(key) - 1e-6) return 'mana';
    if (ctx && e.range > 0 && distanceTo(ti, ctx) > e.range + EPS) return 'range';
    if (((ctx && ctx.moving) || forcedMove()) && (s.kind === 'channel' || castTime(key) > EPS)) return 'moving';
    return null;
  }

  function readyAt() { return Math.max(S.cast ? S.cast.end : S.t, S.gcdReady); }

  function tryCast(key, ctx) {
    // Extra Wrack ticks waiting at this moment (heldX): unless this press cuts the channel at its tick (ctx.cutAtTick: the
    // check and the hint say so), they and what follows them happen first, as in the engine, which did not cut there.
    if (!(ctx && ctx.cutAtTick)) flushHeld();
    // The engine's decision: mana items first (not for Bane of Havoc, which it casts before them), then the cooldowns
    // right before a damaging cast you can pay for (even when it then Life Taps first).
    if (key !== 'baneOfHavoc') useManaItems();
    const precast = !check && S.fightStart === null && SPELLS[key].kind !== 'channel' && castTime(key) > EPS;   // as startCast decides it
    if (key !== 'baneOfHavoc' && !precast) aplWalk(null);        // the engine's walk ("Activate trinket"); after a precast: the next press
    const why = blocked(key, ctx);
    if ((!why || why === 'mana') && !precast && key !== 'lifeTap' && key !== 'baneOfHavoc' && SPELLS[key].kind !== 'utility' && S.mana >= discountedCost(key)) popActives(key);
    if (why) return fail(key, why);
    if (key === 'baneOfHavoc') { if (S.channel) interrupt('clipped'); return castHavoc(ctx); }   // a cast like the others: it cuts a channel
    // Any channel cuts the one running, Wrack over Wrack too (sim v176, Xn): the new one runs its own 6 ticks, the old
    // one's leftover ticks are lost, and a resisted recast loses the old one as well.
    if (S.channel) interrupt('clipped');
    startCast(key, S.target);
    return { ok: true };
  }

  function press(key, ctx) {
    if (ctx) lastCtx = ctx;
    if (S.over) return fail(key, 'dead');
    if (key === 'racial') return useRacial();
    if (key === 'amplifyCurse') return useAmplify();
    if (!table[key]) return fail(key, 'unknown');
    const free = readyAt();
    if (free > S.t + EPS) {
      if (free - S.t <= QUEUE_WINDOW) { queued = { key: key }; return { ok: true, queued: true }; }
      return fail(key, 'busy');
    }
    return tryCast(key, ctx);
  }

  // A dummy joins the fight (or comes back after it fell) with full health and nothing on it.
  function spawn(ti) {
    const t = T[ti];
    if (!t || !t.dead || S.over) return false;
    t.dead = false; t.absent = false; t.health = t.maxHealth; t.hpPct = 100; t.dots = {}; t.deb = {}; t.brandCharges = 0;
    emit({ type: 'spawn', target: ti });
    return true;
  }

  function setTarget(ti) {
    if (!T[ti] || S.target === ti) return false;
    S.target = ti;
    emit({ type: 'target', target: ti });
    return true;
  }

  // ---------- time ----------
  function advance(to) {
    if (to <= S.t) return;
    const from = S.t, span = to - from, fighting = S.fightStart !== null && !S.over && !check;
    if (fighting) {                                      // the record for the review
      const k = res.track;
      k.busy += Math.max(0, ((S.cast || S.channel) ? to : Math.min(to, S.gcdReady)) - from);
      if (P && P.active) k.petActive += span;
      if (forcedMove(from)) k.moved += span;
      for (let i = 1; i <= N; i++) {
        const t = T[i];
        if (t.dead) continue;
        for (const key in t.dots) { const left = Math.min(to, t.dots[key].expires) - from; if (left > 0) k.uptime[i + ':' + key] = (k.uptime[i + ':' + key] || 0) + left; }
        for (const name in t.deb) {
          if (name === 'brand' && !(t.brandCharges > 0)) continue;
          const left = Math.min(to, t.deb[name]) - from;
          if (left > 0) k.uptime[i + ':' + name] = (k.uptime[i + ':' + name] || 0) + left;
        }
      }
    }
    // While a cast bar runs its price is already spoken for, so mana you regain is not lost at a full bar.
    if (stats.mp5) {
      const gained = S.mana + stats.mp5 / 5 * span, cap = manaCap();
      if (fighting && gained > cap) res.track.wasted += gained - Math.max(cap, S.mana);
      S.mana = Math.min(cap, gained);
    }
    // Spirit, outside the 5 seconds after mana was last spent - and never while you channel (Xn, 2026-10-07; as in the
    // engine). The 5 seconds still count from the start of the channel, so after a 5-second Drain Life they are over:
    // a Life Tap right after it regenerates. (A channel starts and ends at moments of its own, so it is either on or
    // off for the whole stretch from `from` to `to`.)
    if (SPI_REGEN > 0 && S.lastSpend !== -Infinity && !S.channel) {
      const start = Math.max(from, S.lastSpend + FSR);
      if (to > start) {
        const gained = S.mana + SPI_REGEN * (to - start), cap = manaCap();
        if (fighting) { res.track.spirit += Math.min(cap, gained) - Math.min(cap, S.mana); if (gained > cap) res.track.wasted += gained - Math.max(cap, S.mana); }
        S.mana = Math.min(cap, gained);
      }
    }
    S.t = to;
    if (linear) {
      const ft = fightTime(S.t), pct = scheduledPct(ft);
      for (let i = 1; i <= N; i++) { if (!scheduled(i)) continue; T[i].hpPct = pct; if (timed) T[i].health = T[i].maxHealth * pct / 100; }
    }
  }

  // ---------- a boss fight (js/boss.js); nothing else calls these ----------
  // The boss or one of its adds hurts you. At 0 health you die and the fight is over.
  function injure(amount, what) {
    if (!BOSS || S.over || S.fightStart === null || !(amount > 0)) return 0;
    loseHealth(amount);
    emit({ type: 'injured', amount: amount, what: what || '' });
    if (S.health <= 0) {
      S.health = 0;
      S.over = true; S.fightEnd = S.t;
      if (S.cast || S.channel) interrupt('dead');
      S.cast = null; S.channel = null; events.length = 0; queued = null;
      if (P) { P.active = false; P.gen++; P.casting = null; }
      const seconds = Math.max(S.t - S.fightStart, 0);
      emit({ type: 'death', target: S.target, last: true, timed: true, died: true, what: what || '', seconds: seconds, total: res.total, dps: seconds > 0 ? res.total / seconds : 0 });
    }
    return amount;
  }
  // The raid's healers.
  function heal(amount, what) {
    if (!BOSS || S.over) return 0;
    const got = gainHealth(amount);
    if (got > 0.5) emit({ type: 'healed', amount: got, what: what || '' });
    return got;
  }
  // The ghost raid damages an add (not counted as yours). It dies at 0.
  function raidHurt(ti, amount) {
    if (!BOSS || ti === 1 || !T[ti] || T[ti].dead || S.over) return;
    const t = T[ti];
    t.health = Math.max(0, t.health - amount);
    t.hpPct = 100 * t.health / t.maxHealth;
    if (t.health <= 0) kill(ti);
  }

  // A timed fight is over: the clock stops, everything stops.
  function timeUp() {
    S.over = true; S.fightEnd = S.t;
    S.cast = null; S.channel = null; events.length = 0; queued = null;
    if (P) { P.active = false; P.gen++; P.casting = null; }
    emit({ type: 'death', target: S.target, last: true, timed: true, seconds: linear, total: res.total, dps: res.total / linear });
  }

  // You end the fight yourself (an endless fight has no other end): the clock stops, everything stops.
  function stop() {
    if (S.over || S.fightStart === null) return false;
    const seconds = S.t - S.fightStart;
    S.over = true; S.fightEnd = S.t;
    S.cast = null; S.channel = null; events.length = 0; queued = null;
    if (P) { P.active = false; P.gen++; P.casting = null; }
    emit({ type: 'death', target: S.target, last: true, timed: true, stopped: true, seconds: seconds, total: res.total, dps: seconds > 0 ? res.total / seconds : 0 });
    return true;
  }

  function handle(ev) {
    if (ev.type === 'castEnd') {
      const c = S.cast;
      if (!c || c.inst !== ev.inst) return;
      S.cast = null;
      if (c.precast && S.fightStart === null) {            // a precast lands: the fight begins now, and the pet starts with it
        S.precastKey = c.key;
        emit({ type: 'precast', key: c.key });
        engage(c.target);
        syncPet(lastCtx);
      }
      const spent = commit(c.key, c.decimation, c.cost);
      const rvl = REV ? revTake(c.key) : false;            // sim v209: Revelation is taken when the cast completes (no travel time here)
      land(c.key, spent.castMult, c.target, eurekaAt(c.key, S.t), rvl);   // finished now: inside Eureka! or not
    } else if (ev.type === 'dotTick') {
      const d = T[ev.target].dots[ev.key];
      if (!d || d.inst !== ev.inst) return;              // refreshed, consumed, or the target is dead
      periodicTick(ev.key, d.snap, ev.i, ev.target);
      if (!S.over && ev.i === d.ticks - 1 && T[ev.target].dots[ev.key] === d) delete T[ev.target].dots[ev.key];
    } else if (ev.type === 'wrackX') {                   // an extra DoT tick under Wrack
      const d = T[ev.target].dots[ev.key];
      if (!d || d.inst !== ev.inst || ev.gen !== d.xg || S.wrackOn !== ev.target) return;
      // Bane of Agony: the ramp of the 2-second slot it falls in.
      const s = SPELLS[ev.key], ri = s.ramp ? Math.min(s.ramp.length - 1, Math.max(0, Math.ceil((S.t - d.applied) / s.tickEvery - 1e-6) - 1)) : 0;
      periodicTick(ev.key, d.snap, ri, ev.target, true);
      d.xLast = S.t;
      if (!S.over && T[ev.target].dots[ev.key] === d) xSched(ev.target, ev.key, d, true);
    } else if (ev.type === 'trShot') {                   // one shot of a summoned helper (sim, Max Pre-BiS, 2026-11-24: Zarla's whelp)
      const tx = TRK.filter(function (q) { return q.slot === ev.slot; })[0];
      if (tx) trHit(tx, tx.fx.use);
    } else if (ev.type === 'dmgTaken') {
      takeHit();
      push({ t: S.t + HIT, o: 1, type: 'dmgTaken' });
    } else if (ev.type === 'chanEnd') {                  // a channel shortened by a hit ends early
      const c = S.channel;
      if (!c || c.inst !== ev.inst || c.end > S.t + EPS) return;
      S.channel = null;
      syncWrack();
    } else if (ev.type === 'chanTick') {
      const c = S.channel;
      if (!c || c.inst !== ev.inst) return;              // stopped
      if (ev.t > c.end + EPS) return;                    // cut off by a hit; the channel's end closes it
      if (SPELLS[ev.key].aoe) aoeTick(ev.key, ev.i, c.target); else periodicTick(ev.key, c.snap, ev.i, c.target, false, true);
      c.done = ev.i + 1; c.tickAt = S.t;
      if (!S.over && S.channel === c && ev.i === (c.ticks || table[ev.key].ticks) - 1) { S.channel = null; syncWrack(); }
      else if (!S.over && S.channel === c && SPELLS[ev.key].selfDamage && S.health <= selfTick(ev.key)) {   // the next tick would kill you
        S.channel = null;
        emit({ type: 'interrupt', key: ev.key, reason: 'health', channel: true });
        S.decideSeq = order++;
      } else if (TRK_APL && !S.over && S.channel === c && S.t >= S.gcdReady - EPS) {
        // The engine asks the list above the channel at each tick (whether to cut it); on the way it may reach "Activate
        // trinket" (sim v191). Cutting stays yours.
        aplWalk(ev.key);
      }
    } else if (ev.type === 'heal') {
      const got = gainHealth(HEAL.amt);
      emit({ type: 'heal', amount: got });
      if (ev.again) push({ t: ev.t + HEAL.every, o: 0, type: 'heal', again: true });
    } else if (ev.type === 'sacTick') {
      if (build.sacrifice === 'voidwalker') S.mana = Math.min(stats.maxMana, S.mana + stats.maxMana * SAC.voidwalker.manaPct / 100);
      else gainHealth(stats.maxHealth * SAC.felhunter.healthPct / 100);
      if (ev.again) push({ t: ev.t + SAC.every, o: 0, type: 'sacTick', again: true });
    } else if (ev.type === 'petAct') {
      if (P && P.active && ev.gen === P.gen) petAct();
    } else if (ev.type === 'petLand') {
      if (P && P.active && ev.gen === P.gen) petSpellHit(P.c.spell);
    } else if (ev.type === 'petSwing') {
      if (P && P.active && ev.gen === P.gen) petSwing();
    }
  }

  // Moves the clock to `now` (seconds since the last reset), letting everything due happen in order.
  // A remembered press goes off at the exact moment you are free, not at the next picture, so no time is lost.
  // When your next action and the pet's next decision fall on the same instant, the engine takes them in the order
  // they were planned. S.decideSeq marks the place in that line your next action has (set when your last one began).
  // While you are free and cast nothing, the engine decides again every 0.1 s from the moment you became free (it found
  // nothing it could cast: before or during a movement phase, out of mana). Its walk can reach "Activate trinket" there,
  // so with a trinket ready the walk is done at those moments here too (sim v191).
  // Each such step also uses a mana potion or rune once its amount is missing (the engine's decide calls useManaItems
  // before its walk): with the Max Pre-BiS lists (sim, 2026-11-24) the engine drank a rune the moment a Wrack ended and
  // cast 0.2 s later. While you are free your mana only rises, so a step can matter only when the amount is missing now.
  function itemMaybe(at) {
    return MANA_ITEMS.some(function (c) {
      const cd = S.cds['cd:' + c.cdGroup];
      return (!cd || cd <= at + EPS) && stats.maxMana - S.mana >= (c.manaRestore.amount || stats.maxMana * c.manaRestore.pct / 100);
    });
  }
  function idleWalkAt(now) {
    const busy = !!(S.cast || S.channel);
    if (S.wasBusy && !busy) S.busyEnd = S.t;
    S.wasBusy = busy;
    const walk = TRK_APL && TRK.length > 0;
    if ((!walk && !MANA_ITEMS.length) || busy || S.over || S.fightStart === null) return Infinity;
    const free = Math.max(S.gcdReady, S.busyEnd);
    if (S.idleBase !== free) { S.idleBase = free; S.idleNext = free; }
    while (S.idleNext <= now + EPS && !(walk && TRK.some(function (x) { return trAplOk(x, S.idleNext); })) && !itemMaybe(S.idleNext)) S.idleNext += 0.1;   // the engine's steps
    return S.idleNext;
  }
  function update(now, ctx) {
    if (ctx) lastCtx = ctx;
    syncPet(ctx);
    while (!S.over) {
      const first = events[0];
      const queueAt = queued ? readyAt() : Infinity, idleAt = idleWalkAt(now);
      const limit = Math.min(now, queueAt, idleAt);
      const due = !!first && (first.t < limit - EPS || (first.t <= limit + EPS && (first.o < 2 || first.seq < S.decideSeq)));
      const hold = due && heldX(first, limit);
      if (hold) holdAt = first.t;
      if (due && !hold) {
        const ev = events.shift();
        if (ev.t > endAt() + EPS) { events.unshift(ev); break; }
        advance(ev.t);
        handle(ev);
      } else if (queueAt <= now + EPS && queueAt <= idleAt + EPS) {
        const q = queued;
        queued = null;
        advance(queueAt);
        tryCast(q.key, ctx);
      } else if (idleAt <= now + EPS && idleAt <= endAt() + EPS) {
        advance(idleAt);
        if (S.t < endAt() - EPS) useManaItems();         // the engine's decide: mana items, then the walk
        aplWalk(null);
        S.idleNext = idleAt + 0.1;
      } else break;
    }
    if (!S.over && timed && now >= endAt() - EPS) { advance(endAt()); timeUp(); return; }
    advance(check ? Math.min(now, linear) : now);
    if (!S.over && ((ctx && ctx.moving) || forcedMove()) && (S.cast || S.channel)) interrupt('moving');
  }

  // The engine decides whether to cut a channel inside the channel's tick, so an extra Wrack tick due at that very
  // moment (after the tick) is void when Wrack is cut there. Here you press after the tick: such an extra tick, and
  // everything after it at that moment, waits until we know. Cutting the channel then (interrupt) lets them happen,
  // in the engine's order, before the new cast; otherwise they happen once the clock moves on.
  // A hit you take at the very moment of any channel's tick waits the same way (sim v181 sync): the engine cuts the
  // channel first, so the hit finds nothing to push back and rolls no pushback dice (Concentration Aura gives a chance).
  function heldX(ev, limit) {
    const c = S.channel;
    if (ev.type === 'dmgTaken') return ev.t > limit - EPS && c && c.tickAt != null && Math.abs(c.tickAt - ev.t) <= EPS;
    return ev.type === 'wrackX' && ev.t > limit - EPS && c && c.key === 'wrack' && c.target === ev.target &&
           c.tickAt != null && Math.abs(c.tickAt - ev.t) <= EPS;
  }
  function flushHeld() {
    if (holdAt == null || Math.abs(holdAt - S.t) > EPS) return;
    holdAt = null;
    while (!S.over && events.length && events[0].o < 2 && events[0].t <= S.t + EPS) handle(events.shift());
  }

  // ---------- what the sim would cast next (a hint for practice; no part of the fight's rules) ----------
  // The build's priority list is asked the way the engine asks it, about the fight as it will stand at the moment
  // you are free again (a spell you are still casting counts as landed). The engine's boss is the lowest-numbered
  // dummy still standing, its extra targets the others in order. Two things the engine does are left out: near the
  // end of a fight it works out whether a DoT still pays for itself (here its older rule: two ticks must fit), and it
  // times cooldowns around Bane of Doom's explosion.
  // remaining: seconds the fight still lasts (Infinity when nobody knows).
  // Returns null when the list has nothing to cast, else { key, target, action (its line in the list, or null),
  // racial (true = the sim would use the race's cooldown first), why ('havoc', 'mana' or 'moving' for a cast that
  // is not a line of the list), need (the spell the mana is for) }.
  // walk (inside combat.js only): { channel } = the engine's own walk at this very moment (aplWalk): it uses the trinkets at
  // "Activate trinket" and returns what it found (no Bane of Havoc first, no mana items looked ahead).
  function simWould(remaining, walk) {
    if (S.over) return null;
    const standing = [];
    for (let i = 1; i <= N; i++) if (!T[i].dead && (!BOSS || i === 1)) standing.push(i);   // a boss fight: the boss alone, as the sim fights it
    if (!standing.length) return null;
    const boss = standing[0], c = walk ? null : S.cast, at = walk ? S.t : Math.max(S.t, readyAt());
    // The engine's clock starts at the pull: conditions such as "fight time gone" read t, so everything timed is counted
    // from the fight's start here (before it: from now).
    const off = check ? 0 : S.fightStart === null ? at : S.fightStart;
    const shift = function (o) { const r = {}; for (const k in o) r[k] = o[k] == null ? o[k] : o[k] - off; return r; };
    const landing = c && table[c.key].ticks && SPELLS[c.key].kind !== 'channel' ? { key: c.key, target: c.target, left: SPELLS[c.key].duration } : null;
    function leftOn(ti, key) {
      if (landing && landing.key === key && landing.target === ti) return landing.left;
      const d = T[ti].dots[key];
      return d && d.expires > at + EPS ? d.expires - at : 0;
    }
    const buffs = Object.assign({}, S.buffs);
    ['coe', 'isb', 'brand'].forEach(function (k) { if (T[boss].deb[k] != null) buffs[k] = T[boss].deb[k]; });
    if (c && c.key === 'soulFire') delete buffs.decimation;
    if (c && isSB(c.key)) delete buffs.shadowTrance;
    const havoc = S.havoc && S.havoc.expires > at + EPS && !T[S.havoc.target].dead ? S.havoc.target : 0;
    const wantsHavoc = standing.length >= 2 && !!table.baneOfHavoc && tv('baneOfHavoc') > 0;
    let mana = S.mana - (c ? c.cost : 0), shards = S.shards;
    if (c && SPELLS[c.key].shards && !c.decimation) shards -= SPELLS[c.key].shards;
    if (!walk && wantsHavoc && !havoc && mana >= table.baneOfHavoc.cost) return { key: 'baneOfHavoc', target: standing[1], action: null, racial: false, why: 'havoc' };
    // A mana potion or rune ready by then is used before the choice (the engine's decide), and one still to come lowers
    // the need to Life Tap (freeManaLevel).
    const itemReady = function (c) { return !S.cds['cd:' + c.cdGroup] || S.cds['cd:' + c.cdGroup] <= at + EPS; };
    const itemAmt = function (c) { return c.manaRestore.amount || stats.maxMana * c.manaRestore.pct / 100; };
    if (!walk) MANA_ITEMS.forEach(function (c) { if (itemReady(c) && stats.maxMana - mana >= itemAmt(c) && !(c.healthCost && S.health <= Math.round(c.healthCost * selfTakenMult()))) mana = Math.min(stats.maxMana, mana + itemAmt(c)); });

    const view = {
      t: at - off, remaining: remaining == null ? Infinity : remaining, cfg: cfg, build: build,
      mana: mana, maxMana: stats.maxMana, shards: shards, cds: shift(S.cds), buffs: shift(buffs),
      targetHpPct: T[boss].hpPct, brandCharges: T[boss].brandCharges,
      multiTargets: standing.length, havocTarget: havoc ? standing.indexOf(havoc) + 1 : wantsHavoc ? 2 : 0, nextTarget: 0, actionIndex: 0,
      has: function (k) { return !!table[k]; },
      ready: function (k) { return !S.cds[k] || S.cds[k] <= at + EPS; },
      buff: function (n) { return buffs[n] != null && buffs[n] > at + EPS; },
      dotLeft: function (k) { return leftOn(boss, k); },
      xDotLeft: function (ti, k) { return standing[ti - 1] ? leftOn(standing[ti - 1], k) : 0; },
      xDebLeft: function (ti, n) { const t = T[standing[ti - 1]], e = t && t.deb[n]; return e != null && e > at + EPS ? e - at : 0; },
      castTime: castTime, gcd: gcd,
      dotWorth: function () { return null; },
      canSwap: function () { return false; },
      tapGain: function () { return (SPELLS.lifeTap.manaBase + stats.spi) * (1 + tv('improvedLifeTap', 'manaPct') / 100); },
      petSpellCost: function () { return P && P.c.spell ? P.c.spell.cost : Infinity; },
      petMana: function () { return P ? Math.min(P.maxMana, P.mana + P.regen * (S.t - P.lastRegen)) : Infinity; },
      // The sim's lifeTapNeed (2026-10-28): the mana the rest of the fight needs at the rate it went down so far (Life Tap's
      // own mana left out); nothing in the first 6 s. Free mana: a mana potion or rune ready by then (no Innervate, Mana
      // Tide or mana trinkets here).
      manaNeedLeft: function () { const f = fightTime(at); if (f < 6) return Infinity; return Math.max(0, (stats.maxMana - mana + res.track.tapMana) / f) * view.remaining; },
      freeManaLevel: function () { let lv = 0; MANA_ITEMS.forEach(function (c) { if (itemReady(c)) lv = Math.max(lv, stats.maxMana - itemAmt(c)); }); return lv; },
      // The sim's fsr condition (v161): seconds since you last spent mana. A cast bar still running spends at its end.
      lastSpend: (c && c.cost > 0 ? c.end : S.lastSpend) - off, spendAt: null,
      trinketReady: function () { return TRK.some(function (x) { return trAplOk(x, at); }); }   // "Activate trinket" (sim v191)
    };
    const made = forcedMove(at) || !!(lastCtx && lastCtx.forced), ft = fightTime(at);
    function fits(k) {                                     // made to move: only instants, and no cast that runs into the next phase
      const len = SPELLS[k].kind === 'channel' ? SPELLS[k].duration : castTime(k);
      if (len <= EPS) return true;
      if (made) return false;
      if (!MOVE || ft < 0) return true;
      return ft + len <= (Math.floor((ft + EPS) / MOVE.every) + 1) * MOVE.every + EPS;
    }
    // Hellfire is only started when its whole channel can be paid in health, counting the heals due during it.
    function affordable(k) {
      const s = SPELLS[k];
      if (!s.selfDamage) return true;
      const from = Math.max(ft, 0), until = from + s.duration;
      const heals = HEAL ? HEAL.amt * (Math.floor((until + EPS) / HEAL.every) - Math.floor((from + EPS) / HEAL.every)) : 0;
      return S.health + heals > selfTick(k) * table[k].ticks;
    }
    const list = WL.effectiveRotation(build, { fight: { multiDot: standing.length > 1, targets: standing.length } });
    view.dotWorth = function (key, ti) { return dotWorth(key, ti); };

    // ---- the engine's end-of-fight DoT check (its round 53; sim.js dotWorth / dotValue, ported 2026-11-16) ----
    // A DoT that cannot run its whole duration before the end is cast only if the damage it still adds beats what the
    // action below it (the filler) would do in the same time. Expected values at this moment. ti: 0 / 1 = the boss, 2 / 3
    // = the other standing targets (the engine's numbering). The end is now + the time left (a fight on health: the
    // page's guess, so it only matters in a timed fight or near the guessed end).
    const fin = at + view.remaining, now = at;
    function gt(ti) { return ti > 1 ? standing[ti - 1] || boss : boss; }
    function expVuln(school, ti, periodic, sk) {     // with the spell's resist rule (a binary spell's land chance), sim v205
      const pr = resProf(school, gt(ti), periodic, sk);
      return pr.landP * pr.flat * pr.dist.reduce(function (a, d) { return a + d.p * (1 + d.pct / 100); }, 0);
    }
    function expCrit(critPct, critMult) { return 1 + Math.max(0, Math.min(100, critPct)) / 100 * (critMult - 1); }
    function hitChance() { return Math.min(100, stats.hitPct) / 100; }
    function occupies(k) { return SPELLS[k].kind === 'channel' ? SPELLS[k].duration : Math.max(castTime(k), gcd()); }
    function expCast(k, ti, noImmolate) {
      const s = SPELLS[k], e = table[k];
      let amt;
      if (s.aoe) {
        let sum = 0;
        for (let tj = 1; tj <= standing.length; tj++) sum += e.ticks * (s.tickBase + s.tickCoef * spNow(e)) * e.periodicMult * liveMult(k, true, gt(tj)) * expVuln(s.school, tj, false, k);
        return hitChance() * sum * expCrit(e.critPct, e.critMult);
      }
      if (s.kind === 'channel') {
        amt = 0;
        for (let i = 0; i < e.ticks; i++) amt += (s.tickBase + s.tickCoef * spNow(e)) * e.periodicMult * liveMult(k, true, gt(ti)) * (s.ramp ? s.ramp[i] : 1);
      } else {
        amt = (s.base + s.coef * spNow(e)) * e.directMult * liveMult(k, false, gt(ti));
        if (k === 'incinerate' && !noImmolate && dotLeft('immolate', boss) > 0) amt *= 1 + s.immolateBonusPct / 100;
        if ((isSB(k) || k === 'searingPain') && T[boss].hpPct < cfg.fight.executePct && tv('decimation')) amt *= addOp0(k, tv('decimation', 'dmgPct'));
      }
      return hitChance() * amt * expVuln(s.school, ti, s.kind === 'channel', k) * expCrit(e.critPct, e.critMult);
    }
    const NOT_ALT = { bane: 1, baneOfAgony: 1, corruption: 1, siphonLife: 1, immolate: 1, multiDot: 1, curseOfElements: 1, lifeTapPet: 1, lifeTapBelow: 1, lifeTapNeed: 1,
                      swapToImp: 1, swapToSuccubus: 1, shadowBoltSpread: 1, isbUpkeep: 1, deathCoilFinisher: 1 };
    function altBelow(idx) {
      for (let i = (idx == null ? -1 : idx) + 1; i < list.length; i++) {
        const a = WL.actionOf(list[i], build);
        if (!a || NOT_ALT[list[i]]) continue;
        if (a.deep) continue;
        if (a.rule && !(SPELLS[a.rule.spell] && (SPELLS[a.rule.spell].kind === 'direct' || SPELLS[a.rule.spell].kind === 'channel'))) continue;
        const k = a.pick(view), s = k && SPELLS[k];
        if (s && table[k] && (s.kind === 'direct' || s.kind === 'channel')) return k;
      }
      return table.shadowBolt ? 'shadowBolt' : null;
    }
    function dotValue(key, ti) {
      const s = SPELLS[key], e = table[key], tL = now + castTime(key);
      const f = altBelow(view.actionIndex), fRate = f ? expCast(f, 0, key === 'immolate') / (occupies(f) + LAT) : 0;
      const cost = (occupies(key) + LAT) * fRate;
      const end = Math.min(fin, tL + s.duration), g = gcd();
      let value = 0;
      const amp = key === 'baneOfAgony' && tv('amplifyCurse') && (S.ampUp || buff('amplifyCurse') || (!AMP_BTN && ready('amplifyCurse')));
      const castMult = amp ? 1 + tv('amplifyCurse', 'boaPct') / 100 : 1;
      const tickAmt = (s.tickBase + s.tickCoef * spNow(e)) * castMult * e.periodicMult * liveMult(key, true, gt(ti)) * expVuln(s.school, ti, true, key) * expCrit(e.critPct, e.critMult);
      // Wrack as the filler: the DoT's ticks come faster by Wrack's share of the fight so far (80% in the first 20 s).
      const wf = f === 'wrack' && ti <= 1 && tv('wrack') && SPELLS.wrack.dotSpeedSpells.indexOf(key) >= 0;
      const times = [];
      let lastPart = 0;
      if (wf) {
        const ftn = fightTime(now), wOn = S.wrackTime + (S.wrackOn ? now - S.wrackOnAt : 0), share = ftn >= 20 ? wOn / ftn : 0.8;
        const gain = 1 + (WRACK_GAIN_X - 1) * share, tW = Math.max(tL, now + occupies(key) + LAT), tEnd = tL + s.duration;
        let tc = tL;
        for (;;) {
          let nt = tc < tW - EPS ? Math.min(tc + s.tickEvery, tW) : tc;
          if (nt < tc + s.tickEvery - EPS) nt += (s.tickEvery - (nt - tc)) / gain;
          if (nt > tEnd + 1e-6) {
            if (WRACK_PARTIAL) lastPart = Math.min(1, (Math.max(0, Math.min(tW, tEnd) - tc) + Math.max(0, tEnd - Math.max(tW, tc)) * gain) / s.tickEvery);
            break;
          }
          times.push(nt); tc = nt;
        }
      } else for (let i0 = 1; i0 <= e.ticks; i0++) times.push(tL + i0 * s.tickEvery);
      const hit = hitChance();
      let tConf = Infinity, keep = 1;
      const cfx = list.indexOf('conflagrateExpire') >= 0 && list.indexOf('conflagrate') < 0;
      if (key === 'immolate' && ti <= 1 && (list.indexOf('conflagrate') >= 0 || list.indexOf('conflagrateSnF') >= 0 || cfx) && table.conflagrate) {
        tConf = Math.max(cfx ? tL + s.duration - WL.CONFLAG_EXPIRE_S : tL, S.cds.conflagrate || 0);
        if (tConf < end - 1e-6 && tConf <= fin - g + EPS) {
          keep = tv('shadowAndFlame') ? tv('shadowAndFlame', 'procPct') / 100 : 0;
          value += hit * (expCast('conflagrate', 0) - g * fRate);
        } else tConf = Infinity;
      }
      let nTicks = 0, ticks = 0;
      for (let i = 1; i <= times.length; i++) {
        const tt = times[i - 1];
        if (tt > fin + EPS) break;
        nTicks++;
        const ri = Math.min(e.ticks - 1, Math.max(0, Math.ceil((tt - tL) / s.tickEvery - 1e-6) - 1));
        ticks += tickAmt * (s.ramp ? s.ramp[ri] : 1) * (tt > tConf + EPS ? keep : 1);
      }
      if (lastPart > 1e-6 && nTicks === times.length && tL + s.duration <= fin + EPS) ticks += tickAmt * (s.ramp ? s.ramp[e.ticks - 1] : 1) * lastPart;
      value += hit * ticks;
      if (s.kind === 'hybrid') value += expCast(key, ti);
      const up = Math.max(0, end - (now + occupies(key)));
      if (key === 'immolate' && ti <= 1 && f === 'incinerate') value += hit * up / occupies('incinerate') * expCast('incinerate', 0, true) * SPELLS.incinerate.immolateBonusPct / 100;
      const sbKey = table.shadowBolt && (list.indexOf('shadowTrance') >= 0 || (f && isSB(f))) ? 'shadowBolt' : null;
      if (WL.NIGHTFALL_SPELLS.indexOf(key) >= 0 && tv('nightfall') && sbKey) {
        let procTicks = 0;
        for (let j = 1; j <= nTicks; j++) if (times[j - 1] <= fin - g + EPS) procTicks++;
        const sbNow = expCast(sbKey, 0), sbCast = table[sbKey].cast / hasteFactor();
        value += hit * procTicks * tv('nightfall', 'procPct') / 100 * Math.max(0, sbNow - g * (sbKey === f ? sbNow / Math.max(sbCast, g) : fRate));
      }
      if (f && SPELLS[f].drain && tv('soulSiphon') && ti <= 1 && WL.SOUL_SIPHON_EFFECTS.indexOf(key) >= 0) {
        let others = 0;
        const per = tv('soulSiphon', 'perEffectPct'), cap = tv('soulSiphon', 'maxPct');
        WL.SOUL_SIPHON_EFFECTS.forEach(function (x) { if (x !== key && (x === 'curseOfElements' ? debuff(boss, 'coe') : dotLeft(x, boss) > 0)) others++; });
        const nowM = 1 + Math.min((others + (dotLeft(key, boss) > 0 ? 1 : 0)) * per, cap) / 100;
        const gain = (Math.min((others + 1) * per, cap) - Math.min(others * per, cap)) / 100;
        value += hit * up * fRate / nowM * gain;
      }
      return value >= cost;
    }
    function dotWorth(key, ti) {
      if (!DOT_END) return null;                           // the check switched off: the rotation's older rule
      if (!table[key] || now + castTime(key) + SPELLS[key].duration <= fin + EPS) return true;
      return dotValue(key, ti || 0);
    }

    let found = null;
    let stop = list.length;                               // the engine's walk at a channel tick: only what is above the channel
    if (walk && walk.channel) {
      stop = list.indexOf(walk.channel);
      if (stop < 0) stop = list.findIndex(function (a) { return actionSpells(build, a).indexOf(walk.channel) >= 0; });
      if (stop < 0) stop = list.length;
    }
    for (let i = 0; i < stop && !found; i++) {
      const a = WL.actionOf(list[i], build);               // a built-in action or one of the build's own rules
      if (!a) continue;
      view.nextTarget = 0; view.actionIndex = i;
      const k = a.pick(view);
      if (k === 'trinket:use') { if (walk && !walk.pick) useTrinketsApl(); continue; }   // "Activate trinket": off the GCD, the list goes on
      if (k === 'lifeTap' && !canTap()) continue;          // a Life Tap the list would like but has no health for
      if (k && table[k] && needsTarget(k) && immuneTo(standing[(view.nextTarget || 1) - 1] || boss, SPELLS[k].school)) continue;   // nothing she is immune to
      if (k && table[k] && fits(k) && affordable(k)) found = { key: k, target: standing[(view.nextTarget || 1) - 1] || boss, action: list[i], racial: false };
    }
    if (walk && walk.pick) {                              // fillOf (sim v212): the line of the list this press casts
      if (found && found.key === walk.pick) return found.action;   // the one the engine's walk chooses now
      for (let i = 0; i < list.length; i++) {             // else the first line that would cast it, then the first that names it
        const a = WL.actionOf(list[i], build);
        if (!a) continue;
        view.nextTarget = 0; view.actionIndex = i;
        if (a.pick(view) === walk.pick) return list[i];
      }
      for (let i = 0; i < list.length; i++) if (actionSpells(build, list[i]).indexOf(walk.pick) >= 0) return list[i];
      return null;
    }
    if (walk) return found;
    const tap = { key: 'lifeTap', target: boss, action: found ? found.action : null, racial: false, why: found ? 'mana' : 'moving', need: found ? found.key : null };
    if (!found) return made && cfg.fight.lifeTapWhileMoving && mana < stats.maxMana - EPS && canTap() ? tap : null;
    if (found.key === 'lifeTap') return found;
    if (mana < effectiveCost(found.key) - 1e-6) return stats.maxMana < effectiveCost(found.key) || !canTap() ? null : tap;   // no health for the tap: it waits for a heal
    // The race's cooldown by the engine's rule (sim v212, its round 248: without Bane of Doom after the opener, Blood Fury
    // also after an Amplify Curse Bane's strongest ticks begin; Eureka! only before a long direct cast or channel).
    const fa = WL.actionOf(found.action, build), rc = racialOf('cooldown');
    found.racial = !!rc && view.ready('racial') && SPELLS[found.key].kind !== 'utility' && (rc !== EUREKA || eurekaPopOk(found.key)) &&
      racialOk(found.key, ACT_HASFILL ? !!(fa && (fa.filler || fa.preFiller)) : null);
    // Amplify Curse as a button: press it before the Bane of Agony (the sim uses it on every one while it is ready).
    found.amplify = AMP_BTN && found.key === 'baneOfAgony' && !!tv('amplifyCurse') && view.ready('amplifyCurse') && !view.buff('amplifyCurse');
    return found;
  }

  reset(opts.seed);

  return {
    simWould: function (remaining) { return simWould(remaining); },
    // Would the engine use the race's cooldown right before a press of key now (sim v212's rules; tools/check-combat.mjs)?
    racialDue: function (key) { return racialDue(key); },
    // The page's guess of the time left in a fight on health (the engine's walk reads it, as the hint does).
    setRemaining: function (fn) { REM_GUESS = fn; },
    // You take one hit now (a scripted fight's own hits; the same rule as config.fight.hitEvery).
    hit: function () { if (!S.over && S.fightStart !== null) takeHit(); },
    stats: stats, table: table, spells: SPELLS, build: build, raceKey: raceKey, targetCount: N,
    get state() { return S; },
    get result() { return res; },
    get queuedKey() { return queued ? queued.key : null; },
    get pet() { return P; },
    get current() { return T[S.target]; },
    petMana: function () { return P ? Math.min(P.maxMana, P.mana + P.regen * (S.t - P.lastRegen)) : 0; },
    petCommand: petCommand, setTarget: setTarget, spawn: spawn, pull: pull, tapGain: tapGain,
    press: press, update: update, reset: reset, blocked: blocked, readyAt: readyAt,
    eventTimes: function () { return events.map(function (ev) { return ev.t; }); },   // for the check script
    cancel: function () { if (!S.over) interrupt('cancelled'); queued = null; },
    castTime: castTime, gcd: gcd, cost: effectiveCost, selfTick: selfTick, buff: buff, debuff: debuff, dotLeft: dotLeft, ready: ready,
    alive: alive, havocOn: havocOn, eurekaUp: eurekaUp, executePhase: executePhase,
    timed: timed, duration: linear, endless: endless, stop: stop, boss: BOSS, injure: injure, heal: heal, raidHurt: raidHurt,
    // A boss fight's shield (map null = gone) and curse (1 = gone); nothing else calls these.
    setImmune: function (ti, map) { if (!BOSS) return; IMM = IMM || {}; if (map) IMM[ti] = map; else delete IMM[ti]; },
    setOutMult: function (f) { if (BOSS) OUT_MULT = f; },
    // { moving, left } while you are made to move; { moving: false, next } = seconds until the next phase (null = none)
    movePhase: function () {
      if (!MOVE) return null;
      const ft = fightTime(S.t);
      if (ft < 0 || S.over) return { moving: false, next: null };
      const k = Math.floor((ft + EPS) / MOVE.every), into = ft - k * MOVE.every;
      return k >= 1 && into < MOVE.dur ? { moving: true, left: MOVE.dur - into } : { moving: false, next: (k + 1) * MOVE.every - ft };
    },
    // The 5-second rule: seconds until Spirit gives mana back again (0 = it does now; null = no mana spent yet, or
    // this character has no Spirit regeneration).
    // While you channel it is at least the rest of the channel.
    spiritIn: function () {
      if (!SPI_REGEN || S.lastSpend === -Infinity) return null;
      return Math.max(0, S.lastSpend + FSR - S.t, S.channel ? S.channel.end - S.t : 0);
    },
    spiritRate: SPI_REGEN,
    threatMult: threatMult,                                // threat per damage of a spell, with everything that lowers it
    timeLeft: function () { return timed ? (S.fightStart === null ? linear : Math.max(0, endAt() - S.t)) : null; },
    racial: function () { return racialOf('cooldown'); },
    amplify: function () { return !!tv('amplifyCurse'); },  // has the talent
    setAmplifyButton: function (on) { AMP_BTN = !!on && !!tv('amplifyCurse'); },
    fightSeconds: function () { return S.fightStart === null ? 0 : (S.fightEnd !== null ? S.fightEnd : S.t) - S.fightStart; }
  };
}

// Which spells of a build's priority list go on the action bar (the keys of this table are the priority actions).
export const ACTION_SPELLS = {
  deathCoilFinisher: ['deathCoil'], deathCoil: ['deathCoil'],
  bane: ['baneOfDoom', 'baneOfAgony'], baneOfAgony: ['baneOfAgony'],
  curseOfElements: ['curseOfElements'],
  searingPainBrand: ['searingPain'], searingPainExecute: ['searingPain'], searingPainDecimation: ['searingPain'], searingPain: ['searingPain'],
  immolate: ['immolate'], corruption: ['corruption'], siphonLife: ['siphonLife'],
  conflagrate: ['conflagrate'], conflagrateExpire: ['conflagrate'], conflagrateSnF: ['conflagrate'],
  shadowburn: ['shadowburn'], shadowburnSnF: ['shadowburn'],
  soulFire: ['soulFire'], soulFireShards: ['soulFire'],
  shadowTrance: ['shadowBolt'], isbUpkeep: ['shadowBolt'], shadowBoltSpread: ['shadowBolt'], shadowBolt: ['shadowBolt'],
  lifeTapPet: ['lifeTap'], lifeTapBelow: ['lifeTap'], lifeTapNeed: ['lifeTap'],
  wrack: ['wrack'], wrackDots: ['wrack'], incinerate: ['incinerate'], drainLife: ['drainLife'],
  hellfire: ['hellfire'], rainOfFire: ['rainOfFire']
};
const NOT_ON_BAR = { drainSoul: true };    // Drain Soul is not used

// What the spellbook shows: every spell this character can cast, then the race's cooldown and Amplify Curse when
// they are there. Ordered by their usual slot, then by name.
export function bookSpells(build, table, race, names) {
  const keys = Object.keys(table).filter(function (k) { return !NOT_ON_BAR[k]; });
  function place(k) { return HOME[k] ? HOME[k][0] : 99; }
  keys.sort(function (a, b) { return place(a) - place(b) || String(names(a)).localeCompare(String(names(b))); });
  if (race.racials.some(function (r) { return r.effect === 'cooldown'; })) keys.push('racial');
  if (build.talents && build.talents.amplifyCurse) keys.push('amplifyCurse');
  return keys;
}

// Every spell has its own key, the same in every build (Xn, 2026-10-05). The slots are, in order:
// 1 2 3 4 5 6 7 8 R F T G C V B. A spell that has no place of its own in a build takes the place of the one it stands
// in for: Incinerate and Wrack for Shadow Bolt, Conflagrate for Searing Pain, and so on.
const HOME = {
  curseOfElements: [0], searingPain: [1], shadowBolt: [2], immolate: [3], corruption: [4], baneOfAgony: [5], baneOfDoom: [6],
  deathCoil: [7], lifeTap: [8], soulFire: [9], drainLife: [10], racial: [11],
  baneOfHavoc: [12], rainOfFire: [13], hellfire: [14],
  incinerate: [2], wrack: [2, 10], conflagrate: [1], shadowburn: [9, 7], siphonLife: [6, 7]
};

// The spells one line of a build's priority list can cast: a built-in action (the table above), one of the build's
// own rules ('rule:N' casts build.rules[N].spell) or a group of lines ('group:Name', one level, as the sim has them).
export function actionSpells(build, action) {
  if (ACTION_SPELLS[action]) return ACTION_SPELLS[action];
  const rule = /^rule:(\d+)$/.exec(action || ''), group = /^group:(.+)$/.exec(action || '');
  if (rule) { const r = build.rules && build.rules[+rule[1]]; return r && r.spell ? [r.spell] : []; }
  if (group) return [].concat.apply([], ((build.groups || {})[group[1]] || []).filter(function (a) { return !/^group:/.test(a); }).map(function (a) { return actionSpells(build, a); }));
  return [];
}

// Returns one entry per slot: a spell key, 'racial', or null for an empty slot.
// First the spells of the build's priority list (plus Life Tap and the race's cooldown) take their own keys; those
// whose key is taken fill the free slots from the left; then whatever else the build can cast, if its key is free.
// own: { spell: slot } - places you chose yourself in "Edit bar"; they come before everything else.
export function actionBarFor(build, table, race, slots, own) {
  const bar = [];
  for (let i = 0; i < slots; i++) bar.push(null);
  const mine = own || {};
  const wanted = [];
  function want(key) { if (wanted.indexOf(key) < 0 && (key === 'racial' || table[key])) wanted.push(key); }
  build.rotation.forEach(function (action) { actionSpells(build, action).forEach(want); });
  want('lifeTap');
  if (race.racials.some(function (r) { return r.effect === 'cooldown'; })) want('racial');

  function home(key) {
    const places = mine[key] != null ? [mine[key]].concat(HOME[key] || []) : HOME[key] || [];
    for (let i = 0; i < places.length; i++) if (places[i] < slots && bar[places[i]] === null) { bar[places[i]] = key; return true; }
    return false;
  }
  const castable = wanted.concat(Object.keys(table).filter(function (key) { return !NOT_ON_BAR[key]; }));
  castable.forEach(function (key) { if (mine[key] != null && bar.indexOf(key) < 0 && mine[key] < slots && bar[mine[key]] === null) bar[mine[key]] = key; });
  const homeless = wanted.filter(function (key) { return bar.indexOf(key) < 0 && !home(key); });
  homeless.forEach(function (key) { const free = bar.indexOf(null); if (free >= 0) bar[free] = key; });
  Object.keys(table).forEach(function (key) { if (!NOT_ON_BAR[key] && bar.indexOf(key) < 0) home(key); });
  return bar;
}
