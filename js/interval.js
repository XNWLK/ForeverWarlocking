// Interval evidence only: this does not estimate damage lost to a mistake.
function duration(spans, from, to) {
  let end = from, total = 0;
  for (const [a, b] of spans.slice().sort((a, b) => a[0] - b[0])) {
    const start = Math.max(from, a, end), stop = Math.min(to, b);
    if (stop > start) { total += stop - start; end = stop; }
  }
  return total;
}
function curveAt(curve, t) {
  if (!curve?.length) return 0;
  const x = Math.max(0, Math.min(curve.length - 1, t)), i = Math.floor(x);
  return curve[i] + ((curve[i + 1] ?? curve[i]) - curve[i]) * (x - i);
}
export function inspectInterval(d, from, to) {
  const seconds = Math.max(0, d.seconds || 0);
  from = Math.max(0, Math.min(seconds, from)); to = Math.max(from, Math.min(seconds, to));
  const span = to - from, record = d.record || {}, casts = record.casts || [];
  const inside = t => t >= from && (t < to || to === seconds && t === to);
  const events = (record.damage || []).filter(e => inside(e.t));
  const damage = events.reduce((n, e) => n + e.amount, 0);
  const occupancy = casts.filter(c => !c.off).map(c => [c.t, c.t + Math.max(c.len || 0, c.gcd || 0)]);
  const moves = record.moves || [], busy = duration(occupancy, from, to);
  const idle = Math.max(0, span - duration(occupancy.concat(moves), from, to));
  const bySpell = {};
  for (const e of events) {
    const row = bySpell[e.key] ||= { damage: 0, hits: 0, crits: 0, misses: 0 };
    row.damage += e.amount;
    if (e.type === 'miss') row.misses++;
    else { row.hits++; if (e.crit) row.crits++; }
  }
  return { from, to, damage, dps: span ? damage / span : 0,
    simDps: span && d.sim?.curve ? (curveAt(d.sim.curve, to) - curveAt(d.sim.curve, from)) / span : null,
    busy, idle, movement: duration(moves, from, to), bySpell,
    petDamage: events.filter(e => e.key?.startsWith('pet:')).reduce((n, e) => n + e.amount, 0),
    tickDamage: events.filter(e => e.type === 'tick' && !e.key?.startsWith('pet:')).reduce((n, e) => n + e.amount, 0),
    casts: casts.filter(c => inside(c.t)),
    windups: casts.filter(c => c.t < to && c.t + c.len > to && !c.stopped),
    interrupted: casts.filter(c => c.stopped && inside(c.t + c.len)),
    clips: (record.clips || []).filter(c => inside(c.t)),
    uptimes: Object.entries(record.auras || {}).map(([key, spans]) => ({ key, seconds: duration(spans, from, to) })) };
}

