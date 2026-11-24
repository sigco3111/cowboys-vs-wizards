// Dec 4 Step 6: fast-check properties for the real Showdown rules (src/game/showdown/). Each
// property quotes the RULEBOOK.md, contract.js, rules.js or cards.js clause it checks, or is
// named as a stable property. Claude Code contribution; the gates G1-G4
// (contest-gate-properties.mjs) and SP1-SP7 (tests/helpers/boundary-properties/showdown/) are
// separate and unchanged, and these properties do not repeat them.
//
// A case is a whole legal game: a deal from the boundary-property setup generator (even match,
// Trail stage, rival, bounty hunt with its boss, open range; Starter or random valid Cowboy
// decks) picked by `setupSeed`, an optional Base override, a play policy and the generated
// choices. Every choice picks from legalActions, then "end" is taken until the game has a
// result, so every shrunk case is still a legal game. The policies steer toward unusual
// reachable states: hoard (mostly passing: full-hand burns, fatigue, the turn cap), brawl
// (attacks first: traps, Sweep, Last Stand) and build (cards first: full boards, tributes,
// Raise, both trap slots). Each property has its own fast-check seed, derived from the base
// seed and its id, so the properties do not all walk the same games.
//
// Turn cap: the engine's TURN_CAP is 80 (rules.js; RULEBOOK §10 "after turn 80") and is kept.
// The Step 6 brief's 60-turn goal is not an engine rule and is not asserted: with a Base
// override (a createShowdown option) a game plays to turn 81. rules-fatigue-clock checks the
// bound the rules do give and reports how many games ended after turn 60.
//
//   node scripts/showdown-dec4-properties.mjs                 25 runs per property (quick)
//   node scripts/showdown-dec4-properties.mjs --ci            10000 runs per property
//   node scripts/showdown-dec4-properties.mjs --runs N --seed S --only id[,id] --path P
//   node scripts/showdown-dec4-properties.mjs --report [file] also writes the JSON receipt
//                                                  (default reports/properties/latest.json)
//   node scripts/showdown-dec4-properties.mjs --list          ids, names and clauses
// The receipt follows the docs/SCORECARD.md contract (cvw-property-receipt/1: commit, generatedAt,
// per-property id, file, status, numRuns, seed) and also carries runs, passed, the errors and the
// source fingerprint. generatedAt is the only field that changes between identical runs, so
// stableSha256 hashes the receipt without it and without commit: the same sources, seed and runs
// give the same stableSha256.
// Exit code: 0 all passed, 1 a property failed, 2 bad arguments.
//
// Authorship: Claude Code wrote the draft (the first 19 properties, the generators, the runner
// and the CLI). Kiro CLI (native-handoff-properties agent) added stable-log-replay, the
// scorecard receipt fields and tests/game/dec4-showdown-properties.test.js.
import fc from "fast-check";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual as same } from "node:util";
import { EFFECTS, cardOf, deckIds, has, tributes } from "../src/game/showdown/cards.js";
import { viewFor } from "../src/game/showdown/contract.js";
import {
  BOARD_SIZE, HAND_CAP, OPENING_HAND, SECOND_PLAYER_CARDS, TRAP_SLOTS, TURN_CAP,
  applyAction, attackOf, createShowdown, legalActions, opponent, random,
} from "../src/game/showdown/rules.js";
import { need } from "../tests/helpers/boundary-properties/invariants.js";
import { MAX_CHOICES, inputOf } from "./contest-gate-properties.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
// The scorecard's receipt schema; GENERATOR names this script's own layout inside it.
export const SCHEMA = "cvw-property-receipt/1";
export const GENERATOR = "showdown-dec4-properties/1";
export const TEST_FILE = "tests/game/dec4-showdown-properties.test.js";
export const AUTHORSHIP = Object.freeze({
  draft: "Claude Code: scripts/showdown-dec4-properties.mjs (19 properties, generators, runner, CLI)",
  completion: `Kiro CLI, native-handoff-properties agent: stable-log-replay, scorecard receipt fields, ${TEST_FILE}`,
});
export const BASE_SEED = 0xdec4;
export const QUICK_RUNS = 25;
export const CI_RUNS = 10_000;
export const TURN_GOAL = 60;
export const DEFAULT_REPORT = "reports/properties/latest.json";
export const TURN_NOTE = `TURN_CAP is ${TURN_CAP} (rules.js; RULEBOOK §10 "after turn 80") and is kept. The Step 6 brief's ${TURN_GOAL}-turn goal is not asserted: a createShowdown Base override plays to turn ${TURN_CAP + 1}. rules-fatigue-clock reports the games that ended after turn ${TURN_GOAL}.`;
// The engine as one object, so the harness tests can run a property on a planted fault.
export const ENGINE = Object.freeze({ createShowdown, legalActions, applyAction, attackOf, viewFor });

const SIDES = ["cowboy", "wizard"];
const PLAYS = new Set(["summon", "spell", "gear", "location", "set"]);
const CASTS = new Set(["spell", "gear", "location"]);
// One troop, one other card, one trap, one act per slot and "end" per turn (G1 holds this).
const STEP_BUDGET = TURN_CAP * (3 + BOARD_SIZE + 1);
const json = JSON.stringify;
const sha256 = (data) => createHash("sha256").update(data).digest("hex");

// ---------------------------------------------------------------- generated games
export const POLICIES = ["uniform", "hoard", "brawl", "build"];
const GAME = {
  setupSeed: fc.integer({ min: 0, max: 0x7fffffff }),
  // null keeps the duel's own Bases; a number overrides both, so long games reach the turn cap.
  baseOrbs: fc.oneof({ arbitrary: fc.constant(null), weight: 3 }, { arbitrary: fc.integer({ min: 1, max: 120 }), weight: 1 }),
  policy: fc.constantFrom(...POLICIES),
  choices: fc.array(fc.nat({ max: 0xffff }), { maxLength: MAX_CHOICES }),
};
export const gameArb = fc.record(GAME);
const dealArb = fc.record({ setupSeed: GAME.setupSeed, baseOrbs: GAME.baseOrbs });
// twinSeed is independent of the game: it re-deals the cards a seat cannot see.
const twinArb = fc.record({ ...GAME, twinSeed: fc.integer({ min: 0, max: 0x7fffffff }) });

export const gameOf = (raw) => ({ ...inputOf({ setupSeed: raw.setupSeed, baseOrbs: raw.baseOrbs, choices: raw.choices ?? [] }), policy: raw.policy ?? "uniform" });

// A choice always lands on a listed action; a policy only narrows which ones it prefers.
export function pick(legal, choice, policy) {
  const preferred = policy === "brawl" ? legal.filter((action) => action.type === "attack")
    : policy === "build" ? legal.filter((action) => PLAYS.has(action.type))
    : policy === "hoard" && choice % 4 ? legal.filter((action) => action.type === "end")
    : legal;
  const pool = preferred.length ? preferred : legal;
  return pool[choice % pool.length];
}

// Plays one generated game to its result. onStep sees every action with the list it came from.
export function play(game, engine, { onStart, onStep } = {}) {
  const start = engine.createShowdown(game.seed, structuredClone(game.options));
  onStart?.(start);
  let state = start;
  for (let step = 0; !state.result; step++) {
    need(step < STEP_BUDGET, "no-result", () => `no result after ${step} actions (turn ${state.turn})`);
    const legal = engine.legalActions(state);
    const action = step < game.choices.length ? pick(legal, game.choices[step], game.policy) : legal.find((each) => each.type === "end");
    const { state: next, events } = engine.applyAction(state, action);
    onStep?.({ step, before: state, legal, action, state: next, events });
    state = next;
  }
  return { start, end: state };
}

// ---------------------------------------------------------------- shared reading of the rules
const troopsOf = (state, side) => state.sides[side].board.filter(Boolean);
const idsOn = (state, side) => troopsOf(state, side).map((troop) => troop.cardId);
const slots = [...Array(BOARD_SIZE).keys()];
const effectOf = (cardId) => EFFECTS[cardOf(cardId).effect];
const sorted = (items) => [...items].sort();
const sameBag = (a, b) => same(sorted(a), sorted(b));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.some((y) => same(x, y))) && b.every((y) => a.some((x) => same(x, y)));
const within = (items, allowed) => items.every((item) => allowed.includes(item));
const troopShape = (troop) => troop && { cardId: troop.cardId, health: troop.health, gear: troop.gear, attacked: troop.attacked, cover: troop.cover, stunned: troop.stunned };
const fresh = (cardId, health) => ({ cardId, health, gear: [], attacked: false, cover: false, stunned: false });

