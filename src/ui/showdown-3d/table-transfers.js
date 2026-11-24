import * as T from "three";
import { TYPES, typeOf } from "../../game/showdown/cards.js";
import { zone } from "./layout.js";

const atlas = typeof __CVW_DIORAMA_ATLAS__ === "undefined" ? "" : __CVW_DIORAMA_ATLAS__;
const ids = Object.keys(TYPES);
const textures = new Map();
const makeSurface = () => {
  const canvas = document.createElement("canvas");
  canvas.width = 180;
  canvas.height = 250;
  const texture = new T.CanvasTexture(canvas);
  texture.colorSpace = T.SRGBColorSpace;
  texture.magFilter = T.NearestFilter;
  return { canvas, ctx: canvas.getContext("2d"), texture };
};
function backTexture() {
  if (textures.has("back")) return textures.get("back");
  const { ctx, texture } = makeSurface();
  ctx.fillStyle = "#261d33";
  ctx.fillRect(0, 0, 180, 250);
  ctx.strokeStyle = "#bc9567";
  ctx.lineWidth = 3;
  ctx.strokeRect(8, 8, 164, 234);
  ctx.strokeRect(13, 13, 154, 224);
  ctx.save();
  ctx.translate(90, 125);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = "#583e6b";
  ctx.fillRect(-40, -40, 80, 80);
  ctx.strokeRect(-43, -43, 86, 86);
  ctx.fillStyle = "#e1b876";
  ctx.fillRect(-18, -18, 36, 36);
  ctx.restore();
  for (const [x, y] of [
    [26, 26],
    [154, 26],
    [26, 224],
    [154, 224],
  ]) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fill();
  }
  textures.set("back", texture);
  return texture;
}
function faceTexture(key) {
  if (!key) return backTexture();
  const id = typeOf(key),
    data = TYPES[id];
  if (!data) return backTexture();
  if (textures.has(id)) return textures.get(id);
  const { ctx, texture } = makeSurface();
  const cowboy = data.side === "cowboy";
  function draw(art) {
    ctx.fillStyle = cowboy ? "#d9ad75" : "#bca0d4";
    ctx.fillRect(0, 0, 180, 250);
    ctx.fillStyle = cowboy ? "#492e32" : "#32263e";
    ctx.fillRect(5, 5, 170, 240);
    ctx.fillStyle = cowboy ? "#75543d" : "#5d4a68";
    ctx.fillRect(10, 43, 160, 152);
    if (art?.complete && art.naturalWidth) {
      const index = ids.indexOf(id);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(art, (index % 6) * 132, Math.floor(index / 6) * 100, 132, 100, 10, 43, 160, 152);
    }
    ctx.strokeStyle = cowboy ? "#d9ad75" : "#c7afd9";
    ctx.lineWidth = 2;
    ctx.strokeRect(9, 9, 162, 232);
    ctx.strokeRect(10, 43, 160, 152);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff0cf";
    ctx.font = "bold 17px Georgia, 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic'";
    ctx.fillText(data.name, 90, 25, 154);
    ctx.font = "bold 13px Georgia, 'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic'";
    ctx.fillText(data.kind[0].toUpperCase() + data.kind.slice(1), 90, 216);
    texture.needsUpdate = true;
  }
  draw();
  if (atlas) {
    const art = new Image();
    art.onload = () => draw(art);
    art.src = "data:image/webp;base64," + atlas;
  }
  textures.set(id, texture);
  return texture;
}
const moves = new Set([
  "draw",
  "play",
  "summon",
  "raise",
  "burial",
  "burn",
  "tribute",
  "set",
  "gear",
  "location",
]);

export function createTableTransfers(scene, camera, viewer, signal) {
  const edge = new T.MeshBasicMaterial({ color: 0xae8a65 });
  const face = new T.MeshBasicMaterial({ map: backTexture() });
  const back = new T.MeshBasicMaterial({ map: backTexture() });
  const model = new T.Mesh(new T.BoxGeometry(1.22, 1.695, 0.035), [edge, edge, edge, edge, face, back]);
  model.visible = false;
  scene.add(model);
  const ray = new T.Raycaster();
  const plane = new T.Plane(new T.Vector3(0, 1, 0), -0.18);
  let active;
  function anchor(mark) {
    if (mark.at !== "hand") {
      const pt = new T.Vector3(...zone(mark.side, mark.at ?? "troop", mark.slot));
      pt.y = mark.at === "deck" || mark.at === "discard" ? 0.43 : 0.22;
      return pt;
    }
    if (mark.side === viewer()) {
      ray.setFromCamera(new T.Vector2(0, -0.74), camera);
      return ray.ray.intersectPlane(plane, new T.Vector3()) ?? new T.Vector3(0, 0.22, 9.8);
    }
    return new T.Vector3(mark.side === "wizard" ? 10.8 : -10.8, 0.3, -4.9);
  }
  return {
    begin(beat) {
      this.clear();
      if (!moves.has(beat.kind)) return;
      active = beat;
      const own = beat.from.side === viewer();
      const shown =
        beat.kind === "set" || (beat.kind === "draw" && !own)
          ? undefined
          : (beat.cardId ?? beat.fromTroop?.cardId);
      face.map = faceTexture(shown);
      if (beat.kind === "draw" && own && shown) signal(shown);
    },
    frame(ms) {
      if (!active) return;
      const f = T.MathUtils.smoothstep(ms, 12, active.contact + 25);
      model.visible = ms < active.contact + 49;
      if (!model.visible) signal();
      const a = anchor(active.from),
        b = anchor(active.targets[0]);
      model.position.lerpVectors(a, b, f);
      model.position.y += Math.sin(Math.PI * f) * 1.77;
      model.quaternion.copy(camera.quaternion);
      model.rotateX(Math.PI * 0.62 * (Math.abs(0.5 - f) * 2));
      model.rotateY(Math.sin(f * Math.PI) * 0.29);
      model.rotateZ((0.5 - f) * 0.27);
      model.scale.setScalar(0.86 + Math.sin(f * Math.PI) * 0.45);
    },
    clear() {
      model.visible = false;
      active = null;
      signal();
    },
  };
}
