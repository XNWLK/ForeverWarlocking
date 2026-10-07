// A forecast, not a replacement for the simulator's priority list. Uses averaged future spell spending,
// passive regeneration and mana procs from the sim; a different cast sequence can change the answer.
import { ACTION_SPELLS } from './combat.js';
const estimates = new WeakMap();
function estimateState(combat) {
  let value = estimates.get(combat);
  if (!value || value.state !== combat.state || combat.state.t < value.sampleAt) {
    value = { state: combat.state, sampleAt: -Infinity, pace: null, taps: null, candidate: null, candidateAt: 0, usedTaps: combat.result.track?.lifeTaps || 0 };
    estimates.set(combat, value);
  }
  return value;
}
function at(curve, t) {
  const x = Math.max(0, Math.min(curve.length - 1, t)), i = Math.floor(x);
  return curve[i] + ((curve[i + 1] ?? curve[i]) - curve[i]) * (x - i);
}
export function manaBudget(forecast, elapsed, remaining) {
  if (!forecast || !(remaining >= 0) || !Number.isFinite(remaining)) return null;
  if (!remaining) return 0;
  const progress = elapsed / Math.max(elapsed + remaining, 0.001);
  const t = forecast.seconds * progress, tail = Math.max(0.001, forecast.seconds - t);
  const cost = forecast.spend.at(-1) - at(forecast.spend, t);
  const regen = forecast.gains.at(-1) - at(forecast.gains, t);
  return Math.max(0, (cost - regen) * remaining / tail - forecast.passive * remaining);
}
export function planMana(combat, sim) {
  const S = combat.state;
  if (S.over || S.pullAt != null || S.fightStart === null) return null;
  const elapsed = combat.fightSeconds(), wait = Math.max(0, combat.readyAt() - S.t);
  const estimate = estimateState(combat);
  let remaining = combat.timed ? combat.timeLeft() : null;
  let timeBasis = combat.timed ? 'duration' : 'sim';
  if (!combat.timed) {
    // Gradually learn the player's sustained pace. No threshold switches between two
    // unrelated DPS values, and a pause cannot abruptly replace the learned pace.
    const busy = combat.result.track?.busy || 0;
    const confidence = Math.min(1, busy / 30) * Math.max(0, Math.min(1, (busy / Math.max(elapsed, 1) - 0.1) / 0.7));
    const observed = elapsed > 0 && combat.result.total > 0 ? combat.result.total / elapsed : null;
    const reference = sim?.dps > 0 ? sim.dps : null;
    const target = reference ? reference * (1 - confidence) + (observed || reference) * confidence : confidence >= 0.5 ? observed : null;
    if (target && S.t - estimate.sampleAt >= 2) {
      const dt = Math.min(2, S.t - estimate.sampleAt);
      estimate.pace = estimate.pace == null ? target : estimate.pace + (target - estimate.pace) * (1 - Math.exp(-dt / 12));
      estimate.sampleAt = S.t;
    }
    const pace = target ? estimate.pace : null;
    timeBasis = confidence >= 1 ? 'observed' : confidence > 0 ? 'blended' : 'sim';
    if (pace > 0) remaining = S.targets.slice(1).reduce((sum, t) => sum + (t.dead ? 0 : t.health), 0) / pace;
  }
  if (remaining == null) return null;
  remaining = Math.max(0, remaining);
  // A full-fight average avoids repeatedly moving across short, bursty sections
  // of the sim's spending curve as cast bars and kill-time estimates change.
  const forecast = sim?.manaForecast;
  const rate = forecast?.seconds > 0 ? manaBudget(forecast, 0, forecast.seconds) / forecast.seconds : null;
  // The pending cast is reserved in available below. Do not also budget new
  // casts during its remaining cast/GCD time (channels have already paid).
  const needed = rate == null ? null : rate * Math.max(0, remaining - wait);
  if (needed == null) return null;
  const available = Math.max(0, S.mana - (S.cast?.cost || 0)), gain = combat.tapGain(), gcd = combat.gcd();
  const list = combat.build.rotation.flatMap(a => ACTION_SPELLS[a] || []);
  const filler = [...list].reverse().find(k => combat.table[k] && ['direct', 'channel'].includes(combat.spells[k].kind));
  if (!filler) return null;
  const fillerTime = Math.max(gcd, combat.spells[filler].kind === 'channel' ? combat.spells[filler].duration : combat.castTime(filler));
  const wanted = combat.simWould(remaining), windows = [];
  for (let target = 1; target <= combat.targetCount; target++) {
    if (!combat.alive(target)) continue;
    [...new Set(list)].forEach(key => {
      const spell = combat.spells[key];
      if (!spell || !['dot', 'hybrid'].includes(spell.kind)) return;
      const left = S.cast?.key === key && S.cast.target === target ? spell.duration : combat.dotLeft(key, target) - wait;
      // A DoT ending after the fight is not a refresh opportunity; do not advise a refresh too late to tick.
      if (left <= 0 || left + spell.tickEvery > remaining) return;
      windows.push({ key, target, until: left - combat.castTime(key), left });
    });
  }
  windows.sort((a, b) => a.until - b.until);
  const next = windows[0], deficit = Math.max(0, needed - available);
  const rawTaps = gain > 0 ? Math.ceil(deficit / gain) : 0;
  const usedTaps = combat.result.track?.lifeTaps || 0;
  if (estimate.taps == null) estimate.taps = rawTaps;
  if (usedTaps > estimate.usedTaps) {
    estimate.taps = Math.max(0, estimate.taps - (usedTaps - estimate.usedTaps));
    estimate.candidate = null;
    estimate.candidateAt = S.t;
  }
  estimate.usedTaps = usedTaps;
  const direction = Math.sign(rawTaps - estimate.taps);
  if (direction !== estimate.candidate) { estimate.candidate = direction; estimate.candidateAt = S.t; }
  // Settle the direction, not an exact count: a changing positive forecast must
  // still become visible when the previous estimate was zero.
  // Increase one tap at a time; actual taps count immediately.
  if (S.t - estimate.candidateAt >= 3) {
    // Drop to the settled lower forecast instead of retaining excess taps
    // for several more updates. Increases still move one tap at a time.
    estimate.taps = direction < 0 ? rawTaps : estimate.taps + direction;
    estimate.candidateAt = S.t;
  }
  const petTap = wanted?.action === 'lifeTapPet';
  const spendable = remaining > gcd + Math.min(fillerTime, 1);
  const fullTap = combat.stats.maxMana - available >= gain - 1;
  const allowed = wanted && (wanted.key === filler || wanted.key === 'lifeTap' || wanted.key === next?.key);
  const window = next && next.until >= gcd - 0.02 && next.until < fillerTime - 0.02;
  let status = 'plan';
  if (petTap) status = 'pet';
  else if (!spendable || estimate.taps === 0) status = 'spend';
  else if (deficit >= 1 && window && fullTap && combat.canTap() && allowed) status = 'tap-window';
  return { status, remaining, estimatedTime: !combat.timed, timeBasis, available, needed, gain, deficit,
    taps: estimate.taps, filler, fillerTime, fillerCost: combat.cost(filler), gcd,
    next: next || null, petTap };
}
