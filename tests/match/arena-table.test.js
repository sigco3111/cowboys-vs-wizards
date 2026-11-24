import {test} from "node:test";
import assert from "node:assert/strict";
import {
  arenaView, tableHtml, stepHtml, scoreHtml, actionText, eventWords, personalityLines, nextIndex, firstStepIndex,
  mountArenaTable, PERSONAS,
} from "../../src/ui/arena-table.js";
import {validatePlaybook} from "../../experiments/agent-arena/playbook.js";
import {playSeries, recordReplay} from "../../experiments/agent-arena/arena.mjs";

const SHERIFF = {
  schema: "agent-arena-playbook/1", persona: "cautious-sheriff", motto: "Hold the line and keep the Base whole.",
  order: ["cover", "summon", "set", "attack", "gear", "spell", "location", "end"],
  attack: {prefer: ["kill", "attacker-survives"], avoid: ["suicide", "even-trade", "chip"]},
  summon: {prefer: ["guard", "toughest"], maxTributes: 1}, spell: {prefer: ["kill"], onlyToKill: true},
  gear: {prefer: ["most-threatened"]}, cover: {when: "threatened"},
};
const WIZARD = {
  schema: "agent-arena-playbook/1", persona: "reckless-wizard", motto: "Burn it all down.",
  order: ["attack", "spell", "summon", "gear", "set", "location", "end"],
  attack: {prefer: ["win-now", "go-face", "base-damage"], avoid: []},
  summon: {prefer: ["hardest-hitting"], maxTributes: 2}, spell: {prefer: ["most-hit"], onlyToKill: false},
  gear: {prefer: ["hardest-hitting"]}, cover: {when: "threatened"},
};
const TYPES = {"wizard-imp": {name: "Imp"}};

// Shaped exactly like recordReplay() and summarize() in experiments/agent-arena/arena.mjs.
const step = (n, turn, side, legal, chosen, ruledOut, events) => ({
  n, turn, side, persona: side === "cowboy" ? "cautious-sheriff" : "reckless-wizard", legal, chosen,
  action: legal[chosen], type: legal[chosen].type, ruledOut, events,
});
const witness = () => ({
  nativeWorkflowId: "wf-arena-20261121-a7",
  verified: true,
  summary: {
    games: 16, wins: {"cautious-sheriff": 7, "reckless-wizard": 8, draw: 1},
    byStartingSeat: {
      cowboy: {games: 8, "cautious-sheriff": 4, "reckless-wizard": 4, draw: 0},
      wizard: {games: 8, "cautious-sheriff": 3, "reckless-wizard": 4, draw: 1},
    },
    endings: {base: 15, "turn-cap": 1}, turns: {min: 4, mean: 9.5, max: 20},
    actions: {"cautious-sheriff": {set: 10, end: 40}, "reckless-wizard": {attack: 30, end: 40}},
    decisionsWithRuledOutActions: {"cautious-sheriff": 3, "reckless-wizard": 0},
  },
  replay: {
    kind: "agent-arena-replay/1", seed: 3, first: "cowboy",
    personas: {cowboy: "cautious-sheriff", wizard: "reckless-wizard"},
    playbookDigests: {"cautious-sheriff": "a".repeat(64), "reckless-wizard": "b".repeat(64)},
    decisions: 4,
    steps: [
      step(1, 1, "cowboy", [{type: "end"}], 0, 0, [{type: "turn-end", side: "cowboy"}]),
      step(2, 2, "wizard", [{type: "summon", cardId: "wizard-imp", tributes: []}, {type: "set", cardId: "wizard-hex-trap"}, {type: "end"}], 0, 0,
        [{type: "summon", side: "wizard", cardId: "wizard-imp"}, {type: "draw", side: "wizard", cardId: "wizard-secret-draw"}]),
      step(3, 3, "cowboy", [{type: "set", cardId: "cowboy-snare"}, {type: "summon", cardId: "cowboy-billy", tributes: [0, 1]}, {type: "end"}], 0, 1,
        [{type: "set", side: "cowboy", cardId: "cowboy-snare"}]),
      step(4, 4, "wizard", [{type: "attack", slot: 0, target: "base"}, {type: "end"}], 0, 0, [{type: "damage", side: "cowboy", amount: 6}]),
    ],
    result: {winner: "wizard", reason: "base"}, finalBases: {cowboy: 0, wizard: 6}, turns: 4,
  },
  policies: {"cautious-sheriff": SHERIFF, "reckless-wizard": WIZARD},
});
const allHtml = (view) => [tableHtml(view), ...view.replay.steps.map((_, i) => stepHtml(view, i))].join("\n");

