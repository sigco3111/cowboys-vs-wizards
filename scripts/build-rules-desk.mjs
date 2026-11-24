#!/usr/bin/env node
// Builds the rules desk index (src/ui/rules-desk.data.json) from selected
// clauses of the Showdown rulebook and the Night Shift balance requirements.
//
//   node scripts/build-rules-desk.mjs          regenerate the index
//   node scripts/build-rules-desk.mjs --check  fail if any cited line is stale
//                                              or the index differs from a
//                                              fresh build
//
// Each clause is located by its literal quote. The quote must appear on
// exactly one line of its source file; that line's 1-based number is stored.
// The answer text is a short summary for players. The quote is the authority.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const INDEX_PATH = 'src/ui/rules-desk.data.json';
export const RULEBOOK = 'prototypes/showdown/RULEBOOK.md';
export const BALANCE = '.kiro/specs/night-shift-balance-contract/requirements.md';

export const SOURCES = [
  { path: RULEBOOK, title: 'Showdown rulebook' },
  { path: BALANCE, title: 'Night Shift balance contract' },
];

export const CLAUSES = [
  {
    id: 'win-base',
    path: RULEBOOK,
    quote: 'Each side has a **Base** with 5 orbs. A Base with no orbs loses. You bring a deck of 16 cards.',
    label: 'How to win',
    keywords: ['win', 'lose', 'victory', 'base', 'orb', 'deck', '16', 'size'],
    answer: "Each side's Base starts with 5 orbs. A Base with no orbs loses. Each deck has 16 cards.",
  },
  {
    id: 'tribute',
    path: RULEBOOK,
    quote: "**Stars** set a troop's cost. 1 to 4 stars are free. 5 and 6 cost one **tribute**: one of your own troops, sent to the graveyard. 7 and up cost two.",
    label: 'Tributes and troop cost',
    keywords: ['tribute', 'sacrifice', 'star', 'cost', 'free', 'price', 'pay'],
    answer: 'Troops with 1 to 4 stars are free. 5 or 6 stars cost one tribute: one of your own troops, sent to the graveyard. 7 stars and up cost two tributes.',
  },
  {
    id: 'opening-hand',
    path: RULEBOOK,
    quote: 'Shuffle both decks. Each side draws 4 cards.',
    label: 'Opening hand',
    keywords: ['shuffle', 'start', 'hand', 'card', '4', 'setup', 'deal'],
    answer: 'Both decks are shuffled and each side draws 4 cards.',
  },
  {
    id: 'first-player',
    path: RULEBOOK,
    quote: 'One side goes first. The side that goes second draws 1 more card.',
    label: 'Who goes first',
    keywords: ['first', 'second', 'go', 'open', 'begin'],
    answer: 'One side goes first, and the side that goes second draws 1 more card. This rule does not say how the first side is chosen.',
  },
  {
    id: 'draw-step',
    path: RULEBOOK,
    quote: '**Draw** one card. On turn 1 the first player does not draw.',
    label: 'Drawing each turn',
    keywords: ['draw', 'step', 'skip'],
    answer: 'You draw one card each turn, except that the first player does not draw on turn 1.',
  },
  {
    id: 'hand-limit',
    path: RULEBOOK,
    quote: 'If you already hold 6 cards, the card you draw is discarded.',
    label: 'Hand limit',
    keywords: ['hand', 'full', 'limit', '6', 'discard', 'hold', 'maximum'],
    answer: 'If you already hold 6 cards when you draw, the drawn card is discarded.',
  },
  {
    id: 'play-limit',
    path: RULEBOOK,
    quote: '**Play cards**, in any order, each at most once a turn:',
    label: 'Playing cards',
    keywords: ['play', 'card', 'once', 'per', 'order'],
    answer: 'You may play cards in any order, each of the listed plays at most once a turn.',
  },
  {
    id: 'other-card',
    path: RULEBOOK,
    quote: 'one other card: a spell, a piece of gear or a location;',
    label: 'Spells, gear and locations',
    keywords: ['spell', 'gear', 'location', 'other'],
    answer: 'One of your plays each turn is one other card: a spell, a piece of gear or a location.',
  },
  {
    id: 'act',
    path: RULEBOOK,
    quote: '**Act** with each troop once: it attacks or it takes cover. Once any troop acts, you cannot play more cards this turn.',
    label: 'Acting ends card play',
    keywords: ['act', 'acting', 'action', 'after', 'attack', 'play', 'card'],
    answer: 'Each troop acts once a turn by attacking or taking cover. Once any troop acts, you cannot play more cards that turn.',
  },
  {
    id: 'turn-1',
    path: RULEBOOK,
    quote: 'Nobody attacks on turn 1.',
    label: 'No attacks on turn 1',
    keywords: ['nobody', '1', 'turn', 'attack'],
    answer: 'Nobody attacks on turn 1.',
  },
  {
    id: 'resting',
    path: RULEBOOK,
    quote: '**Resting.** A troop that was free cannot attack on the turn it arrives. A troop paid for with a tribute can.',
    label: 'Resting troops',
    keywords: ['rest', 'arrive', 'free', 'tribute', 'attack', 'same'],
    answer: 'A troop that was free cannot attack on the turn it arrives. A troop paid for with a tribute can.',
  },
  {
    id: 'guard',
    path: RULEBOOK,
    quote: '**Target.** You choose any enemy troop. If the enemy has a troop with Guard, you must choose a Guard troop.',
    label: 'Choosing a target and Guard',
    keywords: ['guard', 'target', 'choose', 'enemy'],
    answer: 'You may attack any enemy troop, but if the enemy has a Guard troop you must choose a Guard troop.',
  },
  {
    id: 'base-attack',
    path: RULEBOOK,
    quote: "**The Base.** You may attack the Base directly only when the enemy has no troops. A direct attack removes orbs equal to your troop's attack.",
    label: 'Attacking the Base',
    keywords: ['base', 'direct', 'directly', 'attack', 'empty'],
    answer: "You may attack the Base directly only when the enemy has no troops. The Base then loses orbs equal to your troop's attack.",
  },
  {
    id: 'cover',
    path: RULEBOOK,
    quote: 'Instead of attacking, a troop may take cover, even on the turn it arrives. Until your next turn:',
    label: 'Taking cover',
    keywords: ['cover', 'hide', 'defend', 'defense'],
    answer: 'A troop may take cover instead of attacking, even on the turn it arrives. Cover lasts until your next turn.',
  },
  {
    id: 'trap-spring',
    path: RULEBOOK,
    quote: 'When an enemy troop attacks, your oldest face-down trap springs before the attack lands. One trap springs per attack.',
    label: 'When traps spring',
    keywords: ['trap', 'spring', 'trigger', 'oldest', 'activate'],
    answer: 'When an enemy troop attacks, your oldest face-down trap springs before the attack lands. Only one trap springs per attack.',
  },
  {
    id: 'full-hand-check',
    path: RULEBOOK,
    quote: '**A full hand.** The limit is checked only when you draw.',
    label: 'When the hand limit is checked',
    keywords: ['hand', 'full', 'limit', 'check'],
    answer: 'The hand limit is checked only when you draw.',
  },
  {
    id: 'turn-80',
    path: RULEBOOK,
    quote: '**Running out of turns.** A game still going after turn 80 goes to the side whose Base has more orbs.',
    label: 'Running out of turns',
    keywords: ['80', 'end', 'after', 'run', 'out', 'timeout', 'long'],
    answer: 'A game still going after turn 80 goes to the side whose Base has more orbs.',
  },
  {
    id: 'best-of-three',
    path: RULEBOOK,
    quote: '**Best of three.** First to win two games. The loser of a game goes first in the next. Between games you may swap cards between your deck and your side deck, one for one.',
    label: 'Best of three',
    keywords: ['best', 'three', '3', 'match', 'series', 'loser', 'next', 'first', 'swap', 'side'],
    answer: 'Best of three is won by the first to win two games. The loser of a game goes first in the next, and between games you may swap cards with your side deck one for one.',
  },
  {
    id: 'nsb-1',
    path: BALANCE,
    quote: "NSB-1: Each faction's win share SHALL be within 45% to 55%, inclusive.",
    label: 'Balance requirement NSB-1: faction win share',
    keywords: ['balance', 'requirement', 'faction', 'share', 'band', '45', '55', 'percent', 'threshold', 'nsb'],
    answer: "Balance requirement NSB-1: each faction's win share must be between 45% and 55%, inclusive.",
  },
  {
    id: 'nsb-2',
    path: BALANCE,
    quote: "NSB-2: The opening player's absolute win-share distance from 50% SHALL grow by at most 1 percentage point versus the baseline.",
    label: 'Balance requirement NSB-2: first-seat skew',
    keywords: ['balance', 'requirement', 'seat', 'skew', 'tolerance', 'distance', 'baseline', '50', 'threshold', 'nsb'],
    answer: "Balance requirement NSB-2: the opening player's distance from a 50% win share may grow by at most 1 percentage point versus the baseline.",
  },
];

