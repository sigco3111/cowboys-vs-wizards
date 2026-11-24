// The Sheriff's Ledger shows the first different attack and the recorded finish for each version of Billy.
import {cardOf, typeOf} from "../game/showdown/cards.js";
import {BILLY_REPLAY} from "./billy-replay.data.js";
// The independent seat audit (scripts/billy-seat-audit.mjs). Its reviewed result is written by the native run.
import SEAT_AUDIT from "../../docs/evidence/billy-seat-audit/result.json" with {type: "json"};

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);
const pct = (n, d) => `${((100 * n) / d).toFixed(2)}%`;
const count = (n) => n.toLocaleString("en-US");
const short = (sha) => String(sha).slice(0, 7);
const orbWord = (n) => `구슬 ${n}개`;
const FACTION = {cowboy: "카우보이", wizard: "마법사"};
export const LINES = ["baseline", "candidate"];
// The proposal's gate result: this record holds the data's receipt seal (tests/match/billy-replay.test.js checks it).
export const GATE_RECORD = "docs/evidence/kiro-contest-run.md";
export const REPRODUCE = "node scripts/verify-billy-replay.mjs --full";

export function lineName(line, replay = BILLY_REPLAY) {
  const card = cardOf(replay.attackerId);
  const baselineLabel = card.attack === replay.baseline.attack ? "현재" : "기록된";
  return `${line === "baseline" ? baselineLabel : "제안된"} ${card.name}`;
}

// Pure: the four beats of one line. `orbs` is what the target holds once the beat has happened.
export function replaySteps(line, replay = BILLY_REPLAY) {
  const run = replay[line];
  const billy = cardOf(replay.attackerId), wall = cardOf(replay.targetId);
  const before = replay.targetOrbsBefore, after = run.targetOrbsAfter;
  return [
    {orbs: before,
      text: `${replay.turn}턴: ${FACTION[billy.side]} 대 ${wall.name} (${orbWord(before)}).`},
    {orbs: before, hit: run.attack,
      text: `${billy.name}의 공격, 대상 ${wall.name}, 공격력 ${run.attack}.`},
    {orbs: after,
      text: `${wall.name}: ${orbWord(before - after)} 잃음, ${after ? `${orbWord(after)} 남음` : "쓰러짐"}.`},
    {orbs: after,
      text: `${run.endTurn}턴에 ${FACTION[run.winner]} 승리.`},
  ];
}

const orbs = (now, max) => `<span class="sd-orbs" role="img" aria-label="${orbWord(now)}">${"●".repeat(now)}<span class="sd-lost">${"○".repeat(Math.max(0, max - now))}</span></span>`;

function stageHtml(replay, line, at, steps = []) {
  const billy = cardOf(replay.attackerId), wall = cardOf(replay.targetId);
  const beat = steps[at];
  const left = beat ? beat.orbs : replay.targetOrbsBefore;
  const attack = line ? `공격력 ${replay[line].attack}` : `현재 공격력 ${replay.baseline.attack}, 제안 ${replay.candidate.attack}`;
  const note = !beat || at === 0 ? "" : beat.hit ? `${beat.hit} 피해` : left ? "아직 서 있음" : "쓰러짐";
  return `<div class="sd-billy-board">
    <div class="sd-billy-troop ${billy.side}${beat?.hit ? " sd-billy-acting" : ""}"><strong>${esc(billy.name)}</strong><span class="sd-type">카우보이</span>${esc(attack)}</div>
    <span class="sd-billy-vs" aria-hidden="true">vs.</span>
    <div class="sd-billy-troop ${wall.side}${beat?.hit ? " sd-billy-hit" : ""}${beat && !left ? " sd-billy-down" : ""}"><strong>${esc(wall.name)}</strong><span class="sd-type">마법사</span>${orbs(left, replay.targetOrbsBefore)}${note ? `<span class="sd-note">${note}</span>` : ""}</div>
  </div>`;
}

// Pure: what the replay shows for a line (none before one is picked) at a step, clamped to the line's beats.
export function replayView(line, step = 0, replay = BILLY_REPLAY) {
  if (!LINES.includes(line)) {
    return {line: null, step: 0, first: true, last: false, stage: stageHtml(replay, null, 0),
      caption: `${lineName("baseline", replay)} 또는 ${lineName("candidate", replay)} 중 하나를 골라 공격을 다시 보세요.`};
  }
  const steps = replaySteps(line, replay);
  const at = Math.min(Math.max(step, 0), steps.length - 1);
  const last = at === steps.length - 1;
  return {line, step: at, first: at === 0, last, stage: stageHtml(replay, line, at, steps),
    caption: `${at + 1}/${steps.length}단계 · ${steps[at].text}`};
}