// A troop's attack from its cards: printed attack, its gear, +1 when the location names its type (RULEBOOK §8).
export const cardAttack = (state, troop) => cardOf(troop.cardId).attack
  + troop.gear.reduce((sum, id) => sum + (effectOf(id).attack ?? 0), 0)
  + (state.location && effectOf(state.location.cardId).tag === cardOf(troop.cardId).tag ? 1 : 0);

// What the active side has done this turn, read from the actions (not the engine's own flags).
const freshLog = () => ({ summon: false, cast: false, set: false, acted: new Set() });
function logAfter(log, before, action) {
  if (action.type === "end") return freshLog();
  if (action.type === "summon") log.summon = true;
  else if (CASTS.has(action.type)) log.cast = true;
  else if (action.type === "set") log.set = true;
  else log.acted.add(before.sides[before.active].board[action.slot].cardId);
  return log;
}

// ---------------------------------------------------------------- rb3-deal
function checkDeal(raw, engine) {
  const game = gameOf(raw);
  const state = engine.createShowdown(game.seed, structuredClone(game.options));
  const { decks = {}, opening = {}, arrivals = {}, first, baseOrbs = 5, secondPlayerCards = SECOND_PLAYER_CARDS } = game.options;
  need(state.turn === 1 && state.result === null && state.location === null, "deal", "the game does not open on turn 1 with an empty location slot");
  need(SIDES.includes(state.first) && state.active === state.first && (!first || state.first === first), "deal",
    () => `first ${state.first}, active ${state.active}, asked for ${first}`);
  for (const side of SIDES) {
    const own = state.sides[side];
    const declared = deckIds(side, decks[side]);
    need(sameBag([...own.hand, ...own.deck], declared), "deal", () => `${side} hand and deck are not its declared ${declared.length}-card deck`);
    const handSize = Math.min(declared.length, OPENING_HAND + (side === state.first ? 0 : secondPlayerCards));
    need(own.hand.length === handSize, "deal", () => `${side} opens with ${own.hand.length} cards, expected ${handSize}`);
    const base = baseOrbs[side] ?? baseOrbs;
    need(own.base === base && own.baseMax === base, "deal", () => `${side} Base ${own.base}/${own.baseMax}, expected ${base}`);
    need(own.traps.length === 0 && own.discard.length === 0, "deal", () => `${side} opens with traps or a graveyard`);
    const bosses = (opening[side] ?? []).map(({ type, health }) => [`${type}-0`, health]);
    need(same(own.board.map((troop) => troop && [troop.cardId, troop.health]), [...bosses, ...Array(BOARD_SIZE - bosses.length).fill(null)]), "deal",
      () => `${side} board ${json(own.board)} is not its opening bosses ${json(bosses)}`);
  }
  const due = SIDES.flatMap((side) => (arrivals[side] ?? []).map((arrival) => ({ side, ...arrival })));
  need(same(state.arrivals, due), "deal", () => `pending arrivals ${json(state.arrivals)}, asked for ${json(due)}`);
}

// ---------------------------------------------------------------- rb2-card-zones
const ZONE_KIND = { board: "troop", gear: "gear", traps: "trap", location: "location" };
function cardsOf(state, side) {
  const own = state.sides[side];
  const troops = own.board.filter(Boolean);
  return [
    ...["deck", "hand", "discard", "traps"].flatMap((zone) => own[zone].map((id) => [zone, id])),
    ...troops.map((troop) => ["board", troop.cardId]),
    ...troops.flatMap((troop) => troop.gear.map((id) => ["gear", id])),
    ...(state.location?.side === side ? [["location", state.location.cardId]] : []),
  ];
}
// Bosses that have landed: asked for at the deal and no longer pending.
function landed(start, state, side) {
  const pending = state.arrivals.filter((arrival) => arrival.side === side).map(({ type }) => `${type}-0`);
  return start.arrivals.filter((arrival) => arrival.side === side).map(({ type }) => `${type}-0`)
    .filter((id) => { const at = pending.indexOf(id); if (at < 0) return true; pending.splice(at, 1); return false; });
}
function checkZones(raw, engine) {
  let start;
  const dealt = {};
  const look = (state, label) => {
    const all = [];
    for (const side of SIDES) {
      const cards = cardsOf(state, side);
      for (const [zone, id] of cards) {
        need(cardOf(id)?.side === side, "zones", () => `${label}: ${side} ${zone} holds ${id}, not a ${side} card`);
        need(!ZONE_KIND[zone] || cardOf(id).kind === ZONE_KIND[zone], "zones", () => `${label}: ${side} ${zone} holds the ${cardOf(id).kind} ${id}`);
      }
      const ids = cards.map(([, id]) => id);
      need(sameBag(ids, [...dealt[side], ...landed(start, state, side)]), "zones", () => `${label}: ${side} cards are now ${json(sorted(ids))}`);
      all.push(...ids);
    }
    need(new Set(all).size === all.length, "zones", () => `${label}: a card is in two places: ${all.filter((id, i) => all.indexOf(id) !== i)}`);
  };
  play(gameOf(raw), engine, {
    onStart(state) {
      start = state;
      for (const side of SIDES) dealt[side] = cardsOf(state, side).map(([, id]) => id);
      look(state, "deal");
    },
    onStep: ({ step, state }) => look(state, `step ${step}`),
  });
}

// ---------------------------------------------------------------- rb2-frame
function checkFrame(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, action, state: after, events }) {
      const own = before.active;
      const foe = opponent(own);
      const at = (side, slot) => before.sides[side].board[slot];
      const oneOrb = (side, from) => from.filter((slot) => at(side, slot)?.health === 1).map((slot) => at(side, slot).cardId);
      const gone = (side) => idsOn(before, side).filter((id) => !idsOn(after, side).includes(id));
      const mayFall = { [own]: [], [foe]: [] };
      if (action.type === "summon") mayFall[own] = action.tributes.map((slot) => at(own, slot).cardId);
      if (action.type === "spell") {
        const effect = cardOf(action.cardId).effect;
        mayFall[foe] = effect === "tie" ? [] : oneOrb(foe, effect === "hellfire" ? slots : [action.target]);
      }
      if (action.type === "attack") {
        const attacker = at(own, action.slot).cardId;
        mayFall[own] = [attacker];
        mayFall[foe] = [...(action.target === "base" ? [] : [at(foe, action.target).cardId]),
          ...(has(attacker, "sweep") ? oneOrb(foe, slots.filter((slot) => slot !== action.target)) : [])];
      }
      for (const side of SIDES) {
        need(within(gone(side), mayFall[side]), "frame", () => `step ${step}: ${json(action)} removed ${side} ${gone(side).filter((id) => !mayFall[side].includes(id))}`);
      }
      // Every tribute leaves (Raise may bring an Undead one straight back, with its own event).
      const raised = events.filter((event) => event.type === "raise").map((event) => event.cardId);
      if (action.type === "summon") need(mayFall[own].every((id) => gone(own).includes(id) || raised.includes(id)), "frame", () => `step ${step}: tribute ${json(mayFall[own])} stayed`);
      const base = { [own]: before.sides[own].base, [foe]: before.sides[foe].base };
      if (action.type === "attack") base[foe] = Math.max(0, base[foe] - (events.find((event) => event.type === "attack")?.baseDamage ?? 0));
      if (action.type === "end" && events.some((event) => event.type === "fatigue")) base[foe] = Math.max(0, base[foe] - 1);
      for (const side of SIDES) {
        need(after.sides[side].base === base[side], "frame", () => `step ${step}: ${json(action)} moved the ${side} Base ${before.sides[side].base} -> ${after.sides[side].base}`);
      }
    },
  });
}

// ---------------------------------------------------------------- rb5-targets
function expectedTargets(state, slot) {
  const enemy = state.sides[opponent(state.active)].board;
  const troops = slots.filter((at) => enemy[at]);
  const guards = troops.filter((at) => has(enemy[at].cardId, "guard"));
  if (!troops.length) return ["base"];
  if (guards.length) return guards;
  return has(state.sides[state.active].board[slot].cardId, "ride") ? [...troops, "base"] : troops;
}
function checkTargets(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, legal }) {
      const attacks = legal.filter((action) => action.type === "attack");
      for (const slot of new Set(attacks.map((action) => action.slot))) {
        const troop = before.sides[before.active].board[slot];
        need(troop, "targets", () => `step ${step}: an attack is listed from empty slot ${slot}`);
        const listed = attacks.filter((action) => action.slot === slot).map((action) => action.target);
        const expected = expectedTargets(before, slot);
        need(same(listed.map(String).sort(), expected.map(String).sort()), "targets",
          () => `step ${step}: ${troop.cardId} may attack ${json(listed)}, the rules give ${json(expected)}`);
      }
    },
  });
}

