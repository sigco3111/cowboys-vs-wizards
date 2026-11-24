import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { CARDS, DECKS, SIDES, tributeCost } from "../../src/game/cards.js";
import { CARD_SPECS, SHOWDOWN_SPECS } from "../../src/game/card-specs.generated.js";
import { DECKS as SHOWDOWN_DECKS, EFFECTS, KEYWORDS, RARITY, TYPES, typeOf } from "../../src/game/showdown/cards.js";
import { cardsCsv } from "../../prototypes/showdown/export-cards.mjs";
import { createMatch } from "../../src/game/state.js";
import { applyAction } from "../../src/game/actions.js";
import fc from "fast-check";
import { applyAction as applyShowdown, attackOf, canAttack, createShowdown, legalActions as showdownActions } from "../../src/game/showdown/rules.js";
import { viewFor } from "../../src/game/showdown/contract.js";
import { presentEvent } from "../../src/game/showdown/presenter.js";

// The JSON specs are the source of truth; the tests compare the engine to them.
const specDir = new URL("../../.kiro/specs/duel-card-pipeline/cards/", import.meta.url);
const allSpecs = readdirSync(specDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => JSON.parse(readFileSync(new URL(name, specDir), "utf8")));
// The lane duel reads every spec except Showdown-only ones, and none of the `showdown` block.
const specs = allSpecs.filter((spec) => !spec.showdownOnly).map(({ showdown, ...lane }) => lane);
const sideSpecs = (side) => specs.filter((spec) => spec.side === side).sort((a, b) => a.order - b.order);
const idOf = (spec, copy) => `${spec.type}-${copy}`;

test("generated card list matches the JSON specs in deck order", () => {
  assert.deepEqual(CARD_SPECS, SIDES.flatMap(sideSpecs));
});

test("registry holds available copies; default decks retain each spec's copies and order", () => {
  const expectedRegistry = [];
  for (const side of SIDES) {
    const expectedDeck = [];
    for (const { type, order, copies, ...fields } of sideSpecs(side)) {
      const availableCopies = fields.limit ?? (fields.bounty ? 1 : side === "cowboy" ? 6 : copies);
      for (let copy = 1; copy <= availableCopies; copy++) {
        const id = idOf({ type }, copy);
        expectedRegistry.push(id);
        if (copy <= copies) expectedDeck.push(id);
        assert.deepEqual(CARDS[id], { id, ...fields });
        assert.ok(Object.isFrozen(CARDS[id]), `${id} is frozen`);
      }
    }
    assert.equal(expectedDeck.length, 12);
    assert.deepEqual(DECKS[side], expectedDeck);
    assert.ok(Object.isFrozen(DECKS[side]));
  }
  const extraSingularity = "wizard-singularity-3";
  expectedRegistry.push(extraSingularity);
  assert.deepEqual(CARDS[extraSingularity], {...CARDS["wizard-singularity-2"], id: extraSingularity});
  assert.ok(Object.isFrozen(CARDS[extraSingularity]));
  assert.equal(expectedRegistry.length, 52);
  assert.deepEqual(Object.keys(CARDS).sort(), expectedRegistry.sort());
  assert.ok(Object.isFrozen(CARDS) && Object.isFrozen(DECKS));
});

test("each side's first free troop spec can be summoned from hand", () => {
  for (const side of SIDES) {
    const spec = sideSpecs(side).find((item) => item.kind === "troop" && tributeCost(item.stars) === 0);
    const cardId = idOf(spec, 1);
    const state = createMatch(1);
    state.activeSide = side;
    state.sides[side].hand = [cardId];
    state.sides[side].deck = DECKS[side].filter((id) => id !== cardId);
    state.sides[side].board = [null, null, null];

    const result = applyAction(state, { type: "summon", side, revision: state.revision, cardId, slot: 0, tributes: [] });
    assert.equal(result.ok, true);
    assert.deepEqual(result.state.sides[side].board[0], { cardId, health: spec.health });
    assert.deepEqual(result.state.sides[side].hand, []);
  }
});

// Showdown reads the same catalog. These values are the ones the old OVERLAY and FRESH
// tables in src/game/showdown/cards.js held before the catalog took them over.
const SHOWDOWN_ONLY = [
  "cowboy-bear-trap", "cowboy-six-shooter", "cowboy-sheriffs-office", "wizard-bone-wall", "wizard-raven-familiar",
  "wizard-headless-horseman", "wizard-jack-o-lantern", "wizard-hellfire", "wizard-hex", "wizard-bone-armor", "wizard-boneyard",
];

test("Showdown has exactly 29 catalog cards: the lane cards in lane order, then the Showdown-only ones", () => {
  assert.equal(allSpecs.length, 29);
  assert.equal(SHOWDOWN_SPECS.length, 29);
  assert.deepEqual(SHOWDOWN_SPECS.map((card) => card.type), [...CARD_SPECS.map((spec) => spec.type), ...SHOWDOWN_ONLY]);
  assert.deepEqual(Object.keys(TYPES), SHOWDOWN_SPECS.map((card) => card.type));
  assert.deepEqual(SHOWDOWN_SPECS.filter((card) => card.showdownOnly).map((card) => card.type), SHOWDOWN_ONLY);
  assert.deepEqual(Object.keys(TYPES).filter((type) => TYPES[type].fresh), SHOWDOWN_ONLY);
});

