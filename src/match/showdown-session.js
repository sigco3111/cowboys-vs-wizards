// One Showdown duel for the graybox screen. The full state stays inside this closure:
// the screen only ever receives viewFor(state, seat), that seat's legal actions and the events.
// Solo (players 1): the other seat is the bot. Two players on one screen (players 2): no bot, and
// the seat that may act and see its own hand is whichever side is active (issue 143 slice 3).
import {DECKS} from "../game/showdown/cards.js";
import {viewFor} from "../game/showdown/contract.js";
import {applyAction, createShowdown, legalActions, playTurn} from "../game/showdown/rules.js";
import {duelFor, newSave} from "../game/showdown/progress.js";

// Trail duel 1 for a player with nothing saved: progress.js duelFor on newSave() (starter deck, no grit).
export const bootHill = () => duelFor(newSave(), "trail");

// Two players on one screen, each with a starter deck, as in the reference screen (prototypes/showdown/main.js).
export const twoPlayers = () => ({id: "two", kind: "two", name: "2인 대결",
  lesson: "한 화면에서 둘이 하는 대결입니다. 각자 기본 덱으로 시작합니다. 턴이 끝나면 화면을 넘기세요.", options: {decks: DECKS}});

// first: who opens, overriding the duel's own option (the loser of a best-of-three game opens the next one).
export function createShowdownSession({seed, duel, seat = "cowboy", players = 1, first}) {
  const solo = players === 1;
  let state = createShowdown(seed, first ? {...duel.options, first} : duel.options);
  // The seat whose view is shown and whose actions are offered.
  const viewer = () => (solo ? seat : state.active);
  // Solo: the bot plays every one of its turns before control comes back.
  const opponentTurns = (observe) => {
    const events = [];
    while (solo && !state.result && state.active !== seat) {
      const played = playTurn(state, duel.level, observe);
      state = played.state;
      events.push(...played.events);
    }
    return events;
  };
  const opening = opponentTurns();
  const legal = () => (state.result || state.active !== viewer() ? [] : legalActions(state));
  // duel.prefix (an allowlisted experiment turn, showdown-turn.js): this seat's recorded actions from the
  // fresh deal, each one checked against the legal actions, with the bot's turns between. It must end on
  // this seat's turn duel.at, or the session refuses to open.
  for (const action of duel.prefix ?? []) {
    if (!legal().some((each) => JSON.stringify(each) === JSON.stringify(action))) throw new Error(`replay action not legal: ${JSON.stringify(action)}`);
    const applied = applyAction(state, action);
    state = applied.state;
    opening.push(...applied.events, ...opponentTurns());
  }
  if (duel.prefix && (state.result || state.active !== seat || state.turn !== duel.at)) throw new Error("replay did not reach its turn");
  return {
    seat: solo ? seat : null,
    players,
    duel,
    opening,
    viewer,
    // The viewing seat's whole picture of the duel. Hidden zones of the other seat are counts only.
    view: () => viewFor(state, viewer()),
    legal,
    // Applies one of the active seat's legal actions once, then (solo) the bot's reply. Returns every event in order.
    act(action, onPresentation) {
      if (state.result || state.active !== viewer()) throw new Error("not this seat's turn");
      const perspective = viewer();
      const observe = onPresentation && ((before, applied) => onPresentation({
        before: viewFor(before, perspective), after: viewFor(applied.state, perspective), events: applied.events,
      }));
      const applied = applyAction(state, action);
      observe?.(state, applied);
      state = applied.state;
      return [...applied.events, ...opponentTurns(observe)];
    },
  };
}
