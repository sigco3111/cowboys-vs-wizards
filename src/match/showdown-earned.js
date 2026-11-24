// "Earned decks" (Fable's ruling, ../ruling.md "Earned-decks local play"): one two-player game on one screen,
// the Cowboy seat with the deck saved in the Camp (the starter deck for an empty save) and the Wizard seat with
// the Wizard preview's deck. Read-only: it takes both decks as plain counts, copies them into one duel and writes
// nothing. The screen's two-player path settles nothing and adds no playtest line; the curtain is the usual one.
// The Wizard deck is never built here: it is the preview's own (src/match/showdown-wizard-campaign.js).
//
// Shown only after the first Wizard preview win (Dry Gulch), with no teaser before it. A single game, no best of
// three. Everything but the decks and the opener comes from twoPlayers(), so the two-player setup rules (PR 170's
// Base for the second seat, once merged) apply unchanged. The Wizards open, as in the preview.
import {TYPES} from "../game/showdown/cards.js";
import {DECK_SIZE} from "../game/showdown/progress.js";
import {twoPlayers} from "./showdown-session.js";

export const EARNED_NAME = "얻은 덱 (동등한 대결 아님)";
const LESSON = "한 화면에서 둘이 하는 대결입니다. 카우보이는 캠프에 저장된 덱을, 마법사는 마법사 미리보기 덱을 쓰며 카우보이가 먼저 시작합니다. "
  + "동등한 대결이 아닙니다. 아무것도 저장되지 않습니다. 턴이 끝나면 화면을 넘기세요.";

// A whole deck of this side's cards: DECK_SIZE cards, every count a whole number.
const deckOf = (counts, side) => {
  if (!counts || typeof counts !== "object") return null;
  const entries = Object.entries(counts).filter(([, copies]) => copies !== 0);
  if (!entries.every(([type, copies]) => TYPES[type]?.side === side && Number.isInteger(copies) && copies > 0)) return null;
  return entries.reduce((sum, [, copies]) => sum + copies, 0) === DECK_SIZE ? Object.fromEntries(entries) : null;
};

// cowboy: the Camp's progress ({deck}); wizard: the preview's progress ({wins, deck}).
// The duel for createShowdownSession with players 2, or null (no preview win yet, or a deck that is not whole).
export function earnedDuel(cowboy, wizard) {
  if (!(Number.isInteger(wizard?.wins) && wizard.wins >= 1)) return null;
  const decks = {cowboy: deckOf(cowboy?.deck, "cowboy"), wizard: deckOf(wizard.deck, "wizard")};
  if (!decks.cowboy || !decks.wizard) return null;
  const two = twoPlayers();
  return {...two, id: "earned", kind: "earned", name: EARNED_NAME, lesson: LESSON, options: {...two.options, decks, first: "wizard"}};
}

// The Camp control for earnedDuel's result: one native button, or nothing.
export const earnedControl = (duel) => (duel ? `<button type="button" id="camp-earned" data-earned="1">2인, 얻은 덱: 동등한 대결 아님</button>` : "");
