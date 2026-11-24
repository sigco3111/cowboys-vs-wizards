#!/usr/bin/env node
// Seeded scenario corpus for the cross-language Showdown referee.
//
// Each duel starts from the real seeded deal of one standard deck list (checked against
// createShowdown with checkDealAgreement), then plays to a finished game (a Base falls or the
// turn cap ends it). Real moves come from a weighted legal-move sampler or the production CPU
// (levels 0, 1, 1.5, 2). Before some real moves the generator inserts one purposeful invalid
// probe built for a rule boundary that actually holds in that position (see PROBE KINDS below).
// A probe the engine would accept is not sent; it is counted as a constructor mismatch.
// Every emitted duel is replayed through engine.mjs: each real move must be accepted and each
// probe rejected, or generation stops with an error.
//
// Records carry inputs only: {id, origin, duel: {seed, first, decks, actions, cardNames}}.
// Which actions are probes, and every engine outcome, stay in the summary and never enter a record.
//
// Exports:
//   DECK_LISTS                 standard deck lists; a seed plays list VARIANTS[seed % 3]
//   VARIANTS                   ["even", "outfitted", "heavy"]
//   DEFAULT_POLICIES           {policy: weight} for each side's move source
//   PROBE_KINDS                every probe kind the generator can build
//   newStats()                 empty coverage counters
//   generate(options, stats)   generator of records; options {count, minMoves, seedStart,
//                              fresh, freshSeeds, probeRate, policies}. Plays `count - fresh`
//                              fixed seeds from seedStart, then `fresh` seeds from freshSeeds
//                              (skipping any seed already used), then more fixed seeds until
//                              `minMoves` actions were attempted.
//   summarize(stats)           stats plus coverage gaps
//   reservoir(size, seed)      seeded uniform sample of exactly `size` streamed items
//   rulesVersion()             sha256 of the rules, card table and generated card specs
//
// CLI (JSONL to --out or stdout, summary JSON to --summary or stderr):
//   node scripts/referee/corpus.mjs --count 2500 --min-moves 100000 --seed-start 1 --fresh 250 \
//     --out corpus.jsonl --summary summary.json --parity-out parity.jsonl [--parity-size 250]
//     [--parity-seed N] [--fresh-seeds a,b,c] [--probe-rate 0.2] [--policies sampler=4,bot2=1]
//   Fresh seeds come from crypto.randomInt unless --fresh-seeds replays a recorded list.
//   Exit 1 when the completed-duel or attempted-move target is not met.
import {createHash, randomInt} from "node:crypto";
import {once} from "node:events";
import {createWriteStream, readFileSync, writeFileSync} from "node:fs";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {parseArgs} from "node:util";
import {BOARD_SIZE, TRAP_SLOTS, applyAction, attackOf, attackOutcome, canAttack, legalActions, opponent, playTurn, random} from "../../src/game/showdown/rules.js";
import {DECKS, EFFECTS, RARITY, TYPES, cardOf, has, tributes, typeOf} from "../../src/game/showdown/cards.js";
import {ACTION_TYPES, SIDES, printedName, applyInput, checkDealAgreement, initialState, replayDuel, seededDeal} from "./engine.mjs";

