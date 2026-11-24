// "Would you ship this?" in the Saloon. The player sees one card change the native scout proposed and
// its two scouting blocks, decides Ship or Keep, then learns the real rule and why Kiro held the change.
// After deciding, the player can compare one recorded deal: the same seed played with the current and
// the proposed card, the first event where they differ and the actual winners.
// Data: docs/evidence/night-shift-repair/scout-ruling.json, written by the coordinator from a computed
// run; null until then. Shape: {schema: 1, verdict: "withheld", nativeWorkflowId, sourceSha256, base,
// inputs, counts: {proposed, measured, compilerRejected, eligible, simulatedGames},
// change: {card, field, from, to}, blocks: [{id, games, cowboyWins, candidatePct, baselinePct,
// ceilingPct, overByWins, pass}] (two), example: {seed, first, turn, baseline: {winner, move},
// candidate: {winner, move}}, freshRun: false, applied: false}.
// Nothing here plays, scores or applies anything. A record that is missing a field, names a card stat
// this build does not have, or disagrees with itself is not shown. Every value comes from the record.
import {TYPES} from "../game/showdown/cards.js";
import RULING from "../../docs/evidence/night-shift-repair/scout-ruling.json" with {type: "json"};

export const PICKS = Object.freeze(["ship", "keep"]);
export const BLOCK_COUNT = 2;
const FACTION = Object.freeze({cowboy: "카우보이", wizard: "마법사"});
const WINNERS = ["cowboy", "wizard", "draw"];
const STATS = ["attack", "health", "stars"];
const COUNT_KEYS = ["proposed", "measured", "compilerRejected", "eligible", "simulatedGames"];
const TEXT_MAX = 160;
const ID_MAX = 80;
const PCT_TOLERANCE = 0.005;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (n, min = 0) => Number.isInteger(n) && n >= min;
const isText = (s, max = TEXT_MAX) => typeof s === "string" && s.trim().length > 0 && s.length <= max;
const isPct = (n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
const isSlug = (s) => typeof s === "string" && /^[a-z0-9][a-z0-9-]{0,79}$/.test(s);
const plural = (n, word) => `${word} ${n}`;
const pct = (n) => `${Number(n.toFixed(2))}%`;
const short = (hex, n) => (/^[0-9a-f]+$/.test(hex) && hex.length > n ? hex.slice(0, n) : hex);
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(",")}]`
  : isRecord(v) ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(",")}}`
    : JSON.stringify(v ?? null));

// Pure: the most Cowboy wins a block allows under its ceiling.
export const maxWins = (block) => Math.floor((block.ceilingPct * block.games) / 100 + 1e-9);

export const EMPTY_TEXT = Object.freeze({
  missing: "기록된 정찰 판정이 아직 없습니다.",
  invalid: "정찰 판정이 불완전하거나 수치가 맞지 않아 표시할 내용이 없습니다.",
});
const refuse = (reason, text = EMPTY_TEXT[reason]) => ({ok: false, reason, text});

function cleanBlock(b) {
  if (!isRecord(b) || !isSlug(b.id) || !isInt(b.games, 1) || !isInt(b.cowboyWins) || b.cowboyWins > b.games) return null;
  if (![b.candidatePct, b.baselinePct, b.ceilingPct].every(isPct) || !isInt(b.overByWins) || typeof b.pass !== "boolean") return null;
  if (Math.abs(b.candidatePct - (100 * b.cowboyWins) / b.games) > PCT_TOLERANCE) return null;
  const block = {id: b.id, games: b.games, cowboyWins: b.cowboyWins, candidatePct: b.candidatePct,
    baselinePct: b.baselinePct, ceilingPct: b.ceilingPct, overByWins: b.overByWins, pass: b.pass};
  if (b.overByWins !== Math.max(0, b.cowboyWins - maxWins(block))) return null;
  if (b.pass && b.overByWins > 0) return null;
  return block;
}

