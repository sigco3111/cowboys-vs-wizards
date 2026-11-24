// Everything a player keeps between duels: the Trail, rivals, bounties, the collection, the
// deck, packs and the card offered after a win. Pure: no DOM and no storage. The screen saves
// the object these functions return.
import {DECKS, RARITY, TYPES} from "./cards.js";
import {random} from "./rules.js";
import {GRIT_CAP, STARTER, TRAIL} from "./trail.js";

export const DECK_SIZE = 16;
export const SIDE_SIZE = 4;
export const PACK_SIZE = 3;
export const OPEN_WINS_PER_PACK = 3;

// After the Trail: four rivals that bridge from the last Trail duel to the even match.
// reward: cards paid on the first win. packs: packs paid on the first win.
export const RIVALS = Object.freeze([
  {id: "stargazer", name: "별 관측자", lesson: "주문과 뒷면 카드로 싸웁니다. 이기면 첫 장비를 얻습니다. 부대 하나가 장착하는 카드입니다.",
    level: 1, base: 5, first: "cowboy", reward: ["cowboy-six-shooter"], packs: 1,
    deck: {"wizard-skeleton": 4, "wizard-raven-familiar": 2, "wizard-wizard": 3, "wizard-singularity": 3, "wizard-hellfire": 2, "wizard-hex": 2}},
  {id: "imp", name: "임프", lesson: "빠르고 무모합니다. 엄폐한 부대는 기지에 들어오는 큰 피해를 막아 줍니다. 이기면 첫 장소를 얻습니다.",
    level: 1, base: 5, reward: ["cowboy-sheriffs-office"], packs: 1,
    deck: {"wizard-imp": 3, "wizard-jack-o-lantern": 3, "wizard-skeleton": 4, "wizard-headless-horseman": 2, "wizard-singularity": 2, "wizard-bone-armor": 1, "wizard-hex": 1}},
  {id: "bonewright", name: "뼈 세공사", lesson: "그의 묘지터는 모든 언데드를 더 강하게 만듭니다. 직접 얻은 장소가 그것을 대체합니다.",
    level: 1.5, base: 4, first: "cowboy", reward: [], packs: 1,
    deck: {"wizard-skeleton": 5, "wizard-bone-wall": 3, "wizard-wizard": 3, "wizard-headless-horseman": 2, "wizard-boneyard": 2, "wizard-bone-armor": 1}},
  {id: "coven", name: "묘지 마녀단", lesson: "마법사가 가진 모든 것을, 최대한 잘 운용합니다.",
    level: 2, base: 4, first: "cowboy", reward: [], packs: 2,
    deck: {...DECKS.wizard, "wizard-skeleton": 3, "wizard-boneyard": 1}},
]);

// Bounties: a Wanted boss you must beat five times; the fifth win pays its card.
// The Wraith stands on the board from the start with `orbs` orbs. The Dragon lands by itself at the
// start of the Wizards' turn `lands`, so the player has a few turns to get ready and always meets it.
// hunts: one entry per hunt, each a little harder.
export const BOUNTIES = Object.freeze([
  {id: "lantern-wraith", name: "랜턴 망령", boss: "wizard-lantern-wraith", reward: "cowboy-captured-wraith", entrance: "board",
    lesson: "현상 수배: 랜턴 망령. 처음부터 보드에 서 있으며 주문이 통하지 않습니다.",
    hunts: [{level: 1, base: 4, orbs: 4}, {level: 1, base: 4, orbs: 5}, {level: 1.5, base: 4, orbs: 6}, {level: 1.5, base: 4, orbs: 7}, {level: 2, base: 4, orbs: 8}],
    deck: {"wizard-skeleton": 6, "wizard-jack-o-lantern": 3, "wizard-raven-familiar": 2, "wizard-bone-wall": 2, "wizard-singularity": 2, "wizard-hex": 1}},
  {id: "graveyard-dragon", name: "묘지의 용", boss: "wizard-dragon", reward: "cowboy-captured-dragon", entrance: "lands", lands: 4,
    lesson: "현상 수배: 묘지의 용. 마법사의 두 번째 턴에 내려앉습니다. 그 전에 부대를 내보내세요. 용의 불길이 한 줄을 모두 휩쓸어 버립니다.",
    hunts: [{level: 1, base: 4, orbs: 2}, {level: 1, base: 4, orbs: 3}, {level: 1.5, base: 4, orbs: 3}, {level: 1.5, base: 4, orbs: 4}, {level: 2, base: 4, orbs: 4}],
    // No Guard troop in this escort: a Bone Wall in front of the Dragon made the hunt close to unwinnable.
    deck: {"wizard-skeleton": 9, "wizard-raven-familiar": 2, "wizard-jack-o-lantern": 2, "wizard-wizard": 2, "wizard-singularity": 1}},
]);
export const HUNTS = 5;

