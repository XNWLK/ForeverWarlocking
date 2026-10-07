// Sounds, made on the spot (no sound files). Quiet by design; the Sound button turns them off and the volume
// slider in the bar on the right sets how loud they are. Browsers only let a page make sound after you have
// pressed or clicked something.
//
// What they are modelled on: a spell in the game is mostly air - a breathy swirl while you cast, a whoosh when it
// leaves, a muffled burst when it lands, a crackle for fire. So nearly everything here is hiss shaped by a filter;
// tones are only used for the weight of an impact (a short thump that sinks), for the eerie voice of a curse, and
// for the interface. Nothing rises in pitch while you cast, and damage over time is silent, as in the game.
//
// The volumes in the recipes are balanced so that every sound comes out about equally loud for its role
// (measure() below works that out without playing anything): hits in front, the rest behind them.

// While you cast or channel: layers of hiss, each through its own filter, each swaying or fluttering at random.
//   at = the filter's pitch in Hz, sway = how often it drifts a second and by how many Hz,
//   flutter = how often the loudness trembles a second, depth = by how much (0 to 1).
const LOOPS = {
  // A hollow, breathy wind with a whisper on top.
  shadow: { level: 1.4, layers: [
    { type: 'bandpass', at: 250, q: 8, level: 1, sway: 0.8, by: 45, flutter: 1.1, depth: 0.5 },
    { type: 'bandpass', at: 520, q: 6, level: 0.5, sway: 1.3, by: 110, flutter: 1.7, depth: 0.6 },
    { type: 'bandpass', at: 1400, q: 4, level: 0.14, sway: 2.1, by: 500, flutter: 2.6, depth: 0.7 }] },
  // A low flame that flutters, with crackles.
  fire: { level: 0.5, layers: [
    { type: 'lowpass', at: 430, q: 0.5, level: 1, flutter: 9, depth: 0.7 },
    { type: 'bandpass', at: 1100, q: 0.9, level: 0.22, flutter: 13, depth: 0.8 },
    { crackle: true, type: 'highpass', at: 2200, q: 0.7, level: 0.3 }] },
  // Drain Life: the same wind, pulled toward you in slow gulps.
  drain: { level: 1.55, layers: [
    { type: 'bandpass', at: 300, q: 8, level: 0.8, sway: 1.2, by: 60, flutter: 1.4, depth: 0.7 },
    { type: 'bandpass', at: 640, q: 5, level: 0.7, sway: 1.6, by: 240, flutter: 1.9, depth: 0.8 },
    { type: 'bandpass', at: 1900, q: 5, level: 0.16, sway: 1.6, by: 700, flutter: 2.4, depth: 0.8 }] }
};

