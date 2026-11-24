// Seat audit detail in the Sheriff's Ledger. Every fixture here is synthetic and test-only; none is a measured result.
import test from "node:test";
import assert from "node:assert/strict";
import {BILLY_REPLAY as R} from "../../src/ui/billy-replay.data.js";
import {RULE_GATE, RULE_SOURCE, SEAT_REPRODUCE, billyReplayHtml, firstPlayerShares, seatAuditHtml, seatAuditOk, seatObservation, seatRows}
  from "../../src/ui/billy-replay.js";

const cells = (cowboy, wizard, draw) => ({cowboy, wizard, draw});
// 10 synthetic deals. Transitions read baseline winner, then candidate winner.
const synthetic = () => ({
  schema: 1, protocolSha256: "synthetic-protocol", sourceCommit: "<i>synthetic</i>", firstSeed: 1, deals: 10, totalDuels: 40,
  byFirst: {
    cowboy: {gamesPerArm: 10, baseline: cells(7, 3, 0), candidate: cells(5, 4, 1),
      transitions: {cowboy: cells(5, 1, 1), wizard: cells(0, 3, 0), draw: cells(0, 0, 0)}},
    wizard: {gamesPerArm: 10, baseline: cells(4, 6, 0), candidate: cells(3, 7, 0),
      transitions: {cowboy: cells(3, 1, 0), wizard: cells(0, 6, 0), draw: cells(0, 0, 0)}},
  },
  blocks: [{firstSeed: 1, deals: 10, baselineCowboyWins: 11, candidateCowboyWins: 8}],
  csvSha256: "synthetic-csv",
});
const empty = () => {
  const zero = () => cells(0, 0, 0);
  const side = () => ({gamesPerArm: 0, baseline: zero(), candidate: zero(), transitions: {cowboy: zero(), wizard: zero(), draw: zero()}});
  return {...synthetic(), deals: 0, totalDuels: 0, byFirst: {cowboy: side(), wizard: side()}, blocks: []};
};

test("rows give Cowboy win shares per opening faction from the raw counts", () => {
  const seat = synthetic();
  assert.ok(seatAuditOk(seat));
  assert.deepEqual(seatRows(seat).map((r) => [r.label, r.baseline.wins, r.baseline.games, r.candidate.wins, r.candidate.games, r.change]), [
    ["모든 시작", 11, 20, 8, 20, "−15.00%p"],
    ["카우보이 선공", 7, 10, 5, 10, "−20.00%p"],
    ["마법사 선공", 4, 10, 3, 10, "−10.00%p"],
  ]);
  const first = firstPlayerShares(seat);
  assert.deepEqual([first.baseline.wins, first.candidate.wins, first.baseline.games, first.change], [13, 12, 20, "−5.00%p"]);
  assert.equal(seatObservation(first, R),
    "선공 진영이 이긴 비율은 빌리 공격력 2일 때 전체의 65.00%, 공격력 1일 때 60.00%이므로, 선공이 여전히 유리합니다.");
});

test("the takeaway names the favoured seat from the recorded shares", () => {
  const at = (before, now) => seatObservation({baseline: {share: before}, candidate: {share: now}}, R);
  assert.match(at(0.45, 0.55), /선공이 이제 유리합니다\.$/);
  assert.match(at(0.45, 0.4), /후공이 여전히 유리합니다\.$/);
  assert.match(at(0.55, 0.5), /어느 쪽도 유리하지 않습니다\.$/);
  assert.equal(at(null, null), "기록된 게임이 아직 없습니다.");
});

