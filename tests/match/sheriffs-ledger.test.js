// Sheriff's Ledger (The Night Shift): the checked-in payload regenerates byte for byte, covers the real
// 29-card catalog, ties its run to a revision and seeds, and shows per-card results only for matched data.
import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {SHOWDOWN_SPECS} from "../../src/game/card-specs.generated.js";
import {DECKS} from "../../src/game/showdown/cards.js";
import {LEDGER} from "../../src/ui/sheriffs-ledger.data.js";
import {ledgerHtml, ledgerRows, reviewLines, rulesetSummary} from "../../src/ui/sheriffs-ledger.js";
import {DEFAULT_RECEIPT, R1_1_CARDS, R1_1_TYPES, buildLedger, defaultInputs, matchReviews, reviewBundles, laTime, latestShowdownRun, matchPerCard, render, runFromReceipt} from "../../scripts/build-sheriffs-ledger.mjs";

const REPORT_PATH = "docs/evidence/night-watch-showdown/scout-pair-reports.json";
const reports = JSON.parse(readFileSync(REPORT_PATH, "utf8"));

test("the payload regenerates byte for byte from the catalog and the checked-in Night Watch receipt", () => {
  assert.equal(render(buildLedger(defaultInputs())), readFileSync("src/ui/sheriffs-ledger.data.js", "utf8"));
  assert.equal(render(buildLedger({reports})), render(buildLedger({reports: [...reports].reverse()})), "input order does not matter");
});

test("the Camp shows the checked-in receipt's real run: its commit, rules blob and counts", () => {
  const receipt = JSON.parse(readFileSync(DEFAULT_RECEIPT, "utf8"));
  const run = runFromReceipt(receipt);
  assert.equal(LEDGER.run.source, DEFAULT_RECEIPT);
  assert.equal(LEDGER.run.revision, receipt.candidate.commit);
  assert.equal(LEDGER.run.rulesBlob, receipt.candidate.rulesBlob);
  assert.deepEqual([LEDGER.run.games, LEDGER.run.first, LEDGER.run.cowboy], [run.candidate.counts.games, run.candidate.counts.first, run.candidate.counts.cowboy]);
  assert.equal(receipt.cards.measured, false);
});

test("Night Shift reviews appear only when sealed and bound to this run's commit and counts", () => {
  const bundles = reviewBundles();
  assert.ok(bundles.length >= 1);
  assert.deepEqual(LEDGER.reviews.map((v) => v.source), bundles.filter(({bundle}) => bundle.finding.commit === LEDGER.run.revision).map((b) => b.path));
  assert.match(reviewLines()[0], /^cowboy-sheriff health 3 → 4: rejected\. tune: faction skew 9\.40 -> 13\.60 pp did not improve/);
  assert.match(ledgerHtml(), /카드에는 하나도 적용되지 않았으며/);
  const run = runFromReceipt(JSON.parse(readFileSync(DEFAULT_RECEIPT, "utf8")));
  const [one] = bundles;
  assert.equal(matchReviews([{...one, bundle: {...one.bundle, decision: {...one.bundle.decision, verdict: "accepted"}}}], run).length, 0, "a broken seal is dropped");
  assert.equal(matchReviews(bundles, {...run, candidate: {...run.candidate, commit: "0".repeat(40)}}).length, 0, "another commit is dropped");
  assert.equal(matchReviews(bundles, {...run, candidate: {...run.candidate, counts: {...run.candidate.counts, cowboy: 1}}}).length, 0, "other counts are dropped");
});

test("one row per catalog card, in catalog order, with real starter counts and spec paths", () => {
  assert.equal(LEDGER.cards.length, 29);
  assert.deepEqual(LEDGER.cards.map((c) => c.type), SHOWDOWN_SPECS.map((c) => c.type));
  for (const card of LEDGER.cards) {
    assert.equal(card.starter, DECKS[card.side][card.type] ?? 0);
    readFileSync(card.spec, "utf8"); // the linked spec exists
  }
});

test("the ledger links the initial migration clause to exactly the eight cards it names", () => {
  const req = readFileSync(LEDGER.requirement.path, "utf8");
  assert.match(req, new RegExp(`cards are exactly ${R1_1_CARDS.slice(0, -1).join(", ")} and ${R1_1_CARDS.at(-1)}`));
  assert.deepEqual(LEDGER.cards.filter((c) => c.requirement === "R1.1").map((c) => c.type), R1_1_TYPES);
  assert.ok(LEDGER.cards.every((c) => c.requirement === "R1" || R1_1_TYPES.includes(c.type)));
});