// One set of building blocks for one audio context (the live one, or an offline one for measuring).
function kit(audio, out) {
  const rate = audio.sampleRate;
  let seed = 12345, shift = 1;                              // the same hiss every time, so measuring is repeatable
  function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
  function buffer(seconds, fill) {
    const made = audio.createBuffer(1, Math.round(rate * seconds), rate);
    fill(made.getChannelData(0));
    return made;
  }
  // Plain hiss.
  const hiss = buffer(1, function (d) { for (let i = 0; i < d.length; i++) d[i] = rnd() * 2 - 1; });
  // Crackle: silence with about sixteen pops a second, each a few milliseconds of hiss dying away.
  const crackle = buffer(2, function (d) {
    const fade = Math.exp(-1 / (0.009 * rate));
    let level = 0;
    for (let i = 0; i < d.length; i++) {
      if (rnd() < 16 / rate) level = 0.25 + 0.75 * rnd();
      d[i] = (rnd() * 2 - 1) * level;
      level *= fade;
    }
  });
  // A slow random drift between -1 and 1 (sixteen turning points a second), for swaying and fluttering.
  const wander = buffer(4, function (d) {
    const points = [], step = d.length / 64;
    for (let p = 0; p < 64; p++) points.push(rnd() * 2 - 1);
    for (let i = 0; i < d.length; i++) {
      const at = i / step, a = Math.floor(at) % 64, b = (a + 1) % 64, mix = (1 - Math.cos((at - Math.floor(at)) * Math.PI)) / 2;
      d[i] = points[a] + (points[b] - points[a]) * mix;
    }
  });

  // Moves an audio setting about at random, roughly perSecond times a second, by up to amount either way.
  function drift(perSecond, setting, amount, at) {
    const src = audio.createBufferSource(), gain = audio.createGain();
    src.buffer = wander; src.loop = true;
    src.playbackRate.value = perSecond / 6;
    gain.gain.value = amount;
    src.connect(gain); gain.connect(setting);
    src.start(at, (perSecond * 1.37) % 4);
    return src;
  }
  function envelope(volume, seconds, delay, attack) {
    const gain = audio.createGain(), t = audio.currentTime + (delay || 0);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(attack || 0.012, seconds * 0.9));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    gain.connect(out);
    return { gain: gain, at: t };
  }
  // A tone that slides from one pitch to another.
  function tone(shape, from, to, seconds, volume, delay, attack) {
    const env = envelope(volume, seconds, delay, attack), osc = audio.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from * shift, env.at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to * shift), env.at + seconds);
    osc.connect(env.gain);
    osc.start(env.at);
    osc.stop(env.at + seconds + 0.02);
  }
  // Hiss (or crackle) through a filter that slides: { type, from, to, seconds, volume, delay, q, attack, crackle,
  // flutter (times a second), depth (0 to 1) }.
  function air(o) {
    const env = envelope(o.volume, o.seconds, o.delay, o.attack), src = audio.createBufferSource(), filter = audio.createBiquadFilter();
    src.buffer = o.crackle ? crackle : hiss;
    src.loop = true;
    filter.type = o.type || 'bandpass';
    filter.Q.value = o.q || (o.type && o.type !== 'bandpass' ? 0.7 : 1.2);
    filter.frequency.setValueAtTime(o.from * shift, env.at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, (o.to || o.from) * shift), env.at + o.seconds);
    src.connect(filter);
    const stopAt = env.at + o.seconds + 0.02;
    if (o.flutter) {
      const depth = o.depth == null ? 0.6 : o.depth, tremble = audio.createGain();
      tremble.gain.value = 1 - depth / 2;
      const mover = drift(o.flutter, tremble.gain, depth / 2, env.at);
      mover.stop(stopAt);
      filter.connect(tremble); tremble.connect(env.gain);
    } else filter.connect(env.gain);
    src.start(env.at, (o.from * 7 * shift % 900) / 1000);
    src.stop(stopAt);
  }
  // The sound of a cast or channel (see LOOPS). It comes in softly, swells a little until the cast should be over,
  // and holds until it is stopped - the pitch never moves.
  function loop(kind, seconds) {
    const recipe = LOOPS[kind] || LOOPS.shadow, t = audio.currentTime, all = audio.createGain(), running = [];
    const due = t + Math.max(0.4, seconds || 0);
    all.gain.setValueAtTime(0.0001, t);
    all.gain.exponentialRampToValueAtTime(recipe.level * 0.75, t + 0.25);
    all.gain.linearRampToValueAtTime(recipe.level, due);
    all.connect(out);
    recipe.layers.forEach(function (l, i) {
      const src = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
      src.buffer = l.crackle ? crackle : hiss;
      src.loop = true;
      filter.type = l.type; filter.Q.value = l.q; filter.frequency.value = l.at;
      gain.gain.value = l.level * (l.flutter ? 1 - l.depth / 2 : 1);
      if (l.sway) running.push(drift(l.sway, filter.frequency, l.by, t));
      if (l.flutter) running.push(drift(l.flutter, gain.gain, l.level * l.depth / 2, t));
      src.connect(filter); filter.connect(gain); gain.connect(all);
      src.start(t, i * 0.31);
      running.push(src);
    });
    running.forEach(function (node) { node.stop(due + 6); });   // never left running, whatever happens
    return {
      stop: function (fast) {
        const now = audio.currentTime;
        try {
          all.gain.cancelScheduledValues(now);
          all.gain.setValueAtTime(Math.max(0.0001, all.gain.value), now);
          all.gain.exponentialRampToValueAtTime(0.0001, now + (fast ? 0.05 : 0.2));
          running.forEach(function (node) { node.stop(now + 0.3); });
        } catch (e) { /* already stopped */ }
      }
    };
  }
  return { tone: tone, air: air, loop: loop, vary: function (by) { shift = by; } };
}