// 16-card lists. "even" is the shipped even match; the other two add the earned gear, locations,
// Gatling Crew and second traps so every non-bounty card and action type gets played.
export const DECK_LISTS = Object.freeze({
  even: DECKS,
  outfitted: Object.freeze({
    cowboy: {"cowboy-sheriff": 2, "cowboy-outrider": 2, "cowboy-covered-wagon": 2, "cowboy-billy": 2, "cowboy-ranger": 1,
      "cowboy-dynamiter": 1, "cowboy-mounted-billy": 1, "cowboy-deadeye": 1, "cowboy-lasso": 1, "cowboy-bear-trap": 1,
      "cowboy-six-shooter": 1, "cowboy-sheriffs-office": 1},
    wizard: {"wizard-skeleton": 2, "wizard-jack-o-lantern": 1, "wizard-raven-familiar": 1, "wizard-imp": 1, "wizard-bone-wall": 2,
      "wizard-wizard": 2, "wizard-headless-horseman": 1, "wizard-dragon": 1, "wizard-singularity": 1, "wizard-hellfire": 1,
      "wizard-hex": 1, "wizard-bone-armor": 1, "wizard-boneyard": 1},
  }),
  heavy: Object.freeze({
    cowboy: {"cowboy-sheriff": 2, "cowboy-outrider": 1, "cowboy-covered-wagon": 2, "cowboy-billy": 2, "cowboy-ranger": 1,
      "cowboy-dynamiter": 1, "cowboy-mounted-billy": 1, "cowboy-gatling-crew": 1, "cowboy-deadeye": 1, "cowboy-lasso": 1,
      "cowboy-bear-trap": 2, "cowboy-six-shooter": 1},
    wizard: {"wizard-skeleton": 3, "wizard-jack-o-lantern": 1, "wizard-raven-familiar": 1, "wizard-imp": 1, "wizard-bone-wall": 1,
      "wizard-wizard": 2, "wizard-headless-horseman": 1, "wizard-dragon": 1, "wizard-singularity": 1, "wizard-hellfire": 1,
      "wizard-hex": 2, "wizard-bone-armor": 1},
  }),
});
export const VARIANTS = Object.freeze(Object.keys(DECK_LISTS));

// Standard decks only: right side, no bounty cards, within each rarity's copy limit.
for (const [variant, list] of Object.entries(DECK_LISTS)) {
  for (const side of SIDES) {
    for (const [type, count] of Object.entries(list[side])) {
      const card = TYPES[type];
      if (!card || card.side !== side) throw new Error(`${variant}: ${type} is not a ${side} card`);
      if (card.bounty) throw new Error(`${variant}: ${type} is a bounty card`);
      if (count > RARITY[card.rarity][1]) throw new Error(`${variant}: ${count} copies of ${type} break the ${card.rarity} limit`);
    }
  }
}

const LEVELS = Object.freeze({bot0: 0, bot1: 1, "bot1.5": 1.5, bot2: 2});
export const DEFAULT_POLICIES = Object.freeze({sampler: 4, bot0: 1, bot1: 2, "bot1.5": 1, bot2: 1});

export const PROBE_KINDS = Object.freeze([
  "summon-twice", "summon-unpaid", "summon-tribute-empty-slot", "summon-full-board", "summon-free-with-tribute",
  "cast-twice", "spell-empty-target", "spell-missing-target", "spell-target-off-board", "tie-stunned",
  "hellfire-empty-board", "gear-empty-slot", "location-repeat", "set-twice", "set-full",
  "card-from-deck", "card-from-opponent-hand", "card-after-acting",
  "attack-on-turn-one", "attack-twice", "attack-from-cover", "attack-stunned", "attack-while-resting",
  "attack-with-no-attack", "attack-past-guard", "ride-past-guard", "attack-base-while-defended",
  "attack-empty-slot", "attack-off-board", "attack-from-empty-slot",
  "cover-twice", "cover-after-attack", "cover-empty-slot",
]);

const counter = (keys) => Object.fromEntries(keys.map((key) => [key, 0]));
const bump = (table, key, by = 1) => { table[key] = (table[key] ?? 0) + by; };

export function newStats() {
  return {
    duels: {completed: 0, fixed: 0, fresh: 0, duplicateSeedsSkipped: 0, duplicateDealsSkipped: 0,
      distinctSeeds: 0, distinctDeals: 0, dealAgreement: {checked: 0, agreed: 0}, terminal: 0},
    seeds: {fixed: [], fresh: []},
    moves: {attempted: 0, accepted: 0, rejected: 0},
    accepted: counter(ACTION_TYPES),
    rejected: counter(ACTION_TYPES),
    probes: {sent: counter(PROBE_KINDS), constructorMismatch: {}},
    cardsDealt: {},
    cardsPlayed: {},
    tributesPaid: {0: 0, 1: 0, 2: 0},
    attackTargets: {troop: 0, base: 0},
    events: {},
    outcomes: {winner: {cowboy: 0, wizard: 0, draw: 0}, reason: {}, firstPlayerWon: 0, secondPlayerWon: 0},
    variants: counter(VARIANTS),
    policies: {},
    turns: {min: null, max: 0, total: 0},
    movesPerDuel: {min: null, max: 0},
  };
}

