// Builds art/logo.svg: a training dummy struck in the chest by a Shadow Bolt. The bolt is a sparkly comet of magenta
// and violet blobs in a purple haze with a few green flecks; the colours are the Warlock SIM's purples on a dark
// square, so the logo matches the other two projects'. Seeded, so the same picture every run.
// node art/make-logo.js [seed] [out.svg]   - then render art/logo-400.png from the SVG (400 x 400).
const fs = require('fs');
const path = require('path');
let seed = Number(process.argv[2] || 7) >>> 0;
const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = a => a[Math.floor(rnd() * a.length)];
const f = n => n.toFixed(1);

// The bolt: head H (where it strikes), end of the tail T, width at the head.
const H = [226, 232], T = [52, 326], W0 = 32;
const L = Math.hypot(T[0] - H[0], T[1] - H[1]), d = [(T[0] - H[0]) / L, (T[1] - H[1]) / L], p = [-d[1], d[0]], k = W0 / 56;
const W = t => t < 0.12 ? W0 : W0 * Math.pow(1 - (t - 0.12) / 0.88, 1.7) + 3;
const at = (t, side, along) => [H[0] + d[0] * (L * t + along) + p[0] * side, H[1] + d[1] * (L * t + along) + p[1] * side];
function blobs(n, tPow, spread, rMin, rMax, colors, opacity) {
  let s = '';
  for (let i = 0; i < n; i++) {
    const t = Math.pow(rnd(), tPow), w = W(t), side = (rnd() * 2 - 1) * w * spread;
    const along = t < 0.2 ? (rnd() * 2 - 1) * w * 0.55 : (rnd() * 2 - 1) * 8 * k;
    const [x, y] = at(t, side, along), r = (rMin + (rMax - rMin) * rnd() * (0.45 + 0.55 * w / W0)) * k;
    s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${pick(colors)}" opacity="${opacity}"/>`;
  }
  return s;
}
function mass(kk, tMax, color, opacity) { let s = ''; for (let t = 0; t <= tMax; t += 0.01) { const [x, y] = at(t, 0, 0); s += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(W(t) * kk)}" fill="${color}" opacity="${opacity}"/>`; } return s; }
const haze = blobs(34, 1.6, 0.7, 30, 56, ['#5B1A8C', '#7A22B0', '#4A1677'], 0.45);
const glow = mass(0.95, 1, '#9A28D2', 0.06) + mass(0.36, 0.2, '#F0E4FF', 0.28);
const magenta = blobs(170, 1.6, 1.0, 3, 11, ['#B02EE0', '#D04CF2', '#9A2AD0', '#E070FF'], 0.85);
const green = blobs(10, 1.5, 0.4, 2, 6, ['#8EE04A', '#A8F070'], 0.6);
const light = blobs(45, 3, 0.45, 2, 6, ['#F4E6FF', '#FFFFFF', '#FBE8FF'], 0.95);
const sparks = blobs(46, 1.5, 1.35, 1.2, 3.4, ['#FFB4F4', '#FFFFFF', '#F59BFF', '#FFD6FA'], 0.9);

// Where it strikes: a soft flash, a ring, sparks thrown outwards.
seed = 11;
const R = 26;
let thrown = '';
for (let i = 0; i < 26; i++) {
  const a = rnd() * Math.PI * 2, r = R * (0.6 + rnd() * 0.9);
  thrown += `<circle cx="${f(H[0] + Math.cos(a) * r)}" cy="${f(H[1] + Math.sin(a) * r)}" r="${f(1.2 + rnd() * 2.6)}" fill="${pick(['#FFFFFF', '#FFB4F4', '#E070FF'])}" opacity="0.9"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs>
    <linearGradient id="sack" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6A4AA8"/><stop offset="1" stop-color="#3A3150"/></linearGradient>
    <filter id="haze" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"/></filter>
    <filter id="fuzz" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.8"/></filter>
    <filter id="mass" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="5"/></filter>
    <filter id="spark" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.6"/></filter>
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6"/></filter>
  </defs>

  <rect width="400" height="400" fill="#15121D"/>
  <rect x="44" y="340" width="312" height="8" rx="4" fill="#2A2438"/>

  <!-- the training dummy: pole, cross-arm, sack body with two ropes, head, horned bucket helm -->
  <ellipse cx="270" cy="341" rx="44" ry="7" fill="#2A2438"/>
  <rect x="263" y="150" width="14" height="192" rx="4" fill="#3A3150"/>
  <rect x="190" y="194" width="160" height="18" rx="9" fill="#5A4A80"/>
  <rect x="222" y="168" width="96" height="124" rx="34" fill="url(#sack)"/>
  <rect x="222" y="168" width="96" height="124" rx="34" fill="none" stroke="#7A5CC0" stroke-width="3" opacity="0.6"/>
  <path d="M224 214 Q270 226 316 214" stroke="#B393F0" stroke-width="5" fill="none" opacity="0.55"/>
  <path d="M226 256 Q270 268 314 256" stroke="#B393F0" stroke-width="5" fill="none" opacity="0.55"/>
  <circle cx="270" cy="134" r="30" fill="#5A3D96"/>
  <path d="M238 128 L246 98 L294 98 L302 128 Z" fill="#6A4AA8"/>
  <path d="M238 128 L302 128" stroke="#B393F0" stroke-width="4" opacity="0.7"/>
  <path d="M244 104 Q226 92 222 70 Q238 84 250 96 Z" fill="#B393F0" opacity="0.85"/>
  <path d="M296 104 Q314 92 318 70 Q302 84 290 96 Z" fill="#B393F0" opacity="0.85"/>

  <!-- the strike -->
  <circle cx="${H[0]}" cy="${H[1]}" r="${f(R * 0.9)}" fill="#C040F0" opacity="0.35" filter="url(#glow)"/>
  <circle cx="${H[0]}" cy="${H[1]}" r="${R}" fill="none" stroke="#E070FF" stroke-width="3" opacity="0.55" filter="url(#fuzz)"/>
  <circle cx="${H[0]}" cy="${H[1]}" r="${f(R * 0.35)}" fill="#FFF0FF" opacity="0.8" filter="url(#mass)"/>
  <g filter="url(#spark)">${thrown}</g>

  <!-- the shadow bolt: purple haze, magenta blobs, a few green flecks, bright heart, sparkles -->
  <g filter="url(#haze)">${haze}</g>
  <g filter="url(#mass)">${glow}</g>
  <g filter="url(#fuzz)">${magenta}</g>
  <g filter="url(#fuzz)">${green}</g>
  <g filter="url(#fuzz)">${light}</g>
  <g filter="url(#spark)">${sparks}</g>
</svg>
`;
const out = process.argv[3] || path.join(__dirname, 'logo.svg');
fs.writeFileSync(out, svg);
console.log('seed', process.argv[2] || 7, svg.length, 'bytes ->', out);
