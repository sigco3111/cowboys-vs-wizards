// Boot Hill Poker engine: seeded two-seat five-card draw.
// Pure rules only. No DOM, Node, network, rendering or model dependencies,
// so the terminal, the HTML page and verifiers all share this one module.
//
// One deal: shuffle 52 cards from the seed, deal five each (alternating,
// starting with the first seat), then each seat takes one draw turn in order
// (toss 0-5 cards, replace from the deck), then showdown. Turn N is the Nth
// draw turn, so every deal ends on endTurn 2. No betting, no cash.

export const SEATS = Object.freeze(['cowboy', 'wizard']);
export const SEAT_NAMES = Object.freeze({ cowboy: 'Cowboy', wizard: 'Wizard' });
export const RANKS = '23456789TJQKA';
export const SUITS = 'SHDC';
export const HAND_SIZE = 5;
export const STRATEGIES = Object.freeze(['standard', 'pat']);
export const CATEGORY_NAMES = Object.freeze([
  'High Card',
  'One Pair',
  'Two Pair',
  'Three of a Kind',
  'Straight',
  'Flush',
  'Full House',
  'Four of a Kind',
  'Straight Flush',
]);

const RANK_WORDS = [null, 'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Jack', 'Queen', 'King', 'Ace'];
const RANK_PLURALS = [null, 'Aces', 'Twos', 'Threes', 'Fours', 'Fives', 'Sixes', 'Sevens', 'Eights', 'Nines', 'Tens', 'Jacks', 'Queens', 'Kings', 'Aces'];
const SUIT_WORDS = Object.freeze({ S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' });
const CARD_PATTERN = /^[2-9TJQKA][SHDC]$/;

// ---------------------------------------------------------------- seeds, deck

export function normalizeSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return Math.trunc(seed) >>> 0;
  const text = String(seed ?? '').trim();
  if (/^-?\d+$/.test(text)) return Number(text) >>> 0;
  let hash = 2166136261; // FNV-1a for text seeds
  for (const ch of text) {
    hash ^= ch.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

// mulberry32: small, fast, identical in Node and browsers.
export function createRng(seed) {
  let a = normalizeSeed(seed);
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeDeck() {
  const deck = [];
  for (const suit of SUITS) for (const rank of RANKS) deck.push(rank + suit);
  return deck;
}

export function shuffleDeck(seed) {
  const rng = createRng(seed);
  const deck = makeDeck();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function isCard(card) {
  return typeof card === 'string' && CARD_PATTERN.test(card);
}

export function rankValue(card) {
  return RANKS.indexOf(card[0]) + 2;
}

export function cardName(card) {
  return `${RANK_WORDS[rankValue(card)]} of ${SUIT_WORDS[card[1]]}`;
}

// ------------------------------------------------------------ hand ranking

export function evaluateHand(cards) {
  if (!Array.isArray(cards) || cards.length !== HAND_SIZE) {
    throw new TypeError('A poker hand has exactly five cards');
  }
  const seen = new Set();
  for (const card of cards) {
    if (!isCard(card) || seen.has(card)) throw new TypeError(`Bad or repeated card: ${card}`);
    seen.add(card);
  }

  const values = cards.map(rankValue).sort((a, b) => b - a);
  const flush = cards.every((card) => card[1] === cards[0][1]);
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  // [rank, count], larger groups first, then higher rank.
  const groups = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const groupRanks = groups.map(([rank]) => rank);

  let straightHigh = 0;
  if (groups.length === 5) {
    if (values[0] - values[4] === 4) straightHigh = values[0];
    else if (values[0] === 14 && values[1] === 5) straightHigh = 5; // A-2-3-4-5, the wheel
  }
  const wheel = straightHigh === 5;

  let category;
  let ranks;
  if (straightHigh && flush) [category, ranks] = [8, [straightHigh]];
  else if (groups[0][1] === 4) [category, ranks] = [7, groupRanks];
  else if (groups[0][1] === 3 && groups[1][1] === 2) [category, ranks] = [6, groupRanks];
  else if (flush) [category, ranks] = [5, values];
  else if (straightHigh) [category, ranks] = [4, [straightHigh]];
  else if (groups[0][1] === 3) [category, ranks] = [3, groupRanks];
  else if (groups[0][1] === 2 && groups[1][1] === 2) [category, ranks] = [2, groupRanks];
  else if (groups[0][1] === 2) [category, ranks] = [1, groupRanks];
  else [category, ranks] = [0, values];

  return {
    category,
    name: CATEGORY_NAMES[category],
    ranks,
    wheel,
    label: describeHand(category, ranks, wheel),
    cards: [...cards],
  };
}

function describeHand(category, ranks, wheel) {
  const [r0, r1] = ranks;
  switch (category) {
    case 8:
      if (r0 === 14) return 'Royal Flush';
      return wheel ? 'Straight Flush, Five high (steel wheel)' : `Straight Flush, ${RANK_WORDS[r0]} high`;
    case 7: return `Four ${RANK_PLURALS[r0]}`;
    case 6: return `Full House, ${RANK_PLURALS[r0]} over ${RANK_PLURALS[r1]}`;
    case 5: return `Flush, ${RANK_WORDS[r0]} high`;
    case 4: return wheel ? 'Straight, Five high (the wheel, A-2-3-4-5)' : `Straight, ${RANK_WORDS[r0]} high`;
    case 3: return `Three ${RANK_PLURALS[r0]}`;
    case 2: return `Two Pair, ${RANK_PLURALS[r0]} and ${RANK_PLURALS[r1]}`;
    case 1: return `Pair of ${RANK_PLURALS[r0]}`;
    default: return `${RANK_WORDS[r0]} high`;
  }
}

// Returns 1 if a beats b, -1 if b beats a, 0 for a tie. Suits never break ties.
export function compareHands(a, b) {
  const x = Array.isArray(a) ? evaluateHand(a) : a;
  const y = Array.isArray(b) ? evaluateHand(b) : b;
  if (x.category !== y.category) return x.category > y.category ? 1 : -1;
  for (let i = 0; i < Math.max(x.ranks.length, y.ranks.length); i++) {
    const d = (x.ranks[i] ?? 0) - (y.ranks[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

export function decideShowdown(hands) {
  const cowboy = evaluateHand(hands.cowboy);
  const wizard = evaluateHand(hands.wizard);
  const order = compareHands(cowboy, wizard);
  const revealed = { cowboy: summarize(cowboy), wizard: summarize(wizard) };
  if (order === 0) {
    return {
      winner: 'draw',
      reason: `Dead even: both hold ${cowboy.label}. Suits never break a tie, so the hand is a draw.`,
      hands: revealed,
    };
  }
  const winner = order > 0 ? 'cowboy' : 'wizard';
  const [best, beaten] = winner === 'cowboy' ? [cowboy, wizard] : [wizard, cowboy];
  return { winner, reason: explainWin(winner, best, beaten), hands: revealed };
}

function summarize(evaluation) {
  return {
    cards: [...evaluation.cards],
    category: evaluation.category,
    name: evaluation.name,
    label: evaluation.label,
  };
}

function explainWin(winner, best, beaten) {
  const name = SEAT_NAMES[winner];
  if (best.label !== beaten.label) return `The ${name} wins: ${best.label} beats ${beaten.label}.`;
  const i = best.ranks.findIndex((rank, k) => rank !== beaten.ranks[k]);
  return `The ${name} wins: both hold ${best.label}, and the ${name}'s ${RANK_WORDS[best.ranks[i]]} kicker beats the ${RANK_WORDS[beaten.ranks[i]]}.`;
}

// --------------------------------------------------------------- bot draws

function checkStrategy(name) {
  if (!STRATEGIES.includes(name)) {
    throw new RangeError(`Unknown strategy "${name}"; use ${STRATEGIES.map((s) => `"${s}"`).join(' or ')}`);
  }
  return name;
}

function normalizeStrategies(strategy) {
  if (strategy !== null && typeof strategy === 'object') {
    return {
      cowboy: checkStrategy(strategy.cowboy ?? 'standard'),
      wizard: checkStrategy(strategy.wizard ?? 'standard'),
    };
  }
  const name = checkStrategy(strategy ?? 'standard');
  return { cowboy: name, wizard: name };
}

// Deterministic draw choice. Returns sorted indices to toss.
// standard: keep a straight or better; keep pairs/trips and toss the rest;
// otherwise draw to four of a flush, then four to a straight, else keep the
// single highest card. pat: never draw.
export function chooseDiscards(cards, strategy = 'standard') {
  checkStrategy(strategy);
  const hand = evaluateHand(cards);
  if (strategy === 'pat' || hand.category >= 4) return [];
  if (hand.category >= 1) {
    const counts = new Map();
    for (const card of cards) counts.set(card[0], (counts.get(card[0]) ?? 0) + 1);
    return indicesWhere(cards, (card) => counts.get(card[0]) < 2);
  }
  const flushMiss = findFourFlush(cards);
  if (flushMiss >= 0) return [flushMiss];
  const straightMiss = findFourStraight(cards);
  if (straightMiss >= 0) return [straightMiss];
  let best = 0;
  cards.forEach((card, i) => { if (rankValue(card) > rankValue(cards[best])) best = i; });
  return indicesWhere(cards, (_, i) => i !== best);
}

function indicesWhere(cards, test) {
  const out = [];
  cards.forEach((card, i) => { if (test(card, i)) out.push(i); });
  return out;
}

function findFourFlush(cards) {
  for (const suit of SUITS) {
    const off = indicesWhere(cards, (card) => card[1] !== suit);
    if (off.length === 1) return off[0];
  }
  return -1;
}

function findFourStraight(cards) {
  for (let skip = 0; skip < cards.length; skip++) {
    const values = cards.filter((_, i) => i !== skip).map(rankValue);
    if (new Set(values).size !== 4) continue;
    for (const set of [values, values.map((v) => (v === 14 ? 1 : v))]) {
      if (Math.max(...set) - Math.min(...set) === 3) return skip;
    }
  }
  return -1;
}

// --------------------------------------------------------- interactive state

export function otherSeat(seat) {
  return seat === 'cowboy' ? 'wizard' : 'cowboy';
}

export function normalizeSeat(value) {
  if (value == null || value === 0) return 'cowboy';
  if (value === 1) return 'wizard';
  const text = String(value).trim().toLowerCase();
  if (SEATS.includes(text)) return text;
  throw new RangeError(`Unknown seat "${value}"; use "cowboy" or "wizard"`);
}

export function nextSeed(seed) {
  return (Math.imul(normalizeSeed(seed), 1664525) + 1013904223) >>> 0;
}

// Start a deal. human is the seat a person plays ('cowboy', 'wizard' or null
// for bot-vs-bot). Bot seats act immediately, so the returned state is either
// waiting on the human or already at showdown.
export function newDeal({ seed = 17, first = 'cowboy', human = 'cowboy', strategy = 'standard', dealNumber = 1 } = {}) {
  const s = normalizeSeed(seed);
  const firstSeat = normalizeSeat(first);
  const humanSeat = human === null ? null : normalizeSeat(human);
  const strategies = normalizeStrategies(strategy);
  const deck = shuffleDeck(s);
  const order = [firstSeat, otherSeat(firstSeat)];
  const hands = { cowboy: [], wizard: [] };
  for (let i = 0; i < HAND_SIZE; i++) for (const seat of order) hands[seat].push(deck.shift());

  const state = {
    seed: s,
    dealNumber,
    first: firstSeat,
    human: humanSeat,
    strategy,
    strategies,
    order,
    deck,
    muck: [],
    hands,
    marked: { cowboy: [], wizard: [] },
    drew: { cowboy: null, wizard: null },
    turn: 1,
    phase: 'draw',
    toAct: firstSeat,
    log: [`Deal #${dealNumber}, seed ${s}. The ${SEAT_NAMES[firstSeat]} draws first.`],
    result: null,
  };
  return autoPlay(state);
}

export function replayDeal(state) {
  return newDeal({ seed: state.seed, first: state.first, human: state.human, strategy: state.strategy, dealNumber: state.dealNumber });
}

// Fresh shuffle from a derived seed; the first seat alternates like a dealer button.
export function nextDeal(state) {
  return newDeal({
    seed: nextSeed(state.seed),
    first: otherSeat(state.first),
    human: state.human,
    strategy: state.strategy,
    dealNumber: state.dealNumber + 1,
  });
}

export function toggleDiscard(state, index) {
  const seat = requireHumanTurn(state);
  if (!Number.isInteger(index) || index < 0 || index >= HAND_SIZE) {
    throw new RangeError(`Card index must be 0-${HAND_SIZE - 1}`);
  }
  const next = cloneState(state);
  const marked = new Set(next.marked[seat]);
  if (marked.has(index)) marked.delete(index);
  else marked.add(index);
  next.marked[seat] = [...marked].sort((a, b) => a - b);
  return next;
}

// Human draw. Uses the marked cards unless indices are given explicitly.
export function submitDraw(state, indices) {
  const seat = requireHumanTurn(state);
  return autoPlay(takeDraw(state, seat, indices === undefined ? state.marked[seat] : indices));
}

function requireHumanTurn(state) {
  if (state.human == null) throw new Error('This deal has no human seat');
  if (state.phase !== 'draw') throw new Error('The hand is over; replay or deal again');
  if (state.toAct !== state.human) throw new Error(`It is not the ${SEAT_NAMES[state.human]}'s turn`);
  return state.human;
}

function autoPlay(state) {
  let s = state;
  while (s.phase === 'draw' && s.toAct !== s.human) {
    s = takeDraw(s, s.toAct, chooseDiscards(s.hands[s.toAct], s.strategies[s.toAct]));
  }
  return s;
}

function takeDraw(state, seat, indices) {
  const toss = normalizeIndices(indices);
  const next = cloneState(state);
  for (const i of toss) {
    next.muck.push(next.hands[seat][i]);
    next.hands[seat][i] = next.deck.shift();
  }
  next.drew[seat] = toss.length;
  next.marked[seat] = [];
  next.log.push(toss.length === 0
    ? `Turn ${next.turn}: the ${SEAT_NAMES[seat]} stands pat.`
    : `Turn ${next.turn}: the ${SEAT_NAMES[seat]} tosses ${toss.length} and draws ${toss.length}.`);

  const other = otherSeat(seat);
  if (next.drew[other] === null) {
    next.turn += 1;
    next.toAct = other;
  } else {
    next.phase = 'showdown';
    next.toAct = null;
    next.result = { ...decideShowdown(next.hands), endTurn: next.turn };
    next.log.push(`Showdown: ${next.result.reason}`);
  }
  return next;
}

function normalizeIndices(indices) {
  if (!Array.isArray(indices)) throw new TypeError('Discards must be an array of card indices');
  const unique = new Set(indices);
  if (unique.size !== indices.length) throw new RangeError('A card can only be tossed once');
  for (const i of unique) {
    if (!Number.isInteger(i) || i < 0 || i >= HAND_SIZE) throw new RangeError(`Card index must be 0-${HAND_SIZE - 1}`);
  }
  return [...unique].sort((a, b) => a - b);
}

function cloneState(state) {
  return {
    ...state,
    strategies: { ...state.strategies },
    order: [...state.order],
    deck: [...state.deck],
    muck: [...state.muck],
    hands: { cowboy: [...state.hands.cowboy], wizard: [...state.hands.wizard] },
    marked: { cowboy: [...state.marked.cowboy], wizard: [...state.marked.wizard] },
    drew: { ...state.drew },
    log: [...state.log],
  };
}

// What one seat may see. The opponent's cards stay null until showdown and the
// deck and muck are never exposed. UIs render only from this view.
export function viewState(state, seat = state.human ?? 'cowboy') {
  const you = normalizeSeat(seat);
  const opponent = otherSeat(you);
  const revealed = state.phase === 'showdown';
  return {
    seed: state.seed,
    dealNumber: state.dealNumber,
    first: state.first,
    turn: state.turn,
    phase: state.phase,
    toAct: state.toAct,
    you,
    opponent,
    canAct: state.phase === 'draw' && state.toAct === you && state.human === you,
    hand: [...state.hands[you]],
    handLabel: evaluateHand(state.hands[you]).label,
    marked: [...state.marked[you]],
    youDrew: state.drew[you],
    opponentHand: revealed ? [...state.hands[opponent]] : new Array(HAND_SIZE).fill(null),
    opponentLabel: revealed ? state.result.hands[opponent].label : null,
    opponentDrew: state.drew[opponent],
    deckCount: state.deck.length,
    log: [...state.log],
    result: revealed ? JSON.parse(JSON.stringify(state.result)) : null,
  };
}

// ----------------------------------------------------------- verifier entry

// Bot-vs-bot deal. strategy applies to both seats unless given per seat as
// { cowboy, wizard }.
export function playPokerDuel(seed, first = 'cowboy', strategy = 'standard') {
  const state = newDeal({ seed, first, human: null, strategy });
  return { winner: state.result.winner, endTurn: state.result.endTurn };
}
