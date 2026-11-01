// The room builder for boss fights: a room is a few areas you can walk in (polygons in yards; x to the east, z to the
// south), and from them come the floor, rough walls along every edge (open where one area runs into another), rocks
// along the walls, light, and a few things to stand around (pillars, braziers). A boss's own room (js/lair.js) adds
// what only it has on top.
//
// Turning a top-down map into areas: read the outline's corners off the picture (or the game's own coordinates) and
// convert them with fromGame() below; the boss usually sits at the north end (-z). Check the result with
// room.showOutline(true), which draws every area's edge and name on the floor.
import * as THREE from 'three';
import { flat, glow, seeded } from './kit.js';

// Game coordinates (as the game's files and maps give them: x to the north, y to the west) into a room's yards, with
// (gx, gy) the game point that becomes the room's middle. The Onyxia lair used x = -(game y + 216), z = -(game x + 21).
export function fromGame(x, y, gx, gy) { return [-(y - gy), -(x - gx)]; }

export function insidePoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
// The nearest point on a segment, and how far a point is from one.
export function nearestOnSegment(px, pz, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, len = dx * dx + dz * dz;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len)) : 0;
  return [ax + dx * t, az + dz * t];
}
export function segmentDistance(px, pz, ax, az, bx, bz) { const q = nearestOnSegment(px, pz, ax, az, bx, bz); return Math.hypot(px - q[0], pz - q[1]); }

