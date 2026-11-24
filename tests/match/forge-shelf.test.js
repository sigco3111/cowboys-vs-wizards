import {test} from "node:test";
import assert from "node:assert/strict";
import {
  forgeView, verdictText, showcaseHtml, shelfHtml, cleanRequest, requestFileText, counterText,
  PREPARE_STEP, PENDING_NOTE, REQUEST_MAX, REQUEST_FILE, STAT_MAX, TEXT_MAX,
} from "../../src/ui/forge-shelf.js";

const TYPES = {"cowboy-billy": {name: "빌리"}};
const record = (over = {}, draft = {}) => ({
  request: "A lawman who rides fast but breaks easy.",
  draft: {name: "Dust Rider", baseCard: "cowboy-billy", attack: 3, health: 1, stars: 2, ...draft},
  verified: false, games: 200, source: "docs/evidence/player-card-forge/run.md", checks: ["schema", "balance"],
  ...over,
});

test("no recorded run is reported as none, not as a card", () => {
  assert.deepEqual(forgeView(null, TYPES), {status: "none"});
  assert.deepEqual(forgeView(undefined, TYPES), {status: "none"});
  const html = showcaseHtml(forgeView(null, TYPES));
  assert.match(html, /기록된 카드 포지 실행이 아직 없어/);
  assert.doesNotMatch(html, /통과시켰|forge-card/i);
});

test("a valid record keeps the exact request, name, base, stats and outcome", () => {
  const view = forgeView(record({request: "  Two lines\nexactly  "}), TYPES);
  assert.equal(view.status, "ok");
  assert.equal(view.request, "  Two lines\nexactly  ");
  assert.deepEqual([view.name, view.baseCard, view.baseName], ["Dust Rider", "cowboy-billy", "빌리"]);
  assert.deepEqual([view.attack, view.health, view.stars, view.verified, view.games], [3, 1, 2, false, 200]);
  assert.deepEqual(view.checks, ["schema", "balance"]);
});

test("a malformed or out-of-range record is refused whole", () => {
  for (const bad of [
    "text", [], {}, record({verified: "true"}), record({verified: 1}), record({games: -1}), record({games: 1.5}),
    record({request: ""}), record({request: "x".repeat(TEXT_MAX + 1)}), record({source: 7}),
    record({checks: "schema"}), record({checks: [1]}), record({checks: [""]}), record({draft: null}),
    record({}, {attack: -1}), record({}, {health: STAT_MAX + 1}), record({}, {stars: 2.5}), record({}, {name: "  "}),
  ]) assert.equal(forgeView(bad, TYPES).status, "invalid", JSON.stringify(bad).slice(0, 80));
  assert.match(showcaseHtml({status: "invalid"}), /표시할 내용이 없습니다/);
});

test("the verdict follows the recorded boolean only", () => {
  const failed = forgeView(record(), TYPES), passed = forgeView(record({verified: true, games: 1}), TYPES);
  assert.equal(verdictText(failed), "검증기가 이 초안을 통과시키지 않았습니다. 기록: 200판.");
  assert.equal(verdictText(passed), "검증기가 이 초안을 통과시켰습니다. 실행: 1판.");
  assert.match(showcaseHtml(failed), /data-verified="false"/);
  assert.doesNotMatch(showcaseHtml(failed), /통과시켰습니다/);
});

test("every recorded string is escaped", () => {
  const evil = "<img src=x onerror=alert(1)>\"'&";
  const html = showcaseHtml(forgeView(record({request: evil, source: evil, checks: [evil]}, {name: evil, baseCard: evil}), TYPES));
  assert.doesNotMatch(html, /<img/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;&quot;&#39;&amp;/);
});

test("only a catalog card gets a portrait slot", () => {
  assert.match(showcaseHtml(forgeView(record(), TYPES)), /data-ledger-portrait="cowboy-billy"/);
  const unknown = forgeView(record({}, {baseCard: "wizard-nobody"}), TYPES);
  assert.equal(unknown.baseName, null);
  assert.doesNotMatch(showcaseHtml(unknown), /data-ledger-portrait/);
  assert.equal(forgeView(record({}, {baseCard: "toString"}), TYPES).baseName, null);
});

test("the player's request is cleaned and bounded", () => {
  assert.deepEqual(cleanRequest("  A ghost\r\nwith\ttwo guns\u0007 "), {ok: true, text: "A ghost\nwith\ttwo guns"});
  assert.equal(cleanRequest("   ").ok, false);
  assert.equal(cleanRequest(null).ok, false);
  assert.equal(cleanRequest("x".repeat(REQUEST_MAX)).ok, true);
  assert.equal(cleanRequest("x".repeat(REQUEST_MAX + 1)).ok, false);
  assert.equal(requestFileText("A ghost"), "A ghost\n");
  assert.equal(counterText("abc"), `3/${REQUEST_MAX}자`);
});

test("the shelf has one bounded form, one button and the exact CLI step", () => {
  const html = shelfHtml(forgeView(null, TYPES));
  assert.equal(PREPARE_STEP, "node scripts/card-forge.mjs prepare request.txt");
  assert.equal(REQUEST_FILE, "request.txt");
  assert.equal(html.match(/<button/g).length, 1);
  assert.match(html, new RegExp(`maxlength="${REQUEST_MAX}"`));
  assert.match(html, /<label for="forge-request">/);
  assert.ok(html.includes(`<code>${PREPARE_STEP}</code>`));
  assert.match(html, /기본 카드 포지 워크플로를 고르세요\. 준비한 요청이 유지되며, 준비한 요청이 없으면 기록된 예시를 사용합니다\./);
  assert.doesNotMatch(html, /https?:|localStorage|reward(?!s\.)/i);
});

test("a saved request is pending, never verified", () => {
  assert.match(PENDING_NOTE, /검증 대기 중/);
  assert.doesNotMatch(PENDING_NOTE, /검증된|검증됨/);
  assert.match(shelfHtml(forgeView(null, TYPES)), /<div class="forge-pending" hidden>/);
});