function pickWeighted(rng, pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = rng() * total;
  for (const [item, weight] of pairs) if ((roll -= weight) < 0) return item;
  return pairs[pairs.length - 1][0];
}

// --- Real moves -------------------------------------------------------------------------------

function weightOf(state, action, hasOthers) {
  switch (action.type) {
    case "summon": return 4 + 2 * action.tributes.length;
    case "spell": return 3;
    case "gear": return 2.5;
    case "location": return 2;
    case "set": return 2.5;
    case "cover": return 0.6;
    case "attack": {
      const outcome = attackOutcome(state, action.slot, action.target);
      return Math.max(0.3, 1 + (outcome.targetLeft === 0 ? 2 : 0) + 2 * outcome.baseDamage - (outcome.attackerLeft === 0 ? 1.5 : 0));
    }
    default: return hasOthers ? 0.25 : 1;
  }
}

function sampleAction(state, rng) {
  const legal = legalActions(state);
  return pickWeighted(rng, legal.map((action) => [action, weightOf(state, action, legal.length > 1)]));
}

// playTurn reports states, not actions; the action is the legal one that reproduces the state.
function inferAction(before, after) {
  const target = JSON.stringify(after);
  for (const action of legalActions(before)) if (JSON.stringify(applyAction(before, action).state) === target) return action;
  throw new Error(`could not identify the CPU's action at seed ${before.seed}, turn ${before.turn}`);
}

function botTurn(state, level) {
  const actions = [];
  playTurn(state, level, (before, applied) => actions.push(inferAction(before, applied.state)));
  return actions;
}

// --- Probes -----------------------------------------------------------------------------------

const occupied = (board) => board.flatMap((troop, slot) => (troop ? [slot] : []));
const vacant = (board) => board.flatMap((troop, slot) => (troop ? [] : [slot]));
const summonMove = (cardId, paid) => ({type: "summon", cardId, tributes: [...paid].sort((a, b) => a - b)});
const attackMove = (slot, target) => ({type: "attack", slot, target});

// The engine lists only the first copy of each name, so probes use first copies: the rule under
// test, not the copy quirk, is what makes them illegal.
function firstCopies(hand) {
  const byName = new Map();
  for (const id of hand) if (!byName.has(cardOf(id).name)) byName.set(cardOf(id).name, id);
  return [...byName.values()];
}

function plausibleTarget(enemy) {
  const troops = occupied(enemy.board);
  return troops.find((slot) => has(enemy.board[slot].cardId, "guard")) ?? troops[0] ?? "base";
}

// The move a player would send for this card if its allowance were open.
function playShape(state, cardId) {
  const own = state.sides[state.active];
  const enemy = state.sides[opponent(state.active)];
  const card = cardOf(cardId);
  if (card.kind === "troop") {
    const need = tributes(cardId);
    const troops = occupied(own.board);
    if (troops.length < need || troops.length - need >= BOARD_SIZE) return null;
    return summonMove(cardId, troops.slice(0, need));
  }
  if (card.kind === "spell") {
    const targets = occupied(enemy.board);
    if (!EFFECTS[card.effect].target) return targets.length ? {type: "spell", cardId} : null;
    const target = targets.find((slot) => !has(enemy.board[slot].cardId, "ghostly") && !(card.effect === "tie" && enemy.board[slot].stunned));
    return target === undefined ? null : {type: "spell", cardId, target};
  }
  if (card.kind === "gear") {
    const slot = occupied(own.board)[0];
    return slot === undefined ? null : {type: "gear", cardId, slot};
  }
  if (card.kind === "location") return state.location && cardOf(state.location.cardId).name === card.name ? null : {type: "location", cardId};
  return own.traps.length < TRAP_SLOTS ? {type: "set", cardId} : null;
}