// ---------------------------------------------------------------- rb5-who-acts
function checkWhoActs(raw, engine) {
  // Arrival turn, payment and stun of each troop, followed from events alone.
  const known = new Map();
  let log = freshLog();
  play(gameOf(raw), engine, {
    onStart(state) {
      for (const side of SIDES) for (const troop of troopsOf(state, side)) known.set(troop.cardId, { arrived: 0, paid: false, stunned: false });
    },
    onStep({ step, before, legal, action, state: after, events }) {
      before.sides[before.active].board.forEach((troop, slot) => {
        if (!troop) return;
        const info = known.get(troop.cardId);
        need(info, "who-acts", () => `step ${step}: ${troop.cardId} is on the board without an arrival event`);
        const spent = log.acted.has(troop.cardId);
        const rested = info.arrived < before.turn || info.paid || has(troop.cardId, "quickdraw");
        const may = before.turn > 1 && !spent && !info.stunned && cardAttack(before, troop) > 0 && rested;
        const listed = legal.some((each) => each.type === "attack" && each.slot === slot);
        need(listed === may, "who-acts", () => `step ${step} turn ${before.turn}: ${troop.cardId} ${listed ? "may" : "may not"} attack `
          + `(arrived ${info.arrived}, paid ${info.paid}, stunned ${info.stunned}, acted ${spent}, attack ${cardAttack(before, troop)})`);
        const cover = legal.some((each) => each.type === "cover" && each.slot === slot);
        need(cover === !spent, "who-acts", () => `step ${step}: ${troop.cardId} ${cover ? "may" : "may not"} take cover, acted ${spent}`);
      });
      for (const event of events) {
        if (event.type === "summon") known.set(event.cardId, { arrived: after.turn, paid: action.type === "summon" && action.tributes.length > 0, stunned: false });
        if (event.type === "raise") known.set(event.cardId, { arrived: after.turn, paid: false, stunned: false });
        if (event.type === "spell" && event.stunned) known.get(event.target).stunned = true;
      }
      if (action.type === "end") for (const troop of troopsOf(before, before.active)) known.get(troop.cardId).stunned = false;
      log = logAfter(log, before, action);
    },
  });
}

// ---------------------------------------------------------------- rb4-card-plays
function checkCardPlays(raw, engine) {
  let log = freshLog();
  play(gameOf(raw), engine, {
    onStep({ step, before, legal, action }) {
      const own = before.sides[before.active];
      const types = new Set(legal.map((each) => each.type));
      need(types.has("end"), "card-plays", () => `step ${step}: "end" is not listed`);
      const open = log.acted.size ? [] : [...(log.summon ? [] : ["summon"]), ...(log.cast ? [] : [...CASTS]), ...(log.set ? [] : ["set"])];
      for (const each of legal) {
        if (PLAYS.has(each.type)) need(open.includes(each.type), "card-plays", () => `step ${step}: ${json(each)} is listed after ${log.acted.size ? "a troop acted" : `this turn's ${each.type}`}`);
      }
      const canSet = open.includes("set") && own.traps.length < TRAP_SLOTS && own.hand.some((id) => cardOf(id).kind === "trap");
      need(types.has("set") === canSet, "card-plays", () => `step ${step}: set ${types.has("set") ? "listed" : "missing"} with ${own.traps.length} traps set`);
      const occupied = own.board.filter(Boolean).length;
      for (const each of legal.filter((entry) => entry.type === "summon")) {
        need(each.tributes.length === tributes(each.cardId) && new Set(each.tributes).size === each.tributes.length
          && each.tributes.every((slot) => own.board[slot]) && occupied - each.tributes.length < BOARD_SIZE, "card-plays",
        () => `step ${step}: ${json(each)} pays the wrong tribute for ${cardOf(each.cardId).stars} stars or has no free slot`);
      }
      log = logAfter(log, before, action);
    },
  });
}

// ---------------------------------------------------------------- rb4-turn-boundary
function checkTurnBoundary(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, action, state: after, events }) {
      if (action.type !== "end") return;
      const ender = before.active;
      const starter = opponent(ender);
      const label = `step ${step} (end of turn ${before.turn})`;
      need(after.turn === before.turn + 1 && after.active === starter, "turn-boundary", () => `${label}: turn ${after.turn}, active ${after.active}`);
      need(same(events[0], { type: "turn", side: starter, turn: after.turn }), "turn-boundary", () => `${label}: first event ${json(events[0])}`);
      before.sides[ender].board.forEach((troop, slot) => need(same(after.sides[ender].board[slot], troop && { ...troop, stunned: false }), "turn-boundary",
        () => `${label}: ${ender} slot ${slot} should only recover from a stun: ${json(troop)} -> ${json(after.sides[ender].board[slot])}`));
      before.sides[starter].board.forEach((troop, slot) => {
        if (troop) need(same(after.sides[starter].board[slot], { ...troop, attacked: false, cover: false }), "turn-boundary",
          () => `${label}: ${starter} slot ${slot} did not stand up: ${json(troop)} -> ${json(after.sides[starter].board[slot])}`);
      });
      const was = before.sides[starter];
      const now = after.sides[starter];
      const drawn = after.turn > TURN_CAP ? null : !was.deck.length ? "fatigue" : was.hand.length >= HAND_CAP ? "burn" : "draw";
      const expected = drawn ? [{ type: drawn, side: starter, ...(drawn === "burn" ? { cardId: was.deck[0] } : {}) }] : [];
      need(same(events.filter((event) => ["draw", "burn", "fatigue"].includes(event.type)), expected), "turn-boundary",
        () => `${label}: draw events ${json(events)}, the rules give ${json(expected)}`);
      const took = drawn === "draw" || drawn === "burn" ? 1 : 0;
      need(same(now.deck, was.deck.slice(took)) && same(now.hand, drawn === "draw" ? [...was.hand, was.deck[0]] : was.hand)
        && same(now.discard, drawn === "burn" ? [...was.discard, was.deck[0]] : was.discard) && same(now.traps, was.traps), "turn-boundary",
      () => `${label}: ${starter}'s cards moved beyond one ${drawn ?? "skipped draw"}`);
      const [then, later] = [before.sides[ender], after.sides[ender]];
      need(["hand", "deck", "discard", "traps"].every((zone) => same(then[zone], later[zone])) && same(before.location, after.location), "turn-boundary",
        () => `${label}: ${ender}'s cards or the location moved at the end of its turn`);
    },
  });
}

// ---------------------------------------------------------------- rb5-fight-numbers
function checkFightNumbers(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, action, events }) {
      if (action.type !== "attack") return;
      const side = before.active;
      const enemy = before.sides[opponent(side)];
      const attacker = before.sides[side].board[action.slot];
      const trap = events.find((event) => event.type === "trap");
      const effect = trap && cardOf(trap.cardId).effect;
      const health = effect === "snare" ? Math.max(0, attacker.health - 2) : attacker.health;
      const fight = events.find((event) => event.type === "attack");
      if (effect === "hex" || health === 0) {
        need(!fight, "fight", () => `step ${step}: an attack the trap stopped still landed`);
        return;
      }
      const attack = cardAttack(before, attacker);
      let expected;
      if (action.target === "base") {
        expected = { target: "base", covered: false, hitBack: 0, baseDamage: enemy.board.some(Boolean) ? 1 : attack, targetLeft: null, attackerLeft: health };
      } else {
        const defender = enemy.board[action.target];
        const targetLeft = Math.max(0, defender.health - attack);
        const hitBack = targetLeft > 0 && !defender.cover ? cardAttack(before, defender) : 0;
        expected = { target: defender.cardId, covered: defender.cover, hitBack, baseDamage: defender.cover ? 0 : Math.max(0, attack - defender.health),
          targetLeft, attackerLeft: Math.max(0, health - hitBack) };
      }
      need(same(fight, { type: "attack", side, cardId: attacker.cardId, ...expected }), "fight",
        () => `step ${step}: ${json(fight)}, the rules give ${json(expected)}`);
    },
  });
}

