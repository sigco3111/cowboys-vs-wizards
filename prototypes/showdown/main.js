// Screens for the Showdown prototype: the camp (what to play, what you earned), the duel and the deck builder.
// The rules are in rules.js and everything a player keeps is in progress.js; this file only shows them.
import {DECKS, EFFECTS, KEYWORDS, RARITY, TYPES, cardOf, tributes} from "./cards.js";
import {viewFor} from "./contract.js";
import {josa} from "../../src/ui/josa.js";
import {applyAction, attackOf, attackOutcome, canAttack, createShowdown, legalActions, opponent, playTurn} from "./rules.js";
import {BOUNTIES, DECK_SIZE, HUNTS, RIVALS, SIDE_SIZE, choose, deckProblems, duelFor, duelList, migrate, newSave, openPack, owned, settle, trailDone, withDeck} from "./progress.js";
import {logged, report} from "./playtest.js";
import {GRIT_CAP, TRAIL} from "./trail.js";
import {decodeSaveCode, describeSave, encodeSave, sameSave} from "./savecode.js";

const $ = (id) => document.getElementById(id);
const name = (cardId) => cardOf(cardId).name;
const plural = (n, word) => `${({pack: "팩", card: "카드", troop: "부대"})[word] ?? word} ${n}장`;
const sum = (counts) => Object.values(counts).reduce((total, copies) => total + copies, 0);
const orbs = (now, max) => `<span class="orbs" role="img" aria-label="구슬 ${Math.max(now, max)}개 중 ${now}개">${"●".repeat(now)}<span class="lost">${"○".repeat(Math.max(0, max - now))}</span></span>`;
// The same marks as the graybox card frames, plus gear and location.
const MARK = {troop: "●", spell: "✦", trap: "▲", gear: "◆", location: "■"};
const KIND = {spell: "주문", trap: "함정", gear: "장비", location: "장소"};
const TAGKO = {Lawman: "법 집행관", Outlaw: "무법자", Beast: "야수", Undead: "언데드", Rig: "탈것", Mage: "마법사", Fiend: "마귀"};
const typeLine = (card) => `<span class="type">${MARK[card.kind]} ${card.kind === "troop" ? `부대 · ${TAGKO[card.tag] ?? card.tag}` : KIND[card.kind]} · ${RARITY[card.rarity][0]}</span>`;
const keywords = (card) => (card.keys ?? []).map((key) => `<span class="key" title="${KEYWORDS[key][1]}">${KEYWORDS[key][0]}</span>`).join(" ");
// A card's face. `full` spells out each keyword, for the moment a card is earned or chosen.
function face(type, {full = false, extra = ""} = {}) {
  const card = TYPES[type];
  const rules = card.kind !== "troop" ? EFFECTS[card.effect].text
    : full ? card.keys.map((key) => `<strong>${KEYWORDS[key][0]}.</strong> ${KEYWORDS[key][1]}`).join(" ") || "키워드 없음." : "";
  return `<strong>${card.name}</strong>${typeLine(card)}${card.kind === "troop" ? `공격 ${card.attack} · 구슬 ${card.health}개 ${full ? "" : keywords(card)}` : ""}
    ${rules ? `<span class="note">${rules}</span>` : ""}${card.kind === "troop" ? `<span class="note">${costLine(type)}</span>` : ""}${extra}`;
}
// What a troop costs and when it can first attack, in words a newcomer has not had to learn yet.
function costLine(type) {
  const cost = tributes(`${type}-1`);
  if (cost) return `비용: 내 부대 ${cost}장을 묘지로 보냅니다. 도착한 턴에 공격합니다.`;
  return TYPES[type].keys.includes("quickdraw") ? "비용: 없음." : "비용: 없음. 도착한 턴에는 쉽니다.";
}
const cardClass = (type) => `card cowboy ${TYPES[type].kind} ${TYPES[type].rarity}`;
const OFFER_HEADING = "보너스: 보관할 카드 1장을 더 고르세요";
const offerRow = () => `<div class="row">${save.offer.map((type) =>
  `<button type="button" class="${cardClass(type)} earned can" data-choose="${type}">${face(type, {full: true, extra: `<span class="note">보유: ${owned(save, type)}장.</span>`})}</button>`).join("")}</div>`;

// ---- Saved progress -------------------------------------------------------------------------
const SAVE = "cvw-showdown-save-v2";
const OLD_SAVE = "cvw-showdown-trail-v1";
const stored = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
let save = migrate(stored(SAVE) ?? stored(OLD_SAVE));
function keep(next) {
  save = next;
  // Storage can be blocked or full: play on with the progress in memory, keep the last stored save, and say so.
  let saved = true;
  try { localStorage.setItem(SAVE, JSON.stringify(save)); } catch { saved = false; }
  renderStorageNotice(saved);
  return saved;
}
// One notice above every screen, shown while the browser refuses to save.
function renderStorageNotice(saved) {
  let notice = document.getElementById("storage-notice");
  if (saved && !notice) return;
  if (!notice) {
    notice = Object.assign(document.createElement("p"), {id: "storage-notice", className: "note"});
    notice.setAttribute("role", "status");
    notice.dataset.testid = "storage-notice";
    $("camp").before(notice);
  }
  notice.hidden = saved;
  notice.textContent = saved ? "" : "이 브라우저에 진행 상황이 저장되지 않아 새로고침하면 사라집니다. "
    + "보존하려면 캠프의 저장 코드를 열어 코드를 복사해 두세요.";
}

// One line per finished duel against the Wizards, for the playtest report in the camp.
const LOG = "cvw-showdown-playtest-v1";
let log = Array.isArray(stored(LOG)) ? stored(LOG) : [];
function keepLog(next) {
  log = next;
  try { localStorage.setItem(LOG, JSON.stringify(log)); } catch { /* storage is blocked: the report covers this visit only */ }
}

