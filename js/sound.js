// Sounds, made on the spot from simple tones and hiss (no sound files). Quiet by design; the Sound button turns
// them off. Browsers only let a page make sound after you have pressed or clicked something.

export function createSound(startOn) {
  let on = startOn, audio = null, master = null, hiss = null;

  function ready() {
    if (!on) return false;
    if (!audio) {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) { on = false; return false; }
      audio = new Ctor();
      master = audio.createGain();
      master.gain.value = 0.2;
      master.connect(audio.destination);
      hiss = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);   // one second of hiss, reused
      const data = hiss.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    if (audio.state === 'suspended') audio.resume();
    return audio.state === 'running';
  }

  function envelope(volume, seconds, delay) {
    const gain = audio.createGain(), t = audio.currentTime + (delay || 0);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + Math.min(0.02, seconds * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    gain.connect(master);
    return { gain: gain, at: t };
  }
  // A tone that slides from one pitch to another.
  function tone(shape, from, to, seconds, volume, delay) {
    const env = envelope(volume, seconds, delay), osc = audio.createOscillator();
    osc.type = shape;
    osc.frequency.setValueAtTime(from, env.at);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), env.at + seconds);
    osc.connect(env.gain);
    osc.start(env.at);
    osc.stop(env.at + seconds + 0.02);
  }
  // Hiss through a filter that slides: whooshes, crackles, thuds.
  function rush(from, to, seconds, volume, delay, sharpness) {
    const env = envelope(volume, seconds, delay), src = audio.createBufferSource(), filter = audio.createBiquadFilter();
    src.buffer = hiss;
    filter.type = 'bandpass';
    filter.Q.value = sharpness || 1.2;
    filter.frequency.setValueAtTime(from, env.at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(20, to), env.at + seconds);
    src.connect(filter);
    filter.connect(env.gain);
    src.start(env.at, Math.random() * 0.5);
    src.stop(env.at + seconds + 0.02);
  }

  const SOUNDS = {
    castShadow: function () { tone('sine', 90, 160, 0.5, 0.18); rush(300, 900, 0.5, 0.05); },
    castFire: function () { rush(500, 2200, 0.45, 0.1); tone('triangle', 140, 220, 0.4, 0.08); },
    bolt: function () { rush(1800, 400, 0.3, 0.16); },
    hitShadow: function () { tone('sine', 170, 45, 0.3, 0.5); rush(700, 150, 0.2, 0.12); },
    hitFire: function () { rush(2600, 300, 0.28, 0.3); tone('sine', 120, 50, 0.22, 0.25); },
    crit: function () { tone('triangle', 660, 990, 0.18, 0.16, 0.02); tone('triangle', 990, 1320, 0.22, 0.12, 0.1); },
    tick: function () { tone('sine', 420, 300, 0.07, 0.05); },
    apply: function () { tone('sine', 300, 180, 0.22, 0.16); rush(900, 300, 0.2, 0.05); },
    lifeTap: function () { tone('sawtooth', 220, 70, 0.3, 0.1); tone('sine', 300, 600, 0.3, 0.1, 0.12); },
    error: function () { tone('square', 150, 110, 0.14, 0.07); },
    pet: function () { rush(1200, 300, 0.1, 0.12, 0, 2); },
    miss: function () { rush(900, 1600, 0.15, 0.06); },
    proc: function () { tone('sine', 520, 780, 0.14, 0.14); tone('sine', 780, 1040, 0.2, 0.12, 0.09); },
    move: function () { tone('square', 520, 520, 0.09, 0.09); tone('square', 520, 520, 0.09, 0.09, 0.16); },
    death: function () { tone('sine', 110, 30, 0.9, 0.5); rush(600, 80, 0.7, 0.2); },
    pushback: function () { tone('square', 200, 140, 0.08, 0.08); }
  };

  let lastTick = 0;
  return {
    play: function (name) {
      if (!SOUNDS[name] || !ready()) return;
      if (name === 'tick') {                               // many ticks at once would be noise
        if (audio.currentTime - lastTick < 0.12) return;
        lastTick = audio.currentTime;
      }
      SOUNDS[name]();
    },
    setOn: function (value) { on = value; if (!on && audio && audio.state === 'running') audio.suspend(); },
    isOn: function () { return on; }
  };
}
