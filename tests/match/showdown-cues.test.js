// Placeholder cues before any 3D work (docs/design/showdown-integration-kiro-brief.md): the ten
// named events give a cue placed from the seat's public views, every subcase an event payload
// encodes is told apart, no card id reaches a cue, and a new batch or reduced motion is honoured.
import assert from "node:assert/strict";
import test from "node:test";
import {DECKS, TYPES} from "../../src/game/showdown/cards.js";
import {EVENTS, viewFor} from "../../src/game/showdown/contract.js";
import {presentEvent} from "../../src/game/showdown/presenter.js";
import {HAND_CAP, applyAction, createShowdown, legalActions, random} from "../../src/game/showdown/rules.js";
import {CUES, createCuePlayer, cuesFor} from "../../src/ui/showdown-cues.js";

const SEAT = "cowboy";
const CARD_ID = /\b(?:cowboy|wizard)-[a-z-]+-\d+\b/;
const troop = (cardId, health = TYPES[cardId.replace(/-\d+$/, "")].health) =>
  ({cardId, health, attacked: false, stunned: false, cover: false, gear: [], arrived: 0, ready: false});

// A turn-3 position with the given boards (three entries per side, null for empty) and side to act.
function position({active = "cowboy", cowboy = [null, null, null], wizard = [null, null, null], traps = {}, hand = {}, discard = {}, deck = {}} = {}) {
  const state = createShowdown(7);
  Object.assign(state, {turn: 3, active, first: "cowboy"});
  for (const [side, board] of Object.entries({cowboy, wizard})) {
    Object.assign(state.sides[side], {board: board.map((id) => (id ? troop(id) : null)),
      traps: traps[side] ?? [], hand: hand[side] ?? [], discard: discard[side] ?? [], ...(deck[side] ? {deck: deck[side]} : {})});
  }
  return state;
}
// Applies one action from the seat's point of view and returns the cues the screen would play.
function cuesAfter(state, action) {
  assert.ok(legalActions(state).some((a) => JSON.stringify(a) === JSON.stringify(action)), `not legal: ${JSON.stringify(action)}`);
  const applied = applyAction(state, action);
  return {cues: cuesFor(applied.events, viewFor(state, SEAT), viewFor(applied.state, SEAT)), events: applied.events, state: applied.state};
}
const only = (cues, kind) => {
  const found = cues.filter((cue) => cue.kind === kind);
  assert.equal(found.length, 1, `${kind} cues: ${found.length}`);
  return found[0];
};

test("there is one cue for each of the ten named events, and each names an EVENTS entry", () => {
  assert.deepEqual(Object.keys(CUES).sort(), ["burn", "cover", "fatigue", "gear", "laststand", "location", "raise", "set", "sweep", "trap"]);
  for (const kind of Object.keys(CUES)) assert.ok(Object.hasOwn(EVENTS, kind), kind);
  // The board's own cues (arrive, attack, spell, leave) and the bookkeeping events get no placeholder.
  for (const type of ["turn", "draw", "tribute", "summon", "spell", "attack"]) {
    assert.deepEqual(cuesFor([{type, side: "cowboy", cardId: "cowboy-sheriff-1", turn: 2, target: "base"}], null, null), []);
  }
});

