// The Card Forge shelf in the Saloon drawer. It shows the one recorded Card Forge run exactly as the
// coordinator wrote it (docs/evidence/player-card-forge/showcase.json, null until a run is recorded) and
// lets a player write their own card idea and download it as request.txt.
// The page stores nothing, calls no network, grants no reward and never marks a draft verified:
// only the recorded verifier outcome is shown, and a player's own request stays pending.
import {TYPES} from "../game/showdown/cards.js";
import SHOWCASE from "../../docs/evidence/player-card-forge/showcase.json" with {type: "json"};

export const REQUEST_MAX = 500;
export const REQUEST_FILE = "request.txt";
export const PREPARE_STEP = `node scripts/card-forge.mjs prepare ${REQUEST_FILE}`;
// Bounds for the recorded showcase. A value outside them means the record is not shown at all.
export const TEXT_MAX = 2000;
export const NAME_MAX = 80;
export const LINE_MAX = 300;
export const STAT_MAX = 99;
export const CHECKS_MAX = 24;
export const PENDING_NOTE = `다운로드를 시작했습니다: ${REQUEST_FILE}. 요청은 검증 대기 중입니다. 이 페이지는 카드를 검사할 수 없으니 아래 단계를 실행하세요.`;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const isText = (s, max) => typeof s === "string" && s.trim().length > 0 && s.length <= max;
const isStat = (n) => Number.isInteger(n) && n >= 0 && n <= STAT_MAX;
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const gamesWord = (n) => `${n.toLocaleString("en-US")} 게임${n === 1 ? "" : "s"}`;

// Pure: the showcase record as the shelf shows it. {status: "none"} when no run is recorded,
// {status: "invalid"} when any field is missing, mistyped or out of bounds, else {status: "ok", ...}.
// `verified` is taken only as a real boolean, so a string "true" is rejected rather than trusted.
export function forgeView(raw, types = TYPES) {
  if (raw === null || raw === undefined) return {status: "none"};
  const d = raw?.draft;
  const ok = isRecord(raw) && isText(raw.request, TEXT_MAX) && isRecord(d)
    && isText(d.name, NAME_MAX) && isText(d.baseCard, NAME_MAX)
    && isStat(d.attack) && isStat(d.health) && isStat(d.stars)
    && typeof raw.verified === "boolean" && Number.isInteger(raw.games) && raw.games >= 0
    && isText(raw.source, LINE_MAX)
    && Array.isArray(raw.checks) && raw.checks.length <= CHECKS_MAX && raw.checks.every((c) => isText(c, LINE_MAX));
  if (!ok) return {status: "invalid"};
  const base = Object.hasOwn(types, d.baseCard) ? types[d.baseCard] : null;
  return {
    status: "ok", request: raw.request, name: d.name, baseCard: d.baseCard, baseName: base?.name ?? null,
    attack: d.attack, health: d.health, stars: d.stars,
    verified: raw.verified, games: raw.games, source: raw.source, checks: [...raw.checks],
  };
}

// Pure: the verifier outcome in words, straight from the record.
export function verdictText(view) {
  return view.verified
    ? `검증기가 이 초안을 통과시켰습니다. 시간: ${gamesWord(view.games)}.`
    : `검증기가 이 초안을 통과시키지 않았습니다. 기록: ${gamesWord(view.games)}.`;
}

// Pure: the showcase card, or an honest note when there is nothing valid to show. All text is escaped.
export function showcaseHtml(view) {
  if (view.status === "none") {
    return `<p class="forge-empty">기록된 카드 포지 실행이 아직 없어 소개할 카드가 없습니다. 아래에 직접 아이디어를 적어볼 수 있습니다.</p>`;
  }
  if (view.status !== "ok") {
    return `<p class="forge-empty">기록된 카드 포지 결과에 빠진 항목이 있거나 값이 범위를 벗어나 표시할 내용이 없습니다.</p>`;
  }
  const base = view.baseName ?? view.baseCard;
  const portrait = view.baseName
    ? `<span class="forge-portrait" aria-hidden="true" data-ledger-portrait="${esc(view.baseCard)}"></span>`
    : `<span class="forge-portrait forge-portrait-missing" aria-hidden="true">${esc(base.slice(0, 1).toUpperCase())}</span>`;
  const stat = (label, n) => `<div><dt>${label}</dt><dd>${n}</dd></div>`;
  const checks = view.checks.length
    ? `<ul class="forge-checks">${view.checks.map((c) => `<li>${esc(c)}</li>`).join("")}</ul>`
    : `<p class="sd-note">기록에 나열된 검사가 없습니다.</p>`;
  return `<figure class="forge-card" data-verified="${view.verified}">
    <figcaption>
      <span class="forge-label">플레이어의 요청</span>
      <blockquote class="forge-request" style="white-space: pre-wrap">${esc(view.request)}</blockquote>
    </figcaption>
    <div class="forge-face">
      ${portrait}
      <strong class="forge-name">${esc(view.name)}</strong>
      <span class="forge-base">기반 카드: ${esc(base)}</span>
      <dl class="forge-stats">${stat("공격력", view.attack)}${stat("체력", view.health)}${stat("별", view.stars)}</dl>
    </div>
    <p class="forge-verdict">${esc(verdictText(view))}</p>
    ${checks}
    <p class="sd-note">출처 <code>${esc(view.source)}</code></p>
  </figure>`;
}

