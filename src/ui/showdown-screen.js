// The Showdown duel in the graybox (issue 143 slices 1 and 2). Adapted from the reference screen in
// prototypes/showdown/main.js, solo only. Everything drawn comes from session.view() (viewFor),
// session.legal() (legalActions for this seat) and presentEvent text. The full state never
// reaches this module, and no Wizard hand, trap or deck card id is written into the page.
// Slice 2: a finished duel is settled once through the campaign (src/match/showdown-campaign.js),
// and the result shows what it paid and the card choice before the way back to Camp.
// Slice 3: every Camp duel (Trail, rivals, Wanted hunts, the even match), best of three with the
// side-deck swap between games (src/match/showdown-match.js), and two players on one screen. With
// two players the board is drawn from the active seat's view only, and a curtain hides the whole
// table, with no hand or trap in the page, while the screen changes hands.
// Wizard seat (for the proposed Wizard campaign, docs/design/showdown-wizard-campaign-brief.md): start(..., {seat:
// "wizard"}) gives the human the Wizards against the bot's Cowboys. It settles only through a campaign passed to
// that start, never through the mount's (Cowboy) campaign, and adds no playtest line.
import {EFFECTS, KEYWORDS, RARITY, TYPES, cardOf, has, tributes, typeOf} from "../game/showdown/cards.js";
import {presentEvent} from "../game/showdown/presenter.js";
import {newRunId} from "../match/showdown-playtest.js";
import {TRAP_SLOTS, attackOf, attackOutcome, canAttack, opponent} from "../game/showdown/rules.js";
import {createShowdownSession} from "../match/showdown-session.js";
import {matchOver, matchWinner, newMatch, nextGame, offersSwap, recordGame, swapPool, withSwap} from "../match/showdown-match.js";
import {createCuePlayer, cuesFor} from "./showdown-cues.js";
import {FRAMES} from "./card-frames.js";
import {lessonSetup} from "./wizard-lesson.js";

const name = (cardId) => cardOf(cardId).name;
const plural = (n, word) => `${({orb: "오브", troop: "부대", card: "카드", pack: "팩"})[word] ?? word} ${n}`;
const orbs = (now, max) => `<span class="sd-orbs" role="img" aria-label="오브 ${Math.max(now, max)}개 중 ${now}개">${"●".repeat(now)}<span class="sd-lost">${"○".repeat(Math.max(0, max - now))}</span></span>`;
// Troop, spell and trap use the pull request 139 frames; gear and location add the reference screen's marks.
const FRAME = {...FRAMES, gear: {mark: "◆", line: "장비"}, location: {mark: "■", line: "장소"}};
const typeLine = (card) => `<span class="sd-type">${FRAME[card.kind].mark} ${card.kind === "troop" ? `부대 · ${({Lawman: "법 집행관", Outlaw: "무법자", Beast: "야수", Undead: "언데드", Rig: "탈것", Mage: "마법사", Fiend: "마귀"})[card.tag] ?? card.tag}` : FRAME[card.kind].line} · ${RARITY[card.rarity][0]}</span>`;
const keywords = (card) => (card.keys ?? []).map((key) => `<span class="sd-key" title="${KEYWORDS[key][1]}">${KEYWORDS[key][0]}</span>`).join(" ");
function costLine(type) {
  const cost = tributes(`${type}-1`);
  if (cost) return `비용: 내 부대 ${cost}개를 묘지로 보냅니다. 등장한 턴에 공격합니다.`;
  return TYPES[type].keys.includes("quickdraw") ? "비용: 없음." : "비용: 없음. 등장한 턴에는 쉽니다.";
}
export function face(type, extra = "") {
  const card = TYPES[type];
  const rules = card.kind !== "troop" ? EFFECTS[card.effect].text : "";
  return `<strong>${card.name}</strong>${typeLine(card)}${card.kind === "troop" ? `공격 ${card.attack} · ${plural(card.health, "orb")} ${keywords(card)}` : ""}
    ${rules ? `<span class="sd-note">${rules}</span>` : ""}${card.kind === "troop" ? `<span class="sd-note">${costLine(type)}</span>` : ""}${extra}`;
}

