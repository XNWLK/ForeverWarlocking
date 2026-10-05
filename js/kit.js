// Small building blocks shared by the models, the room and the spell effects.
import * as THREE from 'three';

// A flat-shaded, lit surface (the low-poly look). Everything made with it casts and takes shadows.
export function flat(color, extra) {
  return new THREE.MeshLambertMaterial(Object.assign({ color: color, flatShading: true }, extra));
}
// A surface that glows by itself (fire, runes, crystals); the room's fog and lights do not change it.
export function glow(color, extra) {
  return new THREE.MeshBasicMaterial(Object.assign({ color: color }, extra));
}
// A see-through glow that adds its light to what is behind it (spell effects).
export function light(color, opacity) {
  return new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: opacity == null ? 1 : opacity, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
}

export function add(parent, geometry, material, x, y, z) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(x || 0, y || 0, z || 0);
  if (material.isMeshLambertMaterial) { mesh.castShadow = true; mesh.receiveShadow = true; }
  parent.add(mesh);
  return mesh;
}

export function canvasTexture(size, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Small repeatable random numbers, so things look the same on every visit.
export function seeded(seed) {
  let s = seed;
  return function () { s = (s * 16807) % 2147483647; return s / 2147483647; };
}

// A soft round glow that always faces you: put it behind anything that should seem to shine.
let haloMap = null;
export function halo(color, size, opacity) {
  if (!haloMap) {
    haloMap = canvasTexture(128, function (g, s) {
      const grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.12)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, s, s);
    });
  }
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloMap, color: color, transparent: true, opacity: opacity == null ? 0.8 : opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  sprite.scale.set(size, size, 1);
  return sprite;
}

// A soft dark patch on the floor under something that stands there.
export function groundShadow(radius, opacity) {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(radius, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: opacity == null ? 0.28 : opacity, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.03;
  return mesh;
}