// name: function (k) - k.tone(shape, from Hz, to Hz, seconds, volume, delay, attack) and k.air({ ... }), see above.
const SOUNDS = {
  // A bolt leaves your staff: a short whoosh.
  boltShadow: function (k) {
    k.air({ from: 520, to: 1300, seconds: 0.16, volume: 0.6, attack: 0.08 });
    k.air({ type: 'lowpass', from: 1300, to: 260, seconds: 0.42, volume: 0.36, delay: 0.05 });
    k.tone('sine', 90, 55, 0.16, 0.12);
  },
  boltFire: function (k) {
    k.air({ from: 600, to: 2400, seconds: 0.22, volume: 0.75, q: 0.9, attack: 0.1 });
    k.air({ type: 'lowpass', from: 2000, to: 400, seconds: 0.4, volume: 0.17, delay: 0.08 });
    k.air({ crackle: true, type: 'highpass', from: 2000, seconds: 0.3, volume: 0.5 });
  },
  // Something lands: a muffled burst with some weight under it and a tail that trails off.
  hitShadow: function (k) {
    k.air({ type: 'lowpass', from: 1100, to: 140, seconds: 0.38, volume: 0.53 });
    k.tone('sine', 105, 44, 0.24, 0.33);
    k.air({ from: 2600, to: 900, seconds: 0.5, volume: 0.38, q: 1.5, delay: 0.03 });
  },
  hitFire: function (k) {
    k.air({ type: 'lowpass', from: 1800, to: 220, seconds: 0.42, volume: 0.42 });
    k.tone('sine', 96, 40, 0.26, 0.28);
    k.air({ crackle: true, type: 'highpass', from: 1800, seconds: 0.5, volume: 1, delay: 0.04 });
  },
  // On top of a hit that crits: more weight, no jingle.
  big: function (k) {
    k.tone('sine', 70, 30, 0.55, 0.2);
    k.air({ type: 'lowpass', from: 500, to: 70, seconds: 0.6, volume: 0.4 });
  },
  // Corruption and Siphon Life take hold: a wet, gurgling hiss.
  rot: function (k) {
    k.air({ from: 1700, to: 420, seconds: 0.6, volume: 1.75, q: 2.2, attack: 0.06, flutter: 22, depth: 0.8 });
    k.air({ type: 'lowpass', from: 380, to: 160, seconds: 0.4, volume: 0.35, attack: 0.05 });
  },
  // A curse or bane: two voices a hair apart that sink, and a breath.
  curse: function (k) {
    k.tone('sine', 494, 330, 0.75, 0.055, 0, 0.18);
    k.tone('sine', 501, 327, 0.75, 0.055, 0, 0.18);
    k.air({ from: 1500, to: 520, seconds: 0.75, volume: 0.7, q: 4.5, attack: 0.2, flutter: 5, depth: 0.5 });
  },
  // Immolate catches: a rush of flame, then it burns.
  ignite: function (k) {
    k.air({ from: 500, to: 2600, seconds: 0.3, volume: 0.75, q: 0.8, attack: 0.16 });
    k.air({ type: 'lowpass', from: 900, to: 300, seconds: 0.55, volume: 0.3, delay: 0.1, flutter: 11, depth: 0.7 });
    k.air({ crackle: true, type: 'highpass', from: 1900, seconds: 0.6, volume: 0.7, delay: 0.1 });
  },
  // Life Tap: a dull pull, then mana rushing in.
  lifeTap: function (k) {
    k.tone('sine', 120, 52, 0.22, 0.2);
    k.air({ type: 'lowpass', from: 500, to: 180, seconds: 0.25, volume: 0.24 });
    k.air({ from: 500, to: 2600, seconds: 0.5, volume: 0.75, q: 3, delay: 0.08, attack: 0.38 });
    k.tone('sine', 880, 880, 0.6, 0.035, 0.3, 0.05);
    k.tone('sine', 1320, 1320, 0.5, 0.02, 0.34, 0.05);
  },
  // A proc (Shadow Trance, Decimation ...): a soft chord that rings out.
  proc: function (k) {
    k.tone('sine', 659, 659, 0.7, 0.05, 0, 0.03);
    k.tone('sine', 988, 988, 0.6, 0.035, 0.03, 0.03);
    k.tone('sine', 1319, 1319, 0.5, 0.02, 0.06, 0.03);
    k.air({ type: 'highpass', from: 3200, seconds: 0.5, volume: 0.1, attack: 0.2 });
  },
  // A cast that was stopped fizzles out.
  fizzle: function (k) {
    k.air({ from: 2800, to: 500, seconds: 0.32, volume: 0.55, q: 1, flutter: 28, depth: 0.8 });
    k.tone('sine', 380, 150, 0.25, 0.04);
  },
  miss: function (k) { k.air({ from: 900, to: 2100, seconds: 0.2, volume: 0.36, q: 1.5, attack: 0.08 }); },
  pushback: function (k) { k.air({ type: 'lowpass', from: 420, to: 130, seconds: 0.1, volume: 0.3 }); k.tone('sine', 130, 85, 0.08, 0.14); },
  // The pet: a whip crack or a claw for the Succubus, a small puff of fire where the Imp's bolt lands.
  pet: function (k) { k.air({ type: 'highpass', from: 3500, seconds: 0.06, volume: 0.21 }); k.air({ type: 'lowpass', from: 600, to: 200, seconds: 0.09, volume: 0.21 }); },
  petHit: function (k) { k.air({ from: 1400, to: 420, seconds: 0.2, volume: 0.3 }); k.air({ crackle: true, type: 'highpass', from: 2000, seconds: 0.22, volume: 0.4 }); },
  death: function (k) { k.tone('sine', 110, 30, 0.9, 0.21, 0, 0.05); k.air({ type: 'lowpass', from: 600, to: 70, seconds: 0.75, volume: 0.34 }); },
  // The interface: short, soft, well behind the fight.
  error: function (k) { k.tone('sine', 150, 112, 0.14, 0.15); k.air({ type: 'lowpass', from: 350, seconds: 0.05, volume: 0.15 }); },
  move: function (k) { k.tone('sine', 587, 587, 0.12, 0.16); k.tone('sine', 587, 587, 0.12, 0.16, 0.16); },
  warn: function (k) { k.tone('sine', 440, 440, 0.13, 0.14); k.tone('sine', 554, 554, 0.17, 0.14, 0.14); },
  fightEnd: function (k) { k.tone('sine', 392, 392, 0.3, 0.1); k.tone('sine', 523, 523, 0.3, 0.1, 0.14); k.tone('sine', 659, 659, 0.5, 0.11, 0.28); },
  best: function (k) { [523, 659, 784, 1047].forEach(function (f, i) { k.tone('sine', f, f, 0.3, 0.12, i * 0.11); }); k.tone('sine', 2093, 2093, 0.5, 0.03, 0.33); }
};
// These always sound the same; the others are played a touch higher or lower each time, as no two hits are alike.
const STEADY = { proc: 1, error: 1, move: 1, warn: 1, fightEnd: 1, best: 1 };

