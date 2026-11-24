// Step 8 first slice: packages/frontier-kit is the one home of the paired-duel cohort audit, and both games'
// verifiers use it. What is shared today is the audit only, not a game engine, renderer or network layer.
//   Showdown: scripts/field-trial-confirm.mjs (and its test) import src/review/paired-duel-kit.js, a re-export
//             of the kit. Here the recorded Billy replay cohort is replayed through the kit.
//   Poker:    scripts/verify-poker-kit.mjs imports the kit directly. Here the original 500 mirrored seeds run through it.
// Neither shipped game's runtime imports the kit yet (see "runtime packaging" below).
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {existsSync, mkdtempSync, readFileSync, rmSync, statSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join, relative, resolve} from "node:path";
import test from "node:test";
import {fileURLToPath} from "node:url";
import * as kit from "../../packages/frontier-kit/index.js";
import * as cohortModule from "../../packages/frontier-kit/paired-cohort.js";
import * as compat from "../../src/review/paired-duel-kit.js";
import {playPokerDuel} from "../../experiments/boot-hill-poker/engine.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const KIT_DIR = "packages/frontier-kit";
const POKER_DIR = "experiments/boot-hill-poker";
const EXPORTS = ["DRAW", "MAX_DEALS", "PairedCohortError", "measurePairedCohort"];

// ---------------------------------------------------------------- static import graph

const SPECIFIER = [/\bfrom\s*["']([^"']+)["']/g, /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, /^\s*import\s*["']([^"']+)["']/gm];
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\"'`])\/\/.*$/gm, "$1");

function resolveFile(from, spec) {
  const base = resolve(dirname(from), spec);
  for (const candidate of [base, `${base}.js`, `${base}.mjs`, join(base, "index.js")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  throw new Error(`${relative(ROOT, from)} imports ${spec}, which does not resolve`);
}

// Every repo file reachable from the entries by static or literal dynamic imports, plus bare specifiers seen.
function importGraph(entries) {
  const files = new Set(), bare = new Set(), edges = [];
  const queue = entries.map((entry) => join(ROOT, entry));
  while (queue.length) {
    const file = queue.pop();
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.(m?js)$/.test(file)) continue;
    const text = stripComments(readFileSync(file, "utf8"));
    for (const pattern of SPECIFIER) {
      for (const [, spec] of text.matchAll(pattern)) {
        if (!spec.startsWith(".") && !spec.startsWith("/")) { bare.add(spec); continue; }
        const target = resolveFile(file, spec);
        edges.push([relative(ROOT, file), relative(ROOT, target)]);
        queue.push(target);
      }
    }
  }
  return {files: [...files].map((f) => relative(ROOT, f).split("\\").join("/")).sort(), bare: [...bare].sort(), edges};
}

const inside = (dir) => (file) => file === dir || file.startsWith(`${dir}/`);
const POKER_ENTRIES = [`${POKER_DIR}/app.js`, `${POKER_DIR}/cli.mjs`];
// The illustrated root, /3d/ and /graybox/ are esbuild bundles of src/app.js; /showdown/ bundles prototypes/showdown/main.js.
const SHOWDOWN_ENTRIES = ["src/app.js", "prototypes/showdown/main.js"];

test("the kit imports neither game, nothing outside itself, and no Node, DOM or network module", () => {
  const graph = importGraph([`${KIT_DIR}/index.js`]);
  assert.deepEqual(graph.files, [`${KIT_DIR}/index.js`, `${KIT_DIR}/paired-cohort.js`]);
  assert.deepEqual(graph.bare, [], "the kit has no package or node: imports");
  for (const file of graph.files) {
    const text = stripComments(readFileSync(join(ROOT, file), "utf8"));
    assert.doesNotMatch(text, /\b(document|window|localStorage|fetch|WebSocket|process|require)\b/, `${file} touches a runtime global`);
  }
});

test("shipped Poker paths never reach Showdown code, even indirectly", () => {
  const graph = importGraph(POKER_ENTRIES);
  const outside = graph.files.filter((f) => !inside(POKER_DIR)(f) && !inside(KIT_DIR)(f));
  assert.deepEqual(outside, [], `poker reaches ${outside.join(", ")}`);
  assert.deepEqual(graph.bare.filter((s) => !s.startsWith("node:")), [], "poker uses only node: built-ins (cli.mjs) besides its own files");
});

test("shipped Showdown paths never reach Boot Hill Poker code, even indirectly", () => {
  const graph = importGraph(SHOWDOWN_ENTRIES);
  assert.ok(graph.files.includes("src/game/showdown/rules.js"), "the walk reached the Showdown engine");
  const poker = graph.files.filter(inside(POKER_DIR));
  assert.deepEqual(poker, [], `showdown reaches ${poker.join(", ")}`);
  // Verifier code is not part of the shipped bundles either.
  assert.deepEqual(graph.files.filter((f) => f.startsWith("scripts/") || f.startsWith("tests/")), []);
});

test("runtime packaging: the staged /poker/ graph is still exactly its four scripts, so the deploy is unchanged", () => {
  // scripts/stage-pages.mjs copies only these files into /poker/ and scripts/check-pages-tree.mjs requires the graph
  // to equal them. If engine.js imported the kit, both shared scripts would have to stage packages/frontier-kit too.
  const graph = importGraph([`${POKER_DIR}/app.js`]);
  assert.deepEqual(graph.files, ["app.js", "controls.js", "engine.js", "ko.js", "render.js"].map((f) => `${POKER_DIR}/${f}`));
});

test("both games' verifier entrypoints reach the kit, one of them only indirectly", () => {
  const showdown = importGraph(["scripts/field-trial-confirm.mjs"]);
  assert.ok(showdown.files.includes("src/review/paired-duel-kit.js"));
  assert.ok(showdown.files.includes(`${KIT_DIR}/paired-cohort.js`), "Showdown's field trial reaches the kit through the old path");
  assert.ok(!showdown.edges.some(([from, to]) => from.startsWith("scripts/") && inside(KIT_DIR)(to)), "and does so only indirectly");
  const poker = importGraph(["scripts/verify-poker-kit.mjs"]);
  assert.ok(poker.files.includes(`${KIT_DIR}/paired-cohort.js`) && poker.files.includes(`${POKER_DIR}/engine.js`));
});

// ---------------------------------------------------------------- one implementation, old path kept

test("src/review/paired-duel-kit.js re-exports the kit's own bindings, not a copy", () => {
  assert.deepEqual(Object.keys(compat).sort(), EXPORTS);
  assert.deepEqual(Object.keys(kit).sort(), EXPORTS);
  for (const name of EXPORTS) {
    assert.equal(compat[name], cohortModule[name], `${name} is the kit binding`);
    assert.equal(kit[name], cohortModule[name], `${name} is the kit binding`);
  }
  const text = stripComments(readFileSync(join(ROOT, "src/review/paired-duel-kit.js"), "utf8")).trim();
  assert.match(text, /^export \{[^}]+\} from "\.\.\/\.\.\/packages\/frontier-kit\/index\.js";$/, "the old path holds no logic");
});

