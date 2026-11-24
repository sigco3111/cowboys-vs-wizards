// Issue 143 slice 3: the graybox Camp's other modes on the canonical modules — rivals, Wanted hunts,
// packs, the deck builder with a side deck, best of three, and two players on one screen.
// Expected values come from src/game/showdown/progress.js itself; nothing here restates a reward.
import assert from "node:assert/strict";
import test from "node:test";
import {TYPES} from "../../src/game/showdown/cards.js";
import {SAVE_KEY} from "../../src/game/showdown/campaign-store.js";
import {BOUNTIES, DECK_SIZE, HUNTS, RIVALS, choose, newSave, openPack, settle, trailDone} from "../../src/game/showdown/progress.js";
import {decodeSaveCode, encodeSave} from "../../src/game/showdown/savecode.js";
import {TRAIL} from "../../src/game/showdown/trail.js";
import {createCampaign} from "../../src/match/showdown-campaign.js";
import {matchOver, matchWinner, newMatch, nextGame, offersSwap, recordGame, swapPool, swapProblems, withSwap} from "../../src/match/showdown-match.js";
import {createShowdownSession, twoPlayers} from "../../src/match/showdown-session.js";

const memoryStorage = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  const writes = [];
  return {getItem: (key) => (map.has(key) ? map.get(key) : null), setItem: (key, value) => { writes.push(key); map.set(key, String(value)); }, map, writes};
};
// A save that has won the whole Trail, taking the first offered card each time (progress.js only).
const postTrail = () => {
  let save = newSave();
  while (!trailDone(save)) {
    save = settle(save, "trail", true).save;
    save = choose(save, save.offer[0]);
  }
  return save;
};
const stored = (save) => memoryStorage({[SAVE_KEY]: JSON.stringify(save)});
const sum = (counts) => Object.values(counts).reduce((a, b) => a + b, 0);
const firstNonEnd = (legal) => legal.find((a) => a.type === "attack") ?? legal.find((a) => a.type !== "end" && a.type !== "cover") ?? legal.find((a) => a.type === "end");

test("a new profile has rivals, Wanted hunts and the even match locked; two players needs nothing", () => {
  const campaign = createCampaign(memoryStorage());
  const states = Object.fromEntries(campaign.duels().filter((d) => d.kind !== "trail").map((d) => [d.id, d.state]));
  assert.ok(Object.values(states).every((state) => state === "locked"), JSON.stringify(states));
  for (const id of ["rival:stargazer", "hunt:lantern-wraith", "open"]) assert.equal(campaign.duel(id), null, id);
  assert.equal(twoPlayers().kind, "two");
});

test("after the Trail: the first rival opens, the next waits for it, and a beaten rival can be fought again", () => {
  const campaign = createCampaign(stored(postTrail()));
  assert.ok(campaign.duel(`rival:${RIVALS[0].id}`));
  assert.equal(campaign.duel(`rival:${RIVALS[1].id}`), null);
  const out = campaign.settle(campaign.duel(`rival:${RIVALS[0].id}`), true);
  assert.deepEqual(out.earned.cards, RIVALS[0].reward.map((type) => [type, 1]));
  assert.equal(out.earned.packs, RIVALS[0].packs);
  campaign.choose(campaign.progress().offer[0]);
  assert.ok(campaign.duel(`rival:${RIVALS[1].id}`), "the next rival opens");
  assert.ok(campaign.duel(`rival:${RIVALS[0].id}`), "a beaten rival can be fought again");
});

