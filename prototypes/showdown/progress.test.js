import test from "node:test";
import assert from "node:assert/strict";
import {RARITY, TYPES} from "./cards.js";
import {applyAction, canAttack, createShowdown} from "./rules.js";
import {BOUNTIES, DECK_SIZE, HUNTS, OPEN_WINS_PER_PACK, PACK_SIZE, RIVALS, choose, deckProblems, duelFor, duelList, migrate, newSave, openPack, owned, settle, trailDone, withDeck} from "./progress.js";
import {GRIT_CAP, STARTER, TRAIL, deckAfter} from "./trail.js";
import {LADDER, saveAt, winRate} from "./trail-sim.mjs";
import {LOG_LIMIT, logged, report} from "./playtest.js";

const total = (counts) => Object.values(counts).reduce((sum, copies) => sum + copies, 0);
const win = (save, id) => settle(save, id, true);
const states = (save) => Object.fromEntries(duelList(save).map((duel) => [duel.kind === "trail" ? `trail ${duel.index + 1}` : duel.id, duel.state]));

test("every opponent deck is sixteen Wizard cards, and every reward is a Cowboy card the player does not have yet", () => {
  assert.ok(Object.keys(STARTER).every((type) => !(TYPES[type].keys ?? []).length), "the starter has no keywords");
  const had = new Set(Object.keys(STARTER));
  for (const duel of [...TRAIL, ...RIVALS, ...BOUNTIES]) {
    assert.equal(total(duel.deck), DECK_SIZE, duel.name);
    assert.ok(Object.keys(duel.deck).every((type) => TYPES[type].side === "wizard"), duel.name);
    // A Trail reward is [earned, replaced, copies]; a rival's is a list of types; a bounty's is one type.
    for (const type of duel.hunts ? [duel.reward] : duel.reward.map((each) => (Array.isArray(each) ? each[0] : each))) {
      assert.equal(TYPES[type].side, "cowboy", `${duel.name}: ${type}`);
      assert.ok(!had.has(type), `${duel.name} pays ${type} twice`);
      had.add(type);
    }
  }
  TRAIL.forEach((_, wins) => assert.equal(total(deckAfter(wins + 1)), DECK_SIZE));
  for (const bounty of BOUNTIES) {
    assert.equal(bounty.hunts.length, HUNTS);
    assert.equal(TYPES[bounty.reward].rarity, "legendary");
    assert.ok(!bounty.deck[bounty.boss], "the boss is not also in its escort deck");
  }
});

test("a new save is playable and only the first Trail duel is open", () => {
  const save = newSave();
  assert.deepEqual(deckProblems(save, save.deck, save.side), []);
  const list = states(save);
  assert.equal(list["trail 1"], "open");
  assert.ok(Object.entries(list).every(([id, state]) => id === "trail 1" || state === "locked"));
  assert.equal(duelFor(save, "open"), null);
  assert.equal(duelFor(save, "rival:stargazer"), null);
  assert.equal(duelFor(save, "hunt:lantern-wraith"), null);
});

test("a Trail win pays its card into the deck and offers a choice of two cards the player has met", () => {
  const {save, earned} = win(newSave(), "trail");
  assert.deepEqual(earned, {cards: [["cowboy-covered-wagon", 2]], packs: 0, captured: null});
  assert.equal(save.wins, 1);
  assert.deepEqual(save.deck, deckAfter(1));
  assert.equal(owned(save, "cowboy-covered-wagon"), 2);
  assert.deepEqual([...save.offer].sort(), ["cowboy-covered-wagon", "cowboy-deadeye"]);
  const chosen = choose(save, "cowboy-deadeye");
  assert.equal(owned(chosen, "cowboy-deadeye"), 4);
  assert.equal(chosen.offer, null);
  assert.equal(duelFor(save, "trail"), null, "no duel starts while a card is on offer");
  assert.equal(duelFor(chosen, "trail").name, "까마귀 둥지");
  assert.throws(() => choose(save, "cowboy-gatling-crew"), /not on offer/);
  assert.throws(() => choose(chosen, "cowboy-deadeye"), /not on offer/);
  // A player who rebuilt the deck keeps it: the new card replaces only the plain cards still there.
  const custom = withDeck(newSave(), {"cowboy-sheriff": 1, "cowboy-billy": 12, "cowboy-deadeye": 3});
  assert.deepEqual(win(custom, "trail").save.deck, {"cowboy-billy": 12, "cowboy-deadeye": 3, "cowboy-covered-wagon": 1});
});

