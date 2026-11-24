import * as T from "three";
import { SIDES, zone } from "./layout.js";

const boxShape = new T.BoxGeometry(1, 1, 1);
const diamond = new T.OctahedronGeometry(0.5);
const ring = new T.TorusGeometry(0.5, 0.022, 5, 30);
const mats = new Map();
function sculpt(parent, color, x, y, z, w, h, d, geometry = boxShape, rz = 0, rx = 0, glow = false) {
  const key = (glow ? "lit" : "stone") + color;
  if (!mats.has(key))
    mats.set(
      key,
      glow
        ? new T.MeshBasicMaterial({ color })
        : new T.MeshStandardMaterial({ color, roughness: 0.91, flatShading: true }),
    );
  const mesh = new T.Mesh(geometry, mats.get(key));
  mesh.position.set(x, y, z);
  mesh.scale.set(w, h, d);
  mesh.rotation.set(rx, 0, rz);
  mesh.castShadow = mesh.receiveShadow = !glow;
  parent.add(mesh);
  return mesh;
}
const timber = 0x866052,
  beam = 0x543d43,
  siding = 0xad7557,
  brass = 0xd9a565,
  glass = 0x995746;
const stone = 0x746788,
  deep = 0x514961,
  crown = 0xa090ac;
function saloon(group) {
  const b = (c, x, y, z, w, h, d, rz = 0, rx = 0) => sculpt(group, c, x, y, z, w, h, d, boxShape, rz, rx);
  b(beam, 0, 0.12, 0.17, 3.32, 0.24, 2.17);
  b(timber, 0, 0.92, -0.946, 2.97, 1.82, 0.13);
  b(0x684937, 0, 0.26, -0.12, 2.9, 0.11, 1.34);
  const movingTop = new T.Group();
  movingTop.position.set(0, 1.32, -0.958);
  group.add(movingTop);
  const high = (n) => {
    group.updateWorldMatrix(true, false);
    movingTop.attach(n);
    return n;
  };
  high(b(siding, 0, 1.884, 0.375, 3.02, 1.27, 0.12));
  high(b(beam, 0, 2.56, 0.314, 3.2, 0.114, 0.4));
  high(b(0x87534d, 0, 2.35, -0.36, 3.09, 0.11, 1.4, 0, -0.09));
  high(b(0x654641, 0, 2.04, 0.53, 3.02, 0.075, 0.18));
  for (let i = 0; i < 6; i++) high(b(0xca8a60, 0, 1.41 + i * 0.172, 0.443, 2.97, 0.024, 0.033));
  const doors = [];
  for (const side of [-1, 1]) {
    b(timber, side * 1.44, 0.84, -0.31, 0.16, 1.61, 1.3);
    b(siding, side * 0.928, 0.71, 0.375, 1.16, 1.04, 0.12);
    for (let i = 0; i < 5; i++) b(0xc78c62, side * 0.927, 0.38 + i * 0.177, 0.443, 1.13, 0.021, 0.033);
    const door = new T.Group();
    door.position.set(side * 0.317, 0.53, 0.51);
    group.add(door);
    doors.push({ door, side });
    sculpt(door, 0x9e694e, -side * 0.155, 0, 0, 0.305, 0.319, 0.058, boxShape, side * 0.145);
    sculpt(door, 0x4c3a35, -side * 0.14, 0.034, 0.043, 0.256, 0.035, 0.026, boxShape, side * 0.13);
    b(beam, side * 0.936, 0.68, 0.457, 0.492, 0.548, 0.06);
    b(glass, side * 0.936, 0.68, 0.5, 0.414, 0.469, 0.054);
    b(beam, side * 0.936, 0.68, 0.534, 0.051, 0.46, 0.033);
    b(beam, side * 0.936, 0.68, 0.534, 0.41, 0.048, 0.033);
    b(beam, side * 1.36, 0.67, 0.985, 0.123, 1.15, 0.124);
    b(brass, side * 1.36, 1.16, 0.985, 0.16, 0.08, 0.17);
    high(b(0x493646, side * 1.08, 1.57, 0.451, 0.48, 0.37, 0.078));
    high(b(0xc68a68, side * 1.08, 1.57, 0.498, 0.37, 0.285, 0.031));
  }
  b(0x865147, 0, 1.243, 0.749, 3.19, 0.105, 0.91, 0, 0.12);
  b(beam, 0, 0.16, 1.234, 1.17, 0.12, 0.37);
  high(b(0xecd1a1, 0, 2.301, 0.473, 0.137, 0.209, 0.067));
  for (const side of [-1, 1]) high(b(0xd8b783, side * 0.13, 2.351, 0.491, 0.23, 0.041, 0.057, side * 0.43));
  high(b(0xd3aa7d, 0, 2.018, 0.49, 1.29, 0.29, 0.06));
  const ink = document.createElement("canvas");
  ink.width = 176;
  ink.height = 42;
  const ctx = ink.getContext("2d");
  ctx.fillStyle = "#cfab75";
  ctx.fillRect(0, 0, 176, 42);
  ctx.strokeStyle = "#643d32";
  ctx.strokeRect(2, 2, 172, 38);
  ctx.fillStyle = "#643d32";
  ctx.font = "bold 27px Georgia, 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic'";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("SALOON", 88, 22);
  const texture = new T.CanvasTexture(ink);
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.NearestFilter;
  const sign = new T.Mesh(new T.PlaneGeometry(1.25, 0.28), new T.MeshStandardMaterial({ map: texture }));
  sign.position.set(0, 2.018, 0.528);
  group.add(sign);
  high(sign);
  b(0x906147, -0.38, 0.5, -0.5, 1.69, 0.47, 0.274);
  b(0xbe9b6f, -0.38, 0.746, -0.5, 1.78, 0.079, 0.412);
  for (let i = 0; i < 6; i++) {
    const px = -0.94 + i * 0.239;
    sculpt(
      group,
      i % 2 ? 0x62837b : 0x8ba276,
      px,
      0.846,
      -0.54,
      0.077,
      0.194,
      0.075,
      boxShape,
      i % 2 ? 0.16 : 0,
    );
    sculpt(group, 0xba9e67, px, 0.959, -0.54, 0.044, 0.075, 0.057);
  }
  for (const x of [0.5, 0.9]) {
    sculpt(group, 0xb39b72, x, 0.545, 0.165, 0.39, 0.068, 0.31);
    for (const z of [0.042, 0.284]) sculpt(group, beam, x, 0.375, z, 0.045, 0.27, 0.044);
  }
  return { movingTop, doors };
}
function gateway(group) {
  const portal = new T.Group();
  portal.position.set(0, 1.46, -0.05);
  group.add(portal);
  const pupil = new T.Mesh(
    new T.CircleGeometry(0.91, 32),
    new T.MeshBasicMaterial({ color: 0x51367f, side: T.DoubleSide }),
  );
  pupil.scale.y = 1.27;
  pupil.position.z = -0.12;
  portal.add(pupil);
  const vortex = new T.Group();
  portal.add(vortex);
  for (let i = 0; i < 4; i++) {
    const color = [0x503378, 0x846ab3, 0xb19ad0, 0x50a6a6][i];
    const r = sculpt(
      vortex,
      color,
      0,
      0,
      0.02 + i * 0.016,
      1.51 - i * 0.31,
      1.94 - i * 0.39,
      0.075,
      ring,
      i * 0.13,
      0.06,
      true,
    );
    r.rotation.y = (i - 1) * 0.25;
  }
  for (const side of [-1, 1]) {
    sculpt(group, deep, side * 1.06, 0.14, 0, 0.67, 0.27, 0.89);
    for (let i = 0; i < 5; i++)
      sculpt(
        group,
        i % 2 ? stone : crown,
        side * 1.06,
        0.34 + i * 0.289,
        0.01,
        0.43,
        0.279,
        0.57,
        boxShape,
        side * (i % 2) * 0.029,
      );
    sculpt(group, deep, side * 1.46, 0.43, -0.16, 0.39, 0.86, 0.42);
    sculpt(group, stone, side * 1.46, 0.86, -0.16, 0.46, 0.17, 0.5);
    sculpt(group, 0x9cdeab, side * 1.46, 1.05, -0.16, 0.188, 0.33, 0.185, diamond, 0, 0, true);
  }
  for (let i = 0; i < 11; i++) {
    const a = (i * Math.PI) / 10;
    sculpt(
      group,
      i % 2 ? stone : crown,
      1.06 * Math.cos(a),
      1.62 + 1.02 * Math.sin(a),
      0,
      0.36,
      0.437,
      0.59,
      boxShape,
      a - Math.PI / 2,
    );
  }
  const cap = sculpt(group, deep, 0, 2.767, 0.027, 0.48, 0.37, 0.64, diamond);
  return { portal, pupil, vortex, cap };
}
export function makeBases(scene) {
  const models = {};
  for (const side of SIDES) {
    const group = new T.Group(),
      left = side === "cowboy";
    const [x, , z] = zone(side, "base");
    group.position.set(x, 0, z - 0.6);
    group.rotation.y = left ? 0.29 : -0.33;
    scene.add(group);
    const moving = left ? saloon(group) : gateway(group);
    let fold = 0,
      swing = 0;
    const glow = left ? 0xffcc71 : 0x89ecc0;
    const light = new T.PointLight(glow, left ? 14 : 11, 5.7, 2);
    light.position.set(left ? 0.24 : 0, 1, 0.82);
    group.add(light);
    const cells = [];
    let max = 0,
      hp = 0;
    models[side] = {
      update(now, full) {
        if (max !== full) {
          max = full;
          cells.forEach((obj) => group.remove(obj));
          cells.length = 0;
          for (let i = 0; i < full; i++) {
            const t = (i + 0.5) / full;
            const a = 0.24 + Math.PI * 0.85 * t;
            const face = left
              ? [(t - 0.5) * 2.61, 1.13, 1.015]
              : [1.035 * Math.cos(a), 1.63 + 0.928 * Math.sin(a), 0.334];
            const cell = sculpt(
              group,
              glow,
              ...face,
              left ? 0.133 : 0.12,
              left ? 0.192 : 0.153,
              0.119,
              left ? boxShape : diamond,
              0,
              0,
              true,
            );
            cells.push(cell);
          }
        }
        hp = now;
        cells.forEach((cell, i) => {
          const key = (i < now ? "lit" : "stone") + (i < now ? glow : deep);
          if (!mats.has(key)) mats.set(key, new T.MeshStandardMaterial({ color: deep, roughness: 0.92 }));
          cell.material = mats.get(key);
        });
        if (moving.vortex) moving.vortex.visible = now > 0;
        if (moving.pupil) moving.pupil.material.color.setHex(now > 0 ? 0x51367f : 0x272536);
        if (moving.cap) {
          moving.cap.position.y = now > 0 ? 2.767 : 0.55;
          moving.cap.rotation.z = now > 0 ? 0 : 0.86;
        }
        light.intensity = full ? ((left ? 14 : 16) * now) / full : 0;
      },
      anchor(target) {
        group.updateWorldMatrix(true, true);
        const cell = cells[Math.max(0, Math.min(cells.length - 1, hp - 1))];
        if (cell) return cell.getWorldPosition(target);
        return group.getWorldPosition(target).add(new T.Vector3(0, 1, 0.62));
      },
      aim(angle, zoom) {
        if (moving.movingTop) fold = Math.abs(Math.sin(angle - 0.18)) > 0.77 || zoom > 1.33 ? -0.96 : 0;
      },
      swing(amount) {
        swing = amount;
      },
      ambient(time) {
        if (moving.vortex && hp) moving.vortex.rotation.z = time * 0.00043;
        if (moving.movingTop) {
          moving.movingTop.rotation.x = fold;
          for (const { door, side } of moving.doors) door.rotation.y = side * swing;
        }
      },
    };
  }
  return models;
}
