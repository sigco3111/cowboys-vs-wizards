#!/usr/bin/env node
// Production-engine side of the cross-language Showdown replay.
//
// It replays one externally supplied duel through the real engine (src/game/showdown/rules.js)
// and reports, for every input action, whether the engine accepted it and the state after it.
// Scope: standard single Showdown duels. No progression, bounty bosses or arrivals.
//
// Duel input (the boundary contract):
//   {seed, first, decks: {cowboy: [instance IDs in draw order], wizard: [...]}, actions: [...], cardNames?}
//   - seed: uint32. first: "cowboy" | "wizard", the side that takes turn 1.
//   - decks: each side's whole deck before any draw. The first 4 cards (5 for the side that goes
//     second) are the opening hand; the rest is the deck, top first.
//   - instance ID: lowercase hyphenated catalog type plus a numeric copy suffix, "cowboy-sheriff-2".
//   - cardNames (optional): {catalog type: printed name}; any disagreement with the catalog throws.
//   - actions: summon{cardId,tributes:[slots]}, spell{cardId,target?}, gear{cardId,slot},
//     location{cardId}, set{cardId}, attack{slot,target: slot | "base"}, cover{slot}, end.
//     Slots are zero-based. Key order does not matter; tributes are read as a set.
//
// Exports:
//   SIDES, ACTION_TYPES           the two sides; the eight action types
//   INSTANCE_ID                   RegExp for an instance ID (group 1 type, group 2 copy)
//   decodeInstance(id)            -> {id, type, copy, side, name, kind}; throws on an unknown ID
//   validateDuel(duel)            throws when the duel input itself is malformed; returns duel
//   deckCounts(decks)             -> {cowboy: {type: count}, wizard: {...}} in first-seen order
//   seededDeal(seed, deckList)    -> {seed, first, decks}: the real seeded deal as ordered decks
//   checkDealAgreement(duel, deckList) -> {agrees, mismatches}: ordered decks vs the real deal
//   initialState(duel)            -> production engine state built from the ordered decks
//   canonicalAction(input)        -> {action} in the engine's shape, or {error: "malformed: ..."}
//   applyInput(state, input)      -> {accepted, state, events, error?}; a rejection returns the
//                                    same state object, unchanged
//   normalize(state)              -> provisional normalized state (see below)
//   replayDuel(duel, options)     -> {initial, steps: [{index, accepted, error?, events?, state?}],
//                                    final, result, terminal}
//
// normalize() is PROVISIONAL. The Python referee owns the normalized output schema; once it is
// published, replace normalize() (or pass `normalizer`) so this adapter translates into that
// schema. Never change the referee's schema to fit this file.
//
// Production behavior a referee may not share (reported, not patched here):
//   - legalActions lists one entry per card name, so only the first copy of a name in hand can be
//     played. Playing a later copy of the same card is rejected as illegal.
//   - Tributes are sorted ascending before the engine sees them, so defeated tributes reach the
//     graveyard in slot order.
//
// CLI: node scripts/referee/engine.mjs [duel.json | -] [--final-only] [--normalizer module.mjs]
//   Reads one duel (stdin when no file or "-") and prints the replay as JSON.
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {OPENING_HAND, SECOND_PLAYER_CARDS, TRAP_SLOTS, applyAction, createShowdown} from "../../src/game/showdown/rules.js";
import {DECKS, TYPES} from "../../src/game/showdown/cards.js";
import CATALOG_NAMES from "./catalog-names.json" with {type: "json"};
// The referee judges against the original catalog's printed (English) names; the page may show translations.
export const printedName = (type) => CATALOG_NAMES[type] ?? TYPES[type].name;

export const SIDES = Object.freeze(["cowboy", "wizard"]);
export const ACTION_TYPES = Object.freeze(["summon", "spell", "gear", "location", "set", "attack", "cover", "end"]);
export const INSTANCE_ID = /^([a-z0-9]+(?:-[a-z0-9]+)*)-(0|[1-9][0-9]*)$/;

const DUEL_KEYS = new Set(["seed", "first", "decks", "actions", "cardNames"]);
const UINT32 = 2 ** 32;
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);

export function decodeInstance(id) {
  const match = typeof id === "string" ? INSTANCE_ID.exec(id) : null;
  if (!match) throw new Error(`card instance ${JSON.stringify(id)} is not a catalog type with a copy suffix`);
  const type = match[1];
  if (!Object.hasOwn(TYPES, type)) throw new Error(`card instance ${id} names no catalog entry`);
  const card = TYPES[type];
  return {id, type, copy: Number(match[2]), side: card.side, name: printedName(type), kind: card.kind};
}