test("the detail renders a labelled table, the derived finding and the reproduce command", () => {
  const html = seatAuditHtml(synthetic(), R);
  assert.match(html, /<summary>선공하면 누가 이기나요\?<\/summary>/);
  assert.match(html, /<th scope="col">공격력 2<\/th><th scope="col">공격력 1<\/th>/);
  assert.match(html, /<th scope="row">모든 시작<\/th><td>55\.00%<\/td><td>40\.00%<\/td><td>−15\.00%p<\/td>/);
  assert.match(html, /<th scope="row">카우보이 선공<\/th><td>70\.00%<\/td><td>50\.00%<\/td>/);
  assert.match(html, /<th scope="row">마법사 선공<\/th><td>40\.00%<\/td><td>30\.00%<\/td>/);
  assert.match(html, /<p class="sd-billy-seat-finding">선공 진영이 이긴 비율은 빌리 공격력 2일 때 전체의 65\.00%, 공격력 1일 때 60\.00%이므로, 선공이 여전히 유리합니다\.<\/p>/);
  assert.equal(html.match(/65\.00%/g).length, 1, "the first-player share appears once");
  assert.match(html, /10번의 딜\(시드 [0-9–]+\)에서 40판/);
  assert.match(html, /20쌍의 비교/);
  assert.match(html, /무승부: 공격력 2에서 0판, 공격력 1에서 1판/);
  assert.match(html, /고정 덱을 쓰는 2레벨 봇 둘/);
  assert.doesNotMatch(html, /not the balance of every card/);
  assert.ok(html.includes(`<code>${SEAT_REPRODUCE}</code>`));
  assert.match(html, /결과 해시 <code>synthet<\/code>/);
  assert.doesNotMatch(html, /undefined/);
  assert.ok(!html.includes("<i>"), "data strings are escaped");
});

test("a nested disclosure names the written rule and both gate runs without stating a verdict", () => {
  const html = seatAuditHtml(synthetic(), R);
  const nested = html.slice(html.indexOf("<details", 1), html.indexOf("</details>") + 10);
  assert.match(nested, /^<details class="sd-note sd-billy-seat-verify"><summary>각 버전을 명문화된 규칙과 대조하기<\/summary>/);
  assert.ok(nested.includes(`<code>${RULE_SOURCE}</code>`));
  for (const arm of ["baseline", "candidate"]) assert.ok(nested.includes(`<code>${RULE_GATE} ${arm}</code>`));
  assert.doesNotMatch(nested, /\b(passes|passed|rejected|fails)\b/i);
  assert.ok(html.indexOf(SEAT_REPRODUCE) < html.indexOf(RULE_GATE), "the full verification stays first");
});

test("hashes the result does not record are left out of the verify line", () => {
  const seat = synthetic();
  delete seat.csvSha256;
  seat.protocolSha256 = 42;
  const html = seatAuditHtml(seat, R);
  assert.doesNotMatch(html, /undefined|결과 해시|프로토콜 해시/);
  assert.ok(html.includes(`<code>${SEAT_REPRODUCE}</code>`));
});

test("a totalDuels that disagrees with the counts shows no figures", () => {
  assert.equal(seatAuditOk({...synthetic(), totalDuels: 41}), false);
  assert.equal(seatAuditOk({...synthetic(), totalDuels: "40"}), false);
  const {totalDuels, ...without} = synthetic();
  assert.equal(totalDuels, 40);
  assert.ok(seatAuditOk(without));
});

test("no games shows dashes instead of dividing by zero", () => {
  const seat = empty();
  assert.ok(seatAuditOk(seat));
  for (const r of seatRows(seat)) assert.deepEqual([r.baseline.share, r.candidate.share, r.change], [null, null, "—"]);
  const html = seatAuditHtml(seat, R);
  assert.doesNotMatch(html, /NaN|Infinity/);
  assert.match(html, /<th scope="row">모든 시작<\/th><td>—<\/td><td>—<\/td><td>—<\/td>/);
  assert.match(html, /기록된 게임이 아직 없습니다\./);
});

test("counts that are not whole numbers or do not add up show no figures", () => {
  const bad = synthetic();
  bad.byFirst.cowboy.baseline.cowboy = "<b>7</b>";
  const off = synthetic();
  off.byFirst.wizard.transitions.cowboy = cells(2, 2, 0);
  for (const seat of [bad, off, null, {...synthetic(), schema: 2}]) {
    assert.equal(seatAuditOk(seat), false);
    const html = seatAuditHtml(seat, R);
    assert.match(html, /집계가 맞지 않아 수치를 표시하지 않습니다/);
    assert.doesNotMatch(html, /<b>|<table/);
  }
});

test("the replay keeps its own 10,000-game text and the seat sample follows it", () => {
  const html = billyReplayHtml(R, synthetic());
  assert.match(html, /버전당 5,000판, 고정 덱과 2레벨 봇 둘/);
  assert.match(html, /위 리플레이 표본\(10,000판\)과 별개로/);
  assert.ok(html.indexOf("이 리플레이 검증 방법") < html.indexOf("선공하면 누가 이기나요?"));
  assert.match(html, /data-billy-line="baseline"/);
});