test("a loss gives the rematch one more Base orb, twice at most, and a win clears it", () => {
  let save = newSave();
  const base = () => duelFor(save, "trail").options.baseOrbs.cowboy;
  assert.equal(base(), 5);
  for (const expected of [6, 7, 7]) {
    ({save} = settle(save, "trail", false));
    assert.equal(base(), expected);
  }
  assert.equal(5 + GRIT_CAP, 7);
  ({save} = win(save, "trail"));
  save = choose(save, save.offer[0]);
  assert.equal(base(), 5);
  const open = saveAt();
  assert.deepEqual(settle(open, "open", false).save, open, "a lost even match changes nothing");
});

test("the Trail's end pays a pack and opens the rivals in order, the bounties and the even match", () => {
  const five = saveAt({wins: TRAIL.length - 1});
  const {save, earned} = win(five, "trail");
  assert.ok(trailDone(save));
  assert.equal(earned.packs, 1);
  assert.equal(save.packs, 1);
  assert.equal(duelFor(save, "trail"), null);
  const list = states(save);
  assert.deepEqual([list["rival:stargazer"], list["rival:imp"], list["hunt:lantern-wraith"], list.open], ["open", "locked", "open", "open"]);
  assert.equal(duelFor(save, "rival:imp"), null);

  const beaten = win(save, "rival:stargazer");
  assert.deepEqual(beaten.earned, {cards: [["cowboy-six-shooter", 1]], packs: 1, captured: null});
  assert.equal(states(beaten.save)["rival:imp"], "open");
  // A rematch with a beaten rival still offers a card, but pays its reward only once.
  const again = win(beaten.save, "rival:stargazer");
  assert.deepEqual(again.earned, {cards: [], packs: 0, captured: null});
  assert.equal(again.save.offer.length, 2);
  assert.deepEqual(again.save.rivals, ["stargazer"]);
});

test("a bounty: five hunts, each harder, and the fifth win captures the boss's card", () => {
  let save = saveAt();
  const orbs = [];
  for (let hunt = 1; hunt <= HUNTS; hunt++) {
    const duel = duelFor(save, "hunt:lantern-wraith");
    assert.equal(duel.name, `랜턴 망령, 사냥 ${hunt}/${HUNTS}`);
    const state = createShowdown(1, duel.options);
    assert.equal(TYPES["wizard-lantern-wraith"].name, "랜턴 망령");
    orbs.push(state.sides.wizard.board[0].health);
    const done = win(save, "hunt:lantern-wraith");
    assert.equal(done.earned.captured, hunt === HUNTS ? "cowboy-captured-wraith" : null);
    save = choose(done.save, done.save.offer[0]);
  }
  assert.deepEqual(orbs, [4, 5, 6, 7, 8]);
  assert.equal(owned(save, "cowboy-captured-wraith"), 1);
  assert.equal(duelFor(save, "hunt:lantern-wraith"), null);
  assert.equal(states(save)["hunt:lantern-wraith"], "won");
  // The Dragon lands by itself on the Wizards' second turn, resting, and costs them no card.
  let dragon = createShowdown(1, duelFor(save, "hunt:graveyard-dragon").options);
  assert.deepEqual(dragon.arrivals, [{side: "wizard", type: "wizard-dragon", turn: 4, health: 2}]);
  assert.equal(dragon.sides.wizard.hand.length, 5);
  for (let i = 0; i < 2; i++) dragon = applyAction(dragon, {type: "end"}).state;
  assert.deepEqual(dragon.sides.wizard.board, [null, null, null], "not before turn 4");
  const landed = applyAction(dragon, {type: "end"});
  // The Wizards have only passed in this test, so their hand is full and the turn's draw is discarded.
  assert.deepEqual(landed.events.map((event) => event.type), ["turn", "summon", "burn"]);
  assert.deepEqual(landed.state.sides.wizard.board.map((t) => t && [t.cardId, t.health, canAttack(landed.state, t)]), [["wizard-dragon-0", 2, false], null, null]);
  assert.deepEqual(landed.state.arrivals, []);
  // With no free slot it waits for the next Wizard turn.
  const filler = (id) => ({cardId: id, health: 3, attacked: false, stunned: false, cover: false, gear: [], arrived: 0, ready: false});
  dragon.sides.wizard.board = ["wizard-skeleton-1", "wizard-skeleton-2", "wizard-skeleton-3"].map(filler);
  assert.equal(applyAction(dragon, {type: "end"}).state.arrivals.length, 1);
});