test("every Showdown card has a rarity, and a tag and keywords or an effect, that resolve", () => {
  for (const [type, card] of Object.entries(TYPES)) {
    assert.ok(RARITY[card.rarity], `${type} rarity`);
    if (card.kind === "troop") {
      assert.match(card.tag, /^[A-Z][a-z]+$/, `${type} tag`);
      for (const key of card.keys) assert.ok(KEYWORDS[key], `${type} keyword ${key}`);
      assert.equal(card.effect, undefined, `${type} has no effect`);
    } else {
      assert.ok(EFFECTS[card.effect], `${type} effect`);
      assert.equal(card.tag, undefined, `${type} has no tag`);
    }
  }
});

test("Showdown keeps the lane catalog's numbers for lane cards", () => {
  for (const spec of CARD_SPECS) {
    const { side, name, kind, stars, attack, health } = TYPES[spec.type];
    assert.deepEqual({ side, name, kind, stars, attack, health }, { side: spec.side, name: SHOWDOWN_SPECS.find((card) => card.type === spec.type).name, kind: spec.kind, stars: spec.stars, attack: spec.attack, health: spec.health });
    assert.equal(TYPES[spec.type].bounty, Boolean(spec.bounty));
  }
});

test("canonical Showdown values for a sample of cards", () => {
  assert.deepEqual(TYPES["cowboy-sheriff"], { side: "cowboy", name: "보안관", kind: "troop", stars: 2, attack: 1, health: 3, bounty: false, keys: [], rarity: "basic", tag: "Lawman" });
  assert.deepEqual(TYPES["cowboy-deadeye"], { side: "cowboy", name: "명사수", kind: "spell", stars: undefined, attack: undefined, health: undefined, bounty: false, keys: [], rarity: "common", effect: "shot" });
  assert.deepEqual(TYPES["wizard-lantern-wraith"], { side: "wizard", name: "랜턴 망령", kind: "troop", stars: 6, attack: 2, health: 4, bounty: true, keys: ["ghostly"], rarity: "legendary", tag: "Undead" });
  assert.deepEqual(TYPES["wizard-bone-wall"], { side: "wizard", name: "뼈 방벽", rarity: "common", kind: "troop", stars: 3, attack: 0, health: 4, tag: "Undead", keys: ["guard"], fresh: true });
  assert.deepEqual(TYPES["cowboy-sheriffs-office"], { side: "cowboy", name: "보안관 사무소", rarity: "rare", kind: "location", effect: "office", fresh: true });
  assert.deepEqual(TYPES["wizard-hex"], { side: "wizard", name: "저주", rarity: "uncommon", kind: "trap", effect: "hex", fresh: true });
  for (const side of SIDES) for (const type of Object.keys(SHOWDOWN_DECKS[side])) assert.equal(TYPES[type]?.side, side, type);
});

test("cards.csv regenerates byte for byte from the catalog", () => {
  assert.equal(cardsCsv(), readFileSync(new URL("../../prototypes/showdown/cards.csv", import.meta.url), "utf8"));
});

// ---------------------------------------------------------------------------------------------
// Each Showdown test below cites, in its literal title, the numbered
// clauses of .kiro/specs/card-*/requirements.md that it asserts in full, and no others:
// scripts/trace.mjs reads those titles, and docs/requirement-test-map.md lists them. Expected
// values come from the clauses, not from the engine's own code. fast-check runs under a fixed seed.
// Hellfire against an empty Cowboy board (CARD-WIZARD-HELLFIRE-04) is an open design decision and
// no test here asserts either answer.
// ---------------------------------------------------------------------------------------------
const FC = { seed: 20261123, numRuns: 150 };
const GEAR = { cowboy: "cowboy-six-shooter-1", wizard: "wizard-bone-armor-1" };
const troopTypes = (side) => Object.keys(TYPES).filter((type) => TYPES[type].side === side && TYPES[type].kind === "troop");
const hasKey = (type, key) => TYPES[type].keys.includes(key);
const idAt = (spec, slot) => `${spec.type}-${slot + 1}`;