test("any slot attacking any slot: the trap, Last Stand and Sweep cues land on the slots that fought", () => {
  for (let from = 0; from < 3; from += 1) {
    for (let to = 0; to < 3; to += 1) {
      const label = `cowboy slot ${from} -> wizard slot ${to}`;
      const cowboy = [null, null, null];
      cowboy[from] = "cowboy-captured-dragon-1";
      const wizard = ["wizard-skeleton-1", "wizard-skeleton-2", "wizard-skeleton-3"];
      wizard[to] = "wizard-jack-o-lantern-1";

      // A Hex: revealed from the Wizards' trap slots, it cancels the attack of the troop in `from`.
      const hexed = cuesAfter(position({cowboy, wizard, traps: {wizard: ["wizard-hex-1"]}}), {type: "attack", slot: from, target: to});
      const trap = only(hexed.cues, "trap");
      assert.equal(trap.variant, "cancelled", label);
      assert.deepEqual(trap.marks, [{side: "wizard", at: "base"}, {side: "cowboy", slot: from}], label);

      // No trap: the Jack-o'-Lantern in `to` falls and its Last Stand hits back; the Dragon sweeps the rest of the row.
      const {cues} = cuesAfter(position({cowboy, wizard}), {type: "attack", slot: from, target: to});
      const stand = only(cues, "laststand");
      assert.equal(stand.side, "wizard");
      assert.equal(stand.variant, "wounded", label); // the Dragon's 2 orbs drop to 1
      assert.deepEqual(stand.marks, [{side: "wizard", slot: to}, {side: "cowboy", slot: from}], label);
      const sweep = only(cues, "sweep");
      assert.deepEqual(sweep.marks, [{side: "cowboy", slot: from}, {side: "wizard", at: "row"}], label);
      assert.match(sweep.text, /2 other troops/);
    }
  }
});

test("Last Stand that defeats the troop that fought it is the defeated subcase, both slots still marked", () => {
  // A Sheriff down to 1 orb defeats a Jack-o'-Lantern: Last Stand takes the Sheriff's last orb, and both slots end empty.
  const state = position({cowboy: [null, "cowboy-sheriff-1", null], wizard: [null, null, "wizard-jack-o-lantern-1"]});
  state.sides.cowboy.board[1].health = 1;
  const {cues, state: after} = cuesAfter(state, {type: "attack", slot: 1, target: 2});
  const stand = only(cues, "laststand");
  assert.equal(stand.variant, "defeated");
  assert.deepEqual(stand.marks, [{side: "wizard", slot: 2}, {side: "cowboy", slot: 1}]);
  assert.equal(after.sides.cowboy.board[1], null);
  assert.equal(after.sides.wizard.board[2], null);
});

test("a Bear Trap gives the through and defeated subcases on the attacking Wizard's slot", () => {
  for (let from = 0; from < 3; from += 1) {
    const wizard = [null, null, null];
    wizard[from] = "wizard-headless-horseman-1"; // 3 orbs: the snare leaves it on 1 and it attacks anyway
    const through = only(cuesAfter(position({active: "wizard", wizard, cowboy: ["cowboy-sheriff-1", null, null], traps: {cowboy: ["cowboy-bear-trap-1"]}}),
      {type: "attack", slot: from, target: 0}).cues, "trap");
    assert.equal(through.variant, "through");
    assert.deepEqual(through.marks, [{side: "cowboy", at: "base"}, {side: "wizard", slot: from}]);

    wizard[from] = "wizard-jack-o-lantern-1"; // 1 orb: the snare defeats it, and the cue still finds its slot
    const defeated = only(cuesAfter(position({active: "wizard", wizard, cowboy: [null, null, "cowboy-sheriff-1"], traps: {cowboy: ["cowboy-bear-trap-1"]}}),
      {type: "attack", slot: from, target: 2}).cues, "trap");
    assert.equal(defeated.variant, "defeated");
    assert.deepEqual(defeated.marks, [{side: "cowboy", at: "base"}, {side: "wizard", slot: from}]);
  }
});

test("a raised troop is cued on the slot it rises to, not the slot its id had before", () => {
  // The Wizard (one tribute) is paid with the Skeleton in slot 0, lands in slot 0, and raises the Skeleton into slot 1.
  const state = position({active: "wizard", wizard: ["wizard-skeleton-1", null, "wizard-bone-wall-1"], hand: {wizard: ["wizard-wizard-1"]}});
  const {cues, state: after} = cuesAfter(state, {type: "summon", cardId: "wizard-wizard-1", tributes: [0]});
  assert.equal(after.sides.wizard.board[0].cardId, "wizard-wizard-1");
  const raise = only(cues, "raise");
  assert.equal(after.sides.wizard.board[1].cardId, "wizard-skeleton-1");
  assert.deepEqual(raise.marks, [{side: "wizard", slot: 1}]);
});

