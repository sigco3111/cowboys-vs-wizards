// The whole Trail, played. progress.test.js settles Trail wins without playing them, and
// campaign-browser-check.mjs plays only Boot Hill in Chrome; this plays all six approved duels from
// newSave() with the same Node mirror and move picker the browser check uses (campaign-driver.mjs),
// takes each reward and offer, round-trips the save after every duel, and ends at the first rival.
// A bot is playing. This is not a human playtest.
import test from "node:test";
import assert from "node:assert/strict";
import {choose, duelFor, duelList, migrate, newSave, owned, settle, trailDone} from "./progress.js";
import {decodeSaveCode, encodeSave, sameSave} from "./savecode.js";
import {TRAIL, deckAfter} from "./trail.js";
import {mirrorDuel, pickMove} from "./campaign-driver.mjs";

// One seed per duel. Seed 0 is a win for the picker on every Trail duel along this route (Node survey,
// seeds 0-5: duel 4 lost on seeds 1-2, duel 6 lost on seeds 2 and 5). A rules or picker change that
// loses one fails here, so choose a new seed only after checking the loss is intended.
const SEEDS = [0, 0, 0, 0, 0, 0];
const MAX_ACTIONS = 400;
const APPROVED = ["부트 힐", "까마귀 둥지", "뼈 울타리", "임프 골짜기", "저주받은 길", "용의 둥지"];

function play(save, seed) {
  const mirror = mirrorDuel(save, "trail", seed);
  let actions = 0;
  while (!mirror.state.result && actions++ < MAX_ACTIONS) mirror.act(pickMove(mirror.state));
  return {duel: mirror.duel, winner: mirror.state.result?.winner ?? null, actions, turns: mirror.state.turn};
}

// What a reload or a pasted save code gives back must be exactly the save.
function roundTrip(save, where) {
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(save))), save, `${where}: localStorage reload changed the save`);
  const code = decodeSaveCode(encodeSave(save));
  assert.ok(code.ok && !code.legacy && sameSave(code.save, save), `${where}: save code round trip failed: ${code.reason}`);
}

function route() {
  let save = newSave();
  const log = [];
  roundTrip(save, "new save");
  TRAIL.forEach((step, i) => {
    const where = `Trail ${i + 1}. ${step.name}`;
    const states = duelList(save).filter((d) => d.kind === "trail").map((d) => d.state);
    assert.deepEqual(states, TRAIL.map((_, j) => (j < i ? "won" : j === i ? "open" : "locked")), `${where}: Camp states`);
    assert.ok(duelList(save).filter((d) => d.kind !== "trail").every((d) => d.state === "locked"), `${where}: only the Trail is open`);

    const result = play(save, SEEDS[i]);
    assert.equal(result.duel.name, step.name, where);
    assert.equal(result.duel.battlefield, step.id, `${where}: battlefield follows the Trail stage`);
    assert.deepEqual(result.duel.options.decks.cowboy, deckAfter(i), `${where}: played with the deck the Trail has built`);
    assert.equal(result.winner, "cowboy", `${where}: lost on seed ${SEEDS[i]} after ${result.actions} actions`);

    const before = save;
    const {save: won, earned} = settle(save, "trail", true);
    assert.deepEqual(earned.cards, step.reward.map(([type, , copies]) => [type, copies]), `${where}: reward`);
    assert.equal(earned.packs, i === TRAIL.length - 1 ? 1 : 0, `${where}: packs`);
    for (const [type, , copies] of step.reward) assert.equal(owned(won, type), owned(before, type) + copies, `${where}: ${type} owned`);
    assert.deepEqual(won.deck, deckAfter(i + 1), `${where}: earned cards swapped into the deck`);
    assert.equal(won.wins, i + 1);
    roundTrip(won, `${where}, offer pending`);

    // Take the first offer, as the browser check does. Before the Trail ends it holds only met cards.
    assert.equal(won.offer?.length, 2, `${where}: a win offers two cards`);
    if (i < TRAIL.length - 1) assert.ok(won.offer.every((type) => owned(before, type) > 0 || step.reward.some(([t]) => t === type)), `${where}: offer holds an unmet card`);
    save = choose(won, won.offer[0]);
    assert.equal(owned(save, won.offer[0]), owned(won, won.offer[0]) + 1);
    assert.deepEqual(save.deck, won.deck, `${where}: taking an offer leaves the deck alone`);
    roundTrip(save, `${where}, offer taken`);
    // The reloaded save deals the next duel the same way.
    if (i < TRAIL.length - 1) assert.deepEqual(mirrorDuel(migrate(JSON.parse(JSON.stringify(save))), "trail", SEEDS[i + 1]).state, mirrorDuel(save, "trail", SEEDS[i + 1]).state, `${where}: next deal after reload`);
    log.push({duel: step.name, seed: SEEDS[i], actions: result.actions, turns: result.turns, offer: won.offer, took: won.offer[0]});
  });
  return {save, log};
}

test("the approved Trail is these six duels", () => {
  assert.deepEqual(TRAIL.map((duel) => duel.name), APPROVED);
});

test("newSave to the first rival: all six Trail duels played to a win, rewards taken, the save round-trips after each", (t) => {
  const {save, log} = route();
  t.diagnostic(JSON.stringify(log));
  assert.ok(trailDone(save));
  assert.equal(save.packs, 1, "the Trail's end pays one pack");
  assert.equal(duelFor(save, "trail"), null, "no Trail duel left");
  const states = Object.fromEntries(duelList(save).filter((d) => d.kind !== "trail").map((d) => [d.id, d.state]));
  assert.deepEqual(states, {"rival:stargazer": "open", "rival:imp": "locked", "rival:bonewright": "locked", "rival:coven": "locked",
    "hunt:lantern-wraith": "open", "hunt:graveyard-dragon": "open", open: "open"});
  const reloaded = migrate(JSON.parse(JSON.stringify(save)));
  assert.equal(duelFor(reloaded, "rival:stargazer").name, "별 관측자", "the first rival is playable after a reload");
  assert.equal(duelFor(reloaded, "rival:imp"), null);
  assert.deepEqual(mirrorDuel(reloaded, "rival:stargazer", 1).state, mirrorDuel(save, "rival:stargazer", 1).state, "the first rival deals the same after a reload");
});

test("the played Trail route is deterministic", () => {
  assert.deepEqual(route(), route());
});