test("the even match pays a pack every third win", () => {
  let save = saveAt();
  const packs = [];
  for (let i = 0; i < 2 * OPEN_WINS_PER_PACK; i++) {
    const done = win(save, "open");
    packs.push(done.earned.packs);
    save = done.save;
  }
  assert.deepEqual(packs, [0, 0, 1, 0, 0, 1]);
});

test("offers and packs: the same save gives the same cards, never a basic or legendary card, never past the deck limit", () => {
  const save = {...saveAt({rivals: RIVALS.length}), packs: 40};
  assert.deepEqual(openPack(save), openPack(save));
  assert.deepEqual(win(save, "open").save.offer, win(save, "open").save.offer);
  assert.equal(win(save, "open").save.rolls, save.rolls + 1, "each offer uses up a roll, so the next one differs");
  assert.equal(openPack(save).save.rolls, save.rolls + 1);
  assert.throws(() => openPack({...save, packs: 0}), /no pack/);
  let next = save;
  let opened = 0;
  let short = false;
  while (next.packs > 0) {
    const pack = openPack(next);
    opened += 1;
    if (pack.cards.length === PACK_SIZE) {
      assert.ok(!short, "a full pack after a short one");
      // The first card is Uncommon or better while one is still left to earn.
      const before = Object.keys(TYPES).some((type) => TYPES[type].side === "cowboy" && ["uncommon", "rare"].includes(TYPES[type].rarity) && owned(next, type) < RARITY[TYPES[type].rarity][1]);
      if (before) assert.notEqual(TYPES[pack.cards[0]].rarity, "common");
    } else short = true;
    for (const type of pack.cards) assert.ok(!["basic", "legendary"].includes(TYPES[type].rarity) && TYPES[type].side === "cowboy", type);
    next = pack.save;
    for (const [type, copies] of Object.entries(next.collection)) assert.ok(copies <= RARITY[TYPES[type].rarity][1], `${copies} ${type}`);
  }
  assert.ok(short, "forty packs fill the collection, so the last ones come up short");
  assert.equal(opened, 40);
  assert.equal(win(next, "open").save.offer, null, "nothing left to offer");
});

test("a rival's own reward cannot be earned before that rival is beaten, and never goes past its limit", () => {
  const held = (save) => {
    const cards = [];
    for (let next = {...save, packs: 30}; next.packs > 0;) {
      const pack = openPack(next);
      cards.push(...pack.cards);
      next = pack.save;
    }
    return ["cowboy-six-shooter", "cowboy-sheriffs-office"].filter((type) => cards.includes(type));
  };
  assert.deepEqual(held(saveAt()), [], "thirty packs before any rival");
  assert.deepEqual(held(saveAt({rivals: 1})), ["cowboy-six-shooter"]);
  assert.deepEqual(held(saveAt({rivals: 2})), ["cowboy-six-shooter", "cowboy-sheriffs-office"]);
  // So the reward is always the first copy.
  let save = saveAt();
  for (const rival of RIVALS) {
    for (let next = {...save, packs: 30}; next.packs > 0; save = next) next = openPack(next).save;
    for (const type of rival.reward) assert.equal(owned(save, type), 0, `${type} before ${rival.name}`);
    save = {...win(save, `rival:${rival.id}`).save, offer: null};
  }
});