export function createSound(startOn, startVolume) {
  let on = startOn, volume = startVolume == null ? 0.6 : startVolume, audio = null, master = null, tools = null, hum = null;

  function ready() {
    if (!on) return false;
    if (!audio) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { on = false; return false; }
      audio = new Ctor();
      // Everything goes through one limiter, so many sounds at once (three dummies hit, a crit, a pet) get
      // quieter together instead of crackling.
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -14; limiter.knee.value = 10; limiter.ratio.value = 8; limiter.attack.value = 0.003; limiter.release.value = 0.2;
      master = audio.createGain();
      master.gain.value = 0.5 * volume;
      master.connect(limiter);
      limiter.connect(audio.destination);
      tools = kit(audio, master);
    }
    if (audio.state === 'suspended') audio.resume();
    return audio.state === 'running';
  }

  function stopHum(fast) {
    if (!hum) return;
    hum.stop(fast);
    hum = null;
  }

  return {
    play: function (name) {
      if (!SOUNDS[name] || !ready()) return;
      tools.vary(STEADY[name] ? 1 : 0.93 + Math.random() * 0.14);
      SOUNDS[name](tools);
    },
    // kind: 'shadow', 'fire' or 'drain'; seconds: how long the cast or channel should take.
    casting: function (kind, seconds) {
      if (!ready()) return;
      stopHum(true);
      hum = tools.loop(kind, seconds);
    },
    stopCasting: function () { if (audio) stopHum(false); },
    setOn: function (value) { on = value; if (!on && audio) { stopHum(true); if (audio.state === 'running') audio.suspend(); } },
    isOn: function () { return on; },
    // 0 to 1
    setVolume: function (value) { volume = Math.max(0, Math.min(1, value)); if (master) master.gain.setTargetAtTime(0.5 * volume, audio.currentTime, 0.02); },
    names: function () { return Object.keys(SOUNDS); },
    // How loud each sound is, worked out without playing it: { name: { peak, loud } } (loud = the loudest 50 ms on
    // average, which is what the ear goes by; for the casting sounds, listed as 'loop:shadow' and so on, the
    // average over two seconds). For balancing the recipes.
    measure: function () {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Offline) return Promise.resolve({});
      const out = {};
      const jobs = Object.keys(SOUNDS).map(function (name) { return { name: name, seconds: 1.5, make: function (k) { SOUNDS[name](k); } }; })
        .concat(Object.keys(LOOPS).map(function (kind) { return { name: 'loop:' + kind, seconds: 2.5, whole: true, make: function (k) { k.loop(kind, 2); } }; }));
      return jobs.reduce(function (chain, job) {
        return chain.then(function () {
          const ctx = new Offline(1, 44100 * job.seconds, 44100);
          job.make(kit(ctx, ctx.destination));
          return ctx.startRendering().then(function (buffer) {
            const d = buffer.getChannelData(0), win = 2205;
            let peak = 0, loud = 0, all = 0;
            for (let i = 0; i < d.length; i++) { peak = Math.max(peak, Math.abs(d[i])); all += d[i] * d[i]; }
            for (let s = 0; s + win <= d.length; s += win >> 1) {
              let sum = 0;
              for (let i = s; i < s + win; i++) sum += d[i] * d[i];
              loud = Math.max(loud, Math.sqrt(sum / win));
            }
            if (job.whole) loud = Math.sqrt(all / d.length);
            out[job.name] = { peak: Math.round(peak * 1000) / 1000, loud: Math.round(loud * 1000) / 1000 };
          });
        });
      }, Promise.resolve()).then(function () { return out; });
    }
  };
}