// The proposal and the benchmark are historical. A future balance release can change the live card.
export function appliedLine(replay = BILLY_REPLAY) {
  const card = cardOf(replay.attackerId);
  return `이 빌드에서 ${card.name}의 공격력은 ${card.attack}입니다. 야간 감시는 1점 조정 제안을 디자인 검토 준비 상태로 표시했습니다.`;
}

export function billyReplayHtml(replay = BILLY_REPLAY, seat = SEAT_AUDIT) {
  const billy = cardOf(replay.attackerId), wall = cardOf(replay.targetId);
  const view = replayView(null, 0, replay);
  const k = replay.cohort;
  const score = (line, wins) => `<div><dt>${esc(lineName(line, replay))}</dt><dd>${pct(wins, k.gamesPerArm)}</dd></div>`;
  return `<h3 id="ledger-billy-title">${esc(billy.name)} vs. ${esc(wall.name)}</h3>
  <p class="sd-note sd-billy-deal">${replay.turn}턴 · 시드 ${replay.seed} · ${FACTION[replay.first]} 선공</p>
  <div class="sd-row sd-billy-actions" role="group" aria-label="빌리의 버전 선택">${LINES.map(line => `<button type="button" data-billy-line="${line}" aria-pressed="false" aria-controls="ledger-billy-stage">${esc(lineName(line, replay))} · 공격력 ${replay[line].attack}</button>`).join("")}</div>
  <div class="sd-billy-portraits" aria-hidden="true"><span data-ledger-portrait="${esc(typeOf(replay.attackerId))}"></span><span data-ledger-portrait="${esc(typeOf(replay.targetId))}"></span></div>
  <div id="ledger-billy-stage" class="sd-billy-stage">${view.stage}</div>
  <p id="ledger-billy-now" class="sd-billy-now" role="status">${esc(view.caption)}</p>
  <div class="sd-row" id="ledger-billy-steps" role="group" aria-label="리플레이 단계" hidden>
    <button type="button" data-billy-step="back">이전 단계</button>
    <button type="button" data-billy-step="next">다음 단계</button>
    <button type="button" data-billy-step="replay">처음부터 다시</button>
  </div>
  <h4 id="ledger-billy-wins">카우보이 승률</h4>
  <dl class="sd-billy-scores" aria-labelledby="ledger-billy-wins">${score("baseline", k.baselineCowboyWins)}${score("candidate", k.candidateCowboyWins)}</dl>
  <p class="sd-note">버전당 ${count(k.gamesPerArm)}판, 고정 덱과 2레벨 봇 둘. ${esc(appliedLine(replay))}</p>
  <details class="sd-billy-evidence"><summary>이 리플레이 검증 방법</summary>
    <p>처음 ${replay.matchedEvents}개 이벤트는 일치합니다. 다음 이벤트는 빌리의 공격입니다. 봇이 각 버전을 기록된 결말까지 진행합니다.</p>
    <p>표본은 ${count(k.deals)}번의 딜, 시드 ${k.firstSeed}–${k.firstSeed + k.deals - 1}입니다. 딜마다 양 진영이 한 번씩 먼저 시작합니다. 카우보이는 각각 ${count(k.baselineCowboyWins)}판, ${count(k.candidateCowboyWins)}판을 이겼습니다. 승자가 마법사로 바뀐 판은 ${count(k.switchedCowboyToWizard)}판, 카우보이로 바뀐 판은 ${count(k.switchedWizardToCowboy)}판입니다. 선공 승률은 ${pct(k.baselineFirstWins, k.gamesPerArm)}에서 ${pct(k.candidateFirstWins, k.gamesPerArm)}로 바뀌었습니다.</p>
    <p>실행: <code>${esc(REPRODUCE)}</code>. 출처 <code>${short(replay.source.commit)}</code> · 결과 해시 <code>${short(k.csvSha256)}</code> · 제안 기록 <code>${esc(GATE_RECORD)}</code>.</p>
  </details>
  ${seatAuditHtml(seat, replay)}`;
}