test("deck rules: sixteen cards, only what you own, rarity limits across deck and side deck, four in the side deck", () => {
  const save = {...saveAt(), collection: {"cowboy-deadeye": 4, "cowboy-lasso": 3, "cowboy-mounted-billy": 2, "cowboy-captured-wraith": 1, "cowboy-covered-wagon": 2}};
  const ok = {"cowboy-sheriff": 9, "cowboy-deadeye": 4, "cowboy-mounted-billy": 2, "cowboy-captured-wraith": 1};
  assert.deepEqual(deckProblems(save, ok, {"cowboy-lasso": 3, "cowboy-covered-wagon": 1}), []);
  assert.deepEqual(withDeck(save, {...ok, "cowboy-lasso": 0}).deck, ok, "zero counts are dropped");
  const problem = (deck, side) => deckProblems(save, deck, side).join(" ");
  assert.match(problem({...ok, "cowboy-sheriff": 8}), /정확히 16/);
  assert.match(problem({...ok, "cowboy-sheriff": 6, "cowboy-covered-wagon": 3}), /포장마차 보유 수량은 2장/);
  assert.match(problem(ok, {"cowboy-deadeye": 1}), /명사수 보유 수량은 4장/);
  assert.match(problem(ok, {"cowboy-lasso": 3, "cowboy-covered-wagon": 2}), /최대 4장/);
  assert.match(problem({...ok, "cowboy-sheriff": 8, "wizard-imp": 1}), /카우보이 카드가 아닙니다/);
  const rich = {...save, collection: {...save.collection, "cowboy-mounted-billy": 3}};
  assert.match(deckProblems(rich, {...ok, "cowboy-sheriff": 8, "cowboy-mounted-billy": 3}).join(" "), /희귀 등급입니다: 덱과 사이드 덱을 합쳐 최대 2장/);
  assert.throws(() => withDeck(save, {...ok, "cowboy-sheriff": 8}), /정확히 16/);
  assert.match(problem({...ok, "cowboy-sheriff": 13, "cowboy-deadeye": -4}), /온전한 카드 장수/);
  assert.match(problem({...ok, "cowboy-sheriff": 8.5, "cowboy-billy": .5}), /온전한 카드 장수/);
});

test("saves: the first version is carried over, a round trip is exact, and anything untrustworthy starts fresh", () => {
  const old = migrate({wins: 3, losses: 1});
  assert.equal(old.wins, 3);
  assert.deepEqual(old.deck, deckAfter(3));
  assert.deepEqual([old.offer, old.packs], [null, 0]);
  assert.equal(migrate({wins: 6, losses: 0}).packs, 1, "the Trail's pack survives the old format");
  let save = win(saveAt({rivals: 2, hunts: {"lantern-wraith": 3}}), "open").save;
  assert.deepEqual(migrate(JSON.parse(JSON.stringify(save))), save);
  for (const bad of [null, "x", {v: 2}, {...save, wins: 99}, {...save, deck: {...save.deck, "cowboy-gatling-crew": 4}}, {...save, rivals: ["nobody"]},
    {...save, hunts: {"lantern-wraith": 9}}, {...save, offer: ["wizard-imp", "cowboy-lasso"]}, {...save, packs: -1}, {...save, collection: {"no-such-card": 1}},
    // Parts that do not agree with each other: nothing a player could not have earned.
    {...save, collection: {...save.collection, "cowboy-captured-dragon": 1}}, {...save, collection: {...save.collection, "cowboy-gatling-crew": 9}},
    {...save, collection: {...save.collection, "wizard-imp": 1}}, {...save, rivals: ["imp", "stargazer"]}, {...save, rivals: ["stargazer", "stargazer"]},
    {...save, offer: ["cowboy-captured-wraith", "cowboy-captured-dragon"]}, {...newSave(), openWins: 3}, {...newSave(), hunts: {"lantern-wraith": 5}}]) {
    assert.deepEqual(migrate(bad), newSave());
  }
});