// ---------------------------------------------------------------- rb9-sweep-last-stand
function checkAfterFight(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, action, state: after, events }) {
      const fight = action.type === "attack" && events.find((event) => event.type === "attack");
      if (!fight) return;
      const side = before.active;
      const foe = opponent(side);
      const attacker = before.sides[side].board[action.slot];
      const expected = [];
      let { targetLeft, attackerLeft } = fight;
      if (action.target !== "base") {
        const defender = before.sides[foe].board[action.target];
        if (targetLeft === 0 && attackerLeft > 0 && has(defender.cardId, "laststand")) {
          attackerLeft -= 1;
          expected.push({ type: "laststand", side: foe, cardId: defender.cardId, target: attacker.cardId, left: attackerLeft });
        } else if (attackerLeft === 0 && targetLeft > 0 && has(attacker.cardId, "laststand")) {
          targetLeft -= 1;
          expected.push({ type: "laststand", side, cardId: attacker.cardId, target: defender.cardId, left: targetLeft });
        }
      }
      const swept = action.target === "base" || !has(attacker.cardId, "sweep") ? []
        : slots.filter((slot) => slot !== action.target && before.sides[foe].board[slot]);
      if (swept.length) expected.push({ type: "sweep", side, cardId: attacker.cardId, count: swept.length });
      need(same(events.filter((event) => event.type === "laststand" || event.type === "sweep"), expected), "after-fight",
        () => `step ${step}: ${json(events)}, the rules give ${json(expected)}`);
      const orbs = (name, slot) => after.sides[name].board[slot]?.health ?? 0;
      before.sides[foe].board.forEach((troop, slot) => {
        if (!troop) return;
        const left = slot === action.target ? targetLeft : swept.includes(slot) ? troop.health - 1 : troop.health;
        need(orbs(foe, slot) === left, "after-fight", () => `step ${step}: ${troop.cardId} has ${orbs(foe, slot)} orbs, the rules leave ${left}`);
      });
      need(orbs(side, action.slot) === attackerLeft, "after-fight", () => `step ${step}: ${attacker.cardId} has ${orbs(side, action.slot)} orbs, the rules leave ${attackerLeft}`);
    },
  });
}

// ---------------------------------------------------------------- rb7-traps
function checkTraps(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, action, state: after, events }) {
      const side = before.active;
      const foe = opponent(side);
      const sprung = events.filter((event) => event.type === "trap");
      if (action.type === "set") {
        need(same(after.sides[side].traps, [...before.sides[side].traps, action.cardId]), "traps", () => `step ${step}: the set card is not the newest trap`);
      }
      if (action.type !== "attack") {
        need(!sprung.length, "traps", () => `step ${step}: a trap sprang on ${action.type}`);
        return;
      }
      const set = before.sides[foe].traps;
      const attacker = before.sides[side].board[action.slot];
      if (!set.length) {
        need(!sprung.length, "traps", () => `step ${step}: a trap sprang from an empty trap row`);
      } else {
        const effect = cardOf(set[0]).effect;
        const left = effect === "snare" ? Math.max(0, attacker.health - 2) : attacker.health;
        const stopped = effect === "hex" || left === 0;
        need(same(sprung, [{ type: "trap", side: foe, cardId: set[0], target: attacker.cardId, left, stopped }]), "traps",
          () => `step ${step}: ${json(sprung)}, expected the oldest trap ${set[0]} to spring once`);
        need(same(after.sides[foe].traps, set.slice(1)) && after.sides[foe].discard[before.sides[foe].discard.length] === set[0], "traps",
          () => `step ${step}: the sprung ${set[0]} did not leave the trap row for the graveyard`);
        if (left === 0) {
          need(same(after.sides[side].discard.slice(before.sides[side].discard.length), [attacker.cardId, ...attacker.gear]), "traps",
            () => `step ${step}: the trapped ${attacker.cardId} did not take its gear to the graveyard`);
        }
        if (stopped) {
          need(!events.some((event) => event.type === "attack") && after.sides[foe].base === before.sides[foe].base, "traps",
            () => `step ${step}: an attack the trap stopped still landed`);
        }
      }
      if (!after.result && after.sides[side].board[action.slot]) {
        need(!engine.legalActions(after).some((each) => (each.type === "attack" || each.type === "cover") && each.slot === action.slot), "traps",
          () => `step ${step}: ${attacker.cardId} may act again after its attack`);
      }
    },
  });
}

// ---------------------------------------------------------------- rb8-gear-locations
function checkGearAndLocations(raw, engine) {
  const values = (state, label) => {
    for (const side of SIDES) {
      for (const troop of troopsOf(state, side)) {
        need(engine.attackOf(state, troop) === cardAttack(state, troop), "gear-location",
          () => `${label}: ${troop.cardId} attacks for ${engine.attackOf(state, troop)}, its cards give ${cardAttack(state, troop)}`);
      }
    }
  };
  play(gameOf(raw), engine, {
    onStart: (state) => values(state, "deal"),
    onStep({ step, before, legal, action, state: after, events }) {
      const label = `step ${step}`;
      const side = before.active;
      const here = before.location && cardOf(before.location.cardId).name;
      need(!legal.some((each) => each.type === "location" && cardOf(each.cardId).name === here), "gear-location", () => `${label}: ${here} may be played over itself`);
      // Gear stays on every troop that stays (a tribute that Raise returns comes back bare).
      const paid = events.filter((event) => event.type === "tribute").map((event) => event.cardId);
      for (const name of SIDES) {
        before.sides[name].board.forEach((troop, slot) => {
          const now = after.sides[name].board[slot];
          if (!troop || now?.cardId !== troop.cardId || paid.includes(troop.cardId)) return;
          const added = action.type === "gear" && name === side && slot === action.slot ? [action.cardId] : [];
          need(same(now.gear, [...troop.gear, ...added]), "gear-location", () => `${label}: ${troop.cardId} gear ${json(troop.gear)} -> ${json(now.gear)}`);
        });
      }
      if (action.type === "gear") {
        const troop = before.sides[side].board[action.slot];
        const health = after.sides[side].board[action.slot].health;
        need(health === troop.health + effectOf(action.cardId).orbs, "gear-location", () => `${label}: ${action.cardId} took ${troop.cardId} from ${troop.health} to ${health} orbs`);
      }
      if (action.type === "location") {
        need(same(after.location, { cardId: action.cardId, side }), "gear-location", () => `${label}: location ${json(after.location)}`);
        if (before.location) {
          need(after.sides[before.location.side].discard.at(-1) === before.location.cardId, "gear-location",
            () => `${label}: the replaced ${before.location.cardId} did not go to its owner's graveyard`);
        }
      } else {
        need(same(after.location, before.location), "gear-location", () => `${label}: the location changed on ${action.type}`);
      }
      values(after, label);
    },
  });
}

// ---------------------------------------------------------------- rb9-arrivals
function checkArrivals(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, action, state: after, events }) {
      const label = `step ${step}`;
      if (action.type === "summon") {
        const side = before.active;
        const own = structuredClone(before.sides[side]);
        const expected = [];
        for (const slot of action.tributes) {
          expected.push({ type: "tribute", side, cardId: own.board[slot].cardId });
          own.discard.push(own.board[slot].cardId, ...own.board[slot].gear);
          own.board[slot] = null;
        }
        own.hand.splice(own.hand.indexOf(action.cardId), 1);
        const at = own.board.indexOf(null);
        own.board[at] = action.cardId;
        expected.push({ type: "summon", side, cardId: action.cardId });
        need(same(troopShape(after.sides[side].board[at]), fresh(action.cardId, cardOf(action.cardId).health)), "arrivals",
          () => `${label}: ${action.cardId} did not arrive fresh on the first empty slot ${at}: ${json(after.sides[side].board[at])}`);
        if (has(action.cardId, "scout") && own.deck.length) expected.push(own.hand.length >= HAND_CAP ? { type: "burn", side, cardId: own.deck[0] } : { type: "draw", side });
        const from = has(action.cardId, "raise") ? own.discard.findLastIndex((id) => cardOf(id).kind === "troop" && cardOf(id).tag === "Undead") : -1;
        const free = own.board.indexOf(null);
        if (from >= 0 && free >= 0) {
          const risen = own.discard[from];
          expected.push({ type: "raise", side, cardId: risen });
          need(same(troopShape(after.sides[side].board[free]), fresh(risen, 1)) && !after.sides[side].discard.includes(risen), "arrivals",
            () => `${label}: Raise did not bring ${risen} back with 1 orb to slot ${free}`);
        }
        need(same(events, expected), "arrivals", () => `${label}: ${json(events)}, the rules give ${json(expected)}`);
      }
      if (action.type === "end") {
        const side = after.active;
        const taken = before.sides[side].board.map(Boolean);
        const arrived = [];
        for (const due of before.arrivals.filter((arrival) => arrival.side === side && arrival.turn <= after.turn)) {
          const slot = taken.indexOf(false);
          if (slot < 0) break;
          taken[slot] = true;
          arrived.push(due);
          need(same(troopShape(after.sides[side].board[slot]), fresh(`${due.type}-0`, due.health)), "arrivals",
            () => `${label}: the boss ${due.type} due on turn ${due.turn} did not land fresh on slot ${slot}`);
        }
        need(same(after.arrivals, before.arrivals.filter((arrival) => !arrived.includes(arrival))), "arrivals",
          () => `${label}: pending arrivals ${json(after.arrivals)}, expected ${arrived.length} of ${json(before.arrivals)} to land`);
        need(same(events.filter((event) => event.type === "summon"), arrived.map(({ type }) => ({ type: "summon", side, cardId: `${type}-0` }))), "arrivals",
          () => `${label}: summon events ${json(events)} do not match the bosses that landed`);
      }
    },
  });
}

