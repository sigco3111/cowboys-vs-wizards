// Cards a player captured in the lane game, kept as keepsakes in their own record and shown in the Camp
// (issue 143 slice 2; Fable's ruling, PR 148 issuecomment-7031816529).
//
// The record is separate from the progress object on purpose. progress.js decides what the Trail deck,
// the bounties and the offers may hold, and migrate() accepts a Legendary only after the Showdown bounty
// paid it. Fable ruled (F1) that a lane capture never enters the Showdown collection and is not
// equippable, and (F2) that each Showdown bounty still pays its Legendary to every player. This record
// is display only: no deck slot, no bounty progress, no offer change. Start over leaves it alone.
//
//   cvw-showdown-inherited-v1  {v: 1, source: "cvw-player-v1", cards: [type, ...]}
//
// The record only grows: a card the lane store once reported stays listed even if the lane profile later
// changes or is retired. It is not part of a save code. Storage is passed in; no global, no DOM.
import {TYPES} from "./cards.js";

export const INHERITED_KEY = "cvw-showdown-inherited-v1";
export const INHERITED_SOURCE = "cvw-player-v1";

const read = (storage) => {
  try { return storage?.getItem(INHERITED_KEY) ?? null; } catch { return null; }
};

// The stored list, or [] when there is none. `damaged` is true when a value is stored that is not a
// valid record; such a value is never overwritten here.
export function readInherited(storage) {
  const text = read(storage);
  if (text === null) return {cards: [], damaged: false};
  let value;
  try { value = JSON.parse(text); } catch { return {cards: [], damaged: true}; }
  const valid = value?.v === 1 && Array.isArray(value.cards) && value.cards.every((type) => typeof type === "string");
  return valid ? {cards: [...new Set(value.cards)], damaged: false} : {cards: [], damaged: true};
}

// Adds the lane store's captured cards to the record. Writes only when a card is new, and never removes
// one. Returns {cards, saved, reason}: `cards` is what the player owns from the lane game this session
// (stored plus reported now), even when it could not be written.
export function joinInherited(storage, laneCards) {
  const stored = readInherited(storage);
  const cards = [...new Set([...stored.cards, ...laneCards])];
  if (stored.damaged) return {cards, saved: false, reason: "저장된 레인 게임 카드를 읽을 수 없어 그대로 두었습니다."};
  if (cards.length === stored.cards.length) return {cards, saved: true};
  try {
    storage.setItem(INHERITED_KEY, JSON.stringify({v: 1, source: INHERITED_SOURCE, cards}));
    return {cards, saved: true};
  } catch {
    return {cards, saved: false, reason: "저장이 차단되었거나 공간이 가득 찼습니다."};
  }
}

// One row per owned card for the Camp list, Showdown collection first. Each card is counted once:
// a card in both records shows the Showdown count (a Legendary is capped at 1), never the sum.
export function holdings(progress, inheritedCards) {
  const lane = new Set(inheritedCards.filter((type) => TYPES[type]));
  const rows = Object.entries(progress.collection).map(([type, copies]) => ({type, copies, inherited: lane.has(type)}));
  for (const type of lane) if (!(type in progress.collection)) rows.push({type, copies: 1, inherited: true});
  return rows;
}