// ---- What is on screen ----------------------------------------------------------------------
// A seed in the address fixes the first deal only; after that every duel is a fresh deal.
let fixedSeed = new URLSearchParams(location.search).get("seed");
const freshSeed = () => {
  const seed = fixedSeed === null ? Math.floor(Math.random() * 100000) : Number(fixedSeed);
  fixedSeed = null;
  return seed;
};
let screen = null;
let game; // {duel, players: 1 or 2, match: null or {wins, game, deck, side, first}, seed}
let state;
let lines; // log lines, oldest first
let pick; // nothing, a card (with tributes picked so far), or one of your troops
let outcome; // set once the game ends
let curtain = false; // two players: the screen is being passed
let opened = null; // the pack just opened, shown once in the camp
let draft; // the deck builder's working copy
let picked = null; // the card just taken from an offer, so the screen can confirm it

const solo = () => game.players === 1;
const me = () => (solo() ? "cowboy" : state.active);
const faction = (side) => (side === "cowboy" ? "카우보이" : "마법사");
const whose = (side) => (solo() ? (side === "cowboy" ? "내" : "적") : faction(side));
const baseOf = (side) => (solo() ? (side === "cowboy" ? "내 기지" : "마법사 기지") : `${faction(side)} 기지`);

function show(next) {
  const visible = next === "duel" && curtain ? "curtain" : next;
  const moved = visible !== (screen === "duel" && !$("curtain").hidden ? "curtain" : screen);
  const first = screen === null; // the page has just opened: leave focus where the browser puts it
  const from = screen;
  screen = next;
  if (next !== "camp") closePreview();
  for (const id of ["camp", "builder", "duel", "curtain"]) $(id).hidden = id !== visible;
  if (visible === "camp") renderCamp();
  if (visible === "builder") renderBuilder();
  if (visible === "duel") renderDuel();
  if (visible === "curtain") $("curtain-text").textContent = `화면을 ${faction(state.active)} 플레이어에게 넘기세요.`;
  if (moved) window.scrollTo(0, 0);
  // Keyboard focus follows the screen instead of falling to the page behind a hidden control.
  if (moved && visible === "curtain") $("ready").focus();
  else if (moved && visible === "duel" && !$("end").hidden) $("end").focus({preventScroll: true});
  else if (moved && visible === "builder") ($("builder-rows").querySelector("button:not(:disabled)") ?? $("builder-save")).focus({preventScroll: true});
  else if (moved && visible === "camp" && from === "builder") $("build").focus({preventScroll: true}); // saved or cancelled: back where it opened
  else if (moved && visible === "camp" && !first) {
    // Back on the duel just left, or else the first control that can be used.
    const back = game && (game.players === 1 ? `[data-duel="${game.duel.id}"]` : "[data-two]");
    ($("camp").querySelector(`${back ?? "[data-duel]"}:not(:disabled)`) ?? $("camp").querySelector("button:not(:disabled)"))?.focus({preventScroll: true});
  }
}
// A live region rewritten with the same words can be read out again, so each one is written only when it changes.
const written = new WeakMap();
function write(el, value, as = "innerHTML") {
  if (written.get(el) === value) return;
  el[as] = value;
  written.set(el, value);
}
// The board and hand are redrawn after every move, which drops keyboard focus to the page. Put it back: on the
// first target when a pick wants one, else on the same control if it is still usable, else on the turn's button.
const focusKey = (el) => (el.id ? `#${el.id}` : ["card", "own", "enemy"].map((k) => el.dataset[k] !== undefined && `[data-${k}="${el.dataset[k]}"]`).find(Boolean));
function refocus(key) {
  const usable = (el) => el && !el.disabled && !el.hidden && el.getClientRects().length > 0;
  const target = pick ? $("board").querySelector("button.can") : null;
  const same = key ? $("duel").querySelector(key) : null;
  const next = [target, same, $("end"), $("again"), $("reward").querySelector("[data-again]")].find(usable);
  next?.focus();
}

// ---- Camp -----------------------------------------------------------------------------------
function renderCamp() {
  const list = duelList(save);
  // First things first: a card to choose, then a pack to open.
  const next = TRAIL[save.wins];
  const hint = picked ? `<p class="good">${TYPES[picked].name} 추가: 이제 ${owned(save, picked)}장을 갖고 있습니다. 새 카드는 아직 덱에 없습니다. 아래 덱 구성을 쓰세요.</p>` : "";
  $("claim").innerHTML = save.offer ? `<h2>${OFFER_HEADING}</h2><p class="note">승리했습니다. 고른 카드가 컬렉션에 들어갑니다.</p>${offerRow()}`
    : opened ? `<h2>팩 안의 카드</h2><div class="row">${opened.map((type) => `<div class="${cardClass(type)} earned">${face(type, {full: true})}</div>`).join("")}</div>
        <div class="row"><button type="button" id="pack-done">${save.packs ? `다음 팩 열기 (${save.packs}개 남음)` : "내 컬렉션에 추가"}</button></div>`
    : save.packs ? `${hint}<h2>열 수 있는 팩 ${save.packs}개</h2><div class="row"><button type="button" class="pack can" id="pack">팩 열기: 카드 3장</button></div>`
    : `${hint}${next ? `<p id="next">${save.wins === 0 && !log.length ? "여기서 시작" : "다음"}: <strong>${josa(next.name, "을")}</strong> 눌러 ${save.wins === 0 ? "첫 대결을" : "대결을"} 시작하세요.</p>` : ""}`;

  // While a card is on offer nothing else can be started: the choice comes first.
  const tile = (duel, note, off = duel.state !== "open") => `<li><button type="button" class="tile ${duel.state}" ${off || save.offer ? "disabled" : `data-duel="${duel.id}"`}>
    <strong>${duel.state === "won" ? "✓ " : ""}${duel.name}</strong><span class="note">${note}</span></button></li>`;
  const pays = (cards) => cards.map(([type, copies]) => `${TYPES[type].name}${copies > 1 ? ` ×${copies}` : ""}`).join(", ");
  $("trail").innerHTML = list.filter((duel) => duel.kind === "trail").map((duel) => {
    const reward = pays(TRAIL[duel.index].reward.map(([type, , copies]) => [type, copies]));
    // A clean save is told where to begin; the open tile is already the one that is outlined.
    return tile(duel, duel.state === "won" ? `획득: ${reward}` : `승리하면 ${reward} 획득`, undefined, duel.state === "open" && save.wins === 0 ? "여기서 시작: 첫 대결." : "");
  }).join("");
  $("rivals").innerHTML = list.filter((duel) => duel.kind === "rival").map((duel, i) => {
    const rival = RIVALS[i];
    const reward = [pays(rival.reward.map((type) => [type, 1])), `팩 ${rival.packs}개`].filter(Boolean).join(" 및 ");
    // A beaten rival can be fought again for the card choice.
    return tile(duel, duel.state === "won" ? "격파. 카드를 위해 재대결." : duel.state === "locked" ? (trailDone(save) ? "먼저 라이벌을 꺾으세요" : "트레일 이후") : `승리하면 ${reward} 획득`, duel.state === "locked");
  }).join("");
  $("bounties").innerHTML = list.filter((duel) => duel.kind === "hunt").map((duel) => {
    const bounty = BOUNTIES.find((each) => `hunt:${each.id}` === duel.id);
    return tile(duel, duel.state === "won" ? `체포: ${TYPES[bounty.reward].name}` : duel.state === "locked" ? "트레일 이후"
      : `사냥 ${HUNTS}회 중 ${duel.cleared}회 승리. 5승하면 ${josa(TYPES[bounty.reward].name, "을")} 체포합니다.`);
  }).join("");
  const open = trailDone(save) && !save.offer;
  $("open").innerHTML = `<button type="button" data-duel="open" ${open ? "" : "disabled"}>대등한 승부${open ? "" : " (트레일 이후)"}</button>
    <button type="button" data-match="open" ${open ? "" : "disabled"}>3판 2선승, 사이드 덱 사용</button>
    <button type="button" data-two="1">2인, 한 화면</button>
    <button type="button" data-two="3">2인, 3판 2선승</button>`;
  const count = (counts) => Object.entries(counts).map(([type, copies]) => `${TYPES[type].name} ×${copies}`).join(", ");
  $("collection").innerHTML = `<strong>덱:</strong> ${count(save.deck)}.${sum(save.side) ? ` <strong>사이드 덱:</strong> ${count(save.side)}.` : ""}
    <br><strong>컬렉션:</strong> 보안관과 빌리는 무제한${sum(save.collection) ? `, ${count(save.collection)}` : ""}.`;
  $("code").value = encodeSave(save);
  $("report").value = report(log, save);
}

