// K-011: the Outrider section of the Sheriff's Ledger, assembled at build time from the gate's verdicts
// (scripts/outrider-gate.mjs), the search worker's research record and the checked-in Night Watch receipt.
// Fail closed: a measured outcome or research number is included only when every curated case is fresh now.
// The page gets this object through build-graybox.mjs (__CVW_OUTRIDER_LEDGER__); the build also writes it to
// dist/outrider-ledger.json as the build receipt.
import {execFileSync} from "node:child_process";
import {createHash} from "node:crypto";
import {existsSync, readFileSync} from "node:fs";
import {dirname, join, normalize} from "node:path";
import {cardOf} from "../src/game/showdown/cards.js";
import {createShowdownSession} from "../src/match/showdown-session.js";
import {outriderDuel} from "../src/match/showdown-outrider.js";

// Same text as build-sheriffs-ledger.mjs laTime (not imported: that module loads the whole Ledger's inputs).
const LA = new Intl.DateTimeFormat("en-US", {timeZone: "America/Los_Angeles", year: "numeric", month: "numeric", day: "numeric",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZoneName: "short"});
function laTime(iso) {
  const p = Object.fromEntries(LA.formatToParts(new Date(iso)).map(({type, value}) => [type, value]));
  return `${p.year}년 ${p.month}월 ${p.day}일 ${p.hour}:${p.minute} ${p.timeZoneName}`;
}

export const NIGHT_WATCH_RECEIPT = "docs/evidence/night-shift/receipt.json";
// The file the Night Watch simulator imports (apps/night-watch/backend/showdown_sim.mjs) and hashes as rulesBlob.
export const NIGHT_WATCH_ENTRY = "prototypes/showdown/rules.js";
export const OUTRIDER_ENTRY = "src/match/showdown-outrider.js";

