// The Warlock, built from simple shapes like every model here, in the shape of the race you picked.
// One unit is one yard; the character faces -z (its back is toward +z).
//
// All races wear the same robe and carry the same staff, so the spells start from the same place on each. What
// differs is the build (how tall, how broad, how far it stoops, how long the arms are) and the head. Looks only:
// walking, collisions, ranges and the rules of the fight are the same for every race.
import * as THREE from 'three';
import { flat, glow, add, halo, groundShadow } from './kit.js';

// size: the whole figure against a Human; wide: how broad the body is; lean: how far the upper body stoops forward
// (radians); arm: arm length; bulk: how thick the arms are; hood: worn up (the two races whose face it suits).
export const RACE_LOOKS = {
  human:  { size: 1,    wide: 1,    lean: 0,    arm: 1,    bulk: 1,    hood: true,  skin: 0xcfa184 },
  gnome:  { size: 0.6,  wide: 1.12, lean: 0,    arm: 0.92, bulk: 1.1,  hood: false, skin: 0xe6b497, hair: 0xf06aa8 },
  orc:    { size: 1.05, wide: 1.26, lean: 0.1,  arm: 1.06, bulk: 1.35, hood: false, skin: 0x5d8f41, hair: 0x1c1a1f },
  undead: { size: 0.97, wide: 0.84, lean: 0.27, arm: 1.1,  bulk: 0.72, hood: true,  skin: 0x9aa78e },
  troll:  { size: 1.13, wide: 0.92, lean: 0.17, arm: 1.2,  bulk: 0.9,  hood: false, skin: 0x4a93ad, hair: 0xff7a2a }
};

function darker(color, by) { return new THREE.Color(color).multiplyScalar(by).getHex(); }
// A ball squashed or stretched into shape.
function blob(parent, radius, material, x, y, z, sx, sy, sz, detail) {
  const mesh = add(parent, new THREE.IcosahedronGeometry(radius, detail == null ? 1 : detail), material, x, y, z);
  mesh.scale.set(sx == null ? 1 : sx, sy == null ? 1 : sy, sz == null ? 1 : sz);
  return mesh;
}
// A spike from one point to another (tusks, ears, hair).
const UP = new THREE.Vector3(0, 1, 0);
function spike(parent, from, to, radius, material, sides) {
  const a = new THREE.Vector3(from[0], from[1], from[2]), b = new THREE.Vector3(to[0], to[1], to[2]), d = b.clone().sub(a);
  const mesh = add(parent, new THREE.ConeGeometry(radius, d.length(), sides || 5), material);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  return mesh;
}

// ---------- heads ----------
// Each is built around the middle of the head (0, 0, 0), face toward -z, about 0.15 in radius.
// A hood worn down lies as a roll of cloth round the neck.
function collar(head, cloth) {
  const roll = add(head, new THREE.TorusGeometry(0.15, 0.055, 6, 12), cloth, 0, -0.15, 0.05);
  roll.rotation.x = Math.PI / 2 - 0.25;
}
function eyes(head, color, x, y, z, r) {
  [-1, 1].forEach(function (s) { add(head, new THREE.SphereGeometry(r || 0.022, 6, 4), glow(color), s * x, y, z); });
}

