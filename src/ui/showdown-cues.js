// Placeholder cues for the Showdown graybox, before any 3D work (showdown-integration-kiro-brief.md,
// "Before any 3D work"): ten engine events get a highlight on the board and a tagged log line, so no
// rule waits on an animation. A cue is read only from an EVENTS entry (contract.js) and the seat's
// public views; it invents no state. Card ids never reach a cue or the page: a cue names places
// (a side's slot, its Base, its row, the location) and carries presentEvent's text.
import {presentEvent} from "../game/showdown/presenter.js";
import {opponent} from "../game/showdown/rules.js";

// The ten cue kinds, keyed by the EVENTS type that drives each.
export const CUES = Object.freeze({
  cover: "엄폐",
  trap: "함정 발동",
  gear: "장비 장착",
  location: "장소 변경",
  raise: "부대 소생",
  sweep: "휩쓸기",
  laststand: "최후의 저항",
  set: "뒷면으로 놓기",
  burn: "소각된 드로우",
  fatigue: "탈진",
});

// Each step of a sequence stays this long; a new batch of events cuts the old sequence short.
export const STEP_MS = 700;

// The subcase an event's own payload encodes, so a screen can tell them apart without the rules.
function variantOf(e) {
  if (e.type === "trap") return e.left === 0 ? "defeated" : e.stopped ? "cancelled" : "through";
  if (e.type === "laststand") return e.left === 0 ? "defeated" : "wounded";
  return null;
}

// The cues for one batch of events, in order. `before` is the seat's view before the batch (null
// for the opening), `after` the view once it is applied. Troops never change slot while on the
// board, so a troop is found by its id. A batch can hold a whole bot turn, so a troop may arrive
// and fall inside it: the board is followed through the batch with only what EVENTS states (a
// troop arrives on its side's first empty slot; tribute and the left/targetLeft/attackerLeft
// fields at 0 remove one). A sweep does not say which troops fell, so that row is then unknown and
// a later arrival there is read from `after`. A troop that cannot be placed falls back to its row.
export function cuesFor(events, before, after) {
  const boards = {};
  const last = new Map();
  for (const side of ["cowboy", "wizard"]) {
    boards[side] = before ? before.sides[side].board.map((troop) => troop?.cardId ?? null) : null;
    boards[side]?.forEach((id, slot) => { if (id) last.set(id, slot); });
  }
  const leave = (side, cardId) => {
    const at = boards[side]?.indexOf(cardId) ?? -1;
    if (at >= 0) boards[side][at] = null;
  };
  const arrive = (side, cardId) => {
    const at = boards[side]?.indexOf(null) ?? -1;
    if (at >= 0) { boards[side][at] = cardId; last.set(cardId, at); } else last.delete(cardId);
  };
  const troop = (side, cardId) => {
    if (last.has(cardId)) return {side, slot: last.get(cardId)};
    const slot = after ? after.sides[side].board.findIndex((t) => t?.cardId === cardId) : -1;
    return slot >= 0 ? {side, slot} : {side, at: "row"};
  };
  // Follows the board after the event's cue is placed, so a troop that falls is cued where it stood.
  const follow = (e) => {
    const foe = opponent(e.side);
    if (e.type === "tribute") leave(e.side, e.cardId);
    else if (e.type === "summon" || e.type === "raise") arrive(e.side, e.cardId);
    else if (e.type === "spell" && e.left === 0) leave(foe, e.target);
    else if (e.type === "trap" && e.left === 0) leave(foe, e.target);
    else if (e.type === "laststand" && e.left === 0) leave(foe, e.target);
    else if (e.type === "attack") {
      if (e.target !== "base" && e.targetLeft === 0) leave(foe, e.target);
      if (e.attackerLeft === 0) leave(e.side, e.cardId);
    } else if (e.type === "sweep") boards[foe] = null;
  };
  const cues = [];
  for (const [index, e] of events.entries()) {
    // A raised troop is cued on the slot it rises to; every other event is cued before it changes the board.
    if (e.type === "raise") follow(e);
    if (!Object.hasOwn(CUES, e.type)) { follow(e); continue; }
    const foe = opponent(e.side);
    const marks = {
      cover: () => [troop(e.side, e.cardId)],
      // The trap's owner reveals it from its trap slots; it springs on the attacking troop.
      trap: () => [{side: e.side, at: "base"}, troop(foe, e.target)],
      gear: () => [troop(e.side, e.target)],
      location: () => [{at: "location"}],
      raise: () => [troop(e.side, e.cardId)],
      // The event counts the troops swept, not which: the whole enemy row is marked.
      sweep: () => [troop(e.side, e.cardId), {side: foe, at: "row"}],
      laststand: () => [troop(e.side, e.cardId), troop(foe, e.target)],
      set: () => [{side: e.side, at: "base"}],
      burn: () => [{side: e.side, at: "base"}],
      fatigue: () => [{side: e.side, at: "base"}],
    }[e.type]();
    cues.push({kind: e.type, label: CUES[e.type], variant: variantOf(e), side: e.side, index, marks, text: presentEvent(e)});
    if (e.type !== "raise") follow(e);
  }
  return cues;
}