// ---------------------------------------------------------------- rb10-spells
function checkSpells(raw, engine) {
  let log = freshLog();
  play(gameOf(raw), engine, {
    onStep({ step, before, legal, action, state: after, events }) {
      const side = before.active;
      const foe = opponent(side);
      const enemy = before.sides[foe].board;
      const label = `step ${step}`;
      // One entry per card name, as legalActions lists them, while the turn's cast is still open.
      const expected = [];
      const names = new Set();
      if (!log.cast && !log.acted.size) {
        for (const id of before.sides[side].hand) {
          const card = cardOf(id);
          if (names.has(card.name)) continue;
          names.add(card.name);
          if (card.kind !== "spell") continue;
          if (!EFFECTS[card.effect].target) {
            if (enemy.some(Boolean)) expected.push({ type: "spell", cardId: id });
          } else {
            enemy.forEach((troop, target) => {
              if (troop && !has(troop.cardId, "ghostly") && !(card.effect === "tie" && troop.stunned)) expected.push({ type: "spell", cardId: id, target });
            });
          }
        }
      }
      const listed = legal.filter((each) => each.type === "spell");
      need(sameSet(listed, expected), "spells", () => `${label}: listed ${json(listed)}, the rules give ${json(expected)}`);
      if (action.type === "spell") {
        const effect = cardOf(action.cardId).effect;
        const hit = effect === "hellfire" ? slots.filter((slot) => enemy[slot]) : [action.target];
        const want = hit.map((slot) => ({ type: "spell", side, cardId: action.cardId, target: enemy[slot].cardId,
          left: effect === "tie" ? enemy[slot].health : enemy[slot].health - 1, stunned: effect === "tie" }));
        need(same(events, want), "spells", () => `${label}: ${json(events)}, the rules give ${json(want)}`);
        enemy.forEach((troop, slot) => {
          if (!troop) return;
          const left = !hit.includes(slot) ? troop : effect === "tie" ? { ...troop, stunned: true } : troop.health > 1 ? { ...troop, health: troop.health - 1 } : null;
          need(same(after.sides[foe].board[slot], left), "spells", () => `${label}: ${troop.cardId} after ${action.cardId}: ${json(after.sides[foe].board[slot])}`);
        });
        need(same(after.sides[side].discard, [...before.sides[side].discard, action.cardId]), "spells", () => `${label}: ${action.cardId} did not go to the graveyard`);
      }
      log = logAfter(log, before, action);
    },
  });
}

// ---------------------------------------------------------------- rb1-game-end
function checkGameEnd(raw, engine) {
  const judge = (state, label) => {
    const down = SIDES.filter((side) => state.sides[side].base === 0);
    const [cowboy, wizard] = SIDES.map((side) => state.sides[side].base);
    const expected = down.length ? { winner: opponent(down[0]), reason: "base" }
      : state.turn > TURN_CAP ? { winner: cowboy === wizard ? null : cowboy > wizard ? "cowboy" : "wizard", reason: "turn-cap" } : null;
    need(down.length < 2 && same(state.result, expected), "game-end",
      () => `${label}: turn ${state.turn}, Bases ${cowboy}/${wizard}, result ${json(state.result)}, the rules give ${json(expected)}`);
    if (!state.result) return;
    need(engine.legalActions(state).length === 0, "game-end", () => `${label}: actions are listed after the result`);
    let refused = false;
    try { engine.applyAction(state, { type: "end" }); } catch { refused = true; }
    need(refused, "game-end", () => `${label}: a finished game accepted another turn`);
  };
  play(gameOf(raw), engine, { onStart: (state) => judge(state, "deal"), onStep: ({ step, state }) => judge(state, `step ${step}`) });
}

// ---------------------------------------------------------------- rules-fatigue-clock
// A side draws at each of its turns (the first side from turn 3), and an empty deck costs its Base
// one orb a turn instead, so its Base is gone by turn 2 x (deck + Base), +1 for the first side.
function checkFatigueClock(raw, engine, seen) {
  const { start, end } = play(gameOf(raw), engine);
  const bound = Math.min(TURN_CAP + 1, ...SIDES.map((side) => 2 * (start.sides[side].deck.length + start.sides[side].baseMax) + (side === start.first ? 1 : 0)));
  need(end.turn <= bound, "fatigue-clock", () => `the game ended on turn ${end.turn}, past the fatigue bound ${bound}`);
  need(bound > TURN_CAP || end.result.reason === "base", "fatigue-clock", () => `the bound ${bound} is inside the cap, but the game ended by ${end.result.reason}`);
  seen.push({ turn: end.turn, reason: end.result.reason, bound, override: raw.baseOrbs !== null });
}
const observeClock = (games) => ({
  games: games.length,
  maxFinalTurn: games.reduce((max, game) => Math.max(max, game.turn), 0),
  maxDuelBaseBound: games.reduce((max, game) => (game.override ? max : Math.max(max, game.bound)), 0),
  turnCapEndings: games.filter((game) => game.reason === "turn-cap").length,
  pastGoal: {
    turn: TURN_GOAL,
    duelBases: games.filter((game) => !game.override && game.turn > TURN_GOAL).length,
    baseOverride: games.filter((game) => game.override && game.turn > TURN_GOAL).length,
  },
});

// ---------------------------------------------------------------- contract-hidden-invariance
// The same state with every card hidden from `viewer` dealt again: its own deck reordered, the
// other side's hand, traps and deck shuffled together and split at the same sizes, another seed.
export function redeal(state, viewer, seed) {
  const next = random(seed);
  const shuffle = (items) => {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [items[i], items[j]] = [items[j], items[i]];
    }
    return items;
  };
  const twin = structuredClone(state);
  twin.seed = state.seed + 1;
  shuffle(twin.sides[viewer].deck);
  const other = twin.sides[opponent(viewer)];
  const pool = shuffle([...other.hand, ...other.traps, ...other.deck]);
  other.hand = pool.splice(0, other.hand.length);
  other.traps = pool.splice(0, other.traps.length);
  other.deck = pool;
  return twin;
}
function checkHiddenInvariance(raw, engine) {
  const look = (state, label, salt) => {
    for (const viewer of SIDES) {
      const twin = redeal(state, viewer, (raw.twinSeed + salt) >>> 0);
      need(same(engine.viewFor(state, viewer), engine.viewFor(twin, viewer)), "hidden-invariance",
        () => `${label}: viewFor(state, ${viewer}) changed when the cards hidden from ${viewer} were dealt again`);
    }
  };
  play(gameOf(raw), engine, { onStart: (state) => look(state, "deal", 0), onStep: ({ step, state }) => look(state, `step ${step}`, step + 1) });
}

// ---------------------------------------------------------------- contract-public-agreement
function checkPublicAgreement(raw, engine) {
  const look = (state, label) => {
    const views = Object.fromEntries(SIDES.map((viewer) => [viewer, engine.viewFor(state, viewer)]));
    const table = (viewer) => {
      const { viewer: _, sides, ...rest } = views[viewer];
      return { ...rest, sides: Object.fromEntries(SIDES.map((name) => { const { hand, traps, ...open } = sides[name]; return [name, open]; })) };
    };
    need(same(table("cowboy"), table("wizard")), "public-agreement", () => `${label}: the two seats see different public tables`);
    for (const viewer of SIDES) {
      const view = views[viewer];
      need(view.viewer === viewer && ["turn", "active", "first", "location", "arrivals", "result"].every((key) => same(view[key], state[key])), "public-agreement",
        () => `${label}: ${viewer} sees the table wrong`);
      for (const name of SIDES) {
        const [seen, truth] = [view.sides[name], state.sides[name]];
        need(same(seen.board, truth.board) && same(seen.discard, truth.discard) && seen.base === truth.base && seen.baseMax === truth.baseMax
          && seen.handCount === truth.hand.length && seen.deckCount === truth.deck.length && seen.trapCount === truth.traps.length, "public-agreement",
        () => `${label}: ${viewer} sees ${name}'s public zones or counts wrong`);
      }
      need(same(view.sides[viewer].hand, state.sides[viewer].hand) && same(view.sides[viewer].traps, state.sides[viewer].traps), "public-agreement",
        () => `${label}: ${viewer} does not see its own hand and traps`);
    }
  };
  play(gameOf(raw), engine, { onStart: (state) => look(state, "deal"), onStep: ({ step, state }) => look(state, `step ${step}`) });
}

