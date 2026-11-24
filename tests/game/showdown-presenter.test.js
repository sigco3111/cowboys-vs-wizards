import test from "node:test";
import assert from "node:assert/strict";
import {EVENTS} from "../../src/game/showdown/contract.js";
import {PRESENTERS, presentEvent} from "../../src/game/showdown/presenter.js";
import {createShowdown, playTurn} from "../../src/game/showdown/rules.js";

test("the presenter has a handler for every EVENTS entry and nothing else", () => {
  assert.deepEqual(Object.keys(PRESENTERS).sort(), Object.keys(EVENTS).sort());
});

test("a missing handler for any EVENTS entry makes presentEvent throw", () => {
  for (const type of Object.keys(EVENTS)) {
    const {[type]: _dropped, ...rest} = PRESENTERS;
    assert.throws(() => presentEvent({type}, rest), new RegExp(`No presenter for Showdown event type: ${type}`));
  }
});

test("an event type outside EVENTS throws", () => {
  assert.throws(() => presentEvent({type: "teleport", side: "cowboy"}), /Unknown Showdown event type: teleport/);
  assert.throws(() => presentEvent({}), /Unknown Showdown event type/);
  assert.throws(() => presentEvent({type: "toString"}), /Unknown Showdown event type/);
});

test("every event from seeded bot games presents as visible text", () => {
  const met = new Set();
  for (let seed = 0; seed < 40; seed++) {
    let state = createShowdown(seed);
    for (let turns = 0; !state.result && turns < 200; turns++) {
      const played = playTurn(state, seed % 3);
      state = played.state;
      for (const event of played.events) {
        const text = presentEvent(event);
        assert.equal(typeof text, "string");
        assert.ok(text.trim().length > 0, `${event.type} gave empty text`);
        assert.doesNotMatch(text, /undefined|NaN|\[object/, `${event.type}: ${text}`);
        met.add(event.type);
      }
    }
  }
  assert.ok(met.size >= 8, `seeded games met only ${[...met].join(", ")}`);
});

test("hand-built events of each type read with card and side names", () => {
  const samples = {
    turn: {side: "cowboy", turn: 3},
    draw: {side: "wizard"},
    burn: {side: "cowboy", cardId: firstTroop("cowboy")},
    fatigue: {side: "wizard"},
    tribute: {side: "cowboy", cardId: firstTroop("cowboy")},
    summon: {side: "wizard", cardId: firstTroop("wizard")},
    raise: {side: "wizard", cardId: firstTroop("wizard")},
    spell: {side: "wizard", cardId: firstTroop("wizard"), target: firstTroop("cowboy"), left: 0, stunned: false},
    gear: {side: "cowboy", cardId: firstTroop("cowboy"), target: firstTroop("cowboy")},
    location: {side: "cowboy", cardId: firstTroop("cowboy")},
    set: {side: "wizard"},
    cover: {side: "cowboy", cardId: firstTroop("cowboy")},
    trap: {side: "wizard", cardId: firstTroop("wizard"), target: firstTroop("cowboy"), left: 2, stopped: true},
    attack: {side: "cowboy", cardId: firstTroop("cowboy"), target: "base", covered: false, hitBack: 0, baseDamage: 2, targetLeft: null, attackerLeft: 3},
    laststand: {side: "wizard", cardId: firstTroop("wizard"), target: firstTroop("cowboy"), left: 0},
    sweep: {side: "cowboy", cardId: firstTroop("cowboy"), count: 2},
  };
  assert.deepEqual(Object.keys(samples).sort(), Object.keys(EVENTS).sort());
  for (const [type, fields] of Object.entries(samples)) {
    assert.deepEqual(Object.keys(fields).sort(), [...EVENTS[type].fields].sort(), type);
    const text = presentEvent({type, ...fields});
    assert.doesNotMatch(text, /undefined|NaN|\[object/, `${type}: ${text}`);
  }
  assert.match(presentEvent({type: "turn", ...samples.turn}), /3턴: 카우보이 차례/);
  assert.match(presentEvent({type: "attack", ...samples.attack}), /마법사 기지 공격: 오브 2개 피해/);
  assert.match(presentEvent({type: "trap", ...samples.trap}), /공격이 취소됨/);
});

// Any real card id from that side's opening hand; the presenter only reads its name.
function firstTroop(side) {
  return createShowdown(1).sides[side].hand[0];
}
