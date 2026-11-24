// Seeded referee corpus and the production-engine replay adapter (scripts/referee/).
import assert from "node:assert/strict";
import test from "node:test";
import {createShowdown, legalActions} from "../../src/game/showdown/rules.js";
import {cardOf, tributes} from "../../src/game/showdown/cards.js";
import {ACTION_TYPES, applyInput, canonicalAction, checkDealAgreement, decodeInstance, initialState, normalize,
  replayDuel, seededDeal, validateDuel} from "../../scripts/referee/engine.mjs";
import {DECK_LISTS, PROBE_KINDS, VARIANTS, generate, newStats, reservoir, summarize} from "../../scripts/referee/corpus.mjs";

const SAMPLER = {sampler: 1};
const duelFor = (seed, variant = "even") => ({...seededDeal(seed, DECK_LISTS[variant]), actions: []});

test("instance IDs decode by catalog type and numeric copy suffix", () => {
  assert.deepEqual(decodeInstance("cowboy-sheriff-2"),
    {id: "cowboy-sheriff-2", type: "cowboy-sheriff", copy: 2, side: "cowboy", name: "Sheriff", kind: "troop"});
  assert.equal(decodeInstance("wizard-jack-o-lantern-1").name, "Jack-o'-Lantern");
  for (const bad of ["cowboy-sheriff", "Cowboy-Sheriff-1", "cowboy-sheriff-01", "cowboy-nobody-1", 7, null]) {
    assert.throws(() => decodeInstance(bad), undefined, String(bad));
  }
});

test("duel inputs are checked at the boundary", () => {
  const duel = duelFor(3);
  const named = {...duel, cardNames: {"cowboy-sheriff": "Sheriff"}};
  assert.equal(validateDuel(named), named);
  assert.throws(() => validateDuel({...duel, cardNames: {"cowboy-sheriff": "Marshal"}}), /catalog prints "Sheriff"/);
  assert.throws(() => validateDuel({...duel, state: {}}), /unexpected duel field state/);
  assert.throws(() => validateDuel({...duel, seed: 2 ** 32}), /uint32/);
  assert.throws(() => validateDuel({...duel, decks: {...duel.decks, cowboy: [...duel.decks.cowboy, duel.decks.wizard[0]]}}), /wizard card in the cowboy deck/);
  assert.throws(() => validateDuel({...duel, decks: {...duel.decks, cowboy: [...duel.decks.cowboy, duel.decks.cowboy[0]]}}), /appears twice/);
});

test("ordered starting decks agree with the real seeded deal", () => {
  for (const variant of VARIANTS) {
    for (let seed = 0; seed < 40; seed++) {
      const duel = duelFor(seed, variant);
      assert.deepEqual(initialState(duel), createShowdown(seed, {decks: DECK_LISTS[variant]}), `${variant} seed ${seed}`);
      assert.deepEqual(checkDealAgreement(duel, DECK_LISTS[variant]), {agrees: true, mismatches: []});
    }
  }
});

test("a reordered deck or the wrong starting side fails the deal check", () => {
  const duel = duelFor(11);
  const cowboy = [...duel.decks.cowboy];
  const j = cowboy.findIndex((id) => cardOf(id).name !== cardOf(cowboy[0]).name);
  [cowboy[0], cowboy[j]] = [cowboy[j], cowboy[0]];
  const swapped = checkDealAgreement({...duel, decks: {...duel.decks, cowboy}});
  assert.equal(swapped.agrees, false);
  assert.ok(swapped.mismatches.some((zone) => zone.startsWith("cowboy.")));
  const flipped = checkDealAgreement({...duel, first: duel.first === "cowboy" ? "wizard" : "cowboy"});
  assert.equal(flipped.agrees, false);
  assert.ok(flipped.mismatches.includes("first"));
});

