// Keeps a record of the fight for the review's timeline: what you cast and when, how long each DoT was on each
// dummy, and when you were made to move. It only listens; the rules are in combat.js.
// Casts are kept by the casting rules' own clock and turned into seconds of the fight when the review asks: a
// precast (a cast bar started before the fight, which begins when it lands) so comes out before second 0.

const WATCH_DEBUFFS = ['coe'];

export function createRecorder() {
  let casts = [], auras = {}, open = {}, moves = [], moveOpen = null, last = 0, start = null;

  function reset() { casts = []; auras = {}; open = {}; moves = []; moveOpen = null; last = 0; start = null; }

  // An event from the casting rules.
  function event(e, combat) {
    const at = combat.state.t, latest = casts.length ? casts[casts.length - 1] : null;
    if (e.type === 'cast') {
      casts.push({ at: at, key: e.key, target: e.target || 0, len: e.channel || e.castTime || 0,
                   kind: e.channel ? 'channel' : e.castTime > 0 ? 'cast' : 'instant', gcd: combat.gcd() });
    } else if (e.type === 'interrupt' && latest && latest.key === e.key && latest.kind !== 'instant' && !latest.stopped && at < latest.at + latest.len - 0.02) {
      latest.stopped = e.reason || 'stopped';
      latest.len = Math.max(0, at - latest.at);
    } else if (e.type === 'pushback' && latest && latest.key === e.key) {
      latest.len = Math.max(0, latest.len + (e.channel ? -e.lost : e.lost));
      latest.pushed = (latest.pushed || 0) + e.lost;
    } else if (e.type === 'used' && combat.racial() && e.name === combat.racial().name) {
      casts.push({ at: at, key: 'racial', name: e.name, target: 0, len: 0, kind: 'instant', off: true });
    } else if (e.type === 'apply' && e.key === 'baneOfHavoc') {
      casts.push({ at: at, key: 'baneOfHavoc', target: e.target || 0, len: 0, kind: 'instant', off: true });
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
    start = S.fightStart;
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

  // What the review draws: everything closed off at the moment you ask. Casts get `t`, their second of the fight
  // (below 0 for a precast). What you did before the fight and that did not lead into it is left out: a Life Tap
  // while waiting, a cast you stopped.
  function data() {
    const out = {};
    Object.keys(auras).forEach(function (id) { out[id] = auras[id].slice(); });
    Object.keys(open).forEach(function (id) { (out[id] || (out[id] = [])).push([open[id], last]); });
    const shown = start === null ? [] : casts.filter(function (c) { return c.at >= start - 1e-6 || (!c.stopped && c.kind === 'cast' && c.at + c.len >= start - 0.05); })
      .map(function (c) { return Object.assign({}, c, { t: c.at - start }); });
    return { casts: shown, auras: out, moves: moveOpen != null ? moves.concat([[moveOpen, last]]) : moves.slice(), seconds: last };
  }

  reset();
  return { reset: reset, event: event, sample: sample, data: data };
}
