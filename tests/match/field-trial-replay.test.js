// Pure checks for "Replay the repair" in the Night Shift saloon. No DOM, network or renderer.
// The fixture is a test-only witness built on a real catalog card; it is not product data.
import test from "node:test";
import assert from "node:assert/strict";
import {TYPES} from "../../src/game/showdown/cards.js";
import {FIELD_TRIAL} from "../../src/ui/field-trial-data.js";
import {
  EMPTY_TEXT, STEPS, canonical, checkFieldTrial, initialRepair, keyAction, mountRepairReplay, repairHtml,
  repairReducer, repairView,
} from "../../src/ui/field-trial-replay.js";

const [CARD, SPEC] = Object.entries(TYPES).find(([, c]) => c.kind === "troop" && Number.isInteger(c.attack));
const change = {card: CARD, field: "attack", from: SPEC.attack, to: SPEC.attack + 1};
const base = "0123456789abcdef0123456789abcdef01234567";
const inputs = {deals: [7], bots: "fixture"};
const shared = [{turn: 1, label: "Fixture opening move"}, {turn: 2, label: "Fixture second move"}];
const line = (winner, endTurn, label) => ({winner, endTurn,
  events: [...shared, {turn: 3, label, card: CARD}, {turn: endTurn, label: `Fixture finish for ${winner}`}]});
const witness = (overrides = {}) => ({schema: 1, base, inputs, change, seed: 42, first: "cowboy", turn: 3, matchedEvents: 2,
  baseline: line("wizard", 9, "Fixture <current> attack"), candidate: line("cowboy", 7, "Fixture proposed attack"), ...overrides});
const fresh = (overrides = {}) => ({pass: true, base, inputs: {bots: "fixture", deals: [7]}, change: {...change}, blocks: [], ...overrides});
const trial = (f = {}, w = {}) => ({fresh: fresh(f), witness: witness(w)});
// Production-shaped record hashes: 64 lowercase hex characters (sha256).
const RECORD = "3f7a9c2e5b1d8f4a6c0e2b9d7f5a3c1e8b6d4f2a0c9e7b5d3f1a8c6e4b2d0f9a";
const OTHER = "a".repeat(63) + "b";
const declined = (overrides = {}) => ({pass: false, base, inputs, change: {...change}, recordSha256: RECORD,
  reasons: ["Cowboy first-player wins rose above 60%", "Rule <balance> failed"],
  blocks: ["Refused a write outside scope"], ...overrides});

test("the coordinator's initial FIELD_TRIAL hides the entry", () => {
  const check = checkFieldTrial(FIELD_TRIAL);
  if (FIELD_TRIAL.fresh === null && FIELD_TRIAL.witness === null) assert.equal(check.reason, "missing");
  assert.deepEqual(checkFieldTrial({fresh: null, witness: null}), {ok: false, reason: "missing", text: EMPTY_TEXT.missing});
  assert.equal(checkFieldTrial({fresh: fresh(), witness: null}).reason, "missing", "a fresh check alone is not enough");
  assert.equal(checkFieldTrial({fresh: null, witness: witness()}).reason, "missing", "a witness alone is not enough");
  assert.equal(checkFieldTrial(undefined, TYPES).reason, "missing");
});

test("a passing fresh check with its matching witness is replayable", () => {
  const check = checkFieldTrial(trial());
  assert.equal(check.ok, true, check.text);
  assert.deepEqual(check.trial.change, change);
  assert.equal(check.trial.baseline.move.label, "Fixture <current> attack", "without a divergence, the move follows the matched events");
  assert.equal(canonical({b: 1, a: [2, {d: 3, c: 4}]}), canonical({a: [2, {c: 4, d: 3}], b: 1}));
});

test("mismatch guards: base, inputs and change must agree, and the fresh check must pass", () => {
  assert.equal(checkFieldTrial(trial({pass: false})).reason, "failed");
  assert.equal(checkFieldTrial(trial({pass: "true"})).reason, "failed", "only a real true passes");
  const base2 = checkFieldTrial(trial({base: "f".repeat(40)}));
  assert.equal(base2.reason, "mismatch");
  assert.match(base2.text, /서로 다른 기준/);
  assert.match(checkFieldTrial(trial({inputs: {deals: [8], bots: "fixture"}})).text, /서로 다른 입력 묶음/);
  assert.match(checkFieldTrial(trial({change: {...change, to: change.to + 1}})).text, /서로 다른 카드 변경/);
  assert.equal(checkFieldTrial(trial({inputs: null})).reason, "invalid");
  assert.equal(checkFieldTrial(trial({blocks: "none"})).reason, "invalid");
});

