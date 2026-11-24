// "Replay the repair" in the Night Shift saloon. The visitor picks the Current or Proposed card,
// predicts which faction wins, then steps through the recorded deal, the changed move and the real finish.
// Data is FIELD_TRIAL (src/ui/field-trial-data.js, owned by the coordinator): a fresh check and the
// witness replay it vouches for. A complete, published failing fresh check is shown on its own, with its
// rule reasons and block reasons and no winner replay. A replay is shown only when both exist, the fresh
// check passed, both name the same base, inputs and change (and the same record hash when the witness
// seals one), the change matches the card in this build, and the witness adds up.
// No timer, audio or network: every step is a button press or an arrow key.
import {josa} from "./josa.js";
import {TYPES, typeOf} from "../game/showdown/cards.js";
import {FIELD_TRIAL} from "./field-trial-data.js";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);

export const FACTION = Object.freeze({cowboy: "카우보이", wizard: "마법사"});
export const LINES = Object.freeze(["baseline", "candidate"]);
export const PREDICTIONS = Object.freeze(["cowboy", "wizard"]);
export const STEPS = 3; // the deal, the changed move, the finish
const LAST = STEPS - 1;
const STATS = ["attack", "health", "stars"];
const WINNERS = ["cowboy", "wizard", "draw"];
const LABEL_MAX = 160;
const ID_MAX = 80;
const BASE_MAX = 80;
const EVENTS_MAX = 400;
const REASONS_MAX = 20;
const SHA256 = /^[0-9a-f]{64}$/;

const isObject = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isInt = (n, min = 0) => Number.isInteger(n) && n >= min;
const isText = (s, max) => typeof s === "string" && s.trim().length > 0 && s.length <= max;
const typeFor = (id, types) => (typeof id === "string" && types[typeOf(id)] ? typeOf(id) : null);
const FIELD_KO = {attack: "공격력", health: "체력", stars: "별"};
const fieldKo = (f) => FIELD_KO[f] ?? f;
const shortBase = (base) => (/^[0-9a-f]{40}$/.test(base) ? base.slice(0, 7) : base);

// Pure: one JSON text per value with object keys sorted, so equal records compare equal.
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

function cleanMove(e) {
  if (!isObject(e) || !isInt(e.turn, 1) || !isText(e.label, LABEL_MAX)) return null;
  for (const key of ["card", "target"]) if (e[key] !== undefined && !isText(e[key], ID_MAX)) return null;
  const move = {turn: e.turn, label: e.label.trim()};
  if (e.card !== undefined) move.card = e.card;
  if (e.target !== undefined) move.target = e.target;
  return move;
}

// Pure: one recorded line, or null. Its changed move is `divergence` when recorded, otherwise the event
// right after the matched ones. Either way it happens on the witness turn.
function cleanLine(run, turn, matched) {
  if (!isObject(run) || !WINNERS.includes(run.winner) || !isInt(run.endTurn, turn)) return null;
  if (!Array.isArray(run.events) || run.events.length > EVENTS_MAX) return null;
  const events = run.events.map(cleanMove);
  if (events.some((e) => !e)) return null;
  if (events.some((e, i) => i > 0 && e.turn < events[i - 1].turn)) return null;
  if (events.length && events.at(-1).turn > run.endTurn) return null;
  let divergence = null;
  if (run.divergence !== undefined) {
    divergence = cleanMove(run.divergence);
    if (!divergence) return null;
  }
  const move = divergence ?? events[matched] ?? null;
  if (!move || move.turn !== turn) return null;
  return {winner: run.winner, endTurn: run.endTurn, events, divergence, move};
}

function cleanChange(change, types) {
  if (!isObject(change)) return null;
  const type = typeFor(change.card, types);
  if (!type || !STATS.includes(change.field) || !isInt(change.from) || !isInt(change.to) || change.from === change.to) return null;
  if (!Number.isInteger(types[type][change.field])) return null;
  return {card: type, field: change.field, from: change.from, to: change.to};
}

const refuse = (reason, text) => ({ok: false, reason, text});
export const EMPTY_TEXT = Object.freeze({
  missing: "이 빌드에 기록된 현장 시험이 아직 없습니다.",
  failed: "새 검사를 통과하지 못해 수리 과정을 재생하지 않습니다.",
  invalid: "증인 리플레이가 불완전하거나 수치가 맞지 않아 수리 과정을 재생하지 않습니다.",
});
export const DECLINED_TEXT = "새 검사를 통과하지 못했습니다. 실패한 검사에는 보여줄 기록된 결말이 없어 승자 리플레이가 없습니다.";