// ---- Deck builder ---------------------------------------------------------------------------
// With a pool (between the games of a match) only the deck and side deck cards can be moved, and nothing is saved.
function openBuilder(pool, done) {
  const source = pool ? game.match : save;
  draft = {pool, done, deck: {...source.deck}, side: {...source.side}};
  show("builder");
}
const draftProblems = () => (!draft.pool ? deckProblems(save, draft.deck, draft.side)
  : sum(draft.deck) === DECK_SIZE ? [] : [`덱은 정확히 ${DECK_SIZE}장이어야 하며 지금은 ${sum(draft.deck)}장입니다.`]);
function renderBuilder() {
  const types = Object.keys(TYPES).filter((type) => TYPES[type].side === "cowboy" && (draft.pool ? draft.pool[type] : owned(save, type) > 0));
  const limit = (type) => (draft.pool ? draft.pool[type] : Math.min(owned(save, type), RARITY[TYPES[type].rarity][1]));
  $("builder-title").textContent = draft.pool ? "게임 사이: 사이드 덱과 교체" : "덱 구성";
  $("builder-note").textContent = draft.pool ? "덱과 사이드 덱 사이에서 카드를 옮기세요. 변경은 이번 경기에만 적용됩니다."
    : `덱은 ${DECK_SIZE}장입니다. 사이드 덱은 최대 ${SIDE_SIZE}장 더 둘 수 있고, 3판 2선승의 게임 사이에 교체할 수 있습니다.`;
  $("builder-rows").innerHTML = types.map((type) => {
    const [deck, side] = [draft.deck[type] ?? 0, draft.side[type] ?? 0];
    const room = deck + side < limit(type);
    const step = (zone, by, on, text) => `<button type="button" data-zone="${zone}" data-type="${type}" data-by="${by}" ${on ? "" : "disabled"} aria-label="${text} ${TYPES[type].name}">${by > 0 ? "+" : "−"}</button>`;
    // Between games a card moves from one pile to the other, so "+" on the deck takes it from the side deck.
    return `<div class="build-row"><div class="${cardClass(type)}">${face(type, {full: true})}</div>
      <div><span class="note">덱</span>${step("deck", -1, deck > 0, "덱에서 한 장 줄이기:")} <strong>${deck}</strong> ${step("deck", 1, draft.pool ? side > 0 : room, "덱에 한 장 늘리기:")}</div>
      <div><span class="note">사이드 덱</span>${step("side", -1, side > 0, "사이드 덱에서 한 장 줄이기:")} <strong>${side}</strong> ${step("side", 1, draft.pool ? deck > 0 : room, "사이드 덱에 한 장 늘리기:")}</div>
      <span class="note">${Number.isFinite(limit(type)) ? `한도: 덱과 사이드 덱 합쳐 ${limit(type)}장` : "한도: 없음"}</span></div>`;
  }).join("");
  const problems = draftProblems();
  $("builder-problems").innerHTML = `덱 ${sum(draft.deck)}/${DECK_SIZE}장 · 사이드 덱 ${sum(draft.side)}/${SIDE_SIZE}장.${problems.length ? ` <span class="warn">${problems.join(" ")}</span>` : ""}`;
  $("builder-save").disabled = problems.length > 0;
  $("builder-save").textContent = draft.pool ? "다음 게임 시작" : "덱 저장";
  $("builder-cancel").hidden = Boolean(draft.pool);
}
function buildStep(zone, type, by) {
  const other = zone === "deck" ? "side" : "deck";
  draft[zone] = {...draft[zone], [type]: (draft[zone][type] ?? 0) + by};
  if (draft.pool) draft[other] = {...draft[other], [type]: (draft[other][type] ?? 0) - by};
  renderBuilder();
  // The rows are redrawn, which drops keyboard focus. Keep it on the same button so it can be pressed again; at a bound
  // (that button now disabled) move to the other button of the same pile, then the other pile, then Save.
  const button = (z, b) => $("builder-rows").querySelector(`[data-zone="${z}"][data-type="${type}"][data-by="${b}"]:not(:disabled)`);
  (button(zone, by) ?? button(zone, -by) ?? button(other, by) ?? button(other, -by) ?? $("builder-save")).focus();
}

