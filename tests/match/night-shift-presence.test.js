import test from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {fileURLToPath} from "node:url";

import {
  PHASES, ACTORS, canonicalPhase, resolvePhase, resolveActor, stableKeyFor, activityFromHook,
} from "../../scripts/saloon-activity.mjs";
import {readActivity, readEvents} from "../../scripts/saloon-journal.mjs";
import {
  ACTIVITY_PHASES, ACTIVITY_ACTORS, cleanActivityFields, activityLabel,
} from "../../src/ui/night-shift-presence.js";

const config = JSON.parse(readFileSync(new URL("../../.kiro/hooks/night-shift-activity.json", import.meta.url), "utf8"));

const EXPECTED = [
  "SessionStart", "SessionEnd", "UserPromptSubmit", "Stop", "PermissionRequest",
  "PreToolUse", "PostToolUse", "PostFileCreate", "PostFileSave", "PostFileDelete",
  "PreTaskExecution", "PostTaskExecution", "PreCompact", "PostCompact",
];

// Native Kiro CLI v1 spellings (/hooks, 3.5.0) for the two task triggers; the journal keeps the long names.
const NATIVE = {PreTaskExecution: "PreTaskExec", PostTaskExecution: "PostTaskExec"};
const CONFIGURED = EXPECTED.map((p) => NATIVE[p] ?? p);

test("hook file: v1 array, one named command per automatic trigger, no manual", () => {
  assert.equal(config.version, "v1");
  assert.ok(Array.isArray(config.hooks));
  assert.equal(config.hooks.length, EXPECTED.length);
  assert.deepEqual(config.hooks.map((h) => h.trigger).sort(), [...CONFIGURED].sort());
  assert.ok(!config.hooks.some((h) => /^(Pre|Post)TaskExecution$/.test(h.trigger)), "long task spellings are unregistered");
  const task = config.hooks.filter((h) => /TaskExec/.test(h.trigger));
  assert.deepEqual(task.map((h) => [h.trigger, h.action.command]), [
    ["PreTaskExec", "node scripts/saloon-activity.mjs PreTaskExec"],
    ["PostTaskExec", "node scripts/saloon-activity.mjs PostTaskExec"],
  ]);
  const names = config.hooks.map((h) => h.name);
  assert.equal(new Set(names).size, names.length);
  for (const hook of config.hooks) {
    assert.match(hook.name, /^night-shift-activity-[a-z-]+$/);
    assert.equal(hook.action.type, "command");
    assert.equal(hook.action.command, `node scripts/saloon-activity.mjs ${hook.trigger}`);
    assert.ok(canonicalPhase(hook.trigger), hook.trigger);
    assert.equal(hook.matcher, undefined);
  }
  assert.ok(!config.hooks.some((h) => /manual/i.test(h.trigger)));
});

test("script and presence allowlists agree", () => {
  assert.deepEqual([...PHASES], EXPECTED);
  assert.deepEqual([...ACTIVITY_PHASES], EXPECTED);
  assert.deepEqual([...ACTORS], ["sheriff", "wizard", "hunter", "singularity"]);
  assert.deepEqual([...ACTIVITY_ACTORS], [...ACTORS]);
});

test("phases: canonical, legacy casing and old names; manual and unknown ignored", () => {
  for (const p of EXPECTED) assert.equal(canonicalPhase(p), p);
  assert.equal(canonicalPhase("postToolUse"), "PostToolUse");
  assert.equal(canonicalPhase("userPromptSubmit"), "UserPromptSubmit");
  assert.equal(canonicalPhase("stop"), "Stop");
  assert.equal(canonicalPhase("agentSpawn"), "SessionStart");
  assert.equal(canonicalPhase("fileEdited"), "PostFileSave");
  // Native short task names normalize onto the long internal names; long names stay readable for old payloads.
  assert.equal(canonicalPhase("PreTaskExec"), "PreTaskExecution");
  assert.equal(canonicalPhase("PostTaskExec"), "PostTaskExecution");
  assert.equal(resolvePhase({hook_event_name: "PostTaskExec"}, "Stop"), "PostTaskExecution");
  assert.equal(resolvePhase({}, "PreTaskExec"), "PreTaskExecution");
  assert.deepEqual(activityFromHook('{"hook_event_name":"PreTaskExec"}', "PreTaskExec").record, {kind: "activity", actor: "hunter", phase: "PreTaskExecution"});
  assert.equal(resolvePhase({hook_event_name: "PostTaskExecution"}, "PostTaskExec"), "PostTaskExecution");
  assert.equal(canonicalPhase("Manual"), null);
  assert.equal(canonicalPhase("userTriggered"), null);
  assert.equal(canonicalPhase("Telepathy"), null);
  assert.equal(canonicalPhase(42), null);
  assert.equal(resolvePhase({hook_event_name: "preToolUse"}, "PostToolUse"), "PreToolUse");
  assert.equal(resolvePhase({}, "PreCompact"), "PreCompact");
  assert.equal(resolvePhase({hook_event_name: "Telepathy"}, "Stop"), null);
});

