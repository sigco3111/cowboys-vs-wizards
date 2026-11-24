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
  assert.match(html, /No Card Forge run is recorded yet/);
  assert.doesNotMatch(html, /verifier passed|forge-card/i);
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
  assert.match(showcaseHtml({status: "invalid"}), /nothing from it is shown/);
});

test("the verdict follows the recorded boolean only", () => {
  const failed = forgeView(record(), TYPES), passed = forgeView(record({verified: true, games: 1}), TYPES);
  assert.equal(verdictText(failed), "Verifier did not pass this draft. It recorded 200 games.");
  assert.equal(verdictText(passed), "Verifier passed this draft after 1 game.");
  assert.match(showcaseHtml(failed), /data-verified="false"/);
  assert.doesNotMatch(showcaseHtml(failed), /Verifier passed/);
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
  assert.equal(counterText("abc"), `3 of ${REQUEST_MAX} characters`);
});

test("the shelf has one bounded form, one button and the exact CLI step", () => {
  const html = shelfHtml(forgeView(null, TYPES));
  assert.equal(PREPARE_STEP, "node scripts/card-forge.mjs prepare request.txt");
  assert.equal(REQUEST_FILE, "request.txt");
  assert.equal(html.match(/<button/g).length, 1);
  assert.match(html, new RegExp(`maxlength="${REQUEST_MAX}"`));
  assert.match(html, /<label for="forge-request">/);
  assert.ok(html.includes(`<code>${PREPARE_STEP}</code>`));
  assert.match(html, /native Card Forge workflow\. It keeps your staged request\. With no staged request it uses the recorded example\./);
  assert.doesNotMatch(html, /https?:|localStorage|reward(?!s\.)/i);
});

test("a saved request is pending, never verified", () => {
  assert.match(PENDING_NOTE, /pending verification/);
  assert.doesNotMatch(PENDING_NOTE, /\bverified\b/i);
  assert.match(shelfHtml(forgeView(null, TYPES)), /<div class="forge-pending" hidden>/);
});
