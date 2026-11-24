import * as T from "three";
import { addWestern } from "./western.js";
import { addArcane } from "./arcane.js";
import { BOARD_SIZE, TRAP_SLOTS } from "../../game/showdown/rules.js";
import { COLORS, SIDES, zone } from "./layout.js";
import { westernDetail, wizardDetail, duskDetail } from "./presentation-set.js";
import { addLandmarks } from "./landmarks.js";

// Flat-shaded miniatures use one palette and a small library of shared geometry.
class SetBuilder {
  constructor(parent) {
    this.parent = parent;
    this.parts = new Map();
    this.shapes = {
      box: new T.BoxGeometry(1, 1, 1),
      cone: new T.ConeGeometry(0.5, 1, 6),
      round: new T.CylinderGeometry(0.5, 0.52, 1, 10),
      rock: new T.DodecahedronGeometry(0.5),
      crystal: new T.OctahedronGeometry(0.5),
      ring: new T.TorusGeometry(0.45, 0.05, 6, 24).rotateX(Math.PI / 2),
      wedge: new T.CylinderGeometry(0.5, 0.5, 1, 3, 1, false, Math.PI / 6),
    };
  }
  piece(kind, color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
    this.batch(kind, color, false, [x, y, z, w, h, d, rx, ry, rz]);
  }
  box(color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
    this.piece("box", color, x, y, z, w, h, d, rx, ry, rz);
  }
  glow(kind, color, x, y, z, w, h, d, rx = 0, ry = 0, rz = 0) {
    this.batch(kind, color, true, [x, y, z, w, h, d, rx, ry, rz]);
  }
  batch(kind, color, lit, transform) {
    const key = kind + ":" + color + ":" + lit;
    if (!this.parts.has(key)) this.parts.set(key, { kind, color, lit, transforms: [] });
    this.parts.get(key).transforms.push(transform);
  }
  sign(text, x, y, z, width, height, faceColor, inkColor) {
    const canvas = document.createElement("canvas");
    canvas.width = 192;
    canvas.height = 48;
    const ink = canvas.getContext("2d");
    ink.fillStyle = faceColor;
    ink.fillRect(0, 0, 192, 48);
    ink.strokeStyle = inkColor;
    ink.lineWidth = 2;
    ink.strokeRect(4, 4, 184, 40);
    ink.fillStyle = inkColor;
    ink.font = "bold 30px Georgia, 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic'";
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    ink.fillText(text, 96, 25, 174);
    const map = new T.CanvasTexture(canvas);
    map.colorSpace = T.SRGBColorSpace;
    map.minFilter = map.magFilter = T.NearestFilter;
    const panel = new T.Mesh(new T.PlaneGeometry(width, height), new T.MeshStandardMaterial({ map }));
    panel.position.set(x, y, z);
    this.parent.add(panel);
  }
  finish() {
    for (const { kind, color, lit, transforms } of this.parts.values()) {
      const mat = lit ? new T.MeshBasicMaterial({ color }) : new T.MeshStandardMaterial({ color, roughness: 0.92, flatShading: true });
      const mesh = new T.InstancedMesh(this.shapes[kind], mat, transforms.length);
      const stamp = new T.Object3D();
      transforms.forEach(([x, y, z, w, h, d, rx, ry, rz], index) => {
        stamp.position.set(x, y, z);
        stamp.scale.set(w, h, d);
        stamp.rotation.set(rx, ry, rz);
        stamp.updateMatrix();
        mesh.setMatrixAt(index, stamp.matrix);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = mesh.receiveShadow = !lit;
      this.parent.add(mesh);
    }
  }
}

function tile(b, [x, y, z], color, trim, width, depth) {
  b.box(color, x, y + 0.06, z, width, 0.12, depth);
  for (const side of [-1, 1]) {
    b.box(trim, x, y + 0.124, z + side * (depth / 2 - 0.05), width - 0.05, 0.019, 0.046);
    b.box(trim, x + side * (width / 2 - 0.05), y + 0.124, z, 0.046, 0.019, depth - 0.05);
  }
}

function field(b) {
  for (const side of SIDES) {
    const { tile: surface, line, dark } = COLORS[side];
    for (let slot = 0; slot < BOARD_SIZE; slot++)
      tile(b, zone(side, "troop", slot), surface, line, 3.33, 2.35);
    for (let slot = 0; slot < TRAP_SLOTS; slot++)
      tile(b, zone(side, "trap", slot), dark, surface, 1.72, 1.48);
    tile(b, zone(side, "deck"), dark, surface, 1.87, 1.57);
    tile(b, zone(side, "discard"), dark, surface, 1.87, 1.57);
    const [x, , z] = zone(side, "base");
    b.piece("round", dark, x, 0.132, z, 3.28, 0.264, 2.85);
  }
  const [x, , z] = zone(null, "location");
  b.piece("round", 0x594557, x, 0.081, z, 2.73, 0.157, 2.29);
  b.piece("ring", 0xb7a0b0, x, 0.15, z, 2.27, 0.23, 1.92);
}

function groundDetails(b) {
  let seed = 1869;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < 540; i++) {
    const x = random() * 34 - 17;
    const z = random() * 16 - 8;
    if (x > -3.5 || (x < -13.5 && Math.abs(z) > 6.4)) continue;
    const colors = [0xb89570, 0x9e7860, 0xbfa17e];
    b.box(colors[i % 3], x, 0.003, z, 0.09 + random() * 0.36, 0.01, 0.12 + random() * 0.24, 0, 2 * random());
  }
  for (let i = 0; i < 37; i++) {
    const x = -15.14 + i * 0.384;
    b.box(0x775342, x, 0.029, 6.7, 0.151, 0.058, 0.95);
  }
  for (const z of [6.397, 7.0]) {
    b.box(0x6b5a58, -8.24, 0.085, z, 14.11, 0.059, 0.072);
    b.box(0xb29f84, -8.24, 0.117, z, 14.11, 0.015, 0.031);
  }
  for (const side of [-1, 1]) {
    const colors = side < 0 ? [0x865a46, 0x68463e] : [0x62516f, 0x443852];
    for (let i = 0; i < 22; i++) {
      const x = side * (0.5 + i * 0.68);
      const z = (Math.abs(x) > 9.8 ? 8.12 : 8.7) - random() * 0.24;
      b.piece("rock", colors[i % 2], x, -0.59, z, 0.49 + random() * 1.24, 0.48, 0.58, 0, i);
    }
  }
}
function courtPaving(b) {
  const stones = [0x70818a, 0x85939a, 0x96a4a8, 0x66747d, 0x939b9d, 0x798589, 0x748c8a];
  const moss = [0x4d6c58, 0x708769, 0x59775a];
  for (let row = 0; row < 26; row++) {
    for (let col = 0; col < 23; col++) {
      const x = 0.55 + (col + (row % 2 ? 0.47 : 0)) * 0.69;
      const z = -7.76 + row * 0.61;
      if ((Math.abs(z) > 6.05 && x > 13.3) || (Math.abs(z) > 7.2 && x > 9.4)) continue;
      const j = (row * 67 + col * 41 + col * row * 3) % 997;
      if (col < 2 && j % 4 === 0) continue;
      const wobble = Math.sin(j * 0.46);
      b.box(
        stones[j % stones.length],
        x + wobble * 0.038,
        0.019 + (j % 3) * 0.004,
        z + Math.sin(j) * 0.048,
        0.6 + wobble * 0.055,
        0.044,
        0.525 - 0.055 * wobble,
        0,
        wobble * 0.08,
      );
      if (j % 11 < 2 && (x > 10 || Math.abs(z) > 3.4))
        b.box(moss[j % 3], x - 0.29, 0.032, z - 0.27, 0.13 + (j % 3) * 0.04, 0.022, 0.18);
    }
  }
}
function scenery(group, decorate, x, z) {
  const district = new T.Group();
  district.position.set(x, 0, z);
  const b = new SetBuilder(district);
  decorate(b);
  b.finish();
  group.add(district);
}
function fieldDetails(b, colors, hasCreek) {
  for (let i = 0; i < 460; i++) {
    const x = ((i * 607 + 33) % 997) / 26.1 - 19.1;
    const z = ((i * 277 + 39) % 991) / 46.6 - 10.65;
    if ((hasCreek && Math.abs(x) < 2.65) || (Math.abs(x) > 16.5 && Math.abs(z) > 5.1)) continue;
    const alongPath = Math.abs(z - 0.35) < 1.3 || (!hasCreek && Math.abs(x - 1.1) < 1.9);
    const w = 0.13 + (i % 7) * 0.077;
    b.box(colors[i % colors.length], x, 0.012, z, w * (alongPath ? 1.65 : 1), 0.024, 0.14 + (i % 4) * 0.11, 0, i * 0.41);
  }
}

export function makeBoard(scene, venue) {
  const island = new T.Group();
  scene.add(island);
  if (venue) {
    for (const [profile, layers] of venue.terrain) terrain(island, profile, layers);
    const b = new SetBuilder(island);
    fieldDetails(b, venue.ground, venue.creek);
    field(b);
    venue.decorate(b);
    b.finish();
    return island;
  }
  terrain(island, westernProfile, [
    [0xa57955, 0x533a33, -0.54, 0.83, 0.966],
    [0xa57955, 0x84533c, -0.25, 0.3, 0.99],
    [0xa8886f, 0x9c6353, 0, 0.25, 1],
  ]);
  terrain(island, arcaneProfile, [
    [0x4b555d, 0x283747, -0.54, 0.83, 0.966],
    [0x586b68, 0x48545e, -0.25, 0.3, 0.99],
    [0x4d5e5e, 0x526471, 0, 0.25, 1],
  ]);
  const b = new SetBuilder(island);
  groundDetails(b);
  courtPaving(b);
  field(b);
  addLandmarks(b);
  westernDetail(b);
  wizardDetail(b);
  duskDetail(b);
  b.finish();
  scenery(island, addWestern, -6.25, -3.65);
  scenery(island, addArcane, 7.85, -4.02);
  return island;
}

export function disposeBoard(island) {
  island.removeFromParent();
  const geometries = new Set(),
    materials = new Set();
  island.traverse((part) => {
    if (!part.isMesh) return;
    if (part.isInstancedMesh) part.dispose();
    geometries.add(part.geometry);
    for (const material of [part.material].flat()) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) {
    material.map?.dispose();
    material.dispose();
  }
}

const westernProfile = [
  [0, -4.68],
  [-5.92, -4.68],
  [-6.76, -4.13],
  [-7.68, -3.97],
  [-8, -2.65],
  [-7.94, 2.86],
  [-7.18, 3.57],
  [-6.61, 4.36],
  [-4.67, 4.48],
  [-3.77, 4.78],
  [0, 4.78],
  [0.1, 2.58],
  [-0.06, 0.82],
  [0.2, -1.25],
  [0.08, -2.52],
];
const arcaneProfile = [
  [0, -4.68],
  [4.93, -4.68],
  [6.72, -4.19],
  [7.32, -3.61],
  [8.01, -2.66],
  [7.97, 2.63],
  [7.47, 3.32],
  [6.68, 4.25],
  [4.82, 4.36],
  [3.86, 4.78],
  [0, 4.78],
  ...westernProfile.slice(11),
];

function terrain(group, profile, layers) {
  layers.forEach(([topColor, edgeColor, top, depth, scale, emissive = 0]) => {
    const shape = new T.Shape(profile.map(([x, z]) => new T.Vector2(x * scale * 2.24, -z * scale * 1.85)));
    const geometry = new T.ExtrudeGeometry(shape, { depth, bevelEnabled: false, steps: 1 });
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(0, top - depth, 0);
    const materials = [new T.MeshStandardMaterial({ color: topColor, roughness: 1, emissive }),
      new T.MeshStandardMaterial({ color: edgeColor, roughness: 1 })];
    const mesh = new T.Mesh(geometry, materials);
    mesh.receiveShadow = true;
    group.add(mesh);
  });
}
