// The Camp saloon's side doors: the Boot Hill Poker link, the Forge shelf, Rules desk and Agent arena drawers,
// the poker staging under /poker/, and the field trial data module. No DOM, network or renderer:
// camp-outpost.js needs a browser, so its wiring is checked from source and pokerHref is run alone.
import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, readFileSync} from "node:fs";
import {FIELD_TRIAL} from "../../src/ui/field-trial-data.js";

const outpost = readFileSync("src/ui/showdown-3d/camp-outpost.js", "utf8");
const pokerHref = new Function(`${outpost.match(/export function pokerHref[\s\S]*?\n}\n/)[0].replace(/^export /, "")}; return pokerHref;`)();
const POKER_FILES = ["index.html", "app.js", "controls.js", "render.js", "engine.js", "ko.js"];

test("FIELD_TRIAL is exactly the two checked-in evidence files", () => {
  const read = (name) => JSON.parse(readFileSync(`docs/evidence/night-shift-repair/${name}.json`, "utf8"));
  assert.deepEqual(Object.keys(FIELD_TRIAL), ["fresh", "witness"]);
  assert.deepEqual(FIELD_TRIAL.fresh, read("fresh"));
  assert.deepEqual(FIELD_TRIAL.witness, read("witness"));
});

test("the poker link reaches the one poker/ page from /, /3d/, a local server and the staged files on disk", () => {
  const base = "https://alejandro-publius.github.io/cowboys-vs-wizards/";
  assert.equal(pokerHref(base), `${base}poker/`);
  assert.equal(pokerHref(`${base}3d/?outrider=case-a#camp`), `${base}poker/`);
  assert.equal(pokerHref(`${base}index.html?practice=0`), `${base}poker/`);
  assert.equal(pokerHref(`${base}3d/index.html`), `${base}poker/`);
  assert.equal(pokerHref("http://127.0.0.1:4173/"), "http://127.0.0.1:4173/poker/");
  assert.equal(pokerHref("file:///tmp/dist/web/3d/index.html"), "file:///tmp/dist/web/poker/index.html");
  assert.equal(pokerHref("file:///tmp/dist/web/index.html"), "file:///tmp/dist/web/poker/index.html");
});

test("the saloon room carries the poker link and drawers for the shelf, desk and arena modules", () => {
  assert.match(outpost, /import \{mountForgeShelf\} from "\.\.\/forge-shelf\.js";/);
  assert.match(outpost, /import \{mountRulesDesk\} from "\.\.\/rules-desk\.js";/);
  assert.match(outpost, /import \{mountArenaTable\} from "\.\.\/arena-table\.js";/);
  assert.match(outpost, /\["forge", "대장간 선반", mountForgeShelf\],\s*\["rules", "규칙 데스크", mountRulesDesk\],\s*\["arena", "에이전트 경기장", mountArenaTable\],\s*\];/,
    "the three bar drawers, in order");
  assert.match(outpost, /poker\.href = pokerHref\(document\.baseURI\)/);
  assert.match(outpost, /saloonRoom\.append\(bar\)/, "the bar sits in the saloon dialog, below the scene");
  assert.match(outpost, /실험적인 두 번째 게임/);
  assert.doesNotMatch(outpost, /["'`]\/poker\//, "no root-absolute poker path, which would miss the project base");
});

test("the balance ruling is the first drawer at the bar", () => {
  assert.match(outpost, /import \{mountScoutRuling\} from "\.\.\/scout-ruling\.js";/);
  assert.match(outpost, /const BAR_DRAWERS = \[\s*\["ruling", "균형 판정", mountScoutRuling\],\s*\["forge", "대장간 선반", mountForgeShelf\],/,
    "the ruling drawer opens the list, ahead of the existing drawers");
});

test("staging copies the five poker browser files to poker/ and the tree check expects them", () => {
  for (const name of POKER_FILES) assert.ok(existsSync(`experiments/boot-hill-poker/${name}`), `experiments/boot-hill-poker/${name} exists`);
  const stage = readFileSync("scripts/stage-pages.mjs", "utf8");
  assert.match(stage, /"\.\.\/experiments\/boot-hill-poker\/"/);
  assert.match(stage, /\["index\.html", "app\.js", "controls\.js", "render\.js", "engine\.js", "ko\.js"\]/);
  const staged = stage.indexOf("poker/${name}"), identity = stage.indexOf("write-build-identity.mjs\", \"--commit\"");
  assert.ok(staged > 0 && identity > staged, "poker/ is staged before the build identity is written");
  const tree = readFileSync("scripts/check-pages-tree.mjs", "utf8");
  assert.match(tree, /\["app\.js", "controls\.js", "engine\.js", "index\.html", "ko\.js", "render\.js"\]/);
  assert.match(tree, /\.\.\.POKER_FILES\.map\(\(name\) => `poker\/\$\{name\}`\)/);
  assert.match(tree, /pokerImportGraph\(pokerText\)/, "the tree check walks the served import graph");
  for (const source of ["cli.mjs", "engine.test.mjs", "README.md"]) {
    assert.doesNotMatch(stage, new RegExp(`"${source.replace(".", "\\.")}"`), `${source} stays source-only`);
  }
});

// Mirrors how a browser resolves poker/ under a nested GitHub Pages project path, from the
// experiment source: every runtime script and module import must be relative, stay in poker/,
// and the reachable set must be exactly the staged files.
test("every runtime import of poker/index.html resolves to a staged file inside a nested project", () => {
  const pokerBase = "https://alejandro-publius.github.io/cowboys-vs-wizards/poker/";
  const html = readFileSync("experiments/boot-hill-poker/index.html", "utf8");
  assert.doesNotMatch(html, /<link\b[^>]*\bstylesheet\b/i, "CSS is inline");
  assert.match(html, /<style>/);
  const reached = new Set(["index.html"]), queue = [], edges = [];
  const follow = (spec, from) => {
    assert.match(spec, /^\.{1,2}\//, `${from} imports ${spec} relatively`);
    const url = new URL(spec, pokerBase + from);
    assert.ok(url.href.startsWith(pokerBase), `${from} -> ${spec} stays inside poker/`);
    const rel = url.href.slice(pokerBase.length);
    edges.push(`${from} -> ${rel}`);
    if (!reached.has(rel)) { reached.add(rel); queue.push(rel); }
  };
  for (const [, spec] of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) follow(spec, "index.html");
  while (queue.length) {
    const rel = queue.shift();
    assert.ok(existsSync(`experiments/boot-hill-poker/${rel}`), `${rel} exists in the experiment`);
    const source = readFileSync(`experiments/boot-hill-poker/${rel}`, "utf8");
    assert.doesNotMatch(source, /from\s*["']node:|import\s*\(?\s*["']node:/, `${rel} has no Node-only import`);
    for (const [, spec] of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) follow(spec, rel);
  }
  assert.deepEqual([...reached].sort(), [...POKER_FILES].sort(), "the runtime graph is exactly the five staged files");
  for (const edge of ["index.html -> app.js", "app.js -> controls.js", "app.js -> engine.js", "app.js -> render.js",
    "controls.js -> engine.js", "render.js -> engine.js"]) assert.ok(edges.includes(edge), `import ${edge}`);
});
