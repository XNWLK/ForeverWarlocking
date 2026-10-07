// Keeps a record of the fight for the review's timeline: what you cast and when, how long each DoT was on each
// dummy, and when you were made to move. It only listens; the rules are in combat.js.

const WATCH_DEBUFFS = ['coe'];

export function createRecorder() {
  let damage = [], casts = [], auras = {}, open = {}, moves = [], moveOpen = null, last = 0, clips = [], origin = null, decision = null, manaEnd = null;

  function reset() { damage = []; casts = []; auras = {}; open = {}; moves = []; moveOpen = null; last = 0; clips = []; origin = null; decision = null; manaEnd = null; }

  // An event from the casting rules.
  function event(e, combat) {
    const S = combat.state;
    if (origin === null && e.type === 'cast' && e.key !== 'lifeTap') origin = S.t;
    const nextOrigin = S.fightStart ?? S.pullPlannedAt ?? S.pullAt ?? null;
    if (nextOrigin !== null) {
      // A spell landing early moves the pull to that moment. Keep the actual precast lead-in.
      if (origin !== null && nextOrigin !== origin) casts.forEach(function (c) { c.t += origin - nextOrigin; });
      origin = nextOrigin;
    }
    const t = S.fightStart !== null ? combat.fightSeconds() : origin != null ? S.t - origin : 0;
    if (['hit', 'tick', 'havoc', 'miss'].includes(e.type)) damage.push({ t, key: e.key, type: e.type, amount: e.amount || 0, crit: !!e.crit, target: e.target });
    // Off-GCD events can occur during a cast; they must not hide it from interrupt/pushback tracking.
    const latest = casts.findLast(function (c) { return !c.off; });
    if (e.type === 'decision') { decision = e.plan || null; }
    else if (e.type === 'dotClip') {
      clips.push({ t: t, key: e.key, replacement: e.replacement, target: e.target, left: e.left, ticks: e.ticks });
    } else if (e.type === 'death' && e.last) {
      manaEnd = { current: S.mana, max: combat.stats.maxMana };
    } else if (e.type === 'cast') {
      if (S.fightStart === null && S.pullAt == null && e.key === 'lifeTap') return;
      casts.push({ t: t, key: e.key, target: e.target || 0, len: e.channel || e.castTime || 0,
                   kind: e.channel ? 'channel' : e.castTime > 0 ? 'cast' : 'instant', gcd: combat.gcd(), manaPlan: decision });
      decision = null;
    } else if (e.type === 'mana' && e.source === 'Life Tap' && latest && latest.key === 'lifeTap') {
      latest.manaGained = e.amount;
    } else if (e.type === 'miss' && !e.tick && !e.pet && latest && latest.key === e.key && latest.kind === 'channel' && Math.abs(t - latest.t) < 0.001) {
      latest.len = 0; latest.stopped = 'missed'; // a channel that misses never occupies its full duration
    } else if (e.type === 'interrupt' && latest && latest.key === e.key && latest.kind !== 'instant' && !latest.stopped && t < latest.t + latest.len - 0.02) {
      latest.stopped = e.reason || 'stopped';
      latest.len = Math.max(0, t - latest.t);
    } else if (e.type === 'pushback' && latest && latest.key === e.key) {
      latest.len = Math.max(0, latest.len + (e.channel ? -e.lost : e.lost));
      latest.pushed = (latest.pushed || 0) + e.lost;
    } else if (e.type === 'used' && combat.racial() && e.name === combat.racial().name) {
      casts.push({ t: t, key: 'racial', name: e.name, target: 0, len: 0, kind: 'instant', off: true });
    } else if (e.type === 'apply' && e.key === 'baneOfHavoc') {
      casts.push({ t: t, key: 'baneOfHavoc', target: e.target || 0, len: 0, kind: 'instant', off: true });
    }
  }

  function mark(id, up, t) {
    if (up && open[id] == null) open[id] = t;
    else if (!up && open[id] != null) { (auras[id] || (auras[id] = [])).push([open[id], t]); delete open[id]; }
  }

  // Called every picture while the fight runs. forced: you are being made to move right now.
  function sample(combat, targets, forced) {
    const S = combat.state;
    if (S.fightStart === null) return;
    const t = combat.fightSeconds();
    last = t;
    for (let i = 1; i <= targets; i++) {
      const T = S.targets[i], alive = !T.dead && !S.over;
      for (const key in T.dots) mark(i + ':' + key, alive && combat.dotLeft(key, i) > 0, t);
      for (const id in open) if (id.charAt(0) === String(i) && !WATCH_DEBUFFS.includes(id.slice(2)) && id.slice(2) !== 'baneOfHavoc' && !T.dots[id.slice(2)]) mark(id, false, t);
      WATCH_DEBUFFS.forEach(function (name) { if (T.deb[name] !== Infinity) mark(i + ':' + name, alive && combat.debuff(i, name), t); });
      mark(i + ':baneOfHavoc', alive && combat.havocOn() === i, t);
    }
    if (forced && !S.over && moveOpen == null) moveOpen = t;
    else if ((!forced || S.over) && moveOpen != null) { moves.push([moveOpen, t]); moveOpen = null; }
  }

  // What the review draws: everything closed off at the moment you ask.
  function data() {
    const out = {};
    Object.keys(auras).forEach(function (id) { out[id] = auras[id].slice(); });
    Object.keys(open).forEach(function (id) { (out[id] || (out[id] = [])).push([open[id], last]); });
    return { damage: damage.slice(), casts: casts.slice(), clips: clips.slice(), manaEnd: manaEnd, auras: out, moves: moveOpen != null ? moves.concat([[moveOpen, last]]) : moves.slice(), seconds: last };
  }

  reset();
  return { reset: reset, event: event, sample: sample, data: data };
}