const blockText = (b) => {
  if (isText(b, LABEL_MAX)) return b;
  return isObject(b) && isText(b.reason, LABEL_MAX) ? b.reason : null;
};
const textList = (list) => Array.isArray(list) && list.length <= REASONS_MAX;

// Pure: a complete, published failing fresh check, or null. It needs a base, inputs, a change record,
// at least one failing rule reason and readable block reasons. The card and stat are kept only when the
// change names a real card stat that this build still has at its starting value.
function declinedFresh(fresh, types) {
  if (!isObject(fresh) || fresh.pass !== false) return null;
  if (!isText(fresh.base, BASE_MAX) || fresh.inputs === undefined || fresh.inputs === null || !isObject(fresh.change)) return null;
  if (!textList(fresh.reasons) || !fresh.reasons.length || !fresh.reasons.every((r) => isText(r, LABEL_MAX))) return null;
  if (!textList(fresh.blocks)) return null;
  const blocks = fresh.blocks.map(blockText);
  if (blocks.some((b) => b === null)) return null;
  const change = cleanChange(fresh.change, types);
  const trusted = change && types[change.card][change.field] === change.from ? {...change, name: types[change.card].name} : null;
  return {base: fresh.base, change: trusted, reasons: [...fresh.reasons], blocks};
}

// Pure: the record hash the witness seals, undefined when it seals none, or null when the seal is unreadable.
function witnessSeal(witness) {
  if (witness.fresh === undefined) return undefined;
  const seal = isObject(witness.fresh) ? witness.fresh.recordSha256 : witness.fresh;
  return typeof seal === "string" && SHA256.test(seal) ? seal : null;
}

// Pure: {ok: true, trial} for a verified, matching fresh check and witness; otherwise
// {ok: false, reason, text} with reason missing, failed, mismatch, stale or invalid. A complete failing
// fresh check is read first, with or without a witness, and adds `declined` with what it published.
export function checkFieldTrial(input = FIELD_TRIAL, types = TYPES) {
  const fresh = input?.fresh, witness = input?.witness;
  const declined = declinedFresh(fresh, types);
  if (declined) return {ok: false, reason: "failed", text: DECLINED_TEXT, declined};
  if (!isObject(fresh) || !isObject(witness)) return refuse("missing", EMPTY_TEXT.missing);
  if (fresh.pass !== true) return refuse("failed", EMPTY_TEXT.failed);
  const seal = witnessSeal(witness);
  if (seal === null) return refuse("invalid", EMPTY_TEXT.invalid);
  if (seal !== undefined && !(typeof fresh.recordSha256 === "string" && SHA256.test(fresh.recordSha256))) {
    return refuse("invalid", EMPTY_TEXT.invalid);
  }
  if (witness.schema !== 1 || !Array.isArray(fresh.blocks)) return refuse("invalid", EMPTY_TEXT.invalid);
  if (!isText(fresh.base, BASE_MAX) || !isText(witness.base, BASE_MAX)) return refuse("invalid", EMPTY_TEXT.invalid);
  if (witness.inputs === undefined || witness.inputs === null || fresh.inputs === undefined || fresh.inputs === null) {
    return refuse("invalid", EMPTY_TEXT.invalid);
  }
  const mismatch = (what) => refuse("mismatch", `새 검사와 증인 리플레이가 서로 다른 ${josa(what, "을")} 가리켜 수리 과정을 재생하지 않습니다.`);
  if (seal !== undefined && fresh.recordSha256 !== seal) return mismatch("새 검사 기록");
  if (fresh.base !== witness.base) return mismatch("기준");
  if (canonical(fresh.inputs) !== canonical(witness.inputs)) return mismatch("입력 묶음");
  const change = cleanChange(witness.change, types);
  if (!change || !cleanChange(fresh.change, types)) return refuse("invalid", EMPTY_TEXT.invalid);
  if (canonical(fresh.change) !== canonical(witness.change)) return mismatch("카드 변경");
  const live = types[change.card][change.field];
  const name = types[change.card].name;
  if (live !== change.from) {
    return refuse("stale", `증인 리플레이는 ${name} ${fieldKo(change.field)} ${change.from}에서 시작하지만 이 빌드는 ${fieldKo(change.field)} ${live}이라 수리 과정을 재생하지 않습니다.`);
  }
  const {seed, first, turn, matchedEvents} = witness;
  if (!isInt(seed) || !(first in FACTION) || !isInt(turn, 1) || !isInt(matchedEvents)) return refuse("invalid", EMPTY_TEXT.invalid);
  const baseline = cleanLine(witness.baseline, turn, matchedEvents);
  const candidate = cleanLine(witness.candidate, turn, matchedEvents);
  if (!baseline || !candidate) return refuse("invalid", EMPTY_TEXT.invalid);
  // The two lines must split at the changed move, and agree before it when both logs hold the matched events.
  if (canonical(baseline.move) === canonical(candidate.move)) return refuse("invalid", EMPTY_TEXT.invalid);
  if (baseline.events.length >= matchedEvents && candidate.events.length >= matchedEvents
    && canonical(baseline.events.slice(0, matchedEvents)) !== canonical(candidate.events.slice(0, matchedEvents))) {
    return refuse("invalid", EMPTY_TEXT.invalid);
  }
  return {ok: true, trial: {base: witness.base, change, name, seed, first, turn, matchedEvents,
    blocks: fresh.blocks.length, record: seal ?? null, baseline, candidate}};
}