// ---- Duel -----------------------------------------------------------------------------------
function say(events) {
  for (const e of events) {
    if (e.type === "turn") lines.push({turn: `${e.turn}턴: ${solo() ? (e.side === "cowboy" ? "나" : "마법사") : faction(e.side)}`});
    else if (e.type === "tribute") lines.push({text: `${whose(e.side)} ${josa(name(e.cardId), "이")} 제물로 바쳐졌습니다.`});
    else if (e.type === "summon") lines.push({text: `${whose(e.side)} ${josa(name(e.cardId), "이")} 도착했습니다.`});
    else if (e.type === "raise") lines.push({text: `부활: ${whose(e.side)} ${josa(name(e.cardId), "이")} 구슬 1개로 묘지에서 돌아왔습니다.`});
    else if (e.type === "set") lines.push({text: solo() && e.side === "cowboy" ? "함정을 뒤집어 놓았습니다." : `${josa(faction(e.side), "이")} 카드를 뒤집어 놓았습니다.`});
    else if (e.type === "gear") lines.push({text: `${whose(e.side)} ${josa(name(e.target), "이")} ${josa(name(e.cardId), "을")} 장착했습니다.`});
    else if (e.type === "location") lines.push({text: `${whose(e.side)} ${josa(name(e.cardId), "이")} 새 장소가 되었습니다.`});
    else if (e.type === "cover") lines.push({text: `${whose(e.side)} ${josa(name(e.cardId), "이")} 엄폐했습니다.`});
    else if (e.type === "draw") lines.push({text: solo() ? (e.side === "cowboy" ? "카드를 한 장 뽑았습니다." : "마법사가 카드를 한 장 뽑았습니다.") : `${josa(faction(e.side), "이")} 카드를 한 장 뽑았습니다.`});
    else if (e.type === "burn") lines.push({text: `${whose(e.side)} 손패가 가득 차서(최대 6장) ${josa(name(e.cardId), "이")} 버려졌습니다.`});
    else if (e.type === "fatigue") lines.push({text: `${whose(e.side)} 덱이 비었습니다: ${baseOf(e.side)}의 구슬 1개를 잃었습니다.`});
    else if (e.type === "spell") lines.push({text: `${whose(e.side)} ${josa(name(e.cardId), "이")} ${josa(name(e.target), "을")} 맞혔습니다: ${e.stunned ? "다음 턴 기절" : e.left === 0 ? "격파" : `구슬 ${e.left}개 남음`}.`});
    else if (e.type === "trap") lines.push({text: `함정! ${whose(e.side)} ${josa(name(e.cardId), "이")} ${josa(name(e.target), "을")} 붙잡았습니다: ${cardOf(e.cardId).effect === "hex" ? "공격이 취소됨" : e.left === 0 ? "공격 전에 격파됨" : `구슬 ${e.left}개로 줄었지만 그대로 공격함`}.`});
    else if (e.type === "laststand") lines.push({text: `최후의 저항: ${josa(name(e.cardId), "이")} ${name(e.target)}의 구슬 1개를 없앴습니다${e.left === 0 ? " (격파)" : ""}.`});
    else if (e.type === "sweep") lines.push({text: `휩쓸기: ${josa(name(e.cardId), "이")} 다른 부대 ${e.count}장에게도 1을 입혔습니다.`});
    else if (e.type === "attack") {
      const base = baseOf(opponent(e.side));
      const result = e.target === "base" ? null
        : e.targetLeft === 0 ? `격파했고${e.baseDamage ? ` ${base}에 피해 ${e.baseDamage}만큼 들어갔습니다` : e.covered ? ", 엄폐 중이라 기지에는 아무것도 닿지 않았습니다" : ""}`
        : e.covered ? `${e.targetLeft}만 남겼고 엄폐 중이라 반격하지 않았습니다`
        : !e.hitBack ? `${e.targetLeft}만 남겼고 공격력이 없어 반격하지 않았습니다`
        : `${e.targetLeft}만 남겼고 ${e.hitBack}의 피해로 반격했습니다${e.attackerLeft === 0 ? ` (${name(e.cardId)} 격파)` : ""}`;
      lines.push({text: result ? `${whose(e.side)} ${josa(name(e.cardId), "이")} ${josa(name(e.target), "을")} 공격해 ${result}.` : `${whose(e.side)} ${josa(name(e.cardId), "이")} ${base}에 ${e.baseDamage}의 피해를 입혔습니다.`});
    }
  }
}

// Solo: the Wizards take their whole turn at once. Then, once the game is over, record it.
function advance() {
  while (solo() && !state.result && state.active === "wizard") {
    const played = playTurn(state, game.duel.level);
    state = played.state;
    say(played.events);
  }
  if (!state.result || outcome) return;
  const winner = state.result.winner;
  if (solo()) keepLog(logged(log, {name: game.duel.name, won: winner === "cowboy", turns: state.turn, seconds: Math.round((Date.now() - game.started) / 1000), rules: game.rules}));
  outcome = {winner, earned: null, matchOver: true};
  if (game.match) {
    if (winner) game.match.wins[winner] += 1;
    // The loser of a game opens the next one.
    game.match.first = winner ? opponent(winner) : state.first;
    outcome.matchOver = Math.max(...Object.values(game.match.wins)) >= 2;
  }
  // A duel against the Wizards counts once it is decided: after the game, or after the match.
  if (solo() && outcome.matchOver) {
    const won = game.match ? game.match.wins.cowboy >= 2 : winner === "cowboy";
    const settled = settle(save, game.duel.id, won);
    // Which of the cards just earned went straight into the deck, and what each replaced (the Trail swaps plain cards out).
    const swaps = game.duel.kind === "trail" && won ? TRAIL[save.wins].reward : [];
    const intoDeck = swaps.map(([type, replaced]) => [type, (settled.save.deck[type] ?? 0) - (save.deck[type] ?? 0), replaced]).filter(([, copies]) => copies > 0);
    Object.assign(outcome, {won, earned: settled.earned, intoDeck, grit: Math.min(settled.save.losses[game.duel.id] ?? 0, GRIT_CAP)});
    keep(settled.save);
  }
}

