// The Agent Arena spectator table in the Saloon drawer. It shows the one recorded native Kiro
// personality match exactly as the coordinator wrote it (docs/evidence/saloon-agent-arena/showcase.json,
// null until a verified run is recorded): the series score, the replay's exact seed, and the replay
// itself, one recorded decision at a time.
// Shape: {nativeWorkflowId, verified: true, summary: summarize() output, replay: recordReplay() output,
// policies: {"cautious-sheriff": playbook, "reckless-wizard": playbook}} (experiments/agent-arena/arena.mjs).
// Nothing here plays, scores or verifies a game. A record that is missing a field or disagrees with
// itself is not shown at all. Cards still in a hand are never shown: the table names only cards that
// were played face up, never a face-down trap, never the other legal options and never event payloads.
import {josa} from "./josa.js";
import {TYPES} from "../game/showdown/cards.js";
import SHOWCASE from "../../docs/evidence/saloon-agent-arena/showcase.json" with {type: "json"};

// The persona ids and seats as experiments/agent-arena/playbook.js defines them.
export const PERSONAS = Object.freeze({
  "cautious-sheriff": Object.freeze({name: "신중한 보안관", side: "cowboy"}),
  "reckless-wizard": Object.freeze({name: "무모한 마법사", side: "wizard"}),
});
export const SEATS = Object.freeze(["cowboy", "wizard"]);
export const REPLAY_KIND = "agent-arena-replay/1";
export const MAX_STEPS = 1500;
export const ACTION_TYPES = Object.freeze(["summon", "spell", "gear", "location", "set", "attack", "cover", "end"]);
const PERSONA_OF = Object.freeze({cowboy: "cautious-sheriff", wizard: "reckless-wizard"});
const SEAT_NAME = Object.freeze({cowboy: "카우보이", wizard: "마법사"});
// Action types whose legal options depend on the acting hand. Their counts are never shown.
const FROM_HAND = new Set(["summon", "spell", "gear", "location", "set"]);
const TYPE_WORD = Object.freeze({
  summon: "부대 소환", spell: "주문 시전", gear: "장비 장착", location: "장소 놓기",
  set: "함정 설치", attack: "공격", cover: "엄폐", end: "턴 종료",
});
const PREFER_OF = Object.freeze({attack: "attack", summon: "summon", spell: "spell", gear: "gear"});
const TEXT_MAX = 200;
const MOTTO_MAX = 80;
const EVENT_WORDS_MAX = 6;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"})[c]);
const isRecord = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isInt = (n, min = 0) => Number.isInteger(n) && n >= min;
const isText = (s, max = TEXT_MAX) => typeof s === "string" && s.trim().length > 0 && s.length <= max;
const isWordList = (v) => Array.isArray(v) && v.every((w) => isText(w, 40));
const sum = (values) => values.reduce((a, b) => a + b, 0);
const plural = (n, word) => `${word} ${n}`;
const canonical = (value) => JSON.stringify(value, (key, each) => (isRecord(each)
  ? Object.fromEntries(Object.keys(each).sort().map((name) => [name, each[name]])) : each));
const personaName = (side) => PERSONAS[PERSONA_OF[side]].name;
const OUTCOMES = [...Object.keys(PERSONAS), "draw"];

function validSummary(s) {
  if (!isRecord(s) || !isInt(s.games, 1) || !isRecord(s.wins)) return false;
  const tally = (each) => isRecord(each) && OUTCOMES.every((key) => isInt(each[key])) && sum(OUTCOMES.map((key) => each[key]));
  if (tally(s.wins) !== s.games) return false;
  if (!isRecord(s.byStartingSeat)) return false;
  for (const seat of SEATS) {
    const each = s.byStartingSeat[seat];
    if (!isRecord(each) || !isInt(each.games) || tally(each) !== each.games) return false;
  }
  if (sum(SEATS.map((seat) => s.byStartingSeat[seat].games)) !== s.games) return false;
  if (!isRecord(s.endings) || !Object.entries(s.endings).every(([reason, n]) => isText(reason, 60) && isInt(n, 1))) return false;
  if (sum(Object.values(s.endings)) !== s.games) return false;
  const t = s.turns;
  return isRecord(t) && isInt(t.min) && isInt(t.max) && Number.isFinite(t.mean) && t.min <= t.mean && t.mean <= t.max;
}

