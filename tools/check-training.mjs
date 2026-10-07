// Focused checks for the optional pull timer, observed DoT clips and read-only mana coach.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import { createCombat } from '../js/combat.js';
import { createRecorder } from '../js/record.js';
import { spellCritPercent } from '../js/panels.js';
import { planMana, manaBudget } from '../js/mana.js';
import { analyzeFight, timestamp } from '../js/analysis.js';
const require = createRequire(import.meta.url), WL = require('./load-sim.js').load();
const ctx = { moving: false, petDistance: 1000 }, copy = o => JSON.parse(JSON.stringify(o));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('OK: ' + name); }
function close(a, b) { assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-7, `${a} != ${b}`); }
function setup(options = {}) {
  const events = [], recorder = createRecorder(), cfg = copy(WL.DEFAULT_CONFIG);
  let combat;
  combat = createCombat({ WL, build: WL.BUILDS[0], raceKey: 'human', config: cfg, timedDuration: 60, seed: 1,
    ...options, onEvent(e) { events.push({ ...e, at: combat.state.t }); recorder.event(e, combat); } });
  // Force hits except in the explicit miss check; random crits cannot affect whether a clip occurs.
  combat.stats.hitPct = 100;
  const cast = (key, at = combat.readyAt(), target = 1) => {
    combat.update(at, ctx); combat.setTarget(target);
    assert.equal(combat.press(key, ctx).ok, true, key);
    if (combat.state.cast) combat.update(combat.state.cast.end, ctx);
  };
  return { combat, events, recorder, cast };
}
check('precast lands at zero and countdown is excluded from fight time and activity', () => {
  const { combat: c, events, recorder } = setup({ timedDuration: 10 });
  assert.equal(c.startPull(5), true);
  const castTime = c.castTime('shadowBolt');
  c.update(5 - castTime, ctx); assert.equal(c.press('shadowBolt', ctx).ok, true);
  assert.equal(c.state.fightStart, null); assert.equal(c.fightSeconds(), 0);
  c.update(5, ctx);
  close(c.state.fightStart, 5); close(c.result.track.busy, 0);
  assert.ok(c.result.total > 0); close(recorder.data().casts[0].t, -castTime);
  c.update(15, ctx); assert.equal(c.state.over, true); close(c.fightSeconds(), 10);
  assert.equal(events.filter(e => e.type === 'pull').length, 1);
});
check('early landing starts the fight and rebases the precast timeline', () => {
  const { combat: c, recorder } = setup();
  c.startPull(5); c.press('shadowBolt', ctx); const end = c.state.cast.end;
  c.update(end, ctx);
  close(c.state.fightStart, end);
  close(recorder.data().casts[0].t, -end);
});
check('instant, channel and manually sent pet can pull early; Life Tap cannot', () => {
  for (const key of ['baneOfAgony', 'drainLife']) {
    const { combat: c } = setup(); c.startPull(5); c.press(key, ctx);
    close(c.state.fightStart, 0);
  }
  const { combat: c } = setup(); c.startPull(5); c.press('lifeTap', ctx);
  assert.equal(c.state.fightStart, null); c.petCommand('attack', 1); c.update(1, { petDistance: 0 });
  assert.notEqual(c.state.fightStart, null);
});
check('interrupted precast does not start combat at zero; reset cancels countdown', () => {
  const { combat: c, recorder } = setup(); c.startPull(5); c.update(3, ctx); c.press('shadowBolt', ctx);
  c.update(3.5, { ...ctx, moving: true }); c.update(5, ctx);
  assert.equal(c.state.fightStart, null); assert.equal(c.pullLeft(), null); assert.equal(recorder.data().casts[0].stopped, 'moving');
  c.reset(); assert.equal(c.startPull(5), true); c.reset(); c.update(20, ctx);
  assert.equal(c.state.fightStart, null); assert.equal(c.pullLeft(), null);
});
check('invalid and duplicate countdowns are refused', () => {
  const { combat: c } = setup();
  for (const value of [0, -1, 31, Infinity, NaN]) assert.equal(c.startPull(value), false);
  assert.equal(c.startPull(5), true); assert.equal(c.startPull(5), false);
});
check('ordinary pull starts at impact, not the cast bar; interrupted openers never start it', () => {
  const { combat: c, recorder } = setup({ timedDuration: 10 });
  c.update(5, ctx); c.press('shadowBolt', ctx); const end = c.state.cast.end;
  assert.equal(c.state.fightStart, null); assert.equal(c.pet.mode, 'follow');

  c.update(end - 0.01, ctx); assert.equal(c.fightSeconds(), 0);
  c.update(end, ctx); close(c.state.fightStart, end); close(c.fightSeconds(), 0);
  close(c.result.track.busy, 0); close(recorder.data().casts[0].t, 5 - end);
  c.update(end + 10, ctx); assert.equal(c.state.over, true); close(c.fightSeconds(), 10);
  c.reset(); c.press('shadowBolt', ctx); c.update(0.5, { ...ctx, moving: true }); c.update(30, ctx);
  assert.equal(c.state.fightStart, null);
});
check('completed challenges receive normal grades and records with or without a countdown', () => {
  const source = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('function challengeResult()'), source.indexOf('function showReview()'));
  for (const countdown of [false, true]) {
    const { combat, cast } = setup({ timedDuration: 10 });
    if (countdown) combat.startPull(5);
    cast('shadowBolt', countdown ? 5 - combat.castTime('shadowBolt') : 0);
    combat.update(combat.state.fightStart + 10, ctx);
    let saved = 0;
    const scope = { combat, challenge: { name: 'Opener', drill: true, id: 'opener' },
      simResult: { dps: 100 }, challengeOut: null, gradeFor: pct => pct >= 100 ? 'S' : 'D',
      character: { build: { short: 'Demo' }, raceKey: 'human' }, WL: { RACES: { human: { name: 'Human' } } },
      getSetting: () => ({}), setSetting: () => saved++, extras: { refreshDrills() {} }, showBest() {}, shareLink: () => '' };
    vm.runInNewContext(fn + '; result = challengeResult();', scope);
    assert.ok(['S', 'D'].includes(scope.result.grade));
    assert.equal(saved, 1);
    scope.challengeOut = null; scope.combat.state.over = false;
    vm.runInNewContext('result = challengeResult();', scope);
    assert.equal(scope.result.waiting, true);
  }
});
check('a pet cast bar does not pull until its attack lands', () => {
  const { combat: c } = setup({ build: WL.BUILDS[2] });
  c.petCommand('attack', 1); c.update(0.01, { petDistance: 0 });
  assert.equal(c.state.fightStart, null); assert.ok(c.pet.casting);
  const end = c.pet.casting.end; c.update(end, { petDistance: 0 }); close(c.state.fightStart, end);
});
check('successful refresh records remaining ticks on the correct target', () => {
  const { combat: c, cast, recorder } = setup({ targets: 2 });
  cast('corruption', 0, 2); cast('corruption', 3, 2);
  const clip = recorder.data().clips[0];
  assert.equal(clip.target, 2); assert.equal(clip.key, 'corruption');
  close(clip.left, c.spells.corruption.duration - 3);
  assert.equal(clip.ticks, c.table.corruption.ticks - 1); // tick at exactly 3s already landed
});
check('a missed refresh does not clip the existing DoT', () => {
  const { combat: c, cast, recorder } = setup(); cast('corruption', 0); c.stats.hitPct = 0; cast('corruption', 3);
  assert.equal(recorder.data().clips.length, 0); assert.ok(c.dotLeft('corruption') > 0);
});
check('refresh at expiry preserves the final tick and is not a clip', () => {
  const { combat: c, cast, recorder } = setup(); cast('corruption', 0); cast('corruption', c.spells.corruption.duration);
  assert.equal(recorder.data().clips.length, 0); assert.equal(c.result.bySpell.corruption.ticks, c.table.corruption.ticks);
});
check('hybrid refreshes and Bane replacement are clips; Conflagrate consumption is excluded', () => {
  const a = setup({ build: WL.BUILDS[3] }); a.cast('immolate', 0); a.cast('immolate');
  assert.equal(a.recorder.data().clips[0].key, 'immolate');
  a.cast('conflagrate'); assert.equal(a.recorder.data().clips.length, 1);
  const b = setup(); b.cast('baneOfAgony', 0); b.cast('baneOfDoom');
  assert.equal(b.recorder.data().clips[0].replacement, 'baneOfDoom');
});
check('ending mana is captured before post-fight regeneration', () => {
  const { combat: c, recorder, cast } = setup({ timedDuration: 10 }); cast('shadowBolt', 0); c.update(c.state.fightStart + 10, ctx);
  const end = recorder.data().manaEnd.current; c.update(100, ctx);
  assert.equal(recorder.data().manaEnd.current, end); assert.ok(c.state.mana > end);
});