const isBasic = (type) => TYPES[type].rarity === "basic";
const cap = (type) => RARITY[TYPES[type].rarity][1];
const total = (counts) => Object.values(counts).reduce((sum, copies) => sum + copies, 0);
const plus = (counts, type, copies = 1) => ({...counts, [type]: (counts[type] ?? 0) + copies});

// The collection lists only cards with a limit. Basic cards are always owned in any number.
export const newSave = () => ({v: 2, wins: 0, losses: {}, collection: {"cowboy-deadeye": STARTER["cowboy-deadeye"]}, deck: {...STARTER}, side: {},
  rivals: [], hunts: {}, openWins: 0, packs: 0, rolls: 0, offer: null});
export const owned = (save, type) => (isBasic(type) ? Infinity : save.collection[type] ?? 0);
export const trailDone = (save) => save.wins >= TRAIL.length;

// Why this deck and side deck cannot be saved; an empty list means they can.
export function deckProblems(save, deck, side = {}) {
  const problems = [];
  if (total(deck) !== DECK_SIZE) problems.push(`덱은 정확히 ${DECK_SIZE}장이어야 합니다. 현재 ${total(deck)}.`);
  if (total(side) > SIDE_SIZE) problems.push(`사이드 덱은 최대 ${SIDE_SIZE}장이어야 합니다. 현재 ${total(side)}.`);
  for (const type of new Set([...Object.keys(deck), ...Object.keys(side)])) {
    const copies = (deck[type] ?? 0) + (side[type] ?? 0);
    const card = TYPES[type];
    if (![deck[type] ?? 0, side[type] ?? 0].every((count) => Number.isInteger(count) && count >= 0)) problems.push(`${type}: 덱에는 완전한 카드만 들어갑니다.`);
    if (!card || card.side !== "cowboy") problems.push(`${type} 은(는) 카우보이 카드가 아닙니다.`);
    else if (copies > owned(save, type)) problems.push(`보유 수량 ${owned(save, type)} ${card.name}장, 요청: ${copies}.`);
    else if (copies > cap(type)) problems.push(`${card.name} is ${RARITY[card.rarity][0]}: 최대 ${cap(type)}장까지 덱과 사이드 덱에 넣을 수 있습니다.`);
  }
  return problems;
}

export function withDeck(save, deck, side = {}) {
  const problems = deckProblems(save, deck, side);
  if (problems.length) throw new Error(problems.join(" "));
  const tidy = (counts) => Object.fromEntries(Object.entries(counts).filter(([, copies]) => copies > 0));
  return {...save, deck: tidy(deck), side: tidy(side)};
}

// The duels a player can start now, in the order the camp shows them.
export function duelList(save) {
  const list = [];
  TRAIL.forEach((duel, i) => list.push({id: "trail", kind: "trail", index: i, name: duel.name, state: i < save.wins ? "won" : i === save.wins ? "open" : "locked"}));
  RIVALS.forEach((rival, i) => list.push({id: `rival:${rival.id}`, kind: "rival", name: rival.name,
    state: save.rivals.includes(rival.id) ? "won" : trailDone(save) && save.rivals.length >= i ? "open" : "locked"}));
  for (const bounty of BOUNTIES) {
    const cleared = save.hunts[bounty.id] ?? 0;
    list.push({id: `hunt:${bounty.id}`, kind: "hunt", name: bounty.name, cleared, state: cleared >= HUNTS ? "won" : trailDone(save) ? "open" : "locked"});
  }
  list.push({id: "open", kind: "open", name: "열린 벌판", state: trailDone(save) ? "open" : "locked"});
  return list;
}

