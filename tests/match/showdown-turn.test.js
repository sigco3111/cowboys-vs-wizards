// K-095: the experiment turn ?turn=dragon-c5 replays the referee's s3-C5-dragon-resting checkpoint
// (experiments/showdown-dragon-strategy/counter-output.json on kiro/graywave-dragon-referee) through the
// graybox session, and both recorded choices reach the referee's recorded results.
// K-008: ?turn=dragon-c5-70 does the same for the rival search's seed-70 case (rival-cases.json
// hunt5-s70-C5-ranger), from the same hunt-5 save and the same Cowboy policy.
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import test from "node:test";
import {cardOf} from "../../src/game/showdown/cards.js";
import {applyAction, createShowdown, planTurn, playTurn} from "../../src/game/showdown/rules.js";
import {createShowdownSession} from "../../src/match/showdown-session.js";
import {TURNS, turnDuel} from "../../src/match/showdown-turn.js";

const open = (id = "dragon-c5") => { const {duel, seed} = turnDuel(id); return createShowdownSession({seed, duel}); };
const RIVAL = JSON.parse(readFileSync(new URL("../../experiments/showdown-dragon-strategy/rival-cases.json", import.meta.url), "utf8"));
const rivalCase = (seed) => RIVAL.cases.find((each) => each.seed === seed);
const board = (view, side) => view.sides[side].board.map((t) => (t ? `${cardOf(t.cardId).name} ${t.health}${t.cover ? " cover" : ""}` : "-")).join(" | ");

// The referee's Cowboy policy (counter.mjs): planTurn on a state rebuilt from the Cowboy's public view,
// re-planned after a trap or a Cowboy draw, and at the start of each turn.
function publicState(view) {
  const fill = (n, id) => Array.from({length: n}, (_, i) => `${id}-${900 + i}`);
  const side = (name) => {
    const {handCount, deckCount, trapCount, hand, traps, ...rest} = view.sides[name];
    return {...rest, hand: hand ?? fill(handCount, "wizard-skeleton"), traps: traps ?? [], deck: fill(deckCount, name === "cowboy" ? "cowboy-sheriff" : "wizard-skeleton")};
  };
  const {viewer, sides, ...table} = view;
  return {...table, seed: null, sides: {cowboy: side("cowboy"), wizard: side("wizard")}};
}
function playOut(session) {
  let plan = planTurn(publicState(session.view())), turn = session.view().turn;
  while (!session.view().result) {
    if (session.view().turn !== turn || !plan.length) [plan, turn] = [planTurn(publicState(session.view())), session.view().turn];
    const action = plan.shift();
    if (!session.legal().some((a) => JSON.stringify(a) === JSON.stringify(action))) { plan = []; continue; }
    const events = session.act(action);
    if (events.some((e) => e.type === "trap" || ((e.type === "draw" || e.type === "burn") && e.side === "cowboy"))) plan = [];
  }
  const view = session.view();
  return {winner: view.result.winner, turn: view.turn, bases: {cowboy: view.sides.cowboy.base, wizard: view.sides.wizard.base}};
}

test("only an allowlisted id opens a turn; a URL value never becomes actions", () => {
  assert.deepEqual(Object.keys(TURNS), ["dragon-c5", "dragon-c5-70"]);
  for (const id of [null, "", "dragon-c5 ", "DRAGON-C5", "dragon-c5-70 ", "DRAGON-C5-70", "dragon-c5-3", "dragon-c5-71", "__proto__", "constructor", "toString", '[{"type":"end"}]', "seed:3", "seed:70"]) assert.equal(turnDuel(id), null, String(id));
});

test("a fresh landing is the referee's decision state, with hidden zones as counts and no seed", () => {
  const session = open();
  const view = session.view();
  assert.equal(session.duel.kind, "turn");
  assert.deepEqual([view.turn, view.active, view.sides.cowboy.base, view.sides.wizard.base], [5, "cowboy", 5, 3]);
  assert.equal(board(view, "cowboy"), "레인저 4 | 다이너마이터 1 | -");
  assert.equal(board(view, "wizard"), "용 4 | 잭오랜턴 1 cover | -");
  assert.equal(view.sides.wizard.board[0].cardId, "wizard-dragon-0");
  assert.deepEqual(view.sides.cowboy.traps.map((id) => cardOf(id).name), ["곰 덫"]);
  assert.deepEqual(view.sides.cowboy.hand.map((id) => cardOf(id).name), ["Gatling Crew", "Outrider", "Billy"]);
  assert.equal(view.seed, undefined);
  for (const hidden of ["hand", "traps", "deck"]) assert.equal(view.sides.wizard[hidden], undefined);
  assert.equal(view.sides.cowboy.deck, undefined);
  const legal = session.legal().map((a) => JSON.stringify(a));
  for (const target of [0, 1]) assert.ok(legal.includes(JSON.stringify({type: "attack", slot: 0, target})));
  assert.ok(session.opening.length > 0, "the replayed history is returned for the log");
});