test("cover, gear, location, set, burn and fatigue cues mark their place", () => {
  const cover = only(cuesAfter(position({cowboy: [null, null, "cowboy-sheriff-1"]}), {type: "cover", slot: 2}).cues, "cover");
  assert.deepEqual(cover.marks, [{side: "cowboy", slot: 2}]);

  const gear = only(cuesAfter(position({cowboy: [null, "cowboy-sheriff-1", null], hand: {cowboy: ["cowboy-six-shooter-1"]}}),
    {type: "gear", cardId: "cowboy-six-shooter-1", slot: 1}).cues, "gear");
  assert.deepEqual(gear.marks, [{side: "cowboy", slot: 1}]);

  const location = only(cuesAfter(position({hand: {cowboy: ["cowboy-sheriffs-office-1"]}}), {type: "location", cardId: "cowboy-sheriffs-office-1"}).cues, "location");
  assert.deepEqual(location.marks, [{at: "location"}]);

  // The Wizards set a card: the cue marks their Base and names no card.
  const set = only(cuesAfter(position({active: "wizard", hand: {wizard: ["wizard-hex-2"]}}), {type: "set", cardId: "wizard-hex-2"}).cues, "set");
  assert.deepEqual(set.marks, [{side: "wizard", at: "base"}]);
  assert.equal(set.text, "마법사: 카드를 뒷면으로 놓음.");
  assert.doesNotMatch(JSON.stringify(set), CARD_ID);

  // Ending the turn: the Wizards draw into a full hand (burn), and with an empty deck lose an orb (fatigue).
  const full = Array.from({length: HAND_CAP}, (_, i) => `wizard-skeleton-${i + 1}`);
  const burn = only(cuesAfter(position({hand: {wizard: full}, deck: {wizard: ["wizard-hex-1"]}}), {type: "end"}).cues, "burn");
  assert.deepEqual(burn.marks, [{side: "wizard", at: "base"}]);
  const fatigue = only(cuesAfter(position({deck: {wizard: []}}), {type: "end"}).cues, "fatigue");
  assert.deepEqual(fatigue.marks, [{side: "wizard", at: "base"}]);
});

// Random legal play with gear and locations in both decks, seen from the Cowboy seat. Like the
// screen's session, one batch runs from a Cowboy action through the whole Wizard turn that follows,
// so troops arrive and fall inside a batch. Each slot mark is checked against the full state just
// before and just after the action that gave its event.
test("over random legal play in session-sized batches every cue lands where its troop stood, with its event's text and no card id", () => {
  const decks = {cowboy: {...DECKS.cowboy, "cowboy-six-shooter": 2, "cowboy-sheriffs-office": 2, "cowboy-captured-dragon": 1},
    wizard: {...DECKS.wizard, "wizard-bone-armor": 2, "wizard-boneyard": 2}};
  const met = new Set();
  let rows = 0, marks = 0;
  for (let seed = 0; seed < 80; seed += 1) {
    const pick = random(seed + 1000);
    const choose = (state) => {
      const others = legalActions(state).filter((a) => a.type !== "end");
      return others.length && pick() < .85 ? others[Math.floor(pick() * others.length)] : {type: "end"};
    };
    let state = createShowdown(seed, {decks});
    for (let step = 0; step < 400 && !state.result; step += 1) {
      const before = viewFor(state, SEAT);
      const events = [], states = [];
      do {
        const applied = applyAction(state, choose(state));
        for (const event of applied.events) { events.push(event); states.push([state, applied.state]); }
        state = applied.state;
      } while (!state.result && state.active !== SEAT);
      const cues = cuesFor(events, before, viewFor(state, SEAT));
      assert.equal(cues.length, events.filter((e) => Object.hasOwn(CUES, e.type)).length);
      for (const cue of cues) {
        const event = events[cue.index];
        met.add(cue.variant ? `${cue.kind}:${cue.variant}` : cue.kind);
        assert.equal(cue.kind, event.type);
        assert.equal(cue.text, presentEvent(event));
        assert.doesNotMatch(JSON.stringify({...cue, text: ""}), CARD_ID, `${cue.kind} carries a card id`);
        for (const mark of cue.marks) {
          if (mark.at === "row" && cue.kind !== "sweep") rows += 1;
          if (mark.slot === undefined) continue;
          marks += 1;
          const id = event.type === "trap" || event.type === "gear" || (event.type === "laststand" && mark.side !== event.side) ? event.target : event.cardId;
          const [pre, post] = states[cue.index];
          assert.ok([pre, post].some((s) => s.sides[mark.side].board[mark.slot]?.cardId === id),
            `seed ${seed}: ${cue.kind} mark ${JSON.stringify(mark)} is not where ${id} stood`);
        }
      }
    }
  }
  for (const kind of ["cover", "trap:cancelled", "trap:through", "trap:defeated", "gear", "location", "raise", "sweep", "laststand:defeated", "laststand:wounded", "set", "burn", "fatigue"]) {
    assert.ok(met.has(kind), `random play never met ${kind}; met ${[...met].sort().join(", ")}`);
  }
  // A troop that cannot be placed falls back to its row: allowed, but it must stay rare.
  assert.ok(rows <= marks / 100, `${rows} row fallbacks for ${marks} slot marks`);
});

