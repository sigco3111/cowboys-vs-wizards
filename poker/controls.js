// Keyboard controls shared by the terminal and the HTML page.
// Pure: a session is { state, notice, hungUp } and applyKey returns a new one.

import { cardName, newDeal, nextDeal, replayDeal, SEAT_NAMES, submitDraw, toggleDiscard, viewState } from './engine.js';

export function keyToAction(key) {
  if (key === 'q' || key === 'Q' || key === '\u0003') return { type: 'quit' };
  if (typeof key === 'string' && /^[1-5]$/.test(key)) return { type: 'toggle', index: Number(key) - 1 };
  if (key === '\r' || key === '\n' || key === 'Enter' || key === 'd' || key === 'D') return { type: 'draw' };
  if (key === 'r' || key === 'R') return { type: 'replay' };
  if (key === 'n' || key === 'N') return { type: 'new' };
  return null;
}

export function startSession(options) {
  const state = newDeal(options);
  return { state, notice: turnNotice(state), hungUp: false };
}

const HAND_OVER = 'The cards are down. Press R to replay this deal or N for a new one.';

export function applyKey(session, key) {
  const action = keyToAction(key);
  if (session.hungUp) {
    if (action?.type === 'quit') return session;
    return { ...session, hungUp: false, notice: `Carrier restored. ${session.state.phase === 'draw' ? turnNotice(session.state) : HAND_OVER}` };
  }
  if (!action) return { ...session, notice: 'Keys: 1-5 toss/hold, ENTER draw, R replay, N new deal, Q hang up.' };

  const view = viewState(session.state);
  switch (action.type) {
    case 'quit':
      return { ...session, hungUp: true, notice: 'NO CARRIER' };
    case 'toggle': {
      if (!view.canAct) return { ...session, notice: HAND_OVER };
      const state = toggleDiscard(session.state, action.index);
      const tossing = state.marked[state.human].includes(action.index);
      return {
        ...session,
        state,
        notice: `Card ${action.index + 1}, the ${cardName(view.hand[action.index])}: ${tossing ? 'marked to TOSS' : 'back to HOLD'}.`,
      };
    }
    case 'draw': {
      if (!view.canAct) return { ...session, notice: HAND_OVER };
      const count = view.marked.length;
      const state = submitDraw(session.state);
      return { ...session, state, notice: count === 0 ? 'You stand pat. Cards up!' : `You toss ${count} and draw ${count}. Cards up!` };
    }
    case 'replay': {
      const state = replayDeal(session.state);
      return { ...session, state, notice: `Same seed ${state.seed}, same deck. ${turnNotice(state)}` };
    }
    case 'new': {
      const state = nextDeal(session.state);
      return { ...session, state, notice: `Fresh shuffle, seed ${state.seed}. ${turnNotice(state)}` };
    }
    default:
      return session;
  }
}

function turnNotice(state) {
  const view = viewState(state);
  if (!view.canAct) return HAND_OVER;
  const opp = SEAT_NAMES[view.opponent];
  const lead = view.opponentDrew === null
    ? ''
    : view.opponentDrew === 0 ? `The ${opp} stood pat. ` : `The ${opp} drew ${view.opponentDrew}. `;
  return `${lead}Your draw: press 1-5 to mark cards to toss, then ENTER.`;
}