test("choice A (Ranger hits the resting Dragon) reaches the referee's Cowboy win on turn 15", () => {
  const session = open();
  session.act({type: "attack", slot: 0, target: 0});
  const view = session.view();
  assert.equal(view.sides.wizard.board[0].health, 2);
  assert.equal(view.sides.cowboy.board[0].health, 1);
  assert.deepEqual(playOut(session), {winner: "cowboy", turn: 15, bases: {cowboy: 2, wizard: 0}});
});

test("choice B (Ranger hits the Jack, the policy's pick) reaches the referee's Wizard win on turn 10", () => {
  const session = open();
  session.act({type: "attack", slot: 0, target: 1});
  assert.equal(session.view().sides.wizard.board[1], null);
  assert.deepEqual(playOut(session), {winner: "wizard", turn: 10, bases: {cowboy: 0, wizard: 3}});
});

test("retry is a fresh replay: the same landing after a played line", () => {
  for (const id of Object.keys(TURNS)) for (const target of [0, 1]) {
    const first = open(id).view();
    const played = open(id);
    played.act({type: "attack", slot: 0, target});
    playOut(played);
    assert.deepEqual(open(id).view(), first, `${id} after target ${target}`);
  }
});

// The rival search hashes the full engine state at the choice (rival-search.mjs `hash`). The same prefix,
// replayed here through the engine alone, must reach that exact state for both ids.
test("each recorded prefix reaches the rival fixture's exact engine state at the choice", () => {
  const hash = (v) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 12);
  for (const id of Object.keys(TURNS)) {
    const {seed, duel} = turnDuel(id);
    let state = createShowdown(seed, duel.options);
    const bot = () => { while (!state.result && state.active !== "cowboy") state = playTurn(state, duel.level).state; };
    bot();
    for (const action of duel.prefix) { state = applyAction(state, action).state; bot(); }
    assert.deepEqual([state.turn, state.active], [5, "cowboy"], id);
    assert.equal(hash(state), rivalCase(seed).atChoiceHash, id);
  }
});

test("dragon-c5-70: lands on the seed-70 decision, with hidden zones as counts and no seed", () => {
  const session = open("dragon-c5-70");
  const view = session.view();
  assert.equal(session.duel.kind, "turn");
  assert.equal(session.duel.id, "turn:dragon-c5-70");
  assert.deepEqual([view.turn, view.active, view.sides.cowboy.base, view.sides.wizard.base], [5, "cowboy", 5, 4]);
  assert.equal(board(view, "cowboy"), "레인저 4 | 포장마차 4 | -");
  assert.equal(board(view, "wizard"), "용 4 | 잭오랜턴 1 cover | -");
  assert.equal(view.sides.wizard.board[0].cardId, "wizard-dragon-0");
  assert.deepEqual(view.sides.cowboy.traps, []);
  assert.equal(view.seed, undefined);
  for (const hidden of ["hand", "traps", "deck"]) assert.equal(view.sides.wizard[hidden], undefined);
  assert.equal(view.sides.cowboy.deck, undefined);
  const legal = session.legal().map((a) => JSON.stringify(a));
  for (const target of [0, 1]) assert.ok(legal.includes(JSON.stringify({type: "attack", slot: 0, target})));
});

test("dragon-c5-70 choice A (Ranger hits the resting Dragon) reaches the rival's Wizard win on turn 14", () => {
  const session = open("dragon-c5-70");
  session.act({type: "attack", slot: 0, target: 0});
  assert.equal(session.view().sides.wizard.board[0].health, 2);
  assert.equal(session.view().sides.cowboy.board[0].health, 1);
  const out = playOut(session);
  assert.equal(`${out.winner[0]}${out.turn}`, rivalCase(70).result.A);
  assert.deepEqual(out, {winner: "wizard", turn: 14, bases: rivalCase(70).lines.A.bases});
});

test("dragon-c5-70 choice B (Ranger hits the Jack, the policy's pick) reaches the rival's Cowboy win on turn 17", () => {
  const session = open("dragon-c5-70");
  session.act({type: "attack", slot: 0, target: 1});
  assert.equal(session.view().sides.wizard.board[1], null);
  const out = playOut(session);
  assert.equal(`${out.winner[0]}${out.turn}`, rivalCase(70).result.B);
  assert.deepEqual(out, {winner: "cowboy", turn: 17, bases: rivalCase(70).lines.B.bases});
});

test("the seed-70 lesson adds only neutral text: no trap, outcome, bounty or other-case wording", () => {
  const {lesson, name} = TURNS["dragon-c5-70"];
  assert.match(lesson, /^Experiment for review, not a bounty: nothing here is saved\./);
  for (const word of [/trap/i, /win/i, /lose/i, /best|correct|right|wrong|should/i, /seed/i, /reward|grit/i, /\brests?\b/i]) assert.doesNotMatch(`${name} ${lesson}`, word);
});

test("a prefix with an illegal or short action list refuses to open", () => {
  const {seed, duel} = turnDuel("dragon-c5");
  assert.throws(() => createShowdownSession({seed, duel: {...duel, prefix: [{type: "attack", slot: 2, target: "base"}]}}), /not legal/);
  assert.throws(() => createShowdownSession({seed, duel: {...duel, prefix: duel.prefix.slice(0, 3)}}), /did not reach/);
});
