import * as T from "three";
import { BOARD_SIZE, TRAP_SLOTS } from "../../game/showdown/rules.js";
import { cardOf, typeOf } from "../../game/showdown/cards.js";
import { PixelRenderer } from "./graphics/pixel-renderer.js";
import { disposeBoard, makeBoard } from "./board.js";
import { battlefield } from "./battlefields.js";
import { presentationBeats } from "./event-positions.js";
import { createCombatEffects } from "./combat-effects.js";
import { makeBases } from "./bases.js";
import { makeCardModel, makeLiveCardModel } from "./card-models.js";
import { bindTableUI } from "./table-ui.js";
import { tableCamera } from "./table-camera.js";
import { createTableTransfers } from "./table-transfers.js";
import { dressTable } from "./table-dressing.js";
import { makeEmbers, makeFaeries } from "./embers.js";
import { mountGallery as mountCardGallery } from "./gallery.js";
export { mountCampOutpost } from "./camp-outpost.js";
export { paintCardFaces } from "./table-ui.js";
import { COLORS, SIDES, zone } from "./layout.js";

const FACEDOWN = 0x2a213b;
const BOOT_HILL_LIGHT = { hemi: [0xffefd6, 0x796b8e, 2.28], sun: [0xffd2a4, 2.34], moon: [0x9397de, 0.83] };
const BOOT_HILL_FOCUS = [0, 0.62, 1.3];
const GALLERY_FOCUS = [0, 1.05, -1.74];
const HAS_PANORAMA = typeof __CVW_HAS_PANORAMA__ !== "undefined" && __CVW_HAS_PANORAMA__;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)");
const solid = (color) => new T.MeshStandardMaterial({ color, roughness: 0.88, flatShading: true });
const flat = (color) => new T.MeshBasicMaterial({ color });
const meshes = {
  box: new T.BoxGeometry(1, 1, 1),
  gem: new T.OctahedronGeometry(0.5),
  ring: new T.TorusGeometry(0.5, 0.037, 5, 22),
};
function mesh(parent, geometry, material, position, scale) {
  const node = new T.Mesh(meshes[geometry], material);
  node.position.set(...position);
  node.scale.set(...scale);
  parent.add(node);
  return node;
}

function cardPiece(parent, color, scale = 1) {
  mesh(parent, "box", solid(color), [0, 0.055, 0], [1.1 * scale, 0.105, 1.28 * scale]);
  mesh(parent, "box", solid(FACEDOWN), [0, 0.116, 0], [0.94 * scale, 0.018, 1.12 * scale]);
  const mark = mesh(parent, "box", solid(color), [0, 0.133, 0], [0.17, 0.012, 0.17]);
  mark.rotation.y = Math.PI / 4;
}

