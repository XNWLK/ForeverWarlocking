// Cosmetic proportions only. Combat dimensions and racial stats belong to the existing sim.
// Original low-poly geometry, with silhouettes inspired by the Classic races.
import * as THREE from 'three';
import { add, flat, glow } from './kit.js';

export const RACE_APPEARANCES = {
  human:  { width: 1, height: 1, depth: 1, skin: 0xcfa184, hair: 0x302821, lean: 0, arm: 1, bulk: 1, head: 1, headY: 1.98, headZ: -0.02 },
  gnome:  { width: 0.66, height: 0.55, depth: 0.72, skin: 0xe1b295, hair: 0xdbe3e4, lean: 0, arm: 0.94, bulk: 1.08, head: 1.48, headY: 2.0, headZ: -0.03 },
  orc:    { width: 1.3, height: 1.08, depth: 1.12, skin: 0x609448, hair: 0x232325, lean: -0.035, arm: 1.08, bulk: 1.42, head: 1.12, headY: 1.98, headZ: -0.08, bare: true },
  undead: { width: 0.86, height: 0.98, depth: 0.88, skin: 0x94a087, hair: 0x44443d, lean: -0.30, arm: 1.12, bulk: 0.66, head: 1, headY: 1.87, headZ: -0.20, bare: true },
  troll:  { width: 0.94, height: 1.17, depth: 0.95, skin: 0x519c9a, hair: 0x282b40, lean: -0.09, arm: 1.22, bulk: 0.93, head: 1.06, headY: 1.96, headZ: -0.12, bare: true }
};

// A tapered segment between two points, used for ears, tusks and fingers.
function taper(parent, from, to, radius, tipRadius, material) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), delta = b.clone().sub(a);
  const mesh = add(parent, new THREE.CylinderGeometry(tipRadius, radius, delta.length(), 6), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize());
  return mesh;
}
function oval(parent, material, at, scale, detail = 1) {
  const mesh = add(parent, new THREE.IcosahedronGeometry(1, detail), material, ...at);
  mesh.scale.set(...scale); return mesh;
}

// Preserve XN's original hood, face and glowing eyes for Human.
function originalHead(rig, skin, robe, robeDark) {
  const head = new THREE.Group(); head.name = 'head-human'; rig.add(head);
  add(head, new THREE.IcosahedronGeometry(0.15, 1), skin, 0, 1.94, -0.03);
  const hood = add(head, new THREE.IcosahedronGeometry(0.215, 1), robeDark, 0, 1.97, 0.07);
  hood.scale.set(1, 1.08, 1.05);
  const rim = add(head, new THREE.TorusGeometry(0.165, 0.04, 6, 14), robe, 0, 1.96, -0.09);
  rim.rotation.x = 0.18;
  const tip = add(head, new THREE.ConeGeometry(0.11, 0.32, 6), robeDark, 0, 2.06, 0.27);
  tip.rotation.x = 1.95;
  [-1, 1].forEach(s => add(head, new THREE.SphereGeometry(0.022, 6, 4), glow(0xa8ffd8), s * 0.055, 1.96, -0.175));
  return head;
}