function validStep(step, i) {
  if (!isRecord(step) || step.n !== i + 1 || !isInt(step.turn) || !SEATS.includes(step.side)) return false;
  if (step.persona !== PERSONA_OF[step.side] || !ACTION_TYPES.includes(step.type)) return false;
  if (!Array.isArray(step.legal) || !step.legal.length || !step.legal.every((a) => isRecord(a) && ACTION_TYPES.includes(a.type))) return false;
  if (!isInt(step.chosen) || step.chosen >= step.legal.length || !isRecord(step.action) || step.action.type !== step.type) return false;
  return canonical(step.legal[step.chosen]) === canonical(step.action) && isInt(step.ruledOut) && Array.isArray(step.events);
}

function validReplay(r) {
  if (!isRecord(r) || r.kind !== REPLAY_KIND || !isInt(r.seed) || !SEATS.includes(r.first)) return false;
  if (!isRecord(r.personas) || canonical(r.personas) !== canonical(PERSONA_OF)) return false;
  if (!isRecord(r.playbookDigests) || !Object.keys(PERSONAS).every((p) => isText(r.playbookDigests[p], 128))) return false;
  if (!Array.isArray(r.steps) || !r.steps.length || r.steps.length > MAX_STEPS || r.decisions !== r.steps.length) return false;
  if (!r.steps.every(validStep) || r.steps[0].side !== r.first) return false;
  if (!isRecord(r.result) || !isText(r.result.reason, 60)) return false;
  if (!(r.result.winner === null || r.result.winner === undefined || r.result.winner === "draw" || SEATS.includes(r.result.winner))) return false;
  if (!isRecord(r.finalBases) || !SEATS.every((seat) => isInt(r.finalBases[seat]))) return false;
  return isInt(r.turns, 1);
}

// A playbook as validatePlaybook builds it, or null. Only the fields the table explains are read.
function validPolicy(p, persona) {
  const ok = isRecord(p) && p.persona === persona && typeof p.motto === "string" && p.motto.length <= MOTTO_MAX
    && Array.isArray(p.order) && p.order.length > 0 && p.order.every((t) => ACTION_TYPES.includes(t)) && p.order.includes("end")
    && new Set(p.order).size === p.order.length
    && isRecord(p.attack) && isWordList(p.attack.prefer) && isWordList(p.attack.avoid)
    && isRecord(p.summon) && isWordList(p.summon.prefer) && [0, 1, 2].includes(p.summon.maxTributes)
    && isRecord(p.spell) && isWordList(p.spell.prefer) && typeof p.spell.onlyToKill === "boolean"
    && isRecord(p.gear) && isWordList(p.gear.prefer) && isRecord(p.cover) && isText(p.cover.when, 40);
  if (!ok) return null;
  return {
    persona, motto: p.motto, order: [...p.order],
    attack: {prefer: [...p.attack.prefer], avoid: [...p.attack.avoid]},
    summon: {prefer: [...p.summon.prefer], maxTributes: p.summon.maxTributes},
    spell: {prefer: [...p.spell.prefer], onlyToKill: p.spell.onlyToKill},
    gear: {prefer: [...p.gear.prefer]}, cover: {when: p.cover.when},
  };
}

// The first decision that is more than ending a turn, so the table opens on something happening.
export function firstStepIndex(steps) {
  const at = steps.findIndex((step) => step.type !== "end");
  return at === -1 ? 0 : at;
}

// Pure: the showcase as the table shows it. {status: "none"} when nothing is recorded,
// {status: "unverified"} when the record says it was not verified, {status: "invalid"} when any
// shown field is missing, mistyped or inconsistent, else {status: "ok", ...}.
export function arenaView(raw, types = TYPES) {
  if (raw === null || raw === undefined) return {status: "none"};
  if (!isRecord(raw)) return {status: "invalid"};
  if (raw.verified === false) return {status: "unverified"};
  if (raw.verified !== true || !isText(raw.nativeWorkflowId) || !validSummary(raw.summary) || !validReplay(raw.replay)) {
    return {status: "invalid"};
  }
  const policies = Object.fromEntries(Object.keys(PERSONAS).map((p) => [p, validPolicy(raw.policies?.[p], p)]));
  return {status: "ok", workflowId: raw.nativeWorkflowId, summary: raw.summary, replay: raw.replay, policies,
    start: firstStepIndex(raw.replay.steps), types: isRecord(types) ? types : {}};
}

