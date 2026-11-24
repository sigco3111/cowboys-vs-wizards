// The Night Shift saloon: a Camp room that replays how the Kiro shift ran.
// Public builds replay the checked-in recording only. The opt-in ?saloon=live mode polls
// same-origin /night-shift/events, and only from an http: loopback page while the room is open.
// ?saloon=review (opened by the Camp) is recorded mode at the archived decision's step; it never polls.
// Every record passes the shared browser-safe cleanFeed before it reaches state or the DOM.
// Nothing here changes cards, rules or stats: a cast is a scratch proposal, and only
// patch records (merged on main) appear as patch notes.
// Ambient activity records are high-frequency hook notes. They only stir the matching
// character and never ring the bell, cast, refuse, or count as a replay step.
// A proposal that is the archived Billy change also shows that change's decision, rule and receipt
// on the notice board (proposalDecision below), derived from the checked-in seat audit files.
import {cleanFeed} from "../night-shift-events.js";
import {activityLabel} from "../night-shift-presence.js";
import {TYPES} from "../../game/showdown/cards.js";
import {BOUNTIES} from "../../game/showdown/progress.js";
import {mountRepairReplay} from "../field-trial-replay.js";
import {seatAuditOk} from "../billy-replay.js";
import SEAT_AUDIT from "../../../docs/evidence/billy-seat-audit/result.json" with {type: "json"};
import SEAT_PROTOCOL from "../../../docs/evidence/billy-seat-audit/protocol.json" with {type: "json"};

export const RECORDED_LABEL = "녹화된 Kiro 근무";
export const LIVE_LABEL = "이 컴퓨터의 실시간 Kiro 근무";
export const EVENTS_PATH = "/night-shift/events";
export const HISTORY_LIMIT = 60;
export const HISTORY_DOM = 24;
export const FEED_LIMIT = 400;
export const ACTIVITY_LIMIT = 40;
export const STEP_MS = 1700;
export const POLL_MS = 3000;
// Faster poll for the opted-in live room on a visible loopback page only (measured in
// docs/evidence/kiro-saloon-live-witness.md); a hidden page keeps POLL_MS. Recorded mode never polls.
export const LIVE_POLL_MS = 1000;
export const RETRY_MS = 8000;
const BELL_MS = 1500;
const STIR_MS = 700;
const LIVE_QUEUE = 6;
const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// What each hook rule refuses, in the order the Ledger lists them. None of them is a stop:
// a stop that passes its checks is the bell.
export const BLOCK_REASONS = Object.freeze({
  balancer: "작업 범위를 벗어난 도구 호출이나 파일 쓰기를 거부함",
  completion: "작업을 확인하기 전에 올린 성공 보고를 거부함",
  tasks: "검증되지 않은 작업의 완료 처리를 거부함",
});
export const RULE_NAMES = Object.freeze({balancer: "균형 수문장", completion: "완료 점검", tasks: "작업 점검"});

// Four roles, each tied to the event kinds it acts out. Art comes from existing card paintings.
export const ACTORS = Object.freeze([
  {id: "sheriff", card: "cowboy-sheriff", role: "보안관", kinds: ["block"]},
  {id: "wizard", card: "wizard-wizard", role: "마법사", kinds: ["cast"]},
  {id: "hunter", card: "cowboy-ranger", role: "현상금 사냥꾼", kinds: ["wanted"]},
  {id: "singularity", card: "wizard-singularity", role: "싱귤래리티", kinds: ["job", "bell"]},
]);
const ACTOR_IDS = new Set(ACTORS.map((actor) => actor.id));

export function actorFor(kind) {
  return ACTORS.find((actor) => actor.kinds.includes(kind))?.id ?? null;
}

export const cardName = (id) => TYPES[id]?.name ?? String(id).replace(/-/g, " ");
const sign = (before, after) => (after > before ? "up" : after < before ? "down" : "same");
export const shortCommit = (commit) => String(commit).slice(0, 7);
const titleCase = (slug) => String(slug).split("-").filter(Boolean).map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");

// Pure: a Wanted event names a bounty id from the catalog (lantern-wraith), not a card id.
// `card` is the boss painting to show, or null for a bounty the catalog does not know yet.
export function wantedPoster(slug) {
  const bounty = BOUNTIES.find((each) => each.id === slug);
  if (bounty && TYPES[bounty.boss]) return {slug, name: bounty.name, card: bounty.boss};
  return {slug, name: bounty?.name ?? titleCase(slug), card: null};
}

// Pure: what the actor did, without the actor's name (shown under the actor's own portrait).
export function deed(event) {
  switch (event.kind) {
    case "job": return "일감을 내줌";
    case "block": return BLOCK_REASONS[event.rule] ?? "알 수 없는 요청을 거부함";
    case "cast": return `${cardName(event.card)} ${FIELD_KO(event.field)} ${event.before} → ${event.after} 제안 (임시안, 병합 안 됨)`;
    case "wanted": return `현상 수배 게시: ${wantedPoster(event.boss).name}`;
    case "bell": return "종을 울림: 중단이 점검을 통과함";
    default: return "";
  }
}