function pawn(side, id) {
  const group = new T.Group();
  const { tile, line, dark, orb } = COLORS[side];
  mesh(group, "box", solid(dark), [0, 0.052, 0], [2.8, 0.105, 1.87]);
  mesh(group, "box", solid(tile), [0, 0.112, 0], [2.61, 0.025, 1.7]);
  const wide = [
    "wizard-dragon",
    "cowboy-captured-dragon",
    "cowboy-mounted-billy",
    "cowboy-covered-wagon",
    "cowboy-gatling-crew",
    "wizard-bone-wall",
    "wizard-headless-horseman",
  ].includes(typeOf(id));
  const { model: miniature, rig } = makeLiveCardModel(id, {
    width: wide ? 3.67 : 2.94,
    height: wide ? 2.72 : 2.41,
    depth: 2.17,
  });
  const border = new T.Group();
  const rim = flat(0xe5c786);
  group.add(border);
  for (const side of [-1, 1]) {
    mesh(border, "box", rim, [0, 0.126, side * 0.934], [2.79, 0.035, 0.042]);
    mesh(border, "box", rim, [side * 1.398, 0.127, 0], [0.041, 0.034, 1.875]);
  }
  border.visible = false;
  const restScale = miniature.scale.x;
  miniature.position.set(0, 0.146, -0.07);
  group.add(miniature);
  const gear = new T.Group();
  group.add(gear);
  const embers = makeEmbers(group, side, id);
  embers?.(0);
  let equipped = "";
  const pips = new T.Group();
  pips.position.set(0, 0.21, 0.76);
  group.add(pips);
  const pipsMaterial = flat(orb);
  const cover = new T.Group(),
    left = side === "cowboy";
  cover.position.set(left ? 1.11 : -1.11, 0.12, 0.043);
  group.add(cover);
  if (left) {
    mesh(cover, "box", solid(0x775044), [0, 0.16, 0], [0.28, 0.31, 1.18]);
    for (const z of [-0.38, 0.38]) {
      const wood = mesh(cover, "box", solid(0xb0805b), [0.015, 0.35, z], [0.14, 0.57, 0.23]);
      wood.rotation.z = z * 0.67;
    }
  } else {
    const slab = mesh(cover, "box", solid(0x8a8299), [0, 0.27, 0], [0.24, 0.65, 0.93]);
    slab.rotation.z = 0.21;
  }
  const stun = mesh(group, "ring", flat(0xe4b57b), [0, 0.66, 0.14], [0.91, 0.91, 0.91]);
  stun.rotation.x = 0.85;
  stun.rotation.y = 0.12;
  group.traverse((node) => {
    if (node.isMesh && !node.isInstancedMesh) node.castShadow = node.receiveShadow = true;
  });
  return {
    group,
    model: miniature,
    rig,
    embers,
    restScale,
    id,
    side,
    restY: 0.146,
    highlight(mode) {
      border.visible = mode !== 0;
      rim.color.setHex(mode === 2 ? 0xffebac : 0xd6b675);
    },
    update(troop) {
      this.restY = troop.cover ? 0.066 : 0.146;
      miniature.position.set(0, this.restY, -0.07);
      miniature.rotation.set(0, 0, 0);
      const rider = miniature.getObjectByName("rider");
      if (rider) {
        rider.visible = true;
        rider.rotation.z = 0;
      }
      const skull = miniature.getObjectByName("skull");
      if (skull) {
        skull.position.set(0, 0, 0);
        skull.rotation.set(0, 0, 0);
      }
      miniature.getObjectByName("dagger-arm")?.rotation.set(0, 0, 0);
      const dynamite = miniature.getObjectByName("held-dynamite");
      if (dynamite) dynamite.visible = true;
      miniature.getObjectByName("gatling-pivot")?.rotation.set(0, 0, 0);
      miniature.getObjectByName("gatling-barrels")?.rotation.set(0, 0, 0);
      miniature.scale.set(restScale, restScale * (troop.stunned ? 0.92 : troop.cover ? 0.9 : 1), restScale);
      if (rig) rig.pose({});
      miniature.visible = true;
      stun.visible = Boolean(troop.stunned);
      while (pips.children.length > troop.health) pips.remove(pips.children.at(-1));
      while (pips.children.length < troop.health)
        mesh(pips, "gem", pipsMaterial, [0, 0, 0], [0.21, 0.21, 0.21]);
      pips.children.forEach((pip, i) => {
        pip.position.x = (i - (troop.health - 1) / 2) * 0.241;
      });
      cover.visible = troop.cover;
      if (troop.gear.join() !== equipped) {
        equipped = troop.gear.join();
        gear.clear();
        troop.gear.forEach((id, i) => {
          const object = makeCardModel(id, { width: 0.56, height: 0.53, depth: 0.47 });
          object.position.set((i % 2 ? -1 : 1) * 0.98, 0.135, 0.41 - Math.floor(i / 2) * 0.32);
          gear.add(object);
        });
      }
    },
  };
}

