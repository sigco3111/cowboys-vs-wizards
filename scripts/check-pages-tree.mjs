// Serves a staged Pages tree (node scripts/stage-pages.mjs --commit <sha>) over local HTTP under the
// project path, /cowboys-vs-wizards/, and checks it the way the deployed site is used.
//   node scripts/check-pages-tree.mjs [--dir dist/web] [--commit <40 hex>] [--browser] [--out-dir PATH]
// Without --browser (Node only, no Chrome):
//   - build.json, /index.html and the /3d/ alias pass scripts/verify-build-identity.mjs, which
//     hashes the served bytes; with --commit the manifest must name that commit
//   - the tree holds exactly index.html, build.json, graybox/index.html, showdown/index.html,
//     3d/index.html and the five Boot Hill Poker browser files under poker/ (index.html with inline
//     CSS, app.js, controls.js, render.js, engine.js): no other script file, model, image, video or
//     wasm, nothing from the retired 3D lane build, and no poker CLI or tests
//   - the root and /3d/ carry illustrated Showdown; /graybox/ remains lightweight
//   - no page carries the retired lane game
//   - /showdown/ is served
//   - /poker/ (the experimental second game) is served under the project path, byte for byte from
//     experiments/boot-hill-poker/, with no root-absolute links; every script, stylesheet and module
//     import reachable from poker/index.html resolves inside poker/ and is served, and that import
//     graph is exactly the five staged files; the root carries the saloon link
// --browser, native headless Chrome with a fresh profile, mouse events only:
//   - the title challenge and its deep link open the same playable Bone Fence board
//   - Camp on / opens the Trail; Play on /graybox/ opens the Camp
//   - /showdown/: the reference page loads without errors
//   - the Camp saloon on / and /3d/ links to the one poker/ page; following it loads all five poker
//     files, paints the BBS screen and raises no errors
//   - /?saloon=review opens the recorded Night Shift saloon at the validated Billy proposal card with no
//     /night-shift/events request; Replay from start hides the decision and Back to map returns to the Camp
//   - Chrome exposes the named challenge, Outrider controls, Saloon dialog and balance evidence in its accessibility tree
//   No page error, failed request or HTTP error is allowed anywhere.
import assert from "node:assert/strict";
import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {mkdir, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import {createServer} from "node:http";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {verifyLive} from "./verify-build-identity.mjs";

const BASE_PATH = "/cowboys-vs-wizards/";
const POKER_FILES = ["app.js", "controls.js", "engine.js", "index.html", "ko.js", "render.js"];
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const root = fileURLToPath(new URL("../", import.meta.url));
const args = process.argv.slice(2);
const option = (name, fallback) => { const i = args.indexOf(name); return i < 0 ? fallback : args[i + 1]; };
const dir = path.resolve(root, option("--dir", "dist/web"));
const commit = option("--commit");
const browser = args.includes("--browser");
const outDir = path.resolve(root, option("--out-dir", ".artifacts/pages-tree"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const types = {".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".glb": "model/gltf-binary",
  ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".mp4": "video/mp4", ".css": "text/css"};
const report = {dir: path.relative(root, dir), basePath: BASE_PATH, checks: [], errors: []};
const check = (name, detail) => { report.checks.push({name, ...(detail === undefined ? {} : {detail})}); console.log(`ok - ${name}`); };

// A static server like GitHub Pages: only BASE_PATH, directory URLs serve index.html, a directory
// without the trailing slash redirects, nothing outside the tree is readable.
const server = createServer(async (request, response) => {
  const url = new URL(request.url, "http://localhost");
  let rel = decodeURIComponent(url.pathname);
  if (!rel.startsWith(BASE_PATH)) { response.statusCode = 404; return response.end("outside the site"); }
  rel = rel.slice(BASE_PATH.length);
  const file = path.resolve(dir, rel.endsWith("/") || rel === "" ? rel + "index.html" : rel);
  if (!file.startsWith(dir + path.sep)) { response.statusCode = 403; return response.end(); }
  try {
    const body = await readFile(file);
    response.setHeader("content-type", types[path.extname(file)] ?? "application/octet-stream");
    response.end(body);
  } catch (error) {
    if (error.code === "EISDIR") { response.statusCode = 301; response.setHeader("location", url.pathname + "/"); return response.end(); }
    response.statusCode = 404; response.end("not found");
  }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const site = `http://127.0.0.1:${server.address().port}${BASE_PATH}`;
report.site = site;
const get = async (rel, redirect = "follow") => { const r = await fetch(site + rel, {redirect}); return {status: r.status, location: r.headers.get("location"), bytes: Buffer.from(await r.arrayBuffer())}; };
let failed = null;

try {
  // Release identity of the illustrated root and its alias.
  const rootHtml = await get("");
  assert.equal(rootHtml.status, 200, "root index.html");
  const digest = createHash("sha256").update(rootHtml.bytes).digest("hex");
  const manifest = JSON.parse((await get("build.json")).bytes);
  if (commit) assert.equal(manifest.commit, commit, "build.json commit");
  await verifyLive({url: site, commit: manifest.commit, htmlSha256: digest, aliases: ["3d/"], attempts: 1, log() {}});
  check("build.json names the illustrated root; /3d/ serves the same bytes", {commit: manifest.commit, indexHtmlSha256: digest});
  assert.equal((await get("graybox", "manual")).location, `${BASE_PATH}graybox/`, "/graybox redirects to /graybox/");
  const rootText = rootHtml.bytes.toString("utf8");
  assert.match(rootText, /WebGLRenderer/, "root embeds Showdown's diorama");
  assert.match(rootText, /menu-challenge/, "root offers the contest challenge");
  const graybox = await get("graybox/");
  assert.equal(graybox.status, 200);
  const grayboxText = graybox.bytes.toString("utf8");
  assert.match(grayboxText, /id="menu-play"/);
  assert.doesNotMatch(grayboxText, /WebGLRenderer/);
  check("/ and /3d/ use the diorama; /graybox/ gives a lightweight Camp entry");

  const entries = await readdir(dir, {recursive: true, withFileTypes: true});
  const files = entries.filter((e) => e.isFile()).map((e) => path.relative(dir, path.join(e.parentPath, e.name)).split(path.sep).join("/")).sort();
  assert.deepEqual(files, ["3d/index.html", "build.json", "graybox/index.html", "index.html",
    ...POKER_FILES.map((name) => `poker/${name}`), "showdown/index.html"], "staged files");
  assert.equal((await get("3d", "manual")).location, `${BASE_PATH}3d/`, "/3d redirects to /3d/");
  const showdown = await get("showdown/");
  assert.equal(showdown.status, 200);
  for (const [route, html] of [["/", rootText], ["/graybox/", grayboxText], ["/showdown/", showdown.bytes.toString("utf8")]])
    assert.doesNotMatch(html, /chunks\/lanes-|id="arena"|id="menu-lanes"|id="earlier-build"|<script id="models"|rapier_wasm|rapier3d/, `${route} has no retired lane engine`);
  check("the four single-file pages include no retired lane game or separate assets", {files});

  // Boot Hill Poker, the experimental second game, staged as its own five files.
  assert.equal((await get("poker", "manual")).location, `${BASE_PATH}poker/`, "/poker redirects to /poker/");
  for (const name of POKER_FILES) {
    const served = await get(`poker/${name}`);
    assert.equal(served.status, 200, `poker/${name} is served under ${BASE_PATH}`);
    assert.ok(served.bytes.equals(await readFile(path.join(root, "experiments/boot-hill-poker", name))), `poker/${name} matches its experiment source`);
  }
  const pokerText = (await get("poker/")).bytes.toString("utf8");
  assert.doesNotMatch(pokerText, /\b(?:src|href)\s*=\s*["']\/(?!\/)/, "poker/ uses no root-absolute links, so it works under the project path");
  assert.doesNotMatch(pokerText, /<link\b[^>]*\bstylesheet\b/i, "poker/ keeps its CSS inline");
  const graph = await pokerImportGraph(pokerText);
  assert.deepEqual(graph, POKER_FILES, "the poker/ runtime import graph is exactly the staged files");
  assert.match(rootText, /outpost-poker-link/, "the illustrated root carries the saloon's poker link");
  check("/poker/ serves the experimental Boot Hill Poker files under the project path; every runtime import resolves", {graph});

  if (browser) await browserChecks();
} catch (error) {
  failed = error;
  report.failure = error.stack ?? String(error);
} finally {
  server.close();
}
await mkdir(outDir, {recursive: true});
await writeFile(path.join(outDir, "pages-tree.json"), JSON.stringify(report, null, 2) + "\n");
if (failed) { console.error(failed); process.exit(1); }
console.log(`Pages tree checks passed (${report.checks.length}); report ${path.relative(root, path.join(outDir, "pages-tree.json"))}`);

// Follows poker/index.html's <script src> and <link href> and every static or dynamic module
// specifier in the served JavaScript, resolved the way the browser resolves them under BASE_PATH.
// Each must be relative, stay inside poker/ and return 200. Returns the reached files, sorted.
async function pokerImportGraph(html) {
  const pokerBase = `${site}poker/`;
  const reached = new Set(["index.html"]);
  const queue = [];
  const follow = (spec, from) => {
    assert.match(spec, /^\.{1,2}\//, `${from} references ${spec} relatively, so it works in a nested project`);
    const url = new URL(spec, pokerBase + from);
    assert.ok(url.href.startsWith(pokerBase) && !url.search && !url.hash, `${from} -> ${spec} stays inside poker/`);
    const rel = url.href.slice(pokerBase.length);
    if (!reached.has(rel)) { reached.add(rel); queue.push(rel); }
  };
  for (const [, spec] of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) follow(spec, "index.html");
  while (queue.length) {
    const rel = queue.shift();
    const served = await get(`poker/${rel}`);
    assert.equal(served.status, 200, `poker/${rel} is served under ${BASE_PATH}`);
    if (!rel.endsWith(".js")) continue;
    const source = served.bytes.toString("utf8");
    for (const [, spec] of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)["']([^"']+)["']/g)) follow(spec, rel);
  }
  return [...reached].sort();
}

async function browserChecks() {
  const profile = await mkdtemp("/tmp/kiro-pages-chrome-");
  const child = spawn(CHROME, ["--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--mute-audio", "--hide-scrollbars", "--window-size=1440,900", "about:blank"], {stdio: ["ignore", "ignore", "pipe"]});
  let stderr = "";
  try {
    const ws = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`no DevTools URL from Chrome in 30 s:\n${stderr}`)), 30000);
      child.stderr.on("data", (chunk) => { stderr += chunk; const m = stderr.match(/DevTools listening on (ws:\/\/\S+)/); if (m) { clearTimeout(timer); resolve(m[1]); } });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Chrome exited with ${code}`)); });
    });
    const cdp = await connect(ws);
    const {targetId} = await cdp.send("Target.createTarget", {url: "about:blank"});
    const {sessionId} = await cdp.send("Target.attachToTarget", {targetId, flatten: true});
    const send = (method, params) => cdp.send(method, params, sessionId);
    const responses = [], requests = [];
    cdp.on(({method, params, sessionId: id}) => {
      if (id !== sessionId) return;
      if (method === "Network.requestWillBeSent") requests.push(params.request.url);
      if (method === "Runtime.exceptionThrown") report.errors.push(params.exceptionDetails.exception?.description ?? params.exceptionDetails.text);
      if (method === "Runtime.consoleAPICalled" && params.type === "error") report.errors.push(params.args.map((a) => a.value ?? a.description).join(" "));
      if (method === "Network.responseReceived") responses.push({url: params.response.url, status: params.response.status, type: params.type});
      if (method === "Network.loadingFailed" && !params.canceled) report.errors.push(`request failed: ${params.errorText} (${params.requestId})`);
    });
    await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
    await send("Emulation.setDeviceMetricsOverride", {width: 1440, height: 900, deviceScaleFactor: 1, mobile: false});
    const evaluate = async (expression) => {
      const r = await send("Runtime.evaluate", {expression, returnByValue: true, awaitPromise: true});
      if (r.exceptionDetails) throw Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const wait = async (expression, ms = 20000) => {
      const stop = Date.now() + ms;
      while (Date.now() < stop) { if (await evaluate(expression)) return; await sleep(100); }
      throw Error(`Timed out: ${expression}`);
    };
    const click = async (selector) => {
      const p = await evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)});if(!n)throw Error('Missing: '+${JSON.stringify(selector)});
        n.scrollIntoView({block:'center'});const b=n.getBoundingClientRect();const x=b.x+b.width/2,y=b.y+b.height/2;
        if(!n.contains(document.elementFromPoint(x,y)))throw Error('Covered: '+${JSON.stringify(selector)});return{x,y};})()`);
      for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", {type, button: "left", clickCount: 1, ...p});
    };
    const open = async (rel) => {
      await send("Page.navigate", {url: site + rel});
      await wait(`document.readyState==='complete'&&location.href===${JSON.stringify(site + rel)}`);
    };
    const press = async (key, keyCode) => {
      for (const type of ["keyDown", "keyUp"]) {
        const text = key === "Enter" && type === "keyDown" ? {text: "\r"} : {};
        await send("Input.dispatchKeyEvent", {type, key, code: key, windowsVirtualKeyCode: keyCode,
          nativeVirtualKeyCode: keyCode, ...text});
      }
    };
    const activateByKey = async (selector) => {
      for (let tabs = 0; tabs < 45; tabs++) {
        if (await evaluate(`document.activeElement?.matches(${JSON.stringify(selector)})`)) {
          await press("Enter", 13);
          return;
        }
        await press("Tab", 9);
      }
      const focus = await evaluate(`document.activeElement?.id || document.activeElement?.tagName`);
      assert.fail(`Tab could not reach ${selector} (last focus: ${focus})`);
    };
    const shown = (id) => `!!document.getElementById('${id}')&&!document.getElementById('${id}').hidden`;
    await send("Accessibility.enable");
    await send("Emulation.setFocusEmulationEnabled", {enabled: true});
    const axTree = async () => (await send("Accessibility.getFullAXTree")).nodes.filter((node) => !node.ignored);
    const axProperty = (node, key) => node.properties?.find((p) => p.name === key)?.value?.value;
    const axNamed = (nodes, role, name, predicate = () => true) => nodes.some((node) =>
      node.role?.value === role && name.test(node.name?.value ?? "") && predicate(node));
    const enabled = (node) => axProperty(node, "disabled") !== true;
    const focused = (node) => enabled(node) && axProperty(node, "focused") === true;
    // Chromium's default favicon probe: a page without <link rel="icon"> (the experimental poker/ page) makes
    // Chrome request the origin-root /favicon.ico. On GitHub Pages that path belongs to the owner's root site,
    // outside BASE_PATH, so it is not a project asset. Only that exact URL with CDP type "Other" is exempt and
    // each exempt probe is kept in the report; every in-project error still fails.
    const faviconProbe = new URL("/favicon.ico", site).href;
    const isFaviconProbe = (r) => r.url === faviconProbe && r.type === "Other";
    const clean = () => {
      report.allowedFaviconProbes = responses.filter((r) => r.status >= 400 && isFaviconProbe(r));
      const bad = responses.filter((r) => r.status >= 400 && !isFaviconProbe(r));
      assert.deepEqual(bad, [], "no HTTP errors");
      assert.deepEqual(report.errors, [], "no page errors or failed requests");
    };

    const playOpensCamp = async () => {
      await click("#menu-play");
      await wait(`${shown("showdown-camp")}&&document.getElementById('title-screen').hidden`);
      const tile = await evaluate(`document.querySelector('#camp-trail button strong')?.textContent??null`);
      assert.equal(tile, "Boot Hill");
    };

    for (const rel of ["", "graybox/"]) {
      await send("Storage.clearDataForOrigin", {origin: new URL(site).origin, storageTypes: "all"});
      await open(rel);
      if (rel === "graybox/") assert.equal(await evaluate(`Boolean(document.getElementById('menu-challenge'))`), false);
      await playOpensCamp();
      clean();
      check(`${BASE_PATH}${rel}: Play on a clean profile opens the Camp (first Trail duel Boot Hill)`);
    }
    await open("showdown/");
    await wait(`document.body&&document.body.innerText.trim().length>0`);
    await sleep(500);
    clean();
    check(`${BASE_PATH}showdown/: the Showdown reference page loads without errors`);

    for (const rel of ["", "3d/"]) {
      await send("Storage.clearDataForOrigin", {origin: new URL(site).origin, storageTypes: "all"});
      await open(rel);
      await playOpensCamp();
      await click('[data-camp-destination="night-shift-saloon"]');
      await wait(`document.getElementById('room-for-night-shift-saloon')?.open`);
      const link = "#room-for-night-shift-saloon .outpost-poker-link";
      assert.equal(await evaluate(`document.querySelector(${JSON.stringify(link)}).href`), `${site}poker/`, `${rel || "/"} links the one poker/ page`);
      const mark = responses.length;
      await click(link);
      await wait(`document.readyState==='complete'&&location.href.startsWith(${JSON.stringify(`${site}poker/`)})`);
      await wait(`!!document.getElementById('screen')&&!document.getElementById('screen').textContent.startsWith('Dialing Boot Hill')`);
      await sleep(500);
      clean();
      const loaded = POKER_FILES.filter((name) => responses.slice(mark).some((r) => r.status === 200 && new URL(r.url).pathname === `${BASE_PATH}poker/${name === "index.html" ? "" : name}`));
      assert.deepEqual(loaded, POKER_FILES, `${rel || "/"} -> poker/ loads all five browser files`);
      check(`${BASE_PATH}${rel}: the Camp saloon opens Boot Hill Poker at ${BASE_PATH}poker/, loads its five files and paints the screen without errors`);
    }

    // ?saloon=review: the staged illustrated root opens the recorded room at the validated Billy decision.
    {
      const room = "#room-for-night-shift-saloon";
      const decision = `document.querySelector('${room} .saloon-decision')`;
      const feedRequests = () => requests.filter((url) => url.includes("/night-shift/events"));
      await send("Storage.clearDataForOrigin", {origin: new URL(site).origin, storageTypes: "all"});
      const mark = requests.length;
      await open("?saloon=review");
      await wait(`document.querySelector('${room}')?.open&&${decision}&&!${decision}.hidden`);
      assert.ok(await evaluate(shown("showdown-camp")), "?saloon=review opens over the Camp");
      assert.equal(await evaluate(`document.querySelector('${room} .saloon-mode-label').textContent`), "Recorded Kiro shift");
      assert.match(await evaluate(`${decision}.querySelector('h5').textContent`), /^Review of Kiro's proposal: Billy\b.* attack 2 → 1$/);
      assert.match(await evaluate(`${decision}.textContent`), /Passed the written balance rule/);
      assert.match(await evaluate(`document.querySelector('${room} .saloon-target-stat').textContent`), /^Billy\b.*: attack 2 → 1/);
      const at = await evaluate(`document.querySelector('${room} .saloon-progress').textContent`);
      assert.match(at, /^· step [1-9]\d* of \d+$/, "the room opens at the review step");
      const saloonAx = await axTree();
      assert.ok(axNamed(saloonAx, "dialog", /^Night Shift saloon$/), "the recorded room has a dialog name");
      for (const label of [/^Play$/, /^Step$/, /^Replay from start$/]) {
        assert.ok(axNamed(saloonAx, "button", label, enabled), `${label} is an enabled playback control`);
      }
      assert.ok(axNamed(saloonAx, "heading", /^Review of Kiro's proposal: Billy attack 2 → 1$/), "the balance review has a heading");
      const noticeText = saloonAx.filter((node) => node.role?.value === "StaticText").map((node) => node.name?.value).join(" ");
      for (const detail of ["59.792%", "51.920%", "100,000", "awaits design approval"]) {
        assert.ok(noticeText.includes(detail), `the review exposes ${detail}`);
      }
      await sleep(3500); // longer than the slowest live poll interval
      // Keyboard: a real Enter on the focused control; keyboard focus must land on Play, not <body>.
      const total = Number(at.match(/ of (\d+)$/)[1]);
      const focusOn = async (name) => {
        await evaluate(`document.querySelector('${room} .saloon-${name}').focus()`);
        assert.ok(await evaluate(`document.activeElement===document.querySelector('${room} .saloon-${name}')`), `${name} holds focus before Enter`);
      };
      const onPlay = `document.activeElement===document.querySelector('${room} .saloon-play')&&!document.activeElement.disabled`;
      await focusOn("replay");
      await press("Enter", 13);
      await wait(`${decision}.hidden&&/^· step 0 of /.test(document.querySelector('${room} .saloon-progress').textContent)`);
      assert.ok(await evaluate(onPlay), "Replay from start by Enter moves focus to the enabled Play button");
      assert.ok(axNamed(await axTree(), "button", /^Play$/, focused), "Chrome exposes Play as focused after restart");
      for (let n = 0; n < total - 1; n++) await click(`${room} .saloon-step`);
      await wait(`document.querySelector('${room} .saloon-progress').textContent==='· step ${total - 1} of ${total}'`);
      await focusOn("step");
      await press("Enter", 13);
      await wait(`document.querySelector('${room} .saloon-progress').textContent==='· step ${total} of ${total}'`);
      assert.equal(await evaluate(`document.querySelector('${room} .saloon-step').disabled`), true, "Step is disabled at the last event");
      assert.ok(await evaluate(onPlay), "Step by Enter at the last event moves focus to the enabled Replay button");
      assert.equal(await evaluate(`document.activeElement.textContent`), "Replay");
      assert.ok(axNamed(await axTree(), "button", /^Replay$/, focused), "Chrome exposes Replay as focused after the last event");
      await click(`${room} header button`);
      await wait(`!document.querySelector('${room}').open&&${shown("showdown-camp")}`);
      assert.deepEqual(feedRequests(), [], "?saloon=review makes no /night-shift/events request");
      assert.ok(requests.length > mark, "the review page made its own requests");
      clean();
      check(`${BASE_PATH}?saloon=review: the recorded saloon opens at the validated Billy proposal (${at.slice(2)}), makes 0 /night-shift/events requests; Enter on Replay from start hides the decision and Enter on Step at the last event keeps focus on Play/Replay; Back to map returns to the Camp`);
    }

    const challengeOpens = async (activate) => {
      await wait(`${shown("showdown")} && document.querySelector('#sd-field[data-battlefield="bone-fence"] canvas.sd-world')?.width > 0`);
      assert.match(await evaluate(`document.getElementById('sd-status').textContent`), /^Ride or Fight\?/);
      const slots = '[data-slot^="cowboy-"]';
      const rider = await evaluate(`[...document.querySelectorAll(${JSON.stringify(slots)})].find(x => x.textContent.includes('Outrider'))?.dataset.slot`);
      assert.ok(rider, "the Outrider is on the board");
      assert.ok(axNamed(await axTree(), "button", /\bOutrider\b/, enabled), "Outrider is an enabled named choice");
      await activate(`[data-slot="${rider}"]`);
      await wait(`document.querySelector('[data-base="wizard"]')?.dataset.enemy === 'base' && !!document.querySelector('[data-slot^="wizard-"][data-enemy]')`);
      clean();
    };
    await open("");
    await wait(`document.getElementById('menu-challenge')?.textContent === 'Ride or Fight?'`);
    assert.ok(axNamed(await axTree(), "button", /^Ride or Fight\?$/, enabled), "the title challenge has a name");
    await activateByKey("#menu-challenge");
    await challengeOpens(activateByKey);
    const aim = await evaluate(`({
      prompt: document.getElementById('sd-prompt')?.textContent.trim() ?? '',
      base: document.querySelector('[data-base="wizard"] [id^="sd-preview-"]')?.textContent.trim() ?? '',
      skeleton: [...document.querySelectorAll('[data-slot^="wizard-"][data-enemy]')].find((b) => b.textContent.includes('Skeleton'))?.querySelector('[id^="sd-preview-"]')?.textContent.trim() ?? ''
    })`);
    assert.equal(aim.base, "Ride past: Hit the Base for 1", "Base shows its Ride past preview");
    assert.ok(aim.skeleton && aim.skeleton !== aim.base, "Skeleton shows its own distinct preview");
    assert.ok(aim.prompt, "aiming prompt is non-empty");
    const targets = await axTree();
    const describes = (preview, other) => (node) => {
      const description = node.description?.value ?? "";
      return enabled(node) && !(node.name?.value ?? "").includes(preview)
        && description.includes(preview) && description.includes(aim.prompt) && !description.includes(other);
    };
    assert.ok(axNamed(targets, "button", /\bBase\b/, describes(aim.base, aim.skeleton)), "the Base description carries its own preview and the aiming prompt");
    assert.ok(axNamed(targets, "button", /\bSkeleton\b/, describes(aim.skeleton, aim.base)), "the Skeleton description carries its own preview and the aiming prompt");
    check("Chrome exposes distinct Base and Skeleton attack previews as accessible descriptions");
    await activateByKey('[data-base="wizard"]');
    await wait(`/Outrider struck the Wizards' Base for 1/.test(document.getElementById('sd-log').textContent)`);
    await activateByKey("#sd-home");
    await wait(shown("showdown-camp"));
    check("Tab and Enter open Ride or Fight?, play the Outrider's Base attack and return to Camp");
    check("Chrome exposes the challenge and targets, recorded Saloon dialog and results, and replay keyboard focus in its accessibility tree");

    await open("");
    await wait(`document.getElementById('menu-challenge')?.textContent === 'Ride or Fight?'`);
    await activateByKey("#menu-challenge");
    await challengeOpens(activateByKey);
    assert.equal(await evaluate(`document.getElementById('sd-boot-hill')?.hidden`), true, "Continue to Boot Hill starts hidden");
    await activateByKey('[data-base="wizard"]');
    await wait(`/Outrider struck the Wizards' Base for 1/.test(document.getElementById('sd-log').textContent) && document.getElementById('sd-boot-hill') && !document.getElementById('sd-boot-hill').hidden`);
    assert.ok(axNamed(await axTree(), "button", /Continue to Boot Hill/, enabled), "Continue to Boot Hill is an enabled named button");
    await activateByKey("#sd-boot-hill");
    await wait(`document.querySelector('#sd-field[data-battlefield="boot-hill"] canvas.sd-world')?.width > 0 && /Boot Hill/.test(document.getElementById('sd-status').textContent) && document.getElementById('sd-boot-hill')?.hidden !== false`);
    assert.equal(await evaluate(`!!document.getElementById('showdown')?.hasAttribute('data-contest-challenge')`), false, "challenge marker no longer applies");
    assert.equal(await evaluate(`!!document.activeElement?.closest('#showdown button:not(:disabled), #showdown [tabindex="0"]:not([aria-disabled="true"])')`), true, "focus is on a usable duel control");
    const bhStatus = await evaluate(`document.getElementById('sd-status').textContent`);
    await activateByKey("#sd-end");
    await wait(`document.getElementById('sd-status').textContent !== ${JSON.stringify(bhStatus)}`);
    clean();
    check("Continue to Boot Hill opens from the finished challenge via keyboard, moves focus to a usable duel control, clears the challenge marker and advances status on End turn");

    await open("3d/?outrider=case-a");
    await challengeOpens(click);
    const enemy = await evaluate(`document.querySelector('[data-slot^="wizard-"][data-enemy]').dataset.slot`);
    await click(`[data-slot="${enemy}"]`);
    await wait(`document.getElementById('sd-log').textContent.includes('Outrider attacked')`);
    check("the /3d/ deep link opens the second case and accepts an attack on a troop");
    cdp.close();
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await Promise.race([exited, sleep(5000)]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await rm(profile, {recursive: true, force: true, maxRetries: 5});
  }
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const waiting = new Map(), listeners = new Set();
    let next = 0;
    ws.addEventListener("message", ({data}) => {
      const message = JSON.parse(data);
      if (message.id === undefined) { for (const listener of listeners) listener(message); return; }
      const entry = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) entry?.reject(new Error(`${entry.method}: ${message.error.message}`));
      else entry?.resolve(message.result);
    });
    ws.addEventListener("error", () => reject(new Error(`WebSocket error on ${url}`)));
    ws.addEventListener("open", () => resolve({
      send(method, params = {}, sessionId) {
        const id = ++next;
        ws.send(JSON.stringify({id, method, params, ...(sessionId ? {sessionId} : {})}));
        return new Promise((ok, fail) => waiting.set(id, {resolve: ok, reject: fail, method}));
      },
      on: (listener) => listeners.add(listener),
      close: () => ws.close(),
    }));
  });
}