const cardName = (id, types) => {
  if (!isText(id, 80)) return null;
  const known = Object.hasOwn(types, id) && isRecord(types[id]) && isText(types[id].name, 80) ? types[id].name : null;
  return known ?? id;
};
const slotWord = (n) => (isInt(n) ? `슬롯 ${n + 1}` : null);

// Pure: what the acting character did, in words. Only face-up plays name a card.
export function actionText(action, types = {}) {
  const card = cardName(action.cardId, types);
  const slot = slotWord(action.slot);
  switch (action.type) {
    case "summon": {
      const paid = Array.isArray(action.tributes) ? action.tributes.length : null;
      const tribute = paid === null ? "" : paid === 0 ? ", 제물 없이" : `, 부대 ${paid}개를 제물로`;
      return `${card ?? "부대"} 소환${tribute}`;
    }
    case "spell": return `${card ?? "주문"} 시전${slotWord(action.target) ? `, 대상 ${slotWord(action.target)}` : ""}`;
    case "gear": return `${card ?? "장비"} 장착${slot ? `, ${slot}의 자기 부대에` : ""}`;
    case "location": return `장소 ${card ?? "카드"} 사용`;
    case "set": return "뒤집어 둔 함정 설치";
    case "attack": {
      const from = slot ? `, ${slot}의 자기 부대로` : "";
      const at = action.target === "base" ? ", 상대 기지 대상" : slotWord(action.target) ? `, 상대 ${slotWord(action.target)}의 부대 대상` : "";
      return `공격${from}${at}`;
    }
    case "cover": return `${slot ? `${slot}의 ` : ""}자기 부대를 엄폐시킴`;
    default: return "턴 종료";
  }
}

// Pure: the engine event kinds for one decision, as words. Payloads are never read.
export function eventWords(events) {
  const kinds = [...new Set(events.map((e) => (isRecord(e) && typeof e.type === "string" && /^[a-z][a-z-]{0,30}$/i.test(e.type) ? e.type.replace(/-/g, " ") : null)).filter(Boolean))];
  return kinds.slice(0, EVENT_WORDS_MAX);
}

const list = (words) => words.join(", ");

// Pure: how the recorded choice follows the recorded playbook. Each line follows from decide() in
// experiments/agent-arena/playbook.js: the first type in order with an allowed legal action is taken,
// earlier types had every legal option ruled out, and `ruledOut` counts those plus any ruled-out options
// of the chosen type. When the record does not add up, no explanation is claimed.
export function personalityLines(policy, step) {
  const name = PERSONAS[step.persona].name;
  if (!policy) return [`${name}의 플레이북이 기록되지 않아 이 표는 선택 이유를 설명하지 않습니다.`];
  const pos = policy.order.indexOf(step.type);
  const counts = {};
  for (const action of step.legal) counts[action.type] = (counts[action.type] ?? 0) + 1;
  const earlier = policy.order.slice(0, pos).filter((type) => counts[type]);
  const earlierCount = sum(earlier.map((type) => counts[type]));
  const chosenRuledOut = step.ruledOut - earlierCount;
  // Which types a playbook can rule out at all (see allowed() in playbook.js).
  const canRuleOut = {
    attack: policy.attack.avoid.length > 0, summon: true,
    spell: policy.spell.onlyToKill, cover: policy.cover.when === "threatened",
  };
  const agrees = pos !== -1 && chosenRuledOut >= 0 && chosenRuledOut < counts[step.type]
    && earlier.every((type) => canRuleOut[type]) && (chosenRuledOut === 0 || canRuleOut[step.type]);
  if (!agrees) return ["기록된 플레이북과 이 결정이 맞지 않아 이 표는 선택 이유를 설명하지 않습니다."];
  const lines = [`플레이북 순서: ${list(policy.order.map((t) => TYPE_WORD[t]))}. 선택: ${TYPE_WORD[step.type]} (${policy.order.length}개 중 ${pos + 1}번째).`];
  // Options that depend on the hand are never counted or described, so nothing about unplayed cards shows.
  const why = {
    attack: () => `${counts.attack === 1 ? "가능한 공격 1개가" : `가능한 공격 ${counts.attack}개 모두가`} 기피 목록(${list(policy.attack.avoid)})에 해당해 공격을 자제했습니다.`,
    cover: () => "부대가 위협받을 때만 엄폐하므로 엄폐하지 않았습니다.",
  };
  for (const type of earlier) if (why[type]) lines.push(why[type]());
  if (chosenRuledOut > 0 && step.type === "attack") {
    lines.push(`가능한 공격 ${counts.attack}개 중 ${chosenRuledOut}개는 기피 목록(${list(policy.attack.avoid)})에 해당해 제외했습니다.`);
  }
  const preferKey = PREFER_OF[step.type];
  const prefer = preferKey ? policy[preferKey].prefer : [];
  const kept = counts[step.type] - chosenRuledOut;
  if (FROM_HAND.has(step.type)) {
    if (prefer.length) lines.push(`${josa(TYPE_WORD[step.type], "이")} 가능하면 ${josa(list(prefer), "을")} 선호합니다.`);
    if (step.type === "summon" && policy.summon.maxTributes < 2) {
      lines.push(`${policy.summon.maxTributes === 0 ? "제물 없는 소환만 합니다" : `제물은 최대 ${policy.summon.maxTributes}개까지만 씁니다`}.`);
    }
    if (step.type === "spell" && policy.spell.onlyToKill) lines.push("부대를 쓰러뜨리는 주문만 시전합니다.");
  } else if (step.type === "attack" && kept > 1) {
    lines.push(prefer.length ? `허용된 공격 ${kept}개를 ${list(prefer)} 기준으로 순위를 매겨 1순위를 골랐습니다.` : "엔진이 나열한 첫 번째 허용 공격을 골랐습니다.");
  } else if (step.type !== "end" && kept === 1) {
    lines.push(`허용된 ${step.type === "attack" ? "공격" : "엄폐 방법"}은 이것 하나뿐이었습니다.`);
  }
  const never = Object.keys(counts).filter((type) => !FROM_HAND.has(type) && !policy.order.includes(type));
  if (never.length) lines.push(`이 플레이북은 다음을 절대 선택하지 않습니다: ${list(never.map((t) => TYPE_WORD[t]))}.`);
  return lines;
}