export const lineWord = (line) => (line === "baseline" ? "현재" : "제안");
export const lineName = (line, trial) => `${lineWord(line)} ${trial.name}`;
export const lineValue = (line, trial) => (line === "baseline" ? trial.change.from : trial.change.to);
export const statText = (line, trial) => `${fieldKo(trial.change.field)} ${lineValue(line, trial)}`;

// --- The interaction model: choose a line, predict, then step. The prediction locks once the finish shows. ---
export function initialRepair() {
  return {line: null, prediction: null, step: 0, revealed: false};
}

export function repairReducer(state, action) {
  const s = state ?? initialRepair();
  switch (action?.type) {
    case "line":
      if (!LINES.includes(action.line) || action.line === s.line) return s;
      return {line: action.line, prediction: null, step: 0, revealed: false};
    case "predict":
      if (!s.line || s.revealed || s.step !== 0 || !PREDICTIONS.includes(action.faction)) return s;
      return {...s, prediction: action.faction};
    case "next": {
      if (!s.line || !s.prediction || s.step >= LAST) return s;
      const step = s.step + 1;
      return {...s, step, revealed: s.revealed || step === LAST};
    }
    case "back":
      return s.line && s.step > 0 ? {...s, step: s.step - 1} : s;
    case "restart":
      return s.line && s.step > 0 ? {...s, step: 0} : s;
    default:
      return s;
  }
}