function undeadHead(rig, p, skin, bone) {
  const head = new THREE.Group(); head.name = 'head-undead'; rig.add(head);
  head.position.set(0, p.headY, p.headZ); head.rotation.x = 0.14;
  const dark = flat(0x24282a), shadow = flat(0x657560), cloth = flat(0x30263f), edge = flat(0x514065);
  // An open, angular hood: a cloth rim and closed back, with a real opening around the face.
  const outline = [[-.13,-.24],[-.21,-.1],[-.24,.12],[-.13,.29],[0,.35],[.13,.29],[.24,.12],[.21,-.1],[.13,-.24],[0,-.27]];
  const shell = [], border = [];
  const tri = (out, a, b, c) => out.push(...a, ...b, ...c);
  outline.forEach(([x,y], i) => {
    const [nx,ny] = outline[(i+1)%outline.length];
    const a=[x,y,-.12], b=[nx,ny,-.12], c=[nx*.74,ny*.83,-.15], d=[x*.74,y*.83,-.15];
    tri(border,a,b,c); tri(border,a,c,d);
    const backA=[x*.78,y*.84,.18], backB=[nx*.78,ny*.84,.18];
    tri(shell,b,a,backA); tri(shell,b,backA,backB); tri(shell,backB,backA,[0,0,.23]);
  });
  for (const [points, material] of [[shell,cloth],[border,edge]]) {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(points,3)); geometry.computeVertexNormals();
    material.side = THREE.DoubleSide; add(head,geometry,material);
  }
  oval(head, skin, [0,.01,.005], [.137,.21,.13]);
  oval(head, shadow, [0,-.09,-.04], [.108,.103,.105]);
  oval(head, skin, [0,-.169,-.073], [.09,.052,.072], 0);
  [-1,1].forEach(s => {
    // Deep eye sockets, sharp cheekbones and hollow cheeks, instead of a round skull mask.
    oval(head,dark,[s*.061,.047,-.123],[.055,.047,.022],0);
    const eye=oval(head,glow(0xe4df78),[s*.06,.039,-.146],[.035,.011,.01],0); eye.rotation.z=s*-.14;
    const brow=oval(head,shadow,[s*.065,.082,-.121],[.064,.024,.025],0); brow.rotation.z=s*.19;
    oval(head,skin,[s*.104,-.015,-.11],[.043,.05,.04],0);
    oval(head,shadow,[s*.092,-.08,-.102],[.035,.042,.025],0);
    taper(head,[s*.131,.017,0],[s*.204,.088,.025],.044,0,skin);
  });
  oval(head,skin,[0,-.022,-.141],[.026,.067,.033],0);
  oval(head,dark,[0,-.057,-.168],[.018,.013,.009],0);
  add(head,new THREE.BoxGeometry(.112,.024,.015),dark,0,-.122,-.145);
  [-.042,-.018,.013,.038].forEach((x,i) => add(head,new THREE.BoxGeometry(.012,.012+(i%2)*.005,.008),bone,x,-.117,-.155));
  return head;
}