// What a set of areas answers without any 3D: walkable(x, z), keepInside(p), areaOf(x, z) (the name of the area a point
// is in, or null), inArea(name, x, z). areas: [{ name, poly }].
export function areaTools(areas) {
  function walkable(x, z) { for (let i = 0; i < areas.length; i++) if (insidePoly(areas[i].poly, x, z)) return true; return false; }
  function areaOf(x, z) { for (let i = 0; i < areas.length; i++) if (insidePoly(areas[i].poly, x, z)) return areas[i].name; return null; }
  function inArea(name, x, z) { const a = areas.filter(function (r) { return r.name === name; })[0]; return !!a && insidePoly(a.poly, x, z); }
  // Something outside every area (you, your pet) goes to the nearest edge and a little in.
  function keepInside(p) {
    if (walkable(p.x, p.z)) return;
    let best = null, bestD = Infinity;
    areas.forEach(function (a) {
      const poly = a.poly;
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
  // A random walkable point (in one area, or anywhere), at least `margin` yards from every edge.
  function randomPoint(rand, name, margin) {
    const list = name ? areas.filter(function (a) { return a.name === name; }) : areas;
    for (let k = 0; k < 400; k++) {
      const a = list[Math.floor(rand() * list.length)], box = bounds([a]);
      const x = box.x0 + rand() * (box.x1 - box.x0), z = box.z0 + rand() * (box.z1 - box.z0);
      if (!insidePoly(a.poly, x, z)) continue;
      if (margin && [[margin, 0], [-margin, 0], [0, margin], [0, -margin]].some(function (o) { return !walkable(x + o[0], z + o[1]); })) continue;
      return { x: x, z: z };
    }
    return { x: 0, z: 0 };
  }
  return { walkable: walkable, areaOf: areaOf, inArea: inArea, keepInside: keepInside, randomPoint: randomPoint };
}
function bounds(areas) {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  areas.forEach(function (a) { a.poly.forEach(function (p) { b.x0 = Math.min(b.x0, p[0]); b.x1 = Math.max(b.x1, p[0]); b.z0 = Math.min(b.z0, p[1]); b.z1 = Math.max(b.z1, p[1]); }); });
  return b;
}

// A number from a place, the same every time (so neighbouring pieces of wall meet).
function hash(x, z, k) {
  const s = Math.sin(x * 12.9898 + z * 78.233 + k * 37.719) * 43758.5453;
  return s - Math.floor(s);
}

// spec: {
//   areas: [{ name, poly }]                          where you can walk
//   seed (or rand: a function)                       the same room every time
//   wallHeight (40), wallColor (0x8a6a5a), wallShade: [r, g, b] at the foot of the wall (it darkens upward)
//   floor: { base ('#2a211b'), area ('rgba(70,56,44,0.5)'), grit (2600), margin (6 yards around the areas),
//            paint(g, tools) - draws the floor itself instead (tools: px, pz, yd, path(poly), rand, W, H),
//            bounds: [x0, x1, z0, z1] - the floor's extent in yards (else the areas plus the margin) }
//   rocks: true                                      rocks and stalagmites along the walls; rockColor
//   light: { hemi: [sky, ground, intensity], ambient: [color, intensity], key: { color, intensity, from: [x, y, z],
//            to: [x, y, z], shadow: { left, right, top, bottom, near, far } }, lamps: [{ x, z, y, color, intensity, distance }] }
//   props: [{ type: 'pillar' | 'brazier', x, z, r, color }]   (pillars and braziers stand in the way: colliders)
//   look: { background, fog: [color, near, far] }, start: { x, z, yaw }, minPitch (null; -0.55 lets you look up at a
//   flying boss)
// }
export function buildRoom(scene, spec) {
  const areas = spec.areas, tools = areaTools(areas);
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const rand = spec.rand || seeded(spec.seed || 1);
  const animated = [], colliders = [];
  const WALL = spec.wallHeight || 40;
  const box = bounds(areas), M = (spec.floor && spec.floor.margin) || 6;
  const FB = spec.floor && spec.floor.bounds;                      // [x0, x1, z0, z1] in yards, or around the areas
  const X0 = FB ? FB[0] : box.x0 - M, X1 = FB ? FB[1] : box.x1 + M, Z0 = FB ? FB[2] : box.z0 - M, Z1 = FB ? FB[3] : box.z1 + M;

  // ---------- the floor: one picture for the whole room ----------
  const F = spec.floor || {};
  const W = F.width || 1536, H = Math.round(W * (Z1 - Z0) / (X1 - X0));
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const px = function (x) { return (x - X0) / (X1 - X0) * W; }, pz = function (z) { return (z - Z0) / (Z1 - Z0) * H; }, yd = W / (X1 - X0);
  function path(poly) { g.beginPath(); poly.forEach(function (p, i) { if (i) g.lineTo(px(p[0]), pz(p[1])); else g.moveTo(px(p[0]), pz(p[1])); }); g.closePath(); }
  if (F.paint) F.paint(g, { px: px, pz: pz, yd: yd, path: path, rand: rand, W: W, H: H });
  else {
    g.fillStyle = F.base || '#2a211b';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < (F.grit == null ? 2600 : F.grit); i++) {   // grit and stains
      const v = 28 + Math.floor(rand() * 26), r = 0.4 + rand() * 3.5;
      g.fillStyle = 'rgba(' + (v + 14) + ',' + (v + 4) + ',' + (v - 4) + ',' + (0.25 + rand() * 0.35) + ')';
      g.beginPath(); g.arc(rand() * W, rand() * H, r * yd * 0.35, 0, Math.PI * 2); g.fill();
    }
    areas.forEach(function (a) { path(a.poly); g.fillStyle = a.floor || F.area || 'rgba(70,56,44,0.5)'; g.fill(); });
  }
  const floorMap = new THREE.CanvasTexture(canvas);
  floorMap.colorSpace = THREE.SRGBColorSpace;
  floorMap.anisotropy = 4;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), new THREE.MeshLambertMaterial({ map: floorMap }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  floor.receiveShadow = true;
  group.add(floor);

  // ---------- the walls: rough rock along every edge, open where one area runs into another ----------
  const positions = [], colors = [], ROWS = 9, SHADE = spec.wallShade || [1.05, 0.8, 0.7];
  function wallPoint(x, z, nx, nz, row) {
    const y = row / ROWS * WALL, k = row / ROWS;
    const out = 0.3 + hash(Math.round(x * 2) / 2, Math.round(z * 2) / 2, row) * 1.8 + Math.sin(k * Math.PI) * 2.5 - k * k * 6;   // bulges, then leans in toward the roof
    return [x + nx * out, y, z + nz * out];
  }
  areas.forEach(function (a, which) {
    const poly = a.poly;
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
        areas.forEach(function (other, k) { if (k !== which && insidePoly(other.poly, mx, mz)) open = true; });
        if (open) continue;
        for (let r = 0; r < ROWS; r++) {
          const p00 = wallPoint(x0, z0, nx, nz, r), p10 = wallPoint(x1, z1, nx, nz, r), p01 = wallPoint(x0, z0, nx, nz, r + 1), p11 = wallPoint(x1, z1, nx, nz, r + 1);
          positions.push.apply(positions, p00.concat(p01, p10, p10, p01, p11));
          const shade = function (row) { const v = 0.42 - row / ROWS * 0.34; return [v * SHADE[0], v * SHADE[1], v * SHADE[2]]; };
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
  const walls = new THREE.Mesh(wallGeometry, new THREE.MeshLambertMaterial({ color: spec.wallColor || 0x8a6a5a, vertexColors: true, flatShading: true, side: THREE.DoubleSide }));
  walls.receiveShadow = true;
  group.add(walls);

  // Rocks and stalagmites along the walls, so the edge is not a clean line.
  if (spec.rocks !== false) {
    const rockGeometry = new THREE.DodecahedronGeometry(1, 0), rockMaterial = flat(spec.rockColor || 0x3a2a24), spikeGeometry = new THREE.ConeGeometry(1, 1, 6);
    areas.forEach(function (a) {
      const poly = a.poly;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const len = Math.hypot(poly[i][0] - poly[j][0], poly[i][1] - poly[j][1]);
        for (let s = 0; s < len / 7; s++) {
          const t = rand(), x = poly[j][0] + (poly[i][0] - poly[j][0]) * t, z = poly[j][1] + (poly[i][1] - poly[j][1]) * t;
          if (tools.walkable(x + 1.6, z) && tools.walkable(x - 1.6, z) && tools.walkable(x, z + 1.6) && tools.walkable(x, z - 1.6)) continue;   // an opening
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
  }

  // ---------- light ----------
  const Lt = spec.light || {};
  const hemiSpec = Lt.hemi || [0xb0a0a8, 0x1a1010, 1.0], ambSpec = Lt.ambient || [0x50404a, 0.7], keySpec = Lt.key || {};
  const hemi = new THREE.HemisphereLight(hemiSpec[0], hemiSpec[1], hemiSpec[2]);
  const ambient = new THREE.AmbientLight(ambSpec[0], ambSpec[1]);
  const key = new THREE.DirectionalLight(keySpec.color || 0xfff0e4, keySpec.intensity == null ? 1.7 : keySpec.intensity);
  const from = keySpec.from || [-20, 60, -30], to = keySpec.to || [0, 0, 10];
  key.position.set(from[0], from[1], from[2]);
  key.target.position.set(to[0], to[1], to[2]);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  const reach = Math.max(X1 - X0, Z1 - Z0) * 0.55;
  Object.assign(key.shadow.camera, keySpec.shadow || { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: 200 });
  key.shadow.bias = -0.0006;
  group.add(hemi, ambient, key, key.target);
  const lamps = (Lt.lamps || []).map(function (l) {
    const lamp = new THREE.PointLight(l.color || 0xffa070, l.intensity || 40, l.distance || 40, 1.4);
    lamp.position.set(l.x, l.y == null ? 2.5 : l.y, l.z);
    group.add(lamp);
    return lamp;
  });

  // ---------- things to stand around ----------
  (spec.props || []).forEach(function (p) {
    if (p.type === 'pillar') {
      const r = p.r || 1.6, stone = flat(p.color || 0x4a4048);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.85, r, WALL * 0.8, 10), stone);
      shaft.position.set(p.x, WALL * 0.4, p.z);
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.3, r * 1.4, 0.8, 10), stone);
      foot.position.set(p.x, 0.4, p.z);
      [shaft, foot].forEach(function (m) { m.castShadow = true; m.receiveShadow = true; group.add(m); });
      colliders.push({ x: p.x, z: p.z, r: r * 1.3 });
    } else if (p.type === 'brazier') {
      const metal = flat(0x2a2422), fire = glow(p.color || 0xff8a3a);
      const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.5, 0.6, 10), metal);
      bowl.position.set(p.x, 1.3, p.z);
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 1.1, 6), metal);
      leg.position.set(p.x, 0.55, p.z);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.6, 1.4, 7), fire);
      flame.position.set(p.x, 2.2, p.z);
      const lamp = new THREE.PointLight(p.color || 0xff8a3a, 35, 26, 1.5);
      lamp.position.set(p.x, 2.8, p.z);
      group.add(bowl, leg, flame, lamp);
      animated.push(function (time) { flame.scale.set(1, 0.85 + Math.sin(time * 9 + p.x) * 0.15, 1); lamp.intensity = 32 + Math.sin(time * 7 + p.z) * 5; });
      colliders.push({ x: p.x, z: p.z, r: 1.1 });
    }
  });

  // ---------- an outline of every area, for checking a new room against its map ----------
  let outline = null;
  function showOutline(on) {
    if (on && !outline) {
      outline = new THREE.Group();
      const colorsList = [0xffe060, 0x60e0ff, 0xff60c0, 0x80ff80, 0xffa060, 0xc0a0ff];
      areas.forEach(function (a, i) {
        const pts = a.poly.map(function (p) { return new THREE.Vector3(p[0], 0.15, p[1]); });
        pts.push(pts[0].clone());
        outline.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: colorsList[i % colorsList.length] })));
      });
      group.add(outline);
    }
    if (outline) outline.visible = !!on;
  }

  const look = spec.look || {};
  const fogSpec = look.fog || [0x0e0605, 45, 150];
  return Object.assign({
    group: group, rand: rand, wallHeight: WALL, colliders: colliders, lamps: lamps, key: key,
    start: spec.start || { x: 0, z: 0, yaw: 0 }, minPitch: spec.minPitch == null ? null : spec.minPitch,
    look: { background: new THREE.Color(look.background == null ? 0x0a0504 : look.background), fog: new THREE.Fog(fogSpec[0], fogSpec[1], fogSpec[2]) },
    showOutline: showOutline,
    animate: function (fn) { animated.push(fn); },
    update: function (time) { if (group.visible) animated.forEach(function (fn) { fn(time); }); }
  }, tools);
}
