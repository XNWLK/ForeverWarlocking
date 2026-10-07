// Only assess uptime for an aura the player actually used on this target.
export function usedAura(d, key, target) {
  const spell = key === 'coe' ? 'curseOfElements' : key;
  const aura = spell === 'curseOfElements' ? 'coe' : key;
  return (d.result.track.uptime?.[target + ':' + aura] || 0) > 0 ||
    (d.result.bySpell?.[(target > 1 ? 'x' + target + ':' : '') + spell]?.casts || 0) > 0 ||
    (d.record?.casts || []).some(c => c.key === spell && (c.target || 1) === target);
}

// Read-only coaching derived from recorded events, never from a guessed damage penalty.
const clamp = (n, max) => Math.max(0, Math.min(max, Number(n) || 0));
export function timestamp(t) {
  const tenths = Math.round(Math.abs(t) * 10), seconds = tenths / 10;
  return (t < 0 ? '−' : '') + Math.floor(seconds / 60) + ':' + (seconds % 60).toFixed(1).padStart(4, '0');
}
function merge(spans, end) {
  const out = [];
  spans.map(s => [clamp(s[0], end), clamp(s[1], end)]).filter(s => s[1] > s[0])
    .sort((a, b) => a[0] - b[0]).forEach(s => {
      const last = out[out.length - 1];
      if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
      else out.push(s);
    });
  return out;
}
function outside(from, to, spans) {
  const out = [];
  let at = from;
  spans.forEach(s => {
    if (s[1] <= at || s[0] >= to) return;
    if (s[0] > at) out.push([at, Math.min(s[0], to)]);
    at = Math.max(at, s[1]);
  });
  if (at < to) out.push([at, to]);
  return out;
}

