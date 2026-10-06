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
  shards: 'No Soul Shards',
  health: 'Not enough health',
  immolate: 'Requires Immolate on the target',
  noRacial: 'Your race has nothing to use'
};

// The key a spell's damage is booked under: plain for the first target, x2: / x3: for the others (as in the engine).
export function rowKey(target, key) { return target > 1 ? 'x' + target + ':' + key : key; }

// opts: WL, build, raceKey, config, dummyHealth, targets (1-3), seed (optional), onEvent (optional),
//       petMeleeRange (yards),
//       timedDuration: a fight of this many seconds instead of a health pool - health falls evenly with time (as in
//       the engine) and the fight ends when the time is up,
//       linearDuration: the same health model for the check script, with the clock running from the reset.
// From config.fight (as in the engine): moveEvery / moveDuration = every so many seconds you have to move for so
//       long (only instants then); hitEvery = you take a hit every so many seconds, which pushes your casts back.
// ctx (given to update, press and blocked): { moving, distances: [, d1, d2, d3] you to each target,
//       gaps: [[..]] target to target, petDistance: the pet to its target }. Anything left out counts as "in range".
export function createCombat(opts) {
  const WL = opts.WL, cfg = opts.config, build = opts.build, raceKey = opts.raceKey;
  const stats = WL.computeStats(build, raceKey, cfg);
  const table = WL.buildSpellTable(build, stats, cfg);
  const SPELLS = WL.spellsFor(cfg);
  const race = WL.RACES[raceKey], cb = cfg.combat, isSB = WL.isShadowBolt;
  const emit = opts.onEvent || function () {};
  const check = !!opts.linearDuration, timed = !check && !!opts.timedDuration;
  const linear = opts.linearDuration || opts.timedDuration || 0;
  const MOVE = cfg.fight.moveEvery > 0 && cfg.fight.moveDuration > 0 ? { every: cfg.fight.moveEvery, dur: cfg.fight.moveDuration } : null;
  const HIT = cfg.fight.hitEvery > 0 ? cfg.fight.hitEvery : 0;
  const AURA_PUSH = Object.keys(cfg.buffs || {}).reduce(function (a, k) { const b = cfg.buffs[k]; return a + (b.on && b.pushbackResistPct ? b.pushbackResistPct : 0); }, 0);
  const FEL_CONC = { drainLife: 1, drainSoul: 1, wrack: 1 };
  const N = Math.max(1, Math.min(3, opts.targets || 1));
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

  let S, T, R, P, res, events, order, inst, queued, lastCtx = null, maxHealth = opts.dummyHealth || 50000;

  function reset(seed) {
    const seed0 = seed != null ? seed : (opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296));
    // One random stream per kind of roll, with the engine's own constants.
    R = { hit: WL.makeRng(seed0 ^ 0x1B873593), crit: WL.makeRng(seed0 ^ 0x85EBCA6B), proc: WL.makeRng(seed0 ^ 0xC2B2AE35),
          vuln: WL.makeRng(seed0 ^ 0x27D4EB2F), jow: WL.makeRng(seed0 ^ 0x3C6EF372), isb: WL.makeRng(seed0 ^ 0x9E3779B9),
          pet: WL.makeRng(seed0 ^ 0x165667B1), push: WL.makeRng(seed0 ^ 0x61C88647) };
    S = {
      seed: seed0, t: 0, mana: stats.maxMana, health: stats.maxHealth, minHealth: stats.maxHealth,
      shards: Infinity,                                   // Soul Shards never run out (Xn, 2026-10-07)
      gcdStart: 0, gcdReady: 0, cast: null, channel: null,
      lastSpend: -Infinity,                               // when mana was last spent (the 5-second rule)
      cds: {}, buffs: {}, eurekaCharges: 0, eurekaPending: 0, petSent: false,
      target: 1, havoc: null,
      fightStart: null, fightEnd: null, over: false, presses: []
    };
    T = [null];
    for (let i = 1; i <= N; i++) {
      T.push({ index: i, health: maxHealth, maxHealth: maxHealth, hpPct: 100, dead: false, dots: {}, deb: {}, brandCharges: 0 });
      if (coeFromOthers && i === 1) T[i].deb.coe = Infinity;
    }
    S.targets = T;
    res = { total: 0, bySpell: {}, byTarget: [0, 0, 0, 0],
            track: { busy: 0, uptime: {}, petActive: 0, wasted: 0, spirit: 0, moved: 0, interrupts: 0, pushbacks: 0, pushbackTime: 0, lifeTaps: 0 } };
    events = []; order = 0; inst = 0; queued = null; resCache = {};
    P = makePet(build.pet);
    S.decideSeq = order++;
  }

  // ---------- small helpers (same meaning as in the engine) ----------
  function row(key) { return res.bySpell[key] || (res.bySpell[key] = { casts: 0, landed: 0, misses: 0, hits: 0, crits: 0, ticks: 0, tickCrits: 0, dmg: 0 }); }
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
    if (S.eurekaCharges > 0 && SPELLS[key].kind !== 'utility') c *= 1 - racialOf('cooldown').costRedPct / 100;
    return c;
  }
  function manaCap() { return stats.maxMana + (S.cast ? S.cast.cost : 0); }
  function gainHealth(amount) { const before = S.health; S.health = Math.min(stats.maxHealth, S.health + amount); return S.health - before; }
  function loseHealth(amount) { S.health -= amount; if (S.health < S.minHealth) S.minHealth = S.health; }
  function canTap() { return S.health > TAP_HP; }
  // What one tick of a spell that also hits you (Hellfire) does to you: its base damage, no talents, no crit.
  function selfTick(key) { const s = SPELLS[key]; return s.selfDamage ? Math.round(s.tickBase + s.tickCoef * spNow(table[key])) : 0; }
  function executePhase(ti) { return T[ti || S.target].hpPct < cfg.fight.executePct; }
  // Seconds into the fight (the engine's clock): from the reset in the check, from your first action in play.
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
  // Distances come from the scene; without them (the check script) everything is in range.
  function distanceTo(ti, ctx) { const c = ctx || lastCtx; return c && c.distances && c.distances[ti] != null ? c.distances[ti] : 0; }
  function gap(a, b) { const c = lastCtx; return a === b ? 0 : c && c.gaps && c.gaps[a] && c.gaps[a][b] != null ? c.gaps[a][b] : 0; }

  function push(ev) {            // events in time order; at the same time ticks (0) come before a cast ending (1)
    ev.seq = order++;
    let i = events.length;
    while (i > 0) {
      const p = events[i - 1], d = p.t - ev.t;
      if (d < -EPS || (d <= EPS && p.o <= ev.o)) break;
      i--;
    }
    events.splice(i, 0, ev);
  }

  // ---------- damage ----------
  function eurekaUp() { return S.eurekaCharges > 0 || S.eurekaPending > 0; }
  function eurekaRelease() { if (S.eurekaPending > 0) S.eurekaPending--; }
  function eurekaMult(key, periodic) {
    const cd = racialOf('cooldown');
    if (!(cd && cd.charges && eurekaUp())) return 1;
    if (periodic && SPELLS[key].kind !== 'channel') return 1;        // DoT ticks get nothing
    const e = table[key], g = e ? (periodic ? e.op22 : e.op0) || 0 : 0;
    return (1 + g + cd.dmgPct / 100) / (1 + g);
  }
  function addOp0(key, pct) { const g = (table[key] && table[key].op0) || 0; return (1 + g + pct / 100) / (1 + g); }
  // What changes a spell's damage at this moment on this target: your buffs, and that target's own debuffs.
  function liveMult(key, periodic, ti) {
    const s = SPELLS[key];
    let m = eurekaMult(key, periodic);
    if (debuff(ti, 'coe')) m *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    if (s.school === 'shadow' && debuff(ti, 'isb')) m *= 1 + tv('improvedShadowBolt', 'debuffPct') / 100;
    if (s.school === 'shadow' && buff('snfShadow')) m *= 1 + tv('shadowAndFlame', 'schoolPct') / 100;
    if (s.school === 'fire' && buff('snfFire')) m *= 1 + tv('shadowAndFlame', 'schoolPct') / 100;
    if (periodic && S.channel && S.channel.key === 'wrack' && S.channel.target === ti && SPELLS.wrack.debuffSpells.indexOf(key) >= 0) m *= 1 + SPELLS.wrack.debuffPct / 100;
    if (s.drain && tv('soulSiphon')) {
      let n = 0;
      WL.SOUL_SIPHON_EFFECTS.forEach(function (e) { if (e === 'curseOfElements' ? debuff(ti, 'coe') : dotLeft(e, ti) > 0) n++; });
      m *= 1 + Math.min(n * tv('soulSiphon', 'perEffectPct'), tv('soulSiphon', 'maxPct')) / 100;
    }
    return m;
  }
  // Your spell power right now (Blood Fury counts while it is up). Ticks read it when they land: DoTs are dynamic.
  function spNow(e) { return e.sp * (buff('bloodFury') ? 1 + racialOf('cooldown').spPct / 100 : 1); }

  let resCache = {};
  function vulnMult(school, ti) {    // partial resists and Spell Pierce
    const coe = debuff(ti, 'coe'), id = school + (coe ? '1' : '0');
    const pr = resCache[id] || (resCache[id] = WL.resistProfile(cfg, stats.pierce, school, coe));
    let m = pr.flat;
    if (pr.dist.length > 1) {
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
    if (linear) return;
    const t = T[ti];
    t.health = Math.max(0, t.health - amount);
    t.hpPct = 100 * t.health / t.maxHealth;
  }

  function deal(key, amount, crit, isTick, ti, extra) {
    const rk = key === 'touchOfTheGrave' ? key : rowKey(ti, key), r = row(rk);   // the Undead proc has one row for all targets (as in the engine)
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
    if (hav && havocPct && key.indexOf('pet:') !== 0 && ti !== hav && (linear || alive(hav))) {
      const copied = amount * havocPct, h = row('baneOfHavoc');
      h.dmg += copied; h.hits++; res.total += copied;
      hurt(hav, copied);
      emit({ type: 'havoc', key: 'baneOfHavoc', target: hav, amount: copied, school: 'shadow' });
      if (!linear && T[hav].health <= 0 && !T[hav].dead) kill(hav);
    }
    if (!linear && T[ti].health <= 0 && !T[ti].dead) kill(ti);
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
      S.cast = null; S.channel = null; events.length = 0; queued = null; S.eurekaPending = 0;
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
  // Touch of the Grave (Undead): 5% of your maximum health - so it grows with Stamina - times every Shadow damage %:
  // your Shadow auras (Demonic Sacrifice, Master Demonologist, Soul Link), Curse of the Elements and Improved Shadow
  // Bolt on the target it hits, and Shadow and Flame while it is up. No spell power, none of the talents that name
  // their own spells, no crit, no resist roll (Xn, 2026-10-06; as in the engine).
  function togMult(ti) {
    let m = (stats.mult.shadow || 1) * stats.mult.all;
    if (debuff(ti, 'coe')) m *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    if (debuff(ti, 'isb')) m *= 1 + tv('improvedShadowBolt', 'debuffPct') / 100;
    if (buff('snfShadow')) m *= 1 + tv('shadowAndFlame', 'schoolPct') / 100;
    return m;
  }
  function touchOfTheGrave(ti) {
    const tog = racialOf('proc');
    if (tog && R.proc() * 100 < tog.chancePct) {
      const amount = stats.maxHealth * tog.maxHealthPct / 100 * togMult(ti);
      row('touchOfTheGrave').casts++;
      if (alive(ti)) deal('touchOfTheGrave', amount, false, false, ti);   // on the target the spell landed on
    }
  }

  function applyDot(ti, key, snap) {
    const s = SPELLS[key], e = table[key], id = ++inst, t = T[ti];
    if (s.bane) {                                                     // one Bane per target
      delete t.dots.baneOfAgony; delete t.dots.baneOfDoom;
      if (!check && S.havoc && S.havoc.target === ti) S.havoc = null;
    }
    t.dots[key] = { inst: id, applied: S.t, expires: S.t + s.duration, ticks: e.ticks, snap: snap };
    for (let i = 1; i <= e.ticks; i++) push({ t: S.t + i * s.tickEvery, o: 0, type: 'dotTick', key: key, target: ti, inst: id, i: i - 1 });
  }

  function periodicTick(key, snap, i, ti) {
    const s = SPELLS[key], e = table[key];
    let amount = (s.tickBase * (snap.baseMult || 1) + s.tickCoef * spNow(e)) * e.periodicMult * liveMult(key, true, ti);
    if (s.ramp) amount *= s.ramp[i];
    amount *= vulnMult(s.school, ti);
    const crit = R.crit() * 100 < e.critPct;
    if (crit) amount *= e.critMult;
    deal(key, amount, crit, true, ti);
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
    for (let ti = 1; ti <= N; ti++) {
      if (S.over) return;
      if (!alive(ti)) continue;
      if (!check && (s.range ? gap(aimed, ti) : distanceTo(ti)) > e.radius + EPS) continue;
      const r = row(rowKey(ti, key));
      if (R.hit() * 100 >= stats.hitPct) { r.misses++; emit({ type: 'miss', key: key, target: ti, tick: true }); continue; }
      let amount = (s.tickBase + s.tickCoef * spNow(e)) * e.periodicMult * liveMult(key, true, ti);
      amount *= vulnMult(s.school, ti);
      const crit = R.crit() * 100 < e.critPct;
      if (crit) amount *= e.critMult;
      deal(key, amount, crit, true, ti);
    }
    if (s.selfDamage && !S.over) { const hurtYou = selfTick(key); loseHealth(hurtYou); emit({ type: 'selfHit', key: key, amount: hurtYou }); }
  }

  // A finished or instant cast arrives at its target. Returns true when it hit.
  function land(key, baseMult, ti) {
    const s = SPELLS[key], e = table[key], r = row(rowKey(ti, key)), t = T[ti];
    if (R.hit() * 100 >= stats.hitPct) { r.misses++; emit({ type: 'miss', key: key, target: ti }); return false; }
    r.landed++;
    if (s.kind === 'utility') {
      if (key === 'curseOfElements') { t.deb.coe = S.t + s.duration; emit({ type: 'apply', key: key, target: ti }); }
      if (ti === 1) jowProc();
      return true;
    }
    if (s.kind === 'dot') {
      applyDot(ti, key, { baseMult: baseMult || 1 });
      emit({ type: 'apply', key: key, target: ti });
      touchOfTheGrave(ti);
      if (ti === 1 && !S.over) jowProc();
      return true;
    }
    let amount = (s.base + s.coef * spNow(e)) * e.directMult * liveMult(key, false, ti);
    if (key === 'incinerate' && dotLeft('immolate', ti) > 0) amount *= 1 + s.immolateBonusPct / 100;
    if ((isSB(key) || key === 'searingPain') && executePhase(ti) && tv('decimation')) {
      amount *= addOp0(key, tv('decimation', 'dmgPct'));
      if (!buff('decimation')) emit({ type: 'proc', name: 'decimation' });
      S.buffs.decimation = S.t + 10;
    }
    amount *= vulnMult(s.school, ti);
    const crit = R.crit() * 100 < e.critPct;
    if (crit) amount *= e.critMult;
    deal(key, amount, crit, false, ti);
    // The rolls below are made even when this hit killed the target, so the random streams stay in step with the engine.
    if (isSB(key) && crit && tv('improvedShadowBolt')) {
      if (R.isb() * 100 < stats.hitPct && !t.dead) { t.deb.isb = S.t + 12; emit({ type: 'apply', key: 'isb', target: ti }); }
    }
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
    if (s.kind === 'hybrid' && !t.dead) applyDot(ti, key, { baseMult: baseMult || 1 });
    touchOfTheGrave(ti);
    if (ti === 1 && !S.over) jowProc();
    return true;
  }

  // ---------- the pet ----------
  // Its spell power is a share of yours plus Demonic Knowledge; it uses your hit chance and your crit chance.
  function makePet(key) {
    if (!key || !cfg.options.includePetDamage) return null;
    const pc = cfg.pets[key], maxMana = pc.mana * (1 + tv('felVitality', 'manaPct') / 100);
    return { key: key, c: pc, maxMana: maxMana, mana: maxMana, lastRegen: 0, lashReady: 0, swingReady: 0, gen: 0,
             mode: 'follow', active: false, casting: null, target: 1,
             range: pc.melee ? petMeleeRange : pc.spell.range };
  }
  function petRegen() { P.mana = Math.min(P.maxMana, P.mana + P.c.manaRegen * (S.t - P.lastRegen)); P.lastRegen = S.t; }
  function petSchool() { return build.pet === 'imp' ? 'fire' : 'shadow'; }
  function petMult(school) {
    let m = (1 + tv('unholyPower', 'petDmgPct') / 100) * stats.mult.all;
    if ((build.pet === 'succubus' && school === 'shadow') || (build.pet === 'imp' && school === 'fire')) m *= 1 + tv('masterDemonologist', 'schoolPct') / 100;
    if (school !== 'physical' && debuff(P.target, 'coe')) m *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    return m;
  }
  function warlockSpNow() { return stats.sp * (buff('bloodFury') ? 1 + racialOf('cooldown').spPct / 100 : 1); }
  function petSp() { return warlockSpNow() * (cfg.petSpPct != null ? cfg.petSpPct : 100) / 100 + (stats.dkSp || 0); }

  function petSpellHit(sp) {
    const key = 'pet:' + sp.key, ti = P.target, r = row(rowKey(ti, key));
    P.casting = null;
    r.casts++;
    if (R.pet() * 100 >= stats.hitPct) { r.misses++; emit({ type: 'miss', key: key, target: ti, pet: true }); return; }
    r.landed++;
    if (ti === 1) jowProc(true);
    const base = sp.base * (sp.key === 'lashOfPain' ? 1 + tv('improvedSayaad', 'lashPct') / 100 : 1);
    let amount = (base + sp.coef * petSp()) * petMult(sp.school);
    if (sp.key === 'firebolt') amount *= 1 + tv('improvedImp', 'firebolt') / 100;
    const crit = R.pet() * 100 < stats.critPct;
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
    const amount = ((db.baseMin + db.baseMax) / 2 + db.shadowSpCoef * (warlockSpNow() + (stats.schoolSp.shadow || 0))) * petMult(school);
    row(rowKey(ti, 'pet:brand')).casts++;
    deal('pet:brand', amount, false, false, ti, { pet: true, school: school });
  }
  function petEvent(t, o, type) { push({ t: t, o: o, type: type, gen: P.gen }); }
  function petAct() {                       // its spell: Firebolt again and again, Lash of Pain whenever it is ready
    if (!P.c.spell || (S.t >= endAt() - EPS)) return;
    petRegen();
    const sp = P.c.spell;
    if (sp.cd && P.lashReady > S.t + EPS) { petEvent(P.lashReady, 2, 'petAct'); return; }
    if (P.mana < sp.cost) { petEvent(S.t + Math.max(0.1, (sp.cost - P.mana) / P.c.manaRegen), 2, 'petAct'); return; }
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
  function petSwing() {                     // the Succubus's melee: one roll decides miss, dodge, glancing, crit or hit
    if (S.t >= endAt() - EPS) return;
    const m = P.c.melee, ti = P.target, r = row(rowKey(ti, 'pet:melee')), tb = cb.petMelee, gen = P.gen;
    r.casts++;
    const hitBonus = Math.max(0, stats.hitPct - cb.baseHitPct - tb.hitSuppressionPct);
    const miss = Math.max(0, tb.missPct - hitBonus), roll = R.pet() * 100;
    const critChance = Math.max(0, m.critPct + (m.inheritMeleeCrit ? stats.meleeCritPct : 0) - tb.critSuppressionPct);
    P.swingReady = S.t + m.swing;
    if (roll >= miss + tb.dodgePct) {
      r.landed++;
      if (ti === 1) jowProc(true);
      const dps = m.baseDps + m.apPerSp * warlockSpNow() / m.apPerDps;
      let amount = dps * m.swing * (1 - armorRed) * petMult('physical');
      const glance = roll < miss + tb.dodgePct + tb.glancePct;
      const crit = !glance && roll < miss + tb.dodgePct + tb.glancePct + critChance;
      if (glance) amount *= tb.glanceDmgPct / 100;
      if (crit) amount *= 2;
      deal('pet:melee', amount, crit, false, ti, { pet: true, school: 'physical', glance: glance });
      if (!S.over && alive(ti)) brandProc(ti);
    } else {
      r.misses++;
      emit({ type: 'miss', key: 'pet:melee', target: ti, pet: true, dodge: roll >= miss });
    }
    if (!S.over && P.gen === gen) petEvent(S.t + m.swing, 0, 'petSwing');
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
    let eurekaUsed = false, baseMult = 1;
    if (S.eurekaCharges > 0 && s.kind !== 'utility') { S.eurekaCharges--; S.eurekaPending++; eurekaUsed = true; }
    // Amplify Curse is used by itself with Bane of Agony whenever it is ready (as the engine does): +50% to the base value.
    if (key === 'baneOfAgony' && tv('amplifyCurse') && ready('amplifyCurse')) {
      baseMult = 1 + tv('amplifyCurse', 'boaPct') / 100;
      S.cds.amplifyCurse = S.t + 180;
      emit({ type: 'used', name: 'Amplify Curse' });
    }
    const free = key === 'soulFire' && (startedWithDecimation || buff('decimation'));
    if (s.shards && !free) S.shards -= s.shards;
    if (key === 'soulFire' && buff('decimation')) delete S.buffs.decimation;
    return { eurekaUsed: eurekaUsed, baseMult: baseMult };
  }

  function startCast(key, ti) {
    const s = SPELLS[key], e = table[key];
    const castT = castTime(key), gcdT = gcd();
    const trance = isSB(key) && buff('shadowTrance');
    if (key !== 'lifeTap') {
      beginFight();
      if (!S.petSent) { S.petSent = true; if (P && P.mode !== 'attack') petCommand('attack', ti); }   // the pet joins in by itself
    }
    S.presses.push({ t: S.t, k: key, target: ti });
    S.gcdStart = S.t; S.gcdReady = S.t + gcdT;
    emit({ type: 'cast', key: key, target: ti, castTime: castT, channel: s.kind === 'channel' ? s.duration : 0 });

    if (key === 'lifeTap') {
      const gain = (SPELLS.lifeTap.manaBase + stats.spi) * (1 + tv('improvedLifeTap', 'manaPct') / 100);
      const before = S.mana;
      loseHealth(TAP_HP);
      S.mana = Math.min(stats.maxMana, S.mana + gain);
      row('lifeTap').casts++;
      res.track.lifeTaps++;
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
      if (!s.aoe && R.hit() * 100 >= stats.hitPct) {       // area channels always start; their ticks roll per target
        if (spent.eurekaUsed) eurekaRelease();
        r.misses++; emit({ type: 'miss', key: key, target: ti });
        S.decideSeq = order++;
        return;
      }
      r.landed++;
      touchOfTheGrave(ti);
      if (!S.over) {
        if (ti === 1 || s.aoe) jowProc();
        const id = ++inst;
        S.channel = { key: key, inst: id, target: ti, snap: { baseMult: 1 }, start: S.t, end: S.t + s.duration, eurekaHeld: spent.eurekaUsed };
        for (let i = 1; i <= e.ticks; i++) push({ t: S.t + i * s.tickEvery, o: 0, type: 'chanTick', key: key, inst: id, i: i - 1 });
      }
    } else if (castT > EPS) {
      const id = ++inst;
      // A cooldown starts when the cast is complete, not when it begins (Xn, 2026-10-06; as in the engine). It is set
      // here for the moment the cast will end; a pushback moves it along (takeHit), and a cast that is stopped never
      // had one (interrupt). Only Soul Fire has both a cast time and a cooldown.
      if (e.cd) S.cds[key] = S.t + castT + e.cd;
      S.cast = { key: key, inst: id, target: ti, start: S.t, end: S.t + castT, full: castT, hits: 0, cost: effectiveCost(key), decimation: key === 'soulFire' && buff('decimation') };
      push({ t: S.t + castT, o: 1, type: 'castEnd', inst: id });
    } else {
      if (trance) delete S.buffs.shadowTrance;
      if (e.cd) S.cds[key] = S.t + e.cd;
      const spent = commit(key);
      land(key, spent.baseMult, ti);
      if (spent.eurekaUsed) eurekaRelease();
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
      S.cast = null;
      S.mana = Math.min(S.mana, stats.maxMana);
      emit({ type: 'interrupt', key: key, reason: reason });
    } else if (S.channel) {
      const key = S.channel.key;
      if (S.channel.eurekaHeld) eurekaRelease();
      S.channel = null;
      emit({ type: 'interrupt', key: key, reason: reason, channel: true });
    }
  }

  function useRacial() {
    const cd = racialOf('cooldown');
    if (!cd) return fail('racial', 'noRacial');
    if (!ready('racial')) return fail('racial', 'cooldown');
    S.cds.racial = S.t + cd.cd;
    if (cd.spPct) S.buffs.bloodFury = S.t + cd.duration;
    if (cd.hastePct) S.buffs.berserking = S.t + cd.duration;
    if (cd.charges) {
      S.eurekaCharges = cd.charges; S.eurekaPending = 0;
      if (cd.duration) push({ t: S.t + cd.duration, o: 0, type: 'eurekaEnd', pop: S.cds.racial });
    }
    S.presses.push({ t: S.t, k: 'racial' });
    emit({ type: 'used', name: cd.name });
    return { ok: true };
  }

  // Bane of Havoc: instant, not on the global cooldown, cannot miss (as the engine casts it). It sits on one target at
  // a time and takes the place of any other Bane there.
  function castHavoc(ctx) {
    const e = table.baneOfHavoc, ti = S.target;
    if (!e) return fail('baneOfHavoc', 'unknown');
    if (!alive(ti)) return fail('baneOfHavoc', 'dead');
    if (S.mana < e.cost - 1e-6) return fail('baneOfHavoc', 'mana');
    if (distanceTo(ti, ctx) > e.range + EPS) return fail('baneOfHavoc', 'range');
    S.mana -= e.cost;
    if (e.cost > 0) S.lastSpend = S.t;
    if (!check) { delete T[ti].dots.baneOfAgony; delete T[ti].dots.baneOfDoom; }
    S.havoc = { target: ti, expires: S.t + SPELLS.baneOfHavoc.duration };
    row('baneOfHavoc').casts++;
    S.presses.push({ t: S.t, k: 'baneOfHavoc', target: ti });
    emit({ type: 'apply', key: 'baneOfHavoc', target: ti });
    return { ok: true };
  }

  function fail(key, reason) {
    emit({ type: 'fail', key: key, reason: reason, text: FAIL_TEXT[reason] });
    return { ok: false, reason: reason };
  }

  function needsTarget(key) { return key !== 'lifeTap' && !(SPELLS[key].aoe && !SPELLS[key].range); }

  // Why this spell cannot be cast right now (null = it can), at your current target.
  function blocked(key, ctx) {
    const s = SPELLS[key], e = table[key], ti = S.target;
    if (!e) return 'unknown';
    if (key === 'baneOfHavoc') return !alive(ti) ? 'dead' : S.mana < e.cost - 1e-6 ? 'mana' : distanceTo(ti, ctx) > e.range + EPS ? 'range' : null;
    if (!ready(key)) return 'cooldown';
    if (key === 'lifeTap' && TAP_HP && !canTap()) return 'health';
    if (s.selfDamage && S.health <= selfTick(key)) return 'health';           // its first tick would kill you
    if (needsTarget(key) && !alive(ti)) return 'dead';
    if (key === 'conflagrate' && !(dotLeft('immolate', ti) > 0)) return 'immolate';
    if (s.shards && !(key === 'soulFire' && buff('decimation')) && S.shards < s.shards) return 'shards';
    if (S.mana < effectiveCost(key) - 1e-6) return 'mana';
    if (ctx && e.range > 0 && distanceTo(ti, ctx) > e.range + EPS) return 'range';
    if (((ctx && ctx.moving) || forcedMove()) && (s.kind === 'channel' || castTime(key) > EPS)) return 'moving';
    return null;
  }

  function readyAt() { return Math.max(S.cast ? S.cast.end : S.t, S.gcdReady); }

  function tryCast(key, ctx) {
    const why = blocked(key, ctx);
    if (why) return fail(key, why);
    if (S.channel) interrupt('clipped');
    startCast(key, S.target);
    return { ok: true };
  }

  function press(key, ctx) {
    if (ctx) lastCtx = ctx;
    if (S.over) return fail(key, 'dead');
    if (key === 'racial') return useRacial();
    if (key === 'baneOfHavoc') return castHavoc(ctx);
    if (!table[key]) return fail(key, 'unknown');
    const free = readyAt();
    if (free > S.t + EPS) {
      if (free - S.t <= QUEUE_WINDOW) { queued = { key: key }; return { ok: true, queued: true }; }
      return fail(key, 'busy');
    }
    return tryCast(key, ctx);
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
      const ft = fightTime(S.t), pct = ft < 0 ? 100 : Math.max(0, 100 * (1 - ft / linear));
      for (let i = 1; i <= N; i++) { T[i].hpPct = pct; if (timed) T[i].health = T[i].maxHealth * pct / 100; }
    }
  }

  // A timed fight is over: the clock stops, everything stops.
  function timeUp() {
    S.over = true; S.fightEnd = S.t;
    S.cast = null; S.channel = null; events.length = 0; queued = null; S.eurekaPending = 0;
    if (P) { P.active = false; P.gen++; P.casting = null; }
    emit({ type: 'death', target: S.target, last: true, timed: true, seconds: linear, total: res.total, dps: res.total / linear });
  }

  function handle(ev) {
    if (ev.type === 'castEnd') {
      const c = S.cast;
      if (!c || c.inst !== ev.inst) return;
      S.cast = null;
      const spent = commit(c.key, c.decimation, c.cost);
      land(c.key, spent.baseMult, c.target);
      if (spent.eurekaUsed) eurekaRelease();
    } else if (ev.type === 'dotTick') {
      const d = T[ev.target].dots[ev.key];
      if (!d || d.inst !== ev.inst) return;              // refreshed, consumed, or the target is dead
      periodicTick(ev.key, d.snap, ev.i, ev.target);
      if (!S.over && ev.i === d.ticks - 1 && T[ev.target].dots[ev.key] === d) delete T[ev.target].dots[ev.key];
    } else if (ev.type === 'dmgTaken') {
      takeHit();
      push({ t: S.t + HIT, o: 1, type: 'dmgTaken' });
    } else if (ev.type === 'chanEnd') {                  // a channel shortened by a hit ends early
      const c = S.channel;
      if (!c || c.inst !== ev.inst || c.end > S.t + EPS) return;
      if (c.eurekaHeld) eurekaRelease();
      S.channel = null;
    } else if (ev.type === 'chanTick') {
      const c = S.channel;
      if (!c || c.inst !== ev.inst) return;              // stopped
      if (ev.t > c.end + EPS) return;                    // cut off by a hit; the channel's end closes it
      if (SPELLS[ev.key].aoe) aoeTick(ev.key, ev.i, c.target); else periodicTick(ev.key, c.snap, ev.i, c.target);
      if (!S.over && S.channel === c && ev.i === table[ev.key].ticks - 1) { if (c.eurekaHeld) eurekaRelease(); S.channel = null; }
      else if (!S.over && S.channel === c && SPELLS[ev.key].selfDamage && S.health <= selfTick(ev.key)) {   // the next tick would kill you
        if (c.eurekaHeld) eurekaRelease();
        S.channel = null;
        emit({ type: 'interrupt', key: ev.key, reason: 'health', channel: true });
        S.decideSeq = order++;
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
    } else if (ev.type === 'eurekaEnd') {
      if (ev.pop === S.cds.racial && eurekaUp()) { S.eurekaCharges = 0; S.eurekaPending = 0; emit({ type: 'expire', name: 'eureka' }); }
    }
  }

  // Moves the clock to `now` (seconds since the last reset), letting everything due happen in order.
  // A remembered press goes off at the exact moment you are free, not at the next picture, so no time is lost.
  // When your next action and the pet's next decision fall on the same instant, the engine takes them in the order
  // they were planned. S.decideSeq marks the place in that line your next action has (set when your last one began).
  function update(now, ctx) {
    if (ctx) lastCtx = ctx;
    syncPet(ctx);
    while (!S.over) {
      const first = events[0];
      const queueAt = queued ? readyAt() : Infinity;
      const limit = Math.min(now, queueAt);
      const due = !!first && (first.t < limit - EPS || (first.t <= limit + EPS && (first.o < 2 || first.seq < S.decideSeq)));
      if (due) {
        const ev = events.shift();
        if (ev.t > endAt() + EPS) { events.unshift(ev); break; }
        advance(ev.t);
        handle(ev);
      } else if (queueAt <= now + EPS) {
        const q = queued;
        queued = null;
        advance(queueAt);
        tryCast(q.key, ctx);
      } else break;
    }
    if (!S.over && timed && now >= endAt() - EPS) { advance(endAt()); timeUp(); return; }
    advance(check ? Math.min(now, linear) : now);
    if (!S.over && ((ctx && ctx.moving) || forcedMove()) && (S.cast || S.channel)) interrupt('moving');
  }

  // ---------- what the sim would cast next (a hint for practice; no part of the fight's rules) ----------
  // The build's priority list is asked the way the engine asks it, about the fight as it will stand at the moment
  // you are free again (a spell you are still casting counts as landed). The engine's boss is the lowest-numbered
  // dummy still standing, its extra targets the others in order. Two things the engine does are left out: near the
  // end of a fight it works out whether a DoT still pays for itself (here its older rule: two ticks must fit), and it
  // times cooldowns around Bane of Doom's explosion.
  // remaining: seconds the fight still lasts (Infinity when nobody knows).
  // Returns null when the list has nothing to cast, else { key, target, action (its line in the list, or null),
  // racial (true = the sim would use the race's cooldown first) }.
  function simWould(remaining) {
    if (S.over) return null;
    const standing = [];
    for (let i = 1; i <= N; i++) if (!T[i].dead) standing.push(i);
    if (!standing.length) return null;
    const boss = standing[0], c = S.cast, at = Math.max(S.t, readyAt());
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
    if (wantsHavoc && !havoc && mana >= table.baneOfHavoc.cost) return { key: 'baneOfHavoc', target: standing[1], action: null, racial: false };

    const view = {
      t: at, remaining: remaining == null ? Infinity : remaining, cfg: cfg, build: build,
      mana: mana, maxMana: stats.maxMana, shards: shards, cds: S.cds, buffs: buffs,
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
      petMana: function () { return P ? Math.min(P.maxMana, P.mana + P.c.manaRegen * (S.t - P.lastRegen)) : Infinity; }
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
    let found = null;
    for (let i = 0; i < list.length && !found; i++) {
      const a = WL.ACTIONS[list[i]];
      if (!a) continue;
      view.nextTarget = 0; view.actionIndex = i;
      const k = a.pick(view);
      if (k === 'lifeTap' && !canTap()) continue;          // a Life Tap the list would like but has no health for
      if (k && table[k] && fits(k) && affordable(k)) found = { key: k, target: standing[(view.nextTarget || 1) - 1] || boss, action: list[i], racial: false };
    }
    const tap = { key: 'lifeTap', target: boss, action: found ? found.action : null, racial: false };
    if (!found) return made && cfg.fight.lifeTapWhileMoving && mana < stats.maxMana - EPS && canTap() ? tap : null;
    if (found.key === 'lifeTap') return found;
    if (mana < effectiveCost(found.key) - 1e-6) return stats.maxMana < effectiveCost(found.key) || !canTap() ? null : tap;   // no health for the tap: it waits for a heal
    const open = list.indexOf('bane') < 0 || leftOn(boss, 'baneOfDoom') > 0 || leftOn(boss, 'baneOfAgony') > 0;
    found.racial = !!racialOf('cooldown') && view.ready('racial') && SPELLS[found.key].kind !== 'utility' && open;
    return found;
  }

  reset(opts.seed);

  return {
    simWould: simWould,
    // You take one hit now (a scripted fight's own hits; the same rule as config.fight.hitEvery).
    hit: function () { if (!S.over && S.fightStart !== null) takeHit(); },
    stats: stats, table: table, spells: SPELLS, build: build, raceKey: raceKey, targetCount: N,
    get state() { return S; },
    get result() { return res; },
    get queuedKey() { return queued ? queued.key : null; },
    get pet() { return P; },
    get current() { return T[S.target]; },
    petMana: function () { return P ? Math.min(P.maxMana, P.mana + P.c.manaRegen * (S.t - P.lastRegen)) : 0; },
    petCommand: petCommand, setTarget: setTarget,
    press: press, update: update, reset: reset, blocked: blocked, readyAt: readyAt,
    eventTimes: function () { return events.map(function (ev) { return ev.t; }); },   // for the check script
    cancel: function () { if (!S.over) interrupt('cancelled'); queued = null; },
    castTime: castTime, gcd: gcd, cost: effectiveCost, buff: buff, debuff: debuff, dotLeft: dotLeft, ready: ready,
    alive: alive, havocOn: havocOn, eurekaUp: eurekaUp, executePhase: executePhase,
    timed: timed, duration: linear,
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
    timeLeft: function () { return timed ? (S.fightStart === null ? linear : Math.max(0, endAt() - S.t)) : null; },
    racial: function () { return racialOf('cooldown'); },
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
  lifeTapPet: ['lifeTap'], lifeTapBelow: ['lifeTap'],
  wrack: ['wrack'], wrackDots: ['wrack'], incinerate: ['incinerate'], drainLife: ['drainLife'],
  hellfire: ['hellfire'], rainOfFire: ['rainOfFire']
};
const NOT_ON_BAR = { drainSoul: true };    // Drain Soul is not used

// Every spell has its own key, the same in every build (Xn, 2026-10-05). The slots are, in order:
// 1 2 3 4 5 6 7 8 R F T G C V B. A spell that has no place of its own in a build takes the place of the one it stands
// in for: Incinerate and Wrack for Shadow Bolt, Conflagrate for Searing Pain, and so on.
const HOME = {
  curseOfElements: [0], searingPain: [1], shadowBolt: [2], immolate: [3], corruption: [4], baneOfAgony: [5], baneOfDoom: [6],
  deathCoil: [7], lifeTap: [8], soulFire: [9], drainLife: [10], racial: [11],
  baneOfHavoc: [12], rainOfFire: [13], hellfire: [14],
  incinerate: [2], wrack: [2, 10], conflagrate: [1], shadowburn: [9, 7], siphonLife: [6, 7]
};

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
  build.rotation.forEach(function (action) { (ACTION_SPELLS[action] || []).forEach(want); });
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