test("an error thrown through the old path is the kit's error class", () => {
  assert.throws(() => compat.measurePairedCohort(null), kit.PairedCohortError);
});

// ---------------------------------------------------------------- Poker through the kit

test("Poker: the original 500 mirrored seeds through the kit give the measured pre-move totals", () => {
  const play = (seed, first) => playPokerDuel(seed, first, "standard");
  const result = kit.measurePairedCohort({firstSeed: 1, deals: 500, sides: ["cowboy", "wizard"], playBaseline: play, playCandidate: play});
  // Measured with node scripts/verify-poker-kit.mjs before the kit moved (same engine, seeds 1-500, standard bot).
  assert.deepEqual(result, {gamesPerArm: 1000, baseline: {wins: {cowboy: 500, wizard: 500}, draws: 0, firstWins: 488},
    candidate: {wins: {cowboy: 500, wizard: 500}, draws: 0, firstWins: 488}, switchedWinners: 0});
  const again = compat.measurePairedCohort({firstSeed: 1, deals: 500, sides: ["cowboy", "wizard"], playBaseline: play, playCandidate: play});
  assert.deepEqual(again, result, "the old path gives the same cohort");
});

// ---------------------------------------------------------------- Showdown through the kit

test("Showdown: the recorded Billy replay cohort reproduces exactly through the kit", async (t) => {
  // Same pinned engines and bot as scripts/verify-billy-replay.mjs --full; the kit now drives the pairing.
  const {engines, play, record} = await import("../../scripts/billy-replay-engine.mjs");
  const scratch = mkdtempSync(join(tmpdir(), "frontier-kit-billy-"));
  t.after(() => rmSync(scratch, {recursive: true, force: true}));
  let pair;
  try { pair = await engines(scratch); } catch (error) { t.skip(`pinned Showdown inputs unavailable: ${error.message.split("\n")[0]}`); return; }
  const [baseline, candidate] = pair;
  const k = record.cohort;
  const hash = createHash("sha256").update("seed,first,baseline_winner,candidate_winner,baseline_turn,candidate_turn\n");
  let cowboyToWizard = 0, wizardToCowboy = 0;
  const result = compat.measurePairedCohort({firstSeed: k.firstSeed, deals: k.deals, sides: ["cowboy", "wizard"],
    playBaseline: (seed, first) => play(baseline, seed, first), playCandidate: (seed, first) => play(candidate, seed, first),
    onPair: ({seed, first, baseline: b, candidate: c}) => {
      cowboyToWizard += Number(b.winner === "cowboy" && c.winner === "wizard");
      wizardToCowboy += Number(b.winner === "wizard" && c.winner === "cowboy");
      hash.update([seed, first, b.winner, c.winner, b.endTurn, c.endTurn].join(",") + "\n");
    }});
  assert.equal(result.gamesPerArm, k.gamesPerArm);
  assert.equal(result.baseline.wins.cowboy, k.baselineCowboyWins);
  assert.equal(result.candidate.wins.cowboy, k.candidateCowboyWins);
  assert.equal(result.baseline.firstWins, k.baselineFirstWins);
  assert.equal(result.candidate.firstWins, k.candidateFirstWins);
  assert.equal(cowboyToWizard, k.switchedCowboyToWizard);
  assert.equal(wizardToCowboy, k.switchedWizardToCowboy);
  assert.equal(hash.digest("hex"), k.csvSha256, "SHA-256 of every paired outcome matches the archive");
});