// Pure: the arrow and Home keys step the replay; every other key keeps its usual meaning.
const KEYS = {ArrowRight: "next", ArrowLeft: "back", Home: "restart"};
export function keyAction(event) {
  if (!event || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return KEYS[event.key] ? {type: KEYS[event.key]} : null;
}

export function finishText(run) {
  return run.winner === "draw" ? `${run.endTurn}턴에 무승부: 어느 진영도 이기지 못했습니다`
    : `${run.endTurn}턴에 ${FACTION[run.winner]} 승리`;
}

export function verdictText(run, prediction) {
  const right = run.winner === prediction;
  return `${FACTION[prediction]} 승리를 예상하셨습니다. ${right ? "예상이 맞았습니다." : "예상이 빗나갔습니다."}`;
}

const portraitSpan = (id) => {
  const type = typeFor(id, TYPES);
  return type ? `<span class="saloon-repair-portrait" data-repair-portrait="${esc(type)}" aria-hidden="true"></span>` : "";
};

function moveHtml(line, trial, chosen) {
  const {move} = trial[line];
  return `<li class="saloon-repair-move${line === chosen ? " is-chosen" : ""}">${portraitSpan(move.card)}${portraitSpan(move.target)}`
    + `<span><strong>${esc(lineWord(line))}</strong> · ${esc(statText(line, trial))}<br>${move.turn}턴: ${esc(move.label)}</span></li>`;
}

function logHtml(run) {
  if (!run.events.length) return "";
  const items = run.events.map((e) => `<li><span class="saloon-repair-turn">${e.turn}턴</span> ${esc(e.label)}</li>`).join("");
  return `<details class="saloon-repair-log"><summary>기록된 수 (${run.events.length})</summary><ol>${items}</ol></details>`;
}

// Pure: everything the replay shows and which controls work, for one state.
export function repairView(trial, state = initialRepair()) {
  const s = state;
  const steps = `${s.step + 1}/${STEPS}단계`;
  const view = {line: s.line, prediction: s.prediction, step: s.step,
    canPredict: Boolean(s.line) && !s.revealed && s.step === 0,
    canNext: Boolean(s.line && s.prediction) && s.step < LAST,
    canBack: Boolean(s.line) && s.step > 0,
    canRestart: Boolean(s.line) && s.step > 0};
  if (!s.line) {
    return {...view, stage: "",
      caption: `${lineName("baseline", trial)} 또는 ${lineName("candidate", trial)}를 고른 뒤 어느 진영이 이길지 예상하세요.`};
  }
  if (!s.prediction) {
    return {...view, stage: "",
      caption: `${lineName(s.line, trial)} (${statText(s.line, trial)})일 때 어느 진영이 이길까요? 예상을 정하면 리플레이가 시작됩니다.`};
  }
  const run = trial[s.line];
  const called = `<p class="saloon-repair-call">내 예상: ${esc(FACTION[s.prediction])} 승리.</p>`;
  if (s.step === 0) {
    return {...view, stage: called,
      caption: `${steps} · 시드 ${trial.seed}. ${FACTION[trial.first]} 선공. 두 버전 모두 처음 ${trial.matchedEvents}개 이벤트는 같습니다.`};
  }
  const moves = `<ol class="saloon-repair-moves" aria-label="${trial.turn}턴에서 버전이 갈라지는 지점">${LINES.map((line) => moveHtml(line, trial, s.line)).join("")}</ol>`;
  if (s.step === 1) {
    return {...view, stage: `${called}${moves}`,
      caption: `${steps} · ${trial.turn}턴, ${lineName(s.line, trial)}: ${run.move.label}.`};
  }
  const finish = `<p class="saloon-repair-finish" data-winner="${esc(run.winner)}"><strong>${esc(finishText(run))}.</strong> ${esc(verdictText(run, s.prediction))}</p>`;
  return {...view, stage: `${moves}${finish}${logHtml(run)}`,
    caption: `${steps} · ${finishText(run)}. ${verdictText(run, s.prediction)}`};
}

const fact = (term, value) => `<div><dt>${term}</dt><dd>${value}</dd></div>`;
const changeText = (change) => `${esc(fieldKo(change.field))} ${change.from} → ${change.to}`;
const reasonList = (label, items) => (items.length
  ? `<p><strong>${label}</strong></p><ul class="saloon-repair-reasons">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
  : "");

// Pure: a failing fresh check as published. Card and stat only when trustworthy; no replay controls.
function declinedHtml(d) {
  const card = d.change ? `<div class="saloon-repair-deal">
      ${portraitSpan(d.change.card)}
      <dl class="saloon-repair-facts">${fact("카드", esc(d.change.name))}${fact("변경", changeText(d.change))}</dl>
    </div>` : "";
  return `<div class="saloon-repair-body saloon-repair-declined">
    <p class="sd-note saloon-repair-empty">${esc(DECLINED_TEXT)}</p>
    ${card}
    <p class="sd-note">기준 <code>${esc(shortBase(d.base))}</code>의 새 검사.</p>
    ${reasonList("실패한 규칙", d.reasons)}
    ${reasonList("블록 사유", d.blocks)}
  </div>`;
}

// Pure: the section's inner HTML. A missing trial is hidden by the caller; any other refusal says why.
export function repairHtml(check) {
  const summary = `<summary>수리 과정 다시 보기</summary>`;
  if (!check.ok && check.declined) return `${summary}${declinedHtml(check.declined)}`;
  if (!check.ok) return `${summary}<p class="sd-note saloon-repair-empty">${esc(check.text)}</p>`;
  const t = check.trial;
  const button = (attr, value, label, extra = "") => `<button type="button" ${attr}="${value}" aria-pressed="false"${extra}>${esc(label)}</button>`;
  const record = t.record ? `, 기록 <code>${esc(t.record.slice(0, 7))}</code>` : "";
  return `${summary}
  <div class="saloon-repair-body">
    <div class="saloon-repair-deal">
      ${portraitSpan(t.change.card)}
      <dl class="saloon-repair-facts">
        ${fact("카드", esc(t.name))}
        ${fact("변경", changeText(t.change))}
        ${fact("시드", String(t.seed))}
        ${fact("선공 진영", FACTION[t.first])}
        ${fact("턴", String(t.turn))}
        ${fact("분기", `처음 ${t.matchedEvents}개 이벤트는 같고, 그 뒤 버전이 갈라집니다`)}
      </dl>
    </div>
    <p class="sd-note">기준 <code>${esc(shortBase(t.base))}</code>${record}에서 새 검사를 통과했습니다. 기록된 게임을 있었던 그대로 재생합니다.</p>
    <div class="saloon-buttons saloon-repair-lines" role="group" aria-label="재생할 버전 선택">
      ${LINES.map((line) => button("data-repair-line", line, `${lineName(line, t)} · ${statText(line, t)}`, ' aria-controls="saloon-repair-stage"')).join("")}
    </div>
    <div class="saloon-buttons saloon-repair-predict" role="group" aria-label="어느 진영이 이길지 예상" hidden>
      ${PREDICTIONS.map((faction) => button("data-repair-predict", faction, `${FACTION[faction]} 승리`)).join("")}
    </div>
    <div id="saloon-repair-stage" class="saloon-repair-stage"></div>
    <p class="saloon-repair-now" role="status" aria-live="polite"></p>
    <div class="saloon-buttons saloon-repair-steps" role="group" aria-label="리플레이 단계" hidden>
      <button type="button" data-repair-step="back">이전 단계</button>
      <button type="button" data-repair-step="next">다음 단계</button>
      <button type="button" data-repair-step="restart">처음부터 다시</button>
    </div>
    <p class="sd-note saloon-repair-keys">키: 오른쪽 화살표는 다음 단계, 왼쪽 화살표는 이전 단계, Home은 처음으로.</p>
  </div>`;
}

function fillPortraits(root, portrait) {
  for (const slot of root.querySelectorAll("[data-repair-portrait]")) {
    const id = slot.dataset.repairPortrait;
    const image = (TYPES[id] && portrait(id)) || Object.assign(document.createElement("span"),
      {className: "saloon-art-missing", textContent: (TYPES[id]?.name ?? "?").slice(0, 1).toUpperCase()});
    image.setAttribute("aria-hidden", "true");
    slot.replaceChildren(image);
  }
}

// DOM: fills `box` (a <details>) once. Buttons are never replaced and focus never moves, so a keyboard
// visitor can press Next step again and again; disabled controls use aria-disabled and stay focusable.
export function mountRepairReplay(box, {trial = FIELD_TRIAL, portrait = () => null, types = TYPES} = {}) {
  const check = checkFieldTrial(trial, types);
  box.hidden = check.reason === "missing";
  box.innerHTML = repairHtml(check);
  if (check.declined) fillPortraits(box, portrait);
  if (!check.ok) return {check, state: () => null};
  const t = check.trial;
  const $ = (selector) => box.querySelector(selector);
  const lineButtons = [...box.querySelectorAll("[data-repair-line]")];
  const predictButtons = [...box.querySelectorAll("[data-repair-predict]")];
  const [predictRow, stage, now, stepRow, back, next, restart] = [".saloon-repair-predict", ".saloon-repair-stage",
    ".saloon-repair-now", ".saloon-repair-steps", '[data-repair-step="back"]', '[data-repair-step="next"]',
    '[data-repair-step="restart"]'].map($);
  let state = initialRepair();
  fillPortraits($(".saloon-repair-deal"), portrait);

  function render() {
    const view = repairView(t, state);
    stage.innerHTML = view.stage;
    fillPortraits(stage, portrait);
    now.textContent = view.caption;
    for (const b of lineButtons) b.setAttribute("aria-pressed", String(b.dataset.repairLine === view.line));
    predictRow.hidden = !view.line;
    for (const b of predictButtons) {
      b.setAttribute("aria-pressed", String(b.dataset.repairPredict === view.prediction));
      b.setAttribute("aria-disabled", String(!view.canPredict));
    }
    stepRow.hidden = !view.prediction;
    back.setAttribute("aria-disabled", String(!view.canBack));
    next.setAttribute("aria-disabled", String(!view.canNext));
    restart.setAttribute("aria-disabled", String(!view.canRestart));
  }
  function dispatch(action) {
    const after = repairReducer(state, action);
    if (after === state) return false;
    state = after;
    render();
    return true;
  }
  box.addEventListener("click", (event) => {
    const b = event.target.closest?.("button");
    if (!b || !box.contains(b) || b.getAttribute("aria-disabled") === "true") return;
    const {repairLine, repairPredict, repairStep} = b.dataset;
    if (repairLine) dispatch({type: "line", line: repairLine});
    else if (repairPredict) dispatch({type: "predict", faction: repairPredict});
    else if (repairStep) dispatch({type: repairStep});
  });
  box.addEventListener("keydown", (event) => {
    if (!event.target.closest?.(".saloon-repair-body")) return;
    const action = keyAction(event);
    if (action && dispatch(action)) event.preventDefault();
  });
  render();
  return {check, state: () => state};
}
