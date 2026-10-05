// Spell animations: bolts that fly, bursts where they land, motes gathering while you cast, and what hangs on the
// dummy while a DoT or curse is on it. Looks only - when damage happens is decided in combat.js.
// One unit is one yard.
import * as THREE from 'three';

const BALL = new THREE.IcosahedronGeometry(1, 1);
const SHARD = new THREE.IcosahedronGeometry(1, 0);
const RING = new THREE.RingGeometry(0.82, 1, 40);
const FLAME = new THREE.ConeGeometry(0.5, 1, 5);

function light(color, opacity) {
  return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity == null ? 1 : opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

// How each spell looks. bolt = it flies to the target; land = the burst on the target; cast = colour of the motes.
export const SPELL_FX = {
  shadowBolt:      { cast: 0xa06bff, bolt: { color: 0x9a5cff, core: 0xe6d6ff, size: 0.3, speed: 42 }, land: { color: 0x9a5cff, size: 1.5, sparks: 10 } },
  soulFire:        { cast: 0xff8a2a, bolt: { color: 0xff7a1f, core: 0xfff0b0, size: 0.5, speed: 36 }, land: { color: 0xff7a1f, size: 2.6, sparks: 18 } },
  incinerate:      { cast: 0xffa53a, bolt: { color: 0xffa53a, core: 0xfff3c4, size: 0.3, speed: 44 }, land: { color: 0xffa53a, size: 1.5, sparks: 10 } },
  deathCoil:       { cast: 0x6dff8f, bolt: { color: 0x58e06f, core: 0xd8ffd0, size: 0.32, speed: 30 }, land: { color: 0x58e06f, size: 1.6, sparks: 8 } },
  searingPain:     { cast: 0xff8a2a, land: { color: 0xff8a2a, size: 1.3, sparks: 8 } },
  conflagrate:     { cast: 0xff6a1a, land: { color: 0xff6a1a, size: 2.8, sparks: 22, ring: true } },
  shadowburn:      { cast: 0x7a3cff, land: { color: 0x7a3cff, size: 2.2, sparks: 14, ring: true } },
  immolate:        { cast: 0xff8a2a, land: { color: 0xff8a2a, size: 1.6, sparks: 12 } },
  corruption:      { cast: 0x9a4cff, land: { color: 0x8a3cff, size: 1.5, ring: true } },
  baneOfAgony:     { cast: 0xc04cff, land: { color: 0xc04cff, size: 1.6, ring: true } },
  baneOfDoom:      { cast: 0xff3355, land: { color: 0xff3355, size: 2.2, ring: true } },
  curseOfElements: { cast: 0x7d6bff, land: { color: 0x7d6bff, size: 2.2, ring: true } },
  siphonLife:      { cast: 0x6dff8f, land: { color: 0x6dff8f, size: 1.4, ring: true } },
  drainLife:       { cast: 0x8dff9a, land: { color: 0x8dff9a, size: 0.6 } },
  wrack:           { cast: 0xb07cff, land: { color: 0xb07cff, size: 0.7 } },
  lifeTap:         { cast: 0xff4a5a },
  baneOfHavoc:     { cast: 0xff5ca8, land: { color: 0xff5ca8, size: 1.9, ring: true } },
  rainOfFire:      { cast: 0xff8a2a, land: { color: 0xff8a2a, size: 0.8 } },
  hellfire:        { cast: 0xff5a1a, land: { color: 0xff5a1a, size: 0.8 } },
  'pet:firebolt':  { bolt: { color: 0xff8a2a, core: 0xfff0b0, size: 0.2, speed: 40 }, land: { color: 0xff8a2a, size: 1.0, sparks: 6 } },
  'pet:lashOfPain': { land: { color: 0xd06cff, size: 1.1, sparks: 6 } },
  'pet:melee':     { land: { color: 0xffffff, size: 0.6 } },
  'pet:brand':     { land: { color: 0xff5ca8, size: 0.9, ring: true } }
};

export function createEffects(scene) {
  const live = [];                 // short-lived things: { mesh, update(dt) -> true when finished }
  const group = new THREE.Group();
  scene.add(group);

  function spawn(geometry, material, update) {
    const mesh = new THREE.Mesh(geometry, material);
    group.add(mesh);
    live.push({ mesh: mesh, update: update });
    return mesh;
  }

  // A flash that swells and fades; with `ring` also a ring that spreads out flat.
  function burst(at, o) {
    const size = o.size || 1, life = o.life || 0.35;
    let age = 0;
    const material = light(o.color, 0.9);
    const ball = spawn(BALL, material, function (dt) {
      age += dt;
      const k = age / life;
      ball.scale.setScalar(size * (0.25 + 0.75 * Math.sqrt(k)));
      material.opacity = 0.9 * (1 - k) * (1 - k);
      return k >= 1;
    });
    ball.position.copy(at);
    if (o.ring) {
      let ringAge = 0;
      const ringMaterial = light(o.color, 0.9);
      const ring = spawn(RING, ringMaterial, function (dt) {
        ringAge += dt;
        const k = ringAge / (life * 1.8);
        ring.scale.setScalar(size * (0.3 + 1.3 * k));
        ringMaterial.opacity = 0.9 * (1 - k);
        return k >= 1;
      });
      ring.position.copy(at);
      ring.rotation.x = -Math.PI / 2;
    }
    for (let i = 0; i < (o.sparks || 0); i++) spark(at, o.color, size);
  }

  // A small shard thrown outward that falls and fades.
  function spark(at, color, size) {
    const life = 0.35 + Math.random() * 0.35;
    const vx = (Math.random() - 0.5) * 7 * size, vz = (Math.random() - 0.5) * 7 * size;
    let vy = 1.5 + Math.random() * 4, age = 0;
    const material = light(color, 1);
    const shard = spawn(SHARD, material, function (dt) {
      age += dt;
      vy -= 12 * dt;
      shard.position.x += vx * dt; shard.position.y += vy * dt; shard.position.z += vz * dt;
      shard.rotation.x += dt * 9;
      material.opacity = 1 - age / life;
      return age >= life;
    });
    shard.position.copy(at);
    shard.scale.setScalar(0.05 + Math.random() * 0.06);
  }

  // A bolt from `from` to `to`; `arrive` is called when it gets there.
  function bolt(from, to, o, arrive) {
    const start = from.clone(), end = to.clone();
    const distance = Math.max(start.distanceTo(end), 0.001), time = distance / o.speed;
    const dir = end.clone().sub(start).normalize();
    let age = 0;
    const head = new THREE.Group();
    const core = new THREE.Mesh(BALL, light(o.core, 1));
    core.scale.setScalar(o.size * 0.55);
    const glow = new THREE.Mesh(BALL, light(o.color, 0.55));
    glow.scale.setScalar(o.size);
    head.add(glow, core);
    const tail = [];
    for (let i = 1; i <= 6; i++) {
      const piece = new THREE.Mesh(BALL, light(o.color, 0.5 * (1 - i / 7)));
      piece.scale.setScalar(o.size * (1 - i / 8));
      piece.position.copy(dir).multiplyScalar(-i * o.size * 0.9);
      head.add(piece);
      tail.push(piece);
    }
    head.position.copy(start);
    group.add(head);
    live.push({ mesh: head, parts: [core, glow].concat(tail), update: function (dt) {
      age += dt;
      const k = Math.min(1, age / time);
      head.position.lerpVectors(start, end, k);
      glow.scale.setScalar(o.size * (1 + Math.sin(age * 40) * 0.15));
      if (k >= 1) { if (arrive) arrive(); return true; }
      return false;
    } });
    return time;
  }

  // ---------- motes gathering at the staff while you cast ----------
  const motes = [];
  const moteMaterial = light(0xffffff, 0.9);
  for (let i = 0; i < 7; i++) {
    const mote = new THREE.Mesh(SHARD, moteMaterial);
    mote.visible = false;
    group.add(mote);
    motes.push(mote);
  }
  // at: where the staff's orb is, or null when you are not casting; progress: 0 at the start of the cast, 1 at its end.
  function casting(at, color, progress, time) {
    for (let i = 0; i < motes.length; i++) {
      const mote = motes[i];
      mote.visible = !!at;
      if (!at) continue;
      const turn = time * 5 + i * (Math.PI * 2 / motes.length), radius = 0.2 + (1 - progress) * 0.75;
      mote.position.set(at.x + Math.cos(turn) * radius, at.y + Math.sin(turn * 1.7 + i) * radius * 0.6, at.z + Math.sin(turn) * radius);
      mote.scale.setScalar(0.035 + progress * 0.035);
      mote.rotation.y = turn;
    }
    if (at) moteMaterial.color.set(color);
  }

  // ---------- what hangs on the dummy while a DoT or curse is on it ----------
  const marks = [null, {}, {}, {}];              // one set per dummy
  function mark(name, build) {
    for (let ti = 1; ti <= 3; ti++) {
      const holder = new THREE.Group(), g = new THREE.Group();
      holder.visible = false;
      holder.add(g);
      scene.add(holder);
      marks[ti][name] = { holder: holder, update: build(g) };
    }
  }

  mark('immolate', function (g) {                 // flames licking up the dummy
    const flames = [];
    for (let i = 0; i < 6; i++) {
      const flame = new THREE.Mesh(FLAME, light(i % 2 ? 0xffc23d : 0xff7a1f, 0.75));
      const a = i * Math.PI / 3;
      flame.position.set(Math.sin(a) * 0.6, 0.7 + (i % 3) * 0.55, Math.cos(a) * 0.6);
      g.add(flame);
      flames.push(flame);
    }
    return function (time) {
      flames.forEach(function (flame, i) {
        const f = 1 + Math.sin(time * 11 + i * 2.1) * 0.25 + Math.sin(time * 23 + i) * 0.12;
        flame.scale.set(0.5, 0.75 * f, 0.5);
      });
    };
  });
  mark('corruption', function (g) {               // dark wisps circling it
    const wisps = [];
    for (let i = 0; i < 5; i++) { const w = new THREE.Mesh(BALL, light(0x8a3cff, 0.8)); w.scale.setScalar(0.11); g.add(w); wisps.push(w); }
    return function (time) {
      wisps.forEach(function (w, i) {
        const a = time * 2.2 + i * (Math.PI * 2 / 5);
        w.position.set(Math.sin(a) * 1.0, 1.3 + Math.sin(time * 1.7 + i * 1.3) * 0.9, Math.cos(a) * 1.0);
      });
    };
  });
  mark('siphonLife', function (g) {               // green motes circling the other way
    const wisps = [];
    for (let i = 0; i < 3; i++) { const w = new THREE.Mesh(BALL, light(0x6dff8f, 0.8)); w.scale.setScalar(0.09); g.add(w); wisps.push(w); }
    return function (time) {
      wisps.forEach(function (w, i) {
        const a = -time * 2.8 + i * (Math.PI * 2 / 3);
        w.position.set(Math.sin(a) * 0.8, 2.0 + Math.sin(time * 2.3 + i) * 0.5, Math.cos(a) * 0.8);
      });
    };
  });
  function sigil(color, size, height) {             // a turning ring above its head
    return function (g) {
      const outer = new THREE.Mesh(RING, light(color, 0.85)), inner = new THREE.Mesh(RING, light(color, 0.6));
      outer.rotation.x = inner.rotation.x = -Math.PI / 2;
      outer.scale.setScalar(size); inner.scale.setScalar(size * 0.55);
      const gem = new THREE.Mesh(SHARD, light(color, 0.9));
      gem.scale.setScalar(size * 0.22);
      g.add(outer, inner, gem);
      g.position.y = height;
      return function (time) {
        outer.rotation.z = time * 0.9; inner.rotation.z = -time * 1.6;
        gem.rotation.y = time * 2; gem.position.y = Math.sin(time * 2.4) * 0.08;
      };
    };
  }
  mark('baneOfAgony', sigil(0xc04cff, 0.55, 4.05));
  mark('baneOfDoom', sigil(0xff3355, 0.8, 4.15));
  mark('havoc', sigil(0xff5ca8, 0.68, 4.1));
  mark('coe', function (g) {                        // a violet ring on the floor around it
    const ring = new THREE.Mesh(RING, light(0x7d6bff, 0.6));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ring.scale.setScalar(2.1);
    g.add(ring);
    return function (time) { ring.material.opacity = 0.4 + Math.sin(time * 2.5) * 0.2; ring.rotation.z = time * 0.3; };
  });

  // ti: which dummy (1-3); at: where it stands { x, z }; on: { immolate: true, corruption: false, ... }
  function setMarks(ti, at, on, time) {
    for (const name in marks[ti]) {
      const m = marks[ti][name], show = !!on[name];
      m.holder.visible = show;
      if (!show) continue;
      m.holder.position.set(at.x, 0, at.z);
      m.update(time);
    }
  }

  function update(dt) {
    for (let i = live.length - 1; i >= 0; i--) {
      const item = live[i];
      if (!item.update(dt)) continue;
      group.remove(item.mesh);
      (item.parts || [item.mesh]).forEach(function (p) { p.material.dispose(); });
      live.splice(i, 1);
    }
  }

  function clear() {
    live.forEach(function (item) { group.remove(item.mesh); (item.parts || [item.mesh]).forEach(function (p) { p.material.dispose(); }); });
    live.length = 0;
  }

  return { burst: burst, bolt: bolt, casting: casting, setMarks: setMarks, update: update, clear: clear, count: function () { return live.length; } };
}