const allowanceOpen = (state, cardId) => {
  const kind = cardOf(cardId).kind;
  return kind === "troop" ? !state.summonUsed : kind === "trap" ? !state.setUsed : !state.castUsed;
};
const openShape = (state, cardId) => (allowanceOpen(state, cardId) ? playShape(state, cardId) : null);

// Every probe whose boundary holds right now, at most one per kind.
function probeCandidates(state) {
  const own = state.sides[state.active];
  const enemy = state.sides[opponent(state.active)];
  const found = new Map();
  const add = (kind, action) => { if (action && !found.has(kind)) found.set(kind, action); };
  const hand = firstCopies(own.hand);
  const ofKind = (kind) => hand.filter((id) => cardOf(id).kind === kind);
  const free = ofKind("troop").filter((id) => tributes(id) === 0);
  const paid = ofKind("troop").filter((id) => tributes(id) > 0);
  const ownTroops = occupied(own.board);
  const ownEmpty = vacant(own.board);
  const enemyTroops = occupied(enemy.board);
  const enemyEmpty = vacant(enemy.board);
  const target = plausibleTarget(enemy);

  if (!state.attacking) {
    if (state.summonUsed && ownEmpty.length && free[0]) add("summon-twice", summonMove(free[0], []));
    if (!state.summonUsed) {
      const big = paid[0];
      if (big && ownEmpty.length) {
        add("summon-unpaid", summonMove(big, ownTroops.slice(0, tributes(big) - 1)));
        add("summon-tribute-empty-slot", summonMove(big, [...ownTroops.slice(0, tributes(big) - 1), ownEmpty[0]]));
      }
      if (free[0] && !ownEmpty.length) add("summon-full-board", summonMove(free[0], []));
      if (free[0] && ownTroops.length && ownEmpty.length) add("summon-free-with-tribute", summonMove(free[0], [ownTroops[0]]));
    }
    if (state.castUsed) {
      add("cast-twice", [...ofKind("spell"), ...ofKind("gear"), ...ofKind("location")].map((id) => playShape(state, id)).find(Boolean));
    } else {
      const aimed = ofKind("spell").find((id) => EFFECTS[cardOf(id).effect].target);
      if (aimed) {
        if (enemyTroops.length && enemyEmpty.length) add("spell-empty-target", {type: "spell", cardId: aimed, target: enemyEmpty[0]});
        if (enemyTroops.length) add("spell-missing-target", {type: "spell", cardId: aimed});
        add("spell-target-off-board", {type: "spell", cardId: aimed, target: BOARD_SIZE});
      }
      const lasso = ofKind("spell").find((id) => cardOf(id).effect === "tie");
      const stunned = enemyTroops.find((slot) => enemy.board[slot].stunned);
      if (lasso && stunned !== undefined) add("tie-stunned", {type: "spell", cardId: lasso, target: stunned});
      const hellfire = ofKind("spell").find((id) => cardOf(id).effect === "hellfire");
      if (hellfire && !enemyTroops.length) add("hellfire-empty-board", {type: "spell", cardId: hellfire});
      const gear = ofKind("gear")[0];
      if (gear && ownEmpty.length) add("gear-empty-slot", {type: "gear", cardId: gear, slot: ownEmpty[0]});
      const repeat = state.location && ofKind("location").find((id) => cardOf(id).name === cardOf(state.location.cardId).name);
      if (repeat) add("location-repeat", {type: "location", cardId: repeat});
    }
    const trap = ofKind("trap")[0];
    if (trap && state.setUsed && own.traps.length < TRAP_SLOTS) add("set-twice", {type: "set", cardId: trap});
    if (trap && !state.setUsed && own.traps.length >= TRAP_SLOTS) add("set-full", {type: "set", cardId: trap});
    if (own.deck.length) add("card-from-deck", openShape(state, own.deck[0]));
    if (enemy.hand.length) add("card-from-opponent-hand", openShape(state, enemy.hand[0]));
  } else {
    add("card-after-acting", hand.map((id) => openShape(state, id)).find(Boolean));
  }

  for (const slot of ownTroops) {
    const troop = own.board[slot];
    if (state.turn === 1) add("attack-on-turn-one", attackMove(slot, target));
    else if (troop.attacked) add(troop.cover ? "attack-from-cover" : "attack-twice", attackMove(slot, target));
    else if (troop.stunned) add("attack-stunned", attackMove(slot, target));
    else if (troop.arrived === state.turn && !troop.ready) add("attack-while-resting", attackMove(slot, target));
    else if (attackOf(state, troop) === 0) add("attack-with-no-attack", attackMove(slot, target));
    if (troop.attacked) add(troop.cover ? "cover-twice" : "cover-after-attack", {type: "cover", slot});
    if (canAttack(state, troop)) {
      const guards = enemyTroops.filter((at) => has(enemy.board[at].cardId, "guard"));
      const others = enemyTroops.filter((at) => !has(enemy.board[at].cardId, "guard"));
      if (guards.length && others.length) add("attack-past-guard", attackMove(slot, others[0]));
      if (guards.length && has(troop.cardId, "ride")) add("ride-past-guard", attackMove(slot, "base"));
      if (enemyTroops.length && !has(troop.cardId, "ride")) add("attack-base-while-defended", attackMove(slot, "base"));
      if (enemyTroops.length && enemyEmpty.length) add("attack-empty-slot", attackMove(slot, enemyEmpty[0]));
      add("attack-off-board", attackMove(slot, BOARD_SIZE));
    }
  }
  if (ownEmpty.length) {
    add("cover-empty-slot", {type: "cover", slot: ownEmpty[0]});
    if (state.turn > 1) add("attack-from-empty-slot", attackMove(ownEmpty[0], target));
  }
  return found;
}