test("actor: allowlisted role metadata, domain fallback, Singularity otherwise", () => {
  assert.equal(resolveActor({agent_name: "Wizard"}, "Stop"), "wizard");
  assert.equal(resolveActor({agent: {name: "sheriff"}}, "PostToolUse"), "sheriff");
  // A named agent outside the allowlist is never mapped to a role.
  assert.equal(resolveActor({agent_name: "showdown-balancer"}, "PostToolUse"), "singularity");
  assert.equal(resolveActor({}, "PreTaskExecution"), "hunter");
  assert.equal(resolveActor({}, "PostTaskExecution"), "hunter");
  const task = {tool_name: "taskStatus", tool_input: {tasksFilePath: ".kiro/specs/x/tasks.md", taskId: "2.1", status: "completed"}};
  assert.equal(resolveActor(task, "PostToolUse"), "hunter");
  assert.equal(resolveActor({tool_input: {tasksFilePath: "a", status: "done"}}, "PostToolUse"), "singularity");
  assert.equal(resolveActor({file_path: ".kiro/specs/duel-card-pipeline/cards/c.json"}, "PostFileSave"), "wizard");
  assert.equal(resolveActor({}, "PermissionRequest"), "sheriff");
  assert.equal(resolveActor({}, "PreToolUse"), "singularity");
  assert.equal(resolveActor({}, "SessionStart"), "singularity");
  // Profile metadata: string or object forms, still allowlist-only.
  assert.equal(resolveActor({agent_profile: "Hunter"}, "PreToolUse"), "hunter");
  assert.equal(resolveActor({profile: {name: "wizard"}}, "PostToolUse"), "wizard");
  assert.equal(resolveActor({agentProfile: {role: "sheriff"}}, "Stop"), "sheriff");
  assert.equal(resolveActor({agent_profile: "saloon-presence"}, "PreToolUse"), "singularity");
  assert.equal(resolveActor({profile: ["wizard"]}, "PreToolUse"), "singularity");
});

const SECRETS = {
  prompt: "SECRET-PROMPT-words", command: "SECRET-COMMAND-run", file_path: "/SECRET/PATH/file.js",
  session_id: "SECRET-SESSION-1", user_id: "SECRET-USER-1", tool_response: "SECRET-OUTPUT",
  invocation_id: "SECRET-INVOCATION-1",
};

test("stored record is only kind/actor/phase and the key masks raw values", () => {
  const call = activityFromHook(JSON.stringify({hook_event_name: "PostToolUse", tool_name: "execute_bash", tool_input: {command: SECRETS.command}, ...SECRETS}), "PostToolUse");
  assert.deepEqual(call.record, {kind: "activity", actor: "singularity", phase: "PostToolUse"});
  assert.match(call.stableKey, /^activity:[0-9a-f]{24}$/);
  const stored = JSON.stringify(call);
  for (const raw of [...Object.values(SECRETS), "execute_bash"]) assert.ok(!stored.includes(raw), raw);
});

test("stable keys: same invocation repeats, pre/post differ, id-less left to the journal", () => {
  const ev = {tool_use_id: "toolu_abc"};
  assert.equal(stableKeyFor(ev, "PreToolUse"), stableKeyFor(ev, "PreToolUse"));
  assert.notEqual(stableKeyFor(ev, "PreToolUse"), stableKeyFor(ev, "PostToolUse"));
  assert.equal(stableKeyFor({}, "Stop"), undefined);
  assert.equal(stableKeyFor({invocation_id: "bad id with spaces"}, "Stop"), undefined);
  const a = activityFromHook('{"hook_event_name":"Stop"}', "Stop");
  const b = activityFromHook('{"hook_event_name":"Stop"}', "Stop");
  assert.equal(a.stableKey, undefined);
  assert.deepEqual(a.record, b.record);
});

test("malformed or unrecognized input writes nothing", () => {
  assert.equal(activityFromHook("", "Stop"), null);
  assert.equal(activityFromHook("{not json", "Stop"), null);
  assert.equal(activityFromHook("[1,2]", "Stop"), null);
  assert.equal(activityFromHook('{"hook_event_name":"Manual"}', "Stop"), null);
  assert.equal(activityFromHook("{}", "NotATrigger"), null);
});

test("projection keeps only actor and phase", () => {
  assert.deepEqual(
    cleanActivityFields({kind: "activity", actor: "hunter", phase: "PostToolUse", id: "x", at: "t", prompt: SECRETS.prompt}),
    {actor: "hunter", phase: "PostToolUse"},
  );
  assert.deepEqual(cleanActivityFields({actor: "wizard", phase: "PostFileSave"}), {actor: "wizard", phase: "PostFileSave"});
  assert.equal(cleanActivityFields({kind: "bell", actor: "hunter", phase: "Stop"}), null);
  assert.equal(cleanActivityFields({actor: "deputy", phase: "Stop"}), null);
  assert.equal(cleanActivityFields({actor: "hunter", phase: "Manual"}), null);
  assert.equal(cleanActivityFields(null), null);
  assert.equal(cleanActivityFields([]), null);
});