// Pure: the player's idea, ready for request.txt. Line endings become \n, control characters other
// than tab and newline are dropped, and the ends are trimmed. Empty or too long is refused.
export function cleanRequest(input) {
  const text = String(input ?? "").replace(/\r\n?/g, "\n").replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, "").trim();
  if (!text) return {ok: false, text: "", error: "먼저 카드 아이디어를 적어주세요."};
  if (text.length > REQUEST_MAX) return {ok: false, text, error: `아이디어는 ${REQUEST_MAX}자 이하로 적어주세요.`};
  return {ok: true, text};
}

export const requestFileText = (text) => `${text}\n`;
export const counterText = (value) => `${String(value ?? "").length}/${REQUEST_MAX}자`;

// Pure: the whole shelf. One form, one button, no stored state.
export function shelfHtml(view) {
  return `<section class="forge-shelf-showcase" aria-labelledby="forge-showcase-title">
    <h3 id="forge-showcase-title">카드 포지</h3>
    ${showcaseHtml(view)}
  </section>
  <section class="forge-shelf-own" aria-labelledby="forge-own-title">
    <h4 id="forge-own-title">나만의 카드 만들기</h4>
    <form class="forge-form" novalidate>
      <label for="forge-request">카드를 영어 문장으로 설명해 주세요</label>
      <textarea id="forge-request" name="request" rows="4" maxlength="${REQUEST_MAX}" spellcheck="true"
        aria-describedby="forge-request-count forge-request-help"></textarea>
      <p id="forge-request-count" class="sd-note">${counterText("")}</p>
      <p id="forge-request-help" class="sd-note">아무것도 전송되거나 저장되지 않습니다. 버튼은 입력한 내용을 다음 파일로 저장합니다: ${REQUEST_FILE}.</p>
      <button type="submit">다운로드 ${REQUEST_FILE}</button>
    </form>
    <p class="forge-status" role="status" aria-live="polite"></p>
    <div class="forge-pending" hidden>
      <span class="forge-label">검증 대기 중</span>
      <blockquote class="forge-pending-request" style="white-space: pre-wrap"></blockquote>
    </div>
    <ol class="forge-steps">
      <li>${REQUEST_FILE} 파일을 게임 폴더의 <code>scripts/</code> 옆에 두세요.</li>
      <li><code>${esc(PREPARE_STEP)}</code> 를 실행해 요청을 준비하세요.</li>
      <li>Kiro에서 기본 카드 포지 워크플로를 고르세요. 준비한 요청이 유지되며, 준비한 요청이 없으면 기록된 예시를 사용합니다.</li>
      <li>초안은 검증기가 통과시킨 경우에만 검증된 것으로 인정됩니다. 이 페이지는 검증 표시를 하지 않으며 보상도 주지 않습니다.</li>
    </ol>
  </section>`;
}

// DOM: offers request.txt as a download. Returns false when the browser cannot.
function saveRequest(doc, text) {
  try {
    const urls = globalThis.URL;
    if (!doc?.body || typeof Blob !== "function" || typeof urls?.createObjectURL !== "function") return false;
    const url = urls.createObjectURL(new Blob([requestFileText(text)], {type: "text/plain;charset=utf-8"}));
    const link = Object.assign(doc.createElement("a"), {href: url, download: REQUEST_FILE, hidden: true});
    doc.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => urls.revokeObjectURL(url), 0);
    return true;
  } catch {
    return false;
  }
}

// DOM: fills the Saloon drawer's `host`. `portrait(cardId)` is the optional atlas helper the drawer
// already uses; only a card id the catalog knows reaches it.
export function mountForgeShelf(host, {showcase = SHOWCASE, portrait = null} = {}) {
  if (!host || typeof host.querySelector !== "function") return null;
  const view = forgeView(showcase);
  host.classList?.add("forge-shelf");
  host.innerHTML = shelfHtml(view);
  const q = (selector) => host.querySelector(selector);

  if (view.status === "ok" && view.baseName && typeof portrait === "function") {
    try {
      const image = portrait(view.baseCard);
      if (image) {
        image.setAttribute?.("aria-hidden", "true");
        q(".forge-portrait").replaceChildren(image);
      }
    } catch { /* the empty frame stays */ }
  }

  const form = q(".forge-form"), field = q("#forge-request"), counter = q("#forge-request-count");
  const status = q(".forge-status"), pending = q(".forge-pending"), pendingRequest = q(".forge-pending-request");
  let lastRequest = null;
  field.addEventListener("input", () => { counter.textContent = counterText(field.value); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const result = cleanRequest(field.value);
    if (!result.ok) {
      field.setAttribute("aria-invalid", "true");
      status.textContent = result.error;
      field.focus();
      return;
    }
    field.removeAttribute("aria-invalid");
    if (!saveRequest(host.ownerDocument ?? globalThis.document, result.text)) {
      status.textContent = `이 브라우저가 파일을 저장하지 못했습니다. 아이디어를 다음 파일에 직접 복사하세요: ${REQUEST_FILE} `;
      return;
    }
    lastRequest = result.text;
    pendingRequest.textContent = result.text;
    pending.hidden = false;
    status.textContent = PENDING_NOTE;
  });

  return {view, pendingRequest: () => lastRequest};
}