// --- One duel ---------------------------------------------------------------------------------

const MAX_ACTIONS = 5000;

function cardNamesFor(decks) {
  const types = [...new Set(SIDES.flatMap((side) => decks[side].map(typeOf)))].sort();
  return Object.fromEntries(types.map((type) => [type, printedName(type)]));
}

function playDuel(seed, deal, deckList, {probeRate, policies}, stats) {
  const duel = {seed, first: deal.first, decks: deal.decks, actions: [], cardNames: cardNamesFor(deal.decks)};
  const agreement = checkDealAgreement(duel, deckList);
  stats.duels.dealAgreement.checked += 1;
  if (!agreement.agrees) throw new Error(`seed ${seed}: ordered decks disagree with the seeded deal (${agreement.mismatches.join(", ")})`);
  stats.duels.dealAgreement.agreed += 1;

  const rng = random((seed ^ 0x5bd1e995) >>> 0);
  const policyPairs = Object.entries(policies);
  const policy = {cowboy: pickWeighted(rng, policyPairs), wizard: pickWeighted(rng, policyPairs)};
  const labels = [];
  let state = initialState(duel);
  let plan = [];
  let planTurnNumber = null;
  let probeTurn = null;
  const usedKinds = new Set();

  while (!state.result) {
    if (duel.actions.length > MAX_ACTIONS) throw new Error(`seed ${seed}: no finished game after ${MAX_ACTIONS} actions`);
    let real;
    if (policy[state.active] === "sampler") real = sampleAction(state, rng);
    else {
      if (planTurnNumber !== state.turn) [plan, planTurnNumber] = [[], state.turn];
      if (!plan.length) plan = botTurn(state, LEVELS[policy[state.active]]);
      real = plan.shift();
    }
    // Each probe kind is tried at most once per turn, so no rejected move is sent again in place.
    if (probeTurn !== state.turn) {
      probeTurn = state.turn;
      usedKinds.clear();
    }
    if (rng() < probeRate) {
      const open = [...probeCandidates(state)].filter(([kind]) => !usedKinds.has(kind));
      if (open.length) {
        const [kind, action] = open[Math.floor(rng() * open.length)];
        usedKinds.add(kind);
        if (applyInput(state, action).accepted) bump(stats.probes.constructorMismatch, kind);
        else {
          duel.actions.push(action);
          labels.push(kind);
        }
      }
    }
    const applied = applyInput(state, real);
    if (!applied.accepted) throw new Error(`seed ${seed}: generated real move ${JSON.stringify(real)} was rejected (${applied.error})`);
    duel.actions.push(real);
    labels.push(null);
    state = applied.state;
  }
  return {duel, labels, policy};
}