test("labels: short, distinct per phase, observational, no raw values", () => {
  const labels = EXPECTED.map((phase) => activityLabel({actor: "singularity", phase}));
  assert.equal(new Set(labels).size, EXPECTED.length);
  for (const label of labels) {
    assert.ok(label.startsWith("싱귤래리티: "), label);
    assert.ok(label.length <= 48, label);
  }
  assert.equal(activityLabel({actor: "hunter", phase: "PostTaskExecution"}), "현상금 사냥꾼: 작업이 마무리되는 것을 봄");
  assert.equal(activityLabel({actor: "hunter", phase: "Stop", prompt: SECRETS.prompt}), "현상금 사냥꾼: 에이전트가 멈추는 것을 봄");
  assert.equal(activityLabel({actor: "nobody", phase: "Stop"}), null);
});

// Integration: the real hook command and the real journal on a temporary
// root. The script resolves its root from its own location, so the four
// modules it loads are copied into the temp root and run from there.
const REPO = fileURLToPath(new URL("../../", import.meta.url));
const MODULES = [
  "scripts/saloon-activity.mjs", "scripts/saloon-journal.mjs",
  "src/ui/night-shift-events.js", "src/ui/night-shift-presence.js",
];

function stageRoot() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "night-shift-activity-")));
  mkdirSync(join(root, "scripts"));
  mkdirSync(join(root, "src", "ui"), {recursive: true});
  for (const file of MODULES) copyFileSync(join(REPO, file), join(root, file));
  writeFileSync(join(root, "package.json"), '{"type":"module"}\n');
  return root;
}

function runHook(root, trigger, event) {
  return spawnSync(process.execPath, ["scripts/saloon-activity.mjs", trigger], {
    cwd: root, input: JSON.stringify(event), encoding: "utf8", timeout: 10000,
  });
}

function filesUnder(dir) {
  const out = [];
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else out.push(full);
  }
  return out;
}

test("real command writes a native hook event to readActivity only, without raw input", () => {
  const root = stageRoot();
  try {
    const native = {
      hook_event_name: "PreToolUse",
      session_id: SECRETS.session_id,
      cwd: "/SECRET/CWD",
      transcript_path: "/SECRET/TRANSCRIPT.jsonl",
      tool_name: "execute_bash",
      tool_input: {command: SECRETS.command, file_path: SECRETS.file_path},
      tool_use_id: "toolu_SECRET123",
      prompt: SECRETS.prompt,
    };
    const first = runHook(root, "PreToolUse", native);
    assert.equal(first.status, 0);
    assert.equal(first.stdout, "");
    assert.equal(first.stderr, "");
    // Same invocation delivered twice is kept once.
    assert.equal(runHook(root, "PreToolUse", native).status, 0);
    const post = runHook(root, "PostToolUse", {...native, hook_event_name: "PostToolUse", tool_response: SECRETS.tool_response});
    assert.equal(post.status, 0);
    // Id-less Stop with a known profile role; two deliveries are two samples.
    for (let i = 0; i < 2; i++) {
      assert.equal(runHook(root, "Stop", {hook_event_name: "Stop", session_id: SECRETS.session_id, agent_profile: "Hunter"}).status, 0);
    }

    const activity = readActivity(root);
    assert.deepEqual(
      activity.map(({kind, actor, phase}) => ({kind, actor, phase})).sort((a, b) => a.phase.localeCompare(b.phase)),
      [
        {kind: "activity", actor: "singularity", phase: "PostToolUse"},
        {kind: "activity", actor: "singularity", phase: "PreToolUse"},
        {kind: "activity", actor: "hunter", phase: "Stop"},
        {kind: "activity", actor: "hunter", phase: "Stop"},
      ],
    );
    for (const record of activity) assert.deepEqual(Object.keys(record).sort(), ["actor", "at", "id", "kind", "phase"]);

    assert.deepEqual(readEvents(root), []);
    const board = join(root, ".artifacts", "night-shift-saloon");
    assert.ok(!readdirSync(board).includes("events"), "headline board untouched");

    const stored = filesUnder(board);
    assert.equal(stored.length, 4);
    const raw = [...Object.values(SECRETS), "execute_bash", "toolu_SECRET123", "/SECRET/CWD", "/SECRET/TRANSCRIPT.jsonl", "Hunter"];
    for (const file of stored) {
      assert.ok(statSync(file).size < 1024);
      const text = readFileSync(file, "utf8");
      for (const value of raw) assert.ok(!text.includes(value), `${value} leaked into ${file}`);
    }
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});

test("real command stays silent and writes nothing for malformed or unknown input", () => {
  const root = stageRoot();
  try {
    for (const input of ["{not json", JSON.stringify({hook_event_name: "Telepathy"}), ""]) {
      const run = spawnSync(process.execPath, ["scripts/saloon-activity.mjs", "Stop"], {cwd: root, input, encoding: "utf8", timeout: 10000});
      assert.equal(run.status, 0);
      assert.equal(run.stdout, "");
      assert.equal(run.stderr, "");
    }
    assert.deepEqual(readActivity(root), []);
    assert.deepEqual(readEvents(root), []);
  } finally {
    rmSync(root, {recursive: true, force: true});
  }
});