test("the change must name a real card stat that this build still has at its starting value", () => {
  const stale = checkFieldTrial(trial({change: {...change, from: change.from + 5, to: change.to + 5}},
    {change: {...change, from: change.from + 5, to: change.to + 5}}));
  assert.equal(stale.reason, "stale");
  assert.match(stale.text, new RegExp(`이 빌드는 공격력 ${SPEC.attack}`));
  for (const bad of [{...change, card: "no-such-card"}, {...change, field: "speed"}, {...change, to: change.from}, {...change, from: -1}]) {
    assert.equal(checkFieldTrial(trial({change: bad}, {change: bad})).reason, "invalid", JSON.stringify(bad));
  }
});

test("outcome guards: winners, turns, divergence and the shared opening must add up", () => {
  const bad = (w) => checkFieldTrial(trial({}, w)).reason;
  assert.equal(bad({schema: 2}), "invalid");
  assert.equal(bad({first: "outlaw"}), "invalid");
  assert.equal(bad({seed: -1}), "invalid");
  assert.equal(bad({baseline: {...line("wizard", 9, "x"), winner: "outlaw"}}), "invalid");
  assert.equal(bad({baseline: {...line("wizard", 9, "x"), endTurn: 2}}), "invalid", "a game cannot end before the changed turn");
  assert.equal(bad({baseline: {...line("wizard", 9, "x"), events: [shared[1], shared[0]]}}), "invalid", "events run in turn order");
  assert.equal(bad({baseline: {winner: "wizard", endTurn: 9, events: [{turn: 1, label: ""}]}}), "invalid");
  assert.equal(bad({baseline: {...line("wizard", 9, "x"), divergence: {turn: 4, label: "late"}}}), "invalid",
    "the recorded divergence happens on the witness turn");
  assert.equal(bad({candidate: line("cowboy", 7, "Fixture <current> attack")}), "invalid", "both versions cannot make the same move");
  assert.equal(bad({candidate: {...line("cowboy", 7, "y"), events: [{turn: 1, label: "Other opening"}, shared[1], {turn: 3, label: "y"}]}}),
    "invalid", "the matched events must match");
  assert.equal(bad({matchedEvents: 5}), "invalid", "no changed move after the matched events");
  const explicit = checkFieldTrial(trial({}, {matchedEvents: 0,
    baseline: {winner: "draw", endTurn: 12, events: [], divergence: {turn: 3, label: "Recorded current move", card: CARD}},
    candidate: {...line("cowboy", 7, "y"), divergence: {turn: 3, label: "Recorded proposed move"}}}));
  assert.equal(explicit.ok, true, explicit.text);
  assert.equal(explicit.trial.baseline.winner, "draw");
});

test("a prediction is required before the replay advances, and it locks once the finish shows", () => {
  const t = checkFieldTrial(trial()).trial;
  let s = initialRepair();
  assert.equal(repairReducer(s, {type: "next"}), s, "nothing to step before a version is chosen");
  assert.equal(repairReducer(s, {type: "predict", faction: "cowboy"}), s, "no call before a version is chosen");
  s = repairReducer(s, {type: "line", line: "candidate"});
  assert.equal(repairView(t, s).canNext, false);
  assert.match(repairView(t, s).caption, /제안 .* \(공격력 \d+\)일 때 어느 진영이 이길까요\?/);
  assert.equal(repairReducer(s, {type: "next"}), s, "the replay waits for the call");
  assert.equal(repairReducer(s, {type: "predict", faction: "outlaw"}), s);
  s = repairReducer(s, {type: "predict", faction: "wizard"});
  assert.match(repairView(t, s).caption, /^1\/3단계 · 시드 42\. 카우보이 선공\. 두 버전 모두 처음 2개 이벤트는 같습니다\.$/);
  s = repairReducer(s, {type: "next"});
  assert.equal(repairReducer(s, {type: "predict", faction: "cowboy"}), s, "the call cannot change mid-replay");
  assert.match(repairView(t, s).caption, /3턴, 제안 .*: Fixture proposed attack\.$/);
  assert.match(repairView(t, s).stage, /Fixture &lt;current&gt; attack/, "both moves show, escaped");
  s = repairReducer(s, {type: "next"});
  assert.equal(s.step, STEPS - 1);
  assert.equal(s.revealed, true);
  assert.equal(repairReducer(s, {type: "next"}), s, "the finish is the last step");
  const finish = repairView(t, s);
  assert.match(finish.caption, /7턴에 카우보이 승리\. 마법사 승리를 예상하셨습니다\. 예상이 빗나갔습니다\.$/);
  assert.match(finish.stage, /기록된 수 \(4\)/);
  s = repairReducer(s, {type: "restart"});
  assert.equal(s.step, 0);
  assert.equal(repairReducer(s, {type: "predict", faction: "cowboy"}), s, "a replay after the reveal keeps the original call");
  s = repairReducer(s, {type: "line", line: "baseline"});
  assert.deepEqual(s, {line: "baseline", prediction: null, step: 0, revealed: false}, "the other version is a new call");
  s = repairReducer(repairReducer(repairReducer(s, {type: "predict", faction: "wizard"}), {type: "next"}), {type: "next"});
  assert.match(repairView(t, s).caption, /9턴에 마법사 승리\. 마법사 승리를 예상하셨습니다\. 예상이 맞았습니다\.$/);
});