// Pure: the digits a player reads first.
export function scoreHtml(view) {
  const {summary} = view;
  const [sheriff, wizard] = Object.keys(PERSONAS);
  const seat = (side) => `${SEAT_NAME[side]} 선공 ${summary.byStartingSeat[side].games}판`;
  return `<p class="arena-score" aria-label="시리즈 점수">
      <span>${PERSONAS[sheriff].name} <strong>${summary.wins[sheriff]}</strong></span>
      <span>${PERSONAS[wizard].name} <strong>${summary.wins[wizard]}</strong></span>
      <span>무승부 <strong>${summary.wins.draw}</strong></span>
    </p>
    <p class="sd-note">총 ${summary.games}판. ${seat("cowboy")}, ${seat("wizard")}.</p>`;
}

function rosterHtml(view) {
  return `<ul class="arena-roster">${Object.entries(PERSONAS).map(([id, {name, side}]) => {
    const policy = view.policies[id];
    const motto = policy?.motto ? `<q class="arena-motto">${esc(policy.motto)}</q>` : "";
    const skipped = policy ? ACTION_TYPES.filter((t) => !policy.order.includes(t)) : [];
    const plan = policy
      ? `<span class="sd-note">시도: ${esc(list(policy.order.map((t) => TYPE_WORD[t])))}.${skipped.length ? ` 절대 안 함: ${esc(list(skipped.map((t) => TYPE_WORD[t])))}.` : ""}</span>`
      : `<span class="sd-note">이 캐릭터의 플레이북이 기록되지 않았습니다.</span>`;
    return `<li data-persona="${id}"><strong>${name}</strong> <span class="arena-seat">${SEAT_NAME[side]} 자리</span> ${motto} ${plan}</li>`;
  }).join("")}</ul>`;
}

function replayHeadHtml(view) {
  const r = view.replay;
  const winner = r.result.winner;
  const result = SEATS.includes(winner) ? `${personaName(winner)} 승리` : "무승부";
  const bases = SEATS.map((side) => `${personaName(side)} 구슬 ${r.finalBases[side]}개`).join(", ");
  return `<p class="arena-seed">리플레이 시드 <strong>${r.seed}</strong>. ${personaName(r.first)} 선공.
      ${r.turns}턴 동안 결정 ${r.decisions}번.</p>
    <p class="arena-result">${result} (${esc(r.result.reason)}). 최종 기지: ${bases}.</p>`;
}