function accumulate(stats, record, {labels, policy, variant}, replay) {
  const {duel, origin} = record;
  if (!replay.terminal) throw new Error(`${record.id}: replay did not finish`);
  stats.duels.completed += 1;
  stats.duels[origin] += 1;
  stats.duels.terminal += 1;
  stats.seeds[origin].push(duel.seed);
  bump(stats.variants, variant);
  for (const side of SIDES) bump(stats.policies, `${side}:${policy[side]}`);
  for (const side of SIDES) for (const type of new Set(duel.decks[side].map(typeOf))) bump(stats.cardsDealt, type);
  replay.steps.forEach((step, i) => {
    const input = duel.actions[i];
    const probe = labels[i];
    if (step.accepted !== (probe === null)) {
      throw new Error(`${record.id} action ${i} ${JSON.stringify(input)}: replay ${step.accepted ? "accepted" : "rejected"} a ${probe ? `probe (${probe})` : "real move"}`);
    }
    stats.moves.attempted += 1;
    if (step.accepted) {
      stats.moves.accepted += 1;
      bump(stats.accepted, input.type);
      if (input.cardId) bump(stats.cardsPlayed[typeOf(input.cardId)] ??= {}, input.type);
      if (input.type === "summon") bump(stats.tributesPaid, input.tributes.length);
      if (input.type === "attack") bump(stats.attackTargets, input.target === "base" ? "base" : "troop");
      for (const event of step.events) bump(stats.events, event.type);
    } else {
      stats.moves.rejected += 1;
      bump(stats.rejected, input.type);
      bump(stats.probes.sent, probe);
    }
  });
  const {winner, reason} = replay.result;
  bump(stats.outcomes.winner, winner ?? "draw");
  bump(stats.outcomes.reason, reason);
  if (winner === duel.first) stats.outcomes.firstPlayerWon += 1;
  else if (winner) stats.outcomes.secondPlayerWon += 1;
  const turns = replay.final.turn;
  stats.turns.total += turns;
  stats.turns.max = Math.max(stats.turns.max, turns);
  stats.turns.min = stats.turns.min === null ? turns : Math.min(stats.turns.min, turns);
  const moves = duel.actions.length;
  stats.movesPerDuel.max = Math.max(stats.movesPerDuel.max, moves);
  stats.movesPerDuel.min = stats.movesPerDuel.min === null ? moves : Math.min(stats.movesPerDuel.min, moves);
}

const isUint32 = (value) => Number.isInteger(value) && value >= 0 && value < 2 ** 32;

