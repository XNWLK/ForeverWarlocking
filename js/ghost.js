// The sim as a ghost: a see-through second Warlock that stands a little to your right and casts what the sim casts,
// at the same second of the fight. Its casts are those of one of the sim's own fights (the worker's `casts`, the same
// fight the review's timeline shows), so it is a guide to the order of things, not a copy of your dice - except in a
// seeded fight, where the sim rolls the same dice as you.
// Its demon comes along, see-through too, a little right of it: it attacks when the sim's fight begins, the Imp casts Firebolt
// when the sim's Imp does, the Succubus uses Lash of Pain when the sim's does and swings at her own pace.
// Looks only: it takes no part in the fight.
import * as THREE from 'three';
import { createPet } from './pets.js';

const RIGHT = 2.6, BACK = 0.5;                             // where it stands, in yards from you (right of you, a little behind)
const GHOST = new THREE.Color(0xcdb8ff);

function el(tag, className) { const n = document.createElement(tag); if (className) n.className = className; return n; }

// scene; makeWarlock (js/warlock.js); effects (js/effects.js); WL (the sim's data); icon(key) -> picture address.
export function createGhost(scene, makeWarlock, effects, WL, icon) {
  const warlock = makeWarlock('human');
  const solid = new THREE.MeshLambertMaterial({ color: GHOST, emissive: 0x5a3d96, emissiveIntensity: 0.55, transparent: true, opacity: 0.3, depthWrite: false, flatShading: true });
  let race = null;
  // Makes whatever a model is built of see-through and pale; its own glows fainter. Done again after every rebuild.
  function paint(root) {
    root.traverse(function (part) {
      if (part.isSprite) { part.material.opacity = 0.25; return; }
      if (!part.isMesh) return;
      part.castShadow = false; part.receiveShadow = false;
      if (part.material.isMeshLambertMaterial) part.material = solid;
      else if (part.material.color && part.material.color.getHex() === 0x000000) part.visible = false;   // its shadow on the floor
      else { part.material.transparent = true; part.material.opacity = 0.45; part.material.depthWrite = false; }
    });
  }
  scene.add(warlock.root);
  warlock.root.visible = false;
  const pet = createPet(scene, { paint: paint, side: -0.8 })   // just right of the ghost and behind it, not out at the edge;
  let petKind = null, petNext = 0, swingAt = -1;

  // Its name over its head, with what it casts.
  const tag = el('div', 'ghost-tag'), pic = el('img'), word = el('span'), bar = el('i');
  tag.append(el('b'), pic, word, bar);
  tag.firstChild.textContent = 'Sim';
  pic.alt = '';
  tag.hidden = true;
  document.getElementById('plates').appendChild(tag);

  const at = { x: 0, z: 0, yaw: 0, placed: false };
  let list = null, next = 0, lastT = -1, said = null, pending = [];
  const from = new THREE.Vector3(), head = new THREE.Vector3();

  function spell(k) { return WL.SPELLS[k.replace(/^x\d:/, '')] || null; }
  function targetOf(k) { const m = /^x(\d):/.exec(k); return m ? Number(m[1]) : 1; }

  // o: { show, race, player: { x, z, yaw, moving }, t: seconds into the fight (null before it begins), casts (the
  //      sim's, or null), spot(i) -> { x, z } of dummy i, chest(i) -> where a spell lands on it, targets, camera }
  function update(dt, time, o) {
    const on = !!o.show;
    warlock.root.visible = on;
    if (!on) { tag.hidden = true; if (petKind) { petKind = null; pet.setKind(null); } return; }
    if (o.race !== race) { race = o.race; warlock.setRace(race); paint(warlock.root); }
    if (o.petKind !== petKind) { petKind = o.petKind; pet.setKind(petKind); }
    if (o.casts !== list || o.t == null || o.t < lastT - 0.01) { list = o.casts; next = 0; pending = []; said = null; petNext = 0; swingAt = -1; }   // a new fight, or the sim's numbers changed
    const t = o.t == null ? -1 : o.t;
    lastT = t;

    // Where it stands: to your right and a little behind you, following you smoothly.
    const p = o.player, sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const gx = p.x + cos * RIGHT + sin * BACK, gz = p.z - sin * RIGHT + cos * BACK;
    if (!at.placed) { at.x = gx; at.z = gz; at.placed = true; }
    const dx = gx - at.x, dz = gz - at.z, gap = Math.hypot(dx, dz), step = Math.min(gap, Math.max(7, gap * 4) * dt);
    if (gap > 0.001) { at.x += dx / gap * step; at.z += dz / gap * step; }
    const moving = gap > 0.3;

    // What the sim casts at this second: the casts it has passed go off (an instant at once, a cast bar when it ends).
    let current = null, target = 1;
    if (list && t >= 0) {
      while (next < list.length && list[next].t <= t) {
        const c = list[next++];
        if (c.ch || !(c.d > 0)) pending.push({ at: c.t, c: c }); else pending.push({ at: c.t + c.d, c: c });
      }
      for (let i = next - 1; i >= 0 && i >= next - 3; i--) {                 // the cast or channel still running
        const c = list[i];
        if (c.d > 0 && t < c.t + c.d) { current = c; break; }
      }
      pending = pending.filter(function (g) {
        if (g.at > t) return true;
        const s = spell(g.c.k);
        warlock.release();
        said = { c: g.c, until: t + 1.2 };
        if (s && (s.base != null || s.tickBase != null) && !s.aoe && o.chest) effects.streak(warlock.orbPosition(from), o.chest(targetOf(g.c.k)), 0xd9c8ff);
        return false;
      });
      const last = current || (said && said.c) || (next > 0 ? list[next - 1] : null);
      if (last) target = Math.min(o.targets, targetOf(last.k));
    }

    // It faces the dummy it is casting at (or the first one), unless it is walking to keep up with you.
    const spot = o.spot(target);
    const face = moving ? Math.atan2(-dx, -dz) : Math.atan2(at.x - spot.x, at.z - spot.z);
    let turn = face - at.yaw;
    while (turn > Math.PI) turn -= Math.PI * 2;
    while (turn < -Math.PI) turn += Math.PI * 2;
    at.yaw += turn * Math.min(1, dt * 8);
    warlock.root.position.set(at.x, 0, at.z);
    warlock.root.rotation.y = at.yaw;
    const s = current ? spell(current.k) : null;
    warlock.update(dt, time, moving, 0, current ? (s && s.school === 'fire' ? 'fire' : 'shadow') : null);
    if (petKind) demon(dt, time, o, t, target);

    // The tag over its head.
    head.set(at.x, 2.55 * warlock.size, at.z).project(o.camera);
    const visible = head.z < 1 && Math.abs(head.x) < 1.1 && Math.abs(head.y) < 1.1;
    tag.hidden = !visible;
    if (!visible) return;
    tag.style.left = ((head.x * 0.5 + 0.5) * window.innerWidth).toFixed(1) + 'px';
    tag.style.top = ((-head.y * 0.5 + 0.5) * window.innerHeight).toFixed(1) + 'px';
    const show = current || (said && t < said.until ? said.c : null), shown = show ? spell(show.k) : null;
    const key = show ? show.k.replace(/^x\d:/, '') : '';
    word.textContent = show ? (shown ? shown.name : key) : o.t == null ? 'waits for you' : list ? '' : 'thinking';
    pic.hidden = !show || !icon(key);
    if (show && icon(key) && pic.getAttribute('src') !== icon(key)) pic.src = icon(key);
    bar.style.width = current ? Math.min(100, 100 * (t - current.t) / current.d).toFixed(0) + '%' : '0';
    bar.hidden = !current;
  }

  // The ghost's demon: follows the ghost until the sim's fight begins, then attacks as the sim's demon does.
  const petFrom = new THREE.Vector3();
  function demon(dt, time, o, t, target) {
    const hits = o.petHits || [], fighting = !!list && t >= 0 && !o.over, spot = o.spot(target), P = pet.state;
    let cast = 0;
    if (fighting) {
      while (petNext < hits.length && hits[petNext].t <= t) {
        pet.strike();
        if (petKind === 'imp' && o.chest) effects.streak(petFrom.set(P.x, 0.65, P.z), o.chest(target), 0xffc89a);
        petNext++;
      }
      const coming = petNext < hits.length ? hits[petNext] : null;
      if (petKind === 'imp' && coming && coming.k === 'pet:firebolt' && coming.t - t < 2) cast = Math.max(0, 1 - (coming.t - t) / 2);   // Firebolt: a 2 s cast
      if (petKind === 'succubus' && P.distance <= (o.petRange || 5) + 0.5) {             // her swings are not in the sim's log: her own pace
        if (swingAt < 0) swingAt = t;
        if (t >= swingAt) { pet.strike(); swingAt = t + (o.swing || 2); }
      }
    }
    pet.update(dt, time, { x: at.x, z: at.z, yaw: at.yaw }, fighting ? 'attack' : 'follow', o.petRange || 30, cast, !fighting && t >= 0, spot, []);
  }

  return {
    update: update,
    hide: function () { warlock.root.visible = false; tag.hidden = true; pet.setKind(null); petKind = null; },
    place: function () { at.placed = false; pet.sendHome(); }   // stand next to you at once (a new fight, a replay)
  };
}