// Pure: one plain sentence for the status line and the history.
export function describe(event) {
  if (event.kind === "patch") {
    return `${cardName(event.card)} ${FIELD_KO(event.field)} ${event.before} → ${event.after}, main에 병합됨 ${shortCommit(event.commit)}`;
  }
  const actor = ACTORS.find((each) => each.id === actorFor(event.kind));
  return actor ? `${actor.role}: ${deed(event)}` : "알 수 없는 기록";
}

// Pure: the ambient note for one activity record, or "" if the shared label has nothing.
export function ambientText(record) {
  try {
    return String(activityLabel(record) ?? "");
  } catch {
    return "";
  }
}

const byTime = (a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

function unique(records, limit = FEED_LIMIT) {
  const seen = new Map();
  for (const record of records) if (!seen.has(record.id)) seen.set(record.id, record);
  return [...seen.values()].sort(byTime).slice(-limit);
}

// Pure: validate a {events, patches, activity} response with the shared cleanFeed.
// Shift events only from events, patches only from patches, ambient notes only from activity.
export function normalizeFeed(input, clean = cleanFeed) {
  const result = (input && typeof input === "object" ? clean(input, FEED_LIMIT) : null) ?? {};
  const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
  return {
    events: unique(list(result.events).filter((e) => actorFor(e.kind))),
    patches: unique(list(result.patches).filter((p) => p.kind === "patch")),
    activity: unique(list(result.activity).filter((a) => a.kind === "activity" && ACTOR_IDS.has(a.actor)), ACTIVITY_LIMIT),
  };
}

// Pure: fold a fresh poll into what is known. `added` lists shift events whose ids were not seen;
// `addedActivity` lists unseen activity newer than anything known, so a repeated poll stirs nobody.
export function mergeFeed(known, incoming) {
  const ids = new Set(known.events.map((e) => e.id));
  const activityIds = new Set(known.activity.map((a) => a.id));
  const newest = known.activity.at(-1)?.at ?? "";
  return {
    events: unique([...known.events, ...incoming.events]),
    patches: unique([...known.patches, ...incoming.patches]),
    activity: unique([...known.activity, ...incoming.activity], ACTIVITY_LIMIT),
    added: incoming.events.filter((e) => !ids.has(e.id)),
    addedActivity: incoming.activity.filter((a) => !activityIds.has(a.id) && a.at >= newest),
  };
}

// Pure: the latest ambient record per actor, up to `until` (an ISO time) when given.
export function latestActivity(activity, until = null) {
  const latest = {sheriff: null, wizard: null, hunter: null, singularity: null};
  for (const record of [...activity].sort(byTime)) {
    if (until !== null && record.at > until) break;
    if (record.actor in latest) latest[record.actor] = record;
  }
  return latest;
}

export function emptyShift() {
  return {history: [], wanted: null, proposal: null, sheriffLog: [], jobs: 0, bells: 0, last: null,
    actors: {sheriff: null, wizard: null, hunter: null, singularity: null}};
}

// Pure: the saloon after one more event. Last Wanted, the last proposal and the Sheriff log persist.
export function applyEvent(state, event) {
  const actor = actorFor(event.kind);
  if (!actor) return state;
  const next = {...state, last: event, history: [...state.history, event].slice(-HISTORY_LIMIT),
    actors: {...state.actors, [actor]: event}};
  if (event.kind === "job") next.jobs = state.jobs + 1;
  if (event.kind === "bell") next.bells = state.bells + 1;
  if (event.kind === "wanted") next.wanted = event.boss;
  if (event.kind === "block") next.sheriffLog = [...state.sheriffLog, event].slice(-HISTORY_LIMIT);
  if (event.kind === "cast") {
    next.proposal = {card: event.card, field: event.field, before: event.before, after: event.after,
      change: sign(event.before, event.after), at: event.at, id: event.id};
  }
  return next;
}

export const replayTo = (events, count) => events.slice(0, count).reduce(applyEvent, emptyShift());

// Pure: refusal counts per rule plus the chronological refusals, for the Sheriff's Ledger.
export function ledgerBlocks(events) {
  const blocks = events.filter((e) => e.kind === "block").sort(byTime);
  const counts = Object.fromEntries(Object.keys(BLOCK_REASONS).map((rule) => [rule, 0]));
  for (const block of blocks) if (block.rule in counts) counts[block.rule] += 1;
  return {counts, blocks};
}

// Pure: "recorded", "live", or "recorded-only" when live was asked for away from an http: loopback page.
export function shiftMode(loc) {
  if (!loc || new URLSearchParams(loc.search ?? "").get("saloon") !== "live") return "recorded";
  return loc.protocol === "http:" && LOOPBACK.has(loc.hostname) ? "live" : "recorded-only";
}

export const clockTime = (at) => `${at.slice(11, 16)} UTC`;

// Pure: the wait before the next feed poll. Only the live room on a visible page polls at
// LIVE_POLL_MS; anything else (hidden page, unknown visibility, other modes) waits POLL_MS.
export function pollDelay(mode, doc) {
  return mode === "live" && doc?.visibilityState === "visible" ? LIVE_POLL_MS : POLL_MS;
}

export const COMMIT_BASE = "https://github.com/alejandro-publius/cowboys-vs-wizards/commit/";
const FULL_SHA = /^[0-9a-f]{40}$/;
const UTC_STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

// Pure: what one merged patch note shows, or null when its commit is not a full lowercase SHA
// or its time is not a real UTC timestamp. The link is built only from a validated SHA.
export function patchNote(patch) {
  const commit = patch?.commit, at = patch?.at;
  if (typeof commit !== "string" || !FULL_SHA.test(commit)) return null;
  if (typeof at !== "string" || !UTC_STAMP.test(at)) return null;
  const date = new Date(at);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 19) !== at.slice(0, 19)) return null;
  return {
    change: `${cardName(patch.card)} ${FIELD_KO(patch.field)} ${patch.before} → ${patch.after}`,
    commit,
    label: `main 커밋 ${shortCommit(commit)}`,
    href: `${COMMIT_BASE}${commit}`,
    at,
    when: `${at.slice(0, 10)} ${at.slice(11, 16)} UTC`,
  };
}

