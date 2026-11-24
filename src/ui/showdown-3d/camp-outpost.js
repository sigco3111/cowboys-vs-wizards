import {BOUNTIES, RIVALS} from "../../game/showdown/progress.js";
import {cardArtwork} from "./table-ui.js";
import {ledgerSectionHtml, mountNightShiftSaloon} from "./night-shift-saloon.js";
import {createSaloonStage} from "./saloon-stage.js";
import {mountForgeShelf} from "../forge-shelf.js";
import {mountRulesDesk} from "../rules-desk.js";
import {mountArenaTable} from "../arena-table.js";
import {mountScoutRuling} from "../scout-ruling.js";
import RECORDING from "../night-shift-recording.json" with {type: "json"};

// Pure: where the staged Boot Hill Poker page sits for a page served at `base`. This build is
// staged at the site root and at its /3d/ copy; both reach the one poker/ next to the root.
// Opened straight from disk, a directory has no index page, so the file is named.
export function pokerHref(base) {
  const url = new URL(base);
  url.search = "";
  url.hash = "";
  url.pathname = url.pathname.replace(/[^/]*$/, "").replace(/3d\/$/, "") + "poker/" + (url.protocol === "file:" ? "index.html" : "");
  return url.href;
}

// Drawers behind the bar for modules other workers own. Each mounts on its first opening;
// a mount that throws leaves a plain note and the rest of the saloon working.
const BAR_DRAWERS = [
  ["ruling", "균형 판정", mountScoutRuling],
  ["forge", "대장간 선반", mountForgeShelf],
  ["rules", "규칙 데스크", mountRulesDesk],
  ["arena", "에이전트 경기장", mountArenaTable],
];

const RIVAL_ART = {
  stargazer: "wizard-wizard",
  imp: "wizard-imp",
  bonewright: "wizard-skeleton",
  coven: "wizard-singularity",
};
const ROOMS = [
  ["camp-rivals-title", "rivals", "라이벌", "stone"],
  ["camp-bounties-title", "wanted", "현상 수배", "stone"],
  ["camp-open-title", "range", "열린 벌판", "wood"],
  ["camp-practice", "practice", "연습", "wood"],
  ["camp-save", "save", "저장 코드", "wood"],
  ["camp-collection-room", "ledger", "캠프 장부", "wood"],
];