test("a Wanted hunt repeats: each win clears one hunt, a loss clears none, the fifth captures the Legendary", () => {
  const storage = stored(postTrail());
  let campaign = createCampaign(storage);
  const bounty = BOUNTIES[1];
  const id = `hunt:${bounty.id}`;
  campaign.settle(campaign.duel(id), false);
  assert.equal(campaign.progress().hunts[bounty.id] ?? 0, 0);
  for (let hunt = 1; hunt <= HUNTS; hunt += 1) {
    const duel = campaign.duel(id);
    assert.equal(duel.name, `${bounty.name}, 사냥 ${hunt}/${HUNTS}`);
    const out = campaign.settle(duel, true);
    assert.equal(out.earned.captured, hunt === HUNTS ? bounty.reward : null);
    if (campaign.progress().offer) campaign.choose(campaign.progress().offer[0]);
    campaign = createCampaign(storage); // reload between hunts
    assert.equal(campaign.progress().hunts[bounty.id], hunt);
  }
  assert.equal(campaign.duel(id), null, "a captured bounty is finished");
  assert.equal(campaign.owned(bounty.reward), 1);
});

test("packs open one at a time through the campaign, as progress.js openPack rolls them, and survive a reload", () => {
  let save = postTrail();
  assert.ok(save.packs >= 1, "the Trail pays a pack");
  const storage = stored(save);
  const campaign = createCampaign(storage);
  const expected = openPack(save);
  const cards = campaign.openPack();
  assert.deepEqual(cards, expected.cards);
  assert.deepEqual(createCampaign(storage).progress(), expected.save);
  for (const type of cards) assert.ok(campaign.owned(type) >= 1);
});

test("the deck builder saves only a legal deck and side deck; the side deck is kept and listed", () => {
  const storage = stored(postTrail());
  const campaign = createCampaign(storage);
  const {deck} = campaign.progress();
  const [plain] = Object.keys(deck).filter((type) => TYPES[type].rarity === "basic");
  // One basic card out of the deck into the side deck leaves 15: refused.
  const short = {...deck, [plain]: deck[plain] - 1};
  assert.ok(campaign.deckProblems(short, {[plain]: 1}).length > 0);
  assert.throws(() => campaign.withDeck(short, {[plain]: 1}));
  // Five side cards: refused. Four: kept.
  assert.ok(campaign.deckProblems(deck, {[plain]: 5}).some((p) => /side deck/.test(p)));
  campaign.withDeck(deck, {[plain]: 4});
  assert.deepEqual(createCampaign(storage).progress().side, {[plain]: 4});
  // More copies than owned: refused.
  const [rare] = Object.keys(campaign.progress().collection);
  assert.ok(campaign.deckProblems({...deck, [plain]: deck[plain] - 9, [rare]: (deck[rare] ?? 0) + 9}, {}).length > 0);
});

test("best of three: first to two wins, a draw counts for nobody, the loser opens the next game", () => {
  let match = newMatch({deck: {a: 1}, side: {}});
  match = recordGame(match, {winner: "wizard", first: "cowboy"});
  assert.deepEqual([match.wins, match.first, matchOver(match)], [{cowboy: 0, wizard: 1}, "cowboy", false]);
  match = recordGame(nextGame(match), {winner: null, first: "cowboy"});
  assert.deepEqual([match.wins, match.first, match.game], [{cowboy: 0, wizard: 1}, "cowboy", 2]);
  match = recordGame(nextGame(match), {winner: "cowboy", first: "cowboy"});
  assert.deepEqual([match.first, matchOver(match)], ["wizard", false]);
  match = recordGame(nextGame(match), {winner: "cowboy", first: "wizard"});
  assert.deepEqual([matchOver(match), matchWinner(match), match.game], [true, "cowboy", 4]);
});