const HEADS = {
  // The hood covers the top and back and leaves the face free; the eyes glow.
  human: function (head, m) {
    add(head, new THREE.IcosahedronGeometry(0.15, 1), m.skin, 0, 0, 0);
    blob(head, 0.215, m.robeDark, 0, 0.03, 0.1, 1, 1.08, 1.05);
    add(head, new THREE.TorusGeometry(0.165, 0.04, 6, 14), m.robe, 0, 0.02, -0.06).rotation.x = 0.18;
    add(head, new THREE.ConeGeometry(0.11, 0.32, 6), m.robeDark, 0, 0.12, 0.3).rotation.x = 1.95;
    eyes(head, 0xa8ffd8, 0.055, 0.02, -0.145);
  },
  // A big round head on a small body: wide ears, a button nose, pink hair in a topknot and two buns.
  gnome: function (head, m) {
    blob(head, 0.15, m.skin, 0, 0, 0, 1.08, 1, 1.02);
    blob(head, 0.1, m.skin, 0, -0.07, -0.03, 1.15, 0.7, 1);                     // round cheeks
    [-1, 1].forEach(function (s) {
      blob(head, 0.085, m.skin, s * 0.17, 0.01, 0.01, 0.4, 1, 0.75);            // ears
      blob(head, 0.045, m.skinDark, s * 0.172, 0.01, -0.012, 0.3, 0.75, 0.5, 0);
      blob(head, 0.07, m.hair, s * 0.13, 0.12, 0.06, 1, 1, 1, 0);               // buns
      add(head, new THREE.BoxGeometry(0.06, 0.016, 0.02), m.hair, s * 0.058, 0.07, -0.135).rotation.z = -s * 0.2;   // brows
    });
    blob(head, 0.155, m.hair, 0, 0.045, 0.04, 1.04, 0.92, 1);                   // hair over the crown and the back
    blob(head, 0.06, m.hair, 0, 0.2, 0.02, 1, 1.25, 1, 0);                      // topknot
    add(head, new THREE.TorusGeometry(0.035, 0.014, 5, 8), m.gold, 0, 0.16, 0.02).rotation.x = Math.PI / 2;
    blob(head, 0.042, m.skin, 0, -0.03, -0.155, 1, 0.9, 1, 0);                  // nose
    eyes(head, 0xa8ffd8, 0.058, 0.025, -0.142, 0.026);
    collar(head, m.robeDark);
  },
  // A broad head with a heavy jaw, two tusks, a low brow, small pointed ears and a black topknot.
  orc: function (head, m) {
    blob(head, 0.155, m.skin, 0, 0.01, 0, 1.1, 0.95, 1.05);
    blob(head, 0.125, m.skin, 0, -0.085, -0.035, 1.18, 0.7, 1.05);              // jaw
    add(head, new THREE.BoxGeometry(0.23, 0.04, 0.06), m.skinDark, 0, 0.055, -0.125);   // brow
    blob(head, 0.04, m.skinDark, 0, -0.015, -0.16, 1.3, 0.8, 0.9, 0);           // flat nose
    add(head, new THREE.BoxGeometry(0.13, 0.014, 0.02), m.dark, 0, -0.092, -0.155);     // mouth
    [-1, 1].forEach(function (s) {
      spike(head, [s * 0.075, -0.1, -0.15], [s * 0.095, 0.0, -0.175], 0.026, m.bone);   // tusks
      spike(head, [s * 0.16, 0.02, 0.0], [s * 0.26, 0.09, 0.05], 0.045, m.skin, 4).scale.z = 0.5;   // ears
      add(head, new THREE.TorusGeometry(0.022, 0.007, 4, 8), m.gold, s * 0.215, 0.03, 0.03);        // earrings
    });
    blob(head, 0.06, m.hair, 0, 0.17, 0.04, 1, 0.9, 1, 0);                      // topknot, tied with a band
    add(head, new THREE.CylinderGeometry(0.035, 0.035, 0.03, 6), m.gold, 0, 0.215, 0.05);
    spike(head, [0, 0.22, 0.05], [0, 0.1, 0.28], 0.05, m.hair, 6);              // its tail down the back
    eyes(head, 0xffa13d, 0.066, 0.02, -0.148);
    collar(head, m.robeDark);
  },
  // A ragged hood over a hollow face: dark sockets with yellow lights, sunken cheeks, the jawbone showing.
  undead: function (head, m) {
    blob(head, 0.14, m.skin, 0, 0.01, 0, 0.95, 1.06, 1);
    blob(head, 0.2, m.robeDark, 0, 0.035, 0.095, 1, 1.1, 1.05);                 // hood
    add(head, new THREE.TorusGeometry(0.155, 0.035, 5, 9), m.robe, 0, 0.02, -0.055).rotation.x = 0.18;
    add(head, new THREE.ConeGeometry(0.095, 0.36, 5), m.robeDark, 0, 0.05, 0.31).rotation.x = 2.3;   // its tip hangs low
    [-1, 1].forEach(function (s) {
      blob(head, 0.04, m.dark, s * 0.052, 0.025, -0.118, 1.05, 0.95, 0.5, 0);   // eye sockets
      blob(head, 0.035, m.skinDark, s * 0.075, -0.05, -0.1, 0.8, 1.1, 0.5, 0);  // sunken cheeks
      spike(head, [s * 0.14, -0.2, 0.02], [s * 0.15, -0.34, 0.05], 0.03, m.robeDark, 4);   // torn ends of the hood
    });
    eyes(head, 0xf2e96a, 0.052, 0.025, -0.14, 0.014);
    blob(head, 0.016, m.dark, 0, -0.035, -0.142, 1, 1.3, 0.6, 0);               // where the nose was
    add(head, new THREE.BoxGeometry(0.115, 0.045, 0.085), m.bone, 0, -0.118, -0.075);   // jawbone
    [-0.036, -0.012, 0.012, 0.036].forEach(function (x) { add(head, new THREE.BoxGeometry(0.014, 0.022, 0.012), m.bone, x, -0.088, -0.118); });   // teeth
  },
  // A long face with a long nose, two tusks that curve up, long ears and a crest of bright hair.
  troll: function (head, m) {
    blob(head, 0.15, m.skin, 0, 0.01, 0, 0.94, 1.14, 1.04);
    blob(head, 0.1, m.skin, 0, -0.1, -0.045, 1, 0.75, 1.1);                     // long jaw
    add(head, new THREE.BoxGeometry(0.19, 0.03, 0.05), m.skinDark, 0, 0.065, -0.13);    // brow
    spike(head, [0, 0.02, -0.14], [0, -0.07, -0.25], 0.036, m.skin, 5);         // nose
    add(head, new THREE.BoxGeometry(0.1, 0.012, 0.02), m.dark, 0, -0.115, -0.15);       // mouth
    [-1, 1].forEach(function (s) {
      spike(head, [s * 0.065, -0.13, -0.13], [s * 0.11, -0.07, -0.25], 0.026, m.bone);          // tusks: forward ...
      spike(head, [s * 0.11, -0.075, -0.245], [s * 0.125, 0.07, -0.275], 0.021, m.bone);        // ... then up
      spike(head, [s * 0.13, 0.03, 0.01], [s * 0.36, 0.17, 0.09], 0.05, m.skin, 4).scale.z = 0.45;   // long ears
      add(head, new THREE.TorusGeometry(0.02, 0.006, 4, 8), m.gold, s * 0.25, 0.07, 0.05);
    });
    for (let i = 0; i < 6; i++) {                                               // the crest, front to back
      const z = -0.1 + i * 0.055, y = 0.15 - Math.abs(i - 1.5) * 0.012;
      spike(head, [0, y, z], [0, y + 0.2 - i * 0.012, z + 0.07], 0.045, m.hair, 4).scale.x = 0.5;
    }
    eyes(head, 0xffc94d, 0.058, 0.03, -0.142);
    collar(head, m.robeDark);
  }
};