function act(action) {
  const before = state.active;
  const applied = applyAction(state, action);
  state = applied.state;
  say(applied.events);
  pick = null;
  advance();
  // Two players: hide the board while the screen changes hands.
  curtain = !solo() && !state.result && state.active !== before;
  show("duel");
}

// Starts a game of the current duel. The Cowboy deck is the saved one, or the match's own copy.
function deal() {
  const options = solo() ? duelFor(save, game.duel.id, game.match?.deck ?? save.deck).options : {decks: DECKS};
  state = createShowdown(game.seed, {...options, ...(game.match?.first ? {first: game.match.first} : {})});
  lines = [{turn: `1턴: ${solo() ? (state.active === "cowboy" ? "나" : "마법사") : faction(state.active)}`}];
  pick = null;
  outcome = null;
  picked = null;
  Object.assign(game, {started: Date.now(), rules: false});
  advance();
  curtain = !solo();
  show("duel");
}
function startDuel(id, {players = 1, best = 1} = {}) {
  if (players === 1 && save.offer) return show("camp");
  const duel = players === 1 ? duelFor(save, id) : {id: "two", kind: "two", name: "2인 대결", lesson: "한 화면에서 두 사람이 각자 기본 덱으로 겨룹니다. 턴이 끝나면 화면을 넘기세요."};
  if (!duel) return;
  game = {duel, players, seed: freshSeed(), match: best > 1 ? {wins: {cowboy: 0, wizard: 0}, game: 1, deck: {...save.deck}, side: {...save.side}, first: null} : null};
  deal();
}
function nextGame() {
  game.seed = freshSeed();
  game.match.game += 1;
  // Solo, with a side deck: offer the swap before the next game.
  if (!solo() || !sum(game.match.side)) return deal();
  const pool = {};
  for (const counts of [game.match.deck, game.match.side]) for (const [type, copies] of Object.entries(counts)) pool[type] = (pool[type] ?? 0) + copies;
  openBuilder(pool, () => { Object.assign(game.match, {deck: draft.deck, side: draft.side}); deal(); });
}

const legal = () => legalActions(state);
const playsOf = (cardId) => legal().filter((a) => a.cardId && name(a.cardId) === name(cardId));

function clickCard(cardId) {
  const options = playsOf(cardId);
  // A trap, a location, an untargeted spell or a free troop has one way to be played.
  if (options.length === 1 && options[0].target === undefined && options[0].slot === undefined && !options[0].tributes?.length) return act(options[0]);
  pick = cardOf(cardId).kind === "troop" ? {card: cardId, tributes: []} : {card: cardId};
  renderDuel();
}
function clickOwn(slot) {
  if (pick?.tributes) {
    const paid = pick.tributes.includes(slot) ? pick.tributes.filter((s) => s !== slot) : [...pick.tributes, slot].sort();
    const done = playsOf(pick.card).find((a) => a.tributes.join() === paid.join());
    if (done) return act(done);
    pick = {...pick, tributes: paid};
  } else if (pick?.card) {
    const gear = playsOf(pick.card).find((a) => a.type === "gear" && a.slot === slot);
    if (gear) return act(gear);
  } else if (legal().some((a) => (a.type === "attack" || a.type === "cover") && a.slot === slot)) pick = {troop: slot};
  renderDuel();
}
function clickEnemy(target) {
  if (pick?.troop !== undefined) return act({type: "attack", slot: pick.troop, target});
  const cast = pick?.card && playsOf(pick.card).find((a) => a.target === target);
  if (cast) act(cast);
}

// Why a card in hand cannot be played right now, so a greyed card always says why.
function blocked(cardId) {
  const card = cardOf(cardId);
  if (state.attacking) return "이번 턴에는 더 낼 수 없습니다: 부대가 이미 행동했습니다.";
  if (card.kind === "troop") {
    if (state.summonUsed) return "부대는 한 턴에 1장입니다.";
    const cost = tributes(cardId);
    return state.sides[me()].board.filter(Boolean).length < cost ? `내 부대 ${cost}장이 비용으로 필요합니다.` : "내 판이 가득 찼습니다.";
  }
  if (card.kind === "trap") return state.setUsed ? "함정은 한 턴에 1장입니다." : "함정 칸 두 개가 모두 찼습니다.";
  if (state.castUsed) return "주문, 장비, 장소는 한 턴에 1장입니다.";
  return card.kind === "location" ? "이미 이 장소입니다." : card.kind === "gear" ? "장비를 들 부대가 없습니다." : "대상이 없습니다.";
}

// What an attack from the picked troop would do to this target, in words. Face-down traps are not counted.
function preview(target) {
  const o = attackOutcome(state, pick.troop, target);
  const foe = state.sides[opponent(me())];
  if (target === "base") return `<span class="note good">${foe.board.some(Boolean) ? "돌파: " : ""}기지에 ${o.baseDamage} 피해</span>`;
  const lastStand = o.targetLeft === 0 && cardOf(foe.board[target].cardId).keys.includes("laststand") ? ". 상대의 최후의 저항으로 내 구슬 1개를 잃습니다" : "";
  if (o.targetLeft === 0) return `<span class="note good">격파${o.baseDamage ? `, 기지에 ${o.baseDamage} 관통` : foe.board[target].cover ? ", 기지에는 닿지 않음" : ""}${lastStand}</span>`;
  if (foe.board[target].cover) return `<span class="note">구슬 ${o.targetLeft}개로 생존. 엄폐 중이라 반격하지 않습니다.</span>`;
  if (attackOf(state, foe.board[target]) === 0) return `<span class="note">구슬 ${o.targetLeft}개로 생존. 공격력이 없어 내 부대는 무사합니다.</span>`;
  return `<span class="note ${o.attackerLeft === 0 ? "warn" : ""}">구슬 ${o.targetLeft}개로 생존하고 반격: 내 부대는 ${o.attackerLeft === 0 ? "격파됨" : `구슬 ${o.attackerLeft}개로 줄어듦`}</span>`;
}