// Move the existing controls into their rooms so their rules and event handlers stay in Camp.
export function mountCampOutpost(root) {
  const byId = (id) => root.querySelector("#" + id);
  const wizard = byId("camp-wizard");
  const rooms = new Map();
  let current;

  for (const [target, key, title, material] of ROOMS) {
    const room = document.createElement("dialog");
    room.className = `camp-outpost outpost-${key} outpost-${material}`;
    room.setAttribute("aria-labelledby", `outpost-${key}-title`);
    room.innerHTML = `<header><h2 id="outpost-${key}-title">${title}</h2><button type="button" autofocus>지도로 돌아가기</button></header>
      <div class="outpost-room"></div>`;
    room.querySelector("header button").addEventListener("click", () => room.close());
    const content = room.querySelector(".outpost-room");
    const original = byId(target);
    content.append(original.closest("section") ?? original);
    if (original.matches("details")) {
      original.open = true;
      original.querySelector("summary").hidden = true;
    }
    root.append(room);
    rooms.set(target, {room, content});
    room.addEventListener("close", () => {
      if (current === room && !room.open) current = null;
    });
  }

  const ledger = rooms.get("camp-collection-room").content;
  ledger.append(byId("camp-report"), byId("camp-ledger"));
  for (const slot of ledger.querySelectorAll("[data-ledger-portrait]")) {
    const art = cardArtwork(slot.dataset.ledgerPortrait);
    if (art) slot.append(art);
  }
  root.querySelector(".camp-rail-utility").insertAdjacentHTML("beforeend",
    '<button type="button" data-camp-destination="camp-collection-room">캠프 장부</button>');

  // The Night Shift saloon: same dialog, focus and back pattern as the other rooms.
  const saloonRoom = document.createElement("dialog");
  saloonRoom.className = "camp-outpost outpost-saloon outpost-wood";
  saloonRoom.setAttribute("aria-labelledby", "outpost-saloon-title");
  saloonRoom.innerHTML = `<header><h2 id="outpost-saloon-title">야간 근무 살롱</h2><button type="button" autofocus>지도로 돌아가기</button></header>
      <div class="outpost-room"></div>`;
  saloonRoom.querySelector("header button").addEventListener("click", () => saloonRoom.close());
  root.append(saloonRoom);
  rooms.set("night-shift-saloon", {room: saloonRoom, content: saloonRoom.querySelector(".outpost-room")});
  byId("camp-ledger").insertAdjacentHTML("beforeend", ledgerSectionHtml());
  const saloon = mountNightShiftSaloon({
    content: rooms.get("night-shift-saloon").content,
    recording: RECORDING,
    portrait: cardArtwork,
    ledger: byId("camp-ledger").querySelector(".ledger-night-shift"),
    createStage: createSaloonStage,
  });
  // Under the saloon scene: the experimental second game and the bar's drawers.
  const bar = document.createElement("footer");
  bar.className = "outpost-saloon-bar";
  bar.innerHTML = `<p class="outpost-side-game"><a class="outpost-poker-link"></a>
      <span class="sd-note">실험적인 두 번째 게임입니다. 별도 페이지가 열립니다.</span></p>`;
  const poker = bar.querySelector(".outpost-poker-link");
  poker.textContent = "부트 힐 포커";
  poker.href = pokerHref(document.baseURI);
  for (const [key, label, mount] of BAR_DRAWERS) {
    const drawer = document.createElement("details");
    drawer.className = `outpost-drawer outpost-drawer-${key}`;
    const summary = document.createElement("summary");
    summary.textContent = label;
    const host = document.createElement("div");
    host.className = "outpost-drawer-host";
    drawer.append(summary, host);
    let mounted = false;
    drawer.addEventListener("toggle", () => {
      if (!drawer.open || mounted) return;
      mounted = true;
      try {
        mount(host);
      } catch {
        host.textContent = `${label.toLowerCase()} 항목을 열 수 없습니다.`;
      }
    });
    bar.append(drawer);
  }
  saloonRoom.append(bar);
  saloonRoom.addEventListener("close", () => {
    saloon.closed();
    if (current === saloonRoom) current = null;
  });
  root.querySelector('[data-camp-destination="camp-collection-room"]').insertAdjacentHTML("afterend",
    '<button type="button" data-camp-destination="night-shift-saloon">야간 근무 살롱</button>');

  const practice = rooms.get("camp-practice").content;
  const replays = document.createElement("details");
  replays.innerHTML = "<summary>도전 리플레이</summary>";
  replays.append(byId("camp-experiment"));
  practice.append(replays, wizard);

  for (const key of ["camp-rivals-title", "camp-bounties-title"]) {
    rooms.get(key).content.insertAdjacentHTML("afterbegin", '<p class="outpost-trail-lock">트레일을 끝내면 이 대결이 열립니다.</p>');
  }
  for (const [target, {room}] of rooms) {
    const control = root.querySelector(`[data-camp-destination="${target}"]`);
    room.id = `room-for-${target}`;
    control.setAttribute("aria-haspopup", "dialog");
    control.setAttribute("aria-controls", room.id);
  }

  function close() {
    current?.close();
    current = null;
  }

  function show(room, control) {
    if (room.open) return;
    close();
    control.focus({preventScroll: true});
    room.showModal();
    current = room;
    if (room === saloonRoom) saloon.opened();
  }

  function open(id, control = root.querySelector(`[data-camp-destination="${id}"]`)) {
    const entry = rooms.get(id);
    if (!entry) return false;
    show(entry.room, control);
    return true;
  }

  function dressNotices(trailComplete) {
    for (const [list, cards] of [
      [byId("camp-rivals"), RIVALS.map(({id}) => RIVAL_ART[id])],
      [byId("camp-bounties"), BOUNTIES.map(({boss}) => boss)],
    ]) {
      const content = list.closest(".outpost-room");
      content.querySelector(".outpost-trail-lock").hidden = trailComplete;
      for (const [index, button] of [...list.querySelectorAll("button")].entries()) {
        const art = cardArtwork(cards[index]);
        if (!art) continue;
        art.classList.add("outpost-portrait");
        button.prepend(art);
        button.querySelector(".sd-note").classList.toggle("outpost-lock-note", !trailComplete);
      }
    }
  }

  return {
    close, open, dressNotices,
    // ?saloon=review: the normal Saloon entry, with the recorded room set to the archived decision first.
    // Without a decision that checks out, the room opens at its usual start.
    openSaloonReview() {
      saloon.review();
      return open("night-shift-saloon");
    },
    restoreFocus(control) {
      const room = control.closest(".camp-outpost");
      if (!room) return false;
      const opener = root.querySelector(`[aria-controls="${room.id}"]`);
      show(room, opener);
      for (let group = control.parentElement; group !== room; group = group.parentElement) {
        if (group.matches("details")) group.open = true;
      }
      control.focus();
      return true;
    },
    wizardInCamp() { if (wizard.parentElement !== practice) practice.append(wizard); },
    wizardOnItsOwn() { close(); root.append(wizard); },
  };
}
