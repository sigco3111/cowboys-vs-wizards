// Graybox page entry (issue 143). The graybox game is Showdown only: Play opens the Camp, which
// starts the Trail and, after it, the rivals, Wanted hunts, packs, deck builder, best of three and
// Open range, plus two players at any time. The Wizard preview (four Wizard-seat duels with their own save) is the
// Camp's last section after Boot Hill and opens on its own at ?wizard=1. Slice 3 retired the lane duel from this
// page, so no URL opens it here; an old lane address (?mode=lanes, match, ride-out, practice-*,
// fire-arc) loads this same Showdown menu. The illustrated contest build offers a verified Outrider turn on its title.
// esbuild inlines the dynamic imports, so the page stays one offline file.
import {parseDealSeed} from "./game/showdown/seed.js";
import {SAVE_KEY} from "./game/showdown/campaign-store.js";

const node = (id) => document.getElementById(id);

Promise.all([import("./ui/showdown-screen.js"), import("./ui/showdown-camp.js"), import("./ui/showdown-builder.js"), import("./match/showdown-campaign.js"),
  import("./match/showdown-playtest.js"), import("./match/showdown-session.js"), import("./match/showdown-turn.js"),
  import("./match/showdown-outrider.js"), import("./ui/outrider-camp.js"), import("./match/showdown-practice.js"),
  import("./match/showdown-wizard-campaign.js"), import("./ui/showdown-wizard-camp.js"), import("./match/showdown-earned.js"),
  typeof __CVW_DIORAMA__ !== "undefined" && __CVW_DIORAMA__ ? import("./ui/showdown-3d/scene.js") : null,
  import("./ui/wizard-lesson.js")])
  .then(([{mountShowdown, freshSeed}, {mountCamp}, {mountBuilder}, {CampaignChanged, createCampaign}, {createPlaytestLog, PAGE_BUILD}, {twoPlayers}, {turnDuel},
    {outriderTurn}, {VERIFIED, outriderControls}, {PRACTICE_SEEDS, practiceDuel, practiceFromQuery},
    {createWizardPreview, wizardFromQuery, previewUnlocked, WIZARD_TRACK}, {mountWizardCamp}, {earnedControl, earnedDuel}, diorama,
    {mountWizardLesson, createLessonSession, lessonDuel}]) => {
  const title = node("title-screen"), screen = node("showdown"), campRoot = node("showdown-camp"), builderRoot = node("showdown-builder"), play = node("menu-play");
  // The Wizard lesson page (src/ui/wizard-lesson.js), a sibling of the duel screen.
  const lessonRoot = document.createElement("section");
  lessonRoot.id = "wizard-lesson";
  lessonRoot.className = "wizard-lesson";
  lessonRoot.setAttribute("aria-labelledby", "wl-title");
  lessonRoot.hidden = true;
  screen.after(lessonRoot);
  const contest = typeof __CVW_CONTEST__ !== "undefined" && __CVW_CONTEST__;
  const query = new URLSearchParams(location.search);
  const seed = parseDealSeed(query.get("seed"));
  // A valid link fixes every deal. An absent or unusable seed gets a fresh deal each time.
  const seedFor = () => seed ?? freshSeed();
  // The browser's storage is read through the canonical store; a blocked storage leaves progress in memory only.
  let storage = null;
  try { storage = window.localStorage; } catch { /* storage is blocked */ }
  // Precedence of the opening queries: ?turn, then ?outrider, then ?practice, then ?wizard=1 (Fable: last). Any of the
  // first three in the query, valid or not, keeps its existing behaviour and the Wizard preview does not open.
  const [turn, outrider] = [query.get("turn"), query.get("outrider")];
  const practice = turn === null && outrider === null ? practiceFromQuery(location.search) : null;
  const wizard = !["turn", "outrider", "practice"].some((key) => query.has(key)) && wizardFromQuery(location.search);
  // K-096: a direct practice or Wizard preview visit writes no Cowboy key until the player chooses the Camp
  // (campaign.enter() in toCamp).
  const campaign = createCampaign(storage, {deferImport: practice !== null || wizard});
  // The Wizard preview's own save (cvw-showdown-wizard-preview-v1); creating it only reads that key.
  const preview = createWizardPreview(storage);
  // One line per finished solo game for the Camp's playtest report, under the prototype's key.
  const playtest = createPlaytestLog(storage);
  let outpost;
  const showOnly = (shown) => {
    if (shown !== campRoot) outpost?.close();
    if (shown !== screen) delete screen.dataset.contestChallenge;
    for (const el of [title, screen, campRoot, builderRoot, lessonRoot]) el.hidden = el !== shown;
    window.scrollTo(0, 0);
  };
  let last = null; // the Camp control that started the duel just left, so focus returns to it
  // Back from a duel: the Camp, or for a Wizard preview duel the place it was opened from. Reset after each use.
  let back = null;
  const home = () => { const go = back ?? toCamp; back = null; go(); };
  // The direct Wizard preview hides the Cowboy parts of the Camp page; these are the ones it hid.
  let hiddenForWizard = [];
  const showCowboyParts = () => { for (const el of hiddenForWizard) el.hidden = false; hiddenForWizard = []; };
  const toCamp = (message = "") => {
    showCowboyParts();
    outpost?.wizardInCamp();
    campRoot.removeAttribute("aria-labelledby"); // the landmark is "Camp" again (its aria-label)
    showOnly(campRoot);
    campaign.enter();
    camp.show(message);
    wizardCamp.show("camp", {unlocked: previewUnlocked(campaign.progress())});
    showEarned();
    if (message) { node("camp-changed").focus(); return; }
    // When that control is now disabled (a win's card offer is open), the Camp's own order: the claim
    // (offer or pack), then the first open duel. Selectors are tried in turn, not in document order.
    const usable = (selector) => campRoot.querySelector(`${selector}:not(:disabled)`);
    const returning = last && usable(last);
    if (returning && outpost?.restoreFocus(returning)) return;
    (returning || usable("#camp-claim button") || (outpost && usable("#camp-start-trail:not([hidden])")) ||
      (outpost ? usable("#camp-build") : usable("[data-duel]")) || usable("button"))?.focus();
  };
  // The direct Wizard preview: the Camp page with only the preview section shown. Nothing Cowboy is entered or written.
  const toWizard = () => {
    outpost?.wizardOnItsOwn();
    showOnly(campRoot);
    hiddenForWizard = [...hiddenForWizard, ...[...campRoot.children].filter((el) => el.id !== "camp-wizard" && !el.hidden)];
    for (const el of hiddenForWizard) el.hidden = true;
    // One name for the direct page: the landmark takes its label from the visible "Wizard preview" heading.
    campRoot.setAttribute("aria-labelledby", "wizard-direct-title");
    wizardCamp.show("direct");
    wizardCamp.focus(null); // the open tile; Back from a duel then moves focus to the tile that started it
  };
  // Commit one Cowboy save at a time across tabs. Offline pages without Web Locks still compare
  // their saved snapshot before writing. Confirmation dialogs and gameplay stay outside the lock.
  let locks;
  try { locks = storage && navigator.locks; } catch { /* storage or locks can be restricted */ }
  function showChangedCamp(message) {
    last = back = null;
    outpost?.close();
    toCamp(`${message} 이번 행동은 건너뛰었습니다.`);
  }
  function writeCamp(change, onChanged = showChangedCamp) {
    const apply = () => {
      try { return change(); } catch (error) {
        if (!(error instanceof CampaignChanged)) throw error;
        return onChanged(error.message);
      }
    };
    if (!locks) return apply();
    let acquired = false;
    return locks.request(SAVE_KEY, () => { acquired = true; return apply(); }).catch((error) => {
      if (acquired || error.name !== "SecurityError") throw error;
      locks = null;
      return apply();
    });
  }
  const builder = mountBuilder(builderRoot, {campaign, writeCamp, paintCardFaces: diorama?.paintCardFaces});
  // Wizard lesson: review a finished duel or an episode file, rematch the identical deal. The rematch settles nothing
  // (kind "lesson"); its Wizard uses a lesson only when the player opted in (policy null otherwise).
  const showLesson = () => showOnly(lessonRoot);
  const lessonPage = mountWizardLesson(lessonRoot, {storage,
    onRematch: ({episode, policy}) => {
      showOnly(screen);
      showdown.start(lessonDuel(episode, Boolean(policy)), episode.seed, {lesson: {createSession: () => createLessonSession({episode, policy})}});
    },
    onClose: () => home()});
  const startCampDuel = (id, {players = 1, best = 1} = {}) => {
    const duel = players === 2 ? twoPlayers() : id === "trail" ? campaign.trailDuel() : campaign.duel(id);
    if (!duel) return false;
    delete screen.dataset.contestChallenge;
    last = players === 2 ? `[data-two="${best}"]` : best > 1 ? `[data-match="${id}"]` : `[data-duel="${id}"]`;
    showOnly(screen);
    showdown.start(duel, seedFor(), {players, best});
    return true;
  };
  const showdown = mountShowdown(screen, {onHome: home, campaign, writeCamp, playtest, nextSeed: seedFor, mountBoard: diorama?.mountDiorama,
    onBootHill: () => campaign?.trailDuel?.()?.battlefield === "boot-hill" ? startCampDuel("trail") : false,
    onReview: (record) => { showLesson(); lessonPage.openFromDuel(record); },
    onLessonBack: () => { showLesson(); lessonPage.reopen(); },
    // Between the games of a best of three with a side deck: the swap, then the next game.
    onSwap: (pool, deck, side, done) => {
      showOnly(builderRoot);
      builder.openSwap({pool, deck, side, done: (nextDeck, nextSide) => { showOnly(screen); done(nextDeck, nextSide); }});
    }});
  const camp = mountCamp(campRoot, {campaign, writeCamp, playtest, paintCardFaces: diorama?.paintCardFaces,
    openDestination: (id, control) => outpost?.open(id, control),
    dressNotices: (trailComplete) => outpost?.dressNotices(trailComplete),
    onHome: () => { showOnly(title); play.focus(); },
    onBuild: () => {
      showOnly(builderRoot);
      last = "#camp-build";
      builder.openDeck({done: toCamp, cancel: toCamp});
    },
    onDuel: startCampDuel});
  diorama?.mountGallery(title, screen);
  // Play from the title is a fresh entry: forget the control of the last duel so toCamp opens on the Trail instead of
  // restoring that duel's room. Only a return from a duel (home, Back to camp) keeps `last`.
  play.addEventListener("click", () => { last = null; outpost?.close(); toCamp(); });
  // Experiment for review (K-095, K-008): two recorded Dragon turns, opened from these optional Camp controls or
  // ?turn=dragon-c5 and ?turn=dragon-c5-70. Only ids allowlisted in showdown-turn.js open; it saves nothing.
  const TURN_CONTROLS = {"dragon-c5": "camp-turn-dragon", "dragon-c5-70": "camp-turn-dragon-70"};
  campRoot.insertAdjacentHTML("beforeend", `<section id="camp-experiment" aria-labelledby="camp-experiment-title"><h2 id="camp-experiment-title">실험</h2>
    <p class="sd-note">검토용이며 현상금이 아닙니다. 여기서는 아무것도 저장되지 않습니다.</p>
    <div class="sd-row"><button type="button" id="camp-turn-dragon" data-turn="dragon-c5">용 턴 한 번 해보기</button>
    <button type="button" id="camp-turn-dragon-70" data-turn="dragon-c5-70">다른 용 턴 해보기</button></div></section>`);
  const openTurn = (id) => {
    const turn = turnDuel(id);
    if (!turn) return false;
    last = `#${TURN_CONTROLS[id]}`;
    showOnly(screen);
    showdown.start(turn.duel, turn.seed);
    return true;
  };
  campRoot.addEventListener("click", (event) => { const b = event.target.closest("button[data-turn]"); if (b) openTurn(b.dataset.turn); });
  // Wizard lesson saved in this browser: reopened from this control or ?lesson=saved. A stale save is cleared there.
  node("camp-experiment").insertAdjacentHTML("beforeend", `<div class="sd-row"><button type="button" id="camp-wizard-lesson">저장된 마법사 강의 열기</button></div>
    <p class="sd-note">이 섹션의 다른 항목과 달리, 마법사 강의는 표시된 에피소드 하나를 이 브라우저에 보관합니다.</p>`);
  const openSavedLesson = (from = null) => {
    last = from ? "#camp-wizard-lesson" : null;
    showLesson();
    lessonPage.openSaved();
  };
  node("camp-wizard-lesson").addEventListener("click", (event) => openSavedLesson(event.currentTarget));
  // K-011: Outrider turns, only the ids scripts/outrider-gate.mjs verified at build time: one Camp control, the Ledger's
  // two position links (both inside the Camp root) and ?outrider=<id>.
  node("camp-experiment").insertAdjacentHTML("beforeend", outriderControls());
  const openOutrider = (id, from = null) => {
    const turn = outriderTurn(id, VERIFIED);
    if (!turn) return false;
    // Focus returns to the control that opened it: the Camp entry or the Ledger link.
    last = from?.closest("#ledger-outrider") ? `#ledger-outrider [data-outrider="${id}"]` : "#camp-outrider-turn";
    showOnly(screen);
    if (contest) screen.dataset.contestChallenge = "";
    const duel = contest ? {...turn.duel, name: "갈 것인가, 싸울 것인가?", lesson: "아웃라이더를 고르세요. 부대를 공격하거나, 부대를 지나쳐 마법사 기지로 달려가세요."} : turn.duel;
    showdown.start(duel, turn.seed);
    return true;
  };
  campRoot.addEventListener("click", (event) => { const b = event.target.closest("button[data-outrider]"); if (b) openOutrider(b.dataset.outrider, b); });
  if (contest && VERIFIED.some((entry) => entry.id === "case-e")) {
    const challenge = document.createElement("button");
    challenge.id = "menu-challenge";
    challenge.type = "button";
    challenge.className = "frontier-plaque";
    challenge.textContent = "갈 것인가, 싸울 것인가?";
    challenge.addEventListener("click", () => openOutrider("case-e"));
    play.before(challenge);
    play.textContent = "캠프";
    play.classList.add("menu-camp");
  }
  // K-096: Boot Hill practice, collapsed at the end of the Camp. Each deal is a native link (?practice=<seed>) that can
  // be copied or opened in a new tab; a plain click or Enter opens the same duel here through openPractice.
  // Only the seeds in showdown-practice.js open; nothing is saved (see that file).
  campRoot.insertAdjacentHTML("beforeend", `<details id="camp-practice"${PAGE_BUILD ? ` data-build="${PAGE_BUILD}"` : ""}><summary>부트 힐 연습</summary>
    <p class="sd-note">스타터 덱으로 치르는 첫 트레일 대결입니다. 여기서는 아무것도 저장되지 않습니다. 링크마다 정해진 패 하나가 열립니다.</p>
    <div class="sd-row">${PRACTICE_SEEDS.map((s) => `<a id="camp-practice-${s}" data-practice="${s}" href="?practice=${s}">패 ${s}</a>`).join(" ")}</div></details>`);
  const openPractice = (seed) => {
    const practice = practiceDuel(seed);
    if (!practice) return false;
    node("camp-practice").open = true; // so Back to camp can return focus to the link
    last = `#camp-practice-${seed}`;
    showOnly(screen);
    showdown.start(practice.duel, practice.seed);
    return true;
  };
  campRoot.addEventListener("click", (event) => {
    const a = event.target.closest("a[data-practice]");
    if (!a || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openPractice(Number(a.dataset.practice));
  });
  // Wizard preview (Fable's ruling): the last section of the Camp, shown once Boot Hill is won, and ?wizard=1 on its own.
  // Its duels play the Wizard seat and settle only through the preview, so no Cowboy key or playtest line is written.
  campRoot.insertAdjacentHTML("beforeend", `<details id="camp-wizard" hidden></details>`);
  const openWizard = (id) => {
    const duel = preview.duel(id);
    if (!duel) return;
    const direct = campRoot.querySelector("#camp-wizard").dataset.mode === "direct";
    back = () => {
      if (direct) toWizard();
      else { last = outpost ? "#camp-wizard summary" : null; toCamp(); }
      wizardCamp.focus(id);
    };
    showOnly(screen);
    showdown.start(duel, seedFor(), {seat: duel.seat, campaign: preview});
  };
  const wizardCamp = mountWizardCamp(node("camp-wizard"), {preview, track: WIZARD_TRACK, onDuel: openWizard, onCowboyCamp: toCamp});
  // Earned decks (showdown-earned.js, Fable's ruling): one two-player game, the Camp's Cowboy deck against the Wizard
  // preview deck, after the Camp's two-player buttons once the preview has a win. Read-only: the two-player screen
  // settles nothing and logs nothing. Refreshed on each Camp entry and after any Camp click (Start preview over).
  node("camp-open").insertAdjacentHTML("afterend", `<div id="camp-earned-row" class="sd-row" hidden></div>`);
  const showEarned = () => {
    const html = earnedControl(earnedDuel(campaign.progress(), preview.progress()));
    const row = node("camp-earned-row");
    if (row.innerHTML !== html) row.innerHTML = html;
    row.hidden = !html;
  };
  campRoot.addEventListener("click", (event) => {
    if (!event.target.closest("button[data-earned]")) return showEarned();
    const duel = earnedDuel(campaign.progress(), preview.progress());
    if (!duel) return showEarned();
    last = "#camp-earned";
    showOnly(screen);
    showdown.start(duel, seedFor(), {players: 2});
  });
  outpost = diorama?.mountCampOutpost(campRoot);
  if (turn !== null) openTurn(turn);
  if (outrider !== null && turn === null) openOutrider(outrider);
  if (practice !== null) openPractice(practice);
  if (wizard) toWizard();
  if (query.get("lesson") === "saved" && !["turn", "outrider", "practice", "wizard"].some((key) => query.has(key))) openSavedLesson();
  // ?saloon=review (illustrated build only, after every query above): the Camp, then the Night Shift saloon through its
  // normal entry, showing the recorded room at the archived Billy decision. Recorded mode only; Back to map leads to the Camp.
  if (outpost && query.get("saloon") === "review" && !["turn", "outrider", "practice", "wizard", "lesson"].some((key) => query.has(key))) {
    toCamp();
    outpost.openSaloonReview();
  }
  });
