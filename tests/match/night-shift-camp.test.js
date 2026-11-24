// Pure checks for the Night Shift saloon Camp room. No DOM, network or renderer.
// Feeds go through the real shared bridge (cleanFeed, cleanEvent, cleanPatch, activityLabel).
import test from "node:test";
import assert from "node:assert/strict";
import {cleanEvent, cleanFeed, cleanPatch} from "../../src/ui/night-shift-events.js";
import {activityLabel} from "../../src/ui/night-shift-presence.js";
import {TYPES} from "../../src/game/showdown/cards.js";
import RECORDING from "../../src/ui/night-shift-recording.json" with {type: "json"};
import {
  ACTORS, BLOCK_REASONS, FEED_LIMIT, RECORDED_LABEL, actorFor, ambientText, applyEvent, deed, describe,
  emptyShift, freshAmbient, guardStage, latestActivity, ledgerBlocks, ledgerSectionHtml, mergeFeed, normalizeFeed,
  proposalText, recordedDates, replayTo, reviewState, reviewStep, shiftMode, wantedPoster, patchNote,
} from "../../src/ui/showdown-3d/night-shift-saloon.js";

const at = (minute) => `2026-11-21T03:${String(minute).padStart(2, "0")}:00.000Z`;
const patch = (id, minute, card, field, before, after, commit) => ({id, at: at(minute), kind: "patch", card, field, before, after, commit});
const activity = (id, minute, actor, phase) => ({id, at: at(minute), kind: "activity", actor, phase});
const feed = {
  events: [
    {id: "e3", at: at(3), kind: "cast", card: "cowboy-sheriff", field: "health", before: 3, after: 4},
    {id: "e1", at: at(1), kind: "job"},
    {id: "e2", at: at(2), kind: "block", rule: "tasks"},
    {id: "e2", at: at(2), kind: "block", rule: "tasks"},
    {id: "e4", at: at(4), kind: "wanted", boss: "lantern-wraith"},
    {id: "e5", at: at(5), kind: "block", rule: "balancer"},
    {id: "e6", at: at(6), kind: "bell"},
    patch("p0", 0, "cowboy-sheriff", "attack", 2, 3, "a".repeat(40)),
    {id: "e7", at: at(7), kind: "block", rule: "stop"},
    null,
    {nonsense: true},
  ],
  patches: [
    patch("p1", 0, "cowboy-ranger", "stars", 3, 2, "b".repeat(40)),
    patch("p2", 1, "wizard-imp", "attack", 2, 1, "c".repeat(40)),
    patch("p3", 1, "wizard-imp", "attack", 2, 1, "not-a-commit"),
    {id: "x1", at: at(0), kind: "job"},
  ],
  activity: [
    activity("a1", 1, "singularity", "UserPromptSubmit"),
    activity("a2", 2, "sheriff", "PreToolUse"),
    activity("a3", 4, "wizard", "PostToolUse"),
    activity("a4", 5, "sheriff", "PostToolUse"),
    {id: "a5", at: at(5), kind: "activity", actor: "bartender", phase: "PreToolUse"},
    {id: "a6", at: at(5), kind: "job"},
  ],
};

test("fixture records pass the real bridge, so the saloon is tested on what production keeps", () => {
  assert.equal(cleanEvent(feed.patches[0]), null, "cleanEvent rejects patches by design");
  assert.ok(cleanPatch(feed.patches[0]));
  const bridged = cleanFeed(feed, FEED_LIMIT);
  assert.deepEqual(bridged.activity?.map((a) => a.id), ["a1", "a2", "a3", "a4"],
    "cleanFeed must keep the fixture activity; update the phases if the bridge lists other trigger names");
});