test("keyboard: arrows and Home step the replay, everything else keeps its meaning", () => {
  assert.deepEqual(keyAction({key: "ArrowRight"}), {type: "next"});
  assert.deepEqual(keyAction({key: "ArrowLeft"}), {type: "back"});
  assert.deepEqual(keyAction({key: "Home"}), {type: "restart"});
  for (const key of ["Enter", " ", "Tab", "Escape", "End", "n"]) assert.equal(keyAction({key}), null, key);
  assert.equal(keyAction({key: "ArrowRight", altKey: true}), null, "browser shortcuts are left alone");
  assert.equal(keyAction({key: "Home", metaKey: true}), null);
  const t = checkFieldTrial(trial()).trial;
  let s = repairReducer(initialRepair(), {type: "line", line: "baseline"});
  assert.equal(repairReducer(s, keyAction({key: "ArrowRight"})), s, "the arrow cannot skip the call");
  s = repairReducer(s, {type: "predict", faction: "cowboy"});
  s = repairReducer(s, keyAction({key: "ArrowRight"}));
  assert.equal(repairView(t, s).canBack, true);
  s = repairReducer(s, keyAction({key: "ArrowLeft"}));
  assert.equal(s.step, 0);
  assert.equal(repairReducer(s, keyAction({key: "ArrowLeft"})), s, "Back at the start does nothing");
});

test("the section shows card, before/after stat, seed, opening faction, turn and divergence; refusals say why", () => {
  const html = repairHtml(checkFieldTrial(trial()));
  assert.match(html, /<summary>수리 과정 다시 보기<\/summary>/);
  for (const text of [SPEC.name, `공격력 ${change.from} → ${change.to}`, ">42<", ">카우보이<", ">3<", "처음 2개 이벤트는 같고",
    `data-repair-portrait="${CARD}"`, "기준 <code>0123456</code>에서 새 검사를 통과했습니다"]) {
    assert.ok(html.includes(text), text);
  }
  assert.match(html, /data-repair-line="baseline" aria-pressed="false"[^>]*>현재 /);
  assert.match(html, /data-repair-line="candidate" aria-pressed="false"[^>]*>제안 /);
  const refused = repairHtml(checkFieldTrial(trial({base: "f".repeat(40)})));
  assert.match(refused, /서로 다른 기준/);
  assert.doesNotMatch(refused, /data-repair-line/, "a mismatch shows no replay");
});

test("mounting with no recorded trial hides the entry without touching anything else", () => {
  const box = {hidden: false, innerHTML: ""};
  const mounted = mountRepairReplay(box, {trial: {fresh: null, witness: null}});
  assert.equal(box.hidden, true);
  assert.equal(mounted.check.reason, "missing");
  assert.equal(mounted.state(), null);
  const shown = {hidden: true, innerHTML: ""};
  mountRepairReplay(shown, {trial: trial({pass: false})});
  assert.equal(shown.hidden, false, "a failed check is an honest empty state, not a hidden one");
  assert.match(shown.innerHTML, /통과하지 못해/);
});

