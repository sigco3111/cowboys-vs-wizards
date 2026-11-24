// K-096: Boot Hill practice opens only for ?practice=0 or ?practice=60, is the fresh-save Boot Hill duel, and
// settles nothing: the screen's no-settle path (kind "turn") is taken, so no campaign or playtest write happens.
import assert from "node:assert/strict";
import test from "node:test";
import {duelFor, newSave, settle} from "../../src/game/showdown/progress.js";
import {createShowdownSession, bootHill} from "../../src/match/showdown-session.js";
import {PRACTICE_SEEDS, practiceDuel, practiceFromQuery, practiceSeed} from "../../src/match/showdown-practice.js";
import {createCampaign} from "../../src/match/showdown-campaign.js";
import {createProfileStore} from "../../src/profile/player-profile.js";
import {BOSSES} from "../../src/game/bounty-hunt.js";
import {INHERITED_KEY} from "../../src/game/showdown/inherited.js";
import {SAVE_KEY} from "../../src/game/showdown/campaign-store.js";

test("only the exact strings 0 and 60 open practice", () => {
  assert.deepEqual(PRACTICE_SEEDS, [0, 60]);
  assert.equal(practiceSeed("0"), 0);
  assert.equal(practiceSeed("60"), 60);
  for (const raw of [null, undefined, 0, 60, "", "1", "00", "060", "60.0", " 0", "0 ", "-0", "+0", "0x0", "1e1", "abc", "__proto__", "61", "59"]) {
    assert.equal(practiceSeed(raw), null, String(raw));
  }
  assert.equal(practiceFromQuery("?practice=0"), 0);
  assert.equal(practiceFromQuery("?seed=5&practice=60"), 60);
  for (const q of ["", "?practice", "?practice=", "?practice=0&practice=0", "?practice=0&practice=60", "?practice=%200", "?seed=0", "?practice=1"]) {
    assert.equal(practiceFromQuery(q), null, q);
  }
  for (const seed of [1, -1, "0", NaN, null]) assert.equal(practiceDuel(seed), null, String(seed));
});

test("practice is the reference Boot Hill duel with the starter deck, whatever the career holds", () => {
  const reference = bootHill();
  for (const seed of PRACTICE_SEEDS) {
    const {duel, seed: dealt} = practiceDuel(seed);
    assert.equal(dealt, seed);
    assert.equal(duel.kind, "turn", "takes the screen's no-settle path");
    assert.equal(duel.id, `practice:${seed}`);
    assert.equal(duel.prefix, undefined);
    assert.deepEqual(duel.options, reference.options);
    assert.equal(duel.level, reference.level);
    assert.ok(duel.lesson.endsWith(reference.lesson), "Boot Hill's guide text is unchanged");
    assert.match(duel.lesson, /아무것도 저장되지 않습니다/);
  }
  // An advanced career's Trail duel differs; practice does not read it.
  let save = newSave();
  for (let i = 0; i < 3; i++) save = settle(save, "trail", true).save;
  assert.notDeepEqual(duelFor({...save, offer: null}, "trail").options, practiceDuel(0).duel.options);
});

test("the same seed deals the same opening every time; 0 and 60 differ", () => {
  const view = (seed) => { const p = practiceDuel(seed); return createShowdownSession({seed: p.seed, duel: p.duel}).view(); };
  assert.deepEqual(view(0), view(0));
  assert.deepEqual(view(60), view(60));
  assert.notDeepEqual(view(0).sides.cowboy.hand, view(60).sides.cowboy.hand);
  // Same deal as Camp's Boot Hill on that seed: only the duel's name and id differ.
  const camp = createShowdownSession({seed: 0, duel: bootHill()}).view();
  assert.deepEqual(view(0), camp);
});

// Coordinator's compatibility edge (legacy-check): a direct ?practice boot must not import lane keepsakes, or
// write any key, before the player chooses the real Camp. createCampaign(storage, {deferImport: true}) holds the
// import and the career load until enter(); the default constructor is unchanged.

