// Stages the whole GitHub Pages tree in dist/web/, the same way locally and in .github/workflows/pages.yml.
// Usage: node scripts/stage-pages.mjs [--commit <40 hex>]
//   /            illustrated Showdown with the verified Ride or Fight? challenge and Camp
//   /graybox/    the same game with the lightweight board and direct Camp entry
//   /showdown/   the full Showdown reference page, from prototypes/showdown/build.mjs
//   /3d/         the same illustrated build as /, including direct query links
//   /poker/      Boot Hill Poker, the experimental second game: the five browser files of
//                experiments/boot-hill-poker/ copied as is (index.html with inline CSS, app.js and its
//                imports controls.js, render.js, engine.js); cli.mjs, tests and README stay source-only.
//                The Camp saloon links to it from / and /3d/
//   /build.json  with --commit: the release identity of /index.html (scripts/write-build-identity.mjs)
// dist/web/ is deleted first, so nothing from an earlier layout survives.
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import {cp, mkdir, readFile, rm} from "node:fs/promises";
import {fileURLToPath} from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const web = new URL("../dist/web/", import.meta.url);
const POKER_SOURCE = new URL("../experiments/boot-hill-poker/", import.meta.url);
const POKER_FILES = ["index.html", "app.js", "controls.js", "render.js", "engine.js", "ko.js"];
const args = process.argv.slice(2);
const commit = args[0] === "--commit" ? args[1] : undefined;
if (args.length && (args.length !== 2 || commit === undefined)) {
  console.error("usage: node scripts/stage-pages.mjs [--commit <40 hex>]");
  process.exit(2);
}
const run = (...cmd) => {
  console.log(`$ node ${cmd.join(" ")}`);
  const result = spawnSync(process.execPath, cmd, {cwd: root, stdio: "inherit"});
  if (result.status !== 0) process.exit(result.status ?? 1);
};
await rm(web, {recursive: true, force: true});
run("scripts/build-graybox.mjs", "--hosted");
await mkdir(new URL("graybox/", web), {recursive: true});
await cp(new URL("index.html", web), new URL("graybox/index.html", web));
run("scripts/build-graybox.mjs", "--diorama", "--contest");
await cp(new URL("../dist/cowboys-vs-wizards-showdown-3d.html", import.meta.url), new URL("index.html", web));
await mkdir(new URL("3d/", web), {recursive: true});
await cp(new URL("index.html", web), new URL("3d/index.html", web));
run("prototypes/showdown/build.mjs");
await mkdir(new URL("showdown/", web), {recursive: true});
await cp(new URL("../dist/showdown.html", import.meta.url), new URL("showdown/index.html", web));
await mkdir(new URL("poker/", web), {recursive: true});
for (const name of POKER_FILES) await cp(new URL(name, POKER_SOURCE), new URL(`poker/${name}`, web));
if (commit !== undefined) run("scripts/write-build-identity.mjs", "--commit", commit, "--dir", "dist/web");
const digest = createHash("sha256").update(await readFile(new URL("index.html", web))).digest("hex");
console.log(`Staged illustrated Showdown at / and /3d/, with /graybox/, /showdown/ and /poker/; index.html sha256 ${digest}`);
