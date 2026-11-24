// 화면 표시용 한국어 변환. 엔진(engine.js)은 규칙 검증과 동결된 증거가 영어 문구에 기대므로 그대로 두고,
// 화면에 보이는 문구만 여기서 한글로 바꾼다. 알 수 없는 문구는 원문 그대로 남는다.

const RANK = {Ace: '에이스', Two: '2', Three: '3', Four: '4', Five: '5', Six: '6', Seven: '7', Eight: '8', Nine: '9', Ten: '10', Jack: '잭', Queen: '퀸', King: '킹'};
const PLURAL = {Aces: '에이스', Twos: '2', Threes: '3', Fours: '4', Fives: '5', Sixes: '6', Sevens: '7', Eights: '8', Nines: '9', Tens: '10', Jacks: '잭', Queens: '퀸', Kings: '킹'};
const SUIT = {Spades: '스페이드', Hearts: '하트', Diamonds: '다이아몬드', Clubs: '클럽'};
const CATEGORY = {
  'High Card': '하이 카드', 'One Pair': '원 페어', 'Two Pair': '투 페어', 'Three of a Kind': '트리플', Straight: '스트레이트',
  Flush: '플러시', 'Full House': '풀 하우스', 'Four of a Kind': '포카드', 'Straight Flush': '스트레이트 플러시',
};
const SEAT = {Cowboy: '카우보이', Wizard: '마법사'};

const alt = (o) => Object.keys(o).join('|');
const R = alt(RANK);
const P = alt(PLURAL);

// 순서가 중요하다: 긴 문구를 먼저 바꾼다.
const RULES = [
  [/Royal Flush/g, '로열 플러시'],
  [/Straight Flush, Five high \(steel wheel\)/g, '스트레이트 플러시, 5 하이 (스틸 휠)'],
  [new RegExp(`Straight Flush, (${R}) high`, 'g'), (_, a) => `스트레이트 플러시, ${RANK[a]} 하이`],
  [new RegExp(`Full House, (${P}) over (${P})`, 'g'), (_, a, b) => `풀 하우스, ${PLURAL[a]} 위에 ${PLURAL[b]}`],
  [new RegExp(`Four (${P})`, 'g'), (_, a) => `${PLURAL[a]} 포카드`],
  [new RegExp(`Three (${P})`, 'g'), (_, a) => `${PLURAL[a]} 트리플`],
  [new RegExp(`Two Pair, (${P}) and (${P})`, 'g'), (_, a, b) => `투 페어, ${PLURAL[a]}와 ${PLURAL[b]}`],
  [new RegExp(`Pair of (${P})`, 'g'), (_, a) => `${PLURAL[a]} 원 페어`],
  [new RegExp(`Flush, (${R}) high`, 'g'), (_, a) => `플러시, ${RANK[a]} 하이`],
  [/Straight, Five high \(the wheel, A-2-3-4-5\)/g, '스트레이트, 5 하이 (휠, A-2-3-4-5)'],
  [new RegExp(`Straight, (${R}) high`, 'g'), (_, a) => `스트레이트, ${RANK[a]} 하이`],
  [new RegExp(`(${R}) high`, 'g'), (_, a) => `${RANK[a]} 하이`],
  [new RegExp(`(${R}) of (${alt(SUIT)})`, 'g'), (_, a, s) => `${SUIT[s]} ${RANK[a]}`],
  [/Dead even: both hold (.+?)\. Suits never break a tie, so the hand is a draw\./g, (_, a) => `완전히 같습니다: 둘 다 ${a}입니다. 무늬는 동점을 가르지 않으므로 무승부입니다.`],
  [/The (Cowboy|Wizard) wins: both hold (.+?), and the (?:Cowboy|Wizard)'s (\S+) kicker beats the (\S+)\./g, (_, w, h, a, b) => `${SEAT[w]} 승리: 둘 다 ${h}이고, ${SEAT[w]}의 키커 ${a}이(가) ${b}을(를) 이깁니다.`],
  [/The (Cowboy|Wizard) wins: (.+?) beats (.+?)\./g, (_, w, a, b) => `${SEAT[w]} 승리: ${a}이(가) ${b}을(를) 이깁니다.`],
  [/Deal #(\d+), seed (\d+)\. The (Cowboy|Wizard) draws first\./g, (_, n, s, w) => `${n}번째 패, 시드 ${s}. ${SEAT[w]}가 먼저 뽑습니다.`],
  [/Turn (\d+): the (Cowboy|Wizard) stands pat\./g, (_, n, w) => `${n}턴: ${SEAT[w]}는 그대로 둡니다.`],
  [/Turn (\d+): the (Cowboy|Wizard) tosses (\d+) and draws (\d+)\./g, (_, n, w, a, b) => `${n}턴: ${SEAT[w]}가 ${a}장을 버리고 ${b}장을 뽑습니다.`],
  [/Showdown: /g, '승부: '],
  [/The (Cowboy|Wizard) stood pat\. /g, (_, w) => `${SEAT[w]}는 그대로 뒀습니다. `],
  [/The (Cowboy|Wizard) drew (\d+)\. /g, (_, w, n) => `${SEAT[w]}가 ${n}장을 뽑았습니다. `],
  [/Your draw: press 1-5 to mark cards to toss, then ENTER\./g, '내 차례: 1-5로 버릴 카드를 표시한 뒤 ENTER를 누르세요.'],
  [/Carrier restored\. /g, '연결이 복구되었습니다. '],
  [/Card (\d+), the (.+?): marked to TOSS\./g, (_, i, c) => `${i}번 카드, ${c}: 버리기로 표시했습니다.`],
  [/Card (\d+), the (.+?): back to HOLD\./g, (_, i, c) => `${i}번 카드, ${c}: 다시 유지합니다.`],
  [/You stand pat\. Cards up!/g, '그대로 갑니다. 카드를 공개합니다!'],
  [/You toss (\d+) and draw (\d+)\. Cards up!/g, (_, a, b) => `${a}장을 버리고 ${b}장을 뽑습니다. 카드를 공개합니다!`],
  [/Same seed (\d+), same deck\. /g, (_, s) => `같은 시드 ${s}, 같은 덱입니다. `],
  [/Fresh shuffle, seed (\d+)\. /g, (_, s) => `새로 섞었습니다. 시드 ${s}. `],
  [/The cards are down\. Press R to replay this deal or N for a new one\./g, '카드가 모두 놓였습니다. R로 이 패를 다시 하거나 N으로 새 패를 받으세요.'],
  [/Keys: 1-5 toss\/hold, ENTER draw, R replay, N new deal, Q hang up\./g, '키: 1-5 버리기/유지, ENTER 뽑기, R 다시, N 새 패, Q 끊기.'],
  [/Boot Hill Poker could not start: /g, '부트 힐 포커를 시작하지 못했습니다: '],
];

const hasBatchim = (ch) => {
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
  return /[013678]/.test(ch);
};
const JOSA = {'이(가)': ['이', '가'], '을(를)': ['을', '를'], '은(는)': ['은', '는']};
const fixJosa = (text) => text.replace(/(\S)(이\(가\)|을\(를\)|은\(는\))/g, (_, ch, j) => ch + JOSA[j][hasBatchim(ch) ? 0 : 1]);

export function ko(text) {
  let out = String(text);
  for (const [pattern, to] of RULES) out = out.replace(pattern, to);
  for (const [en, kr] of Object.entries(CATEGORY)) out = out.split(en).join(kr);
  return fixJosa(out);
}
export const koSeat = (name) => SEAT[name] ?? name;
