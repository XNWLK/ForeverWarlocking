import assert from 'node:assert/strict';
import { inspectInterval } from '../js/interval.js';
import { analyzeFight } from '../js/analysis.js';
import { createRecorder } from '../js/record.js';

function data(overrides = {}) {
  return Object.assign({ seconds: 20, complete: true, targets: 1, hasPet: false,
    spells: { corruption: { name: 'Corruption' }, shadowBolt: { name: 'Shadow Bolt' } },
    result: { total: 1000, track: { busy: 10, uptime: {}, petActive: 20 } },
    record: { casts: [{ t: 0, key: 'shadowBolt', len: 2, gcd: 1.5 }], moves: [] }, sim: null }, overrides);
}
let count = 0;
function check(name, fn) { fn(); count++; console.log('OK: ' + name); }
check('forced movement is subtracted once, including overlapping windows', () => {
  const d = data({ record: { casts: [{ t: 0, len: 2, gcd: 1.5 }], moves: [[4, 8], [6, 10], [15, 30]] } });
  const a = analyzeFight(d);
  assert.equal(a.idleSeconds, 7); // 2..4, 10..15
  assert.equal(a.findings[0].events[0].t, 10);
});
check('GCD occupancy and casts extending past the end are not idle', () => {
  const a = analyzeFight(data({ seconds: 4, record: { casts: [{ t: 0, len: 0, gcd: 1.5 }, { t: 1.5, len: 9, gcd: 1.5 }], moves: [] } }));
  assert.equal(a.idleSeconds, 0); assert.equal(a.findings.length, 0);
});
check('off-GCD actions do not conceal an idle gap', () => {
  const a = analyzeFight(data({ record: { casts: [{ t: 0, len: 2, gcd: 1.5 }, { t: 4, len: 10, off: true }], moves: [] } }));
  assert.equal(a.idleSeconds, 18);
});
check('live snapshots do not compare partial uptime to a full fight', () => {
  const a = analyzeFight(data({ complete: false, sim: { uptime: { 'dot:corruption': 95 } } }));
  assert.equal(a.findings.some(f => f.id.startsWith('uptime-')), false);
});
check('uptime findings respect spell, target and benchmark thresholds', () => {
  const d = data({ targets: 2, sim: { uptime: { 'dot:corruption': 90, 'dot2:corruption': 90, 'dot3:corruption': 99, 'dot:unknown': 99 } } });
  d.result.track.uptime = { '1:corruption': 17, '2:corruption': 4 };
  const findings = analyzeFight(d).findings.filter(f => f.id.startsWith('uptime-'));
  assert.deepEqual(findings.map(f => f.id), ['uptime-2-corruption']);
  assert.equal(findings[0].severity, 'compare');
});
check('unused spells do not create uptime penalties; attempted applications still qualify', () => {
  const d = data({ sim: { uptime: { 'dot:corruption': 90, coe: 95 } } });
  assert.equal(analyzeFight(d).uptime.length, 0);
  d.record.casts.push({ key: 'corruption', target: 1, t: 3, len: 0, gcd: 1.5 });
  assert.deepEqual(analyzeFight(d).uptime.map(u => u.key), ['corruption']);
  d.targets = 2; d.sim.uptime['dot2:corruption'] = 90;
  assert.equal(analyzeFight(d).uptime.length, 1);
});
check('intentional channel clipping is not called a movement interruption', () => {
  const a = analyzeFight(data({ record: { casts: [{ t: 0, key: 'shadowBolt', len: 2, gcd: 1.5, stopped: 'clipped' }], moves: [] } }));
  assert.equal(a.findings.some(f => f.id === 'interrupts'), false);
});
check('zero duration produces finite metrics', () => {
  const a = analyzeFight(data({ seconds: 0 }));
  assert.equal(a.activity, 0); assert.equal(a.dps, 0); assert.equal(a.idleSeconds, 0);
});
check('recorder excludes pre-pull taps and retains interruptions after a racial', () => {
  const recorder = createRecorder();
  let t = 0;
  const combat = { state: { fightStart: null }, fightSeconds: () => t, gcd: () => 1.5, racial: () => ({ name: 'Test racial' }) };
  recorder.event({ type: 'cast', key: 'lifeTap' }, combat);
  assert.equal(recorder.data().casts.length, 0);
  combat.state.fightStart = 0;
  recorder.event({ type: 'cast', key: 'shadowBolt', castTime: 3 }, combat);
  t = 1; recorder.event({ type: 'used', name: 'Test racial' }, combat);
  t = 1.2; recorder.event({ type: 'interrupt', key: 'shadowBolt', reason: 'moving' }, combat);
  const cast = recorder.data().casts[0];
  assert.equal(cast.len, 1.2); assert.equal(cast.stopped, 'moving');
});
check('missed channels retain only the GCD and empty taps carry evidence', () => {
  const recorder = createRecorder();
  const combat = { state: { fightStart: 0 }, fightSeconds: () => 0, gcd: () => 1.5, racial: () => null };
  recorder.event({ type: 'cast', key: 'drainLife', channel: 5 }, combat);
  recorder.event({ type: 'miss', key: 'drainLife' }, combat);
  assert.equal(recorder.data().casts[0].len, 0);
  recorder.event({ type: 'cast', key: 'lifeTap' }, combat);
  recorder.event({ type: 'mana', source: 'Life Tap', amount: 0 }, combat);
  const a = analyzeFight(data({ record: recorder.data() }));
  assert.equal(a.findings.find(f => f.id === 'taps').events.length, 1);
});


check('interval inspector clips occupancy, merges movement and separates damage sources', () => {
  const d = { seconds: 10, sim: { curve: [0,100,200,300,400,500,600,700,800,900,1000] }, record: {
    damage: [{ t: 2, key: 'shadowBolt', type: 'hit', amount: 300, crit: true },
      { t: 3, key: 'pet:firebolt', type: 'hit', amount: 100 },
      { t: 4, key: 'corruption', type: 'tick', amount: 50 },
      { t: 5, key: 'shadowBolt', type: 'miss', amount: 0 },
      { t: 8, key: 'shadowBolt', type: 'hit', amount: 900 }],
    casts: [{ t: 0, len: 3, gcd: 1.5, key: 'shadowBolt' }, { t: 4, len: 0, gcd: 1.5, key: 'lifeTap' },
      { t: 7, len: 3, gcd: 1.5, key: 'shadowBolt' }], moves: [[3,4], [3.5,4.5]],
    auras: { '1:corruption': [[1,5], [4,7]] } } };
  const a = inspectInterval(d, 2, 8);
  assert.equal(a.damage, 450); assert.equal(a.dps, 75); assert.equal(a.simDps, 100);
  assert.equal(a.busy, 3.5); assert.equal(a.idle, 1.5); assert.equal(a.movement, 1.5);
  assert.equal(a.petDamage, 100); assert.equal(a.tickDamage, 50);
  assert.equal(a.bySpell.shadowBolt.crits, 1); assert.equal(a.bySpell.shadowBolt.misses, 1);
  assert.equal(a.windups.length, 1); assert.equal(a.uptimes[0].seconds, 5);
  assert.equal(inspectInterval(d, 8, 10).damage, 900);
  assert.equal(inspectInterval(d, 5, 5).dps, 0);
});

console.log(count + ' coaching checks passed.');
