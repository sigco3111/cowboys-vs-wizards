// The graybox deck builder (issue 143 slice 3), adapted from the reference builder in
// prototypes/showdown/main.js (openBuilder, renderBuilder, buildStep). Two uses:
//   - from the Camp: the saved deck (16 cards) and side deck (up to 4), from owned cards within each
//     card's limit; Save keeps it through the campaign, which checks progress.js deckProblems.
//   - between the games of a best of three: only cards of this match move between the deck and the
//     side deck; nothing is saved and there is no cancel (src/match/showdown-match.js).
import {RARITY, TYPES} from "../game/showdown/cards.js";
import {DECK_SIZE, SIDE_SIZE} from "../game/showdown/progress.js";
import {swapProblems} from "../match/showdown-match.js";
import {face} from "./showdown-screen.js";

const sum = (counts) => Object.values(counts).reduce((total, copies) => total + copies, 0);
const TEMPLATE = `
  <header><h1 id="builder-title">덱 구성</h1></header>
  <p id="builder-note" class="sd-note"></p>
  <div id="builder-rows"></div>
  <footer class="builder-footer">
    <p id="builder-problems" role="status"></p>
    <div class="sd-row">
      <button type="button" id="builder-save">덱 저장</button>
      <button type="button" id="builder-cancel">취소</button>
    </div>
  </footer>`;

