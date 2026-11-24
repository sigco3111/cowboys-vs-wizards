// The graybox Camp (issue 143 slices 2 and 3), adapted from the reference camp in prototypes/showdown/main.js:
// the card still on offer and packs to open, the six Trail duels, then (after the Trail) the rivals,
// the Wanted hunts and Open range (the even match and best of three), two players on one screen at any
// time, the saved deck and collection, Build deck, the save code with Start over, and the playtest report.
// Every rule (what is open, what a win pays, what a pack holds) comes from progress.js through the campaign.
import {TYPES} from "../game/showdown/cards.js";
import {BOUNTIES, HUNTS, RIVALS, trailDone} from "../game/showdown/progress.js";
import {decodeSaveCode, describeSave, encodeSave, sameSave} from "../game/showdown/savecode.js";
import {TRAIL} from "../game/showdown/trail.js";
import {OFFER_HEADING, face, offerRow, pays} from "./showdown-screen.js";
import {mountLedger} from "./sheriffs-ledger.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const sum = (counts) => Object.values(counts).reduce((total, copies) => total + copies, 0);
const TEMPLATE = `
  <header><h1>캠프</h1><button id="camp-home" type="button">메인 메뉴</button></header>
  <p id="camp-changed" class="sd-note" role="status" tabindex="-1" hidden></p>
  <p id="camp-storage" class="sd-note" role="status" hidden>이 브라우저가 진행 상황을 저장하지 못했습니다. 새로고침하면 사라집니다. 보관하려면 캠프의 저장 코드를 열어 코드를 복사하세요.</p>
  <div id="camp-claim" aria-live="polite"></div>
  <section class="camp-map" aria-labelledby="camp-trail-title"><h2 id="camp-trail-title">트레일</h2><ol id="camp-trail" class="sd-row"></ol></section>
  <section class="camp-stop-list" aria-labelledby="camp-rivals-title"><h2 id="camp-rivals-title">라이벌</h2><ol id="camp-rivals" class="sd-row"></ol></section>
  <section class="camp-stop-list" aria-labelledby="camp-bounties-title"><h2 id="camp-bounties-title">현상 수배</h2><ol id="camp-bounties" class="sd-row"></ol></section>
  <section class="camp-stop-list" aria-labelledby="camp-open-title"><h2 id="camp-open-title">열린 벌판</h2><div id="camp-open" class="sd-row"></div></section>
  <section class="camp-stop-list" id="camp-collection-room" aria-label="내 카드"><h2>내 카드</h2><p id="camp-collection" class="sd-note"></p>
    <div class="sd-row"><button type="button" id="camp-build">덱 구성</button></div></section>
  <details id="camp-save"><summary>저장 코드</summary>
    <p class="sd-note">진행 상황은 이 브라우저에 저장됩니다. 옮기려면 이 코드를 복사하거나, 코드를 붙여넣고 불러오기를 누르세요.</p>
    <textarea id="camp-code" rows="3" cols="60" aria-label="저장 코드" spellcheck="false"></textarea>
    <div class="sd-row">
      <button type="button" id="camp-load">불러오기</button>
      <button type="button" id="camp-reset">처음부터 다시</button>
      <span id="camp-code-note" class="sd-note" role="status"></span>
    </div>
    <div id="camp-code-preview" data-testid="save-import-preview" role="group" aria-labelledby="camp-code-preview-text" hidden>
      <p id="camp-code-preview-text" class="sd-note"></p>
      <div class="sd-row">
        <button type="button" id="camp-code-replace" data-testid="save-import-replace">내 진행 상황 교체</button>
        <button type="button" id="camp-code-cancel" data-testid="save-import-cancel">취소</button>
      </div>
    </div>
  </details>
  <details id="camp-report"><summary>플레이테스트 보고서</summary>
    <p class="sd-note">플레이한 내용과 결과입니다. 전체를 선택해 복사한 뒤 플레이를 부탁한 사람에게 보내세요.</p>
    <p id="camp-report-storage" class="sd-note" role="status" hidden>이 브라우저가 플레이테스트 보고서를 저장하지 못했습니다. 새로고침하면 사라집니다.</p>
    <textarea id="camp-report-text" rows="10" cols="60" readonly aria-label="플레이테스트 보고서"></textarea>
    <p><button id="camp-report-copy" type="button">보고서 복사</button> <span id="camp-report-copied" role="status" aria-live="polite"></span></p>
  </details>
  <details id="camp-ledger" class="sd-ledger"></details>`;