test("canonicalAction keeps the contract shape and rebuilds the engine's key order", () => {
  assert.deepEqual(canonicalAction({tributes: [2, 0], cardId: "wizard-dragon-1", type: "summon"}).action,
    {type: "summon", cardId: "wizard-dragon-1", tributes: [0, 2]});
  assert.deepEqual(canonicalAction({target: "base", slot: 1, type: "attack"}).action, {type: "attack", slot: 1, target: "base"});
  assert.deepEqual(canonicalAction({type: "spell", cardId: "wizard-hellfire-1"}).action, {type: "spell", cardId: "wizard-hellfire-1"});
  for (const bad of [null, [], {type: "fly"}, {type: "end", slot: 0}, {type: "attack", slot: 0}, {type: "attack", slot: 1.5, target: 0},
    {type: "spell", cardId: "cowboy-deadeye-1", target: "base"}, {type: "summon", cardId: "cowboy-sheriff-1"}, {type: "gear", cardId: 4, slot: 0}]) {
    assert.match(canonicalAction(bad).error, /^malformed/, JSON.stringify(bad));
  }
});

test("a rejected input leaves the state unchanged; key order does not change an accepted one", () => {
  let found = null;
  for (let seed = 0; seed < 200 && !found; seed++) {
    const state = initialState(duelFor(seed));
    const summon = legalActions(state).find((action) => action.type === "summon" && action.tributes.length === 0);
    if (summon) found = {state, summon};
  }
  assert.ok(found, "a seed with a free opening summon");
  const {state, summon} = found;
  const before = normalize(state);
  const own = state.sides[state.active];
  for (const input of [{type: "attack", slot: 0, target: "base"}, {type: "cover", slot: 2}, {type: "set", cardId: own.deck[0]},
    {type: "summon", cardId: summon.cardId, tributes: [1]}, {type: "end", now: true}, "end"]) {
    const result = applyInput(state, input);
    assert.equal(result.accepted, false, JSON.stringify(input));
    assert.equal(result.state, state);
    assert.deepEqual(normalize(result.state), before);
  }
  const reordered = applyInput(state, {tributes: [], cardId: summon.cardId, type: "summon"});
  assert.equal(reordered.accepted, true);
  assert.equal(normalize(reordered.state).sides[state.active].troops.filter(Boolean).length, 1);
  const cover = applyInput(reordered.state, {slot: 0, type: "cover"});
  assert.equal(cover.accepted, true);
  assert.equal(normalize(cover.state).allowances.cards, false);
});

test("characterization: the production engine plays only the first copy of a card name in hand", () => {
  for (let seed = 0; seed < 1000; seed++) {
    const state = initialState(duelFor(seed));
    const hand = state.sides[state.active].hand.filter((id) => cardOf(id).kind === "troop" && tributes(id) === 0);
    const name = hand.map((id) => cardOf(id).name).find((each, i, names) => names.indexOf(each) !== i);
    if (!name) continue;
    const [first, later] = hand.filter((id) => cardOf(id).name === name);
    assert.equal(applyInput(state, {type: "summon", cardId: later, tributes: []}).accepted, false);
    assert.equal(applyInput(state, {type: "summon", cardId: first, tributes: []}).accepted, true);
    return;
  }
  assert.fail("no opening hand held two copies of a free troop");
});

test("normalize reports every tracked field in fixed slots", () => {
  const state = normalize(initialState(duelFor(5)));
  assert.deepEqual(Object.keys(state), ["turn", "active", "first", "allowances", "location", "result", "sides"]);
  assert.deepEqual(state.allowances, {summon: true, cast: true, set: true, cards: true});
  for (const side of ["cowboy", "wizard"]) {
    assert.deepEqual(Object.keys(state.sides[side]), ["base", "baseMax", "hand", "deck", "discard", "troops", "traps"]);
    assert.deepEqual(state.sides[side].troops, [null, null, null]);
    assert.deepEqual(state.sides[side].traps, [null, null]);
  }
  assert.equal(state.sides[state.first].hand.length, 4);
  assert.equal(state.sides[state.first === "cowboy" ? "wizard" : "cowboy"].hand.length, 5);
});