export function validateDuel(duel) {
  if (!isObject(duel)) throw new Error("a duel must be a JSON object");
  for (const key of Object.keys(duel)) if (!DUEL_KEYS.has(key)) throw new Error(`unexpected duel field ${key}`);
  if (!Number.isInteger(duel.seed) || duel.seed < 0 || duel.seed >= UINT32) throw new Error(`seed must be a uint32, got ${JSON.stringify(duel.seed)}`);
  if (!SIDES.includes(duel.first)) throw new Error(`first must be "cowboy" or "wizard", got ${JSON.stringify(duel.first)}`);
  if (!isObject(duel.decks)) throw new Error("decks must be {cowboy: [...], wizard: [...]}");
  for (const key of Object.keys(duel.decks)) if (!SIDES.includes(key)) throw new Error(`unexpected deck ${key}`);
  const seen = new Set();
  for (const side of SIDES) {
    if (!Array.isArray(duel.decks[side])) throw new Error(`decks.${side} must be an array of instance IDs`);
    for (const id of duel.decks[side]) {
      const card = decodeInstance(id);
      if (card.side !== side) throw new Error(`${id} is a ${card.side} card in the ${side} deck`);
      if (seen.has(id)) throw new Error(`${id} appears twice`);
      seen.add(id);
    }
  }
  if (!Array.isArray(duel.actions)) throw new Error("actions must be an array");
  if (duel.cardNames !== undefined) {
    if (!isObject(duel.cardNames)) throw new Error("cardNames must map catalog types to printed names");
    for (const [type, name] of Object.entries(duel.cardNames)) {
      if (!Object.hasOwn(TYPES, type)) throw new Error(`cardNames lists ${type}, which is not in the catalog`);
      if (printedName(type) !== name) throw new Error(`cardNames says ${type} is ${JSON.stringify(name)}; the catalog prints ${JSON.stringify(printedName(type))}`);
    }
  }
  return duel;
}

export function deckCounts(decks) {
  const counts = {};
  for (const side of SIDES) {
    counts[side] = {};
    for (const id of decks[side]) {
      const {type} = decodeInstance(id);
      counts[side][type] = (counts[side][type] ?? 0) + 1;
    }
  }
  return counts;
}

// createShowdown shuffles each deck and deals the hand off the front, so the shuffled order is
// the hand followed by the remaining deck.
export function seededDeal(seed, deckList = DECKS) {
  const state = createShowdown(seed, {decks: deckList});
  const decks = Object.fromEntries(SIDES.map((side) => [side, [...state.sides[side].hand, ...state.sides[side].deck]]));
  return {seed, first: state.first, decks};
}

const handSize = (side, first) => OPENING_HAND + (side === first ? 0 : SECOND_PLAYER_CARDS);

// The engine's own constructor, with the supplied order put in place of its shuffle.
export function initialState(duel) {
  validateDuel(duel);
  const state = createShowdown(duel.seed, {first: duel.first, decks: deckCounts(duel.decks)});
  for (const side of SIDES) {
    const order = duel.decks[side];
    const n = handSize(side, duel.first);
    state.sides[side].hand = order.slice(0, n);
    state.sides[side].deck = order.slice(n);
  }
  return state;
}

// deckList is the list the deal was shuffled from, in its own order: the shuffle depends on it.
export function checkDealAgreement(duel, deckList = DECKS) {
  const real = createShowdown(duel.seed, {decks: deckList});
  const supplied = initialState(duel);
  const mismatches = [];
  if (real.first !== duel.first) mismatches.push("first");
  for (const side of SIDES) {
    for (const zone of ["hand", "deck"]) {
      if (JSON.stringify(real.sides[side][zone]) !== JSON.stringify(supplied.sides[side][zone])) mismatches.push(`${side}.${zone}`);
    }
  }
  if (!mismatches.length && JSON.stringify(real) !== JSON.stringify(supplied)) mismatches.push("state");
  return {agrees: mismatches.length === 0, mismatches};
}

const FIELDS = Object.freeze({
  summon: {required: ["cardId", "tributes"], optional: []},
  spell: {required: ["cardId"], optional: ["target"]},
  gear: {required: ["cardId", "slot"], optional: []},
  location: {required: ["cardId"], optional: []},
  set: {required: ["cardId"], optional: []},
  attack: {required: ["slot", "target"], optional: []},
  cover: {required: ["slot"], optional: []},
  end: {required: [], optional: []},
});

