// The graybox Camp's progress (issue 143 slice 2). Holds the current progress object in memory and
// writes it through the canonical store after every change. Every rule (what a duel is, what a win
// pays, what is on offer) comes from src/game/showdown/progress.js; nothing here decides a reward.
import {campaignText, laneCapturedCards, loadCampaign, saveCampaign} from "../game/showdown/campaign-store.js";
import {holdings, joinInherited} from "../game/showdown/inherited.js";
import {choose, deckProblems, duelFor, duelList, newSave, openPack, owned, settle, withDeck} from "../game/showdown/progress.js";
import {GRIT_CAP, TRAIL} from "../game/showdown/trail.js";

export class CampaignChanged extends Error {
  constructor() { super("다른 탭에서 캠프가 바뀌었습니다. 최신 진행 상황을 불러왔습니다."); }
}

// deferImport (K-096, a direct ?practice boot): write nothing yet. The keepsake import and the career load wait
// for enter(), the first Camp entry, so they read storage as it is then and run once. Default: both at once.
export function createCampaign(storage, {deferImport = false} = {}) {
  let stored = campaignText(storage);
  let progress = loadCampaign(storage, stored);
  let saved = true;
  // Cards already won in the lane game stay owned. They are kept in their own record, not in the
  // progress object, so the Trail deck, bounties and offers are unchanged (see inherited.js).
  let inherited = {cards: [], saved: true};
  let entered = false;
  const enter = () => {
    if (entered) return;
    entered = true;
    if (deferImport) {
      stored = campaignText(storage);
      progress = loadCampaign(storage, stored);
    }
    inherited = joinInherited(storage, laneCapturedCards(storage));
  };
  if (!deferImport) enter();
  // saveCampaign returns {ok} and never throws. Storage can be blocked or full: play on with the
  // progress in memory, and the Camp says so.
  const keep = (next) => {
    const current = campaignText(storage);
    if (current !== undefined && current !== (stored ?? null)) {
      stored = current;
      progress = loadCampaign(storage, current);
      saved = true;
      throw new CampaignChanged();
    }
    progress = next;
    saved = current !== undefined && saveCampaign(storage, progress).ok === true;
    if (saved) stored = JSON.stringify(progress);
  };
  return {
    // The first Camp entry: imports the lane keepsakes (once) and, for a deferred campaign, reloads the career.
    enter,
    progress: () => progress,
    saved: () => saved && inherited.saved,
    // Owned cards for the Camp list, each once: [{type, copies, inherited}].
    holdings: () => holdings(progress, inherited.cards),
    inherited: () => inherited.cards,
    duels: () => duelList(progress),
    // The open Trail duel for this progress, or null while a card is on offer or the Trail is done.
    trailDuel: () => duelFor(progress, "trail"),
    // Any duel by its duelList id ("trail", "rival:<id>", "hunt:<id>", "open"), or null when it cannot be played now.
    // deck: the Cowboy deck to play (a best-of-three plays the match's own copy); defaults to the saved deck.
    duel: (id, deck) => duelFor(progress, id, deck ?? progress.deck),
    owned: (type) => owned(progress, type),
    // Records a finished duel once. Returns what it paid and which earned cards went into the deck.
    settle(duel, won) {
      const before = progress;
      const settled = settle(before, duel.id, won);
      const swaps = duel.kind === "trail" && won ? TRAIL[before.wins].reward : [];
      const intoDeck = swaps.map(([type, replaced]) => [type, (settled.save.deck[type] ?? 0) - (before.deck[type] ?? 0), replaced]).filter(([, copies]) => copies > 0);
      keep(settled.save);
      return {won, earned: settled.earned, intoDeck, grit: Math.min(settled.save.losses[duel.id] ?? 0, GRIT_CAP)};
    },
    choose(type) { keep(choose(progress, type)); },
    // Opens one pack; returns the three cards it held (already in the collection).
    openPack() {
      const pack = openPack(progress);
      keep(pack.save);
      return pack.cards;
    },
    deckProblems: (deck, side) => deckProblems(progress, deck, side),
    // Saves a deck and side deck the player built; withDeck throws if deckProblems lists anything.
    withDeck(deck, side) { keep(withDeck(progress, deck, side)); },
    // A save read from a save code (savecode.js decodeSaveCode). Returns true when it was stored.
    replace(save) { keep(save); return saved; },
    // Start over: Showdown progress only. The keepsake record and the lane profile are not written
    // (Fable's ruling, PR 148 issuecomment-7031816529).
    reset() { keep(newSave()); return saved; },
  };
}
