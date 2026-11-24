// Issue 143 slice 1: the graybox Showdown session gives the screen only the seat's view, the
// seat's legal actions and presentable events.
import assert from "node:assert/strict";
import test from "node:test";
import {EVENTS} from "../../src/game/showdown/contract.js";
import {PRESENTERS, presentEvent} from "../../src/game/showdown/presenter.js";
import {bootHill, createShowdownSession} from "../../src/match/showdown-session.js";

test("the screen's presenter is the canonical one: a handler for every EVENTS entry, throws on anything else", () => {
  assert.deepEqual(Object.keys(PRESENTERS).sort(), Object.keys(EVENTS).sort());
  assert.throws(() => presentEvent({type: "not-an-event"}), /Unknown Showdown event type/);
});

test("Boot Hill is Trail duel 1 for a new player: starter deck, Cowboys open, Wizard Base 3", () => {
  const duel = bootHill();
  assert.equal(duel.name, "부트 힐");
  assert.deepEqual(duel.options.decks.cowboy, {"cowboy-sheriff": 8, "cowboy-billy": 5, "cowboy-deadeye": 3});
  assert.deepEqual(duel.options.baseOrbs, {cowboy: 5, wizard: 3});
  assert.equal(duel.options.first, "cowboy");
});

// Plays every seed with the first non-end legal action (attacks preferred) and checks each view.
test("over played Boot Hill duels the view never lists a Wizard hand, trap or deck card, and only legal actions apply", () => {
  let wins = 0;
  for (let seed = 0; seed < 40; seed += 1) {
    const session = createShowdownSession({seed, duel: bootHill()});
    for (let step = 0; step < 400 && !session.view().result; step += 1) {
      const view = session.view();
      assert.equal(view.viewer, "cowboy");
      assert.equal(view.seed, undefined);
      const wizard = view.sides.wizard;
      for (const hidden of ["hand", "traps", "deck"]) assert.equal(wizard[hidden], undefined);
      assert.equal(view.sides.cowboy.deck, undefined);
      assert.equal(typeof wizard.handCount, "number");
      const visibleIds = JSON.stringify(view).match(/wizard-[a-z-]+-\d+/g) ?? [];
      const publicIds = new Set([...wizard.discard, ...wizard.board.filter(Boolean).flatMap((t) => [t.cardId, ...t.gear]), view.location?.cardId].filter(Boolean));
      for (const id of visibleIds) assert.ok(publicIds.has(id), `seed ${seed}: ${id} is not public`);
      const legal = session.legal();
      assert.ok(legal.length > 0, "the seat always has an action on its own turn");
      const events = session.act(legal.find((a) => a.type === "attack") ?? legal.find((a) => a.type !== "end" && a.type !== "cover") ?? legal.find((a) => a.type === "end"));
      for (const event of events) assert.equal(typeof presentEvent(event), "string");
    }
    const result = session.view().result;
    assert.ok(result, `seed ${seed} finished`);
    if (result.winner === "cowboy") wins += 1;
    assert.deepEqual(session.legal(), []);
    assert.throws(() => session.act({type: "end"}), /not this seat's turn/);
  }
  assert.ok(wins >= 36, `a simple attacker wins most Boot Hill deals (${wins} of 40)`);
});

test("an action outside the seat's legal list is refused", () => {
  const session = createShowdownSession({seed: 1, duel: bootHill()});
  assert.throws(() => session.act({type: "attack", slot: 0, target: "base"}), /illegal action/);
});
