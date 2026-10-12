// The result of a fight as a picture to pass on (the review's "Copy as a picture" and "Save the picture"):
// who, which build and fight, the DPS, the share of the sim, the grade of a challenge, the damage curve against the
// sim's, and the three spells that did most. Drawn on a canvas; nothing is sent anywhere.

const W = 880, H = 460;
const FONT = '"Segoe UI", system-ui, sans-serif';
function whole(n) { return Math.round(n).toLocaleString('en-US'); }

function picture(src) {
  return new Promise(function (done) {
    if (!src) { done(null); return; }
    const img = new Image();
    img.onload = function () { done(img); };
    img.onerror = function () { done(null); };
    img.src = src;
  });
}
function rounded(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// d: { name, build, race, raceIcon, fight (one line of text), dps, seconds, simDps (or 0), grade ('' outside a
//      challenge), curve: [damage by each second], simCurve (or null), spells: [{ name, icon, pct }] (most damage
//      first), site }
// Returns a promise of the canvas.
export function makeCard(d) {
  const icons = [d.raceIcon].concat(d.spells.slice(0, 3).map(function (s) { return s.icon; }));
  return Promise.all(icons.map(picture)).then(function (imgs) {
    const canvas = document.createElement('canvas'), g = canvas.getContext('2d');
    canvas.width = W; canvas.height = H;

    // The card: dark glass with a violet glow in one corner and a thin bright edge.
    const back = g.createLinearGradient(0, 0, W, H);
    back.addColorStop(0, '#1d1030'); back.addColorStop(1, '#0d0716');
    g.fillStyle = back; g.fillRect(0, 0, W, H);
    const glow = g.createRadialGradient(W * 0.82, H * 0.1, 0, W * 0.82, H * 0.1, W * 0.6);
    glow.addColorStop(0, 'rgba(185,138,255,0.28)'); glow.addColorStop(1, 'rgba(185,138,255,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(205,170,255,0.45)'; g.lineWidth = 2;
    rounded(g, 1, 1, W - 2, H - 2, 14); g.stroke();

    // Top line: the game, and when.
    g.textBaseline = 'alphabetic';
    g.fillStyle = '#a999bd'; g.font = '600 15px ' + FONT;
    g.fillText('FOREVER WARLOCKING', 32, 44);
    g.textAlign = 'right';
    g.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }), W - 32, 44);
    g.textAlign = 'left';

    // Who and what.
    let x = 32;
    if (imgs[0]) {
      g.save(); g.beginPath(); g.arc(60, 96, 28, 0, Math.PI * 2); g.closePath(); g.clip();
      g.drawImage(imgs[0], 32, 68, 56, 56); g.restore();
      g.strokeStyle = 'rgba(205,170,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(60, 96, 28, 0, Math.PI * 2); g.stroke();
      x = 102;
    }
    g.fillStyle = '#f2ecf8'; g.font = '600 26px ' + FONT;
    g.fillText(d.name, x, 92);
    g.fillStyle = '#cdbfe0'; g.font = '16px ' + FONT;
    g.fillText(d.build + '  ·  ' + d.race, x, 116);
    g.fillStyle = '#a999bd'; g.font = '15px ' + FONT;
    g.fillText(d.fight, 32, 152);

    // The number.
    g.fillStyle = '#ffffff'; g.font = '600 84px ' + FONT;
    const dpsText = whole(d.dps);
    g.fillText(dpsText, 30, 240);
    const dpsWidth = g.measureText(dpsText).width;
    g.fillStyle = '#a999bd'; g.font = '600 22px ' + FONT;
    g.fillText('DPS', 30 + dpsWidth + 12, 240);
    g.fillStyle = '#cdbfe0'; g.font = '17px ' + FONT;
    const mins = Math.floor(d.seconds / 60), secs = Math.round(d.seconds % 60);
    g.fillText('in ' + (mins ? mins + ' min ' : '') + secs + ' s' + (d.simDps > 0 ? '   ·   ' + Math.round(100 * d.dps / d.simDps) + '% of the sim (' + whole(d.simDps) + ' DPS)' : ''), 32, 272);

    // The grade of a challenge, in a gold ring.
    if (d.grade) {
      g.strokeStyle = '#f0cf7a'; g.lineWidth = 4; g.beginPath(); g.arc(W - 96, 150, 54, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(240,207,122,0.1)'; g.fill();
      g.fillStyle = '#f0cf7a'; g.font = '700 72px ' + FONT; g.textAlign = 'center';
      g.fillText(d.grade, W - 96, 176);
      g.textAlign = 'left';
    }

    // The spells that did most.
    d.spells.slice(0, 3).forEach(function (s, i) {
      const sx = 32 + i * 196, sy = 300, img = imgs[i + 1];
      if (img) { g.save(); rounded(g, sx, sy, 34, 34, 6); g.clip(); g.drawImage(img, sx, sy, 34, 34); g.restore(); }
      g.fillStyle = '#f2ecf8'; g.font = '600 14px ' + FONT;
      g.fillText(s.name.length > 17 ? s.name.slice(0, 16) + '…' : s.name, sx + 42, sy + 15);
      g.fillStyle = '#a999bd'; g.font = '13px ' + FONT;
      g.fillText(Math.round(s.pct) + '% of the damage', sx + 42, sy + 32);
    });

    // Damage over time: you (violet) against the sim's average (pale).
    const gx = 32, gy = 352, gw = W - 64, gh = 64;
    g.fillStyle = 'rgba(0,0,0,0.3)'; rounded(g, gx, gy, gw, gh, 6); g.fill();
    const mine = d.curve || [], sim = d.simCurve || null;
    const span = Math.max(mine.length - 1, sim ? sim.length - 1 : 0, 1), top = Math.max(mine[mine.length - 1] || 0, sim ? sim[sim.length - 1] || 0 : 0, 1);
    function line(curve, color, width) {
      if (!curve || curve.length < 2) return;
      g.strokeStyle = color; g.lineWidth = width; g.lineJoin = 'round';
      g.beginPath();
      curve.forEach(function (v, i) { const px = gx + 4 + (gw - 8) * i / span, py = gy + gh - 4 - (gh - 8) * v / top; if (i) g.lineTo(px, py); else g.moveTo(px, py); });
      g.stroke();
    }
    line(sim, 'rgba(255,255,255,0.55)', 1.5);
    line(mine, '#b98aff', 2.5);

    // Bottom line: the key to the curve, and where to play.
    g.font = '13px ' + FONT; g.fillStyle = '#a999bd';
    g.fillText('Damage over time: you (violet)' + (sim ? ' and the sim\'s average (pale)' : ''), 32, H - 20);
    g.textAlign = 'right';
    g.fillText(d.site, W - 32, H - 20);
    g.textAlign = 'left';
    return canvas;
  });
}

// Puts the picture on the clipboard. Resolves to true when it worked.
export function copyCard(canvas) {
  return new Promise(function (done) {
    if (!navigator.clipboard || !window.ClipboardItem || !canvas.toBlob) { done(false); return; }
    canvas.toBlob(function (blob) {
      if (!blob) { done(false); return; }
      navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]).then(function () { done(true); }, function () { done(false); });
    }, 'image/png');
  });
}

// Saves the picture as a file.
export function saveCard(canvas, name) {
  const link = document.createElement('a');
  link.download = name;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
}