// --- Who wins when they go first? A separate, larger sample than the replay's cohort above. ---
export const SEAT_REPRODUCE = "node scripts/billy-seat-audit.mjs --verify";
const SEAT_TITLE = "선공하면 누가 이기나요?";
const ARMS = ["baseline", "candidate"];
const OUTCOMES = ["cowboy", "wizard", "draw"];
const SEATS = ["cowboy", "wizard"];
const isCount = (n) => Number.isInteger(n) && n >= 0;
const total = (cells) => OUTCOMES.reduce((sum, o) => sum + cells[o], 0);
const share = (wins, games) => ({wins, games, share: games > 0 ? wins / games : null});
export const shareText = (s) => (s === null ? "—" : `${(100 * s).toFixed(2)}%`);
export function pointsText(from, to) {
  if (from === null || to === null) return "—";
  const p = Math.round(10000 * (to - from)) / 100;
  return p === 0 ? "0.00%p" : `${p > 0 ? "+" : "−"}${Math.abs(p).toFixed(2)}%p`;
}

// Pure: the result is shown only if every cell is a whole count and the cells add up to each other.
// A recorded totalDuels must match the games the cells describe (two versions per opening seat per deal).
export function seatAuditOk(seat) {
  if (seat?.schema !== 1 || !isCount(seat.deals) || !isCount(seat.firstSeed)) return false;
  if (seat.totalDuels !== undefined && seat.totalDuels !== 2 * SEATS.length * seat.deals) return false;
  return SEATS.every((first) => {
    const f = seat.byFirst?.[first];
    if (!f || f.gamesPerArm !== seat.deals) return false;
    const cells = [...ARMS.map((a) => f[a]), ...OUTCOMES.map((o) => f.transitions?.[o])];
    if (!cells.every((c) => c && OUTCOMES.every((o) => isCount(c[o])))) return false;
    return ARMS.every((a) => total(f[a]) === f.gamesPerArm)
      && OUTCOMES.every((o) => total(f.transitions[o]) === f.baseline[o]
        && OUTCOMES.reduce((sum, b) => sum + f.transitions[b][o], 0) === f.candidate[o]);
  });
}

const SEAT_ROWS = [["모든 시작", SEATS], ["카우보이 선공", ["cowboy"]], ["마법사 선공", ["wizard"]]];

// Pure: Cowboy win shares per opening faction, from the raw byFirst counts (draws count as games, not wins).
export function seatRows(seat) {
  return SEAT_ROWS.map(([label, firsts]) => {
    const [baseline, candidate] = ARMS.map((a) => share(
      firsts.reduce((sum, f) => sum + seat.byFirst[f][a].cowboy, 0),
      firsts.reduce((sum, f) => sum + total(seat.byFirst[f][a]), 0)));
    return {label, baseline, candidate, change: pointsText(baseline.share, candidate.share)};
  });
}

// Pure: how often the faction that went first won, per version of Billy.
export function firstPlayerShares(seat) {
  const [baseline, candidate] = ARMS.map((a) => share(
    SEATS.reduce((sum, f) => sum + seat.byFirst[f][a][f], 0),
    SEATS.reduce((sum, f) => sum + total(seat.byFirst[f][a]), 0)));
  return {baseline, candidate, change: pointsText(baseline.share, candidate.share)};
}

// Pure: the one takeaway. The opener's share before and after, and which seat that favours.
export function seatObservation(first, replay = BILLY_REPLAY) {
  const now = first.candidate.share, before = first.baseline.share;
  if (now === null) return "기록된 게임이 아직 없습니다.";
  const favoured = now > 0.5 ? "first" : now < 0.5 ? "second" : null;
  const wasFavoured = before === null ? null : before > 0.5 ? "first" : before < 0.5 ? "second" : "neither";
  const edge = favoured ? `${favoured === "first" ? "선공" : "후공"}이 ${wasFavoured === favoured ? "여전히" : "이제"} 유리합니다` : "어느 쪽도 유리하지 않습니다";
  const shares = before === null
    ? `빌리 공격력 ${replay.candidate.attack}일 때 전체의 ${shareText(now)}`
    : `빌리 공격력 ${replay.baseline.attack}일 때 전체의 ${shareText(before)}, 공격력 ${replay.candidate.attack}일 때 ${shareText(now)}`;
  return `선공 진영이 이긴 비율은 ${shares}이므로, ${edge}.`;
}

// Pure: the quiet verify line. Hashes appear only when the result records them as text.
function seatVerifyHtml(seat) {
  const hashes = [["출처", seat.sourceCommit], ["결과 해시", seat.csvSha256], ["프로토콜 해시", seat.protocolSha256]]
    .filter(([, sha]) => typeof sha === "string" && sha.length > 0)
    .map(([label, sha]) => ` · ${label} <code>${esc(short(sha))}</code>`).join("");
  return `<p class="sd-note sd-billy-seat-verify">검증: <code>${esc(SEAT_REPRODUCE)}</code>${hashes}</p>
    ${ruleGateHtml()}`;
}

