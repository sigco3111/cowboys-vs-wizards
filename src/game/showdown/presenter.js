// One log line for each Showdown engine event, written from the table's point of view.
// presentEvent handles every entry in EVENTS (contract.js) and throws on any other type, so a
// screen that draws through it cannot silently skip a rule. No DOM: screens decide where the
// text goes. Wording follows the prototype screen's log (prototypes/showdown/main.js).
import {cardOf} from "./cards.js";
import {EVENTS} from "./contract.js";
import {HAND_CAP, opponent} from "./rules.js";

const FACTION = Object.freeze({cowboy: "카우보이", wizard: "마법사"});
const side = (name) => FACTION[name] ?? name;
const name = (cardId) => cardOf(cardId)?.name ?? cardId;
const owned = (owner, cardId) => `${side(owner)} ${name(cardId)}`;
const base = (owner) => `${side(owner)} 기지`;
const plural = (n, word) => `${word} ${n}개`;
const targetName = (target) => (target === "base" ? "기지" : name(target));

function attackText(e) {
  const defender = base(opponent(e.side));
  if (e.target === "base") return `${owned(e.side, e.cardId)} → ${defender} 공격: 오브 ${e.baseDamage}개 피해.`;
  const result = e.targetLeft === 0
    ? `쓰러뜨림${e.baseDamage ? `, ${defender}에 오브 ${e.baseDamage}개 피해` : e.covered ? "; 엄폐 중이라 기지에는 피해가 없음" : ""}`
    : e.covered ? `오브 ${e.targetLeft}개 남김; 엄폐 중이라 반격하지 못함`
    : !e.hitBack ? `오브 ${e.targetLeft}개 남김; 공격력이 없어 반격하지 못함`
    : `오브 ${e.targetLeft}개 남김, 반격으로 ${e.hitBack} 피해${e.attackerLeft === 0 ? `, ${name(e.cardId)} 쓰러짐` : ""}`;
  return `${owned(e.side, e.cardId)} → ${name(e.target)} 공격: ${result}.`;
}

export const PRESENTERS = Object.freeze({
  turn: (e) => `${e.turn}턴: ${side(e.side)} 차례.`,
  draw: (e) => `${side(e.side)}: 카드를 한 장 뽑음.`,
  burn: (e) => `${side(e.side)}: 패가 가득 참 (최대 ${HAND_CAP}장). ${name(e.cardId)} 버려짐.`,
  fatigue: (e) => `${side(e.side)}: 덱이 비어 ${base(e.side)}가 오브 1개를 잃음.`,
  tribute: (e) => `${owned(e.side, e.cardId)} 제물로 바쳐짐.`,
  summon: (e) => `${owned(e.side, e.cardId)} 등장.`,
  raise: (e) => `소생: ${owned(e.side, e.cardId)} 오브 1개로 묘지에서 돌아옴.`,
  spell: (e) => `${owned(e.side, e.cardId)} → ${targetName(e.target)}: ${e.stunned ? "다음 턴 기절" : e.left === 0 ? "쓰러짐" : `오브 ${e.left}개 남음`}.`,
  gear: (e) => `${owned(e.side, e.target)} 장비 장착: ${name(e.cardId)}.`,
  location: (e) => `${owned(e.side, e.cardId)} 장소로 설정됨.`,
  set: (e) => `${side(e.side)}: 카드를 뒷면으로 놓음.`,
  cover: (e) => `${owned(e.side, e.cardId)} 엄폐.`,
  trap: (e) => `함정! ${owned(e.side, e.cardId)} → ${name(e.target)}: ${e.left === 0 ? "공격 전에 쓰러짐" : e.stopped ? "공격이 취소됨" : `오브 ${e.left}개로 줄었지만 그래도 공격함`}.`,
  attack: attackText,
  laststand: (e) => `최후의 저항: ${name(e.cardId)} → ${name(e.target)} 오브 1개 깎음${e.left === 0 ? ", 쓰러뜨림" : ""}.`,
  sweep: (e) => `휩쓸기: ${name(e.cardId)} → 다른 부대 ${e.count}개에도 1 피해.`,
});

// The text a player sees for one engine event. Throws for a type EVENTS does not list or this
// module has no handler for.
export function presentEvent(event, presenters = PRESENTERS) {
  const type = event?.type;
  if (!Object.hasOwn(EVENTS, type)) throw new Error(`Unknown Showdown event type: ${type}`);
  if (!Object.hasOwn(presenters, type)) throw new Error(`No presenter for Showdown event type: ${type}`);
  return presenters[type](event);
}