// A recorded event is either its text or {label, turn?, card?, target?}; only the label is shown.
function cleanMove(m, turn) {
  if (isText(m)) return m.trim();
  if (!isRecord(m) || !isText(m.label)) return null;
  if (m.turn !== undefined && m.turn !== turn) return null;
  for (const key of ["card", "target"]) if (m[key] !== undefined && !isText(m[key], ID_MAX)) return null;
  return m.label.trim();
}

function cleanLine(line, turn) {
  if (!isRecord(line) || !WINNERS.includes(line.winner)) return null;
  const move = cleanMove(line.move, turn);
  return move ? {winner: line.winner, move, raw: line.move} : null;
}

function cleanExample(e) {
  if (!isRecord(e) || !isInt(e.seed) || !(e.first in FACTION) || !isInt(e.turn, 1)) return null;
  const baseline = cleanLine(e.baseline, e.turn), candidate = cleanLine(e.candidate, e.turn);
  if (!baseline || !candidate || canonical(baseline.raw) === canonical(candidate.raw)) return null;
  return {seed: e.seed, first: e.first, turn: e.turn,
    baseline: {winner: baseline.winner, move: baseline.move}, candidate: {winner: candidate.winner, move: candidate.move}};
}

// Pure: {ok: true, ruling} for a complete, self-consistent withheld ruling whose change starts from this
// build's card; otherwise {ok: false, reason, text} with reason missing, invalid or stale.
export function checkRuling(raw = RULING, types = TYPES) {
  if (raw === null || raw === undefined) return refuse("missing");
  if (!isRecord(raw) || raw.schema !== 1 || raw.verdict !== "withheld" || raw.freshRun !== false || raw.applied !== false) return refuse("invalid");
  if (!isText(raw.nativeWorkflowId, ID_MAX) || typeof raw.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(raw.sourceSha256)) return refuse("invalid");
  if (!isText(raw.base, ID_MAX) || !isRecord(raw.inputs)) return refuse("invalid");
  const c = raw.counts;
  if (!isRecord(c) || !COUNT_KEYS.every((k) => isInt(c[k]))) return refuse("invalid");
  if (c.measured + c.compilerRejected > c.proposed || c.eligible > c.measured) return refuse("invalid");
  const ch = raw.change;
  if (!isRecord(ch) || !isSlug(ch.card) || !STATS.includes(ch.field) || !isInt(ch.from) || !isInt(ch.to) || ch.from === ch.to) return refuse("invalid");
  const card = isRecord(types) && Object.hasOwn(types, ch.card) ? types[ch.card] : null;
  if (!isRecord(card) || !isText(card.name, ID_MAX) || !Number.isInteger(card[ch.field])) return refuse("invalid");
  if (card[ch.field] !== ch.from) {
    return refuse("stale", `이 판정은 ${card.name} ${FIELD_KO[ch.field]} ${ch.from}에서 시작하지만 이 빌드는 ${FIELD_KO[ch.field]} ${card[ch.field]}이라 표시하지 않습니다.`);
  }
  if (!Array.isArray(raw.blocks) || raw.blocks.length !== BLOCK_COUNT) return refuse("invalid");
  const blocks = raw.blocks.map(cleanBlock);
  if (blocks.some((b) => !b) || new Set(blocks.map((b) => b.id)).size !== blocks.length) return refuse("invalid");
  // A withheld change must have a block that explains the hold.
  if (blocks.every((b) => b.pass)) return refuse("invalid");
  if (c.simulatedGames < blocks.reduce((n, b) => n + b.games, 0)) return refuse("invalid");
  const example = cleanExample(raw.example);
  if (!example) return refuse("invalid");
  return {ok: true, ruling: {workflowId: raw.nativeWorkflowId, sourceSha256: raw.sourceSha256, base: raw.base,
    counts: Object.fromEntries(COUNT_KEYS.map((k) => [k, c[k]])),
    change: {card: ch.card, field: ch.field, from: ch.from, to: ch.to}, name: card.name, blocks, example}};
}

// --- The interaction: decide once, then optionally compare one deal. ---
export function initialRuling() {
  return {pick: null, compared: false};
}

