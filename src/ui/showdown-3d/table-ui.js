import { EFFECTS, KEYWORDS, TYPES, typeOf, tributes } from "../../game/showdown/cards.js";
import { portrait as cardArtwork } from "./gallery.js";

export { cardArtwork };

const icons = { troop: "◆", spell: "✦", trap: "△", gear: "◇", location: "▰" };

const el = (tag, cls, word) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (word) node.textContent = word;
  return node;
};
function paintedFace(type) {
  const card = TYPES[type];
  const face = el("span", "table-card-face");
  face.setAttribute("aria-hidden", "true");
  const title = el("span", "table-card-title", card.name);
  const artwork = cardArtwork(type);
  const notes = el("span", "table-card-copy");
  const kind = {troop: "부대", spell: "주문", trap: "함정", gear: "장비", location: "장소"}[card.kind] ?? card.kind;
  const category = el("span", "table-card-kind", icons[card.kind] + " " + kind);
  if (card.kind === "troop") {
    const stats = el("span", "table-card-stats");
    stats.append(el("span", "", card.attack + " 공격력"), el("span", "", card.health + " ●"));
    const cost = tributes(type + "-1");
    notes.append(category, stats);
    if (cost || card.keys?.length)
      notes.append(
        el(
          "span",
          "table-card-rule",
          [...(card.keys ?? []).map((key) => KEYWORDS[key][0]), ...(cost ? [cost + " 제물"] : [])].join(" · "),
        ),
      );
  } else {
    notes.append(category, el("span", "table-card-rule", EFFECTS[card.effect].text));
  }
  face.append(title);
  if (artwork) face.append(artwork);
  face.append(notes);
  return face;
}

export function paintCardFaces(root, selector) {
  for (const card of root.querySelectorAll(selector)) {
    if (card.querySelector(".table-card-face")) continue;
    const type = card.dataset.face ?? card.dataset.choose ?? card.dataset.opened ?? typeOf(card.dataset.card);
    const original = el("span", "table-card-original");
    original.append(...card.childNodes);
    card.append(original, paintedFace(type));
    card.classList.add("table-card-painted");
    card.classList.toggle("table-captured", type.startsWith("cowboy-captured-"));
    card.title = original.textContent.replace(/\s+/g, " ").trim();
  }
}

export function bindTableUI(root) {
  const table = root.querySelector("#sd-table");
  const field = root.querySelector("#sd-field");
  const prompt = el("p", "table-selection");
  const turn = el("p", "table-turn");
  const headline = el("p", "table-award");
  for (const node of [prompt, turn, headline]) node.setAttribute("aria-hidden", "true");
  field.append(turn, prompt, headline);
  const nav = root.querySelector("header");
  const goHome = nav.querySelector("#sd-home");
  const status = root.querySelector("#sd-status");
  const originalPrompt = root.querySelector("#sd-prompt");
  const hand = root.querySelector("#sd-hand");
  const result = root.querySelector("#sd-result");

  function finish() {
    headline.hidden = !root.classList.contains("table-resolved");
    hand.inert = !headline.hidden;
  }

  return {
    paint(view) {
      const ended = Boolean(view.result);
      table.classList.toggle("table-resolved", ended);
      root.classList.toggle("table-resolved", ended);
      paintCardFaces(root, "#sd-hand [data-card], #sd-result [data-choose]");
      const handCards = [...hand.querySelectorAll("[data-card]")];
      handCards.forEach((button, i) => {
        const fan = i - (handCards.length - 1) / 2;
        button.style.setProperty("--fan", fan * 2.1 + "deg");
        button.style.setProperty("--lift", Math.abs(fan) * 3 + "px");
      });
      const added = [...result.querySelectorAll(".sd-good")].find((line) =>
        line.textContent.startsWith("추가됨 "),
      );
      const location = field.dataset.battlefield !== "boot-hill" ? status.textContent.split(" · ")[0] : "";
      turn.textContent = location ? `${location} · ${view.turn}턴` : `${view.turn}턴`;
      turn.hidden = ended;
      headline.textContent = result.querySelector("[data-choose]")
        ? "카드를 고르세요"
        : (added?.textContent.split(":")[0] ?? status.textContent.split(" · ")[0]);
      goHome.textContent = "캠프";
      if (!ended && /^(선택|수호 부대|적 부대가 없습니다)/.test(originalPrompt.textContent)) {
        const text = originalPrompt.textContent.split(".")[0];
        prompt.textContent = text + (text.endsWith("?") ? "" : ".");
        prompt.hidden = false;
      } else {
        prompt.hidden = true;
      }
      finish();
    },
    restore() {
      hand.inert = false;
      table.classList.remove("table-resolved");
      root.classList.remove("table-resolved");
      goHome.textContent = "캠프로 돌아가기";
      prompt.hidden = turn.hidden = headline.hidden = true;
    },
  };
}