// A seat's board from {type, health, cover?, gear?} specs, one per slot (null for an empty slot).
const seat = (side, specs) => [0, 1, 2].map((slot) => {
  const spec = specs[slot];
  return spec ? { cardId: idAt(spec, slot), health: spec.health, attacked: false, stunned: false, cover: Boolean(spec.cover), gear: spec.gear ? [GEAR[side]] : [], arrived: 0 } : null;
});
// Turn 4, `active` to move with `hand`, nothing spent. Hands, graveyards and traps start empty.
function stage({ active = "wizard", own = [], foe = [], hand = [], traps = {}, bases = {} }) {
  const state = createShowdown(690);
  Object.assign(state, { turn: 4, active });
  for (const side of SIDES) Object.assign(state.sides[side], { hand: [], discard: [], traps: [...(traps[side] ?? [])], base: bases[side] ?? 5 });
  state.sides[active].hand = [...hand];
  state.sides[active].board = seat(active, own);
  state.sides[active === "wizard" ? "cowboy" : "wizard"].board = seat(active === "wizard" ? "cowboy" : "wizard", foe);
  return state;
}
const spellsOf = (state) => showdownActions(state).filter((action) => action.type === "spell");
const kindsOf = (state) => new Set(showdownActions(state).map((action) => action.type));
const troopSpec = (side) => fc.record({ type: fc.constantFrom(...troopTypes(side)), health: fc.integer({ min: 1, max: 6 }), cover: fc.boolean(), gear: fc.boolean() });
const boardSpec = (side, min = 0) => fc.array(fc.option(troopSpec(side), { nil: null }), { minLength: 3, maxLength: 3 }).filter((board) => board.filter(Boolean).length >= min);

test("CARD-COWBOY-LASSO-04 CARD-COWBOY-LASSO-05 CARD-COWBOY-LASSO-06 CARD-COWBOY-LASSO-07 CARD-COWBOY-LASSO-08 CARD-COWBOY-LASSO-13 CARD-COWBOY-LASSO-14: Lasso preserves orbs and blocks attacks through the target's next turn", () => {
  fc.assert(fc.property(fc.nat({ max: 2 }), fc.integer({ min: 1, max: 4 }), (slot, health) => {
    const lasso = "cowboy-lasso-1";
    const foe = [null, null, null];
    foe[slot] = { type: "wizard-wizard", health };
    const state = stage({ active: "cowboy", hand: [lasso], foe });
    const target = (position) => position.sides.wizard.board[slot];
    const afterCast = applyShowdown(state, { type: "spell", cardId: lasso, target: slot });

    assert.deepEqual(target(afterCast.state), { ...target(state), stunned: true });
    assert.deepEqual(afterCast.state.sides.cowboy.hand, []);
    assert.deepEqual(afterCast.state.sides.cowboy.discard, [lasso]);
    assert.deepEqual(afterCast.events, [{
      type: "spell", side: "cowboy", cardId: lasso, target: target(state).cardId, left: health, stunned: true,
    }]);
    assert.equal(presentEvent(afterCast.events[0]), "카우보이 올가미 → 마법사: 다음 턴 기절.");

    const wizardTurn = applyShowdown(afterCast.state, { type: "end" }).state;
    assert.equal(wizardTurn.active, "wizard");
    assert.equal(target(wizardTurn).stunned, true);
    assert.equal(canAttack(wizardTurn, target(wizardTurn)), false);
    const cover = { type: "cover", slot };
    assert.ok(showdownActions(wizardTurn).some((action) => action.type === "cover" && action.slot === slot));
    const inCover = applyShowdown(wizardTurn, cover).state;
    assert.equal(target(inCover).stunned, true);
    assert.equal(canAttack(inCover, target(inCover)), false);

    const cowboyTurn = applyShowdown(inCover, { type: "end" }).state;
    assert.equal(target(cowboyTurn).stunned, false);
    const followingWizardTurn = applyShowdown(cowboyTurn, { type: "end" }).state;
    assert.equal(canAttack(followingWizardTurn, target(followingWizardTurn)), true);
  }), FC);
});

test("CARD-COWBOY-BEAR-TRAP-05 CARD-COWBOY-BEAR-TRAP-06 CARD-WIZARD-HEX-05 CARD-WIZARD-HEX-06 CARD-WIZARD-HEX-07: setting a second trap hides both cards from the other seat", () => {
  const cases = [
    { side: "cowboy", opponent: "wizard", type: "cowboy-bear-trap", log: "카우보이: 카드를 뒷면으로 놓음." },
    { side: "wizard", opponent: "cowboy", type: "wizard-hex", log: "마법사: 카드를 뒷면으로 놓음." },
  ];
  for (const { side, opponent, type, log } of cases) {
    const [oldest, newest] = [`${type}-1`, `${type}-2`];
    const state = stage({ active: side, hand: [newest], traps: { [side]: [oldest] } });
    const out = applyShowdown(state, { type: "set", cardId: newest });
    assert.deepEqual(out.state.sides[side].traps, [oldest, newest]);
    assert.deepEqual(out.events, [{ type: "set", side }]);
    assert.equal(presentEvent(out.events[0]), log);

    const opponentView = viewFor(out.state, opponent);
    assert.equal(opponentView.sides[side].trapCount, 2);
    assert.equal(Object.hasOwn(opponentView.sides[side], "traps"), false);
    assert.equal(JSON.stringify(opponentView).includes(type), false);
    assert.deepEqual(viewFor(out.state, side).sides[side].traps, [oldest, newest]);
  }
});