export function rulingReducer(state, action) {
  const s = state ?? initialRuling();
  if (action?.type === "pick" && !s.pick && PICKS.includes(action.pick)) return {...s, pick: action.pick};
  if (action?.type === "compare" && s.pick && !s.compared) return {...s, compared: true};
  return s;
}

const FIELD_KO = {attack: "공격력", health: "체력", stars: "별"};
const changeText = (r) => `${r.name} ${FIELD_KO[r.change.field]} ${r.change.from} → ${r.change.to}`;
const winnerText = (w) => (w === "draw" ? "무승부" : `${FACTION[w]} 승리`);

// Pure: what the player chose and Kiro's call, in words.
export function pickText(pick) {
  return pick === "ship" ? "변경 반영을 선택하셨습니다. Kiro는 현재 카드를 유지했습니다."
    : "현재 카드 유지를 선택하셨습니다. Kiro도 같은 판단을 내렸습니다.";
}

// Pure: one line per block once the rule is known.
export function blockRuleText(b) {
  const limit = maxWins(b);
  const head = `${b.id}: 카우보이 ${b.games}판 중 ${b.cowboyWins}승, 한도 ${limit}`;
  return b.pass ? `${head}. 한도 이내.` : `${head}. ${b.overByWins}승 초과.`;
}

// Pure: why Kiro held the change, from the failing blocks and the counts.
export function holdText(r) {
  const failed = r.blocks.filter((b) => !b.pass);
  const over = failed.map((b) => `${b.id} ${b.overByWins}승 초과`).join(", ");
  const {measured, eligible} = r.counts;
  const field = eligible === 0 ? `측정한 인접 변경 ${measured}건 중 기준을 통과한 것이 없습니다`
    : `측정한 인접 변경 ${measured}건 중 ${eligible}건이 기준을 통과했지만 이 변경은 아닙니다`;
  return `제안한 카드가 ${over}로 카우보이 한도를 넘어 Kiro가 보류했습니다. ${field}. 그래서 아무것도 반영하지 않았습니다.`;
}

function ruleText(r) {
  const ceilings = [...new Set(r.blocks.map((b) => b.ceilingPct))];
  const limit = ceilings.length === 1 ? `게임의 ${pct(ceilings[0])}` : "블록마다 적힌 상한";
  return `규칙: 모든 정찰 블록에서 카우보이는 최대 ${limit}까지만 이길 수 있습니다. 1승이라도 넘으면 그 블록은 실패입니다.`;
}

function decisionHtml(r, pick) {
  const rows = r.blocks.map((b) => `<li><strong>${esc(b.id)}</strong>: 카우보이 ${b.games}판 중 ${b.cowboyWins}승`
    + ` (${pct(b.candidatePct)}) 제안 카드 기준. 현재 카드: ${pct(b.baselinePct)}.</li>`).join("");
  const button = (value, label) => `<button type="button" data-ruling-pick="${value}" aria-pressed="${pick === value}"`
    + `${pick ? ' aria-disabled="true"' : ""}>${label}</button>`;
  return `<dl class="saloon-repair-facts">
      <div><dt>제안된 변경</dt><dd>${esc(changeText(r))}</dd></div>
    </dl>
    <ul aria-label="정찰 블록">${rows}</ul>
    <p><strong>이 변경을 반영하시겠습니까?</strong></p>
    <div class="saloon-buttons" role="group" aria-label="이 변경을 반영하시겠습니까?">
      ${button("ship", "변경 반영")}${button("keep", "현재 카드 유지")}
    </div>`;
}