export function addRaceHead(rig, race, p, skin, bone, gold, robe, robeDark) {
  if (race === 'human') return originalHead(rig, skin, robe, robeDark);
  if (race === 'undead') return undeadHead(rig, p, skin, bone);
  const head = new THREE.Group(); head.name = 'head-' + race;
  head.position.set(0, p.headY, p.headZ); head.scale.setScalar(p.head); rig.add(head);
  const hair = flat(p.hair), shade = flat(new THREE.Color(p.skin).multiplyScalar(0.62)), dark = flat(0x29262a);
  const eyes = flat(race === 'orc' ? 0xd9b060 : 0xdadbd2);
  const pupil = flat(0x1d2628);
  const broad = race === 'orc';
  oval(head, skin, [0, 0, 0], [broad ? 0.19 : 0.175, 0.215, 0.155]);
  oval(head, skin, [0, -0.105, -0.05], [broad ? 0.185 : 0.125, 0.09, 0.135]);
  add(head, new THREE.BoxGeometry(broad ? 0.21 : 0.13, 0.018, 0.015), dark, 0, -0.103, -0.187);
  oval(head, skin, [0, -0.007, -0.167], [race === 'gnome' ? 0.063 : 0.045, broad ? 0.04 : 0.062, race === 'troll' ? 0.09 : 0.054]);

  [-1, 1].forEach(s => {
    const eyeX = s * (broad ? 0.081 : 0.065);
    oval(head, eyes, [eyeX, 0.038, -0.166], [0.033, 0.024, 0.016]);
    oval(head, pupil, [eyeX, 0.038, -0.18], [0.012, 0.018, 0.006], 0);
    const brow = add(head, new THREE.BoxGeometry(broad ? 0.105 : 0.085, broad ? 0.041 : 0.027, 0.035), race === 'gnome' ? hair : shade, eyeX, 0.083, -0.156);
    brow.rotation.z = s * (broad ? 0.18 : 0.06);
    if (race === 'troll' || broad) {
      const length = race === 'troll' ? 0.44 : 0.28, high = race === 'troll' ? 0.29 : 0.2;
      const ear = taper(head, [s * 0.14, 0.03, 0], [s * length, high, 0.04], 0.083, 0, skin);
      ear.scale.z = 0.45;
      const inside = taper(head, [s * 0.18, 0.055, -0.023], [s * (length - 0.04), high - 0.035, 0.013], 0.038, 0, shade);
      inside.scale.z = 0.25;
    } else oval(head, skin, [s * (race === 'gnome' ? 0.19 : 0.165), 0.0, 0], [race === 'gnome' ? 0.065 : 0.039, 0.072, 0.035]);

    if (broad || race === 'troll') {
      const points = broad ? [[s * 0.12, -0.11, -0.18], [s * 0.135, -0.035, -0.235], [s * 0.12, 0.058, -0.23]] :
        [[s * 0.10, -0.10, -0.19], [s * 0.18, -0.03, -0.30], [s * 0.21, 0.10, -0.33], [s * 0.19, 0.24, -0.31]];
      points.slice(1).forEach((to, i) => taper(head, points[i], to, 0.044 * (1 - i / (points.length - 1)), i === points.length - 2 ? 0 : 0.03, bone));
    }
  });

  if (race === 'gnome') {
    // Bald crown, white side tufts, a moustache and a long pointed beard.
    [-1, 1].forEach(s => {
      oval(head, hair, [s * 0.16, 0.095, 0.055], [0.062, 0.13, 0.14]);
      const moustache = oval(head, hair, [s * 0.085, -0.065, -0.192], [0.10, 0.038, 0.036]);
      moustache.rotation.z = s * -0.25;
      taper(head, [s * 0.16, -0.066, -0.185], [s * 0.23, -0.015, -0.16], 0.028, 0, hair);
    });
    oval(head, hair, [0, -0.16, -0.24], [0.147, 0.12, 0.105]);
    taper(head, [0, -0.17, -0.24], [0, -0.40, -0.32], 0.134, 0.012, hair);
  } else if (broad) {
    for (let i = 0; i < 4; i++) oval(head, hair, [0, 0.215, -0.06 + i * 0.06], [0.065, 0.09, 0.052], 0);
    [-1, 1].forEach(s => {
      oval(head, hair, [s * 0.15, -0.005, 0.08], [0.064, 0.21, 0.088]);
      taper(head, [s * 0.16, -0.12, 0.07], [s * 0.19, -0.32, 0.09], 0.058, 0.029, hair);
      add(head, new THREE.CylinderGeometry(0.041, 0.045, 0.044, 6), gold, s * 0.186, -0.27, 0.084);
    });
  } else if (race === 'troll') {
    // A narrow swept crest reads clearly from the normal camera behind the player.
    for (let i = 0; i < 5; i++) taper(head, [0, 0.17, -0.10 + i * 0.055], [0, 0.38 + i * 0.035, -0.015 + i * 0.08], 0.057, 0, hair);
    taper(head, [0, 0.1, 0.13], [0, -0.30, 0.24], 0.058, 0.018, hair);
    add(head, new THREE.CylinderGeometry(0.032, 0.032, 0.035, 6), gold, 0, -0.21, 0.22);
  }
  return head;
}

export function addRaceHand(fore, race, p, skin, bone, length) {
  if (race === 'human') return add(fore, new THREE.IcosahedronGeometry(0.075, 0), skin, 0, -0.4, 0);
  const hand = new THREE.Group(); hand.name = 'hand-' + race; hand.position.y = -length - 0.065; fore.add(hand);
  const bony = race === 'undead';
  oval(hand, skin, [0, 0, 0], [0.073 * p.bulk, 0.085, 0.06 * p.bulk], 0);
  if (bony) {
    // Crooked, splayed fingers and a thumb remain legible at the normal camera distance.
    for (let i=0;i<4;i++) {
      const x=(i-1.5)*.025, endY=-.18+Math.abs(i-1.5)*.025;
      taper(hand,[x,-.02,-.01],[x*1.8,-.10,-.03],.014,.012,bone);
      taper(hand,[x*1.8,-.10,-.03],[x*1.65,endY,-.075],.012,.004,bone);
    }
    taper(hand,[-.04,.012,0],[-.088,-.043,-.035],.018,.011,skin);
    taper(hand,[-.088,-.043,-.035],[-.078,-.092,-.075],.011,.003,bone);
    return hand;
  }
  if (p.bare) {
    const fingers = race === 'troll' ? 3 : 4;
    for (let i = 0; i < fingers; i++) {
      const x = (i - (fingers - 1) / 2) * 0.029 * p.bulk;
      taper(hand, [x, -0.04, -0.018], [x * 1.16, -0.14, -0.038], 0.016 * p.bulk, 0.01, skin);
    }
  }
}