test("a real-shaped witness shows the exact score, seed and result", () => {
  const view = arenaView(witness(), TYPES);
  assert.equal(view.status, "ok");
  const score = scoreHtml(view);
  assert.match(score, /신중한 보안관 <strong>7<\/strong>/);
  assert.match(score, /무모한 마법사 <strong>8<\/strong>/);
  assert.match(score, /무승부 <strong>1<\/strong>/);
  assert.match(score, /총 16판\. 카우보이 선공 8판, 마법사 선공 8판\./);
  const html = tableHtml(view);
  assert.match(html, /리플레이 시드 <strong>3<\/strong>\. 신중한 보안관 선공\./);
  assert.match(html, /4턴 동안 결정 4번/);
  assert.match(html, /무모한 마법사 승리 \(기지 파괴\). 최종 기지: 신중한 보안관 구슬 0개, 무모한 마법사 구슬 6개\./);
  assert.match(html, /<code>wf-arena-20261121-a7<\/code>/);
  assert.match(html, /<code>aaaaaaaaaaaa<\/code>/);
});

test("the table opens on the first meaningful step, already rendered", () => {
  const view = arenaView(witness(), TYPES);
  assert.equal(view.start, 1);
  assert.equal(firstStepIndex([{type: "end"}, {type: "end"}]), 0);
  const html = tableHtml(view);
  assert.match(html, /2\/4단계<\/strong>, 2턴/);
  assert.match(html, /<strong>무모한 마법사<\/strong> Imp 소환, 제물 없이\./);
  assert.doesNotMatch(html, /data-arena-step="back" [^>]*disabled/);
});

test("each step says what the character did, in words", () => {
  const view = arenaView(witness(), TYPES);
  assert.match(stepHtml(view, 0), /신중한 보안관<\/strong> 턴 종료\./);
  assert.match(stepHtml(view, 2), /신중한 보안관<\/strong> 뒤집어 둔 함정 설치\./);
  assert.match(stepHtml(view, 3), /무모한 마법사<\/strong> 공격, 슬롯 1의 자기 부대로, 상대 기지 대상\./);
  assert.equal(actionText({type: "attack", slot: 1, target: 0}), "공격, 슬롯 2의 자기 부대로, 상대 슬롯 1의 부대 대상");
  assert.equal(actionText({type: "summon", cardId: "x", tributes: [0]}), "x 소환, 부대 1개를 제물로");
  assert.equal(actionText({type: "cover", slot: 2}), "슬롯 3의 자기 부대를 엄폐시킴");
  assert.deepEqual(eventWords([{type: "turn-end", cardId: "secret"}, {type: "turn-end"}, {kind: "x"}, "raw"]), ["turn end"]);
});

test("no hidden card, other legal option, event payload or raw JSON is shown", () => {
  const html = allHtml(arenaView(witness(), TYPES));
  for (const hidden of ["cowboy-snare", "cowboy-billy", "wizard-hex-trap", "wizard-secret-draw"]) assert.ok(!html.includes(hidden), hidden);
  assert.doesNotMatch(html, /[{}]|&quot;type|"legal"|amount/);
});

test("the explanation follows the recorded playbook", () => {
  const view = arenaView(witness(), TYPES);
  const sheriffSet = personalityLines(view.policies["cautious-sheriff"], view.replay.steps[2]);
  assert.match(sheriffSet[0], /선택: 함정 설치 \(8개 중 3번째\)\./);
  assert.equal(sheriffSet.length, 1, "hand-based options that were passed over are not described");
  const wizardAttack = personalityLines(view.policies["reckless-wizard"], view.replay.steps[3]);
  assert.match(wizardAttack[0], /선택: 공격 \(7개 중 1번째\)\./);
  assert.match(wizardAttack.join(" "), /허용된 공격은 이것 하나뿐이었습니다\./);

  const legal = [{type: "attack", slot: 0, target: 0}, {type: "attack", slot: 0, target: "base"}, {type: "cover", slot: 0}, {type: "end"}];
  const careful = validatePolicyLike({...SHERIFF, order: ["attack", "end"]});
  const heldBack = personalityLines(careful, step(9, 5, "cowboy", legal, 3, 2, []));
  assert.match(heldBack.join(" "), /가능한 공격 2개 모두가 기피 목록\(suicide, even-trade, chip\)에 해당해 공격을 자제했습니다\./);
  assert.match(heldBack.join(" "), /이 플레이북은 다음을 절대 선택하지 않습니다: 엄폐\./);
  const ranked = personalityLines(validatePolicyLike(WIZARD), step(9, 5, "wizard", legal, 1, 0, []));
  assert.match(ranked.join(" "), /허용된 공격 2개를 win-now, go-face, base-damage 기준으로 순위를 매겨 1순위를 골랐습니다\./);
});

