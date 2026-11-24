// The Wizard preview section (Fable's ruling, "Wizard preview"): one collapsed block at the end of the Camp, shown
// once the Cowboy save has won Boot Hill, and the same block on its own after ?wizard=1 ("direct"). It lists the
// four Wizard duels and Open range, Wizard seat, says what the next one pays and why, shows the Wizard deck and
// has its own Start preview over. Everything it shows comes from the preview object
// (src/match/showdown-wizard-campaign.js); it reads and writes no Cowboy progress.
// Selectors are listed for the browser check in the release notes (entry-api.md).
import {josa} from "./josa.js";
import {TYPES} from "../game/showdown/cards.js";
import {GRIT_CAP} from "../game/showdown/trail.js";
import {pays} from "./showdown-screen.js";

const TEMPLATE = `<summary>마법사 미리보기</summary>
  <header id="wizard-direct" hidden><h1 id="wizard-direct-title">마법사 미리보기</h1><button type="button" id="wizard-to-camp">카우보이 캠프</button></header>
  <p class="sd-note">마법사로 카우보이 봇과 겨룹니다. 보상이 정해진 대결 네 번, 그다음 열린 벌판입니다. 이 브라우저에 별도로 저장되며 카우보이 진행 상황에는 영향이 없습니다. 미리보기: 이 대결들은 아직 플레이어 테스트를 거치지 않았습니다.</p>
  <p id="wizard-storage" class="sd-note" role="status" hidden>이 브라우저가 마법사 미리보기를 저장하지 못했습니다. 새로고침하면 사라집니다.</p>
  <p id="wizard-next" role="status"></p>
  <ol id="wizard-track" class="sd-row"></ol>
  <p id="wizard-deck" class="sd-note"></p>
  <div class="sd-row"><button type="button" id="wizard-reset">미리보기 다시 시작</button> <span id="wizard-reset-note" class="sd-note" role="status"></span></div>`;

const swaps = (reward) => reward.map(([type, replaced, copies]) => `${josa(`${TYPES[replaced].name} ×${copies}`, "을")} ${josa(`${TYPES[type].name} ×${copies}`, "으로")} 교체`).join(", ");
const earned = (reward) => pays(reward.map(([type, , copies]) => [type, copies]));
const tileId = (id) => `wizard-duel-${id.replace(/^wizard:/, "")}`;

// root: an empty <details> element. preview: createWizardPreview(storage). track: WIZARD_TRACK.
// onDuel(id): start that preview duel. onCowboyCamp(): leave the direct preview for the Cowboy Camp.
export function mountWizardCamp(root, {preview, track, onDuel, onCowboyCamp, confirm = (text) => window.confirm(text)}) {
  root.innerHTML = TEMPLATE;
  const $ = (id) => root.querySelector(`#${id}`);

  function render() {
    const progress = preview.progress();
    const list = preview.duels();
    const next = track[progress.wins];
    const grit = Math.min(progress.losses, GRIT_CAP);
    $("wizard-storage").hidden = preview.saved();
    $("wizard-next").innerHTML = next
      ? `다음: <strong>${next.name}</strong>. 이기면 마법사 덱에서 ${swaps(next.reward)}됩니다${progress.wins + 1 < track.length ? `. 이후 ${track[progress.wins + 1].name} 해금` : ". 이후 열린 벌판 해금"}. ${next.lesson}${
        grit ? ` 근성: 재대결에서 내 기지가 오브 ${5 + grit}개로 시작합니다.` : ""}`
      : "마법사 대결 네 번을 모두 이겼고 용이 덱에 들어왔습니다. 다음: <strong>열린 벌판, 마법사 자리</strong>. 완성된 덱으로 카우보이 전체 덱과 맞붙습니다. 보상은 없습니다.";
    $("wizard-track").innerHTML = list.map((duel) => {
      const step = track[duel.index];
      const note = !step ? (duel.state === "open" ? "보상 없음" : "잠김 · 한낮의 결투 이후")
        : duel.state === "won" ? `획득: ${earned(step.reward)}` : duel.state === "locked" ? `잠김 · 이기면 획득: ${earned(step.reward)}` : `이기면 획득: ${earned(step.reward)}`;
      return `<li><button type="button" class="sd-tile ${duel.state}" id="${tileId(duel.id)}" data-wizard-duel="${duel.id}"${duel.state === "open" ? "" : " disabled"}>
        <strong>${duel.state === "won" ? "✓ " : ""}${duel.name}</strong><span class="sd-note">${note}</span></button></li>`;
    }).join("");
    $("wizard-deck").innerHTML = `<strong>마법사 덱:</strong> ${Object.entries(progress.deck).map(([type, copies]) => `${TYPES[type].name} ×${copies}`).join(", ")}.`;
  }

  // mode "camp": collapsed inside the Camp; "direct": open on its own, with the way to the Cowboy Camp.
  function show(mode, {unlocked = true} = {}) {
    root.dataset.mode = mode;
    const direct = mode === "direct";
    root.hidden = !direct && !unlocked;
    root.querySelector("summary").hidden = direct;
    $("wizard-direct").hidden = !direct;
    if (direct) root.open = true;
    $("wizard-reset-note").textContent = "";
    render();
  }
  // Focus after a preview duel: the tile that started it, or the next open one when that is now won (id null: the open one).
  function focus(id) {
    root.open = true;
    const usable = (selector) => root.querySelector(`${selector}:not(:disabled)`);
    ((id && usable(`#${tileId(id)}`)) ?? usable("[data-wizard-duel]") ?? $("wizard-reset")).focus();
  }

  root.addEventListener("click", (event) => {
    const b = event.target.closest("button");
    if (!b || b.disabled) return;
    if (b.dataset.wizardDuel) onDuel(b.dataset.wizardDuel);
    else if (b.id === "wizard-to-camp") onCowboyCamp();
    else if (b.id === "wizard-reset") {
      if (!confirm("마법사 미리보기를 다시 시작할까요? 승리 기록과 마법사 덱에 넣은 카드가 지워집니다. 카우보이 진행 상황은 그대로입니다.")) return;
      const saved = preview.reset();
      render();
      $("wizard-reset-note").textContent = saved ? "다시 시작했습니다." : "이번 방문에서만 다시 시작했습니다. 브라우저가 저장하지 못했습니다.";
    }
  });
  return {show, focus};
}
