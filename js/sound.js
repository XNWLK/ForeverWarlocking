// Sounds, made on the spot from simple tones and hiss (no sound files). Quiet by design; the Sound button turns
// them off and the volume slider in the bar on the right sets how loud they are. Browsers only let a page make
// sound after you have pressed or clicked something.
//
// Every sound is a short recipe of two building blocks: a tone that slides from one pitch to another, and hiss
// through a filter that slides (whooshes, crackles, thuds). The numbers in a recipe's volume are balanced so that
// every sound comes out about equally loud for its role (measure() below works that out without playing anything):
// hits and casts in front, ticks and interface blips behind them.

// One set of building blocks for one audio context (the live one, or an offline one for measuring).
function kit(audio, out) {
  const hiss = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);   // one second of hiss, reused
  const data = hiss.getChannelData(0);
  let seed = 12345;                                         // the same hiss every time, so measuring is repeatable
  for (let i = 0; i < data.length; i++) { seed = (seed * 16807) % 2147483647; data[i] = seed / 1073741823.5 - 1; }

  function envelope(volume, seconds, delay, attack) {
    const gain = audio.createGain(), t = audio.currentTime + (delay || 0);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(attack || 0.02, seconds * 0.3));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    gain.connect(out);
    return { gain: gain, at: t };
  }
  function tone(shape, from, to, seconds, volume, delay, attack) {
    const env = envelope(volume, seconds, delay, attack), osc = audio.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, env.at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), env.at + seconds);
    osc.connect(env.gain);
    osc.start(env.at);
    osc.stop(env.at + seconds + 0.02);
  }
  function rush(from, to, seconds, volume, delay, sharpness) {
    const env = envelope(volume, seconds, delay), src = audio.createBufferSource(), filter = audio.createBiquadFilter();
    src.buffer = hiss;
    src.loop = true;
    filter.type = 'bandpass';
    filter.Q.value = sharpness || 1.2;
    filter.frequency.setValueAtTime(from, env.at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), env.at + seconds);
    src.connect(filter);
    filter.connect(env.gain);
    src.start(env.at, (from * 7 % 500) / 1000);
    src.stop(env.at + seconds + 0.02);
  }
  return { tone: tone, rush: rush, hiss: hiss };
}

// name: function (k) - k.tone(shape, from Hz, to Hz, seconds, volume, delay, attack), k.rush(from Hz, to Hz, seconds, volume, delay, sharpness)
const SOUNDS = {
  // A spell leaves your hands: a dark swell for Shadow, a rising crackle for Fire.
  castShadow: function (k) { k.tone('sine', 82, 150, 0.45, 0.235, 0, 0.12); k.tone('triangle', 164, 300, 0.45, 0.047, 0, 0.15); k.rush(260, 900, 0.45, 0.17, 0, 1.6); },
  castFire: function (k) { k.rush(420, 2400, 0.42, 0.95, 0, 1.1); k.tone('triangle', 130, 230, 0.38, 0.3, 0, 0.1); },
  bolt: function (k) { k.rush(2200, 380, 0.3, 0.8, 0, 1.4); k.tone('sine', 520, 180, 0.25, 0.13); },
  // Something lands: a low thud with a burst of hiss on top.
  hitShadow: function (k) { k.tone('sine', 150, 42, 0.32, 0.55); k.tone('triangle', 300, 90, 0.2, 0.1); k.rush(620, 140, 0.24, 0.5, 0, 0.9); },
  hitFire: function (k) { k.rush(2800, 260, 0.3, 0.75, 0, 0.8); k.tone('sine', 115, 46, 0.26, 0.4); k.rush(5200, 1800, 0.12, 0.25, 0.02, 2); },
  crit: function (k) { k.tone('triangle', 660, 990, 0.16, 0.28, 0.02); k.tone('triangle', 990, 1485, 0.24, 0.24, 0.1); k.tone('sine', 1980, 1980, 0.3, 0.07, 0.1); },
  tick: function (k) { k.tone('sine', 440, 300, 0.07, 0.155); k.rush(1500, 700, 0.05, 0.14, 0, 2); },
  apply: function (k) { k.tone('sine', 320, 170, 0.26, 0.26, 0, 0.04); k.rush(1000, 280, 0.24, 0.3, 0, 1.4); },
  lifeTap: function (k) { k.tone('sawtooth', 210, 62, 0.28, 0.1); k.tone('sine', 105, 60, 0.28, 0.2); k.tone('sine', 330, 660, 0.3, 0.2, 0.13, 0.08); },
  // The interface: short, soft, well behind the fight.
  error: function (k) { k.tone('triangle', 165, 118, 0.15, 0.2); },
  miss: function (k) { k.rush(800, 1700, 0.16, 0.78, 0, 1.5); },
  pet: function (k) { k.rush(1300, 280, 0.1, 0.8, 0, 2); k.tone('sine', 190, 90, 0.08, 0.23); },
  proc: function (k) { k.tone('sine', 523, 784, 0.14, 0.2); k.tone('sine', 784, 1047, 0.22, 0.17, 0.09); },
  move: function (k) { k.tone('triangle', 587, 587, 0.1, 0.34); k.tone('triangle', 587, 587, 0.1, 0.34, 0.16); },
  warn: function (k) { k.tone('triangle', 440, 440, 0.12, 0.24); k.tone('triangle', 554, 554, 0.16, 0.24, 0.14); },
  pushback: function (k) { k.tone('triangle', 220, 150, 0.09, 0.27); k.rush(500, 200, 0.08, 0.31, 0, 1.2); },
  stopped: function (k) { k.tone('sine', 300, 120, 0.2, 0.2); k.rush(900, 200, 0.18, 0.2, 0, 1.2); },
  death: function (k) { k.tone('sine', 110, 30, 0.9, 0.4, 0, 0.05); k.rush(600, 70, 0.75, 0.4, 0, 0.8); },
  fightEnd: function (k) { k.tone('sine', 392, 392, 0.3, 0.16); k.tone('sine', 523, 523, 0.3, 0.16, 0.14); k.tone('sine', 659, 659, 0.5, 0.18, 0.28); },
  best: function (k) { [523, 659, 784, 1047].forEach(function (f, i) { k.tone('triangle', f, f, 0.26, 0.24, i * 0.11); }); k.tone('sine', 2093, 2093, 0.5, 0.07, 0.33); }
};