// Pure: the UTC day, or first and last UTC days, of the shift events already passed through
// normalizeFeed. "" when there is no event with a real timestamp, so no date is ever invented.
export function recordedDates(events) {
  const days = (Array.isArray(events) ? events : [])
    .map((event) => new Date(typeof event?.at === "string" ? event.at : NaN))
    .filter((date) => Number.isFinite(date.getTime()))
    .map((date) => date.toISOString().slice(0, 10))
    .sort();
  if (!days.length) return "";
  const first = days[0], last = days.at(-1);
  return first === last ? `${first} UTC` : `${first} – ${last} UTC`;
}

export const IDLE_CAPTION = "재생을 눌러 녹화된 근무를 보세요.";
const FIELD_KO = (f) => ({attack: "공격력", health: "체력", stars: "별", cost: "비용"})[f] ?? f;
const CHANGE_WORDS = {up: "상향", down: "하향", same: "변동 없음"};

// Pure: the Wizard's proposal in words, direction included, so it never relies on colour alone.
export function proposalText(proposal) {
  if (!proposal) return "아직 제안 없음";
  return `${cardName(proposal.card)}: ${FIELD_KO(proposal.field)} ${proposal.before} → ${proposal.after}, ${CHANGE_WORDS[proposal.change] ?? "변경"}`;
}

// --- The archived decision for one proposal (docs/evidence/billy-seat-audit) ---
// Kiro CLI proposed Billy attack 2 → 1; the reviewer passed it, and the frozen 100,000-duel audit measures that
// one change. It awaits design approval and is not applied. It is a separate run from Kiro's six free-choice
// edits, which the reviewer rejected. The browser cannot read the written contract, so
// tests/match/saloon-showcases.test.js checks BALANCE_RULE against the contract parser and the derived shares
// against scripts/billy-balance-gate.mjs.
export const BALANCE_RULE = Object.freeze({source: ".kiro/specs/night-shift-balance-contract/requirements.md",
  band: Object.freeze([45, 55]), seatTolerancePp: 1});