// The written balance rule, checked per version by its own script; the page states no verdict.
export const RULE_SOURCE = ".kiro/specs/night-shift-balance-contract/requirements.md";
export const RULE_GATE = "node scripts/billy-balance-gate.mjs --arm";
function ruleGateHtml() {
  const runs = ARMS.map((a) => `<code>${esc(`${RULE_GATE} ${a}`)}</code>`).join("<br>");
  return `<details class="sd-note sd-billy-seat-verify"><summary>각 버전을 명문화된 규칙과 대조하기</summary>
      <p>규칙: <code>${esc(RULE_SOURCE)}</code>. 각 실행은 통과 또는 거부를 직접 출력합니다:<br>${runs}</p>
    </details>`;
}

export function seatAuditHtml(seat = SEAT_AUDIT, replay = BILLY_REPLAY) {
  const open = `<details id="ledger-billy-seat" class="sd-billy-evidence sd-billy-seat"><summary>${SEAT_TITLE}</summary>`;
  if (!seatAuditOk(seat)) return `${open}<p>선공 감사 결과가 없거나 집계가 맞지 않아 수치를 표시하지 않습니다.</p></details>`;
  const [a2, a1] = [replay.baseline.attack, replay.candidate.attack];
  const pairs = SEATS.reduce((sum, f) => sum + seat.byFirst[f].gamesPerArm, 0);
  const draws = ARMS.map((a) => SEATS.reduce((sum, f) => sum + seat.byFirst[f][a].draw, 0));
  const first = firstPlayerShares(seat);
  const row = (r) => `<tr><th scope="row">${r.label}</th><td>${shareText(r.baseline.share)}</td><td>${shareText(r.candidate.share)}</td><td>${r.change}</td></tr>`;
  return `${open}
    <p>위 리플레이 표본(${count(2 * replay.cohort.gamesPerArm)}판)과 별개로, 고정 덱을 쓰는 2레벨 봇 둘이 ${count(seat.deals)}번의 딜(시드 ${seat.firstSeed}–${seat.firstSeed + seat.deals - 1})에서 ${count(2 * pairs)}판을 진행합니다. 모든 딜은 양 진영이 선공하는 경우와 빌리의 두 버전으로 각각 진행되어 ${count(pairs)}쌍의 비교가 나옵니다.${draws[0] || draws[1] ? ` 무승부: 공격력 ${a2}에서 ${count(draws[0])}판, 공격력 ${a1}에서 ${count(draws[1])}판.` : ""}</p>
    <div class="sd-ledger-wrap"><table class="sd-ledger-table sd-billy-seat-table">
      <caption>선공 진영별 카우보이 승률</caption>
      <thead><tr><th scope="col">시작</th><th scope="col">공격력 ${a2}</th><th scope="col">공격력 ${a1}</th><th scope="col">변화</th></tr></thead>
      <tbody>${seatRows(seat).map(row).join("")}</tbody>
    </table></div>
    <p class="sd-billy-seat-finding">${esc(seatObservation(first, replay))}</p>
    ${seatVerifyHtml(seat)}
  </details>`;
}

// Wires the replay inside `root` once. Only attributes, the stage and the status text change; no button is replaced
// and focus is never moved, so a keyboard visitor can press Next step again and again.
export function wireBillyReplay(root, replay = BILLY_REPLAY) {
  const box = typeof root?.querySelector === "function" ? root.querySelector("#ledger-billy") : null;
  if (!box) return;
  const $ = (selector) => box.querySelector(selector);
  const lines = [...box.querySelectorAll("[data-billy-line]")];
  const [stage, now, steps, back, next, again] = ["#ledger-billy-stage", "#ledger-billy-now", "#ledger-billy-steps",
    '[data-billy-step="back"]', '[data-billy-step="next"]', '[data-billy-step="replay"]'].map($);
  let line = null, step = 0;
  box.addEventListener("click", (event) => {
    const b = event.target.closest?.("button");
    if (!b || b.getAttribute("aria-disabled") === "true") return;
    const {billyLine, billyStep} = b.dataset;
    if (LINES.includes(billyLine)) [line, step] = [billyLine, 0];
    else if (billyStep && line) step = billyStep === "replay" ? 0 : step + (billyStep === "next" ? 1 : -1);
    else return;
    const view = replayView(line, step, replay);
    step = view.step;
    stage.innerHTML = view.stage;
    now.textContent = view.caption;
    for (const each of lines) each.setAttribute("aria-pressed", String(each.dataset.billyLine === line));
    steps.hidden = false;
    back.setAttribute("aria-disabled", String(view.first));
    again.setAttribute("aria-disabled", String(view.first));
    next.setAttribute("aria-disabled", String(view.last));
  });
}
