// Lessons: a short guided series for the build you play. Each lesson explains one part of the build's rotation and
// ends with a test - a short fight with a few things to reach. Passing a test opens the next lesson.
// The lessons are put together from the build's own priority list (what the sim casts), so an imported build gets
// the lessons that fit its spells too. Nothing here changes a fight: the test is an ordinary challenge (main.js),
// and the checks read the fight's record when it is over.

// What a check gets: { res: the fight's result (js/combat.js), seconds, sim: the worker's numbers for the same fight,
// procs: { all, used, mean, lost } (Shadow Trance and Decimation), targets }.
function base(key) { return String(key).replace(/^x\d:/, ''); }
function pct(n) { return Math.round(n) + '%'; }
function upPct(r, key) {                                   // how long it was on the first dummy, as a share of the fight
  return r.seconds > 0 ? 100 * (r.res.track.uptime['1:' + key] || 0) / r.seconds : 0;
}
function simUp(r, key) {                                   // the same for the sim, or null
  if (!r.sim || !r.sim.uptime) return null;
  const v = r.sim.uptime[key === 'coe' || key === 'brand' || key === 'isb' ? key : 'dot:' + key];
  return v == null ? null : v;
}
function casts(rows, key) {
  let n = 0;
  Object.keys(rows || {}).forEach(function (k) { if (base(k) === key) n += rows[k].casts || 0; });
  return n;
}
function idlePct(r) { return r.seconds > 0 ? 100 * Math.max(0, r.seconds - r.res.track.busy) / r.seconds : 0; }

// A check: label (what is asked), test(r) -> { ok: true / false, or null while the sim's numbers are missing, value }.
function idleCheck(most) {
  return { label: 'Time without a cast: at most ' + most + '% of the fight',
           test: function (r) { const v = idlePct(r); return { ok: v <= most, value: v.toFixed(1) + '%' }; } };
}
// Up for at least the sim's share less `slack` points (or `floor`% when the sim keeps it up for less than that).
function upCheck(name, keys, slack, floor) {
  return { label: name + ' up nearly as long as the sim keeps it up',
           test: function (r) {
             const mine = keys.reduce(function (s, k) { return s + upPct(r, k); }, 0);
             const sims = keys.map(function (k) { return simUp(r, k); });
             if (sims.every(function (v) { return v == null; })) return r.sim ? { ok: mine >= floor, value: pct(mine) + ' (needs ' + floor + '%)' } : { ok: null, value: pct(mine) };
             const need = Math.max(0, Math.min(sims.reduce(function (s, v) { return s + (v || 0); }, 0) - slack, 97));
             return { ok: mine >= need, value: pct(mine) + ' (needs ' + pct(need) + ')' };
           } };
}
function castsCheck(name, key, share) {
  return { label: name + ': at least ' + share + '% as many casts as the sim',
           test: function (r) {
             const mine = casts(r.res.bySpell, key);
             if (!r.sim) return { ok: null, value: String(mine) };
             const theirs = casts(r.sim.bySpell, key), need = Math.max(1, Math.floor(theirs * share / 100 + 1e-9));
             return { ok: mine >= need, value: mine + ' (the sim: ' + Math.round(theirs) + ')' };
           } };
}
function clipCheck(keys, most) {
  return { label: 'DoTs cast again too early (cutting off ticks): at most ' + most,
           test: function (r) {
             const n = (r.res.track.clips || []).filter(function (c) { return c.by === c.key && c.ticks > 0 && keys.indexOf(c.key) >= 0; }).length;
             return { ok: n <= most, value: String(n) };
           } };
}
function procCheck(name, mean, least) {
  return { label: name + ': at least ' + least + ' in the fight, each used within ' + mean + ' s on average, at most one wasted',
           test: function (r) {
             const p = r.procs;
             if (p.all < least) return { ok: false, value: p.all === 0 ? 'none came this time: try again' : 'only ' + p.all + ' came: try again' };
             return { ok: p.used > 0 && p.mean <= mean && p.lost <= 1, value: p.used + ' of ' + p.all + ' used' + (p.used ? ', after ' + p.mean.toFixed(1) + ' s' : '') + (p.lost ? ', ' + p.lost + ' wasted' : '') };
           } };
}
function simShareCheck(least) {
  return { label: 'At least ' + least + '% of the sim\'s DPS',
           test: function (r) {
             if (!r.sim) return { ok: null, value: '' };
             const v = 100 * (r.res.total / r.seconds) / r.sim.dps;
             return { ok: v >= least, value: pct(v) };
           } };
}
function manaCheck() {
  return { label: 'Never short of mana for a spell, and no more Life Taps than the sim plus two',
           test: function (r) {
             const k = r.res.track, simTaps = r.sim && r.sim.seconds > 0 ? (r.sim.lifeTaps || 0) * r.seconds / r.sim.seconds : null;
             if (simTaps == null) return { ok: null, value: k.lifeTaps + ' taps' };
             return { ok: !k.noMana && k.lifeTaps <= Math.round(simTaps) + 2,
                      value: (k.noMana ? (k.noMana === 1 ? '1 press' : k.noMana + ' presses') + ' without mana, ' : 'never short, ') + k.lifeTaps + ' taps (the sim: ' + Math.round(simTaps) + ')' };
           } };
}