// What the "again" button does next, in words.
function againLabel() {
  if (!state.result) return "이 대결 다시 시작";
  if (!outcome.matchOver) return `${game.match.game + 1}번째 게임`;
  if (!solo()) return "다시 하기";
  if (!outcome.won) return "재대결";
  return game.duel.kind === "trail" || !duelFor(save, game.duel.id) ? "캠프로 돌아가기" : "다시 하기";
}
// Why one of your troops can take cover but not attack, in a few words (see canAttack in rules.js).
const whyResting = (troop) => state.turn === 1 ? "첫 턴" : troop.stunned ? "기절"
  : troop.arrived === state.turn && !troop.ready ? "방금 도착" : attackOf(state, troop) <= 0 ? "공격력 없음" : "";

function renderDuel() {
  const focused = $("duel").contains(document.activeElement) ? focusKey(document.activeElement) : null;
  drawDuel();
  if (focused && !$("duel").hidden && !$("duel").contains(document.activeElement)) refocus(focused);
}
function drawDuel() {
  const mine = !state.result && (!solo() || state.active === "cowboy");
  const [own, foe] = [me(), opponent(me())];
  const attacking = pick?.troop !== undefined;
  const kind = pick?.card ? cardOf(pick.card).kind : null;
  const options = mine ? legal() : [];
  // Enemy troops and Base the current pick may be aimed at, and own troops a picked card may go on.
  const aims = new Set(attacking ? options.filter((a) => a.type === "attack" && a.slot === pick.troop).map((a) => a.target) : kind === "spell" ? playsOf(pick.card).map((a) => a.target) : []);
  const carriers = new Set(kind === "gear" ? playsOf(pick.card).map((a) => a.slot) : []);
  // The board is drawn from what this player may see, so the other hand, traps and both deck orders never reach the page.
  const view = viewFor(state, own);
  const shared = !solo() && Boolean(state.result);
  const row = (side) => {
    const s = view.sides[side];
    const isOwn = side === own;
    const baseOpen = !isOwn && aims.has("base");
    const traps = isOwn && !shared ? (s.traps.length ? `놓음: ${s.traps.map(name).join(", ")}` : "함정 없음") : s.trapCount ? `뒤집힌 카드 ${s.trapCount}장` : "뒤집힌 카드 없음";
    const base = `<button type="button" class="base ${side}${baseOpen ? " can" : ""}" ${baseOpen ? 'data-enemy="base"' : "disabled"}>
      <strong>${solo() ? (isOwn ? "내" : "마법사") : faction(side)} 기지</strong>${orbs(s.base, s.baseMax)}
      <span class="note">손패 ${s.handCount} · 덱 ${s.deckCount} · 묘지 ${s.discard.length}</span>
      ${(isOwn ? s.traps.length || s.hand.some((id) => cardOf(id).kind === "trap") : s.trapCount) ? `<span class="note">▲ ${traps}</span>` : ""}${baseOpen ? preview("base") : ""}</button>`;
    const slots = s.board.map((troop, slot) => {
      if (!troop) return `<button type="button" class="slot ${side}" disabled><span class="note">비어 있음</span></button>`;
      const card = cardOf(troop.cardId);
      let cls = "", data = "disabled", note = troop.cover ? "엄폐 중" : troop.stunned ? "기절" : "";
      if (isOwn && mine) {
        const tribute = pick?.tributes && playsOf(pick.card).some((a) => a.tributes.includes(slot));
        const ready = canAttack(state, troop);
        const actable = options.some((a) => (a.type === "attack" || a.type === "cover") && a.slot === slot);
        if (tribute) { cls = pick.tributes.includes(slot) ? " chosen" : " can"; data = `data-own="${slot}"`; note = "제물"; }
        else if (carriers.has(slot)) { cls = " can"; data = `data-own="${slot}"`; note = "장비 장착"; }
        else if (pick?.troop === slot) { cls = " pick"; note = ready ? "대상을 고르거나 엄폐하세요" : "엄폐할 수 있습니다"; }
        else if (!pick && actable) { cls = " can"; data = `data-own="${slot}"`; note = ready ? "공격 가능" : [whyResting(troop), "엄폐 가능"].filter(Boolean).join(" · "); }
        else if (troop.attacked && !troop.cover) note = "공격함";
      } else if (!isOwn && aims.has(slot)) {
        cls = " can"; data = `data-enemy="${slot}"`;
        if (kind === "spell") note = cardOf(pick.card).effect === "tie" ? "기절하게 됨" : troop.health === 1 ? "격파됨" : `구슬 ${troop.health - 1}개로 줄어듦`;
      }
      const attack = attackOf(state, troop);
      return `<button type="button" class="slot ${side}${cls}" ${data}><strong>${card.name}</strong><span class="type">${MARK.troop} 부대 · ${TAGKO[card.tag] ?? card.tag}</span>
        공격 ${attack}${attack !== card.attack ? ` (+${attack - card.attack})` : ""} ${orbs(troop.health, card.health)} ${keywords(card)}
        ${troop.gear.length ? `<span class="note">◆ ${troop.gear.map(name).join(", ")}</span>` : ""}${note ? `<span class="note">${note}</span>` : ""}${!isOwn && attacking && aims.has(slot) ? preview(slot) : ""}</button>`;
    }).join("");
    return `<div class="side">${base}${slots}</div>`;
  };
  $("board").innerHTML = row(foe) + row(own);
  const landing = state.arrivals.map((due) => `${josa(TYPES[due.type].name, "이")} ${Math.max(due.turn, state.turn + (state.active === due.side ? 2 : 1))}턴 시작에 도착합니다.`).join(" ");
  $("location").textContent = landing + (landing && state.location ? " " : "") + (state.location ? `■ 장소: ${name(state.location.cardId)} (${whose(state.location.side)}). ${EFFECTS[cardOf(state.location.cardId).effect].text.replace("장소. ", "")}` : "");

  const playable = new Set(options.filter((a) => a.cardId).map((a) => name(a.cardId)));
  $("hand").innerHTML = (shared ? [] : view.sides[own].hand).map((cardId) => {
    const card = cardOf(cardId);
    const on = playable.has(card.name);
    return `<button type="button" class="card ${card.side} ${card.kind} ${card.rarity}${pick?.card === cardId ? " pick" : on ? " can" : ""}" data-card="${cardId}" ${on ? "" : "disabled"}>
      ${face(cardId.replace(/-\d+$/, ""), {extra: mine && !on ? `<span class="note warn">${blocked(cardId)}</span>` : ""})}</button>`;
  }).join("");

  const r = state.result;
  const match = game.match;
  const score = match ? ` · 3판 중 ${match.game}번째 · ${solo() ? `나 ${match.wins.cowboy}, 마법사 ${match.wins.wizard}` : `카우보이 ${match.wins.cowboy}, 마법사 ${match.wins.wizard}`}` : "";
  const verdict = !r ? "" : r.winner === null ? "무승부." : solo() ? (r.winner === "cowboy" ? "승리: 마법사 기지가 무너졌습니다." : "패배: 내 기지가 무너졌습니다.") : `${faction(r.winner)} 승리: ${baseOf(opponent(r.winner))}가 무너졌습니다.`;
  write($("status"), r ? `<span class="result ${!solo() || r.winner === "cowboy" ? "good" : "warn"}">${verdict}</span>${score}`
    : `${game.duel.name}${score} · ${state.turn}턴 · ${solo() ? "내 차례" : `${faction(state.active)}의 차례`}`);

  // After a win: what it paid, then the two cards to choose from. After a loss: what the rematch gives.
  // Each part has its own box, so taking a card changes (and announces) only the choice.
  const earned = outcome?.earned;
  // A game inside a match and a two-player game pay nothing, but they still need the button that moves on.
  const moveOn = `<div class="row"><button type="button" class="can" data-again="1">${state.result ? againLabel() : ""}</button></div>`;
  const parts = !outcome ? [] : !earned ? [moveOn] : [
    earned.captured ? `<h2>체포</h2><div class="row"><div class="${cardClass(earned.captured)} earned">${face(earned.captured, {full: true})}</div></div>` : "",
    earned.cards.length ? `<h2>컬렉션에 추가됨</h2><div class="row">${earned.cards.map(([type, copies]) => `<div class="${cardClass(type)} earned">${face(type, {full: true, extra: copies > 1 ? `<span class="note">×${copies}</span>` : ""})}</div>`).join("")}</div>` : "",
    earned.packs ? `<p class="good">팩 ${earned.packs}개를 얻었습니다. 캠프에서 여세요.</p>` : "",
    outcome.intoDeck.length ? `<p class="note">현재 덱: ${outcome.intoDeck.map(([type, copies, replaced]) => `${josa(`${TYPES[replaced].name} ×${copies}`, "을")} ${josa(`${TYPES[type].name} ×${copies}`, "으로")} 교체`).join(", ")}.</p>` : "",
    earned.cards.length && !outcome.intoDeck.length ? `<p class="note">컬렉션에는 있지만 아직 덱에는 없습니다. 캠프의 덱 구성을 쓰세요.</p>` : "",
    // The offer and the line that confirms the choice share one part, so choosing rewrites only that part.
    outcome.won && save.offer ? `<h2>${OFFER_HEADING}</h2>${offerRow()}`
      : picked ? `<p class="good">${TYPES[picked].name} 추가: 이제 ${owned(save, picked)}장을 갖고 있습니다. 새 카드는 아직 덱에 없습니다. 캠프의 덱 구성을 쓰세요.</p>` : "",
    !outcome.won && outcome.grit ? `<p class="note">근성: 재대결에서 내 기지는 구슬 ${5 + outcome.grit}개로 시작합니다.</p>` : "",
    moveOn,
  ];
  // Each part has its own box, so taking a card changes (and announces) only the choice.
  const boxes = [...$("reward").children];
  parts.forEach((html, i) => write(boxes[i] ?? $("reward").appendChild(document.createElement("div")), html));
  boxes.slice(parts.length).forEach((box) => box.remove());

  const canCover = attacking && options.some((a) => a.type === "cover" && a.slot === pick.troop);
  const guarded = state.sides[foe].board.some((troop) => troop && cardOf(troop.cardId).keys.includes("guard"));
  write($("prompt"), r ? "" : pick?.tributes ? `${josa(name(pick.card), "을")} 내기 위한 비용으로 묘지에 보낼 내 부대 ${tributes(pick.card)}장을 고르세요.`
    : kind === "gear" ? `${josa(name(pick.card), "을")} 들고 갈 내 부대를 하나 고르세요.`
    : kind === "spell" ? `${name(pick.card)}의 대상으로 적 부대를 고르세요.`
    : attacking ? `${aims.size === 0 ? "이 부대는 지금 공격할 수 없습니다." : guarded ? "수호병이 길을 막고 있습니다. 먼저 수호병을 공격하세요." : aims.has("base") && aims.size === 1 ? "적 부대가 없습니다. 기지를 공격하세요." : "공격할 대상을 고르세요."}${
      canCover ? " 또는 엄폐하세요. 다음 턴까지 초과 피해가 기지에 들어가지 않지만 반격도 하지 않습니다." : ""}`
    : state.attacking ? "이번 턴에는 더 낼 수 없습니다. 다른 부대로 행동하거나 턴을 끝내세요."
    : state.turn === 1 ? "카드를 내세요. 부대는 한 턴에 1장입니다. 첫 턴에는 아무도 공격하지 않습니다."
    : "먼저 카드(부대 1장, 그 밖의 카드 1장)를 내고, 그다음 부대로 행동하세요. 부대가 행동하면 이번 턴에는 더 낼 수 없습니다.", "textContent");
  $("end").hidden = Boolean(r);
  $("end").disabled = !mine;
  $("cover").hidden = !canCover;
  $("cancel").hidden = !pick;
  // After a result the button that moves on sits under the reward; the row here keeps only "캠프로 돌아가기".
  $("again").hidden = Boolean(r);
  $("again").textContent = againLabel();
  $("lesson").textContent = game.duel.lesson;
  $("log").innerHTML = lines.map((l) => (l.turn ? `<li class="turn">${l.turn}</li>` : `<li>${l.text}</li>`)).join("");
  $("log").scrollTop = $("log").scrollHeight;
  for (const side of ["cowboy", "wizard"]) $(`${side}-graveyard`).textContent = state.sides[side].discard.map(name).join(", ") || "비어 있음";
  // Only the keywords on cards in this duel, so a new player reads a short list.
  // This list names keywords, never cards, and both decks are known lists, so reading the whole state here shows nothing hidden.
  const cards = ["cowboy", "wizard"].flatMap((side) => [...state.sides[side].hand, ...state.sides[side].deck, ...state.sides[side].discard, ...state.sides[side].board.filter(Boolean).map((troop) => troop.cardId)]);
  const inPlay = new Set(cards.flatMap((cardId) => cardOf(cardId).keys ?? []));
  $("keywords").innerHTML = Object.entries(KEYWORDS).filter(([key]) => inPlay.has(key)).map(([, [word, rule]]) => `<li><strong>${word}.</strong> ${rule}</li>`).join("")
    || "<li>이 대결에는 아직 키워드가 없습니다.</li>";
}

