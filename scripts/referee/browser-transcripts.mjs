#!/usr/bin/env node
// Browser-reachable referee transcripts for scripts/referee/browser.mjs.
//
// The illustrated page has one two-seat entry: ?seed=N, Play (#menu-play), Camp > "Two players, one screen"
// ([data-two="1"]). It deals createShowdown(N, {decks: DECKS}) with no starting side given
// (src/app.js seedFor, src/match/showdown-session.js twoPlayers): mulberry32(N) shuffles the cowboy starter deck,
// then the wizard starter deck, and its next draw picks the starting side. engine.mjs seededDeal(N, DECKS) is that
// same call written out as ordered decks, so a transcript is reachable through the page exactly when
// checkDealAgreement(duel, DECKS) agrees. No other control loads a deal, and this script adds none.
//
// Sources
//   corpus  The frozen primary corpus: scripts/referee/corpus.mjs streamed with proof/referee/freeze.json's recipe,
//           its digest checked against freeze.inputs.sha256. Corpus seed N plays DECK_LISTS[VARIANTS[N % 3]], and
//           only "even" is DECKS, so at most the seeds divisible by 3 are reachable (each is still checked deal by
//           deal). Seed 1 is "outfitted": its corpus transcript can never be dealt by the page. Duels are kept in
//           stream order, unchanged, until --count are kept. corpus "primary"; usable by browser.mjs --full.
//   public  seededDeal(seed, DECKS) for the given seeds, played to a finish by a seeded legal-move sampler with no
//           probes. These are not corpus duels: corpus "public", which browser.mjs --full refuses.
//
// Every candidate's canonical input line (the line prove.mjs sends) goes to proof/referee/referee.py --stream after
// the referee tree is checked against freeze.referee.treeSha256. Its result line is kept unchanged under `referee`.
// A duel is written only when the referee finishes it (its last state is over), reports nothing unsupported, and
// every action has a page gesture (gestureGap). `complete` and `result` come from the referee, never the engine.
//
//   node scripts/referee/browser-transcripts.mjs --source public --seeds 1 --out .artifacts/referee-inputs/browser-public-seed-1.jsonl
//   node scripts/referee/browser-transcripts.mjs --source public --seed-start 1 --count 250 --out .artifacts/referee-inputs/browser-public-250.jsonl
//   node scripts/referee/browser-transcripts.mjs --source corpus --count 250 --out .artifacts/referee-inputs/browser-corpus-250.jsonl
//
// Flags: --python <exe> (default $REFEREE_PYTHON or python3). A summary is written beside --out as <out>.summary.json.
// Exit codes: 0 every requested transcript written; 1 fewer than requested (summary says why); 2 bad flags or a freeze,
// referee or corpus that does not check out.
import {createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {once} from "node:events";
import {readFileSync} from "node:fs";
import {mkdir, writeFile} from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import {fileURLToPath, pathToFileURL} from "node:url";
import {parseArgs} from "node:util";
import {DECKS, TYPES, tributes, typeOf} from "../../src/game/showdown/cards.js";
import {applyAction, legalActions, random} from "../../src/game/showdown/rules.js";
import {SIDES, printedName, checkDealAgreement, initialState, seededDeal} from "./engine.mjs";
import {canonicalJson, hashFile, hashTree, oracleSkip, sha256} from "./prove.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const MAX_TRANSCRIPTS = 250;
export const PUBLIC_ENTRY = Object.freeze({
  query: "?seed=<seed>",
  controls: ["#menu-play", "Camp > [data-two=\"1\"] Two players, one screen", "#sd-ready"],
  deal: "createShowdown(seed, {decks: DECKS}) (src/match/showdown-session.js twoPlayers) = engine.mjs seededDeal(seed, DECKS)",
});
const REFEREE = "proof/referee/referee.py";

// The deal Camp > Two players shows for ?seed=<seed>.
export const publicDeal = (seed) => seededDeal(seed, DECKS);

// Whether the page can deal this duel: its first side and ordered decks are the public setup's for its seed.
export function reachable(duel) {
  try { return checkDealAgreement({seed: duel.seed, first: duel.first, decks: duel.decks, actions: []}, DECKS).agrees; } catch { return false; }
}

export function cardNamesFor(decks) {
  const types = [...new Set(SIDES.flatMap((side) => decks[side].map(typeOf)))].sort();
  return Object.fromEntries(types.map((type) => [type, printedName(type)]));
}

// An action the page has no gesture for, or null. src/ui/showdown-screen.js clickCard plays a card at once when it
// has exactly one untargeted play, and a free troop (no printed tribute) always has exactly one, so clicking it
// summons it free; the tribute slots after it would never be read. A tribute paid for a free troop therefore cannot
// be entered: the first click would make a different, legal move. Every other contract action maps to clicks in
// browser.mjs planControls, and a page that refuses part of it shows an absent or disabled control or an open pick.
export function gestureGap(action) {
  if (action?.type !== "summon" || !Array.isArray(action.tributes) || !action.tributes.length) return null;
  let type;
  try { type = typeOf(action.cardId); } catch { return null; }
  if (!TYPES[type] || TYPES[type].kind !== "troop" || tributes(action.cardId) !== 0) return null;
  return `${TYPES[type].name} is a free troop: its card summons it at once, so the page has no control that pays a tribute for it`;
}

// ---------- public duels ----------

function weight(action, choices) {
  switch (action.type) {
    case "summon": return 4 + 2 * action.tributes.length;
    case "spell": return 3;
    case "gear": return 2.5;
    case "location": return 2;
    case "set": return 2.5;
    case "attack": return action.target === "base" ? 5 : 3;
    case "cover": return 0.5;
    default: return choices > 1 ? 0.25 : 1;
  }
}

// The public deal for `seed`, played to a finished game with legal moves only. Deterministic per seed.
export function playPublicDuel(seed, {maxActions = 5000} = {}) {
  const deal = publicDeal(seed);
  const duel = {seed, first: deal.first, decks: deal.decks, actions: [], cardNames: cardNamesFor(deal.decks)};
  const rng = random((seed ^ 0x2545f491) >>> 0);
  let state = initialState(duel);
  while (!state.result) {
    if (duel.actions.length >= maxActions) throw new Error(`seed ${seed}: no finished game after ${maxActions} actions`);
    const legal = legalActions(state);
    const total = legal.reduce((sum, a) => sum + weight(a, legal.length), 0);
    let roll = rng() * total;
    let action = legal[legal.length - 1];
    for (const a of legal) if ((roll -= weight(a, legal.length)) < 0) { action = a; break; }
    state = applyAction(state, action).state;
    duel.actions.push(action);
  }
  return duel;
}

// ---------- frozen corpus ----------

export function readFreeze(root = ROOT) {
  const freeze = JSON.parse(readFileSync(path.join(root, "proof/referee/freeze.json"), "utf8"));
  if (!freeze?.recipe || typeof freeze.inputs?.sha256 !== "string" || typeof freeze.referee?.treeSha256 !== "string") throw new Error("proof/referee/freeze.json has no recipe, inputs.sha256 or referee.treeSha256");
  return freeze;
}

// Problems that keep the checkout's referee (and, for the corpus, corpus.mjs) from being the frozen ones.
export function freezeProblems(freeze, {root = ROOT, corpus = false} = {}) {
  const problems = [];
  const tree = hashTree(path.join(root, "proof/referee"), oracleSkip);
  if (tree !== freeze.referee.treeSha256) problems.push(`proof/referee tree is ${tree}, not the frozen ${freeze.referee.treeSha256}`);
  if (corpus) {
    const file = hashFile(path.join(root, "scripts/referee/corpus.mjs"));
    if (file !== freeze.corpus?.sha256) problems.push(`scripts/referee/corpus.mjs is ${file}, not the frozen ${freeze.corpus?.sha256}`);
  }
  return problems;
}

// Streams the whole frozen corpus once: its digest (checked by the caller against freeze.inputs.sha256) and the
// duels the page can deal, in stream order.
export async function frozenReachable(freeze, {root = ROOT} = {}) {
  const corpus = await import(pathToFileURL(path.join(root, "scripts/referee/corpus.mjs")).href);
  const hash = createHash("sha256");
  const duels = [];
  let streamed = 0;
  for await (const duel of corpus.duels(freeze.recipe)) {
    hash.update(`${canonicalJson(duel)}\n`);
    streamed++;
    if (reachable(duel)) duels.push(duel);
  }
  return {digest: hash.digest("hex"), streamed, duels};
}

// ---------- referee ----------

// Sends each duel's canonical line to referee.py --stream, one at a time, and hands each raw result to onResult.
// onResult returns true to stop. Resolves with {sent, exit}.
export async function adjudicate(duels, onResult, {python = process.env.REFEREE_PYTHON || "python3", root = ROOT} = {}) {
  const child = spawn(python, ["-u", path.join(root, REFEREE), "--stream"], {cwd: root, stdio: ["pipe", "pipe", "pipe"],
    env: {...process.env, PYTHONUNBUFFERED: "1"}});
  let stderr = "";
  child.stderr.on("data", (d) => { stderr = (stderr + d).slice(-2000); });
  const exited = new Promise((resolve) => {
    child.on("error", (error) => resolve({error: error.message}));
    child.on("close", (code, signal) => resolve({code, signal}));
  });
  child.stdin.on("error", () => {});
  const lines = readline.createInterface({input: child.stdout, crlfDelay: Infinity})[Symbol.asyncIterator]();
  let sent = 0;
  try {
    for (const duel of duels) {
      const line = canonicalJson(duel);
      if (!child.stdin.write(`${line}\n`)) await Promise.race([once(child.stdin, "drain"), exited]);
      sent++;
      const next = await Promise.race([lines.next(), exited.then(() => ({done: true}))]);
      if (next.done) throw new Error(`referee stopped after ${sent - 1} result(s)${stderr ? `: ${stderr.trim().slice(-400)}` : ""}`);
      if (await onResult(duel, line, JSON.parse(next.value))) break;
    }
  } finally {
    child.stdin.end();
  }
  const exit = await exited;
  if (exit.error) throw new Error(`cannot run the referee with ${python}: ${exit.error}`);
  if (exit.code !== 0) throw new Error(`referee exited with ${exit.signal ?? exit.code}${stderr ? `: ${stderr.trim().slice(-400)}` : ""}`);
  return {sent, exit};
}

// Why the browser cannot use this referee result, or null.
export function refereeProblem(duel, result) {
  if (!result || typeof result !== "object") return "no result";
  if (canonicalJson(result.seed ?? null) !== canonicalJson(duel.seed)) return `result is for seed ${JSON.stringify(result.seed)}`;
  if (Array.isArray(result.unsupported) && result.unsupported.length) return `unsupported: ${result.unsupported.join("; ")}`;
  if (!result.initial || !Array.isArray(result.steps) || result.steps.length !== duel.actions.length) return `referee gave ${result.steps?.length ?? 0} steps for ${duel.actions.length} actions`;
  const last = result.steps.at(-1)?.state ?? result.initial;
  if (!last?.over) return "referee did not finish the duel";
  return null;
}

export function transcriptOf(duel, line, result, {corpus, source, treeSha256}) {
  const last = result.steps.at(-1)?.state ?? result.initial;
  return {corpus, source, duel,
    browser: {entry: PUBLIC_ENTRY, query: `?seed=${duel.seed}`, dealAgrees: reachable(duel), gestureGaps: duel.actions.map(gestureGap)},
    referee: {entry: `${REFEREE} --stream`, treeSha256, inputSha256: sha256(line), result},
    complete: Boolean(last?.over), result: {winner: last?.winner ?? null, reason: last?.reason ?? null}};
}

// ---------- CLI ----------

function parse(argv) {
  const {values} = parseArgs({args: argv, options: {source: {type: "string"}, count: {type: "string"}, seeds: {type: "string"},
    "seed-start": {type: "string"}, out: {type: "string"}, python: {type: "string"}}});
  const whole = (flag, text) => {
    if (!/^\d+$/.test(text)) throw new Error(`--${flag} must be a whole number`);
    return Number(text);
  };
  if (!["corpus", "public"].includes(values.source)) throw new Error("pass --source corpus or --source public");
  if (!values.out) throw new Error("pass --out <file.jsonl>");
  const opts = {source: values.source, out: path.resolve(values.out), python: values.python};
  if (values.source === "corpus") {
    if (values.seeds || values["seed-start"]) throw new Error("--seeds and --seed-start apply to --source public; the corpus is taken in stream order");
    opts.count = whole("count", values.count ?? String(MAX_TRANSCRIPTS));
  } else if (values.seeds) {
    if (values.count || values["seed-start"]) throw new Error("give --seeds or --seed-start/--count, not both");
    opts.seeds = values.seeds.split(",").map((s) => whole("seeds", s.trim()));
    if (new Set(opts.seeds).size !== opts.seeds.length) throw new Error("--seeds repeats a seed");
    opts.count = opts.seeds.length;
  } else {
    const start = whole("seed-start", values["seed-start"] ?? "1");
    opts.count = whole("count", values.count ?? "1");
    opts.seeds = Array.from({length: opts.count}, (_, i) => start + i);
  }
  if (opts.count < 1 || opts.count > MAX_TRANSCRIPTS) throw new Error(`--count must be 1 to ${MAX_TRANSCRIPTS}`);
  return opts;
}

async function main(argv) {
  let opts;
  try { opts = parse(argv); } catch (error) { console.error(error.message); return 2; }
  const startedAt = new Date().toISOString();
  let freeze;
  try { freeze = readFreeze(); } catch (error) { console.error(error.message); return 2; }
  const frozen = freezeProblems(freeze, {corpus: opts.source === "corpus"});
  if (frozen.length) { console.error(`not the frozen referee inputs:\n${frozen.join("\n")}`); return 2; }
  const summary = {tool: "scripts/referee/browser-transcripts.mjs", source: opts.source, requested: opts.count, startedAt,
    referee: {entry: `${REFEREE} --stream`, treeSha256: freeze.referee.treeSha256, frozen: true}, publicEntry: PUBLIC_ENTRY};
  let candidates, source;
  if (opts.source === "corpus") {
    const stream = await frozenReachable(freeze);
    if (stream.digest !== freeze.inputs.sha256) { console.error(`frozen corpus streams ${stream.digest}, not freeze.inputs.sha256 ${freeze.inputs.sha256}`); return 2; }
    summary.corpus = {recipe: freeze.recipe.name, inputsSha256: stream.digest, streamed: stream.streamed, reachable: stream.duels.length,
      reachableSeedsMod3: [...new Set(stream.duels.map((d) => d.seed % 3))]};
    candidates = stream.duels;
    source = {kind: "frozen-corpus", recipe: freeze.recipe.name, inputsSha256: stream.digest};
  } else {
    candidates = opts.seeds.map((seed) => playPublicDuel(seed));
    source = {kind: "public-setup", policy: "seeded legal-move sampler, no probes (browser-transcripts.mjs playPublicDuel)"};
  }
  const corpus = opts.source === "corpus" ? "primary" : "public";
  const kept = [];
  const skipped = [];
  const seenDeals = new Set();
  const {sent} = await adjudicate(candidates, (duel, line, result) => {
    const problem = refereeProblem(duel, result)
      ?? (duel.actions.some(gestureGap) ? `no page gesture for action ${duel.actions.findIndex(gestureGap)}: ${gestureGap(duel.actions.find(gestureGap))}` : null)
      ?? (seenDeals.has(canonicalJson([duel.first, duel.decks])) ? "repeats an earlier deal" : null);
    if (problem) skipped.push({seed: duel.seed, problem});
    else {
      seenDeals.add(canonicalJson([duel.first, duel.decks]));
      kept.push(transcriptOf(duel, line, result, {corpus, source, treeSha256: freeze.referee.treeSha256}));
    }
    return kept.length >= opts.count;
  }, {python: opts.python});
  await mkdir(path.dirname(opts.out), {recursive: true});
  await writeFile(opts.out, kept.map((t) => JSON.stringify(t)).join("\n") + (kept.length ? "\n" : ""));
  const steps = kept.flatMap((t) => t.referee.result.steps);
  Object.assign(summary, {out: opts.out, sha256: hashFile(opts.out), refereeSent: sent, kept: kept.length, seeds: kept.map((t) => t.duel.seed),
    actions: steps.length, refereeRejected: steps.filter((s) => !s.accepted).length,
    winners: kept.reduce((n, t) => ({...n, [t.result.winner ?? "draw"]: (n[t.result.winner ?? "draw"] ?? 0) + 1}), {}),
    skipped: skipped.length, skippedByReason: skipped.reduce((n, s) => {
      const key = s.problem.replace(/\d+/g, "N");
      return {...n, [key]: (n[key] ?? 0) + 1};
    }, {}),
    skippedSample: skipped.slice(0, 20), finishedAt: new Date().toISOString()});
  await writeFile(`${opts.out.replace(/\.jsonl?$/, "")}.summary.json`, JSON.stringify(summary, null, 1) + "\n");
  console.log(`${kept.length} of ${opts.count} transcripts (${sent} adjudicated, ${skipped.length} skipped) -> ${opts.out}`);
  return kept.length === opts.count ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (error) => { console.error(error.stack ?? error.message); process.exit(2); });
}
