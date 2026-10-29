// Watch your fight again: while a fight runs this keeps where you, your demon and the dummies were ten times a
// second, and what happened when; after the fight the review's "Watch it again" plays it back in the room, with a
// slider to go to any moment. main.js moves the models and plays the spell looks; this file keeps the record and
// runs the bar at the bottom (play, pause, speed, the slider).

const STEP = 0.1;                                          // seconds between two samples
// What of an event the replay needs to show it again (numbers, bolts, bursts, deaths).
const FIELDS = ['type', 'key', 'target', 'amount', 'crit', 'pet', 'school', 'castTime', 'channel', 'last', 'timed', 'stopped', 'source', 'reason', 'glance', 'died', 'fx'];
// bossfx: a look of a boss fight (her breath, a fireball, the lava ...), with what js/boss.js needs to play it again.
const SHOWN = { cast: 1, hit: 1, tick: 1, miss: 1, havoc: 1, apply: 1, death: 1, interrupt: 1, mana: 1, proc: 1, bossfx: 1 };

function byId(id) { return document.getElementById(id); }
function clockText(t) { const s = Math.max(0, t); return Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2); }

// handlers: onClose() (back to the review), onSeek() (the slider jumped: start the looks afresh),
//           mix(a, b, f) (optional: blends the `boss` part of two samples - a boss fight's creatures)
export function createReplay(handlers) {
  let samples = [], events = [], next = 0;
  const state = { active: false, t: 0, playing: false, speed: 1, seconds: 0, from: 0, cursor: 0 };

  // ---------- the record ----------
  function reset() { samples = []; events = []; next = 0; }
  // t: seconds into the fight; s: { x, z, yaw, h, mv, pet: { x, z, yaw, mv } or null, hp: [per dummy 0..1], gone: [absent],
  //    dead: [fallen], cast: { key, target, p (0..1), ch } or null, mana: 0..1, dmg: damage so far }
  // last: the fight's very end, kept even when it comes sooner than the next sample is due.
  function sample(t, last, s) {
    if (t < next - 1e-6 && !last) return;
    next = t + STEP;
    s.t = t;
    samples.push(s);
  }
  function event(t, e) {
    if (!SHOWN[e.type] || e.type === 'mana' && e.source !== 'Life Tap') return;
    const copy = { t: t };
    FIELDS.forEach(function (f) { if (e[f] !== undefined) copy[f] = e[f]; });
    events.push(copy);
  }
  function has() { return samples.length > 2; }

  // The sample at second t, blended between its two neighbours (the angle the short way round).
  function at(t) {
    if (!samples.length) return null;
    let lo = 0, hi = samples.length - 1;
    if (t <= samples[0].t) return samples[0];
    if (t >= samples[hi].t) return samples[hi];
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (samples[mid].t <= t) lo = mid; else hi = mid; }
    const a = samples[lo], b = samples[hi], f = (t - a.t) / Math.max(1e-6, b.t - a.t);
    const mix = function (p, q) { return p + (q - p) * f; };
    const turn = function (p, q) { let d = q - p; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return p + d * f; };
    return { t: t, x: mix(a.x, b.x), z: mix(a.z, b.z), yaw: turn(a.yaw, b.yaw), h: mix(a.h, b.h), mv: a.mv,
             pet: a.pet && b.pet ? { x: mix(a.pet.x, b.pet.x), z: mix(a.pet.z, b.pet.z), yaw: turn(a.pet.yaw, b.pet.yaw), mv: a.pet.mv } : a.pet,
             hp: a.hp, dead: a.dead, gone: a.gone, cast: a.cast && b.cast && a.cast.key === b.cast.key ? Object.assign({}, a.cast, { p: mix(a.cast.p, b.cast.p) }) : a.cast,
             mana: mix(a.mana, b.mana), dmg: mix(a.dmg, b.dmg),
             life: a.life, boss: a.boss && b.boss && handlers.mix ? handlers.mix(a.boss, b.boss, f) : a.boss };
  }
  // The events from just after `from` up to and including `to`.
  function between(from, to) { return events.filter(function (e) { return e.t > from && e.t <= to; }); }

  // ---------- the bar ----------
  const bar = byId('replayBar'), play = byId('replayPlay'), slider = byId('replaySlider'), time = byId('replayTime'), what = byId('replayWhat');
  const speeds = Array.prototype.slice.call(bar.querySelectorAll('[data-speed]'));
  function showPlay() { play.textContent = state.playing ? 'Pause' : state.t >= state.seconds - 0.01 ? 'From the start' : 'Play'; }
  function showTime() {
    slider.value = String(Math.round(1000 * (state.t - state.from) / Math.max(0.01, state.seconds - state.from)));
    time.textContent = clockText(state.t) + ' / ' + clockText(state.seconds);
  }
  play.addEventListener('click', function () {
    play.blur();
    if (!state.playing && state.t >= state.seconds - 0.01) { state.t = state.from; state.cursor = state.t; handlers.onSeek(); }
    state.playing = !state.playing;
    showPlay();
  });
  slider.addEventListener('input', function () {
    state.t = state.from + (state.seconds - state.from) * Number(slider.value) / 1000;
    state.cursor = state.t;
    time.textContent = clockText(state.t) + ' / ' + clockText(state.seconds);
    handlers.onSeek();
    showPlay();
  });
  slider.addEventListener('change', function () { slider.blur(); });
  speeds.forEach(function (b) {
    b.addEventListener('click', function () {
      b.blur();
      state.speed = Number(b.dataset.speed);
      speeds.forEach(function (o) { o.classList.toggle('on', o === b); });
    });
  });
  byId('replayClose').addEventListener('click', function () { byId('replayClose').blur(); handlers.onClose(); });

  return {
    state: state, reset: reset, sample: sample, event: event, has: has, at: at, between: between,
    // Starts watching: from the first sample (a precast may begin before second 0) to the end of the fight.
    open: function (seconds) {
      state.active = true; state.from = Math.min(0, samples[0].t); state.t = state.from; state.cursor = state.t;
      state.seconds = Math.max(seconds, samples[samples.length - 1].t); state.playing = true;
      document.documentElement.classList.add('replaying');
      bar.hidden = false;
      showPlay(); showTime();
    },
    close: function () { state.active = false; state.playing = false; document.documentElement.classList.remove('replaying'); bar.hidden = true; },
    // Moves the clock on (dt: seconds of real time). Returns the events that happened on the way.
    advance: function (dt) {
      if (!state.playing) return [];
      const was = state.cursor;
      state.t = Math.min(state.seconds, state.t + dt * state.speed);
      state.cursor = state.t;
      if (state.t >= state.seconds) { state.playing = false; showPlay(); }
      showTime();
      return between(was, state.t);
    },
    // What you were doing at this moment, in words (under the slider).
    say: function (text) { if (what.textContent !== text) what.textContent = text; }
  };
}