test("CARD-WIZARD-HEX-08 CARD-WIZARD-HEX-10 CARD-WIZARD-HEX-12 CARD-WIZARD-HEX-14 CARD-WIZARD-HEX-15 CARD-WIZARD-HEX-16: only the oldest Hex springs and spends the attack, including against the Base", () => {
  const cases = [
    { type: "cowboy-billy", health: 4, name: "빌리", target: 0, foe: [{ type: "wizard-wizard", health: 4 }] },
    { type: "cowboy-billy", health: 4, name: "빌리", target: "base", foe: [] },
    { type: "cowboy-mounted-billy", health: 5, name: "말 탄 빌리", target: "base", foe: [{ type: "wizard-wizard", health: 4 }] },
  ];
  const [oldest, newest] = ["wizard-hex-1", "wizard-hex-2"];
  for (const { type, health, name, target, foe } of cases) {
    const state = stage({ active: "cowboy", own: [{ type, health }], foe, traps: { wizard: [oldest, newest] } });
    const before = state.sides.cowboy.board[0];
    const out = applyShowdown(state, { type: "attack", slot: 0, target });
    assert.deepEqual(out.events, [{
      type: "trap", side: "wizard", cardId: oldest, target: before.cardId, left: health, stopped: true,
    }]);
    assert.deepEqual(out.state.sides.wizard.traps, [newest]);
    assert.deepEqual(out.state.sides.wizard.discard, [oldest]);
    assert.deepEqual(out.state.sides.wizard.board, state.sides.wizard.board);
    assert.equal(out.state.sides.wizard.base, state.sides.wizard.base);
    assert.deepEqual(out.state.sides.cowboy.board[0], { ...before, attacked: true });
    assert.equal(kindsOf(out.state).has("attack"), false);
    assert.equal(presentEvent(out.events[0]), `함정! 마법사 저주 → ${name}: 공격이 취소됨.`);
  }
});

test("CARD-COWBOY-BEAR-TRAP-07 CARD-COWBOY-BEAR-TRAP-08 CARD-COWBOY-BEAR-TRAP-09 CARD-COWBOY-BEAR-TRAP-10 CARD-COWBOY-BEAR-TRAP-11: the oldest Bear Trap bites before the attack and takes gear on defeat", () => {
  fc.assert(fc.property(fc.nat({ max: 2 }), fc.integer({ min: 1, max: 4 }), (slot, health) => {
    const [oldest, newest] = ["cowboy-bear-trap-1", "cowboy-bear-trap-2"];
    const own = [null, null, null];
    own[slot] = { type: "wizard-wizard", health, gear: true };
    const state = stage({
      active: "wizard", own, foe: [{ type: "cowboy-billy", health: 4, cover: true }],
      traps: { cowboy: [oldest, newest] },
    });
    const attacker = state.sides.wizard.board[slot];
    const out = applyShowdown(state, { type: "attack", slot, target: 0 });
    const left = Math.max(0, health - 2);
    assert.deepEqual(out.events[0], {
      type: "trap", side: "cowboy", cardId: oldest, target: attacker.cardId, left, stopped: left === 0,
    });
    assert.deepEqual(out.state.sides.cowboy.traps, [newest]);
    assert.deepEqual(out.state.sides.cowboy.discard, [oldest]);
    if (left === 0) {
      assert.equal(out.events.length, 1);
      assert.equal(out.state.sides.wizard.board[slot], null);
      assert.deepEqual(out.state.sides.wizard.discard, [attacker.cardId, GEAR.wizard]);
      assert.deepEqual(out.state.sides.cowboy.board, state.sides.cowboy.board);
    } else {
      assert.deepEqual(out.events.map((event) => event.type), ["trap", "attack"]);
      assert.equal(out.events[1].attackerLeft, left);
      assert.equal(out.state.sides.wizard.board[slot].health, left);
      assert.equal(out.state.sides.cowboy.board[0].health, 2);
    }
  }), FC);
});

test("CARD-COWBOY-DEADEYE-04 CARD-WIZARD-SINGULARITY-14 CARD-WIZARD-HELLFIRE-13: a spell that takes a Last Stand troop's last orb fires no Last Stand and costs the caster's troops nothing (fast-check)", () => {
  const scenarios = [
    { caster: "cowboy", card: "cowboy-deadeye-1", victim: "wizard-jack-o-lantern", area: false },
    { caster: "wizard", card: "wizard-singularity-1", victim: "cowboy-dynamiter", area: false },
    { caster: "wizard", card: "wizard-hellfire-1", victim: "cowboy-dynamiter", area: true },
  ];
  for (const { victim } of scenarios) assert.ok(hasKey(victim, "laststand"), `${victim} has Last Stand`);
  fc.assert(fc.property(
    fc.record({ scenario: fc.constantFrom(...scenarios), slot: fc.nat({ max: 2 }), cowboy: boardSpec("cowboy"), wizard: boardSpec("wizard") }),
    ({ scenario, slot, cowboy, wizard }) => {
      const foeSide = scenario.caster === "cowboy" ? "wizard" : "cowboy";
      const boards = { cowboy, wizard };
      const foe = [...boards[foeSide]];
      foe[slot] = { type: scenario.victim, health: 1, cover: false, gear: false };
      const state = stage({ active: scenario.caster, own: boards[scenario.caster], foe, hand: [scenario.card] });
      const cast = scenario.area ? { type: "spell", cardId: scenario.card } : { type: "spell", cardId: scenario.card, target: slot };
      const { state: after, events } = applyShowdown(state, cast);
      const victimId = idAt(foe[slot], slot);
      assert.ok(events.every((event) => event.type === "spell"), `events: ${events.map((event) => event.type)}`);
      assert.equal(events.find((event) => event.target === victimId).left, 0);
      assert.equal(after.sides[foeSide].board[slot], null);
      assert.ok(after.sides[foeSide].discard.includes(victimId));
      assert.deepEqual(after.sides[scenario.caster].board, state.sides[scenario.caster].board, "no orb comes off the caster's troops");
    },
  ), FC);
});

