// Optional additions to XN's fight review. The original summary, timeline and tables stay first.
import { analyzeFight, timestamp } from './analysis.js';

function el(tag, text, className) {
  const node = document.createElement(tag);
  if (text != null) node.textContent = text;
  if (className) node.className = className;
  return node;
}
const whole = n => Math.round(n).toLocaleString('en-US');

export function reviewModules(d, { table, inspect, retry }) {
  const a = analyzeFight(d), section = el('section', null, 'review-modules');
  section.setAttribute('aria-label', 'Additional analysis');
  section.appendChild(el('h3', 'Additional analysis'));
  if (a.short || a.live) section.appendChild(el('p', a.short
    ? 'A short sample. Finish a longer pull for more useful analysis.'
    : 'Live snapshot. Whole-fight uptime comparisons appear after the fight ends.', 'coach-note'));

  function module(title, findings, empty) {
    const details = el('details', null, 'review-module');
    details.appendChild(el('summary', title));
    if (!findings.length && empty) details.appendChild(el('p', empty, 'coach-note'));
    findings.forEach(f => {
      const card = el('article', null, 'coach-finding'), top = el('div', null, 'finding-heading');
      top.append(el('span', f.severity === 'compare' ? 'SIM COMPARISON' : f.severity === 'estimate' ? 'MANA ESTIMATE' : 'RECORDED', 'eyebrow'), el('b', f.metric));
      card.append(top, el('h4', f.title), el('p', f.evidence), el('p', f.advice));
      if (f.events.length) {
        const events = el('div', null, 'coach-events');
        f.events.forEach(e => {
          const button = el('button', e.label);
          button.type = 'button'; button.title = 'Inspect this moment in the fight timeline';
          button.addEventListener('click', () => inspect(e.t));
          events.appendChild(button);
        });
        card.appendChild(events);
      }
      details.appendChild(card);
    });
    section.appendChild(details);
    return details;
  }

  const dotFindings = a.findings.filter(f => f.id === 'dot-clips' || f.id.startsWith('uptime-'));
  const dots = module('DoT clipping & uptime' + (a.clips.length ? ' · ' + a.clips.length + ' clipped' : ''), []);
  const spell = key => d.spells[key]?.name || key;
  function compactTable(parent, headings, rows) {
    const scroll = el('div', null, 'review-module-table');
    const grid = table(headings, rows); scroll.appendChild(grid); parent.appendChild(scroll); return grid;
  }
  if (a.clips.length) {
    const ticks = a.clips.reduce((n, c) => n + c.ticks, 0), replacements = a.clips.some(c => c.replacement !== c.key);
    dots.appendChild(el('p', ticks + ' pending tick' + (ticks === 1 ? '' : 's') + ' cancelled. Refresh after the final tick; time cast-time DoTs to land after expiry.', 'coach-note'));
    const headings = ['Time', 'DoT'];
    if (d.targets > 1) headings.push('Target');
    if (replacements) headings.push('Replaced by');
    headings.push('Time left', 'Ticks left');
    const grid = compactTable(dots, headings, a.clips.map(c => {
      const cells = [timestamp(c.t), spell(c.key)];
      if (d.targets > 1) cells.push('T' + c.target);
      if (replacements) cells.push(spell(c.replacement));
      cells.push(c.left.toFixed(1) + ' s', String(c.ticks));
      return { cells };
    }));
    grid.classList.add('clip-table');
    Array.from(grid.tBodies[0].rows).forEach((row, i) => {
      const c = a.clips[i], button = el('button', timestamp(c.t), 'review-time');
      button.type = 'button'; button.title = 'Show ' + spell(c.key) + ' on target ' + c.target + ' in the timeline';
      button.setAttribute('aria-label', timestamp(c.t) + ' · ' + spell(c.key) + ' · target ' + c.target);
      button.addEventListener('click', () => inspect(c.t)); row.cells[0].replaceChildren(button);
    });
  } else dots.appendChild(el('p', 'No clipped DoTs recorded.', 'coach-note'));
  if (a.uptime.length) {
    dots.appendChild(el('h4', 'Uptime gaps vs sim'));
    compactTable(dots, ['DoT / debuff', 'You', 'Sim', 'Gap'], a.uptime.map(u => ({ cells: [spell(u.key) + (d.targets > 1 ? ' · T' + u.target : ''), Math.round(u.mine) + '%', Math.round(u.expected) + '%', '−' + Math.round(u.delta) + ' pp'] })));
  } else if (a.short || a.live || !d.sim) dots.appendChild(el('p', 'Uptime comparison needs a completed fight of at least 10 seconds and a sim reference.', 'coach-note'));
  if (a.clips.length || a.uptime.length) {
    const help = el('details', null, 'review-help');
    help.appendChild(el('summary', 'How to read this'));
    if (a.clips.length) help.appendChild(el('p', 'Click a clip’s time to locate it in the timeline. Cancelled ticks are not measured net damage loss; Conflagrate consumption is excluded. A needed Life Tap can fill a gap too short for your filler.', 'coach-note'));
    if (a.uptime.length) help.appendChild(el('p', 'Uptime gaps only assess spells you used on that target, in percentage points below the sim. Misses, execute priorities, consumed DoTs and target deaths can contribute. Follow the timeline and priority list; avoid refreshing early just to reach 100%.', 'coach-note'));
    dots.appendChild(help);
  }
  const manaIds = ['taps', 'tap-windows', 'late-taps'];
  const mana = module('Life Tap & mana', a.findings.filter(f => manaIds.includes(f.id)), 'No Life Tap issues detected by these checks.');
  if (a.manaEnd) {
    const remaining = el('p', (d.complete ? 'Mana at the finish: ' : 'Mana in this snapshot: ') + whole(a.manaEnd.current) + ' / ' + whole(a.manaEnd.max) + '. Aim to finish near zero, with enough for your last useful spell.', 'coach-note');
    mana.insertBefore(remaining, mana.children[1]);
  }
  mana.appendChild(el('p', 'Mana projections use the build’s simulated spending and regeneration. Your casts and fight length can change the estimate; these notes do not measure lost DPS.', 'coach-note'));

  const other = a.findings.filter(f => !dotFindings.includes(f) && !manaIds.includes(f.id));
  const casting = module('Casting, movement & pet', other, 'No casting, movement or pet issues detected by these checks.');
  const activity = el('p', Math.round(a.activity) + '% casting or on the global cooldown · ' + a.idleSeconds.toFixed(1) + ' s idle outside forced movement.', 'coach-note');
  casting.insertBefore(activity, casting.children[1]);

  const actions = el('div', null, 'coach-actions'), again = el('button', 'Practice again');
  again.type = 'button'; again.addEventListener('click', retry); actions.appendChild(again);
  section.appendChild(actions);
  return section;
}
