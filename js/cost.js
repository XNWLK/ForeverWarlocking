// "What it cost you": the review's list of what went wrong in a fight, each as the DPS it took, biggest first.
// Every line is an estimate made from the fight's own record (js/combat.js, res.track) and the sim's averages for
// the same fight. Nothing here changes a fight. Dice (crits, misses, procs) are not in the list.
//
// How a thing is valued:
//   - a second you did not cast: what a second of your casting did in this fight (your own damage over the time you
//     were casting or on the global cooldown);
//   - a second a DoT was down: its ticks per second from the spell table, less the casting it saves (the time not
//     spent recasting it went to something else);
//   - a tick cut off: one tick from the spell table.

function whole(n) { return Math.round(n).toLocaleString('en-US'); }

// d: what the review gets (js/panels.js), plus table (the spell table) and gcd (seconds).
// Returns null when there is nothing to judge yet, else
//   { rows: [{ kind, what, detail, dps }], total, dps, gap (sim's DPS minus yours, or null), rate }
export function costs(d) {
  const res = d.result, k = res.track, sim = d.sim, T = d.seconds, table = d.table || {}, gcd = d.gcd > 0 ? d.gcd : 1.5;
  if (!(T > 1) || !(res.total > 0)) return null;
  const dps = res.total / T, rows = [];
  let petDmg = 0;
  Object.keys(res.bySpell).forEach(function (key) { if (key.replace(/^x\d+:/, '').indexOf('pet:') === 0) petDmg += res.bySpell[key].dmg || 0; });
  const rate = k.busy > 1 ? (res.total - petDmg) / k.busy : 0;          // your own damage per second of casting
  // kind: which sort of mistake it is (the Progress window adds them up by it, js/progress.js).
  function add(kind, what, detail, lost) { if (lost > 0) rows.push({ kind: kind, what: what, detail: detail, dps: lost / T }); }
  function where(i) { return d.targets > 1 ? ' on ' + d.dummyName(i) : ''; }
  function name(key) { return d.spells[key] ? d.spells[key].name : key; }

  // Time without a cast or a global cooldown, beyond what the sim has in the same fight.
  const idle = Math.max(0, T - k.busy), simIdle = sim && sim.seconds > 0 ? sim.idle * T / sim.seconds : 0, extra = idle - simIdle;
  if (extra > 0.3) {
    add('idle', 'Time not casting', idle.toFixed(1) + ' s with no cast and no global cooldown running' + (sim ? '; the sim: ' + simIdle.toFixed(1) + ' s' : '') +
      (k.noMana ? '. ' + (k.noMana === 1 ? 'One press' : k.noMana + ' presses') + ' failed for lack of mana' : ''), extra * rate);
  }

  // Cast bars you stopped yourself: the casting up to that moment was for nothing.
  const stopped = ((d.record && d.record.casts) || []).filter(function (c) { return c.kind === 'cast' && (c.stopped === 'moving' || c.stopped === 'cancelled') && c.t >= 0; });
  const thrown = stopped.reduce(function (sum, c) { return sum + c.len; }, 0);
  if (thrown > 0.3) add('stopped', 'Casts you stopped', (stopped.length === 1 ? 'One cast' : stopped.length + ' casts') + ' stopped by moving or by hand, after ' + thrown.toFixed(1) + ' s of casting in all', thrown * rate);

  // DoTs and Curse of the Elements that were on a dummy for less time than the sim keeps them there.
  for (let i = 1; i <= d.targets; i++) {
    const seen = {};
    Object.keys(k.uptime).forEach(function (id) { if (id.indexOf(i + ':') === 0) seen[id.slice(String(i).length + 1)] = true; });
    if (sim) Object.keys(sim.uptime || {}).forEach(function (id) {
      const m = i === 1 ? /^(?:dot:(.+)|(coe))$/.exec(id) : new RegExp('^(?:dot' + i + ':(.+)|deb' + i + ':(coe))$').exec(id);
      if (m) seen[m[1] || m[2]] = true;
    });
    // The two Banes stand in for each other (Agony where Doom does not pay): they are judged as one, "a Bane".
    if (sim && (seen.baneOfAgony || seen.baneOfDoom) && table.baneOfAgony) {
      const simKey = function (key) { return i === 1 ? 'dot:' + key : 'dot' + i + ':' + key; };
      const simPct = (sim.uptime[simKey('baneOfAgony')] || 0) + (sim.uptime[simKey('baneOfDoom')] || 0);
      const mine = (k.uptime[i + ':baneOfAgony'] || 0) + (k.uptime[i + ':baneOfDoom'] || 0), missing = simPct / 100 * T - mine;
      if (missing >= 1 && simPct - 100 * mine / T >= 2) {
        const span = d.spells.baneOfAgony.duration || 1, perSecond = table.baneOfAgony.tickDmg * table.baneOfAgony.ticks / span;
        add('dots', 'No Bane' + where(i), 'a Bane was on for ' + Math.round(100 * mine / T) + '% of the fight; the sim: ' + Math.round(simPct) + '%', missing * (perSecond - rate * gcd / span));
      }
    }
    Object.keys(seen).forEach(function (key) {
      const curse = key === 'coe';
      if (key === 'baneOfAgony' || key === 'baneOfDoom') return;
      if (!sim || (!curse && !(table[key] && table[key].ticks))) return;
      const simPct = sim.uptime[i === 1 ? (curse ? 'coe' : 'dot:' + key) : (curse ? 'deb' + i + ':coe' : 'dot' + i + ':' + key)];
      if (simPct == null) return;
      const mine = k.uptime[i + ':' + key] || 0, missing = simPct / 100 * T - mine;
      if (missing < 1 || simPct - 100 * mine / T < 2) return;
      const said = 'on for ' + Math.round(100 * mine / T) + '% of the fight; the sim: ' + Math.round(simPct) + '%';
      if (curse) {
        const pct = (d.spells.curseOfElements && d.spells.curseOfElements.dmgTakenPct) || 0;
        add('dots', 'Curse of the Elements down' + where(i), said + '. At least this much: the curse also takes away the dummy\'s resistance', missing * (res.byTarget[i] / T) * pct / 100);
      } else {
        const span = d.spells[key].duration || 1, perSecond = table[key].tickDmg * table[key].ticks / span;
        add('dots', name(key) + ' down' + where(i), said, missing * (perSecond - rate * Math.max(gcd, table[key].cast || 0) / span));
      }
    });
  }

  // DoTs cast again while they still had ticks left.
  const cut = {};
  (k.clips || []).forEach(function (c) {
    if (c.by !== c.key || !(c.ticks > 0)) return;
    const g = cut[c.key] || (cut[c.key] = { times: 0, ticks: 0 });
    g.times++; g.ticks += c.ticks;
  });
  Object.keys(cut).forEach(function (key) {
    const g = cut[key], row = res.bySpell[key], tick = table[key] && table[key].tickDmg ? table[key].tickDmg : row && row.ticks ? row.dmg / row.ticks : 0;
    add('early', name(key) + ' cast again too early', (g.times === 1 ? 'Once' : g.times + ' times') + ', cutting off ' + (g.ticks === 1 ? '1 tick' : g.ticks + ' ticks') + ' that were still to come', g.ticks * tick);
  });

  // Life Taps whose mana was still there at the end: each cost a global cooldown. Only taps beyond the sim's own
  // count (it taps to feed the pet too, and that mana is not what is left over).
  const m = d.mana, simTaps = sim && sim.seconds > 0 ? (sim.lifeTaps || 0) * T / sim.seconds : 0;
  const spare = d.over && m && m.gain > 0 ? Math.min(Math.floor(k.lifeTaps - simTaps), Math.floor(m.end / m.gain)) : 0;
  if (spare >= 1) add('taps', 'Life Taps you did not need', 'You ended with ' + whole(m.end) + ' mana: about ' + (spare === 1 ? 'one tap' : spare + ' taps') + ' too many, a global cooldown each', spare * gcd * rate);

  // The pet standing about.
  if (d.hasPet && k.petActive > 1 && T - k.petActive > 1) {
    add('pet', d.petName + ' not attacking', 'It attacked for ' + Math.round(100 * k.petActive / T) + '% of the fight (it has to reach the dummy first, and stops when its dummy dies or you call it back)',
        (T - k.petActive) * petDmg / k.petActive);
  }

  const floor = Math.max(1, dps * 0.002);
  const kept = rows.filter(function (r) { return r.dps >= floor; }).sort(function (a, b) { return b.dps - a.dps; });
  return { rows: kept, total: kept.reduce(function (sum, r) { return sum + r.dps; }, 0), dps: dps, gap: sim ? sim.dps - dps : null, rate: rate };
}