test("CARD-WIZARD-SINGULARITY-12 CARD-WIZARD-SINGULARITY-13 CARD-WIZARD-HELLFIRE-11 CARD-WIZARD-HELLFIRE-12: Singularity and Hellfire spring no trap, change neither Base and leave the Wizard troops alone (fast-check)", () => {
  fc.assert(fc.property(
    fc.record({
      spell: fc.constantFrom("wizard-singularity-1", "wizard-hellfire-1"), pick: fc.nat(),
      cowboy: boardSpec("cowboy", 1), wizard: boardSpec("wizard"),
      cowboyTraps: fc.constantFrom([], ["cowboy-bear-trap-1"], ["cowboy-bear-trap-1", "cowboy-bear-trap-2"]),
      wizardTraps: fc.constantFrom([], ["wizard-hex-1"]),
      bases: fc.record({ cowboy: fc.integer({ min: 1, max: 5 }), wizard: fc.integer({ min: 1, max: 5 }) }),
    }),
    (c) => {
      const state = stage({ own: c.wizard, foe: c.cowboy, hand: [c.spell], traps: { cowboy: c.cowboyTraps, wizard: c.wizardTraps }, bases: c.bases });
      const casts = spellsOf(state);
      fc.pre(casts.length > 0); // a Singularity needs a target that is not Ghostly
      const { state: after, events } = applyShowdown(state, casts[c.pick % casts.length]);
      assert.ok(events.length > 0 && events.every((event) => event.type === "spell"), "no trap or attack event");
      assert.deepEqual(after.sides.cowboy.traps, c.cowboyTraps);
      assert.deepEqual(after.sides.wizard.traps, c.wizardTraps);
      assert.ok(after.sides.cowboy.discard.every((id) => TYPES[typeOf(id)].kind !== "trap"), "no Cowboy trap reached the graveyard");
      assert.deepEqual([after.sides.cowboy.base, after.sides.wizard.base], [c.bases.cowboy, c.bases.wizard]);
      assert.deepEqual(after.sides.wizard.board, state.sides.wizard.board);
    },
  ), FC);
});

test("CARD-WIZARD-SINGULARITY-04 CARD-WIZARD-SINGULARITY-05 CARD-WIZARD-SINGULARITY-06 CARD-WIZARD-SINGULARITY-15: Singularity lists every non-Ghostly Cowboy troop, Guard or not, and takes an orb even in cover (fast-check)", () => {
  const guard = { type: "cowboy-covered-wagon", health: 4 };
  const ghost = { type: "cowboy-captured-wraith", health: 2 };
  const sheriff = { type: "cowboy-sheriff", health: 3 };
  assert.ok(hasKey(guard.type, "guard") && hasKey(ghost.type, "ghostly"));
  const targets = (foe, extra = {}) => spellsOf(stage({ foe, hand: ["wizard-singularity-1"], ...extra })).map((action) => action.target);
  // 04, 06: the Guard troop is a target and does not hide the others; the Ghostly one is skipped.
  assert.deepEqual(targets([guard, sheriff, ghost]), [0, 1]);
  assert.deepEqual(targets([ghost, sheriff, guard]), [1, 2]);
  // 05: nothing to choose when every troop is Ghostly, or the board is empty.
  assert.deepEqual(targets([ghost, null, ghost]), []);
  assert.deepEqual(targets([]), []);
  // 04: no Singularity once a Wizard troop has acted, or the turn's other-card play is spent.
  const armed = stage({ own: [{ type: "wizard-skeleton", health: 3 }], foe: [guard, sheriff], hand: ["wizard-singularity-1", "wizard-bone-armor-1"] });
  assert.deepEqual(spellsOf(armed).map((action) => action.target), [0, 1]);
  assert.deepEqual(spellsOf(applyShowdown(armed, { type: "cover", slot: 0 }).state), []);
  assert.deepEqual(spellsOf(applyShowdown(armed, { type: "gear", cardId: "wizard-bone-armor-1", slot: 0 }).state), []);
  // 04, 05, 06, 15 over generated boards, covered troops and Guards included.
  fc.assert(fc.property(boardSpec("cowboy"), (foe) => {
    const state = stage({ foe, hand: ["wizard-singularity-1"] });
    const expected = foe.flatMap((spec, slot) => (spec && !hasKey(spec.type, "ghostly") ? [slot] : []));
    const casts = spellsOf(state);
    assert.deepEqual(casts.map((action) => action.target), expected);
    for (const action of casts) {
      const before = state.sides.cowboy.board[action.target];
      const { state: after, events } = applyShowdown(state, action);
      assert.equal(events.length, 1);
      assert.equal(events[0].left, before.health - 1);
      state.sides.cowboy.board.forEach((troop, slot) => {
        const want = !troop || slot !== action.target ? troop : before.health === 1 ? null : { ...before, health: before.health - 1 };
        assert.deepEqual(after.sides.cowboy.board[slot], want, `slot ${slot}${troop?.cover ? " (in cover)" : ""}`);
      });
    }
  }), FC);
});