test("the side-deck swap moves only this match's cards and keeps a full deck", () => {
  const save = postTrail();
  const [plain] = Object.keys(save.deck).filter((type) => TYPES[type].rarity === "basic");
  const [other] = Object.keys(save.deck).filter((type) => type !== plain);
  const match = newMatch({deck: save.deck, side: {[plain]: 2}});
  assert.equal(offersSwap(match), true);
  assert.equal(offersSwap(newMatch({deck: save.deck})), false);
  const pool = swapPool(match);
  assert.equal(pool[plain], save.deck[plain] + 2);
  const swapped = {deck: {...save.deck, [plain]: save.deck[plain] + 1, [other]: save.deck[other] - 1}, side: {[plain]: 1, [other]: 1}};
  assert.deepEqual(swapProblems(pool, swapped.deck, swapped.side), []);
  assert.equal(sum(withSwap(match, swapped.deck, swapped.side).deck), DECK_SIZE);
  assert.ok(swapProblems(pool, {...save.deck, [plain]: save.deck[plain] + 2}, {}).length > 0, "a 17-card deck is refused");
  assert.ok(swapProblems(pool, {...swapped.deck, "cowboy-captured-dragon": 1}, swapped.side).length > 0, "a card from outside the match is refused");
});

test("a solo best of three on the even match is settled once, at the end, with the match's deck", () => {
  const storage = stored(postTrail());
  const campaign = createCampaign(storage);
  const before = campaign.progress();
  let match = newMatch(before);
  const results = [];
  for (let seed = 0; !matchOver(match) && seed < 20; seed += 1) {
    const duel = campaign.duel("open", match.deck);
    const session = createShowdownSession({seed, duel, ...(match.first ? {first: match.first} : {})});
    for (let step = 0; step < 600 && !session.view().result; step += 1) session.act(firstNonEnd(session.legal()));
    results.push(session.view().result.winner);
    match = recordGame(match, {winner: session.view().result.winner, first: session.view().first});
    assert.deepEqual(campaign.progress(), before, "nothing is saved between games");
    if (!matchOver(match)) match = nextGame(match);
  }
  assert.ok(matchOver(match), JSON.stringify(results));
  const writes = storage.writes.length;
  campaign.settle(campaign.duel("open"), matchWinner(match) === "cowboy");
  assert.equal(storage.writes.length, writes + 1, "one save for the whole match");
  assert.equal(campaign.progress().openWins, before.openWins + (matchWinner(match) === "cowboy" ? 1 : 0));
});

test("two players on one screen: the active seat sees only its own hand and traps, and only it may act", () => {
  for (let seed = 0; seed < 12; seed += 1) {
    const session = createShowdownSession({seed, duel: twoPlayers(), players: 2});
    assert.deepEqual(session.opening, [], "no bot plays");
    const seats = new Set();
    for (let step = 0; step < 600 && !session.view().result; step += 1) {
      const view = session.view();
      const seat = session.viewer();
      seats.add(seat);
      assert.equal(view.viewer, seat);
      assert.equal(view.active, seat, "the view is the active seat's");
      const other = view.sides[seat === "cowboy" ? "wizard" : "cowboy"];
      for (const hidden of ["hand", "traps", "deck"]) assert.equal(other[hidden], undefined, `seed ${seed}: the other seat's ${hidden}`);
      const own = view.sides[seat].hand;
      assert.ok(own.every((id) => id.startsWith(`${seat}-`)), "the hand shown is the active seat's");
      const legal = session.legal();
      assert.ok(legal.length > 0);
      session.act(firstNonEnd(legal));
    }
    assert.deepEqual([...seats].sort(), ["cowboy", "wizard"], "both seats played");
    assert.ok(session.view().result, `seed ${seed} finished`);
    assert.deepEqual(session.legal(), []);
    assert.throws(() => session.act({type: "end"}), /not this seat's turn/);
  }
});

test("a save code from the Camp loads into a fresh browser through campaign.replace", () => {
  const save = postTrail();
  const code = encodeSave(save);
  const decoded = decodeSaveCode(code);
  assert.ok(decoded.ok);
  const elsewhere = memoryStorage();
  const campaign = createCampaign(elsewhere);
  assert.equal(campaign.replace(decoded.save), true);
  assert.deepEqual(createCampaign(elsewhere).progress(), save);
  assert.equal(TRAIL.length, createCampaign(elsewhere).progress().wins);
});