const memory = (entries = {}) => {
  const map = new Map(Object.entries(entries));
  return {getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), map};
};
// An unimported lane profile that cleared all of the first boss's hunts (an earned keepsake), made by the lane store.
const laneProfile = () => {
  const store = memory();
  const profile = createProfileStore(store);
  for (const hunt of BOSSES[0].hunts) profile.recordBounty(hunt, {clean: false});
  return store.getItem("cvw-player-v1");
};
const snapshot = (s) => JSON.stringify([...s.map].sort());

test("a deferred campaign writes nothing until enter(); enter() imports the keepsake once", () => {
  const lane = laneProfile();
  assert.ok(lane);
  const storage = memory({"cvw-player-v1": lane});
  const before = snapshot(storage);
  const campaign = createCampaign(storage, {deferImport: true});
  campaign.progress(); campaign.saved();
  assert.equal(snapshot(storage), before, "no key written before the Camp");
  campaign.enter();
  const record = storage.getItem(INHERITED_KEY);
  assert.ok(record && JSON.parse(record).cards.length > 0, "keepsake imported on first Camp entry");
  assert.ok(campaign.holdings().some((row) => row.inherited));
  campaign.enter();
  assert.equal(storage.getItem(INHERITED_KEY), record, "a second entry imports nothing more");
  assert.equal(storage.getItem("cvw-player-v1"), lane, "lane profile untouched");
  // The default constructor still imports at once, as the normal boot does.
  const normal = memory({"cvw-player-v1": lane});
  createCampaign(normal);
  assert.equal(normal.getItem(INHERITED_KEY), record);
});

test("enter() loads the career stored at that moment, so a deferred boot never writes back a stale snapshot", () => {
  const storage = memory();
  const campaign = createCampaign(storage, {deferImport: true});
  // Another tab wins Boot Hill while this one is practising.
  const other = createCampaign(storage);
  other.settle(other.trailDuel(), true);
  const saved = storage.getItem(SAVE_KEY);
  campaign.enter();
  assert.equal(campaign.progress().wins, 1);
  assert.equal(storage.getItem(SAVE_KEY), saved);
});

test("a deferred campaign on blocked storage plays on in memory", () => {
  const blocked = {getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }};
  const campaign = createCampaign(blocked, {deferImport: true});
  campaign.enter();
  assert.equal(campaign.progress().wins, 0);
  campaign.settle(campaign.trailDuel(), true);
  assert.equal(campaign.saved(), false);
  assert.equal(campaign.progress().wins, 1);
  createCampaign(null, {deferImport: true}).enter();
});

// Coordinator's tab-history finding: a direct practice boot created the playtest log at page load, so a line another
// tab saved meanwhile was missing from the first Camp report, and the next append overwrote it. The log now reads
// storage on first use.
import {createPlaytestLog, PLAYTEST_KEY} from "../../src/match/showdown-playtest.js";

test("the playtest log reads storage on first use: a line saved after creation is shown and kept by the next append", () => {
  const storage = memory();
  const log = createPlaytestLog(storage, {build: null}); // created at page load, during practice
  const prior = [{name: "Raven Roost", won: true, turns: 11, seconds: 34, rules: false}];
  storage.setItem(PLAYTEST_KEY, JSON.stringify(prior)); // the other tab finishes a duel
  assert.deepEqual(log.entries(), prior);
  assert.match(log.text(newSave()), /Raven Roost/);
  assert.equal(log.add({name: "Boot Hill", won: false, turns: 9, seconds: 40, rules: false, run: "r1"}), true);
  const stored = JSON.parse(storage.getItem(PLAYTEST_KEY));
  assert.deepEqual(stored.map((line) => line.name), ["Raven Roost", "Boot Hill"]);
  // Blocked storage keeps the log in memory.
  const blocked = {getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); }};
  const offline = createPlaytestLog(blocked, {build: null});
  offline.add({name: "Boot Hill", won: true, turns: 9, seconds: 40, rules: false, run: "r2"});
  assert.equal(offline.saved(), false);
  assert.deepEqual(offline.entries().map((line) => line.name), ["Boot Hill"]);
});