function build(host, canvas, screen, closeup = false) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: false, alpha: HAS_PANORAMA });
  if (HAS_PANORAMA) renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = T.LinearSRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFShadowMap;
  const pipeline = new PixelRenderer(renderer);
  const scene = new T.Scene();
  if (!HAS_PANORAMA) scene.background = new T.Color(0x17243a);
  const camera = new T.OrthographicCamera(-20, 20, 10, -10, 0.1, 120);
  const hemi = new T.HemisphereLight(...BOOT_HILL_LIGHT.hemi);
  const sun = new T.DirectionalLight(...BOOT_HILL_LIGHT.sun);
  sun.position.set(-19, 20, 13);
  const moon = new T.DirectionalLight(...BOOT_HILL_LIGHT.moon);
  moon.position.set(24, 17, -14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 18, bottom: -18, near: 0.1, far: 60 });
  sun.shadow.normalBias = 0.045;
  sun.shadow.bias = -0.00025;
  scene.add(hemi, sun, moon);
  let board;
  let lighting = BOOT_HILL_LIGHT;
  const bases = makeBases(scene);
  const dressing = dressTable(scene);
  const faeries = makeFaeries(scene);
  pipeline.configure({ pixelSize: 2, outlines: !HAS_PANORAMA, dither: !HAS_PANORAMA, exposure: 1.035 });
  const moves = new T.Group();
  scene.add(moves);
  const held = new Map();
  const labelLayer = host.querySelector(".sd-world-labels");
  const locationGroup = new T.Group();
  moves.add(locationGroup);
  const worldLabels = new Map();
  const sideMarks = new Map();

  const projection = new T.Vector3();
  let view,
    display,
    epoch = 0,
    width = 0,
    height = 0,
    locationId = null;
  const pawnAt = (mark) => (mark?.slot === undefined || mark.at ? null : held.get(mark.side + mark.slot));
  const fx = createCombatEffects(moves, pawnAt, bases, camera);
  const cameraControl = tableCamera(
    canvas,
    camera,
    (angle) => {
      bases.cowboy.aim(angle, cameraControl.view().zoom);
      arrange();
      draw();
    },
    closeup ? 1.63 : 1,
    closeup ? GALLERY_FOCUS : BOOT_HILL_FOCUS,
  );
  const transfers = createTableTransfers(
    moves,
    camera,
    () => view?.viewer,
    (id) => {
      screen.querySelectorAll("#sd-hand [data-card]").forEach((button) => {
        button.classList.toggle("table-card-flying", button.dataset.card === id);
      });
    },
  );
  document.addEventListener("keydown", (event) => {
    const dialog = document.querySelector("dialog[open]");
    if (
      view &&
      !screen.hidden &&
      (!dialog || (closeup && dialog === screen)) &&
      (!closeup || screen.open) &&
      !event.target.matches?.("input,textarea,select")
    ) {
      cameraControl.key(event);
    }
  });

  function label(key, [x, y, z], word, active = true) {
    if (!worldLabels.has(key)) {
      const text = document.createElement("span");
      labelLayer.append(text);
      worldLabels.set(key, text);
    }
    const text = worldLabels.get(key);
    text.hidden = !word;
    text.textContent = word;
    text.classList.toggle("empty", !active);
    place(text, x, y, z);
  }
  function pieceAt(side, at, index = 0) {
    const key = side + at + index;
    if (!sideMarks.has(key)) {
      const group = new T.Group();
      group.position.set(...zone(side, at, index));
      group.position.y += 0.13;
      const { line } = COLORS[side] ?? COLORS.wizard;
      cardPiece(group, line, 0.88);
      sideMarks.set(key, group);
      moves.add(group);
    }
    return sideMarks.get(key);
  }

  function place(element, x, y, z) {
    if (!element) return;
    projection.set(x, y, z).project(camera);
    element.style.left = (projection.x * 0.5 + 0.5) * width + "px";
    element.style.top = (0.5 - projection.y * 0.5) * height + "px";
  }
  function placeControl(selector, x, y, z, span = 2.37) {
    const button = host.querySelector(selector);
    if (!button) return null;
    place(button, x, y, z);
    button.style.setProperty("--hit-width", (width / 38) * span + "px");
    button.style.setProperty(
      "--hit-height",
      Math.min(width < 650 ? 28 : 80, (width / 38) * span * 0.91) + "px",
    );
    return button;
  }
  function arrange() {
    if (!display || canvas.hidden) return;
    // Exactly the same native buttons continue to receive clicks, focus and screen-reader text.
    for (const side of SIDES) {
      const s = display.sides[side];
      const [bx, , bz] = zone(side, "base");
      placeControl(`[data-base="${side}"]`, bx, 0.76, bz + 0.61, 3.04);
      bases[side].update(s.base, s.baseMax);
      label(side + "base", [bx, 0.37, bz + 1.63], s.base === 0 ? "기지 함락" : s.base + " ●");
      for (let slot = 0; slot < BOARD_SIZE; slot++) {
        const [x, , z] = zone(side, "troop", slot);
        const selector = `[data-slot="${side}-${slot}"]`;
        const troop = s.board[slot];
        const actual = view.sides[side].board[slot];
        const btn = placeControl(selector, x, 0.28, z + 0.45);
        const temporary = troop?.cardId !== actual?.cardId;
        if (btn) btn.dataset.previewSwap = temporary ? "1" : "";
        const word = troop ? cardOf(troop.cardId).name : "";
        label(side + "snapshot" + slot, [x, 0.08, z + 1.3], word);
        if (closeup) {
          const orbs = side + "orbs" + slot;
          const dragon = troop && typeOf(troop.cardId).endsWith("-dragon");
          label(orbs, [x, dragon ? 2.66 : 3.06, z - 0.08],
            host.dataset.spell && troop?.health ? "●".repeat(troop.health) : "");
          worldLabels.get(orbs).dataset.vortexOrbs = side;
        }
        const text = worldLabels.get(side + "snapshot" + slot);
        text.dataset.pieceLabel = "1";
        text.dataset.runeLabel = side === "wizard" ? "1" : "";
        pawnAt({ side, slot })?.highlight(
          btn?.classList.contains("sd-pick") || btn?.classList.contains("sd-chosen")
            ? 2
            : btn?.classList.contains("sd-can")
              ? 1
              : 0,
        );
      }
      for (const [at, count, title] of [
        ["deck", s.deckCount, "덱"],
        ["discard", s.discard.length, "묘지"],
      ]) {
        const [x, , z] = zone(side, at);
        const stack = pieceAt(side, at);
        stack.visible = count > 0;
        stack.scale.y = Math.min(4, 1 + count / 7);
        label(side + at, [x, 0.071, z + 0.7], title + " " + count, count > 0);
        if (at === "discard") worldLabels.get(side + at).dataset.graveLabel = side;
      }
      const [x, , z] = zone(side, "trap", TRAP_SLOTS - 1);
      // A trap's identity never leaves Showdown's own seat-scoped controls.
      for (let slot = 0; slot < TRAP_SLOTS; slot++) pieceAt(side, "trap", slot).visible = s.trapCount > slot;
      label(
        side + "traps",
        [x + (side === "wizard" ? 1.04 : -0.28), 0.066, z + 0.81],
        "함정 " + s.trapCount + "/" + TRAP_SLOTS,
        s.trapCount > 0,
      );
    }
    const location = display.location?.cardId;
    if ((location ?? null) !== locationId) {
      locationId = location ?? null;
      locationGroup.clear();
      if (locationId) {
        const prop = makeCardModel(locationId, { width: 2.38, height: 1.41, depth: 1.58 });
        prop.position.set(...zone(null, "location"));
        prop.position.y = 0.17;
        locationGroup.add(prop);
      }
    }
    label("location", [0, 0.08, 1.5], location ? cardOf(location).name : "장소", Boolean(location));
  }

  function draw(flare) {
    if (width && height && view && !canvas.hidden) {
      const now = REDUCED.matches ? 0 : performance.now();
      bases.wizard.ambient(now);
      const frame = Math.floor(now / 78);
      faeries(frame);
      for (const [key, pawn] of held) {
        pawn.embers?.(frame, flare?.key === key ? flare.strength : 0);
      }
      pipeline.render(scene, camera);
    }
  }
  function size() {
    const nextWidth = canvas.clientWidth;
    const nextHeight = canvas.clientHeight;
    if (width === nextWidth && height === nextHeight) {
      arrange();
      draw();
      return;
    }
    width = nextWidth;
    height = nextHeight;
    if (!width || !height || canvas.hidden) return;
    cameraControl.resize(width, height);
    renderer.setSize(width, height, false);
    pipeline.setSize(width, height);
    arrange();
    draw();
  }

  function makePawn(mark, troop) {
    const token = pawn(mark.side, troop.cardId);
    token.group.position.set(...zone(mark.side, "troop", mark.slot));
    token.group.position.y = 0.14;
    token.update(troop);
    return token;
  }

  function synchronize(next) {
    display = next;
    for (const side of SIDES)
      next.sides[side].board.forEach((troop, slot) => {
        const key = side + slot;
        let token = held.get(key);
        if (token?.id !== troop?.cardId) {
          if (token) {
            moves.remove(token.group);
            disposePawn(token.group);
            held.delete(key);
          }
          if (troop) {
            token = makePawn({ side, slot }, troop);
            moves.add(token.group);
            held.set(key, token);
          }
        }
        if (troop) token.update(troop);
      });
    size();
  }

  function spellDarkness(alpha) {
    hemi.intensity = lighting.hemi[2] * (1 - alpha * 0.80);
    sun.intensity = lighting.sun[1] * (1 - alpha * 0.89);
    moon.intensity = lighting.moon[1] + alpha * 0.2;
    if (alpha > 0) host.style.setProperty("--spell-darkness", alpha.toFixed(3));
    else host.style.removeProperty("--spell-darkness");
  }
  function setBattlefield(id) {
    const venue = battlefield(id);
    const name = venue ? id : "boot-hill";
    if (board && host.dataset.battlefield === name) return;
    if (board) disposeBoard(board);
    board = makeBoard(scene, venue);
    host.dataset.battlefield = name;
    lighting = venue?.lighting ?? BOOT_HILL_LIGHT;
    const [sky, earth] = lighting.hemi;
    hemi.color.setHex(sky);
    hemi.groundColor.setHex(earth);
    sun.color.setHex(lighting.sun[0]);
    moon.color.setHex(lighting.moon[0]);
    spellDarkness(0);
    cameraControl.frame(closeup ? 1.63 : venue ? 0.93 : 1, closeup ? GALLERY_FOCUS : venue?.focus ?? BOOT_HILL_FOCUS);
  }
  function stop() {
    epoch++;
    fx.clear();
    if (host.dataset.spell || host.style.getPropertyValue("--spell-darkness")) spellDarkness(0);
    transfers.clear();
    dressing.reset();
    bases.cowboy.swing(0);
    delete canvas.dataset.motion;
  }
  function paint(next, start) {
    stop();
    view = next;
    canvas.hidden = false;
    synchronize(start && !REDUCED.matches ? start : next);
  }
  function clear() {
    stop();
    view = display = null;
    canvas.hidden = true;
    labelLayer.replaceChildren();
    worldLabels.clear();
  }
  function animate(trace, finished) {
    stop();
    if (!view) return;
    const beats = !REDUCED.matches ? presentationBeats(trace) : [];
    if (!beats.length) {
      synchronize(view);
      finished?.();
      return;
    }
    const run = epoch;
    const initial = performance.now();
    let index = 0,
      edge = 0,
      phase = "";
    function frame(now) {
      if (run !== epoch) return;
      const elapsed = now - initial;
      const intro = closeup ? 550 : 0;
      if (elapsed < intro) {
        draw();
        requestAnimationFrame(frame);
        return;
      }
      const playTime = elapsed - intro;
      while (index < beats.length && playTime >= edge + beats[index].duration) {
        edge += beats[index].duration;
        index++;
      }
      const beat = beats[index];
      if (!beat) {
        stop();
        synchronize(view);
        finished?.();
        return;
      }
      const local = playTime - edge,
        hit = local >= beat.contact;
      const next = index + ":" + (hit ? "hit" : "pre");
      if (next !== phase) {
        const newBeat = !phase.startsWith(index + ":");
        phase = index + ":" + (hit ? "hit" : "pre");
        synchronize(hit ? beat.hit : beat.pre);
        if (newBeat) {
          fx.begin(beat, makePawn, (token) => disposePawn(token.group));
          transfers.begin(beat);
        }
      }
      canvas.dataset.motion = beat.kind;
      const vortex = beat.kind === "area-vortex" || beat.kind === "vortex";
      const shade = vortex ? 0.77 : beat.kind === "hellfire" ? 0.49 : 0;
      if (shade || host.style.getPropertyValue("--spell-darkness")) {
        const darkness = shade
          ? shade * T.MathUtils.smoothstep(local, 120, beat.contact * 0.60) * (1 - T.MathUtils.smoothstep(local, beat.contact + 45, beat.duration))
          : 0;
        spellDarkness(darkness);
      }
      dressing.frame(beat, local);
      bases.cowboy.swing(
        beat.kind === "summon" && beat.from.side === "cowboy"
          ? 0.84 * Math.sin((Math.PI * local) / beat.duration)
          : 0,
      );
      transfers.frame(local);
      fx.frame(local);
      const summon = beat.kind === "summon" && hit ? beat.targets[0] : null;
      draw(
        summon
          ? {
              key: summon.side + summon.slot,
              strength: 1 - Math.min(1, (local - beat.contact) / 210),
            }
          : null,
      );
      requestAnimationFrame(frame);
    }
    canvas.dataset.motion = beats[0].kind;
    requestAnimationFrame(frame);
  }

  if (closeup) setBattlefield("boot-hill");
  new ResizeObserver(size).observe(canvas);
  window.setInterval(() => {
    const visible = closeup ? screen.open : !screen.hidden && !document.querySelector("dialog[open]");
    if (view && visible && !canvas.hidden && !canvas.dataset.motion && !REDUCED.matches) draw();
  }, 145);
  return { paint, clear, animate, size, setBattlefield, frame: cameraControl.frame, lookAt: cameraControl.lookAt };
}