test("a decision that does not add up gets no explanation", () => {
  const legal = [{type: "attack", slot: 0, target: 0}, {type: "end"}];
  const careful = validatePolicyLike({...SHERIFF, order: ["attack", "end"]});
  assert.match(personalityLines(careful, step(9, 5, "cowboy", legal, 1, 0, []))[0], /맞지 않아/);
  const reckless = validatePolicyLike({...WIZARD, order: ["attack", "end"]});
  assert.match(personalityLines(reckless, step(9, 5, "wizard", legal, 1, 1, []))[0], /맞지 않아/, "an empty avoid list rules nothing out");
  assert.match(personalityLines(null, step(9, 5, "wizard", legal, 1, 1, []))[0], /무모한 마법사의 플레이북이 기록되지 않아/);
});

test("a missing or malformed playbook leaves the match visible with an honest note", () => {
  const raw = witness();
  raw.policies = {"cautious-sheriff": {...SHERIFF, order: ["attack"]}};
  const view = arenaView(raw, TYPES);
  assert.equal(view.status, "ok");
  assert.deepEqual([view.policies["cautious-sheriff"], view.policies["reckless-wizard"]], [null, null]);
  assert.match(tableHtml(view), /이 캐릭터의 플레이북이 기록되지 않았습니다\./);
});

test("no recorded match is an honest empty table", () => {
  for (const raw of [null, undefined]) {
    const html = tableHtml(arenaView(raw));
    assert.match(html, /검증된 에이전트 경기장 대전이 아직 기록되지 않아/);
    assert.doesNotMatch(html, /Step|seed|<strong>\d/);
  }
  assert.match(tableHtml(arenaView({...witness(), verified: false})), /검증됨으로 표시되지 않아 표시할 내용이 없습니다/);
});

test("a malformed or inconsistent showcase is refused whole", () => {
  const edit = (change) => { const raw = witness(); change(raw); return raw; };
  for (const [label, bad] of [
    ["text", "text"], ["list", []], ["empty", {}],
    ["verified string", edit((r) => { r.verified = "true"; })],
    ["no workflow", edit((r) => { delete r.nativeWorkflowId; })],
    ["wins do not sum", edit((r) => { r.summary.wins.draw = 2; })],
    ["seat games do not sum", edit((r) => { r.summary.byStartingSeat.cowboy.games = 9; })],
    ["endings do not sum", edit((r) => { r.summary.endings.base = 14; })],
    ["no turns", edit((r) => { delete r.summary.turns; })],
    ["wrong kind", edit((r) => { r.replay.kind = "agent-arena-replay/2"; })],
    ["seed string", edit((r) => { r.replay.seed = "3"; })],
    ["personas swapped", edit((r) => { r.replay.personas = {cowboy: "reckless-wizard", wizard: "cautious-sheriff"}; })],
    ["decisions differ", edit((r) => { r.replay.decisions = 5; })],
    ["no steps", edit((r) => { r.replay.steps = []; r.replay.decisions = 0; })],
    ["step numbering", edit((r) => { r.replay.steps[1].n = 7; })],
    ["chosen out of range", edit((r) => { r.replay.steps[1].chosen = 9; })],
    ["action is not the chosen legal action", edit((r) => { r.replay.steps[1].action = {type: "summon", cardId: "wizard-other", tributes: []}; })],
    ["persona on wrong seat", edit((r) => { r.replay.steps[0].persona = "reckless-wizard"; })],
    ["first mover differs", edit((r) => { r.replay.first = "wizard"; })],
    ["no events", edit((r) => { delete r.replay.steps[3].events; })],
    ["bad winner", edit((r) => { r.replay.result.winner = "sheriff"; })],
    ["no final bases", edit((r) => { delete r.replay.finalBases; })],
    ["no digests", edit((r) => { delete r.replay.playbookDigests; })],
  ]) {
    const view = arenaView(bad, TYPES);
    assert.equal(view.status, "invalid", label);
    assert.doesNotMatch(tableHtml(view), /Step \d|seed <strong>/, label);
  }
  assert.match(tableHtml({status: "invalid"}), /빠진 항목이 있거나 수치가 맞지 않아 표시할 내용이 없습니다/);
});