test("four roles cover every shift event kind", () => {
  assert.deepEqual(ACTORS.map((a) => a.role), ["보안관", "마법사", "Bounty Hunter", "특이점"]);
  assert.deepEqual(ACTORS.map((a) => a.card), ["cowboy-sheriff", "wizard-wizard", "cowboy-ranger", "wizard-singularity"]);
  assert.equal(actorFor("block"), "sheriff");
  assert.equal(actorFor("cast"), "wizard");
  assert.equal(actorFor("wanted"), "hunter");
  assert.equal(actorFor("job"), "singularity");
  assert.equal(actorFor("bell"), "singularity");
  assert.equal(actorFor("patch"), null);
  assert.equal(actorFor("activity"), null);
  assert.deepEqual(Object.keys(BLOCK_REASONS), ["balancer", "completion", "tasks"]);
});

test("the production validator keeps real patches and keeps events, patches and activity apart", () => {
  const {events, patches, activity: ambient} = normalizeFeed(feed);
  assert.deepEqual(events.map((e) => e.id), ["e1", "e2", "e3", "e4", "e5", "e6"]);
  assert.deepEqual(patches.map((p) => p.id), ["p1", "p2"], "main patch notes survive; a bad commit does not");
  assert.deepEqual(ambient.map((a) => a.id), ["a1", "a2", "a3", "a4"]);
  const empty = {events: [], patches: [], activity: []};
  assert.deepEqual(normalizeFeed(null), empty);
  assert.deepEqual(normalizeFeed({events: "x", patches: {}, activity: 3}), empty);
});

test("recorded replay keeps last wanted, proposal and refusals, and ignores ambient activity", () => {
  const {events, activity: ambient} = normalizeFeed(feed);
  assert.deepEqual(replayTo(events, 0), emptyShift());
  const end = replayTo(events, events.length);
  assert.equal(end.wanted, "lantern-wraith");
  assert.deepEqual(end.proposal && [end.proposal.card, end.proposal.field, end.proposal.before, end.proposal.after, end.proposal.change],
    ["cowboy-sheriff", "health", 3, 4, "up"]);
  assert.deepEqual(end.sheriffLog.map((e) => e.rule), ["tasks", "balancer"]);
  assert.equal(end.jobs, 1);
  assert.equal(end.bells, 1);
  assert.equal(end.history.length, 6, "activity never adds a replay step");
  const midway = replayTo(events, 3);
  assert.equal(midway.bells, 0, "the bell rings only after a bell event");
  assert.equal(midway.wanted, null);
  for (const record of ambient) assert.equal(applyEvent(end, record), end, "activity cannot ring, cast or refuse");
});

test("ambient notes follow the replay clock and use the shared label", () => {
  const {activity: ambient} = normalizeFeed(feed);
  const at3 = latestActivity(ambient, at(3));
  assert.deepEqual(Object.fromEntries(Object.entries(at3).map(([k, v]) => [k, v?.id ?? null])),
    {sheriff: "a2", wizard: null, hunter: null, singularity: "a1"});
  assert.equal(latestActivity(ambient).sheriff.id, "a4");
  assert.deepEqual(ambient.map(ambientText), [
    "Singularity sees a new request come in",
    "Sheriff sees a tool being reached for",
    "Wizard sees a tool set back down",
    "Sheriff sees a tool set back down",
  ]);
  for (const record of ambient) {
    const label = activityLabel(record);
    assert.equal(typeof label, "string", `${record.phase} is a phase the shared label knows`);
    assert.equal(ambientText(record), label);
  }
  assert.equal(ambientText({kind: "activity", actor: "sheriff", phase: "preToolUse"}), "",
    "a non-canonical phase gets no note");
});

test("applyEvent leaves the earlier state untouched", () => {
  const before = emptyShift();
  const after = applyEvent(before, {id: "j", at: at(1), kind: "job"});
  assert.equal(before.jobs, 0);
  assert.equal(after.jobs, 1);
  assert.equal(applyEvent(before, {id: "z", at: at(1), kind: "patch"}), before);
});

