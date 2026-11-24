// The Trail: a new player's first six duels. Each one is easier than an even match, shows one
// new thing on the Wizard side, and pays a new card on the first win. Progress and saving are in progress.js.
import {DECKS} from "./cards.js";

// What a new player starts with: three card names and no keywords.
export const STARTER = Object.freeze({"cowboy-sheriff": 8, "cowboy-billy": 5, "cowboy-deadeye": 3});

// level: how well the Wizards play (0 any legal action, 1 best single action, 1.5 plans every other turn, 2 plans every turn).
// base: Wizard Base orbs. first: who opens (the Cowboys open every Trail duel).
// The settings come from trail-sim.mjs: a sure win twice, then a ramp. The even match waits until after the Trail.
// reward: [card earned, card it replaces, copies].
export const TRAIL = Object.freeze([
  {id: "boot-hill", name: "부트 힐", lesson: "마법사 기지의 오브를 모두 없애면 승리합니다. 마법사에게 부대가 없을 때만 기지를 공격할 수 있습니다. 내 부대 하나를 고른 뒤, 그 부대가 때릴 적 부대를 고르세요.",
    level: 0, base: 3, first: "cowboy", deck: {"wizard-skeleton": 16},
    reward: [["cowboy-covered-wagon", "cowboy-sheriff", 2]]},
  {id: "raven-roost", name: "까마귀 둥지", lesson: "이제 적 카드에 키워드가 생깁니다. 보드 아래에 나열됩니다. 잭오랜턴은 최후의 저항을 가집니다. 전투에서 쓰러지면 내 부대가 오브 1개를 잃습니다.",
    level: 0, base: 4, first: "cowboy", deck: {"wizard-skeleton": 9, "wizard-raven-familiar": 4, "wizard-jack-o-lantern": 3},
    reward: [["cowboy-outrider", "cowboy-sheriff", 2]]},
  {id: "bone-fence", name: "뼈 울타리", lesson: "뼈 방벽은 수호를 가집니다. 먼저 쓰러뜨려야 합니다. 적 마법사는 묘지에서 해골을 소생시킵니다.",
    level: 0, base: 4, first: "cowboy", deck: {"wizard-skeleton": 8, "wizard-bone-wall": 3, "wizard-wizard": 3, "wizard-singularity": 2},
    reward: [["cowboy-ranger", "cowboy-billy", 1], ["cowboy-lasso", "cowboy-deadeye", 1]]},
  {id: "imp-hollow", name: "임프 골짜기", lesson: "임프는 등장한 턴에 공격합니다. 기지 앞에 부대 하나를 세워 두세요.",
    level: 1, base: 4, first: "cowboy", deck: {"wizard-skeleton": 6, "wizard-imp": 3, "wizard-jack-o-lantern": 3, "wizard-singularity": 2, "wizard-hellfire": 2},
    reward: [["cowboy-dynamiter", "cowboy-sheriff", 1], ["cowboy-bear-trap", "cowboy-deadeye", 1]]},
  {id: "hexed-mile", name: "저주받은 길", lesson: "뒷면 카드는 함정입니다. 다음 공격 때 발동합니다. 값싼 부대를 먼저 보내세요.",
    level: 1, base: 4, first: "cowboy", deck: {"wizard-skeleton": 6, "wizard-wizard": 3, "wizard-headless-horseman": 2, "wizard-bone-wall": 2, "wizard-hex": 2, "wizard-singularity": 1},
    reward: [["cowboy-mounted-billy", "cowboy-billy", 1]]},
  {id: "dragons-roost", name: "용의 둥지", lesson: "마녀단 전원, 그리고 용. 지금까지 얻은 모든 것이 덱에 들어 있습니다.",
    level: 1.5, base: 4, first: "cowboy", deck: DECKS.wizard,
    reward: [["cowboy-gatling-crew", "cowboy-billy", 1]]},
]);

// A lost duel gives the rematch one more Base orb, twice at most.
export const GRIT_CAP = 2;

// Your deck after `wins` duels: the starter with each earned card swapped in.
export function deckAfter(wins) {
  const deck = {...STARTER};
  for (const {reward} of TRAIL.slice(0, wins)) {
    for (const [earned, replaced, copies] of reward) {
      deck[replaced] -= copies;
      deck[earned] = (deck[earned] ?? 0) + copies;
    }
  }
  return Object.fromEntries(Object.entries(deck).filter(([, copies]) => copies > 0));
}
