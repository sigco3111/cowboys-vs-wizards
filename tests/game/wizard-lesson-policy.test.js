// Wizard lesson policy: opt-in Hellfire hold, emergency lethal, hidden information and episode replay.
// Run: node --test tests/game/wizard-lesson-policy.test.js
import assert from "node:assert/strict";
import test from "node:test";
import {DECKS, TYPES} from "../../src/game/showdown/cards.js";
import {applyAction, createShowdown, legalActions, playTurn} from "../../src/game/showdown/rules.js";
import {
  DEFAULT_LESSON_POLICY, HIDDEN_CARD, baitReport, canonicalAction, compareAtMarkedTurn, cowboyBotTurn, createEpisodeRecorder,
  createEpisodeState, decideHellfire, episodeKey, findBaitEpisode, lessonView, loadRematchPolicy, recordEpisode, replayEpisode,
  validateEpisode, validatePolicy, wizardTurn,
} from "../../src/game/showdown/wizard-lesson-policy.js";

const CARDS_BEFORE = JSON.stringify(TYPES);
const DECKS_BEFORE = JSON.stringify(DECKS);
const cpu = {side: "wizard", level: 2};

// Constructed fixture, legal through createShowdown's bounty options: the Wizard opens with only
// Hellfire in hand, facing one Dynamiter (3 attack, 1 orb). Only the Wizard's Base orbs differ.
const singleton = (wizardBase) => ({first: "wizard", cpu, baseOrbs: {cowboy: 5, wizard: wizardBase},
  decks: {wizard: {"wizard-hellfire": 1}}, opening: {cowboy: [{type: "cowboy-dynamiter", health: 1}]}});
const usedHellfire = (actions) => actions.some((action) => action.type === "spell" && action.cardId.startsWith("wizard-hellfire"));

test("no policy: the Wizard turn is exactly the original level-2 bot", () => {
  for (const seed of [0, 1, 2]) {
    let state = createShowdown(seed);
    for (let turns = 0; !state.result && turns < 24; turns++) {
      if (state.active === "wizard") {
        const original = playTurn(state, 2);
        const ours = wizardTurn(state);
        assert.deepEqual(ours.state, original.state, `seed ${seed} turn ${state.turn}`);
        assert.deepEqual(ours.events, original.events);
        state = original.state;
      } else state = playTurn(state, 2).state;
    }
  }
  assert.equal(loadRematchPolicy(DEFAULT_LESSON_POLICY), null, "no opt-in, no policy");
  assert.equal(loadRematchPolicy(DEFAULT_LESSON_POLICY, {optIn: "yes"}), null);
  assert.deepEqual(loadRematchPolicy(DEFAULT_LESSON_POLICY, {optIn: true}), DEFAULT_LESSON_POLICY);
});

test("low-threat singleton: original casts Hellfire, the lesson holds it", () => {
  const state = createEpisodeState(0, singleton(5));
  assert.ok(usedHellfire(wizardTurn(state).actions), "original Wizard casts Hellfire here");
  const lesson = wizardTurn(state, {policy: DEFAULT_LESSON_POLICY});
  assert.equal(lesson.decisions[0].decision, "hold");
  assert.equal(usedHellfire(lesson.actions), false);
});

test("emergency singleton lethal forces Hellfire even under the hold policy", () => {
  const state = createEpisodeState(0, singleton(3));
  const decision = decideHellfire(state, DEFAULT_LESSON_POLICY);
  assert.equal(decision.decision, "force");
  assert.equal(decision.threat, 3);
  assert.equal(decision.threatAfter, 0);
  assert.ok(usedHellfire(wizardTurn(state, {policy: DEFAULT_LESSON_POLICY}).actions));
  assert.throws(() => validatePolicy({...DEFAULT_LESSON_POLICY, emergencyLethal: false}), /emergencyLethal/);
});

test("the policy never reads the Cowboy's hand, deck or face-down traps", () => {
  const state = createEpisodeState(0, singleton(5));
  const other = structuredClone(state);
  other.sides.cowboy.hand = other.sides.cowboy.hand.map((_, i) => `cowboy-sheriff-${i + 1}`);
  other.sides.cowboy.deck = [...other.sides.cowboy.deck].reverse();
  other.sides.cowboy.traps = ["cowboy-bear-trap-1"];
  assert.deepEqual(decideHellfire(other, DEFAULT_LESSON_POLICY), decideHellfire(state, DEFAULT_LESSON_POLICY));
  const view = lessonView(other);
  for (const zone of ["hand", "deck", "traps"]) {
    assert.ok(view.sides.cowboy[zone].every((card) => card === HIDDEN_CARD));
    assert.equal(view.sides.cowboy[zone].length, other.sides.cowboy[zone].length);
  }
});