test("the playtest report says how far a player got, where they first lost and where they lost most", () => {
  assert.equal(report([], newSave()), "No duel has been finished yet.");
  let log = [];
  for (const [name, won, turns, seconds, rules] of [["Boot Hill", true, 9, 80, false], ["Raven Roost", true, 11, 150, true], ["The Bone Fence", false, 14, 200, false],
    ["The Bone Fence", false, 12, 100, true], ["The Bone Fence", true, 13, 190, false], ["Imp Hollow", false, 8, 60, false]]) log = logged(log, {name, won, turns, seconds, rules});
  const text = report(log, saveAt({wins: 3}));
  for (const line of ["Finished 6 duels in 13 min of play: won 3, lost 3.", "Reached: Trail 3 of 6 won, rivals 0 of 4, Wanted hunts 0 of 10, even-match wins 0.", "First loss: duel 3, The Bone Fence.",
    "Lost most often: The Bone Fence, 2 times.", 'Opened "All the rules" during 2 of 6 duels.', "1. Boot Hill: won in 9 turns, 80 s", "2. Raven Roost: won in 11 turns, 3 min, read the rules", "6. Imp Hollow: lost in 8 turns, 60 s"]) {
    assert.ok(text.split("\n").includes(line), `missing line: ${line}\n${text}`);
  }
  assert.ok(report([{name: "Boot Hill", won: true, turns: 9, seconds: 80, rules: false}], saveAt({wins: 1})).includes("Never lost."));
  let long = [];
  for (let i = 0; i < LOG_LIMIT + 5; i++) long = logged(long, {name: `duel ${i}`, won: true, turns: 1, seconds: 1, rules: false});
  assert.deepEqual([long.length, long[0].name], [LOG_LIMIT, "duel 5"]);
});

test("no save reached by play is ever refused: 150 random careers", () => {
  let x = 7;
  const rnd = (n) => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 12) % n; };
  for (let career = 0; career < 150; career++) {
    let save = newSave();
    for (let step = 0; step < 60; step++) {
      if (save.offer) save = rnd(5) ? choose(save, save.offer[rnd(2)]) : save;
      else if (save.packs && rnd(2)) save = openPack(save).save;
      else {
        const open = duelList(save).filter((duel) => duel.state === "open" || (duel.kind === "rival" && duel.state === "won"));
        const duel = open[rnd(open.length)];
        if (duelFor(save, duel.id)) save = settle(save, duel.id, rnd(3) > 0).save;
      }
      assert.deepEqual(migrate(JSON.parse(JSON.stringify(save))), save, `career ${career}, step ${step}`);
      assert.deepEqual(deckProblems(save, save.deck, save.side), []);
    }
  }
});

test("a cushion, then a ramp, all the way to the even match: bot players on 80 deals", () => {
  const deals = 80;
  const rate = (label, level) => {
    const [, save, id] = LADDER.find(([each]) => each.startsWith(label));
    return winRate(save, id, level, deals);
  };
  // Any legal play wins the first two duels.
  for (const duel of ["Trail 1", "Trail 2"]) assert.ok(rate(duel, 0) >= .95, `${duel} is not a sure win for careless play`);
  // A player who plans the turn wins most of every Trail duel and of the first three rivals.
  const careful = Object.fromEntries(["Trail 3", "Trail 4", "Trail 5", "Trail 6", "Rival 1", "Rival 2", "Rival 3", "Rival 4", "Open range"].map((duel) => [duel, rate(duel, 2)]));
  for (const duel of ["Trail 3", "Trail 4", "Trail 5", "Trail 6", "Rival 1", "Rival 2", "Rival 3"]) assert.ok(careful[duel] >= .7, `${duel}: a careful player wins only ${careful[duel]}`);
  // The last rival is the wall, and the even match after it is winnable.
  assert.ok(careful["Rival 4"] < careful["Rival 3"] && careful["Rival 4"] >= .4, `the last rival: ${careful["Rival 4"]}`);
  assert.ok(careful["Open range"] >= .45 && careful["Open range"] <= .8, `the even match: ${careful["Open range"]}`);
  // Each bounty starts gentle and its last hunt is the hardest.
  for (const bounty of BOUNTIES) {
    const [first, last] = [rate(`${bounty.name}, hunt 1`, 2), rate(`${bounty.name}, hunt 5`, 2)];
    assert.ok(first >= .8 && last < first && last >= .35, `${bounty.name}: ${first} then ${last}`);
  }
});