// ---------------------------------------------------------------- contract-count-accounting
function checkCountAccounting(raw, engine) {
  play(gameOf(raw), engine, {
    onStep({ step, before, action, state: after, events }) {
      for (const side of SIDES) {
        const seat = opponent(side);
        const [was, now] = [engine.viewFor(before, seat).sides[side], engine.viewFor(after, seat).sides[side]];
        const count = (type) => events.filter((event) => event.type === type && event.side === side).length;
        const played = side === before.active && PLAYS.has(action.type) ? 1 : 0;
        const announced = { deckCount: -(count("draw") + count("burn")), handCount: count("draw") - played, trapCount: count("set") - count("trap") };
        for (const [key, delta] of Object.entries(announced)) {
          need(now[key] - was[key] === delta, "count-accounting", () => `step ${step}: ${seat} saw ${side}'s ${key} move by ${now[key] - was[key]}, the events announce ${delta}`);
        }
      }
    },
  });
}

// ---------------------------------------------------------------- stable-json-replay
function checkJsonReplay(raw, engine) {
  const plain = (state, label) => need(same(JSON.parse(json(state)), state), "json-replay", () => `${label}: the state does not survive JSON`);
  play(gameOf(raw), engine, {
    onStart: (state) => plain(state, "deal"),
    onStep({ step, before, legal, action, state: after, events }) {
      const copy = JSON.parse(json(before));
      need(same(engine.legalActions(copy), legal), "json-replay", () => `step ${step}: a JSON copy lists other actions`);
      const again = engine.applyAction(copy, action);
      need(same(again.state, after) && same(again.events, events), "json-replay", () => `step ${step}: ${json(action)} plays differently on a JSON copy`);
      plain(after, `step ${step}`);
    },
  });
}

// ---------------------------------------------------------------- stable-log-replay
// applyAction leaves its input alone, and the seed, options and action log alone deal the game
// again and reproduce every state and event. json-replay checks one step on a copy; this checks
// the whole game from a fresh deal, so state kept between steps outside `state` would show.
function checkLogReplay(raw, engine) {
  const game = gameOf(raw);
  const log = [];
  let first;
  const pure = {
    ...engine,
    applyAction(state, action) {
      const before = structuredClone(state);
      const out = engine.applyAction(state, action);
      need(same(state, before), "log-replay", () => `step ${log.length}: ${json(action)} changed the state it was given`);
      return out;
    },
  };
  play(game, pure, { onStart: (state) => { first = state; }, onStep: ({ action, state, events }) => log.push({ action, state, events }) });
  let state = engine.createShowdown(game.seed, structuredClone(game.options));
  need(same(state, first), "log-replay", "the same seed and options dealt a different game");
  log.forEach((entry, step) => {
    const out = engine.applyAction(state, entry.action);
    need(same(out.state, entry.state) && same(out.events, entry.events), "log-replay", () => `step ${step}: replaying ${json(entry.action)} from the log gave another result`);
    state = out.state;
  });
}

// ---------------------------------------------------------------- the properties
const RB = "prototypes/showdown/RULEBOOK.md";
const CONTRACT = "src/game/showdown/contract.js";
const RULES = "src/game/showdown/rules.js";
const CARDS = "src/game/showdown/cards.js";
const rb = (section, quote) => ({ source: RB, section, quote });