export function attachIntervalInspector(body, svg, d, graphSpan, width, pad) {
  const make = (tag, text) => { const e = document.createElement(tag); if (text != null) e.textContent = text; return e; };
  const box = make('details'); box.className = 'interval-inspector';
  box.append(make('summary', 'Inspect an interval'));
  const controls = make('div'); controls.className = 'interval-controls';
  const inputs = ['From', 'To'].map((name, i) => {
    const label = make('label', name + ' (seconds) '), input = make('input');
    input.type = 'number'; input.min = '0'; input.max = String(d.seconds); input.step = '0.1';
    input.value = String(i ? Math.min(10, d.seconds) : 0); label.append(input); controls.append(label); return input;
  });
  box.append(make('p', 'Drag across the graph, or enter start and end times.'), controls);
  const output = make('div'); box.append(output); body.append(box);
  const shade = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  shade.setAttribute('y', '0'); shade.setAttribute('height', '150'); shade.setAttribute('fill', 'rgba(185,138,255,0.17)');
  shade.setAttribute('pointer-events', 'none'); svg.append(shade);
  const name = key => d.spells[key]?.name || ({ coe: 'Curse of the Elements', 'pet:firebolt': 'Pet: Firebolt', 'pet:brand': 'Demonic Brand', 'pet:melee': 'Pet: melee', 'pet:lashOfPain': 'Pet: Lash of Pain' })[key] || key;
  function render() {
    shade.style.display = box.open ? '' : 'none';
    const from = Number(inputs[0].value), to = Number(inputs[1].value);
    output.replaceChildren();
    if (!Number.isFinite(from + to) || from < 0 || to > d.seconds || to <= from) { output.append(make('p', 'Choose an end time after the start, within this fight.')); shade.style.display = 'none'; return; }
    const a = inspectInterval(d, from, to), round = n => Math.round(n).toLocaleString('en-US');
    shade.setAttribute('x', pad + (width - 2 * pad) * from / graphSpan);
    shade.setAttribute('width', (width - 2 * pad) * (to - from) / graphSpan);
    output.append(make('p', `${from.toFixed(1)}–${to.toFixed(1)} s · ${round(a.damage)} damage · ${round(a.dps)} DPS` + (a.simDps != null ? ` · Sim: ~${round(a.simDps)} DPS` : '')));
    output.append(make('p', `${a.busy.toFixed(1)} s casting / GCD · ${a.idle.toFixed(1)} s outside casts / GCD and forced movement · ${a.movement.toFixed(1)} s forced movement (may overlap casts).`));
    output.append(make('p', `Pet: ${round(a.petDamage)} damage · Your periodic ticks: ${round(a.tickDamage)} damage · Other player damage: ${round(a.damage - a.petDamage - a.tickDamage)}.`));
    const counts = {};
    for (const c of a.casts) counts[name(c.key)] = (counts[name(c.key)] || 0) + 1;
    output.append(make('p', 'Casts started: ' + (Object.entries(counts).map(([k, n]) => `${k} ×${n}`).join(', ') || 'none') + '.'));
    const evidence = make('ul');
    if (a.windups.length) evidence.append(make('li', 'Still casting at the interval end: ' + a.windups.map(c => name(c.key)).join(', ') + '. Damage may land afterward; a flat stretch during a cast is normal.'));
    if (a.interrupted.length) evidence.append(make('li', `${a.interrupted.length} cast/channel interruptions ended in this interval.`));
    if (a.clips.length) evidence.append(make('li', `${a.clips.length} DoT refreshes cancelled pending ticks.`));
    for (const [key, r] of Object.entries(a.bySpell).sort((a, b) => b[1].damage - a[1].damage)) {
      evidence.append(make('li', `${name(key)}: ${round(r.damage)} damage, ${r.crits}/${r.hits} damage events crit, ${r.misses} misses.`));
    }
    output.append(evidence);
    const uptime = a.uptimes.map(u => {
      const split = u.key.indexOf(':'); return `${name(u.key.slice(split + 1))} T${u.key.slice(0, split)}: ${Math.round(100 * u.seconds / (to - from))}%`;
    });
    if (uptime.length) output.append(make('p', 'Recorded aura uptime: ' + uptime.join(' · ')));
    output.append(make('p', 'These are recorded events, not measured damage penalties. Sim interval DPS is interpolated from its averaged one-second curve; crit luck and damage landing across interval boundaries can change the comparison.'));
  }
  inputs.forEach(input => input.addEventListener('input', render)); box.addEventListener('toggle', render);
  let anchor = null;
  const time = e => Math.max(0, Math.min(d.seconds, ((e.clientX - svg.getBoundingClientRect().left) / svg.getBoundingClientRect().width * width - pad) / (width - 2 * pad) * graphSpan));
  svg.style.touchAction = 'pan-y'; svg.style.cursor = 'crosshair';
  svg.addEventListener('pointerdown', e => { if (e.button !== 0) return; anchor = time(e); svg.setPointerCapture(e.pointerId); });
  svg.addEventListener('pointermove', e => {
    if (anchor == null) return;
    const end = time(e); if (Math.abs(end - anchor) < 0.1) return;
    inputs[0].value = Math.min(anchor, end).toFixed(1); inputs[1].value = Math.min(d.seconds, Math.max(anchor, end)).toFixed(1);
    box.open = true; render();
  });
  const stop = () => { anchor = null; };
  svg.addEventListener('pointerup', stop); svg.addEventListener('pointercancel', stop); svg.addEventListener('lostpointercapture', stop);
  render();
}