test("a complete failing fresh check shows without a witness: card, stat, exact reasons, no winner replay", () => {
  const check = checkFieldTrial({fresh: declined(), witness: null});
  assert.equal(check.ok, false);
  assert.equal(check.reason, "failed");
  assert.deepEqual(check.declined.reasons, declined().reasons, "reasons are kept exactly");
  assert.deepEqual(check.declined.blocks, ["Refused a write outside scope"]);
  assert.equal(check.declined.change.name, SPEC.name);
  assert.equal(checkFieldTrial({fresh: declined(), witness: witness()}).declined.reasons.length, 2, "a witness does not hide it");
  const html = repairHtml(check);
  for (const text of [SPEC.name, `공격력 ${change.from} → ${change.to}`, "Cowboy first-player wins rose above 60%",
    "Rule &lt;balance&gt; failed", "Refused a write outside scope", "승자 리플레이가 없습니다", `data-repair-portrait="${CARD}"`,
    "기준 <code>0123456</code>의 새 검사"]) {
    assert.ok(html.includes(text), text);
  }
  assert.doesNotMatch(html, /Rule <balance>/, "reasons are escaped");
  assert.doesNotMatch(html, /data-repair-line|data-repair-predict|data-repair-step|data-winner|턴에 .* 승리/, "no outcome is invented");
  const objectBlock = checkFieldTrial({fresh: declined({blocks: [{rule: "balancer", reason: "Out of scope"}]}), witness: null});
  assert.deepEqual(objectBlock.declined.blocks, ["Out of scope"]);
  assert.doesNotMatch(repairHtml(checkFieldTrial({fresh: declined({blocks: []}), witness: null})), /블록 사유/);
});

test("a failing fresh check drops an untrustworthy card stat, and an incomplete one is not shown", () => {
  const stale = checkFieldTrial({fresh: declined({change: {...change, from: change.from + 5, to: change.to + 5}}), witness: null});
  assert.equal(stale.declined.change, null, "a stale stat is not shown as this build's card");
  const html = repairHtml(stale);
  assert.doesNotMatch(html, /data-repair-portrait|<dt>Card<\/dt>/);
  assert.match(html, /Cowboy first-player wins/);
  assert.equal(checkFieldTrial({fresh: declined({change: {...change, card: "no-such-card"}}), witness: null}).declined.change, null);
  for (const bad of [{reasons: []}, {reasons: [""]}, {reasons: "failed"}, {reasons: undefined}, {blocks: [42]},
    {blocks: undefined}, {base: ""}, {inputs: null}, {change: null}, {pass: "false"}]) {
    assert.equal(checkFieldTrial({fresh: declined(bad), witness: null}).reason, "missing", JSON.stringify(bad));
  }
  const box = {hidden: true, innerHTML: "", querySelectorAll: () => []};
  const mounted = mountRepairReplay(box, {trial: {fresh: declined(), witness: null}});
  assert.equal(box.hidden, false, "a declined run is shown, not hidden");
  assert.equal(mounted.state(), null);
  assert.match(box.innerHTML, /승자 리플레이가 없습니다/);
});

test("a witness that seals the fresh record must name the same production hash", () => {
  const sealed = checkFieldTrial(trial({recordSha256: RECORD}, {fresh: {recordSha256: RECORD}}));
  assert.equal(sealed.ok, true, sealed.text);
  assert.equal(sealed.trial.record, RECORD);
  assert.match(repairHtml(sealed), /기준 <code>0123456<\/code>, 기록 <code>3f7a9c2<\/code>에서 새 검사를 통과했습니다/);
  assert.equal(checkFieldTrial(trial({recordSha256: RECORD}, {fresh: RECORD})).ok, true, "a bare hash seal also binds");
  const wrong = checkFieldTrial(trial({recordSha256: OTHER}, {fresh: {recordSha256: RECORD}}));
  assert.equal(wrong.reason, "mismatch");
  assert.match(wrong.text, /서로 다른 새 검사 기록/);
  assert.doesNotMatch(repairHtml(wrong), /data-repair-line/, "a wrong hash shows no replay");
  assert.equal(checkFieldTrial(trial({}, {fresh: {recordSha256: RECORD}})).reason, "invalid", "a sealed witness needs the fresh hash");
  assert.equal(checkFieldTrial(trial({recordSha256: RECORD.toUpperCase()}, {fresh: {recordSha256: RECORD}})).reason, "invalid");
  assert.equal(checkFieldTrial(trial({recordSha256: RECORD}, {fresh: {recordSha256: "abc"}})).reason, "invalid");
  assert.equal(checkFieldTrial(trial({recordSha256: RECORD}, {fresh: null})).reason, "invalid");
  assert.equal(checkFieldTrial(trial({recordSha256: OTHER})).ok, true, "an unsealed witness keeps the older check");
});