test("a sampler corpus is complete, distinct, inputs-only, and covers every action type", () => {
  const stats = newStats();
  const freshSeeds = [4_000_000_001, 100, 4_000_000_002, 4_000_000_003, 4_000_000_004, 4_000_000_005];
  const records = [...generate({count: 45, seedStart: 100, fresh: 5, freshSeeds, probeRate: 0.3, policies: SAMPLER}, stats)];
  assert.equal(records.length, 45);
  assert.equal(stats.duels.fixed, 40);
  assert.equal(stats.duels.fresh, 5);
  assert.ok(stats.duels.duplicateSeedsSkipped >= 1, "fresh seed 100 repeats a fixed seed");
  assert.equal(new Set(records.map((record) => record.duel.seed)).size, 45);
  assert.equal(new Set(records.map((record) => JSON.stringify([record.duel.first, record.duel.decks]))).size, 45);
  assert.equal(stats.duels.dealAgreement.agreed, 45);

  const allowed = new Set(["type", "cardId", "tributes", "target", "slot"]);
  for (const record of records) {
    assert.deepEqual(Object.keys(record), ["id", "origin", "duel"]);
    assert.deepEqual(Object.keys(record.duel).sort(), ["actions", "cardNames", "decks", "first", "seed"]);
    for (const action of record.duel.actions) for (const key of Object.keys(action)) assert.ok(allowed.has(key), key);
    const replay = replayDuel(record.duel);
    assert.equal(replay.terminal, true, record.id);
    assert.equal(replay.steps.at(-1).accepted, true, `${record.id} ends on a real move`);
    // Unchanged state on every rejection.
    replay.steps.forEach((step, i) => {
      if (!step.accepted) assert.deepEqual(step.state, i ? replay.steps[i - 1].state : replay.initial, `${record.id} step ${i}`);
    });
  }

  const summary = summarize(stats);
  assert.deepEqual(summary.coverage.actionTypesNeverAccepted, []);
  assert.equal(stats.moves.attempted, stats.moves.accepted + stats.moves.rejected);
  assert.ok(stats.moves.rejected > 0);
  const sent = Object.values(stats.probes.sent).reduce((sum, n) => sum + n, 0);
  assert.equal(sent, stats.moves.rejected);
  assert.deepEqual(Object.keys(stats.probes.sent), PROBE_KINDS);
  assert.equal(stats.duels.terminal, 45);
  assert.equal(stats.outcomes.winner.cowboy + stats.outcomes.winner.wizard + stats.outcomes.winner.draw, 45);
  for (const type of ACTION_TYPES) assert.ok(stats.accepted[type] > 0, type);
});

test("the production CPU levels drive legal, complete duels", () => {
  const stats = newStats();
  const records = [...generate({count: 4, seedStart: 900, policies: {bot0: 1, bot1: 1, "bot1.5": 1, bot2: 1}}, stats)];
  assert.equal(records.length, 4);
  assert.equal(stats.duels.terminal, 4);
  assert.ok(Object.keys(stats.policies).every((key) => /^(cowboy|wizard):bot/.test(key)));
});

test("generation draws more seeds until enough moves were attempted", () => {
  const base = newStats();
  [...generate({count: 3, seedStart: 500, policies: SAMPLER}, base)];
  const more = newStats();
  const records = [...generate({count: 3, minMoves: base.moves.attempted + 1, seedStart: 500, policies: SAMPLER}, more)];
  assert.ok(records.length > 3);
  assert.ok(more.moves.attempted > base.moves.attempted);
  assert.deepEqual(records.slice(0, 3).map((record) => record.duel), [...generate({count: 3, seedStart: 500, policies: SAMPLER})].map((record) => record.duel));
});

test("the parity reservoir keeps exactly the requested number, the same way each time", () => {
  const pick = () => {
    const sample = reservoir(250, 7);
    for (let i = 0; i < 2600; i++) sample.offer(i);
    return sample.items;
  };
  const items = pick();
  assert.equal(items.length, 250);
  assert.equal(new Set(items).size, 250);
  assert.deepEqual(items, pick());
  assert.deepEqual(items, [...items].sort((a, b) => a - b));
});
