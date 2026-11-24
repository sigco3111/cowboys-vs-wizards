// Bear Trap (snare) and Hex log lines, read from trap events that legal play actually produces.
// Each case replays a seeded deal with the level-2 bot (playTurn applies every step through
// applyAction, which rejects illegal actions) until the first trap event that matches.
import test from "node:test";
import assert from "node:assert/strict";
import {presentEvent} from "../../src/game/showdown/presenter.js";
import {createShowdown, playTurn} from "../../src/game/showdown/rules.js";

function firstTrap(seed, match) {
  let state = createShowdown(seed);
  for (let turns = 0; !state.result && turns < 200; turns++) {
    const before = state;
    const played = playTurn(state, 2);
    state = played.state;
    const at = played.events.findIndex((event) => event.type === "trap" && match(event));
    if (at >= 0) return {before, after: state, events: played.events, at, event: played.events[at]};
  }
  throw new Error(`seed ${seed}: no matching trap event`);
}

const bearTrap = (event) => event.cardId.startsWith("cowboy-bear-trap");
const hex = (event) => event.cardId.startsWith("wizard-hex");

test("a Bear Trap that defeats the attacker reads 'defeated before it struck' (seed 18)", () => {
  const {before, after, events, at, event} = firstTrap(18, (e) => bearTrap(e) && e.left === 0);
  assert.equal(before.sides.cowboy.traps.includes(event.cardId), true, "the Bear Trap was set face down");
  assert.deepEqual({target: event.target, left: event.left, stopped: event.stopped}, {target: "wizard-imp-1", left: 0, stopped: true});
  assert.equal(after.sides.wizard.board.some((troop) => troop?.cardId === event.target), false, "the attacker left the board");
  assert.equal(after.sides.wizard.discard.includes(event.target), true, "the attacker went to the graveyard");
  assert.notEqual(events[at + 1]?.type, "attack", "no attack landed after the trap");
  assert.equal(presentEvent(event), "함정! 카우보이 곰 덫 → 임프: 공격 전에 쓰러짐.");
});

test("a Bear Trap that leaves the attacker standing reads 'attacked anyway' (seed 15)", () => {
  const {events, at, event} = firstTrap(15, (e) => bearTrap(e) && e.left > 0);
  assert.equal(event.stopped, false);
  assert.equal(events[at + 1]?.type, "attack");
  assert.match(presentEvent(event), new RegExp(`오브 ${event.left}개로 줄었지만 그래도 공격함\\.$`));
});

test("Hex still reads 'its attack was cancelled' (seed 14)", () => {
  const {event} = firstTrap(14, hex);
  assert.ok(event.left > 0 && event.stopped);
  assert.match(presentEvent(event), /: 공격이 취소됨\.$/);
});