// The lessons for this build. WL: the sim's data; build: the build (its rotation decides which lessons there are).
export function lessonsFor(WL, build) {
  const rot = build.rotation || [], has = function (a) { return rot.indexOf(a) >= 0; };
  const name = function (k) { return (WL.SPELLS[k] && WL.SPELLS[k].name) || k; };
  const line = function (a) { return String((WL.actionLabel && WL.actionLabel(build, a)) || a).replace(/\s*\[A\d+\]/g, ''); };
  const filler = rot[rot.length - 1], fillerSpell = filler === 'searingPain' ? 'searingPain' : filler === 'incinerate' ? 'incinerate' : filler === 'wrack' ? 'wrack' : 'shadowBolt';
  const dots = ['corruption', 'immolate', 'siphonLife'].filter(has);
  const list = [];

  list.push({
    id: 'filler', title: 'Never stop casting',
    text: ['Most of your damage comes from casting all the time. Whenever nothing more important is due, you cast your filler: ' + name(fillerSpell) + '. The last line of the rotation says so: "' + line(filler) + '".',
           'Press your next spell while the cast bar is still running: a press up to 0.4 s before you are free is remembered and goes off the moment you are. That way not a moment is lost between two casts.',
           'Instant spells still start a global cooldown of about 1.5 s. Time on the global cooldown counts as casting.'],
    test: { text: '45 seconds on one dummy. Keep casting from your first spell to the end.', targets: 1, fight: { timed: true, seconds: 45 },
            checks: [idleCheck(5)] }
  });

  if (dots.length) {
    list.push({
      id: 'dots', title: 'Damage over time',
      text: ['Your ' + dots.map(name).join(', ').replace(/, ([^,]*)$/, ' and $1') + ' ' + (dots.length > 1 ? 'deal' : 'deals') + ' damage over time. Keep ' + (dots.length > 1 ? 'them' : 'it') + ' on the dummy all fight: cast ' + (dots.length > 1 ? 'each' : 'it') + ' again when it runs out.',
             'Cast again too early and the ticks that were still to come are lost: a DoT cast over itself starts again, it does not add up. The best moment is just as it runs out - for a spell with a cast bar, start it so that it lands then.',
             'The DoT timers in the bar on the right (Show) help: gold means "cast it again now". Hold on to this lesson\'s rule of thumb: never let one fall off, never cut one short.'],
      test: { text: '90 seconds on one dummy. Keep your DoTs up without cutting them short.', targets: 1, fight: { timed: true, seconds: 90 },
              checks: dots.map(function (k) { return upCheck(name(k), [k], 8, 75); }).concat([clipCheck(dots, 2)]) }
    });
  }

  if (has('curseOfElements') || has('bane') || has('baneOfAgony')) {
    const checks = [];
    if (has('curseOfElements')) checks.push(upCheck('Curse of the Elements', ['coe'], 6, 85));
    if (has('bane')) checks.push(upCheck('A Bane (Doom or Agony)', ['baneOfDoom', 'baneOfAgony'], 8, 80));
    else if (has('baneOfAgony')) checks.push(upCheck('Bane of Agony', ['baneOfAgony'], 8, 80));
    list.push({
      id: 'curses', title: 'Curses and Banes',
      text: [has('curseOfElements') ? 'Curse of the Elements makes the dummy take 10% more damage from all your spells and takes away its resistance. It comes first: keep it up from the start to the end.' : '',
             has('bane') ? 'One Bane at a time: "' + line('bane') + '". Bane of Doom is one big hit after a minute; Bane of Agony ticks, slowly at first, then harder. When Doom is on cooldown or the fight is about to end, Agony fills in.'
               : has('baneOfAgony') ? 'Bane of Agony ticks slowly at first, then harder. Keep it up all fight: "' + line('baneOfAgony') + '".' : ''].filter(Boolean),
      test: { text: 'Two minutes on one dummy. Keep your curse and your Bane up.', targets: 1, fight: { timed: true, seconds: 120 }, checks: checks }
    });
  }

  if (has('searingPainBrand')) {
    list.push({
      id: 'brand', title: 'Demonic Brand',
      text: ['A landed ' + name('searingPain') + ' brands the dummy with Demonic Brand. Every attack of your demon that lands spends a charge and adds a hit of its own.',
             'When the charges are gone, the brand is down: "' + line('searingPainBrand') + '". Watch the brand among the dummy\'s debuffs and renew it soon after it is used up.'],
      test: { text: '60 seconds on one dummy. Keep the brand on it.', targets: 1, fight: { timed: true, seconds: 60 },
              checks: [upCheck('Demonic Brand', ['brand'], 10, 60)] }
    });
  }

  if (has('shadowTrance')) {
    list.push({
      id: 'trance', title: 'Shadow Trance',
      text: ['Each tick of your Corruption' + (has('wrack') ? ' and ' + name('wrack') : '') + ' may give you Shadow Trance: your next ' + name('shadowBolt') + ' is instant. It shows on your buffs, and the ' + name('shadowBolt') + ' button lights up.',
             'Use it at once: "' + line('shadowTrance') + '". Another proc while it is up is wasted, and it runs out after 10 s. With Corruption on more dummies it comes more often.',
             'The proc alerts (Show, in the bar on the right) make it hard to miss.'],
      test: { text: 'Two minutes on three dummies: Corruption on all three, and every Shadow Trance used at once.', targets: 3, fight: { timed: true, seconds: 120 },
              checks: [procCheck('Shadow Trance', 4, 2)] }
    });
  }
  if (has('soulFire')) {
    list.push({
      id: 'decimation', title: 'Decimation',
      text: ['While the dummy is below 35% health, your ' + name('shadowBolt') + ' and ' + name('searingPain') + ' give you Decimation: the next ' + name('soulFire') + ' casts much faster and needs no Soul Shard.',
             'Cast ' + name('soulFire') + ' while it is up: "' + line('soulFire') + '". It lasts 10 s from your last ' + name('shadowBolt') + ' or ' + name('searingPain') + ', and one ' + name('soulFire') + ' uses it up.'],
      test: { text: '60 seconds on a dummy that is in execute range from the start. Use every Decimation.', targets: 1, fight: { timed: true, seconds: 60 }, executePct: 100,
              checks: [procCheck('Decimation', 5, 2)] }
    });
  }

  if (has('conflagrate')) {
    const checks = [castsCheck(name('conflagrate'), 'conflagrate', 90)];
    if (has('shadowburn')) checks.push(castsCheck(name('shadowburn'), 'shadowburn', 85));
    checks.push(upCheck(name('immolate'), ['immolate'], 8, 75));
    list.push({
      id: 'cooldowns', title: name('conflagrate') + (has('shadowburn') ? ' and ' + name('shadowburn') : ''),
      text: [name('conflagrate') + ' needs ' + name('immolate') + ' on the dummy. Cast it as soon as it is ready: "' + line('conflagrate') + '".',
             has('shadowburn') ? name('shadowburn') + ' too, whenever it is ready: "' + line('shadowburn') + '". Each landed one gives you Shadow and Flame: more Shadow or Fire damage for 20 s.' : '',
             'A cooldown that waits is damage you never get back. Keep ' + name('immolate') + ' up so ' + name('conflagrate') + ' always has something to work with.'].filter(Boolean),
      test: { text: '90 seconds on one dummy. Use your cooldowns as soon as they are ready.', targets: 1, fight: { timed: true, seconds: 90 }, checks: checks }
    });
  }

  if (has('wrack')) {
    list.push({
      id: 'wrack', title: name('wrack') + ' and Improved Shadow Bolt',
      text: [name('wrack') + ' is your filler: a channel that makes your DoTs on the dummy tick harder while it lasts. Channel it whenever your DoTs are up and nothing else is due.',
             has('isbUpkeep') ? 'A ' + name('shadowBolt') + ' that crits puts Improved Shadow Bolt on the dummy: more Shadow damage. "' + line('isbUpkeep') + '".' : ''].filter(Boolean),
      test: { text: '90 seconds on one dummy.', targets: 1, fight: { timed: true, seconds: 90 },
              checks: [castsCheck(name('wrack'), 'wrack', 85)].concat(has('isbUpkeep') ? [upCheck('Improved Shadow Bolt', ['isb'], 10, 20)] : []) }
    });
  }

  list.push({
    id: 'mana', title: 'Mana and Life Tap',
    text: ['Life Tap turns health into mana. Tap before you run dry, not after: "' + line('lifeTapBelow') + '". A press that fails for lack of mana is time lost.',
           'Do not tap more than you need: each tap costs a global cooldown, and mana left at the end is wasted. While you have to move, a Life Tap is a good thing to do - it is instant.'],
    test: { text: 'Three minutes on one dummy. Mana decides it.', targets: 1, fight: { timed: true, seconds: 180 },
            checks: [manaCheck(), idleCheck(6)] }
  });

  list.push({
    id: 'whole', title: 'The whole rotation',
    text: ['Everything together, as the sim plays it: the first line of the rotation that applies is what you cast. Switch on "The sim as a ghost" or "The sim\'s next cast" (Show) while you learn it, and switch them off to test yourself.',
           'Pass this and you play the build about as well as the sim does.'],
    test: { text: 'Two minutes on one dummy: reach 90% of the sim\'s DPS.', targets: 1, fight: { timed: true, seconds: 120 },
            checks: [simShareCheck(90)] }
  });

  list.forEach(function (l, i) { l.number = i + 1; });
  return list;
}

// Runs a lesson's checks. Returns { passed, waiting (the sim's numbers are not in yet), rows: [{ label, ok, value }] }.
export function judgeLesson(lesson, r) {
  const rows = lesson.test.checks.map(function (c) { const out = c.test(r); return { label: c.label, ok: out.ok, value: out.value }; });
  const waiting = rows.some(function (row) { return row.ok === null; });
  return { passed: !waiting && rows.every(function (row) { return row.ok; }), waiting: waiting, rows: rows };
}