export const PROPERTIES = Object.freeze([
  { id: "rb3-deal", name: "the deal gives each side its declared deck: 4 cards, 5 for the second side, nothing lost or doubled", arbitrary: dealArb, check: checkDeal,
    clauses: [rb("3. Setting up", "Shuffle both decks. Each side draws 4 cards."), rb("3. Setting up", "One side goes first. The side that goes second draws 1 more card."),
      { source: RULES, quote: "opening is {cowboy, wizard} lists of {type, health} troops already on the board, for a bounty's boss." }] },
  { id: "rb2-card-zones", name: "every card is in exactly one zone of its owner, and each zone holds only its kind of card", arbitrary: gameArb, check: checkZones,
    clauses: [rb("2. The cards", "A troop with no orbs is defeated and goes to its owner's graveyard."), rb("2. The cards", "On that troop, and to the graveyard with it"),
      rb("8. Gear and locations", "Playing one sends the location in play to its owner's graveyard, whoever played it.")] },
  { id: "rb2-frame", name: "only fights, spells, tributes and traps remove troops; only attacks and fatigue cost Base orbs", arbitrary: gameArb, check: checkFrame,
    clauses: [rb("5. Attacking", "Damage beyond its last orb hits its owner's Base."), rb("4. A turn", "If your deck is empty, your Base loses 1 orb instead."),
      rb("2. The cards", "5 and 6 cost one **tribute**: one of your own troops, sent to the graveyard."), rb("10. Rulings", "Damage from Sweep never reaches a Base.")] },
  { id: "rb5-targets", name: "attack targets obey Guard, the open Base and Ride", arbitrary: gameArb, check: checkTargets,
    clauses: [rb("5. Attacking", "If the enemy has a troop with Guard, you must choose a Guard troop."), rb("5. Attacking", "You may attack the Base directly only when the enemy has no troops."),
      rb("9. Keywords", "Can ride past enemy troops to strike the Base for 1 orb, unless one of them has Guard."), rb("10. Rulings", "A rider cannot ride past a Guard troop.")] },
  { id: "rb5-who-acts", name: "a troop attacks only when rested, unstunned, armed and not yet acted; any troop that has not acted may take cover", arbitrary: gameArb, check: checkWhoActs,
    clauses: [rb("4. A turn", "Nobody attacks on turn 1."), rb("5. Attacking", "A troop that was free cannot attack on the turn it arrives. A troop paid for with a tribute can."),
      rb("9. Keywords", "Can attack on the turn it arrives, even when it was free."), rb("9. Keywords", "a stunned troop cannot attack on its owner's next turn. It can still take cover."),
      rb("10. Rulings", "A troop with no attack cannot attack."), rb("10. Rulings", "The returning troop rests, whatever it cost, unless it has Quickdraw."),
      rb("6. Taking cover", "Instead of attacking, a troop may take cover, even on the turn it arrives."),
      { source: RULES, quote: "A boss due this turn lands on the first free slot. It was not paid for, so it rests like any free troop." }] },
  { id: "rb4-card-plays", name: "one troop, one spell, gear or location and one trap a turn, all before any troop acts, at the right tribute", arbitrary: gameArb, check: checkCardPlays,
    clauses: [rb("4. A turn", "in any order, each at most once a turn"), rb("4. A turn", "Once any troop acts, you cannot play more cards this turn."),
      rb("3. Setting up", "Each side's board has 3 troop slots and 2 trap slots."), rb("2. The cards", "1 to 4 stars are free. 5 and 6 cost one **tribute**"), rb("2. The cards", "7 and up cost two.")] },
  { id: "rb4-turn-boundary", name: "ending a turn stands the next side up, recovers the ender's stuns and draws exactly once", arbitrary: gameArb, check: checkTurnBoundary,
    clauses: [rb("4. A turn", "Your troops that acted last turn can act again, and any that took cover leave it."), rb("4. A turn", "If your deck is empty, your Base loses 1 orb instead."),
      rb("4. A turn", "If you already hold 6 cards, the card you draw is discarded."), rb("4. A turn", "Your stunned troops recover."),
      rb("10. Rulings", "The limit is checked only when you draw.")] },
  { id: "rb5-fight-numbers", name: "a fight's damage, overflow, cover and hit-back follow the troops' attack values", arbitrary: gameArb, check: checkFightNumbers,
    clauses: [rb("5. Attacking", "The target loses orbs equal to your troop's attack. Damage beyond its last orb hits its owner's Base."),
      rb("5. Attacking", "A target that survives deals its own attack to your troop. A defeated target does not hit back."),
      rb("5. Attacking", "A direct attack removes orbs equal to your troop's attack."), rb("6. Taking cover", "damage beyond its last orb does not reach your Base;"),
      rb("10. Rulings", "Riding past is always 1 orb, whatever the rider's attack.")] },
  { id: "rb9-sweep-last-stand", name: "Sweep and Last Stand settle after the fight, and Sweep never reaches a Base", arbitrary: gameArb, check: checkAfterFight,
    clauses: [rb("9. Keywords", "When it attacks a troop, every other enemy troop loses 1 orb."), rb("9. Keywords", "When it is defeated in a fight, the troop that fought it loses 1 orb."),
      rb("10. Rulings", "The other troops lose their orb after the fight is settled, and they do not hit back. Sweep does not fire on a direct attack on the Base."),
      rb("10. Rulings", "It does not fire for a tribute, a spell, a trap or Sweep. If both troops fall, it does nothing."),
      rb("10. Rulings", "A troop in cover that is defeated still makes its Last Stand.")] },
  { id: "rb7-traps", name: "the oldest trap springs on each enemy attack, one per attack, and the attack still spends the troop", arbitrary: gameArb, check: checkTraps,
    clauses: [rb("7. Traps", "When an enemy troop attacks, your oldest face-down trap springs before the attack lands. One trap springs per attack."),
      rb("7. Traps", "A trap springs on any attack, including one on your Base."),
      rb("7. Traps", "An attack that a trap cancels, or whose attacker a trap defeats, is still that troop's action for the turn."),
      rb("10. Rulings", "A troop the trap defeats takes its gear to the graveyard.")] },
  { id: "rb8-gear-locations", name: "gear stays and adds; one location for the table, replaced to its owner's graveyard, never over itself", arbitrary: gameArb, check: checkGearAndLocations,
    clauses: [rb("8. Gear and locations", "goes on one of your troops and stays. A troop may carry any number. Gear that adds orbs can lift a troop above the orbs printed on its card."),
      rb("8. Gear and locations", "Only one location is in play."), rb("8. Gear and locations", "A location affects both sides: every troop of the type it names."),
      rb("8. Gear and locations", "You cannot play a location that has the same name as the one in play.")] },
  { id: "rb9-arrivals", name: "tributes pay first, Scout draws, Raise returns the last Undead, and bosses land when due", arbitrary: gameArb, check: checkArrivals,
    clauses: [rb("9. Keywords", "When it arrives, draw a card."), rb("9. Keywords", "When it arrives, the last Undead troop in your graveyard returns with 1 orb."),
      rb("10. Rulings", "Tributes go to the graveyard before the troop arrives, so a Wizard paid for with a Skeleton brings that Skeleton back. Raise does nothing when your board is full or no Undead troop is in your graveyard."),
      rb("10. Rulings", "If your deck is empty, Scout draws nothing and your Base loses nothing."),
      { source: RULES, quote: "a boss that lands by itself at the start of its side's turn `turn`, or the first turn after with a free slot." }] },
  { id: "rb10-spells", name: "spells reach only legal targets: Ghostly cannot be chosen, no second stun, Hellfire hits every enemy troop", arbitrary: gameArb, check: checkSpells,
    clauses: [rb("10. Rulings", "stops spells that choose a target. Hellfire chooses none, so it still burns a Ghostly troop."),
      rb("10. Rulings", "Stunning a troop that is already stunned is not allowed."), rb("2. The cards", "The graveyard, once it resolves"),
      { source: CARDS, quote: "모든 적 부대에서 오브 1개씩 제거합니다." }, { source: CARDS, quote: "적 부대 하나를 기절시킵니다. 다음 턴에 공격할 수 없습니다." }] },
  { id: "rb1-game-end", name: "the game ends exactly when a Base reaches 0 or after turn 80, and nothing is legal afterwards", arbitrary: gameArb, check: checkGameEnd,
    clauses: [rb("1. What you need to win", "A Base with no orbs loses."), rb("10. Rulings", "A game still going after turn 80 goes to the side whose Base has more orbs.")] },
  { id: "rules-fatigue-clock", name: "an empty deck ends every game by turn 2 x (deck + Base) + 1 for either side, within the turn cap", arbitrary: gameArb, check: checkFatigueClock, observe: observeClock,
    clauses: [{ source: RULES, quote: "Only a guard against an endless game: an empty deck already ends games." }, rb("4. A turn", "On turn 1 the first player does not draw.")] },
  { id: "contract-hidden-invariance", name: "a seat's view does not change when the cards hidden from it are dealt again", arbitrary: twinArb, check: checkHiddenInvariance,
    clauses: [{ source: CONTRACT, quote: "Its own hand and traps are listed; the other side's are counts. Neither deck's order is visible to anyone." },
      { source: CONTRACT, quote: "The seed is left out: with it, anyone could deal the game again and read both hands and both decks." },
      rb("7. Traps", "Your opponent sees how many, not which.")] },
  { id: "contract-public-agreement", name: "both seats see the same, true public table, and each sees its own hand and traps", arbitrary: gameArb, check: checkPublicAgreement,
    clauses: [{ source: CONTRACT, quote: "Boards, Bases, graveyards and the location are public, and so is a boss due to land." }] },
  { id: "contract-count-accounting", name: "every change to a hidden zone's size is announced by an event", arbitrary: gameArb, check: checkCountAccounting,
    clauses: [{ source: CONTRACT, quote: "A screen that shows only viewFor and reacts only to EVENTS cannot leak a hidden card and cannot miss a rule." },
      { source: CONTRACT, quote: "One card moves from that side's deck to its hand, face down to the other side." },
      { source: CONTRACT, quote: "That side puts one card face down in a trap slot. The card is not named." }] },
  { id: "stable-json-replay", name: "a JSON copy of any reachable state is the same state and plays on identically", arbitrary: gameArb, check: checkJsonReplay,
    clauses: [], stable: "The rules state is plain data: a replay log, a save or a message between screens can carry it as JSON." },
  { id: "stable-log-replay", name: "applyAction leaves its input unchanged, and the seed plus the action log replay the whole game", arbitrary: gameArb, check: checkLogReplay,
    clauses: [{ source: RULES, quote: "mulberry32: the same seed always gives the same deal." }],
    stable: "Deterministic replay: one action is applied once, to a new state, so a seed and an action log are a complete record of a game." },
]);
export const propertyById = (id) => PROPERTIES.find((property) => property.id === id);

// ---------------------------------------------------------------- running and reporting
// Each property gets its own fast-check seed: FNV-1a of "<base seed>:<id>".
export function seedFor(baseSeed, id) {
  let hash = 0x811c9dc5;
  for (const char of `${baseSeed}:${id}`) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193);
  return hash | 0;
}

// Runs one property with fc.check: a real result with its seed and case count, and on failure the
// shrunk counterexample with its replay path.
export function runProperty(property, { engine = ENGINE, baseSeed = BASE_SEED, numRuns = QUICK_RUNS, path } = {}) {
  const seen = [];
  const details = fc.check(fc.property(property.arbitrary, (raw) => { property.check(raw, engine, seen); }),
    { seed: seedFor(baseSeed, property.id), numRuns, ...(path ? { path } : {}) });
  const result = { id: property.id, name: property.name, runs: details.numRuns, passed: !details.failed, seed: details.seed };
  if (details.failed) {
    const error = details.errorInstance ?? details.error;
    result.error = { message: String(error?.message ?? error ?? "property returned false").split("\n")[0], shrinks: details.numShrinks,
      path: details.counterexamplePath, counterexample: details.counterexample?.[0] ?? null };
  } else if (property.observe) {
    result.observed = property.observe(seen);
  }
  return result;
}

const SCRIPT = "node scripts/showdown-dec4-properties.mjs";
export const commandFor = ({ baseSeed, numRuns, ids, path }) =>
  `${SCRIPT}${numRuns ? ` --runs ${numRuns}` : ""} --seed ${baseSeed}${ids?.length ? ` --only ${ids.join(",")}` : ""}${path ? ` --path ${path}` : ""}`;

// The relative-import closure of this script plus the rulebook its clauses quote, repo-relative.
const IMPORT = /^\s*(?:import|export)\b[^;]*?\bfrom\s*["'](\.{1,2}\/[^"']+)["']|^\s*import\s*["'](\.{1,2}\/[^"']+)["']/gm;
export function sourceFiles() {
  const files = new Set();
  const visit = (file) => {
    if (files.has(file)) return;
    files.add(file);
    for (const match of readFileSync(file, "utf8").matchAll(IMPORT)) visit(resolve(dirname(file), match[1] ?? match[2]));
  };
  visit(fileURLToPath(import.meta.url));
  files.add(resolve(ROOT, RB));
  return [...files].map((file) => relative(ROOT, file)).sort();
}

export function fingerprint() {
  const files = sourceFiles().map((path) => ({ path, sha256: sha256(readFileSync(resolve(ROOT, path))) }));
  const fastCheck = JSON.parse(readFileSync(resolve(ROOT, "node_modules/fast-check/package.json"), "utf8")).version;
  const digest = sha256(`${files.map((file) => `${file.sha256}  ${file.path}\n`).join("")}fast-check ${fastCheck}\n`);
  return { algorithm: "sha256", digest, fastCheck, files };
}