export function* generate({count, minMoves = 0, seedStart = 0, fresh = 0, freshSeeds = [], probeRate = 0.2, policies = DEFAULT_POLICIES} = {}, stats = newStats()) {
  if (!Number.isInteger(count) || count < 1) throw new Error("count must be a positive integer");
  if (!Number.isInteger(minMoves) || minMoves < 0) throw new Error("minMoves must be a non-negative integer");
  if (!isUint32(seedStart)) throw new Error("seedStart must be a uint32");
  if (!Number.isInteger(fresh) || fresh < 0 || fresh > count) throw new Error("fresh must be between 0 and count");
  if (!(probeRate >= 0 && probeRate <= 1)) throw new Error("probeRate must be between 0 and 1");
  for (const [name, weight] of Object.entries(policies)) {
    if (name !== "sampler" && !Object.hasOwn(LEVELS, name)) throw new Error(`unknown policy ${name}`);
    if (!(weight >= 0)) throw new Error(`policy ${name} needs a non-negative weight`);
  }
  if (!Object.values(policies).some((weight) => weight > 0)) throw new Error("at least one policy needs a positive weight");

  const seenSeeds = new Set();
  const seenDeals = new Set();
  const options = {probeRate, policies};
  function* attempt(seed, origin) {
    if (!isUint32(seed)) throw new Error(`seed ${seed} is not a uint32`);
    if (seenSeeds.has(seed)) {
      stats.duels.duplicateSeedsSkipped += 1;
      return;
    }
    seenSeeds.add(seed);
    const variant = VARIANTS[seed % VARIANTS.length];
    const deal = seededDeal(seed, DECK_LISTS[variant]);
    const dealKey = JSON.stringify([deal.first, deal.decks]);
    if (seenDeals.has(dealKey)) {
      stats.duels.duplicateDealsSkipped += 1;
      return;
    }
    seenDeals.add(dealKey);
    const played = playDuel(seed, deal, DECK_LISTS[variant], options, stats);
    const record = {id: `${origin}-${seed}`, origin, duel: played.duel};
    accumulate(stats, record, {...played, variant}, replayDuel(played.duel, {states: false, events: true}));
    // Both are new by the checks above; the test recounts them from the records.
    stats.duels.distinctSeeds += 1;
    stats.duels.distinctDeals += 1;
    yield record;
  }

  let nextFixed = seedStart;
  while (stats.duels.fixed < count - fresh) yield* attempt(nextFixed++, "fixed");
  for (const seed of freshSeeds) {
    if (stats.duels.fresh >= fresh) break;
    yield* attempt(seed, "fresh");
  }
  if (stats.duels.fresh < fresh) throw new Error(`only ${stats.duels.fresh} of ${fresh} fresh seeds were unused; supply more fresh seeds`);
  while (stats.moves.attempted < minMoves) yield* attempt(nextFixed++, "fixed");
  return stats;
}

// Seed recipes for scripts/referee/prove.mjs. Fixed seeds only (no crypto fresh seeds), so the
// same recipe always streams the same duels and the freeze can pin their digest.
export function recipe({quick = false} = {}) {
  const shared = {seedStart: 1, fresh: 0, freshSeeds: [], probeRate: 0.2, policies: {...DEFAULT_POLICIES}};
  return quick
    ? {name: "quick", count: 12, minMoves: 0, ...shared}
    : {name: "full", count: 2500, minMoves: 100000, ...shared};
}

// Duel inputs only ({seed, first, decks, actions, cardNames}); ids, origins and stats stay here.
export function* duels({count, minMoves, seedStart, fresh, freshSeeds, probeRate, policies}) {
  for (const record of generate({count, minMoves, seedStart, fresh, freshSeeds, probeRate, policies})) yield record.duel;
}

export function summarize(stats) {
  const dealt = Object.keys(stats.cardsDealt).sort();
  return {
    ...stats,
    coverage: {
      actionTypesNeverAccepted: ACTION_TYPES.filter((type) => !stats.accepted[type]),
      actionTypesNeverRejected: ACTION_TYPES.filter((type) => !stats.rejected[type]),
      probeKindsNeverSent: PROBE_KINDS.filter((kind) => !stats.probes.sent[kind]),
      cardTypesDealtNeverPlayed: dealt.filter((type) => !stats.cardsPlayed[type]),
    },
  };
}

export function reservoir(size, seed) {
  const rng = random(seed);
  const kept = [];
  let seen = 0;
  return {
    offer(item) {
      if (kept.length < size) kept.push([seen, item]);
      else {
        const at = Math.floor(rng() * (seen + 1));
        if (at < size) kept[at] = [seen, item];
      }
      seen += 1;
    },
    get seen() { return seen; },
    get items() { return [...kept].sort((a, b) => a[0] - b[0]).map(([, item]) => item); },
  };
}

const RULE_FILES = ["../../src/game/showdown/rules.js", "../../src/game/showdown/cards.js", "../../src/game/card-specs.generated.js"];