// Pure: one decision of the replay.
export function stepHtml(view, index) {
  const steps = view.replay.steps;
  const step = steps[index];
  const name = PERSONAS[step.persona].name;
  const events = eventWords(step.events);
  const lines = personalityLines(view.policies[step.persona], step);
  return `<p class="arena-step-head"><strong>${index + 1}/${steps.length}단계</strong>, ${step.turn}턴</p>
    <p class="arena-did" data-side="${step.side}"><strong>${name}</strong> ${esc(actionText(step.action, view.types))}.</p>
    ${events.length ? `<p class="sd-note">엔진 보고: ${esc(list(events))}.</p>` : ""}
    <ul class="arena-why" aria-label="${josa(name, "이")} 이렇게 선택한 이유">${lines.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>`;
}

// Pure: the whole table, opened on view.start, or an honest note.
export function tableHtml(view) {
  const title = `<h3 id="arena-table-title">에이전트 경기장</h3>`;
  const note = (text) => `<section class="arena-table-body" aria-labelledby="arena-table-title">${title}<p class="arena-empty">${text}</p></section>`;
  if (view.status === "none") return note("검증된 에이전트 경기장 대전이 아직 기록되지 않아 보여줄 점수나 리플레이가 없습니다.");
  if (view.status === "unverified") return note("기록된 에이전트 경기장 대전이 검증됨으로 표시되지 않아 표시할 내용이 없습니다.");
  if (view.status !== "ok") return note("기록된 에이전트 경기장 대전에 빠진 항목이 있거나 수치가 맞지 않아 표시할 내용이 없습니다.");
  const last = view.replay.steps.length - 1;
  return `<section class="arena-table-body" aria-labelledby="arena-table-title">
    ${title}
    ${scoreHtml(view)}
    ${rosterHtml(view)}
    ${replayHeadHtml(view)}
    <div class="arena-replay" role="group" aria-label="리플레이 조작. 왼쪽/오른쪽 화살표는 한 단계 이동, Home/End는 처음/끝으로 이동." tabindex="0">
      <div class="arena-controls">
        <button type="button" data-arena-step="back" aria-keyshortcuts="ArrowLeft"${view.start === 0 ? " disabled" : ""}>이전</button>
        <button type="button" data-arena-step="forward" aria-keyshortcuts="ArrowRight"${view.start === last ? " disabled" : ""}>다음</button>
      </div>
      <div class="arena-step" aria-live="polite">${stepHtml(view, view.start)}</div>
    </div>
    <p class="sd-note">Kiro 기본 워크플로 <code>${esc(view.workflowId)}</code>가 플레이했습니다. 플레이북 다이제스트 ${Object.keys(PERSONAS).map((p) => `<code>${esc(view.replay.playbookDigests[p].slice(0, 12))}</code>`).join(", ")}.</p>
  </section>`;
}

// Pure: the step a key moves to, or null when the key does nothing here.
export function nextIndex(key, index, count) {
  const to = {ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: count - 1}[key];
  return to === undefined ? null : Math.max(0, Math.min(count - 1, to));
}

// DOM: fills the Saloon drawer's `host`. Returns {view, index(), show(i)}, or null without a host.
export function mountArenaTable(host, {showcase = SHOWCASE, types = TYPES} = {}) {
  if (!host || typeof host.querySelector !== "function") return null;
  const view = arenaView(showcase, types);
  host.classList?.add("arena-table");
  host.innerHTML = tableHtml(view);
  if (view.status !== "ok") return {view, index: () => null, show: () => null};
  const count = view.replay.steps.length;
  const stage = host.querySelector(".arena-step");
  const deck = host.querySelector(".arena-replay");
  const back = host.querySelector('[data-arena-step="back"]');
  const forward = host.querySelector('[data-arena-step="forward"]');
  let index = view.start;
  const show = (i) => {
    index = Math.max(0, Math.min(count - 1, i));
    stage.innerHTML = stepHtml(view, index);
    back.disabled = index === 0;
    forward.disabled = index === count - 1;
    return index;
  };
  back.addEventListener("click", () => show(index - 1));
  forward.addEventListener("click", () => show(index + 1));
  deck.addEventListener("keydown", (event) => {
    const to = nextIndex(event.key, index, count);
    if (to === null) return;
    event.preventDefault();
    show(to);
  });
  return {view, index: () => index, show};
}
