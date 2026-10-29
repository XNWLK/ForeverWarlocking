// Onyxia's Lair: the room of the first boss fight (Xn, 2026-10-29: "generate a new map specifically for that boss in
// the proper shape of the real map"). The shape follows the game's own top-down map of the lair and the positions of
// the Classic fight: an egg-shaped cave about 94 yards long and 76 wide with lava cracks in
// its floor, a curved egg cave on each long side and the entrance tunnel at the south end.
// Yards; x to the east, z to the south (Onyxia sleeps at the north end, at -z). Built once, shown only in the fight.
import * as THREE from 'three';
import { flat, glow, seeded } from './kit.js';

// The main cave, the two egg caves and the tunnel: where you can walk.
const CHAMBER = [[0, -46], [18.75, -44], [32, -35], [37.5, -22], [38.6, -7], [37.5, 6], [35.6, 12], [30, 23], [22.5, 34.5], [13, 44],
                 [5.6, 47.6], [-5.6, 47.6], [-13, 44], [-22.5, 34.5], [-30, 23], [-35.6, 12], [-37.5, 6], [-38.6, -7], [-37.5, -22], [-32, -35], [-18.75, -44]];
const EAST_CAVE = [[33, 1], [40, 0], [45, 8], [47, 20], [47, 36], [44, 52], [38, 64], [28, 71], [17, 72], [10, 67], [12, 60], [22, 57], [30, 50], [35, 38], [37, 24], [36, 15], [33, 13]];
const WEST_CAVE = EAST_CAVE.map(function (p) { return [-p[0], p[1]]; }).reverse();
const TUNNEL = [[-7, 44], [7, 44], [7.5, 60], [8, 75], [7, 90], [-7, 90], [-8, 75], [-7.5, 60]];
const AREAS = [CHAMBER, EAST_CAVE, WEST_CAVE, TUNNEL];
const WALL_HEIGHT = 46;
// How far from a lava crack its fire reaches when it bursts out (js/boss.js uses it too).
export const ERUPT_REACH = 2.2;

// Where things are (from the Classic fight's coordinates, turned into this room's yards).
export const LAIR = {
  home: { x: 0, z: -26 },                 // where Onyxia sleeps and is tanked
  tank: { x: 0, z: -40 },                 // the main tank, back to the north wall
  liftoff: { x: 0, z: 30 },               // phase 2: she walks here, toward the entrance, and takes off
  land: { x: 14, z: -20 },                // phase 3: where she lands
  landTank: { x: 14, z: -34 },
  flyHeight: 24,
  // Her eight places in the air, clockwise from the north (a Deep Breath crosses to the opposite one). The Classic
  // fight's points, pulled 30% toward the middle: at the edge her wings and tail went into the walls (Xn).
  flight: [{ x: 0, z: -45 }, { x: 32, z: -31 }, { x: 28.5, z: -6 }, { x: 24, z: 42 }, { x: 0, z: 45 }, { x: -27, z: 37 }, { x: -34.5, z: -4.3 }, { x: -35, z: -33 }]
    .map(function (p) { return { x: Math.round(p.x * 7) / 10, z: Math.round(p.z * 7) / 10 }; }),
  // The whelps come out of the egg caves and are held by an off-tank at each cave's mouth; the Warder walks in
  // through the tunnel and is held in it.
  // The Warder's off-tank: at the mouth of the tunnel, a little toward the middle (Xn: "a little closer to the middle").
  offtank: { east: { x: 29, z: 5 }, west: { x: -29, z: 5 }, warder: { x: 0, z: 32 } },
  pack: { east: { x: 32, z: 8 }, west: { x: -32, z: 8 }, warder: { x: 0, z: 35.5 } },
  caveDeep: { east: [{ x: 40, z: 40 }, { x: 42, z: 22 }, { x: 38, z: 6 }], west: [{ x: -40, z: 40 }, { x: -42, z: 22 }, { x: -38, z: 6 }] },
  tunnelEnd: { x: 0, z: 86 },
  start: { x: -22, z: -10, yaw: -0.91 }   // you start on her west flank, looking at her
};

function insidePoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
export function walkable(x, z) { for (let i = 0; i < AREAS.length; i++) if (insidePoly(AREAS[i], x, z)) return true; return false; }
export function caveOf(x, z) { return insidePoly(EAST_CAVE, x, z) ? 'east' : insidePoly(WEST_CAVE, x, z) ? 'west' : null; }
export function inChamber(x, z) { return insidePoly(CHAMBER, x, z); }

// The nearest point on a segment.
function nearestOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len)) : 0;
  return [ax + dx * t, az + dz * t];
}
export function segmentDistance(px, pz, ax, az, bx, bz) { const q = nearestOnSegment(px, pz, ax, az, bx, bz); return Math.hypot(px - q[0], pz - q[1]); }

// Keeps something inside the lair (you, your pet): outside every area, it goes to the nearest edge and a little in.
export function keepInside(p) {
  if (walkable(p.x, p.z)) return;
  let best = null, bestD = Infinity;
  AREAS.forEach(function (poly) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const q = nearestOnSegment(p.x, p.z, poly[j][0], poly[j][1], poly[i][0], poly[i][1]), d = Math.hypot(p.x - q[0], p.z - q[1]);
      if (d < bestD) { bestD = d; best = q; }
    }
  });
  if (!best) return;
  const dx = best[0] - p.x, dz = best[1] - p.z, d = Math.hypot(dx, dz) || 1;
  p.x = best[0] + dx / d * 0.35;
  p.z = best[1] + dz / d * 0.35;
}

// A number from a place, the same every time (so neighbouring pieces of wall meet).
function hash(x, z, k) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