export function readRepoText(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

export function splitLines(text) {
  return text.split(/\r?\n/);
}

// 1-based numbers of every line that contains the quote.
export function locateQuote(lines, quote) {
  const hits = [];
  lines.forEach((line, i) => {
    if (line.includes(quote)) hits.push(i + 1);
  });
  return hits;
}

// Korean overlay (label, keywords, answer per clause id). The quotes stay in English: they are the authority.
const KO = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'rules-desk.ko.json'), 'utf8'));

export function buildIndex(readText = readRepoText, clauses = CLAUSES) {
  const problems = [];
  const ids = new Set();
  const files = new Map();
  const out = [];
  for (const base of clauses) {
    const spec = clauses === CLAUSES && KO.clauses[base.id] ? { ...base, ...KO.clauses[base.id] } : base;
    if (ids.has(spec.id)) problems.push(`duplicate clause id ${spec.id}`);
    ids.add(spec.id);
    if (!spec.quote || !spec.answer || !spec.label || !spec.keywords?.length) {
      problems.push(`${spec.id}: quote, label, keywords and answer are all required`);
      continue;
    }
    if (!files.has(spec.path)) {
      try {
        files.set(spec.path, splitLines(readText(spec.path)));
      } catch (error) {
        files.set(spec.path, null);
        problems.push(`cannot read ${spec.path}: ${error.message}`);
      }
    }
    const lines = files.get(spec.path);
    if (!lines) continue;
    const hits = locateQuote(lines, spec.quote);
    if (hits.length !== 1) {
      problems.push(hits.length
        ? `${spec.id}: quote appears on lines ${hits.join(', ')} of ${spec.path}; it must be unique`
        : `${spec.id}: quote not found in ${spec.path}: "${spec.quote}"`);
      continue;
    }
    out.push({
      id: spec.id,
      label: spec.label,
      path: spec.path,
      line: hits[0],
      quote: spec.quote,
      keywords: [...spec.keywords],
      answer: spec.answer,
    });
  }
  if (problems.length) {
    const error = new Error(problems.join('\n'));
    error.problems = problems;
    throw error;
  }
  return {
    version: 1,
    generator: 'node scripts/build-rules-desk.mjs',
    sources: SOURCES.map((source) => ({ ...source })),
    clauses: out,
  };
}