// campaign: progress(), saved(), duels(), holdings(), owned(type), choose(type), openPack(), replace(save), reset().
// onDuel(id, {players, best}): start a Camp duel ("trail", "rival:<id>", "hunt:<id>", "open", or "two" for two players).
// onBuild(): open the deck builder. playtest (optional): text(progress), saved(), clear().
// confirm: asks before Start over (window.confirm in the page).
export function mountCamp(root, {campaign, writeCamp = (change) => change(), playtest, paintCardFaces, openDestination, dressNotices, onDuel, onHome, onBuild, confirm = (text) => window.confirm(text)}) {
  root.innerHTML = TEMPLATE;
  const $ = (id) => root.querySelector(`#${id}`);
  if (paintCardFaces) {
    $("camp-trail").insertAdjacentHTML("afterend", `<aside class="camp-trail-rail" aria-label="트레일 동작">
      <h3 id="camp-current-stop"></h3><p id="camp-current-reward" aria-live="polite"></p>
      <button type="button" class="frontier-plaque" id="camp-start-trail">플레이</button>
      <nav class="camp-rail-tools" aria-label="캠프 이동 장소">
        <button type="button" data-camp-destination="camp-rivals-title">라이벌</button>
        <button type="button" data-camp-destination="camp-bounties-title">현상 수배</button>
        <button type="button" data-camp-destination="camp-open-title">열린 벌판</button>
      </nav>
      <nav class="camp-rail-utility" aria-label="캠프 도구">
        <button type="button" data-camp-destination="camp-practice">연습</button>
        <button type="button" data-camp-destination="camp-save">저장 코드</button>
      </nav>
    </aside>`);
    root.querySelector(".camp-rail-tools").prepend($("camp-build"));
    root.classList.add("camp-diorama");
  }
  mountLedger($("camp-ledger")); // The Night Shift: Sheriff's Ledger, static and collapsed (src/ui/sheriffs-ledger.js).
  let picked = null;
  let opened = null; // the pack just opened, shown once

  function render() {
    const progress = campaign.progress();
    const list = campaign.duels();
    const next = TRAIL[progress.wins];
    $("camp-storage").hidden = campaign.saved();
    const hint = picked ? `<p class="sd-good">추가됨 ${TYPES[picked].name}: 이제 ${campaign.owned(picked)}장 보유 중입니다. 새 카드는 아직 덱에 없습니다. 아래의 덱 구성을 사용하세요.</p>` : "";
    // First things first: a card to choose, then a pack to open. While a card is on offer no solo duel can start.
    $("camp-claim").innerHTML = progress.offer ? `<h2>${OFFER_HEADING}</h2><p class="sd-note">승리했습니다! 고른 카드는 내 컬렉션에 들어갑니다.</p>${offerRow(progress.offer, campaign.owned)}`
      : opened ? `<h2>팩 안의 카드</h2><div class="sd-row">${opened.map((type) => `<div class="sd-card cowboy ${TYPES[type].rarity}" data-frame="${TYPES[type].kind}" data-opened="${type}">${face(type)}</div>`).join("")}</div>
        <div class="sd-row"><button type="button" id="camp-pack-done">${progress.packs ? `다음 팩 열기 (${progress.packs} 남음)` : "컬렉션에 추가"}</button></div>`
      : progress.packs ? `${hint}<h2>${plural(progress.packs, "pack")} 열기</h2><div class="sd-row"><button type="button" id="camp-pack">팩 열기: 카드 세 장</button></div>`
      : `${hint}${next ? `<p id="camp-next">${progress.wins === 0 ? "여기서 시작" : "다음"}: <strong>${next.name}</strong> 을(를) 눌러 ${progress.wins === 0 ? "첫 대결을 시작하세요" : "it"}.</p>` : "<p>트레일 전체를 클리어했습니다.</p>"}`;

    paintCardFaces?.($("camp-claim"), "[data-choose], [data-opened]");

    const tile = (duel, note, off = duel.state !== "open") => `<li><button type="button" class="sd-tile ${duel.state}" ${duel.kind === "trail" ? `data-trail="${duel.index}" ` : ""}${off || progress.offer ? "disabled" : `data-duel="${duel.id}"`}>
      <strong>${duel.state === "won" ? "✓ " : ""}${duel.name}</strong><span class="sd-note">${note}</span></button></li>`;
    $("camp-trail").innerHTML = list.filter((duel) => duel.kind === "trail").map((duel) => {
      const reward = pays(TRAIL[duel.index].reward.map(([type, , copies]) => [type, copies]));
      return tile(duel, duel.state === "won" ? `획득: ${reward}` : duel.state === "locked" ? `잠김 · 승리하면 획득 ${reward}` : `승리하면 획득 ${reward}`);
    }).join("");
    if (paintCardFaces) {
      const choice = $("camp-trail").querySelector(".open");
      const start = $("camp-start-trail");
      $("camp-current-stop").textContent = next?.name ?? "트레일 완료";
      $("camp-current-reward").textContent = progress.offer
        ? "보상을 골라 계속하세요."
        : choice?.querySelector(".sd-note").textContent ?? "라이벌과 현상 수배 사냥이 열렸습니다.";
      start.hidden = !next;
      start.disabled = !choice || choice.disabled;
      start.textContent = next ? `${next.name}` : "플레이";
    }
    $("camp-rivals").innerHTML = list.filter((duel) => duel.kind === "rival").map((duel, i) => {
      const rival = RIVALS[i];
      const reward = [pays(rival.reward.map((type) => [type, 1])), plural(rival.packs, "pack")].filter(Boolean).join(" 및 ");
      // A beaten rival can be fought again for the card choice.
      return tile(duel, duel.state === "won" ? "격파했습니다. 카드를 얻으려면 재대결하세요." : duel.state === "locked" ? (trailDone(progress) ? "먼저 라이벌을 이기세요: " : "트레일 이후") : `승리하면 획득 ${reward}`, duel.state === "locked");
    }).join("");
    $("camp-bounties").innerHTML = list.filter((duel) => duel.kind === "hunt").map((duel) => {
      const bounty = BOUNTIES.find((each) => `hunt:${each.id}` === duel.id);
      return tile(duel, duel.state === "won" ? `생포: ${TYPES[bounty.reward].name}` : duel.state === "locked" ? "트레일 이후"
        : `${duel.cleared} of ${HUNTS}회 사냥 성공. 다섯 번 승리하면 생포합니다 ${TYPES[bounty.reward].name}.`);
    }).join("");
    dressNotices?.(trailDone(progress));
    const open = trailDone(progress) && !progress.offer;
    $("camp-open").innerHTML = `<button type="button" data-duel="open" ${open ? "" : "disabled"}>일반 대결${open ? "" : " (트레일 이후)"}</button>
      <button type="button" data-match="open" ${open ? "" : "disabled"}>사이드 덱으로 3판 2선승</button>
      <button type="button" data-two="1">2인 대결, 한 화면</button>
      <button type="button" data-two="3">2인 대결, 3판 2선승</button>`;

    const count = (counts) => Object.entries(counts).map(([type, copies]) => `${TYPES[type].name} ×${copies}`).join(", ");
    const rows = campaign.holdings();
    const listed = rows.map(({type, copies, inherited}) => `${TYPES[type].name} ×${copies}${inherited ? " (레인 게임에서)" : ""}`).join(", ");
    $("camp-collection").innerHTML = `<strong>덱:</strong> ${count(progress.deck)}.${sum(progress.side) ? ` <strong>사이드 덱:</strong> ${count(progress.side)}.` : ""}<br><strong>컬렉션:</strong> 보안관과 빌리는 원하는 만큼${
      listed ? `, ${listed}` : ""}.${rows.some((row) => row.inherited) ? `<br>레인 게임에서 얻은 카드는 계속 보유하지만, 트레일 덱과 저장 코드에는 포함되지 않습니다.` : ""}`;
    // Save codes hold the progress object only, never keepsakes (Fable's F1 ruling).
    if (!pending) $("camp-code").value = encodeSave(progress);
    $("camp-report").hidden = !playtest;
    if (playtest) {
      $("camp-report-text").value = playtest.text(progress);
      $("camp-report-storage").hidden = playtest.saved();
      $("camp-report-copied").textContent = "";
    }
  }

  // Clipboard first; where it is refused (file:// pages, older browsers) the text is selected for a manual copy.
  async function copyReport() {
    const box = $("camp-report-text");
    try {
      await navigator.clipboard.writeText(box.value);
      $("camp-report-copied").textContent = "복사했습니다.";
    } catch {
      box.focus();
      box.select();
      $("camp-report-copied").textContent = "선택됨: Ctrl+C 또는 Cmd+C를 눌러 복사하세요.";
    }
  }

  // A pasted code is read strictly, and a different save replaces this one only after Replace is pressed.
  // The preview belongs to the exact text it was read from: any edit withdraws it, and Replace re-checks the text.
  let pending = null;
  const closePreview = () => { pending = null; $("camp-code-preview").hidden = true; };
  const note = (text) => { $("camp-code-note").textContent = text; };
  // A button from an old render may have disappeared while another tab was finishing its save.
  const writeFrom = (button, change) => writeCamp(() => {
    if (!root.hidden && root.contains(button) && !button.disabled) {
      $("camp-changed").hidden = true;
      change();
    }
  });
  $("camp-code").addEventListener("input", () => {
    if (!pending) return;
    closePreview();
    note("코드가 바뀌어 미리보기를 닫았습니다. 불러오기를 눌러 미리보기를 여세요. 바뀐 것은 없습니다.");
  });
  function load() {
    closePreview();
    const read = decodeSaveCode($("camp-code").value);
    if (!read.ok) return note(`${read.reason} 바뀐 것은 없습니다.`);
    if (sameSave(read.save, campaign.progress())) return note("이 코드는 이미 가진 진행 상황과 같습니다. 바뀐 것은 없습니다.");
    pending = {save: read.save, text: $("camp-code").value};
    $("camp-code-preview-text").textContent = `이 코드${read.legacy ? " (이전 버전)" : ""} 내용: ${describeSave(read.save)} 현재 보유: ${describeSave(campaign.progress())} 이 브라우저의 진행 상황을 이 코드로 교체할까요?`;
    $("camp-code-preview").hidden = false;
    note("");
    $("camp-code-cancel").focus();
  }
  function replace() {
    if (!pending) return;
    const preview = pending;
    writeFrom($("camp-code-replace"), () => {
      if (pending !== preview) return;
      closePreview();
      if ($("camp-code").value !== preview.text) return note("코드가 바뀌어 미리보기를 닫았습니다. 불러오기를 눌러 미리보기를 여세요. 바뀐 것은 없습니다.");
      const saved = campaign.replace(preview.save);
      opened = picked = null;
      render();
      note(saved ? "불러왔습니다." : "이번 방문에서만 불러왔습니다. 브라우저가 저장하지 못했습니다.");
      $("camp-load").focus();
    });
  }
  // Start over: Showdown progress and the playtest report only; keepsakes and the lane profile stay.
  function reset() {
    if (!confirm("처음부터 다시 시작할까요? 이 브라우저의 카드, 진행 상황, 플레이테스트 보고서가 삭제됩니다.")) return;
    closePreview();
    writeFrom($("camp-reset"), () => {
      campaign.reset();
      playtest?.clear();
      opened = picked = null;
      render();
      note("다시 시작했습니다.");
    });
  }

  root.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (d.choose && campaign.progress().offer?.includes(d.choose)) {
      writeFrom(b, () => {
        campaign.choose(d.choose);
        picked = d.choose;
        render();
        ($("camp-claim").querySelector("button") ?? root.querySelector("[data-duel]:not(:disabled)"))?.focus();
      });
    } else if (b.id === "camp-start-trail") $("camp-trail").querySelector("[data-duel=trail]")?.click();
    else if (d.campDestination) {
      if (openDestination?.(d.campDestination, b)) return;
      const destination = $(d.campDestination);
      if (!destination) return;
      if (destination instanceof HTMLDetailsElement) {
        destination.open = true;
        destination.querySelector("summary")?.focus();
      } else {
        destination.tabIndex = -1;
        destination.focus();
      }
      destination.scrollIntoView({block: "start"});
    } else if (d.duel && !campaign.progress().offer) onDuel(d.duel, {});
    else if (d.match && !campaign.progress().offer) onDuel(d.match, {best: 3});
    else if (d.two) onDuel("two", {players: 2, best: Number(d.two)});
    else if (b.id === "camp-pack" || (b.id === "camp-pack-done" && campaign.progress().packs)) {
      writeFrom(b, () => {
        opened = campaign.openPack();
        picked = null;
        render();
        $("camp-pack-done")?.focus();
      });
    } else if (b.id === "camp-pack-done") { opened = null; render(); ($("camp-claim").querySelector("button") ?? root.querySelector("[data-duel]:not(:disabled)"))?.focus(); }
    else if (b.id === "camp-build") { picked = null; onBuild(); }
    else if (b.id === "camp-load") load();
    else if (b.id === "camp-code-cancel") { closePreview(); note("취소했습니다. 바뀐 것은 없습니다."); $("camp-load").focus(); }
    else if (b.id === "camp-code-replace") replace();
    else if (b.id === "camp-reset") reset();
    else if (b.id === "camp-home") onHome();
    else if (b.id === "camp-report-copy") copyReport();
  });
  return {show(message = "") {
    picked = null;
    if (message) { opened = null; note(""); }
    $("camp-changed").textContent = message;
    $("camp-changed").hidden = !message;
    closePreview();
    render();
  }};
}