test("CARD-WIZARD-HELLFIRE-03 CARD-WIZARD-HELLFIRE-07 CARD-WIZARD-HELLFIRE-09 CARD-WIZARD-HELLFIRE-10 CARD-WIZARD-HELLFIRE-14 CARD-WIZARD-HELLFIRE-15: Hellfire takes one orb from every Cowboy troop in slot order, one logged event each, and a defeated troop takes its gear to the graveyard (fast-check)", () => {
  assert.ok(hasKey("cowboy-covered-wagon", "guard"));
  fc.assert(fc.property(
    fc.record({
      cowboy: boardSpec("cowboy", 1), wizard: boardSpec("wizard"),
      hand: fc.constantFrom(["wizard-hellfire-1"], ["wizard-hellfire-1", "wizard-hellfire-2"], ["wizard-skeleton-4", "wizard-hellfire-1"]),
    }),
    ({ cowboy, wizard, hand }) => {
      const card = "wizard-hellfire-1";
      const state = stage({ own: wizard, foe: cowboy, hand });
      // 03: exactly one Hellfire action, with no target, even when two copies are held.
      assert.deepEqual(spellsOf(state), [{ type: "spell", cardId: card }]);
      const { state: after, events } = applyShowdown(state, { type: "spell", cardId: card });
      // 07, 14: one spell event per troop, in slot order, carrying its id and the orbs it has left.
      const hit = cowboy.flatMap((spec, slot) => (spec ? [[spec, slot]] : []));
      assert.deepEqual(events, hit.map(([spec, slot]) => ({ type: "spell", side: "wizard", cardId: card, target: idAt(spec, slot), left: spec.health - 1, stunned: false })));
      // 07, 09: each troop, with its Guard or cover and gear, is one orb lower, or gone at 0.
      state.sides.cowboy.board.forEach((troop, slot) => {
        assert.deepEqual(after.sides.cowboy.board[slot], !troop ? null : troop.health === 1 ? null : { ...troop, health: troop.health - 1 }, `slot ${slot}`);
      });
      // 10: each defeated troop and its gear, in slot order, are the whole Cowboy graveyard.
      assert.deepEqual(after.sides.cowboy.discard, hit.filter(([spec]) => spec.health === 1).flatMap(([spec, slot]) => [idAt(spec, slot), ...(spec.gear ? [GEAR.cowboy] : [])]));
      assert.deepEqual(after.sides.wizard.discard, [card]);
      assert.deepEqual(after.sides.wizard.hand, hand.filter((id) => id !== card));
      // 15: the log line for each event.
      const line = (spec, slot) => `마법사 지옥불 → ${TYPES[spec.type].name}: ${spec.health === 1 ? "쓰러짐" : `오브 ${spec.health - 1}개 남음`}.`;
      assert.deepEqual(events.map((event) => presentEvent(event)),hit.map(([spec, slot]) => line(spec, slot)));
    },
  ), FC);
  // 03: once a Wizard troop has acted, no Hellfire is offered.
  const acted = stage({ own: [{ type: "wizard-skeleton", health: 3 }], foe: [{ type: "cowboy-sheriff", health: 3 }], hand: ["wizard-hellfire-1"] });
  assert.equal(spellsOf(acted).length, 1);
  assert.deepEqual(spellsOf(applyShowdown(acted, { type: "cover", slot: 0 }).state), []);
});

test("CARD-WIZARD-HELLFIRE-05 CARD-WIZARD-SINGULARITY-07 CARD-WIZARD-SINGULARITY-08: a Wizard spell uses the turn's one other-card play and leaves the troop summon and the trap set open", () => {
  const hand = ["wizard-singularity-1", "wizard-hellfire-1", "wizard-bone-armor-1", "wizard-boneyard-1", "wizard-hex-1", "wizard-skeleton-2"];
  const sheriff = { type: "cowboy-sheriff", health: 3 };
  const casts = [{ type: "spell", cardId: "wizard-singularity-1", target: 0 }, { type: "spell", cardId: "wizard-hellfire-1" }];
  for (const cast of casts) {
    const state = stage({ own: [{ type: "wizard-imp", health: 1 }], foe: [sheriff, sheriff], hand });
    assert.deepEqual([...kindsOf(state)].sort(), ["attack", "cover", "end", "gear", "location", "set", "spell", "summon"], "every kind of play is open first");
    const cast1 = applyShowdown(state, cast).state;
    const kinds = kindsOf(cast1);
    for (const kind of ["spell", "gear", "location"]) assert.equal(kinds.has(kind), false, `${kind} after ${cast.cardId}`);
    for (const kind of ["summon", "set"]) assert.equal(kinds.has(kind), true, `${kind} after ${cast.cardId}`);
    for (const other of casts) assert.throws(() => applyShowdown(cast1, other), /illegal action/);
    // The summon and the trap still go through, and neither reopens the other-card play.
    const summoned = applyShowdown(cast1, { type: "summon", cardId: "wizard-skeleton-2", tributes: [] }).state;
    const trapped = applyShowdown(summoned, { type: "set", cardId: "wizard-hex-1" }).state;
    for (const state2 of [summoned, trapped]) for (const kind of ["spell", "gear", "location"]) assert.equal(kindsOf(state2).has(kind), false);
    assert.deepEqual(trapped.sides.wizard.traps, ["wizard-hex-1"]);
  }
});