export function createSound(startOn, startVolume) {
  let on = startOn, volume = startVolume == null ? 0.6 : startVolume, audio = null, master = null, tools = null, hum = null;

  function ready() {
    if (!on) return false;
    if (!audio) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { on = false; return false; }
      audio = new Ctor();
      // Everything goes through one limiter, so many sounds at once (three dummies ticking, a crit, a pet) get
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

  // The hum while you cast or channel: it rises toward the end of the cast and stops when the spell goes off, is
  // stopped, or you let go.
  function stopHum(fast) {
    if (!hum) return;
    const h = hum, t = audio.currentTime;
    hum = null;
    try {
      h.gain.gain.cancelScheduledValues(t);
      h.gain.gain.setValueAtTime(Math.max(0.0001, h.gain.gain.value), t);
      h.gain.gain.exponentialRampToValueAtTime(0.0001, t + (fast ? 0.05 : 0.12));
      h.osc.stop(t + 0.2); h.src.stop(t + 0.2);
    } catch (e) { /* already stopped */ }
  }
  function startHum(school, seconds, channel) {
    if (!ready()) return;
    stopHum(true);
    const t = audio.currentTime, fire = school === 'fire', gain = audio.createGain(), osc = audio.createOscillator();
    const src = audio.createBufferSource(), filter = audio.createBiquadFilter(), air = audio.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.16, t + 0.15);
    gain.gain.setValueAtTime(0.16, t + Math.max(0.16, seconds));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.16, seconds) + 0.1);
    osc.type = fire ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(fire ? 110 : 70, t);
    osc.frequency.exponentialRampToValueAtTime(channel ? (fire ? 120 : 76) : (fire ? 196 : 124), t + Math.max(0.2, seconds));
    src.buffer = tools.hiss; src.loop = true;
    filter.type = 'bandpass'; filter.Q.value = fire ? 0.9 : 2.2;
    filter.frequency.setValueAtTime(fire ? 700 : 240, t);
    filter.frequency.exponentialRampToValueAtTime(channel ? (fire ? 900 : 320) : (fire ? 2600 : 760), t + Math.max(0.2, seconds));
    air.gain.value = fire ? 1.6 : 1.1;
    osc.connect(gain); src.connect(filter); filter.connect(air); air.connect(gain); gain.connect(master);
    osc.start(t); src.start(t);
    osc.stop(t + seconds + 0.4); src.stop(t + seconds + 0.4);
    hum = { gain: gain, osc: osc, src: src };
  }

  let lastTick = 0;
  return {
    play: function (name) {
      if (!SOUNDS[name] || !ready()) return;
      if (name === 'tick') {                               // many ticks at once would be noise
        if (audio.currentTime - lastTick < 0.12) return;
        lastTick = audio.currentTime;
      }
      SOUNDS[name](tools);
    },
    casting: startHum,
    stopCasting: function () { if (audio) stopHum(false); },
    setOn: function (value) { on = value; if (!on && audio) { stopHum(true); if (audio.state === 'running') audio.suspend(); } },
    isOn: function () { return on; },
    // 0 to 1
    setVolume: function (value) { volume = Math.max(0, Math.min(1, value)); if (master) master.gain.setTargetAtTime(0.5 * volume, audio.currentTime, 0.02); },
    names: function () { return Object.keys(SOUNDS); },
    // How loud each sound is, worked out without playing it: { name: { peak, loud } } (loud = the loudest 50 ms on
    // average, which is what the ear goes by). For balancing the recipes.
    measure: function () {
      const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      if (!Offline) return Promise.resolve({});
      const out = {};
      return Object.keys(SOUNDS).reduce(function (chain, name) {
        return chain.then(function () {
          const ctx = new Offline(1, 44100 * 1.5, 44100);
          SOUNDS[name](kit(ctx, ctx.destination));
          return ctx.startRendering().then(function (buffer) {
            const d = buffer.getChannelData(0), win = 2205;
            let peak = 0, loud = 0;
            for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
            for (let s = 0; s + win <= d.length; s += win >> 1) {
              let sum = 0;
              for (let i = s; i < s + win; i++) sum += d[i] * d[i];
              loud = Math.max(loud, Math.sqrt(sum / win));
            }
            out[name] = { peak: Math.round(peak * 1000) / 1000, loud: Math.round(loud * 1000) / 1000 };
          });
        });
      }, Promise.resolve()).then(function () { return out; });
    }
  };
}