export function mountGallery(title, duel) {
  mountCardGallery(title, duel, (host, canvas, dialog) => build(host, canvas, dialog, true));
}

function disposePawn(group) {
  const materials = new Set(),
    geometries = new Set();
  group.traverse((node) => {
    if (node.isSprite) {
      node.material.dispose();
      return;
    }
    if (!node.isMesh) return;
    if (node.isInstancedMesh) node.dispose();
    for (const material of [node.material].flat())
      if (!material.userData.showdownShared) materials.add(material);
    if (!node.geometry.userData.showdownShared && !Object.values(meshes).includes(node.geometry))
      geometries.add(node.geometry);
  });
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

export function mountDiorama(root) {
  const field = root.querySelector("#sd-field");
  const table = bindTableUI(root);
  const canvas = document.createElement("canvas");
  canvas.className = "sd-world";
  canvas.setAttribute(
    "aria-label",
    "3차원 보드입니다. 드래그하면 회전, 스크롤하면 확대, 0 키는 시점 초기화입니다.",
  );
  canvas.tabIndex = 0;
  canvas.hidden = true;
  const labels = document.createElement("div");
  labels.className = "sd-world-labels";
  labels.setAttribute("aria-hidden", "true");
  field.prepend(canvas, labels);
  let game,
    venue,
    failed = false;
  function fallback() {
    game?.clear();
    canvas.hidden = true;
    root.classList.remove("sd-diorama");
    table.restore();
    failed = true;
  }
  canvas.addEventListener("webglcontextlost", fallback);
  return {
    setBattlefield(id) {
      venue = id;
    },
    paint(view, start) {
      if (failed) return;
      try {
        game ??= build(field, canvas, root);
        game.setBattlefield(venue);
      } catch (error) {
        console.warn("쇼다운 3D를 사용할 수 없습니다.", error);
        fallback();
        return;
      }
      root.classList.add("sd-diorama");
      table.paint(view);
      game.paint(view, start);
    },
    clear() {
      game?.clear();
      table.restore();
      root.classList.remove("sd-diorama");
    },
    animate(trace, finished) {
      if (!failed && game) game.animate(trace, finished);
      else finished?.();
    },
  };
}
