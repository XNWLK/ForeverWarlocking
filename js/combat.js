// Casting in real time: you press, this file applies the rules.
//
// Every rule here is carried over from the fight engine in vendor/warlock-sim/engine/sim.js (the single source of
// truth) - same formulas, same order of the random rolls - so a fight played here can be replayed through that engine
// and gives the same damage (tools/check-combat.mjs does exactly that). What is different is only who decides: there
// the priority list, here the player.
//
// No drawing and no page access in this file, so it also runs in Node for the check.
//
// Not carried over (all off in the default settings, or for later steps): a second and third target, Bane of Havoc,
// potions and runes, explosives, Power Infusion, Mana Tide, Innervate, damage taken (pushback).
//
// Pets follow the engine's pet rules. What is added here is only when they attack: in the engine the pet attacks from
// the first second to the last; here it attacks while it is told to and stands in range of the target.

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
  immolate: 'Requires Immolate on the target',
  noRacial: 'Your race has nothing to use'
};

// opts: WL, build, raceKey, config, dummyHealth, seed (optional), onEvent (optional), petMeleeRange (yards),
//       linearDuration (check mode: the target's health falls with time over this many seconds and it never dies).
export function createCombat(opts) {
  const WL = opts.WL, cfg = opts.config, build = opts.build, raceKey = opts.raceKey;
  const stats = WL.computeStats(build, raceKey, cfg);
  const table = WL.buildSpellTable(build, stats, cfg);
  const SPELLS = WL.spellsFor(cfg);
  const race = WL.RACES[raceKey], cb = cfg.combat, isSB = WL.isShadowBolt;
  const emit = opts.onEvent || function () {};
  const linear = opts.linearDuration || 0;
  const JOW = cfg.debuffs && cfg.debuffs.judgementOfWisdom && cfg.debuffs.judgementOfWisdom.on ? cfg.debuffs.judgementOfWisdom.jow : null;
  const coeFromOthers = !!(cfg.debuffs && cfg.debuffs.coeOther && cfg.debuffs.coeOther.on);
  const armorRed = WL.armorReduction(cfg);
  const petMeleeRange = opts.petMeleeRange || 5;

  const tvCache = {};
  function tv(key, field) {
    const id = key + '/' + (field || '');
    if (tvCache[id] === undefined) tvCache[id] = WL.talentValue(build, key, field);
    return tvCache[id];
  }
  function racialOf(effect) { return race.racials.filter(function (r) { return r.effect === effect; })[0] || null; }

  let S, R, P, res, events, order, inst, queued, maxHealth = opts.dummyHealth || 10000;

  function reset(seed) {
    const seed0 = seed != null ? seed : (opts.seed != null ? opts.seed : Math.floor(Math.random() * 4294967296));
    // One random stream per kind of roll, with the engine's own constants.
    R = { hit: WL.makeRng(seed0 ^ 0x1B873593), crit: WL.makeRng(seed0 ^ 0x85EBCA6B), proc: WL.makeRng(seed0 ^ 0xC2B2AE35),
          vuln: WL.makeRng(seed0 ^ 0x27D4EB2F), jow: WL.makeRng(seed0 ^ 0x3C6EF372), isb: WL.makeRng(seed0 ^ 0x9E3779B9),
          pet: WL.makeRng(seed0 ^ 0x165667B1) };
    S = {
      seed: seed0, t: 0, mana: stats.maxMana, shards: cfg.fight.startingShards,
      gcdStart: 0, gcdReady: 0, cast: null, channel: null,
      cds: {}, dots: {}, buffs: {}, eurekaCharges: 0, eurekaPending: 0, brandCharges: 0, petSent: false,
      health: maxHealth, maxHealth: maxHealth, targetHpPct: 100,
      fightStart: null, fightEnd: null, over: false, presses: []
    };
    if (coeFromOthers) S.buffs.coe = Infinity;
    res = { total: 0, bySpell: {} };
    events = []; order = 0; inst = 0; queued = null; resCache = {};
    P = makePet(build.pet);
    S.decideSeq = order++;
  }

  // ---------- small helpers (same meaning as in the engine) ----------
  function row(key) { return res.bySpell[key] || (res.bySpell[key] = { casts: 0, landed: 0, misses: 0, hits: 0, crits: 0, ticks: 0, tickCrits: 0, dmg: 0 }); }
  function ready(key) { return !S.cds[key] || S.cds[key] <= S.t + EPS; }
  function buff(name) { return S.buffs[name] != null && S.buffs[name] > S.t + EPS; }
  function dotLeft(key) { const d = S.dots[key]; return d && d.expires > S.t + EPS ? d.expires - S.t : 0; }
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
  function executePhase() { return S.targetHpPct < cfg.fight.executePct; }

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
  function liveMult(key, periodic) {
    const s = SPELLS[key];
    let m = eurekaMult(key, periodic);
    if (buff('coe')) m *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    if (s.school === 'shadow' && buff('isb')) m *= 1 + tv('improvedShadowBolt', 'debuffPct') / 100;
    if (s.school === 'shadow' && buff('snfShadow')) m *= 1 + tv('shadowAndFlame', 'schoolPct') / 100;
    if (s.school === 'fire' && buff('snfFire')) m *= 1 + tv('shadowAndFlame', 'schoolPct') / 100;
    if (periodic && S.channel && S.channel.key === 'wrack' && SPELLS.wrack.debuffSpells.indexOf(key) >= 0) m *= 1 + SPELLS.wrack.debuffPct / 100;
    if (s.drain && tv('soulSiphon')) {
      let n = 0;
      WL.SOUL_SIPHON_EFFECTS.forEach(function (e) { if (e === 'curseOfElements' ? buff('coe') : dotLeft(e) > 0) n++; });
      m *= 1 + Math.min(n * tv('soulSiphon', 'perEffectPct'), tv('soulSiphon', 'maxPct')) / 100;
    }
    return m;
  }
  // Your spell power right now (Blood Fury counts while it is up). Ticks read it when they land: DoTs are dynamic.
  function spNow(e) { return e.sp * (buff('bloodFury') ? 1 + racialOf('cooldown').spPct / 100 : 1); }

  let resCache = {};
  function vulnMult(school) {    // partial resists and Spell Pierce
    const coe = buff('coe'), id = school + (coe ? '1' : '0');
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

  function deal(key, amount, crit, isTick, extra) {
    const r = row(key);
    r.dmg += amount; res.total += amount;
    if (isTick) { r.ticks++; if (crit) r.tickCrits++; } else { r.hits++; if (crit) r.crits++; }
    if (!linear) {
      S.health = Math.max(0, S.health - amount);
      S.targetHpPct = 100 * S.health / S.maxHealth;
    }
    emit(Object.assign({ type: isTick ? 'tick' : 'hit', key: key, amount: amount, crit: crit, school: SPELLS[key] ? SPELLS[key].school : 'shadow' }, extra));
    if (!linear && S.health <= 0) die();
  }

  function die() {
    S.over = true; S.fightEnd = S.t;
    if (P) { P.active = false; P.gen++; P.casting = null; }
    S.cast = null; S.channel = null; S.dots = {}; events.length = 0; queued = null;
    S.eurekaPending = 0;
    const seconds = Math.max(S.fightEnd - S.fightStart, 0);
    emit({ type: 'death', seconds: seconds, total: res.total, dps: seconds > 0 ? res.total / seconds : 0 });
  }

  function jowProc(pet) {
    if (!JOW || R.jow() * 100 >= JOW.chancePct) return;
    if (pet) { if (!P) return; petRegen(); P.mana = Math.min(P.maxMana, P.mana + JOW.mana); return; }
    const before = S.mana;
    S.mana = Math.min(stats.maxMana, S.mana + JOW.mana);
    emit({ type: 'mana', source: 'Judgement of Wisdom', amount: S.mana - before });
  }
  function touchOfTheGrave() {
    const tog = racialOf('proc');
    if (tog && R.proc() * 100 < tog.chancePct) {
      const amount = stats.maxHealth * tog.maxHealthPct / 100;
      row('touchOfTheGrave').casts++;
      deal('touchOfTheGrave', amount, false, false);
    }
  }

  function applyDot(key, snap) {
    const s = SPELLS[key], e = table[key], id = ++inst;
    if (s.bane) { delete S.dots.baneOfAgony; delete S.dots.baneOfDoom; }     // one Bane per target
    S.dots[key] = { inst: id, applied: S.t, expires: S.t + s.duration, ticks: e.ticks, snap: snap };
    for (let i = 1; i <= e.ticks; i++) push({ t: S.t + i * s.tickEvery, o: 0, type: 'dotTick', key: key, inst: id, i: i - 1 });
  }

  function periodicTick(key, snap, i) {
    const s = SPELLS[key], e = table[key];
    let amount = (s.tickBase * (snap.baseMult || 1) + s.tickCoef * spNow(e)) * e.periodicMult * liveMult(key, true);
    if (s.ramp) amount *= s.ramp[i];
    amount *= vulnMult(s.school);
    const crit = R.crit() * 100 < e.critPct;
    if (crit) amount *= e.critMult;
    deal(key, amount, crit, true);
    if (S.over) return;
    if (WL.NIGHTFALL_SPELLS.indexOf(key) >= 0 && tv('nightfall') && R.proc() * 100 < tv('nightfall', 'procPct')) {
      S.buffs.shadowTrance = S.t + 10;
      emit({ type: 'proc', name: 'shadowTrance' });
    }
  }

  // A finished or instant cast arrives at the target. Returns true when it hit.
  function land(key, baseMult) {
    const s = SPELLS[key], e = table[key], r = row(key);
    if (R.hit() * 100 >= stats.hitPct) { r.misses++; emit({ type: 'miss', key: key }); return false; }
    r.landed++;
    if (s.kind === 'utility') {
      if (key === 'curseOfElements') { S.buffs.coe = S.t + s.duration; emit({ type: 'apply', key: key }); }
      jowProc();
      return true;
    }
    if (s.kind === 'dot') {
      applyDot(key, { baseMult: baseMult || 1 });
      emit({ type: 'apply', key: key });
      touchOfTheGrave();
      if (!S.over) jowProc();
      return true;
    }
    let amount = (s.base + s.coef * spNow(e)) * e.directMult * liveMult(key, false);
    if (key === 'incinerate' && dotLeft('immolate') > 0) amount *= 1 + s.immolateBonusPct / 100;
    if ((isSB(key) || key === 'searingPain') && executePhase() && tv('decimation')) {
      amount *= addOp0(key, tv('decimation', 'dmgPct'));
      if (!buff('decimation')) emit({ type: 'proc', name: 'decimation' });
      S.buffs.decimation = S.t + 10;
    }
    amount *= vulnMult(s.school);
    const crit = R.crit() * 100 < e.critPct;
    if (crit) amount *= e.critMult;
    deal(key, amount, crit, false);
    // The rolls below are made even when this hit killed the target, so the random streams stay in step with the engine.
    if (isSB(key) && crit && tv('improvedShadowBolt')) {
      if (R.isb() * 100 < stats.hitPct) { S.buffs.isb = S.t + 12; emit({ type: 'apply', key: 'isb' }); }
    }
    if (key === 'searingPain' && tv('demonicBrand') && P) {            // Demonic Brand: the pet's next attacks add damage
      if (!(buff('brand') && S.brandCharges > 0)) emit({ type: 'apply', key: 'brand' });
      S.buffs.brand = S.t + cfg.demonicBrand.duration;
      S.brandCharges = tv('demonicBrand', 'charges');
    }
    if (key === 'conflagrate') {
      if (tv('shadowAndFlame')) S.buffs.snfShadow = S.t + 20;
      if (!(tv('shadowAndFlame') && R.proc() * 100 < tv('shadowAndFlame', 'procPct'))) { delete S.dots.immolate; emit({ type: 'consume', key: 'immolate' }); }
    }
    if (key === 'shadowburn' && tv('shadowAndFlame')) {
      S.buffs.snfFire = S.t + 20;
      if (R.proc() * 100 < tv('shadowAndFlame', 'procPct')) { S.shards++; emit({ type: 'refund', key: 'soulShard' }); }
    }
    if (S.over) return true;
    if (s.kind === 'hybrid') applyDot(key, { baseMult: baseMult || 1 });
    touchOfTheGrave();
    if (!S.over) jowProc();
    return true;
  }

  // ---------- the pet ----------
  // Its spell power is a share of yours plus Demonic Knowledge; it uses your hit chance and your crit chance.
  function makePet(key) {
    if (!key || !cfg.options.includePetDamage) return null;
    const pc = cfg.pets[key], maxMana = pc.mana * (1 + tv('felVitality', 'manaPct') / 100);
    return { key: key, c: pc, maxMana: maxMana, mana: maxMana, lastRegen: 0, lashReady: 0, swingReady: 0, gen: 0,
             mode: 'follow', active: false, casting: null,
             range: pc.melee ? petMeleeRange : pc.spell.range };
  }
  function petRegen() { P.mana = Math.min(P.maxMana, P.mana + P.c.manaRegen * (S.t - P.lastRegen)); P.lastRegen = S.t; }
  function petSchool() { return build.pet === 'imp' ? 'fire' : 'shadow'; }
  function petMult(school) {
    let m = (1 + tv('unholyPower', 'petDmgPct') / 100) * stats.mult.all;
    if ((build.pet === 'succubus' && school === 'shadow') || (build.pet === 'imp' && school === 'fire')) m *= 1 + tv('masterDemonologist', 'schoolPct') / 100;
    if (school !== 'physical' && buff('coe')) m *= 1 + SPELLS.curseOfElements.dmgTakenPct / 100;
    return m;
  }
  function warlockSpNow() { return stats.sp * (buff('bloodFury') ? 1 + racialOf('cooldown').spPct / 100 : 1); }
  function petSp() { return warlockSpNow() * (cfg.petSpPct != null ? cfg.petSpPct : 100) / 100 + (stats.dkSp || 0); }

  function petSpellHit(sp) {
    const key = 'pet:' + sp.key, r = row(key);
    P.casting = null;
    r.casts++;
    if (R.pet() * 100 >= stats.hitPct) { r.misses++; emit({ type: 'miss', key: key, pet: true }); return; }
    r.landed++;
    jowProc(true);
    const base = sp.base * (sp.key === 'lashOfPain' ? 1 + tv('improvedSayaad', 'lashPct') / 100 : 1);
    let amount = (base + sp.coef * petSp()) * petMult(sp.school);
    if (sp.key === 'firebolt') amount *= 1 + tv('improvedImp', 'firebolt') / 100;
    const crit = R.pet() * 100 < stats.critPct;
    if (crit) amount *= cb.critMultiplier;
    deal(key, amount, crit, false, { pet: true, school: sp.school });
    if (!S.over) brandProc();
  }
  // Demonic Brand: a pet attack that lands on a branded target uses a charge and adds damage (cannot miss or crit).
  function brandProc() {
    if (!buff('brand') || !(S.brandCharges > 0)) return;
    S.brandCharges--;
    const db = cfg.demonicBrand, school = petSchool();
    const amount = ((db.baseMin + db.baseMax) / 2 + db.shadowSpCoef * (warlockSpNow() + (stats.schoolSp.shadow || 0))) * petMult(school);
    row('pet:brand').casts++;
    deal('pet:brand', amount, false, false, { pet: true, school: school });
  }
  function petEvent(t, o, type) { push({ t: t, o: o, type: type, gen: P.gen }); }
  function petAct() {                       // its spell: Firebolt again and again, Lash of Pain whenever it is ready
    if (!P.c.spell || (linear && S.t >= linear - EPS)) return;
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
      petSpellHit(sp);
      if (!S.over) petEvent(P.lashReady || S.t + 1.5, 2, 'petAct');
    }
  }
  function petSwing() {                     // the Succubus's melee: one roll decides miss, dodge, glancing, crit or hit
    if (linear && S.t >= linear - EPS) return;
    const m = P.c.melee, r = row('pet:melee'), tb = cb.petMelee;
    r.casts++;
    const hitBonus = Math.max(0, stats.hitPct - cb.baseHitPct - tb.hitSuppressionPct);
    const miss = Math.max(0, tb.missPct - hitBonus), roll = R.pet() * 100;
    const critChance = Math.max(0, m.critPct + (m.inheritMeleeCrit ? stats.meleeCritPct : 0) - tb.critSuppressionPct);
    P.swingReady = S.t + m.swing;
    if (roll >= miss + tb.dodgePct) {
      r.landed++;
      jowProc(true);
      const dps = m.baseDps + m.apPerSp * warlockSpNow() / m.apPerDps;
      let amount = dps * m.swing * (1 - armorRed) * petMult('physical');
      const glance = roll < miss + tb.dodgePct + tb.glancePct;
      const crit = !glance && roll < miss + tb.dodgePct + tb.glancePct + critChance;
      if (glance) amount *= tb.glanceDmgPct / 100;
      if (crit) amount *= 2;
      deal('pet:melee', amount, crit, false, { pet: true, school: 'physical', glance: glance });
      if (!S.over) brandProc();
    } else {
      r.misses++;
      emit({ type: 'miss', key: 'pet:melee', pet: true, dodge: roll >= miss });
    }
    if (!S.over) petEvent(S.t + m.swing, 0, 'petSwing');
  }
  // The pet attacks while it is told to and stands in range. ctx.petDistance = its distance to the target in yards.
  function syncPet(ctx) {
    if (!P || S.over) return;
    const distance = ctx && ctx.petDistance != null ? ctx.petDistance : 0;
    const wanted = P.mode === 'attack' && distance <= P.range + EPS;
    if (wanted === P.active) return;
    P.active = wanted;
    P.gen++;                                // whatever it had planned is dropped
    P.casting = null;
    if (!wanted) return;
    if (S.fightStart === null) S.fightStart = S.t;
    if (P.c.melee) petEvent(Math.max(S.t, P.swingReady), 0, 'petSwing');
    if (P.c.spell) petEvent(S.t, 2, 'petAct');
  }
  function petCommand(mode) {
    if (!P || S.over) return false;
    P.mode = mode;
    emit({ type: 'petMode', mode: mode });
    return true;
  }

  // ---------- casting ----------
  // What a cast costs you is taken when it goes off: at once for instants and channels, at the end of a cast bar.
  // A cast bar's price is fixed when the cast starts (as in the engine) and paid at its end.
  function commit(key, startedWithDecimation, price) {
    const s = SPELLS[key];
    S.mana -= price != null ? price : effectiveCost(key);
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
    row(key).casts++;
    return { eurekaUsed: eurekaUsed, baseMult: baseMult };
  }

  function startCast(key) {
    const s = SPELLS[key], e = table[key];
    const castT = castTime(key), gcdT = gcd();
    const trance = isSB(key) && buff('shadowTrance');
    if (key !== 'lifeTap') {
      if (S.fightStart === null) S.fightStart = S.t;
      if (!S.petSent) { S.petSent = true; if (P && P.mode !== 'attack') petCommand('attack'); }   // the pet joins in by itself
    }
    S.presses.push({ t: S.t, k: key });
    S.gcdStart = S.t; S.gcdReady = S.t + gcdT;
    emit({ type: 'cast', key: key, castTime: castT, channel: s.kind === 'channel' ? s.duration : 0 });

    if (key === 'lifeTap') {
      const gain = (SPELLS.lifeTap.manaBase + stats.spi) * (1 + tv('improvedLifeTap', 'manaPct') / 100);
      const before = S.mana;
      S.mana = Math.min(stats.maxMana, S.mana + gain);
      row('lifeTap').casts++;
      emit({ type: 'mana', source: 'Life Tap', amount: S.mana - before });
      if (P && tv('demonicEnergies')) {     // Demonic Energies: the pet gains a share of the mana you gained
        petRegen();
        P.mana = Math.min(P.maxMana, P.mana + (S.mana - before) * tv('demonicEnergies', 'tapPct') / 100);
      }
      S.decideSeq = order++;
      return;
    }

    if (s.kind === 'channel') {
      const spent = commit(key), r = row(key);
      if (e.cd) S.cds[key] = S.t + e.cd;
      if (R.hit() * 100 >= stats.hitPct) {
        if (spent.eurekaUsed) eurekaRelease();
        r.misses++; emit({ type: 'miss', key: key });
        return;
      }
      r.landed++;
      touchOfTheGrave();
      if (S.over) return;
      jowProc();
      const id = ++inst;
      S.channel = { key: key, inst: id, snap: { baseMult: 1 }, start: S.t, end: S.t + s.duration, eurekaHeld: spent.eurekaUsed };
      for (let i = 1; i <= e.ticks; i++) push({ t: S.t + i * s.tickEvery, o: 0, type: 'chanTick', key: key, inst: id, i: i - 1 });
    } else if (castT > EPS) {
      const id = ++inst;
      if (e.cd) S.cds[key] = S.t + e.cd;                 // as in the engine: the cooldown runs from the start of the cast
      S.cast = { key: key, inst: id, start: S.t, end: S.t + castT, cost: effectiveCost(key), decimation: key === 'soulFire' && buff('decimation') };
      push({ t: S.t + castT, o: 1, type: 'castEnd', inst: id });
    } else {
      if (trance) delete S.buffs.shadowTrance;
      if (e.cd) S.cds[key] = S.t + e.cd;
      const spent = commit(key);
      land(key, spent.baseMult);
      if (spent.eurekaUsed) eurekaRelease();
    }
    S.decideSeq = order++;
  }

  // Stops a cast bar or a channel (you moved, pressed Escape, or cast something else over a channel).
  function interrupt(reason) {
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

  function fail(key, reason) {
    emit({ type: 'fail', key: key, reason: reason, text: FAIL_TEXT[reason] });
    return { ok: false, reason: reason };
  }

  // Why this spell cannot be cast right now (null = it can). ctx: { distance, moving }.
  function blocked(key, ctx) {
    const s = SPELLS[key], e = table[key];
    if (!e) return 'unknown';
    if (!ready(key)) return 'cooldown';
    if (key === 'conflagrate' && !(dotLeft('immolate') > 0)) return 'immolate';
    if (s.shards && !(key === 'soulFire' && buff('decimation')) && S.shards < s.shards) return 'shards';
    if (S.mana < effectiveCost(key) - 1e-6) return 'mana';
    if (ctx && e.range > 0 && ctx.distance > e.range + EPS) return 'range';
    if (ctx && ctx.moving && (s.kind === 'channel' || castTime(key) > EPS)) return 'moving';
    return null;
  }

  function readyAt() { return Math.max(S.cast ? S.cast.end : S.t, S.gcdReady); }

  function tryCast(key, ctx) {
    const why = blocked(key, ctx);
    if (why) return fail(key, why);
    if (S.channel) interrupt('clipped');
    startCast(key);
    return { ok: true };
  }

  function press(key, ctx) {
    if (S.over) return fail(key, 'dead');
    if (key === 'racial') return useRacial();
    if (!table[key]) return fail(key, 'unknown');
    const free = readyAt();
    if (free > S.t + EPS) {
      if (free - S.t <= QUEUE_WINDOW) { queued = { key: key }; return { ok: true, queued: true }; }
      return fail(key, 'busy');
    }
    return tryCast(key, ctx);
  }

  // ---------- time ----------
  function advance(to) {
    if (to <= S.t) return;
    // While a cast bar runs its price is already spoken for, so mana you regain is not lost at a full bar.
    if (stats.mp5) S.mana = Math.min(manaCap(), S.mana + stats.mp5 / 5 * (to - S.t));
    S.t = to;
    if (linear) S.targetHpPct = 100 * (1 - S.t / linear);
  }

  function handle(ev) {
    if (ev.type === 'castEnd') {
      const c = S.cast;
      if (!c || c.inst !== ev.inst) return;
      S.cast = null;
      const spent = commit(c.key, c.decimation, c.cost);
      land(c.key, spent.baseMult);
      if (spent.eurekaUsed) eurekaRelease();
    } else if (ev.type === 'dotTick') {
      const d = S.dots[ev.key];
      if (!d || d.inst !== ev.inst) return;              // refreshed or consumed
      periodicTick(ev.key, d.snap, ev.i);
      if (!S.over && ev.i === d.ticks - 1) delete S.dots[ev.key];
    } else if (ev.type === 'chanTick') {
      const c = S.channel;
      if (!c || c.inst !== ev.inst) return;              // stopped
      periodicTick(ev.key, c.snap, ev.i);
      if (!S.over && ev.i === table[ev.key].ticks - 1) { if (c.eurekaHeld) eurekaRelease(); S.channel = null; }
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
    syncPet(ctx);
    while (!S.over) {
      const first = events[0];
      const queueAt = queued ? readyAt() : Infinity;
      const limit = Math.min(now, queueAt);
      const due = !!first && (first.t < limit - EPS || (first.t <= limit + EPS && (first.o < 2 || first.seq < S.decideSeq)));
      if (due) {
        const ev = events.shift();
        if (linear && ev.t > linear + EPS) { events.length = 0; break; }
        advance(ev.t);
        handle(ev);
      } else if (queueAt <= now + EPS) {
        const q = queued;
        queued = null;
        advance(queueAt);
        tryCast(q.key, ctx);
      } else break;
    }
    advance(now);
    if (!S.over && ctx && ctx.moving && (S.cast || S.channel)) interrupt('moving');
  }

  reset(opts.seed);

  return {
    stats: stats, table: table, spells: SPELLS, build: build, raceKey: raceKey,
    get state() { return S; },
    get result() { return res; },
    get queuedKey() { return queued ? queued.key : null; },
    get pet() { return P; },
    petMana: function () { return P ? Math.min(P.maxMana, P.mana + P.c.manaRegen * (S.t - P.lastRegen)) : 0; },
    petCommand: petCommand,
    press: press, update: update, reset: reset, blocked: blocked, readyAt: readyAt,
    eventTimes: function () { return events.map(function (ev) { return ev.t; }); },   // for the check script
    cancel: function () { if (!S.over) interrupt('cancelled'); queued = null; },
    castTime: castTime, gcd: gcd, cost: effectiveCost, buff: buff, dotLeft: dotLeft, ready: ready,
    eurekaUp: eurekaUp, executePhase: executePhase,
    racial: function () { return racialOf('cooldown'); },
    setMaxHealth: function (value) { maxHealth = value; },
    fightSeconds: function () { return S.fightStart === null ? 0 : (S.fightEnd !== null ? S.fightEnd : S.t) - S.fightStart; }
  };
}

// The spells on the action bar, left to right in the order of the build's priority list; then Life Tap, the race's
// cooldown, and whatever else the build can cast.
const ACTION_SPELLS = {
  deathCoilFinisher: ['deathCoil'], deathCoil: ['deathCoil'],
  bane: ['baneOfDoom', 'baneOfAgony'], baneOfAgony: ['baneOfAgony'],
  curseOfElements: ['curseOfElements'],
  searingPainBrand: ['searingPain'], searingPainExecute: ['searingPain'], searingPainDecimation: ['searingPain'], searingPain: ['searingPain'],
  immolate: ['immolate'], corruption: ['corruption'], siphonLife: ['siphonLife'],
  conflagrate: ['conflagrate'], conflagrateExpire: ['conflagrate'], conflagrateSnF: ['conflagrate'],
  shadowburn: ['shadowburn'], shadowburnSnF: ['shadowburn'],
  soulFire: ['soulFire'], soulFireShards: ['soulFire'],
  shadowTrance: ['shadowBolt'], isbUpkeep: ['shadowBolt'], shadowBoltSpread: ['shadowBolt'], shadowBolt: ['shadowBolt'],
  lifeTapPet: ['lifeTap'],
  wrack: ['wrack'], incinerate: ['incinerate'], drainLife: ['drainLife']
};
const NOT_ON_BAR = { drainSoul: true, baneOfHavoc: true };    // Drain Soul is not used; Bane of Havoc needs a second target

export function actionBarFor(build, table, race, slots) {
  const bar = [];
  function add(key) { if (bar.indexOf(key) < 0 && (key === 'racial' || table[key])) bar.push(key); }
  build.rotation.forEach(function (action) { (ACTION_SPELLS[action] || []).forEach(add); });
  add('lifeTap');
  if (race.racials.some(function (r) { return r.effect === 'cooldown'; })) add('racial');
  Object.keys(table).forEach(function (key) { if (!NOT_ON_BAR[key]) add(key); });
  return bar.slice(0, slots);
}