export function buildLair(scene) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const rand = seeded(2159);
  const animated = [];

  // ---------- the floor: one picture for the whole lair ----------
  const X0 = -52, X1 = 52, Z0 = -52, Z1 = 95, W = 1536, H = Math.round(W * (Z1 - Z0) / (X1 - X0));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const px = function (x) { return (x - X0) / (X1 - X0) * W; }, pz = function (z) { return (z - Z0) / (Z1 - Z0) * H; }, yd = W / (X1 - X0);
  function path(poly) { g.beginPath(); poly.forEach(function (p, i) { if (i) g.lineTo(px(p[0]), pz(p[1])); else g.moveTo(px(p[0]), pz(p[1])); }); g.closePath(); }
  g.fillStyle = '#2a211b';
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {                        // grit and stains on the rock
    const v = 28 + Math.floor(rand() * 26), r = 0.4 + rand() * 3.5;
    g.fillStyle = 'rgba(' + (v + 14) + ',' + (v + 4) + ',' + (v - 4) + ',' + (0.25 + rand() * 0.35) + ')';
    g.beginPath(); g.arc(rand() * W, rand() * H, r * yd * 0.35, 0, Math.PI * 2); g.fill();
  }
  [EAST_CAVE, WEST_CAVE, TUNNEL].forEach(function (poly) { path(poly); g.fillStyle = 'rgba(70,56,44,0.5)'; g.fill(); });
  // The main cave: muted brown stone, lighter toward the middle, a web of dark cracks (as on the game's map).
  g.save();
  path(CHAMBER);
  g.clip();
  const warm = g.createRadialGradient(px(0), pz(0), 4 * yd, px(0), pz(0), 50 * yd);
  warm.addColorStop(0, '#5a4636'); warm.addColorStop(0.7, '#4a3a2e'); warm.addColorStop(1, '#382c23');
  g.fillStyle = warm;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) {
    const v = 40 + Math.floor(rand() * 30);
    g.fillStyle = 'rgba(' + (v + 30) + ',' + (v + 16) + ',' + (v + 4) + ',' + (0.1 + rand() * 0.18) + ')';
    g.beginPath(); g.arc(px(-40 + rand() * 80), pz(-48 + rand() * 98), (0.6 + rand() * 2.4) * yd, 0, Math.PI * 2); g.fill();
  }
  // Cells of cracks: from points on a jittered grid, a jagged line to each right and lower neighbour.
  const cells = [], step = 6.5;
  for (let z = -50; z <= 52; z += step) for (let x = -42; x <= 42; x += step) cells.push([x + (rand() - 0.5) * 4.5, z + (rand() - 0.5) * 4.5]);
  const across = Math.round(84 / step) + 1;
  g.lineJoin = 'round';
  [[3.2, 'rgba(24,16,11,0.35)'], [1.3, 'rgba(18,11,7,0.55)']].forEach(function (pass) {
    g.lineWidth = pass[0];
    g.strokeStyle = pass[1];
    const keep = seeded(77);                              // the same cracks in every pass
    cells.forEach(function (c, i) {
      const right = (i + 1) % across ? cells[i + 1] : null, down = cells[i + across];
      if (right && keep() > 0.2) crackWith(keep, c, right);
      if (down && keep() > 0.2) crackWith(keep, c, down);
    });
    function crackWith(r, a, b) {
      g.beginPath();
      g.moveTo(px(a[0]), pz(a[1]));
      for (let k = 1; k <= 4; k++) {
        const t = k / 4, j = k < 4 ? (r() - 0.5) * 1.6 : 0;
        g.lineTo(px(a[0] + (b[0] - a[0]) * t + j), pz(a[1] + (b[1] - a[1]) * t + j));
      }
      g.stroke();
    }
  });
  g.restore();
  const floorMap = new THREE.CanvasTexture(canvas);
  floorMap.colorSpace = THREE.SRGBColorSpace;
  floorMap.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), new THREE.MeshLambertMaterial({ map: floorMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // ---------- the walls: rough rock along every edge, open where one area runs into another ----------
  const positions = [], colors = [], ROWS = 9;
  function wallPoint(x, z, nx, nz, row) {
    const y = row / ROWS * WALL_HEIGHT, k = row / ROWS;
    const out = 0.3 + hash(Math.round(x * 2) / 2, Math.round(z * 2) / 2, row) * 1.8 + Math.sin(k * Math.PI) * 2.5 - k * k * 6;   // bulges, then leans in toward the roof
    return [x + nx * out, y, z + nz * out];
  }
  AREAS.forEach(function (poly, which) {
    let area = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) area += (poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1]);
    const sign = area > 0 ? 1 : -1;                       // which side is out
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const ax = poly[j][0], az = poly[j][1], bx = poly[i][0], bz = poly[i][1];
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 2.5));
      const nx = sign * (bz - az) / len, nz = -sign * (bx - ax) / len;
      for (let s = 0; s < n; s++) {
        const x0 = ax + (bx - ax) * s / n, z0 = az + (bz - az) * s / n, x1 = ax + (bx - ax) * (s + 1) / n, z1 = az + (bz - az) * (s + 1) / n;
        const mx = (x0 + x1) / 2 + nx * 1.4, mz = (z0 + z1) / 2 + nz * 1.4;
        let open = false;
        AREAS.forEach(function (other, k) { if (k !== which && insidePoly(other, mx, mz)) open = true; });
        if (open) continue;
        for (let r = 0; r < ROWS; r++) {
          const p00 = wallPoint(x0, z0, nx, nz, r), p10 = wallPoint(x1, z1, nx, nz, r), p01 = wallPoint(x0, z0, nx, nz, r + 1), p11 = wallPoint(x1, z1, nx, nz, r + 1);
          positions.push.apply(positions, p00.concat(p01, p10, p10, p01, p11));
          const shade = function (row) { const v = 0.42 - row / ROWS * 0.34; return [v * 1.05, v * 0.8, v * 0.7]; };
          const c0 = shade(r), c1 = shade(r + 1);
          colors.push.apply(colors, c0.concat(c1, c0, c0, c1, c1));
        }
      }
    }
  });
  const wallGeometry = new THREE.BufferGeometry();
  wallGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  wallGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  wallGeometry.computeVertexNormals();
  const walls = new THREE.Mesh(wallGeometry, new THREE.MeshLambertMaterial({ color: 0x8a6a5a, vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  walls.receiveShadow = true;
  group.add(walls);

  // Rocks and stalagmites along the walls, so the edge is not a clean line.
  const rockGeometry = new THREE.DodecahedronGeometry(1, 0), rockMaterial = flat(0x3a2a24), spikeGeometry = new THREE.ConeGeometry(1, 1, 6);
  AREAS.forEach(function (poly) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const len = Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
      for (let s = 0; s < len / 7; s++) {
        const t = rand(), x = poly[j][0] + (poly[i][0] - poly[j][0]) * t, z = poly[j][1] + (poly[i][1] - poly[j][1]) * t;
        if (walkable(x + 1.6, z) && walkable(x - 1.6, z) && walkable(x, z + 1.6) && walkable(x, z - 1.6)) continue;   // an opening
        const big = 0.8 + rand() * 1.6;
        const m = new THREE.Mesh(rand() < 0.35 ? spikeGeometry : rockGeometry, rockMaterial);
        if (m.geometry === spikeGeometry) m.scale.set(big * 0.8, big * 4, big * 0.8); else m.scale.set(big, big * 0.8, big * 1.2);
        m.position.set(x, m.geometry === spikeGeometry ? big * 2 : big * 0.3, z);
        m.rotation.y = rand() * 6;
        m.castShadow = true; m.receiveShadow = true;
        group.add(m);
      }
    }
  });

  // ---------- the egg caves: clutches of black eggs ----------
  const eggGeometry = new THREE.IcosahedronGeometry(0.55, 1), eggMaterial = flat(0x261c2c, { emissive: 0x2a0c3a, emissiveIntensity: 0.4 });
  const eggSpike = new THREE.ConeGeometry(0.09, 0.32, 4), eggSpikeMaterial = flat(0x55405a);
  const eggs = [];
  [['east', EAST_CAVE], ['west', WEST_CAVE]].forEach(function (pair) {
    const cave = pair[0], poly = pair[1];
    let tries = 0;
    while (eggs.filter(function (e) { return e.cave === cave; }).length < 26 && tries++ < 3000) {
      const x = (cave === 'east' ? 10 : -47) + rand() * 37, z = 14 + rand() * 58;
      if (!insidePoly(poly, x, z) || eggs.some(function (e) { return Math.hypot(e.x - x, e.z - z) < 1.6; })) continue;
      // Not right at the mouth: the off-tank stands there.
      if (z < 18) continue;
      const egg = new THREE.Group();
      const shell = new THREE.Mesh(eggGeometry, eggMaterial);
      shell.scale.set(1, 1.4, 1);
      shell.position.y = 0.7;
      shell.castShadow = true;
      egg.add(shell);
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Mesh(eggSpike, eggSpikeMaterial), a = k / 5 * Math.PI * 2;
        sp.position.set(Math.cos(a) * 0.46, 0.75 + (k % 2) * 0.3, Math.sin(a) * 0.46);
        sp.rotation.z = -Math.cos(a) * 1.2; sp.rotation.x = Math.sin(a) * 1.2;
        egg.add(sp);
      }
      egg.position.set(x, 0, z);
      egg.rotation.set((rand() - 0.5) * 0.4, rand() * 6, (rand() - 0.5) * 0.4);
      const s = 0.85 + rand() * 0.4;
      egg.scale.setScalar(s);
      group.add(egg);
      eggs.push({ x: x, z: z, cave: cave, mesh: egg, hatched: false });
    }
  });

  // ---------- the lava cracks that erupt in phase 3 ----------
  // A flat strip on the floor along a line of points (closed: back to the first), `width` yards wide.
  function ribbon(pts, width, closed) {
    const verts = [], n = closed ? pts.length : pts.length - 1, w = width / 2;
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const nx = -(b[1] - a[1]) / l * w, nz = (b[0] - a[0]) / l * w;
      verts.push(a[0] + nx, 0.05, a[1] + nz, a[0] - nx, 0.05, a[1] - nz, b[0] + nx, 0.05, b[1] + nz, b[0] + nx, 0.05, b[1] + nz, a[0] - nx, 0.05, a[1] - nz, b[0] - nx, 0.05, b[1] - nz);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    return geo;
  }
  // The line around a crack at `r` yards: along one side, round the end, back along the other, round the start.
  function outline(pts, r) {
    const n = pts.length, normals = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      normals.push([-(b[1] - a[1]) / l, (b[0] - a[0]) / l]);
    }
    const out = [];
    for (let i = 0; i < n; i++) out.push([pts[i][0] + normals[i][0] * r, pts[i][1] + normals[i][1] * r]);
    function cap(p, nrm, sign) {                          // half a circle round an end (sign 1: the far end, -1: the start)
      const fx = nrm[1] * sign, fz = -nrm[0] * sign;
      for (let k = 1; k < 10; k++) {
        const th = k / 10 * Math.PI, c = Math.cos(th), sn = Math.sin(th);
        out.push([p[0] + r * (nrm[0] * c * sign + fx * sn), p[1] + r * (nrm[1] * c * sign + fz * sn)]);
      }
    }
    cap(pts[n - 1], normals[n - 1], 1);
    for (let i = n - 1; i >= 0; i--) out.push([pts[i][0] - normals[i][0] * r, pts[i][1] - normals[i][1] * r]);
    cap(pts[0], normals[0], -1);
    return out;
  }
  // Glowing fissures across the floor of the main cave; after each Bellowing Roar they erupt.
  const fissures = [];
  // (Both sides drawn: the strips are flat on the floor, whichever way their corners run.)
  const fissureMaterial = function () { return new THREE.MeshBasicMaterial({ color: 0xff5a14, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); };
  // One in each square of a grid 12.5 yards wide, placed a little off its middle: spread evenly over the floor (Xn: the
  // left side had too much empty space).
  const spots = [];
  for (let gz = -40; gz <= 43; gz += 12.5) for (let gx = -31.25; gx <= 31.3; gx += 12.5) spots.push([gx, gz]);
  for (let si = 0, tries = 0; si < spots.length; tries = 0, si++) while (tries++ < 12) {
    const cx = spots[si][0] + (rand() - 0.5) * 5, cz = spots[si][1] + (rand() - 0.5) * 5;
    if (!inChamber(cx, cz) || Math.hypot(cx - LAIR.tank.x, cz - LAIR.tank.z) < 9) continue;
    const a = rand() * Math.PI, len = 6 + rand() * 4, pts = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4 - 0.5;
      const x = cx + Math.cos(a) * len * t + (k % 4 ? (rand() - 0.5) * 2.2 : 0), z = cz + Math.sin(a) * len * t + (k % 4 ? (rand() - 0.5) * 2.2 : 0);
      pts.push([x, z]);
    }
    if (!pts.every(function (p) { return inChamber(p[0], p[1]); })) continue;
    // The crack itself: a dark ribbon along the points, with a dim glow inside.
    const crack = ribbon(pts, 0.5, false), mat = fissureMaterial();
    group.add(new THREE.Mesh(crack, glow(0x2a0a04, { side: THREE.DoubleSide })));
    const core = new THREE.Mesh(ribbon(pts, 0.18, false), mat);
    core.position.y = 0.005;
    group.add(core);
    // Its outline: where the fire reaches when it bursts out (Xn: "the outlines fiery red where the fire pops out").
    const edge = new THREE.MeshBasicMaterial({ color: 0xff2a10, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(ribbon(outline(pts, ERUPT_REACH), 0.22, true), edge));
    fissures.push({ cx: cx, cz: cz, points: pts, material: mat, edge: edge });
    break;
  }
  // How bright they are: 0 resting, 1 about to erupt / erupting.
  let fissureLevel = 0;
  function setFissures(level) { fissureLevel = level; }
  animated.push(function (time) {
    fissures.forEach(function (f, i) {
      const flicker = 0.08 * Math.sin(time * 3 + i * 1.7);
      f.material.opacity = 0.3 + fissureLevel * 0.6 + flicker;
      f.material.color.setHex(fissureLevel > 0.5 ? 0xffa040 : 0xff5a14);
      f.edge.opacity = 0.6 + fissureLevel * 0.4 + flicker;
    });
  });
  // How far a spot is from the nearest fissure, and which one.
  function nearestFissure(x, z) {
    let best = Infinity, which = null;
    fissures.forEach(function (f) {
      for (let k = 0; k < f.points.length - 1; k++) {
        const d = segmentDistance(x, z, f.points[k][0], f.points[k][1], f.points[k + 1][0], f.points[k + 1][1]);
        if (d < best) { best = d; which = f; }
      }
    });
    return { distance: best, fissure: which };
  }

  // ---------- light: dim, warm, from the lava ----------
  const hemi = new THREE.HemisphereLight(0xb0a0a8, 0x1a1010, 1.0);
  const ambient = new THREE.AmbientLight(0x50404a, 0.7);
  const key = new THREE.DirectionalLight(0xfff0e4, 1.7);
  key.position.set(-20, 60, -30);
  key.target.position.set(0, 0, 10);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -60, right: 60, top: 70, bottom: -70, near: 10, far: 160 });
  key.shadow.bias = -0.0006;
  group.add(hemi, ambient, key, key.target);
  [[0, -10], [-20, 18], [20, 18], [0, 30], [-22, -26], [22, -26]].forEach(function (p, i) {
    const lamp = new THREE.PointLight(0xffa070, 40, 40, 1.4);
    lamp.position.set(p[0], 2.5, p[1]);
    group.add(lamp);
    animated.push(function (time) { lamp.intensity = 38 + fissureLevel * 30 + Math.sin(time * 2.1 + i * 2) * 5; });
  });
  const caveLamps = [];
  [[40, 38], [-40, 38], [0, 70]].forEach(function (p) {     // a faint purple in the egg caves, a dull red down the tunnel
    const lamp = new THREE.PointLight(p[1] === 70 ? 0xff4a20 : 0x8a4aff, 70, 30, 1.6);
    lamp.position.set(p[0], 3, p[1]);
    group.add(lamp);
    if (p[1] !== 70) caveLamps.push(lamp);
  });
  // While Onyxia breathes the egg caves are searing hot: their floor glows and their light turns red.
  const heatMaterial = new THREE.MeshBasicMaterial({ color: 0xff3a10, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  [EAST_CAVE, WEST_CAVE].forEach(function (poly) {
    const shape = new THREE.Shape(poly.map(function (p) { return new THREE.Vector2(p[0], -p[1]); }));
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape), heatMaterial);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = 0.06;
    group.add(mesh);
  });
  let heatLevel = 0;
  const purple = new THREE.Color(0x8a4aff), red = new THREE.Color(0xff3a10);
  function setHeat(level) {
    heatLevel = level;
    heatMaterial.opacity = level * 0.32;
    caveLamps.forEach(function (lamp) { lamp.color.copy(purple).lerp(red, level); lamp.intensity = 70 + level * 200; });
  }
  // Embers drifting up from the cracks.
  const emberCount = 160, emberPos = new Float32Array(emberCount * 3), emberSpeed = [];
  for (let i = 0; i < emberCount; i++) {
    emberPos[i * 3] = -35 + rand() * 70; emberPos[i * 3 + 1] = rand() * 30; emberPos[i * 3 + 2] = -42 + rand() * 86;
    emberSpeed.push(0.6 + rand() * 1.4);
  }
  const emberGeometry = new THREE.BufferGeometry();
  emberGeometry.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const embers = new THREE.Points(emberGeometry, new THREE.PointsMaterial({ color: 0xff8a3a, size: 0.22, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  group.add(embers);
  let lastTime = 0;
  animated.push(function (time) {
    const dt = Math.min(0.1, Math.max(0, time - lastTime));
    lastTime = time;
    for (let i = 0; i < emberCount; i++) {
      emberPos[i * 3 + 1] += emberSpeed[i] * dt;
      if (emberPos[i * 3 + 1] > 32) emberPos[i * 3 + 1] = 0;
    }
    emberGeometry.attributes.position.needsUpdate = true;
  });

  return {
    group: group, eggs: eggs, fissures: fissures, setFissures: setFissures, nearestFissure: nearestFissure,
    fissureLevel: function () { return fissureLevel; }, setHeat: setHeat, heatLevel: function () { return heatLevel; },
    wallHeight: WALL_HEIGHT,
    update: function (time) { if (group.visible) animated.forEach(function (fn) { fn(time); }); }
  };
}
