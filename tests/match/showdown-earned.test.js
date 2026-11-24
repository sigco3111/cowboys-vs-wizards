// Earned decks (src/match/showdown-earned.js, Fable's ruling in ../ruling.md): shown only after the first Wizard preview
// win; the Cowboy seat plays the Camp deck (the starter deck for an empty save), the Wizard seat the preview's derived
// deck; the Wizards open; everything else is twoPlayers(); the inputs are copied and no storage is written.
import assert from "node:assert/strict";
import test from "node:test";
import {typeOf} from "../../src/game/showdown/cards.js";
import {createShowdown} from "../../src/game/showdown/rules.js";
import {newSave, settle} from "../../src/game/showdown/progress.js";
import {createShowdownSession, twoPlayers} from "../../src/match/showdown-session.js";
import {WIZARD_PREVIEW_KEY, createWizardPreview, wizardDeckAfter} from "../../src/match/showdown-wizard-campaign.js";
import {EARNED_NAME, earnedControl, earnedDuel} from "../../src/match/showdown-earned.js";

// A storage holding only the preview key, that throws on any write.
const readOnly = (entries) => ({getItem: (k) => entries[k] ?? null, setItem: () => { throw Error("write"); }, removeItem: () => { throw Error("write"); }});
const previewAt = (wins) => createWizardPreview(readOnly({[WIZARD_PREVIEW_KEY]: JSON.stringify({v: 1, wins, losses: 0})})).progress();
const counts = (ids) => ids.reduce((all, id) => ({...all, [typeOf(id)]: (all[typeOf(id)] ?? 0) + 1}), {});
const bootHillWon = settle(newSave(), "trail", true).save; // the card offer still open

test("hidden, with no teaser, until the first Wizard preview win; then one button", () => {
  assert.equal(earnedDuel(bootHillWon, createWizardPreview(null).progress()), null, "a fresh preview");
  assert.equal(earnedDuel(bootHillWon, previewAt(0)), null);
  assert.equal(earnedControl(null), "");
  for (const wins of [1, 2, 3, 4]) assert.ok(earnedDuel(bootHillWon, previewAt(wins)), `after ${wins} wins`);
  assert.equal(earnedControl(earnedDuel(newSave(), previewAt(1))),
    `<button type="button" id="camp-earned" data-earned="1">2인, 얻은 덱: 동등한 대결 아님</button>`);
});

test("an empty Cowboy save supplies the starter deck; the Wizard deck is the preview's, read without a write", () => {
  for (const wins of [1, 2, 3, 4]) {
    const duel = earnedDuel(newSave(), previewAt(wins));
    assert.deepEqual(duel.options.decks, {cowboy: newSave().deck, wizard: wizardDeckAfter(wins)}, `after ${wins} preview wins`);
  }
  assert.deepEqual(earnedDuel(bootHillWon, previewAt(1)).options.decks.cowboy, bootHillWon.deck, "the saved Camp deck");
});

test("a deck that is not whole, or of the wrong side, gives no duel", () => {
  const wizard = previewAt(1);
  const short = {...bootHillWon, deck: {...bootHillWon.deck, "cowboy-sheriff": bootHillWon.deck["cowboy-sheriff"] - 1}};
  assert.equal(earnedDuel(short, wizard), null);
  assert.equal(earnedDuel({deck: wizard.deck}, wizard), null);
  assert.equal(earnedDuel(bootHillWon, {...wizard, deck: {...wizard.deck, "wizard-skeleton": 7.5}}), null);
  assert.equal(earnedDuel(null, wizard), null);
});

test("the duel is twoPlayers() with the earned decks, copied, and the Wizards opening", () => {
  const wizard = previewAt(1);
  const duel = earnedDuel(bootHillWon, wizard);
  const two = twoPlayers();
  assert.equal(duel.name, EARNED_NAME);
  assert.match(duel.name, /동등한 대결 아님/);
  assert.match(duel.lesson, /동등한 대결이 아닙니다\. 아무것도 저장되지 않습니다\./);
  assert.deepEqual({...duel.options, decks: two.options.decks, first: undefined}, {...two.options, first: undefined}, "only decks and first differ");
  assert.equal(duel.options.first, "wizard");
  assert.equal(duel.level, two.level);
  wizard.deck["wizard-skeleton"] = 0;
  assert.notEqual(duel.options.decks.wizard["wizard-skeleton"], 0, "a later change to the input is not seen");
});

test("each seat is dealt from its own earned deck, exactly as the engine deals that seed, Wizards first", () => {
  const duel = earnedDuel(bootHillWon, previewAt(2));
  for (const seed of [0, 1, 7, 60, 299]) {
    const session = createShowdownSession({seed, duel, players: 2});
    const engine = createShowdown(seed, duel.options);
    assert.equal(session.seat, null, "no seat is the player's: no settle, no playtest line");
    assert.equal(session.view().active, "wizard");
    assert.deepEqual(session.view().sides.wizard.hand, engine.sides.wizard.hand);
    assert.deepEqual(counts([...engine.sides.cowboy.hand, ...engine.sides.cowboy.deck]), bootHillWon.deck, `seed ${seed} Cowboy cards`);
    assert.deepEqual(counts([...engine.sides.wizard.hand, ...engine.sides.wizard.deck]), wizardDeckAfter(2), `seed ${seed} Wizard cards`);
    session.act({type: "end"});
    assert.equal(session.view().active, "cowboy");
    assert.deepEqual(session.view().sides.cowboy.hand.slice(0, engine.sides.cowboy.hand.length), engine.sides.cowboy.hand);
  }
});