// The engine matches actions by JSON text, so the input is rebuilt in the engine's key order.
export function canonicalAction(input) {
  const malformed = (why) => ({error: `malformed: ${why}`});
  if (!isObject(input)) return malformed("an action must be an object");
  if (!Object.hasOwn(FIELDS, input.type)) return malformed(`unknown action type ${JSON.stringify(input.type)}`);
  const {type} = input;
  const shape = FIELDS[type];
  const allowed = new Set(["type", ...shape.required, ...shape.optional]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) return malformed(`${type} has no field ${key}`);
  for (const key of shape.required) if (input[key] === undefined) return malformed(`${type} needs ${key}`);
  if (Object.hasOwn(input, "cardId") && typeof input.cardId !== "string") return malformed("cardId must be a string");
  if (Object.hasOwn(input, "slot") && !Number.isInteger(input.slot)) return malformed("slot must be an integer");
  if (type === "attack" && !(Number.isInteger(input.target) || input.target === "base")) return malformed("attack target must be a slot or \"base\"");
  if (type === "spell" && input.target !== undefined && !Number.isInteger(input.target)) return malformed("spell target must be a slot");
  if (type === "summon" && !(Array.isArray(input.tributes) && input.tributes.every(Number.isInteger))) return malformed("tributes must be a list of slots");
  switch (type) {
    case "summon": return {action: {type, cardId: input.cardId, tributes: [...input.tributes].sort((a, b) => a - b)}};
    case "spell": return {action: input.target === undefined ? {type, cardId: input.cardId} : {type, cardId: input.cardId, target: input.target}};
    case "gear": return {action: {type, cardId: input.cardId, slot: input.slot}};
    case "location":
    case "set": return {action: {type, cardId: input.cardId}};
    case "attack": return {action: {type, slot: input.slot, target: input.target}};
    case "cover": return {action: {type, slot: input.slot}};
    default: return {action: {type: "end"}};
  }
}

export function applyInput(state, input) {
  const {action, error} = canonicalAction(input);
  if (!action) return {accepted: false, state, events: [], error};
  try {
    const applied = applyAction(state, action);
    return {accepted: true, state: applied.state, events: applied.events};
  } catch (thrown) {
    if (String(thrown?.message).startsWith("illegal action")) return {accepted: false, state, events: [], error: "illegal"};
    // A crash on an action the engine called legal is an engine fault, not a rejection.
    throw new Error(`engine failed on legal action ${JSON.stringify(action)}: ${thrown?.message}`, {cause: thrown});
  }
}

// Provisional: only what play can observe. `acted` is the engine's `attacked` flag (an attack or
// cover this turn). `resting` is a free troop on its arrival turn. Trap slot 0 springs first.
export function normalize(state) {
  const side = (name) => {
    const s = state.sides[name];
    return {
      base: s.base,
      baseMax: s.baseMax,
      hand: [...s.hand],
      deck: [...s.deck],
      discard: [...s.discard],
      troops: s.board.map((troop) => troop && {
        cardId: troop.cardId,
        orbs: troop.health,
        gear: [...troop.gear],
        acted: troop.attacked,
        cover: troop.cover,
        stunned: troop.stunned,
        resting: troop.arrived === state.turn && !troop.ready,
      }),
      traps: Array.from({length: TRAP_SLOTS}, (_, i) => s.traps[i] ?? null),
    };
  };
  return {
    turn: state.turn,
    active: state.active,
    first: state.first,
    allowances: {summon: !state.summonUsed, cast: !state.castUsed, set: !state.setUsed, cards: !state.attacking},
    location: state.location && {cardId: state.location.cardId, owner: state.location.side},
    result: state.result && {winner: state.result.winner, reason: state.result.reason},
    sides: {cowboy: side("cowboy"), wizard: side("wizard")},
  };
}

export function replayDuel(duel, {states = true, events = false, normalizer = normalize} = {}) {
  let state = initialState(duel);
  const initial = normalizer(state);
  const steps = duel.actions.map((input, index) => {
    const applied = applyInput(state, input);
    state = applied.state;
    return {
      index,
      accepted: applied.accepted,
      ...(applied.error ? {error: applied.error} : {}),
      ...(events ? {events: applied.events} : {}),
      ...(states ? {state: normalizer(state)} : {}),
    };
  });
  return {initial, steps, final: normalizer(state), result: state.result, terminal: Boolean(state.result)};
}

async function main(argv) {
  const finalOnly = argv.includes("--final-only");
  const at = argv.indexOf("--normalizer");
  let normalizer = normalize;
  if (at >= 0) {
    const module = await import(pathToFileURL(resolve(argv[at + 1])).href);
    normalizer = module.normalize ?? module.default;
    if (typeof normalizer !== "function") throw new Error("--normalizer module must export normalize or a default function");
  }
  const file = argv.find((arg, i) => !arg.startsWith("--") && (at < 0 || i !== at + 1));
  const text = !file || file === "-" ? readFileSync(0, "utf8") : readFileSync(file, "utf8");
  const replay = replayDuel(JSON.parse(text), {states: !finalOnly, normalizer});
  process.stdout.write(`${JSON.stringify(finalOnly ? {final: replay.final, result: replay.result, accepted: replay.steps.map((step) => step.accepted)} : replay)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
}