const forecast = { seconds: 100, spend: Array.from({ length: 101 }, (_, i) => i * 120), gains: Array.from({ length: 101 }, (_, i) => i * 10), passive: 10 };
function planner() {
  return { state: { t: 50, fightStart: 0, mana: 1000, targets: [null, { health: 5000 }] }, timed: true,
    result: { total: 5000, track: { busy: 40 } }, fightSeconds: () => 50, timeLeft: () => 50, readyAt: () => 50,
    stats: { maxMana: 7000 }, tapGain: () => 700, gcd: () => 1.5, canTap: () => true,
    build: { rotation: ['corruption', 'shadowBolt'] }, targetCount: 1, alive: () => true,
    table: { corruption: {}, shadowBolt: {} }, spells: { corruption: { kind: 'dot', tickEvery: 3, duration: 18 }, shadowBolt: { kind: 'direct' } },
    dotLeft: () => 2, castTime: key => key === 'shadowBolt' ? 2.5 : 0, cost: () => 300,
    simWould: () => ({ key: 'shadowBolt', action: 'shadowBolt' }) };
}
check('remaining budget subtracts procs and passive regeneration, and scales with duration', () => {
  close(manaBudget(forecast, 50, 50), 5000); close(manaBudget(forecast, 90, 10), 1000);
  close(manaBudget(forecast, 50, 100), 10000); close(manaBudget(forecast, 100, 0), 0);
  assert.equal(manaBudget(null, 50, 50), null); assert.equal(manaBudget(forecast, 0, Infinity), null);
});
check('needed tap fits a DoT gap too short for Shadow Bolt', () => {
  const p = planMana(planner(), { manaForecast: forecast });
  assert.equal(p.status, 'tap-window'); assert.equal(p.taps, 6); assert.equal(p.next.until, 2);
});
check('no tap window with sufficient mana, insufficient health, full mana, imminent expiry or higher priority', () => {
  for (const change of [c => c.state.mana = 6000, c => c.canTap = () => false, c => c.state.mana = 6900,
    c => c.dotLeft = () => 1, c => c.simWould = () => ({ key: 'curseOfElements' }), c => c.castTime = () => 0]) {
    const c = planner(); change(c); assert.notEqual(planMana(c, { manaForecast: forecast }).status, 'tap-window');
  }
});
check('end-of-fight and pet-mana needs are distinguished', () => {
  const c = planner(); c.timeLeft = () => 1;
  assert.equal(planMana(c, { manaForecast: forecast }).status, 'spend');
  c.timeLeft = () => 10; c.state.mana = 5000; c.simWould = () => ({ key: 'lifeTap', action: 'lifeTapPet' });
  assert.equal(planMana(c, { manaForecast: forecast }).status, 'pet');
});
check('health fights use observed pace and label kill time as estimated', () => {
  const c = planner(); c.timed = false;
  const p = planMana(c, { manaForecast: forecast, dps: 9999 });
  assert.equal(p.remaining, 50); assert.equal(p.estimatedTime, true);
  assert.equal(p.timeBasis, 'observed');
});
check('one pet hit followed by idling cannot inflate the mana forecast', () => {
  const c = planner(); c.timed = false; c.fightSeconds = () => 25;
  c.result.total = 179; c.result.track.busy = 0; c.state.targets[1].health = 50822;
  const p = planMana(c, { manaForecast: forecast, dps: 797 });
  close(p.remaining, 50822 / 797); assert.equal(p.timeBasis, 'sim'); assert.ok(p.taps < 20);
  assert.equal(planMana(c, { manaForecast: forecast }), null);
});
check('a sparse opening blends gently toward observed pace', () => {
  const c = planner(); c.timed = false; c.result.track.busy = 10;
  const p = planMana(c, { manaForecast: forecast, dps: 500 });
  assert.equal(p.timeBasis, 'blended'); assert.ok(p.remaining > 10 && p.remaining < 11);
});
check('sustained pet-only damage does not imply full-rotation mana spending at pet DPS', () => {
  const c = planner(); c.timed = false; c.result.total = 6000; c.result.track.busy = 0;
  c.state.targets[1].health = 45000;
  const p = planMana(c, { manaForecast: forecast, dps: 797 });
  assert.equal(p.timeBasis, 'sim'); close(p.remaining, 45000 / 797);
  assert.ok(p.taps < 10);
});
check('brief forecast swings cannot make the displayed count jump', () => {
  const c = planner(), sim = { manaForecast: forecast };
  assert.equal(planMana(c, sim).taps, 6);
  for (let i = 1; i <= 20; i++) {
    c.state.t += 0.25;
    c.timeLeft = () => i % 2 ? 15 : 70;
    assert.equal(planMana(c, sim).taps, 6);
  }
  c.timeLeft = () => 20;
  planMana(c, sim);
  c.state.t += 3;
  assert.equal(planMana(c, sim).taps, 2);
  assert.equal(planMana(c, sim).taps, 2); // repeated render/decision calls
});
check('pending casts reserve their cost without budgeting extra casts during the same time', () => {
  const c = planner(), sim = { manaForecast: forecast };
  c.state.mana = 1900; c.state.cast = { key: 'shadowBolt', cost: 300, target: 1 };
  c.readyAt = () => c.state.t + 2.5;
  const p = planMana(c, sim);
  assert.equal(p.available, 1600); assert.equal(p.needed, 4750);
  assert.equal(p.taps, 5); // previous overlap predicted six
});
check('a changing positive forecast cannot leave the planner hidden at zero', () => {
  const c = planner(), sim = { manaForecast: forecast };
  c.state.mana = 6000;
  assert.equal(planMana(c, sim).taps, 0);
  for (let i = 0; i <= 16; i++) {
    c.state.t = 51 + i * 0.25;
    c.timeLeft = () => i % 2 ? 85 : 75;
    const p = planMana(c, sim);
    if (i >= 12) { assert.equal(p.taps, 1); assert.notEqual(p.status, 'spend'); }
  }
});
check('actual taps count immediately and a reset forgets the old forecast', () => {
  const c = planner(), sim = { manaForecast: forecast };
  assert.equal(planMana(c, sim).taps, 6);
  c.state.t += 4; c.result.track.lifeTaps = 1; c.state.mana += 700;
  assert.equal(planMana(c, sim).taps, 5);
  c.state = { ...c.state, mana: 7000 };
  assert.equal(planMana(c, sim).taps, 0);
});
check('zero-tap visibility settles instead of flickering at the mana boundary', () => {
  const c = planner(), sim = { manaForecast: forecast };
  c.state.mana = 4900;
  assert.equal(planMana(c, sim).taps, 1);
  c.state.t++; c.state.mana = 5100;
  assert.notEqual(planMana(c, sim).status, 'spend');
  c.state.t += 3;
  assert.equal(planMana(c, sim).status, 'spend');
});
check('crossing the old activity threshold does not switch kill-time estimates', () => {
  const c = planner(); c.timed = false; c.result.track.busy = 25;
  const sim = { manaForecast: forecast, dps: 800 };
  const before = planMana(c, sim);
  c.state.t += 2; c.fightSeconds = () => 52;
  const after = planMana(c, sim);
  assert.ok(Math.abs(after.remaining - before.remaining) < 1);
  assert.equal(after.taps, before.taps);
});
check('review exposes clips, missed tap windows and late taps with timestamps', () => {
  const p = planMana(planner(), { manaForecast: forecast });
  const d = { seconds: 60, complete: true, targets: 1, hasPet: false, spells: { corruption: { name: 'Corruption' } },
    result: { total: 5000, track: { busy: 50, uptime: {} } }, record: { moves: [],
      manaEnd: { current: 700, max: 7000 }, clips: [{ t: 12, key: 'corruption', replacement: 'corruption', target: 1, left: 2, ticks: 1 }],
      casts: [{ t: 10, key: 'shadowBolt', len: 2.5, manaPlan: p }, { t: 55, key: 'lifeTap', manaGained: 700, manaPlan: { ...p, remaining: 5, status: 'spend' } }] } };
  const a = analyzeFight(d);
  assert.ok(a.findings.some(f => f.id === 'dot-clips')); assert.ok(a.findings.some(f => f.id === 'tap-windows'));
  assert.ok(a.findings.some(f => f.id === 'late-taps')); assert.equal(a.manaEnd.current, 700);
  assert.equal(timestamp(-2.5), '−0:02.5'); assert.equal(timestamp(59.99), '1:00.0');
});
check('spell crit percentages include ticks, exclude misses and handle averaged sim counts', () => {
  assert.equal(spellCritPercent({ hits: 10, crits: 3, misses: 2 }), '30.0%');
  assert.equal(spellCritPercent({ hits: 2, crits: 1, ticks: 8, tickCrits: 1 }), '20.0%');
  assert.equal(spellCritPercent({ hits: 2.5, crits: 0.5 }), '20.0%');
  assert.equal(spellCritPercent({ casts: 3 }), '—');
  assert.equal(spellCritPercent(undefined), '—');
});
check('recorder captures damage evidence including the opening hit and clears on reset', () => {
  const { combat, cast, recorder } = setup();
  cast('shadowBolt', 0);
  const hits = recorder.data().damage;
  assert.ok(hits.length > 0); assert.equal(hits[0].t, 0);
  close(hits.reduce((n, e) => n + e.amount, 0), combat.result.total);
  recorder.reset(); assert.equal(recorder.data().damage.length, 0);
});
check('real worker builds finite mana forecasts for every ready build and race', () => {
  const source = fs.readFileSync(new URL('../js/sim-worker.js', import.meta.url), 'utf8');
  let answer;
  const worker = { WL, location: { search: '' }, postMessage: value => { answer = value; } };
  const scope = { self: worker, importScripts() {}, XMLHttpRequest: class { open() {} send() { this.responseText = '{"files":[]}'; } } };
  vm.runInNewContext(source, scope);
  for (const build of WL.BUILDS) for (const race of WL.RACE_KEYS) {
    worker.onmessage({ data: { id: 1, build, race, config: copy(WL.DEFAULT_CONFIG), timed: true, seconds: 60, targets: 1 } });
    assert.ok(answer.manaForecast, build.name + ' ' + race);
    assert.ok(Number.isFinite(manaBudget(answer.manaForecast, 30, 30)));
    assert.ok(answer.manaForecast.spend.at(-1) > 0);
    for (const row of Object.values(answer.bySpell)) {
      for (const field of ['hits', 'crits', 'ticks', 'tickCrits']) assert.ok(Number.isFinite(row[field]), field);
      assert.ok(row.crits <= row.hits && row.tickCrits <= row.ticks);
    }
  }
});
console.log(checks + ' training checks passed.');