// A stand-in for the screen's root: it has no nodes, so the player's own state is what is checked.
const emptyRoot = {querySelector: () => null, querySelectorAll: () => []};
function fakeTimers() {
  let now = 0, id = 0;
  const due = new Map();
  return {
    setTimeout: (fn, ms) => { due.set(++id, {at: now + ms, fn}); return id; },
    clearTimeout: (key) => due.delete(key),
    advance(ms) {
      now += ms;
      for (const [key, entry] of [...due].sort((a, b) => a[1].at - b[1].at)) if (entry.at <= now) { due.delete(key); entry.fn(); }
    },
    pending: () => due.size,
  };
}
const fakeCue = (kind, line) => ({kind, label: CUES[kind], variant: null, side: "cowboy", index: line, line, marks: [], text: kind});

test("a batch plays one cue a step; a newer batch or a restart cancels the older one's timers", () => {
  const timers = fakeTimers();
  const player = createCuePlayer(emptyRoot, {step: 700, reducedMotion: () => false, timers});
  player.play([fakeCue("set", 0), fakeCue("burn", 1), fakeCue("fatigue", 2)]);
  assert.deepEqual(player.shown.map((c) => c.kind), ["set"]);
  timers.advance(700);
  assert.deepEqual(player.shown.map((c) => c.kind), ["burn"]);
  // A rapid second batch replaces the first at once; the first batch's next step never paints.
  player.play([fakeCue("cover", 3)]);
  assert.deepEqual(player.shown.map((c) => c.kind), ["cover"]);
  assert.equal(timers.pending(), 1);
  timers.advance(700);
  assert.deepEqual(player.shown, []);
  assert.equal(timers.pending(), 0);
  player.play([fakeCue("trap", 4), fakeCue("raise", 5)]);
  player.clear();
  assert.equal(timers.pending(), 0);
  timers.advance(5000);
  assert.deepEqual(player.shown, []);
});

test("with reduced motion the whole batch shows at once, still, and no timer runs", () => {
  const timers = fakeTimers();
  const player = createCuePlayer(emptyRoot, {reducedMotion: () => true, timers});
  player.play([fakeCue("trap", 0), fakeCue("laststand", 1), fakeCue("sweep", 2)]);
  assert.deepEqual(player.shown.map((c) => c.kind), ["trap", "laststand", "sweep"]);
  assert.equal(timers.pending(), 0);
});