const TEMPLATE = `
  <header><h1>쇼다운</h1><button id="sd-home" type="button">캠프로 돌아가기</button></header>
  <section id="sd-curtain" aria-label="화면 넘기기" hidden>
    <p id="sd-curtain-text"></p>
    <button type="button" id="sd-ready">준비됐어요</button>
  </section>
  <div id="sd-table">
  <p id="sd-lesson"></p>
  <p id="sd-status" role="status"></p>
  <p id="sd-feedback" aria-live="polite"></p>
  <p id="sd-cue" aria-hidden="true"></p>
  <div id="sd-result"></div>
  <p id="sd-location" class="sd-note"></p>
  <div id="sd-field"><section id="sd-board" aria-label="보드"></section></div>
  <p id="sd-prompt"></p>
  <div class="sd-row" id="sd-actions">
    <button type="button" id="sd-end">턴 종료</button>
    <button type="button" id="sd-boot-hill" hidden>부트 힐로 계속</button>
    <button type="button" id="sd-cover" hidden>엄폐</button>
    <button type="button" id="sd-cancel" hidden>취소</button>
    <button type="button" id="sd-restart">이 대결 다시 시작</button>
  </div>
  <section id="sd-hand" aria-label="내 패"></section>
  <section aria-label="진행 기록"><h2>진행 기록</h2><ol id="sd-log"></ol></section>
  <section aria-label="묘지"><h2>묘지</h2>
    <p class="sd-note">카우보이: <span id="sd-cowboy-graveyard"></span></p>
    <p class="sd-note">마법사: <span id="sd-wizard-graveyard"></span></p>
  </section>
  <section aria-label="키워드"><h2>키워드</h2><ul id="sd-keywords"></ul></section>
  </div>`;

export const OFFER_HEADING = "보너스: 보관할 카드를 한 장 더 고르세요";
export const offerRow = (offer, owned) => `<div class="sd-row">${offer.map((type) => `<button type="button" class="sd-card ${TYPES[type].side} ${TYPES[type].rarity} sd-can" data-frame="${TYPES[type].kind}" data-choose="${type}">
  ${face(type, `<span class="sd-note">보유: ${owned(type)}장.</span>`)}</button>`).join("")}</div>`;
export const pays = (cards) => cards.map(([type, copies]) => `${TYPES[type].name}${copies > 1 ? ` ×${copies}` : ""}`).join(", ");

const FACTION = {cowboy: "카우보이", wizard: "마법사"};