const prefersReducedMotion = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const MARK_CLASS = "sd-cue";

// Plays cue batches on the mounted Showdown screen. paint() reapplies the current step after the
// screen redraws its board. Each play() or clear() starts a new epoch, so a timer from an older
// batch never paints. With reduced motion the whole batch is shown at once and nothing flashes.
export function createCuePlayer(root, {step = STEP_MS, reducedMotion = prefersReducedMotion, timers = globalThis} = {}) {
  let epoch = 0, shown = [], timer = null;
  const banner = () => root.querySelector("#sd-cue");
  const target = (mark) => mark.at === "location" ? root.querySelector("#sd-location")
    : mark.at === "base" ? root.querySelector(`#sd-board [data-base="${mark.side}"]`)
    : mark.at === "row" ? root.querySelector(`#sd-board .sd-side[data-side="${mark.side}"]`)
    : root.querySelector(`#sd-board [data-slot="${mark.side}-${mark.slot}"]`);

  function paint() {
    for (const node of root.querySelectorAll(`.${MARK_CLASS}`)) {
      node.classList.remove(MARK_CLASS, "sd-cue-still");
      delete node.dataset.cue;
    }
    const still = shown.still;
    for (const cue of shown) {
      for (const mark of cue.marks) {
        const node = target(mark);
        if (!node) continue;
        void node.offsetWidth; // restart the flash when the same place is cued twice in a row
        node.classList.add(MARK_CLASS);
        if (still) node.classList.add("sd-cue-still");
        node.dataset.cue = cue.kind;
      }
      const line = root.querySelector(`#sd-log [data-line="${cue.line}"]`);
      if (line) { line.classList.add(MARK_CLASS); if (still) line.classList.add("sd-cue-still"); }
    }
    const b = banner();
    if (b) {
      b.innerHTML = shown.map((cue) => `<span class="sd-cue-label" data-cue="${cue.kind}"${cue.variant ? ` data-variant="${cue.variant}"` : ""}>${cue.label}</span>`).join(" ");
      b.dataset.count = String(shown.length);
    }
  }
  function clear() {
    epoch += 1;
    if (timer !== null) timers.clearTimeout(timer);
    timer = null;
    shown = [];
    paint();
  }
  // cues: from cuesFor, each with `line`, the log line number the screen gave its event.
  function play(cues) {
    clear();
    if (!cues.length) return;
    if (reducedMotion()) {
      shown = Object.assign([...cues], {still: true});
      paint();
      return;
    }
    const mine = epoch;
    const show = (i) => {
      if (mine !== epoch) return;
      shown = i < cues.length ? [cues[i]] : [];
      paint();
      timer = i < cues.length ? timers.setTimeout(() => show(i + 1), step) : null;
    };
    show(0);
  }
  return {play, paint, clear, get epoch() { return epoch; }, get shown() { return [...shown]; }};
}