export function rulesVersion() {
  const files = Object.fromEntries(RULE_FILES.map((path) => [path.replace("../../", ""),
    createHash("sha256").update(readFileSync(new URL(path, import.meta.url))).digest("hex")]));
  const combined = createHash("sha256").update(Object.entries(files).map(([path, hash]) => `${path} ${hash}`).join("\n")).digest("hex");
  return {sha256: combined, files};
}

// --- CLI --------------------------------------------------------------------------------------

function integer(name, text) {
  const value = Number(text);
  if (!Number.isInteger(value) || value < 0) throw new Error(`--${name} needs a non-negative integer, got ${JSON.stringify(text)}`);
  return value;
}

function parsePolicies(text) {
  return Object.fromEntries(text.split(",").map((pair) => {
    const [name, weight] = pair.split("=");
    return [name.trim(), Number(weight)];
  }));
}

async function main(argv) {
  const {values} = parseArgs({args: argv, options: {
    count: {type: "string", default: "2500"},
    "min-moves": {type: "string", default: "100000"},
    "seed-start": {type: "string", default: "1"},
    fresh: {type: "string", default: "250"},
    "fresh-seeds": {type: "string"},
    "probe-rate": {type: "string", default: "0.2"},
    policies: {type: "string"},
    out: {type: "string"},
    summary: {type: "string"},
    "parity-out": {type: "string"},
    "parity-size": {type: "string", default: "250"},
    "parity-seed": {type: "string", default: "20261122"},
  }});
  const options = {
    count: integer("count", values.count),
    minMoves: integer("min-moves", values["min-moves"]),
    seedStart: integer("seed-start", values["seed-start"]),
    fresh: integer("fresh", values.fresh),
    probeRate: Number(values["probe-rate"]),
    policies: values.policies ? parsePolicies(values.policies) : DEFAULT_POLICIES,
  };
  const recordedFresh = Boolean(values["fresh-seeds"]);
  options.freshSeeds = recordedFresh
    ? values["fresh-seeds"].split(",").map((text) => integer("fresh-seeds", text.trim()))
    : Array.from({length: options.fresh * 2 + 32}, () => randomInt(0, 2 ** 32));
  const paritySize = integer("parity-size", values["parity-size"]);
  const paritySeed = integer("parity-seed", values["parity-seed"]);

  const stats = newStats();
  const sample = reservoir(paritySize, paritySeed);
  const out = values.out ? createWriteStream(values.out) : process.stdout;
  for (const record of generate(options, stats)) {
    if (!out.write(`${JSON.stringify(record)}\n`)) await once(out, "drain");
    sample.offer(record);
  }
  if (values.out) {
    out.end();
    await once(out, "finish");
  }
  const parity = sample.items;
  if (values["parity-out"]) {
    if (parity.length !== paritySize) throw new Error(`parity sample needs ${paritySize} completed duels; the corpus has ${sample.seen}`);
    writeFileSync(values["parity-out"], parity.map((record) => JSON.stringify(record)).join("\n") + "\n");
  }
  const targets = {
    completedDuels: {target: options.count, actual: stats.duels.completed, met: stats.duels.completed >= options.count},
    attemptedMoves: {target: options.minMoves, actual: stats.moves.attempted, met: stats.moves.attempted >= options.minMoves},
  };
  const summary = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    rulesVersion: rulesVersion(),
    options: {...options, freshSeeds: recordedFresh ? "recorded list" : "crypto.randomInt", freshSeedsOffered: options.freshSeeds.length},
    targets,
    parity: {size: parity.length, seed: paritySeed, parentCount: sample.seen, ids: parity.map((record) => record.id)},
    ...summarize(stats),
  };
  const text = `${JSON.stringify(summary, null, 2)}\n`;
  if (values.summary) writeFileSync(values.summary, text);
  else process.stderr.write(text);
  if (!targets.completedDuels.met || !targets.attemptedMoves.met) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.stack ?? error.message}\n`);
    process.exit(1);
  });
}