// ---------- the body, the same for every race but for its measures ----------
function build(race) {
  const look = RACE_LOOKS[race], w = look.wide, gaunt = race === 'undead';
  const root = new THREE.Group();   // what makeWarlock swaps when the race changes
  const rig = new THREE.Group();    // the body: bobs while walking, rises in a jump
  rig.scale.setScalar(look.size);
  root.add(rig);
  root.add(groundShadow(0.75 * look.size * Math.max(0.85, w)));

  const m = {
    robe: flat(0x6a2f96), robeDark: flat(0x42195f), lining: flat(0x241036), gold: flat(0xd2a83c), skin: flat(look.skin),
    skinDark: flat(darker(look.skin, 0.62)), hair: flat(look.hair || 0x302821), dark: flat(0x16121a),
    bone: flat(0xcabfa6), wood: flat(0x4a2f1a), leather: flat(0x3a2414), iron: flat(0x3b3846)
  };
  const SIDES = 14;
  const bare = race === 'troll' || gaunt;           // no boots: big bare feet, or bones

  // Robe: a skirt that flares gently, a front panel with a gold edge, a hem band, feet.
  add(rig, new THREE.CylinderGeometry(0.27 * w, 0.52 * w, 1.06, SIDES), m.robe, 0, 0.55, 0);
  add(rig, new THREE.CylinderGeometry(0.53 * w, 0.55 * w, 0.08, SIDES), m.gold, 0, 0.05, 0);
  const panel = add(rig, new THREE.BoxGeometry(0.24 * w, 1.0, 0.03), m.lining, 0, 0.56, -0.405 * w);
  panel.rotation.x = 0.235 * w;
  [-1, 1].forEach(function (s) {
    const edge = add(rig, new THREE.BoxGeometry(0.03, 1.0, 0.035), m.gold, s * 0.135 * w, 0.56, -0.405 * w);
    edge.rotation.x = 0.235 * w;
    const foot = add(rig, new THREE.BoxGeometry(race === 'troll' ? 0.19 : 0.14, 0.1, race === 'troll' ? 0.3 : 0.24), bare ? (gaunt ? m.bone : m.skin) : m.leather, s * 0.13 * w, 0.05, -0.44 * w);
    if (race === 'troll') [-1, 1].forEach(function (t) { add(rig, new THREE.BoxGeometry(0.07, 0.07, 0.1), m.skin, foot.position.x + t * 0.05, 0.04, foot.position.z - 0.19); });   // two toes
  });
  const rune = add(rig, new THREE.OctahedronGeometry(0.06, 0), glow(0x7dffc0), 0, 0.66, -0.425 * w);
  rune.scale.set(0.8, 1.3, 0.3);

  // Waist, belt with a skull buckle, a pouch and a book.
  add(rig, new THREE.CylinderGeometry(0.3 * w, 0.27 * w, 0.34, SIDES), m.robeDark, 0, 1.23, 0);
  add(rig, new THREE.CylinderGeometry(0.295 * w, 0.295 * w, 0.09, SIDES), m.leather, 0, 1.1, 0);
  add(rig, new THREE.IcosahedronGeometry(0.065, 0), m.bone, 0, 1.1, -0.3 * w);
  add(rig, new THREE.BoxGeometry(0.13, 0.15, 0.1), m.leather, 0.27 * w, 1.0, -0.14 * w);
  const book = add(rig, new THREE.BoxGeometry(0.06, 0.22, 0.17), flat(0x6b1f2a), -0.33 * w, 0.98, 0.02);
  book.rotation.z = 0.2;
  add(rig, new THREE.BoxGeometry(0.065, 0.05, 0.175), m.gold, -0.33 * w, 0.98, 0.02).rotation.z = 0.2;

  // Everything above the belt hangs on a pivot at the waist, so a race that stoops bends there and keeps its feet
  // and its hem on the floor. (Turning by a negative angle leans the upper body forward.)
  const upper = new THREE.Group(), above = new THREE.Group();
  upper.position.y = 1.1; upper.rotation.x = -look.lean;
  above.position.y = -1.1;
  upper.add(above);
  rig.add(upper);

  // Chest, sloping shoulders with a gold line, neck.
  add(above, new THREE.CylinderGeometry(0.36 * w, 0.3 * w, 0.3, SIDES), m.robe, 0, 1.52, 0);
  add(above, new THREE.CylinderGeometry(0.17, 0.4 * w, 0.17, SIDES), m.robeDark, 0, 1.735, 0);
  add(above, new THREE.CylinderGeometry(0.405 * w, 0.405 * w, 0.035, SIDES), m.gold, 0, 1.66, 0);
  add(above, new THREE.CylinderGeometry(0.07 * look.bulk, 0.08 * look.bulk, 0.1, 8), m.skin, 0, 1.82, -0.01);
  if (race === 'orc') blob(above, 0.2, m.robeDark, 0, 1.7, 0.1, 1.5, 0.6, 0.9);     // a bull neck
  if (gaunt) [0, 1, 2, 3].forEach(function (i) { add(above, new THREE.ConeGeometry(0.035, 0.09, 4), m.bone, 0, 1.36 + i * 0.1, 0.3 * w - i * 0.012).rotation.x = 1.2; });   // the spine shows through the robe

  // Cape down the back; it lags a little when you walk.
  const cape = new THREE.Group();
  cape.position.set(0, 1.7, 0.17 * w);
  above.add(cape);
  add(cape, new THREE.BoxGeometry(0.66 * w, 1.3, 0.04), m.lining, 0, -0.66, 0.08);
  add(cape, new THREE.BoxGeometry(0.7 * w, 0.06, 0.05), m.gold, 0, -1.3, 0.085);

  // Shoulder plates in the robe's colours with a gold rim, a horn and a gem. Each arm hangs from a pivot at the
  // shoulder and has a second pivot at the elbow.
  const arms = [], upperArm = 0.36 * look.arm, foreArm = 0.34 * look.arm, b = look.bulk;
  [-1, 1].forEach(function (side) {
    const sx = side * 0.42 * w;
    const pad = add(above, new THREE.IcosahedronGeometry(0.2, 1), m.robeDark, sx, 1.68, 0);
    pad.scale.set(1.2, 0.72, 1.15);
    add(above, new THREE.TorusGeometry(0.21, 0.025, 5, 14), m.gold, sx, 1.62, 0).rotation.x = Math.PI / 2;
    const horn = add(above, new THREE.ConeGeometry(0.06, 0.36, 6), m.bone, sx + side * 0.13, 1.86, 0.01);
    horn.rotation.z = -side * 0.75;
    add(above, new THREE.OctahedronGeometry(0.045, 0), glow(0x7dffc0), sx + side * 0.02, 1.71, -0.21);

    const arm = new THREE.Group();
    arm.position.set(sx, 1.58, 0);
    above.add(arm);
    add(arm, new THREE.CylinderGeometry(0.095 * b, 0.11 * b, upperArm + 0.02, 8), m.robe, 0, -upperArm / 2, 0);
    const fore = new THREE.Group();
    fore.position.set(0, -upperArm, 0);
    arm.add(fore);
    if (gaunt) {
      // A torn sleeve that ends at the elbow, and the two bones of the forearm.
      add(fore, new THREE.CylinderGeometry(0.1, 0.14, foreArm * 0.45, 7), m.robeDark, 0, -foreArm * 0.2, 0);
      [-1, 1].forEach(function (s) { add(fore, new THREE.CylinderGeometry(0.02, 0.017, foreArm * 0.62, 5), m.bone, s * 0.027, -foreArm * 0.7, 0); });
      blob(fore, 0.05, m.bone, 0, -foreArm - 0.05, 0, 1, 1.2, 0.8, 0);
      [-1, 0, 1].forEach(function (f) { spike(fore, [f * 0.03, -foreArm - 0.08, 0], [f * 0.045, -foreArm - 0.2, -0.03], 0.014, m.bone, 4); });   // fingers
    } else {
      add(fore, new THREE.CylinderGeometry(0.11 * b, 0.17 * b, foreArm, 8), m.robeDark, 0, -foreArm / 2, 0);
      add(fore, new THREE.CylinderGeometry(0.175 * b, 0.175 * b, 0.03, 8), m.gold, 0, -foreArm, 0);
      add(fore, new THREE.IcosahedronGeometry(0.075 * Math.max(1, b * 0.9), 0), m.skin, 0, -foreArm - 0.06, 0);
    }
    arms.push({ arm: arm, fore: fore });
  });
  const left = arms[0], right = arms[1];

  // The head, on the neck.
  const head = new THREE.Group();
  head.position.set(0, 1.94, -0.03);
  if (race === 'gnome') { head.scale.setScalar(1.5); head.position.y = 2.03; }     // a gnome's head is big for its body
  if (race === 'orc') { head.scale.setScalar(1.16); head.position.set(0, 1.96, -0.07); }   // a head to match those shoulders
  if (gaunt) { head.position.set(0, 1.9, -0.07); head.rotation.x = look.lean * 0.75; }   // it looks up from under the stoop
  if (race === 'troll') { head.scale.setScalar(1.12); head.position.set(0, 2.01, -0.07); head.rotation.x = look.lean * 0.7; }
  above.add(head);
  HEADS[race](head, m);

  // Staff in the right hand: a dark shaft, a bone claw, a crystal floating in it. A longer arm holds it lower, so
  // the shaft is a little shorter there and its foot stays off the floor.
  const staff = new THREE.Group(), drop = Math.max(0, look.arm - 1) * 0.7 + (look.lean > 0.2 ? 0.12 : 0);
  staff.position.set(0.0, -foreArm - 0.06, -0.06);
  right.fore.add(staff);
  add(staff, new THREE.CylinderGeometry(0.035, 0.045, 2.3 - drop, 6), m.wood, 0, 0.42 + drop / 2, 0);
  add(staff, new THREE.CylinderGeometry(0.055, 0.055, 0.14, 6), m.gold, 0, 0.0, 0);
  add(staff, new THREE.CylinderGeometry(0.06, 0.04, 0.12, 6), m.iron, 0, 1.5, 0);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + 0.4;
    const claw = add(staff, new THREE.ConeGeometry(0.04, 0.4, 4), m.bone, Math.sin(a) * 0.13, 1.72, Math.cos(a) * 0.13);
    claw.rotation.set(-Math.cos(a) * 0.55, 0, Math.sin(a) * 0.55);
  }
  const crystalMaterial = glow(0x7dffc0);
  const crystal = add(staff, new THREE.OctahedronGeometry(0.13, 0), crystalMaterial, 0, 1.86, 0);
  crystal.scale.set(0.8, 1.35, 0.8);
  const shine = halo(0x7dffc0, 1.1, 0.7);
  shine.position.set(0, 1.86, 0);
  staff.add(shine);

  // While a spell is being cast the crystal grows and takes the colour of its school, the free hand reaches
  // forward and the staff is thrust toward the target. (Turning an arm by a positive angle swings its hand forward.)
  const IDLE = new THREE.Color(0x7dffc0), SHADOW = new THREE.Color(0xb07cff), FIRE = new THREE.Color(0xff9a3d);
  // When a spell goes off (the end of a cast, or an instant) the staff arm is thrust forward for a moment.
  const pace = race === 'gnome' ? 14 : race === 'troll' ? 9.5 : 10.5;       // short legs take more steps
  let stride = 0, casting = 0, thrust = 0;
  function update(dt, time, moving, jumpHeight, school) {
    stride = moving ? stride + dt * pace : 0;
    casting += ((school ? 1 : 0) - casting) * Math.min(1, dt * 9);
    thrust = Math.max(0, thrust - dt * 3.4);
    const push = Math.sin(Math.min(1, thrust * 1.15) * Math.PI);
    const swing = moving ? Math.sin(stride) : 0, breath = Math.sin(time * 1.6) * 0.012;
    rig.position.y = jumpHeight + (moving ? Math.abs(Math.sin(stride)) * 0.06 : breath) * look.size;
    rig.rotation.x = (moving ? -0.07 : -casting * 0.04) - push * 0.07;
    left.arm.rotation.x = 0.06 + swing * 0.5 + casting * (1.05 + Math.sin(time * 9) * 0.05) + push * 0.55 + look.lean * 0.6;   // a stooping body lets its arms hang forward
    left.arm.rotation.z = casting * 0.28;
    left.fore.rotation.x = 0.22 + (moving ? 0.25 : 0) + casting * 0.35;
    right.arm.rotation.x = 0.14 - swing * 0.16 + casting * 0.5 + push * 0.75 + look.lean * 0.6;
    right.fore.rotation.x = 0.4 + casting * 0.3 - push * 0.15;
    // The staff stays nearly upright (whatever the arm and the stoop do), and tips forward in a thrust.
    staff.rotation.x = -(0.1 + casting * 0.4) - right.arm.rotation.x - right.fore.rotation.x + look.lean - push * 0.55;
    cape.rotation.x = 0.06 + look.lean + (moving ? 0.3 + Math.sin(stride * 0.5) * 0.06 : Math.sin(time * 1.1) * 0.02);   // it hangs straight down from stooped shoulders
    const target = school === 'fire' ? FIRE : school ? SHADOW : IDLE;
    crystalMaterial.color.lerp(target, Math.min(1, dt * 12));
    shine.material.color.copy(crystalMaterial.color);
    crystal.rotation.y = time * (1.2 + casting * 6);
    crystal.position.y = 1.86 + Math.sin(time * 2.4) * 0.03;
    const pulse = 1 + Math.sin(time * (school ? 14 : 3)) * 0.1 + casting * 0.7;
    crystal.scale.set(0.8 * pulse, 1.35 * pulse, 0.8 * pulse);
    shine.scale.setScalar(1.1 + casting * 1.6 + Math.sin(time * 5) * 0.08);
  }

  return {
    root: root, update: update,
    orbPosition: function (target) { return crystal.getWorldPosition(target); },   // where the crystal is in the world (bolts and beams start here)
    release: function () { thrust = 1; }
  };
}

// The Warlock in the scene. Its root stays the same object whatever the race; setRace swaps what is inside it.
export function makeWarlock(race) {
  const root = new THREE.Group();
  let body = null, current = null;
  function setRace(key) {
    const next = RACE_LOOKS[key] ? key : 'human';
    if (next === current) return;
    if (body) {
      root.remove(body.root);
      body.root.traverse(function (part) {            // free what the old shape held (the glow's shared picture stays)
        if (part.geometry) part.geometry.dispose();
        if (part.material) part.material.dispose();
      });
    }
    current = next;
    body = build(next);
    root.add(body.root);
  }
  setRace(race || 'human');
  return {
    root: root, setRace: setRace,
    get race() { return current; },
    get size() { return RACE_LOOKS[current].size; },             // against a Human: the camera and a few effects follow it
    update: function (dt, time, moving, jumpHeight, school) { body.update(dt, time, moving, jumpHeight, school); },
    orbPosition: function (target) { return body.orbPosition(target); },
    release: function () { body.release(); }
  };
}