// Relative static and dynamic imports of a module's text.
const importsOf = (text) => [...text.matchAll(/(?:from\s*|import\s*\(\s*)["'](\.{1,2}\/[^"']+)["']/g)].map((m) => m[1]);

// The relative-import closure of `entry`, read through `read(path)` (null when absent). Sorted paths.
export function closure(entry, read) {
  const seen = new Set(), todo = [entry];
  while (todo.length) {
    const file = todo.pop();
    if (seen.has(file)) continue;
    const text = read(file);
    if (text === null) continue;
    seen.add(file);
    for (const spec of importsOf(text)) todo.push(normalize(join(dirname(file), spec)));
  }
  return [...seen].sort();
}

const git = (root, args) => { try { return execFileSync("git", args, {cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}); } catch { return null; } };

export const ENGINE_SNAPSHOT = "docs/evidence/outrider-gate/night-watch-engine.json";
// Git's blob id of a file's bytes (sha1 of "blob <size>\0" + bytes), so a checkout without git still compares.
export const blobId = (bytes) => createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
const readHere = (root) => (f) => (existsSync(join(root, f)) ? readFileSync(join(root, f), "utf8") : null);

// The engine blob ids at the receipt's commit: from git when the commit is present (then the checked-in snapshot must
// agree), otherwise from the snapshot when it names that commit and its entry blob equals the receipt's rulesBlob.
export function engineAt(commit, rulesBlob, root) {
  const path = join(root, ENGINE_SNAPSHOT);
  const snap = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;
  if (commit && git(root, ["cat-file", "-e", `${commit}^{commit}`]) !== null) {
    const files = closure(NIGHT_WATCH_ENTRY, (f) => git(root, ["show", `${commit}:${f}`]));
    const blobs = Object.fromEntries(files.map((f) => [f, git(root, ["rev-parse", "--verify", "--quiet", `${commit}:${f}`])?.trim() ?? null]));
    if (snap && snap.commit === commit && JSON.stringify(snap.files) !== JSON.stringify(blobs)) return {error: `${ENGINE_SNAPSHOT} disagrees with git objects at ${commit.slice(0, 7)}`};
    return {blobs, from: "git"};
  }
  if (!snap || snap.commit !== commit) return {error: `commit ${commit?.slice(0, 7) ?? "?"} is not in this checkout and no engine snapshot names it`};
  if (snap.files?.[NIGHT_WATCH_ENTRY] !== rulesBlob) return {error: `${ENGINE_SNAPSHOT} rules blob does not equal the receipt's rulesBlob`};
  return {blobs: snap.files, from: ENGINE_SNAPSHOT};
}

// Byte identity of the engine the Night Watch run measured (its commit) against this tree's working files.
export function engineIdentity(commit, root, rulesBlob = null) {
  const at = engineAt(commit, rulesBlob, root);
  if (at.error) return {checked: false, reason: at.error};
  const here = closure(NIGHT_WATCH_ENTRY, readHere(root));
  const files = [...new Set([...Object.keys(at.blobs), ...here])].sort();
  const now = (f) => (existsSync(join(root, f)) ? blobId(readFileSync(join(root, f))) : null);
  const differ = files.filter((f) => (at.blobs[f] ?? null) !== now(f));
  const outrider = closure(OUTRIDER_ENTRY, readHere(root));
  return {checked: true, from: at.from, files: files.length, same: differ.length === 0, differ, entryBlob: now(NIGHT_WATCH_ENTRY),
    notMeasured: outrider.filter((f) => !files.includes(f))};
}

export function nightWatch(root) {
  const path = join(root, NIGHT_WATCH_RECEIPT);
  if (!existsSync(path)) return null;
  const r = JSON.parse(readFileSync(path, "utf8"));
  const engine = engineIdentity(r.candidate.commit, root, r.candidate.rulesBlob);
  return {source: NIGHT_WATCH_RECEIPT, at: r.generatedAt, local: laTime(r.generatedAt), trigger: r.trigger, bot: r.bot,
    commit: r.candidate.commit, rulesBlob: r.candidate.rulesBlob, seeds: {from: r.seeds.from, to: r.seeds.to}, games: r.seeds.games,
    engine, rulesBlobMatch: engine.checked ? engine.entryBlob === r.candidate.rulesBlob : null};
}

const SIDE = {cowboy: "Cowboys", wizard: "Wizards"};
const boardText = (side) => side.board.map((t) => (t ? `${cardOf(t.cardId).name} ${t.health}${t.cover ? " (엄폐)" : ""}` : "비어 있음")).join(" · ");

// The public picture at a case's landing, from the replay itself (names, orbs, Bases only).
function position(entry) {
  const {seed, duel} = outriderDuel(entry);
  const view = createShowdownSession({seed, duel}).view();
  return {turn: view.turn, bases: {cowboy: view.sides.cowboy.base, wizard: view.sides.wizard.base},
    cowboy: boardText(view.sides.cowboy), wizard: boardText(view.sides.wizard)};
}

// Aggregate research counts from the search worker's range files; null when any is missing.
function research(root, dir) {
  const read = (f) => { const p = join(root, dir, "results", f); return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null; };
  const ranges = ["search-1000-1099.json", "search-1100-1199.json", "holdout-1200-1299.json"].map(read);
  const cue = read("cue.json");
  if (ranges.some((r) => !r) || !cue) return null;
  const sum = (key) => ranges.reduce((n, r) => n + (r.counts[key] ?? r.counts.kinds?.[key] ?? 0), 0);
  const holdout = ranges[2];
  return {tried: sum("tried"), reached: sum("branch"), rideOnly: sum("ride-only"), fightOnly: sum("fight-only"),
    cue: `${cue.rule.feature} ${cue.rule.op} ${cue.rule.threshold} → fight`, derivedOn: cue.derivedFrom, fit: {correct: cue.fit.correct, flips: cue.fit.flips},
    holdout: {range: `${holdout.range.from}-${holdout.range.to}`, correct: holdout.score.correct, flips: holdout.score.flips,
      alwaysRide: holdout.score.alwaysRide, alwaysFight: holdout.score.alwaysFight, supported: holdout.supported},
    record: dir};
}

// curated: {camp, compare: [id, id]}. verdicts: judge() rows. decision: loadDecision(). verified: ids shipped as links.
export function outriderLedger({curated, verdicts, decision, root, dir}) {
  const base = {schema: "outrider-ledger/1", nightWatch: nightWatch(root), record: dir};
  if (!decision || decision.missing?.length) return {...base, status: "missing", statusText: "이 빌드에 기록된 아웃라이더 사례가 없어 비교할 것이 없습니다.", positions: []};
  const byId = Object.fromEntries(verdicts.map((v) => [v.id, v]));
  const stale = curated.compare.filter((id) => !byId[id]?.fresh);
  if (stale.length) {
    return {...base, status: "stale", positions: [],
      statusText: `아웃라이더 비교가 이 빌드에서 측정된 대로 재현되지 않아(${stale.join(", ")}) 결과와 링크를 숨깁니다. `
        + "자세한 내용은 node scripts/outrider-gate.mjs --check를 실행하세요."};
  }
  const entries = Object.fromEntries(decision.cases.map((c) => [c.id, c]));
  const measured = (id, arm) => { const m = (decision.results.cases?.[id] ?? decision.results[id])[arm]; return {winner: m.winner, turn: m.turn}; };
  return {...base, status: "fresh",
    statusText: `두 국면 모두 이 빌드에서 측정된 그대로 재현됩니다(기록된 사례 ${verdicts.length}건 중 ${verdicts.filter((v) => v.fresh).length}건이 최신).`,
    // Public positions and measured results are kept apart: the position objects never carry an outcome.
    positions: curated.compare.map((id, i) => ({id, label: `국면 ${i + 1}`, ...position(entries[id])})),
    results: Object.fromEntries(curated.compare.map((id) => [id, {ride: measured(id, "ride"), fight: measured(id, "fight")}])),
    research: research(root, dir), sides: SIDE};
}