// campaign: progress(), owned(type), deckProblems(deck, side), withDeck(deck, side).
export function mountBuilder(root, {campaign, writeCamp = (change) => change(), paintCardFaces}) {
  root.innerHTML = TEMPLATE;
  const $ = (id) => root.querySelector(`#${id}`);
  if (paintCardFaces) {
    root.classList.add("builder-diorama");
    root.insertAdjacentHTML("beforeend", `<dialog class="builder-inspect" aria-labelledby="builder-inspect-title">
      <header><h2 id="builder-inspect-title"></h2><button type="button" autofocus data-close-card>닫기</button></header>
      <div id="builder-inspect-card"></div>
    </dialog>`);
  }
  const inspect = root.querySelector(".builder-inspect");
  let draft = null; // {pool, deck, side, done, cancel}

  const limit = (type) => (draft.pool ? draft.pool[type] : Math.min(campaign.owned(type), RARITY[TYPES[type].rarity][1]));
  const problems = () => (draft.pool ? swapProblems(draft.pool, draft.deck, draft.side) : campaign.deckProblems(draft.deck, draft.side));

  function render() {
    const types = Object.keys(TYPES).filter((type) => TYPES[type].side === "cowboy" && (draft.pool ? draft.pool[type] : campaign.owned(type) > 0));
    $("builder-title").textContent = draft.pool ? "게임 사이: 사이드 덱과 교체" : "덱 구성";
    $("builder-note").textContent = draft.pool ? "덱과 사이드 덱 사이에서 카드를 옮기세요. 변경은 이번 대전 동안만 유지됩니다."
      : `덱은 ${DECK_SIZE}장입니다. 사이드 덱은 최대 ${SIDE_SIZE}장 더 둘 수 있으며, 3판 2선승의 게임 사이에 교체할 수 있습니다.`;
    $("builder-rows").innerHTML = types.map((type) => {
      const [deck, side] = [draft.deck[type] ?? 0, draft.side[type] ?? 0];
      const room = deck + side < limit(type);
      const step = (zone, by, on, text) => `<button type="button" data-zone="${zone}" data-type="${type}" data-by="${by}" ${on ? "" : "disabled"} aria-label="${text} ${TYPES[type].name}">${by > 0 ? "+" : "−"}</button>`;
      // Between games a card moves from one pile to the other, so "+" on the deck takes it from the side deck.
      const frame = `class="sd-card cowboy ${TYPES[type].rarity}" data-frame="${TYPES[type].kind}" data-face="${type}"`;
      const card = paintCardFaces
        ? `<button type="button" ${frame} data-inspect="${type}" aria-label="살펴보기 ${TYPES[type].name}">${face(type)}</button>`
        : `<div ${frame}>${face(type)}</div>`;
      const pile = (zone, label, number, canAdd) => `<div class="builder-pile">
        <span class="sd-note">${label}</span>
        <span class="builder-stepper">${step(zone, -1, number > 0, `한 장 줄이기: ${label.toLowerCase()}:`)}
          <strong data-count="${zone}">${number}</strong>
          ${step(zone, 1, canAdd, `한 장 늘리기: ${label.toLowerCase()}:`)}</span></div>`;
      const cap = limit(type);
      const limitNote = paintCardFaces ? (Number.isFinite(cap) ? `Up to ${cap}장` : "제한 없음")
        : (Number.isFinite(cap) ? `제한: ${cap} (덱과 사이드 덱 합계)` : "제한: 없음");
      return `<div class="sd-build-row" data-row="${type}">${card}
        ${pile("deck", "덱", deck, draft.pool ? side > 0 : room)}
        ${pile("side", "사이드 덱", side, draft.pool ? deck > 0 : room)}
        <span class="sd-note builder-limit">${limitNote}</span></div>`;
    }).join("");
    paintCardFaces?.($("builder-rows"), "[data-face]");
    const listed = problems();
    $("builder-problems").innerHTML = `덱 ${sum(draft.deck)} of ${DECK_SIZE} · 사이드 덱 ${sum(draft.side)} of ${SIDE_SIZE}.${listed.length ? ` <span class="sd-warn">${listed.join(" ")}</span>` : ""}`;
    $("builder-save").disabled = listed.length > 0;
    $("builder-save").textContent = draft.pool ? "다음 게임 시작" : "덱 저장";
    $("builder-cancel").hidden = !draft.cancel;
  }

  function step(zone, type, by) {
    const other = zone === "deck" ? "side" : "deck";
    draft[zone] = {...draft[zone], [type]: (draft[zone][type] ?? 0) + by};
    if (draft.pool) draft[other] = {...draft[other], [type]: (draft[other][type] ?? 0) - by};
    render();
    // The rows are redrawn, which drops keyboard focus. Keep it on the same button; at a bound move to
    // the other button of the same pile, then the other pile, then Save.
    const button = (z, b) => $("builder-rows").querySelector(`[data-zone="${z}"][data-type="${type}"][data-by="${b}"]:not(:disabled)`);
    (button(zone, by) ?? button(zone, -by) ?? button(other, by) ?? button(other, -by) ?? $("builder-save")).focus();
  }

  root.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b || b.disabled || !draft) return;
    if (b.dataset.inspect) {
      const type = b.dataset.inspect;
      const card = TYPES[type];
      $("builder-inspect-title").textContent = card.name;
      $("builder-inspect-card").innerHTML = `<div class="sd-card cowboy ${card.rarity}" data-frame="${card.kind}" data-face="${type}" aria-hidden="true">${face(type)}</div>
        <div class="builder-inspect-rules">${face(type)}</div>`;
      paintCardFaces($("builder-inspect-card"), "[data-face]");
      inspect.showModal();
    } else if (b.hasAttribute("data-close-card")) inspect.close();
    else if (b.dataset.zone) step(b.dataset.zone, b.dataset.type, Number(b.dataset.by));
    else if (b.id === "builder-save" && !problems().length) {
      const {deck, side, done} = draft;
      draft = null;
      done(deck, side);
    } else if (b.id === "builder-cancel" && draft.cancel) {
      const {cancel} = draft;
      draft = null;
      cancel();
    }
  });

  return {
    // The saved deck: done() after it is kept, cancel() leaves it as it was.
    openDeck({done, cancel}) {
      const progress = campaign.progress();
      draft = {pool: null, deck: {...progress.deck}, side: {...progress.side},
        done: (deck, side) => writeCamp(() => { campaign.withDeck(deck, side); done(); }), cancel};
      render();
      ($("builder-rows").querySelector("button:not(:disabled)") ?? $("builder-save")).focus({preventScroll: true});
    },
    // Between games: done(deck, side) plays the next game with them.
    openSwap({pool, deck, side, done}) {
      draft = {pool, deck: {...deck}, side: {...side}, done, cancel: null};
      render();
      ($("builder-rows").querySelector("button:not(:disabled)") ?? $("builder-save")).focus({preventScroll: true});
    },
  };
}