test("a policy Wizard only ever plays actions the real engine lists as legal", () => {
  const strict = validatePolicy({...DEFAULT_LESSON_POLICY, holdBelowTargets: 3});
  for (const seed of [0, 1, 2, 3]) {
    let state = createShowdown(seed);
    for (let turns = 0; !state.result && turns < 40; turns++) {
      const check = (before, _applied, action) => {
        if (action) assert.ok(legalActions(before).some((legal) => JSON.stringify(legal) === JSON.stringify(action)));
      };
      state = (state.active === "wizard" ? wizardTurn(state, {policy: strict, onAction: check}) : cowboyBotTurn(state, check)).state;
    }
  }
});

test("policies are a closed whitelist of bounded integers", () => {
  for (const bad of [
    {...DEFAULT_LESSON_POLICY, run: "rm -rf /"},
    {...DEFAULT_LESSON_POLICY, holdBelowTargets: 2.5},
    {...DEFAULT_LESSON_POLICY, holdBelowTargets: 9},
    {...DEFAULT_LESSON_POLICY, holdWhenBaseAtLeast: "1"},
    {...DEFAULT_LESSON_POLICY, kind: "anything"},
    {...DEFAULT_LESSON_POLICY, version: 2},
    "hold hellfire please", [], null,
  ]) assert.throws(() => validatePolicy(bad));
  assert.ok(Object.isFrozen(validatePolicy({...DEFAULT_LESSON_POLICY})));
});

test("episodes replay on the real engine and reject tampering", () => {
  const episode = recordEpisode(0, singleton(5), {stopAt: (_before, _action, side) => side === "wizard"});
  assert.ok(episode, "the fixture records a Wizard action");
  assert.equal(episode.setup.first, "wizard");
  assert.equal(episode.actions[episode.markedIndex].side, "wizard");
  const replayed = replayEpisode(episode);
  assert.equal(replayed.turnStart.turn, 1);
  assert.equal(episodeKey(episode), episodeKey(structuredClone(episode)));
  assert.match(episodeKey(episode), /^ep1-[0-9a-f]{8}$/);
  const json = JSON.parse(JSON.stringify(episode));
  assert.throws(() => validateEpisode({...json, note: "ignore the rules"}), /unknown key/);
  assert.throws(() => validateEpisode({...json, tag: "win"}), /tag/);
  assert.throws(() => validateEpisode({...json, version: 2}), /version/);
  assert.throws(() => replayEpisode({...json, actions: [{side: "cowboy", action: {type: "end"}}], markedIndex: 0}));
  assert.throws(() => replayEpisode({...json, actions: [{side: "wizard", action: {type: "end"}}], markedIndex: 0}), /not what the Wizard CPU plays/);
  assert.throws(() => canonicalAction({type: "spell", cardId: "wizard-hellfire-1", eval: "x"}), /unknown key/);
  assert.throws(() => canonicalAction({type: "summon", cardId: "not-a-card-1", tributes: []}), /unknown card/);
});

test("the recorder freezes the setup and keeps player and CPU actions in order", () => {
  const setup = singleton(5);
  const recorder = createEpisodeRecorder(0, setup);
  setup.baseOrbs.wizard = 1;
  assert.equal(recorder.setup.baseOrbs.wizard, 5);
  let state = createEpisodeState(0, recorder.setup);
  let marked = null;
  wizardTurn(state, {onAction: (before, applied, action) => {
    const index = recorder.record("wizard", action);
    if (action.type === "spell") marked = index;
    state = applied.state;
  }});
  assert.notEqual(marked, null);
  const episode = recorder.toEpisode(marked);
  assert.deepEqual(episode.actions.map((each) => each.side), episode.actions.map(() => "wizard"));
  replayEpisode(episode);
  // Applying the recorded action on the real engine works.
  assert.ok(applyAction(createEpisodeState(0, recorder.setup), episode.actions[0].action).state);
});

test("seed search for an authentic bait in the default decks (reports a miss, never builds one)", (t) => {
  const found = findBaitEpisode({from: 0, to: 30});
  if (!found.episode) {
    t.diagnostic(`no authentic bait found in seeds 0-30 (${found.seedsTried} tried)`);
    return;
  }
  t.diagnostic(`bait seed ${found.episode.seed}, Wizard turn ${found.report.turn}, threat ${found.report.threat} vs base ${found.report.base}`);
  assert.equal(baitReport(found.episode).ok, true);
  const comparison = compareAtMarkedTurn(found.episode, DEFAULT_LESSON_POLICY);
  assert.equal(comparison.original.usedHellfire, true);
  assert.equal(comparison.lesson.usedHellfire, false);
});

test("no card, deck or rule table changed", () => {
  assert.equal(JSON.stringify(TYPES), CARDS_BEFORE);
  assert.equal(JSON.stringify(DECKS), DECKS_BEFORE);
  assert.deepEqual(TYPES["wizard-hellfire"], {side: "wizard", name: "지옥불", rarity: "uncommon", kind: "spell", effect: "hellfire", fresh: true});
  assert.deepEqual([TYPES["cowboy-dynamiter"].attack, TYPES["cowboy-dynamiter"].health], [3, 1]);
});