export const DECISION_NOTES = "docs/evidence/billy-seat-audit/README.md";
export const DECISION_RECHECK = "node scripts/billy-balance-gate.mjs --arm candidate";
export const DECISION_SEPARATE = "이 변경에 대한 보관된 결과입니다. 검토자가 거부한 Kiro의 자유 선택 수정 여섯 건에는 속하지 않습니다.";
const AUDIT_SEATS = ["cowboy", "wizard"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const pct3 = (n) => n.toFixed(3);
const inBand = (value, [low, high]) => value >= low && value <= high;

// Pure: faction shares and the opener's distance from 50% for one arm, in percent. Draws count for neither faction.
function armShares(seat, arm) {
  let games = 0, cowboy = 0, wizard = 0, first = 0;
  for (const side of AUDIT_SEATS) {
    const cell = seat.byFirst[side];
    games += cell.gamesPerArm;
    cowboy += cell[arm].cowboy;
    wizard += cell[arm].wizard;
    first += cell[arm][side];
  }
  return {games, cowboyShare: (100 * cowboy) / games, wizardShare: (100 * wizard) / games, seatSkew: Math.abs((100 * first) / games - 50)};
}

// Pure: the archived decision for a proposal {card, field, before, after}, or null. Shown only for the audited
// change, while this build's card still starts from it, when the counts add up and name the protocol's source,
// and when the candidate meets both written requirements. Every figure comes from the audit files.
export function proposalDecision(proposal, {seat = SEAT_AUDIT, protocol = SEAT_PROTOCOL, types = TYPES, rule = BALANCE_RULE} = {}) {
  if (!proposal || !protocol || typeof protocol !== "object") return null;
  const {card, field, baseline: from, candidate: to} = protocol;
  if (proposal.card !== card || proposal.field !== field || proposal.before !== from || proposal.after !== to) return null;
  const live = types?.[card]?.[field];
  if (!Number.isInteger(live) || live !== from || typeof types[card].name !== "string") return null;
  if (!seatAuditOk(seat) || seat.deals !== protocol.deals || String(protocol.seats) !== String(AUDIT_SEATS)) return null;
  if (!/^[0-9a-f]{40}$/.test(seat.sourceCommit ?? "") || seat.sourceCommit !== protocol.sourceCommit) return null;
  if (!/^[0-9a-f]{64}$/.test(seat.protocolSha256 ?? "")) return null;
  const band = rule?.band, tolerance = rule?.seatTolerancePp;
  if (!Array.isArray(band) || band.length !== 2 || !band.every(Number.isFinite) || band[0] > band[1] || !Number.isFinite(tolerance)) return null;
  const before = armShares(seat, "baseline"), after = armShares(seat, "candidate");
  // The archive records a passing proposal. Counts that fail the written rule are never shown as one.
  if (!inBand(after.cowboyShare, band) || !inBand(after.wizardShare, band) || after.seatSkew > before.seatSkew + tolerance) return null;
  const name = types[card].name, at = (value) => `${FIELD_KO(field)} ${value}`;
  const where = (share) => (inBand(share, band) ? "범위 안" : "범위 밖");
  return {
    change: `${name} ${FIELD_KO(field)} ${from} → ${to}`,
    status: `문서화된 균형 규칙을 통과했고 디자인 승인을 기다립니다. 이 빌드에서 ${name}의 ${at(live)}입니다.`,
    announce: "게시판 결정: 균형 규칙 통과, 디자인 승인 대기.",
    rules: [
      `NSB-1, 각 진영의 승률 ${band[0]}–${band[1]}%: 카우보이는 ${at(from)}에서 ${pct3(before.cowboyShare)}%(${where(before.cowboyShare)}), ${at(to)}에서 ${pct3(after.cowboyShare)}%(범위 안)를 기록했습니다.`,
      `NSB-2, 선공의 50% 이탈 폭은 최대 ${tolerance}포인트까지만 커질 수 있습니다: ${at(from)}에서 ${pct3(before.seatSkew)}, ${at(to)}에서 ${pct3(after.seatSkew)} (허용 범위 내).`,
    ],
    duels: before.games + after.games,
    sourceCommit: seat.sourceCommit,
    protocolSha256: seat.protocolSha256,
    observed: {baseline: before, candidate: after},
  };
}

// Pure: the notice-board block for a decision, or "" for none. Words carry every outcome, never colour alone.
export function decisionHtml(decision) {
  if (!decision) return "";
  const d = decision;
  return `<h5>Kiro 제안 검토: ${esc(d.change)}</h5>
    <dl>
      <div><dt>결정</dt><dd>${esc(d.status)}</dd></div>
      <div><dt>규칙</dt><dd><ul>${d.rules.map((line) => `<li>${esc(line)}</li>`).join("")}</ul></dd></div>
      <div><dt>영수증</dt><dd>Kiro CLI 제안. 소스 <code>${esc(shortCommit(d.sourceCommit))}</code>에서 녹화된 Node 엔진 대결 ${d.duels.toLocaleString("en-US")}판, 프로토콜 <code>${esc(d.protocolSha256.slice(0, 7))}</code>. 재확인: <code>${esc(DECISION_RECHECK)}</code>. 메모: <code>${esc(DECISION_NOTES)}</code>.</dd></div>
    </dl>
    <p class="saloon-decision-note">${esc(DECISION_SEPARATE)}</p>`;
}

// Pure: the status line for one shift event. A proposal with an archived decision says where to read it.
export function eventCaption(event) {
  const decision = event?.kind === "cast" ? proposalDecision(event) : null;
  return decision ? `${describe(event)}. ${decision.announce}` : describe(event);
}

// Pure: the 1-based replay step of the first recorded proposal that has a validated archived decision, or 0
// when there is none (no recording, no proposal, or audit files that do not check out).
export function reviewStep(events, decide = proposalDecision) {
  const index = (Array.isArray(events) ? events : []).findIndex((event) => event?.kind === "cast" && decide(event));
  return index + 1;
}

// Pure: the recorded room's opening line. When a recorded proposal has an archived decision, it names that step.
export function idleCaption(events) {
  const step = reviewStep(events);
  return step ? `${IDLE_CAPTION} ${step}단계에서 Kiro의 카드 제안과 결정을 볼 수 있습니다.` : IDLE_CAPTION;
}

// Pure: the recorded room as it stands right after the review step (?saloon=review), built with the same reducer
// as stepping, or null when there is no validated decision to show.
export function reviewState(feed, decide = proposalDecision) {
  const events = Array.isArray(feed?.events) ? feed.events : [];
  const count = reviewStep(events, decide);
  if (!count) return null;
  const event = events[count - 1];
  return {count, event, shown: replayTo(events, count), ambient: latestActivity(Array.isArray(feed.activity) ? feed.activity : [], event.at)};
}

// Pure: ambient records that became an actor's latest between two latestActivity snapshots.
export function freshAmbient(before, after) {
  return ACTORS.filter(({id}) => after[id] && after[id].id !== before[id]?.id).map(({id}) => after[id]);
}

// Wraps the optional illustrated stage (saloon-stage.js). Creation or any later call that throws,
// or a missing method, turns the stage off and calls onFail once; the portrait room carries on.
const STAGE_METHODS = ["open", "close", "play", "activity", "reset"];
export function guardStage(createStage, host, onFail = () => {}) {
  let made = null;
  try {
    made = typeof createStage === "function" ? createStage(host) : null;
  } catch {
    made = null;
  }
  if (!made || typeof made !== "object" || !STAGE_METHODS.every((key) => typeof made[key] === "function")) return null;
  let failed = false;
  const fail = () => {
    if (failed) return;
    failed = true;
    try { made.close(); } catch { /* already broken; the portrait room takes over */ }
    onFail();
  };
  return {
    call(method, arg) {
      if (failed || !STAGE_METHODS.includes(method)) return false;
      try {
        made[method](arg);
        return true;
      } catch {
        fail();
        return false;
      }
    },
    fail,
    get failed() { return failed; },
  };
}

const ROOM_HTML = `
  <div class="saloon-theater">
    <div class="saloon-theater-host" aria-hidden="true" inert></div>
  </div>
  <div class="saloon-stage" data-actor="">
    <div class="saloon-wall">
      <figure class="saloon-wanted">
        <div class="saloon-wanted-art"></div>
        <figcaption><strong>현상 수배</strong><span class="saloon-wanted-name">게시된 현상금 없음</span></figcaption>
      </figure>
      <section class="saloon-board" aria-label="공지">
        <div class="saloon-proposal">
          <h4>임시 제안, 병합 안 됨</h4>
          <div class="saloon-target" data-change="none"><div class="saloon-target-art"></div><p class="saloon-target-stat">No proposal yet</p></div>
          <div class="saloon-decision" hidden></div>
        </div>
        <div class="saloon-patches">
          <h4>main에 병합됨</h4>
          <ul></ul>
        </div>
      </section>
      <div class="saloon-bell-post">
        <span class="saloon-bell" aria-hidden="true"></span>
        <span class="saloon-bell-note"></span>
      </div>
    </div>
    <ol class="saloon-actors"></ol>
  </div>
  <div class="saloon-controls">
    <p class="saloon-mode"><strong class="saloon-mode-label"></strong> <span class="saloon-mode-date" hidden></span> <span class="saloon-progress"></span></p>
    <div class="saloon-buttons">
      <button type="button" class="saloon-play">재생</button>
      <button type="button" class="saloon-step">한 단계</button>
      <button type="button" class="saloon-replay">처음부터 다시</button>
    </div>
    <p class="saloon-now" role="status" aria-live="polite"></p>
  </div>
  <details class="saloon-repair"></details>
  <details class="saloon-history">
    <summary>근무 기록</summary>
    <ol></ol>
  </details>`;

// Only known card ids reach the atlas; anything else gets a plain lettered tile.
function art(portrait, id, className) {
  const image = (id && TYPES[id] && portrait(id)) || Object.assign(document.createElement("span"), {className: "saloon-art-missing", textContent: cardName(id ?? "?").slice(0, 1).toUpperCase()});
  image.classList.add(className);
  image.setAttribute("aria-hidden", "true");
  return image;
}

function blankPoster() {
  const blank = Object.assign(document.createElement("span"), {className: "saloon-wanted-portrait saloon-wanted-blank"});
  blank.setAttribute("aria-hidden", "true");
  return blank;
}

function timeEl(at) {
  const time = document.createElement("time");
  time.dateTime = at;
  time.textContent = clockTime(at);
  return time;
}

function historyItem(event) {
  const item = document.createElement("li");
  item.dataset.kind = event.kind;
  item.append(timeEl(event.at), " ", describe(event));
  return item;
}

// DOM: fills a Camp room. `opened()`/`closed()` are called by the Camp dialog code.
// `createStage(host)` is the optional illustrated stage; without it, or when it returns null,
// throws or loses its graphics, the atlas portrait stage below is the whole room.
export function mountNightShiftSaloon({content, recording, portrait = () => null, ledger = null,
  loc = globalThis.location, fetchEvents = globalThis.fetch?.bind(globalThis), clean = cleanFeed,
  createStage = null, fieldTrial = undefined}) {
  const mode = shiftMode(loc);
  content.classList.add("saloon-room");
  content.innerHTML = ROOM_HTML;
  const q = (selector) => content.querySelector(selector);
  // "Replay the repair": a recorded field trial, separate from the shift feed and the stage.
  // Hidden when no fresh check and witness are recorded; `fieldTrial` defaults to FIELD_TRIAL.
  const repair = mountRepairReplay(q(".saloon-repair"), {trial: fieldTrial, portrait});
  const stage = q(".saloon-stage");
  const theater = q(".saloon-theater"), host = q(".saloon-theater-host"), controls = q(".saloon-controls");
  const play = q(".saloon-play"), step = q(".saloon-step"), replay = q(".saloon-replay");
  const now = q(".saloon-now"), progress = q(".saloon-progress");
  const decisionBox = q(".saloon-decision");
  const historyList = q(".saloon-history ol");
  const actorItems = new Map();
  for (const actor of ACTORS) {
    const item = document.createElement("li");
    item.className = `saloon-actor saloon-actor-${actor.id}`;
    item.dataset.actor = actor.id;
    const label = document.createElement("div");
    label.className = "saloon-actor-label";
    const role = document.createElement("strong");
    role.textContent = actor.role;
    const doing = document.createElement("output");
    doing.className = "saloon-actor-doing";
    const ambient = document.createElement("p");
    ambient.className = "saloon-actor-ambient";
    label.append(role, doing, ambient);
    item.append(art(portrait, actor.card, "saloon-actor-art"), label);
    q(".saloon-actors").append(item);
    actorItems.set(actor.id, {item, doing, ambient});
  }
  q(".saloon-mode-label").textContent = mode === "live" ? LIVE_LABEL : RECORDED_LABEL;
  q(".saloon-buttons").hidden = mode === "live";

  // Live mode starts empty so the live board and Ledger never mix in the recording.
  let feed = normalizeFeed(mode === "live" ? null : recording, clean);
  // The recording never changes after mount; live mode shows no date.
  const dates = mode === "live" ? "" : recordedDates(feed.events);
  const dateNote = q(".saloon-mode-date");
  dateNote.textContent = dates ? `· ${dates}` : "";
  dateNote.hidden = !dates;
  // The recorded room's opening line names the step with Kiro's proposal and its decision.
  const idle = mode === "live" ? IDLE_CAPTION : idleCaption(feed.events);
  let count = 0; // recorded events played so far
  let shown = emptyShift();
  let ambient = latestActivity([]);
  let historyKey = "";
  let playing = false, isOpen = false, generation = 0, controller = null, offline = false, caughtUp = false;
  const timers = new Set();
  const later = (fn, ms) => {
    const id = setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  const cancel = (id) => { clearTimeout(id); timers.delete(id); };
  let stepTimer = null, bellTimer = null, pollTimer = null, queueTimer = null;
  const queue = [];

  // The illustrated stage sits on top with the controls right under it; the portrait stage
  // then shrinks to labels and notices. Moving the controls keeps keyboard focus where it was.
  let theaterStage = null, stageTried = false;
  function setView(view) {
    content.dataset.view = view;
    theater.hidden = view !== "3d";
    const focused = controls.contains(document.activeElement) ? document.activeElement : null;
    if (view === "3d") theater.after(controls); else stage.after(controls);
    if (focused && document.activeElement !== focused) focused.focus({preventScroll: true});
  }
  function dropStage() {
    if (!theaterStage) return;
    const lost = theaterStage;
    theaterStage = null;
    lost.fail();
    setView("portrait");
  }
  function ensureStage() {
    if (stageTried) return;
    stageTried = true;
    theaterStage = guardStage(createStage, host, dropStage);
    if (theaterStage) host.addEventListener("webglcontextlost", dropStage, true);
    else setView("portrait");
    // Steps already on the board before the first visit (?saloon=review) reach the stage before it opens,
    // so they show as finished, without motion.
    for (const event of feed.events.slice(0, count)) toStage("play", event);
  }
  const toStage = (method, arg) => theaterStage?.call(method, arg);
  // Host stays visible until the first visit so the stage can measure it.
  setView(typeof createStage === "function" ? "3d" : "portrait");

  function renderPatches() {
    const list = q(".saloon-patches ul");
    const items = feed.patches.map(patchNote).filter(Boolean).map((note) => {
      const item = document.createElement("li");
      item.className = "saloon-patch";
      const link = Object.assign(document.createElement("a"), {href: note.href, target: "_blank", rel: "noopener noreferrer", title: note.commit});
      link.className = "saloon-patch-commit";
      const code = document.createElement("code");
      code.textContent = shortCommit(note.commit);
      link.append("main 커밋 ", code);
      const time = Object.assign(document.createElement("time"), {dateTime: note.at, textContent: note.when});
      const meta = document.createElement("span");
      meta.className = "saloon-patch-meta";
      meta.append(link, " · ", time);
      item.append(Object.assign(document.createElement("span"), {className: "saloon-patch-change", textContent: note.change}), meta);
      return item;
    });
    if (!items.length) items.push(Object.assign(document.createElement("li"), {textContent: "이번 근무에서 병합된 카드 변경 없음."}));
    list.replaceChildren(...items);
  }

  function renderLedger() {
    if (!ledger) return;
    const {counts, blocks} = ledgerBlocks(feed.events);
    for (const [rule, n] of Object.entries(counts)) {
      ledger.querySelector(`[data-rule="${rule}"] .ledger-night-shift-count`).textContent = n === 1 ? "1회" : `${n}회`;
    }
    const log = ledger.querySelector(".ledger-night-shift-log");
    const items = blocks.slice(-HISTORY_DOM).map((block) => {
      const item = document.createElement("li");
      item.append(timeEl(block.at), ` ${RULE_NAMES[block.rule]}: ${BLOCK_REASONS[block.rule].toLowerCase()}`);
      return item;
    });
    if (!items.length) items.push(Object.assign(document.createElement("li"), {textContent: "보안관이 거부한 것이 아직 없습니다."}));
    log.replaceChildren(...items);
    ledger.querySelector(".ledger-night-shift-source").textContent = `출처: ${mode === "live" ? LIVE_LABEL : "녹화된 Kiro 근무"}.`;
  }

  // Only the latest entries reach the DOM, and only when the history changed.
  function renderHistory() {
    const recent = shown.history.slice(-HISTORY_DOM);
    const key = `${shown.history.length}:${recent.at(-1)?.id ?? ""}`;
    if (key === historyKey) return;
    historyKey = key;
    historyList.replaceChildren(...recent.map(historyItem));
  }

  function render() {
    for (const actor of ACTORS) {
      const {item, doing, ambient: note} = actorItems.get(actor.id);
      const event = shown.actors[actor.id];
      doing.textContent = event ? deed(event) : "";
      const record = ambient[actor.id];
      const text = record ? ambientText(record) : "";
      if (note.textContent !== text) note.textContent = text;
      note.title = record && text ? clockTime(record.at) : "";
      item.dataset.idle = String(!event && !text);
    }
    const wanted = q(".saloon-wanted-art");
    const poster = shown.wanted ? wantedPoster(shown.wanted) : null;
    if (wanted.dataset.boss !== (shown.wanted ?? "")) {
      wanted.dataset.boss = shown.wanted ?? "";
      wanted.replaceChildren(...(!poster ? [] : poster.card ? [art(portrait, poster.card, "saloon-wanted-portrait")] : [blankPoster()]));
    }
    q(".saloon-wanted-name").textContent = poster ? poster.name : "게시된 현상금 없음";
    q(".saloon-bell-note").textContent = !shown.bells ? "" : shown.bells === 1 ? "중단 1회 통과" : `중단 ${shown.bells}회 통과`;
    const target = q(".saloon-target");
    const proposal = shown.proposal;
    target.dataset.change = proposal?.change ?? "none";
    const targetArt = q(".saloon-target-art");
    if (targetArt.dataset.card !== (proposal?.card ?? "")) {
      targetArt.dataset.card = proposal?.card ?? "";
      targetArt.replaceChildren(...(proposal ? [art(portrait, proposal.card, "saloon-target-portrait")] : []));
    }
    q(".saloon-target-stat").textContent = proposalText(proposal);
    // The archived decision is rebuilt only when the proposal changes, never on every render.
    const decisionKey = proposal ? `${proposal.card}:${proposal.field}:${proposal.before}:${proposal.after}` : "";
    if (decisionBox.dataset.key !== decisionKey) {
      decisionBox.dataset.key = decisionKey;
      decisionBox.innerHTML = decisionHtml(proposal ? proposalDecision(proposal) : null);
      decisionBox.hidden = !decisionBox.innerHTML;
    }
    renderHistory();
    if (mode === "live") {
      progress.textContent = offline ? "· offline" : caughtUp ? "· watching" : "· connecting";
    } else {
      progress.textContent = `· ${feed.events.length}단계 중 ${count}단계`;
      const ended = count >= feed.events.length;
      // A focused control that is about to be disabled would drop keyboard focus to <body>;
      // hand it to Play/Replay instead.
      const focused = content.ownerDocument.activeElement;
      play.textContent = playing ? "일시정지" : ended && count > 0 ? "다시 재생" : "재생";
      play.setAttribute("aria-pressed", String(playing));
      play.disabled = !feed.events.length;
      step.disabled = ended || playing;
      replay.disabled = count === 0;
      if ((focused === step || focused === replay) && focused.disabled && !play.disabled) play.focus({preventScroll: true});
    }
  }

  function retrigger(element, className) {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
  }

  // One-shot ambient movement on one character; the timer clears it even when motion is reduced.
  function stir(actorId) {
    const entry = actorItems.get(actorId);
    if (!entry) return;
    retrigger(entry.item, "is-stirring");
    cancel(entry.stirTimer);
    entry.stirTimer = later(() => entry.item.classList.remove("is-stirring"), STIR_MS);
  }

  function animate(event) {
    const actor = actorFor(event.kind);
    stage.dataset.actor = actor;
    for (const [id, {item}] of actorItems) item.classList.toggle("is-acting", id === actor);
    if (event.kind === "block") retrigger(actorItems.get("sheriff").item, "is-refusing");
    if (event.kind === "cast") retrigger(q(".saloon-target"), "is-cast");
    if (event.kind === "wanted") retrigger(q(".saloon-wanted"), "is-pinned");
    if (event.kind === "bell") {
      const post = q(".saloon-bell-post");
      retrigger(post, "is-ringing");
      cancel(bellTimer);
      bellTimer = later(() => post.classList.remove("is-ringing"), BELL_MS);
    }
    now.textContent = eventCaption(event);
    toStage("play", event);
  }

  function quiet() {
    stage.dataset.actor = "";
    for (const {item} of actorItems.values()) item.classList.remove("is-acting", "is-refusing", "is-stirring");
    for (const selector of [".saloon-target", ".saloon-wanted", ".saloon-bell-post"]) {
      q(selector).classList.remove("is-cast", "is-pinned", "is-ringing");
    }
  }

  // Recorded playback. Ambient notes follow the clock of the last shown event, as text only.
  function stepOnce() {
    if (count >= feed.events.length) return false;
    const event = feed.events[count++];
    shown = applyEvent(shown, event);
    const before = ambient;
    ambient = latestActivity(feed.activity, event.at);
    render();
    animate(event);
    for (const record of freshAmbient(before, ambient)) toStage("activity", record);
    if (count >= feed.events.length) now.textContent = `${describe(event)}. 녹화가 끝났습니다.`;
    return true;
  }
  function pause() {
    playing = false;
    cancel(stepTimer);
    stepTimer = null;
  }
  function tick() {
    if (!playing || !isOpen) return;
    if (!stepOnce() || count >= feed.events.length) { pause(); render(); return; }
    stepTimer = later(tick, STEP_MS);
  }
  function restart() {
    pause();
    for (const id of timers) clearTimeout(id);
    timers.clear();
    count = 0;
    shown = emptyShift();
    ambient = latestActivity([]);
    quiet();
    render();
    toStage("reset");
    now.textContent = idle;
  }
  play.addEventListener("click", () => {
    if (playing) { pause(); render(); now.textContent = "일시정지."; return; }
    if (count >= feed.events.length) restart();
    playing = true;
    render();
    tick();
  });
  step.addEventListener("click", () => { pause(); stepOnce(); render(); });
  replay.addEventListener("click", restart);

  // Live polling, only while the room is open.
  function drainQueue() {
    queueTimer = null;
    if (!isOpen || !queue.length) return;
    animate(queue.shift());
    if (queue.length) queueTimer = later(drainQueue, 900);
  }
  async function poll(ticket) {
    controller = new AbortController();
    let wait = null;
    try {
      const response = await fetchEvents(EVENTS_PATH, {signal: controller.signal, cache: "no-store", headers: {accept: "application/json"}});
      if (!response.ok) throw new Error(`status ${response.status}`);
      const body = await response.json();
      if (ticket !== generation) return;
      const merged = mergeFeed(feed, normalizeFeed(body, clean));
      feed = {events: merged.events, patches: merged.patches, activity: merged.activity};
      shown = replayTo(feed.events, feed.events.length);
      ambient = latestActivity(feed.activity);
      const wasOffline = offline;
      offline = false;
      if (!caughtUp) {
        caughtUp = true;
        now.textContent = feed.events.length ? `이전 이벤트 ${feed.events.length}건을 따라잡았습니다.` : "연결됨. 첫 일감을 기다리는 중.";
      } else {
        if (merged.added.length) {
          queue.push(...merged.added);
          queue.splice(0, Math.max(0, queue.length - LIVE_QUEUE));
          if (!queueTimer) drainQueue();
        } else if (wasOffline) {
          now.textContent = "다시 연결됨.";
        }
        for (const actorId of new Set(merged.addedActivity.map((a) => a.actor))) stir(actorId);
        const newest = latestActivity(merged.addedActivity);
        for (const record of ACTORS.map((actor) => newest[actor.id]).filter(Boolean)) toStage("activity", record);
      }
      renderPatches();
      renderLedger();
      render();
    } catch (error) {
      if (ticket !== generation || error?.name === "AbortError") return;
      offline = true;
      wait = RETRY_MS;
      now.textContent = "연결이 끊겼습니다. 재시도하는 동안 지금까지의 근무 내용은 보드에 남아 있습니다.";
      render();
    } finally {
      if (ticket === generation) {
        controller = null;
        pollTimer = later(() => poll(ticket), wait ?? pollDelay(mode, globalThis.document));
      }
    }
  }

  renderPatches();
  renderLedger();
  render();
  now.textContent = mode === "live" ? "살롱에 들어가면 연결됩니다."
    : mode === "recorded-only" ? "실시간 근무는 이 컴퓨터에서 게임을 실행할 때만 재생됩니다. 녹화본을 보여 드립니다." : idle;

  return {
    mode,
    opened() {
      if (isOpen) return;
      isOpen = true;
      ensureStage();
      toStage("open");
      if (mode === "live" && fetchEvents) {
        generation += 1;
        poll(generation);
      }
    },
    closed() {
      isOpen = false;
      generation += 1;
      controller?.abort();
      controller = null;
      pause();
      queue.length = 0;
      for (const id of timers) clearTimeout(id);
      timers.clear();
      stepTimer = bellTimer = pollTimer = queueTimer = null;
      quiet();
      render();
      toStage("close");
    },
    // ?saloon=review: the recorded room at the step of the validated archived decision, as if stepped there,
    // without the step's motion, bell, stir or stage effect. False (room left as it was) in live mode or
    // when no recorded proposal has a decision that checks out. Play and Replay from start work as usual.
    review() {
      const at = mode === "live" ? null : reviewState(feed);
      if (!at) return false;
      restart();
      ({count, shown, ambient} = at);
      render();
      now.textContent = count >= feed.events.length ? `${describe(at.event)}. 녹화가 끝났습니다.` : eventCaption(at.event);
      return true;
    },
    state: () => ({mode, count, shown, feed, ambient, view: content.dataset.view, repair: repair.state()}),
  };
}

// DOM: the Night Shift section added inside the existing Sheriff's Ledger.
export function ledgerSectionHtml() {
  const rules = Object.entries(BLOCK_REASONS).map(([rule, text]) =>
    `<div data-rule="${rule}"><dt>${RULE_NAMES[rule]}</dt><dd>${text} · <span class="ledger-night-shift-count">0회</span></dd></div>`).join("");
  return `<section class="ledger-night-shift" aria-labelledby="ledger-night-shift-title">
    <h3 id="ledger-night-shift-title">야간 근무: 보안관이 거부한 것</h3>
    <p class="sd-note ledger-night-shift-source"></p>
    <dl class="ledger-night-shift-rules">${rules}</dl>
    <h4>거부 기록(순서대로)</h4>
    <ol class="ledger-night-shift-log"></ol>
  </section>`;
}