test("from a report file the run is the newest Showdown report, tied to its commit and seeds, labelled ruleset-wide", () => {
  const latest = latestShowdownRun(reports);
  const fromReports = buildLedger({reports});
  assert.equal(fromReports.run.id, latest.id);
  assert.equal(fromReports.run.revision, latest.candidate.commit);
  assert.deepEqual([fromReports.run.firstSeed, fromReports.run.count, fromReports.run.games], [latest.firstSeed, latest.count, latest.candidate.counts.games]);
  assert.equal(laTime("2026-11-20T05:43:40Z"), "2026년 11월 19일 21:43 PST");
  const line = rulesetSummary(fromReports);
  assert.match(line, new RegExp(`커밋 ${latest.candidate.commit.slice(0, 7)}, 기준 ${latest.baseline.commit.slice(0, 7)}, 시드 0–999, 2,000판`));
  assert.match(line, /선공 승리 1,142 \(57\.1%\)\. 카우보이 승리 1,188 \(59\.4%\)\./);
  assert.match(ledgerHtml(), /전체 규칙 묶음 \(카드별 아님\)/);
  assert.deepEqual(LEDGER.properties.list.map((p) => p.id), ["SP1", "SP2", "SP3", "SP4", "SP5", "SP6", "SP7"]);
});

test("with no per-card data every card reads Not observed; with no run, Pending", () => {
  assert.equal(LEDGER.perCardSource, null);
  assert.ok(ledgerRows().every((row) => row.latest === "관찰 안 됨"));
  const empty = buildLedger({reports: reports.filter((r) => r.mode !== "showdown")});
  assert.equal(empty.run, null);
  assert.ok(ledgerRows(empty).every((row) => row.latest === "보류"));
  assert.match(rulesetSummary(empty), /^보류/);
});

// TEST-ONLY SAMPLE: invented counts to exercise matching. Not a measurement and never written to the payload.
test("per-card counts are shown only when matched to the same mode, commit and seeds (test-only sample)", () => {
  const run = latestShowdownRun(reports);
  const sample = {mode: "showdown", commit: run.candidate.commit, firstSeed: 0, count: 1000, source: "test-only sample",
    cards: {"cowboy-sheriff": {games: 10, wins: 4}}};
  const ledger = buildLedger({reports, perCard: sample});
  const rows = ledgerRows(ledger);
  assert.equal(rows[0].latest, `10판 중 4승 (40.0%), 리비전 ${run.candidate.commit.slice(0, 7)}`);
  assert.ok(rows.slice(1).every((row) => row.latest === "관찰 안 됨"));
  assert.throws(() => matchPerCard({...sample, commit: run.baseline.commit}, run), /does not match/);
  assert.throws(() => matchPerCard({...sample, firstSeed: 1}, run), /does not match/);
  assert.throws(() => matchPerCard({...sample, cards: {"cowboy-scarecrow": {games: 1, wins: 0}}}, run), /not in the catalog/);
  assert.throws(() => matchPerCard({...sample, cards: {"cowboy-sheriff": {games: 1, wins: 2}}}, run), /bad counts/);
});

test("the view is static: no network, no Crew calls, no hand-style card ids, and it starts collapsed", () => {
  const source = readFileSync("src/ui/sheriffs-ledger.js", "utf8") + readFileSync("src/ui/sheriffs-ledger.data.js", "utf8");
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|https?:\/\//);
  assert.doesNotMatch(ledgerHtml(), /(cowboy|wizard)-[a-z-]+-\d+/);
  const details = {innerHTML: "", open: true};
  // mountLedger only needs innerHTML and open.
  return import("../../src/ui/sheriffs-ledger.js").then(({mountLedger}) => {
    mountLedger(details);
    assert.equal(details.open, false);
    assert.match(details.innerHTML, /^<summary>보안관 장부/);
  });
});

// TEST-ONLY SAMPLE in the night-watch-receipt/1 shape (../graywave-night-meter-contract.md, draft). The counts copy
// report fa15c87e1701's candidate so the ledger reads the same; the receipt itself was not produced by Night Watch.
test("a night-watch-receipt/1 receipt feeds the same ruleset line; per-card claims are refused (test-only sample)", () => {
  const run = latestShowdownRun(reports);
  const receipt = {schema: "night-watch-receipt/1", generatedAt: "2026-11-20T05:43:40Z", trigger: "on-demand", mode: "showdown",
    bot: "playTurn level 2 (both seats)", candidate: {ref: "x", commit: run.candidate.commit, rulesBlob: "0".repeat(40)},
    baseline: {ref: "y", commit: run.baseline.commit, rulesBlob: "1".repeat(40)},
    seeds: {from: 0, to: 999, deals: 1000, gamesPerDeal: 2, games: 2000}, rulesTests: {state: "passed", tests: 318},
    samples: {candidate: run.candidate.counts, baseline: run.baseline.counts}, shift: {state: "steady", threshold: 10},
    cards: {measured: false, note: "no per-card data is measured"}};
  const ledger = buildLedger({receipt, reportPath: "test-only-receipt.json"});
  assert.equal(ledger.run.revision, run.candidate.commit);
  assert.equal(ledger.run.rulesBlob, "0".repeat(40));
  assert.equal(rulesetSummary(ledger).split(": commit")[1], rulesetSummary(buildLedger({reports})).split(": commit")[1]);
  assert.ok(ledgerRows(ledger).every((row) => row.latest === "관찰 안 됨"));
  assert.throws(() => buildLedger({receipt: {...receipt, cards: {measured: true}}}), /per-card/);
  assert.throws(() => buildLedger({receipt: {...receipt, mode: "lanes"}}), /Showdown/);
});