function revealHtml(r, state) {
  const c = r.counts;
  return `<section class="scout-ruling-reveal" data-ruling-focus="reveal" tabindex="-1" aria-label="Kiro의 판정">
      <p role="status">${esc(pickText(state.pick))}</p>
      <p>${esc(ruleText(r))}</p>
      <ul aria-label="규칙에 비춘 블록별 결과">${r.blocks.map((b) => `<li data-pass="${b.pass}">${esc(blockRuleText(b))}</li>`).join("")}</ul>
      <p>${esc(holdText(r))}</p>
      <p class="sd-note">정찰이 제안한 변경 ${c.proposed}건: 측정 ${c.measured}건, 컴파일러 거부 ${c.compilerRejected}건, 통과 ${c.eligible}건, 시뮬레이션 ${c.simulatedGames}판.</p>
      ${state.compared ? "" : `<div class="saloon-buttons"><button type="button" data-ruling-compare="one">한 판 비교하기</button></div>`}
    </section>`;
}

function compareHtml(r) {
  const e = r.example;
  const line = (key, word, value) => `<li class="saloon-repair-move"><span><strong>${word} ${esc(r.name)}</strong> · ${FIELD_KO[r.change.field]} ${value}<br>`
    + `${e.turn}턴: ${esc(e[key].move)}<br>결과: ${esc(winnerText(e[key].winner))}.</span></li>`;
  return `<section class="scout-ruling-compare" data-ruling-focus="compare" tabindex="-1" aria-label="정찰 한 판">
      <p><strong>정찰 한 판, 시드 ${e.seed}.</strong> ${FACTION[e.first]} 선공. 두 버전은 ${e.turn}턴에 처음으로 갈라집니다.</p>
      <ol class="saloon-repair-moves" aria-label="${e.turn}턴의 현재 카드와 제안 카드">
        ${line("baseline", "현재", r.change.from)}${line("candidate", "제안", r.change.to)}
      </ol>
    </section>`;
}

// Pure: the whole interaction for one state, or a short note when the ruling cannot be shown.
export function rulingHtml(check, state = initialRuling()) {
  const title = "<h3>Kiro가 변경을 보류한 이유</h3>";
  if (!check.ok) return `<section class="scout-ruling-body">${title}<p class="sd-note">${esc(check.text)}</p></section>`;
  const r = check.ruling;
  return `<section class="scout-ruling-body">
    ${title}
    <p class="sd-note"><strong>반영되지 않은 변경의 정찰 예시.</strong> 정찰이 직접 쓴 시드 블록입니다.
      따로 보관한 검증용 시드는 플레이하지 않았으며, 변경은 어느 덱에도 적용되지 않았습니다.</p>
    ${decisionHtml(r, state.pick)}
    ${state.pick ? revealHtml(r, state) : ""}
    ${state.compared ? compareHtml(r) : ""}
    <p class="sd-note">Kiro 기본 워크플로 <code>${esc(r.workflowId)}</code>, 기준 <code>${esc(short(r.base, 7))}</code>, 출처 <code>${esc(short(r.sourceSha256, 12))}</code>.</p>
  </section>`;
}

// DOM: fills the Saloon drawer's `host`. Buttons are native, so Enter and Space work; after each choice
// focus moves to the newly shown part. Returns {check, state()}, or null without a host.
export function mountScoutRuling(host, {ruling = RULING, types = TYPES} = {}) {
  if (!host || typeof host.querySelector !== "function") return null;
  const check = checkRuling(ruling, types);
  host.classList?.add("scout-ruling");
  let state = initialRuling();
  const render = (focus) => {
    host.innerHTML = rulingHtml(check, state);
    if (focus) host.querySelector(`[data-ruling-focus="${focus}"]`)?.focus?.();
  };
  render(null);
  if (!check.ok) return {check, state: () => null};
  host.addEventListener("click", (event) => {
    const b = event.target?.closest?.("button");
    if (!b || (host.contains && !host.contains(b)) || b.getAttribute?.("aria-disabled") === "true") return;
    const action = b.dataset?.rulingPick ? {type: "pick", pick: b.dataset.rulingPick}
      : b.dataset?.rulingCompare ? {type: "compare"} : null;
    const after = rulingReducer(state, action);
    if (after === state) return;
    state = after;
    render(action.type === "pick" ? "reveal" : "compare");
  });
  return {check, state: () => state};
}