export function analyzeFight(d) {
  const seconds = Math.max(0, Number(d.seconds) || 0), k = d.result.track;
  const record = d.record || { casts: [], moves: [] }, casts = record.casts || [];
  const moves = merge(record.moves || [], seconds);
  // Union cast/channel/GCD occupancy; stopped channels end where the recorder says they ended.
  const busy = merge(casts.filter(c => !c.off).map(c => [c.t, c.t + Math.max(c.len || 0, c.gcd || 0)]), seconds);
  const idle = outside(0, seconds, busy);
  const gaps = idle.flatMap(s => outside(s[0], s[1], moves));
  const idleSeconds = gaps.reduce((sum, s) => sum + s[1] - s[0], 0);
  const longGaps = gaps.filter(s => s[1] - s[0] >= 0.6).sort((a, b) => (b[1] - b[0]) - (a[1] - a[0]));
  const findings = [];
  const clips = record.clips || [], name = key => d.spells[key]?.name || key;
  if (clips.length) findings.push({
    id: 'dot-clips', severity: 'medium', title: 'Let DoTs finish before replacing them', metric: clips.length + ' clipped DoT' + (clips.length === 1 ? '' : 's'),
    evidence: clips.reduce((n, c) => n + c.ticks, 0) + ' pending ticks were cancelled by successful refreshes or Bane replacements. Conflagrate consumption is excluded. These are cancelled ticks, not a measured net damage loss.',
    advice: 'For an instant DoT, refresh after the final tick. For a cast-time DoT, time the cast to land after it expires. A needed Life Tap can fill a gap that is too short for another filler.',
    events: clips.map(c => ({ t: c.t, label: timestamp(c.t) + ' · ' + name(c.key) + ' · T' + c.target + ' · ' + c.left.toFixed(1) + 's / ' + c.ticks + ' ticks left' }))
  });
  const opportunities = casts.filter(c => c.manaPlan?.status === 'tap-window' && !c.stopped &&
    (c.key === c.manaPlan.filler || (c.key === c.manaPlan.next.key && c.target === c.manaPlan.next.target)));
  if (opportunities.length) findings.push({
    id: 'tap-windows', severity: 'estimate', title: 'Fit a needed Life Tap before a DoT refresh', metric: opportunities.length + ' possible tap window' + (opportunities.length === 1 ? '' : 's'),
    evidence: 'At these decisions you had room for a full tap and the mana forecast showed a deficit. A Life Tap GCD fit before the next refresh; another full filler did not.',
    advice: 'Tap in this gap, then refresh after the final tick. These are estimated opportunities, not guaranteed DPS gains; check the target, other priorities and movement.',
    events: opportunities.slice(0, 3).map(c => ({ t: c.t, label: timestamp(c.t) + ' · before ' + name(c.manaPlan.next.key) + ' · T' + c.manaPlan.next.target + ' · refresh in ' + c.manaPlan.next.until.toFixed(1) + 's' }))
  });
  const lateTaps = casts.filter(c => c.key === 'lifeTap' && c.manaGained > 0 && c.manaPlan?.status === 'spend' && c.manaPlan.remaining <= 30);
  if (lateTaps.length) findings.push({
    id: 'late-taps', severity: 'estimate', title: 'Spend down your mana near the finish', metric: lateTaps.length + ' late tap' + (lateTaps.length === 1 ? '' : 's') + ' to review',
    evidence: 'Before these taps, projected remaining spending was already covered, or too little time remained to tap and spend the gain. Taps requested for pet mana are excluded.',
    advice: 'Use the remaining time on damage when you can. Aim for close to zero at the finish, with enough mana for your final useful cast. The forecast changes with your rotation and, in health fights, your kill-time estimate.',
    events: lateTaps.slice(0, 3).map(c => ({ t: c.t, label: timestamp(c.t) + ' · ' + Math.round(c.manaPlan.available) + ' available / ~' + Math.round(c.manaPlan.needed) + ' needed' }))
  });
  if (longGaps.length) findings.push({
    id: 'idle', severity: idleSeconds / seconds > 0.15 ? 'high' : 'medium',
    title: 'Close the gaps between spells', metric: idleSeconds.toFixed(1) + ' s idle',
    evidence: 'Time outside casts and the global cooldown, excluding recorded forced movement. Longest gap: ' + (longGaps[0][1] - longGaps[0][0]).toFixed(1) + ' s.',
    advice: 'Queue your next spell during the final 0.4 seconds of a cast or global cooldown. Plan your next key before the cast bar finishes.',
    events: longGaps.slice(0, 3).map(s => ({ t: s[0], label: timestamp(s[0]) + ' · ' + (s[1] - s[0]).toFixed(1) + ' s gap' }))
  });
  const stopped = casts.filter(c => c.stopped === 'moving');
  if (stopped.length) findings.push({
    id: 'interrupts', severity: 'high', title: 'Finish casts before moving', metric: stopped.length + ' interrupted',
    evidence: stopped.length + ' cast' + (stopped.length === 1 ? ' was' : 's were') + ' stopped by movement. Channels may already have dealt damage before stopping.',
    advice: 'Move during instant spells and their global cooldown. Use the movement countdown to avoid starting a cast you cannot finish.',
    events: stopped.slice(0, 3).map(c => ({ t: c.t + c.len, label: timestamp(c.t + c.len) + ' · ' + (d.spells[c.key]?.name || c.key) }))
  });
  const emptyTaps = casts.filter(c => c.key === 'lifeTap' && c.manaGained === 0);
  if (emptyTaps.length) findings.push({
    id: 'taps', severity: 'medium', title: 'Give Life Tap room to restore mana', metric: emptyTaps.length + (emptyTaps.length === 1 ? ' empty tap' : ' empty taps'),
    evidence: 'These Life Taps restored no player mana. Pet mana gained through Demonic Energies is based on player mana gained, too.',
    advice: 'Spend mana before tapping. Prefer movement windows when you have enough missing mana to benefit.',
    events: emptyTaps.slice(0, 3).map(c => ({ t: c.t, label: timestamp(c.t) + ' · no mana gained' }))
  });
  // Compare uptime only for finished fights. A live opener is not comparable to a whole simulated fight.
  const uptime = [];
  if (d.complete && seconds >= 10 && d.sim && d.sim.uptime) {
    Object.entries(d.sim.uptime).forEach(([id, expected]) => {
      const m = /^dot(?:(\d+))?:(.+)$/.exec(id);
      const target = m ? Number(m[1] || 1) : 1, key = m ? m[2] : id === 'coe' ? 'curseOfElements' : null;
      if (!key || target > d.targets || !d.spells[key] || !(expected >= 20) || !usedAura(d, key, target)) return;
      const mine = clamp(100 * (k.uptime[target + ':' + (key === 'curseOfElements' ? 'coe' : key)] || 0) / seconds, 100);
      const delta = expected - mine;
      if (delta < 10) return;
      uptime.push({ key, target, mine, expected, delta });
    });
    uptime.sort((a, b) => b.delta - a.delta);
    uptime.slice(0, 3).forEach(u => {
      const name = d.spells[u.key].name + (d.targets > 1 ? ' · target ' + u.target : '');
      findings.push({ id: 'uptime-' + u.target + '-' + u.key, severity: 'compare',
        title: 'Review ' + name + ' uptime', metric: Math.round(u.mine) + '% / ' + Math.round(u.expected) + '% sim',
        evidence: Math.round(u.delta) + ' percentage points below the sim. Misses, execute priorities, consumed DoTs, and target deaths can contribute.',
        advice: 'Check its timeline against the build’s priority list. Enable DoT timers and the next-cast hint; avoid refreshing early just to reach 100%.', events: [] });
    });
  }
  if (d.hasPet && seconds >= 10 && k.petActive / seconds < 0.85) findings.push({
    id: 'pet', severity: 'medium', title: 'Keep your demon in the fight', metric: Math.round(100 * clamp(k.petActive, seconds) / seconds) + '% active',
    evidence: 'The pet was not actively attacking for ' + (seconds - clamp(k.petActive, seconds)).toFixed(1) + ' s. Initial travel and repositioning count toward this time.',
    advice: 'Check that your pet is set to Attack and can reach the target. Reissue Attack after changing targets if needed.', events: []
  });
  const rank = { high: 0, medium: 1, estimate: 2, compare: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);
  return { seconds, idleSeconds, activity: seconds ? clamp(100 * k.busy / seconds, 100) : 0, findings,
    clips, uptime, manaEnd: record.manaEnd || null, short: seconds < 10, live: !d.complete, dps: seconds ? d.result.total / seconds : 0 };
}