test("CARD-COWBOY-OUTRIDER-04 CARD-COWBOY-OUTRIDER-05: a ready Outrider targets every enemy troop plus the Base unless Guard stands, then only the Guards (fast-check)", () => {
  const outrider = { type: "cowboy-outrider", health: 3 };
  const sheriff = { type: "cowboy-sheriff", health: 3 };
  const skeleton = { type: "wizard-skeleton", health: 3 };
  const wizard = { type: "wizard-wizard", health: 4 };
  const horseman = { type: "wizard-headless-horseman", health: 3 };
  const wall = { type: "wizard-bone-wall", health: 4 };
  assert.ok(hasKey(outrider.type, "ride") && !hasKey(sheriff.type, "ride"));
  assert.ok(hasKey(wall.type, "guard") && [skeleton, wizard, horseman].every((spec) => !hasKey(spec.type, "guard")));
  const attackTargets = (state, slot) => showdownActions(state).filter((action) => action.type === "attack" && action.slot === slot).map((action) => action.target);

  // Ready Outrider boards with gaps on both sides: non-Guards, one Guard and two Guards.
  const gappedRider = stage({ active: "cowboy", own: [sheriff, null, outrider], foe: [skeleton, null, wizard] });
  assert.equal(canAttack(gappedRider, gappedRider.sides.cowboy.board[2]), true);
  assert.deepEqual(attackTargets(gappedRider, 2), [0, 2, "base"]);
  assert.deepEqual(attackTargets(gappedRider, 0), [0, 2]);
  assert.deepEqual(attackTargets(stage({ active: "cowboy", own: [null, outrider, null], foe: [null, horseman, null] }), 1), [1, "base"]);
  assert.deepEqual(attackTargets(stage({ active: "cowboy", own: [null, outrider, null], foe: [skeleton, null, wall] }), 1), [2]);
  assert.deepEqual(attackTargets(stage({ active: "cowboy", own: [outrider, null, sheriff], foe: [null, wall, wizard] }), 0), [1]);
  assert.deepEqual(attackTargets(stage({ active: "cowboy", own: [null, outrider, null], foe: [wall, null, wall] }), 1), [0, 2]);
  assert.deepEqual(attackTargets(stage({ active: "cowboy", own: [outrider, null, null], foe: [wall, skeleton, wall] }), 0), [0, 2]);

  fc.assert(fc.property(
    fc.record({ slot: fc.nat({ max: 2 }), health: fc.integer({ min: 1, max: 3 }), gear: fc.boolean(), own: boardSpec("cowboy"), foe: boardSpec("wizard", 1) }),
    ({ slot, health, gear, own, foe }) => {
      const cowboy = [...own];
      cowboy[slot] = { type: "cowboy-outrider", health, cover: false, gear };
      const state = stage({ active: "cowboy", own: cowboy, foe });
      assert.equal(canAttack(state, state.sides.cowboy.board[slot]), true);
      const troops = foe.flatMap((spec, at) => (spec ? [at] : []));
      const guards = troops.filter((at) => hasKey(foe[at].type, "guard"));
      const expected = guards.length > 0 ? guards : [...troops, "base"];
      assert.deepEqual(attackTargets(state, slot), expected);
    },
  ), FC);
});

