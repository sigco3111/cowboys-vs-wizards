// BBS screen renderer shared by the terminal and the HTML page.
// renderScreen works only from viewState(), so it cannot show hidden cards.
// Output is lines of [tone, text] segments; toAnsi and toHtml colour them.

import { SEAT_NAMES } from './engine.js';
import { ko, koSeat } from './ko.js';

export const SCREEN_WIDTH = 66;
const INDENT = '  ';
const GAP = '  ';
const CARD_WIDTH = 7;
const SUIT_GLYPHS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const BACK_ROWS = ['┌─────┐', '│▒▒▒▒▒│', '│▒░░░▒│', '│▒▒▒▒▒│', '└─────┘'];

// 한글·전각 문자는 터미널에서 두 칸을 차지한다.
const cellOf = (ch) => { const c = ch.codePointAt(0); return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ? 2 : 1; };
const width = (text) => [...text].reduce((n, ch) => n + cellOf(ch), 0);

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
  if (count === null) return '아직 뽑지 않음';
  return count === 0 ? '그대로 둠' : `${count}장 뽑음`;
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
    line(['alert', `${INDENT}연결 끊김 (NO CARRIER)`]);
    blank();
    line(['text', `${INDENT}부트 힐과의 연결이 조용해졌습니다.`]);
    line(['key', `${INDENT}아무 키나 눌러 다시 거세요.`]);
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
  boxed([['hi', '  부 트   힐   포 커']], [['dim', '노드 1 · 2400 보  ']]);
  boxed([['text', '  라스트 찬스 살롱의 파이브 카드 드로우']], [['dim', '1881년 설립  ']]);
  line(['frame', `╠${'═'.repeat(inner)}╣`]);
  boxed(
    [['text', `  패 ${view.dealNumber}  시드 ${view.seed}  턴 ${view.turn}/2  덱 ${view.deckCount}`]],
    [['dim', `${koSeat(SEAT_NAMES[view.first])} 선공  `]],
  );
  line(['frame', `╚${'═'.repeat(inner)}╝`]);
  blank();

  const tag = (seat) => (result && result.winner === seat ? [['win', '  « 승리']] : []);
  line(
    ['hi', `${INDENT}${koSeat(opp)}`],
    ['dim', ` · ${drewText(view.opponentDrew)}`],
    ...(view.opponentLabel ? [['text', ` · ${ko(view.opponentLabel)}`]] : [['dim', ' · 카드 뒷면']]),
    ...tag(view.opponent),
  );
  lines.push(...cardRows(view.opponentHand, (card) => (!card ? 'back' : 'HD'.includes(card[1]) ? 'red' : 'card')));
  blank();

  line(
    ['hi', `${INDENT}${koSeat(you)} (나)`],
    ['dim', ` · ${drewText(view.youDrew)}`],
    ['text', ` · ${ko(view.handLabel)}`],
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
      holds.push(marked.has(i) ? ['alert', center('버림', CARD_WIDTH)] : ['text', center('유지', CARD_WIDTH)]);
    });
    lines.push(keys, holds);
  }
  blank();
  rule();

  if (result) {
    const banner = result.winner === 'draw'
      ? '>>> 완전히 같습니다. 무승부입니다. <<<'
      : `>>> ${koSeat(SEAT_NAMES[result.winner])}가 이 패를 가져갑니다 <<<`;
    line(['win', `${INDENT}${banner}`]);
    for (const text of wrap(ko(result.reason), SCREEN_WIDTH - 4)) line(['text', `${INDENT}${text}`]);
    blank();
  }
  if (notice) {
    wrap(ko(notice), SCREEN_WIDTH - 4).forEach((text, i) => line(['key', `${INDENT}${i === 0 ? '> ' : '  '}${text}`]));
  }
  for (const entry of view.log.filter((e) => !e.startsWith('Showdown')).slice(-3)) {
    for (const text of wrap(ko(entry), SCREEN_WIDTH - 6)) line(['dim', `${INDENT}· ${text}`]);
  }
  rule();

  if (view.canAct) {
    line(['key', `${INDENT}[1-5]`], ['text', ' 카드 버리기/유지    '], ['key', '[ENTER]'], ['text', ' 뽑기']);
  }
  line(
    ['key', `${INDENT}[R]`], ['text', ' 이 패 다시    '],
    ['key', '[N]'], ['text', ' 새 패    '],
    ['key', '[Q]'], ['text', ' 끊기'],
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
// 한글은 글꼴과 상관없이 정확히 두 칸 폭으로 고정해 테두리가 어긋나지 않게 한다.
const wideHtml = (html) => html.replace(/[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\uff00-\uff60]/g, '<span class="w">$&</span>');

export function toHtml(lines) {
  return lines
    .map((segs) => segs.map(([tone, text]) => `<span class="t-${tone}">${wideHtml(escapeHtml(text))}</span>`).join(''))
    .join('\n');
}