export function formatIndex(index) {
  return `${JSON.stringify(index, null, 2)}\n`;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// Returns a list of problems; empty means the stored index is current.
export function checkIndex(stored, readText = readRepoText, clauses = CLAUSES) {
  const problems = [];
  const files = new Map();
  const linesOf = (path) => {
    if (!files.has(path)) {
      try {
        files.set(path, splitLines(readText(path)));
      } catch (error) {
        files.set(path, null);
        problems.push(`cannot read ${path}: ${error.message}`);
      }
    }
    return files.get(path);
  };

  const storedClauses = Array.isArray(stored?.clauses) ? stored.clauses : [];
  if (!Array.isArray(stored?.clauses)) problems.push(`${INDEX_PATH} has no clauses array`);
  for (const clause of storedClauses) {
    const lines = linesOf(clause.path);
    if (!lines) continue;
    const text = lines[clause.line - 1];
    if (typeof text === 'string' && typeof clause.quote === 'string' && text.includes(clause.quote)) continue;
    const now = typeof clause.quote === 'string' ? locateQuote(lines, clause.quote) : [];
    problems.push(`stale line: ${clause.id} cites ${clause.path}:${clause.line}, which no longer contains its quote`
      + (now.length ? `; the quote is now on line ${now.join(', ')}` : '; the quote is gone from the file'));
  }

  let fresh = null;
  try {
    fresh = buildIndex(readText, clauses);
  } catch (error) {
    problems.push(...(error.problems ?? [error.message]));
  }
  if (fresh && stableJson(fresh) !== stableJson(stored)) {
    problems.push(`${INDEX_PATH} differs from a fresh build; run node scripts/build-rules-desk.mjs`);
  }
  return problems;
}

function main(argv) {
  const check = argv.includes('--check');
  if (argv.some((arg) => arg !== '--check')) {
    console.error('usage: node scripts/build-rules-desk.mjs [--check]');
    return 2;
  }
  if (check) {
    let stored;
    try {
      stored = JSON.parse(readRepoText(INDEX_PATH));
    } catch (error) {
      console.error(`cannot read ${INDEX_PATH}: ${error.message}`);
      return 1;
    }
    const problems = checkIndex(stored);
    if (problems.length) {
      for (const problem of problems) console.error(problem);
      return 1;
    }
    console.log(`rules desk index ok: ${stored.clauses.length} clauses match their source lines`);
    return 0;
  }
  let index;
  try {
    index = buildIndex();
  } catch (error) {
    for (const problem of error.problems ?? [error.message]) console.error(problem);
    return 1;
  }
  writeFileSync(join(ROOT, INDEX_PATH), formatIndex(index));
  console.log(`wrote ${INDEX_PATH}: ${index.clauses.length} clauses`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