// The checked-out commit, read from .git (a worktree's .git file points at its gitdir). null when
// it cannot be read; the scorecard then rejects the receipt instead of trusting a guess.
export function readCommit(root = ROOT) {
  try {
    let gitDir = resolve(root, ".git");
    const marker = readFileSync(gitDir, { encoding: "utf8", flag: "r" });
    gitDir = resolve(root, marker.match(/^gitdir:\s*(.+)$/m)[1].trim());
    return commitIn(gitDir);
  } catch (error) {
    if (error.code === "EISDIR") return commitIn(resolve(root, ".git"));
    return null;
  }
}
function commitIn(gitDir) {
  try {
    const head = readFileSync(resolve(gitDir, "HEAD"), "utf8").trim();
    if (/^[0-9a-f]{40}$/.test(head)) return head;
    const ref = head.match(/^ref:\s*(.+)$/)?.[1];
    if (!ref) return null;
    let common = gitDir;
    try { common = resolve(gitDir, readFileSync(resolve(gitDir, "commondir"), "utf8").trim()); } catch { /* not a linked worktree */ }
    for (const dir of [gitDir, common]) {
      try { return readFileSync(resolve(dir, ref), "utf8").trim().match(/^[0-9a-f]{40}$/)[0]; } catch { /* try packed refs */ }
    }
    const packed = readFileSync(resolve(common, "packed-refs"), "utf8");
    return packed.split("\n").find((line) => line.endsWith(` ${ref}`))?.slice(0, 40) ?? null;
  } catch {
    return null;
  }
}

// The receipt without the fields that name when and where it ran, hashed: equal for equal runs.
export const stableDigest = (report) => {
  const { commit: _commit, generatedAt: _at, stableSha256: _digest, ...rest } = report;
  return sha256(json(rest));
};

export function buildReport(results, { baseSeed = BASE_SEED, numRuns = QUICK_RUNS, ids = null, path = null, commit = readCommit(), generatedAt = new Date().toISOString() } = {}) {
  const failed = results.filter((result) => !result.passed);
  const report = {
    schema: SCHEMA,
    generator: GENERATOR,
    ruleset: "showdown",
    commit,
    generatedAt,
    authorship: AUTHORSHIP,
    command: commandFor({ baseSeed, numRuns, ids, path }),
    params: { baseSeed, numRuns, only: ids?.length ? ids : null, path: path ?? null },
    fingerprint: fingerprint(),
    turnCap: { engine: TURN_CAP, stepGoal: TURN_GOAL, kept: "engine", note: TURN_NOTE },
    summary: { properties: results.length, passed: results.length - failed.length, failed: failed.length, runs: results.reduce((sum, result) => sum + result.runs, 0) },
    properties: results.map(({ id, name, runs, passed, seed, observed }) => ({
      id, name, file: TEST_FILE, status: passed ? "passed" : "failed", numRuns: runs, runs, passed, seed, ...(observed ? { observed } : {}),
    })),
    errors: failed.map(({ id, runs, seed, error }) => ({ id, runs, seed, ...error, replay: commandFor({ baseSeed, ids: [id], path: error.path }) })),
  };
  return { ...report, stableSha256: stableDigest(report) };
}

// The docs/SCORECARD.md receipt contract, checked field by field. Returns the problems found.
export function receiptProblems(report) {
  const problems = [];
  if (report?.schema !== SCHEMA) problems.push(`schema is ${json(report?.schema)}, not ${SCHEMA}`);
  if (!/^[0-9a-f]{40}$/.test(report?.commit ?? "")) problems.push(`commit ${json(report?.commit)} is not a 40-hex commit`);
  if (typeof report?.generatedAt !== "string" || Number.isNaN(Date.parse(report.generatedAt)) || new Date(report.generatedAt).toISOString() !== report.generatedAt) {
    problems.push(`generatedAt ${json(report?.generatedAt)} is not an ISO time`);
  }
  if (!Array.isArray(report?.properties) || !report.properties.length) problems.push("no properties");
  for (const entry of report?.properties ?? []) {
    if (typeof entry.id !== "string" || !entry.id) problems.push(`a property has no id: ${json(entry)}`);
    if (!/^tests\/.+\.test\.js$/.test(entry.file ?? "")) problems.push(`${entry.id}: file ${json(entry.file)} is not a test file`);
    if (!["passed", "failed"].includes(entry.status) || (entry.status === "passed") !== entry.passed) problems.push(`${entry.id}: status ${json(entry.status)} and passed ${json(entry.passed)} disagree`);
    if (!Number.isInteger(entry.numRuns) || entry.numRuns < 1 || entry.numRuns !== entry.runs) problems.push(`${entry.id}: numRuns ${json(entry.numRuns)} / runs ${json(entry.runs)}`);
    if (!Number.isInteger(entry.seed)) problems.push(`${entry.id}: seed ${json(entry.seed)} is not an integer`);
  }
  const ids = (report?.properties ?? []).map((entry) => entry.id);
  if (new Set(ids).size !== ids.length) problems.push("a property id is listed twice");
  if (report?.stableSha256 !== stableDigest(report ?? {})) problems.push("stableSha256 does not match the receipt");
  return problems;
}

const USAGE = `usage: ${SCRIPT} [--runs N | --ci] [--seed N] [--only id,id] [--path P] [--report [file]] [--list]`;

export function parseArgs(argv) {
  const opts = { numRuns: QUICK_RUNS, baseSeed: BASE_SEED, ids: null, path: null, report: null, list: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) throw new RangeError(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--ci") opts.numRuns = CI_RUNS;
    else if (arg === "--runs") opts.numRuns = Number(value());
    else if (arg === "--seed") opts.baseSeed = Number(value());
    else if (arg === "--only") opts.ids = value().split(",").filter(Boolean);
    else if (arg === "--path") opts.path = value();
    else if (arg === "--report") opts.report = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : DEFAULT_REPORT;
    else if (arg === "--list") opts.list = true;
    else throw new RangeError(`unknown option ${arg}`);
  }
  if (!Number.isInteger(opts.numRuns) || opts.numRuns < 1) throw new RangeError("--runs must be a whole number of at least 1");
  if (!Number.isInteger(opts.baseSeed) || opts.baseSeed !== (opts.baseSeed | 0)) throw new RangeError("--seed must be a 32-bit integer");
  for (const id of opts.ids ?? []) if (!propertyById(id)) throw new RangeError(`unknown property ${id}`);
  return opts;
}

function main(argv) {
  let opts;
  try { opts = parseArgs(argv); } catch (error) {
    console.error(`${error.message}\n${USAGE}`);
    return 2;
  }
  if (opts.list) {
    for (const property of PROPERTIES) {
      console.log(`${property.id}: ${property.name}`);
      for (const { source, section, quote } of property.clauses) console.log(`    ${source}${section ? ` §${section}` : ""}: "${quote}"`);
      if (property.stable) console.log(`    stable property: ${property.stable}`);
    }
    return 0;
  }
  const chosen = opts.ids ? opts.ids.map(propertyById) : PROPERTIES;
  const results = [];
  const began = performance.now();
  for (const property of chosen) {
    const started = performance.now();
    const result = runProperty(property, opts);
    results.push(result);
    console.log(`${result.passed ? "PASS" : "FAIL"} ${property.id.padEnd(27)} ${String(result.runs).padStart(6)} runs  seed ${String(result.seed).padStart(11)}  ${Math.round(performance.now() - started)} ms`);
    if (result.observed) console.log(`     observed ${json(result.observed)}`);
    if (!result.passed) {
      console.log(`     ${result.error.message}\n     ${result.error.shrinks} shrinks; counterexample ${json(result.error.counterexample)}`);
      console.log(`     replay: ${commandFor({ baseSeed: opts.baseSeed, ids: [property.id], path: result.error.path })}`);
    }
  }
  const passed = results.filter((result) => result.passed).length;
  console.log(`${passed}/${results.length} properties passed, ${results.reduce((sum, result) => sum + result.runs, 0)} runs, ${Math.round(performance.now() - began)} ms (base seed ${opts.baseSeed}, fast-check ${opts.numRuns} runs each)`);
  if (opts.report) {
    const file = resolve(opts.report);
    const report = buildReport(results, opts);
    const text = `${JSON.stringify(report, null, 2)}\n`;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
    console.log(`report ${relative(process.cwd(), file)} sha256 ${sha256(text)} stableSha256 ${report.stableSha256} inputs ${report.fingerprint.digest} commit ${report.commit}`);
    for (const problem of receiptProblems(report)) console.log(`     receipt contract: ${problem}`);
  }
  return passed === results.length ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