test("CARD-COWBOY-OUTRIDER-06 CARD-COWBOY-OUTRIDER-07 CARD-COWBOY-OUTRIDER-08 CARD-COWBOY-OUTRIDER-09 CARD-COWBOY-OUTRIDER-10 CARD-COWBOY-OUTRIDER-12 CARD-COWBOY-OUTRIDER-13 CARD-COWBOY-OUTRIDER-14: Outrider rides past standing troops for 1 orb with logged attack event and strikes an empty board for its full boosted attack (fast-check)", () => {
  const officeId = "cowboy-sheriffs-office-1";
  const skeleton = { type: "wizard-skeleton", health: 3 };
  const nonGuardWizard = fc.record({
    type: fc.constantFrom(...troopTypes("wizard").filter((type) => !hasKey(type, "guard"))),
    health: fc.integer({ min: 1, max: 6 }), cover: fc.boolean(), gear: fc.boolean(),
  });
  const nonGuardFoe = fc.array(fc.option(nonGuardWizard, { nil: null }), { minLength: 3, maxLength: 3 }).filter((board) => board.some(Boolean));

  // Measured contrast: Sheriff's Office boosts Outrider attack to 2, yet ride-past deals 1 while an empty board takes 2.
  const beforeOffice = stage({ active: "cowboy", own: [{ type: "cowboy-outrider", health: 3 }], foe: [skeleton], hand: [officeId] });
  assert.equal(attackOf(beforeOffice, beforeOffice.sides.cowboy.board[0]), 1);
  const withOffice = applyShowdown(beforeOffice, { type: "location", cardId: officeId }).state;
  assert.equal(attackOf(withOffice, withOffice.sides.cowboy.board[0]), 2);
  const rodePast = applyShowdown(withOffice, { type: "attack", slot: 0, target: "base" });
  assert.equal(rodePast.state.sides.wizard.base, 4);
  assert.equal(rodePast.state.sides.wizard.board[0].health, 3);
  assert.equal(rodePast.state.sides.cowboy.board[0].health, 3);
  assert.equal(presentEvent(rodePast.events[0]), "카우보이 아웃라이더 → 마법사 기지 공격: 오브 1개 피해.");

  const emptyBoosted = applyShowdown(
    stage({ active: "cowboy", own: [{ type: "cowboy-outrider", health: 3 }], foe: [], hand: [officeId] }),
    { type: "location", cardId: officeId },
  ).state;
  const fullStrike = applyShowdown(emptyBoosted, { type: "attack", slot: 0, target: "base" });
  assert.equal(fullStrike.state.sides.wizard.base, 3);
  assert.equal(fullStrike.events[0].baseDamage, 2);
  assert.equal(presentEvent(fullStrike.events[0]), "카우보이 아웃라이더 → 마법사 기지 공격: 오브 2개 피해.");

  const lethalRide = applyShowdown(
    stage({ active: "cowboy", own: [{ type: "cowboy-outrider", health: 2 }], foe: [skeleton], bases: { cowboy: 5, wizard: 1 } }),
    { type: "attack", slot: 0, target: "base" },
  );
  assert.equal(lethalRide.state.sides.wizard.base, 0);
  assert.deepEqual(lethalRide.state.result, { winner: "cowboy", reason: "base" });

  fc.assert(fc.property(
    fc.record({
      slot: fc.nat({ max: 2 }), health: fc.integer({ min: 1, max: 3 }), gear: fc.boolean(), office: fc.boolean(),
      own: boardSpec("cowboy"), foe: nonGuardFoe,
      bases: fc.record({ cowboy: fc.integer({ min: 1, max: 5 }), wizard: fc.integer({ min: 1, max: 5 }) }),
    }),
    ({ slot, health, gear, office, own, foe, bases }) => {
      const cowboy = [...own];
      cowboy[slot] = { type: "cowboy-outrider", health, cover: false, gear };
      const withLocation = (state) => (office ? { ...state, location: { cardId: officeId, side: "cowboy" } } : state);
      const fullAttack = 1 + (gear ? 1 : 0) + (office ? 1 : 0);
      const riderId = idAt(cowboy[slot], slot);

      const defended = withLocation(stage({ active: "cowboy", own: cowboy, foe, bases }));
      assert.equal(attackOf(defended, defended.sides.cowboy.board[slot]), fullAttack);
      if (office && !gear) assert.equal(attackOf(defended, defended.sides.cowboy.board[slot]), 2);
      const ride = applyShowdown(defended, { type: "attack", slot, target: "base" });
      assert.equal(ride.state.sides.wizard.base, bases.wizard - 1);
      assert.equal(ride.state.sides.cowboy.base, bases.cowboy);
      assert.deepEqual(ride.state.sides.wizard.board, defended.sides.wizard.board);
      defended.sides.cowboy.board.forEach((troop, at) => {
        assert.deepEqual(ride.state.sides.cowboy.board[at], at === slot ? { ...troop, attacked: true } : troop);
      });
      assert.deepEqual(ride.state.result, bases.wizard === 1 ? { winner: "cowboy", reason: "base" } : null);
      assert.deepEqual(ride.events, [{
        type: "attack", side: "cowboy", cardId: riderId, target: "base",
        covered: false, hitBack: 0, baseDamage: 1, targetLeft: null, attackerLeft: health,
      }]);
      assert.equal(presentEvent(ride.events[0]), "카우보이 아웃라이더 → 마법사 기지 공격: 오브 1개 피해.");

      const empty = withLocation(stage({ active: "cowboy", own: cowboy, foe: [], bases }));
      assert.deepEqual(
        showdownActions(empty).filter((action) => action.type === "attack" && action.slot === slot),
        [{ type: "attack", slot, target: "base" }],
      );
      const strike = applyShowdown(empty, { type: "attack", slot, target: "base" });
      assert.equal(strike.state.sides.wizard.base, Math.max(0, bases.wizard - fullAttack));
      assert.deepEqual(strike.events, [{
        type: "attack", side: "cowboy", cardId: riderId, target: "base",
        covered: false, hitBack: 0, baseDamage: fullAttack, targetLeft: null, attackerLeft: health,
      }]);
      assert.equal(presentEvent(strike.events[0]), `카우보이 아웃라이더 → 마법사 기지 공격: 오브 ${fullAttack}개 피해.`);
    },
  ), FC);
});
