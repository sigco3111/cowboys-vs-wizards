// BBS screen renderer shared by the terminal and the HTML page.
// renderScreen works only from viewState(), so it cannot show hidden cards.
// Output is lines of [tone, text] segments; toAnsi and toHtml colour them.

import { SEAT_NAMES } from './engine.js';

export const SCREEN_WIDTH = 66;
const INDENT = '  ';
const GAP = '  ';
const CARD_WIDTH = 7;
const SUIT_GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const BACK_ROWS = ['┌─────┐', '│▒▒▒▒▒│', '│▒░░░▒│', '│▒▒▒▒▒│', '└─────┘'];

const width = (text) => [...text].length;

function faceRows(card) {
  const rank = card[0] === 'T' ? '10' : card[0];
  const suit = SUIT_GLYPHS[card[1]];
  return ['┌─────┐', `│${rank.padEnd(5)}│`, `│  ${suit}  │`, `│${rank.padStart(5)}│`, '└─────┘'];
}

function center(text, size) {
  const left = Math.floor((size - width(text)) / 2);
  return ' '.repeat(left) + text + ' '.repeat(size - width(text) - left);
}

function wrap(text, size) {
  const out = [];
  let line = '';
  for (const word of String(text).split(/\s+/).filter(Boolean)) {
    if (!line) line = word;
    else if (width(line) + 1 + width(word) <= size) line += ` ${word}`;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

function drewText(count) {
  if (count === null) return 'yet to draw';
  return count === 0 ? 'stood pat' : `drew ${count}`;
}

function cardRows(cards, toneFor) {
  const rows = [];
  for (let r = 0; r < 5; r++) {
    const segs = [['text', INDENT]];
    cards.forEach((card, i) => {
      if (i > 0) segs.push(['text', GAP]);
      segs.push([toneFor(card, i), card ? faceRows(card)[r] : BACK_ROWS[r]]);
    });
    rows.push(segs);
  }
  return rows;
}

export function renderScreen(view, { notice = '', hungUp = false } = {}) {
  const lines = [];
  const line = (...segs) => lines.push(segs);
  const blank = () => line(['text', '']);
  const rule = () => line(['frame', '─'.repeat(SCREEN_WIDTH)]);

  if (hungUp) {
    blank();
    line(['dim', `${INDENT}+++ATH0`]);
    line(['alert', `${INDENT}NO CARRIER`]);
    blank();
    line(['text', `${INDENT}The line to Boot Hill went quiet.`]);
    line(['key', `${INDENT}Press any key to redial.`]);
    return lines;
  }

  const inner = SCREEN_WIDTH - 2;
  const boxed = (left, right) => {
    const used = [...left, ...right].reduce((n, [, t]) => n + width(t), 0);
    line(['frame', '║'], ...left, ['text', ' '.repeat(Math.max(0, inner - used))], ...right, ['frame', '║']);
  };
  const opp = SEAT_NAMES[view.opponent];
  const you = SEAT_NAMES[view.you];
  const result = view.result;

  line(['frame', `╔${'═'.repeat(inner)}╗`]);
  boxed([['hi', '  B O O T   H I L L   P O K E R']], [['dim', 'node 1 · 2400 baud  ']]);
  boxed([['text', '  Five-card draw at the Last Chance Saloon']], [['dim', 'est. 1881  ']]);
  line(['frame', `╠${'═'.repeat(inner)}╣`]);
  boxed(
    [['text', `  Deal ${view.dealNumber}  Seed ${view.seed}  Turn ${view.turn}/2  Deck ${view.deckCount}`]],
    [['dim', `${SEAT_NAMES[view.first]} first  `]],
  );
  line(['frame', `╚${'═'.repeat(inner)}╝`]);
  blank();

  const tag = (seat) => (result && result.winner === seat ? [['win', '  « WINNER']] : []);
  line(
    ['hi', `${INDENT}THE ${opp.toUpperCase()}`],
    ['dim', ` · ${drewText(view.opponentDrew)}`],
    ...(view.opponentLabel ? [['text', ` · ${view.opponentLabel}`]] : [['dim', ' · cards face down']]),
    ...tag(view.opponent),
  );
  lines.push(...cardRows(view.opponentHand, (card) => (!card ? 'back' : 'HD'.includes(card[1]) ? 'red' : 'card')));
  blank();

  line(
    ['hi', `${INDENT}THE ${you.toUpperCase()} (YOU)`],
    ['dim', ` · ${drewText(view.youDrew)}`],
    ['text', ` · ${view.handLabel}`],
    ...tag(view.you),
  );
  const marked = new Set(view.marked);
  lines.push(...cardRows(view.hand, (card, i) => (marked.has(i) ? 'dim' : 'HD'.includes(card[1]) ? 'red' : 'card')));
  if (view.canAct) {
    const keys = [['text', INDENT]];
    const holds = [['text', INDENT]];
    view.hand.forEach((_, i) => {
      if (i > 0) {
        keys.push(['text', GAP]);
        holds.push(['text', GAP]);
      }
      keys.push(['key', center(`[${i + 1}]`, CARD_WIDTH)]);
      holds.push(marked.has(i) ? ['alert', center('TOSS', CARD_WIDTH)] : ['text', center('HOLD', CARD_WIDTH)]);
    });
    lines.push(keys, holds);
  }
  blank();
  rule();

  if (result) {
    const banner = result.winner === 'draw'
      ? '>>> DEAD EVEN. THE HAND IS A DRAW. <<<'
      : `>>> THE ${SEAT_NAMES[result.winner].toUpperCase()} TAKES THE HAND <<<`;
    line(['win', `${INDENT}${banner}`]);
    for (const text of wrap(result.reason, SCREEN_WIDTH - 4)) line(['text', `${INDENT}${text}`]);
    blank();
  }
  if (notice) {
    wrap(notice, SCREEN_WIDTH - 4).forEach((text, i) => line(['key', `${INDENT}${i === 0 ? '> ' : '  '}${text}`]));
  }
  for (const entry of view.log.filter((e) => !e.startsWith('Showdown')).slice(-3)) {
    for (const text of wrap(entry, SCREEN_WIDTH - 6)) line(['dim', `${INDENT}· ${text}`]);
  }
  rule();

  if (view.canAct) {
    line(['key', `${INDENT}[1-5]`], ['text', ' toss/hold a card    '], ['key', '[ENTER]'], ['text', ' draw']);
  }
  line(
    ['key', `${INDENT}[R]`], ['text', ' replay this deal    '],
    ['key', '[N]'], ['text', ' new deal    '],
    ['key', '[Q]'], ['text', ' hang up'],
  );
  return lines;
}

export function toText(lines) {
  return lines.map((segs) => segs.map(([, text]) => text).join('')).join('\n');
}

const ANSI = {
  frame: '38;5;94',
  text: '38;5;214',
  hi: '1;38;5;229',
  dim: '38;5;137',
  card: '38;5;223',
  red: '38;5;203',
  back: '38;5;130',
  key: '1;38;5;221',
  win: '1;38;5;220',
  alert: '1;38;5;203',
};

export function toAnsi(lines, { color = true } = {}) {
  if (!color) return toText(lines);
  return lines.map((segs) => segs.map(([tone, text]) => `\x1b[${ANSI[tone] ?? ANSI.text}m${text}\x1b[0m`).join('')).join('\n');
}

const escapeHtml = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function toHtml(lines) {
  return lines
    .map((segs) => segs.map(([tone, text]) => `<span class="t-${tone}">${escapeHtml(text)}</span>`).join(''))
    .join('\n');
}