test("recorded text is escaped", () => {
  const evil = "<img src=x onerror=alert(1)>";
  const raw = witness();
  raw.nativeWorkflowId = evil;
  raw.replay.result.reason = "<b>x</b>";
  raw.summary.endings = {"<b>x</b>": 15, "turn-cap": 1};
  raw.policies["cautious-sheriff"].motto = "<script>";
  raw.replay.steps[1].legal[0].cardId = raw.replay.steps[1].action.cardId = evil;
  const html = allHtml(arenaView(raw, TYPES));
  assert.doesNotMatch(html, /<img|<script|<b>/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test("keys step forward and back within the replay", () => {
  assert.equal(nextIndex("ArrowRight", 1, 4), 2);
  assert.equal(nextIndex("ArrowLeft", 0, 4), 0);
  assert.equal(nextIndex("ArrowRight", 3, 4), 3);
  assert.equal(nextIndex("Home", 2, 4), 0);
  assert.equal(nextIndex("End", 0, 4), 3);
  assert.equal(nextIndex("a", 0, 4), null);
});

test("the mounted table walks the replay by button and keyboard", () => {
  const host = fakeHost();
  const table = mountArenaTable(host, {showcase: witness(), types: TYPES});
  assert.equal(table.index(), 1);
  const stage = host.el(".arena-step"), back = host.el('[data-arena-step="back"]'), forward = host.el('[data-arena-step="forward"]');
  const deck = host.el(".arena-replay");
  let prevented = 0;
  const key = (k) => deck.fire("keydown", {key: k, preventDefault: () => { prevented += 1; }});
  key("ArrowRight");
  assert.match(stage.innerHTML, /3\/4단계/);
  key("End");
  assert.match(stage.innerHTML, /4\/4단계/);
  assert.equal(forward.disabled, true);
  back.fire("click");
  back.fire("click");
  back.fire("click");
  assert.match(stage.innerHTML, /1\/4단계/);
  assert.equal(back.disabled, true);
  key("Tab");
  assert.equal(prevented, 2);
  forward.fire("click");
  assert.equal(table.index(), 1);
});

test("mounting without a recorded match shows the empty note", () => {
  const host = fakeHost();
  const table = mountArenaTable(host, {showcase: null});
  assert.equal(table.view.status, "none");
  assert.match(host.innerHTML, /검증된 에이전트 경기장 대전이 아직 기록되지 않아/);
  assert.equal(mountArenaTable(null), null);
  assert.ok(mountArenaTable(fakeHost()), "the default showcase import mounts");
});

test("a witness from the real referee walks end to end and every choice is explained", () => {
  const books = {cowboy: validatePlaybook(SHERIFF, "cautious-sheriff").playbook, wizard: validatePlaybook(WIZARD, "reckless-wizard").playbook};
  const series = {from: 0, deals: 1};
  const {summary} = playSeries(series, books);
  const replay = recordReplay(series, books, {"cautious-sheriff": "c".repeat(64), "reckless-wizard": "d".repeat(64)});
  const raw = JSON.parse(JSON.stringify({nativeWorkflowId: "test-local-referee", verified: true, summary, replay,
    policies: {"cautious-sheriff": books.cowboy, "reckless-wizard": books.wizard}}));
  const view = arenaView(raw);
  assert.equal(view.status, "ok");
  assert.match(tableHtml(view), new RegExp(`리플레이 시드 <strong>${replay.seed}</strong>`));
  replay.steps.forEach((each, i) => {
    const html = stepHtml(view, i);
    assert.match(html, new RegExp(`${i + 1}/${replay.steps.length}단계`));
    assert.doesNotMatch(html, /맞지 않아|[{}]/, `step ${each.n}`);
    if (each.type === "set" && typeof each.action.cardId === "string") assert.ok(!html.includes(each.action.cardId), `step ${each.n} trap`);
  });
  assert.deepEqual(Object.keys(PERSONAS), Object.keys(raw.policies));
});

// The playbook fields the table reads, as validatePlaybook returns them.
function validatePolicyLike(playbook) {
  return validatePlaybook(playbook, playbook.persona).playbook;
}

function fakeHost() {
  const els = new Map();
  const make = () => ({
    innerHTML: "", disabled: false, handlers: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    fire(type, event = {}) { this.handlers[type]?.(event); },
  });
  return {
    innerHTML: "", classList: {add() {}},
    querySelector(selector) { if (!els.has(selector)) els.set(selector, make()); return els.get(selector); },
    el(selector) { return this.querySelector(selector); },
  };
}