test("live merge reports only unseen events and only new activity, so an identical poll stirs nobody", () => {
  const known = normalizeFeed({events: feed.events.slice(0, 3), activity: feed.activity.slice(0, 2)});
  const incoming = normalizeFeed(feed);
  const merged = mergeFeed(known, incoming);
  assert.deepEqual(merged.added.map((e) => e.id), ["e4", "e5", "e6"]);
  assert.deepEqual(merged.addedActivity.map((a) => a.id), ["a3", "a4"]);
  assert.deepEqual(merged.patches.map((p) => p.id), ["p1", "p2"]);
  assert.equal(merged.events.length, 6);
  const again = mergeFeed(merged, incoming);
  assert.deepEqual(again.added, []);
  assert.deepEqual(again.addedActivity, []);
  const late = normalizeFeed({activity: [activity("a0", 0, "hunter", "PreToolUse")]});
  assert.deepEqual(late.activity.map((a) => a.id), ["a0"], "the late note itself is valid");
  assert.deepEqual(mergeFeed(merged, late).addedActivity, [], "an older unseen note does not retrigger");
});

test("ledger counts every refusal rule in order", () => {
  const {counts, blocks} = ledgerBlocks(normalizeFeed(feed).events);
  assert.deepEqual(counts, {balancer: 1, completion: 0, tasks: 1});
  assert.deepEqual(blocks.map((b) => b.id), ["e2", "e5"]);
});