// Everything the screen and the bot need to play duel `id`, or null when it is locked or finished.
// deck is the Cowboy deck to play; it defaults to the saved one.
// A card on offer has to be taken first, so a second win can never replace an unclaimed choice.
export function duelFor(save, id, deck = save.deck) {
  if (save.offer) return null;
  const [kind, key] = id.split(":");
  const grit = Math.min(save.losses[id] ?? 0, GRIT_CAP);
  if (kind === "trail") {
    const duel = TRAIL[save.wins];
    return duel ? {id, kind, battlefield: duel.id, name: duel.name, lesson: duel.lesson, level: duel.level,
      options: {decks: {cowboy: deck, wizard: duel.deck}, baseOrbs: {cowboy: 5 + grit, wizard: duel.base}, first: duel.first}} : null;
  }
  if (!trailDone(save)) return null;
  if (kind === "rival") {
    const at = RIVALS.findIndex((rival) => rival.id === key);
    if (at < 0 || at > save.rivals.length) return null;
    const rival = RIVALS[at];
    return {id, kind, name: rival.name, lesson: rival.lesson, level: rival.level,
      options: {decks: {cowboy: deck, wizard: rival.deck}, baseOrbs: {cowboy: 5 + grit, wizard: rival.base}, ...(rival.first ? {first: rival.first} : {})}};
  }
  if (kind === "hunt") {
    const bounty = BOUNTIES.find((each) => each.id === key);
    const cleared = save.hunts[key] ?? 0;
    if (!bounty || cleared >= HUNTS) return null;
    const hunt = bounty.hunts[cleared];
    return {id, kind, name: `${bounty.name}, 사냥 ${cleared + 1}/${HUNTS}`, lesson: bounty.lesson, level: hunt.level,
      options: {decks: {cowboy: deck, wizard: bounty.deck}, baseOrbs: {cowboy: 5 + grit, wizard: hunt.base}, first: "cowboy",
        ...(bounty.entrance === "board" ? {opening: {wizard: [{type: bounty.boss, health: hunt.orbs}]}}
          : {arrivals: {wizard: [{type: bounty.boss, turn: bounty.lands, health: hunt.orbs}]}})}};
  }
  return kind === "open" ? {id, kind, name: "열린 벌판", lesson: "마녀단 전체를 상대로 하는 동등한 대결입니다. 마법사는 매 턴을 계획합니다.", level: 2,
    options: {decks: {cowboy: deck, wizard: DECKS.wizard}}} : null;
}

// Cards that can still be earned from an offer or a pack: Cowboy, not basic, not legendary, not yet at the deck limit.
// On the Trail an offer holds only cards the player has already met, so a new card always arrives with its lesson.
// A card that an unbeaten rival pays is held back, so gear and locations arrive with the rival that teaches them.
function pool(save, {met = false} = {}) {
  const held = RIVALS.filter((rival) => !save.rivals.includes(rival.id)).flatMap((rival) => rival.reward);
  return Object.keys(TYPES).filter((type) => TYPES[type].side === "cowboy" && !["basic", "legendary"].includes(TYPES[type].rarity)
    && owned(save, type) < cap(type) && (!met || owned(save, type) > 0) && !held.includes(type));
}
const WEIGHT = {common: 6, uncommon: 3, rare: 1};
function pick(types, roll) {
  let at = roll * types.reduce((sum, type) => sum + WEIGHT[TYPES[type].rarity], 0);
  return types.find((type) => (at -= WEIGHT[TYPES[type].rarity]) < 0) ?? types.at(-1);
}

// Records a finished duel. Returns the new save and what the win paid:
// {cards: [[type, copies]], packs, captured: type or null}. A win also sets save.offer, two cards to choose one from.
export function settle(save, id, won) {
  const earned = {cards: [], packs: 0, captured: null};
  const [kind, key] = id.split(":");
  if (!won) return {save: kind === "open" ? save : {...save, losses: plus(save.losses, id)}, earned};
  let next = {...save, losses: {...save.losses, [id]: 0}};
  if (kind === "trail") {
    let {deck, collection} = next;
    for (const [type, replaced, copies] of TRAIL[save.wins].reward) {
      collection = plus(collection, type, copies);
      // The new card takes the place of a plain one, as far as the deck still holds plain ones.
      const swapped = Math.min(copies, deck[replaced] ?? 0);
      deck = plus(plus(deck, replaced, -swapped), type, swapped);
      earned.cards.push([type, copies]);
    }
    next = {...next, deck: Object.fromEntries(Object.entries(deck).filter(([, copies]) => copies > 0)), collection, wins: save.wins + 1};
    if (trailDone(next)) earned.packs = 1;
  } else if (kind === "rival" && !save.rivals.includes(key)) {
    const rival = RIVALS.find((each) => each.id === key);
    for (const type of rival.reward) {
      next = {...next, collection: plus(next.collection, type)};
      earned.cards.push([type, 1]);
    }
    next = {...next, rivals: [...save.rivals, key]};
    earned.packs = rival.packs;
  } else if (kind === "hunt") {
    const cleared = (save.hunts[key] ?? 0) + 1;
    next = {...next, hunts: {...save.hunts, [key]: cleared}};
    if (cleared === HUNTS) {
      earned.captured = BOUNTIES.find((each) => each.id === key).reward;
      next = {...next, collection: plus(next.collection, earned.captured)};
    }
  } else if (kind === "open") {
    next = {...next, openWins: save.openWins + 1};
    if (next.openWins % OPEN_WINS_PER_PACK === 0) earned.packs = 1;
  }
  next = {...next, packs: next.packs + earned.packs};
  // Every win offers a choice of two cards. The roll count is saved, so reloading cannot change the offer.
  const roll = random(next.rolls + 1);
  const options = pool(next, {met: !trailDone(next)});
  const first = options.length >= 2 ? pick(options, roll()) : null;
  const offer = first ? [first, pick(options.filter((type) => type !== first), roll())] : null;
  return {save: {...next, rolls: next.rolls + 1, offer}, earned};
}