// campaign: the Cowboy seat's campaign. settle(duel, won) once per decided solo duel, choose(type), progress(), owned(type), trailDuel(),
// duel(id, deck) for any Camp duel. playtest (optional): add(entry) once per finished solo game.
// nextSeed() deals each later game (the next game of a match, a repeat, two players again); a Rematch
// after a loss is a fresh deal. onSwap(pool, deck, side, done) opens the between-games side-deck swap.
// cueOptions go to createCuePlayer (showdown-cues.js); only a check sets them, to shorten the step.
// Wizard lesson (src/ui/wizard-lesson.js): onReview(record) opens the lesson for a finished single solo Cowboy duel;
// record is {seed, setup, cowboyActions, expected}. start(duel, seed, {lesson: {createSession}}) plays a lesson rematch
// (duel.kind "lesson"): it settles nothing and logs nothing, and onLessonBack() returns to the lesson.
export function mountShowdown(root, {onHome, campaign, writeCamp = (change) => change(), playtest, cueOptions, nextSeed = freshSeed, onSwap, mountBoard, onReview, onLessonBack, onBootHill}) {
  root.innerHTML = TEMPLATE;
  const $ = (id) => root.querySelector(`#${id}`);
  let session, duel, seed, lines, latest, pick, outcome, picked, run, started, challengeAttacked = false, playbackIdle = true;
  // The lesson record of the current game: its frozen setup and the Cowboy's actions in order. lesson: a rematch's session factory.
  let setup = null, cowboyActions = [], lesson = null;
  // seat: the solo player's side. camp: the campaign this duel settles through, or null (nothing is settled).
  let players = 1, match = null, curtain = false, seat = "cowboy", camp = campaign;
  let settling = false;
  const cues = createCuePlayer(root, cueOptions);
  const boardPresentation = mountBoard?.(root);
  const solo = () => players === 1;
  // A Wizard lesson reviews one single solo game of the Cowboy seat against the ordinary bot: not a game of a best of
  // three, two players, the Wizard seat, or a lesson rematch (whose Wizard may not be the ordinary one).
  const reviewable = (current) => Boolean(onReview) && solo() && seat === "cowboy" && !match && !lesson && current.kind !== "lesson";
  const viewer = () => session.viewer();
  // Solo wording speaks to the player; two players are named by faction.
  const whoseBase = (side) => (solo() && side === viewer() ? "내" : FACTION[side]);
  const sides = (side) => FACTION[side];

  // Logs a batch of events and returns its placeholder cues, each tied to its log line.
  function record(events, before) {
    latest = events.map((event) => presentEvent(event));
    const first = lines.length;
    for (const [i, event] of events.entries()) lines.push({turn: event.type === "turn", text: latest[i]});
    const batch = cuesFor(events, before, session.view()).map((cue) => ({...cue, line: first + cue.index}));
    for (const cue of batch) lines[cue.line].cue = cue.kind;
    return batch;
  }
  // best 3 plays a best of three. players 2: two people on one screen, starter decks, nothing saved.
  // seat "wizard" (solo): the human plays the Wizards. Its campaign, if any, comes with this start; without one the
  // Wizard seat settles nothing. The Cowboy seat keeps the mount's campaign unless another is passed.
  function start(nextDuel, dealSeed, {players: seats = 1, best = 1, seat: side = "cowboy", campaign: own, lesson: rematch = null} = {}) {
    [duel, players, seat] = [nextDuel, seats, seats === 1 ? side : "cowboy"];
    lesson = rematch && seats === 1 && seat === "cowboy" && best === 1 ? rematch : null;
    camp = lesson ? null : own ?? (seat === "cowboy" ? campaign : null);
    const progress = solo() ? camp?.progress() : null;
    match = best > 1 ? newMatch(progress ? {deck: progress.deck, side: progress.side} : {}) : null;
    deal(dealSeed);
  }
  // One game: of a single duel, or the current game of a match (the match's deck, the loser opening).
  function deal(dealSeed) {
    seed = dealSeed;
    const current = solo() && match && camp ? camp.duel(duel.id, match.deck) ?? duel : duel;
    // The lesson record is taken before the deal, from the duel as it is dealt (grit and all), and frozen. It is null
    // when the duel cannot be trained (wizard-lesson.js lessonSetup: level-2 Wizard, no landing bosses).
    setup = reviewable(current) ? lessonSetup(current, seed) : null;
    cowboyActions = [...(current.prefix ?? [])];
    session = lesson ? lesson.createSession() : createShowdownSession({seed, duel: current, players, seat, ...(match?.first ? {first: match.first} : {})});
    curtain = !solo();
    lines = [{turn: true, text: `1턴: ${session.view().first === "cowboy" ? "카우보이" : "마법사"} 차례.`}];
    latest = [];
    pick = null;
    outcome = null;
    picked = null;
    run = newRunId();
    started = Date.now();
    challengeAttacked = false;
    playbackIdle = true;
    cues.clear();
    boardPresentation?.clear();
    boardPresentation?.setBattlefield?.(current.battlefield);
    const batch = record(session.opening, null);
    finish(() => {
      render();
      // An experiment turn opens on its decision: its replayed history is in the log, not played as cues.
      cues.play(duel.prefix ? [] : batch);
    });
  }
  function act(action) {
    pick = null;
    const [before, seat] = [session.view(), viewer()];
    const trace = [];
    const events = session.act(action, boardPresentation ? (step) => trace.push(step) : undefined);
    if (action.type === "attack") challengeAttacked = true;
    if (setup) cowboyActions.push(structuredClone(action));
    const batch = record(events, before);
    finish(() => {
      // Two players: hide the table while the screen changes hands.
      curtain = !solo() && !session.view().result && viewer() !== seat;
      const canAnimate = !curtain && Boolean(boardPresentation?.animate);
      playbackIdle = !canAnimate;
      const activeRun = run;
      render(trace[0]?.before);
      cues.play(batch);
      if (canAnimate) {
        boardPresentation.animate(trace, () => {
          if (run !== activeRun) return;
          playbackIdle = true;
          $("sd-boot-hill").hidden = !("contestChallenge" in root.dataset && onBootHill && campaign?.trailDuel?.()?.battlefield === "boot-hill" && challengeAttacked && playbackIdle);
        });
      }
    });
  }
  // A game counts once it ends; a solo duel is settled exactly once, when it (or its match) is decided.
  function finish(present) {
    const view = session.view();
    const result = view.result;
    if (!result || outcome) return present();
    outcome = {winner: result.winner, matchOver: true};
    if (match) {
      match = recordGame(match, {winner: result.winner, first: view.first});
      outcome.matchOver = matchOver(match);
    }
    // Two players, an experiment turn (showdown-turn.js) and a Wizard lesson rematch settle nothing and add no playtest line.
    if (!solo() || duel.kind === "turn" || duel.kind === "lesson") return present();
    // The run id makes the log ignore a second report of this same finished game. The log is the Cowboy career's.
    const logGame = () => {
      if (seat === "cowboy") playtest?.add({name: duel.name, won: result.winner === session.seat, turns: view.turn,
        seconds: Math.round((Date.now() - started) / 1000), rules: false, run, duel: duel.id, seed});
    };
    const won = match ? matchWinner(match) === session.seat : result.winner === session.seat;
    if (!camp || camp !== campaign) {
      logGame();
      if (camp && outcome.matchOver) Object.assign(outcome, camp.settle(duel, won));
      return present();
    }
    // A duel can end in a tab that was left open. Show its verdict after the save decision,
    // so no reward is announced or made claimable before the career has accepted it.
    settling = true;
    $("sd-end").disabled = true;
    $("sd-status").textContent = "대결 결과 저장 중…";
    const complete = (payment) => {
      settling = false;
      Object.assign(outcome, payment);
      const hadFocus = root.contains(document.activeElement);
      present();
      if (hadFocus && document.activeElement === document.body) usable("#sd-result button", "#sd-home")?.focus();
    };
    return writeCamp(() => {
      logGame();
      complete(outcome.matchOver ? camp.settle(duel, won) : {});
    }, (message) => complete({won, conflict: message}));
  }
  // After a result: the next game of the match, a rematch, a repeat, or nothing (back to camp).
  function againLabel() {
    if (!outcome.matchOver) return `${match.game + 1}번째 게임`;
    if (duel.kind === "turn") return "재도전";
    if (duel.kind === "lesson") return "같은 패로 다시";
    if (!solo()) return duel.kind === "earned" ? "재대결: 얻은 덱으로, 동등한 대결 아님" : "다시 플레이";
    if (!outcome.won) return repeat() ? "재대결" : null;
    return duel.kind === "trail" || !repeat() ? null : "한 번 더";
  }
  // The same Camp duel again, as progress now has it (the next hunt, grit after a loss), or null.
  const repeat = () => (!camp ? null : duel.kind === "trail" ? camp.trailDuel() : duel.id ? camp.duel(duel.id) : null);
  function again() {
    const best = match ? 3 : 1;
    if (!outcome.matchOver) {
      match = nextGame(match);
      // Solo, with a side deck: the swap comes before the next game.
      if (solo() && offersSwap(match) && onSwap) {
        return onSwap(swapPool(match), match.deck, match.side, (deck, side) => { match = withSwap(match, deck, side); deal(nextSeed()); });
      }
      return deal(nextSeed());
    }
    // Two players again with the same decks (the starter decks, or the earned decks of showdown-earned.js).
    if (!solo()) return start(duel, nextSeed(), {players: 2, best});
    if (duel.kind === "turn" || duel.kind === "lesson") return deal(seed);
    // A loss is a fresh deal of the same duel; a repeat (a beaten rival, the next hunt, the even match) uses nextSeed.
    const next = repeat();
    if (next) start(next, outcome.won ? nextSeed() : freshSeed(), {best, seat, campaign: camp});
  }
  const playsOf = (cardId) => session.legal().filter((a) => a.cardId && name(a.cardId) === name(cardId));

  function clickCard(cardId) {
    const options = playsOf(cardId);
    if (!options.length) return;
    // A trap, a location, an untargeted spell or a free troop has one way to be played.
    if (options.length === 1 && options[0].target === undefined && options[0].slot === undefined && !options[0].tributes?.length) return act(options[0]);
    pick = cardOf(cardId).kind === "troop" ? {card: cardId, tributes: []} : {card: cardId};
    render();
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
    } else if (session.legal().some((a) => (a.type === "attack" || a.type === "cover") && a.slot === slot)) pick = {troop: slot};
    render();
  }
  function clickEnemy(target) {
    const options = session.legal();
    const chosen = pick?.troop !== undefined ? options.find((a) => a.type === "attack" && a.slot === pick.troop && a.target === target)
      : pick?.card ? playsOf(pick.card).find((a) => a.target === target) : null;
    if (chosen) act(chosen);
  }

  // Why a card in hand cannot be played now, read from this seat's view.
  function blocked(view, cardId) {
    const card = cardOf(cardId);
    const mine = view.sides[viewer()];
    if (view.attacking) return "이번 턴에는 더 낼 수 없습니다. 부대가 행동했습니다.";
    if (card.kind === "troop") {
      if (view.summonUsed) return "부대는 한 턴에 하나만 낼 수 있습니다.";
      const cost = tributes(cardId);
      return mine.board.filter(Boolean).length < cost ? `지불할 내 부대가 ${cost}개 필요합니다.` : "내 보드가 가득 찼습니다.";
    }
    if (card.kind === "trap") return view.setUsed ? "함정은 한 턴에 하나만 놓을 수 있습니다." : mine.traps.length >= TRAP_SLOTS ? "함정 칸 두 개가 모두 찼습니다." : "지금은 낼 수 없습니다.";
    if (view.castUsed) return "주문, 장비, 장소는 한 턴에 하나만 낼 수 있습니다.";
    return card.kind === "location" ? "이미 이 장소입니다." : card.kind === "gear" ? "장비를 들 부대가 없습니다." : "대상이 없습니다.";
  }

  const previewId = (target) => `sd-preview-${target}`;

  // What an attack would do, computed on the public view: face-down traps are not counted.
  function preview(view, target) {
    const o = attackOutcome(view, pick.troop, target);
    const foe = view.sides[opponent(viewer())];
    const id = `id="${previewId(target)}" aria-hidden="true"`;
    if (target === "base") return `<span ${id} class="sd-note sd-good">${foe.board.some(Boolean) ? "돌파: " : ""}기지에 ${o.baseDamage} 피해</span>`;
    const lastStand = o.targetLeft === 0 && has(foe.board[target].cardId, "laststand") ? ". 최후의 저항으로 내 부대가 오브 1개를 잃음" : "";
    if (o.targetLeft === 0) return `<span ${id} class="sd-note sd-good">쓰러뜨림${o.baseDamage ? `, 기지에 ${o.baseDamage} 피해` : foe.board[target].cover ? ", 기지에는 피해 없음" : ""}${lastStand}</span>`;
    if (foe.board[target].cover) return `<span ${id} class="sd-note">오브 ${o.targetLeft}개 남음. 엄폐 중이라 반격하지 않습니다.</span>`;
    if (attackOf(view, foe.board[target]) === 0) return `<span ${id} class="sd-note">오브 ${o.targetLeft}개 남음. 공격력이 없어 내 부대는 무사합니다.</span>`;
    return `<span ${id} class="sd-note ${o.attackerLeft === 0 ? "sd-warn" : ""}">오브 ${o.targetLeft}개 남고 반격: 내 부대 ${o.attackerLeft === 0 ? "쓰러짐" : `오브 ${o.attackerLeft}개로 감소`}</span>`;
  }

  // After a win: what it paid and the two cards to choose from. After a loss: the rematch's grit.
  // A game inside a match and a two-player game pay nothing, but they still need the button that moves on.
  function rewardPanel() {
    const label = outcome.conflict ? null : againLabel();
    const review = setup && onReview ? `<button type="button" id="sd-review">마법사의 수 복기</button>`
      : duel.kind === "lesson" && onLessonBack ? `<button type="button" id="sd-lesson-back">강의로 돌아가기</button>` : "";
    const again = (label ? `<button type="button" id="sd-again">${label}</button>` : "") + review;
    if (!outcome.earned) {
      const notice = outcome.conflict ? `<p role="status">${outcome.conflict} 이 대결은 내 진행 상황에 반영되지 않았습니다.</p>` : "";
      return `${notice}<div class="sd-row">${again}<button type="button" id="sd-camp">캠프로 돌아가기</button></div>`;
    }
    const {won, earned, intoDeck, grit} = outcome;
    const offer = camp.progress().offer;
    return [
      earned.captured ? `<h2>생포</h2><div class="sd-row"><div class="sd-card ${TYPES[earned.captured].side} ${TYPES[earned.captured].rarity}" data-frame="${TYPES[earned.captured].kind}">${face(earned.captured)}</div></div>` : "",
      earned.cards.length ? `<h2>컬렉션에 새로 추가</h2><p class="sd-good">획득: ${pays(earned.cards)}.</p>` : "",
      intoDeck.length ? `<p class="sd-note">현재 덱: ${intoDeck.map(([type, copies, replaced]) => `${TYPES[replaced].name} ×${copies}을(를) ${TYPES[type].name} ×${copies}(으)로 교체`).join(", ")}.</p>` : "",
      earned.packs ? `<p class="sd-good">획득: ${plural(earned.packs, "pack")}. 캠프에서 열어 보세요.</p>` : "",
      earned.cards.length && !intoDeck.length ? `<p class="sd-note">컬렉션에 있지만 아직 덱에는 없습니다. 캠프의 덱 구성을 사용하세요.</p>` : "",
      won && offer ? `<h2>${OFFER_HEADING}</h2>${offerRow(offer, camp.owned)}`
        : picked ? `<p class="sd-good">추가됨 ${TYPES[picked].name}: 이제 ${camp.owned(picked)}장 보유 중입니다. 새 카드는 아직 덱에 없습니다. 캠프의 덱 구성을 사용하세요.</p>` : "",
      !won && grit ? `<p class="sd-note">근성: 재대결에서 내 기지가 오브 ${5 + grit}개로 시작합니다.</p>` : "",
      `<div class="sd-row">${again}<button type="button" id="sd-camp">캠프로 돌아가기</button></div>`,
    ].join("");
  }

  function render(presentationStart) {
    // The curtain: nothing of either seat's hand or traps stays in the page while the screen is passed.
    // Focus moves only when the curtain goes up or down: onto "준비됐어요" when it rises, and off the hidden curtain
    // onto the table when it clears (a mouse click on "준비됐어요" would otherwise leave focus on a hidden button).
    const [rises, clears] = [curtain && $("sd-curtain").hidden, !curtain && !$("sd-curtain").hidden];
    const lost = clears && (!document.activeElement || document.activeElement === document.body || $("sd-curtain").contains(document.activeElement));
    $("sd-curtain").hidden = !curtain;
    $("sd-table").hidden = curtain;
    if (curtain) {
      boardPresentation?.clear();
      for (const id of ["sd-board", "sd-hand", "sd-result", "sd-prompt", "sd-feedback", "sd-status", "sd-location"]) $(id).innerHTML = "";
      $("sd-curtain-text").textContent = `화면을 ${FACTION[session.view().active]} 플레이어에게 넘기세요.`;
      if (rises && !root.hidden) $("sd-ready").focus();
      return;
    }
    const view = session.view();
    const own = viewer(), foe = opponent(own);
    // Two players after the result: both look at the board, so no hand or set trap is shown.
    const shared = !solo() && Boolean(view.result);
    const options = session.legal();
    const mine = options.length > 0;
    const attacking = pick?.troop !== undefined;
    const kind = pick?.card ? cardOf(pick.card).kind : null;
    const aims = new Set(attacking ? options.filter((a) => a.type === "attack" && a.slot === pick.troop).map((a) => a.target)
      : kind === "spell" ? playsOf(pick.card).map((a) => a.target) : []);
    const carriers = new Set(kind === "gear" ? playsOf(pick.card).map((a) => a.slot) : []);
    // Legal attacks describe the outcome as well as the shared aiming prompt.
    const aiming = attacking || kind === "spell" ? ' aria-describedby="sd-prompt"' : "";
    const targetDescription = (target) => attacking && aims.has(target)
      ? ` aria-describedby="${previewId(target)} sd-prompt"` : aiming;

    const row = (side) => {
      const s = view.sides[side];
      const isOwn = side === own;
      const baseOpen = !isOwn && aims.has("base");
      const traps = isOwn && !shared ? (s.traps.length ? `놓은 함정: ${s.traps.map(name).join(", ")}` : "놓은 함정 없음") : s.trapCount ? `뒷면 ${plural(s.trapCount, "card")}` : "뒷면 카드 없음";
      // The other seat's hand is card backs (the deck back's .card-back element) and a count, never faces.
      const backs = isOwn ? "" : `<span class="sd-backs" role="img" aria-label="${FACTION[side]} 패: ${plural(s.handCount, "card")}, 뒷면">${'<span class="card-back" aria-hidden="true"></span>'.repeat(s.handCount)}</span>`;
      const base = `<button type="button" class="sd-base ${side}${baseOpen ? " sd-can" : ""}" ${baseOpen ? 'data-enemy="base"' : "disabled"}${isOwn ? "" : targetDescription("base")} data-base="${side}">
        <strong>${whoseBase(side)} 기지</strong>${orbs(s.base, s.baseMax)}
        <span class="sd-note">패 ${s.handCount} · 덱 ${s.deckCount} · 묘지 ${s.discard.length}</span>${backs}
        <span class="sd-note">▲ ${traps}</span>${baseOpen ? preview(view, "base") : ""}</button>`;
      const slots = s.board.map((troop, slot) => {
        if (!troop) return `<button type="button" class="sd-slot ${side}" data-slot="${side}-${slot}" disabled><span class="sd-note">비어 있음</span></button>`;
        const card = cardOf(troop.cardId);
        let cls = "", data = "disabled", note = troop.cover ? "엄폐 중" : troop.stunned ? "기절" : "";
        if (isOwn && mine) {
          const tribute = pick?.tributes && playsOf(pick.card).some((a) => a.tributes.includes(slot));
          const ready = canAttack(view, troop);
          const actable = options.some((a) => (a.type === "attack" || a.type === "cover") && a.slot === slot);
          if (tribute) { cls = pick.tributes.includes(slot) ? " sd-chosen" : " sd-can"; data = `data-own="${slot}"`; note = "제물"; }
          else if (carriers.has(slot)) { cls = " sd-can"; data = `data-own="${slot}"`; note = "장비 장착"; }
          else if (pick?.troop === slot) { cls = " sd-pick"; note = ready ? "대상을 고르거나 엄폐하세요" : "엄폐할 수 있습니다"; }
          else if (!pick && actable) { cls = " sd-can"; data = `data-own="${slot}"`; note = ready ? "공격 가능" : "엄폐 가능"; }
          else if (troop.arrived === view.turn && !ready && !troop.attacked) note = note || "등장한 턴에는 쉼";
          else if (troop.attacked && !troop.cover) note = "공격함";
        } else if (!isOwn && aims.has(slot)) {
          cls = " sd-can"; data = `data-enemy="${slot}"`;
          if (kind === "spell") note = cardOf(pick.card).effect === "tie" ? "기절하게 됨" : troop.health === 1 ? "쓰러지게 됨" : `오브 ${troop.health - 1}개로 감소`;
        }
        const attack = attackOf(view, troop);
        return `<button type="button" class="sd-slot ${side}${cls}" data-frame="troop" data-slot="${side}-${slot}" ${data}${isOwn ? "" : targetDescription(slot)}><strong>${card.name}</strong><span class="sd-type">${FRAME.troop.mark} 부대 · ${({Lawman: "법 집행관", Outlaw: "무법자", Beast: "야수", Undead: "언데드", Rig: "탈것", Mage: "마법사", Fiend: "마귀"})[card.tag] ?? card.tag}</span>
          공격 ${attack}${attack !== card.attack ? ` (+${attack - card.attack})` : ""} ${orbs(troop.health, card.health)} ${keywords(card)}
          ${troop.gear.length ? `<span class="sd-note">◆ ${troop.gear.map(name).join(", ")}</span>` : ""}${note ? `<span class="sd-note">${note}</span>` : ""}${!isOwn && attacking && aims.has(slot) ? preview(view, slot) : ""}</button>`;
      }).join("");
      return `<div class="sd-side" data-side="${side}">${base}${slots}</div>`;
    };
    $("sd-board").innerHTML = row(foe) + row(own);
    const landing = view.arrivals.map((due) => `${TYPES[due.type].name} ${Math.max(due.turn, view.turn + (view.active === due.side ? 2 : 1))}턴 시작에 내려앉습니다.`).join(" ");
    $("sd-location").textContent = landing + (landing && view.location ? " " : "") + (view.location ? `■ 장소: ${name(view.location.cardId)}. ${EFFECTS[cardOf(view.location.cardId).effect].text.replace("장소. ", "")}` : "");

    const playable = new Set(options.filter((a) => a.cardId).map((a) => name(a.cardId)));
    $("sd-hand").innerHTML = (shared ? [] : view.sides[own].hand).map((cardId) => {
      const card = cardOf(cardId);
      const on = playable.has(card.name);
      return `<button type="button" class="sd-card ${card.side} ${card.rarity}${pick?.card === cardId ? " sd-pick" : on ? " sd-can" : ""}" data-frame="${card.kind}" data-card="${cardId}" ${on ? "" : "disabled"}>
        ${face(typeOf(cardId), mine && !on ? `<span class="sd-note sd-warn">${blocked(view, cardId)}</span>` : "")}</button>`;
    }).join("");

    const r = view.result;
    const score = match ? ` · 3판 중 ${match.game}번째 · ${solo() ? `나 ${match.wins[own]}, ${sides(foe)} ${match.wins[foe]}` : `카우보이 ${match.wins.cowboy}, 마법사 ${match.wins.wizard}`}` : "";
    const verdict = !r ? "" : r.winner === null ? "무승부." : !solo() ? `${sides(r.winner)} 승리: ${FACTION[opponent(r.winner)]} 기지가 무너졌습니다.`
      : r.winner === own ? `승리: ${FACTION[foe]} 기지가 무너졌습니다.` : "패배: 내 기지가 무너졌습니다.";
    $("sd-status").innerHTML = r ? `<span class="sd-result ${!solo() || r.winner === own ? "sd-good" : "sd-warn"}">${verdict}</span>${score}`
      : `${duel.name}${score} · ${view.turn}턴 · ${solo() ? (view.active === own ? "내 차례" : `${sides(foe)} 차례`) : `${sides(view.active)} 차례`}`;
    $("sd-feedback").textContent = session.failure?.() ? `강의 마법사가 멈췄습니다: ${session.failure()} 캠프로 돌아가기 또는 이 대결 다시 시작을 사용하세요.`
      : latest.length ? `방금: ${latest.join(" ")}` : "";
    $("sd-result").innerHTML = r ? rewardPanel() : "";

    const canCover = attacking && options.some((a) => a.type === "cover" && a.slot === pick.troop);
    const guarded = view.sides[foe].board.some((troop) => troop && has(troop.cardId, "guard"));
    $("sd-prompt").textContent = r ? "" : pick?.tributes ? `선택: ${name(pick.card)}의 대가로 묘지에 보낼 내 부대 ${tributes(pick.card)}개를 고르세요.`
      : kind === "gear" ? `선택: ${name(pick.card)}을(를) 들 내 부대 하나를 고르세요.`
      : kind === "spell" ? `선택: ${name(pick.card)}의 대상이 될 적 부대를 고르세요.`
      : attacking ? `${aims.size === 0 ? "이 부대는 지금 공격할 수 없습니다." : guarded ? "수호 부대가 가로막고 있습니다. 먼저 공격하세요." : aims.has("base") && aims.size === 1 ? "적 부대가 없습니다. 기지를 공격하세요." : "선택: 공격할 대상을 고르세요."}${
        canCover ? " 아니면 엄폐하세요. 다음 턴까지 기지가 받는 추가 피해를 막아 주지만 반격하지는 못합니다." : ""}`
      : view.attacking ? "이번 턴에는 더 낼 수 없습니다. 다른 부대로 행동하거나 턴을 끝내세요."
      : view.turn === 1 ? "카드를 내세요. 부대는 한 턴에 하나입니다. 첫 턴에는 아무도 공격하지 않습니다."
      : "먼저 카드를 내세요(부대 하나, 다른 카드 하나). 그다음 부대로 행동합니다. 부대가 행동하면 이번 턴에는 더 낼 수 없습니다.";
    $("sd-end").hidden = Boolean(r);
    $("sd-end").disabled = !options.some((a) => a.type === "end");
    $("sd-boot-hill").hidden = !("contestChallenge" in root.dataset && onBootHill && campaign?.trailDuel?.()?.battlefield === "boot-hill" && challengeAttacked && playbackIdle);
    $("sd-cover").hidden = !canCover;
    $("sd-cancel").hidden = !pick;
    $("sd-restart").hidden = Boolean(r);
    $("sd-lesson").textContent = duel.lesson;
    $("sd-log").innerHTML = lines.map((l, i) => `<li data-line="${i}"${l.cue ? ` data-cue-kind="${l.cue}"` : ""}${l.turn ? ' class="sd-turn"' : ""}>${l.text}</li>`).join("");
    $("sd-log").scrollTop = $("sd-log").scrollHeight;
    for (const side of ["cowboy", "wizard"]) $(`sd-${side}-graveyard`).textContent = view.sides[side].discard.map(name).join(", ") || "없음";
    // Keywords from the duel's two public deck lists, so the list never depends on a hidden card.
    const inPlay = new Set(Object.values(duel.options.decks).flatMap((counts) => Object.keys(counts)).flatMap((type) => TYPES[type].keys ?? []));
    $("sd-keywords").innerHTML = Object.entries(KEYWORDS).filter(([key]) => inPlay.has(key)).map(([, [word, rule]]) => `<li><strong>${word}.</strong> ${rule}</li>`).join("")
      || "<li>이 대결에는 키워드가 없습니다.</li>";
    cues.paint();
    boardPresentation?.paint(view,presentationStart);
    if (lost && !root.hidden) usable("#sd-hand button", "#sd-board [data-own]", "#sd-end", "#sd-result button")?.focus();
  }

  // Each render replaces the board and hand buttons, which drops keyboard focus. After a keyboard
  // activation (a click with detail 0, or Escape) focus goes to the next usable button: a new pick's
  // first legal choice, back to what opened a cancelled pick, the same button, or the next thing to
  // play. A mouse click (detail 1 or more) never moves focus, and Escape moves it only from a duel button.
  let origin = null; // the button that opened the current pick
  const pickKey = (p) => p ? p.card ?? `troop-${p.troop}` : null;
  const keyOf = (b) => !b || !root.contains(b) ? null : b.id ? `#${b.id}`
    : b.dataset.card ? `[data-card="${b.dataset.card}"]` : b.dataset.slot ? `[data-slot="${b.dataset.slot}"]` : b.dataset.base ? `[data-base="${b.dataset.base}"]` : null;
  // The first enabled, shown match of the earliest selector in the list that has one.
  const usable = (...selectors) => {
    for (const selector of selectors) {
      const found = selector && [...root.querySelectorAll(selector)].find((n) => !n.disabled && !n.hidden && n.getClientRects().length > 0);
      if (found) return found;
    }
    return null;
  };
  const pickStarted = (before) => pickKey(pick) !== null && pickKey(pick) !== pickKey(before);
  function refocus(key, before) {
    if (root.hidden) return;
    if (curtain) return $("sd-ready").focus();
    const next = (pickStarted(before) ? usable("#sd-board button", "#sd-cover", "#sd-cancel") : null)
      ?? (before && !pick ? usable(origin) : null) ?? usable(key)
      ?? usable("#sd-hand button", "#sd-board [data-own]", "#sd-end", "#sd-result button", "#sd-home");
    if (next && next !== document.activeElement) next.focus();
  }

  root.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b || b.disabled || !session || settling) return;
    const [key, before, keyboard] = [keyOf(b), pick, event.detail === 0];
    const d = b.dataset;
    if (d.card) clickCard(d.card);
    else if (d.own) clickOwn(Number(d.own));
    else if (d.enemy) clickEnemy(d.enemy === "base" ? "base" : Number(d.enemy));
    else if (b.id === "sd-end") act({type: "end"});
    else if (b.id === "sd-cover" && pick?.troop !== undefined) act(session.legal().find((a) => a.type === "cover" && a.slot === pick.troop));
    else if (b.id === "sd-cancel") { pick = null; render(); }
    else if (b.id === "sd-restart") deal(seed);
    else if (b.id === "sd-ready" && curtain) { curtain = false; render(); }
    else if (d.choose && camp?.progress().offer?.includes(d.choose)) {
      const claim = () => {
        if (root.hidden || !root.contains(b)) return;
        camp.choose(d.choose);
        picked = d.choose;
        render();
        $("sd-camp")?.focus();
      };
      if (camp === campaign) writeCamp(claim);
      else claim();
    }
    else if (b.id === "sd-again" && outcome) again();
    else if (b.id === "sd-review" && outcome && setup) {
      const view = session.view();
      cues.clear(); boardPresentation?.clear();
      onReview({seed, setup, cowboyActions: structuredClone(cowboyActions), expected: {result: view.result, turn: view.turn}});
    }
    else if (b.id === "sd-boot-hill" && onBootHill) {
      cues.clear(); boardPresentation?.clear();
      if (onBootHill() !== false && keyboard) {
        usable("#sd-hand button", "#sd-board [data-own]", "#sd-end", "#sd-result button", "#sd-home")?.focus();
        return;
      }
    }
    else if (b.id === "sd-lesson-back") { cues.clear(); boardPresentation?.clear(); onLessonBack(); }
    else if (b.id === "sd-home" || b.id === "sd-camp") { cues.clear(); boardPresentation?.clear(); onHome(); }
    if (pickStarted(before)) origin = key;
    if (keyboard) refocus(key, before);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && pick && !root.hidden) {
      const [key, before] = [keyOf(document.activeElement), pick];
      pick = null;
      render();
      if (key) refocus(key, before);
    }
  });
  return {start};
}

export const freshSeed = () => Math.floor(Math.random() * 100000);