test("refusals name what each rule refuses; only the bell speaks of a stop passing", () => {
  const refusal = (rule) => describe({kind: "block", rule});
  assert.match(refusal("balancer"), /^Sheriff: Refuses a tool call or file write outside the task's scope$/);
  assert.match(refusal("tasks"), /check off a task that was not verified/);
  assert.match(refusal("completion"), /success report/);
  for (const rule of Object.keys(BLOCK_REASONS)) assert.doesNotMatch(refusal(rule), /stop|block/i);
  assert.doesNotMatch(ledgerSectionHtml(), /block|stop/i);
  assert.match(describe({kind: "bell"}), /stop passed/);
  assert.match(describe({kind: "cast", card: "wizard-imp", field: "attack", before: 2, after: 1}), /scratch, not merged/);
  assert.match(describe(patch("p", 1, "wizard-imp", "attack", 2, 1, "c".repeat(40))), /merged on main in ccccccc/);
  assert.doesNotMatch(deed({kind: "job"}), /Singularity/, "the actor's own line does not repeat its name");
  assert.equal(RECORDED_LABEL, "Recorded Kiro shift");
});

test("Wanted posters map bounty ids to their boss painting and never pass an unknown id to the atlas", () => {
  assert.deepEqual(wantedPoster("lantern-wraith"), {slug: "lantern-wraith", name: "The Lantern Wraith", card: "wizard-lantern-wraith"});
  assert.deepEqual(wantedPoster("graveyard-dragon"), {slug: "graveyard-dragon", name: "The Graveyard Dragon", card: "wizard-dragon"});
  assert.deepEqual(wantedPoster("tin-golem"), {slug: "tin-golem", name: "Tin Golem", card: null});
  assert.equal(wantedPoster("wizard-imp").card, null, "a card id is not a bounty id");
  assert.equal(describe({kind: "wanted", boss: "graveyard-dragon"}), "Bounty Hunter: Posts Wanted: The Graveyard Dragon");
});

test("the checked-in recording survives the production path", () => {
  const raw = cleanFeed(RECORDING, FEED_LIMIT);
  const shift = normalizeFeed(RECORDING);
  assert.ok(shift.events.length > 0, "the recording has shift events to replay");
  assert.equal(shift.events.length, raw.events.length);
  assert.equal(shift.patches.length, raw.patches.length, "no valid patch note is dropped");
  assert.equal(shift.activity.length, Math.min(raw.activity?.length ?? 0, 40));
  for (const event of shift.events.filter((e) => e.kind === "wanted")) {
    const {card, name} = wantedPoster(event.boss);
    assert.ok(card === null || TYPES[card], `${event.boss} maps to a real card or the plain poster`);
    assert.ok(name.length > 0);
  }
});

test("live mode needs ?saloon=live on an http: loopback page", () => {
  const mode = (url) => shiftMode(new URL(url));
  assert.equal(mode("https://example.com/"), "recorded");
  assert.equal(mode("http://127.0.0.1:4179/"), "recorded");
  assert.equal(mode("http://127.0.0.1:4179/?saloon=live"), "live");
  assert.equal(mode("http://localhost:4179/?saloon=live"), "live");
  assert.equal(mode("http://[::1]:4179/?saloon=live"), "live");
  assert.equal(mode("https://localhost/?saloon=live"), "recorded-only");
  assert.equal(mode("http://example.com/?saloon=live"), "recorded-only");
  assert.equal(mode("http://127.0.0.2/?saloon=live"), "recorded-only");
  assert.equal(shiftMode(undefined), "recorded");
  assert.equal(mode("http://127.0.0.1:4179/?saloon=review"), "recorded", "?saloon=review never polls, even on loopback");
  assert.equal(mode("http://localhost:4179/?saloon=live&saloon=review"), "live", "the first saloon value still decides");
});

test("the review state is a normal replay position on a fixture feed, so Step, Play and Replay continue from it", () => {
  const fixture = normalizeFeed(feed);
  const decide = (event) => event.card === "cowboy-sheriff"; // fixture stand-in for the audit check
  assert.equal(reviewStep(fixture.events, decide), 3);
  const review = reviewState(fixture, decide);
  assert.deepEqual(review.shown, replayTo(fixture.events, 3));
  assert.deepEqual(review.ambient, latestActivity(fixture.activity, at(3)));
  assert.equal(review.shown.bells, 0, "nothing after the review step has happened yet");
  assert.deepEqual(fixture.events.slice(review.count).reduce(applyEvent, review.shown), replayTo(fixture.events, fixture.events.length));
  assert.equal(reviewState(fixture, () => null), null, "no decision, no review");
  assert.equal(reviewStep(fixture.events), 0, "a fixture Sheriff proposal never borrows the archived Billy decision");
});

test("the Wizard's proposal states its direction in words, not colour alone", () => {
  const {events} = normalizeFeed(feed);
  assert.match(proposalText(replayTo(events, events.length).proposal), /: health 3 → 4, raised$/);
  assert.match(proposalText({card: "wizard-imp", field: "attack", before: 2, after: 1, change: "down"}), /2 → 1, lowered$/);
  assert.equal(proposalText(null), "No proposal yet");
});

test("only actors whose latest ambient note changed reach the illustrated stage", () => {
  const {activity: ambient} = normalizeFeed(feed);
  const at3 = latestActivity(ambient, at(3));
  const at5 = latestActivity(ambient, at(5));
  assert.deepEqual(freshAmbient(latestActivity([]), at3).map((r) => r.id), ["a2", "a1"]);
  assert.deepEqual(freshAmbient(at3, at5).map((r) => r.id), ["a4", "a3"]);
  assert.deepEqual(freshAmbient(at5, at5), []);
});

test("the recorded label gets the UTC date range of the sanitized events, across a UTC midnight", () => {
  const rollover = normalizeFeed({
    events: [
      {id: "m2", at: "2026-11-22T00:02:00.000Z", kind: "bell"},
      {id: "m1", at: "2026-11-21T23:58:00.000Z", kind: "job"},
      {id: "bad", at: "2026-11-30T25:00:00.000Z", kind: "job"},
      {id: "unknown", at: "2026-11-25T01:00:00.000Z", kind: "stop"},
    ],
    patches: [patch("old", 0, "wizard-imp", "attack", 2, 1, "d".repeat(40))],
    activity: [{id: "late", at: "2026-11-26T00:00:00.000Z", kind: "activity", actor: "sheriff", phase: "PreToolUse"}],
  });
  assert.deepEqual(rollover.events.map((e) => e.id), ["m1", "m2"], "invalid and unknown records are dropped first");
  assert.equal(recordedDates(rollover.events), "2026-11-21 – 2026-11-22 UTC",
    "only shift events set the range; patches and ambient notes do not widen it");
  assert.equal(recordedDates(normalizeFeed(feed).events), "2026-11-21 UTC");
  assert.equal(recordedDates([]), "", "an empty feed gets no date");
  assert.equal(recordedDates(normalizeFeed(null).events), "");
  assert.match(recordedDates(normalizeFeed(RECORDING).events), /^\d{4}-\d{2}-\d{2}( – \d{4}-\d{2}-\d{2})? UTC$/);
});

function fakeStage(overrides = {}) {
  const calls = [];
  const stage = {};
  for (const key of ["open", "close", "play", "activity", "reset"]) stage[key] = (arg) => calls.push([key, arg]);
  return {stage: Object.assign(stage, overrides), calls};
}

test("the illustrated stage is optional: null, a throw or a partial object leave the portrait room", () => {
  const host = {};
  let fails = 0;
  const onFail = () => { fails += 1; };
  assert.equal(guardStage(null, host, onFail), null);
  assert.equal(guardStage(() => null, host, onFail), null, "unsupported WebGL");
  assert.equal(guardStage(() => { throw new Error("no gl"); }, host, onFail), null);
  assert.equal(guardStage(() => ({open() {}, play() {}}), host, onFail), null, "missing methods");
  assert.equal(fails, 0, "creation failures fall back without a drop");
  let received;
  const {stage, calls} = fakeStage();
  const guarded = guardStage((h) => { received = h; return stage; }, host, onFail);
  assert.equal(received, host);
  assert.ok(guarded.call("open"));
  assert.ok(guarded.call("play", {id: "e1", kind: "job"}));
  assert.equal(guarded.call("dispose"), false, "only the five agreed methods are called");
  assert.deepEqual(calls.map(([key]) => key), ["open", "play"]);
});

test("a stage that throws later is closed once, reported once and never called again", () => {
  let fails = 0;
  const {stage, calls} = fakeStage({play() { throw new Error("context lost"); }});
  const guarded = guardStage(() => stage, {}, () => { fails += 1; });
  assert.equal(guarded.call("play", {id: "e1"}), false);
  assert.equal(guarded.failed, true);
  assert.equal(fails, 1);
  assert.deepEqual(calls.map(([key]) => key), ["close"], "the broken stage is asked to stop drawing");
  assert.equal(guarded.call("reset"), false);
  guarded.fail();
  assert.equal(fails, 1);
  assert.deepEqual(calls.map(([key]) => key), ["close"]);
});

test("each merged patch note links its validated main commit and shows its UTC date and time", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const [kept] = normalizeFeed({patches: [{...patch("p9", 0, "wizard-imp", "attack", 2, 1, sha), at: "2026-11-21T23:58:30.000Z"}]}).patches;
  assert.deepEqual(patchNote(kept), {
    change: `${TYPES["wizard-imp"].name} attack 2 → 1`,
    commit: sha,
    label: "main commit 0123456",
    href: `https://github.com/alejandro-publius/cowboys-vs-wizards/commit/${sha}`,
    at: "2026-11-21T23:58:30.000Z",
    when: "2026-11-21 23:58 UTC",
  });
  const bad = (overrides) => patchNote({...kept, ...overrides});
  assert.equal(bad({commit: sha.toUpperCase()}), null, "uppercase SHA gets no link");
  assert.equal(bad({commit: sha.slice(0, 7)}), null, "a short SHA gets no link");
  assert.equal(bad({commit: `${sha}/../../evil`}), null, "nothing but the SHA reaches the URL");
  assert.equal(bad({at: "2026-11-30T25:00:00.000Z"}), null, "an impossible time is never shown");
  assert.equal(bad({at: "2026-02-30T01:00:00Z"}), null);
  assert.equal(normalizeFeed(null).patches.map(patchNote).filter(Boolean).length, 0, "an empty feed keeps the empty-list note");
});