// Takes one of the two offered cards.
export function choose(save, type) {
  if (!save.offer?.includes(type)) throw new Error(`${type} is not on offer`);
  return {...save, collection: plus(save.collection, type), offer: null};
}

// Opens one pack: three cards you can still use, at least one of them Uncommon or better when one is left.
export function openPack(save) {
  if (save.packs < 1) throw new Error("no pack to open");
  const roll = random(save.rolls + 1);
  let next = {...save, packs: save.packs - 1, rolls: save.rolls + 1};
  const cards = [];
  for (let i = 0; i < PACK_SIZE; i++) {
    let options = pool(next);
    const better = options.filter((type) => TYPES[type].rarity !== "common");
    if (i === 0 && better.length) options = better;
    if (!options.length) break;
    const type = pick(options, roll());
    cards.push(type);
    next = {...next, collection: plus(next.collection, type)};
  }
  return {save: next, cards};
}

// Reads a saved or imported object and returns a save that is safe to play, or a new one if it cannot be trusted.
// The first version saved only {wins, losses} for the Trail.
export function migrate(raw) {
  try {
    if (raw && raw.v === undefined && Number.isInteger(raw.wins)) {
      let save = newSave();
      for (let i = 0; i < Math.min(Math.max(raw.wins, 0), TRAIL.length); i++) save = {...settle(save, "trail", true).save, offer: null};
      // The first version counted losses on the unfinished Trail duel only; they keep its grit.
      if (!trailDone(save) && Number.isInteger(raw.losses) && raw.losses > 0) save = {...save, losses: {...save.losses, trail: raw.losses}};
      return save;
    }
    const counts = (value) => Object.entries(value).every(([type, copies]) => TYPES[type] && Number.isInteger(copies) && copies >= 0);
    const whole = (value) => Number.isInteger(value) && value >= 0;
    if (raw?.v !== 2 || !whole(raw.wins) || raw.wins > TRAIL.length || !whole(raw.openWins) || !whole(raw.packs) || !whole(raw.rolls)
      || ![raw.collection, raw.deck, raw.side, raw.hunts, raw.losses].every((value) => value && typeof value === "object")
      || !counts(raw.collection) || !counts(raw.deck) || !counts(raw.side)
      || !Array.isArray(raw.rivals) || !raw.rivals.every((id) => RIVALS.some((rival) => rival.id === id))
      || !Object.entries(raw.hunts).every(([id, cleared]) => BOUNTIES.some((bounty) => bounty.id === id) && whole(cleared) && cleared <= HUNTS)
      || !Object.values(raw.losses).every(whole)
      || !(raw.offer === null || (Array.isArray(raw.offer) && raw.offer.length === 2 && raw.offer.every((type) => TYPES[type]?.side === "cowboy")))) return newSave();
    const save = {v: 2, wins: raw.wins, losses: raw.losses, collection: raw.collection, deck: raw.deck, side: raw.side, rivals: raw.rivals,
      hunts: raw.hunts, openWins: raw.openWins, packs: raw.packs, rolls: raw.rolls, offer: raw.offer};
    // The parts have to agree with each other: nothing a player could not have earned.
    const earnable = (type) => TYPES[type].side === "cowboy" && TYPES[type].rarity !== "basic";
    const captured = (type) => BOUNTIES.some((bounty) => bounty.reward === type && save.hunts[bounty.id] === HUNTS);
    const agrees = Object.entries(save.collection).every(([type, copies]) => earnable(type) && copies <= cap(type) && (TYPES[type].rarity !== "legendary" || copies === 0 || captured(type)))
      && save.rivals.every((id, i) => id === RIVALS[i].id)
      && (trailDone(save) || (!save.rivals.length && !Object.values(save.hunts).some(Boolean) && !save.openWins))
      && (!save.offer || save.offer.every((type) => earnable(type) && TYPES[type].rarity !== "legendary"));
    return !agrees || deckProblems(save, save.deck, save.side).length ? newSave() : save;
  } catch {
    return newSave();
  }
}