// ---- Clicks ---------------------------------------------------------------------------------
document.addEventListener("click", (event) => {
  const b = event.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (d.choose) {
    // The offer is redrawn away, so focus moves on: to the button that moves on in the duel, else to what Camp offers next.
    picked = d.choose;
    keep(choose(save, d.choose));
    show(screen);
    (screen === "duel" ? $("reward").querySelector("[data-again]") : $("claim").querySelector("button") ?? $("camp").querySelector("[data-duel]:not(:disabled)"))?.focus();
  }
  else if (d.again) again();
  else if (d.duel) startDuel(d.duel);
  else if (d.match) startDuel(d.match, {best: 3});
  else if (d.two) startDuel("two", {players: 2, best: Number(d.two)});
  else if (d.zone) buildStep(d.zone, d.type, Number(d.by));
  else if (d.card) clickCard(d.card);
  else if (d.own) clickOwn(Number(d.own));
  else if (d.enemy) clickEnemy(d.enemy === "base" ? "base" : Number(d.enemy));
  else if (b.id === "pack" || (b.id === "pack-done" && save.packs)) { const pack = openPack(save); opened = pack.cards; keep(pack.save); renderCamp(); }
  else if (b.id === "pack-done") { opened = null; renderCamp(); }
});
$("build").addEventListener("click", () => openBuilder(null, () => { keep(withDeck(save, draft.deck, draft.side)); show("camp"); }));
$("builder-save").addEventListener("click", () => draft.done());
$("builder-cancel").addEventListener("click", () => show("camp"));
$("end").addEventListener("click", () => act({type: "end"}));
$("cover").addEventListener("click", () => act({type: "cover", slot: pick.troop}));
$("cancel").addEventListener("click", () => { pick = null; renderDuel(); });
$("ready").addEventListener("click", () => { curtain = false; show("duel"); });
$("leave").addEventListener("click", () => { curtain = false; show("camp"); });
$("build").addEventListener("click", () => { picked = null; });
// Before a result this replays the same deal. After one it is the next game, the rematch, or the way back.
function again() {
  if (!state.result) return deal();
  if (!outcome.matchOver) return nextGame();
  if (!solo()) return startDuel("two", {players: 2, best: game.match ? 3 : 1});
  // A Trail win moves on, and a finished bounty is gone: go back to camp to see what opened.
  if (outcome.won && (game.duel.kind === "trail" || !duelFor(save, game.duel.id))) return show("camp");
  startDuel(game.duel.id, {best: game.match ? 3 : 1});
}
$("again").addEventListener("click", again);
// A pasted code is read strictly, and a different save replaces this one only after Replace is pressed.
// The preview belongs to the exact text it was read from: any edit withdraws it, and Replace re-checks the text.
let pending = null;
function closePreview() { pending = null; $("code-preview").hidden = true; }
$("code").addEventListener("input", () => {
  if (!pending) return;
  closePreview();
  $("code-note").textContent = "코드가 바뀌어 미리보기를 닫았습니다. 불러오기를 눌러 다시 미리 보세요. 아무것도 바뀌지 않았습니다.";
});
$("load").addEventListener("click", () => {
  closePreview();
  const read = decodeSaveCode($("code").value);
  if (!read.ok) { $("code-note").textContent = `${read.reason} 아무것도 바뀌지 않았습니다.`; return; }
  if (sameSave(read.save, save)) { $("code-note").textContent = "이 코드는 이미 가진 진행 상황과 같습니다. 아무것도 바뀌지 않았습니다."; return; }
  pending = {save: read.save, text: $("code").value};
  $("code-preview-text").textContent = `이 코드${read.legacy ? "(이전 버전)" : ""}의 내용: ${describeSave(read.save)} 현재 내용: ${describeSave(save)} 이 브라우저의 진행 상황을 이것으로 교체할까요?`;
  $("code-preview").hidden = false;
  $("code-note").textContent = "";
  $("code-cancel").focus();
});
$("code-cancel").addEventListener("click", () => { closePreview(); $("code-note").textContent = "취소했습니다. 아무것도 바뀌지 않았습니다."; $("load").focus(); });
$("code-replace").addEventListener("click", () => {
  if (!pending) return;
  const {save: next, text} = pending;
  closePreview();
  if ($("code").value !== text) { $("code-note").textContent = "코드가 바뀌어 미리보기를 닫았습니다. 불러오기를 눌러 다시 미리 보세요. 아무것도 바뀌지 않았습니다."; return; }
  const saved = keep(next); opened = picked = null; renderCamp();
  $("code-note").textContent = saved ? "불러왔습니다." : "이번 방문에서만 불러왔습니다. 브라우저가 저장하지 않았습니다.";
  $("load").focus();
});
$("rules").addEventListener("toggle", () => { if ($("rules").open && game) game.rules = true; });
$("reset").addEventListener("click", () => {
  if (!confirm("처음부터 시작할까요? 이 브라우저의 카드, 진행 상황, 플레이테스트 보고서가 지워집니다.")) return;
  closePreview();
  keep(newSave());
  keepLog([]);
  opened = picked = null;
  renderCamp();
  $("code-note").textContent = "처음부터 시작했습니다.";
});
show("camp");
